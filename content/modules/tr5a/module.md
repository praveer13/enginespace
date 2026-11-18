---
id: tr5a
title: Hybrid KV groups, and adapter pages in one pool
status: review
hours: 6                          # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 6 }           # [estimated]
outcomes:
  - Say what each kind of layer needs of the KV cache, and count the pages a request holds in each group
  - Work out how a model's layers become groups of one page size, and where the padding goes
  - Find the prefix hit that every group accepts, and say why it is an intersection and not a union
  - Page adapters in the same pool as the KV, all or nothing, and say what the slots of vLLM and SGLang do differently
artifacts:
  - id: hybrid-kv
    lane: B
    title: Property tests on your Rust hybrid KV manager, graded in the browser
worlds: [kv]                     # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T5.L5, ks:T5.L6, ks:T6.L9]
pins: [vllm, sglang]
lanes: [B]
games: [pool]
labs: [hybrid-kv]
---

A model that mixes kinds of layer cannot be served with one block table for each request. Its full-attention layers need every token, its sliding-window layers need only the last window, and its recurrent layers need a state of fixed size. This module is about the manager that serves all three from one pool of equal pages, and about what it takes to put LoRA adapters in that same pool. It is the first part of the course's third outcome. The connector and the event publisher are TR5b's, and the exact rejection sampler is TR6's.

## The browser part

TR5a has no GPU part. Its four lessons, its game and its lab are all in the browser. The lab is Rust that you write on your laptop and drop into the tab, where the site grades it against its own reference on seeds drawn when you run it.

1. Why one model needs several KV caches.
2. One pool, one page size: vLLM's hybrid manager and its five cases.
3. A prefix hit must hold in every group.
4. Adapters as pages: S-LoRA's design, and upstream's slots.

The game is KV page pool (`pool`), and in it you are the KV allocator. It has seven levels: One KV group, Full attention and a sliding window, Choose what to evict, One page size for every group, A state group, LoRA adapters in the same pool, and The whole manager. Each step you admit a waiting request or none, choose the cached pages to evict when a request needs room, preempt a running request when one cannot grow, and load a LoRA adapter before the request that needs it is admitted. Choose what to evict, LoRA adapters in the same pool and The whole manager are graded, on new numbers. Every number in it belongs to a synthetic world, and the screen says so.

The lab is `hybrid-kv`, and it is the first part of the course's third outcome in a form you can run: a hybrid KV manager with adapter pages, in six stages. It extends the optional `adapter_unified_paging` check of kernelspace's `lab 02` to a whole manager. {{claim:kv.kernelspace.lab02-adapter-check}} The stages run from `one_group` to a `gauntlet` of seeded churn, and the site drives your module with seeded operations and judges every reply, hit and event against its own reference. A lesson says which stages it prepares you for.

:::lab
id: hybrid-kv
lane: B
stages: [s1, s2, s3, s4, s5, s6]
:::

## What this module says about the engines

The groups, the page size, the prefix hit and the free queue follow vLLM v0.33.0, and the lessons cite them claim by claim. Adapters in the same pool as the KV are not an engine's mechanism. They are S-LoRA's design, which you build. At the pins vLLM keeps adapters in `max_loras` GPU slots outside the KV pool, with a CPU LRU and an admission cap on the distinct adapters of a batch, and SGLang keeps them in a fixed-slot `LoRAMemoryPool`. {{claim:vllm.lora.slot-count}} {{claim:vllm.lora.cpu-cache}} {{claim:vllm.lora.cpu-lru}} {{claim:vllm.lora.admission-cap}} {{claim:sglang.lora.pool}} The fourth lesson builds the pool and then measures it against those slots.

The pinned engines are read in their source and are not run. By default the hybrid manager is switched off behind a KV connector that does not subclass `SupportsHMA`. {{claim:vllm.hybrid-kv.supports-hma}} {{claim:vllm.hybrid-kv.auto-off-connector}} TR5b takes the other side of the same pool: the connector that has to keep the manager on, and the publisher of the events that a consumer rebuilds the cache from. Both are TR5b's, in the GPU part of the course.

## Credit

The module is browser-complete when its lesson questions, the lab `hybrid-kv` and the three graded levels `evict`, `adapters` and `manager` are credited. It is complete when a Prove-it is on record as well, taken with the agent closed. One kind of Prove-it works on your own module. You are shown a seeded list of at most 12 calls [estimated], you predict what your module replies, and the site then runs your module on the same calls and compares. The other is the `manager` level in Prove mode, on fresh seeds.

:::card
kind: notional-machine
id: kv
:::
