# Adapters as pages: S-LoRA's design, and upstream's slots

_Hybrid KV groups, and adapter pages in one pool · lesson `tr5a.l4` · review · about 110 minutes [estimated]_

Builds on kernelspace: `ks:T6.L9`, `ks:t6.multi-lora-batching`, `ks:t6.lora-adapter-bytes`, `ks:t5.block-refcounts`, `ks:t1.allocator-contract`.

Knowledge components: `tr5a.adapter-pages`, `tr5a.slots-vs-pages`, `tr5a.all-or-nothing`.

A phrase from descriptions of this topic, "adapter pages in the same pool", sounds like something the engines do. They do not. At the pins, vLLM keeps LoRA adapters in `max_loras` GPU slots outside the KV pool, with a CPU LRU behind them and an admission cap on the distinct adapters of a batch, and SGLang keeps them in a fixed-slot `LoRAMemoryPool`. **lora_slots = max_loras** [measured] **max_cpu_loras = max_loras** [measured] **LRU caches of max_cpu_loras and max_loras** [measured] **distinct adapters at most max_loras** [measured] **a fixed-slot pool** [measured] One pool for both is S-LoRA's design, from a paper, and it is the design you build in the lab. This lesson builds it, and then measures it against the slots that the engines actually use.

## S-LoRA's design

kernelspace T6.L9 introduced S-LoRA, which serves many LoRA adapters from one base model. It keeps all the adapters in main memory and fetches the ones that running requests use into GPU memory. **all adapters in main memory** [measured] Its answer to where the GPU copies live is **Unified Paging**: one pool, with the adapters and the KV cache both kept in it as pages. **Unified Paging** [measured] Four rules make it a design and not a slogan, and the lab tests each.

1. **An adapter is a number of pages.** In the paper a page is one vector of the hidden size, so a KV tensor of `S` tokens takes `S` pages and an adapter of rank `R` takes `R`. **a page is one vector of the hidden size** [measured] The course's pool has one page for a block of a group (D-045), which is a coarser grain, so an adapter takes `ceil(adapter bytes / page bytes)` pages. The other rules do not depend on the grain.
2. **The pages need not be together.** The KV caches and the adapter weights sit in the pool interleaved and non-contiguous, so an adapter of any rank fits wherever the free pages are. **interleaved and non-contiguous** [measured]
3. **An adapter is shared and stays while it is used.** Every request on an adapter shares its pages, the adapter cannot be unloaded while one runs, and a request can run only when its adapter is resident. Unloading it returns its pages to the pool and touches no KV page.
4. **An admit or a load takes all of its pages or none.** A load needs every page of the adapter, and an admit needs a page for each block that its request holds in each group. If the pool can supply some but not all, the operation is refused and the pool is left exactly as it was.

The last two rules are the course's own. They are what makes the pool correct, and the lab's checks test them. S-LoRA also prefetches: while one batch runs it predicts the adapters of the next from the waiting queue and loads them into available memory. **predict the next batch from the waiting queue** [measured] That is the game's `prefetch` action, bringing a recipe kit in before its ticket hangs.

## What an adapter costs in pages

A LoRA adapter has a down matrix and an up matrix for each projection it adapts, `rank × hidden` weights each, so its bytes are `2 × rank × hidden × projections × layers × bytes per weight`. The course's synthetic adapter has a hidden size of 256, 16 layers, 4 projections and 2-byte weights [estimated], which makes 65,536 bytes for each unit of rank [derived]. Commit to one prediction before you play `adapters`.

> **Predict `tr5a.l4.p1`.** The pool's pages are 163,840 bytes each [estimated], and an adapter weighs 65,536 bytes for each unit of its rank [estimated]. How many pages does an adapter of rank 16 [estimated] take from the pool?
>
> The learner commits to a number in `pages`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

In The Reach-In an adapter is a **recipe kit**, whose pans come from the same reach-in as the tickets', and a kit stays while a ticket that uses it is waiting or on the line. Bringing a kit in is `prefetch`, and a ticket hangs only when its kit has landed.

> **Play.** The game `pool`, level `adapters`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

The model of `two-kinds` has pages of 10 layers × 16 tokens × 1,024 bytes, which is 163,840 bytes [derived], and these are the adapters of the level and of the lab:

| Rank [estimated] | Bytes [derived] | Pages [derived] | Empty in the last page, bytes [derived] | Empty, share of its pages [derived] |
|---|---|---|---|---|
| 8 | 524,288 | 4 | 131,072 | 20% |
| 16 | 1,048,576 | 7 | 98,304 | 8.6% |
| 64 | 4,194,304 | 26 | 65,536 | 1.5% |

An adapter wastes at most the empty part of its last page, however large it is. Its pages are shared by every request on it, and its identity is an extra key in the hashes of those requests' blocks, in vLLM and in the course's model alike, so the same tokens under two adapters are two blocks and never share a hit. **("lora", name, path)** [measured]

## All or nothing

Two operations take many pages at once. A load takes every page of an adapter, and an admit takes a page for each block that the request holds in each of its groups, and only when the adapter it names is resident. Both are all or nothing, which is the rule of kernelspace's `lab 02`, and its optional adapter check is what this module extends. **adapter_unified_paging** [measured] Work out everything that the operation needs first, refuse it if the pool cannot supply that, and only then take a page. **all or nothing** [measured] A refusal says why, `no-pages` when the pool is short and `no-adapter` when the adapter is not resident, and it leaves the state as it was, so a retry sees the same pool. The reason is that a half-done operation leaks: the pages it took before it failed belong to no request, and every retry finds a smaller pool.

The model is stricter than the engine in one place that matters here. vLLM frees the blocks that a sliding window has left behind before it checks whether the new blocks fit, and keeps them freed when the request does not fit, so its allocation as a whole is not all or nothing. **before the capacity check** [measured] The model does not copy that, because a lab that let a refused operation change the pool could not tell a leak from a design.

## Upstream's slots

vLLM at v0.33.0:

- It has `max_loras` slots, which default to **1 slots** [measured], and every slot is sized for the largest rank an adapter may have, `max_lora_rank`, which defaults to **16 rank** [measured].
- Each LoRA layer allocates the A and B matrices of all its slots at once, as zeros, a stack that is `max_loras` deep and `max_lora_rank` wide, whatever the rank of the adapter that will sit in a slot. **max_loras x max_lora_rank** [measured]
- The layers are created when the LoRA manager is built, and not when an adapter arrives. **create_lora_weights(max_loras, ...)** [measured] **when the LoRA manager is built** [measured]
- An adapter of a lower rank is copied into the first rows and columns of its slot, and the rest of the slot stays zero. **the first rows and columns of its slot** [measured]
- Adapters beyond the slots wait in a CPU cache, and an LRU over the slots evicts the oldest active adapter when all of them are in use. **LRU over the slots** [measured]
- The scheduler skips a waiting request whose adapter is not already in the batch once the distinct adapters of the batch reach `max_loras`, so a cap on adapters is part of admission. **distinct adapters at most max_loras** [measured]
- With the active-adapter specialization, which is off by default, it also captures a graph for each count of active adapters up to `max_loras`, so the slot count reaches TR2's dispatch keys as well. **false** [measured]

SGLang at v0.5.23 has the same shape:

- Its pool has `max_loras_per_batch` slots, which default to **8 slots** [measured].
- It allocates the buffer of each module as zeros at the pool's `max_lora_rank`, with the slots as the first dimension, and it does not support an adapter whose rank is above that. **(max_loras_per_batch, max_lora_dim x c, input_dim)** [measured] **allocated at max_lora_rank** [measured] **rank at most max_lora_rank** [measured]
- It takes an empty slot first, and when the pool is full it evicts by a policy, which is `lru` by default. **empty slot first, then evict** [measured] **lru** [measured]

Both engines provision memory up front, sized for the largest adapter they will accept, and share it out in a fixed number of slots. The price of fixing it is the part of a slot that its adapter does not fill. Commit to this number before you read on.

> **Predict `tr5a.l4.p2`.** A deployment sets `max_lora_rank` to 64 [estimated], so every slot is sized for rank 64. An adapter of rank 8 [estimated] sits in one of the slots. What share of that slot is unused, in percent?
>
> The learner commits to a number in `percent`, graded within a relative tolerance of `0.02` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

![Three adapters of different ranks drawn as the pages they take, each beside the width of a slot sized for the largest rank](../../figures/tr5a/l4-slot-width.svg)

_Three rows of small squares, one for each rank, each as wide as a slot sized for the largest. In each row the squares that the adapter's pages fill are solid, and the rest of the slot's width is dashed and empty. The smallest adapter fills a small part of its row, the middle one a little more, and the largest fills it._

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

On the first eight seeds that the level's band accepts [estimated], the prices of the eight nights add up to 11,031 for pages, 12,759 for one slot, 9,799 for two free slots and 14,951 for two slots that are paid for first [measured]. One slot costs less than pages on 0 of the eight nights, two free slots on 7, and the paid pair on 0 [measured]. A pair of slots that has to be paid for costs 36% more than pages over the eight [derived]. It is a synthetic world, and it measures the ideas and no engine. The S-LoRA paper has a headline of its own, a throughput gain over the baselines of its day. **up to 4 times** [measured]

> **The paper's baseline is not the pin.** The S-LoRA paper reports up to 4 times the throughput of vLLM with naive support for LoRA serving [measured]. That is the authors' own run, against a vLLM with naive support for LoRA and not the pinned one, and the course has not reproduced it. The baseline here is the slot design of the pinned engines, in a synthetic world.

## When slots are enough

Slots win when they are enough and they are free. With as many slots as the batch has distinct adapters, an adapter costs no pages and never waits for a slot, and that is the third row. They lose in three ways, and each is in the table.

- **Too few slots.** One slot and two adapters means that a request for the other adapter stalls while an adapter is swapped in, 9 steps against 2 [measured].
- **Slots are as wide as the widest adapter.** A rank-8 adapter in a slot sized for rank 64 uses an eighth of it, and the slot's other 87.5% [derived] is idle, so a deployment that mixes ranks pays for the largest in every slot. **max_loras x max_lora_rank** [measured]
- **Slots are paid for before the first request.** The memory they hold is memory the KV pool never has, whether or not an adapter is loaded, which is the fourth row.

A pool pays for what is loaded, and gives it back. It costs something too. Its adapters compete with cached prefix blocks, and bringing an adapter in too early can evict pages that a waiting request stood on, which is what the debrief of `adapters` says when the cached pans paid for a kit. S-LoRA's pool takes all the space except for the weights and the activations, and lets the cache and the adapters share it. **one buffer, everything but the weights and the activations** [measured] So slots are enough when the distinct adapters of a batch are few, near each other in rank, and known in advance. Pages pay when the adapters are many, their ranks differ, and the load moves.

> **A fixed thread pool and a shared heap.** A fixed number of worker threads, each with a stack sized for the worst case, is a slot design. A shared heap that gives out what a request needs and takes it back when the request ends is a page design. The thread pool is simple and predictable, and wastes most of every stack. The heap uses what is asked and has to answer for fragmentation and for a request that cannot be served.
>
> Where it breaks: A thread's stack sits idle when its thread does, but a slot's tensors are read by the kernels, and in vLLM with the active-adapter specialization on, the number of active adapters picks the CUDA graph that replays. A slot count can be part of how the engine is captured and scheduled, and not only a memory limit, so moving to pages would change more than the allocator.

> **Card.** The notional-machine card `kv`.

## Read it at the pin

The paper's section on [Unified Paging](https://arxiv.org/html/2311.03285v3#S5.SS1) is short and worth reading beside this lesson, with [prefetching](https://arxiv.org/html/2311.03285v3#S5.SS2) after it. The slots are in a few files at the pins. vLLM's are [`config/lora.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py) for the defaults, [`lora/model_manager.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py) for the two LRU caches and [`lora/layers/base_linear.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/layers/base_linear.py) for the stacks, and its cap on the adapters of a batch is in [`scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py). SGLang's pool is [`lora/mem_pool.py`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py). Search each for `max_lora_rank` and see where it sizes a tensor.

## Build

The last two stages of the lab are this lesson's. `adapter_pages` (`s5`) loads and unloads adapters in the same pool as the KV, shares their pages among the requests that use them, and refuses an unload while a request runs on one. `gauntlet` (`s6`) plays everything of the lab at once, about 2,000 seeded operations [estimated] on four pools, and checks the invariants after each: pages conserved, counts never below zero, tables that follow their group's rule, the cache and the queue, adapters and their users, and every block stored or removed published exactly once.

That last check is about events. Every block that enters or leaves the cache is published as a `BlockStored` or a `BlockRemoved`, in the shape of vLLM's events, so that a consumer can rebuild the cache from the stream alone. **[ts, events, data_parallel_rank]** [measured] **15 fields** [measured] **5 fields** [measured] A router or a connector reads that stream, and TR5b builds that side.

> **Build.** The lab `hybrid-kv` (lane B), stages `s5`, `s6`. The lab page grades it.

## What to carry

- An adapter takes `ceil(bytes / page bytes)` pages of the same pool, stored anywhere, shared by its requests, and kept while one runs.
- An admit or a load takes everything it needs or nothing, and a refusal leaves the pool as it was.
- Upstream does not do this. vLLM and SGLang keep adapters in fixed slots outside the KV pool, sized for the largest rank they accept.
- Slots are enough when the adapters in play are few, alike in rank and known. Pages pay when they are many, differ, and change.

## Exit check

This lesson tests three skills: working out how many pages an adapter takes, and what must be resident for a request to run (`tr5a.adapter-pages`), comparing slots with pages and saying when slots are enough (`tr5a.slots-vs-pages`), and saying why an admit or a load takes all of its pages or none, and what a refused one leaves behind (`tr5a.all-or-nothing`). The exit ticket is three items on fresh seeds, two on the pages an adapter takes and one on slots against pages. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `adapters` level then plays the pool against the shelf, and the graded `manager` level draws its model from its seed and plays everything in the module at once. Each asks for a score of at least 0.95 [estimated] of the house's, on 3 fresh seeds [estimated] (ASSESSMENT §4.3).

> **Practice.** Items from the generator family `tr5a.pages-for-adapter`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr5a.slots-vs-pages`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Play.** The game `pool`, level `adapters`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Play.** The game `pool`, level `manager`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Claims cited

- `kv.kernelspace.lab02-adapter-check`: kernelspace's lab 02 has an optional advanced check, adapter_unified_paging. It asks the manager to place adapter pages and sequence KV in the same finite pool, to fail atomically under pressure, and to reclaim each lifetime independently. Value adapter_unified_paging [measured], checked 2026-11-05 (source: kernelspace T6.L9, Multi-LoRA Serving, the closing paragraph (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/lessons-md/t6.l9.md#L145>, read 2026-11-05).
- `kv.kernelspace.lab02-all-or-nothing`: kernelspace's lab 02, the block manager, asks for every operation to be all or nothing. If the pool cannot satisfy an operation, the manager returns false and leaves all state untouched, because half-applied allocations are how production engines corrupt themselves. Value all or nothing [measured], checked 2026-11-05 (source: kernelspace labs/kv-block-manager/src/lib.rs, the model of lab 02 (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/labs/kv-block-manager/src/lib.rs#L22-L24>, read 2026-11-05).
- `kv.slora.cpu-catalog`: S-LoRA keeps all its adapters in main memory and fetches the adapters that the running queries use into GPU memory. Value all adapters in main memory [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, abstract <https://arxiv.org/html/2311.03285v3>, read 2026-11-05).
- `kv.slora.headline-results`: The S-LoRA paper reports a throughput up to 4 times that of HuggingFace PEFT and of vLLM with naive support of LoRA serving, and several orders of magnitude more adapters served. The comparison is the authors' own, against a vLLM with naive support of LoRA serving and not the pinned engine, and the course has not reproduced it. Value up to 4 times [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, abstract <https://arxiv.org/html/2311.03285v3>, read 2026-11-05).
- `kv.slora.non-contiguous`: S-LoRA stores KV caches and adapter weights in its pool interleaved and non-contiguously, which the authors say significantly reduces fragmentation and lets adapters of different ranks live beside KV caches that keep changing size. Value interleaved and non-contiguous [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, section 5.1 (Unified Paging) <https://arxiv.org/html/2311.03285v3#S5.SS1>, read 2026-11-05).
- `kv.slora.page-vector`: In S-LoRA's unified pool each page is one vector of the hidden size. A KV cache tensor with a sequence length of S uses up S pages, and a LoRA weight tensor of rank R takes up R pages. Value a page is one vector of the hidden size [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, section 5.1 (Unified Paging) <https://arxiv.org/html/2311.03285v3#S5.SS1>, read 2026-11-05).
- `kv.slora.prefetch-next-batch`: While S-LoRA runs the current decoding batch, it predicts the adapters that the next batch needs from the waiting queue, and prefetches them into available memory, so that most of them are in place before the batch runs. Value predict the next batch from the waiting queue [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, section 5.2 (Prefetching and Overlapping) <https://arxiv.org/html/2311.03285v3#S5.SS2>, read 2026-11-05).
- `kv.slora.static-pool`: S-LoRA allocates one large buffer statically for its pool. The buffer takes all the space except what the base model's weights and the temporary activations occupy, and KV caches and adapter weights then share it. Value one buffer, everything but the weights and the activations [measured], checked 2026-11-05 (source: Sheng et al., S-LoRA, arXiv 2311.03285v3, section 5.1 (Unified Paging) <https://arxiv.org/html/2311.03285v3#S5.SS1>, read 2026-11-05).
- `kv.slora.unified-paging`: S-LoRA keeps adapter weights and KV cache tensors in one unified memory pool, which its authors call Unified Paging. The pool holds adapters of different ranks and KV tensors of varying sequence lengths. Value Unified Paging [measured], checked 2026-11-04 (source: Sheng et al., S-LoRA, Serving Thousands of Concurrent LoRA Adapters, arXiv 2311.03285v3, abstract <https://arxiv.org/abs/2311.03285v3>, read 2026-11-04).
- `sglang.lora.buffers-max-rank`: SGLang's pool allocates the buffer of each module as zeros, with the shape function called with the pool's max_lora_rank, so that every slot is as wide as the largest adapter the pool will accept. Value allocated at max_lora_rank [measured], checked 2026-11-05 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool.init_buffers (init_buffer) <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L668-L682>, read 2026-11-05).
- `sglang.lora.eviction-default`: The adapter eviction policy is lru by default, with fifo as the other choice. Value lru [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/fields/lora.py, lora_eviction_policy <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/fields/lora.py#L70-L76>, read 2026-11-04).
- `sglang.lora.max-loras-per-batch`: SGLang's LoRAMemoryPool has max_loras_per_batch slots, which default to 8 at v0.5.23. The count includes a base-only request. Value 8 slots [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/fields/lora.py, max_loras_per_batch <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/fields/lora.py#L66-L69>, read 2026-11-04).
- `sglang.lora.pool`: SGLang keeps adapters in LoRAMemoryPool, a pool of max_loras_per_batch buffer slots that maps each slot to an adapter or to an empty marker. It is not a page pool shared with the KV cache. Value a fixed-slot pool [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L131-L132>, read 2026-11-04).
- `sglang.lora.rank-cap`: SGLang's pool cannot support an adapter whose rank is above the pool's max_lora_rank, and refuses it. Value rank at most max_lora_rank [measured], checked 2026-11-05 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool.can_support (_can_support) <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L244-L249>, read 2026-11-05).
- `sglang.lora.slot-search`: To place an adapter the pool takes an empty slot first. When the pool is full it picks a victim among the adapters that the current batch does not need and that are not pinned, by the eviction policy, and prefers evicting a real adapter to evicting the base model. Value empty slot first, then evict [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool.prepare_lora_batch <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L792-L843>, read 2026-11-04).
- `sglang.lora.slot-shape`: The shape of an adapter buffer in SGLang's pool has max_loras_per_batch slots as its first dimension, then a rank dimension that is max_lora_dim times a stacking factor, then the input dimension. Value (max_loras_per_batch, max_lora_dim x c, input_dim) [measured], checked 2026-11-05 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool._get_standard_shape <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L408-L422>, read 2026-11-05).
- `vllm.cudagraph.lora-count-specialize`: A second switch, specialize_active_lora, is off by default. When it is on, vLLM captures separate graphs for different counts of active adapters, in powers of 2 up to max_loras, which can help variable LoRA use at the cost of start time and memory. Value false [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/lora.py, specialize_active_lora <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py#L67-L73>, read 2026-11-04).
- `vllm.kv-events.batch`: A KV event batch is an array-like struct of a timestamp, a list of events and an optional data-parallel rank. KVEventBatch narrows the events to BlockStored, BlockRemoved and AllBlocksCleared. Value [ts, events, data_parallel_rank] [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/distributed/kv_events.py, EventBatch <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/distributed/kv_events.py#L31-L39>, read 2026-11-04).
- `vllm.kv-events.block-removed`: BlockRemoved has 5 fields, block_hashes, medium, and the optional group_idx, locality and ownership. Value 5 fields [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/distributed/kv_events.py, BlockRemoved <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/distributed/kv_events.py#L123-L130>, read 2026-11-04).
- `vllm.kv-events.block-stored`: BlockStored has 15 fields. Seven have no default, block_hashes, parent_block_hash, token_ids, block_size, lora_id (deprecated), medium and lora_name. Eight are optional, extra_keys, group_idx, kv_cache_spec_kind, kv_cache_spec_sliding_window, locality, ownership, session_id and lookahead_token_ids. A store carries the cache-spec kind of its group so that a consumer can classify groups as it learns them. Value 15 fields [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/distributed/kv_events.py, BlockStored <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/distributed/kv_events.py#L56-L98>, read 2026-11-04).
- `vllm.kv-hash.lora-extra-key`: A request's LoRA adapter is part of its block hashes. The extra key is the tuple of the tag lora, the adapter's name and its path, so the same tokens under two adapters, or under one name re-pointed at another path, do not share cached blocks. Value ("lora", name, path) [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_utils.py, _gen_lora_extra_hash_keys <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_utils.py#L590-L607>, read 2026-11-04).
- `vllm.kv-pool.skipped-freed-first`: vLLM frees the blocks that a sliding window has left behind before it checks whether the new blocks fit, and keeps them freed even when the request then cannot be scheduled. The allocation as a whole is not all or nothing. Value before the capacity check [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_manager.py, KVCacheManager.allocate_slots <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_manager.py#L555-L568>, read 2026-11-04).
- `vllm.lora.admission-cap`: The scheduler skips a waiting request whose adapter is not already scheduled once the distinct adapters in the batch reach max_loras. The request waits, so an adapter cap is part of admission. Value distinct adapters at most max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1091-L1102>, read 2026-11-04).
- `vllm.lora.cpu-cache`: vLLM keeps up to max_cpu_loras adapters in CPU memory. The value defaults to max_loras and may not be smaller than it. Value max_cpu_loras = max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/lora.py, LoRAConfig._validate_lora_config <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py#L121-L127>, read 2026-11-04).
- `vllm.lora.cpu-lru`: The LoRA model manager keeps its registered adapters, which max_cpu_loras caps, in an LRU cache of that capacity, and its active adapters, which max_loras caps, in a second LRU cache. Value LRU caches of max_cpu_loras and max_loras [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LoRAModelManager.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L113-L119>, read 2026-11-05).
- `vllm.lora.layer-built-with-slots`: When vLLM wraps a module in a LoRA layer, it creates the layer's weights at once for max_loras slots, in the same call. Value create_lora_weights(max_loras, ...) [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/utils.py, from_layer <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/utils.py#L113-L130>, read 2026-11-05).
- `vllm.lora.lru-slots`: The LRUCacheLoRAModelManager manages the adapters with an LRU cache. When all slots are in use, it evicts the oldest active adapter before it activates a new one. Value LRU over the slots [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LRUCacheLoRAModelManager.activate_adapter <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L1441-L1450>, read 2026-11-04).
- `vllm.lora.max-loras-default`: vLLM sizes its GPU adapter slots by max_loras, the most adapters that one batch may use, and it defaults to 1 at v0.33.0. Value 1 slots [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/lora.py, max_loras <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py#L36-L37>, read 2026-11-04).
- `vllm.lora.max-rank-default`: The slots are sized for the largest rank an adapter may have, max_lora_rank, which defaults to 16 at v0.33.0. Value 16 rank [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/lora.py, max_lora_rank <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py#L34>, read 2026-11-04).
- `vllm.lora.slot-count`: The LoRA model manager sizes its adapter slots, lora_slots, as max_loras. Value lora_slots = max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LoRAModelManager.lora_slots <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L347-L349>, read 2026-11-04).
- `vllm.lora.slots-built-at-init`: The LoRA model manager creates its LoRA modules in its constructor, and not when an adapter is first requested. Value when the LoRA manager is built [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LoRAModelManager.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L167>, read 2026-11-05).
- `vllm.lora.smaller-adapter-in-slot`: An adapter whose rank is below max_lora_rank is copied into the first rows of its slot's stacked A matrix and the first columns of its B matrix, and the rest of the slot stays zero. Value the first rows and columns of its slot [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/layers/base_linear.py, BaseLinearLayerWithLoRA.set_lora <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/layers/base_linear.py#L165-L187>, read 2026-11-05).
- `vllm.lora.stacked-max-rank`: Each LoRA layer in vLLM allocates the A and B matrices of all its slots at once, as zeros, as a stack that is max_loras deep and max_lora_rank wide, whatever the rank of the adapter that will sit in a slot. Value max_loras x max_lora_rank [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/layers/base_linear.py, BaseLinearLayerWithLoRA.create_lora_weights <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/layers/base_linear.py#L104-L152>, read 2026-11-05).
