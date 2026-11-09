---
id: tr5a.l3
module: tr5a
title: A prefix hit must hold in every group
minutes: 72                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr5a.hit-intersection]
builds_on: [ks:T5.L6, ks:T5.L5, ks:t5.prefix-cache-keys, ks:t5.radix-eviction, ks:t2.eviction-policies]
status: review                    # draft | review | live
lanes: [B]
games: [pool]
labs: [hybrid-kv]
---

In {{ks:T5.L6}} a prefix hit was the longest run of blocks from the start of a prompt that the cache still held, and with one table it is a loop that stops at the first miss. With several groups the hit has a second question to answer. The request's first new token will read every layer, and each kind of layer reads the cache differently.

## What each group needs at the edge

Say that a prompt shares its first `m` blocks with a cached sequence. The request starts computing at the token after them, which is the **edge** of the hit. Every layer then reads the cache as it will for that token, and each kind of group needs different blocks to be there.

- A **full** group reads every earlier token, so it needs blocks `0` to `m - 1`, every one of them.
- A **sliding** group reads only the last window before the edge, so it needs the `ceil((W - 1) / B)` blocks just before the edge. When fewer than that come before the edge, it needs them all, from the first. {{claim:vllm.hybrid-kv.sliding-hit-blocks}} {{claim:vllm.hybrid-kv.sliding-hit-prefix}}
- A **state** group reads the state at the edge, so it needs the one block that holds it. {{claim:vllm.hybrid-kv.mamba-hit}}

So each group accepts some edges and rejects the rest, and the request's hit is an edge that every group accepts. It is the **intersection** of what the groups hold. {{claim:vllm.hybrid-kv.intersection}} The cache is keyed by a block's hash and its group, so the same tokens in two groups are cached, and evicted, independently of each other. {{claim:vllm.hybrid-kv.cache-key}}

A full group's accepted edges are downward-closed: if it accepts an edge it accepts every edge before it. A window's are not. It accepts an edge only if the blocks just before that edge are cached, so its accepted edges can have gaps, once a block in the middle of its run has been evicted. That is why a hit cannot be found by asking each group for its longest hit and taking the shortest. A state group is the other extreme: it needs one block and no run, so its accepted edges are scattered, wherever a state was saved. Commit to two predictions before you play.

:::predict
id: tr5a.l3.p1
prompt: The model is lesson 1's, one full group and two sliding-window groups, with 16 tokens in a block [estimated] and a 32-token window [estimated]. A returning request has a prompt of 176 tokens [estimated], and its blocks are counted from the first. The full group holds the blocks numbered 0 to 9 [estimated]. The first sliding group holds the blocks 6 to 8, and the second holds the blocks 7 to 9 [estimated], because the two groups cache and evict their blocks independently. How many tokens does the prefix hit cover?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr5a.hit-intersection]
:::

:::predict
id: tr5a.l3.p2
prompt: The model is the `state` level's, one full group and three state groups, with 32 tokens in a block [estimated]. A returning request has a prompt of 330 tokens [estimated]. The full group holds the blocks numbered 0 to 7 [estimated]. Each state group holds only the blocks 2 and 5 [estimated], which are the states at two edges. How many tokens does the prefix hit cover?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr5a.hit-intersection]
:::

In The Reach-In the free queue is **the rotation**, evicting a page is **dumping a pan**, and a prefix hit is **shared mise**. A ticket's hit counts only as far as every station still holds its pans, and `evict` is the level where you choose which pans to dump.

:::game
id: pool
level: evict
mode: practice
:::

## How the engine finds the hit

The engine runs a loop over the groups.

1. Start from the longest candidate: the prompt less its last token, rounded down to a block.
2. Ask each group, full attention first, for its longest accepted edge not above the candidate.
3. If any group lowered the candidate, ask all of them again. When a whole pass changes nothing, the candidate is the hit. It only falls and stops at zero, so the loop ends. {{claim:vllm.hybrid-kv.n-group-lookup}}

Three details keep the loop short.

- Full attention goes first, because its scan from the left gives the tightest first bound. {{claim:vllm.hybrid-kv.full-attention-first}}
- A window is scanned from the right, from the candidate down, so that it can stop at the first edge it accepts. {{claim:vllm.hybrid-kv.full-plus-sliding-lookup}}
- Full attention is downward-closed, so its blocks are looked up once, and the later passes only trim its hit to the candidate. {{claim:vllm.hybrid-kv.downward-closed}}

With one full group and one other group, the first pass settles it. {{claim:vllm.hybrid-kv.simple-hybrid}}

Two more rules bound the answer.

- A hit is a multiple of the least common multiple of the groups' block sizes, which is why a bigger block makes a coarser hit. {{claim:vllm.hybrid-kv.hit-alignment}}
- A hit never covers the last token of the prompt, because the request computes it to get its logits, even if that recomputes a whole block. {{claim:vllm.kv-pool.max-hit-length}}

Here are two caches for the prompt of the prediction. Each row is a group, each square one of the prompt's eleven blocks, and a filled square is a block that the group has cached. A mark under a row is an edge that the group accepts.

:::figure
src: figures/tr5a/l3-intersection.svg
alt: Two caches of the same prompt, with the edges that each of the three groups accepts marked under its row
description: Two panels, each with three rows of squares for the full group and the two sliding groups. In the first panel the full group has the first ten blocks cached, the first sliding group has the blocks numbered six to eight, and the second sliding group the blocks numbered seven to nine. The groups accept edges that overlap at one place, and a vertical line marks it. In the second panel the first sliding group is missing a block in the middle of its run, and the edges that the three groups accept have no place in common.
origin: generated
:::

In the first cache the full group accepts the edges 1 to 10, the first sliding group 8 and 9, and the second 9 and 10, so the hit is the edge 9, which is 144 tokens [derived]. In the second the first sliding group has lost a block in the middle of its run, and holds blocks 6, 7 and 9 [estimated]. It accepts only the edge 8, the second accepts 9 and 10, and no edge is common to all three, so the hit is 0 tokens [derived], though the full group holds 160 tokens and each sliding group holds blocks. Both tempting answers are wrong there. The union of the groups' longest hits is 160 tokens, which the first sliding group cannot serve, and the shortest of the groups' longest hits is 128 tokens, which the second cannot serve [derived]. A hit that a group cannot serve makes that group read blocks that are not there.

In the second prediction a state group accepts an edge when the one block before it is cached, so the three state groups accept the edges 3 and 6 [derived]. The full group accepts every edge up to 8, so the hit is the edge 6, which is 192 tokens [derived]. The same loop finds it, and a state group needs no run of blocks to accept an edge, only the one that holds its state.

SGLang gets to the same rule from the other side. Its unified radix cache holds the full, sliding-window and Mamba components in one tree, and the deepest node counts as a match only if every component's validator accepts it. {{claim:sglang.radix.unified-cache}} {{claim:sglang.radix.all-validators}} A tree of tokens and a pool of hashed blocks are different structures that answer one question the same way.

:::card
kind: isomorphism
title: Leapfrog intersection
body: A search engine answers an AND query by intersecting the posting lists of its terms, and the quick way never builds a list in full. Each list jumps to the first document it holds at or after the candidate, whichever list overshoots moves the candidate, and the loop ends when all of them agree. The hit loop is that, running down from the longest candidate.
breaks: Posting lists are fixed sets. Here a group's accepted edges depend on what the cache holds at that moment, and the same tokens in two groups are cached and evicted independently, so one group can lose an edge that another keeps.
:::

:::card
kind: warning
title: The union is not a hit
body: A hit that is the longest of any one group, or the shortest of the groups' longest, can name an edge that some group cannot serve. The answer is the largest edge that every group accepts, and it is zero when there is none.
:::

## What the rule does to eviction

One free queue serves every group, and four rules say who leaves it first. {{claim:vllm.hybrid-kv.one-lru}}

- A block joins the queue at the back when it has a hash and at the front when it has none. {{claim:vllm.kv-pool.free-order}}
- A request's blocks go back last block first, so that the tail of a prefix is evicted before its head. {{claim:vllm.kv-pool.free-reverse}}
- A new block takes the front of the queue, and loses its hash if it had one. {{claim:vllm.kv-pool.allocate-from-front}}
- A hit takes the pages it uses out of the queue, so a block that a request holds cannot be evicted. {{claim:vllm.kv-pool.touch}}

Put the hit rule on top of that order and each cached block has a price. Evicting the first block of a full group's prefix kills every hit that would have started from it, and evicting its tail only shortens them. A block deep inside a sliding group's long prefix is needed only by a request that shares just that part of the prefix, and a later turn of the same session resumes from the end. The blocks of the last window before that edge are vital, and evicting one of them, as in the second cache, can cost the whole hit. When a ticket needs room, `evict` asks you which cached pans to dump, and the rule above is what makes some of them dear.

:::card
kind: notional-machine
id: kv
:::

## Read it at the pin

The lookup is `HybridKVCacheCoordinator.find_longest_cache_hit` in [`kv_cache_coordinator.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_coordinator.py), and each kind of group scans for its own hit in its manager in [`single_type_kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/single_type_kv_cache_manager.py). vLLM's own tests run the lookup on groups of 2, 3 and 4 in many mixes [measured], in [`test_prefill_hybrid_model_combinations`](https://github.com/vllm-project/vllm/blob/v0.33.0/tests/v1/core/test_prefix_caching.py#L2397), and they are a good source of cases for your own checks. {{claim:vllm.hybrid-kv.upstream-hybrid-tests}} The design document still says that the coordinator handles exactly two groups. It was written at an earlier commit, and the code and the tests are the authority. {{claim:vllm.hybrid-kv.doc-two-groups}}

## Build

Stage four of the lab is this rule in Rust. `hit_all_groups` (`s4`) plays a prompt at your manager and judges the hit it finds against the longest edge that every group holds. A manager that returns the longest hit of any one group, a hit that covers the last token of the prompt, or one that ends inside a block fails it.

:::lab
id: hybrid-kv
lane: B
stages: [s4]
:::

## What to carry

- A hit is an edge that every group accepts: blocks `0` to `m - 1` for full attention, the window's blocks before the edge for a sliding group, the one state block for a state group.
- A window's accepted edges can have gaps, so the longest hit of the shortest group is not the answer. Loop until a pass changes nothing.
- A hit is a multiple of the least common multiple of the groups' block sizes, and it stops short of the last token.
- Evicting the head of a full group's prefix, or a window's blocks before the next edge, costs the most.

## Exit check

This lesson tests one skill: working out the longest prefix hit when every group must hold it, and saying why the answer is an intersection and not a union (`tr5a.hit-intersection`). The exit ticket is three items on fresh seeds, each a prompt with the blocks that every group holds, asking for the tokens the hit covers. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `evict` level then asks you to use the rule under pressure: a score of at least 0.95 [estimated] of the house's, on 3 fresh seeds [estimated] (ASSESSMENT §4.3). The lab's stage `hit_all_groups` grades the skill again on seeds drawn when you run it.

:::item
family: tr5a.hit-length
level: 2
count: 3
:::

:::game
id: pool
level: evict
mode: graded
:::
