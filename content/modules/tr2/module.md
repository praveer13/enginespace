---
id: tr2
title: The step loop
status: draft
hours: 10                         # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 10 }          # [estimated]
outcomes:
  - Name the CPU work that sits on the critical path of an engine step
  - Say what async scheduling hides and what a CUDA graph replay saves
  - Explain why a batch dispatches to the graph it does
artifacts:
  - id: loop
    lane: B
    title: The step-loop sim, toggled until the bubbles close
worlds: [trace-room-steploop]  # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]
pins: [vllm, sglang]
lanes: [B]
games: [loop]
---

The step loop is the engine's heartbeat. This module explains the GPU's idle time between engine steps, and then closes it: which CPU work sits on the critical path, what async scheduling hides, what a CUDA graph replay saves, and why a batch dispatches to the graph it does.

This module is a draft. Its only lesson so far is a sample that gives the content compiler, the renderer and the gates a page that uses every block, and TR2's lessons replace it in W1.
