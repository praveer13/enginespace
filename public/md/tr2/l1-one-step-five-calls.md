# One step, five calls: vLLM's busy loop at v0.33.0

_The step loop · lesson `tr2.l1` · review · about 35 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T0.L6`.

Knowledge components: `tr2.step-calls`, `tr2.bubble`.

kernelspace T5.L7 taught continuous batching as a scheduler's loop: pick the running set, check that the blocks hold, run one model step, sample, free what finished. That is the scheduler's view of the engine, and it is silent about time. This lesson takes the engine's view. It follows one step through the code that runs it at the pin, vLLM v0.33.0, names the calls, says which of them touch the GPU and which wait for it, and finds the place where the GPU sits idle.

kernelspace T0.L6 told you that vLLM's V0 loop spent visible milliseconds an iteration in Python, and that the V1 rewrite exists because flame graphs showed the plateau. **a Python scheduler tax** [measured] V1 set out to fix it, and its guide lists near-zero CPU overhead among its aims. **near-zero CPU overhead** [measured] The rest of this module is about what that took, and about what it left: a step still has a CPU part, and the GPU still waits for it unless something hides it.

## One thread, one loop

The engine core is a process whose main thread runs a busy loop. Each turn it polls its input queue until there is work, runs one engine step, and goes round again. **poll the input queue, then step** [measured] Requests reach it on a thread-safe `input_queue` and leave on an `output_queue`. **input_queue, output_queue** [measured] When a step ran no model but requests remain, as when they wait for remote KV, the loop sleeps for a moment so that background threads can progress. **0.001 s** [measured]

Between a request's arrival and its token's departure the engine core schedules, calls into the model runner and updates the requests, and all three happen in the turns of that one loop. That is the CPU part of a step. On one GPU it is one thread's work, because the executor that serves a single GPU runs the model runner in the thread that calls it. **uni** [measured] **the calling thread** [measured] Hold the picture: a thread whose work comes before every forward and after it, and a GPU that cannot start the next forward until that thread has launched it.

## Five calls and a wait

`EngineCore.step` is short enough to read whole. At the pin it makes five calls, and the wait for the GPU is inside the fourth. **schedule, launch, mask, wait, sample, update** [measured]

1. `scheduler.schedule()` chooses which requests run and how many tokens each gets, out of one token budget. The next lesson takes it apart. It is CPU work and it waits for nothing.
2. `model_executor.execute_model(scheduler_output, non_block=True)` runs the first half of the step in the model runner. The runner brings its request state up to date, prepares the step's inputs and launches the forward, and the call returns a future as soon as the launch is queued, without waiting for the GPU. **state first, then the inputs** [measured] The forward then runs on the GPU, and the engine core's thread is free again while it does.
3. `scheduler.get_grammar_bitmask(scheduler_output)` builds the structured-output mask on the CPU, while the forward is running. For a step with no grammar there is nothing to build. **computed while the forward runs** [measured]
4. `future.result()` hands back what `execute_model` returned, and in MRV2 that is no output yet: the runner has launched the forward and kept its state for a second call, so `step` goes on to `model_executor.sample_tokens(grammar_output)`. **execute_model, then sample_tokens** [measured] **sample_tokens when the result is empty** [measured] That call applies the mask, samples the next token of every request and copies the ids to the host, and the engine core does not go on until the copy has landed. **get_output() before it returns** [measured] **copy_event.synchronize()** [measured] The copy waits for the forward on the GPU's own streams, so it cannot land before the forward has ended, and that is the wait for the forward. **a copy stream that waits for the main stream** [measured]
5. `scheduler.update_from_output(...)` appends the new tokens to their requests, checks for stops, frees what finished and builds the outputs. Aborts that arrived during the forward are taken just before it. **aborts_queue** [measured]

Read as a rhythm, the CPU makes its calls, the GPU runs one forward, and the CPU reads the result and makes its calls again.

| Call | Where the work happens | What it waits for |
|---|---|---|
| `schedule` | the CPU | nothing |
| `execute_model` | the CPU brings the state up to date, prepares and launches; the GPU then runs the forward | nothing: the call returns once the launch is queued |
| `get_grammar_bitmask` | the CPU | nothing: it runs while the forward does |
| `future.result`, then `sample_tokens` | the CPU applies the mask and launches the sampling; the GPU samples and copies the ids to the host | the copy of the ids, which is the forward |
| `update_from_output` | the CPU | the sampled ids |

## The model's six phases

The course's model of this step, in `packages/sim/steploop`, has six phases on two lanes. On the CPU lane it runs `schedule`, then `prepare` and `launch`; on the GPU lane `forward` starts when the launch has ended and the stream is free; back on the CPU lane `sync` returns the sampled ids to the host and `sample` updates the requests from them. The model's `prepare` and `launch` are the work that `execute_model` does before the forward begins, `sync` is the wait for the sampled ids, with their copy, and `sample` is what the engine does with them, the update. It is a model: the notional-machine card at the end of the lesson says what it leaves out, and the real engine is the judge.

![Two engine steps on a CPU lane and a GPU lane, with an open gap on the GPU lane between the forwards](../../figures/tr2/l1-one-step.svg)

_The CPU lane has two runs of boxes, one for each step, each run made of schedule, prepare, launch, sync and sample in that order. The GPU lane has one box for each step, the forward, which starts when the launch ends. Between the first forward and the second the GPU lane is empty, drawn as a dashed box, for as long as the CPU lane is busy with the sync, the sample and the next step's schedule, prepare and launch._

The figure draws two steps of the small model with nothing overlapped, to scale, from the sim. Between two forwards the GPU lane is empty for exactly as long as the CPU lane is busy. That empty stretch is the lesson's subject, and it needs a name.

## The gap, and its name

When the next step cannot start until this one has been read, every microsecond of the CPU's work is a microsecond in which the GPU waits. The model calls such a stretch a **bubble**, and it counts one only when the CPU lane is busy while the GPU lane is not. A gap in which both are idle is an engine waiting for a request, which is a different thing, and the model does not call it a bubble.

> **Idle is not the same as waiting.** A GPU that is idle because there is nothing to run and a GPU that is idle because the CPU has not finished the next call look the same on a lane. The first is a quiet server. The second is the bubble, and only the second is the engine's to fix. Check what the CPU lane is doing before you call a gap a bubble.

Commit to a number before you look at the model's. The numbers in this question are round and made up.

> **Predict `tr2.l1.p1`.** A step's CPU work is 700 µs [estimated] before its forward (schedule, prepare and launch) and 300 µs [estimated] after it (sync and sample). The forward takes 2,000 µs [estimated]. Nothing overlaps: each step starts when the last one has been read. For what share of the clock is the GPU busy, in per cent?
>
> The learner commits to a number in `percent`, graded within a relative tolerance of `0.05` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

The front page's run, First service, has the same rule in a world of synthetic ticks. A step plans for 2 ticks, cooks for 4 and reads for 1 [estimated], so without overlap it takes 7 ticks [derived] and the line is busy for 4 of them. **7 ticks** [derived] The game is Service (`loop`), and it dresses the loop as a line kitchen: a step is a **fire**, the CPU's work is the **expo** writing the next call and reading the last fire back, the GPU is the **line**, and a bubble is the line standing dark while the expo writes. The engine words come first everywhere else on the page. Play the third beat, `first-3-gap`, and count the dark stretches on the tape.

> **Play.** The game `loop`, level `first-3-gap`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## The same rule on two real-sized cards

The full service runs the step loop in microseconds on two cost cards. `70B on H100` takes its forward from kernelspace's S5 fit, with S5's host term on the CPU lane (D-044), and the small model is a napkin on a `24 GB` card, synthetic. The table is one steady step of the `async` level's practice night, with the rail full and every row a decode, served with the next call written after the fire. Read on 2026-11-08 at `b5fb81a`.

| The step's phase | 70B on H100, µs [measured] | Small model, µs [measured] |
|---|---|---|
| `schedule` | 883 | 510 |
| `prepare` | 24 | 24 |
| `launch` | 30 | 30 |
| `sync` | 20 | 20 |
| `sample` | 0 | 180 |
| The CPU's work, added up | 957 | 764 |
| The forward | 11,920 | 1,225 |
| The GPU's idle time before the step | 957 | 764 |

The host phases are the model's [estimated] presets. The `schedule` row of the `70B on H100` card is the host card's base phase and S5's host term for each of the twelve rows, which is **61.1 us** [measured] per running sequence per step, so the card has no `sample` row of its own. On the small card the host card prices the per-sequence work itself, in the `sample` row.

Two things stand out. The GPU's idle time before a step is its CPU's work, row for row: 957 µs and 764 µs [measured]. That is the arithmetic of your prediction, on bigger numbers. And the same CPU part is a very different bubble. The big model's forward is long, so its GPU is busy for 92.6% [derived] of the clock even with nothing overlapped. The small model's forward is barely longer than the CPU's work, so its GPU is busy for 61.6% [derived]. This is why "host overhead" is a small model's complaint, and a small batch's: the CPU part does not shrink with the model, and the forward does.

## What a profiler shows, and a number to leave alone

kernelspace T0.L6 drew a flame graph, which merges stacks and throws the order away. A bubble needs the order. In a timeline of a real engine it is a gap between two GPU kernels while the engine core's thread is busy in Python, and TR3 teaches you to read one on your own GPU.

You will meet a figure for the size of the gap: about 300 µs [unverified] between steps. The course found no primary source for it, so it is a hypothesis and not a fact. TR3's lab measures the gap on your GPU with async scheduling on and off, and your number replaces the folklore. Until you have it, no number in this module is a claim about your GPU, and the course's own are the model's.

> **Never block the event loop.** A single-threaded server lives by one rule, that nothing on the event loop thread may block, because everything queued behind a blocked call waits. The engine core is that thread, and its blocking call is the wait on the GPU. Calling `execute_model` without blocking is the same discipline, and it is what lets the thread do the next piece of work while the forward runs.
>
> Where it breaks: An event loop waits on many things at once and serves whichever is ready. This loop has one thing to wait for, the GPU, and the same step comes round every time, so the cure is not a better wait but a different order of the work. The next lesson plans the next step before this one has been read.

> **Card.** The notional-machine card `trace-room-steploop`.

## What to carry

- A step is five calls and a wait on one thread: `schedule`, a non-blocking `execute_model`, `get_grammar_bitmask`, the wait with `sample_tokens`, and `update_from_output`.
- The GPU works only while the forward runs. With nothing overlapped, all the rest of the step is CPU work, and all of it is gap.
- The gap per step is the CPU's work. Its share of the clock depends on the length of the forward, so it bites small models and small batches hardest.

## Exit check

This lesson tests two skills: naming the calls of one step in order and saying which lane runs each (`tr2.step-calls`), and saying why the GPU idles between steps (`tr2.bubble`). The exit ticket is three items on fresh seeds, each a step of calls or a step with its times, asking for the order of the calls, the lane that runs one, or the idle time before a step. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2).

> **Practice.** Items from the generator family `tr2.step-order`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `loop.kernelspace.scheduler-tax`: kernelspace's T0.L6 names the Python scheduler tax: vLLM's V0 loop spent visible milliseconds per iteration in Python bookkeeping, and the V1 rewrite exists because flame graphs showed that plateau. Value a Python scheduler tax [measured], checked 2026-11-05 (source: kernelspace public/lessons-md/t0.l6.md, T0.L6, Reading a Flame Graph (and Making One), the cast of profiles (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/lessons-md/t0.l6.md#L81>, read 2026-11-05).
- `loop.s5.t-seq`: kernelspace's S5 step card puts the host work of its H100 FP8 row at 61.1 microseconds per running sequence per step, a fit under S5's additive form to vLLM 0.10.2 runs, and not a hardware fact. Value 61.1 us [measured], checked 2026-11-05 (source: kernelspace docs/physics/report.json, the claimValues of the fit (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/docs/physics/report.json#L2972>, read 2026-11-05).
- `loop.world.step-ticks-serial`: Without overlap, a step in the front page's world takes 7 ticks, which is its plan, its fire and its read added up, and the line is busy for 4 of them. Value 7 ticks [derived], checked 2026-11-04 (derived as loop.world.plan-ticks + loop.world.forward-ticks + loop.world.read-ticks).
- `vllm.async-output.copy-stream`: Model Runner V2 copies the sampled ids to host memory on a separate copy stream, after that stream has waited for the main stream, so that the ids are complete. Value a copy stream that waits for the main stream [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L137-L141>, read 2026-11-04).
- `vllm.async-output.event-sync`: AsyncOutput.get_output waits on the copy's event with copy_event.synchronize() before it reads the sampled ids, so the host blocks there until the copy has landed. Value copy_event.synchronize() [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.get_output <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L174-L176>, read 2026-11-04).
- `vllm.engine-core.aborts`: Aborts arrive on their own queue, aborts_queue, and EngineCore.step drains it after the forward returns and before it updates the scheduler from the output. Value aborts_queue [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L688-L690>, read 2026-11-04).
- `vllm.engine-core.busy-loop`: The engine core's busy loop at v0.33.0 polls the input queue until there is work, runs one engine step, and goes round again. Value poll the input queue, then step [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.run_busy_loop <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1621-L1632>, read 2026-11-04).
- `vllm.engine-core.queues`: At v0.33.0 the engine core process keeps a thread-safe input_queue of client requests and an output_queue of engine outputs. Value input_queue, output_queue [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1184-L1185>, read 2026-11-04).
- `vllm.executor.uni-blocking-output`: In a blocking call, when the runner returns an async output, the single-process executor calls get_output() on it before it returns, so the call does not return until get_output() has. Value get_output() before it returns [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/executor/uniproc_executor.py, UniProcExecutor.collective_rpc (a blocking call) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/uniproc_executor.py#L102-L106>, read 2026-11-05).
- `vllm.executor.uni-default`: With one GPU the distributed executor backend defaults to uni, the single-process executor. Value uni [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/config/parallel.py, ParallelConfig (the default executor backend) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/parallel.py#L1098-L1099>, read 2026-11-05).
- `vllm.executor.uni-inline`: The single-process executor runs a call into the worker, execute_model among them, in the thread that makes the call. A non-blocking call returns a future for the output once the work has been launched, and does not wait for the GPU to finish it. Value the calling thread [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/executor/uniproc_executor.py, UniProcExecutor.collective_rpc (a non-blocking call) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/uniproc_executor.py#L108-L111>, read 2026-11-05).
- `vllm.mask.overlap`: In EngineCore.step the CPU builds the grammar bitmask after execute_model has launched the forward without blocking, so the mask is computed while the GPU runs. sample_tokens then applies it. Value computed while the forward runs [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L678-L686>, read 2026-11-04).
- `vllm.step.execute-model-state`: MRV2's execute_model first brings the request states up to date, by finishing and freeing requests, adding new ones and updating the others, and applies the staged block-table writes. It then prepares all the inputs and copies them to the input buffers, before it runs the model. Value state first, then the inputs [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/model_runner.py, GPUModelRunner.execute_model (the first half of a step) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L1775-L1866>, read 2026-11-05).
- `vllm.step.idle-sleep`: When a step ran no model but the scheduler still holds requests, as when requests wait for remote KV or for a delayed free, the engine core loop sleeps 0.001 s to let background threads progress. Value 0.001 s [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, _process_engine_step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1690-L1694>, read 2026-11-04).
- `vllm.step.order`: At v0.33.0 EngineCore.step schedules, launches execute_model without blocking, builds the grammar bitmask on the CPU while the forward runs, waits on the future, samples with the bitmask, and updates the scheduler from the output. Value schedule, launch, mask, wait, sample, update [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L677-L691>, read 2026-11-04).
- `vllm.step.sample-if-none`: EngineCore.step calls sample_tokens with the grammar output only when the result of the future is None, so when the runner leaves the sampling for a second call, the output of the step comes from that call. Value sample_tokens when the result is empty [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step (the result of the future) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L684-L686>, read 2026-11-05).
- `vllm.step.two-phase`: MRV2's model runner keeps the state of execute_model for the sample_tokens call that follows it, so one step is two calls into the runner. Value execute_model, then sample_tokens [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/model_runner.py, GPUModelRunner (execute_model_state) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L360>, read 2026-11-05).
- `vllm.v1.cpu-overhead-goal`: vLLM's V1 guide lists, among what V1 aims to do, high performance with near-zero CPU overhead. Value near-zero CPU overhead [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/usage/v1_guide.md, V1's aims <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/usage/v1_guide.md#L20>, read 2026-11-05).
