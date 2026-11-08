# Async scheduling closes the bubble, and costs a token

_The step loop · lesson `tr2.l3` · review · about 50 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T0.L6`.

Knowledge components: `tr2.bubble`, `tr2.async-overlap`.

The last lesson ended on a gap. With nothing overlapped, the GPU idles for all of the CPU's work, because the next step cannot be prepared until this one has been read. The cure is the oldest one in systems: start the next piece of work before the last one has finished. This lesson is the engine's version of it. It says what vLLM plans early, what it cannot, what that closes and what it leaves open, and what the trick costs.

## The obstacle

Step N+1 needs, for every running request, the token that step N is about to sample. The CPU cannot read it until the forward has ended and the ids have been copied back, and that read is the wait that the last lesson drew as the gap. So the engine has to prepare step N+1 without a value that it will not have until step N is over.

It does this with two moves and one concession.

**It plans with a count, not a value.** After the scheduler has scheduled a step, it adds to each decode request's `num_output_placeholders` the tokens that the step is going to sample, drafts included, and the next call to `schedule()` counts them as if they had arrived. **num_output_placeholders** [measured] When the output comes back, `update_from_output` takes them off again. **placeholders resolved by the output** [measured] The scheduler never needs the token, only that there will be one.

**It lets the GPU carry the value.** MRV2 prepares the next step's `input_ids`, positions and sequence lengths with Triton kernels on the GPU, so a value the CPU does not know yet can still be derived there. **Triton kernels** [measured] The sampled ids are copied to the host on a copy stream of their own, which first waits for the main stream, **a copy stream that waits for the main stream** [measured] and the host blocks on that copy only when it finally needs the ids to read the stops. **copy_event.synchronize()** [measured] The model checks this dependency. In the course's loop, a step that writes its input ids on the host while async scheduling is on reads a token before it is sampled, and the run reports a violation. The ids are the model's own lever and no engine flag: an engine that lacked a way to carry the value on the GPU would have to wait for it, and the wait is the gap again.

**It concedes a token.** The engine learns that a request stopped on EOS only when it reads the output of the step that carried the stop, and by then it has scheduled the next step with that request in it. That step computes one more token for the request, and the engine throws it away. It is a ghost token. A stop at the length cap leaves none, because the scheduler knows the cap and does not schedule a step that the steps in flight are sure to make unnecessary. **no extra step for a length-capped stop** [measured]

## A queue of two

With those in place the engine core can keep two steps in flight. With async scheduling it calls `step_with_batch_queue`: it schedules a new batch whenever the queue has room and returns at once, and it blocks on the oldest batch's result only when the queue is full or nothing else can be scheduled. **the batch queue first** [measured] The queue holds two batches on the V1 runner at pipeline-parallel size 1, **2 batches** [measured] and `pp_size + 1` on MRV2, which is two without pipeline parallelism [derived]. **pp_size + 1** [measured] MRV2's design document states what that is for: the scheduler and the worker prepare the inputs of step N+1 while the GPU executes step N. **step N+1 is prepared while step N runs** [measured] Read it in the code at the pin: [`EngineCore.step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708-L723).

![Three engine steps drawn twice to one scale, with async scheduling off and then on](../../figures/tr2/l3-overlap.svg)

_Two pairs of lanes, one pair for async scheduling off and one for on, with three steps in each. With it off, the GPU lane has an empty stretch, drawn dashed, between every two forwards, because the next step's schedule, prepare and launch wait for the last step to be read. With it on, the CPU lane writes each step's schedule, prepare and launch while the previous forward runs, the forwards follow one another with no stretch between them, and the three steps end sooner._

> **Double buffering.** A renderer draws frame N+1 into one buffer while the display scans out frame N from the other, and swaps them. The CPU prepares step N+1 while the GPU runs step N, and the two steps trade places. The work does not get smaller, and the two halves of it run side by side.
>
> Where it breaks: A frame does not depend on the pixels of the one before it. A decode step depends on the token the last step is sampling, so the engine has to hand the value over without a CPU in between, and has to plan with a placeholder for a token that may turn out to be the last.

## What overlap can hide

Overlap hides CPU work behind a forward, so it hides at most as much as the forward is long. With the CPU's work before and after the forward written `plan` and `read`, the step takes `plan + forward + read` without overlap, and with it the larger of `forward` and `plan + read`. The GPU's idle time between two forwards is then the CPU's work less the forward, or nothing when the forward is the longer. That is the front page's rule, which counted ticks: 7 per step [derived] without overlap, with the line busy for 4, and 4 [derived] with it, the larger of the line's 4 and the expo's 3. **4 ticks** [derived]

Commit to a number. The numbers are round and made up.

> **Predict `tr2.l3.p1`.** A step's CPU work is 1,000 µs [estimated] before the forward and 500 µs [estimated] after it, and the forward takes 1,200 µs [estimated]. Async scheduling is on. How many µs of the CPU's work stay on the critical path, as idle time between two forwards?
>
> The learner commits to a number in `us`, graded within a relative tolerance of `0.05` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Play `first-4-par`, "Your turn", which puts a burst of tickets in front of you and asks for both tools at once, refill and overlap, against par. Then open the full service's `async` level, "Write during the fire". It has two stages, one for each cost card, and `[` and `]` move between them. Each stage opens on its naive configuration, with the next call written after the fire, and asks its own prediction first. Commit it, serve the night without overlap and then with it, and read the tape.

> **Play.** The game `loop`, level `first-4-par`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Play.** The game `loop`, level `async`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## The same rule on the course's two cards

The `async` level's night is 24 tickets [estimated] on a rail of 12 clips [estimated], and its practice seed is `0`. Here are its two stages, served without overlap and with it. Read on 2026-11-08 at `b5fb81a`.

| The night | `70B on H100`, off [measured] | `70B on H100`, on [measured] | Small model, off [measured] | Small model, on [measured] |
|---|---|---|---|---|
| Clock, µs | 696,626 | 633,781 | 113,965 | 79,375 |
| Median time per output token, µs | 14,037 | 11,982 | 2,386 | 1,493 |
| The GPU's idle time while the CPU worked, µs | 86,690 | 0 | 49,076 | 11,982 |
| Fires with a dark stretch before them | 49 of 50 | 0 of 52 | 49 of 50 | 9 of 52 |
| Ghost tokens | 0 | 24 | 0 | 24 |

On the big card, overlap closes every dark stretch: the median token is 14.6% faster [derived] and the night 9.0% shorter [derived]. The forward is about twelve times [derived] the CPU's work, so there is room to hide all of it. On the small card the night is 30.4% shorter [derived] and the median token 37.4% faster [derived], and 9 of its 52 fires [measured] still have a dark stretch. Those nine are not the steady ones. All of them admit a ticket. Seven launch kernel by kernel, because no graph was captured for their size: the launch alone takes 2,016 µs [measured] against a forward of about 1,240 µs [measured]. The other two launch in pieces and fall short by about 550 µs [measured]. Overlap cannot hide a launch that is longer than the forward it launches. The next two lessons are about making that launch short.

The last row is the price. Every ticket in the model stops on EOS, so each of the 24 [measured] costs one ghost token, 24 of the 522 rows [derived] that the night computed, or 4.6% [derived]. A run whose requests all stop at their length cap has none in the real engine, as the claim above says.

## What turns it off

Async scheduling is vLLM's default since v0.14.0, and a user can undo it with `--no-async-scheduling`. **v0.14.0** [measured] Its config field is three-valued: unset until the engine resolves it, off or on. **bool | None = None** [measured] Unset resolves to on unless an option conflicts, and then to off with a warning. **on** [measured] On the V1 runner the conflicts include pipeline parallelism and the speculative methods other than a few, and an explicit request for it in that case is an error. **pipeline parallelism; some speculative methods** [measured] When a structured-output request is still waiting for the previous step's tokens, the step defers its sampling, because a grammar needs the last token to build its mask. **deferred under async scheduling** [measured] That is TR6's.

SGLang's overlap scheduler is on by default, and `--disable-overlap-schedule` turns it off. **on** [measured] It has the same shape, one batch behind: its event loop launches the current batch, queues its result, and then processes the result of the batch before. **launch batch N, then process batch N-1** [measured] It can also switch overlap off between two consecutive prefill batches, to protect the first batch's time to first token, and an environment variable decides, which is off unless you set it. **overlap off between two prefills** [measured] **false** [measured] The last lesson lines all four engines up side by side.

> **Overlap hides the CPU's work and does not remove it.** The CPU does exactly as much work as before, and the throughput of a step is now the larger of the CPU's work and the forward. A model small enough, or a batch short enough, for the CPU's work to be the larger is CPU-bound with overlap on, and the dark stretch comes back on every step. If a profile with overlap on still shows gaps, the CPU lane is the longer lane, and the cure is less CPU work per step.

> **Card.** The notional-machine card `trace-room-steploop`.

## What the GPU will check

TR2 has no GPU stage of its own. The prediction that this lesson makes about a real engine is tested in TR3's lab: its stage `s4` takes the same capture with `--no-async-scheduling`, and the prediction you commit in the browser before it is scored against the receipt's recomputed numbers. That lab arrives with the grader, in W2 (D-039). Until then nothing here is a measurement of your GPU, and the numbers above are the model's.

## What to carry

- The scheduler plans with a count of tokens that have not been sampled yet, the GPU carries their values, and the engine core keeps two steps in flight.
- Overlap hides the CPU's work behind the forward, up to the forward's length. The idle time that is left is the CPU's work less the forward.
- The cost is a ghost token for a request that stops on EOS, and a CPU-bound step stays CPU-bound.

## Exit check

This lesson tests two skills: saying why the GPU idles between engine steps when the CPU's work for the next step is not ready (`tr2.bubble`), and saying which CPU work async scheduling plans behind the running step and what it leaves on the critical path (`tr2.async-overlap`). The exit ticket is three items on fresh seeds, each a step with its times, asking for the idle time with overlap off or on, or for the smallest change that closes it. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `close` level at the end of the sixth lesson earns both skills again, with the other levers.

> **Practice.** Items from the generator family `tr2.bubble-width`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `loop.world.step-ticks-overlap`: With overlap, a step in the front page's world takes 4 ticks, the larger of the line's 4 and the expo's 3 (its plan and its read). Value 4 ticks [derived], checked 2026-11-04 (derived as max(loop.world.forward-ticks, loop.world.plan-ticks + loop.world.read-ticks)).
- `sglang.overlap.consecutive-prefill`: The scheduler can turn overlap off for two consecutive prefill batches, to improve the time to first token of the first batch. The cost is a little throughput, so the switch is an environment variable, SGLANG_DISABLE_CONSECUTIVE_PREFILL_OVERLAP. Value overlap off between two prefills [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/managers/scheduler.py, Scheduler.is_disable_overlap_for_batch <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L2136-L2156>, read 2026-11-04).
- `sglang.overlap.consecutive-prefill-default`: SGLANG_DISABLE_CONSECUTIVE_PREFILL_OVERLAP is false by default, so overlap stays on between two consecutive prefill batches unless it is set. Value false [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/environ.py, SGLANG_DISABLE_CONSECUTIVE_PREFILL_OVERLAP <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/environ.py#L693>, read 2026-11-04).
- `sglang.overlap.default`: SGLang's overlap scheduler is on by default at v0.5.23, and --disable-overlap-schedule turns it off. It overlaps the CPU scheduler with the GPU model worker. Value on [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/fields/schedule.py, disable_overlap_schedule <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/fields/schedule.py#L193-L199>, read 2026-11-04).
- `sglang.overlap.loop`: In event_loop_overlap the scheduler launches the current batch, appends its result to a result_queue, and then processes the result of the batch before it. The CPU work on one batch's results therefore runs while the GPU computes the next. Value launch batch N, then process batch N-1 [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/managers/scheduler.py, Scheduler.event_loop_overlap <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L2061-L2120>, read 2026-11-04).
- `vllm.async-output.copy-stream`: Model Runner V2 copies the sampled ids to host memory on a separate copy stream, after that stream has waited for the main stream, so that the ids are complete. Value a copy stream that waits for the main stream [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L137-L141>, read 2026-11-04).
- `vllm.async-output.event-sync`: AsyncOutput.get_output waits on the copy's event with copy_event.synchronize() before it reads the sampled ids, so the host blocks there until the copy has landed. Value copy_event.synchronize() [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.get_output <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L174-L176>, read 2026-11-04).
- `vllm.async-scheduling.default`: At v0.33.0 vLLM turns async scheduling on by default, unless an incompatible option is set. The config resolves an unset field to on, or to off with a warning when an option conflicts. Value on [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py (async scheduling resolved at L1685) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L1685-L1686>, read 2026-11-04).
- `vllm.async-scheduling.mrv1-limits`: On the V1 model runner (MRV1) async scheduling does not work with pipeline parallelism, with speculative methods other than EAGLE, n-gram on the GPU, a draft model, DSpark or DFlash, or with disable_padded_drafter_batch. An explicit request for it raises an error, and the default turns it off with one warning. Value pipeline parallelism; some speculative methods [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py (async scheduling checks, L1651-L1719) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L1651-L1719>, read 2026-11-04).
- `vllm.async-scheduling.placeholders-added`: Under async scheduling, once a step is scheduled, the scheduler adds to each decode request's num_output_placeholders the tokens that the step will sample (and the draft tokens it carries), so that the next schedule call can plan on tokens that have not been sampled yet. Value num_output_placeholders [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/async_scheduler.py, AsyncScheduler._update_after_schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/async_scheduler.py#L44-L46>, read 2026-11-05).
- `vllm.async-scheduling.placeholders-resolved`: When the output of a step comes back, the scheduler takes the tokens it returned off the request's placeholders. Value placeholders resolved by the output [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler._update_request_with_output <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2767-L2769>, read 2026-11-05).
- `vllm.async-scheduling.since`: Async scheduling became vLLM's default in v0.14.0, released on 2026-01-20. The release notes list it as a breaking change that users can undo with --no-async-scheduling. Value v0.14.0 [measured], checked 2026-11-04 (source: vLLM v0.14.0 release notes <https://github.com/vllm-project/vllm/releases/tag/v0.14.0>, read 2026-11-04).
- `vllm.async-scheduling.tri-state`: The async_scheduling field of SchedulerConfig is a tri-state at v0.33.0. It is None until the engine config resolves it, False turns the feature off and True turns it on. Value bool | None = None [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, async_scheduling <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L211>, read 2026-11-04).
- `vllm.mask.deferred-sampling`: Under async scheduling a step whose structured-output requests are still waiting for the previous step's tokens cannot sample at once. step_with_batch_queue defers its sampling until it has processed the model output of the prior step. Value deferred under async scheduling [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step_with_batch_queue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L747-L760>, read 2026-11-04).
- `vllm.mrv2.async-first`: MRV2's design document says the scheduler and worker prepare the inputs for step N+1 while the GPU executes step N, so that CPU and GPU work overlap. Value step N+1 is prepared while step N runs [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/model_runner_v2.md (Async-First) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L45>, read 2026-11-04).
- `vllm.mrv2.gpu-input-prep`: MRV2 prepares input_ids, positions, query_start_loc and seq_lens with Triton kernels on the GPU, so a value that the CPU does not know yet can still be derived there. Value Triton kernels [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/model_runner_v2.md (GPU-native input preparation) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/model_runner_v2.md#L134>, read 2026-11-04).
- `vllm.scheduler.skip-extra-step`: Under async scheduling the scheduler does not schedule another step for a request when the steps in flight are sure to reach its max_tokens, so a stop at the length cap leaves no ghost token. A stop on EOS cannot be known in advance, and the request rides one more step. Value no extra step for a length-capped stop [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L799-L813>, read 2026-11-04).
- `vllm.step.batch-queue`: With async scheduling the engine core uses step_with_batch_queue. It schedules a new batch whenever the queue has room and returns at once, and it blocks on the oldest batch's result only when the queue is full or nothing else can be scheduled. Value the batch queue first [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step_with_batch_queue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708-L723>, read 2026-11-04).
- `vllm.step.max-concurrent-batches.mrv1`: With async scheduling on, the V1 model runner at pipeline-parallel size 1 keeps at most 2 batches in flight, which is what lets the CPU plan one batch while the GPU runs the other. Value 2 batches [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, max_concurrent_batches <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L588-L598>, read 2026-11-04).
- `vllm.step.max-concurrent-batches.mrv2`: With async scheduling on, Model Runner V2 (MRV2) keeps pipeline-parallel size plus 1 batches in flight, so 2 batches without pipeline parallelism. Value pp_size + 1 [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, max_concurrent_batches <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L592-L594>, read 2026-11-04).
