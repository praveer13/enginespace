---
id: tr2
title: The step loop
status: draft
hours: 10                         # [estimated]; PLAN §4
hours_by_lane: { B: 10 }
outcomes:
  - Name the CPU work that sits on the critical path of an engine step
  - Say what async scheduling hides and what a CUDA graph replay saves
  - Explain why a batch dispatches to the graph it does
artifacts:
  - id: loop
    lane: B
    title: The step-loop sim, toggled until the bubbles close
worlds: [trace-room-steploop]
prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]
pins: [vllm, sglang]
lanes: [B]
games: [loop]
---

The step loop is the engine's heartbeat.
