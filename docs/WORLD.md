# The Trace Room: enginespace's world

**Status:** design for the owner's review. **Date:** 2026-11-03. Nothing here is built, and no real engine trace has been captured yet (PRODUCT.md, "Evidence on Hand").

**What this file owns.** What the course's world models and what it ignores: the seeded engine world's rules, the trace corpus, calibration, the notional-machine cards and the determinism rules. Its neighbours:
- [ARCHITECTURE.md](ARCHITECTURE.md) (A§n) owns the code: `packages/sim` and its modules (A§5), `trace@1` (A§5.7), the viewer and the routes.
- [GAMES.md](GAMES.md) owns the games that render this world.
- [ASSESSMENT.md](ASSESSMENT.md) owns what is graded with it.
- The catalog names the world: "The Trace Room. Owner-captured, sha256-pinned nsys and profiler traces, graded on the spans you mark ('find the 300 µs gap, name the sync'), beside a step-loop sim whose step times come from S5's calibrated card" (kernelspace `SPECIALIZATIONS.md` §3.5, 2026-10-24).

**Sources.** kernelspace at `origin/master` d478f91: `docs/specs/s5.md` (§3, the card; §3.5, what it leaves out), `docs/physics/report.json` (the fit, adopted 2026-10-18, unsigned), `src/lib/world/physics/*`, `src/lib/rng.ts`, `public/traces/README.md`, and `src/lib/world/fleet-ex/*`'s MODEL-ONLY headers; statespace at 7b6938c, `docs/WORLD.md`, as a structural precedent; this workflow's research ([upstream-vllm.md](../research/upstream-vllm.md), [upstream-sglang.md](../research/upstream-sglang.md)), cited by row as (vllm M7) or (sglang O1).

**Tags** as in A§0. Every parameter of the model that is not a cited claim is [estimated] and is labelled so on screen. A table whose numbers share one tag says so in its caption. A number of the world's own invention is *synthetic*, and the screen says so.

---

## 0. The world on one page

The Trace Room is two halves, shown side by side:

1. **The seeded engine world.** A step-loop simulator in integer microseconds that follows vLLM v0.33.0's engine core: a scheduler with one token budget, chunked prefill and recompute preemption; a KV manager with hybrid groups and adapter pages; CUDA-graph capture and replay with dispatch keys; async scheduling; speculation; and the structured-output mask. Every run is a function of a seed and a configuration, and it can emit a synthetic trace whose ground truth is exact.
2. **The trace corpus.** Traces of the pinned engines captured by the owner on real GPUs, each pinned by SHA-256, dated and annotated; synthetic traces, labelled as such; and the learner's own traces, which never leave their device.

```
 seed + config ─▶ workload ─▶ scheduler ─▶ KV manager ─▶ step builder ─▶ graph dispatch ─▶ cost cards
                     ▲                                                                       │
                     └──── async scheduling · sampling · grammar mask · speculation ◀─────────┘
                     run: lanes, steps, requests, summary, violations
                       └─▶ traceFromRun (seeded jitter) ─▶ synthetic trace@1 ─┐
 owner capture on a GPU ─▶ grader export ─▶ pinned trace@1 + annotations ──────┼─▶ one viewer, one partition rule
 learner capture ─▶ grader export ─▶ local trace@1 (never uploaded) ───────────┘
```

The promise to the learner: every number on screen comes either from the model, shown with its card, or from a pinned capture, shown with its provenance. When they disagree, the capture wins and the card records the gap (D-012).

## 1. Constraints this design obeys

1. **Zero servers.** The world runs in the tab; nothing leaves the device (D-009).
2. **Pure, seeded, integer time.** No clocks, no `Math.random`, no transcendental functions at runtime (D-017; §6).
3. **Every world carries a card** saying what it models, what it ignores and what calibrated it, shown wherever the world is (D-012; §5).
4. **Every number is a claim or a labelled estimate,** with a source, a date and a TTL (A§4.4).
5. **The default runner first.** The world follows MRV2, vLLM's default for all models since v0.29.0 (vllm M1); MRV1 is a labelled legacy preset, and its `has_lora` dispatch key is taught as legacy (D-041).
6. **Adapter pages are the learner's design.** The KV manager's unified pool is S-LoRA's design; both engines use adapter slots at the pins, and the world models the slots as the baseline (D-042).
7. **No fitted value is ever graded.** The world may show the card's parameters as "the engine's numbers"; it never presents them as hardware facts (kernelspace S5 §3.4).

## 2. The seeded engine world

`packages/sim/steploop` and its neighbours (A§5.2, §5.3). Each rule below cites the upstream fact it encodes; W1-T12 puts each citation in a code comment.

### 2.1 One step, in integer microseconds

**Lanes.**
- `cpu-main`: the engine core's busy-loop thread.
- `cpu-mask`: the grammar bitmask fill. W1-T12 draws it as `mask` spans on `cpu-main`, because the engine core's own thread fills the bitmask, and above 128 structured requests it waits for a pool of helper threads to finish (claims `vllm.mask.overlap`, `vllm.mask.fill-parallel-threshold`).
- `gpu-compute`: the default stream, carrying the forward.
- `gpu-copy`: the device-to-host copy of sampled ids, on its own stream as MRV2's `AsyncOutput` does (vllm TR1 notes).

**Phases**, following `EngineCore.step` at v0.33.0 (vllm M7): `schedule()` → `execute_model(non_block=True)`, which prepares inputs and launches the forward (one call per kernel when eager, one replay when a graph hits) → `get_grammar_bitmask()` on the CPU while the forward runs → `future.result()`, waiting for the forward → `sample_tokens(grammar_output)`, which applies the mask and samples → `update_from_output()`, which needs the sampled ids on the host; under MRV2 they are copied on their own stream. With a batch queue, up to `max_concurrent_batches` steps are in flight (2 on MRV1 with async scheduling at PP = 1; `pp_size + 1` on MRV2). When nothing ran but requests remain, the loop sleeps 1 ms [measured at v0.33.0] (vllm M7).

**Detokenization and HTTP** run in the frontend process in vLLM, off the engine core's critical path; the step loop draws them on a separate `cpu-front` lane only in the lifecycle view (§2.10), never inside the step.

### 2.2 Workload

`packages/sim/workload`, seeded:
- **Arrivals:** Poisson through a committed table of exponential quantiles; replay of kernelspace's vendored BurstGPT v2.0 slices and the Mooncake "Kimi" conversation slice, with their attribution (A§13; kernelspace `public/traces/README.md`); or closed loop with a think time.
- **Lengths:** prompt and output lengths drawn from those slices' quantiles or from tables. Output lengths are hidden from the scheduler, which learns a request has ended only when it emits EOS.
- **Sharing:** prefix groups (for prefix hits), adapter ids (for LoRA) and a structured-output share (for the mask).

### 2.3 Scheduler

vLLM v1's rules at v0.33.0 (vllm M8, M12), which kernelspace's lab 06 twin already verified at v0.31.0:
- one token budget per step (`max_num_batched_tokens`) and a cap on sequences (`max_num_seqs`), with defaults per GPU class as data: under 70 GiB, 2,048 tokens and 256 sequences for the server; on an H100, 8,192 and 1,024 [measured at v0.33.0] (vllm M9);
- running requests first, then waiting ones;
- chunked prefill on, with `long_prefill_token_threshold` at 0;
- admission only when the whole prompt fits (`scheduler_reserve_full_isl`), so a waiting request that does not fit ends the waiting loop: head-of-line blocking under FCFS;
- preemption by recompute only: the victim is the last running request under FCFS, or the max of (priority, arrival) under priority; its blocks are freed, its computed tokens reset to 0, and it goes to the front of the waiting queue;
- speculative tokens count against the budget, and uniform decodes in a verify step are padded to 1 + k;
- requests in `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR` or `WAITING_FOR_REMOTE_KVS` are skipped until ready (vllm M10).

### 2.4 KV manager

`packages/sim/kv` (A§5.4):
- **One physical page pool.** The default block is 16 tokens [measured at v0.33.0] (vllm M9). KV groups follow vLLM's rule of one page size, reached by grouping layers, padding layers or inflating the attention block (vllm TR5a notes). D-045 adopts this, as GAMES.md §13 proposed, and drops A§5.4's mixed `pageUnits`.
- **Groups.** Full attention keeps every block; a sliding group releases blocks behind its window; a state group holds a fixed number of pages per request.
- **Adapters, two policies.** S-LoRA's unified paging (an adapter takes ⌈adapter bytes ÷ page bytes⌉ pages, stored non-contiguously, shared by every request using it, admitted all or nothing), which the learner builds; and the slot baseline: vLLM's `max_loras` slots with a CPU LRU and an admission cap on distinct adapters (vllm K4), or SGLang's `max_loras_per_batch` slots (sglang X6).
- **Prefix caching.** A block's hash chains its parent's hash, its token ids and its extra keys (the adapter id). A hit is the longest prefix every group holds, found as a fixed point with full attention first (vllm K1).
- **Capacity** is the memory budget, less the weights, the activation workspace and the CUDA-graph reservation, divided by the bytes per page; since v0.29.0 the graph memory is reserved before the KV cache is sized (vllm G9).
- **Events** are `BlockStored`, `BlockRemoved` and `AllBlocksCleared` in `kv-events@1`, mirroring v0.33.0's shapes (vllm K8) (D-034). Those shapes already carry the adapter, so the schema adds no adapter field of its own: vLLM's `BlockStored` has `lora_name`, and a `lora_id` that its source marks deprecated, and SGLang's has `lora_name` since v0.5.23 (claims `vllm.kv-events.adapter-field` and `sglang.kv-events.adapter-field`; sglang H2).
- **Invariants:** pages are conserved; refcounts never go below zero; a block table's length follows its group's rule; every operation is all or nothing; every stored or removed block is published exactly once.

### 2.5 CUDA graphs

- **Modes:** NONE, PIECEWISE, FULL, FULL_DECODE_ONLY and FULL_AND_PIECEWISE, with `-O0`, `-O1` and `-O2` presets (vllm G1).
- **Capture sizes:** vLLM's default list, `[1, 2, 4]` plus steps of 8 to 256 and of 16 above, capped at 512 [measured at v0.33.0] (vllm G2), or a list the learner chooses within a capture-time and memory budget [estimated budgets per card].
- **Padding:** a step's token count is rounded up to the next captured size; the padded tokens are computed and wasted, which the GPU lane shows as hollow cells.
- **Dispatch keys, per runner:** MRV2 dispatches on a 7-field `BatchExecutionDescriptor` (`cg_mode`, `num_tokens`, `num_reqs`, `uniform_token_count`, `max_query_len`, `num_active_loras`, `num_ubatches`) and takes the first compatible captured descriptor; MRV1's 5-field `BatchDescriptor` holds `has_lora` and tries FULL, then a relaxed PIECEWISE key, then NONE (vllm G3, G4). SGLang keys decode graphs by padded batch size and prefill graphs by padded token count, per phase in {full, breakable, disabled} (sglang G1, G2). The world and A§5.3's sketch both follow D-041.
- **Adapters and graphs:** graphs captured with and without active adapters, or per power-of-two count of them (vllm G6).
- **Backends' support levels:** `ALWAYS`, `UNIFORM_BATCH`, `UNIFORM_SINGLE_TOKEN_DECODE` or `NEVER`, and a requested mode downgraded to the closest one supported (vllm G7).
- **Costs:** a replay is one launch plus the captured kernels' GPU time at the padded size; eager is a launch per kernel on the CPU lane plus the same GPU time; PIECEWISE replays the graph's pieces with attention launched eagerly between them [a simplification, stated on the card].
- **Not modelled:** "breakable" graphs, an experimental capture path that is not a sixth mode (vllm G8).

### 2.6 Async scheduling

- **Off:** strictly serial. The CPU schedules, prepares and launches; the GPU runs the forward; the CPU waits for it, launches sampling, reads the sampled ids back and updates; then the next step starts.
- **On** (the default since v0.14.0, vllm M6): the next step's schedule, prepare and launch overlap the current forward. Inputs for tokens not yet sampled are placeholders that the GPU fills itself (MRV2's GPU-side input preparation, vllm M5). A request that stops on EOS still rides the next step, and that token is thrown away.
- **The dependency check:** a configuration that would read a token on the CPU before it is sampled raises a `Violation`, which every graded level counts (A§5.3).

### 2.7 Speculation

- k drafted tokens per request per round, at a proposer cost: draft-model steps on the GPU lane or n-gram lookups on the CPU lane.
- The verify step computes k + 1 positions per request (vllm M8).
- Acceptance is drawn per position from the workload as integer permille, and expected tokens per round are the sum of repeated products, as kernelspace's `push-luck` computes them, never `Math.pow`.
- The exact accept-and-recover rule lives in `packages/sim/spec` (A§5.5) for The Verifier and the forge lab; the step loop uses acceptance counts only.
- At v0.33.0 a `custom_class` or `suffix` proposer flips the runner to MRV1, where async scheduling turns itself off for methods outside a named list (vllm S4, M6), and the world's presets do the same.

### 2.8 Structured-output mask

Four phases at v0.33.0 (vllm O2):
- **compile:** an asynchronous CPU task per new grammar, while the request waits;
- **fill:** on the engine core's thread (`cpu-main`, see §2.1), after the launch and so overlapping the forward, serially for up to 128 structured requests and otherwise in 16-row tasks on at most 8 threads when no speculative tokens are present [measured at v0.33.0];
- **apply:** inside sampling, at a cost per masked row;
- **deferral:** with async scheduling, sampling for structured requests waits until the previous step's tokens are processed.

The SGLang preset instead advances the grammar inside verify behind a barrier for EAGLE, STANDALONE and the DFlash family, delays sampling on the non-speculative path, and falls back to a synchronous path for NGRAM (sglang O3, O4).

### 2.9 Tiers and connector waits

`packages/sim/tiers` (A§5.8): GPU, host and disk tiers with bandwidths from atlas claims; store, load, offload and evict operations; synchronous loads layer by layer or asynchronous loads that hold a request in `WAITING_FOR_REMOTE_KVS`; saves that keep their source blocks until complete; reported load failures; `kv-events@1`; and a reference consumer that rebuilds the cache from events (vllm K7, K8). In the step loop, a connector wait is one more source of bubbles (vllm TR2 notes).

### 2.10 Engine presets

Presets are data built from claims, so a re-pin edits data, not code.

| Preset | What it changes | Pin | Status |
|---|---|---|---|
| `vllm-mrv2` | §2.1-§2.8 as written; async on | v0.33.0 | the default |
| `vllm-mrv1` | `BatchDescriptor` with `has_lora`; CPU-side input preparation [estimated cost]; async off for unlisted speculative methods | v0.33.0 | legacy, labelled |
| `sglang` | overlap with a one-batch result lag (sglang O1); per-phase graphs and buckets (G1, G2); the 24 GB decode-graph cap of 48 below TP 4 [derived from source, not run; G3]; the grammar barrier (O3, O4); scheduler dials (O5) | v0.5.23 | partial; each rule cites its claim, and rules not yet read at the pin follow vLLM's and say so |
| `mini-sglang` | overlap on, decode graphs | `9a91cfa` | the lifecycle view and TR2's reading only |
| `nano-vllm` | prefill or decode per step; 256-token blocks; decode graphs (vllm T4) | `bb823b3` | the lifecycle view only |
| `trt-llm` | overlap with one extra decode step (sglang G6) | — | one row in TR2's ablation table, not a runnable preset |

**The lifecycle view** (`packages/sim/lifecycle`, A§5.8) draws one request's path through each engine's processes as stages with a location and a mechanism, sourced to the pinned reading targets (W1-T16). It is a separate model with its own card (§5).

### 2.11 Cost cards

**The GPU lane.**
- **"70B on H100"** uses kernelspace's S5 card on its H100 FP8 row: Llama-3-70B, from one pinned InferenceX sweep at vLLM 0.10.2 (published 2025-10-29), fit adopted on 2026-10-18 and unsigned, with leave-one-out TPOT error of mean 5.0% and p90 11.3% over 25 configurations [measured from `docs/physics/report.json`]. Its B200 FP8 and B200 NVFP4 rows are also calibrated (leave-one-out means 3.6% and 4.5%) [measured, same file].
- **"Small model on a 24 GB card"** is a napkin card: S5's form with η = 1 and no fixed terms (S5's `NAPKIN`), fed with the pinned model's bytes and the atlas's datasheet bandwidth and peak for the GPU. It is the datasheet bound, not a fit, and it is labelled synthetic. It becomes a fitted row only if the owner's traces support a fit (§4.3).

**The CPU lane: the host card.** Integer µs per phase: schedule base and per sequence, preparation per token, launch per kernel and kernels per layer, graph replay, sync, sampling per sequence, mask fill per sequence, and IPC (A§5.3's `HostCard`). Every value is an [estimated] preset per runner until W2-T22 fits it to the owner's traces, and every screen that shows host µs says "estimated" until then.

**Where S5's host term goes** (D-044, proposed; PLAN.md Q-2). S5's fitted t_seq, 61.1 µs per running request per step on the H100 FP8 row with a refit range of 53.0-69.9 µs [measured, `report.json`], is "host work per running sequence per step" in S5's own types. S5 fitted it as an additive term inside the GPU step. D-044 moves it to the CPU lane, as GAMES.md §13 proposed, so that async scheduling can hide it; on this card it replaces the host card's per-sequence schedule and sample phases, so nothing is counted twice. That is an extrapolation beyond S5's fit, and the card says so.

### 2.12 What a run produces

`runStepLoop` (A§5.3) returns the lanes as a timeline; per step, the batch, the padded size, the graph mode and hit or miss, GPU µs and bubble µs; per request, TTFT, TPOT and end-to-end latency measured from the due time; a summary (GPU busy in permille, tokens per second × 1,000, TPOT p50 and p99); and every violation. `traceFromRun` turns a run into a synthetic `trace@1` with seeded jitter (§3.5).

## 3. The trace corpus

### 3.1 Three kinds

| Kind | Where it comes from | Ground truth | Labelled |
|---|---|---|---|
| **Pinned** | the owner's captures of the pinned engines on real GPUs, exported by the grader (W2-T19, W2-T21) | the owner's reviewed annotations, checked against the partition the browser computes | engine, version, GPU, date, SHA-256 |
| **Synthetic** | `traceFromRun` on seeded runs | exact | "synthetic", always |
| **Yours** | the learner's own captures, exported by their grader | the partition rule only | "your capture, on your device" |

### 3.2 The owner's capture plan (proposed; O-5 decides)

The catalog asks for 6-10 pinned traces (§3.5's TR3 artifact). A proposal that covers every phenomenon the modules teach:

| # | Engine and settings | Model and GPU | Shows |
|---|---|---|---|
| 1 | vLLM v0.33.0, defaults (`-O2`, async on, MRV2), decode-heavy | Qwen3-0.6B, RTX 4090 | the base step |
| 2 | as 1, `--no-async-scheduling` | same | the bubble async scheduling hides |
| 3 | as 1, `-O0` | same | eager launch combs |
| 4 | as 1, half the requests with a JSON-schema grammar | same | the mask lane |
| 5 | as 1, n-gram speculation | same | the verify step's shape |
| 6 | as 1, prefill-heavy, chunked | same | mixed steps |
| 7 | SGLang v0.5.23, defaults, the workload of 1 | same | the second engine's overlap |
| 8 | as 7, `--disable-overlap-schedule` | same | the same bubble in SGLang |
| 9 | vLLM v0.33.0, defaults | an 8B model at a pinned revision, H100 | the datacenter row, FlashAttention 3 |
| 10 | vLLM v0.33.0, `--kv-offloading-size` on a shared-prefix workload | Qwen3-0.6B, RTX 4090 | connector waits |

Each is a torch-profiler capture of a chosen window through `--profiler-config` and `/start_profile` with `delay_iterations` and `max_iterations` (vllm P1); 1 and 3 also get an nsys capture with `--cuda-graph-trace=node` where the host allows it (sglang N4). The owner's GPU time is about 4 h on a 4090 and 1 h on an H100 [estimated], about $3-7 at RunPod's prices read on 2026-11-03 [derived: 4 × $0.34-0.89 + 1 × $1.99-2.89]. Before any capture, the R580 driver gate must pass on the capture hosts (vllm R4, U1; D-035).

### 3.3 What a pinned trace carries

- an id, and the engine's name, version and commit;
- the model and its revision; the GPU and driver from the fingerprint;
- the effective configuration: runner, graph mode after any downgrade, async scheduling, attention backend, `max_num_batched_tokens` and `max_num_seqs` (ASSESSMENT §5.6);
- the workload's seed and hash;
- the profiler and its version, and the capture window;
- the capture date;
- the SHA-256 of the raw file and of the normalised `trace@1`;
- its size, with the raw file under about 100 MB, SGLang's advice for traces opened in a browser [measured] (sglang N3);
- its licence (O-3);
- the owner's annotations: each annotated step's partition and gap causes, reviewed;
- known oddities, in plain text.

### 3.4 Annotation and review

The owner annotates with Gap Hunt's own tool. The browser recomputes each annotated partition from the trace; a disagreement is resolved before publication, and a trace whose annotation and computation still disagree is withdrawn from graded draws (ASSESSMENT §4.4). W2-T21's acceptance requires the annotations to be reviewed.

### 3.5 Synthetic traces

`traceFromRun(run, seed, jitter)` adds seeded jitter: noise on kernel durations, gaps between launches, and scheduling noise on CPU spans. Its parameters are [estimated] and printed on the card. Synthetic traces carry `synthetic: true`, render a "synthetic" label, and are never presented as measurements (PRODUCT.md). Their ground truth is exact, so they grade TR3's `gap` and `attribute` levels and TR1's `map` before any pinned trace exists.

### 3.6 Your own traces

The `yours` level opens a learner's own trace in a worker, as text, with size caps (A§12). It is never uploaded, and its credit belongs to the grader's receipt (D-001).

### 3.7 Pins and re-pins

A pinned set belongs to one engine pin. At a quarterly re-pin the owner captures a new set; the old set stays viewable, labelled with its version, and leaves graded draws. A pin never moves mid-quarter, because the traces are pinned to it (D-035).

## 4. Calibration

### 4.1 What is calibrated, and against what

| Part of the world | Calibrated against | Status on 2026-11-03 |
|---|---|---|
| GPU step time, 70B card | S5's three fitted rows, inside their box | calibrated (fit adopted 2026-10-18, unsigned) |
| GPU step time, small-model card | the datasheet bound (η = 1) | napkin; labelled synthetic |
| Host phases | the owner's traces 1-6 (W2-T22) | [estimated] presets; nothing yet |
| Engine defaults, capture sizes, descriptors, thresholds | claims read at the pin | exact, as data |
| Which graph a batch dispatches to | a golden table from an owner run of vLLM's dispatcher at the pin (GAMES.md open question 3) | not yet produced |
| Acceptance rates | none; drawn per workload | synthetic |
| Tier bandwidths | the hardware atlas's claims (W2-T09) | pending W2-T09 |

### 4.2 The box

S5's rows cover Llama-3-70B on H100 FP8, B200 FP8 and B200 NVFP4 under vLLM 0.10.2's harness (an 8,192-token budget, 16-token blocks, 0.9 memory utilisation) [measured, `report.json` settings]. S5 itself leaves out speculation, CUDA-graph buckets, preemption cost, prefix caching and any other model, precision or engine release (kernelspace `docs/specs/s5.md` §3.5). The course's GPU lane runs Qwen3-0.6B on a 4090 with vLLM v0.33.0, which is outside the box on model, GPU and engine version. Every screen outside the box says "napkin" or "estimated", and no graded answer depends on a number from outside it.

### 4.3 Fitting the host card (W2-T22)

1. **Protocol first.** Written and hashed before the fit runs, as kernelspace's S5 did with its `protocol.md`: inputs, the form, the fitted parameters, the hold-out rule and the pass bars.
2. **Inputs:** the owner's vLLM traces 1-6 (§3.2), with per-phase CPU spans located by the lifecycle names.
3. **Outputs:** per-phase medians in integer µs with ranges, as claims, and the card's line "fitted on <traces>, <date>".
4. **Validation:** leave one trace out; report the predicted against the measured step time, bubble share and gap count, with errors, positive or negative.
5. **Use:** The Loop's goldens are regenerated with `--write` and reviewed (W2-T22). No item grades a fitted value.

### 4.4 The host term's lane

§2.11's choice changes what every step-loop level teaches. D-044 proposes the CPU lane, and the owner confirms it before W1-T12. The card states the choice and that hiding S5's additive term under the forward is an extrapolation, and W2-T22 checks it against the owner's H100 trace.

### 4.5 Validation panels

For each pinned trace, the Trace Room runs the world on the trace's configuration and workload and shows the two side by side: step time, bubble share and gap count, with the error printed. Where the error exceeds a stated bound (TPOT within 15% and bubble share within 5 points [estimated]), the case is labelled "the world is uncalibrated here", and the trace stays the authority.

### 4.6 At each re-pin

New traces, a refit of the host card, regenerated goldens, re-checked claims, and change cards for every claim that moved (A§4.4).

## 5. Notional-machine cards

Each world has a card in `content/cards/<world>.md` with three parts (A§5.9). These are the cards' substance; W1-T07 and W2 tasks write them with claim ids.

**`steploop`** (The Loop; TR2, TR6's mask lane, TR8's server)
- *Models:* §2.1-§2.8: the step's phases and lanes, one token budget, chunked prefill, recompute preemption, async scheduling and its placeholders and extra token, graph modes, capture sizes, padding, per-runner dispatch keys, backend support levels, graph memory, speculation's step shape, the mask's four phases, and engine defaults per GPU class.
- *Ignores:* kernel-level variation within a step; clocks and thermals; Python garbage collection and OS scheduling jitter (except as seeded jitter in synthetic traces); tokenization and detokenization cost inside the step; HTTP and streaming; multi-GPU parallelism, NCCL and MoE; memory fragmentation; graph capture's own transient cost beyond a budget; breakable graphs; S5's whole list of omissions on the GPU lane.
- *Calibrated against:* S5's rows on the 70B card; nothing on the small-model card (napkin); the host card [estimated] until W2-T22.

**`lifecycle`** (The Engine Floor; TR1)
- *Models:* one request's stages through vLLM, SGLang, Mini-SGLang and nano-vllm at their pins, each with a location (process, thread, device) and a mechanism (queue, IPC, copy, sync, compute); abort paths; request states.
- *Ignores:* durations (stage order only); batching with other requests; failure modes other than abort.
- *Calibrated against:* the pinned source, stage by stage (W1-T16); one owner lifecycle trace per engine family once W2-T21 lands.

**`kv`** (The Pool; TR5a)
- *Models:* §2.4: one pool, groups, sliding release, state pages, adapter pages and the slot baseline, prefix hashing, the N-group hit, eviction, capacity after the graph reservation, events and invariants.
- *Ignores:* the physical layout of bytes within a page; kernel efficiency per page size; copy-on-write costs; CPU swap (TR5b's `tiers` owns tiers).
- *Calibrated against:* nothing numeric; its rules are claims from the pins.

**`spec`** (The Verifier; TR6)
- *Models:* exact accept-and-recover in integer weights; the bonus token; draft chains; acceptance length; chi-square from counts with generated critical values.
- *Ignores:* draft trees (a labelled stretch level); top-k and top-p processing, which vLLM applies to the target's logits before verification (vllm S3), except where a level says so; numerics of real logits.
- *Calibrated against:* nothing; distributions are synthetic.

**`bench`** (Broken Bench; TR8, receipt verification)
- *Models:* arrival processes; intended and actual send times; closed-loop clients; client queueing; warm-up; nearest-rank percentiles; a seeded percentile bootstrap; goodput under both denominators; Little's law; the broken-benchmark corpus; the server as `steploop` run coarse.
- *Ignores:* network latency and its variance; client CPU contention except as a stated client cost; server-side batching detail beyond the coarse loop.
- *Calibrated against:* the server model's own calibration; the corpus's flaws are grounded in kernelspace's `broken-bench` and the tools' source (sglang T5-T8, D3; vllm B1-B3).

**`trace`** (Gap Hunt, the Trace Room; TR1's span checks, TR3, receipt verification)
- *Models:* `trace@1`; the partition of a step window; gap causes from the launch queue; structural checks; physics floors.
- *Ignores:* events the profiler did not capture; hardware counters; NVTX inside captured graphs.
- *Calibrated against:* the owner's annotations on pinned traces; exact ground truth on synthetic ones.

**`tensor`** (Shape Shifter; TR0)
- *Models:* storage, shape, strides and offset; which operations are views and which copy; broadcasting by stride 0; a Triton-style grid with masks.
- *Ignores:* dtype promotion rules beyond a stated subset; device placement; autograd.
- *Calibrated against:* a golden set of view and reshape outcomes generated once with the pinned torch (W2-T13).

**`backends`** (Dispatch; TR4)
- *Models:* each engine's backend choice as an ordered rule table over GPU and model features, and graph-mode downgrades.
- *Ignores:* performance; numerics.
- *Calibrated against:* the pinned docs' generated tables (vllm E2, G7; sglang A4).

**`tiers`** (The Switchyard; TR5b)
- *Models:* §2.9: GPU, host and disk tiers, connector operations, the five invariants, `kv-events@1` and a reference consumer.
- *Ignores:* network transports between machines (The Wire owns them); storage backends' internals.
- *Calibrated against:* bandwidths from atlas claims; the contract from the pin (vllm K6-K8).

## 6. Determinism rules

1. **Seeds.** Every draw comes from kernelspace's splitmix32 (`src/lib/rng.ts`, vendored unchanged), through `rngFor(seed, salt)` sub-streams, with unbiased ranges by rejection (A§5.1).
2. **Integer time.** Microseconds in the world, nanoseconds in traces, every value below 2^53. Probabilities are integer weights.
3. **Floating point only where S5 uses it,** in a fixed order of +, −, ×, ÷, `max` and `Math.round`, which IEEE 754 makes identical in every engine.
4. **No transcendental functions at runtime.** Exponential quantiles, chi-square critical values and similar tables are generated by scripts and committed as integers, and CI regenerates them to compare (A§5.1).
5. **Ordered iteration.** No iteration over a `Map` or `Set` reaches output unsorted; no `sort` without a comparator.
6. **Banned APIs.** `Math.random`, `Date`, `performance` and `crypto` are banned inside `packages/sim` and `packages/play`; seeds enter from outside.
7. **Golden vectors** pin every model's outputs, and a diff is reviewed like code (A§5.10).
8. **Cross-runtime identity.** The same seed gives the same canonical JSON hash in Bun, Chromium, Firefox and WebKit, checked nightly.
9. **Cross-language identity.** The workload generators a grader stage uses are ported to Python and checked against shared vectors, so the browser re-derives a receipt's schedule exactly (A§9.8).
10. **Versioned content.** A graded event carries the content `rev` it was graded against; a later change shows "re-check" and deducts nothing.

## 7. How the world appears

- **The Trace Room** (`/trace-room`): the list of pinned and synthetic traces, each with its card and provenance; the viewer (Canvas2D lanes, zoom and pan by keys and buttons, a span table as the mirror; TRACKER W1-T09); Gap Hunt; and, per pinned trace, the validation panel beside the world's run (§4.5).
- **The Loop** on the front page and in TR2 and TR6, **The Pool** and **The Switchyard** in TR5a and TR5b, **The Verifier** in TR6 and **Broken Bench** in TR8 render the same models through their own scenes (GAMES.md).
- **The card is one tap away** wherever the world is drawn (D-012).

## 8. What the world deliberately does not do

- It runs no real engine and no real kernel in the tab.
- It times nothing in the browser, and it never grades a browser measurement.
- It never says what the learner's GPU will do as a fact; GPU numbers come from receipts.
- It never grades a fitted value.
- It models no multi-node serving, MoE, expert parallelism or collectives; other specialisations own those (catalog §4).
- It shows no photoreal hardware; scenes are schematic (D-019).
- It shows nothing synthetic without a label.

## 9. Build phases

| Wave | World work |
|---|---|
| W0 | `core`, `physics` (S5 vendored), `host` (estimated presets), `workload`; `steploop` v0, which is the TR2 spike and W0-T13's acceptance (D-040) |
| W1 | `steploop` v1 (graphs, keys, mask, speculation; W1-T12); `lifecycle` (W1-T16); `kv` (W1-T21); `spec` (W1-T26); `bench` (W1-T31); `trace` and synthetic traces (W1-T08); the cards (W1-T07) |
| W2 | `tensor` (W2-T13); `backends` (W2-T25); `tiers` (W2-T28); the grader's trace exporter (W2-T19); the owner's traces (W2-T21); the host card's fit (W2-T22); the Trace Room and Gap Hunt (W2-T20) |
| W3 | the capstone pairs' traces (W3-T01); validation panels at full coverage; the re-pin runbook (W3-T06) |

## 10. Open items

1. **The host term's lane** (§2.11, §4.4): settled as proposed decision D-044 (the CPU lane); the owner confirms it before W1-T12.
2. **The dispatcher golden table** needs an owner run of vLLM's dispatcher at the pin (GAMES.md open question 3). W1-T12's acceptance now includes the script and the run; who runs it, and on what host, is Q-10.
3. **Page units** (§2.4): settled as proposed decision D-045, vLLM's one page size for KV groups and S-LoRA's page count for adapters.
4. **The SGLang preset's fidelity.** Which of SGLang's scheduler rules differ from vLLM's is read at the pin by W1-T12; until then the preset follows vLLM's rules and says so.
5. **The jitter model** for synthetic traces, its parameters and how realistic it needs to be.
6. **The owner's capture plan** (§3.2) is O-5, and the traces' licence is O-3.
7. **The trace format at the pin** is [unverified] until the owner's first capture (vllm U2).
