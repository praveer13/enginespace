# TR1 · Read the engines: nano-vllm, Mini-SGLang and "Inside vLLM", mapped onto the pins

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr1`. **Hours:** about 10 [estimated]: 7.5 in the browser (B) and 2.5 on a GPU (F). **Ships in:** W1 for the browser parts and W2 for the fork lab (D-002, D-039). **Owns:** nothing shared. Abort inside the engine belongs to the Data Plane's DP5; the Data Plane has not shipped, so TR1 carries a minimal version (catalog §4's rule), inside its hours.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md): the catalog is kernelspace `SPECIALIZATIONS.md` (2026-10-24); kernelspace ids were checked at `origin/master` d478f91; research rows are cited as (vllm M11) and (sglang O1). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Trace one request from the API server to the model runner and back, in vLLM and in SGLang at the pinned versions, naming every queue, copy and sync on the way. This is outcome 1. |
| **Reading targets** | nano-vllm at `bb823b3e`, Mini-SGLang at `9a91cfaf`, and "Inside vLLM" at commit `42172ad`, each read beside the pinned engine it simplifies or predates. |
| **Artifacts** | A lifecycle map graded by span checks (B); a nano-vllm fork that emits a span for every stage of your own map (F). |
| **Game slot** | The request-lifecycle game: working name **The Engine Floor**, `engine-floor`, 3D (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard); T5.L10 and T5.L7 most directly; T0.L6 and T2.L1 recommended. |
| **GPU** | About 2.5 h on a 4090-class GPU [estimated], for the fork. |

## 1. What it teaches

1. **Five mechanisms, and where each is legal.** A request crosses a boundary only through the mechanism that crosses it: a **queue** between threads, **IPC** between processes, a **copy** between host and GPU, a **sync** before reading anything produced asynchronously, and **compute** where work happens. The lifecycle map is a list of stages, each with a mechanism and a location (process, thread, device).
2. **nano-vllm as a small, honest engine** (about 560 engine lines [derived: 92 + 120 + 90 + 257, from vllm T4's measured counts]): `LLMEngine`, a `Scheduler` that runs prefill *or* decode in a step, a `BlockManager` with prefix hashes and 256-token blocks, recompute preemption, and a `ModelRunner` that captures decode CUDA graphs. It mirrors vLLM v1's vocabulary, not its structure: there is no engine-core process, no ZMQ, no async scheduling and no single mixed token budget (vllm T4). The learner reads it for the block manager and prefix hashing, then sets it beside vLLM's one-budget scheduler.
3. **Mini-SGLang as a small, honest server.** An API server, a tokenizer worker, one scheduler per tensor-parallel rank and a detokenizer; ZMQ for control and NCCL for tensors; overlap scheduling on by default, with `MINISGL_DISABLE_OVERLAP_SCHEDULING=1` to turn it off (sglang M3). It is about 8,090 physical lines of Python [measured], not the README's 5,000 (sglang M2).
4. **"Inside vLLM" as history, with a "what moved" table.** The post reads commit `42172ad` of 2025-08-09, which predates Model Runner V2, the CUDA-graph dispatcher and 23 vLLM minors [derived, vllm T1]. The learner maps each of its boxes onto its location at v0.33.0 (vllm T2).
5. **vLLM v0.33.0, by symbol.** The HTTP chain (`run_server` → `build_app` → `create_chat_completion` → `AsyncLLM.generate` → `AsyncMPClient` over ZMQ → `EngineCoreProc`); the engine core's input and output threads and its `input_queue`, `output_queue`, `aborts_queue` and `batch_queue`; the busy loop's five calls (TR2 owns them); MRV2's `GPUModelRunner.execute_model` and `sample_tokens`, and `AsyncOutput`, which copies sampled ids to the host on a separate stream (vllm M7, M11, TR1 notes). Request states are the pin's `RequestStatus` names, not the post's (vllm M10).
6. **SGLang v0.5.23's loop.** The tokenizer manager, scheduler and detokenizer talk over ZMQ; the overlap event loop launches batch N and then processes batch N−1 from a `result_queue`; `FutureMap` (`managers/overlap_utils.py`) relays the last step's sampled tokens to the next forward on the GPU; forward, copy and schedule streams are separate (sglang O1, TR1 notes). The default request path is Python. A Rust HTTP server exists and is opt-in (`SGLANG_RUST_SERVER`, default False), and the radix tree's Rust core is on by default with fallbacks to Python (sglang Z1, X1, X2).
7. **Abort inside the engine** (DP5's minimal version). In vLLM, aborts arrive on `aborts_queue` and are drained by `_process_aborts_queue` before `update_from_output`; the request ends `FINISHED_ABORTED` and its blocks are freed (vllm TR1 notes, M10).
8. **Reading at the pin.** Every graded anchor comes from the pinned code, never from a post's file names: `vllm/entrypoints/openai/api_server.py` is now a 59-line deprecated shim [measured] (vllm M11), and SGLang removed or renamed its cache classes in two minors (sglang X3).

**Knowledge components** (proposed; W1-T03 writes them):

| KC | Requires |
|---|---|
| `tr1.five-mechanisms` | `ks:t2.process-thread`, `ks:t0.wait-bars` |
| `tr1.small-engine-anatomy` | `ks:t5.block-tables`, `ks:t5.continuous-batching`, `ks:t5.prefix-cache-keys` |
| `tr1.phases-vs-one-budget` | `tr1.small-engine-anatomy`, `ks:t5.prefill-decode-interference` |
| `tr1.vllm-lifecycle` | `tr1.five-mechanisms` |
| `tr1.sglang-lifecycle` | `tr1.five-mechanisms` |
| `tr1.request-states` | `tr1.vllm-lifecycle` |
| `tr1.abort-path` | `tr1.request-states` |
| `tr1.read-at-the-pin` | `tr1.vllm-lifecycle` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR1 takes from it |
|---|---|---|
| Lesson | T5.L10 "The Production Stack: vLLM, SGLang, TRT-LLM, Dynamo" (`t5.l10`) | The engines' design centres (`t5.engine-design-centers`). TR1 opens the boxes T5.L10 drew. One erratum travels with it: T5.L10 says TRT-LLM's PyTorch backend "is the default", and since v1.2.0 (2026-03-12) it is the only backend (sglang A7). |
| Lesson, play, lab | T5.L7 "Continuous Batching" (`t5.l7`): the `scheduler` play ("I was the scheduler"); lab 06 `batching-scheduler` ("Goodput or Nothing") and its twin `lab06.twin.*` at vLLM v0.31.0 | The scheduler the learner already wrote and played. The twin's facts still hold at v0.33.0; only line anchors moved (vllm M12). |
| Lesson, lab | T5.L5 "PagedAttention Deep Dive" (`t5.l5`); lab 02 `kv-block-manager` ("PagedAttention, From the Inside") | Block tables and refcounts (`t5.block-tables`, `t5.block-refcounts`), which nano-vllm's `BlockManager` implements. |
| Lesson, lab | T5.L6 "Prefix Caching: The Free Lunch" (`t5.l6`); lab 07 `radix-cache` ("The Prefix Is the Product") and its twin `lab07.twin.*` at SGLang v0.5.21 | Prefix hashing and SGLang's Rust tree core, which TR1 places on the request path. |
| Lesson, lab | T5.L2 "Tokenization & BPE" (`t5.l2`); lab 03 `bpe-tokenizer` | Where tokenization runs: in vLLM's frontend process, and in SGLang's tokenizer manager. |
| Lesson | T0.L6 "Reading a Flame Graph (and Making One)" (`t0.l6`) | Its "recurring cast": the Python scheduler tax, the detokenizer drip, the NCCL stall and the KV-copy surprise (KC `t0.wait-bars`). TR1 finds where each lives. |
| Lesson | T2.L1 "Processes, Threads & Context Switches" (`t2.l1`) | Processes and threads (`t2.process-thread`), the map's locations. |
| Lesson, lab | T2.L5 "Mutexes, Atomics & Lock-Free Queues" (`t2.l5`); lab 04 `mpmc-queue` ("The Intake Ring") | What a queue between threads guarantees. |
| Lesson | T3.L6 "Why NVIDIA Dynamo's Data Plane Is Rust" (`t3.l6`) | Where Rust sits on the serving path; TR1 adds SGLang's tree core and both engines' opt-in Rust frontends. |

**Within enginespace.** TR0 (hidden syncs in PyTorch) helps. TR2 starts where TR1's map reaches the busy loop. TR3 checks this map against real traces. TR5b's connector waits (`WAITING_FOR_REMOTE_KVS`) and TR6's grammar wait (`WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR`) are request states TR1 introduces.

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr1.l1` | Five mechanisms: queue, IPC, copy, sync, compute | 30 | B |
| `tr1.l2` | nano-vllm in one sitting: `LLMEngine`, `Scheduler`, `BlockManager`, `ModelRunner` | 75 | B |
| `tr1.l3` | Mini-SGLang: one request through four processes | 75 | B |
| `tr1.l4` | "Inside vLLM" at 42172ad, and what moved by v0.33.0 | 60 | B |
| `tr1.l5` | vLLM at the pin, by symbol: from `run_server` to `sample_tokens` | 60 | B |
| `tr1.l6` | SGLang at the pin: the overlap loop, `result_queue`, `FutureMap`, three streams, and the Rust pieces | 45 | B |
| `tr1.l7` | Abort inside the engine (DP5's minimal version) | 30 | B |
| — | The Engine Floor: practice levels, then the graded `map` | 60 | B |
| — | Lab `tr1.fork`, stages s1-s3 | 150 | F |

**The "what moved" table for `tr1.l4`** (vllm T2; line counts [measured] at `42172ad` and at v0.33.0):

| File | At 42172ad | At v0.33.0 |
|---|---|---|
| `vllm/v1/core/sched/scheduler.py` | 1,163 | 3,783 |
| `vllm/v1/engine/core.py` | 1,199 | 2,860 |
| MRV1 `vllm/v1/worker/gpu_model_runner.py` | 3,069 | 7,192 |
| `kv_cache_manager.py` | 407 | 931 |
| KV connector `base.py` | 328 | 805 |
| `vllm/distributed/kv_events.py` | 356 | 610 |
| `vllm/v1/sample/rejection_sampler.py` | 631 | 1,197 |
| `config/__init__.py` | 4,501 | 160 |
| `vllm/v1/cudagraph_dispatcher.py` | did not exist | 348 |

Statements in the post that are stale at the pin (vllm T2): async scheduling listed as "Experimental" (the default since v0.14.0, vllm M6); no draft-model method; Medusa listed (removed in v0.33.0, vllm S1); chunked prefill described through `long_prefill_token_threshold` (now on by default, with the threshold at 0, vllm M8); `VLLM_USE_V1`; and `openai/api_server.py` as the entry point (vllm M11).

**Reading budget for `tr1.l5`** (line counts [measured] at v0.33.0, vllm TR1 notes): `async_llm.py` 1,447; `core_client.py` 2,170; `core.py` 2,860; `scheduler.py` 3,783; MRV2 `model_runner.py` 2,519. The lesson reads named symbols, not whole files.

**Reading order for `tr1.l3`** (sglang TR1 notes, at `9a91cfa`): `server/` (840 lines), `tokenizer/`, `scheduler/scheduler.py` (267), `engine/engine.py` (233), `engine/graph.py` (171), `kvcache/radix_cache.py` (237), `attention/fa.py` and `fi.py` [measured by the research: line counts].

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | "How many process boundaries does a sampled token cross on its way to the client, in vLLM? In Mini-SGLang?" "Where does detokenization run?" | `predict` |
| **Play** | The Engine Floor: lay the request's stages from a tray, each a mechanism at a location; the request moves only past a stage that obeys the rules and matches the pinned engine (§6). | `play` |
| **Build** | Fork nano-vllm and make it emit one span for every stage of your own map; the grader checks the fork still computes the same tokens, and the browser checks the spans against your map (§5). | `receipt` |
| **Prove** | With the agent closed: `map` on fresh scenarios (engine × streaming × tensor parallelism × abort × prefix hit × n = 2), checked span by span against a lifecycle trace. | `play` in Prove mode, `proved` |
| **Keep** | Today draws `tr1.which-mechanism`, `tr1.where-does-it-run`, `tr1.request-state` and `tr1.what-moved` on fresh seeds. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What the learner submits | How it is graded | Pass |
|---|---|---|---|---|
| `play:engine-floor/map` (the lifecycle map) | B | A fresh scenario's path, stage by stage | The session replays the actions; `spanCheck` matches each stage, in order, to a span of the scenario's lifecycle trace. The traces are synthetic, from `packages/sim/lifecycle`, and labelled so until W2-T21's owner traces exist (A§5.8). | The whole path right on its first run, on 3 fresh scenarios |
| Item families `tr1.which-mechanism`, `tr1.where-does-it-run`, `tr1.request-state`, `tr1.what-moved` | B | Answers on fresh seeds | Keys from the pinned lifecycle data | Exit ticket (3 items, ≥ 2 right, ≥ 1 constructed) |
| `receipt:tr1.fork.s1` (first win) | F | Unmodified nano-vllm at `bb823b3e` run by the grader on the challenge's prompts | The grader checks pins, the fingerprint, and teacher-forced agreement with the owner's reference continuations (A§9.6) | Teacher-forced agreement as ASSESSMENT §5.7 defines it: every reference token in the engine's top 5, and its log-probability within the GPU class's tolerance at 99% or more of positions [estimated] |
| `receipt:tr1.fork.s2` (the instrumented fork) | F | Your fork, its span log converted to `trace@1`, and its outputs | Grader: the fork's greedy outputs equal s1's on the same machine and seeds, under ASSESSMENT §5.7's tie-aware rule ("instrumentation changes nothing"). Browser: the span names and order equal the nano-vllm path you laid in The Engine Floor's `nano` level, which is the pinned lifecycle data; `traceChecks` passes (A§5.7); every copy span sits between the compute spans it feeds; a sync span ends after the GPU work it waits for. | All checks pass |
| `receipt:tr1.fork.s3` (optional) | F | The fork run with a KV pool small enough to force recompute preemption | Browser: a preempted request's spans show it leaving the running set, its blocks freed, and its prefill repeated | Practice credit only |

**The fork's span API.** The kit ships a ten-line context manager that writes `{stage, mechanism, location, t0_ns, t1_ns, req}` records, plus an NVTX range for TR3's later use. The grader converts the records to `trace@1` (A§5.7). The learner chooses where each span starts and ends; the browser judges the order and the nesting, not the code.

## 6. Game slot

**The request-lifecycle game.** Working name **The Engine Floor**, id `engine-floor`, 3D with a 2D swimlane path and a DOM mirror. GAMES.md §5 designs it.

- **The rule is the concept.** A stage starts where the last one ended; a change of process needs IPC; a change of thread needs a queue; host to GPU needs a copy or a launch; reading an asynchronous result needs a sync first. Naming every queue, copy and sync is the only way to finish.
- **Levels the module uses** (GAMES.md's working ids): `nano`, `nano-tp`, `mini`, `inside`, `vllm`, `sglang`, `abort` for practice; `map` graded.
- **Scene, in objects only.** Processes are platforms stacked in height, with the GPU as a lower deck whose streams are lanes. Threads are zones on a platform; queues are buffers between zones; IPC is a bridge between platforms; copies are lifts down to the GPU deck; syncs are gates. One request capsule travels. Cameras: establish on the whole floor; follow the capsule, which is opt-in and off under reduced motion.
- **2D path.** Swimlanes, one per process and thread, with the same tray and actions.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0, commit `4ba787ec9959e566d3b587a796dff07673324da5`; docs at `docs.vllm.ai/en/v0.33.0/` | Fallback v0.32.0 if the R580 driver gate fails (D-035, vllm R4) |
| SGLang | v0.5.23, sha `297e54fd105e974cdf401e5b4d20253a22c16f90` | sglang R1 |
| nano-vllm | `bb823b3e06983d71485a8e1f23715ebd87d98ef8` (2026-04-26; no tags) | vllm T3 |
| Mini-SGLang | `9a91cfafe754aa85daee49998176275667eb58f2` (2026-05-17; no tags) | sglang M1 |
| "Inside vLLM" | post at `vllm.ai/blog/2025-09-05-anatomy-of-vllm` (2025-09-05), read against commit `42172ad18fbc22c89d0063184e4570cc84186e16` (2025-08-09) | The catalog links `vllm.ai/blog/anatomy-of-vllm`; the dated URL is canonical (vllm T1) |
| kernelspace twins | lab 06 at vLLM v0.31.0; lab 07 at SGLang v0.5.21 | They keep their pins; TR1 names the gap where it cites them (A§4.4) |
| Environment `nano-vllm` | Python 3.12 (nano-vllm needs < 3.13), torch 2.14.0, and a flash-attn build for torch 2.14 and CUDA 13 [unverified, vllm U3] | W2-T34 tests the install before the lab is written |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| vLLM's live HTTP path at v0.33.0 runs `launchers/api_server/entry.py` (`run_server`) → `launchers/app.py` (`build_app`) → `openai/chat_completion/serving.py` (`create_chat_completion`) → `AsyncLLM.generate` → `AsyncMPClient` (ZMQ) → `EngineCoreProc`; `openai/api_server.py` is a 59-line deprecated shim | [measured] | vllm M11 | 2026-11-01 | 14 days |
| The busy loop: `run_busy_loop` → `_process_input_queue` → `_process_engine_step` → `step` or `step_with_batch_queue` | [measured] | vllm M7 | 2026-11-01 | pin |
| `RequestStatus` values at v0.33.0 (WAITING, WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, WAITING_FOR_REMOTE_KVS, WAITING_FOR_STREAMING_REQ, RUNNING, PREEMPTED, and six FINISHED states) | [measured] | vllm M10 | 2026-11-01 | pin |
| MRV2 has been vLLM's default runner for all models since v0.29.0 (2026-09-09); MRV1 is deprecated and still ships | [measured] | vllm M1, M4 | 2026-09-09 | 14 days (watch for MRV1's removal) |
| "Inside vLLM" analyses commit 42172ad of 2025-08-09; it predates the v0.33.0 upload by 449.6 days, with 38 PyPI releases (23 minors) since | [measured] dates; [derived] intervals | vllm T1 | 2025-09-05 | static |
| nano-vllm runs prefill or decode per step, with 256-token blocks, Qwen3 only, and no engine-core split, ZMQ, async scheduling, speculation, structured output or hybrid KV | [measured] | vllm T4 | 2026-04-26 | 90 days |
| nano-vllm's README benchmark (RTX 4070 Laptop: vLLM 98.37 s, nano-vllm 93.41 s, no vLLM version) | [unverified] | vllm T3 | 2026-04-26 | never cited as a result |
| Mini-SGLang's process model and features, and its 8,090 physical Python lines | [measured] | sglang M2, M3 | 2026-05-17 | 90 days |
| SGLang's overlap loop processes batch N−1's result from a `result_queue` after launching batch N; on by default, `--disable-overlap-schedule` turns it off | [measured] | sglang O1 | 2026-11-02 | 14 days |
| SGLang's Rust HTTP server is opt-in (`SGLANG_RUST_SERVER` default False); its Rust radix-tree core is the default, with fallbacks | [measured] | sglang Z1, X1, X2 | 2026-11-02 | 14 days |
| vLLM's Rust frontend is experimental and off by default (`VLLM_USE_RUST_FRONTEND` = 0) | [measured] | vllm X1 | 2026-11-01 | 14 days |
| TRT-LLM's PyTorch backend has been its only backend since v1.2.0 (2026-03-12) | [measured] | sglang A7 | 2026-03-12 | 90 days |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr1.l1`-`tr1.l7` | 6.25 | — |
| The Engine Floor | 1.0 | — |
| `tr1.fork` s1-s3 | — | 2.5 |
| **Total** | **about 7.5** | **about 2.5** |

All [estimated]. The catalog's figure is 10 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| vLLM's HTTP entry path (it moved within the last few minors) | 14 days | `grep -n "def run_server"` and the shim's line count at the new tag |
| Queue names, the busy loop's calls, `RequestStatus` | pin | vllm §6's detector list |
| MRV1's presence | 14 days | `ls vllm/v1/worker/gpu_model_runner.py` (vllm §6) |
| SGLang cache class names (two minors of removals, sglang X3) | 14 days | the release notes' Breaking Changes at each SGLang minor |
| Rust defaults in both engines | 14 days | `environ.py` and `envs.py` defaults |
| nano-vllm and Mini-SGLang | 90 days | their `commits/main.atom` |
| The "what moved" table | each re-pin | re-run `wc -l` at the new tag |
| Lifecycle data in `packages/sim/lifecycle` | pin | W1-T16's per-stage citations, re-read at each re-pin |

## 11. Open items

1. **The fork's GPU stack.** nano-vllm needs a flash-attn build for torch 2.14 and CUDA 13, which is [unverified] (vllm U3). If none installs, the fork target becomes Mini-SGLang at `9a91cfa` (Linux and CUDA only, with JIT kernels; sglang M3) and W2-T34 says so.
2. **nano-vllm's tensor-parallel processes.** GAMES.md's `nano-tp` level assumes a worker process for rank 1; W1-T16 confirms it at the pin [unverified].
3. **A CPU-only alternative.** SGLang's Simulator runs SGLang's real scheduler on a CPU (sglang T9), which could give learners without a GPU a real-scheduler lane. It is validated against v0.5.16-v0.5.18 and `main`, not against v0.5.23, so TR1 lists it as reading only until someone validates it at the pin.
4. **Owner traces for `map`.** The graded `map` runs on synthetic lifecycle traces until W2-T21 captures real ones; then each engine family gets one owner-captured lifecycle trace as a practice case.
