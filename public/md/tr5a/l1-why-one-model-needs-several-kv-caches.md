# Why one model needs several KV caches

_Hybrid KV groups, and adapter pages in one pool · lesson `tr5a.l1` · review · about 95 minutes [estimated]_

Builds on kernelspace: `ks:T5.L5`, `ks:T5.L4`, `ks:t5.attention-variants`, `ks:t5.kv-bytes-per-token`.

Knowledge components: `tr5a.kv-groups`, `tr5a.sliding-free`, `tr5a.state-pages`.

kernelspace T5.L5 gave a request one block table, a list of physical blocks that the attention kernel followed in every layer, and `lab 02` had you write the manager behind it: a pool of blocks, a table for each request, a free queue. That design assumes that every layer reads every token. Many recent models mix in layers that do not, and the manager that serves them keeps several tables for one request and draws all of them from one pool. This lesson is why, and how many pages each table holds.

## What the next token reads

A layer needs a token's key and value in the cache only if a later token will read them. kernelspace T5.L4 counted what one token costs in a full-attention layer. This lesson asks how many tokens a layer has to pay for, and the answer depends on the kind of layer.

- **Full attention** reads every earlier token. Its blocks stay until the request ends, so its cache grows with the request, a block for every block of tokens.
- **Sliding-window attention** reads the last `W` tokens and no others. A block that lies wholly behind the window will not be read again by this layer, so the manager can take it back while the request is still running. The cache stops growing at about one window.
- **A recurrent layer**, the kind in Mamba and its relatives, reads a state: a fixed-size summary of everything before. It keeps no cache per token, so it needs the same memory for a short request and for a long one.

A model that mixes the kinds is a hybrid, and they are common. vLLM's design document names three families: sliding-window with full attention (gpt-oss, Gemma-2 and Gemma-3 among them), Mamba with full attention, and local chunked attention with full attention (Llama-4). **sliding window, Mamba and local chunked, each with full attention** [measured] The layers come in small fixed ratios, which the planner's authors put at **Gemma3 5:1, Llama4 3:1** [measured]. A manager for them has to reserve slots for all tokens in a full layer and for the last window only in a sliding one, and to follow a prefix-cache rule for each. **only the most recent window of tokens** [measured]

## Three tables for one request

A **KV cache group** is a set of layers of one kind. They need the same blocks for a request, so they share one block table, and a block id names one block-sized piece in every layer of the group. A request on a hybrid model holds one table for each group. **one attention type in a group, one page size across groups** [measured] vLLM has a manager class for each kind of group. **one manager class for each kind of cache spec** [measured]

The design document's example model has 10 full-attention layers and 20 sliding-window layers, with 16-token blocks and a 32-token window [measured]. **11 blocks** [measured] Its layers make three groups: one full group and two sliding groups of equal size. Why two sliding groups and not one is the next lesson's question, so take the grouping as given, and commit to one prediction before you read the rule.

> **Predict `tr5a.l1.p1`.** A request holds 4,096 tokens [estimated]. The model is the design document's, one full-attention group and two sliding-window groups with 16 tokens in a block [estimated] and a 32-token window [estimated]. How many pages does the request hold across the three groups?
>
> The learner commits to a number in `pages`, graded within a relative tolerance of `0.05` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Play the two levels in order. `one-group` is the model you know from `lab 02` and `lab 07`, one full group, and it teaches the game's words. `two-kinds` is this model. The game dresses the manager as a line kitchen: a group is a **station**, a page is a **hotel pan** in the reach-in, a request is a **ticket**, and a sliding group's window is its station's **hold window**. The engine words come first everywhere else on the page.

> **Play.** The game `pool`, level `one-group`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Play.** The game `pool`, level `two-kinds`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## What the game showed

The rule of each group is a function of the request's length alone. Write `L` for the tokens the request holds, `B` for the tokens in a block, `W` for a window and `S` for the pages of a state.

| Kind of group | Pages it holds | As the request grows |
|---|---|---|
| full | `ceil(L / B)` | one more page for every block of tokens, without end |
| sliding | `ceil(L / B) - floor(max(0, L - W + 1) / B)` | rises until the window is full, then holds |
| state | `min(ceil(L / B), S)` | rises to `S`, then holds |

The sliding rule says that the token being computed reads itself and the `W - 1` tokens before it. Every token before `L - W + 1` is dead to the layer, and the manager frees the whole blocks among them. **max(0, computed - window + 1)** [measured]

The design document's request has 112 tokens [measured], which is 7 blocks of 16 [derived]. The full group keeps all 7, and each sliding group keeps the last 2, so the request holds 7 + 2 + 2 = 11 pages, where three full-attention groups would hold 21 [derived]. **11 blocks** [measured]

![The block tables of the design document's request in three groups, with the blocks that each group keeps filled in](../../figures/tr5a/l1-block-tables.svg)

_Three rows of squares, one for each group, with one square for each of the request's seven blocks. In the full group every square is filled. In each of the two sliding groups the first five squares are empty and the last two are filled, because the window has passed the others. Under each filled square is the page that holds it, numbered from the front of the pool._

The pages that the three groups hold at three lengths, with what three full-attention groups would hold beside them:

| Tokens [estimated] | Full group [derived] | Each sliding group [derived] | All three [derived] | If all were full [derived] |
|---|---|---|---|---|
| 112 | 7 | 2 | 11 | 21 |
| 1,024 | 64 | 2 | 68 | 192 |
| 4,096 | 256 | 2 | 260 | 768 |

The sliding groups stop growing and the full group does not, so the saving grows with the request: 48%, 65% and 66% of the pages [derived]. A page is the same number of bytes whichever group holds it, as the next lesson shows, so these are savings in memory and not only in count. They are what a pool buys: a pool of 1,560 pages [estimated] holds 6 requests of 4,096 tokens in this model, and only 2 if all three groups were full attention [derived].

> **A window is not a block count.** A window of two blocks' length holds two blocks at some lengths and three at others. The document's request is the best case, because its length is a multiple of the block size. One token more changes the count, so that at 113 tokens each sliding group holds 3 pages and the request 14, not 11 [derived]. Plan a window as its blocks plus one.

## A state group holds a fixed number

A recurrent layer's state does not grow with the request, so a state group holds a fixed number of pages. The course's model keeps `S` of 2 [estimated]: the newest page holds the state being updated, and the last page that filled holds the state at its edge. A state cannot be rewound, so a later request can resume only from an edge that was saved, and the hit it finds there needs that one page. **the last cached block** [measured] In the model of the `state` level, with 8 attention layers and 24 recurrent ones [estimated], a request of 4,096 tokens holds 128 pages in the attention group, whose block has grown to 32 tokens, and 2 in each of 3 state groups, 134 in all, where 4 full groups would hold 512 [derived]. The next lesson says why the block grows, and why the recurrent layers make 3 groups [derived]. Real Mamba bookkeeping has more parts than this, and the card below lists what the model leaves out. What it keeps is the part that sets the memory: a constant.

## One pool

The groups hold different numbers of pages, and they all draw from one free queue. When a sliding group lets a block go, the page returns to the pool, and the next page that a full group needs can be that very page. **one pool, one page size** [measured] Think what separate pools would cost: each would be sized before anyone knew the mix of requests, and the memory that sliding layers do not need would sit idle in their pool while the full layers ran out of theirs.

The obvious design for a window is a ring of window-sized blocks that new tokens overwrite in turn, and vLLM's document rejects it, because a ring is not compatible with prefix caching. A block that new tokens overwrite no longer holds the tokens its hash named, so it could not be kept for another request. The manager allocates different blocks for different tokens, as for full attention, and frees the ones outside the window. **a ring of window blocks was not picked** [measured]

> **Three ways to keep a stream.** Keeping every event of a stream is an append-only log. Keeping the last few is a retention window, as a log with a size or time limit does. Keeping a running aggregate, such as a counter or a rolling checksum, is a fold, and its size is the same for a short stream and a long one. The three kinds of layer are these three policies.
>
> Where it breaks: A log's retention is a choice for its operator, and a layer's window is part of the model, so dropping what lies behind it loses nothing that the layer would read. A fold cannot be rewound either. A state at one point gives no state at another, so a request can resume only from a point where a state was saved.

> **Card.** The notional-machine card `kv`.

## Build

The first three stages of the lab are this lesson's rules, written in Rust. `one_group` (`s1`) is the full group alone, with the paging, the prefix hashes and the shared blocks of `lab 02` and `lab 07` in one module, and the rule of `lab 02` still binds: an operation either succeeds or leaves everything as it was. **all or nothing** [measured] `sliding` (`s2`) makes a window give its blocks back, and counts them when an append is judged. `state` (`s3`) holds a fixed number of pages.

> **Build.** The lab `hybrid-kv` (lane B), stages `s1`, `s2`, `s3`. The lab page grades it.

## What to carry

- What the next token reads decides what a layer keeps: every earlier token, the last window, or a fixed state.
- A request holds one table for each group, and a sliding group's table has its oldest entries let go.
- A window is not a block count. Here it holds two blocks or three, depending on the length.
- Every group draws its pages from one pool, so a page that a window lets go can serve a full group.

## Exit check

This lesson tests three skills: saying what each kind of layer needs of the cache (`tr5a.kv-groups`), working out the pages that a sliding group still holds (`tr5a.sliding-free`), and saying why a state group's pages stay fixed (`tr5a.state-pages`). The exit ticket is three items on fresh seeds, each a request and a model, asking for the pages it holds in one group or across the groups. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The lab's stages `sliding` and `state` then grade the last two skills on seeds drawn when you run them.

> **Practice.** Items from the generator family `tr5a.blocks-held`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `kv.kernelspace.lab02-all-or-nothing`: kernelspace's lab 02, the block manager, asks for every operation to be all or nothing. If the pool cannot satisfy an operation, the manager returns false and leaves all state untouched, because half-applied allocations are how production engines corrupt themselves. Value all or nothing [measured], checked 2026-11-05 (source: kernelspace labs/kv-block-manager/src/lib.rs, the model of lab 02 (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/labs/kv-block-manager/src/lib.rs#L22-L24>, read 2026-11-05).
- `vllm.hybrid-kv.doc-example-blocks`: The design document's worked example, 10 full-attention and 20 sliding-window layers with 16-token blocks and a 32-token window, allocates 11 blocks to a request of 112 tokens, 7 for the full group and 2 for each of the two sliding groups. Value 11 blocks [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 2) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L73-L86>, read 2026-11-04).
- `vllm.hybrid-kv.group-rules`: The design document gives a KV cache group two rules. The layers of a group are all of one attention type, so that they need the same number of blocks for a request and can share the same block ids. And every group has the same page size, because the memory pool has only one. Value one attention type in a group, one page size across groups [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Case 2) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L92-L95>, read 2026-11-05).
- `vllm.hybrid-kv.hybrid-models`: vLLM's design document names three families of hybrid model, sliding-window attention with full attention (gpt-oss, Gemma 2 and 3, Ministral and cohere among them), Mamba with full attention (Bamba, Jamba, Minimax) and local chunked attention with full attention (Llama 4). Value sliding window, Mamba and local chunked, each with full attention [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (What is a hybrid model?) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L8-L12>, read 2026-11-05).
- `vllm.hybrid-kv.layer-ratios`: The planner's authors write that every open-source hybrid model they know follows an n to 1 pattern between its attention types, with Gemma 3 at 5 sliding-window layers to 1 full-attention layer and Llama 4 at 3 local layers to 1 full-attention layer. They wrote it on 2025-06-02, and the comment is still there at v0.33.0. Value Gemma3 5:1, Llama4 3:1 [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_planning.py, _get_kv_cache_groups_uniform_page_size (a FIXME) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_planning.py#L513-L520>, read 2026-11-05).
- `vllm.hybrid-kv.layer-slots`: A hybrid model's KV cache manager has to reserve slots for all tokens in a full-attention layer and only for the most recent window of tokens in a sliding-window layer, and it has to apply a prefix-cache rule for each kind of layer. Value only the most recent window of tokens [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (What is a hybrid model?) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L14-L21>, read 2026-11-05).
- `vllm.hybrid-kv.mamba-hit`: A Mamba group looks from the right for the last block that is cached and hits there, so a hit at a block's edge needs that one block, which holds the state at the edge, and no others. Value the last cached block [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/single_type_kv_cache_manager.py, MambaManager.find_longest_cache_hit <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py#L1522-L1546>, read 2026-11-04).
- `vllm.hybrid-kv.manager-per-spec`: vLLM registers a manager class for each kind of KV cache spec. At v0.33.0 full attention has FullAttentionManager, a sliding window SlidingWindowManager, a Mamba layer MambaManager, chunked local attention ChunkedLocalAttentionManager and cross-attention CrossAttentionManager, and there are more. Value one manager class for each kind of cache spec [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/single_type_kv_cache_manager.py, register_all_kvcache_specs <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py#L2656-L2730>, read 2026-11-05).
- `vllm.hybrid-kv.no-ring-buffer`: The design document rejects the obvious design for a sliding window, a ring of window-sized blocks that new tokens overwrite in turn, because it is not compatible with prefix caching. vLLM allocates different blocks for different tokens instead, and frees the blocks that are outside the window. Value a ring of window blocks was not picked [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Prefix caching, case 1) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L177>, read 2026-11-05).
- `vllm.hybrid-kv.single-pool`: The hybrid KV cache manager serves every layer type from a single memory pool that is split into blocks of the same page size. Making every layer type reach that one page size is its core challenge. Value one pool, one page size [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/hybrid_kv_cache_manager.md (Allocation) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/hybrid_kv_cache_manager.md#L47>, read 2026-11-04).
- `vllm.hybrid-kv.sliding-skipped-tokens`: A sliding-window group skips the tokens before max(0, computed tokens - window + 1), which the next token no longer attends to. The manager frees the whole blocks among them, the number of skipped tokens divided by the block size and rounded down. Value max(0, computed - window + 1) [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/single_type_kv_cache_manager.py, SlidingWindowManager.get_num_skipped_tokens <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py#L1148-L1183>, read 2026-11-04).
