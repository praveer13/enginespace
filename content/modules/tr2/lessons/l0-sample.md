---
id: tr2.l0
module: tr2
title: A sample lesson that uses every block
minutes: 45                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.async-overlap, tr2.bubble]
builds_on: [ks:T5.L7, ks:T0.L6]   # kernelspace refs; rendered as links out
status: draft                     # draft | review | live
lanes: [B, F]
games: [loop]
labs: [tr3.profile]
---

This lesson is a sample. It gives the content compiler, the renderer and the gates one page that uses all eight blocks. Its numbers come from the course's synthetic world, and each one is a claim or carries a tag.

## The bubble

The engine's loop prepares a step on the CPU and then hands it to the GPU. While the CPU prepares the next step, the GPU can sit idle, and that gap is the *bubble*. In the sample world a host step takes {{claim:sample.world.host-step-us}} and a decode step takes {{claim:sample.world.decode-step-us}}, so a 300 µs host step [estimated] can hide behind a 2.1 ms decode step [estimated] once the two overlap.

A lesson may also carry a number that nobody has checked yet, such as a 1 ms scheduling pause [unverified]. The tag is the lesson's promise not to lean on it.

### What async scheduling changes

With async scheduling on, the scheduler plans the next step while the current one runs. The **critical path** is the CPU work that the GPU has to wait for, and overlap takes work off it. {{ks:T5.L7}} covers continuous batching, which this builds on. A fact about a real engine comes from a claim with a source, as this one does: vLLM declares {{claim:vllm.release.requires-python}} for its Python.

Three things decide how much of the bubble is left:

- how much of the host step the scheduler can move off the critical path;
- whether the next step's inputs depend on a token that is not sampled yet;
- whether a captured CUDA graph replaces many launches with one.

| Configuration | Bubble, µs [estimated] |
|---|---|
| Async scheduling off | 300 |
| Async scheduling on | 0 |

The loop in outline, as pseudocode and not as the engine's code:

```text
schedule -> launch -> sample -> update
```

Read [the course map](/map) for where this module sits, and use `engine step` as a search term in the engine's source.

1. Predict the bubble before you play.
2. Play the level and read the debrief.
3. Practise on fresh seeds, then take the item set.

:::predict
id: tr2.l0.p1
prompt: With async scheduling on, how many µs of the CPU's per-step work stay on the critical path?
answer: { kind: numeric, unit: us, rel_tol: 0.15 }
reveal: after-game
kcs: [tr2.async-overlap]
:::

:::game
id: loop
level: async
mode: practice
:::

:::item
family: tr2.bubble-width
level: 2
count: 3
:::

:::trace
id: loop-async-off
seed: 7
tasks: [gap]
:::

:::lab
id: tr3.profile
lane: F
stages: [s1]
:::

:::card
kind: warning
title: A model
body: The browser world is a model, and the real engine is the judge.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

:::figure
src: figures/tr2/l0-sample.svg
alt: Two steps on a CPU lane and a GPU lane
description: The CPU lane prepares a step, then the next one. The GPU lane runs each step after its preparation, and an open gap on the GPU lane between the two steps is the bubble.
origin: authored
:::

The sample ends here. A real lesson closes with an exit check, which is a prediction, a game level or an item set that names the knowledge components it tests.
