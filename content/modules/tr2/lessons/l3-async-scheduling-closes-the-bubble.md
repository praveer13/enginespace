---
id: tr2.l3
module: tr2
title: Async scheduling closes the bubble, and costs a token
minutes: 50                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.bubble, tr2.async-overlap]
builds_on: [ks:T5.L7, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

Overlap hides the CPU's work behind the forward, and the engine pays a token for it. Run both levels: first a burst of requests on the front page's rules, then the engine's own `async` level on two cost cards. The parts below say what the engine plans early, and what that costs.

:::game
id: loop
level: first-4-par
mode: practice
:::

:::game
id: loop
level: async
mode: practice
:::

## The obstacle

The last lesson ended on a gap. With nothing overlapped, the GPU idles for all of the CPU's work, because the next step cannot be prepared until this one has been read. The cure is the oldest one in systems: start the next piece of work before the last one has finished. This lesson is the engine's version of it. It says what vLLM plans early, what it cannot, what that closes and what it leaves open, and what the trick costs.

Step N+1 needs, for every running request, the token that step N is about to sample. The CPU cannot read it until the forward has ended and the ids have been copied back, and that read is the wait that the last lesson drew as the gap. So the engine has to prepare step N+1 without a value that it will not have until step N is over.

It does this with two moves and one concession.

**It plans with a count, not a value.** After the scheduler has scheduled a step, it adds to each decode request's `num_output_placeholders` the tokens that the step is going to sample, drafts included, and the next call to `schedule()` counts them as if they had arrived. {{claim:vllm.async-scheduling.placeholders-added}} When the output comes back, `update_from_output` takes them off again. {{claim:vllm.async-scheduling.placeholders-resolved}} The scheduler never needs the token, only that there will be one.

**It lets the GPU carry the value.** MRV2 prepares the next step's `input_ids`, positions and sequence lengths with Triton kernels on the GPU, so a value the CPU does not know yet can still be derived there. {{claim:vllm.mrv2.gpu-input-prep}} The sampled ids are copied to the host on a copy stream of their own, which first waits for the main stream, {{claim:vllm.async-output.copy-stream}} and the host blocks on that copy only when it finally needs the ids to read the stops. {{claim:vllm.async-output.event-sync}} The model checks this dependency. In the course's loop, a step that writes its input ids on the host while async scheduling is on reads a token before it is sampled, and the run reports a violation. The ids are the model's own lever and no engine flag: an engine that lacked a way to carry the value on the GPU would have to wait for it, and the wait is the gap again.

**It concedes a token.** The engine learns that a request stopped on EOS only when it reads the output of the step that carried the stop, and by then it has scheduled the next step with that request in it. That step computes one more token for the request, and the engine throws it away. It is a ghost token. A stop at the length cap leaves none, because the scheduler knows the cap and does not schedule a step that the steps in flight are sure to make unnecessary. {{claim:vllm.scheduler.skip-extra-step}}

## What overlap can hide

Overlap hides CPU work behind a forward, so it hides at most as much as the forward is long. With the CPU's work before and after the forward written `plan` and `read`, the step takes `plan + forward + read` without overlap, and with it the larger of `forward` and `plan + read`. The GPU's idle time between two forwards is then the CPU's work less the forward, or nothing when the forward is the longer. That is the first levels' rule, which counted ticks: 7 per step [derived] without overlap, with the GPU busy for 4, and 4 [derived] with it, the larger of the GPU's 4 and the CPU's 3. {{claim:loop.world.step-ticks-overlap}}

Commit to a number. The numbers are round and made up.

:::predict
id: tr2.l3.p1
prompt: "A step's CPU work is 1,000 µs [estimated] before the forward and 500 µs [estimated] after it, and the forward takes 1,200 µs [estimated]. Async scheduling is on. How many µs of the CPU's work stay on the critical path, as idle time between two forwards?"
answer: { kind: numeric, unit: us, rel_tol: 0.05 }
reveal: at-commit
kcs: [tr2.async-overlap]
:::

## A queue of two

With those in place the engine core can keep two steps in flight. With async scheduling it calls `step_with_batch_queue`: it schedules a new batch whenever the queue has room and returns at once, and it blocks on the oldest batch's result only when the queue is full or nothing else can be scheduled. {{claim:vllm.step.batch-queue}} The queue holds two batches on the V1 runner at pipeline-parallel size 1, {{claim:vllm.step.max-concurrent-batches.mrv1}} and `pp_size + 1` on MRV2, which is two without pipeline parallelism [derived]. {{claim:vllm.step.max-concurrent-batches.mrv2}} MRV2's design document states what that is for: the scheduler and the worker prepare the inputs of step N+1 while the GPU executes step N. {{claim:vllm.mrv2.async-first}} Read it in the code at the pin: [`EngineCore.step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708-L723).

:::figure
src: figures/tr2/l3-overlap.svg
alt: Three engine steps drawn twice to one scale, with async scheduling off and then on
description: Two pairs of lanes, one pair for async scheduling off and one for on, with three steps in each. With it off, the GPU lane has an empty stretch, drawn dashed, between every two forwards, because the next step's schedule, prepare and launch wait for the last step to be read. With it on, the CPU lane writes each step's schedule, prepare and launch while the previous forward runs, the forwards follow one another with no stretch between them, and the three steps end sooner.
origin: generated
replay:
  game: loop
  level: first-4-par
  seed: 1
  actions:
    - { t: lever, name: async, value: true }
    - { t: admit, req: 0 }
    - { t: admit, req: 1 }
    - { t: admit, req: 2 }
    - { t: admit, req: 3 }
    - { t: run, until: step }
    - { t: run, until: step }
    - { t: run, until: step }
:::

:::card
kind: isomorphism
title: Double buffering
body: A renderer draws frame N+1 into one buffer while the display scans out frame N from the other, and swaps them. The CPU prepares step N+1 while the GPU runs step N, and the two steps trade places. The work does not get smaller, and the two halves of it run side by side.
breaks: A frame does not depend on the pixels of the one before it. A decode step depends on the token the last step is sampling, so the engine has to hand the value over without a CPU in between, and has to plan with a placeholder for a token that may turn out to be the last.
:::

## The same rule on the course's two cards

The `async` level you ran serves 24 requests [estimated] on 12 batch slots [estimated], and its practice seed is `0`. Here are its two stages, served without overlap and with it. Read on 2026-11-08 at `b5fb81a`.

| The run | `70B on H100`, off [measured] | `70B on H100`, on [measured] | Small model, off [measured] | Small model, on [measured] |
|---|---|---|---|---|
| Clock, µs | 696,626 | 633,781 | 113,965 | 79,375 |
| Median time per output token, µs | 14,037 | 11,982 | 2,386 | 1,493 |
| The GPU's idle time while the CPU worked, µs | 86,690 | 0 | 49,076 | 11,982 |
| Steps with a bubble before them | 49 of 50 | 0 of 52 | 49 of 50 | 9 of 52 |
| Ghost tokens | 0 | 24 | 0 | 24 |

On the big card, overlap closes every bubble: the median token is 14.6% faster [derived] and the run 9.0% shorter [derived]. The forward is about twelve times [derived] the CPU's work, so there is room to hide all of it. On the small card the run is 30.4% shorter [derived] and the median token 37.4% faster [derived], and 9 of its 52 steps [measured] still have a bubble before them. Those nine are not the steady ones. All of them admit a request. Seven launch kernel by kernel, because no graph was captured for their size: the launch alone takes 2,016 µs [measured] against a forward of about 1,240 µs [measured]. The other two launch in pieces and fall short by about 550 µs [measured]. Overlap cannot hide a launch that is longer than the forward it launches. The next two lessons are about making that launch short.

Check the idle time on a new step before you read on.

:::item
family: tr2.bubble-width
level: 1
count: 1
:::

The last row is the price. Every request in the model stops on EOS, so each of the 24 [measured] costs one ghost token, 24 of the 522 rows [derived] that the run computed, or 4.6% [derived]. A run whose requests all stop at their length cap has none in the real engine, as the claim above says.

## What turns it off

Async scheduling is vLLM's default since v0.14.0, and a user can undo it with `--no-async-scheduling`. {{claim:vllm.async-scheduling.since}} Its config field is three-valued: unset until the engine resolves it, off or on. {{claim:vllm.async-scheduling.tri-state}} Unset resolves to on unless an option conflicts, and then to off with a warning. {{claim:vllm.async-scheduling.default}} On the V1 runner the conflicts include pipeline parallelism and the speculative methods other than a few, and an explicit request for it in that case is an error. {{claim:vllm.async-scheduling.mrv1-limits}} When a structured-output request is still waiting for the previous step's tokens, the step defers its sampling, because a grammar needs the last token to build its mask. {{claim:vllm.mask.deferred-sampling}} That is TR6's.

SGLang's overlap scheduler is on by default, and `--disable-overlap-schedule` turns it off. {{claim:sglang.overlap.default}} It has the same shape, one batch behind: its event loop launches the current batch, queues its result, and then processes the result of the batch before. {{claim:sglang.overlap.loop}} It can also switch overlap off between two consecutive prefill batches, to protect the first batch's time to first token, and an environment variable decides, which is off unless you set it. {{claim:sglang.overlap.consecutive-prefill}} {{claim:sglang.overlap.consecutive-prefill-default}} The last lesson lines all four engines up side by side.

:::card
kind: warning
title: Overlap hides the CPU's work and does not remove it
body: The CPU does exactly as much work as before, and the throughput of a step is now the larger of the CPU's work and the forward. A model small enough, or a batch short enough, for the CPU's work to be the larger is CPU-bound with overlap on, and the bubble comes back on every step. If a profile with overlap on still shows gaps, the CPU lane is the longer lane, and the cure is less CPU work per step.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What the GPU will check

TR2 has no GPU stage of its own. The prediction that this lesson makes about a real engine is tested in TR3's lab: its stage `s4` takes the same capture with `--no-async-scheduling`, and the prediction you commit in the browser before it is scored against the receipt's recomputed numbers. That lab arrives with the grader. Until then nothing here is a measurement of your GPU, and the numbers above are the model's.

## Exit check

This lesson tests two skills: saying why the GPU idles between engine steps when the CPU's work for the next step is not ready (`tr2.bubble`), and saying which CPU work async scheduling plans behind the running step and what it leaves on the critical path (`tr2.async-overlap`). The questions are three items on fresh seeds, each a step with its times, asking for the idle time with overlap off or on, or for the smallest change that closes it. Pass with at least two right, one of them numeric. The graded `close` level at the end of the sixth lesson earns both skills again, with the other levers.

:::item
family: tr2.bubble-width
level: 2
count: 3
:::
