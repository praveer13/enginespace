---
id: tr2.l3
module: tr2
title: Async scheduling closes the bubble
minutes: 25                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.async-overlap, tr2.bubble]
builds_on: [ks:T5.L7, ks:T0.L6]   # kernelspace refs; rendered as links out
status: draft                     # draft | review | live
---

The scheduler in vLLM's engine core runs on the CPU … {{claim:vllm.async-scheduling.default}}
A 300 µs host step [unverified] hides behind a 2.1 ms decode step [estimated] …

:::predict
id: tr2.l3.p1
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
