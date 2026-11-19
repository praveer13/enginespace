# TR3 · Profile a real engine: the torch profiler, Perfetto and nsys graph traces

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr3`. **Hours:** about 12 [estimated]: 5 in the browser (B) and 7 on a GPU (F). **Ships in:** W2 (D-002), with the Trace Room's synthetic traces from W1 (W1-T08, W1-T09). Its graded work on real traces waits for the owner's captures (W2-T21, O-5). **Owns:** nothing shared; it is where the course's world, the Trace Room, is used most (WORLD.md).

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm P1) and (sglang T3). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Capture a real engine's step, account for every nanosecond of it, name the cause of each gap, and test a fix by toggling it. This is the measured half of outcome 2: "Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it." |
| **Artifacts** | Attribution of pinned and synthetic traces, graded on fresh draws (B); a profile of the pinned vLLM on your GPU with an attribution report and two toggled pairs, graded by the local grader and re-checked by the browser (F). |
| **Game slot** | The trace-attribution game: working name **Gap Hunt**, `gap-hunt`, 2D, in the Trace Room (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard); T0.L6 and T4.L3 recommended; TR2 strongly advised, since the lab tests TR2's predictions. |
| **GPU** | About 7 h on a 4090-class GPU [estimated]. No H100 is required. |

## 1. What it teaches

1. **A trace is evidence, and it has a grammar.** Tracks (CPU threads, CUDA API calls, GPU streams, markers), spans with start and duration, correlation ids that tie a launch to its kernel, and flows for launches, syncs and copies. The course normalises every trace into `trace@1`: columns of integer nanoseconds from one origin (A§5.7).
2. **Capturing vLLM at v0.33.0.** `--profiler-config` (since v0.13.0) chooses the torch profiler, CUDA profiling or Proton; `/start_profile` takes `delay_iterations` and `max_iterations`, so a capture skips warm-up and holds exactly the chosen steps; traces named `rank0.<id>.pt.trace.json.gz` open in Perfetto (vllm P1). Profiling is a developer tool, and the docs warn that flushing takes long for many requests, so captures stay small (vllm P1).
3. **nsys and graphs.** `--cuda-graph-trace=node` shows the kernels inside a replayed graph, `--trace-fork-before-exec=true` follows the engine's worker processes, and `--capture-range=cudaProfilerApi` limits the window (vllm P1; sglang T3). NVTX ranges and Python-source mapping vanish inside a captured graph, so attribution needs a graph-on and a graph-off run (sglang T3). Proton needs `proton_graph_attribution` for replayed kernels (vllm P1). Nsight Systems 2026.5.1 adds `--pytorch=functions-trace` for CPU-side attribution (sglang N1).
4. **Attribution is a partition.** Inside one step window W, from one step mark to the next: **GPU-busy** is the union of kernel and copy spans on GPU streams, split into kernel and copy-only; **CPU-gap** is GPU-idle time while the engine's main thread is busy; **both-idle** is GPU-idle time while the main thread waits too. TPOT, the step's wall time, equals GPU-busy + CPU-gap + both-idle exactly, in integer ns. **Overlap**, the main thread's busy time hidden under GPU work, is reported beside the partition (GAMES.md §6; ARCHITECTURE §5.7 and §8.5 use the same partition).
5. **A gap has a cause, read off the launch queue.** The GPU work that ends a gap was launched by a CPU call with the same correlation id; the main-thread span that covers most of the time from the gap's start to that launch is the cause; and a blocking call that ends at or after the gap's start (`cudaStreamSynchronize`, `cudaEventSynchronize`, a blocking device-to-host copy, `.item()` or `.tolist()`) is the sync that drained the queue (GAMES.md §6). TR0's hidden syncs and TR1's map meet here.
6. **Floors and flat curves.** A decode step cannot beat its bytes: weights plus the KV it reads, divided by the GPU's datasheet bandwidth. For a 0.6B-parameter model in bf16 that is about 1.2 GB per step [derived: 0.6e9 × 2 bytes; the parameter count is unverified until W2-T16 pins the model], so on a GPU with about 1 TB/s of memory bandwidth [unverified until the hardware atlas, W2-T09] the floor is about 1.2 ms [derived]. A host step of a few hundred microseconds is therefore a large share of a small model's step. A latency that stays flat across a wide range of prompt lengths is the signature of launch overhead, not compute (sglang W4, vendor-reported). A gap can persist inside a graph: small kernels still cost microseconds each (sglang W5, vendor-reported).
7. **SGLang's profiler,** for the same workload in a second engine: `SGLANG_TORCH_PROFILER_DIR`, `/start_profile` with `num_steps` and `start_step`, `detailed_annotations` that fold batch shapes into `step[...]` labels, and `python -m sglang.profiler`, which also writes `server_args.json`, ready-made provenance for a trace (sglang T1, T2).
8. **The provider is part of the experiment.** On a rented GPU: check the driver first (R580 or newer for v0.33.0's CUDA 13 wheels, vllm R4); check `/proc/sys/kernel/perf_event_paranoid`, since nsys needs at most 2 for CPU sampling and a rented container cannot change it (sglang N4); record the GPU's name, because Modal may run a `gpu="H100"` request on an H200 unless you ask for `"H100!"` (sglang C4); and treat Nsight Compute's counters as unavailable unless a probe shows otherwise (sglang N5). Nothing graded depends on counters.
9. **The "300 µs" question, answered by you.** The catalog asks why the GPU idles 300 µs between steps, and no primary source gives that number [unverified] (sglang W7). The lab measures the learner's own gap with graphs and async scheduling on and off, and the learner's number replaces the folklore.

**Knowledge components** (proposed; W2-T24 writes them):

| KC | Requires |
|---|---|
| `tr3.trace-anatomy` | `ks:t0.flame-graphs` |
| `tr3.capture-window` | `tr3.trace-anatomy` |
| `tr3.graph-traces` | `tr3.trace-anatomy`, `tr2.graph-replay` |
| `tr3.partition` | `tr3.trace-anatomy`, `tr2.bubble` |
| `tr3.gap-cause` | `tr3.partition`, `tr0.hidden-syncs` |
| `tr3.step-floor` | `ks:t4.decode-bandwidth`, `ks:t4.ridge-point` |
| `tr3.flat-curve` | `tr3.step-floor` |
| `tr3.provider-preflight` | — |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR3 takes from it |
|---|---|---|
| Lesson | T0.L6 "Reading a Flame Graph (and Making One)" (`t0.l6`) | Reading a profile (`t0.flame-graphs`) and wait bars (`t0.wait-bars`): "the profile can't see the network, but it shows you who's waiting". TR3 reads timelines instead of stacks. |
| Lesson | T4.L3 "The Roofline Model" (`t4.l3`) with `sim-roofline` | Decode's bandwidth bound and the ridge point (`t4.decode-bandwidth`, `t4.ridge-point`), the floors' arithmetic. |
| Lesson | T4.L2 "GPU Memory Hierarchy" (`t4.l2`) | The bytes a step must move (`t4.gpu-memory-ladder`). |
| Lesson | T5.L3 "Inference vs Training; Prefill vs Decode" (`t5.l3`) | Why decode and prefill steps look different in a trace. |
| Field lab | `decode-kv`, after T5.L4 | Batch-1 decode speed measured on a real vLLM server against Boot's prediction. In kernelspace that was `field` evidence at weight 0; here the same kind of measurement becomes graded evidence (D-001). |
| Page | Boot (`/boot`) | Decode as bytes over bandwidth: the floor TR3 enforces. |

**Within enginespace.** TR0 (hidden syncs), TR1 (the lifecycle names that label spans) and TR2 (the model whose predictions the lab tests). The capstone uses TR3's capture and attribution on a commit pair.

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr3.l1` | A trace is evidence: tracks, spans, correlation ids and flows | 35 | B |
| `tr3.l2` | Capturing vLLM at v0.33.0: `--profiler-config`, a chosen step window, Perfetto | 45 | B |
| `tr3.l3` | nsys and CUDA graphs: node-level traces, and what disappears inside a graph | 45 | B |
| `tr3.l4` | Attribution: every nanosecond in one category, and the cause of a gap | 45 | B |
| `tr3.l5` | Floors and flat curves: a step cannot beat its bytes | 35 | B |
| `tr3.l6` | SGLang's profiler and its step labels: the same workload in two engines | 30 | B |
| — | Gap Hunt: practice, then graded levels | 75 | B |
| — | Lab `tr3.profile`, stages s1-s5 | 420 | F |

## Before you write (added 2026-11-18)

For the authors of W2-T20 (Trace attribution) and W2-T24 (TR3's lessons). Four rules for reading a GPU timeline, each at the lesson named, and three pointers. Section names are the appendix's own, and each number was read on the book's page on 2026-11-18.

**Where these come from.** The appendix "Measuring and Analyzing GPU Kernel Performance" of the book "Modern GPU Programming For MLSys" (MLC Community; https://mlc.ai/modern-gpu-programming-for-mlsys/, repository github.com/mlc-ai/modern-gpu-programming-for-mlsys), read on 2026-11-18. Its numbers are the book's authors', from separate runs and captures on one B200, and the course has not reproduced them, so each is [unverified]. The book's front page calls it open source and names no licence, and no licence file was found, so this note quotes nothing from it: copy no sentence, listing or exercise of it, and write each point in the course's own words with the course's own seeded numbers. A lesson that prints one of its numbers gives it as the authors' and needs a claim for it; a claim needs a quote from its source (`packages/schema/claims.ts`), so that waits for the owner's word on the licence. A hardware fact is checked against NVIDIA's documents. A link to the book goes to the repository file at a commit, never the site or `main`.

- **(a) `tr3.l3` or `tr3.l4`, a "Watch out" card, and one case in Trace attribution (W2-T20).** An empty stretch on one GPU stream is not an idle GPU: a kernel or a copy on another stream may cover it. The book's section is "Diagnose Long Gaps in the GPU Timeline". GPU-busy is already defined here as a union over streams (§1, item 4), so the card says why. The card's rule: an interval counts as GPU-idle only when no captured stream has a kernel or a copy in it, and a trace can say that only of what it captured. For W2-T20: the built generator (`packages/sim/trace/synth.ts`) draws one GPU stream, so the case needs a second `gpu-stream` track from it.
- **(b) `tr3.l4`, one paragraph and one numeric variant of `tr3.gap-cause`.** A gap between two kernels has up to three parts, each clipped to the gap: the host's time before it enters the launch call of the second kernel, the part of that call that falls within the gap, and the wait from the call's return to the second kernel's start. A part is zero when the call began before the first kernel ended. The book's worked case, in the same section, is made up for the purpose and is not a capture: the first kernel ends at 20 us, the launch call starts at 95 us and returns at 98 us, the second kernel starts at 100 us, and the 80 us gap is 75 + 3 + 2 us. Draw the variant's timestamps from the item's own seed, and keep seeds in which a part is zero.
- **(c) `tr3.l3`, one sentence.** The "Queue Dur" column of Nsight Systems' report of kernel launches (`cuda_kern_exec_trace`) is not the gap on the GPU, and it is no proof that one kernel waited for another: it counts only from the return of the launch call to the kernel's start. In the book's report (same section) one kernel shows 5.074 us in that column while the gap before it on the GPU is 0.224 us. This holds only if the Nsight Systems version the course settles on still prints that column. The book used 2025.6.3, and 2026.5.1 is proposed in §7, not pinned. Read the report's field definitions at the pin first, in NVIDIA's own documents, word the sentence from them and not from the book, and drop the sentence if the column is gone.
- **(d) `tr3.l1`, one sentence.** The book times the GEMM kernel of one example operation with three tools and prints three durations: 87.00 us as Proton's average over 100 calls (section "Use Proton to Compare the Kernels in the Operation"), 92.608 us in one Nsight Systems capture (section "Locate the Most Expensive Kernel in the Timeline") and 95.30 us in one Nsight Compute capture (section "SpeedOfLight Denominators and Duration"). In the last of these sections it tells the reader to trust a duration only inside the capture it came from, and to compare two implementations by a CUDA-event timing with no profiler attached. The three numbers differ in more than the tool: they are separate captures, one is an average and two are single calls, and Nsight Compute sets the clocks and empties the caches. So the lesson's sentence is that a duration in a profile is read inside that profile. Its second half, that the size of a fix is read from a run with no profiler attached, goes in only if the owner answers question 1 with yes: as designed, the lab reads each toggled pair from two profiler captures (§5, s2 and s4), and the lesson should not state a rule that the module's own lab does not keep. It does not say that the profiler added the difference. As one sentence for the lesson this needs nothing more. As a check in the lab it would be a design change: every run in the lab (s2 and s4) is a profiler capture, and an unprofiled run per side costs GPU time, receipt rows and rules in ASSESSMENT §6. Do not add it as a check.
- **(e) Rule 11's form, `tr3.l4`.** TR3's one written form is the partition of §1, item 4. It belongs at `tr3.l4` with the level `attribute`, not in lesson 1 (`tr3.partition` requires `tr3.trace-anatomy`). Do not write it, or the `attribute` level's goal line, until the owner has settled "bubble" against "CPU gap" (the built course uses both for the stretch in which the GPU idles while the CPU prepares the next step).
- **(f) Three pointers and no more.** A pointer is one go-deeper link at the end of the lesson's Read, with no number and no sentence of the book. `tr3.l5` links the appendix's section "Use Nsight Compute to Analyze a Single Kernel" and names Kernels KN1 in words, with no link while that course has no route (`tr2/l5` already promises "TR3 is where you read them"); `tr3.l2` links the appendix's section "Find the Most Expensive Kernel with Proton". The repository's README gives the appendix's source as `appendix/benchmarking_gpu_kernels.md`; no commit was recorded on 2026-11-18, so link the commit that is current when the lesson is written and check the section's name there. The third, from `tr4.l3`, is in TR4's note.

**Questions for the owner (not for the task's author to settle):**

1. Does the TR3 lab get an unprofiled run for each side of a toggled pair, so that a fix's size is read from it?
2. Which word does TR3's form use for the stretch in which the GPU idles while the CPU prepares the next step, "bubble" or "CPU gap", or do both stay with two meanings? It is recorded in `src/copy/terms.ts` and `docs/GAMES.md` §2.6 before (e).
3. Does TR3, whose six lessons are separate subjects, carry the "what changed" table of the guide's rule 9 at all? Until the owner asks, it carries none.
4. May a claim record quote the book? It names no licence. Until the owner says, no lesson prints one of the book's numbers.

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before each Gap Hunt case: "What is this step's largest contributor?" Before the lab's toggled pairs, committed in the browser when the challenge is issued: "By how much does TPOT change with graphs off? With async scheduling off?", answered with TR2's model and its host card. | `predict`, scored at reveal against the receipt's recomputed numbers |
| **Play** | Gap Hunt on synthetic traces, then on the owner's pinned traces: mark spans, assign categories until "unaccounted ns" reaches 0, then name the cause (§6). | `trace-mark` and `play` |
| **Build** | Profile the pinned vLLM on your GPU: two toggled pairs, an attribution report, and an optional nsys or SGLang stage (§5). | `receipt` |
| **Prove** | With the agent closed: Gap Hunt's `attribute` level on fresh cases; and "defend your trace": the browser asks seeded questions only your own receipt's raw records answer, such as "which category grows most in your step 3 when graphs are off?" (ASSESSMENT §7). | `play` and `prove`, `proved` |
| **Keep** | Today draws `tr3.which-category`, `tr3.gap-cause`, `tr3.floor`, `tr3.flat-curve` and `tr3.capture-window`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `play:gap-hunt/gap` | B | The largest gap and its cause, on a synthetic trace with seeded jitter | Against the trace model's exact ground truth (A§5.7) | Gap and cause event id right, on 3 fresh cases |
| `play:gap-hunt/attribute` | B | A full partition of a step window | Correct ns over window ns | At least 95% of the window in the right category and the cause right, on 3 fresh cases |
| `play:gap-hunt/pinned` (the catalog's "attribute 6-10 pinned traces") | B | The same, on cases drawn at grade time from the owner's 6-10 SHA-256-pinned traces, against the owner's reviewed annotations | As above | As above, on 3 fresh cases from at least 3 distinct traces. Until W2-T21 the level shows "arrives with the owner's traces", and the module's B credit rests on `attribute`. |
| Item families (§4, Keep) | B | Answers on fresh seeds | Keys from `packages/sim/trace` and the atlas | Exit ticket |
| `receipt:tr3.profile.s1` (preflight, first win) | F | Fingerprint, driver gate, `perf_event_paranoid`, the GPU's name, the effective runner, and an `ncu` probe result | The grader records; the browser shows | Recorded only; no credit and no gate on the probe |
| `receipt:tr3.profile.s2` (graphs on and off) | F | Two torch-profiler captures of the challenge's workload and step window: the default `-O2` and `-O0` | Grader: teacher-forced agreement of both runs' outputs with the owner's references (profiling must not change tokens); pins; runner and effective graph mode from the engine's log. Browser: `traceChecks` (ASSESSMENT §6.1), step count equal to the challenge's `max_iterations`, physics floors, and cross-checks with the run's request log | Every required check passes |
| `receipt:tr3.profile.s3` (the attribution report, the catalog's "report") | F | Your partition and gap causes for 5 steps of each s2 capture, as structured JSON, plus a structured finding: which category moved, by how much, and why | The browser recomputes each partition from the receipt's `trace@1`; the partition must sum exactly; your categories are compared span by span | At least 95% of each window's ns in the right category and every cause right; the finding's numbers equal the recomputed ones. No prose is graded. |
| `receipt:tr3.profile.s4` (async on and off) | F | The same capture with `--no-async-scheduling`, and the attribution of the bubble change | As s2 and s3 | As s2 and s3; your committed prediction is scored for calibration and moves no credit |
| `receipt:tr3.profile.s5` (optional) | F | Either an nsys node-level capture with graphs on, or SGLang v0.5.23's decode throughput at concurrency 32, 48, 49 and 64 on a 24 GB card | Trace or benchmark consistency checks (ASSESSMENT §6) | Practice credit; the SGLang result settles whether its 48-sequence graph cap is a cliff (sglang G3) |

The module counts as complete when s2, s3 and s4 are `gpu-verified`, the B artifacts and exit tickets are credited, and a `proved` event exists (ASSESSMENT §9).

**The lab's workload.** Qwen3-0.6B at the pinned revision on the pinned vLLM, with prompts and lengths drawn from the challenge's seed, a decode-heavy mix, and a capture window that skips warm-up. Traces stay under about 100 MB raw, SGLang's advice for traces opened in a browser [measured] (sglang N3).

## 6. Game slot

**The trace-attribution game.** Working name **Gap Hunt**, id `gap-hunt`, 2D (GAMES.md §6), inside the Trace Room (WORLD.md).

- **The rule is the concept.** The game accepts only a true partition of the step window, and a gap's cause is read off the launch queue. The GPU idles only when its queue runs empty, so the attribution rule is the concept.
- **Levels the module uses** (GAMES.md's working ids): `read` and `graphs` for practice; `gap`, `attribute` and, once the owner's traces exist, `pinned` graded; `yours` loads the learner's own trace for practice only, because the grader owns its credit (D-001).
- **Why 2D.** A trace's axes are time and track; a third axis would add load without meaning, so GAMES.md keeps this game 2D (D-019's advisory test).
- **The view.** Canvas2D lanes with zoom and pan by keys and buttons, a span table as the DOM mirror, and marking by list on phones (TRACKER W1-T09; ASSESSMENT §4.3 counts phone marking the same).

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0 (`4ba787ec…324da5`); profiling docs at `docs.vllm.ai/en/v0.33.0/contributing/profiling/` | versioned docs (vllm R5) |
| SGLang | v0.5.23 (`297e54fd…6f90`); `docs/docs/developer_guide/benchmark_and_profiling.mdx` at the tag | sglang T1-T3 |
| Nsight Systems | 2026.5.1 (proposed) | sglang N1; W2-T19 checks its SQLite export's table names at this version [unverified] |
| Nsight Compute | 2026.3.1 (proposed) | optional only (sglang N5) |
| Perfetto | v59.1; UI `v59.1-79997ada9` | sglang N2 |
| Model | Qwen3-0.6B at the revision W2-T16 pins | shared with TR0 |
| Owner traces | 6-10, SHA-256-pinned and dated (W2-T21) | none captured yet (PRODUCT.md) |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| `--profiler-config` (torch, cuda, proton), `/start_profile` with `delay_iterations` and `max_iterations`, Perfetto-readable torch traces, and the nsys flags | [measured] | vllm P1 | 2026-11-01 | 14 days |
| Flushing a profile of about 100 Llama-70B requests on an H100 takes about 10 minutes | [unverified] | vllm P1 | 2026-11-01 | — |
| SGLang's profiler endpoints, `detailed_annotations` and `server_args.json` | [measured] | sglang T1, T2 | 2026-11-02 | 14 days |
| NVTX and Python-source mapping need graphs off; `--cuda-graph-trace=node` shows graph nodes | [measured] | sglang T3 | 2026-11-02 | 14 days |
| Nsight Systems 2026.5.1 is current and adds `--pytorch=functions-trace`; Nsight Compute 2026.3.1 | [measured] | sglang N1 | undated | 60 days |
| Perfetto v59.1 (2026-10-27); about a 2 GB in-browser memory limit; SGLang advises traces under 100 MB | [measured] | sglang N2, N3 | 2026-10-27 | 60 days |
| nsys needs `perf_event_paranoid` ≤ 2 for CPU sampling | [measured] | sglang N4 | undated | 90 days |
| Nsight Compute counters on RunPod and Modal | [unverified] | sglang N5 | — | probe in s1 |
| Modal may run `gpu="H100"` on an H200 unless `"H100!"` | [measured] | sglang C4 | 2026-11-03 | 90 days |
| A flat latency across a 32× range of prompt lengths is "the signature of launch overhead" | [unverified], vendor-reported | sglang W4 | 2026-08-17 | static |
| Small kernels still cost 2-4 µs each inside HIP graphs on AMD | [unverified], vendor-reported | sglang W5 | 2026-10-18 | static |
| "GPU idle 300 µs between steps" has no primary source | [unverified] | sglang W7 | — | measured by the learner |
| The trace format at the pin (event categories, how a graph launch appears) | [unverified] | vllm U2 | — | until the owner's first capture |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr3.l1`-`tr3.l6` | 3.9 | — |
| Gap Hunt | 1.25 | — |
| `tr3.profile` s1 (0.5), s2 (2.0), s3 (1.5), s4 (1.5), s5 (1.5, optional) | — | 7.0 |
| **Total** | **about 5** | **about 7** |

All [estimated]. The catalog's number is 12 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| vLLM's profiler flags and endpoints | 14 days | `ProfilerKind` in `vllm/config/profiler.py` and the profiling doc's headings (vllm §6) |
| The trace format and the grader's exporter | pin | the owner re-captures at each re-pin; the exporter's fixtures must round-trip |
| nsys, ncu and Perfetto versions | 60 days | their release pages |
| Provider behaviour (drivers, `perf_event_paranoid`, counters) | 90 days | the owner's own s1 probe on each provider at each re-pin; learners' receipts stay on their devices and cannot inform it |
| The owner's traces | pin | SHA-256 in the references manifest; new captures at each re-pin |

## 11. Open items

1. **The trace schema at the pin** is [unverified] (vllm U2): W2-T19 builds the exporter from the owner's first capture, and the lab is written after it.
2. **The owner's capture plan** (which GPUs, which workloads, how many traces) is O-5; WORLD.md §3.2 proposes one.
3. **Graded attribution on phones.** Settled: ASSESSMENT §4.3 counts marking by list on a phone the same, under the same nanosecond rule, and ARCHITECTURE §3.1 now keeps only the Trace Room's timeline viewer laptop-first.
4. **Two real-engine attribution engines.** SGLang ships a deterministic trace-triage skill with kernel and overlap tables (sglang Z3). It is a reference a learner may compare against, never a grader.
5. **Three questions of 2026-11-18**, among them the word for the stretch in which the GPU waits for the CPU: see "Before you write".
