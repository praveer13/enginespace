---
id: tr0.l4
module: tr0
title: "Reading Triton: grids, programs, BLOCK and masks"
minutes: 50                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr0.triton-program-model, tr0.triton-masks]
builds_on: [ks:T4.L6, ks:T4.L4, ks:t4.compute-grid, ks:t4.tiling-intensity, ks:t4.coalescing]
status: review                    # draft | review | live
lanes: [B]
games: [shape-shifter]
---

Triton is a language for GPU kernels, written as Python functions. Reading one takes five facts:

- A **kernel** runs as a **grid** of **programs**: many runs of the same function, each told by its id which part of the tensor is its own.
- One program covers a tile of **BLOCK** elements along each dimension, and each element position of the tile is one **lane**.
- BLOCK is a compile-time constant, and a power of two.
- `cdiv(n, BLOCK)` programs, n divided by BLOCK and rounded up, cover a dimension of n elements.
- A lane whose position is past the edge of the tensor is **masked**: it loads nothing and stores nothing.

The level draws the tensor's cells and each program as a tile over them. Cover the tensor, and count what each edge masks.

:::predict
id: tr0.l4.p1
prompt: The level's tensor has shape `(12, 20)`, and the reference covers each of its elements exactly once with at most six programs. How many lanes will it leave masked?
answer: { kind: numeric, unit: lanes, rel_tol: 0 }
reveal: after-game
kcs: [tr0.triton-masks]
:::

:::game
id: shape-shifter
level: grid
mode: practice
:::

## From the grid to `tl.program_id`

You just covered a `(12, 20)` tensor with a grid of programs. Here is the reference's launch beside two that look sensible and mask more. Printed by the course's model on 2026-11-21 at `7037bd7`.

| Launch | The reference [synthetic] | One program [synthetic] | Square tiles [synthetic] |
|---|---|---|---|
| BLOCK | `(16, 4)` | `(16, 32)` | `(8, 8)` |
| Grid | `(1, 5)` | `(1, 1)` | `(2, 3)` |
| Programs | 5 | 1 | 6 |
| Lanes | 320 | 512 | 384 |
| Masked lanes | 80 | 272 | 144 |

The 20 columns divide by a BLOCK of 4 [synthetic], so no lane is masked along dimension 1. The 12 rows would divide by 4 too, but 3 programs down and 5 across make 15 [synthetic], more than the level allows. The cap of six programs is the level's and not Triton's: without one, a BLOCK of `1` would mask nothing. So the reference fits the dimension that divides and masks along the other. Each of its programs covers 16 rows where the tensor has 12, and 16 of its 64 lanes are masked [synthetic]. Square tiles fit neither dimension.

That table is the arithmetic of one tile. A kernel spells it in four lines. This is the course's own kernel, which scales a one-dimensional tensor, and not an engine's:

```python
@triton.jit
def scale(x_ptr, y_ptr, n, factor,
          BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offs < n
    x = tl.load(x_ptr + offs, mask=mask)
    tl.store(y_ptr + offs, x * factor, mask=mask)
```

| Line | What it says |
|---|---|
| `BLOCK: tl.constexpr` | BLOCK is fixed when the kernel is compiled, not passed at run time |
| `pid = tl.program_id(0)` | which program this is, along the grid's first axis |
| `offs = pid * BLOCK + tl.arange(0, BLOCK)` | the positions its lanes own: with BLOCK `4`, program `2` owns `8, 9, 10, 11` |
| `mask = offs < n` | true for the lanes inside the tensor, false past its end |
| `tl.load(..., mask=mask)` | reads `x` only where the mask is true |
| `tl.store(..., mask=mask)` | writes `y` only where the mask is true |

`tl.program_id` returns the program's id along the axis it is given. {{claim:triton.program-id}} `tl.arange(0, BLOCK)` is the numbers from `0` up to `BLOCK - 1`, and Triton refuses a range whose length is not a power of two. {{claim:triton.arange-range-check}} It refuses a length that is not a compile-time constant as well, which is why BLOCK is declared `tl.constexpr`. {{claim:triton.arange-constexpr}} Where the mask is false, `tl.load` reads nothing and `tl.store` writes nothing. {{claim:triton.load-mask}} {{claim:triton.store-mask}} A masked load hands back the value of its `other` argument for that lane, and an undefined value when there is none. {{claim:triton.load-other}}

The grid is sized on the CPU, at the launch: `scale[(triton.cdiv(n, 4),)](x, y, n, 2.0, BLOCK=4)`. The grid goes in the brackets and the kernel's arguments in the parentheses. {{claim:triton.launch-syntax}} `triton.cdiv(n, BLOCK)` is `(n + BLOCK - 1) // BLOCK`, the division rounded up. {{claim:triton.cdiv-host}}

A masked lane is still one of the program's lanes. The mask stops its load and its store, and does not give the lane back to the GPU.

:::predict
id: tr0.l4.p2
prompt: "The kernel `scale` runs with `BLOCK = 128` over a tensor of `1000` elements, on the grid that `triton.cdiv` gives. How many of its lanes are masked?"
answer: { kind: numeric, unit: lanes, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.triton-masks]
:::

## Pointers from strides

`x_ptr + offs` is the first lesson's address sum with one stride of `1`: element `i` of a contiguous one-dimensional tensor sits `i` elements after the first. A kernel over two dimensions takes the strides as arguments and writes the whole sum out. The course's second kernel scales a two-dimensional tensor:

```python
@triton.jit
def scale_2d(x_ptr, y_ptr, m, n,
             stride_m, stride_n, factor,
             BM: tl.constexpr,
             BN: tl.constexpr):
    offs_m = tl.program_id(0) * BM + tl.arange(0, BM)
    offs_n = tl.program_id(1) * BN + tl.arange(0, BN)
    mask = (offs_m[:, None] < m) & (offs_n[None, :] < n)
    ptrs = offs_m[:, None] * stride_m + offs_n[None, :] * stride_n
    x = tl.load(x_ptr + ptrs, mask=mask)
    tl.store(y_ptr + ptrs, x * factor, mask=mask)
```

The grid now has two axes, and `tl.program_id(1)` reads the second. A launch grid has three axes at most, numbered `0`, `1` and `2`. {{claim:triton.program-id-axes}} `offs_m` is the program's rows and `offs_n` its columns. Indexing with `None` adds a dimension of size one, so `offs_m[:, None]` is a column and `offs_n[None, :]` a row. Adding a column to a row broadcasts both to a `BM` by `BN` tile, the trick of the first lesson's stride of zero.

So `ptrs` holds one address per lane: `row * stride_m + col * stride_n`, the sum `offset + i * stride[0] + j * stride[1]` of the first lesson, for every lane of the tile at once. The mask is the same tile of true and false. A lane is on only when its row is inside `m` and its column is inside `n`.

Because the kernel takes its strides, it can read a tensor that is not contiguous. The course's run passed it a transposed view: a buffer of `(6, 5)` read as `(5, 6)` through strides `(1, 5)`, with no copy. Tiles of `(2, 4)` on a grid of `(3, 2)` cover it, and 18 of the 48 lanes are masked [derived]. A kernel that took no strides and computed `row * n + col` would read this view in the wrong order, and would need a `contiguous()` copy first.

The strides make the read correct. They do not make it fast: two neighbouring lanes of one row of the tile read addresses 5 apart [derived], not side by side. {{ks:T4.L4}} showed why a GPU reads neighbouring addresses fastest.

Say which program covers an element before you read on.

:::item
family: tr0.grid-cover
level: 0
count: 1
:::

## Stepping a kernel on the CPU

Triton can run a kernel without a GPU. Set the environment variable `TRITON_INTERPRET=1` before Triton is imported. {{claim:triton.interpret-knob}} Then `@triton.jit` returns a Python function in place of a compiled kernel. {{claim:triton.interpret-swaps-jit}} That function copies the tensors to the CPU and runs the programs one after another, in plain Python loops over the grid. {{claim:triton.interpret-on-cpu}} {{claim:triton.interpret-one-program-at-a-time}} A print inside the kernel then prints once for each program, in order.

The course ran its two kernels this way on a CPU, with Triton `3.8.0`, on 2026-11-21 at `ee64e9ec`. Both wrote what PyTorch computes. {{claim:triton.course-kernel.ran}} The one-dimensional kernel printed the offsets and the mask of its last program, `pid = 2`: offsets `[8, 9, 10, 11]` and mask `[True, True, False, False]`. Its run ended on the grid model's own numbers:

```text
1-D: n=10 BLOCK=4 programs=3 lanes=12 masked=2
2-D: shape=(5, 6) strides=(1, 5) BLOCK=(2, 4) grid=(3, 2) masked=18
```

The same run read vLLM's Model Runner V2, the engine's default way of running the model, at commit `4ba787ec`. It read the Triton kernels of five of the engine's files, gave seven of them small inputs of its own, and ran each under the interpreter. All seven wrote what PyTorch computes. {{claim:vllm.mrv2.interpreter-run}}

- [`_temperature_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L22-L39), in `sample/gumbel.py`. One program covers one token on axis `0` and one block of its vocabulary on axis `1`, masked past the vocabulary. {{claim:vllm.mrv2.temperature-mask}} {{claim:vllm.mrv2.interp.temperature}}
- [`_gumbel_sample_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L282), in `sample/gumbel.py`. {{claim:vllm.mrv2.interp.gumbel-sample}}
- [`_apply_write_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/buffer_utils.py#L317-L348), in `buffer_utils.py`. One program covers one write on axis `0` and one block of its content on axis `1`, masked past the content. {{claim:vllm.mrv2.apply-write-mask}} {{claim:vllm.mrv2.interp.apply-write}}
- [`_gather_block_tables_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L275-L291), in `block_table.py`. One program copies one batch row of one KV cache group. {{claim:vllm.mrv2.block-table-grid}} {{claim:vllm.mrv2.interp.gather-block-tables}}
- [`_compute_slot_mappings_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L334), in `block_table.py`. {{claim:vllm.mrv2.interp.slot-mappings}}
- [`_prepare_prefill_inputs_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L280), in `input_batch.py`. {{claim:vllm.mrv2.interp.prepare-prefill}}
- [`_prepare_pos_seq_lens_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L357), in `input_batch.py`. {{claim:vllm.mrv2.interp.pos-seq-lens}}

Each mark holds what the course gave the kernel and what it checked. For four of the seven, the course has not read which part of the input one program covers, so the list says only that they ran. The temperature kernel is this lesson's kernel at engine size: `block_idx * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)`, masked where the index is not below `vocab_size`. Eleven other kernels of the same files were given no input, so none of them has run under the interpreter, and none is shown here. {{claim:vllm.mrv2.interp.not-run}}

A kernel that ran here has run on a CPU, one program at a time, on the course's small inputs. That says nothing of whether it runs, or how fast, on a GPU.

To step the course's kernel yourself takes about 20 minutes [estimated], and it is optional. PyTorch `2.14.0` requires Triton `3.8` on Linux. {{claim:torch.release.triton-pin}} A Triton 3.8.0 wheel off Linux, for macOS or Windows, is one the course has not checked [unverified]. Off Linux, read the course's run printed above. Triton `3.8.0` runs on Python `3.10` to `3.14`, so the course's Python `3.12` is inside its range. {{claim:triton.release.python-range}} On Linux, in that Python with `torch==2.14.0` and `triton==3.8.0`, put the kernel `scale` in a file with `tl.device_print("offs", offs)` after its mask, and run:

```python
import os
# before triton is imported:
os.environ["TRITON_INTERPRET"] = "1"
import torch, triton
import triton.language as tl
# ... the kernel scale, as above ...
x = torch.arange(1.0, 11.0)
y = torch.zeros(10)
grid = (triton.cdiv(10, 4),)
scale[grid](x, y, 10, 2.0, BLOCK=4)
```

The interpreter runs the three programs in order, and each prints its id and its offsets:

```text
(0, 0, 0)  offs:  [0 1 2 3]
(1, 0, 0)  offs:  [4 5 6 7]
(2, 0, 0)  offs:  [ 8  9 10 11]
```

Print the mask the same way, and the last program shows its two lanes past the end.

## Exit check

The level draws three new tensors to cover, and three questions follow on new launches: which program covers an element, how many programs a launch has, or how many of its lanes are masked.

:::game
id: shape-shifter
level: grid
mode: graded
:::

:::item
family: tr0.grid-cover
level: 1
count: 3
:::
