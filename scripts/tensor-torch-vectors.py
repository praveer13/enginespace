"""Generate tests/fixtures/tensor/torch-vectors.json: what PyTorch answers for the operations that packages/sim/tensor models (W2-T13).

It runs in the locked CPU environment (labs/envs/cpu, torch 2.14.0+cpu), and the labs.yml cpu job runs it there and fails when its cases
differ from the committed fixture. tests/sim/tensor-torch.test.ts replays the file against the model and never runs torch.
No dependency beyond torch itself is used, and torch needs no GPU for any of this: every call below is metadata, or a copy of a few cells.

To regenerate the fixture, commit the output of:

    UV_PYTHON=3.12 uv run --locked --project labs/envs/cpu python -I scripts/tensor-torch-vectors.py

`--out <path>` writes elsewhere (the default is the fixture). `--compare <fixture>` generates the cases and exits 1 when they, or the torch
build and device, differ from the fixture; the Python patch version is not compared, since it is the runner's (the labs.yml cpu job uses both). The cases are enumerated, never random, so a second run on the same torch
gives the same bytes. The header records the torch version that answered, whether CUDA was in use (it never is: nothing here leaves the
CPU), and the Python version.

A case is a base (a contiguous tensor of `arange`), a prelude of operations that makes the start (so that a start can be transposed, sliced
or expanded), the operation under test, and torch's answer: the shape, strides and storage offset of the result, whether it shares the
base's storage (a copy does not), is_contiguous, and the elements in logical order (their values are their addresses in the base).
An error is 'not-viewable' when torch says the view size is not compatible with the strides, and 'bad-shape' for any other RuntimeError.
"""

import argparse
import itertools
import json
import platform
import sys

import torch

NOT_VIEWABLE = "is not compatible with input tensor's size and stride"
MAX_VALUES = 36


def to_torch(t, o):
    op = o["op"]
    if op == "view":
        return t.view(*o["shape"])
    if op == "reshape":
        return t.reshape(*o["shape"])
    if op == "permute":
        return t.permute(*o["order"])
    if op == "transpose":
        return t.transpose(o["a"], o["b"])
    if op == "expand":
        return t.expand(*o["shape"])
    if op == "slice":
        index = [slice(None)] * t.dim()
        index[o["dim"]] = slice(o["start"], o["stop"], o["step"])
        return t[tuple(index)]
    if op == "contiguous":
        return t.contiguous()
    raise ValueError(op)


def describe(t):
    return {"shape": list(t.shape), "strides": list(t.stride()), "offset": t.storage_offset()}


def answer(t, src, o):
    """torch's result for op `o` on `t`; `src` is the tensor whose storage counts as 'shared'."""
    try:
        r = to_torch(t, o)
    except RuntimeError as e:
        return {"error": "not-viewable" if NOT_VIEWABLE in str(e) else "bad-shape"}
    except (IndexError, ValueError):
        return {"error": "bad-shape"}
    d = describe(r)
    d["shared"] = r.untyped_storage().data_ptr() == src.untyped_storage().data_ptr()
    d["contiguous"] = r.is_contiguous()
    d["overlap"] = torch._debug_has_internal_overlap(r) == 1 if r.numel() > 0 else False
    if r.numel() <= MAX_VALUES:
        d["values"] = r.flatten().tolist() if r.numel() else []
    return d


def factorizations(n, max_rank):
    out = []

    def rec(rest, acc):
        if rest == 1:
            if acc:
                out.append(list(acc))
            return
        if len(acc) == max_rank:
            return
        for d in range(2, rest + 1):
            if rest % d == 0:
                rec(rest // d, acc + [d])

    rec(n, [])
    return out


def ops_for(shape):
    """The operations tried on a tensor of this shape: every kind, with arguments that succeed and arguments that must not."""
    n = 1
    for d in shape:
        n *= d
    rank = len(shape)
    ops = [{"op": "contiguous"}]
    shapes = factorizations(n, 4) if n else []
    shapes += [[n], [n, 1], [1, n], [1] + list(shape), list(shape) + [1]]
    shapes += [[n + 1], [2 * n], [n, 2]] if n else [[0], [1]]  # wrong element counts
    seen = set()
    for s in shapes:
        if tuple(s) in seen:
            continue
        seen.add(tuple(s))
        ops.append({"op": "view", "shape": s})
        ops.append({"op": "reshape", "shape": s})
    for order in itertools.permutations(range(rank)):
        ops.append({"op": "permute", "order": list(order)})
    ops.append({"op": "permute", "order": [0] * rank})  # not a permutation
    ops.append({"op": "permute", "order": list(range(rank + 1))})  # wrong length
    for a, b in itertools.combinations(range(rank), 2):
        ops.append({"op": "transpose", "a": a, "b": b})
    if rank:
        ops.append({"op": "transpose", "a": 0, "b": -1})
    ops.append({"op": "transpose", "a": 0, "b": rank})  # out of range
    for lead in (0, 2):
        target = [3] * lead + [3 if d == 1 else d for d in shape]
        ops.append({"op": "expand", "shape": target})
        ops.append({"op": "expand", "shape": [2] * lead + list(shape)})
    ops.append({"op": "expand", "shape": [d + 1 for d in shape]})  # a size that cannot grow, unless it is 1
    if rank > 1:
        ops.append({"op": "expand", "shape": list(shape)[1:]})  # fewer dims
    for dim in range(rank):
        size = shape[dim]
        for start, stop, step in [(0, size, 1), (1, size, 1), (0, max(size - 1, 0), 1), (0, size, 2), (size, size, 1), (-1, size, 1), (0, size + 5, 1), (-size - 3, size, 3), (2, 1, 1)]:
            ops.append({"op": "slice", "dim": dim, "start": start, "stop": stop, "step": step})
        ops.append({"op": "slice", "dim": dim, "start": 0, "stop": size, "step": 0})  # no step below 1
    ops.append({"op": "slice", "dim": rank, "start": 0, "stop": 1, "step": 1})  # no such dim
    return ops


def preludes(shape):
    """Chains that turn a contiguous base into a start that is not contiguous in different ways."""
    rank = len(shape)
    out = [[]]
    if rank >= 2:
        out.append([{"op": "transpose", "a": 0, "b": rank - 1}])
        out.append([{"op": "permute", "order": list(reversed(range(rank)))}])
        out.append([{"op": "slice", "dim": rank - 1, "start": 0, "stop": max(shape[-1] - 1, 1), "step": 1}])
        out.append([{"op": "slice", "dim": 0, "start": 1, "stop": shape[0], "step": 1}, {"op": "transpose", "a": 0, "b": 1}])
    if rank == 3:
        out.append([{"op": "permute", "order": [1, 0, 2]}])
        out.append([{"op": "permute", "order": [2, 0, 1]}])
    if rank >= 1:
        out.append([{"op": "slice", "dim": 0, "start": 0, "stop": shape[0], "step": 2}])
    out.append([{"op": "expand", "shape": [2] + list(shape)}])
    out.append([{"op": "reshape", "shape": [1] + list(shape)}])
    return out


BASES = [
    [6],
    [1],
    [0],
    [4, 6],
    [6, 4],
    [1, 4],
    [2, 3],
    [2, 3, 4],
    [4, 2, 3],
    [1, 3, 4],
    [3, 1, 2],
    [2, 3, 2, 2],
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="tests/fixtures/tensor/torch-vectors.json")
    ap.add_argument("--compare", metavar="FIXTURE", help="exit 1 unless the generated cases and torch build equal FIXTURE's")
    args = ap.parse_args()
    cases = []
    seen = set()
    for shape in BASES:
        n = 1
        for d in shape:
            n *= d
        for pre in preludes(shape):
            base = torch.arange(n).reshape(*shape) if n else torch.zeros(shape, dtype=torch.int64)
            t = base
            ok = True
            for o in pre:
                r = answer(t, base, o)
                if "error" in r:
                    ok = False
                    break
                t = to_torch(t, o)
            if not ok:
                continue
            start = describe(t)
            start["contiguous"] = t.is_contiguous()
            for o in ops_for(list(t.shape)):
                # Two preludes that make the same start (the same view of the same base) need one case, not two.
                sig = json.dumps([shape, start, o], sort_keys=True)
                if sig in seen:
                    continue
                seen.add(sig)
                cases.append({"base": shape, "prelude": pre, "start": start, "op": o, "torch": answer(t, base, o)})
    doc = {
        "header": "Golden answers from PyTorch for packages/sim/tensor (W2-T13, ARCHITECTURE 5.8). Written by scripts/tensor-torch-vectors.py in the locked CPU environment (labs/envs/cpu), checked by the labs.yml cpu job, and replayed by tests/sim/tensor-torch.test.ts. Each case: a contiguous `arange` base of the given shape, a prelude that makes the start, the operation under test, and torch's answer. `shared` is whether the result uses the base's storage (a copy does not); `values` are the elements in logical order, and a value is its address in the base.",
        "torch": {"version": torch.__version__, "cuda_in_use": False, "device": "cpu", "python": platform.python_version()},
        "cases": cases,
    }
    with open(args.out, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(cases)} cases, torch {torch.__version__}", file=sys.stderr)
    if args.compare:
        with open(args.compare) as f:
            want = json.load(f)
        mine = doc["torch"]
        if (want["torch"]["version"], want["torch"]["device"]) != (mine["version"], mine["device"]):
            print(f"torch build differs: fixture {want['torch']['version']} on {want['torch']['device']}, this run {mine['version']} on {mine['device']}", file=sys.stderr)
            sys.exit(1)
        if len(want["cases"]) != len(cases):
            print(f"case count differs: fixture {len(want['cases'])}, this run {len(cases)}", file=sys.stderr)
            sys.exit(1)
        differing = [i for i, (a, b) in enumerate(zip(want["cases"], cases)) if a != b]
        for i in differing[:10]:
            print(f"case {i} differs:\n  fixture {json.dumps(want['cases'][i], sort_keys=True)}\n  this run {json.dumps(cases[i], sort_keys=True)}", file=sys.stderr)
        if differing:
            print(f"{len(differing)} of {len(cases)} cases differ from the fixture", file=sys.stderr)
            sys.exit(1)
        print(f"the {len(cases)} cases match the fixture", file=sys.stderr)


if __name__ == "__main__":
    main()
