---
id: tr2.l1
module: tr2
title: "One step, five calls: vLLM's busy loop at v0.33.0"
minutes: 33                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.step-calls, tr2.bubble]
builds_on: [ks:T5.L7, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

One engine step is five calls on one thread, and the GPU can sit idle between two forwards. Guess how busy the GPU is when nothing overlaps, then run the level: turn async scheduling on and watch the bubbles close. The five calls come next.

:::predict
id: tr2.l1.p1
prompt: "In this level's step loop, a step plans for 2 ticks [estimated], runs its forward for 4 ticks [estimated] and reads the result for 1 tick [estimated]. Nothing overlaps: each step starts when the last one has been read. For what share of the clock is the GPU busy, in per cent?"
answer: { kind: numeric, unit: percent, rel_tol: 0.05 }
reveal: after-game
kcs: [tr2.bubble]
:::

:::game
id: loop
level: first-3-gap
mode: practice
:::

## One thread, one loop

In the level the GPU lane went empty whenever the CPU lane was busy, until async scheduling overlapped the two. This part follows the CPU lane's thread through one step of vLLM v0.33.0: which calls touch the GPU, and which wait for it. {{ks:T5.L7}} taught the same loop without a clock.

{{ks:T0.L6}} told you that vLLM's V0 loop spent visible milliseconds an iteration in Python, and that the V1 rewrite exists because flame graphs showed the plateau. {{claim:loop.kernelspace.scheduler-tax}} V1 set out to fix it, and its guide lists near-zero CPU overhead among its aims. {{claim:vllm.v1.cpu-overhead-goal}} A step still has a CPU part, and the GPU still waits for it unless something hides it.

The engine core is a process whose main thread runs a busy loop. Each turn it polls its input queue until there is work, runs one engine step, and goes round again. {{claim:vllm.engine-core.busy-loop}} Requests reach it on a thread-safe `input_queue` and leave on an `output_queue`. {{claim:vllm.engine-core.queues}} When a step ran no model but requests remain, as when they wait for remote KV, the loop sleeps for a moment so that background threads can progress. {{claim:vllm.step.idle-sleep}}

Between a request's arrival and its token's departure the engine core schedules, calls into the model runner and updates the requests, and all three happen in the turns of that one loop. That is the CPU part of a step. On one GPU it is one thread's work, because the executor that serves a single GPU runs the model runner in the thread that calls it. {{claim:vllm.executor.uni-default}} {{claim:vllm.executor.uni-inline}} Hold the picture: a thread whose work comes before every forward and after it, and a GPU that cannot start the next forward until that thread has launched it.

## Five calls and a wait

`EngineCore.step` is 31 lines [measured] at the pin, and [these are its first four calls](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L677-L686), with `...` for the lines cut.

```python
# vllm/v1/engine/core.py, lines 677 to 686 at v0.33.0
scheduler_output = self.scheduler.schedule(self._should_throttle_prefills())
future = self.model_executor.execute_model(scheduler_output, non_block=True)
grammar_output = self.scheduler.get_grammar_bitmask(scheduler_output)
...
    model_output = future.result()
    if model_output is None:
        model_output = self.model_executor.sample_tokens(grammar_output)
```

The fifth call, `update_from_output`, follows a drain of aborts. {{claim:vllm.step.order}}

1. `scheduler.schedule()` chooses which requests run and how many tokens each gets, out of one token budget. The next lesson takes it apart. It is CPU work and it waits for nothing.
2. `model_executor.execute_model(scheduler_output, non_block=True)` runs the first half of the step in the model runner. The runner brings its request state up to date, prepares the step's inputs and launches the forward, and the call returns a future as soon as the launch is queued, without waiting for the GPU. {{claim:vllm.step.execute-model-state}} The forward then runs on the GPU, and the engine core's thread is free again while it does.
3. `scheduler.get_grammar_bitmask(scheduler_output)` builds the structured-output mask on the CPU, while the forward is running. For a step with no grammar there is nothing to build. {{claim:vllm.mask.overlap}}
4. The fourth call is the step's one wait for the GPU. `future.result()` hands back what `execute_model` returned. In MRV2 that is no output yet, because the runner has launched the forward and kept its state for a second call. {{claim:vllm.step.two-phase}} So `step` goes on to `model_executor.sample_tokens(grammar_output)`. {{claim:vllm.step.sample-if-none}} That call applies the mask, samples the next token of every request and copies the ids to the host. The engine core does not go on until the copy has landed. {{claim:vllm.executor.uni-blocking-output}} {{claim:vllm.async-output.event-sync}} The copy waits for the forward on the GPU's own streams, so it cannot land before the forward has ended, and that is the wait for the forward. {{claim:vllm.async-output.copy-stream}}
5. `scheduler.update_from_output(...)` appends the new tokens to their requests, checks for stops, frees what finished and builds the outputs. Aborts that arrived during the forward are taken just before it. {{claim:vllm.engine-core.aborts}}

Check what a call does and what it waits for before you go on.

:::item
family: tr2.step-order
level: 1
count: 1
:::

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
replay:
  game: loop
  level: first-3-gap
  seed: 1
  actions:
    - { t: run, until: step }
    - { t: run, until: step }
:::

The figure draws two steps of the small model with nothing overlapped, to scale, from the sim. Between two forwards the GPU lane is empty for exactly as long as the CPU lane is busy. You saw that empty stretch in the level, and it has a name.

## The gap, and its name

When the next step cannot start until this one has been read, every microsecond of the CPU's work is a microsecond in which the GPU waits. The model calls such a stretch a **bubble**, and it counts one only when the CPU lane is busy while the GPU lane is not. A gap in which both are idle is an engine waiting for a request, which is a different thing, and the model does not call it a bubble.

:::card
kind: warning
title: Idle is not the same as waiting
body: A GPU that is idle because there is nothing to run and a GPU that is idle because the CPU has not finished the next call look the same on a lane. The first is a quiet server. The second is the bubble, and only the second is the engine's to fix. Check what the CPU lane is doing before you call a gap a bubble.
:::


The level you ran, `first-3-gap`, has the same rule in a world of synthetic ticks. A step plans for 2 ticks, runs the forward for 4 and reads for 1 [estimated], so without overlap it takes 7 ticks [derived] and the GPU is busy for 4 of them. {{claim:loop.world.step-ticks-serial}} The three numbers are arbitrary: others would change the share, not the rule. That share is the answer to your guess. In the level each bubble is a dashed box on the GPU lane, and turning async scheduling on is what shrinks it.

Check what a bubble is before you go on.

:::item
family: tr2.step-order
level: 1
count: 1
:::

## The same rule on two real-sized cards

The levels after the first four run the step loop in microseconds on two cost cards. `70B on H100` takes its forward from kernelspace's S5 fit, with S5's host term on the CPU lane, and the small model is a napkin on a `24 GB` card, synthetic. The table is one steady step of the `async` level's practice run, with every batch slot full and every row a decode, and the next call written after the forward. Printed by the course's model on 2026-11-08 at `b5fb81a`.

| The step's phase | 70B on H100, µs [synthetic] | Small model, µs [synthetic] |
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

Two things stand out. The GPU's idle time before a step is its CPU's work, row for row: 957 µs and 764 µs [synthetic]. That is the arithmetic of your prediction, on bigger numbers. And a similar CPU part is a very different bubble on the two cards, which also differ in their GPU and in where the host card prices the per-sequence work. So read them as two cases, not as an effect of size. The big model's forward is long, so its GPU is busy for 92.6% [derived] of the clock even with nothing overlapped. The small model's forward is barely longer than the CPU's work, so its GPU is busy for 61.6% [derived]. This is why "host overhead" is a small model's complaint, and a small batch's: the CPU part does not shrink with the model, and the forward does.

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

## Exit check

This lesson tests two skills: naming the calls of one step in order and saying which lane runs each (`tr2.step-calls`), and saying why the GPU idles between steps (`tr2.bubble`). The questions are three items on fresh seeds, each a step of calls or a step with its times, asking for the order of the calls, the lane that runs one, or the idle time before a step.

:::item
family: tr2.step-order
level: 2
count: 3
:::
