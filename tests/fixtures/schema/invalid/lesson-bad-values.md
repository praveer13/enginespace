---
id: tr2.L3
module: tr9
title: " "
minutes: 25.5
kcs: [tr2.async-overlap, tr2.async-overlap]
builds_on: [T5.L7]
status: published
---

Every field below holds a value of the right kind that the schema still refuses.

:::predict
id: tr2.l3.q1
prompt: With async scheduling on, how many µs of the CPU's per-step work stay on the critical path?
answer: { kind: numeric, unit: us, rel_tol: 15 }
reveal: whenever
kcs: []
:::

:::game
id: Loop
level: async
mode: timed
:::

:::item
family: bubble-width
level: 4
count: 0
:::
