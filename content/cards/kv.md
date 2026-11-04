---
id: kv
kind: notional-machine
title: The hybrid KV manager
world: kv
status: draft
---

The notional machine behind The Reach-In (`pool`) and the `hybrid-kv` forge lab: `packages/sim/kv`, which W1-T21 builds. Until it lands, this card is the specification that model is built to and checked against. It manages one pool of physical pages for several KV groups and, in the learner's design, for adapters too. Its rules follow vLLM v0.33.0 and SGLang v0.5.23, and the adapter pages are the learner's design and not the engines' own mechanism (D-042). The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **One pool, one page size.** One physical page pool serves every group and every adapter, and every block is exactly one page (D-045, A§5.4). vLLM's hybrid manager does the same for its layer types, and making them all reach one page size is its core challenge. The padding that a preset needs to get there is reported as waste. {{claim:vllm.hybrid-kv.single-pool}}
2. **Groups.** A full-attention group keeps every block. A sliding group frees the blocks that fall behind its window. A state group holds a fixed number of pages for each request (A§5.4). The pool caches a block under its hash and its group, so the same tokens in different groups are cached and evicted independently. {{claim:vllm.hybrid-kv.cache-key}}
3. **Prefix hashing.** A block's hash chains its parent's hash, its token ids and its extra keys (A§5.4). An adapter's identity is one of the extra keys, so two requests share a block only when they use the same adapter. {{claim:vllm.kv-hash.lora-extra-key}}
4. **The N-group hit.** A request's cache hit is the longest prefix that every group holds, which is the intersection of the groups' hits. The lookup is an iterative fixed-point search over all the groups. vLLM's design document still says the coordinator handles exactly two groups, and the model follows the code. {{claim:vllm.hybrid-kv.intersection}} {{claim:vllm.hybrid-kv.n-group-lookup}} {{claim:vllm.hybrid-kv.doc-two-groups}}
5. **Eviction.** One queue of free blocks, in eviction order, serves every group. A block joins it when it is freed, either because its request finished or because it fell out of a window. {{claim:vllm.hybrid-kv.one-lru}}
6. **Preemption** is by recompute only: the victim's blocks are freed, its computed tokens go back to zero and it returns to the front of the waiting queue. {{claim:vllm.scheduler.preemption-recompute}}
7. **Capacity** is the memory budget, less the weights, the activation workspace and the CUDA-graph reservation, divided by the bytes in a page (WORLD §2.4). vLLM estimates the graph memory before it allocates the KV cache and takes it off what the cache may use, and has done by default since v0.21.0. A block holds {{claim:vllm.cache.block-size-default}} by default in vLLM. {{claim:vllm.cudagraph.memory-before-kv}} {{claim:vllm.cudagraph.memory-subtracted}} {{claim:vllm.cudagraph.memory-profiling-default-since}}
8. **Adapters, two policies.** The learner's design is S-LoRA's unified paging: an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages of the same pool, stored non-contiguously, shared by every request that uses the adapter and admitted all or nothing (D-042, D-045). The baseline it is compared with is what both engines ship at the pins, a fixed number of slots outside the KV pool. vLLM sizes its slots by `max_loras` and admits a request only while the distinct adapters of its batch stay within them. SGLang's pool is a fixed table of slots, which it fills and evicts by policy. {{claim:kv.slora.unified-paging}} {{claim:vllm.lora.slot-count}} {{claim:vllm.lora.admission-cap}} {{claim:sglang.lora.pool}} {{claim:sglang.lora.slot-search}}
9. **All or nothing.** An operation either succeeds or leaves the state untouched, the rule of kernelspace's `lab 02` (A§5.4).
10. **Events.** The model emits `BlockStored`, `BlockRemoved` and `AllBlocksCleared` in `kv-events@1` (D-034), in the shape of vLLM's events, which travel in batches. A stored block carries its adapter, as SGLang's does, so a consumer can rebuild the cache per adapter. {{claim:vllm.kv-events.batch}} {{claim:vllm.kv-events.adapter-field}} {{claim:sglang.kv-events.adapter-field}}
11. **Invariants.** Pages are conserved, reference counts never go below zero, a block table's length follows its group's rule, and every stored or removed block is published exactly once (A§5.4).

## Ignores

- **The physical layout of bytes within a page.** A page is a unit of accounting, and the model does not say how a key or a value sits inside it.
- **Kernel efficiency per page size.** A page size changes how fast attention runs on a real GPU. The model counts pages and nothing else about them.
- **Copy-on-write costs.** Sharing a block is free in the model, and a real copy of a shared block is not.
- **CPU swap and every tier beyond the GPU.** TR5b's `tiers` model owns the tiers, the connector and its events (A§5.8).
- **Adapter compute.** An adapter is a number of pages that must be resident. The model says nothing about the cost of the LoRA kernels that use it.

## Calibrated against

- **Nothing numeric.** The model's rules are claims from the pins, read at v0.33.0 and v0.5.23 on 2026-11-04, and no engine run has been compared with the model's counts yet.
- **The model's own invariants,** which the property tests of W1-T21 will check over seeded operation sequences, and the known-wrong managers of its bestiary, each of which must fail a named check (A§5.10).
