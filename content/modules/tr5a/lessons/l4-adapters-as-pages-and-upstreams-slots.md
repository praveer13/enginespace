---
id: tr5a.l4
module: tr5a
title: "Adapters as pages: S-LoRA's design, and upstream's slots"
minutes: 110                      # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr5a.adapter-pages, tr5a.slots-vs-pages, tr5a.all-or-nothing]
builds_on: [ks:T6.L9, ks:t6.multi-lora-batching, ks:t6.lora-adapter-bytes, ks:t5.block-refcounts, ks:t1.allocator-contract]
status: review                    # draft | review | live
lanes: [B]
games: [pool]
labs: [hybrid-kv]
---

A phrase from descriptions of this topic, "adapter pages in the same pool", sounds like something the engines do. They do not. At the pins, vLLM keeps LoRA adapters in `max_loras` GPU slots outside the KV pool, with a CPU LRU behind them and an admission cap on the distinct adapters of a batch, and SGLang keeps them in a fixed-slot `LoRAMemoryPool`. {{claim:vllm.lora.slot-count}} {{claim:vllm.lora.cpu-cache}} {{claim:vllm.lora.cpu-lru}} {{claim:vllm.lora.admission-cap}} {{claim:sglang.lora.pool}} One pool for both is S-LoRA's design, from a paper, and it is the design you build in the lab. This lesson builds it, and then measures it against the slots that the engines actually use.

## S-LoRA's design

{{ks:T6.L9}} introduced S-LoRA, which serves many LoRA adapters from one base model. It keeps all the adapters in main memory and fetches the ones that running requests use into GPU memory. {{claim:kv.slora.cpu-catalog}} Its answer to where the GPU copies live is **Unified Paging**: one pool, with the adapters and the KV cache both kept in it as pages. {{claim:kv.slora.unified-paging}} Four rules make it a design and not a slogan, and the lab tests each.

1. **An adapter is a number of pages.** In the paper a page is one vector of the hidden size, so a KV tensor of `S` tokens takes `S` pages and an adapter of rank `R` takes `R`. {{claim:kv.slora.page-vector}} The course's pool has one page for a block of a group (D-045), which is a coarser grain, so an adapter takes `ceil(adapter bytes / page bytes)` pages. The other rules do not depend on the grain.
2. **The pages need not be together.** The KV caches and the adapter weights sit in the pool interleaved and non-contiguous, so an adapter of any rank fits wherever the free pages are. {{claim:kv.slora.non-contiguous}}
3. **An adapter is shared and stays while it is used.** Every request on an adapter shares its pages, the adapter cannot be unloaded while one runs, and a request can run only when its adapter is resident. Unloading it returns its pages to the pool and touches no KV page.
4. **An admit or a load takes all of its pages or none.** A load needs every page of the adapter, and an admit needs a page for each block that its request holds in each group. If the pool can supply some but not all, the operation is refused and the pool is left exactly as it was.

The last two rules are the course's own. They are what makes the pool correct, and the lab's checks test them. S-LoRA also prefetches: while one batch runs it predicts the adapters of the next from the waiting queue and loads them into available memory. {{claim:kv.slora.prefetch-next-batch}} That is the game's `prefetch` action, bringing a recipe kit in before its ticket hangs.

## What an adapter costs in pages

A LoRA adapter has a down matrix and an up matrix for each projection it adapts, `rank × hidden` weights each, so its bytes are `2 × rank × hidden × projections × layers × bytes per weight`. The course's synthetic adapter has a hidden size of 256, 16 layers, 4 projections and 2-byte weights [estimated], which makes 65,536 bytes for each unit of rank [derived]. Commit to one prediction before you play `adapters`.

:::predict
id: tr5a.l4.p1
prompt: The pool's pages are 163,840 bytes each [estimated], and an adapter weighs 65,536 bytes for each unit of its rank [estimated]. How many pages does an adapter of rank 16 [estimated] take from the pool?
answer: { kind: numeric, unit: pages, rel_tol: 0 }
reveal: after-game
kcs: [tr5a.adapter-pages]
:::

In The Reach-In an adapter is a **recipe kit**, whose pans come from the same reach-in as the tickets', and a kit stays while a ticket that uses it is waiting or on the line. Bringing a kit in is `prefetch`, and a ticket hangs only when its kit has landed.

:::game
id: pool
level: adapters
mode: practice
:::

The model of `two-kinds` has pages of 10 layers × 16 tokens × 1,024 bytes, which is 163,840 bytes [derived], and these are the adapters of the level and of the lab:

| Rank [estimated] | Bytes [derived] | Pages [derived] | Empty in the last page, bytes [derived] | Empty, share of its pages [derived] |
|---|---|---|---|---|
| 8 | 524,288 | 4 | 131,072 | 20% |
| 16 | 1,048,576 | 7 | 98,304 | 8.6% |
| 64 | 4,194,304 | 26 | 65,536 | 1.5% |

An adapter wastes at most the empty part of its last page, however large it is. Its pages are shared by every request on it, and its identity is an extra key in the hashes of those requests' blocks, in vLLM and in the course's model alike, so the same tokens under two adapters are two blocks and never share a hit. {{claim:vllm.kv-hash.lora-extra-key}}

## All or nothing

Two operations take many pages at once. A load takes every page of an adapter, and an admit takes a page for each block that the request holds in each of its groups, and only when the adapter it names is resident. Both are all or nothing, which is the rule of kernelspace's `lab 02`, and its optional adapter check is what this module extends. {{claim:kv.kernelspace.lab02-adapter-check}} Work out everything that the operation needs first, refuse it if the pool cannot supply that, and only then take a page. {{claim:kv.kernelspace.lab02-all-or-nothing}} A refusal says why, `no-pages` when the pool is short and `no-adapter` when the adapter is not resident, and it leaves the state as it was, so a retry sees the same pool. The reason is that a half-done operation leaks: the pages it took before it failed belong to no request, and every retry finds a smaller pool.

The model is stricter than the engine in one place that matters here. vLLM frees the blocks that a sliding window has left behind before it checks whether the new blocks fit, and keeps them freed when the request does not fit, so its allocation as a whole is not all or nothing. {{claim:vllm.kv-pool.skipped-freed-first}} The model does not copy that, because a lab that let a refused operation change the pool could not tell a leak from a design.

## Upstream's slots

vLLM at v0.33.0:

- It has `max_loras` slots, which default to {{claim:vllm.lora.max-loras-default}}, and every slot is sized for the largest rank an adapter may have, `max_lora_rank`, which defaults to {{claim:vllm.lora.max-rank-default}}.
- Each LoRA layer allocates the A and B matrices of all its slots at once, as zeros, a stack that is `max_loras` deep and `max_lora_rank` wide, whatever the rank of the adapter that will sit in a slot. {{claim:vllm.lora.stacked-max-rank}}
- The layers are created when the LoRA manager is built, and not when an adapter arrives. {{claim:vllm.lora.layer-built-with-slots}} {{claim:vllm.lora.slots-built-at-init}}
- An adapter of a lower rank is copied into the first rows and columns of its slot, and the rest of the slot stays zero. {{claim:vllm.lora.smaller-adapter-in-slot}}
- Adapters beyond the slots wait in a CPU cache, and an LRU over the slots evicts the oldest active adapter when all of them are in use. {{claim:vllm.lora.lru-slots}}
- The scheduler skips a waiting request whose adapter is not already in the batch once the distinct adapters of the batch reach `max_loras`, so a cap on adapters is part of admission. {{claim:vllm.lora.admission-cap}}
- With the active-adapter specialization, which is off by default, it also captures a graph for each count of active adapters up to `max_loras`, so the slot count reaches TR2's dispatch keys as well. {{claim:vllm.cudagraph.lora-count-specialize}}

SGLang at v0.5.23 has the same shape:

- Its pool has `max_loras_per_batch` slots, which default to {{claim:sglang.lora.max-loras-per-batch}}.
- It allocates the buffer of each module as zeros at the pool's `max_lora_rank`, with the slots as the first dimension, and it does not support an adapter whose rank is above that. {{claim:sglang.lora.slot-shape}} {{claim:sglang.lora.buffers-max-rank}} {{claim:sglang.lora.rank-cap}}
- It takes an empty slot first, and when the pool is full it evicts by a policy, which is `lru` by default. {{claim:sglang.lora.slot-search}} {{claim:sglang.lora.eviction-default}}

Both engines provision memory up front, sized for the largest adapter they will accept, and share it out in a fixed number of slots. The price of fixing it is the part of a slot that its adapter does not fill. Commit to this number before you read on.

:::predict
id: tr5a.l4.p2
prompt: A deployment sets `max_lora_rank` to 64 [estimated], so every slot is sized for rank 64. An adapter of rank 8 [estimated] sits in one of the slots. What share of that slot is unused, in percent?
answer: { kind: numeric, unit: percent, rel_tol: 0.02 }
reveal: after-game
kcs: [tr5a.slots-vs-pages]
:::

:::figure
src: figures/tr5a/l4-slot-width.svg
alt: Three adapters of different ranks drawn as the pages they take, each beside the width of a slot sized for the largest rank
description: Three rows of small squares, one for each rank, each as wide as a slot sized for the largest. In each row the squares that the adapter's pages fill are solid, and the rest of the slot's width is dashed and empty. The smallest adapter fills a small part of its row, the middle one a little more, and the largest fills it.
origin: generated
:::

## Measured against the slots

The Reach-In's `adapters` level plays one night four ways, all by the house. The adapters are pages in the pool, or they sit on a shelf of fixed slots outside it, as the engines keep them: one slot, as vLLM's default, or two, enough for both adapters.

The shelf as the debrief draws it costs no pages, and a real slot does cost memory. It is as wide as the biggest adapter, which is 26 pages here [derived], and it comes out of the same GPU, so the fourth way takes two such slots out of the pool before the night starts.

The price of a night is the tokens recomputed, plus 24 for each step that a request stalled for its adapter [estimated]. The debrief's words for the same counts are tokens prepped again and steps waited for a kit. Measured by the course's sim on 2026-11-05 at `c98a353`, with the level's practice seed `0`.

| The adapters are | Pages left [measured] | Tokens recomputed [measured] | Stall steps [measured] | Price [measured] |
|---|---|---|---|---|
| pages in the pool | 160 | 1,082 | 2 | 1,130 |
| one slot, outside it | 160 | 1,018 | 9 | 1,234 |
| two slots, outside it | 160 | 1,018 | 2 | 1,066 |
| two slots, paid for first | 108 | 1,322 | 2 | 1,370 |

On the first eight seeds that the level's band accepts [estimated], the prices of the eight nights add up to 11,031 for pages, 12,759 for one slot, 9,799 for two free slots and 14,951 for two slots that are paid for first [measured]. One slot costs less than pages on 0 of the eight nights, two free slots on 7, and the paid pair on 0 [measured]. A pair of slots that has to be paid for costs 36% more than pages over the eight [derived]. It is a synthetic world, and it measures the ideas and no engine. The S-LoRA paper has a headline of its own, a throughput gain over the baselines of its day. {{claim:kv.slora.headline-results}}

:::card
kind: warning
title: The paper's baseline is not the pin
body: The S-LoRA paper reports up to 4 times the throughput of vLLM with naive support for LoRA serving [measured]. That is the authors' own run, against a vLLM with naive support for LoRA and not the pinned one, and the course has not reproduced it. The baseline here is the slot design of the pinned engines, in a synthetic world.
:::

## When slots are enough

Slots win when they are enough and they are free. With as many slots as the batch has distinct adapters, an adapter costs no pages and never waits for a slot, and that is the third row. They lose in three ways, and each is in the table.

- **Too few slots.** One slot and two adapters means that a request for the other adapter stalls while an adapter is swapped in, 9 steps against 2 [measured].
- **Slots are as wide as the widest adapter.** A rank-8 adapter in a slot sized for rank 64 uses an eighth of it, and the slot's other 87.5% [derived] is idle, so a deployment that mixes ranks pays for the largest in every slot. {{claim:vllm.lora.stacked-max-rank}}
- **Slots are paid for before the first request.** The memory they hold is memory the KV pool never has, whether or not an adapter is loaded, which is the fourth row.

A pool pays for what is loaded, and gives it back. It costs something too. Its adapters compete with cached prefix blocks, and bringing an adapter in too early can evict pages that a waiting request stood on, which is what the debrief of `adapters` says when the cached pans paid for a kit. S-LoRA's pool takes all the space except for the weights and the activations, and lets the cache and the adapters share it. {{claim:kv.slora.static-pool}} So slots are enough when the distinct adapters of a batch are few, near each other in rank, and known in advance. Pages pay when the adapters are many, their ranks differ, and the load moves.

:::card
kind: isomorphism
title: A fixed thread pool and a shared heap
body: A fixed number of worker threads, each with a stack sized for the worst case, is a slot design. A shared heap that gives out what a request needs and takes it back when the request ends is a page design. The thread pool is simple and predictable, and wastes most of every stack. The heap uses what is asked and has to answer for fragmentation and for a request that cannot be served.
breaks: A thread's stack sits idle when its thread does, but a slot's tensors are read by the kernels, and in vLLM with the active-adapter specialization on, the number of active adapters picks the CUDA graph that replays. A slot count can be part of how the engine is captured and scheduled, and not only a memory limit, so moving to pages would change more than the allocator.
:::

:::card
kind: notional-machine
id: kv
:::

## Read it at the pin

The paper's section on [Unified Paging](https://arxiv.org/html/2311.03285v3#S5.SS1) is short and worth reading beside this lesson, with [prefetching](https://arxiv.org/html/2311.03285v3#S5.SS2) after it. The slots are in a few files at the pins. vLLM's are [`config/lora.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py) for the defaults, [`lora/model_manager.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py) for the two LRU caches and [`lora/layers/base_linear.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/layers/base_linear.py) for the stacks, and its cap on the adapters of a batch is in [`scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py). SGLang's pool is [`lora/mem_pool.py`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py). Search each for `max_lora_rank` and see where it sizes a tensor.

## Build

The last two stages of the lab are this lesson's. `adapter_pages` (`s5`) loads and unloads adapters in the same pool as the KV, shares their pages among the requests that use them, and refuses an unload while a request runs on one. `gauntlet` (`s6`) plays everything of the lab at once, about 2,000 seeded operations [estimated] on four pools, and checks the invariants after each: pages conserved, counts never below zero, tables that follow their group's rule, the cache and the queue, adapters and their users, and every block stored or removed published exactly once.

That last check is about events. Every block that enters or leaves the cache is published as a `BlockStored` or a `BlockRemoved`, in the shape of vLLM's events, so that a consumer can rebuild the cache from the stream alone. {{claim:vllm.kv-events.batch}} {{claim:vllm.kv-events.block-stored}} {{claim:vllm.kv-events.block-removed}} A router or a connector reads that stream, and TR5b builds that side.

:::lab
id: hybrid-kv
lane: B
stages: [s5, s6]
:::

## What to carry

- An adapter takes `ceil(bytes / page bytes)` pages of the same pool, stored anywhere, shared by its requests, and kept while one runs.
- An admit or a load takes everything it needs or nothing, and a refusal leaves the pool as it was.
- Upstream does not do this. vLLM and SGLang keep adapters in fixed slots outside the KV pool, sized for the largest rank they accept.
- Slots are enough when the adapters in play are few, alike in rank and known. Pages pay when they are many, differ, and change.

## Exit check

This lesson tests three skills: working out how many pages an adapter takes, and what must be resident for a request to run (`tr5a.adapter-pages`), comparing slots with pages and saying when slots are enough (`tr5a.slots-vs-pages`), and saying why an admit or a load takes all of its pages or none, and what a refused one leaves behind (`tr5a.all-or-nothing`). The exit ticket is three items on fresh seeds, two on the pages an adapter takes and one on slots against pages. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `adapters` level then plays the pool against the shelf, and the graded `manager` level draws its model from its seed and plays everything in the module at once. Each asks for a score of at least 0.95 [estimated] of the house's, on 3 fresh seeds [estimated] (ASSESSMENT §4.3).

:::item
family: tr5a.pages-for-adapter
level: 2
count: 2
:::

:::item
family: tr5a.slots-vs-pages
level: 2
count: 1
:::

:::game
id: pool
level: adapters
mode: graded
:::

:::game
id: pool
level: manager
mode: graded
:::
