---
id: tensor
kind: notional-machine
title: The tensor world
world: tensor
status: draft
---

The notional machine behind Tensor views (`shape-shifter`): `packages/sim/tensor`. It holds a tensor as a buffer that is read through an offset, a shape and a stride for each dimension, searches for the fewest copies that reach a layout, and counts what a Triton-style grid covers. Its view rules follow `torch` and its grid rules follow `triton`, each at the version that `course.lock.json` pins. The real engine is authoritative: when it disagrees with this card, the card is wrong. Here the real thing is the two libraries the model follows.

## Models

1. **A buffer and a way of reading it.** The buffer is flat memory, and a tensor is an offset into it, a shape and one stride for each dimension. A stride is how far in the buffer one step along its dimension moves, so the address of an element is the offset plus each index times its stride. The model names every element by the address it has in the start's buffer, and so it can say where an element went. {{claim:torch.stride.definition}}
2. **A view moves nothing.** `transpose`, `permute`, `expand`, a slice with a step and a `view` all change the offset, the shape and the strides, and leave the buffer where it is. The model's buffer is never changed by a view. A view of a contiguous tensor can be a tensor that is not contiguous. {{claim:torch.view.shares-data}} {{claim:torch.views.no-data-moves}} {{claim:torch.views.view-ops}} {{claim:torch.views.can-be-noncontiguous}}
3. **When a view is refused.** `view` to a new shape works when each new dimension lies inside one old dimension, or spans old dimensions whose strides chain, and fails otherwise. The model reports the failure as `not-viewable`. `reshape` is a view where `view` would work and a copy where it would not, which is why model code is written with `reshape`. {{claim:torch.view.needs-compatible-strides}} {{claim:torch.view.otherwise-copy}} {{claim:torch.reshape.view-if-compatible}} {{claim:torch.view.prefer-reshape}}
4. **Contiguous.** A tensor is contiguous when its elements lie in the buffer in the order of their indices with no gap, and a dimension of size one has no say. `contiguous()` on a contiguous tensor copies nothing, and on any other writes a new buffer with every element. {{claim:torch.contiguous.returns-self}} {{claim:torch.views.contiguous-copies}}
5. **Expand is stride zero.** `expand` gives a dimension of size one a larger size by setting its stride to zero, so every index along it reads the same addresses and no memory is allocated. A tensor with a stride of zero over more than one element has internal overlap, and the model says so. {{claim:torch.expand.stride-zero}} {{claim:torch.expand.one-address}}
6. **A plan costs its copies.** The cost of a plan is the number of operations that copy, and the elements a copy moves are reported beside it, the rule of GAMES.md §4.3. A slice and a reshape that is a view cost nothing.
7. **The ghost.** The reference plan for a target is a breadth-first search over the operations, up to `DEFAULT_MAX_OPS` deep, on a tensor of at most `MAX_PLAN_NUMEL` elements. It returns the plan with the fewest copies, and among those the fewest operations. A target is a shape, the elements in order and whether the tensor must be contiguous at the end, and a seeded target is built from a chain of operations, so it can always be reached (GAMES.md §4.8).
8. **A grid of programs.** One program covers one BLOCK-sized tile of the tensor. The program with grid index `p` covers, along a dimension, the lanes from `p * BLOCK` up to `p * BLOCK + BLOCK - 1`, and a lane whose offset is not below the size of the dimension is masked: a masked lane neither loads nor stores. {{claim:triton.program-id}} {{claim:triton.load-mask}} {{claim:triton.store-mask}}
9. **How many programs.** The default grid has `cdiv(n, BLOCK)` programs along a dimension of size `n`, the ceiling of the division. A grid with fewer leaves the end of the tensor uncovered, and a grid with that many covers every element exactly once, because tiles do not overlap. {{claim:triton.cdiv-device}} {{claim:triton.cdiv-host}}
10. **BLOCK is a power of two.** A kernel makes its lanes with `tl.arange(0, BLOCK)`, which accepts only a size that is a power of two, and BLOCK is a compile-time constant. The model counts a grid with another BLOCK anyway, and says that the size is not a power of two, so the game can show why it is refused. {{claim:triton.arange-range-check}} {{claim:triton.constexpr}}
11. **The program cap.** The `grid` level limits how many programs a launch may have, so that a BLOCK of one, which masks nothing, is not the best answer. The cap is the level's design and not Triton's (GAMES.md §4.3).
12. **Invariants.** A view never changes the buffer. `contiguous()` on a contiguous tensor copies nothing. `expand` gives stride zero. A grid's coverage counts each element at most once, and exactly once when the grid is at least `cdiv` on each dimension. The same seed gives the same result (GAMES.md §4.8).

## Ignores

- **Data types.** An element is a cell with an address. The model has no bytes, no alignment and no dtype conversion, so it cannot say that `.to(dtype)` copies.
- **Devices.** A tensor is on no device here. A copy between devices, and the calls that wait for the GPU, belong to the `find-the-sync` questions, which read their own rule table, and not to this world.
- **Negative strides, and `-1` in a shape.** PyTorch has no negative strides either, and the game's pickers give sizes, so a `-1` is never typed.
- **Advanced indexing, and every operation the game does not offer.** An index by a list of positions copies in PyTorch, and the model has no such operation. Memory formats other than the contiguous one are absent too.
- **Writes.** The model never writes through a view, so it does not show that a write to an expanded tensor changes many elements. The card says it, and the part for stride zero says it.
- **What a kernel costs.** The grid counts programs, lanes and masks. It says nothing about warps, memory coalescing, occupancy or the time a program takes.
- **Triton's own execution.** No kernel runs. The model's grid is the arithmetic of one program's tile, and the interpreter that runs a real kernel on the CPU is a separate thing.
- **Tensors above the search's limit.** The ghost searches tensors of up to `MAX_PLAN_NUMEL` elements, and the game's bands stay under it.

## Calibrated against

- **PyTorch's own answers for the view rules.** `tests/fixtures/tensor/torch-vectors.json` holds the shapes, strides, offsets and shared storage that the pinned `torch` on the CPU gave for thousands of cases, written by a script in the locked CPU environment, and a test replays each one through the model.
- **Triton's interpreter, for two launches.** The grid's counts are arithmetic and are held to their formulas. A run of the course's kernel in Triton's interpreter wrote what the grid model counts for two launches, and no compiled run has been compared with them.
- **The model's own invariants,** which its tests check on seeded cases, and the ghost's agreement with an independent search on small tensors.
