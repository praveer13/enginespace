# Reading Triton: grids, programs, BLOCK and masks

_PyTorch for the Rust-first, and reading Triton · lesson `tr0.l4` · review · about 50 minutes [estimated]_

Builds on kernelspace: `ks:T4.L6`, `ks:T4.L4`, `ks:t4.compute-grid`, `ks:t4.tiling-intensity`, `ks:t4.coalescing`.

Knowledge components: `tr0.triton-program-model`, `tr0.triton-masks`.

Triton is a language for GPU kernels, written as Python functions. Reading one takes five facts:

- A **kernel** runs as a **grid** of **programs**: many runs of the same function, each told by its id which part of the tensor is its own.
- One program covers a tile of **BLOCK** elements along each dimension, and each element position of the tile is one **lane**.
- BLOCK is a compile-time constant, and a power of two.
- `cdiv(n, BLOCK)` programs, n divided by BLOCK and rounded up, cover a dimension of n elements.
- A lane whose position is past the edge of the tensor is **masked**: it loads nothing and stores nothing.

The level draws the tensor's cells and each program as a tile over them. Cover the tensor, and count what each edge masks.

> **Predict `tr0.l4.p1`.** The level's tensor has shape (12, 20) [synthetic], and the reference covers each of its elements exactly once with at most six programs. How many lanes will it leave masked?
>
> The learner commits to a number in `lanes`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Play.** The game `shape-shifter`, level `grid`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## From the grid to `tl.program_id`

The level asks you to cover a `(12, 20)` tensor with a grid of programs. Here is the reference's launch beside two that look sensible and mask more. Printed by the course's model on 2026-11-21 at `7037bd7`.

| Launch | The reference [synthetic] | One program [synthetic] | Square tiles [synthetic] |
|---|---|---|---|
| BLOCK | `(16, 4)` | `(16, 32)` | `(8, 8)` |
| Grid | `(1, 5)` | `(1, 1)` | `(2, 3)` |
| Programs | 5 | 1 | 6 |
| Lanes | 320 | 512 | 384 |
| Masked lanes | 80 | 272 | 144 |

The 20 columns divide by a BLOCK of 4 [synthetic], so no lane is masked along dimension 1. The 12 rows would divide by 4 too, but 3 programs down and 5 across make 15 [synthetic], more than the level allows. The cap of six programs is the level's and not Triton's: without one, a BLOCK of `1` would mask nothing. So the reference fits the dimension that divides and masks along the other. Each of its programs covers 16 rows where the tensor has 12, and 16 of its 64 lanes are masked [synthetic]. Square tiles fit neither dimension.

That table is the arithmetic of one tile, and a kernel spells it out in a few lines. This is the course's own kernel, which scales a one-dimensional tensor, and not an engine's:

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

`tl.program_id` returns the program's id along the axis it is given. **the program's id along an axis** [measured] `tl.arange(0, BLOCK)` is the numbers from `0` up to `BLOCK - 1`, and Triton refuses a range whose length is not a power of two. **end minus start is a power of two** [measured] It refuses a length that is not a compile-time constant as well, which is why BLOCK is declared `tl.constexpr`. **compile-time arguments** [measured] Where the mask is false, `tl.load` reads nothing and `tl.store` writes nothing. **a masked lane does not load** [measured] **a masked lane does not store** [measured] A masked load hands back the value of its `other` argument for that lane, and an undefined value when there is none. **the masked-out value** [measured]

The grid is sized on the CPU, at the launch: `scale[(triton.cdiv(n, 4),)](x, y, n, 2.0, BLOCK=4)`. The grid goes in the brackets and the kernel's arguments in the parentheses. **fn[grid](...)** [measured] `triton.cdiv(n, BLOCK)` is `(n + BLOCK - 1) // BLOCK`, the division rounded up. **the same sum on the host** [measured]

A masked lane is still one of the program's lanes. The mask stops its load and its store, and does not give the lane back to the GPU.

> **Predict `tr0.l4.p2`.** The kernel scale runs with BLOCK = 128 [estimated] over a tensor of 1000 [estimated] elements, on the grid that triton.cdiv gives. How many of its lanes are masked?
>
> The learner commits to a number in `lanes`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

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

The grid now has two axes, and `tl.program_id(1)` reads the second. A launch grid has three axes at most, numbered `0`, `1` and `2`. **a 3-D launch grid** [measured] `offs_m` is the program's rows and `offs_n` its columns. Indexing with `None` adds a dimension of size one, so `offs_m[:, None]` is a column and `offs_n[None, :]` a row. Adding a column to a row broadcasts both to a `BM` by `BN` tile, the trick of the first lesson's stride of zero.

So `ptrs` holds one address per lane: `row * stride_m + col * stride_n`, the sum `offset + i * stride[0] + j * stride[1]` of the first lesson, for every lane of the tile at once. The mask is the same tile of true and false. A lane is on only when its row is inside `m` and its column is inside `n`.

Because the kernel takes its strides, it can read a tensor that is not contiguous. The course's run passed it a transposed view: a buffer of `(6, 5)` read as `(5, 6)` through strides `(1, 5)`, with no copy. Tiles of `(2, 4)` on a grid of `(3, 2)` cover it, and 18 of the 48 lanes are masked [derived]. A kernel that took no strides and computed `row * n + col` would read this view in the wrong order, and would need a `contiguous()` copy first.

The strides make the read correct. They do not make it fast: two neighbouring lanes of one row of the tile read addresses 5 apart [derived], not side by side. kernelspace T4.L4 showed why a GPU reads neighbouring addresses fastest.

Say which program covers an element before you read on.

> **Practice.** Items from the generator family `tr0.grid-cover`, level `0`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Stepping a kernel on the CPU

Triton can run a kernel without a GPU. Set the environment variable `TRITON_INTERPRET=1` before Triton is imported. **TRITON_INTERPRET** [measured] Then `@triton.jit` returns a Python function in place of a compiled kernel. **an interpreted function** [measured] That function copies the tensors to the CPU and runs the programs one after another, in plain Python loops over the grid. **arguments copied to the host** [measured] **programs run one after another** [measured] A print inside the kernel then prints once for each program, in order.

The course ran its two kernels this way on a CPU, with Triton `3.8.0`, on 2026-11-21 at `ee64e9ec`. Both wrote what PyTorch computes. **ran** [measured] The one-dimensional kernel printed the offsets and the mask of its last program, `pid = 2`: offsets `[8, 9, 10, 11]` and mask `[True, True, False, False]`. Its run ended on the grid model's own numbers:

```text
1-D: n=10 BLOCK=4 programs=3 lanes=12 masked=2
2-D: shape=(5, 6) strides=(1, 5) BLOCK=(2, 4) grid=(3, 2) masked=18
```

The same run read vLLM's Model Runner V2, the engine's default way of running the model, at commit `4ba787ec`. It read the Triton kernels of five of the engine's files, gave seven of them small inputs of its own, and ran each under the interpreter. All seven wrote what PyTorch computes. **7 ran, 0 failed, 11 not run** [measured]

- [`_temperature_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L22-L39), in `sample/gumbel.py`. One program covers one token on axis `0` and one block of its vocabulary on axis `1`, masked past the vocabulary. **the block past the vocabulary is masked** [measured] **ran** [measured]
- [`_gumbel_sample_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L282), in `sample/gumbel.py`. **ran** [measured]
- [`_apply_write_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/buffer_utils.py#L317-L348), in `buffer_utils.py`. One program covers one write on axis `0` and one block of its content on axis `1`, masked past the content. **one program per write, masked at the content length** [measured] **ran** [measured]
- [`_gather_block_tables_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L275-L291), in `block_table.py`. One program copies one batch row of one KV cache group. **axis 0 the KV cache group, axis 1 the batch row** [measured] **ran** [measured]
- [`_compute_slot_mappings_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L334), in `block_table.py`. **ran** [measured]
- [`_prepare_prefill_inputs_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L280), in `input_batch.py`. **ran** [measured]
- [`_prepare_pos_seq_lens_kernel`](https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L357), in `input_batch.py`. **ran** [measured]

Each mark holds what the course gave the kernel and what it checked. For four of the seven, the course has not read which part of the input one program covers, so the list says only that they ran. The temperature kernel is this lesson's kernel at engine size: `block_idx * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)`, masked where the index is not below `vocab_size`. Eleven other kernels of the same files were given no input, so none of them has run under the interpreter, and none is shown here. **11 kernels** [unverified]

A kernel that ran here has run on a CPU, one program at a time, on the course's small inputs. That says nothing of whether it runs, or how fast, on a GPU.

To step the course's kernel yourself takes about 20 minutes [estimated], and it is optional. PyTorch `2.14.0` requires Triton `3.8` on Linux. **triton~=3.8.0** [measured] A Triton 3.8.0 wheel off Linux, for macOS or Windows, is one the course has not checked [unverified]. Off Linux, read the course's run printed above. Triton `3.8.0` runs on Python `3.10` to `3.14`, so Python `3.12`, the one the course's environments use, is inside its range. **>=3.10,<3.15** [measured] On Linux, in that Python with `torch==2.14.0` and `triton==3.8.0`, put the kernel `scale` in a file with `tl.device_print("offs", offs)` after its mask, and run:

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

> **Play.** The game `shape-shifter`, level `grid`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Practice.** Items from the generator family `tr0.grid-cover`, level `1`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `torch.release.triton-pin`: PyTorch 2.14.0 requires Triton 3.8 on Linux, in its package metadata. This is where the course takes the Triton pin from. Value triton~=3.8.0 [measured], checked 2026-11-20 (source: torch 2.14.0 on PyPI (JSON API) <https://pypi.org/pypi/torch/2.14.0/json>, read 2026-11-20).
- `triton.arange-constexpr`: tl.arange rejects arguments that are not compile-time constants, which is why a kernel declares its BLOCK as tl.constexpr. Value compile-time arguments [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/semantic.py, arange <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/semantic.py#L585>, read 2026-11-20).
- `triton.arange-range-check`: The code that builds tl.arange raises an error unless end minus start is a power of two. So tl.arange(0, BLOCK) compiles only for a BLOCK that is a power of two. The documentation words the rule about start and end, and the code checks their difference. Value end minus start is a power of two [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/semantic.py, arange <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/semantic.py#L583-L594>, read 2026-11-20).
- `triton.cdiv-host`: triton.cdiv, the one a launch uses to size its grid on the host, computes (x + y - 1) // y. Value the same sum on the host [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/__init__.py, cdiv <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/__init__.py#L69-L70>, read 2026-11-20).
- `triton.course-kernel.ran`: The course's own two kernels (a 1-D scale over 10 elements in blocks of 4, and a 2-D scale over a transposed 5 by 6 view in blocks of 2 by 4) ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 and wrote what torch computes. The 1-D kernel launched 3 programs of 4 lanes, 12 lanes in all, and 2 were masked, the numbers the grid level's model gives; its last program held offsets 8, 9, 10, 11 and the mask True, True, False, False. The 2-D kernel launched a grid of (3, 2) with 18 masked lanes. Value ran [measured], checked 2026-11-21 (from the course's own synthetic world).
- `triton.interpret-knob`: Triton reads its interpreter switch from the environment variable TRITON_INTERPRET, as a runtime knob named interpret. Value TRITON_INTERPRET [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/knobs.py, runtime_knobs <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/knobs.py#L471>, read 2026-11-20).
- `triton.interpret-on-cpu`: Before it runs a grid, the interpreter copies the kernel's tensor arguments to the CPU, and it copies them back afterwards so that the kernel's writes show. Value arguments copied to the host [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/runtime/interpreter.py, GridExecutor <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/runtime/interpreter.py#L1352>, read 2026-11-20).
- `triton.interpret-one-program-at-a-time`: The interpreter runs the programs of a grid one after another, in Python loops over the three grid axes. Each iteration sets the program's grid index and then calls the kernel's Python function. Value programs run one after another [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/runtime/interpreter.py, GridExecutor <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/runtime/interpreter.py#L1409-L1413>, read 2026-11-20).
- `triton.interpret-swaps-jit`: When the interpret knob is set, the triton.jit decorator returns an InterpretedFunction in place of a compiled kernel. Value an interpreted function [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/runtime/jit.py, jit <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/runtime/jit.py#L984-L985>, read 2026-11-20).
- `triton.launch-syntax`: A Triton kernel is launched as fn[grid](*args, **kwargs): the grid goes in the brackets and the kernel's arguments in the parentheses. The interpreter's InterpretedFunction is built on the same interface. Value fn[grid](...) [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/runtime/jit.py, KernelInterface.__getitem__ <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/runtime/jit.py#L370>, read 2026-11-20).
- `triton.load-mask`: In tl.load, where mask[idx] is false the data at address pointer[idx] is not loaded. Value a masked lane does not load [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/core.py, load <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/core.py#L2506>, read 2026-11-20).
- `triton.load-other`: Where the mask is false, tl.load returns the value of other for that lane, and the value is undefined when other is None. Value the masked-out value [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/core.py, load <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/core.py#L2509>, read 2026-11-20).
- `triton.program-id`: tl.program_id returns the id of the current program instance along the given axis of the launch grid. Value the program's id along an axis [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/core.py, program_id <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/core.py#L1945-L1950>, read 2026-11-20).
- `triton.program-id-axes`: The launch grid has three axes, and the axis given to tl.program_id must be 0, 1 or 2. Value a 3-D launch grid [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/core.py, program_id <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/core.py#L1949>, read 2026-11-20).
- `triton.release.python-range`: Triton 3.8.0 requires a Python from 3.10 up to but not including 3.15, so the course's Python 3.12 is inside its range. Value >=3.10,<3.15 [measured], checked 2026-11-20 (source: triton 3.8.0 on PyPI (JSON API) <https://pypi.org/pypi/triton/3.8.0/json>, read 2026-11-20).
- `triton.store-mask`: In tl.store, where mask[idx] is false the value is not stored at pointer[idx]. Value a masked lane does not store [measured], checked 2026-11-20 (source: Triton v3.8.0, python/triton/language/core.py, store <https://github.com/triton-lang/triton/blob/v3.8.0/python/triton/language/core.py#L2588>, read 2026-11-20).
- `vllm.mrv2.apply-write-mask`: The kernel that applies staged writes gives each write its own program on axis 0 and covers the write's content in BLOCK_SIZE blocks on axis 1. It masks the lanes past the content's length. Value one program per write, masked at the content length [measured], checked 2026-11-20 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/buffer_utils.py, _apply_write_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/buffer_utils.py#L328-L348>, read 2026-11-20).
- `vllm.mrv2.block-table-grid`: The kernel that gathers block tables reads the KV cache group from axis 0 of its grid and the batch row from axis 1, and one program copies one row of one group. Value axis 0 the KV cache group, axis 1 the batch row [measured], checked 2026-11-20 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/block_table.py, _gather_block_tables_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L290-L291>, read 2026-11-20).
- `vllm.mrv2.interp.apply-write`: _apply_write_kernel, the kernel that applies staged writes, in vllm/v1/worker/gpu/buffer_utils.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two writes into a 4 by 10 table, with 2-lane blocks so that each write needed two programs on axis 1, in its single-table mode: the table held what the writes say and nothing else, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/buffer_utils.py, _apply_write_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/buffer_utils.py#L317>, read 2026-11-21).
- `vllm.mrv2.interp.gather-block-tables`: _gather_block_tables_kernel, the kernel that gathers block tables, in vllm/v1/worker/gpu/block_table.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two KV cache groups, three batch rows of which the last was padding, and a table of pointers to the tables as the engine builds it: each real row held its request's block ids up to that request's block count, and the padded row was zeroed, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/block_table.py, _gather_block_tables_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L275>, read 2026-11-21).
- `vllm.mrv2.interp.gumbel-sample`: _gumbel_sample_kernel, the Gumbel sampling kernel of vllm/v1/worker/gpu/sample/gumbel.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two tokens over a 20-token vocabulary in 16-lane blocks, with no logits cache and no drafting: for the token at temperature 0.0 each block's argmax and the vocabulary's blocks matched torch's argmax, and for the token at temperature 0.7 each block returned an index inside its own block with a finite value (the noise itself was not compared). Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/sample/gumbel.py, _gumbel_sample_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L282>, read 2026-11-21).
- `vllm.mrv2.interp.not-run`: Eleven kernels of the five candidate files were given no input by the course's script, so none of them has been run under the interpreter: _combine_sampled_and_draft_tokens_kernel, _get_num_sampled_and_rejected_kernel, _post_update_kernel, _post_update_num_computed_tokens_kernel and _expand_idx_mapping_kernel of input_batch.py, and the six kernels of spec_decode/rejection_sampler_utils.py. Whether each one runs there is [unverified], and no lesson shows one stepping. Value 11 kernels [unverified], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py (the first of its kernels) <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/spec_decode/rejection_sampler_utils.py#L209>, read 2026-11-21).
- `vllm.mrv2.interp.pos-seq-lens`: _prepare_pos_seq_lens_kernel, the kernel that fills positions and sequence lengths, in vllm/v1/worker/gpu/input_batch.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two requests and a padding program, with 2-lane blocks: the positions and the sequence lengths were right and the unused sequence lengths were zeroed, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/input_batch.py, _prepare_pos_seq_lens_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L357>, read 2026-11-21).
- `vllm.mrv2.interp.prepare-prefill`: _prepare_prefill_inputs_kernel, the kernel that prepares a prefill's input ids, in vllm/v1/worker/gpu/input_batch.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two requests, one lookahead token each, and 2-lane blocks: the input ids and the next prefill tokens held what the prompts say, with 0 where a lookahead position lay past the prefill length, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/input_batch.py, _prepare_prefill_inputs_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/input_batch.py#L280>, read 2026-11-21).
- `vllm.mrv2.interp.slot-mappings`: _compute_slot_mappings_kernel, the kernel that computes slot mappings, in vllm/v1/worker/gpu/block_table.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with two KV cache groups with block sizes 4 and 8, two requests of five and four tokens, and a 12-slot output, without context parallelism: each token's slot was its block number times the block size plus its offset in the block, and the slots after the nine real tokens were padded with -1, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/block_table.py, _compute_slot_mappings_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/block_table.py#L334>, read 2026-11-21).
- `vllm.mrv2.interp.temperature`: _temperature_kernel, the temperature kernel of vllm/v1/worker/gpu/sample/gumbel.py, ran under Triton 3.8.0's interpreter on a CPU on 2026-11-21 with a four-token batch over a 20-token vocabulary in 16-lane blocks, with temperatures 0.5, 1.0, 0.0 and 4.0 (the kernel leaves a row alone at 0.0 and 1.0): every row that has another temperature came out divided by it, which the course checked against torch. Value ran [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/sample/gumbel.py, _temperature_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L22>, read 2026-11-21).
- `vllm.mrv2.interpreter-run`: On 2026-11-21 the course ran seven of vLLM's Model Runner V2 kernels under Triton 3.8.0's interpreter on a CPU (TRITON_INTERPRET=1, torch 2.14.0+cpu) and all seven ran and wrote what torch computes. It gave eleven other kernels of the same five files no input, so they were not run. The inputs are the course's own small ones; a kernel that ran here has not been shown to run, or to be fast, on a GPU. Value 7 ran, 0 failed, 11 not run [measured], checked 2026-11-21 (source: vLLM at 4ba787ec, vllm/model_executor/layers/quantization/awq_triton.py (a comment in a kernel) <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/model_executor/layers/quantization/awq_triton.py#L127>, read 2026-11-20).
- `vllm.mrv2.temperature-mask`: The temperature kernel finds its lanes as block_idx * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE) and masks the lanes whose index is not below vocab_size. This is the course's mask, in a kernel the default runner runs. Value the block past the vocabulary is masked [measured], checked 2026-11-20 (source: vLLM at 4ba787ec, vllm/v1/worker/gpu/sample/gumbel.py, _temperature_kernel <https://github.com/vllm-project/vllm/blob/4ba787ec9959e566d3b587a796dff07673324da5/vllm/v1/worker/gpu/sample/gumbel.py#L38-L39>, read 2026-11-20).
