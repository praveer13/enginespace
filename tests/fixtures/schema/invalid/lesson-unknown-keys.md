---
id: tr2.l3
module: tr2
title: Async scheduling closes the bubble
minutes: 25
kcs: [tr2.async-overlap]
builds_on: [ks:T5.L7]
status: draft
reviewer: someone
---

Every object below carries one key that the schema does not know.

:::predict
id: tr2.l3.p1
prompt: With async scheduling on, how many µs of the CPU's per-step work stay on the critical path?
answer: { kind: numeric, unit: us, rel_tolerance: 0.15 }
reveal: after-game
kcs: [tr2.async-overlap]
hint: look at the bubble
:::

:::game
id: loop
level: async
mode: practice
seed: 7
:::

:::item
family: tr2.bubble-width
level: 2
count: 3
shuffle: true
:::
