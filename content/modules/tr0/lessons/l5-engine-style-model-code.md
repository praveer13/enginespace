---
id: tr0.l5
module: tr0
title: "Engine-style model code: Mini-SGLang's Qwen3, and vLLM's MRV2 Triton files"
minutes: 20                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr0.decoder-forward, tr0.hidden-syncs, tr0.triton-program-model]
builds_on: [ks:T5.L1, ks:T4.L6, ks:T5.L6, ks:T5.L8]
status: review                    # draft | review | live
lanes: [B]
---

The last lesson ended on kernels that an engine launches, and an engine launches them from its own model code, which you have not read yet. The third lesson read Qwen3 as Hugging Face writes it. This lesson reads the same model as Mini-SGLang, an inference engine, writes it, at its commit `9a91cfaf`.

## The same model, written by an engine

Mini-SGLang's file `models/qwen3.py` is {{claim:minisgl.qwen3.lines}} long. It holds the decoder layer, the model and the wrapper around it, and it takes its attention and its MLP from a second file, `models/utils.py`. The attention is the class `RopeAttn` of that file, imported under the name `Qwen3Attn`, and the layer builds it with `has_qk_norm` set. {{claim:minisgl.qwen3.attention-imported}}

The layer runs the third lesson's steps in the same order: the input norm, the attention, the post-attention norm and the MLP, with the residual added back after the attention and after the MLP. The difference is where that add sits. Mini-SGLang's norm takes two tensors, the new output and the residual, adds them inside its own call, and returns two: the normalized sum and the sum itself, which is the new residual. So the line `x, residual = self.post_attention_layernorm.forward(x, residual)` does the add and the norm, and no line of the layer adds. {{claim:minisgl.qwen3.layer-order}}

The projections are where the third lesson counted work. The Hugging Face attention makes the query, the key and the value with three projections, `q_proj`, `k_proj` and `v_proj`. Commit to what Mini-SGLang's attention does with the same input.

:::predict
id: tr0.l5.p1
prompt: The attention of the third lesson makes the query, the key and the value with three matrix multiplies (matmuls), one for each of q_proj, k_proj and v_proj. Mini-SGLang's Qwen3 attention, at its pinned commit, makes the same three tensors from the same input. How many matmuls does it use for them? A linear layer is one matmul.
answer: { kind: numeric, unit: matmuls, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.decoder-forward]
:::

## What the engine changes

Mini-SGLang's attention projects once. `RopeAttn` builds one merged projection for the query, the key and the value, `LinearQKVMerged`, where the Hugging Face model keeps three. {{claim:minisgl.attn.merged-qkv}} Its output width is the number of query heads plus two times the number of key and value heads, all times the head size, which is the three outputs side by side. {{claim:minisgl.attn.qkv-width}} For Qwen3-0.6B that is {{claim:qwen3.config.qkv-merged-rows}} rows: the 2048 of the query and the 1024 of each of the other two, added up [derived].

A linear layer in Mini-SGLang is one call of `F.linear` on its weight, so the merged projection computes the query, the key and the value with one matrix multiply, where the Hugging Face layer makes three. {{claim:minisgl.attn.qkv-one-matmul}} The MLP does the same with its pair: the gate and the up projection are merged into one, `gate_up_proj`, and the activation and the down projection follow. {{claim:minisgl.mlp.gate-up-merged}}

For Qwen3-0.6B, the attention's input goes through `q_proj`, `k_proj` and `v_proj` in Hugging Face, with 2048, 1024 and 1024 output rows [derived]. In Mini-SGLang it goes through `qkv_proj`, with 4096 rows [derived]. The MLP's input goes through `gate_proj` and `up_proj` in Hugging Face, and through `gate_up_proj` in Mini-SGLang.

The rotation and the norms of the query and the key move too. In Hugging Face they are lines of the attention's own `forward`. `RopeAttn.forward` projects once into `qkv`, passes it to a second attention layer that holds the rotary embedding and the two norms, and then applies the output projection. {{claim:minisgl.attn.forward}}

A merged weight is one launch where three were. Whether that makes a step faster the course has not measured, and the file does not say why its authors chose it. The course has not run Mini-SGLang either, so it does not say that the two files give the same logits.

One more line of the layer matters in TR3, the module that profiles an engine's step. The layer's forward is wrapped in an NVTX annotation named `Layer_{}` with the layer's id, and the attention and the MLP carry their own. An NVTX annotation names a span of code so that a profiler can draw it as a labelled range. {{claim:minisgl.qwen3.nvtx-layer}}

The merged output has to be cut back into three tensors. Slicing one dimension of a contiguous tensor gives a view, as the first lesson showed. Check the strides of a new slice before you read on.

:::item
family: tr0.strides-of
level: 1
count: 1
:::

## Kernels an engine owns

The fourth lesson stepped seven of vLLM's kernels on a CPU. They belong to Model Runner V2 (MRV2), the runner that vLLM uses by default, and they live in five files. Each is read at vLLM's commit `4ba787ec`, and its path is under `vllm/v1/worker/gpu/`. A commit is a pin: the file is read as it stood then, and the engine may have changed since.

- `sample/gumbel.py`, 417 lines [measured]: a temperature kernel, a Gumbel sampling kernel and the hash functions that draw its noise. {{claim:vllm.mrv2.gumbel-lines}}
- `buffer_utils.py`, 357 lines [measured]: the staged writes of `StagedWriteTensor`, applied by one Triton kernel. {{claim:vllm.mrv2.buffer-utils-lines}} {{claim:vllm.mrv2.staged-write-tensor}}
- `block_table.py`, 414 lines [measured]: two kernels, one that gathers block tables and one that computes slot mappings. {{claim:vllm.mrv2.block-table-lines}}
- `input_batch.py`, 759 lines [measured]: seven kernels that prepare and update a step's inputs. {{claim:vllm.mrv2.input-batch-lines}} {{claim:vllm.mrv2.input-batch-kernels}}
- `spec_decode/rejection_sampler_utils.py`, 1,411 lines [measured]: the six launched Triton kernels of the rejection sampler. {{claim:vllm.mrv2.rejection-sampler-lines}} {{claim:vllm.mrv2.rejection-kernels}}

The five files hold 18 kernels between them: 2, 1, 2, 7 and 6 [derived]. By their names, none of them is an attention or a matrix multiply. They sample a token, write to the engine's buffers, map a token to its place in the KV cache, prepare a step's inputs and check the tokens of a draft. The last is the verify step of speculative decoding from {{ks:T5.L8}}: a small model drafts tokens and the large one accepts or rejects them, and the rejection sampler decides which. These kernels are the engine's own work on the batch around the model, which is why a reader of the engine meets them.

The course's other pins are releases, and PyPI shows the day the first files of each went up. vLLM's own Dockerfile and its tests use Python `3.12`, the version of the course's environments too. {{claim:python.vllm.default-3-12}}

| Release | First files on PyPI |
|---|---|
| PyTorch `2.14.0` | {{claim:torch.release.upload}} |
| Triton `3.8.0` | {{claim:triton.release.upload}} |
| transformers `5.19.0` | {{claim:transformers.release.upload}} |

Each kernel starts by asking where it is. `tl.program_id(axis)` is which program this is along an axis of the grid, and `tl.num_programs(axis)` is how many programs were launched along it. {{claim:triton.num-programs}} The lanes of a program come from `tl.arange(0, BLOCK)`, and the code that builds it refuses a range whose length is not a power of two, the rule the fourth lesson gave for `BLOCK`. {{claim:triton.arange-range-check}} The documentation words the rule about the range's start instead, and the code is what runs. {{claim:triton.arange-power-of-two}}

The grid is not in the kernel but in the launch. The temperature kernel's launch has two axes: one counts the tokens, and the other counts the blocks of `8192` lanes that the vocabulary needs. {{claim:vllm.mrv2.temperature-grid}} The kernel masks the lanes of the block past the vocabulary. {{claim:vllm.mrv2.temperature-mask}} The fourth lesson's arithmetic gives the launch for Qwen3-0.6B, whose vocabulary has {{claim:qwen3.config.vocab-size}} entries. `triton.cdiv` of that over `8192` is 19 blocks for each token [derived]. They hold 155648 lanes, and 3712 of them are masked, all in the last block [derived]. In the last block, 4480 of the `8192` lanes hold an entry [derived]. The course has not run this kernel on a vocabulary this size, and the arithmetic says nothing of how long the launch takes.

Say which program covers an element of a launch like this before you read on.

:::item
family: tr0.grid-cover
level: 0
count: 1
:::

## A Rust crate on the hot path

SGLang does not keep all of its hot path in Python. {{ks:T5.L6}} drew SGLang's prefix cache as a radix tree: requests that start with the same tokens share one path of it, and a lookup returns the longest prefix the tree already holds. At its release `v0.5.23` SGLang carries a Rust crate for its tree, `sglang-radix-tree`, and the file `python_bindings.rs` is its seam: the place where Python calls into the Rust. The seam is written with PyO3, the library that lets Rust code define a Python extension module. This lesson reads one example of it, and no more.

The module that the file defines is named `mem_cache`, and a Python `import` of it gets the Rust tree core. {{claim:sglang.pyo3.module}} A function adds the Rust classes to it: the tree core itself, `RustUnifiedTreeCoreBinding`, and the parameter and result classes that its calls take and return. {{claim:sglang.pyo3.registers}}

A call across the seam reads like a Rust function over structs. `match_prefix` takes a `MatchParamsBinding` and returns a `MatchResultBinding`, and it calls the Rust core's `match_prefix` inside a `py.detach` closure. {{claim:sglang.pyo3.match-prefix}} What `py.detach` does to Python's own thread is not read by this lesson [unverified].

A tensor crosses the seam as well. The file imports `Device`, `Kind` and `Tensor` from the `tch` crate, so that a method can take a torch tensor. {{claim:sglang.pyo3.tch}} `PyTensor` is the newtype that bridges a `tch::Tensor` and a Python `torch.Tensor` over raw `THPVariable` pointers, and the file says the code is inlined from `pyo3-tch`. {{claim:sglang.pyo3.tensor-bridge}} The second lesson's question, view or copy, applies here too, and the lines the course read do not answer it [unverified].

A panic in the Rust core does not take the Python process down. The binding catches it and raises a Python `RuntimeError` whose message begins "Rust TreeCore panicked", and the core stays unusable afterwards. {{claim:sglang.pyo3.panic-to-error}}

This is one seam of one engine. The course has not measured what the Rust tree saves the engine, and nothing here says that it saves any time.

## Exit check

Three questions on new code. Two are about the calls that wait for the GPU, which engine code like this is full of, each asking which line waits or how many times a loop waits, and one is about a launch like the temperature kernel's, asking which program covers an element, how many programs the grid holds or how many lanes are masked.

:::item
family: tr0.find-the-sync
level: 1
count: 2
:::

:::item
family: tr0.grid-cover
level: 1
count: 1
:::
