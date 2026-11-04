# TR2 · The step loop: async scheduling, the MRV2 delta, CUDA graphs and their dispatch keys

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr2`. **Hours:** about 10 [estimated], all in the browser (B). **Ships in:** W0 for the front-page run and the step-loop model's first version, W1 for the module (D-002, D-004, D-040). **Owns:** the step loop and CUDA-graph modes inside the engine (catalog §4). Tensor Compilers' LW10 cites it for compilation and buckets.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm M7) and (sglang G2). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Explain, and then close, the GPU's idle time between engine steps: which CPU work sits on the critical path, what async scheduling hides, what a CUDA graph replay saves, and why a batch dispatches to the graph it does. This is half of outcome 2; TR3 tests the other half on real traces. |
| **The catalog's question** | "Why is the GPU idle 300 µs between steps?" No primary source gives that figure (sglang W6, W7), so TR2 treats it as a hypothesis the learner measures in TR3, never as a cited number. |
| **Artifact** | The step-loop sim, toggled until the bubbles close, graded on fresh seeds (B). |
| **Game slot** | The step-loop game: working name **The Loop**, `loop`, 3D flagship. It is also the front page (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard), T5.L7 above all; T0.L6 and T4.L3 recommended. |
| **GPU** | None. TR2 is a no-GPU module (D-002). Its predictions about real engines are tested in TR3's lab. |

## 1. What it teaches

1. **One step is five calls.** At v0.33.0 `EngineCore.step` runs `scheduler.schedule()`, then `execute_model(non_block=True)`, then `get_grammar_bitmask()`, then waits on the future, then `sample_tokens(grammar_output)`, then `update_from_output` (vllm M7). With a batch queue, `step_with_batch_queue` keeps up to `max_concurrent_batches` in flight: 2 with async scheduling on MRV1 at PP = 1, `pp_size + 1` on MRV2, otherwise `pp_size`. When nothing ran but requests remain, the loop sleeps 1 ms [measured at v0.33.0] (vllm M7).
2. **One token budget, no phases.** vLLM's scheduler has no prefill or decode phase: each request has `num_computed_tokens` against `num_tokens_with_spec`. Running requests are scheduled first, then waiting ones, from one budget. Chunked prefill is on; `long_prefill_token_threshold` is 0; `scheduler_reserve_full_isl` is True, so the whole prompt must fit before admission. Preemption is recompute only, and under FCFS the victim is the last running request (vllm M8). This is lab 06's twin, still true at the pin (vllm M12).
3. **Defaults depend on the GPU.** Under 70 GiB, as on a 4090, the server defaults to `max_num_batched_tokens` 2,048 and `max_num_seqs` 256; on an H100 they are 8,192 and 1,024 [measured at v0.33.0] (vllm M9). The same command is a different configuration on two GPUs, and TR3's receipts record both values.
4. **The bubble, and async scheduling.** Without overlap, the GPU idles while the CPU schedules and prepares the next step and reads this one. Async scheduling, the default since v0.14.0 (2026-01-20, vllm M6), plans step N+1 while step N runs, using placeholders for tokens not yet sampled. The cost: a request that stops on EOS computes one more token that is thrown away, and TTFT rises slightly while TPOT falls (sglang W2, contributor-reported). The model checks the dependency: no step may read a token before it is sampled.
5. **The MRV2 delta.** Model Runner V2, the default for all models since v0.29.0 (2026-09-09, vllm M1), keeps persistent state apart from per-step inputs, avoids CPU syncs in the step loop, stages block-table writes (`StagedWriteTensor`), prepares inputs and samples with Triton on the GPU, and owns an explicit CUDA-graph manager (vllm M5). MRV1 is deprecated and still ships, and a configuration MRV2 does not support silently falls back to it with one warning line (vllm M2, M4).
6. **CUDA graphs: capture, replay, padding, modes.** A replay launches a captured sequence of kernels in one call, but only for the shapes captured. vLLM captures `[1, 2, 4]` plus steps of 8 up to 256 and steps of 16 above, up to 512 by default (1,024 on datacenter Blackwell) [measured at v0.33.0], and pads a batch up to the next captured size (vllm G2). Five modes exist: NONE, PIECEWISE, FULL, FULL_DECODE_ONLY and FULL_AND_PIECEWISE; the optimisation level picks the default, `-O2` giving FULL_AND_PIECEWISE (vllm G1). A backend that cannot run a mode gets the closest one it supports, so the mode requested is not always the mode run (vllm G7).
7. **Dispatch keys: which graph replays this step.** MRV2 dispatches on a 7-field `BatchExecutionDescriptor` (`cg_mode`, `num_tokens`, `num_reqs`, `uniform_token_count`, `max_query_len`, `num_active_loras`, `num_ubatches`). MRV1's `BatchDescriptor` has 5 fields, among them `has_lora`, and tries FULL, then a relaxed PIECEWISE key, then NONE. The published design doc shows a 4-field tuple that matches neither (vllm G3-G5; D-041). With adapters, graphs are captured with and without them, or per power-of-two count of active adapters (vllm G6).
8. **Graphs cost memory before the KV cache is sized.** Since v0.29.0, MRV2 profiles graph memory and reserves it before sizing the KV cache, so a KV-capacity estimate made the T5.L4 way is high by that reservation (vllm G9).
9. **The same loop elsewhere.** SGLang overlaps by default with a one-batch result lag (sglang O1), captures decode graphs keyed by padded batch size and prefill graphs keyed by padded token count, per phase in {full, breakable, disabled} (sglang G1, G2), and on a 24 GB card caps the decode graph at 48 sequences below TP 4 [derived from source, not run; sglang G3]. Mini-SGLang's `GraphRunner` is the minimal version (static buffers, `pad_batch`, `replay`; sglang TR2 notes, read at `9a91cfa` on 2026-11-03). TRT-LLM's overlap scheduler adds one extra decode step (sglang G6). "Breakable" graphs are a footnote, not a sixth mode (vllm G8).

**What the host costs, from kernelspace's S5 card.** On S5's H100 FP8 row for Llama-3-70B, host work per running request per step is t_seq = 61.1 µs, with a refit range of 53.0-69.9 µs (fit adopted 2026-10-18, unsigned; kernelspace `docs/physics/report.json`). At TP 4 with 64 decoding sequences of 1,024 tokens, that term is 3.9 ms of a 17.7 ms step; at TP 2 with 4 sequences it is 0.24 ms of 18.0 ms [derived from that row for this file, matching GAMES.md §3.2]. The S5 fit treats the term as additive. The Loop moves it to the CPU lane, where async scheduling can hide it, in place of the host card's per-sequence phases (proposed decision D-044); that is an extrapolation, and its card says so (WORLD §4.4).

**Knowledge components** (proposed; W1-T03 writes them):

| KC | Requires |
|---|---|
| `tr2.step-calls` | `tr1.vllm-lifecycle` (advisory) |
| `tr2.one-budget` | `ks:t5.continuous-batching`, `ks:t5.sched-order`, `ks:t5.admission-headroom` |
| `tr2.gpu-dependent-defaults` | `tr2.one-budget` |
| `tr2.bubble` | `ks:t0.wait-bars`, `tr2.step-calls` |
| `tr2.async-overlap` | `tr2.bubble` |
| `tr2.mrv2-delta` | `tr2.async-overlap` |
| `tr2.graph-replay` | `tr2.bubble` |
| `tr2.capture-padding` | `tr2.graph-replay` |
| `tr2.graph-modes` | `tr2.graph-replay` |
| `tr2.dispatch-keys` | `tr2.graph-modes`, `tr2.capture-padding` |
| `tr2.graph-memory` | `ks:t5.kv-capacity`, `tr2.graph-replay` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR2 takes from it |
|---|---|---|
| Lesson, play, lab | T5.L7 "Continuous Batching" (`t5.l7`); the `scheduler` play ("I was the scheduler"); lab 06 `batching-scheduler` ("Goodput or Nothing") and its twin `lab06.twin.*` (claim `twin.vllm.scheduler`, vLLM v0.31.0) | The learner has scheduled by hand, composed a policy and written one in Rust. TR2 adds time: CPU and GPU lanes, overlap and graphs. The twin's head-of-line blocking and FCFS victim are the same rules at v0.33.0 (vllm M12). |
| Lesson | T5.L3 "Inference vs Training; Prefill vs Decode" (`t5.l3`) | Prefill and decode costs (`t5.prefill-vs-decode`), which one budget mixes. |
| Lesson | T5.L8 "Speculative Decoding & Chunked Prefill" (`t5.l8`) | Chunked prefill's trade-off, now in the scheduler's terms. |
| Lesson | T0.L6 "Reading a Flame Graph (and Making One)" (`t0.l6`) | "The Python scheduler tax": V0's loop spent visible milliseconds per step in Python bookkeeping (`t0.wait-bars`). TR2 shows what V1 and MRV2 did about it. |
| Lesson | T4.L3 "The Roofline Model" (`t4.l3`) | Decode is bandwidth-bound (`t4.decode-bandwidth`), so a step costs about the same with one request or many, which is why the loop must keep slots full. |
| Lesson | T5.L4 "KV Cache Math" (`t5.l4`) | KV capacity (`t5.kv-capacity`), which graph memory now reduces (vllm G9). |
| Lesson | T2.L4 "Scheduling & Admission Control" (`t2.l4`) | Admission and scheduling policy (`t2.admission-scheduling`). |
| Lesson | T7.L3 "The Pareto Frontier: tok/s/GPU vs tok/s/user" (`t7.l3`) | The frontier the loop's choices move along. |
| Page | Boot (`/boot`) | "One user keeps ≈0.3% of an H100's math busy" [kernelspace PLAN-100X §0, derived there]: the reason batching exists. |
| Model | kernelspace's S5 card (`src/lib/world/physics/card.ts`, `docs/specs/s5.md`), vendored unchanged (A§13) | The GPU lane's step time on its three calibrated rows (WORLD §4). |

**Within enginespace.** TR1's map reaches the busy loop where TR2 begins. TR3 measures what TR2 models. TR6's grammar mask and speculation are levels of the same game. TR8's server model is TR2's loop run coarse (A§5.6).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Blocks |
|---|---|---|---|
| `tr2.l1` | One step, five calls: vLLM's busy loop at v0.33.0 | 40 | prediction; the step as a timeline; exit items |
| `tr2.l2` | One token budget: chunked prefill, recompute preemption, and defaults that depend on your GPU | 45 | lab 06 twin recap; `tr2.preempt-victim`, `tr2.default-budget` items |
| `tr2.l3` | Async scheduling closes the bubble, and costs a token | 50 | The Loop's `async` level; `tr2.bubble-width` items |
| `tr2.l4` | The MRV2 delta: persistent state, GPU-side input prep, and why MRV1 still ships | 45 | The Loop's `mrv2` level; the fallback warning line as a reading |
| `tr2.l5` | CUDA graphs: capture, replay, padding, and five modes | 50 | The Loop's `graphs` level, stages `comb` and `sizes`; `tr2.graph-hit`, `tr2.padding-waste` items |
| `tr2.l6` | Dispatch keys: which graph replays this step | 45 | The Loop's `graphs` · `modes` stage and `keys` level; `tr2.dispatch-key`, `tr2.kv-after-graphs` items |
| `tr2.l7` | The same loop in SGLang, Mini-SGLang and TRT-LLM | 35 | an engine-by-engine ablation table; reading card |
| — | The Loop: practice across levels | 120 | — |
| — | The Loop: graded `graphs` · `sizes`, `graphs` · `modes` and `close`, and the module's items | 75 | — |
| — | Compose and In production: your configuration as engine flags | 45 | — |
| — | Predict-then-reveal sets spread across the lessons | 30 | — |

**The ablation table in `tr2.l7`** (the switches each engine exposes, [measured] by the research on 2026-11-03):

| Engine (pin) | Overlap switch | Graph controls |
|---|---|---|
| vLLM v0.33.0 | `--no-async-scheduling` (vllm M6) | `-O0`/`-O1`/`-O2`; `--compilation-config '{"cudagraph_mode": …}'`; `cudagraph_capture_sizes`, `max_cudagraph_capture_size`, `cudagraph_specialize_lora`; `VLLM_USE_V2_MODEL_RUNNER=0\|1` (vllm G1, G2, G6, M2) |
| SGLang v0.5.23 | `--disable-overlap-schedule`; `SGLANG_DISABLE_CONSECUTIVE_PREFILL_OVERLAP` (sglang O1) | `--cuda-graph-config`, `--cuda-graph-backend-{decode,prefill}`, `--debug-cuda-graph`, `--enable-profile-cuda-graph` (sglang G1) |
| Mini-SGLang `9a91cfa` | `MINISGL_DISABLE_OVERLAP_SCHEDULING=1` | `--cuda-graph-max-bs` (sglang M3) |
| TRT-LLM (latest tag v1.4.0rc2) | overlap scheduler on by default, one extra decode step (sglang G6) | CUDA-graph padding (sglang G6) |

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before `async`: "With async scheduling on, what TPOT on each cost card?" Before `graphs` · `sizes`: "Which batch sizes cost the most padding under the default capture list?" | `predict`, graded numerically at reveal |
| **Play** | The Loop's TR2 levels: set the levers (async scheduling, runner, graph mode, capture sizes, LoRA specialisation, budgets), run, and read the lanes, launch combs, padding cells and counters (§6). | `play` on practice seeds |
| **Build** | Compose: write the configuration as a policy spec that compiles to engine flags, and read the In-production card, which lists the pinned flags of vLLM and SGLang as claims. There is no code lab: the build is the configuration, and TR3's lab runs it on a real engine. | `play` (Compose) |
| **Prove** | With the agent closed: `close` on fresh seeds. The live readouts are hidden, and the configuration is chosen from the workload and cost cards before a single run. | `play` in Prove mode, `proved` |
| **Keep** | Today draws `tr2.bubble-width`, `tr2.graph-hit`, `tr2.padding-waste`, `tr2.dispatch-key`, `tr2.default-budget`, `tr2.kv-after-graphs` and `tr2.preempt-victim` on fresh seeds. | `review` |

## 5. Artifacts and how each is graded

Pass bars are ASSESSMENT.md's (§4.3), adopted from GAMES.md §3's proposals.

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `play:loop/close`: "toggled until the bubbles close" (the catalog's artifact) | B | One configuration per fresh seed, chosen before any run | The pure session replays the configuration on the seed's workload and cost card; the hidden reference configuration runs in lockstep (A§6.3) | Useful tokens per GPU-ms at least 97% of the reference's, and zero dependency violations, on 3 fresh seeds |
| `play:loop/graphs`, stage `sizes` | B | A capture-size list within a capture-time budget, for a seeded histogram of batch sizes | Capture cost = padded µs + eager µs, against the exact optimum the model computes at grade time | At most 1.05 × the optimum, on 3 fresh seeds |
| `play:loop/graphs`, stage `modes` | B | A `cudagraph_mode` for a seeded prefill-decode mix and an attention backend's graph support | Against the reference's mode; drawn answer first, so each mode is right on about a quarter of seeds | The reference's mode, on 3 fresh seeds |
| Item families (§4, Keep) | B | Answers on fresh seeds | Keys from `packages/sim/steploop` at grade time | Exit ticket: 3 items, ≥ 2 right, ≥ 1 numeric |

**Why "everything on" is not the answer.** On some graded seeds, capturing every size runs out of the capture-time or memory budget, and graphs reserved before the KV cache cut the batch the cache can hold (vllm G9). W1-T14's acceptance requires a test that shows "everything on" failing some graded seeds.

**What TR2 never grades.** Browser timing (catalog §7), any number from a real GPU, and the front-page run (D-038).

## 6. Game slot

**The step-loop game.** Working name **The Loop**, id `loop`, 3D flagship with a 2D path and a DOM mirror. The front page opens on it (D-004), and TR6 adds its mask lane. GAMES.md §3 designs it.

- **The rule is the concept.** A step costs the GPU about the same with one request or many, so the loop earns tokens by keeping every slot live and by planning the next step while this one runs. In TR2's levels each step is also padded to a captured graph size, or falls back to launching kernels one by one.
- **Levels the module uses** (GAMES.md's ids, which follow TRACKER W1-T13): `async`, `graphs` · `comb`, `keys` and `mrv2` for practice; `graphs` · `sizes`, `graphs` · `modes` and `close` graded.
- **Two cost cards.** "70B on H100" takes its GPU lane from S5's H100 FP8 row. "Small model" is a synthetic card, since S5 has no small-model row, and is labelled synthetic (WORLD §2.11).
- **Scene, in objects only.** A CPU lane and a GPU lane run as parallel tracks along time. Batch slots stack across the track's width. Steps are slabs; kernel launches are combs whose teeth collapse into one replay slab when a graph hits; padded slots are hollow cells; bubbles are open gaps on the GPU track; a thrown-away EOS token is a hollow ghost cell. Camera presets: along time, side and top.
- **Dispatch keys on the In-production card** follow D-041, as GAMES.md §3 does: MRV2's 7-field descriptor first, MRV1's `has_lora` as the legacy example, SGLang's padded-size buckets beside them.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM code | v0.33.0, `4ba787ec9959e566d3b587a796dff07673324da5` | every symbol and default above |
| vLLM docs | `docs.vllm.ai/en/v0.33.0/design/cuda_graphs/`, `…/design/model_runner_v2/`, `…/design/optimization_levels/` | versioned, not `/en/latest/`, which moves (vllm R5). The CUDA-graph page carries a stale descriptor snippet; lessons say "read the code at the pin" (vllm G5). |
| MRV2 post | `vllm.ai/blog/2026-03-24-mrv2` (2026-03-24) | written at v0.18; its limitation list is out of date (vllm §3) |
| SGLang | v0.5.23, `297e54fd105e974cdf401e5b4d20253a22c16f90` | `arg_groups/cuda_graph_hook.py`, `arg_groups/memory_hook.py`, `managers/scheduler.py` |
| Mini-SGLang | `9a91cfafe754aa85daee49998176275667eb58f2` | `engine/graph.py` (171 lines [measured], sglang M2) |
| kernelspace S5 card | vendored at d478f91 with `docs/physics/report.json` (fit adopted 2026-10-18) | A§13 |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| `step` runs schedule → execute_model(non_block) → get_grammar_bitmask → future.result → sample_tokens → update_from_output; batch-queue depth 2 (MRV1, async, PP = 1) or `pp_size + 1` (MRV2); 1 ms sleep when idle | [measured] | vllm M7 | 2026-11-01 | pin |
| One token budget, chunked prefill on, threshold 0, `scheduler_reserve_full_isl` True, recompute preemption, FCFS victim `running[-1]` | [measured] | vllm M8, M12 | 2026-11-01 | pin |
| Default budgets by GPU memory: 2,048 / 8,192 tokens and 256 sequences under 70 GiB; 8,192 / 16,384 and 1,024 on an H100 | [measured] | vllm M9 | 2026-11-01 | pin |
| Async scheduling is the default since v0.14.0 (2026-01-20) | [measured] | vllm M6 | 2026-01-20 | static |
| Async scheduling: "throughput by 3-15%", none at batch size 1, TPOT lower and TTFT slightly higher | [unverified], contributor-reported | sglang W2 (vLLM PR #19970) | 2025-07 | static |
| MRV2 is the default for all models since v0.29.0 (2026-09-09); MRV1 deprecated, still 7,192 lines at v0.33.0; fallback to MRV1 for 5 reasons, with one warning | [measured] | vllm M1, M2, M4 | 2026-09-09; 2026-11-01 | 14 days |
| MRV2's reported gains: +56.2% throughput on Qwen3-0.6B (one GB200) and −6.3% TPOT on GLM-4.7-FP8 with MTP = 1 (four GB200s) | [unverified], vendor-reported | vllm M5; sglang W1 | 2026-03-24 | static; shown with its hardware, never as a target |
| Five CUDA-graph modes; `-O2` default gives FULL_AND_PIECEWISE | [measured] | vllm G1 | 2026-11-01 | pin |
| Default capture sizes `[1, 2, 4] + range(8, 256, 8) + range(256, max + 1, 16)`, max 512 (1,024 on datacenter Blackwell) | [measured] | vllm G2 | 2026-11-01 | pin |
| MRV2's 7-field `BatchExecutionDescriptor`; MRV1's 5-field `BatchDescriptor` with `has_lora`; the design doc's stale 4-field tuple | [measured] | vllm G3-G5 | 2026-11-01 to 2026-11-03 | pin; the doc 14 days |
| Graph memory is reserved before KV sizing since v0.29.0 | [measured] | vllm G9 | 2026-09-09 | pin |
| SGLang overlaps by default with a one-batch result lag | [measured] | sglang O1 | 2026-11-02 | 14 days |
| SGLang's graph buckets by phase, and the 24 GB decode cap of 48 below TP 4 | [measured] buckets; [derived from source, not run] cap | sglang G1-G3 | 2026-11-02 | 14 days |
| TRT-LLM's overlap scheduler adds one extra decode step; graph padding "up to 22%" | [measured] the first; [unverified] the second | sglang G6 | undated | 90 days |
| "GPU idle 300 µs between steps" has no primary source | [unverified] | sglang W6, W7 | — | hypothesis to measure in TR3 |
| S5's H100 FP8 host term t_seq = 61.1 µs (refit 53.0-69.9 µs) | [measured] from the fit report | kernelspace `docs/physics/report.json` at d478f91 | fit adopted 2026-10-18 | until W2-T22 refits the host card |

## 9. Hours

| Activity | B |
|---|---|
| Lessons `tr2.l1`-`tr2.l7` | 5.2 |
| The Loop, practice | 2.0 |
| Graded levels and items | 1.25 |
| Compose and In production | 0.75 |
| Predict-then-reveal sets | 0.5 |
| **Total** | **about 10** |

All [estimated]. The catalog's figure is 10 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector (vllm §6 unless named) |
|---|---|---|
| `async_scheduling`'s default | pin | `grep -n "async_scheduling:" vllm/config/scheduler.py` |
| MRV2's fallback reasons and MRV1's presence | 14 days | the body of `_get_v2_model_runner_unsupported_features`; `ls gpu_model_runner.py` |
| The five modes, capture sizes, both descriptors | pin | the `CUDAGraphMode` members; the descriptors' fields |
| The design doc's stale snippet | 14 days | diff the doc's snippet against the code; raise a change card when they agree again |
| Default budgets per GPU class | pin | `get_batch_defaults` in `arg_utils.py` |
| SGLang's buckets, phase modes and 24 GB cap | 14 days | `cuda_graph_hook.py` and `memory_hook.py` at the new tag |
| The S5 host term | until W2-T22, then each re-pin | the refit report |

## 11. Open items

1. **The front-page levers.** Settled as proposed decision D-043: the front page uses GAMES.md §3.1's manual batching with refill and overlap, and CUDA graphs are left to TR2's levels. ARCHITECTURE §6.11 now follows it; the owner confirms with O-11.
2. **The host term's lane.** Settled as proposed decision D-044: S5's `seqs × t_seq` moves from the GPU lane to the CPU lane, so that async scheduling can hide it. The owner confirms it before W1-T12 (WORLD §4.4).
3. **The dispatcher golden table.** The `keys` level and the `graphs` · `modes` stage need vLLM's dispatchers run at the pin on a CPU to produce a golden table. W1-T12's acceptance now includes the script and the owner's run; who runs it, and on what host, is Q-10 in DECISIONS.md.
4. **SGLang's 24 GB cliff.** TR3's lab measures whether decode throughput drops between concurrency 48 and 49 on a 4090; until then the cap is [derived from source, not run].
