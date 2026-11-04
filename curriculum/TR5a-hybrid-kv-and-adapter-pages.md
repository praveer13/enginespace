# TR5a · Hybrid KV groups, and adapter pages in one pool

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr5a`. **Hours:** about 6 [estimated], all in the browser (B), with the forge lab written in Rust on the laptop and graded in the tab. **Ships in:** W1 (D-002). **Owns:** hybrid KV groups and adapter paging (catalog §4). On-Device's SH3 recaps it for ring KV.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm K1) and (sglang X5). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

**A correction to the catalog, carried here (D-042).** The catalog's line reads "adapter pages in the same pool (S-LoRA)", which sounds like an upstream mechanism. It is not one at the pins. vLLM keeps LoRA adapters in `max_loras` GPU slots with a CPU LRU, outside the KV block pool, and admits a request only while the distinct active adapters fit those slots (vllm K4). SGLang's `LoRAMemoryPool` is a fixed-slot pool too (sglang X6). TR5a teaches unified paging as S-LoRA's design, which the learner builds and then measures against the slot baseline.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Implement a KV manager for models that mix full attention, sliding windows and recurrent state, with one physical page pool shared by every KV group and by LoRA adapters, and prove its invariants on fresh seeds. This is the first part of outcome 3. |
| **Artifact** | `hybrid-kv` property tests on your Rust module, extending lab 02's optional `adapter_unified_paging` check (B). |
| **Game slot** | The KV-pool game: working name **The Pool**, `pool`, 3D flagship (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard), T5.L5 and T5.L6 above all; lab 02 and T6.L9 strongly advised. |
| **GPU** | None. |

## 1. What it teaches

1. **Why one model needs several KV caches.** A hybrid model mixes layer types: full attention keeps every token's KV; a sliding window keeps only the last W tokens' KV; a recurrent (Mamba-like) layer keeps a fixed-size state per request; others exist (chunked local, cross-attention). vLLM's code at v0.33.0 has a manager per type: full, sliding window, chunked local attention, Mamba, cross-attention, circular buffer, RSWA, sink full attention and HiSparse variants (vllm K2).
2. **One pool, one page size.** vLLM's hybrid manager keeps one block pool with one page size, so groups whose per-token bytes differ are made equal by grouping layers, padding layers or inflating the attention block size. The doc walks five cases: equal `kv_hidden_size`, regular and irregular layer ratios, Mamba page padding, and KV sharing (vllm TR5a notes). Per the design doc, one LRU and a dict keyed by (block hash, group id) serve all groups (vllm K2); the lesson checks that against the code at the pin, since the same doc is stale on the number of groups.
3. **A prefix hit must hold in every group.** The reusable prefix is the longest one every group holds. With more than two groups this is an iterative fixed point across attention types, full attention first. The design doc still says the coordinator "handles exactly two KV cache groups"; the code handles N (vllm K1). SGLang's `UnifiedRadixCache` reaches the same rule from the other side: its FULL, SWA and MAMBA components share one tree, and a boundary is reusable only where every component's validator accepts (sglang X5).
4. **Sliding windows free pages; state holds a fixed number.** A sliding group releases blocks that fall behind its window as a request advances. A state group holds a fixed number of pages per request however long it runs.
5. **Adapters as pages: S-LoRA's design.** An adapter's weights take ⌈adapter bytes ÷ page bytes⌉ pages from the same pool as KV, stored non-contiguously. A request runs only when its adapter is resident, an adapter is shared by every request that uses it, and loading or admitting is all or nothing. Unloading an adapter returns its pages without touching KV (kernelspace lab 02's optional check; S-LoRA, arXiv 2311.03285, as cited by kernelspace T6.L9).
6. **Upstream's slots, the baseline you measure against.** vLLM: `max_loras` GPU slots (default 1) of stacked A and B tensors, `max_lora_rank` default 16, up to `max_cpu_loras` adapters in a CPU LRU, and an admission cap on distinct active adapters [measured at v0.33.0] (vllm K4). SGLang: `max_loras_per_batch` slots (default 8) [derived from source and docs], LRU or FIFO eviction (sglang X6). The learner's pool is compared with the slot model on seeded adapter-churn workloads: how many requests admitted, how many adapter loads.
7. **What depends on the manager elsewhere.** The number of active adapters also picks which CUDA graph replays (vllm G6, linking TR2). A KV connector that does not subclass `SupportsHMA` turns the hybrid manager off, and hybrid SSM models then fail at startup (vllm K3, linking TR5b).

**Knowledge components** (proposed; W1-T03 writes them):

| KC | Requires |
|---|---|
| `tr5a.kv-groups` | `ks:t5.attention-variants`, `ks:t5.kv-bytes-per-token` |
| `tr5a.page-size-unification` | `tr5a.kv-groups`, `ks:t1.internal-frag` |
| `tr5a.hit-intersection` | `tr5a.kv-groups`, `ks:t5.prefix-cache-keys` |
| `tr5a.sliding-free` | `tr5a.kv-groups` |
| `tr5a.state-pages` | `tr5a.kv-groups` |
| `tr5a.adapter-pages` | `ks:t6.multi-lora-batching`, `ks:t6.lora-adapter-bytes`, `ks:t5.block-refcounts` |
| `tr5a.slots-vs-pages` | `tr5a.adapter-pages` |
| `tr5a.all-or-nothing` | `ks:t1.allocator-contract` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR5a takes from it |
|---|---|---|
| Lab | lab 02 `kv-block-manager` ("PagedAttention, From the Inside"), anchored to T5.L5 | The block manager the learner already wrote: a fixed pool, block tables, refcounts, fork and copy-on-write, and its optional stage 5, `adapter_unified_paging`, which puts adapter pages and sequence KV in one finite pool, fails atomically under pressure and reclaims each lifetime independently. `hybrid-kv` starts there. |
| Lesson | T6.L9 "Multi-LoRA Serving: One Base, Many Tenants" (`t6.l9`) | S-LoRA's unified paging and Punica's SGMV (`t6.multi-lora-batching`, `t6.lora-adapter-bytes`). |
| Lesson | T5.L5 "PagedAttention Deep Dive" (`t5.l5`) | Block tables, refcounts, copy-on-write (`t5.block-tables`, `t5.block-refcounts`, `t5.kv-copy-on-write`). |
| Lesson, lab | T5.L6 "Prefix Caching: The Free Lunch" (`t5.l6`); lab 07 `radix-cache` and its twin `lab07.twin.*` at SGLang v0.5.21 | Prefix keys and radix eviction (`t5.prefix-cache-keys`, `t5.radix-eviction`); the twin's page-aligned matching in SGLang's Rust tree core. |
| Lesson | T5.L4 "KV Cache Math" (`t5.l4`), with the Attention Zoo | The attention variants and their bytes per token (`t5.attention-variants`, `t5.kv-bytes-per-token`). The catalog routes long-context interest from the zoo to TR5a. |
| Lesson, play | T1.L4 "Fragmentation: Internal vs External" (`t1.l4`); the `block-placement` play | Internal and external fragmentation (`t1.internal-frag`, `t1.external-frag`): padding to one page size is internal fragmentation by design. |
| Lesson, lab | T1.L3's toy allocator; lab 01 `rust-allocator` ("The Allocator, For Real") | The allocator contract (`t1.allocator-contract`), including all-or-nothing. |
| Lesson | T2.L3 "Swapping & Eviction Policies" (`t2.l3`) | Eviction policies (`t2.eviction-policies`). |

**Within enginespace.** TR2's graph keys count active adapters; TR5b's connector must keep this manager on (`SupportsHMA`).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes |
|---|---|---|
| `tr5a.l1` | Why one model needs several KV caches | 40 |
| `tr5a.l2` | One pool, one page size: vLLM's hybrid manager and its five cases | 45 |
| `tr5a.l3` | A prefix hit must hold in every group | 35 |
| `tr5a.l4` | Adapters as pages: S-LoRA's design, and upstream's slots | 40 |
| — | The Pool: practice, then graded levels | 75 |
| — | Forge lab `hybrid-kv`, stages s1-s6 | 120 |
| — | Prove-it and the exit items | 25 |

**Reading for `tr5a.l2`-`tr5a.l3`** at v0.33.0: `vllm/v1/core/kv_cache_coordinator.py` (the coordinator and `find_longest_cache_hit`), `vllm/v1/core/single_type_kv_cache_manager.py` (the per-type managers), `docs/design/hybrid_kv_cache_manager.md` (read for the five cases, and labelled stale on "exactly two groups"), and the upstream tests `test_prefill_hybrid_model` and `test_prefill_hybrid_model_combinations` in `tests/v1/core/test_prefix_caching.py` (vllm K1, K2). For SGLang at v0.5.23: `rust/sglang-radix-tree/` and its component tests, readable oracles for a Rust-first learner (sglang TR5a notes).

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | "How many blocks does this 112-token request hold with 10 full-attention and 20 sliding-window layers, block size 16 and window 32?" (GAMES.md's `two-kinds` example, from vLLM's doc). "After this adapter loads, how many pages are free?" | `predict` |
| **Play** | The Pool: admit, preempt and load adapters to keep goodput up without running out of pages, under the rule that a request runs only when every group's blocks and its adapter are resident (§6). | `play` |
| **Build** | The `hybrid-kv` forge lab in Rust on kernelspace's `kslab` ABI v2: groups, sliding release, state pages, the N-group prefix hit, adapter pages, events (§5). | `lab-check` |
| **Prove** | With the agent closed: kernelspace's Prove-it v2. The site shows a seeded list of at most 12 calls, you predict what your own module replies (pages free, admit or refuse, hit length), and then the site runs your module on the same calls and grades the prediction. The Pool's `manager` level in Prove mode, on fresh seeds, also counts (ASSESSMENT §7). | `prove` and `play` (`proved`) |
| **Keep** | Today draws `tr5a.blocks-held`, `tr5a.hit-length`, `tr5a.pages-for-adapter` and `tr5a.slots-vs-pages`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `lab:hybrid-kv` (the catalog's artifact) | B | Your `.wasm` module | The site drives it through `ks_invoke` with seeded operation batches (the invoke protocol) and checks every reply and the state invariants against `kvReference` in `packages/sim/kv` on seeds drawn at grade time (A§8.3, D-025). The crate's own `ks_run` checks back `cargo test`, so the terminal and the tab agree. A `--features reference` build earns nothing. | Every required check passes on fresh seeds in one run |
| `play:pool/evict`, `play:pool/adapters`, `play:pool/manager` | B | Your play on fresh seeds | Replayed through the session against the hidden reference | Score at least 0.95 on 3 fresh seeds per level (GAMES.md §8's proposal) |
| `prove:hybrid-kv` | B | Your prediction of your own module's replies to one seeded template of at most 12 calls | The simulator reads your module's replies to the same calls and compares (kernelspace H4 v2, `src/lib/forge/prove2.ts`) | `proved` when the prediction is right, the module is the one just graded on unseen seeds (same SHA-256), and no attempt is waiting out its 24-hour retry |

**The lab's stages** (each at most 25 minutes, the first a 2-minute win [estimated; kernelspace F2's rule]):

| Stage | Turns green | What it adds |
|---|---|---|
| s1 `one_group` | paging, prefix hash, refcounts | lab 02 and lab 07 in one module; the hash chains the parent hash, the token ids and the extra keys (the adapter id) |
| s2 `sliding` | window release | blocks behind the window return to the pool, all or nothing |
| s3 `state` | fixed state pages | a fixed number of pages per request |
| s4 `hit_all_groups` | the N-group prefix hit | the longest prefix every group holds, full attention first |
| s5 `adapter_pages` | unified paging | adapters in the same pool, shared, all or nothing, independent reclaim (lab 02's optional check, extended) |
| s6 `gauntlet` | invariants under churn | 2,000 seeded operations [estimated], with page conservation, refcounts never below zero, block-table lengths per group rule, and every stored or removed block published exactly once, checked after every operation |

**The bestiary** (modules that must fail a named check; W1-T21, W1-T22): a free that leaks; an admit that takes pages before it fails; a window off by one; an adapter counted twice; a prefix hit that takes the union of groups instead of the intersection; an event published twice.

**Measured against the slot baseline.** After s5, the lab page runs the learner's module and the slot model on the same seeded adapter-churn workload and prints admitted requests and adapter loads for each. This is a readout, not a pass bar: the lesson is what unified paging buys and when slots are enough.

## 6. Game slot

**The KV-pool game.** Working name **The Pool**, id `pool`, 3D flagship with a 2D grid path and a DOM mirror (GAMES.md §8).

- **The rule is the concept.** One page pool serves every KV group and every adapter, and a prefix hit counts only where every group holds it. Winning means a page saved or a hit kept.
- **Levels the module uses** (GAMES.md's working ids): `one-group`, `two-kinds`, `same-size` and `state` for practice; `evict`, `adapters` and `manager` graded.
- **Scene, in objects only.** A rack of physical pages, each at a fixed position for its whole life, with its group or adapter shown as a glyph, not a shelf; request block tables are threads from a request to its pages; adapter pages are linked, not contiguous; the free line, cached pages in eviction order, along the rack's base. Cameras: front, per-group filter and top.
- **Two proposals, now settled** (GAMES.md §13): pages keep fixed positions with groups as glyphs, and ARCHITECTURE §6.1 and TRACKER W1-T24 drop the shelf per group; KV groups follow vLLM's one-page-size rule while adapters follow S-LoRA's page count, which is proposed decision D-045, and ARCHITECTURE §5.4 drops its mixed `pageUnits`.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0 (`4ba787ec…324da5`) | the coordinator, managers, tests and `vllm/config/lora.py` |
| vLLM hybrid KV doc | `docs.vllm.ai/en/v0.33.0/design/hybrid_kv_cache_manager/` | stale on "exactly two" groups (vllm K1) |
| SGLang | v0.5.23 (`297e54fd…6f90`) | `UnifiedRadixCache`, `lora/mem_pool.py`, the Rust tree core |
| S-LoRA | arXiv 2311.03285 | as cited by kernelspace T6.L9 |
| Punica | arXiv 2310.18547 | as cited by kernelspace T6.L9 |
| kernelspace `kslab` | ABI v2, vendored at d478f91 | A§13 |
| Rust | 1.96.0 with `wasm32-unknown-unknown` | A§10.3 |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| The coordinator handles N groups with an iterative fixed-point hit; the doc says "exactly two" | [measured] | vllm K1 | 2026-11-01 | pin; the doc 14 days |
| Per-type managers at v0.33.0, and the upstream hybrid prefix-cache tests | [measured] | vllm K2 | 2026-11-01 | pin |
| The hybrid manager is on by default, and off behind a connector that does not subclass `SupportsHMA` | [measured] | vllm K3 | 2026-11-01 | pin |
| vLLM adapters live in `max_loras` slots (default 1) with a CPU LRU and an admission cap; "S-LoRA" appears in vLLM only as fully-sharded LoRA | [measured] | vllm K4 | 2026-11-01 | pin |
| Active adapter count selects the graph that replays | [measured] | vllm G6 | 2026-11-01 | pin |
| SGLang's `UnifiedRadixCache` components and its all-validators rule; eviction policies lru (default), lfu, slru, priority, tlru | [measured] | sglang X5 | 2026-11-02 | 14 days |
| SGLang's `LoRAMemoryPool` is fixed-slot, `max_loras_per_batch` default 8 | [derived from source and docs] | sglang X6 | 2026-11-02 | 14 days |
| SGLang removed `SWARadixCache`, `MambaRadixCache` and `HiRadixCache` (now `UnifiedRadixCache`) in v0.5.21 | [measured] | sglang X3 | 2026-10-02 | static |

## 9. Hours

| Activity | B |
|---|---|
| Lessons `tr5a.l1`-`tr5a.l4` | 2.7 |
| The Pool | 1.25 |
| `hybrid-kv` | 2.0 |
| Prove-it and exit items | 0.4 |
| **Total** | **about 6** |

All [estimated]. The catalog's figure is 6 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| The N-group coordinator and its doc | pin; doc 14 days | `kv_cache_coordinator.py` at the new tag; a change card when the doc drops "exactly two" |
| The per-type manager list | pin | the classes in `single_type_kv_cache_manager.py` |
| vLLM's adapter defaults and admission rule | pin | `vllm/config/lora.py`, the scheduler's adapter check |
| `SupportsHMA` | pin | `base.py` (vllm §6's connector check) |
| SGLang's cache and LoRA pool | 14 days | release notes' Breaking Changes |
| "No engine pages adapters in the KV pool" (D-042) | each re-pin | the two adapter memory files above; D-042's revisit trigger is an engine shipping it |

## 11. Open items

1. **Page units.** Settled as proposed decision D-045: one page size for the pool, vLLM's equal-page-size rule for KV groups, and S-LoRA's page count for adapters. The lab's `kvReference` (W1-T21) follows it, and ARCHITECTURE §5.4 no longer has `pageUnits`.
2. **Events in a forge lab.** s6 checks that every stored or removed block is published once; the event shapes must match TR5b's `kv-events@1` (D-034) so the two labs share one consumer.
3. **A Gemma-3-like `same-size` level** uses layer counts taken from vLLM's doc example (GAMES.md §8); W1-T21 cites the doc's text for them.
