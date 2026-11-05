---
id: tr6.l5
module: tr6
title: "The grammar mask's four phases, and its overlap with the forward (DP4's minimal recap inside)"
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr6.mask-phases, tr6.mask-overlap]
builds_on: [ks:T6.L8, ks:t6.grammar-masks]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

Every step of an engine ends where a token is chosen, and the first four lessons did one thing to that choice: they verified it. This lesson does the other. A grammar forbids tokens, and the engine has to work out which, for each structured request, before the sampler can run. That work is the **mask**. It is CPU work on the engine's critical path, and the question an engine course owes it is where it falls in the step, and whether it hides under the GPU's forward. The grammar engine itself belongs to DP4. The first section recaps what you need of it, and the rest is TR6's.

## What the mask is, recapped from DP4

A grammar mask answers one question: given what has been generated, which tokens of the vocabulary may come next? It is a token mask and not a string mask. A BPE token can contain several grammar terminals and several transitions in one model step, so the mask has to run a whole token's bytes through the parser from its current stack, and a check on the first character alone is wrong. {{claim:mask.kernelspace.token-mask}} The answer is a bitmask with one bit for each token of the vocabulary, and the sampler applies it to the logits so that a forbidden token cannot be drawn.

XGrammar is one of the backends that vLLM can build masks with. {{claim:vllm.mask.backends}} It splits the vocabulary in two: the tokens whose validity does not depend on the parser's stack can be prechecked, and the context-dependent ones have to be interpreted at run time. {{claim:mask.paper.xgrammar-split}} So part of a row of the mask can be looked up and part has to be worked out, and how long a row takes is a property of the grammar and its state. The rest of the lesson treats it as one number, the grammar's weight per row. XGrammar's authors also co-designed the grammar engine with the inference engine so that the grammar computation overlaps with GPU executions, {{claim:mask.paper.xgrammar-overlap}} and that overlap is what this lesson times.

Two facts about vLLM's side finish the recap. It takes five kinds of constraint: a choice among strings, a regex, a JSON schema, a context-free grammar and a structural tag. {{claim:vllm.mask.constraint-kinds}} And the backend matters to the output, because a different backend can change which tokens are allowed and so the generated text. {{claim:vllm.mask.backend-changes-tokens}} A benchmark or a bug report about structured output names its backend.

## The four phases at the pin

At v0.33.0 the mask has four phases in vLLM, and only two of them touch the step loop.

| Phase | Where it runs | What the pin does |
|---|---|---|
| compile | a thread pool, off the engine thread | The grammar is built asynchronously, and the request waits in `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR` until the scheduler sees it compiled. {{claim:vllm.mask.grammar-compile-async}} |
| fill | the engine core thread, on the CPU | After `execute_model` has launched the forward without blocking, the CPU builds the bitmask, so it is computed while the GPU runs. {{claim:vllm.mask.overlap}} Each structured request owns a row for each speculative position and one for the next token, {{claim:vllm.mask.fill-rows-per-request}} and the fill is serial up to {{claim:vllm.mask.fill-parallel-threshold}}. |
| apply | the GPU, in the sample step | The bitmask is applied to the logits in place, after the model has computed them and before the sampler runs. {{claim:vllm.mask.apply-in-place}} |
| deferral | the scheduler and the engine's batch queue | Under async scheduling a step whose structured requests still have a token in flight is flagged `pending_structured_output_tokens`, {{claim:vllm.mask.pending-flag}} and its sampling waits until the previous step's output has been processed. {{claim:vllm.mask.deferred-sampling}} |

Compile is off the step loop altogether. It costs the request its time to first token and the GPU nothing. Apply is on the GPU, between the logits and the sampler, and the kernel that does it is the Kernels course's. Fill and deferral are the CPU's, they sit on the critical path of the loop, and they are what the rest of the lesson times.

## The mask-overlap timeline

Take one step of the plain loop. The CPU **plans** the step, which is scheduling, preparing the inputs and launching, and that takes `P`. The GPU runs the **forward** for `F`. The CPU then **reads** the result back and samples, which takes `R`. With no grammar the GPU idles between two forwards for the CPU work that lies between them, `P + R`. A structured request adds a fill. A step with `S` structured requests and `k` drafts a request needs `S × (1 + k)` rows, one for each position that may be sampled, and a row costs `c`, so the fill takes `M = S × (1 + k) × c`.

Every number in the scenes below is synthetic. The plan is 100 µs [estimated], the read 60 µs [estimated] and the forward 500 µs [estimated], and the step holds 12 structured requests [estimated] with no drafts, so 12 rows [derived]. A light grammar costs 20 µs a row [estimated], so its fill takes 240 µs [derived], and a heavy one costs 60 µs a row [estimated], so its fill takes 720 µs [derived].

Where the fill falls decides what the GPU waits for. There are three cases.

1. **Overlapped.** This is the plain step, with async scheduling off, in the engine's own order. The fill runs while the GPU runs the forward, so the GPU idles for the plan, the read and whatever part of the fill outlasts the forward: `P + R + max(0, M − F)`.
2. **Serial.** The fill is left until after the forward, as it is in a path that cannot overlap its CPU work. None of it hides: `P + R + M`.
3. **Async scheduling.** This is vLLM's default at the pin. {{claim:vllm.async-scheduling.default}} The CPU plans step N+1 while step N runs, which is the loop's best trick. But a structured request's mask needs the token of the step before it, which is still in flight, so the fill waits until that step has been read back. The plan, the read and the fill are then one chain of CPU work that has to fit under the forward: `max(0, P + R + M − F)`. Whether the engine would have overlapped the fill is moot, because it is deferred either way.

Commit to one number before you read the table.

:::predict
id: tr6.l5.p1
prompt: A plain step, with async scheduling off and the fill built while the forward runs, has a plan of 100 µs [estimated], a read of 60 µs [estimated] and a forward of 500 µs [estimated]. It holds 12 structured requests [estimated] with no drafts, and the grammar costs 60 µs [estimated] a row. For how many µs does the GPU idle between two forwards?
answer: { kind: numeric, unit: us, rel_tol: 0.1 }
reveal: after-game
kcs: [tr6.mask-overlap]
:::

Then play Service's `mask` level, the allergy card, on its practice seed. Before a course is chosen the expo strikes the dishes the table may not have, and the card is written during the fire. If it is not done when the fire ends, the line waits. The level asks whether the card fits inside the fire, and it runs the plain step.

:::game
id: loop
level: mask
mode: practice
:::

The course's step loop gives the gap for every case. Each cell is the GPU's idle time between two forwards in the loop's steady state, measured by the course's sim on 2026-11-05 at `f4c2395`.

| Case | No grammar, in µs [measured] | Light grammar, in µs [measured] | Heavy grammar, in µs [measured] |
|---|---|---|---|
| Overlapped | 160 | 160 | 380 |
| Serial | 160 | 400 | 880 |
| Async scheduling | 0 | 0 | 380 |

Read each cell from the formulas. Overlapped and light is `100 + 60 + max(0, 240 − 500)` = 160 µs [derived], the same as with no grammar, so the card fits and costs the GPU nothing. Overlapped and heavy is `100 + 60 + (720 − 500)` = 380 µs [derived], and the 220 µs [derived] by which the fill outlasts the forward is the whole of what the mask adds. Serial adds the fill whole: 160 + 240 = 400 µs [derived] and 160 + 720 = 880 µs [derived]. Async scheduling with no grammar already idles for nothing, because the plan and the read hide under the forward, and with the light fill the chain of 400 µs [derived] still fits under it, so the gap stays 0 [derived]. The heavy chain is 880 µs [derived], and 880 − 500 = 380 µs [derived] is what does not fit.

Look at the heavy column. Once the fill is longer than the forward, overlapped and async give the same gap, `P + R + M − F`, which is 380 µs [measured] in both. Async scheduling wins a bubble back from the plan and the read, and a fill that outlasts the forward takes it all out again.

:::figure
src: figures/tr6/l5-mask-timeline.svg
alt: Four timelines of one step with a grammar mask, a CPU lane over a GPU lane, showing the fill hidden under the forward, the fill outlasting it, the fill after it, and async scheduling
description: Each panel draws the CPU lane above the GPU lane on one scale in microseconds. The CPU plans, fills the grammar's bitmask and reads the result back, and the GPU runs the forward. In the first panel the light fill sits under the forward and the GPU idles for the plan and the read only. In the second panel the heavy fill runs past the end of the forward, the read waits for it, and the gap grows by the overhang. In the third panel the fill comes after the forward and the whole of it is added to the gap. In the fourth panel async scheduling lets the CPU run a step ahead, the forwards run back to back, and the light fill leaves no gap at all.
origin: generated
:::

:::card
kind: isomorphism
title: Double buffering, until the producer needs the consumer's output
body: A producer fills one buffer while a consumer drains the other, and the pair runs at the speed of the slower of the two. The fill is the producer, the forward is the consumer, and a fill that is shorter than the forward costs nothing. A fill that is longer makes the consumer wait for the difference.
breaks: Double buffering works because the producer's next buffer does not depend on what the consumer did with the last one. Under async scheduling a structured request's next mask does depend on the token that the forward is still producing. The two stages become one chain, and the whole chain has to fit under the forward.
:::

## Speculation lengthens the card

Speculation multiplies the rows. A request that drafts 4 tokens [estimated] needs 5 rows [derived] where a plain one needs 1. The same 12 requests with the light grammar now fill 12 × 5 × 20 = 1,200 µs [derived]. Take the forward to be the same 500 µs [estimated], since a decode step this small is memory-bound and the extra positions add little, as the first lesson said. The overlapped gap is then `100 + 60 + (1,200 − 500)` = 860 µs [derived], and the step loop measures 860 µs [measured], against 160 µs [measured] for the same grammar without drafts. The grammar that fit now outlasts the forward. And with drafts configured, the pinned engine does not use its parallel fill at all, so a large batch does not rescue it. {{claim:vllm.mask.fill-rows-per-request}}

That is the module's two halves meeting. Speculation adds positions to verify, structure adds rows to fill, and the rows scale with the positions. A server that serves structured requests and speculates has to be measured with both on.

:::card
kind: warning
title: Fits today, outlasts tomorrow
body: The fill hides only while it is shorter than the forward, and it grows with the number of structured requests, with the drafts for each request and with the grammar's weight per row. A change to any of them, or a faster forward, can turn a hidden fill into a gap. Measure the gap with the grammar on and off, on the same step, before you say the mask is free.
:::

## Another engine's answer

SGLang meets the same problem differently, and its answers are a key to check yours against. Without speculation it delays the current batch's sampling until the last batch has been processed, because the sample depends on that result, and a grammar is the example its own comment gives. {{claim:sglang.mask.delayed-sampling}} With EAGLE, STANDALONE and the DFLASH family, the worker advances the grammar state machine inside `verify()` behind a grammar barrier, so that the CPU's grammar work hides under the GPU's draft and verify, and NGRAM stays synchronous by design. {{claim:sglang.mask.grammar-barrier}} NGRAM also disables the overlap scheduler. {{claim:sglang.spec.ngram-no-overlap}} In the timeline's terms, a path that cannot overlap its CPU work with the forward is the serial row of the table, and it pays the whole fill.

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What to carry

- The mask has four phases at the pin. Compile is asynchronous and off the loop, fill is the CPU's after the forward launches, apply is on the GPU in the sampler, and deferral is what async scheduling does to a step whose structured requests still await a token.
- The GPU's gap with a mask is `P + R + max(0, M − F)` when the fill overlaps the forward, `P + R + M` when it does not, and `max(0, P + R + M − F)` under async scheduling. The fill is `S × (1 + k) × c`, so drafts multiply it.
- A fill that fits is free, and a fill that outlasts the forward costs the overhang. Under async scheduling the whole chain of plan, read and fill has to fit.

## Exit check

This lesson tests two skills: naming the mask's four phases and where each runs (`tr6.mask-phases`), and predicting how long the GPU waits for a grammar mask, whether the fill hides or not (`tr6.mask-overlap`). The ticket is three items on fresh seeds, one on the phases and two on the gap, and it is passed with at least two right (ASSESSMENT §4.2). The two gap items are the course's graded task for the mask, `tr6.mask-fits`, which draws the model of Service's `mask` level on fresh numbers and holds an answer to ASSESSMENT's bar of within 10% [estimated] of the model's gap (§4.3).

:::item
family: tr6.mask-phases
level: 2
count: 1
:::

:::item
family: tr6.mask-fits
level: 2
count: 2
:::
