---
id: tr0.l2
module: tr0
title: "Views, copies, and the syncs you cannot see"
minutes: 50                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr0.view-vs-copy, tr0.hidden-syncs]
builds_on: [ks:T5.L3, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [shape-shifter]
---

An attention kernel reads each head's keys as one block, laid out as `[heads, tokens, head size]`. The projection that makes the keys returns `[tokens, heads · head size]`. Lay that output out as one block per head, with the fewest copies.

:::predict
id: tr0.l2.p1
prompt: The level's projection output has shape (4, 8) [synthetic], and the reference splits it into heads and then brings the head dimension first. After that permute, how far apart in the buffer are two neighbouring tokens of one head?
answer: { kind: numeric, unit: addresses, rel_tol: 0 }
reveal: after-game
kcs: [tr0.view-vs-copy]
:::

:::game
id: shape-shifter
level: three-d
mode: practice
:::

## Where engines copy

You just turned a `(4, 8)` projection output into one contiguous block per head. Here is the reference's run, a line for each step, with the elements it moved. Printed by the course's model on 2026-11-21 at `0dc2dcc`.

| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |
|---|---|---|---|
| the start | `(4, 8)` | `(8, 1)` | 0 |
| `reshape([4, 2, 4])` | `(4, 2, 4)` | `(8, 4, 1)` | 0 |
| `permute(1, 0, 2)` | `(2, 4, 4)` | `(4, 8, 1)` | 0 |
| `contiguous()` | `(2, 4, 4)` | `(16, 4, 1)` | 32 |

The split into heads moved nothing, because the eight columns already hold two heads of four side by side. The `permute` moved nothing either: it swapped the strides of the tokens and the heads, and the buffer held still. After it the tensor reads head by head and is no longer contiguous, because the buffer is still laid out token by token. Two neighbouring tokens of one head are `8` addresses apart [synthetic], a whole projection row, and that is the answer to the guess.

A kernel that loads one head's keys as a block wants that block in one run of the buffer, and the permuted tensor has none. `contiguous()` writes it: all 32 elements move [synthetic], and each head becomes one run of `16` elements, the first stride of the result. The reshaping was free, and the layout the kernel needs cost one copy at the end of it.

The pinned `transformers` does the same in Qwen3's attention. It reshapes each projection with `view` into `(batch, tokens, heads, head size)` and swaps two dimensions with `transpose(1, 2)`, and both are views. {{claim:transformers.qwen3.attn-views}} The attention function then swaps the heads and the tokens back and makes the result contiguous, and that is where the copy is made. {{claim:transformers.qwen3.attn-fn-contiguous}} The layer's own `reshape(...).contiguous()` before the output projection finds a tensor already in one run, so it is a view and moves nothing. {{claim:transformers.qwen3.attn-contiguous}} The copy comes after the free steps and not between them.

`view` and `reshape` differ in what they say when a copy is needed. A `view` of a shape the strides cannot express is refused, as the first lesson showed. `reshape` returns a view where the shape fits and a copy where it does not, and the page of the pinned PyTorch says that code should not rely on which of the two it got. {{claim:torch.views.reshape-unspecified}} So a `reshape` in model code can hide a copy that a `view` would have refused loudly. Neither tells you the copy is there: the strides do.

:::card
kind: isomorphism
title: A spawn and a join
body: "A GPU call is like spawning a thread: the call returns at once, and the work runs somewhere else. A sync is like joining it: the caller blocks until the work is done. Code that never joins runs ahead of the work and knows nothing of what has finished."
breaks: "A join waits for the one thread it belongs to, and you write it yourself. A sync waits for the work that was queued on the GPU before it, and it hides inside calls that do not read like waiting, such as item and tolist. Finding those calls is this lesson's second half."
:::

Check which calls copy on a tensor of three dimensions before you read on.

:::item
family: tr0.view-or-copy
level: 2
count: 1
:::

## The syncs you cannot see

A copy has a second price when the tensor lives on a GPU. GPU operations are asynchronous by default. {{claim:torch.cuda.async-by-default}} A call that uses the GPU enqueues its operations on the device, and the device does not necessarily run them until later. {{claim:torch.cuda.enqueued}} So `y = x.sum()` on a GPU tensor returns before the sum is done, and the Python that follows runs while the GPU works.

A **sync** is a call that makes the CPU wait until the GPU has finished the work queued before it. Engine code is full of lines that look like plain Python and are syncs. Commit to a count first.

:::predict
id: tr0.l2.p2
prompt: "x is a tensor on a GPU. How many of these four lines wait for the GPU: y = x.sum(), n = x.sum().item(), ids = x.tolist() and small = x.cpu()?"
answer: { kind: numeric, unit: lines, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.hidden-syncs]
:::

Here is what each call does, from the pinned PyTorch's documents. These lines wait, because each brings a value or a tensor back from the GPU to the CPU, or asks to wait:

- `n = x.item()`. PyTorch names `.item()` as a call that synchronizes the CPU with the GPU. {{claim:torch.cuda.item-synchronizes}}
- `ids = x.tolist()`. The tensor is moved to the CPU first. {{claim:torch.tolist.moves-to-cpu}}
- `small = x.cpu()`. It returns a copy in CPU memory, and a copy off a GPU is a transfer that waits. {{claim:torch.cpu.copies}}
- `torch.cuda.synchronize()`. It waits for all kernels in all streams on the device to complete. {{claim:torch.cuda.synchronize-waits}}

These lines do not wait, because they only queue work or move no data:

- `y = x.sum()`. The sum is enqueued, and the line returns before it is done. {{claim:torch.cuda.enqueued}}
- `z = x @ w`. A GPU operation, so asynchronous by default. {{claim:torch.cuda.async-by-default}}
- `v = x.view(-1)`. A view moves no data, so there is nothing to wait for. {{claim:torch.views.no-data-moves}}

A copy to the CPU can ask not to wait: `to()` and `copy_()` take a `non_blocking` argument, which lets the caller skip the synchronization when it is not needed. {{claim:torch.cuda.non-blocking}} Without it, `x.to('cpu')` waits as `x.cpu()` does.

The same calls decide how a GPU run is timed. A time measured with no synchronization is not accurate, because the clock stops when the work is queued and not when it is done. {{claim:torch.cuda.timing-needs-sync}} A timer around a GPU call needs a sync before it reads the clock, and that sync is one the program meant.

A loop multiplies a sync by its passes. Count the waits in this one:

```python
for layer in range(24):
    h = block(h)
    n = h.sum().item()
done = h.tolist()
```

Each pass waits once, at `.item()`, and `.tolist()` after the loop waits once more. So the loop waits `25` times [derived]. The `block(h)` and the `.sum()` wait for nothing.

PyTorch can report a sync: `torch.cuda.set_sync_debug_mode` can make it warn, or raise an error, when an operation synchronizes. {{claim:torch.cuda.sync-debug-warns}} The mode is experimental, and not all synchronizing operations trigger it, so a quiet run does not show that no call waited. {{claim:torch.cuda.sync-debug-partial}} Reading the lines is the check that does not depend on it.

Printing a GPU tensor is not in the table. The pages the course read do not say that it waits for the GPU, so it is not stated here as a fact, and no question in this module depends on it [unverified]. {{claim:torch.cuda.print-waits}}

This lesson says which lines wait. It does not say what a wait costs. A sync costs time only while the GPU still has queued work to finish, and measuring that is the work of TR3.

## Exit check

The level draws three new targets, and each is to be reached with as few copies as the reference. Three questions follow on new lines: which line waits for the GPU, how many times a loop waits, and what a chain of calls does to a tensor of three dimensions.

:::game
id: shape-shifter
level: fewest
mode: graded
:::

:::item
family: tr0.find-the-sync
level: 1
count: 2
:::

:::item
family: tr0.view-or-copy
level: 2
count: 1
:::
