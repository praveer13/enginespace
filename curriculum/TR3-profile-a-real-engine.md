# TR3 · Profile a real engine: the torch profiler, Perfetto and nsys graph traces

**Status:** curriculum design for the owner's review, 2026-11-03, brought into the redesign on 2026-11-22 (W2b-T96): "Before you write", after §3, is what the module's builders build from, and where it and an older line of this file differ, it wins. Nothing of the module is built yet. **Module id:** `tr3`. **Hours:** about 12 [estimated]: 5 in the browser (B) and 7 on a GPU (F). **Ships in:** W2 (D-002), with the Trace Room's synthetic traces from W1 (W1-T08, W1-T09). Its graded work on real traces waits for the owner's captures (W2-T21, O-5). **Owns:** nothing shared; it is where the course's world, the Trace Room, is used most (WORLD.md).

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm P1) and (sglang T3). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Capture a real engine's step, account for every nanosecond of it, name the cause of each gap, and test a fix by toggling it. This is the measured half of outcome 2: "Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it." |
| **Artifacts** | Attribution of pinned and synthetic traces, graded on fresh draws (B); a profile of the pinned vLLM on your GPU with an attribution report and two toggled pairs, graded by the local grader and re-checked by the browser (F). |
| **Game slot** | **Trace attribution**, `gap-hunt`, 2D, on the Traces page (§6). |
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

**Knowledge components** (W2b-T96 wrote them into `content/kc/graph.yaml` on 2026-11-22, each with the task that adds its first graded reference; "Before you write", item 4, says what earns each):

| KC | Requires | First graded reference (its task) | Also graded by |
|---|---|---|---|
| `tr3.trace-anatomy` | `ks:t0.flame-graphs` | item family tr3.launch-and-kernel (W2b-T105) | none |
| `tr3.capture-window` | `tr3.trace-anatomy` | item family tr3.capture-window (W2b-T105) | lab stage `tr3.profile.s2` (wave 3) |
| `tr3.graph-traces` | `tr3.trace-anatomy`, `tr2.graph-replay` | item family tr3.inside-a-graph (W2b-T105) | none |
| `tr3.partition` | `tr3.trace-anatomy`, `tr2.bubble` | item family tr3.which-category (W2b-T105) | Trace attribution, `attribute` (W2-T20); lab stages `tr3.profile.s3` and `s4` (wave 3) |
| `tr3.gap-cause` | `tr3.partition`, `tr0.hidden-syncs` | Trace attribution, `gap` (W2-T20) | item family tr3.gap-cause (W2b-T106); lab stage `tr3.profile.s3` (wave 3) |
| `tr3.step-floor` | `ks:t4.decode-bandwidth`, `ks:t4.ridge-point` | item family tr3.floor (W2b-T106) | none |
| `tr3.flat-curve` | `tr3.step-floor` | item family tr3.flat-curve (W2b-T106) | none |
| `tr3.provider-preflight` | — | item family tr3.provider-preflight (W2b-T106) | none: stage s1 records and credits nothing |

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

Minutes are [estimated]. "Before you write", item 13, gives each lesson's opener, first act, own KCs, Test and minutes, and wins where this table differs.

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

## Before you write (rewritten 2026-11-22)

For the authors of the module's build: W2b-T97 (the sources), W2b-T98 and W2b-T99 (the trace model: a second GPU stream, and the gap and cause model), W2b-T100 (the game's pure session), W2b-T101 (the list mode for phones), W2-T20 (the game in the frame), W2b-T102 (the Traces page), W2b-T105 and W2b-T106 (the item families), and W2b-T107, W2b-T110, W2b-T111 and W2-T24 (the module page and the six lessons). Each item is a decision with its reason. GAMES.md §6 holds the game's design, and the items below point into it rather than copy it; where an older line of this file says otherwise, these items win. The 2026-11-18 points (a) to (f), which other tasks cite by letter, follow the items and keep their letters.

**What the owner answered, and what is still proposed.** The owner answered three questions on 2026-11-19 (docs/waves/W2m1a-report.md §11): N8, TR0 is an advised primer and the course starts at TR1 lesson 1 (D-070); N5, a lesson's Test passes when every question is right, and every Test holds three questions with at least one numeric (D-071); N4, option B, only the locked CPU environment on the build machine, no model weights and no other download (D-072). Everything else here is the build's default and waits for the owner: the role line (N1), the word of the form (N2), this file's four questions of 2026-11-18, and N19. D-079 and D-080 record them as proposed.

1. **The game's name and role line.** Title **Trace attribution**, subtitle "Every nanosecond of a step belongs to a kernel, a copy, a CPU gap or idle." (D-063). Role line **"You attribute the gap."** *Why:* it is the tracker's line for W2-T20, the roster's first line ("You account for a step.") is older, and the learner's act on every graded level ends on the gap: its place, its category and its cause. The roster and GAMES.md §2.6 now carry it. (Proposed, D-079; N1's default.)

2. **The word for the stretch in which the GPU idles while the CPU prepares the next step: "CPU gap" in TR3's form.** "CPU gap" is the trace model's category (`packages/sim/trace`, `cpu-gap`), the viewer's word (`src/trace/marks.ts`) and the game's subtitle, so it is what the learner measures in the game, which is what rule 11 asks of a form's terms. "Bubble" stays TR2's coined word and is not renamed anywhere: TR2's lessons, levels and KC (`tr2.bubble`) keep it. Lesson 4 says once, in one sentence, that a CPU gap is the bubble of TR2 as a trace shows it. The word lives in one key, `GAP_WORD` in `src/copy/terms.ts`, with its row in the terms table; the form, the `attribute` level's goal line and every TR3 item stem read it from there, and `tests/copy/terms-tr3.test.ts` holds the documents to it. *So:* if the owner answers N2 with "bubble", the key changes, the generated files are regenerated, and nothing else is rewritten. (Proposed, D-080; N2's default. The owner has not answered N2.)

3. **The form, rule 11, written once at `tr3.l4`:**

   ```text
   step time = GPU-busy + CPU gap + both idle
   ```

   GPU-busy is kernel plus copy-only, and overlap is reported beside the sum and is in none of its terms (§1, item 4). Every term is something the learner marks in `attribute`. No other lesson writes the form; lessons 5 and 6, the goal lines and the stems keep its words.

4. **The eight KCs and what earns each.** The table in §1 is the graph's, edge for edge, and adds each KC's first graded reference. Every KC has an item family of W2b-T105 or W2b-T106 or a graded level of Trace attribution (W2-T20); none is earned by the lab alone, so none keeps a `planned: W2-T23` line, and the lab's stages are listed beside them as "also graded by". `tr3.provider-preflight` gets the family `tr3.provider-preflight` and lesson 2, because stage s1 records and credits nothing (§5). `tr3.trace-anatomy` gets `tr3.launch-and-kernel` and `tr3.graph-traces` gets `tr3.inside-a-graph`, because `read` and `graphs` are practice levels and earn no KC. Each task removes its own `planned:` lines.

   | Family (task) | KCs | Level 1 | Level 2 | Numeric variant |
   |---|---|---|---|---|
   | `tr3.launch-and-kernel` (W2b-T105) | `tr3.trace-anatomy` | a step's spans as a small table of tracks: "Which kernel did this launch call start?" | the same with two streams, or with SGLang's `step[...]` labels (lesson 6) | "How many ns from the launch call's return to its kernel's start?" |
   | `tr3.capture-window` (W2b-T105) | `tr3.capture-window` | `delay_iterations` and `max_iterations` over a run whose first steps are warm-up: "Which steps does the capture hold?" | SGLang's `start_step` and `num_steps` (lesson 6) | "How many steps does the capture hold?" or "Which step is the first it holds?" |
   | `tr3.inside-a-graph` (W2b-T105) | `tr3.graph-traces` | a graph replay traced as one launch, and the same replay traced at node level: "What does each trace show?" | which NVTX ranges and Python frames are missing inside a replay | "How many kernels does the node-level trace show for this replay?" |
   | `tr3.which-category` (W2b-T105) | `tr3.partition` | one stretch of a step: "Which category is it?" | a whole window of 4 to 8 stretches | "How many ns of this window are CPU gap?" |
   | `tr3.gap-cause` (W2b-T106) | `tr3.gap-cause` | a gap and its lead-in: "Which call caused it?" | a gap ended by a blocking call | point (b)'s three parts of a gap, with the timestamps drawn from the item's seed and seeds with a zero part kept |
   | `tr3.floor` (W2b-T106) | `tr3.step-floor` | "What is the least time this decode step can take?" from bytes and a bandwidth, both given | the same with the KV bytes read at a context length | every question |
   | `tr3.flat-curve` (W2b-T106) | `tr3.flat-curve` | a latency over prompt lengths: "Launch-bound or compute-bound?" | the same with graphs on, where small kernels remain | "By what factor did the prompt grow while the latency stayed within 10%?" |
   | `tr3.provider-preflight` (W2b-T106) | `tr3.provider-preflight` | a host's driver, `perf_event_paranoid` and GPU name: "Can this host run the lab's captures?" | which check fails first, and what the capture loses | "What is the largest `perf_event_paranoid` value at which nsys samples the CPU?" |

   A key that rests on an upstream fact (the driver line, the `perf_event_paranoid` bound, the label format) cites the claim W2b-T97 wrote, and a family whose fact W2b-T97 could not read drops that variant rather than lean on it. The 10% of `tr3.flat-curve` is arbitrary [estimated], and its stem says so.

5. **The levels built now, and the two that wait.** `read`, `graphs`, `gap` and `attribute` are built in wave 2, on synthetic traces, and each carries the synthetic label. `pinned` and `yours` are neither built nor registered: `verify:games` builds every registered level at its practice seed, and neither has a trace to build from. The level menu and the module page show each as a plain line (WAIT):
   - `pinned`, titled "Real traces": "Traces captured from vLLM on real GPUs are not recorded yet. Every trace here is made by the course's model of the step loop, and Attribute on its traces counts for this module meanwhile."
   - `yours`, titled "Your trace": "Opening a trace of your own arrives with the profiling lab, which is not published yet. Until then, every level runs on traces the course's model makes."

   Neither line holds a level id, a task id or the words "owner" and "pinned". *Why:* the owner's traces are an owner step (W2-T21, O-5) and the lab is wave 3's (N9's default); ASSESSMENT §4.3 keeps the row for `pinned`, and the module's browser credit rests on `attribute` until it exists (§5, and O-17's default, as built).

6. **What each level asks, what arrives already categorized, its goal line and its pass sentence.** The goal lines are drafts for W2b-T100's `copy.ts`; the facts are fixed, the words may be tightened. The category words come from `src/trace/marks.ts`, and "CPU gap" from `GAP_WORD`.

   | Level | Kind | Arrives categorized | The ask | Goal line (draft) | Pass sentence |
   |---|---|---|---|---|---|
   | `read` | practice | every span, drawn with its category | mark one launch call and the kernel it started | "Find a launch call and the kernel it started. You set two marks. It ends when the pair is marked." | "Passes in practice when the kernel you marked carries the launch call's correlation id." |
   | `graphs` | practice | every span | the same replay traced as one launch and at node level: count the kernels the replay ran | "Count the kernels one graph replay ran. You switch between the two traces of it. It ends when you commit a count." | "Passes in practice when your count equals the kernels the node-level trace shows." |
   | `gap` | practice, then graded | the GPU-busy spans (kernel and copy-only) | the step's largest gap, edge to edge, and its cause | "Find the largest gap of the step and the call that caused it. You set its two edges and one cause. It ends when you submit." | "Passes when, on each of 3 new steps, your gap is the largest one, edge to edge, and your cause is its event." |
   | `attribute` | practice, then graded; the Prove level | practice: the kernel spans; graded and Prove: none | every ns of the window in one of four categories, then the largest gap's cause | "Put every nanosecond of the step in one category: kernel, copy-only, CPU gap or both idle. It ends when the unaccounted ns reach 0 and you name the largest gap's cause." | "Passes when, on each of 3 new steps, at least 95% of the step's ns are in the right category and the cause is right." |

   *Why these spans arrive categorized:* `read` and `graphs` teach where things are, not the partition, so nothing is left to classify. `gap` grades a place and a cause, not a partition, so the GPU's own spans are drawn and the learner's eye goes to the idle stretches. Practice `attribute` gives the kernel spans as a worked part, so a first partition is four or five marks and not a dozen; graded and Prove `attribute` give nothing, because the bar is a share of the whole window and a pre-filled stretch would be ns the learner did not earn. *So that the bar cannot be met without the concept,* W2b-T99's band for a graded `attribute` case keeps the window's non-kernel ns (copy-only, CPU gap and both idle) at no less than 10% of the window [estimated], so that marking the whole window "kernel" scores at most 90%; the 10% is a design target and arbitrary, chosen as twice the room the 95% bar leaves.

7. **The graded `gap` answer is a place and a cause together.** The place is the gap's two edges, each snapped to an event edge (the end of one GPU span and the start of the next on any captured stream, per point (a)); the cause is one event id, a main-thread span or a blocking call. A case passes only when both are the reference's. *Why:* a cause alone is one of three kinds (eager launches, a call that waits, host scheduling), so a blind guess at the kind is right a third of the time, above ASSESSMENT §4.1's 15% bound; the conjunction with the place is what W2b-T100's blind probe measures against the bound in its first commit. The band of GAMES.md §6 (the largest gap at least 1.5 times the second, one CPU span covering at least 60% of its lead-in) adds one rule: in at least half of the graded cases a main-thread span longer than the cause lies under GPU-busy time, as overlap, so the habit "the widest span" fails there [estimated].

8. **Two bars, never printed as one rule.** The game's graded bar is 95% of the window's ns in the right category, with the cause right, on 3 fresh steps (ASSESSMENT §4.3; GAMES.md §6). A lesson's `trace` block passes its marks at 90% of the ns the learner marked (`PASS_SHARE` in `src/trace/grade.ts`). They differ in what they divide by: the window, against the learner's own marks. Each surface prints its own sentence and neither names the other's number. *Why:* "90%" beside "95%" reads as an inconsistency, and they measure different things.

9. **The session owns the marks, as actions.** `mark` (from one event edge to another, with a category), `unmark`, `cause`, `submit` and `commit` are the session's actions (GAMES.md §6, "Simulation API"); the action log is the record, and a graded run is replayed from it (ASSESSMENT §4.3). The viewer of `src/trace` receives the marks as props through a bridge and emits the same actions; its own reducer keeps the view (zoom, the focused edge, the open sheet) and is never the record. *Why:* a mark the viewer alone held could not be replayed or graded, and two places for one mark would disagree.

10. **On a phone, a list (W2b-T101).** Below the narrow breakpoint the step's window is a table: one row per stretch between two consecutive edges at which the GPU turns busy or idle, its work changes between kernel and copy-only, or the main thread turns busy or idle. Each row gives its start, its length in ns and what runs on the GPU and on the main thread, with four category radios. Below it, a second list holds the window's main-thread spans and blocking calls in time order, each a radio for the cause. Picking a category for a run of rows emits one `mark`; the list writes the same actions and the same `trace-mark` events as the lanes, and is graded the same, under the same ns rule (ASSESSMENT §4.3). Rows are at least 44 px tall. *Why:* at 390 px the diagram is 358 px wide, and lanes there cannot be read or marked.

11. **The most marks a graded `attribute` case may need: 12.** W2b-T99's band keeps the reference partition of a graded window at no more than 12 segments [estimated], and so at no more than 24 rows in list mode. *Why:* a segment is one mark, and 12 marks at a desk are 36 keys (two edges and a digit each); 24 rows at 44 px are a little over two screens of a 640 px phone. The step loop's own steps are simpler: the built generator gives every step window 3 or 4 segments, 6,433 windows over seeds 1 to 200 of the Traces page's specimen [synthetic], printed by the course's model on 2026-11-22 at `f0ede6ec`. W2b-T99's cases add the gaps of eager launches, of a call that waits and of host scheduling, and W2b-T100 measures its reference's move count on 200 seeds against this bound.

12. **The Prove level is `attribute`.** *Why:* it is GAMES.md §6's and ASSESSMENT §7.2's choice, it is the module's concept on fresh steps, and Q-5's default asks for one `proved` event per module. It starts in Prove mode only from its own control, as Tensor views' `fewest` does (W2b-T74, W2b-T78). `gap` stays graded and is not a Prove level. "Defend your trace" waits for the lab (§4).

13. **The lessons: opener, first act, minutes and own KCs.** The opener is chosen by rule 1. Every lesson's first act is something the learner does, within the opener rule: an A or B lesson's first act is its run, inside the first screen; a C lesson's first part ends in its first act within 200 words [estimated], about a minute of reading, inside the 450 words the rule allows.

    | Lesson | Opener | First act, and its control | Own KCs | Test (3 questions, at least one numeric) | Minutes |
    |---|---|---|---|---|---|
    | `tr3.l1` A trace is evidence | C: the module's first lesson; a `trace` block is not a game, so it opens on Read | a `trace` block on a synthetic step: mark a launch call and the kernel it started (W2b-T107 names the block's task); the first part gives track, span, launch call, kernel, stream, correlation id and flow before it, in the lesson's own words, since TR0 is optional | `tr3.trace-anatomy` | `tr3.launch-and-kernel`, 3 questions, one numeric | 35 |
    | `tr3.l2` Capturing vLLM at the pin | C: a reading of the pin's documents | a `trace` block on a synthetic run whose first steps are warm-up: given `delay_iterations` and `max_iterations`, mark the steps the capture holds. The run comes from W2b-T99's model as a warm-up case (its first one to three steps carry a longer host span [synthetic]); if W2b-T99 does not build it, the first act is a guess at commit on a table of the run's step times [synthetic] | `tr3.capture-window`, `tr3.provider-preflight` | `tr3.capture-window`, 2 questions, one numeric; `tr3.provider-preflight`, 1 | 40 |
    | `tr3.l3` nsys and CUDA graphs | B: the game is known by now; the primer names a graph replay (TR2), a node-level trace, an NVTX range and nsys | Trace attribution `graphs`: count the kernels one replay ran, from the graph-on trace and its node-level twin | `tr3.graph-traces` | `tr3.inside-a-graph`, 3 questions, one numeric | 45 |
    | `tr3.l4` Attribution | B: the primer gives the launch queue and the four categories; it does not say which stretch is which | Trace attribution `gap`, then the form (item 3), then graded `attribute` in the Test | `tr3.partition`, `tr3.gap-cause` | graded `attribute`; `tr3.which-category`, 1; `tr3.gap-cause`, 2, one of them the three-part numeric variant | 55 |
    | `tr3.l5` Floors and flat curves | C: arithmetic from claims, with no level | a guess at commit: "What is the least time a decode step of Qwen3-0.6B can take on an RTX 4090?", worked at the reveal from the weight bytes of item 15 and `hw.rtx4090.mem-bw`. The part after it holds the "300 µs" question (§1, item 9): a number no primary source gives, which the lab replaces with the learner's own; where a captured gap would stand, a dash with its caption | `tr3.step-floor`, `tr3.flat-curve` | `tr3.floor`, 2 questions, both numeric; `tr3.flat-curve`, 1 | 35 |
    | `tr3.l6` SGLang's profiler and its step labels | C: a reading of SGLang's documents | one synthetic step shown twice, under vLLM's ranges and under SGLang's `step[...]` labels in the format W2b-T97 reads at the pin, then a guess at commit: "How many sequences did this step decode?", read off the label; if W2b-T97 cannot read the format, the step is shown under vLLM's ranges only and the guess asks for `start_step` and `num_steps` instead | `tr3.capture-window` and `tr3.trace-anatomy`, in the second engine | `tr3.capture-window` at level 2, 2 questions, one numeric; `tr3.launch-and-kernel` at level 2, 1 | 30 |

    A first act in a `trace` block is practice: the block writes `trace-mark` events at practice weight, and its built grading reads the categories of the marks (item 8). A launch-and-kernel pair (lesson 1) or a capture window (lesson 2) is marked with the block's own marks, a range with its category and a label; grading such a mark by more than its category would be a change to `src/content/render/traceDraft.ts`, which no lesson task's files hold, and the first act does not need it.

    That is 4 C and 2 B lessons, 240 minutes against the brief's 235 (within 10%), and Trace attribution's graded levels on fresh steps add 60, so the browser part is 300 minutes, the course row's 5 hours [derived]. Lesson 6 has no KC of its own: the eight are the brief's, and lesson 6 asks the same two skills of a second engine. *Why the warm-up sentence:* lesson 2 is the learner's first meeting with warm-up in the course's order (TR8 comes later), so it gives one sentence on why the first steps are not a step's normal time and points to TR8 lesson 2.

14. **The module page.** Its prerequisite line equals the union of the lessons' "Builds on" lines, and a test holds the two to each other (W2b-T107): kernelspace T0.L6 (lessons 1, 3 and 4), T5.L10 and T7.L2 (lesson 2; T7.L2 is where warm-up is cut by a rule), T4.L2, T4.L3 and T5.L3 (lesson 5), T5.L10 and T5.L3 (lesson 6, whose labels name prefill and decode batches), and the module TR2 (graphs, async scheduling and the bubble). It names TR1 (lessons 4 to 6, the engine's processes) as advised, and TR0 (lesson 2's syncs, lesson 5's NVTX annotation) as advised and not needed: lessons 1 and 4 give a stream, a sync and the blocking calls in their own words. Its first screen says that the browser part's traces are made by the course's model of the step loop, and shows the lab as not published.

15. **The floor of lesson 5 comes from the `qwen3.*` claims, not from the brief's 1.2 GB.** From `qwen3.config.*` (28 layers, hidden size 1024, intermediate size 3072, 16 query heads and 8 key and value heads of 128, vocabulary 151936, tied embeddings, stored as bfloat16), the weight matrices hold 595,984,384 parameters [derived]: one table of 155,582,464 for the embedding and the output projection together, and 28 layers of 15,728,640. At 2 bytes each that is 1,191,968,768 bytes [derived], and the RMSNorm weights add less than 0.1% [derived]. Over `hw.rtx4090.mem-bw`, 1,008 GB/s, a decode step at batch 1 reads them in no less than 1.18 ms [derived], before the KV it reads: 114,688 bytes per token of context [derived: 28 layers, 2 tensors, 8 heads, 128 values, 2 bytes]. `qwen3.weights.bytes`, 1,503,300,328 [unverified], is the size of the checkpoint file and not the bytes a step reads; it is 311,331,560 bytes more than the matrices [derived], close to one more copy of the table (311,164,928 bytes [derived]), and the course has not opened the file to see why, so the lesson does not say why. W2b-T97 writes the derived claims with their formulas, and the lesson cites them.

16. **What built lessons already promise of TR3, and how this design keeps each.**

    | Lesson | The promise | Kept by |
    |---|---|---|
    | `tr2` module page | "TR3 tests the other half on real traces" | the lab (wave 3) and the owner's traces; the module page says the browser part's traces are the model's |
    | `tr2.l1` | a bubble in a real engine's timeline is a gap between two kernels while the engine core's thread is busy, and TR3 teaches reading one on your own GPU; the lab measures "300 µs" with async scheduling on and off | lesson 4's sentence that a CPU gap is the bubble as a trace shows it; lesson 5's "300 µs" question; stages s2 and s4 |
    | `tr2.l3` | stage s4 takes the capture with `--no-async-scheduling`, and the committed prediction is scored against the receipt | §5's s4, unchanged |
    | `tr2.l4` | TR3's lab toggles graphs and async scheduling, not the runner; it holds the first measurement of a real host phase | §5's stages, unchanged |
    | `tr2.l5` | stage s2 captures `-O2` and `-O0`; a warning card says a profile with graphs on and no gaps puts the time in the kernels, "and TR3 is where you read them" | §5's s2; lesson 3 (node-level traces) and lesson 5's pointer (f) |
    | `tr2.l6` | a record of a TR3 run names the graph mode that ran, read from the engine's log | §5's s2, unchanged |
    | `tr2.l7` | the one stage that runs another engine is optional: SGLang's decode throughput at four concurrencies around its cap | §5's s5, unchanged |
    | `tr0.l2` | "a sync costs time only while the GPU still has queued work to finish, and measuring that is the work of TR3" | lesson 4's cause read off the launch queue, and `tr3.gap-cause`'s blocking-call variant |
    | `tr0.l5` | the NVTX annotation `Layer_{}` of Mini-SGLang's layer "matters in TR3" | lesson 3 names it as the example of an NVTX range, and says that it vanishes inside a captured graph |

17. **The files W2b-T97 reads, exactly.** Each at the pin, as a raw file or a versioned page, with a line range and a quote (SRC):
    - vLLM at `4ba787ec`: `docs/contributing/profiling.md` (the profiler kinds, `/start_profile` and its body, the trace file names, Perfetto, the nsys flags, Proton's `proton_graph_attribution`, the developer-only warning and the flush note); `vllm/config/profiler.py` (`ProfilerKind`, and since which version the option exists); the files those two name for the profiled step, which W2b-T97 lists by path once read; `docs/getting_started/installation/gpu.cuda.inc.md`, the CUDA 13 wheels' driver requirement; and the four Triton kernel files W2b-T52's record names, for what one program of each covers.
    - SGLang at `297e54fd`: `docs/docs/developer_guide/benchmark_and_profiling.mdx` (the profiler's endpoint and fields, `detailed_annotations` and the `step[...]` label's format, `python -m sglang.profiler` and `server_args.json`, the nsys command line, NVTX inside graphs).
    - PyTorch at tag v2.14.0: the profiler's documentation source in the repository (how a step range is named, `export_chrome_trace`, the schedule's wait, warm-up and active steps). The research names no path, so W2b-T97 records the one it reads.
    - NVIDIA: the Nsight Systems user guide of version 2026.5 in its archived form, or the copy that ships with 2026.5.1 (the flags above, the `perf_event_paranoid` requirement, the field definitions of `cuda_kern_exec_trace`).
    - Perfetto at tag v59.1: the document on opening other formats, Chrome JSON among them.
    - The book's repository: its current commit, resolved once, then `appendix/benchmarking_gpu_kernels.md` at that commit, for the two pointers' section names only (point (f)).

    Its claim ids are cited by these items: the profiler's endpoint and window fields, the trace files, the nsys flags, NVTX inside graphs, the driver line, `perf_event_paranoid`, the GPU-name check, SGLang's endpoint fields and label format, and the derived weight bytes and step floor of item 15.

18. **N19: one real torch-profiler trace from the locked CPU environment.** Tried on 2026-11-22 at `f0ede6ec`, offline, in the locked CPU environment (`labs/envs/cpu`, torch 2.14.0 for the CPU): a module of four blocks (RMSNorm, two linear layers of 256 and 768, random weights from a fixed seed) ran five steps under `torch.profiler` with a schedule of one wait, one warm-up and three active steps, and `export_chrome_trace` wrote the file. Nothing was downloaded. The file held 553 complete events, three `ProfilerStep#` ranges and one range per step that the script named, in 138,776 bytes, or 11,056 bytes gzipped [measured]. *So:* yes, it can be done, with three limits. It holds CPU tracks only, with no kernel, stream, launch or correlation id, so it can show lesson 1's tracks and spans and lesson 2's step ranges, and never a CPU gap or a partition. The grader's exporter refuses it as it stands ("the file holds no kernel or memory copy event on a GPU"), so showing it in the viewer needs a CPU-only option of the exporter, a change to the kit that is repacked and merges in lane G's order. And the raw file carries the computer's host name, the absolute path it was written to, a trace id and a wall-clock base time in its header, which must be removed before anything is committed. Its file would live under `public/traces/`, beside a README row that names it as the course's own capture of a CPU module and not of an engine, with its date, its commit and its SHA-256; a lesson tags it [measured] with that date and never calls it a trace of vLLM. Whether to build it is W2b-T210's question for the coordinator; nothing in this design waits for it.

19. **Defaults taken, not the owner's word.** N1 (item 1) and N2 (item 2) are proposed records (D-079, D-080). This file's question 1: no run without the profiler per side of a toggled pair; the lab reads each pair from two profiler captures, and point (d)'s second half stays out. Question 3: no "what changed" table: the six lessons are separate subjects, a reading of a trace, two capture tools, a partition, an arithmetic of bytes and a second engine, so rule 9's table does not fit, and the module page says so. Question 4: no claim quotes more of the book; the one number printed of it stays in `tr2` lesson 5 (D-069), and no TR3 lesson prints one. N19: recorded (item 18) and not built here. O-14: a choice item's blind bound is the gate's reading. O-17: ASSESSMENT §4.3's `pinned` row stays as written, and the browser credit rests on `attribute` meanwhile. Q-5: a `proved` event is needed for completion, which is why item 12 names a Prove level. O-21: a quoted run is [unverified].

**Not to copy from the rest of this file:** the working name "Gap Hunt" (the title is Trace attribution); "W2-T24 writes" the KCs (they are written); `pinned` as a graded level of this wave (item 5); the brief's 1.2 GB as the weights a step reads with no derivation (item 15); §5's old name for a lesson's closing questions (they are a lesson's Test, item 13); the open question of (e) and §11, item 5 (item 2 settles it as a default).

### The book's four rules and three pointers, (a) to (f) (added 2026-11-18)

For the authors of the game and the lessons (item 13 above names them). Four rules for reading a GPU timeline, each at the lesson named, and three pointers. Section names are the appendix's own, and each number was read on the book's page on 2026-11-18.

**Where these come from.** The appendix "Measuring and Analyzing GPU Kernel Performance" of the book "Modern GPU Programming For MLSys" (MLC Community; https://mlc.ai/modern-gpu-programming-for-mlsys/, repository github.com/mlc-ai/modern-gpu-programming-for-mlsys), read on 2026-11-18. Its numbers are the book's authors', from separate runs and captures on one B200, and the course has not reproduced them, so each is [unverified]. The book's front page calls it open source and names no licence, and no licence file was found, so this note quotes nothing from it: copy no sentence, listing or exercise of it, and write each point in the course's own words with the course's own seeded numbers. A lesson that prints one of its numbers gives it as the authors' and needs a claim for it; a claim needs a quote from its source (`packages/schema/claims.ts`). One number of it is printed so, in `tr2` lesson 5, as its authors' and [unverified] (D-069); any other waits for the owner's word on the licence. A hardware fact is checked against NVIDIA's documents. A link to the book goes to the repository file at a commit, never the site or `main`.

- **(a) `tr3.l3` or `tr3.l4`, a "Watch out" card, and one case in Trace attribution (W2-T20).** An empty stretch on one GPU stream is not an idle GPU: a kernel or a copy on another stream may cover it. The book's section is "Diagnose Long Gaps in the GPU Timeline". GPU-busy is already defined here as a union over streams (§1, item 4), so the card says why. The card's rule: an interval counts as GPU-idle only when no captured stream has a kernel or a copy in it, and a trace can say that only of what it captured. For W2-T20: the built generator (`packages/sim/trace/synth.ts`) draws one GPU stream, so the case needs a second `gpu-stream` track from it.
- **(b) `tr3.l4`, one paragraph and one numeric variant of `tr3.gap-cause`.** A gap between two kernels has up to three parts, each clipped to the gap: the host's time before it enters the launch call of the second kernel, the part of that call that falls within the gap, and the wait from the call's return to the second kernel's start. A part is zero when the call began before the first kernel ended. The book's worked case, in the same section, is made up for the purpose and is not a capture: the first kernel ends at 20 us, the launch call starts at 95 us and returns at 98 us, the second kernel starts at 100 us, and the 80 us gap is 75 + 3 + 2 us. Draw the variant's timestamps from the item's own seed, and keep seeds in which a part is zero.
- **(c) `tr3.l3`, one sentence.** The "Queue Dur" column of Nsight Systems' report of kernel launches (`cuda_kern_exec_trace`) is not the gap on the GPU, and it is no proof that one kernel waited for another: it counts only from the return of the launch call to the kernel's start. In the book's report (same section) one kernel shows 5.074 us in that column while the gap before it on the GPU is 0.224 us. This holds only if the Nsight Systems version the course settles on still prints that column. The book used 2025.6.3, and 2026.5.1 is proposed in §7, not pinned. Read the report's field definitions at the pin first, in NVIDIA's own documents, word the sentence from them and not from the book, and drop the sentence if the column is gone.
- **(d) `tr3.l1`, one sentence.** The book times the GEMM kernel of one example operation with three tools and prints three durations: 87.00 us as Proton's average over 100 calls (section "Use Proton to Compare the Kernels in the Operation"), 92.608 us in one Nsight Systems capture (section "Locate the Most Expensive Kernel in the Timeline") and 95.30 us in one Nsight Compute capture (section "SpeedOfLight Denominators and Duration"). In the last of these sections it tells the reader to trust a duration only inside the capture it came from, and to compare two implementations by a CUDA-event timing with no profiler attached. The three numbers differ in more than the tool: they are separate captures, one is an average and two are single calls, and Nsight Compute sets the clocks and empties the caches. So the lesson's sentence is that a duration in a profile is read inside that profile. Its second half, that the size of a fix is read from a run with no profiler attached, goes in only if the owner answers question 1 with yes: as designed, the lab reads each toggled pair from two profiler captures (§5, s2 and s4), and the lesson should not state a rule that the module's own lab does not keep. It does not say that the profiler added the difference. As one sentence for the lesson this needs nothing more. As a check in the lab it would be a design change: every run in the lab (s2 and s4) is a profiler capture, and an unprofiled run per side costs GPU time, receipt rows and rules in ASSESSMENT §6. Do not add it as a check.
- **(e) Rule 11's form, `tr3.l4`.** TR3's one written form is the partition of §1, item 4. It belongs at `tr3.l4` with the level `attribute`, not in lesson 1 (`tr3.partition` requires `tr3.trace-anatomy`). The build takes "CPU gap" as the default word for the stretch in which the GPU idles while the CPU prepares the next step; the owner may overturn it (N2). The word sits in `GAP_WORD` of `src/copy/terms.ts`, and item 2 above gives the reason and item 3 the form.
- **(f) Three pointers and no more.** A pointer is one go-deeper link at the end of the lesson's Read, with no number and no sentence of the book. `tr3.l5` links the appendix's section "Use Nsight Compute to Analyze a Single Kernel" and names Kernels KN1 in words, with no link while that course has no route (`tr2/l5` already promises "TR3 is where you read them"); `tr3.l2` links the appendix's section "Find the Most Expensive Kernel with Proton". The repository's README gives the appendix's source as `appendix/benchmarking_gpu_kernels.md`; no commit was recorded on 2026-11-18, so link the commit that is current when the lesson is written and check the section's name there. The third, from `tr4.l3`, is in TR4's note.

**The four questions of 2026-11-18** (an unprofiled run per side of a toggled pair; the word of the form; rule 9's "what changed" table; a further quote of the book) are the owner's and unanswered. Item 19 above gives the default the build takes on each, and item 2 the word.

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before each Gap Hunt case: "What is this step's largest contributor?" Before the lab's toggled pairs, committed in the browser when the challenge is issued: "By how much does TPOT change with graphs off? With async scheduling off?", answered with TR2's model and its host card. | `predict`, scored at reveal against the receipt's recomputed numbers |
| **Play** | Gap Hunt on synthetic traces, then on the owner's pinned traces: mark spans, assign categories until "unaccounted ns" reaches 0, then name the cause (§6). | `trace-mark` and `play` |
| **Build** | Profile the pinned vLLM on your GPU: two toggled pairs, an attribution report, and an optional nsys or SGLang stage (§5). | `receipt` |
| **Prove** | With the agent closed: Gap Hunt's `attribute` level on fresh cases; and "defend your trace": the browser asks seeded questions only your own receipt's raw records answer, such as "which category grows most in your step 3 when graphs are off?" (ASSESSMENT §7). | `play` and `prove`, `proved` |
| **Keep** | Today draws the eight families of "Before you write", item 4. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `play:gap-hunt/gap` | B | The largest gap and its cause, on a synthetic trace with seeded jitter | Against the trace model's exact ground truth (A§5.7) | Gap and cause event id right, on 3 fresh cases |
| `play:gap-hunt/attribute` | B | A full partition of a step window | Correct ns over window ns | At least 95% of the window in the right category and the cause right, on 3 fresh cases |
| `play:gap-hunt/pinned` (the catalog's "attribute 6-10 pinned traces") | B | The same, on cases drawn at grade time from the owner's 6-10 SHA-256-pinned traces, against the owner's reviewed annotations | As above | As above, on 3 fresh cases from at least 3 distinct traces. Not built in wave 2: until W2-T21 the level shows the plain line of "Before you write", item 5, and the module's B credit rests on `attribute`. |
| Item families (§4, Keep) | B | Answers on fresh seeds | Keys from `packages/sim/trace` and the atlas | Exit ticket |
| `receipt:tr3.profile.s1` (preflight, first win) | F | Fingerprint, driver gate, `perf_event_paranoid`, the GPU's name, the effective runner, and an `ncu` probe result | The grader records; the browser shows | Recorded only; no credit and no gate on the probe |
| `receipt:tr3.profile.s2` (graphs on and off) | F | Two torch-profiler captures of the challenge's workload and step window: the default `-O2` and `-O0` | Grader: teacher-forced agreement of both runs' outputs with the owner's references (profiling must not change tokens); pins; runner and effective graph mode from the engine's log. Browser: `traceChecks` (ASSESSMENT §6.1), step count equal to the challenge's `max_iterations`, physics floors, and cross-checks with the run's request log | Every required check passes |
| `receipt:tr3.profile.s3` (the attribution report, the catalog's "report") | F | Your partition and gap causes for 5 steps of each s2 capture, as structured JSON, plus a structured finding: which category moved, by how much, and why | The browser recomputes each partition from the receipt's `trace@1`; the partition must sum exactly; your categories are compared span by span | At least 95% of each window's ns in the right category and every cause right; the finding's numbers equal the recomputed ones. No prose is graded. |
| `receipt:tr3.profile.s4` (async on and off) | F | The same capture with `--no-async-scheduling`, and the attribution of the bubble change | As s2 and s3 | As s2 and s3; your committed prediction is scored for calibration and moves no credit |
| `receipt:tr3.profile.s5` (optional) | F | Either an nsys node-level capture with graphs on, or SGLang v0.5.23's decode throughput at concurrency 32, 48, 49 and 64 on a 24 GB card | Trace or benchmark consistency checks (ASSESSMENT §6) | Practice credit; the SGLang result settles whether its 48-sequence graph cap is a cliff (sglang G3) |

The module counts as complete when s2, s3 and s4 are `gpu-verified`, the B artifacts and exit tickets are credited, and a `proved` event exists (ASSESSMENT §9).

**The lab's workload.** Qwen3-0.6B at the pinned revision on the pinned vLLM, with prompts and lengths drawn from the challenge's seed, a decode-heavy mix, and a capture window that skips warm-up. Traces stay under about 100 MB raw, SGLang's advice for traces opened in a browser [measured] (sglang N3).

## 6. Game slot

**Trace attribution**, id `gap-hunt`, 2D (GAMES.md §6), on the Traces page. Role line "You attribute the gap." ("Before you write", item 1).

- **The rule is the concept.** The game accepts only a true partition of the step window, and a gap's cause is read off the launch queue. The GPU idles only when its queue runs empty, so the attribution rule is the concept.
- **Levels the module uses** (GAMES.md's working ids): `read` and `graphs` for practice; `gap` and `attribute` graded, `attribute` the Prove level; `pinned` graded once the owner's traces exist, and `yours`, which loads the learner's own trace for practice only because the grader owns its credit (D-001), are not built in wave 2 ("Before you write", items 5 to 12).
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
5. **Four questions of 2026-11-18**, among them the word for the stretch in which the GPU waits for the CPU: the build takes a default for each ("Before you write", items 2 and 19), and each is the owner's to overturn.
