# The MRV2 delta: persistent state, GPU-side input prep, and why MRV1 still ships

_The step loop · lesson `tr2.l4` · review · about 34 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T0.L6`.

Knowledge components: `tr2.mrv2-delta`.

Two defaults of vLLM changed within a year, and they are connected. Async scheduling became the default in v0.14.0, on 2026-01-20. **v0.14.0** [measured] The model runner itself became a new one in v0.29.0, on 2026-09-09: Model Runner V2, MRV2, is the default for all models. **v0.29.0** [measured] The last lesson showed what async scheduling asks of a runner, which is a step prepared without a value that does not exist yet. The design document of MRV2 says plainly where the old runner stood: V1 was not designed with async scheduling in mind, and its support needed retrofitted behavior and hacks. **async scheduling was retrofitted onto V1** [measured] MRV2 is the same runner written again with async scheduling as its premise.

This lesson is the delta between the two: what MRV2 changes about a step, which phase of the step each change shortens, where that shows up in time per token, and why the old runner is still in the tree.

## What a model runner is

The engine core decides what runs, and the model runner does it. When requests are scheduled for a step, the runner has to construct the input tensors that the model reads, such as block tables and per-request temperature values, and building them from scratch every step is slow in Python, which is why V1 introduced persistent batches, state that the runner keeps from one step to the next. **contiguous input tensors for each step** [measured] It runs the model and the sampler, and hands the tokens back. The second call of a step, `execute_model`, is its door, and in MRV2 the work after the forward is a second call, `sample_tokens`, that picks up the state `execute_model` left. **execute_model, then sample_tokens** [measured]

There are two of them in the tree at the pin. MRV1, the older, is the class `GPUModelRunner` in `vllm/v1/worker/gpu_model_runner.py`, and is still there. **present** [measured] MRV2 lives under `vllm/v1/worker/gpu/`, and its model runner is `vllm/v1/worker/gpu/model_runner.py`. Inside vLLM, the post you read in TR1, lists async scheduling under Experimental, **Experimental** [measured] and it was written at a commit from before async scheduling became the default. That statement is history at the pin.

## Six changes

The design document is short, and worth reading whole: [`docs/design/model_runner_v2.md` at v0.33.0](https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md). It says what the old runner got wrong and what the new one does. On state, the old runner used its persistent tensors directly as the model's and the sampler's inputs, so a request that joined or finished often meant reordering a whole tensor. **persistent state used as inputs** [measured] The table lists what MRV2 does instead, and the phase of the course's model that each change should shorten, which is the model's mapping and not the document's.

| Change | What MRV2 does | The model's phase it shortens |
|---|---|---|
| State and inputs | The state keeps a fixed row for each request, `max_num_reqs` of them, and each step gathers its inputs from the state in that step's order. **persistent state apart from per-step inputs** [measured] **1024 rows** [measured] | `prepare` |
| Block tables | The table stays on the GPU. The differences are staged on the CPU, packed, copied and applied by one kernel, so there is no full copy at every step. **StagedWriteTensor** [measured] | `prepare` |
| Inputs | `input_ids`, positions and sequence lengths are built by Triton kernels on the GPU. **Triton kernels** [measured] | `prepare` |
| Waiting | The loop is a CUDA stream with no CPU synchronization points, and the CPU only queues work onto it. **a stream with no CPU synchronization points** [measured] | `sync` |
| Sampling | Mostly Triton, with a Gumbel kernel that never materializes the softmax. **sampling in Triton** [measured] | `sample` |
| Graphs | An explicit `CUDAGraphManager` captures and launches the graphs, where the old runner's handling was implicit. **CUDAGraphManager** [measured] | `launch`, and the lessons that follow |

Two things are worth taking from the table. The changes are about where bookkeeping lives: persistent state and its gather, the block-table writes, the input tensors and the sampling all moved from the CPU's Python to kernels on the GPU. And they pay by taking CPU work out of the step, so they pay in the phases you already know, and only where those phases are the bottleneck. The rest of the lesson is about that second half.

## Predict, then play

The model has presets for the two runners. Both are the model's own [estimated] orders of magnitude, not fitted to any trace: that fit waits for the owner's traces, in W2. Commit to a number before you play.

> **Predict `tr2.l4.p1`.** A decode step of 12 rows [estimated]. On the V1 runner it spends 8 µs [estimated] on each token to prepare its inputs, 60 µs [estimated] on the sync, and 31 µs [estimated] on each row to sample. On MRV2 the same three cost 2 µs, 20 µs and 15 µs [estimated]. How many µs of the CPU's work per step does MRV2 take off?
>
> The learner commits to a number in `us`, graded within a relative tolerance of `0.05` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Open the `mrv2` level, "The V2 runner". It has two stages, the small model first and then `70B on H100`, and `[` and `]` move between them. Each opens on the legacy runner. Commit its prediction, which asks how many µs of each course the V2 runner saves in the median time per output token, serve the night on each runner, and read the tape.

> **Play.** The game `loop`, level `mrv2`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

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

A runner that takes 304 µs [derived] out of every step shows all of it when the forward is shorter than MRV2's CPU work, part of it when the forward sits between the two runners' CPU work, and none when the forward is longer than both. The vLLM team knew this when it chose the setup for its headline number. It ran a very small model, Qwen3-0.6B, on one GB200 on purpose, so that host-side overhead would be proportionally large, and reports a throughput gain of 56% [unverified] for MRV2 over MRV1 in that setup. **a very small model on a powerful GPU** [measured] **56 %** [unverified] It reports another gain, 6.3% [unverified] lower time per output token, for speculative decoding on four GPUs, which it ascribes to the design with no synchronization points. **6.3 %** [unverified] Both figures are the team's own, taken when the post was written, on hardware you may not have, and the course has not reproduced them. Read them as a regime: the gain is large where the forward is short and the host is the bottleneck, and small where it is not.

> **A table and a query.** MRV2's state is a table with a fixed number of rows, and a request keeps its row for as long as it lives. Each step runs a query on it, in the order the attention backend wants, and the result is the step's input. Nothing in the table moves when a request joins or leaves, and the query does the reordering.
>
> Where it breaks: A query result is a copy that the database makes for you. Here the gather is a kernel that runs on the GPU in every step, so the table stays out of reach of the CPU, and a preempted request is treated as a finished one, with its row given up and its state added afresh when it returns.

## Why MRV1 still ships

MRV2 is the default, and it is not the only runner. Two features need it and are checked first: HiSparse attention, which makes a zero in `VLLM_USE_V2_MODEL_RUNNER` an error, and watermarking, which overrides the zero. Otherwise, when `VLLM_USE_V2_MODEL_RUNNER` is set, in either direction, its value decides, and the checks below are skipped. Unset, the engine uses MRV2 unless Triton is missing or the configuration uses a feature MRV2 does not support, and then it warns once and uses V1. **the variable decides when it is set** [measured] **on, unless Triton or a feature blocks it** [measured] The line for an unsupported feature begins `Model Runner V2 does not yet support`, lists the reasons, and ends `using the V1 model runner instead`, so it is the line to search a log for. At the pin five things send a configuration back: pipeline parallelism with the `external_launcher` backend, the speculative methods `suffix` and `custom_class`, parallel drafting for EAGLE, draft models with their own vocabulary, and the features that dual-batch overlap lacks. **5 reasons** [measured]

The release notes of v0.29.0 called MRV1 deprecated and aimed at removing it in v0.32. **deprecated** [measured] It was not removed, and it is the runner that the engine falls back to, so a configuration with one of the five reasons runs on a runner that is deprecated and still in the tree. The design document that ships with v0.33.0 still says MRV2 is not feature-complete. **not yet feature-complete** [measured] The post's own list of what MRV2 lacked was written at v0.18.0, and is not the pin's list. **v0.18.0** [measured]

Two consequences follow, and both are about reading. A number from a run is a number for a runner, so the grader's fingerprint of a GPU run records the runner that actually ran, MRV2 or MRV1 after a fallback warning, read from the engine's own log (ARCHITECTURE §9.5), and the first place to look is that log, for the warning line. And an account of the engine's behaviour has an age: a post, a design document and a source file can disagree, the file at the pin wins, and the course cites the file.

> **A default is not a guarantee.** Which runner serves you depends on a package that may be missing and on a feature you may have switched on, and the engine says so in one line of a log that few people read. Before you compare two runs, read the log of each and write down the runner. A comparison of the V1 runner at one version with MRV2 at another is a comparison of two things at once.

> **Card.** The notional-machine card `trace-room-steploop`.

## What the GPU will check

TR2 has no GPU stage, and TR3's lab toggles the graphs and async scheduling, not the runner. The saving above is the model's, from presets that are [estimated], and the first measurement of a real host phase is in TR3's lab, which arrives with the grader in W2 (D-039). Until then, the table of regimes is a way to reason and not a result.

## What to carry

- MRV2 is the same runner written again with async scheduling as its premise. Its state is kept apart from the step's inputs, and the inputs, the block-table writes and the sampling run as kernels on the GPU, with no CPU synchronization.
- Its changes take CPU work out of `prepare`, `sync` and `sample`. They show in the time per token only where the CPU is the longer lane, which is a small model, a small batch and a fast GPU.
- MRV2 is the default, with one warning line and five reasons to fall back, and MRV1 is deprecated and still in the tree. Read the log, and the file at the pin.

## Exit check

This lesson tests one skill: saying what the V2 model runner changes about the step, and when a configuration falls back to the older runner (`tr2.mrv2-delta`). The exit ticket is three items on fresh seeds, each a configuration or a step. One asks which runner serves it, and one which phase of the step MRV2 shortens, and one how many µs of the step it takes out. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `close` level earns the skill again.

> **Practice.** Items from the generator family `tr2.runner-fallback`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `inside-vllm.async-experimental`: The post lists async scheduling under Experimental. Value Experimental [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `vllm.async-scheduling.since`: Async scheduling became vLLM's default in v0.14.0, released on 2026-01-20. The release notes list it as a breaking change that users can undo with --no-async-scheduling. Value v0.14.0 [measured], checked 2026-11-04 (source: vLLM v0.14.0 release notes <https://github.com/vllm-project/vllm/releases/tag/v0.14.0>, read 2026-11-04).
- `vllm.mrv1.deprecated`: With v0.29.0 the project called MRV1 deprecated and aimed to remove it in v0.32, and said it would take no more MRV1-specific optimizations. Value deprecated [measured], checked 2026-11-04 (source: vLLM v0.29.0 release notes (Model Runner V1 Deprecation) <https://github.com/vllm-project/vllm/releases/tag/v0.29.0>, read 2026-11-04).
- `vllm.mrv1.still-ships`: At v0.33.0 the MRV1 runner, class GPUModelRunner in vllm/v1/worker/gpu_model_runner.py, is still part of vLLM and is the runner that the engine falls back to, so the v0.32 removal target of the v0.29.0 notes slipped. Value present [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu_model_runner.py <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu_model_runner.py#L475>, read 2026-11-04).
- `vllm.mrv2.async-retrofit`: The MRV2 design document says that V1 was not designed with async scheduling in mind, and that its support needed retrofitted behavior and hacks. Value async scheduling was retrofitted onto V1 [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Async-First <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L47>, read 2026-11-05).
- `vllm.mrv2.blog-gain`: In that setup the post reports a throughput increase of 56% for MRV2 over MRV1, from moving input preparation to the GPU. It is the vLLM team's own measurement on a GB200 and has not been checked here. Value 56 % [unverified], checked 2026-11-05 (source: vLLM blog, Model Runner V2: A Modular and Faster Core for vLLM (2026-03-24), Performance <https://vllm.ai/blog/2026-03-24-mrv2>, read 2026-11-05).
- `vllm.mrv2.blog-limits`: The post lists what MRV2 did not support as of v0.18.0: linear attention models, speculative methods other than Eagle, Eagle3 and MTP, EPLB and DBO, logits processors and LoRA. The pinned source has a different list. Value v0.18.0 [measured], checked 2026-11-05 (source: vLLM blog, Model Runner V2: A Modular and Faster Core for vLLM (2026-03-24), Limitations and Current Status <https://vllm.ai/blog/2026-03-24-mrv2>, read 2026-11-05).
- `vllm.mrv2.blog-regime`: The vLLM team's post on Model Runner V2 ran a very small model, Qwen3-0.6B, on one GB200 on purpose, so that host-side overhead would be proportionally large. Value a very small model on a powerful GPU [measured], checked 2026-11-05 (source: vLLM blog, Model Runner V2: A Modular and Faster Core for vLLM (2026-03-24), Performance <https://vllm.ai/blog/2026-03-24-mrv2>, read 2026-11-05).
- `vllm.mrv2.blog-spec-tpot`: The post also reports a mean time per output token 6.3% lower for MRV2 than for MRV1 on four GB200 with GLM-4.7-FP8 and MTP=1, which it ascribes to MRV2's zero-synchronization design. The figure is the team's own and has not been checked here. Value 6.3 % [unverified], checked 2026-11-05 (source: vLLM blog, Model Runner V2: A Modular and Faster Core for vLLM (2026-03-24), Performance <https://vllm.ai/blog/2026-03-24-mrv2>, read 2026-11-05).
- `vllm.mrv2.cuda-graph-manager`: MRV2 owns an explicit CUDAGraphManager that captures and launches full CUDA graphs through standard PyTorch APIs, where V1's graph handling was implicit. Value CUDAGraphManager [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Explicit CUDA Graph Management <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L188-L190>, read 2026-11-05).
- `vllm.mrv2.decoupled-state`: MRV2 keeps its persistent state tensors apart from the per-step input tensors, and gathers each step's inputs from the state in the request order of the step. Value persistent state apart from per-step inputs [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Persistent Batch (MRV2's solution) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L33>, read 2026-11-05).
- `vllm.mrv2.default-rule`: At v0.33.0 the engine uses MRV2 unless VLLM_USE_V2_MODEL_RUNNER is set to 0, Triton is missing, or the configuration uses a feature MRV2 does not yet support. In the last two cases it falls back to MRV1 and logs one warning. Value on, unless Triton or a feature blocks it [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, use_v2_model_runner <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L748-L767>, read 2026-11-04).
- `vllm.mrv2.default-since`: Model Runner V2 became vLLM's default runner for all models in v0.29.0, released on 2026-09-09. A pooling-model rollout came first. Value v0.29.0 [measured], checked 2026-11-04 (source: vLLM v0.29.0 release notes <https://github.com/vllm-project/vllm/releases/tag/v0.29.0>, read 2026-11-04).
- `vllm.mrv2.env-decides`: Two features need MRV2 and are checked first: HiSparse attention, which makes VLLM_USE_V2_MODEL_RUNNER=0 an error, and watermarking, which overrides it. Otherwise, when VLLM_USE_V2_MODEL_RUNNER is set, in either direction, its value decides the runner and the checks for Triton and for unsupported features are skipped. Unset, MRV2 is used unless Triton is missing or the configuration uses a feature MRV2 does not support, and then the engine warns and uses V1. Value the variable decides when it is set [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/config/vllm.py, VllmConfig.use_v2_model_runner <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L731-L766>, read 2026-11-05).
- `vllm.mrv2.fallback-reasons`: At v0.33.0 five things send a configuration back to MRV1. They are pipeline parallelism with the external_launcher backend; the speculative methods suffix and custom_class; parallel drafting for EAGLE; draft models with their own vocabulary; and the features dual-batch overlap lacks. Value 5 reasons [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, _get_v2_model_runner_unsupported_features <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L3053-L3087>, read 2026-11-04).
- `vllm.mrv2.gpu-input-prep`: MRV2 prepares input_ids, positions, query_start_loc and seq_lens with Triton kernels on the GPU, so a value that the CPU does not know yet can still be derived there. Value Triton kernels [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/model_runner_v2.md (GPU-native input preparation) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L134>, read 2026-11-04).
- `vllm.mrv2.input-tensors`: The MRV2 design document says that V1 introduced persistent batches to minimize CPU overhead during input preparation, because when requests are scheduled for a step the model runner must construct contiguous input tensors, such as block tables and per-request temperature values, to feed into the model, and building them from scratch each step is often very slow in Python. Value contiguous input tensors for each step [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Persistent Batch (background) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L17>, read 2026-11-05).
- `vllm.mrv2.no-cpu-sync`: MRV2 assumes that the core model execution loop is a CUDA stream with no CPU synchronization points, and that the CPU entry points only queue work onto the stream. Value a stream with no CPU synchronization points [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Async-First <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L47>, read 2026-11-05).
- `vllm.mrv2.not-complete`: The MRV2 design document, which ships with v0.33.0, still says that MRV2 is not yet feature-complete, not rigorously tested and has open design decisions. Value not yet feature-complete [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Introduction <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L7>, read 2026-11-05).
- `vllm.mrv2.persistent-rows`: MRV2 pre-allocates one fixed table with max_num_reqs rows, 1,024 by default on most platforms. A request keeps its row until it finishes or is preempted, and a preemption counts as a completion. Value 1024 rows [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/model_runner_v2.md (Persistent batch) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L35-L37>, read 2026-11-04).
- `vllm.mrv2.staged-write`: For large tensors such as block tables, MRV2 avoids a full CPU-to-GPU copy at every step. It keeps the tensor on the GPU, stages the differences on the CPU, packs and copies them, and launches one kernel to apply them. Value StagedWriteTensor [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, StagedWriteTensor <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L106-L112>, read 2026-11-05).
- `vllm.mrv2.triton-sampler`: MRV2 reimplements sampling mostly in Triton, with a Gumbel sampling kernel that avoids materializing the softmax. Value sampling in Triton [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Triton-Native Sampler <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L147-L151>, read 2026-11-05).
- `vllm.mrv2.v1-coupling`: The MRV2 design document says that V1 uses its persistent state tensors directly as model and sampler inputs, which imposes strict layout and ordering requirements, so a request that joins or finishes often means a reordering of the whole tensor. Value persistent state used as inputs [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/model_runner_v2.md, Persistent Batch (problems with V1) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L23>, read 2026-11-05).
- `vllm.step.two-phase`: MRV2's model runner keeps the state of execute_model for the sample_tokens call that follows it, so one step is two calls into the runner. Value execute_model, then sample_tokens [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/model_runner.py, GPUModelRunner (execute_model_state) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L360>, read 2026-11-05).
