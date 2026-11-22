---
id: tr0.l1
module: tr0
title: "PyTorch in Rust terms: storage, shape, strides, dtype, device"
minutes: 45                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr0.tensor-metadata, tr0.view-vs-copy, tr0.broadcast-stride-zero]
builds_on: [ks:T0.L3, ks:T0.L4, ks:t0.stride-traversal, ks:t0.data-layout]
status: review                    # draft | review | live
lanes: [B]
games: [shape-shifter]
---

In Rust, a slice `&v[a..b]` is a pointer, a length and a stride of one that nobody writes down: the next element is always one place further on. A PyTorch tensor is the same idea with the stride written down, one for each dimension:

- A **tensor** is a **buffer** of **elements**, PyTorch's storage, read through an offset, a shape and one **stride** for each dimension.
- A stride is how far in the buffer one step along its dimension moves. It counts elements, not bytes.
- A contiguous tensor's elements sit in the buffer row by row, in the order of their indices.
- A **view** is a new tensor that reads another tensor's buffer through new metadata. `transpose` and `view` make views.
- A **copy** writes a new buffer, with every element moved into it. `contiguous()` makes one when the tensor is not contiguous, and `reshape` makes a view where it can and a copy where it cannot.

The level draws the tensor's cells, a table of its shape and strides beside them, and the buffer under the cells. The target counts the elements in place: those that already sit where the target reads them. Turn the tensor so that it reads column by column.

:::predict
id: tr0.l1.p1
prompt: The level's tensor has shape (4, 6) [synthetic], and the reference reads it column by column, as one row, with one copy. How many elements will that copy move?
answer: { kind: numeric, unit: elements, rel_tol: 0 }
reveal: after-game
kcs: [tr0.view-vs-copy]
:::

:::game
id: shape-shifter
level: views
mode: practice
:::

## What the transpose did

The level asks for a `(4, 6)` tensor read column by column. The reference's first move, `transpose(0, 1)`, moved nothing: the buffer under the cells held still, and only the table beside it changed. Here is the reference's run, a line for each step. Printed by the course's model on 2026-11-21 at `c83faee`.

| After | Shape [synthetic] | Strides [synthetic] | Contiguous | Elements moved [synthetic] |
|---|---|---|---|---|
| the start | `(4, 6)` | `(6, 1)` | yes | 0 |
| `transpose(0, 1)` | `(6, 4)` | `(1, 6)` | no | 0 |
| `reshape([24])` | `(24,)` | `(1,)` | yes | 24 |

The buffer is what the title calls storage: one flat run of elements. The shape and the strides are the way it is read. Element `(i, j)` of the start sits at address `6 * i + 1 * j`, so one step to the next row skips six elements and one step along a row moves one. A transpose swaps two sizes and their two strides, and does nothing else. After it, element `(i, j)` sits at `1 * i + 6 * j`: the same buffer, read column by column. Making a view moves no data. {{claim:torch.views.no-data-moves}}

The transposed tensor is not contiguous. Read in the order of its indices, it walks the buffer 0, 6, 12, 18, then back to 1 [synthetic]. A view of a contiguous tensor can be one that is not. {{claim:torch.views.can-be-noncontiguous}}

That is why `view([24])` on it is refused. One dimension of 24 elements needs one stride, a fixed step from each element to the next, and no single step walks 0, 6, 12, 18, 1 [synthetic].

PyTorch's rule for a view has two cases. Each new dimension must lie inside one old dimension, or span old dimensions whose strides chain. {{claim:torch.view.needs-compatible-strides}} Two neighbouring dimensions chain when the outer one's stride is the inner one's size times the inner one's stride. One step along the outer dimension then lands just past a full run of the inner one, so the pair reads the buffer as one run, with the inner stride.

| Tensor | Outer stride [derived] | Inner size times inner stride [derived] | Chain | `view([24])` |
|---|---|---|---|---|
| `(4, 6)`, strides `(6, 1)` | `6` | `6 * 1 = 6` | yes | a view, stride `1` |
| `(6, 4)`, strides `(1, 6)`, after the transpose | `1` | `4 * 6 = 24` | no | refused |

A new dimension that lies inside one old dimension needs no chain. `view([2, 3, 4])` on the transposed tensor cuts its first dimension of 6 in two and leaves the second alone, so it is a view, with strides `(3, 1, 6)` [derived]. `view([3, 8])` needs its second dimension to span part of the first old dimension and all of the second, and those two do not chain, so it is refused like `view([24])`.

Where the strides do not allow a view, the new shape cannot be had without a copy. {{claim:torch.view.otherwise-copy}} `reshape` makes that copy for you: it returns a view where the shape fits the strides, and a copy where it does not. {{claim:torch.reshape.view-if-compatible}}

A copy moves every element, all 24 of them [synthetic], the first and the last too, although those two land at the address they already had. `contiguous()` is the same copy, made on purpose. It returns the tensor itself when the tensor is contiguous already, and a new buffer when it is not. {{claim:torch.views.contiguous-copies}}

:::card
kind: isomorphism
title: A borrow and a to_vec
body: "In Rust, `&v[a..b]` borrows: it is a new way to read memory that already exists, and making it costs nothing. `v[a..b].to_vec()` allocates and writes every element. A view is the borrow, and a copy is the `to_vec`."
breaks: "A Rust slice always steps by one, so no slice can be a transpose: PyTorch's strides let a view step by any amount, in any dimension. And Rust's borrow checker refuses a write through one reference while another can read. PyTorch has no borrow checker, so a write through a view changes every tensor that reads the same buffer."
:::

A view is free to make. It is not free to read. The transposed tensor's first row is six elements spread across the buffer, six apart, and {{ks:T0.L3}} timed what a walk like that costs next to one that moves one element at a time. The strides say which walk a read makes, and nothing on this page makes the walk faster.

Check which calls move memory before you read on.

:::item
family: tr0.view-or-copy
level: 0
count: 1
:::

## Strides by hand

The address of an element is the offset plus each index times its stride. In Python, the language the engines are written in:

```python
def address(offset, strides, index):
    return offset + sum(
        i * s for i, s in zip(index, strides))

address(0, (6, 1), (2, 3))  # 15
address(0, (1, 6), (2, 3))  # 20, transposed
```

The first line is element `(2, 3)` of the contiguous `(4, 6)` tensor, and the second is the same index after `transpose(0, 1)`.

A contiguous tensor's strides follow from its shape. The last stride is one, and each stride before it is the product of the sizes after it, so `(4, 6)` has strides `(6, 1)` and `(2, 3, 4)` has `(12, 4, 1)`. `x.stride()` returns them, and the stride of a dimension is the jump from one element to the next along it. {{claim:torch.stride.definition}} {{ks:T0.L4}} weighed two layouts of the same records, an array of structs and a struct of arrays. A tensor's strides say which layout its buffer has, and a transpose reads one as the other without moving anything.

Indexing with a slice makes a view, the way `&v[a..b]` does, and indexing with a list of positions makes a copy. {{claim:torch.views.basic-indexing}} Commit to the stride of a slice with a step before you read how it is worked out.

:::predict
id: tr0.l1.p2
prompt: "A contiguous tensor x of shape (3, 5) [estimated] is sliced as y = x[:, ::2], every second column. What is the stride of y's columns?"
answer: { kind: numeric, unit: elements, rel_tol: 0 }
reveal: at-commit
kcs: [tr0.tensor-metadata]
:::

A slice changes the three numbers of its dimension and no others. Its start moves the offset by the start times the stride, its step multiplies the stride, and its length is what is left. So `x[1:, :]` on a `(4, 6)` tensor has offset `6`, shape `(3, 6)` and the same strides, and `x[:, ::2]` keeps the offset and doubles the stride of the columns. Neither moves an element.

A transpose swaps two dimensions, and `permute` puts every dimension where you name it: `x.permute(2, 0, 1)` on strides `(12, 4, 1)` gives `(1, 12, 4)`. Both move the sizes and the strides together, and both are views. {{claim:torch.views.view-ops}}

| Call on a contiguous `(4, 6)` tensor | Offset | Shape | Strides | Moves |
|---|---|---|---|---|
| `x[1:, :]` | `6` | `(3, 6)` | `(6, 1)` | nothing |
| `x[:, ::2]` | `0` | `(4, 3)` | `(6, 2)` | nothing |
| `x.transpose(0, 1)` | `0` | `(6, 4)` | `(1, 6)` | nothing |
| `x.transpose(0, 1).contiguous()` | `0` | `(6, 4)` | `(4, 1)` | every element, into a new buffer |

## Broadcasting is a stride of zero

One stride is left to meet, and it is the strangest. `expand` grows a dimension of size one to a larger size by setting its stride to zero, and allocates no memory. {{claim:torch.expand.stride-zero}} Every index along that dimension reads the same addresses. Make a `(4, 6)` tensor from one row of six, and make it one you can write to.

:::game
id: shape-shifter
level: stride-zero
mode: practice
:::

`expand` gave the row's six elements a second dimension with stride `0`: strides `(0, 1)`, and four rows that are one row read four times. The buffer still holds six cells. More than one element of an expanded tensor may refer to a single memory location. {{claim:torch.expand.one-address}} So a write to the first row would also change the other three, which is why the target asked for a tensor you can write to. `contiguous()` wrote one: 24 elements [synthetic], each row its own.

An expanded tensor is free to make and as cheap to read as the row it repeats. It cannot be written until a copy gives each row elements of its own.

## dtype and device

The shape, the strides and the offset say where an element is. Two more fields say what it is and whose memory holds it.

| Field | What it says | What changing it costs |
|---|---|---|
| dtype | what one element is, and so its size in bytes | a copy, with every element converted |
| device | whose memory holds the buffer: the CPU's or a GPU's | a copy, across the bus between them |

A stride counts elements, so the dtype turns it into bytes. A `torch.float32` element is 32 bits, 4 bytes [derived], and a stride of `6` steps 24 bytes [derived] through a `float32` buffer. `x.to(...)` returns the tensor itself when it already has the dtype and the device asked for, and a copy when it does not, so a move to another device is a copy. {{claim:torch.to.copies}}

A copy across devices costs more than its bytes. The CPU waits for the GPU while it happens, and finding those waits in an engine's Python is the subject of this module's second lesson.

## Exit check

Three questions, on new tensors: two ask for a stride after a slice, a transpose, a `permute` or an `expand`, and one asks what a chain of calls does.

:::item
family: tr0.strides-of
level: 1
count: 2
:::

:::item
family: tr0.view-or-copy
level: 1
count: 1
:::
