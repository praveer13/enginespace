---
id: tr5a.l1
module: tr5a
title: Why one model needs several KV caches
minutes: 95                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr5a.kv-groups, tr5a.sliding-free, tr5a.state-pages]
builds_on: [ks:T5.L5, ks:T5.L4, ks:t5.attention-variants, ks:t5.kv-bytes-per-token]
status: review                    # draft | review | live
lanes: [B]
games: [pool]
labs: [hybrid-kv]
---

{{ks:T5.L5}} gave a request one block table, a list of physical blocks that the attention kernel followed in every layer, and `lab 02` had you write the manager behind it: a pool of blocks, a table for each request, a free queue. That design assumes that every layer reads every token. Many recent models mix in layers that do not, and the manager that serves them keeps several tables for one request and draws all of them from one pool. This lesson is why, and how many pages each table holds.

## What the next token reads

A layer needs a token's key and value in the cache only if a later token will read them. {{ks:T5.L4}} counted what one token costs in a full-attention layer. This lesson asks how many tokens a layer has to pay for, and the answer depends on the kind of layer.

- **Full attention** reads every earlier token. Its blocks stay until the request ends, so its cache grows with the request, a block for every block of tokens.
- **Sliding-window attention** reads the last `W` tokens and no others. A block that lies wholly behind the window will not be read again by this layer, so the manager can take it back while the request is still running. The cache stops growing at about one window.
- **A recurrent layer**, the kind in Mamba and its relatives, reads a state: a fixed-size summary of everything before. It keeps no cache per token, so it needs the same memory for a short request and for a long one.

A model that mixes the kinds is a hybrid, and they are common. vLLM's design document names three families: sliding-window with full attention (gpt-oss, Gemma-2 and Gemma-3 among them), Mamba with full attention, and local chunked attention with full attention (Llama-4). {{claim:vllm.hybrid-kv.hybrid-models}} The layers come in small fixed ratios, which the planner's authors put at {{claim:vllm.hybrid-kv.layer-ratios}}. A manager for them has to reserve slots for all tokens in a full layer and for the last window only in a sliding one, and to follow a prefix-cache rule for each. {{claim:vllm.hybrid-kv.layer-slots}}

## Three tables for one request

A **KV cache group** is a set of layers of one kind. They need the same blocks for a request, so they share one block table, and a block id names one block-sized piece in every layer of the group. A request on a hybrid model holds one table for each group. {{claim:vllm.hybrid-kv.group-rules}} vLLM has a manager class for each kind of group. {{claim:vllm.hybrid-kv.manager-per-spec}}

The design document's example model has 10 full-attention layers and 20 sliding-window layers, with 16-token blocks and a 32-token window [measured]. {{claim:vllm.hybrid-kv.doc-example-blocks}} Its layers make three groups: one full group and two sliding groups of equal size. Why two sliding groups and not one is the next lesson's question, so take the grouping as given, and commit to one prediction before you read the rule.

:::predict
id: tr5a.l1.p1
prompt: A request holds 4,096 tokens [estimated]. The model is the design document's, one full-attention group and two sliding-window groups with 16 tokens in a block [estimated] and a 32-token window [estimated]. How many pages does the request hold across the three groups?
answer: { kind: numeric, unit: pages, rel_tol: 0.05 }
reveal: after-game
kcs: [tr5a.kv-groups, tr5a.sliding-free]
:::

Play the two levels in order. `one-group` is the model you know from `lab 02` and `lab 07`, one full group, and it teaches the game's words. `two-kinds` is this model. The game dresses the manager as a line kitchen: a group is a **station**, a page is a **hotel pan** in the reach-in, a request is a **ticket**, and a sliding group's window is its station's **hold window**. The engine words come first everywhere else on the page.

:::game
id: pool
level: one-group
mode: practice
:::

:::game
id: pool
level: two-kinds
mode: practice
:::

## What the game showed

The rule of each group is a function of the request's length alone. Write `L` for the tokens the request holds, `B` for the tokens in a block, `W` for a window and `S` for the pages of a state.

| Kind of group | Pages it holds | As the request grows |
|---|---|---|
| full | `ceil(L / B)` | one more page for every block of tokens, without end |
| sliding | `ceil(L / B) - floor(max(0, L - W + 1) / B)` | rises until the window is full, then holds |
| state | `min(ceil(L / B), S)` | rises to `S`, then holds |

The sliding rule says that the token being computed reads itself and the `W - 1` tokens before it. Every token before `L - W + 1` is dead to the layer, and the manager frees the whole blocks among them. {{claim:vllm.hybrid-kv.sliding-skipped-tokens}}

The design document's request has 112 tokens [measured], which is 7 blocks of 16 [derived]. The full group keeps all 7, and each sliding group keeps the last 2, so the request holds 7 + 2 + 2 = 11 pages, where three full-attention groups would hold 21 [derived]. {{claim:vllm.hybrid-kv.doc-example-blocks}}

:::figure
src: figures/tr5a/l1-block-tables.svg
alt: The block tables of the design document's request in three groups, with the blocks that each group keeps filled in
description: Three rows of squares, one for each group, with one square for each of the request's seven blocks. In the full group every square is filled. In each of the two sliding groups the first five squares are empty and the last two are filled, because the window has passed the others. Under each filled square is the page that holds it, numbered from the front of the pool.
origin: generated
:::

The pages that the three groups hold at three lengths, with what three full-attention groups would hold beside them:

| Tokens [estimated] | Full group [derived] | Each sliding group [derived] | All three [derived] | If all were full [derived] |
|---|---|---|---|---|
| 112 | 7 | 2 | 11 | 21 |
| 1,024 | 64 | 2 | 68 | 192 |
| 4,096 | 256 | 2 | 260 | 768 |

The sliding groups stop growing and the full group does not, so the saving grows with the request: 48%, 65% and 66% of the pages [derived]. A page is the same number of bytes whichever group holds it, as the next lesson shows, so these are savings in memory and not only in count. They are what a pool buys: a pool of 1,560 pages [estimated] holds 6 requests of 4,096 tokens in this model, and only 2 if all three groups were full attention [derived].

:::card
kind: warning
title: A window is not a block count
body: A window of two blocks' length holds two blocks at some lengths and three at others. The document's request is the best case, because its length is a multiple of the block size. One token more changes the count, so that at 113 tokens each sliding group holds 3 pages and the request 14, not 11 [derived]. Plan a window as its blocks plus one.
:::

## A state group holds a fixed number

A recurrent layer's state does not grow with the request, so a state group holds a fixed number of pages. The course's model keeps `S` of 2 [estimated]: the newest page holds the state being updated, and the last page that filled holds the state at its edge. A state cannot be rewound, so a later request can resume only from an edge that was saved, and the hit it finds there needs that one page. {{claim:vllm.hybrid-kv.mamba-hit}} In the model of the `state` level, with 8 attention layers and 24 recurrent ones [estimated], a request of 4,096 tokens holds 128 pages in the attention group, whose block has grown to 32 tokens, and 2 in each of 3 state groups, 134 in all, where 4 full groups would hold 512 [derived]. The next lesson says why the block grows, and why the recurrent layers make 3 groups [derived]. Real Mamba bookkeeping has more parts than this, and the card below lists what the model leaves out. What it keeps is the part that sets the memory: a constant.

## One pool

The groups hold different numbers of pages, and they all draw from one free queue. When a sliding group lets a block go, the page returns to the pool, and the next page that a full group needs can be that very page. {{claim:vllm.hybrid-kv.single-pool}} Think what separate pools would cost: each would be sized before anyone knew the mix of requests, and the memory that sliding layers do not need would sit idle in their pool while the full layers ran out of theirs.

The obvious design for a window is a ring of window-sized blocks that new tokens overwrite in turn, and vLLM's document rejects it, because a ring is not compatible with prefix caching. A block that new tokens overwrite no longer holds the tokens its hash named, so it could not be kept for another request. The manager allocates different blocks for different tokens, as for full attention, and frees the ones outside the window. {{claim:vllm.hybrid-kv.no-ring-buffer}}

:::card
kind: isomorphism
title: Three ways to keep a stream
body: Keeping every event of a stream is an append-only log. Keeping the last few is a retention window, as a log with a size or time limit does. Keeping a running aggregate, such as a counter or a rolling checksum, is a fold, and its size is the same for a short stream and a long one. The three kinds of layer are these three policies.
breaks: A log's retention is a choice for its operator, and a layer's window is part of the model, so dropping what lies behind it loses nothing that the layer would read. A fold cannot be rewound either. A state at one point gives no state at another, so a request can resume only from a point where a state was saved.
:::

:::card
kind: notional-machine
id: kv
:::

## Build

The first three stages of the lab are this lesson's rules, written in Rust. `one_group` (`s1`) is the full group alone, with the paging, the prefix hashes and the shared blocks of `lab 02` and `lab 07` in one module, and the rule of `lab 02` still binds: an operation either succeeds or leaves everything as it was. {{claim:kv.kernelspace.lab02-all-or-nothing}} `sliding` (`s2`) makes a window give its blocks back, and counts them when an append is judged. `state` (`s3`) holds a fixed number of pages.

:::lab
id: hybrid-kv
lane: B
stages: [s1, s2, s3]
:::

## What to carry

- What the next token reads decides what a layer keeps: every earlier token, the last window, or a fixed state.
- A request holds one table for each group, and a sliding group's table has its oldest entries let go.
- A window is not a block count. Here it holds two blocks or three, depending on the length.
- Every group draws its pages from one pool, so a page that a window lets go can serve a full group.

## Exit check

This lesson tests three skills: saying what each kind of layer needs of the cache (`tr5a.kv-groups`), working out the pages that a sliding group still holds (`tr5a.sliding-free`), and saying why a state group's pages stay fixed (`tr5a.state-pages`). The exit ticket is three items on fresh seeds, each a request and a model, asking for the pages it holds in one group or across the groups. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The lab's stages `sliding` and `state` then grade the last two skills on seeds drawn when you run them.

:::item
family: tr5a.blocks-held
level: 2
count: 3
:::
