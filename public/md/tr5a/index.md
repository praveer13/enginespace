# Hybrid KV groups, and adapter pages in one pool

_Module `tr5a` · review · about 6 hours [estimated]_

## What you will be able to do

- Say what each kind of layer needs of the KV cache, and count the pages a request holds in each group
- Work out how a model's layers become groups of one page size, and where the padding goes
- Find the prefix hit that every group accepts, and say why it is an intersection and not a union
- Page adapters in the same pool as the KV, all or nothing, and say what the slots of vLLM and SGLang do differently

Prerequisites (advice, never a lock): `ks:T5.L5`, `ks:T5.L6`, `ks:T6.L9`.

A model that mixes kinds of layer cannot be served with one block table for each request. Its full-attention layers need every token, its sliding-window layers need only the last window, and its recurrent layers need a state of fixed size. This module is about the manager that serves all three from one pool of equal pages, and about what it takes to put LoRA adapters in that same pool. It is the first part of the course's third outcome. The connector and the event publisher are TR5b's, and the exact rejection sampler is TR6's.

## The browser part

TR5a has no GPU part. Its four lessons, its game and its lab are all in the browser. The lab is Rust that you write on your laptop and drop into the tab, where the site grades it against its own reference on seeds drawn when you run it.

1. Why one model needs several KV caches.
2. One pool, one page size: vLLM's hybrid manager and its five cases.
3. A prefix hit must hold in every group.
4. Adapters as pages: S-LoRA's design, and upstream's slots.

The game is The Reach-In (`pool`). It has seven levels: `one-group`, `two-kinds`, `evict`, `same-size`, `state`, `adapters` and `manager`. In it you are the manager's policy under pressure. You hang a ticket or none, dump the pans a ticket needs room from, pull a ticket when the line cannot grow, and bring a recipe kit in before its ticket hangs. `evict`, `adapters` and `manager` are graded, on fresh seeds. Every number in it belongs to a synthetic world, and the screen says so.

The lab is `hybrid-kv`, and it is the first part of the course's third outcome in a form you can run: a hybrid KV manager with adapter pages, in six stages. It extends the optional `adapter_unified_paging` check of kernelspace's `lab 02` to a whole manager. **adapter_unified_paging** [measured] The stages run from `one_group` to a `gauntlet` of seeded churn, and the site drives your module with seeded operations and judges every reply, hit and event against its own reference. A lesson says which stages it prepares you for.

> **Build.** The lab `hybrid-kv` (lane B), stages `s1`, `s2`, `s3`, `s4`, `s5`, `s6`. The lab page grades it.

## What this module says about the engines

The groups, the page size, the prefix hit and the free queue follow vLLM v0.33.0, and the lessons cite them claim by claim. Adapters in the same pool as the KV are not an engine's mechanism. They are S-LoRA's design, which you build. At the pins vLLM keeps adapters in `max_loras` GPU slots outside the KV pool, with a CPU LRU and an admission cap on the distinct adapters of a batch, and SGLang keeps them in a fixed-slot `LoRAMemoryPool`. **lora_slots = max_loras** [measured] **max_cpu_loras = max_loras** [measured] **LRU caches of max_cpu_loras and max_loras** [measured] **distinct adapters at most max_loras** [measured] **a fixed-slot pool** [measured] The fourth lesson builds the pool and then measures it against those slots (D-042).

The pinned engines are read in their source and are not run. By default the hybrid manager is switched off behind a KV connector that does not subclass `SupportsHMA`. **SupportsHMA** [measured] **off** [measured] TR5b takes the other side of the same pool: the connector that has to keep the manager on, and the publisher of the events that a consumer rebuilds the cache from. Both are TR5b's. That module is not built yet, and it arrives with the GPU modules in the second part of the course.

## Credit

The module is browser-complete when its exit tickets, the lab `hybrid-kv` and the three graded levels `evict`, `adapters` and `manager` are credited (ASSESSMENT §9). It is complete when a Prove-it is on record as well, taken with the agent closed. One kind of Prove-it works on your own module. You are shown a seeded list of at most 12 calls [estimated], you predict what your module replies, and the site then runs your module on the same calls and compares. The other is the `manager` level in Prove mode, on fresh seeds (ASSESSMENT §7).

> **Card.** The notional-machine card `kv`.

## Lessons

- [Why one model needs several KV caches](l1-why-one-model-needs-several-kv-caches.md): lesson `tr5a.l1`, about 95 minutes [estimated]
- [One pool, one page size: vLLM's hybrid manager and its five cases](l2-one-pool-one-page-size.md): lesson `tr5a.l2`, about 52 minutes [estimated]
- [A prefix hit must hold in every group](l3-a-prefix-hit-must-hold-in-every-group.md): lesson `tr5a.l3`, about 72 minutes [estimated]
- [Adapters as pages: S-LoRA's design, and upstream's slots](l4-adapters-as-pages-and-upstreams-slots.md): lesson `tr5a.l4`, about 110 minutes [estimated]

## Claims cited

- `kv.kernelspace.lab02-adapter-check`: kernelspace's lab 02 has an optional advanced check, adapter_unified_paging. It asks the manager to place adapter pages and sequence KV in the same finite pool, to fail atomically under pressure, and to reclaim each lifetime independently. Value adapter_unified_paging [measured], checked 2026-11-05 (source: kernelspace T6.L9, Multi-LoRA Serving, the closing paragraph (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/lessons-md/t6.l9.md#L145>, read 2026-11-05).
- `sglang.lora.pool`: SGLang keeps adapters in LoRAMemoryPool, a pool of max_loras_per_batch buffer slots that maps each slot to an adapter or to an empty marker. It is not a page pool shared with the KV cache. Value a fixed-slot pool [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/lora/mem_pool.py, LoRAMemoryPool <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/lora/mem_pool.py#L131-L132>, read 2026-11-04).
- `vllm.hybrid-kv.auto-off-connector`: When the user has not chosen, the config turns the hybrid KV cache manager off if the selected KV connector does not support it, and logs one warning. Hybrid SSM models then fail at startup, and sliding-window models run more slowly. Value off [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py (hybrid KV cache manager rules) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L2257-L2277>, read 2026-11-04).
- `vllm.hybrid-kv.supports-hma`: A KV connector that works with the hybrid memory allocator (HMA) subclasses SupportsHMA and implements request_finished_all_groups. The class docstring says this is required to use a connector together with the hybrid memory allocator. Value SupportsHMA [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/distributed/kv_transfer/kv_connector/v1/base.py, SupportsHMA <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/distributed/kv_transfer/kv_connector/v1/base.py#L101-L129>, read 2026-11-04).
- `vllm.lora.admission-cap`: The scheduler skips a waiting request whose adapter is not already scheduled once the distinct adapters in the batch reach max_loras. The request waits, so an adapter cap is part of admission. Value distinct adapters at most max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1091-L1102>, read 2026-11-04).
- `vllm.lora.cpu-cache`: vLLM keeps up to max_cpu_loras adapters in CPU memory. The value defaults to max_loras and may not be smaller than it. Value max_cpu_loras = max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/lora.py, LoRAConfig._validate_lora_config <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/lora.py#L121-L127>, read 2026-11-04).
- `vllm.lora.cpu-lru`: The LoRA model manager keeps its registered adapters, which max_cpu_loras caps, in an LRU cache of that capacity, and its active adapters, which max_loras caps, in a second LRU cache. Value LRU caches of max_cpu_loras and max_loras [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LoRAModelManager.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L113-L119>, read 2026-11-05).
- `vllm.lora.slot-count`: The LoRA model manager sizes its adapter slots, lora_slots, as max_loras. Value lora_slots = max_loras [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/lora/model_manager.py, LoRAModelManager.lora_slots <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/lora/model_manager.py#L347-L349>, read 2026-11-04).
