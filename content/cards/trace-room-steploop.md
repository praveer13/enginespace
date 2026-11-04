---
id: trace-room-steploop
kind: notional-machine
title: The engine step loop (v0)
world: steploop
status: draft
---

# The engine step loop (v0)

The notional machine behind The Loop's practice run and TR2: `packages/sim/steploop`, version v0, built as the TR2 spike (W0-T13, D-040). It runs one engine core's busy loop in integer µs on two lanes, `cpu-main` (the engine core's thread) and `gpu-stream` (the default CUDA stream). It takes a seeded workload and a configuration, and returns the lanes, a record per step and per request, and any violations.

Each rule names the research row that holds its source (`research/upstream-vllm.md`, vLLM v0.33.0, read 2026-11-03). Claim ids replace the row ids when W1-T01 writes the claims and W1-T07 rewrites the cards (A§4.4). The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **One step** (vllm M7: `EngineCore.step` and `step_with_batch_queue`). On `cpu-main`, the step runs `schedule`, then `prepare` and `launch` (vLLM's `execute_model(non_block=True)`). On `gpu-stream`, its `forward` starts when the launch has ended and the stream is free. Back on `cpu-main`, `sync` returns the sampled ids to the host once the forward has ended, and `sample` updates the requests from them and checks for stops (`update_from_output`).
2. **The scheduler** (vllm M8). One token budget per step and a cap on running requests. Running requests come first, one token each, and waiting requests follow in arrival order. With chunked prefill on, which is the default at the pin, a prompt is cut into chunks to fit the budget. With it off, a prompt is admitted whole or not at all. The model emits a request's first token in the step that completes its prompt. Static batching, which the front page's first lane runs, forms a batch and admits nothing while any request of it is live in the engine's view (GAMES.md §3.1, D-043).
3. **Where a request ends.** A request's output length is the truth about it, and the scheduler never reads it. The request stops on EOS, and the engine learns of it only when the step that carries its last token is read back (WORLD §2.2).
4. **Async scheduling off** is strictly serial (WORLD §2.6): the next step's `schedule` starts only after this step's `sample`.
5. **Async scheduling on** (the default since v0.14.0, vllm M6). Up to two steps are in flight, as the engine's batch queue allows at one pipeline stage (vllm M7). The next step is scheduled, prepared and launched before the oldest step's result is waited for, so that CPU work overlaps the forward in flight. A request that stops on EOS still rides the next step, because the engine has not read the stop yet, and that step's token for it is thrown away: a ghost token (WORLD §2.6).
6. **The dependency check** (A§5.3). With async scheduling the previous step is still in flight when the next one is prepared. If the input ids are written on the device, as MRV2's GPU-side input preparation does (vllm M5), the stream's order makes each token ready before the forward reads it. If the CPU writes them from the host, it reads tokens that are not sampled yet, and the step raises a violation. Graded levels count violations (ASSESSMENT §4.3).
7. **CUDA graphs, full replay only.** With graphs on, a step's token count is padded up to the smallest captured size at least that large. vLLM's default list is `[1, 2, 4]`, then 8 to 248 in steps of 8, then 256 up to the maximum in steps of 16, and the maximum is capped at 512, or 1,024 on data-centre Blackwell, when unset [measured at v0.33.0, read 2026-11-03: vllm G2]. On a hit, which is any step whose padded token count was captured, whether it only decodes or mixes in a prefill chunk, the launch costs one graph replay and the padded tokens are computed and wasted. Above the largest captured size, or with graphs off, the step launches one kernel at a time: kernels per layer, times layers, times the launch cost. The five modes vLLM has (vllm G1) are NONE and FULL here, and the other three arrive with W1-T12.
8. **The GPU price of a step** comes from a cost card, applied to the padded batch. One card is kernelspace's S5 step card on one of its fitted rows, "70B on H100" and its siblings (kernelspace `docs/specs/s5.md` §3.2). The other is the front page's synthetic tick card (GAMES.md §3.1, D-048).
9. **The CPU price of a step** comes from a host card of integer µs per phase. Its values are [estimated] presets per runner until W2-T22 fits them to the owner's traces. S5 fitted a host term per running sequence, `t_seq`. The model keeps it either inside the GPU step, as S5 fitted it, or on the CPU lane (D-044, proposed), where async scheduling can hide it. Hiding it under the forward is an extrapolation beyond S5's additive fit. Either way the term replaces the host card's per-sequence schedule and sample phases, so no host work is counted twice.
10. **What a run reports.** GPU busy time; bubbles, which are GPU idle time while `cpu-main` is busy (the GPU waits on the CPU), where GPU idle time while `cpu-main` is idle too is the engine waiting for a request and is not a bubble; useful, ghost and padded tokens; and TTFT and TPOT per request. TTFT counts from the request's due time, and both are read at the moment the `sample` phase updates the request.

## Ignores

- **S5's own list** (kernelspace `docs/specs/s5.md` §3.5, read 2026-11-04 at d478f91), which the GPU lane inherits: speculative decoding and MTP; MoE routing and EP all-to-all; CUDA-graph batch buckets; tile and wave quantisation; attention-kernel path changes (sliding window, MLA); clocks and thermals; preemption cost (the box excludes it); prefix caching (the harness ran with it off); disaggregated KV transfer; multi-node; any model, precision, engine release or token budget other than the row's.
- **CUDA-graph batch buckets, in particular.** S5's fit holds no graph padding, so the model prices a padded step by giving S5's card the padded batch. That is an extrapolation beyond the fit.
- **Host variance.** Every host phase costs the same integer µs on every step, where a real CPU's phases vary from step to step with cache state, Python garbage collection, the operating system's scheduling and other processes. A run has no jitter, so its bubbles replay exactly. Synthetic traces add seeded jitter afterwards (A§5.7).
- **Kernel-level variation within a step.** A forward is one span, whatever the kernels inside it.
- **Eager launches overlapping their own forward.** The model draws the whole launch before the forward (A§5.3). A real eager launch runs kernel 1 while kernel 2 is still being launched, so on a GPU-bound step the model overstates what eager launching costs.
- **The frontend.** Tokenization, detokenization, the hop between the frontend and the engine core, HTTP and streaming. Latencies are the engine core's.
- **Not in v0.** Unless a task is named, W1-T12 builds it:
  - the KV manager (W1-T21), so there is no capacity limit, no preemption and no prefix hit;
  - the PIECEWISE, FULL_DECODE_ONLY and FULL_AND_PIECEWISE graph modes, the dispatch keys, and graph memory;
  - the structured-output mask, speculation and adapters;
  - the runner presets' effect beyond the host card, and the per-GPU engine defaults;
  - the engine core's 1 ms sleep when requests remain but none can run [measured at v0.33.0, read 2026-11-03: vllm M7], and pipeline parallelism.

## Calibrated against

- **The GPU lane, on the S5 card:** S5's three fitted rows, inside their box. On the H100 FP8 row, S5 reports a leave-one-out TPOT error of mean 5.0% and p90 11.3% over 25 configurations [measured: kernelspace `docs/physics/report.json` at d478f91, row `h100-vllm-0-10-2-fp8`, gate G1, read 2026-11-04]. The fit was adopted on 2026-10-18 without the owner's signature, and its split between terms is a fit, not a hardware fact. Outside the box, a screen says "napkin" or "estimated" (WORLD §4.2).
- **The host card:** nothing yet. Its values are [estimated] until W2-T22 fits them, and every screen that shows a host µs says "estimated".
- **The tick card:** nothing. Its tick counts are [estimated] and synthetic, and the front page says so (D-048).
- **The loop's structure and the default capture sizes:** the pinned source, read at v0.33.0 on 2026-11-03 (vllm M6, M7, M8, G2). No trace has been compared with a run yet, because the owner has not captured any. The validation panels (WORLD §4.5) arrive with W2.
- **The model's own invariants:** a golden run at the practice seed, and properties over seeded runs that `tests/sim/steploop.test.ts` checks: GPU spans never overlap, busy time stays inside the horizon, and tokens are conserved.
