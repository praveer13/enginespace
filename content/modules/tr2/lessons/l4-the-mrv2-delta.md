---
id: tr2.l4
module: tr2
title: "The MRV2 delta: persistent state, GPU-side input prep, and why MRV1 still ships"
minutes: 34                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.mrv2-delta]
builds_on: [ks:T5.L7, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

Two defaults of vLLM changed within a year, and they are connected. Async scheduling became the default in v0.14.0, on 2026-01-20. {{claim:vllm.async-scheduling.since}} The model runner itself became a new one in v0.29.0, on 2026-09-09: Model Runner V2, MRV2, is the default for all models. {{claim:vllm.mrv2.default-since}} The last lesson showed what async scheduling asks of a runner, which is a step prepared without a value that does not exist yet. The design document of MRV2 says plainly where the old runner stood: V1 was not designed with async scheduling in mind, and its support needed retrofitted behavior and hacks. {{claim:vllm.mrv2.async-retrofit}} MRV2 is the same runner written again with async scheduling as its premise.

This lesson is the delta between the two: what MRV2 changes about a step, which phase of the step each change shortens, where that shows up in time per token, and why the old runner is still in the tree.

## What a model runner is

The engine core decides what runs, and the model runner does it. When requests are scheduled for a step, the runner has to construct the input tensors that the model reads, such as block tables and per-request temperature values, and building them from scratch every step is slow in Python, which is why V1 introduced persistent batches, state that the runner keeps from one step to the next. {{claim:vllm.mrv2.input-tensors}} It runs the model and the sampler, and hands the tokens back. The second call of a step, `execute_model`, is its door, and in MRV2 the work after the forward is a second call, `sample_tokens`, that picks up the state `execute_model` left. {{claim:vllm.step.two-phase}}

There are two of them in the tree at the pin. MRV1, the older, is the class `GPUModelRunner` in `vllm/v1/worker/gpu_model_runner.py`, and is still there. {{claim:vllm.mrv1.still-ships}} MRV2 lives under `vllm/v1/worker/gpu/`, and its model runner is `vllm/v1/worker/gpu/model_runner.py`. Inside vLLM, the post you read in TR1, lists async scheduling under Experimental, {{claim:inside-vllm.async-experimental}} and it was written at a commit from before async scheduling became the default. That statement is history at the pin.

## Six changes

The design document is short, and worth reading whole: [`docs/design/model_runner_v2.md` at v0.33.0](https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md). It says what the old runner got wrong and what the new one does. On state, the old runner used its persistent tensors directly as the model's and the sampler's inputs, so a request that joined or finished often meant reordering a whole tensor. {{claim:vllm.mrv2.v1-coupling}} The table lists what MRV2 does instead, and the phase of the course's model that each change should shorten, which is the model's mapping and not the document's.

| Change | What MRV2 does | The model's phase it shortens |
|---|---|---|
| State and inputs | The state keeps a fixed row for each request, `max_num_reqs` of them, and each step gathers its inputs from the state in that step's order. {{claim:vllm.mrv2.decoupled-state}} {{claim:vllm.mrv2.persistent-rows}} | `prepare` |
| Block tables | The table stays on the GPU. The differences are staged on the CPU, packed, copied and applied by one kernel, so there is no full copy at every step. {{claim:vllm.mrv2.staged-write}} | `prepare` |
| Inputs | `input_ids`, positions and sequence lengths are built by Triton kernels on the GPU. {{claim:vllm.mrv2.gpu-input-prep}} | `prepare` |
| Waiting | The loop is a CUDA stream with no CPU synchronization points, and the CPU only queues work onto it. {{claim:vllm.mrv2.no-cpu-sync}} | `sync` |
| Sampling | Mostly Triton, with a Gumbel kernel that never materializes the softmax. {{claim:vllm.mrv2.triton-sampler}} | `sample` |
| Graphs | An explicit `CUDAGraphManager` captures and launches the graphs, where the old runner's handling was implicit. {{claim:vllm.mrv2.cuda-graph-manager}} | `launch`, and the lessons that follow |

Two things are worth taking from the table. The changes are about where bookkeeping lives: persistent state and its gather, the block-table writes, the input tensors and the sampling all moved from the CPU's Python to kernels on the GPU. And they pay by taking CPU work out of the step, so they pay in the phases you already know, and only where those phases are the bottleneck. The rest of the lesson is about that second half.

## Predict, then play

The model has presets for the two runners. Both are the model's own [estimated] orders of magnitude, not fitted to any trace: that fit waits for the owner's traces, in W2. Commit to a number before you play.

:::predict
id: tr2.l4.p1
prompt: "A decode step of 12 rows [estimated]. On the V1 runner it spends 8 µs [estimated] on each token to prepare its inputs, 60 µs [estimated] on the sync, and 31 µs [estimated] on each row to sample. On MRV2 the same three cost 2 µs, 20 µs and 15 µs [estimated]. How many µs of the CPU's work per step does MRV2 take off?"
answer: { kind: numeric, unit: us, rel_tol: 0.05 }
reveal: after-game
kcs: [tr2.mrv2-delta]
:::

Open the `mrv2` level, "The V2 runner". It has two stages, the small model first and then `70B on H100`, and `[` and `]` move between them. Each opens on the legacy runner. Commit its prediction, which asks how many µs of each course the V2 runner saves in the median time per output token, serve the night on each runner, and read the tape.

:::game
id: loop
level: mrv2
mode: practice
:::

## Where the saving shows

Your answer to the prediction is a saving per step, and it is the sum of the three phases, 304 µs [derived]. The level's answer is a smaller number, and on one of its two cards it is zero. Read on 2026-11-08 at `b5fb81a`; the night is the `mrv2` level's, on its practice seed `0`.

| Median time per output token | On V1, µs [measured] | On MRV2, µs [measured] | MRV2 saves, µs [measured] |
|---|---|---|---|
| Small model | 1,561 | 1,493 | 68 |
| `70B on H100` | 11,982 | 11,982 | 0 |

The saving is 4.4% [derived] of the small model's token and nothing on the big model's. The reason is the third lesson's rule. With async scheduling on, which is how both stages are served, the CPU's work hides behind the forward, so a runner that does that work faster changes the time per token only where the CPU's work is the longer lane. On the big card the forward is about twelve times [derived] the CPU's work and hides all of it for either runner. On the small card the CPU is the longer lane only on the fires that admit a ticket, and that is where the 68 µs [measured] come from.

Put the same rule in a table. This is the closed form of the third lesson on the small model's host work for 12 rows, which is 1,068 µs [derived] on V1 and 764 µs [derived] on MRV2, and a forward that gets shorter and shorter.

| The forward, µs [estimated] | V1's idle time between forwards, µs [derived] | MRV2's, µs [derived] | MRV2 saves, µs [derived] |
|---|---|---|---|
| 1,225 | 0 | 0 | 0 |
| 900 | 168 | 0 | 168 |
| 600 | 468 | 164 | 304 |
| 300 | 768 | 464 | 304 |

A runner that takes 304 µs [derived] out of every step shows all of it when the forward is shorter than MRV2's CPU work, part of it when the forward sits between the two runners' CPU work, and none when the forward is longer than both. The vLLM team knew this when it chose the setup for its headline number. It ran a very small model, Qwen3-0.6B, on one GB200 on purpose, so that host-side overhead would be proportionally large, and reports a throughput gain of 56% [unverified] for MRV2 over MRV1 in that setup. {{claim:vllm.mrv2.blog-regime}} {{claim:vllm.mrv2.blog-gain}} It reports another gain, 6.3% [unverified] lower time per output token, for speculative decoding on four GPUs, which it ascribes to the design with no synchronization points. {{claim:vllm.mrv2.blog-spec-tpot}} Both figures are the team's own, taken when the post was written, on hardware you may not have, and the course has not reproduced them. Read them as a regime: the gain is large where the forward is short and the host is the bottleneck, and small where it is not.

:::card
kind: isomorphism
title: A table and a query
body: MRV2's state is a table with a fixed number of rows, and a request keeps its row for as long as it lives. Each step runs a query on it, in the order the attention backend wants, and the result is the step's input. Nothing in the table moves when a request joins or leaves, and the query does the reordering.
breaks: A query result is a copy that the database makes for you. Here the gather is a kernel that runs on the GPU in every step, so the table stays out of reach of the CPU, and a preempted request is treated as a finished one, with its row given up and its state added afresh when it returns.
:::

## Why MRV1 still ships

MRV2 is the default, and it is not the only runner. Two features need it and are checked first: HiSparse attention, which makes a zero in `VLLM_USE_V2_MODEL_RUNNER` an error, and watermarking, which overrides the zero. Otherwise, when `VLLM_USE_V2_MODEL_RUNNER` is set, in either direction, its value decides, and the checks below are skipped. Unset, the engine uses MRV2 unless Triton is missing or the configuration uses a feature MRV2 does not support, and then it warns once and uses V1. {{claim:vllm.mrv2.env-decides}} {{claim:vllm.mrv2.default-rule}} The line for an unsupported feature begins `Model Runner V2 does not yet support`, lists the reasons, and ends `using the V1 model runner instead`, so it is the line to search a log for. At the pin five things send a configuration back: pipeline parallelism with the `external_launcher` backend, the speculative methods `suffix` and `custom_class`, parallel drafting for EAGLE, draft models with their own vocabulary, and the features that dual-batch overlap lacks. {{claim:vllm.mrv2.fallback-reasons}}

The release notes of v0.29.0 called MRV1 deprecated and aimed at removing it in v0.32. {{claim:vllm.mrv1.deprecated}} It was not removed, and it is the runner that the engine falls back to, so a configuration with one of the five reasons runs on a runner that is deprecated and still in the tree. The design document that ships with v0.33.0 still says MRV2 is not feature-complete. {{claim:vllm.mrv2.not-complete}} The post's own list of what MRV2 lacked was written at v0.18.0, and is not the pin's list. {{claim:vllm.mrv2.blog-limits}}

Two consequences follow, and both are about reading. A number from a run is a number for a runner, so the grader's fingerprint of a GPU run records the runner that actually ran, MRV2 or MRV1 after a fallback warning, read from the engine's own log (ARCHITECTURE §9.5), and the first place to look is that log, for the warning line. And an account of the engine's behaviour has an age: a post, a design document and a source file can disagree, the file at the pin wins, and the course cites the file.

:::card
kind: warning
title: A default is not a guarantee
body: Which runner serves you depends on a package that may be missing and on a feature you may have switched on, and the engine says so in one line of a log that few people read. Before you compare two runs, read the log of each and write down the runner. A comparison of the V1 runner at one version with MRV2 at another is a comparison of two things at once.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What the GPU will check

TR2 has no GPU stage, and TR3's lab toggles the graphs and async scheduling, not the runner. The saving above is the model's, from presets that are [estimated], and the first measurement of a real host phase is in TR3's lab, which arrives with the grader in W2 (D-039). Until then, the table of regimes is a way to reason and not a result.

## What to carry

- MRV2 is the same runner written again with async scheduling as its premise. Its state is kept apart from the step's inputs, and the inputs, the block-table writes and the sampling run as kernels on the GPU, with no CPU synchronization.
- Its changes take CPU work out of `prepare`, `sync` and `sample`. They show in the time per token only where the CPU is the longer lane, which is a small model, a small batch and a fast GPU.
- MRV2 is the default, with one warning line and five reasons to fall back, and MRV1 is deprecated and still in the tree. Read the log, and the file at the pin.

## Exit check

This lesson tests one skill: saying what the V2 model runner changes about the step, and when a configuration falls back to the older runner (`tr2.mrv2-delta`). The exit ticket is three items on fresh seeds, each a configuration or a step. One asks which runner serves it, and one which phase of the step MRV2 shortens, and one how many µs of the step it takes out. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `close` level earns the skill again.

:::item
family: tr2.runner-fallback
level: 2
count: 3
:::
