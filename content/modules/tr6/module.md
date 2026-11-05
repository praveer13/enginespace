---
id: tr6
title: Speculation and structure
status: review
hours: 8                          # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 6, F: 2 }     # [estimated]
outcomes:
  - Say what one speculative step computes and emits, and why its shape decides which CUDA graph can serve it
  - Write a rejection sampler whose output is exactly the target model's distribution, and test that claim with a chi-square at a stated significance and power
  - Tell the proposers of the pinned engines apart by what each needs, and say which runner a configuration runs on
  - Predict whether a grammar mask's fill hides under the forward, and how long a gap it leaves when it does not
artifacts:
  - id: rejection-sampler
    lane: B
    title: A rejection sampler on your Rust code, tested for exactness with chi-square
  - id: mask-overlap
    lane: B
    title: The mask-overlap timeline
  - id: tr6.proposer
    lane: F
    title: A proposer in the pinned vLLM
worlds: [spec, trace-room-steploop]  # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T5.L8, ks:T6.L6, ks:T6.L8, tr2]
pins: [vllm, sglang]
lanes: [B, F]
games: [verifier, loop]
labs: [rejection-sampler, tr6.proposer]
---

A step of an engine ends where a token is chosen, and this module is about two things that are done to that choice. One is verification. A cheap proposer guesses several tokens, and the sampler keeps as many of the guesses as it can while the output stays exactly what the target model alone would have written. The other is structure. A grammar forbids tokens, and the engine has to work out which, in time. In-engine speculation is this course's to teach and nobody else's, because the specialization catalog gives it to TR6. The grammar engine belongs to another course. TR6 recaps it in under an hour [estimated], and then does the one thing only an engine course can do with it, which is to ask where its work falls in the step and what that costs the GPU.

It is the third part of the course's third outcome, an exact rejection sampler, and the mask belongs to its second, a step split into its kernels, its CPU gaps and its overlap. {{ks:T5.L8}} and {{ks:T6.L6}} are the lessons it builds on for speculation, and {{ks:T6.L8}} is the one for the mask.

## The browser part

The browser part is five lessons, a game, a lab and a level, and none of it needs a GPU.

1. Where speculation lives in the step: draft, verify, the bonus token, the padded shape.
2. The rejection sampler, exactly.
3. Testing exactness: chi-square, power, and a real bug.
4. Proposers: n-gram, suffix, draft model, EAGLE-3 and MTP, and what moved at v0.33.0.
5. The grammar mask's four phases, and its overlap with the forward.

The game is The Tasting (`verifier`), and it has six levels. The practice levels are `overlap`, `greedy-ngram` and `mutants`: the overlap of two distributions, a draft that names no probabilities, and five samplers to audit. The graded levels are `exact`, `chain` and `gamma`, and they draw fresh numbers each time: sculpt the re-plating until what goes out is exactly the target's, predict the tokens a round emits, and choose the draft length. In The Tasting the commis plates a run of courses ahead of the chef, who keeps each plate with a chance and re-plates from what the commis under-plates. Every distribution in it is synthetic, drawn by the course's simulator, and the real engines are the judge.

The lab is `rejection-sampler`, called Keep or Re-plate on its page. You write the verify step in Rust, as four functions, and the page runs your module against the course's oracle: every coin of the accept step, the residual, every draw of the walk over the weights, rounds in which no coin matters, and a chi-square test of what goes out on two fresh seeds. The oracle has a bestiary of six wrong samplers, and each of them must fail a named check.

The mask-overlap timeline is Service's `mask` level, the allergy card, together with a graded task of its own. The level draws a step's CPU lane and GPU lane with the grammar's bitmask on the CPU side, and asks whether the fill hides under the forward. The graded task is the ticket family `tr6.mask-fits`, drawn on fresh numbers from the same model. It asks for the GPU's idle time between two forwards, and it holds the answer to ASSESSMENT's bar of ±10% [estimated] (§4.3). The fifth lesson walks the timeline.

## The part that needs a GPU

The GPU part is a lab, `tr6.proposer`: a proposer of your own in the pinned vLLM. It arrives with the grader (W2, D-039). Until then the Build card below shows what the lab will ask and does not run it. Its plan has three stages. The first runs vLLM's built-in n-gram proposer against a plain run on the challenge's prompts, and the grader checks that the two outputs agree where they should. The second runs your own n-gram or suffix proposer through the custom-proposer hook, `custom_class`, which runs on the legacy runner at the pin. {{claim:vllm.spec.custom-class-mrv1}} The third pairs a plain run with a speculative one on the challenge's workload, and your browser recomputes the speedup from the raw records, with a seeded bootstrap interval.

The third stage compares like with like. On the legacy runner, async scheduling turns itself off for the methods outside a short list. {{claim:vllm.async-scheduling.mrv1-limits}} A plain run on the default runner with async scheduling on would fold two other changes into the speedup, so the plain run uses the same runner and the same async setting as the speculative run, and the receipt records both.

Credit follows the same line. The module is browser-complete when its exit tickets, the lab, the graded levels of The Tasting and the mask-overlap task are credited. It is complete when the proposer lab's second and third stages are credited as well, and a Prove-it run with the agent closed is on record (ASSESSMENT §9).

:::lab
id: rejection-sampler
lane: B
stages: [s1, s2, s3, s4]
:::

:::lab
id: tr6.proposer
lane: F
stages: [s1, s2, s3]
:::

:::card
kind: notional-machine
id: spec
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::
