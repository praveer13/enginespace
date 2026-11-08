---
id: tr2
title: The step loop
status: review
hours: 10                         # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 10 }          # [estimated]
outcomes:
  - Name the CPU work that sits on the critical path of an engine step, and say which of it the engine's changes take off
  - Say what async scheduling hides and what it costs, and what a CUDA graph replay saves and for which batches
  - Explain why a batch dispatches to the graph it does, and what the graphs take from the KV cache
  - Read the same loop in SGLang, Mini-SGLang and TensorRT-LLM, and name what differs
artifacts:
  - id: loop
    lane: B
    title: The step-loop sim, toggled until the bubbles close
worlds: [trace-room-steploop]     # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]
pins: [vllm, sglang]
lanes: [B]
games: [loop]
---

The step loop is the engine's heartbeat, and a step is short enough that the work around the forward can be as long as the forward. This module is about the gap that opens between two forwards: which CPU work sits on the critical path of a step, what async scheduling hides, what a CUDA graph replay saves, and why a batch dispatches to the graph it does. It is half of the course's second outcome. TR3 tests the other half on real traces.

It builds on {{ks:T5.L7}}, which taught the scheduler you are about to watch run on a clock, and on {{ks:T0.L6}}, which taught the flame graph that shows the gap. {{ks:T4.L3}} is recommended: decode is bound by bandwidth, so a step costs about the same with one request or many, and that is why the loop must keep its slots full.

## The browser part

TR2 has no GPU part of its own. Its seven lessons, its game and its exit tickets are all in the browser, and every number in them comes from a model that the lessons name.

1. One step, five calls: vLLM's busy loop at `v0.33.0`.
2. One token budget: chunked prefill, recompute preemption, and defaults that depend on your GPU.
3. Async scheduling closes the bubble, and costs a token.
4. The MRV2 delta: persistent state, GPU-side input prep, and why MRV1 still ships.
5. CUDA graphs: capture, replay, padding, and five modes.
6. Dispatch keys: which graph replays this step.
7. The same loop in SGLang, Mini-SGLang and TRT-LLM.

The game is Service (`loop`), the step loop as a line kitchen. A ticket is a request, a clip on the rail is one of the places in a step, a fire is a step, and the expo is the CPU, who writes the next call while the line cooks. The front page's four beats come first, and the full service follows with its levels: `async`, `graphs` with its stages `comb`, `sizes` and `modes`, `mrv2`, and `close`. A level called `keys` is planned for the dispatch keys of the sixth lesson, and it is not open: it waits for a table of the pinned dispatchers' own answers, which the owner has to run on a CPU (Q-10). The lessons say which level to play and what to predict before you do. Each lesson ends in a check on fresh seeds, so recognizing last time's answer earns nothing.

Two cost cards are in it. `70B on H100` takes its GPU lane from kernelspace's S5 fit, and the small model is a napkin card that the game labels synthetic. Every host phase is an [estimated] preset until the owner's traces fit it, and the notional-machine card at the end of this page says what the model follows, what it ignores and what it was calibrated against.

## What this module says about the engines

The loop, the budget, the runners and the graphs follow vLLM `v0.33.0`, and the lessons cite them claim by claim. SGLang is the second pin, `v0.5.23`. Mini-SGLang is read at one commit, and TensorRT-LLM is read in one overview document and is no pin, so a claim about it carries no pin and says so. Two kinds of figure come with a warning. A number from a vendor's post or a contributor's report is tagged [unverified] wherever it appears, with the hardware it was taken on. The catalog's 300 µs [unverified] of idle GPU between steps has no primary source, so the module treats it as a hypothesis to measure in TR3 and never uses it as a fact.

The published design document of vLLM's CUDA graphs shows a descriptor that matches neither runner, and an older post that the course reads in TR1 lists async scheduling as experimental. {{claim:vllm.cudagraph.design-doc-key}} {{claim:inside-vllm.async-experimental}} Where a document and the code at the pin disagree, the lessons follow the code and say so.

## The part that needs a GPU

TR2 has no GPU stage. Its predictions about a real engine are tested in TR3's lab, `tr3.profile`, which profiles the pinned vLLM on your GPU and toggles async scheduling and graphs in two pairs. That lab arrives with the grader (W2, D-039). Until then nothing here is a measurement of your hardware, no lesson claims one, and the lessons that name a GPU part say so in a short section of their own.

## Credit, and the hours

The module is browser-complete when its exit tickets and the graded levels `graphs` (the stages `sizes` and `modes`) and `close` are credited, and complete when a Prove-it is on record as well, taken with the agent closed (ASSESSMENT §9). As built, `close` is the graded level and `graphs` is a practice level, so the graded bars of its two stages are not in the game yet.

The plan sets the module at ten hours [estimated]: about five in the lessons, two in practice on other seeds, a little over an hour in graded runs and items, and the rest in composing your configuration as engine flags and in sets of predictions. The lessons' own clocks, which count their words and their blocks, come to just under five hours [derived], so the other five hours are the game's: practice on other seeds, the graded runs, and composing your configuration. The hours on this page are estimates and nothing more.

:::card
kind: notional-machine
id: trace-room-steploop
:::
