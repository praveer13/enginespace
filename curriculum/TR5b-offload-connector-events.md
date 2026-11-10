# TR5b · Offload, the KV connector's engine side, and the event publisher

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr5b`. **Hours:** about 8 [estimated]: about 5 in the browser (B) and about 3 on a GPU (F). **Ships in:** W2 (D-002). **Owns:** the engine side of the KV connector contract and the event publisher. The Wire's WR3 owns the contract and the event schema, and the Data Plane's DP6 consumes the events (catalog §4). Neither has shipped, so TR5b owns a minimal contract and `kv-events@1` until WR3 does, then reconciles (D-034).

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm K6) and (sglang H3). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Move KV between GPU, host and storage inside one engine without ever letting a block be read before it lands or freed before it is saved, and publish every move so that a consumer can rebuild the exact cache. This is the second part of outcome 3. |
| **Artifacts** | Publisher conformance on your Rust module (B); a toy connector in the pinned vLLM that passes upstream's own connector tests and round-trips KV byte for byte (F). |
| **Game slot** | The KV-tiers game: working name **The Switchyard**, `switchyard`, 3D (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard), T5.L6 above all; TR5a strongly advised, since the connector must keep its hybrid manager on. |
| **GPU** | About 3 h on a 4090-class GPU [estimated]. |

## 1. What it teaches

1. **Tiers inside one engine, and the load-or-recompute line.** A prefix that left GPU memory can come back from host memory or storage, or be recomputed by prefill. Which is cheaper depends on bytes, link bandwidth and prefill speed, so the break-even is arithmetic the learner does before any code (kernelspace T2.L3's swap against recompute, now with real tiers).
2. **Offload is a connector.** In vLLM v0.33.0, `--kv-offloading-size` (GiB, summed over tensor-parallel ranks) turns offload on, and `--kv-offloading-backend native|lmcache` picks the implementation. Native offload installs `OffloadingConnector`, with a CPU spec or a tiered spec, or `SimpleCPUOffloadConnector` through `VLLM_USE_SIMPLE_KV_OFFLOAD` (vllm K5). The learner reads a real implementation of the contract before writing one.
3. **The contract's engine side.** `KVConnectorBase_V1` has a scheduler side (`get_num_new_matched_tokens`, `update_state_after_alloc`, `build_connector_meta`, `request_finished`, `take_events`) and a worker side (`start_load_kv`, `wait_for_layer_load`, `save_kv_layer`, `wait_for_save`, `get_finished` and `get_transfer_results`, `get_block_ids_with_load_errors`, `handle_preemptions`). Seven methods are abstract, and the method set has only grown from v0.31.0 to `main` (vllm K6).
4. **Five invariants** (vllm K7), each testable without a GPU against a fake engine:
   1. a synchronous load completes before the layer's attention reads the block (`wait_for_layer_load`), and a failed synchronous load fails the step;
   2. an asynchronous load holds the request in `WAITING_FOR_REMOTE_KVS` until the transfer is reported, so its computed tokens are not used early;
   3. failed blocks are reported no later than the pass that reports the request;
   4. an asynchronous save keeps its source blocks until completion is reported;
   5. `request_finished` returning True keeps the blocks until `get_finished` reports them.
5. **Keep the hybrid manager on.** A connector that does not subclass `SupportsHMA` (`request_finished_all_groups`) turns vLLM's hybrid KV manager off, and hybrid SSM models then fail at startup. Upstream's `ExampleConnector` does not subclass it (vllm K3), so the learner's connector must.
6. **Events a consumer can replay.** vLLM publishes `BlockStored`, `BlockRemoved` and `AllBlocksCleared`, batched as `KVEventBatch(ts, events, data_parallel_rank)`. Its ZMQ publisher sends a three-part message (topic, an 8-byte big-endian sequence number, a msgpack payload), can serve replays on a ROUTER socket with an end marker of sequence −1, and defaults to `buffer_steps` 10,000, a high-water mark of 100,000, a queue of 100,000 and the endpoint `tcp://*:5557` [measured at v0.33.0]. A consumer must reference-count repeated stores in chunk mode and ignore removals of hashes it never saw (vllm K8).
7. **The same idea in SGLang.** HiCache is L1 on the GPU, L2 in host memory and L3 in storage, with L3 backends `file` (for demonstration), `mooncake`, `hf3fs`, `nixl`, `aibrix` and `dynamic`, behind a `HiCacheStorage` interface (sglang H1). Its events carry `lora_id`, `lora_name`, `cache_salt` and `session_id` on `BlockStored`, with LoRA-aware block ids new in v0.5.23 (sglang H2). vLLM's `BlockStored` already carries the adapter too, as `lora_name` and a deprecated `lora_id` (vllm K8; claim `vllm.kv-events.adapter-field`). So an event schema needs an adapter dimension, and both engines' events have it.
8. **What a real consumer does not guarantee.** SGLang's experimental Rust indexer documents that it has "no sequence gate, incarnation fencing, replay recovery, worker liveness TTL, or restart recovery"; it logs and ignores sequence gaps, and re-applies redelivered or reordered batches in arrival order (sglang H3). That list is TR5b's conformance checklist for the publisher: gaps, replay, duplicates, reordering, restart and liveness.

**Knowledge components** (proposed; W2-T33 writes them):

| KC | Requires |
|---|---|
| `tr5b.load-or-recompute` | `ks:t2.swap-vs-recompute`, `ks:t6.kv-tiering` |
| `tr5b.connector-contract` | `tr1.five-mechanisms` |
| `tr5b.load-before-use` | `tr5b.connector-contract`, `tr1.request-states` |
| `tr5b.save-before-free` | `tr5b.connector-contract` |
| `tr5b.failed-blocks` | `tr5b.load-before-use` |
| `tr5b.supports-hma` | `tr5a.kv-groups` |
| `tr5b.events-replayable` | `ks:t5.prefix-routing` |
| `tr5b.event-adapter-dimension` | `tr5b.events-replayable`, `tr5a.adapter-pages` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR5b takes from it |
|---|---|---|
| Lesson | T5.L6 "Prefix Caching: The Free Lunch" (`t5.l6`), and its deep-dive "HiCache: one cache becomes three tiers" | The tier hierarchy as a buffer pool, and the note that Dynamo's tier manager was deprecated in favour of engine-native offload: tiering belongs to the cache owner, which is the engine TR5b opens. |
| Lesson | T6.L3 "EPD Disaggregation: The 2026 Edition" (`t6.l3`), with the `pd-split` Fleet exercise | KV tiering and transfer (`t6.kv-tiering`). Fleet-scale transport stays with The Wire. |
| Lesson | T5.L9 "Distributed & Disaggregated Serving" (`t5.l9`) | Moving KV between processes and machines. |
| Lesson | T2.L3 "Swapping & Eviction Policies" (`t2.l3`) | Swap against recompute (`t2.swap-vs-recompute`). |
| Lab | lab 07 `radix-cache` ("The Prefix Is the Product"), with its bridge verbs that let the Fleet use it as a prefix router | A consumer of cache state, the role TR5b's events feed (`t5.prefix-routing`). |
| Lab | lab 04 `mpmc-queue` ("The Intake Ring") | Ordering and sequence numbers across a queue. |
| Lab | lab 02 `kv-block-manager` | Blocks, refcounts and lifetimes that saves and loads must respect. |
| Lesson, exercise | T6.L10 "Security Boundaries for Agentic Inference" (`t6.l10`), with the `timing-oracle` exercise | A cache hit is observable: why `cache_salt` appears in SGLang's events. |

**Within enginespace.** TR1 introduced `WAITING_FOR_REMOTE_KVS`. TR5a's hybrid manager is what `SupportsHMA` keeps on. TR2's loop shows a connector wait as one more source of bubbles (vllm TR2 notes).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr5b.l1` | Tiers inside one engine, and the load-or-recompute line | 40 | B |
| `tr5b.l2` | The connector contract: scheduler side, worker side, and five invariants | 50 | B |
| `tr5b.l3` | Offload is a connector: reading `OffloadingConnector` at v0.33.0 | 35 | B |
| `tr5b.l4` | Events a consumer can replay | 40 | B |
| `tr5b.l5` | SGLang's HiCache and its events, and what its indexer does not guarantee | 25 | B |
| — | The Switchyard: practice, then graded levels | 50 | B |
| — | Forge lab `kv-publisher`, stages s1-s6 | 75 | B |
| — | Lab `tr5b.connector`, stages s1-s4 | 165 | F |

**Reading at the pin.** `vllm/distributed/kv_transfer/kv_connector/v1/base.py` (805 lines at v0.33.0 [measured], vllm T2), `example_connector.py` (457 lines [measured], vllm K9), `vllm/distributed/kv_events.py`, `vllm/config/kv_events.py`, and the unit tests in `tests/v1/kv_connector/unit/` (vllm K9). For SGLang at v0.5.23: `docs/docs/advanced_features/hicache_design.mdx`, `python/sglang/srt/disaggregation/kv_events.py` and `sgl-router/sgl-kv-indexer/README.md` (sglang H1-H3).

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | "For this prefix length, link bandwidth and prefill speed, is loading or recomputing faster?" "Which event must the consumer see before this `BlockStored`?" | `predict` |
| **Play** | The Switchyard: move blocks between tiers only through the connector, publish every move, and watch the consumer's board, which is checked after every event (§6). | `play` |
| **Build** | The `kv-publisher` forge lab in Rust (B), then a toy connector in the pinned vLLM (F). | `lab-check`, `receipt` |
| **Prove** | With the agent closed: Prove-it v2 on `kv-publisher` (predict your publisher's events for a seeded list of at most 12 operations), The Switchyard's `yard` level in Prove mode, and "defend your connector": seeded questions only your receipt's connector log answers, such as "which blocks did your second run load for request 7?" (ASSESSMENT §7). | `prove` and `play`, `proved` |
| **Keep** | Today draws `tr5b.load-or-recompute`, `tr5b.which-invariant`, `tr5b.next-event` and `tr5b.replay-from`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `lab:kv-publisher` (the catalog's "publisher conformance") | B | Your `.wasm` publisher, driven through `ks_invoke` with seeded operation streams over a reference KV model (`packages/sim/tiers`, A§5.8) | After every batch, a reference consumer rebuilds the cache from your events and must equal the truth; plus ordering, replay and reset checks on fresh seeds (A§8.3) | Every required check passes on fresh seeds in one run |
| `play:switchyard/load-or-recompute`, `/publish`, `/yard` | B | Your play on fresh seeds | Replayed through the session; the level counts violations of the five invariants | Zero violations and a score of at least 0.95 on 3 fresh seeds (GAMES.md §9's proposal) |
| `prove:kv-publisher` | B | Your prediction of your own publisher's output for one seeded template | As in kernelspace H4 v2 | `proved` under the same three conditions as TR5a's |
| `receipt:tr5b.connector.s1` (first win) | F | Upstream's `ExampleConnector`, unmodified, under the grader | The grader runs a subset of `tests/v1/kv_connector/unit/` at the pin (W2-T32 fixes the subset) | The subset passes |
| `receipt:tr5b.connector.s2` (your connector) | F | Your connector, registered through the pinned version's extension point, over the kit's store interface | Grader: your class subclasses `SupportsHMA`; the upstream subset passes against it; on a shared-prefix workload from the challenge, run A saves and run B loads, and every block's SHA-256 at load equals its SHA-256 at save; run B's outputs agree with a no-connector baseline by teacher-forced agreement; the loaded-token count in your connector's log equals what the scheduler reported. Browser: re-checks the counts and hashes from the log. | Every required check passes |
| `receipt:tr5b.connector.s3` (failures) | F | The same, with seeded load failures injected into the store | Grader: failed blocks are reported (`get_block_ids_with_load_errors`) no later than the request, are recomputed, and outputs still agree; an asynchronous connector holds requests in `WAITING_FOR_REMOTE_KVS` until done | Every required check passes |
| `receipt:tr5b.connector.s4` (optional) | F | A run with vLLM's KV events on, recorded by the grader's subscriber | Browser: replays the stream through `tiers` and checks the consumer's view after every batch | Practice credit |

The module counts as complete when `kv-publisher`, the Switchyard's graded levels, the exit tickets, s2 and s3 are credited, and a `proved` event exists (ASSESSMENT §9).

**The kit's store interface.** The starter defines `put(block_key, tensor)` and `get(block_key)`; the learner writes the connector's engine-side logic: what to save and when, what to load and when, and what to report. The grader swaps in a probe store that hashes everything in and out, which is how byte identity is checked without trusting the learner's code.

**`kv-publisher`'s stages** (each at most 25 minutes, the first a 2-minute win [estimated; kernelspace F2's rule]):

| Stage | What it adds |
|---|---|
| s1 `store_remove` | one `BlockStored` per new full block and one `BlockRemoved` per eviction, each exactly once, in order |
| s2 `batches` | events batched per engine step into one `KVEventBatch` with a timestamp and a strictly increasing sequence number |
| s3 `replay` | the last `buffer_steps` batches kept; a replay from sequence k returns every batch from k on, then the end marker −1 |
| s4 `reset` | `AllBlocksCleared` before any new `BlockStored` after a cache reset |
| s5 `chunks_and_adapters` | repeated stores of one hash in chunk mode published each time; the adapter (`lora_name`) on every `BlockStored` |
| s6 `gauntlet` | seeded streams with the consumer's transport dropping, duplicating and reordering batches, and a publisher restart; the consumer's view, rebuilt with replays, equals the truth after every batch |

Where vLLM's behaviour is silent (for example, what a restarted publisher announces first), `kv-events@1` states the course's own rule and marks it as the course's, for WR3 to settle (D-034).

## 6. Game slot

**The KV-tiers game.** Working name **The Switchyard**, id `switchyard`, 3D with a 2D lanes path and a DOM mirror (GAMES.md §9).

- **The rule is the concept.** A block may be read only after its load lands, freed only after its save completes, and every move is published in an order a consumer can replay. Unlike kernelspace's plays, this game lets the learner make an unsafe move and see the corruption, because the contract is the lesson (GAMES.md §13; whether ASSESSMENT accepts that is GAMES.md open question 5, answered yes in ASSESSMENT §4.3).
- **Levels the module uses** (GAMES.md's working ids): `layer`, `not-yet`, `keep-until-saved` and `bad-blocks` for practice; `load-or-recompute`, `publish` and `yard` graded.
- **Scene, in objects only.** Three decks for GPU, host and storage; blocks as cars on rails between decks; events as signals beside the rails; the consumer's view as a board beside the yard, compared with the true cache after every event. Cameras: establish, focus on one deck, compare the board with the truth.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0 (`4ba787ec…324da5`) | the connector, events, offload config and unit tests |
| SGLang | v0.5.23 (`297e54fd…6f90`) | HiCache, events, the indexer's README |
| KV-offloading post | `vllm.ai/blog/2026-01-08-kv-offloading-connector` (2026-01-08) | its speedups are [unverified] (vllm K5) |
| `kv-events@1` | the course's minimal schema (D-034), mirroring v0.33.0's shapes, whose `BlockStored` already carries the adapter as `lora_name` (claim `vllm.kv-events.adapter-field`), as SGLang's does at v0.5.23 (claim `sglang.kv-events.adapter-field`) | reconciled when WR3 ships |
| A small hybrid model for the `SupportsHMA` check | chosen and pinned by W2-T32 | must fit 24 GB [unverified which] |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| Native offload is a KV connector, configured by `--kv-offloading-size` and `--kv-offloading-backend` | [measured] | vllm K5 | 2026-11-01 | pin |
| The KV-offloading post's TTFT ×2-×22 and throughput up to ×9 on an H100 | [unverified], vendor-reported | vllm K5 | 2026-01-08 | static |
| `KVConnectorBase_V1`'s methods; 7 abstract; 56 → 61 → 63 definitions from v0.31.0 to `main` | [measured] | vllm K6 | 2026-11-01 | 14 days |
| The five load, save and failure invariants | [measured] | vllm K7 | 2026-11-01 | pin |
| Event types, `KVEventBatch`, the ZMQ framing, replay end marker and defaults; the consumer's rules | [measured] | vllm K8 | 2026-11-01 | pin |
| `ExampleConnector` (457 lines) and the connector unit tests | [measured] | vllm K9 | 2026-11-01 | pin |
| A connector without `SupportsHMA` turns the hybrid manager off | [measured] | vllm K3 | 2026-11-01 | pin |
| HiCache's tiers, backends and flags (`--enable-hicache` new in v0.5.23) | [measured] | sglang H1 | 2026-11-02 | 14 days |
| SGLang's event fields, including the adapter fields, and LoRA-aware block ids in v0.5.23 | [measured] | sglang H2 | 2026-11-02 | 14 days |
| `sgl-kv-indexer`'s documented non-guarantees | [measured] | sglang H3 | 2026-11-02 | 14 days |
| A production HiCache case: hit rate from about 30% to 95% and median TTFT under 3 s | [unverified], vendor-reported | sglang TR5b notes | 2026-11-02 | reading only |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr5b.l1`-`tr5b.l5` | 3.2 | — |
| The Switchyard | 0.8 | — |
| `kv-publisher` | 1.25 | — |
| `tr5b.connector` s1 (0.5), s2 (1.25), s3 (0.75), s4 (0.25, optional) | — | 2.75 |
| **Total** | **about 5** | **about 3** |

All [estimated]. The catalog's figure is 8 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| The connector's method set and `SupportsHMA` | 14 days | the method diff in vllm §6 (61 definitions, 7 abstract at v0.33.0) |
| Event classes and publisher defaults | pin | `kv_events.py` and `config/kv_events.py` at the new tag |
| The extension point that registers a connector | 14 days | the toy connector's per-pin shim in `labs/gpu/tr5b-connector/starter/` (A§16) |
| SGLang's HiCache flags and event fields | 14 days | release notes; `kv_events.py` |
| `kv-events@1` | until WR3 ships | D-034's revisit trigger |

## 11. Open items

1. **Which upstream tests the grader runs.** `test_example_connector`, `test_kv_connector_lifecycle` and `test_kv_load_failure_recovery` are candidates (vllm K9); W2-T32 checks which run against a third-party connector without edits.
2. **The registration keys** for a connector class at v0.33.0 are read from the pin by W2-T32 [unverified here].
3. **The hybrid model** for the `SupportsHMA` check must fit a 24 GB card and be pinned by revision.
4. **WR3's contract.** When The Wire ships its connector contract and schema, `kv-events@1` and the `kv-publisher` checks reconcile with it, and DP6 consumes the same schema (vllm K8 course impact).
