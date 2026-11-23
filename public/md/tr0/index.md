# PyTorch for the Rust-first, and reading Triton

_Module `tr0` · review · about 7 hours [estimated]_

## What you will be able to do

- Read a tensor's strides, and tell a view from a copy
- Find the calls in PyTorch code that make the CPU wait for the GPU
- Read an nn.Module as a struct, and map a checkpoint's tensor names onto the code that consumes them
- Write Qwen3-0.6B's forward pass in plain PyTorch on a CPU, without a KV cache and with one, and match the reference
- Read a Triton kernel's grid, programs, BLOCK and masks, and say which elements each program touches

Prerequisites (advice, never a lock): `ks:T5.L1`, `ks:T0.L3`, `ks:T0.L4`.

The engines in this course are Python on top of PyTorch, and this module teaches you to read what their code does to a tensor the way you already read a Rust slice. TR0 helps before TR1 and locks nothing: the course starts at the first lesson of TR1, and you can come here first, or come back when the engines' Python reads hard.

Most of what engine code does to a tensor is bookkeeping over a buffer: a shape, strides, an offset, a dtype and a device. The module ends on the Triton kernels that the engines launch on those tensors. TR0 is the course's primer for a Rust-first engineer, and it teaches what reading vLLM and SGLang needs and nothing more. kernelspace T5.L1 drew the forward pass as data moving through memory, and here you read the same pass in PyTorch code.

## The browser part

The browser part is five lessons and a game, and none of it needs a GPU.

1. PyTorch in Rust terms: storage, shape, strides, dtype, device.
2. Views, copies, and the syncs you cannot see.
3. `nn.Module` as a struct: Qwen3's forward in the pinned transformers.
4. Reading Triton: grids, programs, `BLOCK` and masks.
5. Engine-style model code: Mini-SGLang's Qwen3, and vLLM's own Triton kernels.

TR0's five lessons are five separate subjects: a tensor's layout, the calls that wait for the GPU, a model's code, Triton's programs and an engine's own model code. So no lesson carries a table of what changed since the one before, and no one relation runs through them all.

The game is Tensor views (`shape-shifter`). Each level draws a tensor as its cells, a table of its shape and strides, and the buffer under them, and you plan the reshape: which calls, in which order, and where the one copy goes. A view moves the numbers among the cells and leaves the buffer still, and a copy lays a new buffer under the old one. Three levels are practice: a transpose, an `expand`, and the split of a projection into one block per head. Two are graded and draw fresh tensors each time: Fewest copies, which asks for each of three new targets with as few copies as the reference, and A grid of programs, which asks you to cover a tensor with a Triton grid that masks as few lanes as the reference. Every tensor in the game is synthetic, drawn by the course's model of PyTorch's view rules, and PyTorch itself is the judge. Each lesson ends in a Test on fresh numbers, so recognizing last time's answer earns nothing.

Prove: Tensor views' Fewest copies, in Prove mode, on three new targets with your coding agent closed. Once the lab is published and your receipt is verified, Prove adds questions that only the shapes and strides your own forward recorded can answer.

## The part on your laptop

The laptop part is a lab: Qwen3-0.6B's forward pass, written in plain PyTorch and run on your laptop's CPU, first without a KV cache and then with one. The lab runs on your laptop's CPU, outside the browser, and needs no GPU. The course's grader runs Hugging Face transformers on the same CPU, in `float32`, and compares your logits with its own. The bar is a largest difference of 0.001 [estimated] in any logit.

The lab has three stages, and each is graded by the checks it names:

- **Stage `s1`, one layer.** You write the norm, the attention and the MLP of one decoder layer, and the grader compares the first layer's hidden states with the reference's. The check is `layer0-hidden`, and it shows where an error starts, before the layers above it hide it. The module does not need this stage. Where it stands: built; the course has not yet run this lab on the pinned weights.
- **Stage `s2`, the whole forward pass.** You write every layer, the final norm and the head, and load the checkpoint into your own modules. `logits-fp32` compares your logits with the reference's at every element, and `import-guard` passes when your file does not import `transformers.models`. A third check, `argmax-bank`, is made by this site from your receipt: it compares your top token at chosen positions with the ids the course recorded. Where it stands: awaiting the course's reference bank. Until those ids are recorded, `argmax-bank` cannot pass, and a receipt of this stage cannot pass.
- **Stage `s3`, the KV cache.** You decode token by token. `cache-logits` compares each step's logits with a full recompute of the same prefix, and `cache-lengths` checks that the cache holds as many positions as the prefix after every step. Where it stands: built; the course has not yet run this lab on the pinned weights.

The lab loads one model, Qwen3-0.6B at the revision `c1899de2`. Its model card names the licence. **apache-2.0** [measured] Its configuration names the dtype it was saved in, and the lab runs in `float32`, so it converts what it loads. **bfloat16** [measured] The hub lists the checkpoint's size and its hash, and the course has not fetched the file, so neither is checked. **1503300328** [unverified] **f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b** [unverified]

Nothing on this page is a run of your machine. The grader runs only on your laptop, and the course has run none of the three stages on the pinned weights, so no logit, difference or time on this page was measured. The lab's own page says where each stage stands, in the same words.

The Tests of the third and fifth lessons ask about the first and second lessons for now; their own questions are being written.

Credit follows the same line. The module is browser-complete when the lessons' Tests and the graded levels of Tensor views are credited. It is complete when the lab's receipts are credited as well, and a Prove run with the agent closed is on record.

> **Build.** The lab `tr0.forward` (lane L), stages `s1`, `s2`, `s3`. The lab page grades it.

> **Card.** The notional-machine card `tensor`.

## Lessons

- [PyTorch in Rust terms: storage, shape, strides, dtype, device](l1-pytorch-in-rust-terms.md): lesson `tr0.l1`, about 45 minutes [estimated]
- [Views, copies, and the syncs you cannot see](l2-views-copies-and-hidden-syncs.md): lesson `tr0.l2`, about 50 minutes [estimated]
- [nn.Module as a struct: Qwen3's forward in the pinned transformers](l3-nn-module-as-a-struct.md): lesson `tr0.l3`, about 20 minutes [estimated]
- [Reading Triton: grids, programs, BLOCK and masks](l4-reading-triton.md): lesson `tr0.l4`, about 50 minutes [estimated]
- [Engine-style model code: Mini-SGLang's Qwen3, and vLLM's MRV2 Triton files](l5-engine-style-model-code.md): lesson `tr0.l5`, about 20 minutes [estimated]

## Claims cited

- `qwen3.config.stored-dtype`: The configuration names bfloat16 as the dtype the model was saved in. The lab runs the forward in float32, so it converts what it loads. Value bfloat16 [measured], checked 2026-11-20 (source: Qwen/Qwen3-0.6B at c1899de2, config.json, torch_dtype <https://huggingface.co/Qwen/Qwen3-0.6B/resolve/c1899de289a04d12100db370d81485cdf75e47ca/config.json#L25>, read 2026-11-20).
- `qwen3.revision.licence`: The model card names the licence apache-2.0. Value apache-2.0 [measured], checked 2026-11-20 (source: Hugging Face, Qwen/Qwen3-0.6B (JSON API) <https://huggingface.co/api/models/Qwen/Qwen3-0.6B>, read 2026-11-20).
- `qwen3.weights.bytes`: The hub lists model.safetensors at that revision as 1503300328 bytes. The course has not fetched the file, so the size is unverified until the file has been downloaded and measured. Value 1503300328 [unverified], checked 2026-11-20 (source: Hugging Face, Qwen/Qwen3-0.6B at c1899de2, file sizes (JSON API) <https://huggingface.co/api/models/Qwen/Qwen3-0.6B/revision/c1899de289a04d12100db370d81485cdf75e47ca?blobs=true>, read 2026-11-20).
- `qwen3.weights.sha256`: The hub lists the SHA-256 of model.safetensors at that revision as f47f7117…6874b. The course has not fetched the file, so the hash is unverified until the file has been downloaded and hashed. Value f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b [unverified], checked 2026-11-20 (source: Hugging Face, Qwen/Qwen3-0.6B at c1899de2, file hashes (JSON API) <https://huggingface.co/api/models/Qwen/Qwen3-0.6B/revision/c1899de289a04d12100db370d81485cdf75e47ca?blobs=true>, read 2026-11-20).
