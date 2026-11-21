"""Which of vLLM's Model Runner V2 Triton kernels run under Triton's interpreter on a CPU (TR0 lesson 4, W2b-T49).

    TRITON_INTERPRET is set here, before triton is imported. Run it inside the locked CPU environment:
    python -I scripts/triton-interp/run.py [--json report.json] [--require-all-ran]

It reads each candidate file at vLLM's pinned commit into a temporary folder (a generic User-Agent, no token, no cookie, nothing that names anyone), keeps
only the `@triton.jit` functions and the module-level constants they read (the rest of the file, its imports of vLLM included, is never run), and launches each
kernel that has an input recipe below on small CPU tensors, comparing what it wrote with what torch computes. One line per kernel:

    ran            <file>::<kernel>
    failed         <file>::<kernel>  <error class>: <first line of the message>
    not-attempted  <file>::<kernel>  no input recipe

The exit status is 0 when the run finished, so that a kernel that fails is a finding and not a red job; --require-all-ran makes any failure exit 1.
Nothing fetched is committed. A kernel that fails here fails on Triton 3.8.0's interpreter with this script's inputs, which says nothing about the GPU.
"""
from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

os.environ["TRITON_INTERPRET"] = "1"  # before triton is imported

import torch  # noqa: E402
import triton  # noqa: E402

COMMIT = "4ba787ec9959e566d3b587a796dff07673324da5"  # vLLM v0.33.0, course.lock.json
RAW_BASE = "https://raw.githubusercontent.com/vllm-project/vllm"
ROOT = "vllm/v1/worker/gpu"
FILES = ("sample/gumbel.py", "buffer_utils.py", "block_table.py", "input_batch.py", "spec_decode/rejection_sampler_utils.py")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64)"
LOCAL_HOSTS = ("127.0.0.1", "localhost")


class WrongResult(Exception):
    """The kernel ran and wrote something other than what torch computes."""


class FetchError(Exception):
    """The file could not be read."""


class ExtractError(Exception):
    """The file's jit functions could not be separated from the rest of it."""


# ---- reading a file ------------------------------------------------------------------------------------------------------------------------------------


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # a raw file at a commit answers directly; anything else is not what was asked for
        return None


def check_base(base: str, commit: str) -> str:
    parts = urllib.parse.urlparse(base)
    if parts.hostname == "raw.githubusercontent.com" and parts.scheme == "https":
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise SystemExit("run.py reads a file at a full commit sha, never at a branch or a tag name")
    elif not (parts.hostname in LOCAL_HOSTS and parts.scheme == "http"):
        raise SystemExit("run.py reads only raw.githubusercontent.com over https, or 127.0.0.1 over http (for its tests)")
    return base.rstrip("/")


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.build_opener(_NoRedirect).open(request, timeout=30) as reply:
            return reply.read().decode("utf-8")
    except Exception as error:  # noqa: BLE001 - every failure to read is one finding
        raise FetchError(f"{type(error).__name__}: {error}") from error


# ---- keeping the jit functions and nothing else --------------------------------------------------------------------------------------------------------

_CALLS_OK = {"tl.constexpr", "triton.jit"}
_HEADER = "import torch\nimport triton\nimport triton.language as tl\n"


def _safe(node: ast.AST | None) -> bool:
    """An expression of literals, names, attributes, arithmetic and the two calls a jit file makes at module level."""
    if node is None:
        return True
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            if ast.unparse(sub.func) not in _CALLS_OK:
                return False
        elif not isinstance(sub, (ast.Constant, ast.Name, ast.Attribute, ast.UnaryOp, ast.BinOp, ast.List, ast.Tuple, ast.keyword, ast.expr_context, ast.operator, ast.unaryop)):
            return False
    return True


def _is_jit(node: ast.FunctionDef) -> bool:
    return any(ast.unparse(d.func if isinstance(d, ast.Call) else d) == "triton.jit" for d in node.decorator_list)


def _function_safe(node: ast.FunctionDef) -> bool:
    arguments = node.args
    every = [*arguments.posonlyargs, *arguments.args, *arguments.kwonlyargs]
    return (
        all(_safe(d) for d in node.decorator_list)
        and all(_safe(d) for d in [*arguments.defaults, *arguments.kw_defaults])
        and all(_safe(a.annotation) for a in every)
        and _safe(node.returns)
    )


def extract(source: str) -> tuple[str, list[str], list[str]]:
    """The module text to run, the kernels (jit functions named *_kernel) it holds, and the jit functions left out as unsafe."""
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        raise ExtractError(f"SyntaxError: {error}") from error
    lines = source.splitlines()
    kept: list[str] = []
    kernels: list[str] = []
    left_out: list[str] = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and _is_jit(node):
            if not _function_safe(node):
                left_out.append(node.name)
                continue
            start = min([d.lineno for d in node.decorator_list] + [node.lineno])
            kept.append("\n".join(lines[start - 1 : node.end_lineno]))
            if node.name.endswith("_kernel"):
                kernels.append(node.name)
        elif isinstance(node, ast.Assign) and _safe(node.value):
            kept.append("\n".join(lines[node.lineno - 1 : node.end_lineno]))
        elif isinstance(node, ast.AnnAssign) and node.value is not None and _safe(node.annotation) and _safe(node.value):
            kept.append("\n".join(lines[node.lineno - 1 : node.end_lineno]))
    return _HEADER + "\n\n\n".join(kept) + "\n", kernels, left_out


def load(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---- the inputs of each kernel -------------------------------------------------------------------------------------------------------------------------


def _ints(values, dtype=torch.int32):
    return torch.tensor(values, dtype=dtype)


def _ptrs(tensors):
    return torch.tensor([t.data_ptr() for t in tensors], dtype=torch.uint64)  # a table of pointers, as the engine builds it


def _same(name, got, want):
    if not torch.equal(got.cpu(), want):
        raise WrongResult(f"{name}: wrote {got.tolist()}, torch gives {want.tolist()}")


def recipe_temperature(fn):
    torch.manual_seed(0)
    logits = torch.randn(4, 20)
    before = logits.clone()
    mapping = _ints([0, 1, 2, 3])
    temperature = torch.tensor([0.5, 1.0, 0.0, 4.0])
    fn[(4, 2)](logits, logits.stride(0), mapping, temperature, 20, BLOCK_SIZE=16)
    want = before.clone()
    for row, t in enumerate(temperature.tolist()):
        if t not in (0.0, 1.0):
            want[row] = before[row] / t
    if not torch.allclose(logits, want):
        raise WrongResult("_temperature_kernel: a row was not divided by its temperature")


def recipe_apply_write(fn):
    out = torch.zeros(4, 10, dtype=torch.int32)
    indices, starts = _ints([1, 3]), _ints([2, 0])
    contents, cu_lens = _ints([7, 8, 9, 5, 6]), _ints([3, 5])
    fn[(2, 2)](out, out.stride(0), indices, starts, contents, cu_lens, None, BLOCK_SIZE=2, MULTI_GROUP=False)
    want = torch.zeros(4, 10, dtype=torch.int32)
    want[1, 2:5] = _ints([7, 8, 9])
    want[3, 0:2] = _ints([5, 6])
    _same("_apply_write_kernel", out, want)


def recipe_gather_block_tables(fn):
    torch.manual_seed(0)
    groups, max_reqs, max_blocks = 2, 4, 6
    src = [torch.randint(1, 100, (max_reqs, max_blocks), dtype=torch.int32) for _ in range(groups)]
    dst = [torch.full((3, max_blocks), 99, dtype=torch.int32) for _ in range(groups)]
    num_blocks = _ints([[5, 2, 6, 1], [3, 6, 4, 2]])
    batch_to_req = _ints([2, 0, 0])
    fn[(groups, 3)](
        batch_to_req, _ptrs(src), _ptrs(dst), torch.tensor([max_blocks] * groups, dtype=torch.int64), num_blocks, num_blocks.stride(0), 2,
        torch.zeros(max_reqs, dtype=torch.int32), torch.zeros(groups, dtype=torch.int32), _ints([16, 16]), MASK_SLIDING_WINDOW=False, BLOCK_SIZE=4,
    )  # batch row 2 is padding (num_reqs = 2): its row is zeroed
    for g in range(groups):
        want = torch.full((3, max_blocks), 99, dtype=torch.int32)
        for b, req in enumerate(batch_to_req.tolist()[:2]):
            n = int(num_blocks[g, req])
            want[b, :n] = src[g][req, :n]
        want[2] = 0
        _same(f"_gather_block_tables_kernel group {g}", dst[g], want)


def recipe_slot_mappings(fn):
    groups, max_tokens, block_sizes = 2, 12, [4, 8]
    tables = [torch.arange(1, 9, dtype=torch.int32).view(2, 4) + 10 * g for g in range(groups)]
    idx_mapping, query_start_loc = _ints([1, 0]), _ints([0, 5, 9])
    pos = torch.tensor([3, 4, 5, 6, 7, 0, 1, 2, 3], dtype=torch.int64)
    slots = torch.full((groups, max_tokens), 77, dtype=torch.int64)
    fn[(groups, 3)](
        max_tokens, idx_mapping, query_start_loc, pos, _ptrs(tables), torch.tensor([4, 4], dtype=torch.int64), _ints(block_sizes),
        torch.tensor([True, True]), torch.tensor([False, False]), slots, slots.stride(0), 0,
        CP_SIZE=1, CP_INTERLEAVE=1, PAD_ID=-1, TRITON_BLOCK_SIZE=4,
    )  # the last program pads the slots after the nine real tokens with -1
    want = torch.full((groups, max_tokens), -1, dtype=torch.int64)
    spans = [(0, 5), (5, 9)]
    for g in range(groups):
        for b, (lo, hi) in enumerate(spans):
            for i in range(lo, hi):
                p = int(pos[i])
                want[g, i] = int(tables[g][int(idx_mapping[b]), p // block_sizes[g]]) * block_sizes[g] + p % block_sizes[g]
    _same("_compute_slot_mappings_kernel", slots, want)


def recipe_prepare_prefill(fn):
    all_tokens = torch.arange(24, dtype=torch.int32).view(3, 8) + 100
    input_ids = torch.zeros(8, dtype=torch.int32)
    lookahead = torch.full((2, 3), -1, dtype=torch.int32)
    mapping, qsl = _ints([2, 0]), _ints([0, 3, 5])
    prefill_lens, computed = _ints([4, 4, 7]), _ints([1, 0, 2])
    fn[(2,)](input_ids, lookahead, lookahead.stride(0), 2, mapping, qsl, all_tokens, all_tokens.stride(0), prefill_lens, computed, BLOCK_SIZE=2, LOOKAHEAD_BLOCK=2)
    want_ids = torch.zeros(8, dtype=torch.int32)
    want_ids[0:3] = all_tokens[2, 2:5]
    want_ids[3:5] = all_tokens[0, 1:3]
    want_next = torch.full((2, 3), -1, dtype=torch.int32)
    want_next[:, 2] = all_tokens[2, 5:7]
    want_next[:, 0] = _ints([int(all_tokens[0, 3]), 0])  # position 4 is not below the prefill length 4: masked, so 0
    _same("_prepare_prefill_inputs_kernel input_ids", input_ids, want_ids)
    _same("_prepare_prefill_inputs_kernel next tokens", lookahead, want_next)


def recipe_pos_seq_lens(fn):
    pos, seq_lens = torch.zeros(5, dtype=torch.int64), torch.full((6,), 9, dtype=torch.int32)
    fn[(3,)](pos, seq_lens, _ints([1, 0]), _ints([0, 3, 5]), _ints([4, 2]), 6, BLOCK_SIZE=2)
    _same("_prepare_pos_seq_lens_kernel pos", pos, torch.tensor([2, 3, 4, 4, 5], dtype=torch.int64))
    _same("_prepare_pos_seq_lens_kernel seq_lens", seq_lens, _ints([5, 6, 0, 0, 0, 0]))


def recipe_gumbel_sample(fn):
    torch.manual_seed(0)
    logits = torch.randn(2, 20)
    arg = torch.zeros(2, 2, dtype=torch.int64)
    top = torch.zeros(2, 2)
    temperature = torch.tensor([0.0, 0.7])
    fn[(2, 2)](
        arg, arg.stride(0), top, top.stride(0), None, 0, 0, None, None, 0, logits, logits.stride(0), _ints([0, 1]), torch.tensor([7, 8], dtype=torch.int64),
        torch.tensor([3, 4], dtype=torch.int64), temperature, 20, BLOCK_SIZE=16, IS_DRAFTING=False, APPLY_TEMPERATURE=True, USE_FP64=False, PER_TOKEN_COL=False,
    )
    block0 = logits[0, :16].argmax()
    block1 = 16 + logits[0, 16:].argmax()  # temperature 0: the plain argmax of each block
    _same("_gumbel_sample_kernel token 0", arg[0], torch.stack([block0, block1]))
    for col, (lo, hi) in enumerate([(0, 16), (16, 20)]):  # temperature 0.7: some token of the block, with a finite value
        if not (lo <= int(arg[1, col]) < hi) or not torch.isfinite(top[1, col]):
            raise WrongResult(f"_gumbel_sample_kernel token 1 block {col}: {int(arg[1, col])}, {float(top[1, col])}")


RECIPES = {  # kernel name: (file under the root, recipe)
    "_temperature_kernel": ("sample/gumbel.py", recipe_temperature),
    "_gumbel_sample_kernel": ("sample/gumbel.py", recipe_gumbel_sample),
    "_apply_write_kernel": ("buffer_utils.py", recipe_apply_write),
    "_gather_block_tables_kernel": ("block_table.py", recipe_gather_block_tables),
    "_compute_slot_mappings_kernel": ("block_table.py", recipe_slot_mappings),
    "_prepare_prefill_inputs_kernel": ("input_batch.py", recipe_prepare_prefill),
    "_prepare_pos_seq_lens_kernel": ("input_batch.py", recipe_pos_seq_lens),
}


# ---- the run -------------------------------------------------------------------------------------------------------------------------------------------


def error_class(error: BaseException) -> str:
    kind = type(error)
    return kind.__name__ if kind.__module__ in ("builtins", __name__) else f"{kind.__module__}.{kind.__name__}"


def first_line(error: BaseException) -> str:
    text = str(error).strip().splitlines()
    return (text[0] if text else "")[:200]


def run(base: str, commit: str, root: str, files: tuple[str, ...], work: str) -> list[dict]:
    records: list[dict] = []
    modules: dict[str, object] = {}
    kernels: dict[str, list[str]] = {}
    for path in files:
        try:
            text = fetch(f"{base}/{commit}/{root}/{path}")
            module_text, found, left_out = extract(text)
            out = os.path.join(work, path.replace("/", "__"))
            with open(out, "w", encoding="utf-8") as handle:
                handle.write(module_text)
            modules[path] = load(out, "mrv2_" + re.sub(r"\W", "_", path))
            kernels[path] = found
            for name in left_out:
                records.append({"file": path, "kernel": name, "status": "not-attempted", "detail": "jit function left out: its decorator, defaults or annotations are not plain expressions"})
        except Exception as error:  # noqa: BLE001 - a file that cannot be read or cut fails each kernel that it was to supply
            detail = f"{error_class(error)}: {first_line(error)}"
            mine = [name for name, (file, _) in RECIPES.items() if file == path] or ["(file)"]
            records.extend({"file": path, "kernel": name, "status": "failed", "detail": detail} for name in mine)
    jit_types = ("JITFunction", "InterpretedFunction")
    helpers = {name: value for m in modules.values() for name, value in vars(m).items() if type(value).__name__ in jit_types}
    for path, module in modules.items():
        for name, value in helpers.items():
            if not hasattr(module, name):
                setattr(module, name, value)  # a jit function that one file imports from another (block_table.py takes _load_ptr from buffer_utils.py)
    for path, found in kernels.items():
        for name in found:
            entry = RECIPES.get(name)
            recipe = entry[1] if entry and entry[0] == path else None
            if recipe is None:
                records.append({"file": path, "kernel": name, "status": "not-attempted", "detail": "no input recipe"})
                continue
            try:
                recipe(getattr(modules[path], name))
                records.append({"file": path, "kernel": name, "status": "ran", "detail": ""})
            except Exception as error:  # noqa: BLE001 - the class of the error is the finding
                records.append({"file": path, "kernel": name, "status": "failed", "detail": f"{error_class(error)}: {first_line(error)}"})
    return records


def format_record(record: dict) -> str:
    label = f"{record['file']}::{record['kernel']}"
    status = record["status"]
    return f"{status:<14} {label}" + (f"  {record['detail']}" if record["detail"] else "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", default=RAW_BASE, help="raw.githubusercontent.com over https, or 127.0.0.1 over http for tests")
    parser.add_argument("--commit", default=COMMIT)
    parser.add_argument("--root", default=ROOT)
    parser.add_argument("--file", action="append", dest="files", help="a candidate file under --root (default: the five of TR0 section 3)")
    parser.add_argument("--json", dest="json_path")
    parser.add_argument("--require-all-ran", action="store_true")
    args = parser.parse_args(argv)
    base = check_base(args.base_url, args.commit)
    files = tuple(args.files) if args.files else FILES
    with tempfile.TemporaryDirectory(prefix="triton-interp-") as work:
        records = run(base, args.commit, args.root, files, work)
    for record in records:
        print(format_record(record))
    counts = {s: sum(1 for r in records if r["status"] == s) for s in ("ran", "failed", "not-attempted")}
    print(f"summary: ran={counts['ran']} failed={counts['failed']} not-attempted={counts['not-attempted']} (triton {triton.__version__}, torch {torch.__version__}, TRITON_INTERPRET=1, commit {args.commit[:8]})")
    if args.json_path:
        with open(args.json_path, "w", encoding="utf-8") as handle:
            json.dump({"triton": triton.__version__, "torch": torch.__version__, "commit": args.commit, "records": records}, handle, indent=1)
    return 1 if args.require_all_ran and counts["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
