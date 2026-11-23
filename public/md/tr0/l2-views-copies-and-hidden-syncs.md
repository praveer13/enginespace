# Views, copies, and the syncs you cannot see

_PyTorch for the Rust-first, and reading Triton · lesson `tr0.l2` · review · about 50 minutes [estimated]_

Builds on kernelspace: `ks:T0.L3`, `ks:T5.L1`.

Knowledge components: `tr0.view-vs-copy`, `tr0.hidden-syncs`.

A kernel is a function that runs on the GPU. An attention kernel reads each head's keys as one block, laid out as `[heads, tokens, head size]`. The projection that makes the keys returns `[tokens, heads · head size]`. Lay that output out as one block per head, with the fewest copies.

> **Predict `tr0.l2.p1`.** The level's projection output has shape (4, 8) [synthetic], and the reference splits it into heads and then brings the head dimension first. After that permute, how far apart in the buffer are two neighbouring tokens of one head?
>
> The learner commits to a number in `addresses`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Play.** The game `shape-shifter`, level `three-d`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Where engines copy

The level turns a `(4, 8)` projection output into one contiguous block per head. Here is the reference's run, a line for each step, with the elements it moved. Printed by the course's model on 2026-11-21 at `0dc2dcc`.

| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |
|---|---|---|---|
| the start | `(4, 8)` | `(8, 1)` | 0 |
| `reshape([4, 2, 4])` | `(4, 2, 4)` | `(8, 4, 1)` | 0 |
| `permute(1, 0, 2)` | `(2, 4, 4)` | `(4, 8, 1)` | 0 |
| `contiguous()` | `(2, 4, 4)` | `(16, 4, 1)` | 32 |

The split into heads moved nothing, because the eight columns already hold two heads of four side by side. The `permute` moved nothing either: it swapped the strides of the tokens and the heads, and the buffer held still. After it the tensor reads head by head and is no longer contiguous, because the buffer is still laid out token by token. Two neighbouring tokens of one head are `8` addresses apart [synthetic], a whole projection row, and that is the answer to the guess.

A kernel that loads one head's keys as a block wants that block in one run of the buffer, and the permuted tensor has none. `contiguous()` writes it: all 32 elements move [synthetic], and each head becomes one run of `16` elements, the first stride of the result. The reshaping was free, and the layout the kernel needs cost one copy at the end of it.

The pinned `transformers` does the same in Qwen3's attention. It reshapes each projection with `view` into `(batch, tokens, heads, head size)` and swaps two dimensions with `transpose(1, 2)`, and both are views. **view, then transpose(1, 2)** [measured] The batch counts the prompts run together, and the level leaves it out. The attention function then swaps the heads and the tokens back and makes the result contiguous, and that is where the copy is made. **transpose(1, 2), then contiguous** [measured] The layer's own `reshape(...).contiguous()` before the output projection finds a tensor already in one run, so it is a view and moves nothing. **reshape, then contiguous** [measured] The copy comes after the free steps and not between them.

`view` and `reshape` differ in what they say when a copy is needed. A `view` of a shape the strides cannot express is refused, as the first lesson showed. `reshape` returns a view where the shape fits and a copy where it does not, and the page of the pinned PyTorch says that code should not rely on which of the two it got. **do not rely on which** [measured] So a `reshape` in model code can hide a copy that a `view` would have refused loudly. Neither tells you the copy is there: the strides do.

Check which calls copy on a tensor of three dimensions before you read on.

> **Practice.** Items from the generator family `tr0.view-or-copy`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## The syncs you cannot see

A copy has a second price when the tensor lives on a GPU. GPU operations are asynchronous by default. **asynchronous by default** [measured] A call that uses the GPU enqueues its operations on the device, and the device does not necessarily run them until later. **enqueued, not run** [measured] A queue that holds such work on the GPU is called a stream. So `y = x.sum()` on a GPU tensor returns before the sum is done, and the Python that follows runs while the GPU works.

A **sync** is a call that makes the CPU wait until the GPU has finished the work queued before it. Engine code is full of lines that look like plain Python and are syncs. Commit to a count first.

> **Predict `tr0.l2.p2`.** x is a tensor on a GPU. How many of these four lines wait for the GPU: y = x.sum(), n = x.sum().item(), ids = x.tolist() and small = x.cpu()?
>
> The learner commits to a number in `lines`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Here is what each call does, from the pinned PyTorch's documents. These lines wait, because each brings a value or a tensor back from the GPU to the CPU, or asks to wait:

- `n = x.item()`. PyTorch names `.item()` as a call that synchronizes the CPU with the GPU. **.item() synchronizes** [measured]
- `ids = x.tolist()`. The tensor is moved to the CPU first. **moved to the CPU first** [measured]
- `small = x.cpu()`. It returns a copy in CPU memory, and a copy off a GPU is a transfer that waits. **a copy in CPU memory** [measured]
- `torch.cuda.synchronize()`. It waits for all kernels in all streams on the device to complete. **waits for every kernel** [measured]

These lines do not wait, because they only queue work or move no data:

- `y = x.sum()`. The sum is enqueued, and the line returns before it is done. **enqueued, not run** [measured]
- `z = x @ w`. A GPU operation, so asynchronous by default. **asynchronous by default** [measured]
- `v = x.view(-1)`. A view moves no data, so there is nothing to wait for. **a view moves no data** [measured]

> **A spawn and a join.** A GPU call is like spawning a thread: the call returns at once, and the work runs somewhere else. A sync is like joining it: the caller blocks until the work is done. Code that never joins runs ahead of the work and knows nothing of what has finished.
>
> Where it breaks: A join waits for the one thread it belongs to, and you write it yourself. A sync waits for the work that was queued on the GPU before it, and it hides inside calls that do not read like waiting, such as item and tolist.

A copy to the CPU can ask not to wait: `to()` and `copy_()` take a `non_blocking` argument, which lets the caller skip the synchronization when it is not needed. **non_blocking skips the wait** [measured] Without it, `x.to('cpu')` waits as `x.cpu()` does.

The same calls decide how a GPU run is timed. A time measured with no synchronization is not accurate, because the clock stops when the work is queued and not when it is done. **timing without a wait is wrong** [measured] A timer around a GPU call needs a sync before it reads the clock, and that sync is one the program meant.

A loop multiplies a sync by its passes. Count the waits in this one:

```python
for layer in range(24):
    h = block(h)
    n = h.sum().item()
done = h.tolist()
```

The loop's 24 passes [estimated] are arbitrary: they stand for a model's layers, and no model's count is meant.

Each pass waits once, at `.item()`, and `.tolist()` after the loop waits once more. So the loop waits `25` times [derived]. The `block(h)` and the `.sum()` wait for nothing.

PyTorch can report a sync: `torch.cuda.set_sync_debug_mode` can make it warn, or raise an error, when an operation synchronizes. **warn or error on a sync** [measured] The mode is experimental, and not all synchronizing operations trigger it, so a quiet run does not show that no call waited. **not every sync is reported** [measured] Reading the lines is the check that does not depend on it.

Printing a GPU tensor is not in the table. The pages the course read do not say that it waits for the GPU, so it is not stated here as a fact, and no question in this module depends on it [unverified]. **not named by the pages read** [unverified]

This lesson says which lines wait. It does not say what a wait costs. A sync costs time only while the GPU still has queued work to finish, and measuring that is the work of TR3.

## Exit check

The level draws three new targets, and each is to be reached with as few copies as the reference. Three questions follow on new lines: which line waits for the GPU, how many times a loop waits, and what a chain of calls does to a tensor of three dimensions.

> **Play.** The game `shape-shifter`, level `fewest`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Practice.** Items from the generator family `tr0.find-the-sync`, level `1`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr0.view-or-copy`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `torch.cpu.copies`: Tensor.cpu returns a copy of the tensor in CPU memory, and returns the tensor itself when it is already there. The copy off a GPU is a transfer that waits. Value a copy in CPU memory [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, torch.Tensor.cpu <https://docs.pytorch.org/docs/2.14/generated/torch.Tensor.cpu.html>, read 2026-11-20).
- `torch.cuda.async-by-default`: GPU operations are asynchronous by default. Value asynchronous by default [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution <https://docs.pytorch.org/docs/2.14/notes/cuda.html#asynchronous-execution>, read 2026-11-20).
- `torch.cuda.enqueued`: A call that uses the GPU enqueues its operations on the device, which does not necessarily run them until later. A line such as x.sum() on a GPU tensor therefore returns before the sum is done. Value enqueued, not run [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution <https://docs.pytorch.org/docs/2.14/notes/cuda.html#asynchronous-execution>, read 2026-11-20).
- `torch.cuda.item-synchronizes`: The page names .item() as an example of an operation that synchronizes the CPU with the GPU, and says such operations are not allowed while a CUDA graph is captured. Value .item() synchronizes [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, CUDA Graphs <https://docs.pytorch.org/docs/2.14/notes/cuda.html#cuda-graphs>, read 2026-11-20).
- `torch.cuda.non-blocking`: to() and copy_() take a non_blocking argument, which lets the caller bypass the synchronization when it is not needed. Value non_blocking skips the wait [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution <https://docs.pytorch.org/docs/2.14/notes/cuda.html#asynchronous-execution>, read 2026-11-20).
- `torch.cuda.print-waits`: None of the PyTorch 2.14 pages read for this module says that printing a GPU tensor waits for the GPU. The reading that it does follows from the rule that a copy between the GPU and the CPU synchronizes, and the course has not read it anywhere as a statement. The course asks no question that depends on it. Value not named by the pages read [unverified], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution <https://docs.pytorch.org/docs/2.14/notes/cuda.html#asynchronous-execution>, read 2026-11-20).
- `torch.cuda.sync-debug-partial`: The sync debug mode is experimental, and not all synchronizing operations trigger its warning or error, so a quiet run does not show that no call waited. Value not every sync is reported [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, torch.cuda.set_sync_debug_mode <https://docs.pytorch.org/docs/2.14/generated/torch.cuda.set_sync_debug_mode.html>, read 2026-11-20).
- `torch.cuda.sync-debug-warns`: torch.cuda.set_sync_debug_mode can make PyTorch warn, or raise an error, on a synchronizing operation. Value warn or error on a sync [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, torch.cuda.set_sync_debug_mode <https://docs.pytorch.org/docs/2.14/generated/torch.cuda.set_sync_debug_mode.html>, read 2026-11-20).
- `torch.cuda.synchronize-waits`: torch.cuda.synchronize waits for all kernels in all streams on a CUDA device to complete. Value waits for every kernel [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, torch.cuda.synchronize <https://docs.pytorch.org/docs/2.14/generated/torch.cuda.synchronize.html>, read 2026-11-20).
- `torch.cuda.timing-needs-sync`: Because GPU work is asynchronous, a time measurement without a synchronization is not accurate, so timing a GPU call needs a wait first. Value timing without a wait is wrong [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, CUDA semantics, Asynchronous execution <https://docs.pytorch.org/docs/2.14/notes/cuda.html#asynchronous-execution>, read 2026-11-20).
- `torch.tolist.moves-to-cpu`: Tensor.tolist moves a tensor to the CPU first if necessary. A copy between the GPU and the CPU is a call that waits. Value moved to the CPU first [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, torch.Tensor.tolist <https://docs.pytorch.org/docs/2.14/generated/torch.Tensor.tolist.html>, read 2026-11-20).
- `torch.views.no-data-moves`: Making a view moves no data: the view only changes how the same data is read. Value a view moves no data [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, Tensor Views <https://docs.pytorch.org/docs/2.14/tensor_view.html>, read 2026-11-20).
- `torch.views.reshape-unspecified`: reshape(), reshape_as() and flatten() can return either a view or a new tensor, and the page says that code should not rely on which. Value do not rely on which [measured], checked 2026-11-20 (source: PyTorch 2.14 documentation, Tensor Views <https://docs.pytorch.org/docs/2.14/tensor_view.html>, read 2026-11-20).
- `transformers.qwen3.attn-contiguous`: After the attention function, the layer reshapes its output to (batch, tokens, heads times head size) and calls contiguous before the output projection. Value reshape, then contiguous [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L270>, read 2026-11-20).
- `transformers.qwen3.attn-fn-contiguous`: The attention function ends by swapping the heads and the tokens back with transpose(1, 2) and making the result contiguous, so the tensor the layer then reshapes is already in one run. Value transpose(1, 2), then contiguous [measured], checked 2026-11-21 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, eager_attention_forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L197>, read 2026-11-21).
- `transformers.qwen3.attn-views`: The attention reshapes each projection with view into (batch, tokens, heads, head size) and swaps the first two inner dimensions with transpose(1, 2). Both are views. Value view, then transpose(1, 2) [measured], checked 2026-11-20 (source: transformers v5.19.0, models/qwen3/modeling_qwen3.py, Qwen3Attention.forward <https://github.com/huggingface/transformers/blob/v5.19.0/src/transformers/models/qwen3/modeling_qwen3.py#L244-L246>, read 2026-11-20).
