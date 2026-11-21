---
id: tr0
title: PyTorch for the Rust-first, and reading Triton
status: review
hours: 7                          # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 4, L: 3 }     # [estimated]
outcomes:
  - Read a tensor's strides, and tell a view from a copy
  - Find the calls in PyTorch code that make the CPU wait for the GPU
  - Read an nn.Module as a struct, and map a checkpoint's tensor names onto the code that consumes them
  - Write Qwen3-0.6B's forward pass in plain PyTorch on a CPU, without a KV cache and with one, and match the reference
  - Read a Triton kernel's grid, programs, BLOCK and masks, and say which elements each program touches
outcome_kcs:
  - ['tr0.tensor-metadata', 'tr0.view-vs-copy', 'tr0.broadcast-stride-zero']
  - ['tr0.hidden-syncs']
  - ['tr0.module-as-struct']
  - ['tr0.decoder-forward', 'tr0.kv-cache-contract']
  - ['tr0.triton-program-model', 'tr0.triton-masks']
artifacts:
  - id: shape-shifter
    lane: B
    title: Tensor layout levels and item families, graded on fresh seeds
  - id: tr0.forward
    lane: L
    title: "A Qwen3 forward pass on the laptop's CPU that matches Hugging Face, graded by the local grader"
worlds: [tensor]                  # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T5.L1, ks:T0.L3, ks:T0.L4]
pins: [torch, transformers, triton, python, qwen3-0.6b]
lanes: [B, L]
games: [shape-shifter]
labs: [tr0.forward]
---

The engines in this course are Python on top of PyTorch, and this module teaches you to read what their code does to a tensor the way you already read a Rust slice. TR0 helps before TR1 and locks nothing: the course starts at the first lesson of TR1, and you can come here first, or come back when the engines' Python reads hard.

Most of what engine code does to a tensor is bookkeeping over a buffer: a shape, strides, an offset, a dtype and a device. The module ends on the Triton kernels that the engines launch on those tensors. TR0 is the course's primer for a Rust-first engineer, and it teaches what reading vLLM and SGLang needs and nothing more. {{ks:T5.L1}} drew the forward pass as data moving through memory, and here you read the same pass in PyTorch code.

## The browser part

The browser part is five lessons and a game, and none of it needs a GPU. The first lesson is published, and the other four are not yet.

1. PyTorch in Rust terms: storage, shape, strides, dtype, device.
2. Views, copies, and the syncs you cannot see.
3. `nn.Module` as a struct: Qwen3's forward in the pinned transformers.
4. Reading Triton: grids, programs, `BLOCK` and masks.
5. Engine-style model code: Mini-SGLang's Qwen3, and vLLM's own Triton kernels.

TR0's five lessons are five separate subjects: a tensor's layout, the calls that wait for the GPU, a model's code, Triton's programs and an engine's own model code. So no lesson carries a table of what changed since the one before, and no one relation runs through them all.

The game is Tensor views (`shape-shifter`). Each level draws a tensor as its cells, a table of its shape and strides, and the buffer under them, and you plan the reshape: which calls, in which order, and where the one copy goes. A view moves the numbers among the cells and leaves the buffer still, and a copy lays a new buffer under the old one. Three levels are practice: a transpose, an `expand`, and the split of a projection into one block per head. Two are graded and draw fresh tensors each time: Fewest copies, which asks for each of three new targets with as few copies as the reference, and A grid of programs, which asks you to cover a tensor with a Triton grid that masks as few lanes as the reference. Every tensor in the game is synthetic, drawn by the course's model of PyTorch's view rules, and PyTorch itself is the judge. Each lesson ends in a Test on fresh numbers, so recognizing last time's answer earns nothing.

Prove: Tensor views' Fewest copies, in Prove mode, on three new targets with your coding agent closed. Once the lab is published and your receipt is verified, Prove adds questions that only the shapes and strides your own forward recorded can answer.

## The part on your laptop

The laptop part is a lab: Qwen3-0.6B's forward pass, written in plain PyTorch and run on your laptop's CPU, first without a KV cache and then with one. The lab runs on your laptop's CPU, outside the browser, and needs no GPU. The course's grader runs Hugging Face transformers on the same CPU, in `float32`, and compares your logits with its own. The bar is a largest difference of 0.001 [estimated] in any logit. The lab is not published yet, so this page shows what it asks and grades nothing.

Credit follows the same line. The module is browser-complete when the lessons' Tests and the graded levels of Tensor views are credited. It is complete when the lab's receipts are credited as well, and a Prove run with the agent closed is on record.

:::lab
id: tr0.forward
lane: L
stages: [s1, s2, s3]
:::

:::card
kind: notional-machine
id: tensor
:::
