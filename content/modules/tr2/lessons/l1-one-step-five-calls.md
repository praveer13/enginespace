---
id: tr2.l1
module: tr2
title: "One step, five calls: vLLM's busy loop at v0.33.0"
minutes: 35                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.step-calls, tr2.bubble]
builds_on: [ks:T5.L7, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

{{ks:T5.L7}} taught continuous batching as a scheduler's loop: pick the running set, check that the blocks hold, run one model step, sample, free what finished. That is the scheduler's view of the engine, and it is silent about time. This lesson takes the engine's view. It follows one step through the code that runs it at the pin, vLLM v0.33.0, names the calls, says which of them touch the GPU and which wait for it, and finds the place where the GPU sits idle.

{{ks:T0.L6}} told you that vLLM's V0 loop spent visible milliseconds an iteration in Python, and that the V1 rewrite exists because flame graphs showed the plateau. {{claim:loop.kernelspace.scheduler-tax}} V1 set out to fix it, and its guide lists near-zero CPU overhead among its aims. {{claim:vllm.v1.cpu-overhead-goal}} The rest of this module is about what that took, and about what it left: a step still has a CPU part, and the GPU still waits for it unless something hides it.

## One thread, one loop

The engine core is a process whose main thread runs a busy loop. Each turn it polls its input queue until there is work, runs one engine step, and goes round again. {{claim:vllm.engine-core.busy-loop}} Requests reach it on a thread-safe `input_queue` and leave on an `output_queue`. {{claim:vllm.engine-core.queues}} When a step ran no model but requests remain, as when they wait for remote KV, the loop sleeps for a moment so that background threads can progress. {{claim:vllm.step.idle-sleep}}

Between a request's arrival and its token's departure the engine core schedules, calls into the model runner and updates the requests, and all three happen in the turns of that one loop. That is the CPU part of a step. On one GPU it is one thread's work, because the executor that serves a single GPU runs the model runner in the thread that calls it. {{claim:vllm.executor.uni-default}} {{claim:vllm.executor.uni-inline}} Hold the picture: a thread whose work comes before every forward and after it, and a GPU that cannot start the next forward until that thread has launched it.

## Five calls and a wait

`EngineCore.step` is short enough to read whole. At the pin it makes five calls, and the wait for the GPU is inside the fourth. {{claim:vllm.step.order}}

1. `scheduler.schedule()` chooses which requests run and how many tokens each gets, out of one token budget. The next lesson takes it apart. It is CPU work and it waits for nothing.
2. `model_executor.execute_model(scheduler_output, non_block=True)` runs the first half of the step in the model runner. The runner brings its request state up to date, prepares the step's inputs and launches the forward, and the call returns a future as soon as the launch is queued, without waiting for the GPU. {{claim:vllm.step.execute-model-state}} The forward then runs on the GPU, and the engine core's thread is free again while it does.
3. `scheduler.get_grammar_bitmask(scheduler_output)` builds the structured-output mask on the CPU, while the forward is running. For a step with no grammar there is nothing to build. {{claim:vllm.mask.overlap}}
4. `future.result()` hands back what `execute_model` returned, and in MRV2 that is no output yet: the runner has launched the forward and kept its state for a second call, so `step` goes on to `model_executor.sample_tokens(grammar_output)`. {{claim:vllm.step.two-phase}} {{claim:vllm.step.sample-if-none}} That call applies the mask, samples the next token of every request and copies the ids to the host, and the engine core does not go on until the copy has landed. {{claim:vllm.executor.uni-blocking-output}} {{claim:vllm.async-output.event-sync}} The copy waits for the forward on the GPU's own streams, so it cannot land before the forward has ended, and that is the wait for the forward. {{claim:vllm.async-output.copy-stream}}
5. `scheduler.update_from_output(...)` appends the new tokens to their requests, checks for stops, frees what finished and builds the outputs. Aborts that arrived during the forward are taken just before it. {{claim:vllm.engine-core.aborts}}

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

:::figure
src: figures/tr2/l1-one-step.svg
alt: Two engine steps on a CPU lane and a GPU lane, with an open gap on the GPU lane between the forwards
description: The CPU lane has two runs of boxes, one for each step, each run made of schedule, prepare, launch, sync and sample in that order. The GPU lane has one box for each step, the forward, which starts when the launch ends. Between the first forward and the second the GPU lane is empty, drawn as a dashed box, for as long as the CPU lane is busy with the sync, the sample and the next step's schedule, prepare and launch.
origin: generated
:::

The figure draws two steps of the small model with nothing overlapped, to scale, from the sim. Between two forwards the GPU lane is empty for exactly as long as the CPU lane is busy. That empty stretch is the lesson's subject, and it needs a name.

## The gap, and its name

When the next step cannot start until this one has been read, every microsecond of the CPU's work is a microsecond in which the GPU waits. The model calls such a stretch a **bubble**, and it counts one only when the CPU lane is busy while the GPU lane is not. A gap in which both are idle is an engine waiting for a request, which is a different thing, and the model does not call it a bubble.

:::card
kind: warning
title: Idle is not the same as waiting
body: A GPU that is idle because there is nothing to run and a GPU that is idle because the CPU has not finished the next call look the same on a lane. The first is a quiet server. The second is the bubble, and only the second is the engine's to fix. Check what the CPU lane is doing before you call a gap a bubble.
:::

Commit to a number before you look at the model's. The numbers in this question are round and made up.

:::predict
id: tr2.l1.p1
prompt: "A step's CPU work is 700 µs [estimated] before its forward (schedule, prepare and launch) and 300 µs [estimated] after it (sync and sample). The forward takes 2,000 µs [estimated]. Nothing overlaps: each step starts when the last one has been read. For what share of the clock is the GPU busy, in per cent?"
answer: { kind: numeric, unit: percent, rel_tol: 0.05 }
reveal: after-game
kcs: [tr2.bubble]
:::

The front page's run, First service, has the same rule in a world of synthetic ticks. A step plans for 2 ticks, cooks for 4 and reads for 1 [estimated], so without overlap it takes 7 ticks [derived] and the line is busy for 4 of them. {{claim:loop.world.step-ticks-serial}} The game is Service (`loop`), and it dresses the loop as a line kitchen: a step is a **fire**, the CPU's work is the **expo** writing the next call and reading the last fire back, the GPU is the **line**, and a bubble is the line standing dark while the expo writes. The engine words come first everywhere else on the page. Play the third beat, `first-3-gap`, and count the dark stretches on the tape.

:::game
id: loop
level: first-3-gap
mode: practice
:::

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

The host phases are the model's [estimated] presets. The `schedule` row of the `70B on H100` card is the host card's base phase and S5's host term for each of the twelve rows, which is {{claim:loop.s5.t-seq}} per running sequence per step, so the card has no `sample` row of its own. On the small card the host card prices the per-sequence work itself, in the `sample` row.

Two things stand out. The GPU's idle time before a step is its CPU's work, row for row: 957 µs and 764 µs [measured]. That is the arithmetic of your prediction, on bigger numbers. And the same CPU part is a very different bubble. The big model's forward is long, so its GPU is busy for 92.6% [derived] of the clock even with nothing overlapped. The small model's forward is barely longer than the CPU's work, so its GPU is busy for 61.6% [derived]. This is why "host overhead" is a small model's complaint, and a small batch's: the CPU part does not shrink with the model, and the forward does.

## What a profiler shows, and a number to leave alone

{{ks:T0.L6}} drew a flame graph, which merges stacks and throws the order away. A bubble needs the order. In a timeline of a real engine it is a gap between two GPU kernels while the engine core's thread is busy in Python, and TR3 teaches you to read one on your own GPU.

You will meet a figure for the size of the gap: about 300 µs [unverified] between steps. The course found no primary source for it, so it is a hypothesis and not a fact. TR3's lab measures the gap on your GPU with async scheduling on and off, and your number replaces the folklore. Until you have it, no number in this module is a claim about your GPU, and the course's own are the model's.

:::card
kind: isomorphism
title: Never block the event loop
body: A single-threaded server lives by one rule, that nothing on the event loop thread may block, because everything queued behind a blocked call waits. The engine core is that thread, and its blocking call is the wait on the GPU. Calling `execute_model` without blocking is the same discipline, and it is what lets the thread do the next piece of work while the forward runs.
breaks: An event loop waits on many things at once and serves whichever is ready. This loop has one thing to wait for, the GPU, and the same step comes round every time, so the cure is not a better wait but a different order of the work. The next lesson plans the next step before this one has been read.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What to carry

- A step is five calls and a wait on one thread: `schedule`, a non-blocking `execute_model`, `get_grammar_bitmask`, the wait with `sample_tokens`, and `update_from_output`.
- The GPU works only while the forward runs. With nothing overlapped, all the rest of the step is CPU work, and all of it is gap.
- The gap per step is the CPU's work. Its share of the clock depends on the length of the forward, so it bites small models and small batches hardest.

## Exit check

This lesson tests two skills: naming the calls of one step in order and saying which lane runs each (`tr2.step-calls`), and saying why the GPU idles between steps (`tr2.bubble`). The exit ticket is three items on fresh seeds, each a step of calls or a step with its times, asking for the order of the calls, the lane that runs one, or the idle time before a step. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2).

:::item
family: tr2.step-order
level: 2
count: 3
:::
