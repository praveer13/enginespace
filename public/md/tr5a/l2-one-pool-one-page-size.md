# One pool, one page size: vLLM's hybrid manager and its five cases

_Hybrid KV groups, and adapter pages in one pool · lesson `tr5a.l2` · review · about 52 minutes [estimated]_

Builds on kernelspace: `ks:T5.L5`, `ks:T1.L4`, `ks:t1.internal-frag`.

Knowledge components: `tr5a.page-size-unification`.

The last lesson gave a request three tables, and the three draw from one free queue. A free queue works only if its entries are interchangeable: a page that a sliding group lets go has to be good for a full group, and for a state group. So a block of every group has to be the same number of bytes. This lesson is how vLLM makes that so for the models it serves, and what it costs when the layers do not divide evenly.

## What a page is

A block is the memory reserved for a block's worth of tokens in the layers of one group, and a page is its size in bytes: the layers the block serves, times the tokens in a block, times the bytes that one token needs in one layer. The layers in that product are the group's and not the model's. **layers x block size x kv hidden size** [measured] The pool has a single page size, so every group has to reach it. **one pool, one page size** [measured]

In a model of full attention alone there is nothing to reach, because every block serves every layer. In a hybrid the groups are made of different numbers of layers, and a recurrent layer's state is a different quantity from a token's key and value. The planner has to choose the groups so that the products agree. Commit to one prediction, then play `same-size`.

> **Predict `tr5a.l2.p1`.** A model has 12 sliding-window layers and 13 full-attention layers [estimated], and every layer costs the same bytes for a token. The planner gives each group the same number of layers, and pads a group that comes up short. How many KV cache groups does it make of this model?
>
> The learner commits to a number in `groups`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Play.** The game `pool`, level `same-size`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## The five cases

vLLM's design document walks through five cases, from a toy to the awkward ones. Each is a different answer to one question: what makes the pages of the groups equal?

| Case | The model | How the pages are made equal | What it costs | Level |
|---|---|---|---|---|
| first, the toy | a few layers with the same bytes for a token | a block holds a block's tokens for one layer, and the page is one layer's | an allocator call for each layer | none |
| second, a regular pattern | the same bytes, and a fixed ratio between the kinds | layers that need the same blocks are grouped, and the page is the group's | nothing | `two-kinds` |
| third, no regular pattern | the same bytes, and no ratio | the group size is the smallest layer count of any kind, and a short group is padded | padding layers | `same-size` |
| fourth, different bytes | a recurrent layer's state is much bigger than a token's KV | the attention block grows until it holds a state, and the state is padded to it | a big block, and a padded state | `state` |
| fifth, shared caches | layers that read another layer's cache | they get none of their own | nothing | none |

**The regular pattern.** Calling the allocator once for each layer is fine for a toy and inefficient for a model with many layers, so the second case groups the layers that need the same number of blocks. The document's example has 10 full-attention layers and 20 sliding ones [measured], which is two sliding layers for each full one. It allocates as if the model had one full layer and two sliding ones, and repeats that result for each of the 10 full layers, so that every group has 10 layers and the page is 10 layers' worth [derived]. **11 blocks** [measured]

**No regular pattern.** Gemma-3-27b has 52 sliding-window layers and 10 full-attention layers [measured]. Grouped by their ratio that is 26 sliding groups and 5 full groups of 2 layers each [measured], too many small groups. **52 sliding and 10 full** [measured] **too many small groups** [measured] So the planner groups by the smallest layer count among the kinds, which is 10 here [derived]. That is one full group and 6 sliding groups [derived], and 6 groups of 10 layers hold 60 slots for 52 sliding layers, so 8 of them are padding. **the fewest layers of any type** [measured]

The document draws the padding in the last group, and the code spreads it: group `i` takes every sixth layer from layer `i`, so four groups have 9 layers and 1 of padding, and two have 8 layers and 2 of padding [derived]. **layers[i::num_groups]** [measured] **group size - layers % group size** [measured] The course follows the code, because the code is what runs.

**Different bytes.** A recurrent layer's state can be much bigger than one token's KV in an attention layer, and the pool has one page size. The planner makes the attention block bigger, in multiples of the kernel's block, until one layer's block is at least a layer's state, and it pads the state up to that size. Then it groups as in the third case. **attention page >= state page, state padded to it** [measured] **the smallest multiple of the kernel block that holds the state** [measured] Commit to one more number before you play `state`.

> **Predict `tr5a.l2.p2`.** A model has 8 attention layers that cost 1,024 bytes a token each [estimated], and 24 recurrent layers whose state is 32,768 bytes each [estimated]. The attention block starts at 16 tokens [estimated] and grows 16 tokens at a time until one layer's block holds a layer's state. How many tokens does the block hold when it stops?
>
> The learner commits to a number in `tokens`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Play.** The game `pool`, level `state`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

A layer's block of 16 tokens is 16,384 bytes [derived], half of its state, so the block grows to 32 tokens [derived] and the state fits it exactly. The document says that real hybrids can be far more lopsided: the rule can lead to attention blocks of more than 400 tokens [measured], which it calls too large. **400 tokens** [measured] The next lesson shows what a block that big does to a prefix hit, which can end only on a block's edge.

**Shared caches.** Some models, Gemma-3n among them, have layers that read the KV cache of another layer. The manager ignores them, allocates cache only for the layers that need it, and the model runner applies the result to the layers that share. **layers that share a cache get none of their own** [measured] The course's pool has no sharing layers, so no level plays this case.

## What the padding costs

The course reports waste as the share of the layer slots, in a page of each group, that no real layer fills. vLLM's startup warning divides differently: it says the padding may waste at most the padding layers over the real layers of the type that is padded. **padding layers / the type's layers** [measured] For Gemma-3-27b the course says 8 of 70 slots, 11.4% [derived], and the warning's bound is 8 of 52 layers, 15.4% [derived]. Neither is the share of memory that a running pool wastes. That depends on how many pages the padded groups hold, and a sliding group holds few: a request of 4,096 tokens in the course's version of this model, with a window of 64 tokens [estimated], holds 256 pages in the full group, which has no padding, and 4 in each sliding group, so the padding is 3.2 pages' worth of the request's 280 pages, 1.1% [derived].

The grouping is also a heuristic, and its limits are in the planner's own comments. When the largest layer count is under 1.5 times the smallest [measured], the planner uses the largest as the group size, so that a drafter's one extra layer pads a group and does not double the groups. **1.5 times the fewest** [measured] Its example is gpt-oss-20b with an EAGLE drafter, which has 12 sliding layers and 13 full ones [measured]. **12 sliding and 13 full, padded to 13 and 13** [measured] The smallest-count rule alone would take a group size of 12, which is 3 groups and 11 padding layers in 36 slots, and the 1.5 rule takes 13, which is 2 groups and 1 padding layer in 26 slots [derived]. In the other direction the document names a model that the rule serves badly, with 20 full-attention layers and 30 sliding ones [measured], where a group size of 10 would pad nothing and the rule takes 20 [derived]. **10 layers a group** [measured]

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

A page is one id, and it has to be good in every layer of its group. For a model with `n` groups of `m` layers each, vLLM allocates `m` buffers, and each buffer is shared by `n` layers, one from each group. One logical block is then `m` pieces in `m` buffers, and a group's block ids name the same pieces in each. **one buffer per layer of a group, shared by one layer from each group** [measured] In the scene, the pan at the head of the ticket in focus fans out into the layers of its group, with the padding layers drawn bare.

![The memory layout of the design document's request, a grid of pages by buffers](../../figures/tr5a/l2-one-block-many-pieces.svg)

_A grid with a row for each page of the request and a column for each of ten buffers. The first seven rows are the full group's pages, the next two are the first sliding group's and the last two are the second sliding group's, each set apart by a bracket and a lighter shade. A page is one piece in each buffer, so one page id names ten pieces._

> **The slab allocator.** A slab allocator keeps one free list for each size class and rounds every object up to its class, so an object that fits its class badly wastes the rest of its slot. The pool's page is the size class, the kinds of group are the objects, and a padding layer is the rounding up. kernelspace's T1.L4 called the waste inside a block internal fragmentation.
>
> Where it breaks: A slab allocator picks its classes so that no object wastes more than a fixed share of its slot, whatever objects arrive. The page here is set by one model's layer counts, so the padding is whatever they leave over, and for the document's own counterexample that is 16.7% of the slots [derived].

> **A bigger block is a coarser hit.** Growing the attention block to make a state fit makes every prefix hit land on a bigger block edge. The document's own warning is a block of more than 400 tokens [measured], and a hit can be no finer than the block. Sizing a page is a choice about both memory and reuse.

> **Card.** The notional-machine card `kv`.

## Read it at the pin

Read the document and the planner side by side. [The document](https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md) is the five cases. The code that does them is `_get_kv_cache_groups_uniform_page_size` in [`kv_cache_planning.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py) for the grouping, and `_align_hybrid_block_size` in [`platforms/interface.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/platforms/interface.py) for the Mamba block. The document was written at an earlier commit and says so, and the code is the authority. Where they disagree, as on where the padding goes, follow the code.

## What to carry

- Every group's block is one page, so the groups are made of equal numbers of layers, and a group that comes up short is padded.
- The group size is the smallest layer count of any kind, unless the largest is under 1.5 times that [measured], and it is a heuristic that the document admits can fail.
- A recurrent layer's state is made to fit by growing the attention block, which makes hits coarser.
- Padding is a share of a group's pages, and a sliding group has few pages at a long length.

## Exit check

This lesson tests one skill: working out how a model's layers become groups of one page size, and where the padding goes (`tr5a.page-size-unification`). The exit ticket is three items on fresh seeds at the third level. Each gives a model by its layer counts and a request's length, and asks for the pages the request holds, so the groups have to be worked out first. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `manager` level of the fourth lesson draws its model from its seed, and on half the seeds that model is one of this lesson's two page-size cases, so it grades the skill on fresh seeds as well.

> **Practice.** Items from the generator family `tr5a.blocks-held`, level `3`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `vllm.hybrid-kv.attn-block-inflate`: The attention block is made the smallest multiple of the kernel block size whose page, for a layer, is at least a Mamba layer's state page. The state page is then padded to exactly that size. Value the smallest multiple of the kernel block that holds the state [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/platforms/interface.py, Platform._align_hybrid_block_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/platforms/interface.py#L1096-L1128>, read 2026-11-04).
- `vllm.hybrid-kv.doc-example-blocks`: The design document's worked example, 10 full-attention and 20 sliding-window layers with 16-token blocks and a 32-token window, allocates 11 blocks to a request of 112 tokens, 7 for the full group and 2 for each of the two sliding groups. Value 11 blocks [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 2) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L73-L86>, read 2026-11-04).
- `vllm.hybrid-kv.doc-gemma3-layers`: The design document counts 52 sliding-window and 10 full-attention layers in Gemma-3-27b, and groups them by the smallest layer count, 10, into 7 groups. Value 52 sliding and 10 full [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 3) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L113-L121>, read 2026-11-04).
- `vllm.hybrid-kv.group-size`: The planner gives every KV cache group the same number of layers, and that number is the smallest layer count among the attention types, so that every group's block is the same size. Value the fewest layers of any type [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L521-L522>, read 2026-11-04).
- `vllm.hybrid-kv.group-size-example`: The planner's comment on its 1.5 rule names gpt-oss-20b with an EAGLE drafter, which has 12 sliding-window layers and 13 full-attention layers. The rule pads that model to a group of 13 sliding-window layers and a group of 13 full-attention layers, in place of 12 sliding-window layers and 24 full-attention layers. Value 12 sliding and 13 full, padded to 13 and 13 [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size (the 1.5 rule) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L524-L533>, read 2026-11-05).
- `vllm.hybrid-kv.group-size-known-gap`: The design document says its grouping heuristic will be updated if it gives a bad result for a new model, and names one it would serve badly, 20 full-attention layers with 30 sliding-window layers, where the group size should be 10 and not 20. The planner's own comment names the same model. Value 10 layers a group [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 3) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L123>, read 2026-11-05).
- `vllm.hybrid-kv.group-size-near`: When the largest layer count is less than 1.5 times the smallest, the planner uses the largest as the group size, so that a draft model's extra layer pads one group by a layer instead of doubling the groups. Value 1.5 times the fewest [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L524-L532>, read 2026-11-04).
- `vllm.hybrid-kv.kv-sharing`: Some models have a layer that uses the KV cache of another layer, Gemma-3n among them. The KV cache manager ignores every layer that shares and allocates cache only for the layers that need it, and the model runner applies the result to the layers that share. Value layers that share a cache get none of their own [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 5) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L152-L155>, read 2026-11-05).
- `vllm.hybrid-kv.layer-spread`: The layers of one type are spread over its groups, with group i taking every num_groups-th layer from layer i. A type whose layers do not divide evenly therefore gets groups that differ by one layer, and the padding is spread over the groups with them. The design document draws the padding in the last group. Value layers[i::num_groups] [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L548-L555>, read 2026-11-04).
- `vllm.hybrid-kv.mamba-block-size-large`: The design document warns that making a hybrid Mamba model's page sizes equal by growing the attention block can lead to an attention block of more than 400 tokens, which it calls too large. It describes another padding strategy and says that one is still work in progress. Value 400 tokens [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 4) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L143-L150>, read 2026-11-05).
- `vllm.hybrid-kv.memory-layout`: For a model with n groups of m layers each, vLLM allocates m buffers, and each buffer is shared by n layers, one from each group. One logical block therefore maps to m pieces in the m buffers. Value one buffer per layer of a group, shared by one layer from each group [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Memory Layout) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L229-L241>, read 2026-11-05).
- `vllm.hybrid-kv.padding-layers`: A type whose layer count is not a multiple of the group size is padded with the missing layers, and the planner logs how much KV cache memory the padding may waste. Value group size - layers % group size [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L535-L541>, read 2026-11-04).
- `vllm.hybrid-kv.padding-warning`: When a type's layers do not fill its groups, the planner logs a warning that the padding may waste at most as much of the KV cache memory as the padding layers are of that type's real layers. The share is taken against one type's layers, and not against the layer slots of all the groups. Value padding layers / the type's layers [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size (the warning) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L535-L541>, read 2026-11-05).
- `vllm.hybrid-kv.page-size-formula`: In the design document a block holds block_size tokens for the layers it serves, and the page size is the physical size of a block, the number of layers times the block size times the bytes that one token's KV takes in one layer. The number of layers in that product is not the model's total, but the number the block serves in the case at hand. Value layers x block size x kv hidden size [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Definitions) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L25-L34>, read 2026-11-05).
- `vllm.hybrid-kv.page-unify`: For a hybrid model with Mamba layers, vLLM makes the attention page at least as big as a Mamba layer's state page, and pads the state page up to the attention page, so that the groups have one page size. Value attention page >= state page, state padded to it [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/platforms/interface.py, Platform._align_hybrid_block_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/platforms/interface.py#L940-L947>, read 2026-11-04).
- `vllm.hybrid-kv.single-pool`: The hybrid KV cache manager serves every layer type from a single memory pool that is split into blocks of the same page size. Making every layer type reach that one page size is its core challenge. Value one pool, one page size [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Allocation) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L47>, read 2026-11-04).
- `vllm.hybrid-kv.small-groups`: The document says that grouping layers as case 2 does, by the ratio between the attention types, would make Gemma-3-27b 26 sliding-window groups and 5 full-attention groups of 2 layers each, too many small groups, and that the allocation would still be inefficient. Its answer is to group by the smallest layer count among the attention types. Value too many small groups [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 3) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L113>, read 2026-11-05).
