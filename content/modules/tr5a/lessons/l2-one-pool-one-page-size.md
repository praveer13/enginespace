---
id: tr5a.l2
module: tr5a
title: "One pool, one page size: vLLM's hybrid manager and its five cases"
minutes: 52                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr5a.page-size-unification]
builds_on: [ks:T5.L5, ks:T1.L4, ks:t1.internal-frag]
status: review                    # draft | review | live
lanes: [B]
games: [pool]
---

The last lesson gave a request three tables, and the three draw from one free queue. A free queue works only if its entries are interchangeable: a page that a sliding group lets go has to be good for a full group, and for a state group. So a block of every group has to be the same number of bytes. This lesson is how vLLM makes that so for the models it serves, and what it costs when the layers do not divide evenly.

## What a page is

A block is the memory reserved for a block's worth of tokens in the layers of one group, and a page is its size in bytes: the layers the block serves, times the tokens in a block, times the bytes that one token needs in one layer. The layers in that product are the group's and not the model's. {{claim:vllm.hybrid-kv.page-size-formula}} The pool has a single page size, so every group has to reach it. {{claim:vllm.hybrid-kv.single-pool}}

In a model of full attention alone there is nothing to reach, because every block serves every layer. In a hybrid the groups are made of different numbers of layers, and a recurrent layer's state is a different quantity from a token's key and value. The planner has to choose the groups so that the products agree. Commit to one prediction, then play `same-size`.

:::predict
id: tr5a.l2.p1
prompt: A model has 12 sliding-window layers and 13 full-attention layers [estimated], and every layer costs the same bytes for a token. The planner gives each group the same number of layers, and pads a group that comes up short. How many KV cache groups does it make of this model?
answer: { kind: numeric, unit: groups, rel_tol: 0 }
reveal: after-game
kcs: [tr5a.page-size-unification]
:::

:::game
id: pool
level: same-size
mode: practice
:::

## The five cases

vLLM's design document walks through five cases, from a toy to the awkward ones. Each is a different answer to one question: what makes the pages of the groups equal?

| Case | The model | How the pages are made equal | What it costs | Level |
|---|---|---|---|---|
| first, the toy | a few layers with the same bytes for a token | a block holds a block's tokens for one layer, and the page is one layer's | an allocator call for each layer | none |
| second, a regular pattern | the same bytes, and a fixed ratio between the kinds | layers that need the same blocks are grouped, and the page is the group's | nothing | `two-kinds` |
| third, no regular pattern | the same bytes, and no ratio | the group size is the smallest layer count of any kind, and a short group is padded | padding layers | `same-size` |
| fourth, different bytes | a recurrent layer's state is much bigger than a token's KV | the attention block grows until it holds a state, and the state is padded to it | a big block, and a padded state | `state` |
| fifth, shared caches | layers that read another layer's cache | they get none of their own | nothing | none |

**The regular pattern.** Calling the allocator once for each layer is fine for a toy and inefficient for a model with many layers, so the second case groups the layers that need the same number of blocks. The document's example has 10 full-attention layers and 20 sliding ones [measured], which is two sliding layers for each full one. It allocates as if the model had one full layer and two sliding ones, and repeats that result for each of the 10 full layers, so that every group has 10 layers and the page is 10 layers' worth [derived]. {{claim:vllm.hybrid-kv.doc-example-blocks}}

**No regular pattern.** Gemma-3-27b has 52 sliding-window layers and 10 full-attention layers [measured]. Grouped by their ratio that is 26 sliding groups and 5 full groups of 2 layers each [measured], too many small groups. {{claim:vllm.hybrid-kv.doc-gemma3-layers}} {{claim:vllm.hybrid-kv.small-groups}} So the planner groups by the smallest layer count among the kinds, which is 10 here [derived]. That is one full group and 6 sliding groups [derived], and 6 groups of 10 layers hold 60 slots for 52 sliding layers, so 8 of them are padding. {{claim:vllm.hybrid-kv.group-size}}

The document draws the padding in the last group, and the code spreads it: group `i` takes every sixth layer from layer `i`, so four groups have 9 layers and 1 of padding, and two have 8 layers and 2 of padding [derived]. {{claim:vllm.hybrid-kv.layer-spread}} {{claim:vllm.hybrid-kv.padding-layers}} The course follows the code, because the code is what runs.

**Different bytes.** A recurrent layer's state can be much bigger than one token's KV in an attention layer, and the pool has one page size. The planner makes the attention block bigger, in multiples of the kernel's block, until one layer's block is at least a layer's state, and it pads the state up to that size. Then it groups as in the third case. {{claim:vllm.hybrid-kv.page-unify}} {{claim:vllm.hybrid-kv.attn-block-inflate}} Commit to one more number before you play `state`.

:::predict
id: tr5a.l2.p2
prompt: A model has 8 attention layers that cost 1,024 bytes a token each [estimated], and 24 recurrent layers whose state is 32,768 bytes each [estimated]. The attention block starts at 16 tokens [estimated] and grows 16 tokens at a time until one layer's block holds a layer's state. How many tokens does the block hold when it stops?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr5a.page-size-unification]
:::

:::game
id: pool
level: state
mode: practice
:::

A layer's block of 16 tokens is 16,384 bytes [derived], half of its state, so the block grows to 32 tokens [derived] and the state fits it exactly. The document says that real hybrids can be far more lopsided: the rule can lead to attention blocks of more than 400 tokens [measured], which it calls too large. {{claim:vllm.hybrid-kv.mamba-block-size-large}} The next lesson shows what a block that big does to a prefix hit, which can end only on a block's edge.

**Shared caches.** Some models, Gemma-3n among them, have layers that read the KV cache of another layer. The manager ignores them, allocates cache only for the layers that need it, and the model runner applies the result to the layers that share. {{claim:vllm.hybrid-kv.kv-sharing}} The course's pool has no sharing layers, so no level plays this case.

## What the padding costs

The course reports waste as the share of the layer slots, in a page of each group, that no real layer fills. vLLM's startup warning divides differently: it says the padding may waste at most the padding layers over the real layers of the type that is padded. {{claim:vllm.hybrid-kv.padding-warning}} For Gemma-3-27b the course says 8 of 70 slots, 11.4% [derived], and the warning's bound is 8 of 52 layers, 15.4% [derived]. Neither is the share of memory that a running pool wastes. That depends on how many pages the padded groups hold, and a sliding group holds few: a request of 4,096 tokens in the course's version of this model, with a window of 64 tokens [estimated], holds 256 pages in the full group, which has no padding, and 4 in each sliding group, so the padding is 3.2 pages' worth of the request's 280 pages, 1.1% [derived].

The grouping is also a heuristic, and its limits are in the planner's own comments. When the largest layer count is under 1.5 times the smallest [measured], the planner uses the largest as the group size, so that a drafter's one extra layer pads a group and does not double the groups. {{claim:vllm.hybrid-kv.group-size-near}} Its example is gpt-oss-20b with an EAGLE drafter, which has 12 sliding layers and 13 full ones [measured]. {{claim:vllm.hybrid-kv.group-size-example}} The smallest-count rule alone would take a group size of 12, which is 3 groups and 11 padding layers in 36 slots, and the 1.5 rule takes 13, which is 2 groups and 1 padding layer in 26 slots [derived]. In the other direction the document names a model that the rule serves badly, with 20 full-attention layers and 30 sliding ones [measured], where a group size of 10 would pad nothing and the rule takes 20 [derived]. {{claim:vllm.hybrid-kv.group-size-known-gap}}

| Model | Layers, full and sliding [measured] | Group size, groups [derived] | Padding layers, share of slots [derived] |
|---|---|---|---|
| gpt-oss-20b with its drafter | 13 and 12 | 13, 2 | 1, 3.8% |
| Gemma-3-27b | 10 and 52 | 10, 7 | 8, 11.4% |
| the document's counterexample | 20 and 30 | 20, 3 | 10, 16.7% |

To group a model by hand:

1. Count the layers of each kind.
2. Take the smallest count as the group size, or the largest when that is under 1.5 times the smallest [measured].
3. Split each kind into `ceil(count / size)` groups, and spread its layers over them.
4. The page is `size × tokens in a block × bytes per token per layer`, and the padding is the slots of the groups less the real layers.

For the model of the prediction, 13 full layers and 12 sliding ones [estimated], the largest count is under 1.5 times the smallest, so the size is 13 [derived]. The full layers make one group of 13 [derived]. The sliding layers make another, with 1 layer of padding, which is 2 groups and 26 slots for 25 layers [derived].

## One block, many pieces

A page is one id, and it has to be good in every layer of its group. For a model with `n` groups of `m` layers each, vLLM allocates `m` buffers, and each buffer is shared by `n` layers, one from each group. One logical block is then `m` pieces in `m` buffers, and a group's block ids name the same pieces in each. {{claim:vllm.hybrid-kv.memory-layout}} In the scene, the pan at the head of the ticket in focus fans out into the layers of its group, with the padding layers drawn bare.

:::figure
src: figures/tr5a/l2-one-block-many-pieces.svg
alt: The memory layout of the design document's request, a grid of pages by buffers
description: A grid with a row for each page of the request and a column for each of ten buffers. The first seven rows are the full group's pages, the next two are the first sliding group's and the last two are the second sliding group's, each set apart by a bracket and a lighter shade. A page is one piece in each buffer, so one page id names ten pieces.
origin: generated
:::

:::card
kind: isomorphism
title: The slab allocator
body: A slab allocator keeps one free list for each size class and rounds every object up to its class, so an object that fits its class badly wastes the rest of its slot. The pool's page is the size class, the kinds of group are the objects, and a padding layer is the rounding up. kernelspace's T1.L4 called the waste inside a block internal fragmentation.
breaks: A slab allocator picks its classes so that no object wastes more than a fixed share of its slot, whatever objects arrive. The page here is set by one model's layer counts, so the padding is whatever they leave over, and for the document's own counterexample that is 16.7% of the slots [derived].
:::

:::card
kind: warning
title: A bigger block is a coarser hit
body: Growing the attention block to make a state fit makes every prefix hit land on a bigger block edge. The document's own warning is a block of more than 400 tokens [measured], and a hit can be no finer than the block. Sizing a page is a choice about both memory and reuse.
:::

:::card
kind: notional-machine
id: kv
:::

## Read it at the pin

Read the document and the planner side by side. [The document](https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md) is the five cases. The code that does them is `_get_kv_cache_groups_uniform_page_size` in [`kv_cache_planning.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py) for the grouping, and `_align_hybrid_block_size` in [`platforms/interface.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/platforms/interface.py) for the Mamba block. The document was written at an earlier commit and says so, and the code is the authority. Where they disagree, as on where the padding goes, follow the code.

## What to carry

- Every group's block is one page, so the groups are made of equal numbers of layers, and a group that comes up short is padded.
- The group size is the smallest layer count of any kind, unless the largest is under 1.5 times that [measured], and it is a heuristic that the document admits can fail.
- A recurrent layer's state is made to fit by growing the attention block, which makes hits coarser.
- Padding is a share of a group's pages, and a sliding group has few pages at a long length.

## Exit check

This lesson tests one skill: working out how a model's layers become groups of one page size, and where the padding goes (`tr5a.page-size-unification`). The exit ticket is three items on fresh seeds at the third level. Each gives a model by its layer counts and a request's length, and asks for the pages the request holds, so the groups have to be worked out first. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `manager` level of the fourth lesson draws its model from its seed, and on half the seeds that model is one of this lesson's two page-size cases, so it grades the skill on fresh seeds as well.

:::item
family: tr5a.blocks-held
level: 3
count: 3
:::
