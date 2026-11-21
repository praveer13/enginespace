"""Tests of scripts/triton-interp/run.py, in the locked CPU environment (labs.yml, job cpu): python -I -m unittest discover -s scripts/triton-interp.

The files it reads are stand-ins of this test's own, served from 127.0.0.1: short kernels with the names and the signatures of the pinned ones, so that the
recipes (their dtypes, their pointer tables, a None argument) are exercised on this computer without running anything of vLLM's. They say nothing about vLLM's
own kernels, which only the cpu job runs, at the pinned commit.
"""
import functools
import http.server
import importlib.util
import os
import tempfile
import threading
import unittest
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("triton_interp_run", os.path.join(HERE, "run.py"))
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

COMMIT = "fixture"
ROOT = "vllm/v1/worker/gpu"

GUMBEL = '''
import torch
from vllm.nowhere import nothing  # never imported: only the jit functions of a file are kept
from vllm.triton_utils import tl, triton

_FLOOR = tl.constexpr(1e-9)
OPENED = open("/nonexistent/never-opened")  # module code is never run


@triton.jit
def _temperature_kernel(logits_ptr, logits_stride, expanded_idx_mapping_ptr, temperature_ptr, vocab_size, BLOCK_SIZE: tl.constexpr):
    token = tl.program_id(0).to(tl.int64)
    t = tl.load(temperature_ptr + tl.load(expanded_idx_mapping_ptr + token)).to(tl.float32)
    if t == 0.0 or t == 1.0:
        return
    block = tl.program_id(1) * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = block < vocab_size
    x = tl.load(logits_ptr + token * logits_stride + block, mask=mask)
    tl.store(logits_ptr + token * logits_stride + block, x / t, mask=mask)


@triton.jit
def _pick(logits, mask):
    return tl.max(tl.where(mask, logits, float("-inf")), axis=0, return_indices=True)


@triton.jit
def _gumbel_sample_kernel(
    local_argmax_ptr, local_argmax_stride, local_max_ptr, local_max_stride, logits_cache_ptr, c0, c1, logits_cache_col_ptr, logits_cache_source_ptr, c2,
    logits_ptr, logits_stride, expanded_idx_mapping_ptr, seeds_ptr, pos_ptr, temp_ptr, vocab_size,
    BLOCK_SIZE: tl.constexpr, IS_DRAFTING: tl.constexpr, APPLY_TEMPERATURE: tl.constexpr, USE_FP64: tl.constexpr, PER_TOKEN_COL: tl.constexpr,
):
    token = tl.program_id(0).to(tl.int64)
    block_idx = tl.program_id(1)
    block = block_idx * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = block < vocab_size
    logits = tl.load(logits_ptr + token * logits_stride + block, mask=mask, other=float("-inf")).to(tl.float32)
    temp = tl.load(temp_ptr + tl.load(expanded_idx_mapping_ptr + token))
    if logits_cache_ptr is not None:
        tl.store(logits_cache_ptr + block, logits, mask=mask)
    if temp != 0.0 and APPLY_TEMPERATURE:
        logits = logits / temp
    value, idx = _pick(logits, mask)
    tl.store(local_argmax_ptr + token * local_argmax_stride + block_idx, block_idx * BLOCK_SIZE + idx)
    tl.store(local_max_ptr + token * local_max_stride + block_idx, value)
'''

BUFFER = '''
import torch
from vllm.triton_utils import tl, triton


@triton.jit
def _load_ptr(ptr_to_ptr, elem_dtype):
    ptr = tl.load(ptr_to_ptr)
    ptr = tl.cast(ptr, tl.pointer_type(elem_dtype))
    return tl.multiple_of(ptr, 16)


@triton.jit
def _apply_write_kernel(
    output_ptr, output_stride, write_indices_ptr, write_starts_ptr, write_contents_ptr, write_cu_lens_ptr, write_group_ids_ptr,
    BLOCK_SIZE: tl.constexpr, MULTI_GROUP: tl.constexpr,
):
    pid = tl.program_id(0)
    row = tl.load(write_indices_ptr + pid).to(tl.int64)
    start = tl.load(write_starts_ptr + pid)
    lo = tl.load(write_cu_lens_ptr + pid - 1) if pid > 0 else 0
    hi = tl.load(write_cu_lens_ptr + pid)
    block = tl.program_id(1) * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = block < hi - lo
    tl.store(output_ptr + row * output_stride + start + block, tl.load(write_contents_ptr + lo + block, mask=mask), mask=mask)
'''

TABLE = '''
import torch
from vllm.triton_utils import tl, triton
from vllm.v1.worker.gpu.buffer_utils import _load_ptr


@triton.jit(do_not_specialize=["num_reqs"])
def _gather_block_tables_kernel(
    batch_idx_to_req_idx, src_block_table_ptrs, dst_block_table_ptrs, block_table_strides, num_blocks_ptr, num_blocks_stride, num_reqs,
    num_computed_tokens_ptr, sliding_window_reach_ptr, block_sizes_ptr, MASK_SLIDING_WINDOW: tl.constexpr, BLOCK_SIZE: tl.constexpr,
):
    group = tl.program_id(0)
    row = tl.program_id(1)
    stride = tl.load(block_table_strides + group)
    dst = _load_ptr(dst_block_table_ptrs + group, tl.int32) + row * stride
    if row >= num_reqs:
        for i in tl.range(0, stride, BLOCK_SIZE):
            off = i + tl.arange(0, BLOCK_SIZE)
            tl.store(dst + off, 0, mask=off < stride)
        return
    req = tl.load(batch_idx_to_req_idx + row)
    n = tl.load(num_blocks_ptr + group * num_blocks_stride + req)
    src = _load_ptr(src_block_table_ptrs + group, tl.int32) + req * stride
    for i in tl.range(0, n, BLOCK_SIZE):
        off = i + tl.arange(0, BLOCK_SIZE)
        tl.store(dst + off, tl.load(src + off, mask=off < n, other=0), mask=off < n)


@triton.jit
def _compute_slot_mappings_kernel(
    max_num_tokens, idx_mapping, query_start_loc, pos, block_table_ptrs, block_table_strides, block_sizes, slot_mapping_enabled, dcp_sharded,
    slot_mappings_ptr, slot_mappings_stride, cp_rank, CP_SIZE: tl.constexpr, CP_INTERLEAVE: tl.constexpr, PAD_ID: tl.constexpr, TRITON_BLOCK_SIZE: tl.constexpr,
):
    group = tl.program_id(0)
    b = tl.program_id(1)
    out = slot_mappings_ptr + group * slot_mappings_stride
    if b == tl.num_programs(1) - 1:
        for i in range(tl.load(query_start_loc + b), max_num_tokens, TRITON_BLOCK_SIZE):
            off = i + tl.arange(0, TRITON_BLOCK_SIZE)
            tl.store(out + off, PAD_ID, mask=off < max_num_tokens)
        return
    table = _load_ptr(block_table_ptrs + group, tl.int32)
    stride = tl.load(block_table_strides + group)
    size = tl.load(block_sizes + group)
    enabled = tl.load(slot_mapping_enabled + group)
    state = tl.load(idx_mapping + b)
    lo = tl.load(query_start_loc + b)
    hi = tl.load(query_start_loc + b + 1)
    for i in range(lo, hi, TRITON_BLOCK_SIZE):
        off = i + tl.arange(0, TRITON_BLOCK_SIZE)
        p = tl.load(pos + off, mask=off < hi, other=0)
        blk = tl.load(table + state * stride + p // size, mask=off < hi, other=0)
        tl.store(out + off, tl.where(enabled, blk * size + p % size, PAD_ID), mask=off < hi)
'''

BATCH = '''
import torch
from vllm.triton_utils import tl, triton


@triton.jit
def _prepare_prefill_inputs_kernel(
    input_ids_ptr, next_prefill_tokens_ptr, next_prefill_tokens_stride, num_lookahead, idx_mapping_ptr, query_start_loc_ptr, all_token_ids_ptr,
    all_token_ids_stride, prefill_lens_ptr, num_computed_tokens_ptr, BLOCK_SIZE: tl.constexpr, LOOKAHEAD_BLOCK: tl.constexpr,
):
    b = tl.program_id(0)
    state = tl.load(idx_mapping_ptr + b)
    plen = tl.load(prefill_lens_ptr + state)
    done = tl.load(num_computed_tokens_ptr + state)
    if done >= plen:
        return
    q0 = tl.load(query_start_loc_ptr + b)
    qlen = tl.load(query_start_loc_ptr + b + 1) - q0
    row = all_token_ids_ptr + state * all_token_ids_stride
    for i in range(0, qlen, BLOCK_SIZE):
        off = i + tl.arange(0, BLOCK_SIZE)
        m = off < qlen
        tl.store(input_ids_ptr + q0 + off, tl.load(row + done + off, mask=m), mask=m)
    la = tl.arange(0, LOOKAHEAD_BLOCK)
    p = done + qlen + la
    ok = (la < num_lookahead) & (p < plen)
    tl.store(next_prefill_tokens_ptr + la * next_prefill_tokens_stride + state, tl.load(row + p, mask=ok, other=0), mask=la < num_lookahead)


@triton.jit
def _prepare_pos_seq_lens_kernel(pos_ptr, seq_lens_ptr, idx_mapping_ptr, query_start_loc_ptr, num_computed_tokens_ptr, max_num_reqs, BLOCK_SIZE: tl.constexpr):
    r = tl.program_id(0)
    n = tl.num_programs(0) - 1
    if r == n:
        for i in tl.range(n, max_num_reqs, BLOCK_SIZE):
            off = i + tl.arange(0, BLOCK_SIZE)
            tl.store(seq_lens_ptr + off, 0, mask=off < max_num_reqs)
        return
    done = tl.load(num_computed_tokens_ptr + tl.load(idx_mapping_ptr + r))
    lo = tl.load(query_start_loc_ptr + r)
    hi = tl.load(query_start_loc_ptr + r + 1)
    tl.store(seq_lens_ptr + r, done + hi - lo)
    for i in tl.range(0, hi - lo, BLOCK_SIZE):
        off = i + tl.arange(0, BLOCK_SIZE)
        tl.store(pos_ptr + lo + off, done + off, mask=off < hi - lo)


@triton.jit
def _post_update_kernel(x_ptr):
    tl.store(x_ptr, 1)
'''

TREE = {"sample/gumbel.py": GUMBEL, "buffer_utils.py": BUFFER, "block_table.py": TABLE, "input_batch.py": BATCH}
FILES = ("sample/gumbel.py", "buffer_utils.py", "block_table.py", "input_batch.py", "spec_decode/rejection_sampler_utils.py")  # the last is never served


def serve(tree):
    folder = tempfile.TemporaryDirectory()
    for name, text in tree.items():
        path = os.path.join(folder.name, COMMIT, ROOT, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=folder.name)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return folder, server


def execute(tree):
    folder, server = serve(tree)
    try:
        with tempfile.TemporaryDirectory() as work:
            records = run.run(f"http://127.0.0.1:{server.server_address[1]}", COMMIT, ROOT, FILES, work)
    finally:
        server.shutdown()
        server.server_close()
        folder.cleanup()
    return {f"{r['file']}::{r['kernel']}": r for r in records}


class RunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.good = execute(TREE)

    def test_every_kernel_with_a_recipe_runs_on_the_standins(self):
        names = [f"{f}::{k}" for k, (f, _) in run.RECIPES.items()]
        self.assertEqual(len(names), 7)
        for name in names:
            self.assertEqual((name, self.good[name]["status"], self.good[name]["detail"]), (name, "ran", ""))

    def test_a_kernel_without_a_recipe_is_named_and_not_run(self):
        self.assertEqual(self.good["input_batch.py::_post_update_kernel"]["status"], "not-attempted")

    def test_a_file_that_cannot_be_read_is_one_finding_with_its_class(self):
        record = self.good["spec_decode/rejection_sampler_utils.py::(file)"]
        self.assertEqual(record["status"], "failed")
        self.assertIn("FetchError", record["detail"])
        self.assertIn("404", record["detail"])

    def test_module_code_of_a_file_is_never_run(self):
        # the stand-in gumbel.py opens a file that does not exist at module level and imports a module that does not exist: its kernels still ran
        self.assertEqual(self.good["sample/gumbel.py::_temperature_kernel"]["status"], "ran")

    def test_a_wrong_result_is_a_failure_of_its_own_class(self):
        broken = dict(TREE)
        broken["sample/gumbel.py"] = GUMBEL.replace("x / t", "x * t")
        got = execute(broken)["sample/gumbel.py::_temperature_kernel"]
        self.assertEqual(got["status"], "failed")
        self.assertTrue(got["detail"].startswith("WrongResult"), got["detail"])

    def test_an_error_inside_a_kernel_is_a_failure_with_its_class(self):
        broken = dict(TREE)
        broken["input_batch.py"] = BATCH.replace("done + hi - lo)", "done + not_defined)")
        got = execute(broken)["input_batch.py::_prepare_pos_seq_lens_kernel"]
        self.assertEqual(got["status"], "failed")
        self.assertNotEqual(got["detail"], "")
        self.assertEqual(execute(broken)["input_batch.py::_prepare_prefill_inputs_kernel"]["status"], "ran")

    def test_only_a_full_commit_at_github_or_a_local_server_is_read(self):
        for base, commit in [("https://raw.githubusercontent.com/vllm-project/vllm", "main"), ("https://example.com/x", "a" * 40), ("http://raw.githubusercontent.com/x", "a" * 40)]:
            with self.assertRaises(SystemExit):
                run.check_base(base, commit)
        self.assertEqual(run.check_base("http://127.0.0.1:1/", "fixture"), "http://127.0.0.1:1")
        self.assertEqual(run.check_base(run.RAW_BASE, run.COMMIT), run.RAW_BASE)

    def test_a_redirect_is_not_followed(self):
        class Redirect(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "http://127.0.0.1:9/elsewhere")
                self.end_headers()

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Redirect)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with self.assertRaises(run.FetchError):
                run.fetch(f"http://127.0.0.1:{server.server_address[1]}/x")
        finally:
            server.shutdown()
            server.server_close()

    def test_the_command_prints_one_line_per_kernel_and_a_summary(self):
        import contextlib
        import io
        import json

        folder, server = serve(TREE)
        try:
            out = io.StringIO()
            with tempfile.TemporaryDirectory() as scratch, contextlib.redirect_stdout(out):
                report = os.path.join(scratch, "report.json")
                code = run.main(["--base-url", f"http://127.0.0.1:{server.server_address[1]}", "--commit", COMMIT, "--root", ROOT, "--json", report, *sum((["--file", f] for f in FILES), [])])
                with open(report, encoding="utf-8") as handle:
                    saved = json.load(handle)
        finally:
            server.shutdown()
            server.server_close()
            folder.cleanup()
        lines = out.getvalue().splitlines()
        self.assertEqual(code, 0)
        self.assertIn("ran            sample/gumbel.py::_temperature_kernel", lines)
        self.assertIn("not-attempted  input_batch.py::_post_update_kernel  no input recipe", lines)
        self.assertTrue(lines[-1].startswith("summary: ran=7 failed=1 not-attempted=1 (triton 3.8.0, torch 2.14.0"), lines[-1])
        self.assertEqual(saved["triton"], "3.8.0")
        self.assertEqual(len(saved["records"]), 9)

    def test_the_user_agent_is_generic(self):
        self.assertEqual(run.USER_AGENT, "Mozilla/5.0 (X11; Linux x86_64)")


class CourseKernelTest(unittest.TestCase):
    def test_the_course_kernel_runs_and_is_short(self):
        import subprocess
        import sys

        path = os.path.join(HERE, "course_kernel.py")
        with open(path, encoding="utf-8") as handle:
            self.assertLessEqual(len(handle.read().splitlines()), 40)
        done = subprocess.run([sys.executable, "-I", path], capture_output=True, text=True, timeout=300)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("1-D: n=10 BLOCK=4 programs=3 lanes=12 masked=2", done.stdout)
        self.assertIn("last program offs:  [ 8  9 10 11]", done.stdout)
        self.assertIn("last program mask:  [ True  True False False]", done.stdout)
        self.assertIn("2-D: shape=(5, 6) strides=(1, 5) BLOCK=(2, 4) grid=(3, 2) masked=18", done.stdout)


if __name__ == "__main__":
    unittest.main()
