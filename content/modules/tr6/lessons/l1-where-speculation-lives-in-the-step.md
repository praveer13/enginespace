---
id: tr6.l1
module: tr6
title: "Where speculation lives in the step: draft, verify, the bonus token, the padded shape"
minutes: 35                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr6.verify-shape, tr6.acceptance-length]
builds_on: [ks:T5.L8, ks:T6.L6, ks:t5.speculative-decoding, ks:t6.spec-acceptance]
status: review                    # draft | review | live
lanes: [B]
games: [verifier]
---

{{ks:T5.L8}} gave you the trick and {{ks:T6.L6}} gave you its economics. A cheap proposer guesses the next few tokens, the target model checks every guess in one pass, and what comes out is what the target would have written alone. This lesson puts the trick where it lives in an engine, which is inside one step of the loop you met in TR2. It answers the three questions an engineer asks before reading any of the code: what one step computes, what comes out of it, and why the shape of the step reaches into the scheduler and the CUDA graphs.

## One step, three parts

A speculative step runs three parts in order.

1. **Draft.** A proposer guesses `k` tokens for every running request, where `k` is the config's `num_speculative_tokens`. The fourth lesson is about proposers. Here a proposer is a function from a request's context to `k` guessed tokens, and it has a cost.
2. **Verify.** The target runs one forward over every request's guesses. A request in decode presents the token it has not computed yet and its `k` drafts, so `1 + k` positions, and the scheduler hands it exactly those: it gives a running request every token it has not computed, drafts included. {{claim:vllm.scheduler.spec-drafts}}
3. **Accept.** The rejection sampler walks each request's drafts in order and keeps a prefix of them. Then it adds one more token. If it rejected a draft, the extra token is a *recovered* one that stands where the draft stood. If it kept every draft, it is a *bonus* token, sampled from the target alone. {{claim:vllm.spec.bonus-token}} The docstring of vLLM's sampler counts three kinds of output token, accepted, recovered and bonus, and a step's output is their sum. {{claim:vllm.spec.rejection-sampler.exact}}

So a request emits at least one token a step and at most `k + 1`. A step in which the first draft is rejected still emits a token, as a plain decode step does, and the price of the miss is the positions that were computed for nothing. That is why speculation is safe to turn on and why it is not always worth turning on. vLLM's own guide places its gain at {{claim:vllm.spec.where-it-pays}}, and kernelspace's warning in {{ks:T5.L8}} says why: the extra positions are free only while the step has compute to spare.

| Part | What does the work | What it costs |
|---|---|---|
| Draft | the proposer: a lookup on the CPU, or a small model or a head on the GPU | the proposer's own work, repeated up to `k` times |
| Verify | the target, in one forward | `1 + k` positions for each request |
| Accept | the rejection sampler, after the forward | a pass over the logits of every position that the forward computed |

:::card
kind: isomorphism
title: A branch predictor, with no pipeline flush
body: A CPU runs ahead on a guess about a branch, checks the guess when the branch resolves, and squashes the work if it was wrong. A speculative step does the same with tokens. The proposer guesses, the target resolves all the guesses in one pass, and the guesses after the first wrong one are discarded.
breaks: The CPU redoes its work after a wrong guess. A verify step redoes nothing, because the target's pass over the drafts was the verification, and the token that replaces the first rejected draft is drawn from the logits of that same pass. A wrong guess costs the positions after it and nothing else.
:::

## What the step costs the scheduler

The scheduler knows nothing about acceptance. It sees a request that wants `1 + k` tokens and counts them against the step's token budget, cutting the drafts to what is left of it. So speculation spends the budget that TR2's chunked prefill shares. A step of 64 decodes [estimated] with 4 drafts each [estimated] presents 320 tokens [derived] where plain decoding presents 64 [derived], and each token of the difference is a token that a prefill chunk did not get.

## The padded shape

Every decode row now has the same length, `1 + k`, and that sameness is the point. MRV2 calls a batch a uniform decode when every request has the same query length and none is still prefilling. {{claim:vllm.cudagraph.mrv2-uniform-count}} MRV1's dispatcher takes a decode row's query length to be one plus the number of speculative tokens. {{claim:vllm.cudagraph.mrv1-query-len}} A uniform decode is what a captured full decode graph replays, at the smallest captured size that holds it. Five requests [estimated] with three drafts each [estimated] present 20 tokens [derived]. vLLM captures graphs at {{claim:vllm.cudagraph.capture-sizes}}, so the step replays the graph captured at 24 tokens [derived] and computes 4 tokens [derived] that nobody asked for. {{claim:vllm.cudagraph.padding}}

One row of another length spoils it, and there are three ways to get one.

- **A new request.** A request that has just joined the running set has one token to schedule, not `1 + k`. The scheduler pads it up to `1 + num_speculative_tokens` so that the batch stays uniform, and when the budget is too short for the padding it leaves the request out of the step and does not schedule it unpadded. {{claim:vllm.scheduler.spec-pad}}
- **A prefill chunk.** A chunk of a prompt is a row of its own length, and a batch that holds one is not a uniform decode. It takes a piecewise graph, and the full decode graph stays idle.
- **The backend.** With a decode query length above one, a mode that captures full decode graphs needs an attention backend whose support is at least UNIFORM_BATCH. Below that, vLLM drops the mode to PIECEWISE if attention is split out of the graph, and to NONE if it is not. {{claim:vllm.cudagraph.downgrade-spec-decode}}

The graph that serves a step is therefore a fact about three numbers and one backend: the tokens the step presents, the largest size that was captured, whether any row differs in length, and what the backend can replay. The exit ticket asks you to read a batch that way.

## How many tokens a round buys

The first number to know about a speculative round is how many tokens it emits on average. Give every position the same chance α of being accepted, independently of the others, and let the draft have γ tokens. The round emits one token for sure, a second if the first draft is accepted, a third if the first two are, and so on up to the bonus. The expected number is the sum of those chances, `1 + α + α² + … + α^γ`, which the paper writes as a closed form. {{claim:spec.paper.expected-tokens}}

Commit to one number before you read on.

:::predict
id: tr6.l1.p1
prompt: Each draft is accepted with probability 0.8 [estimated], independently of the others, and a round drafts three tokens [estimated]. On average, how many tokens does a round emit, counting the extra token that every round ends with?
answer: { kind: numeric, unit: tokens, rel_tol: 0.02 }
reveal: after-game
kcs: [tr6.acceptance-length]
:::

Then play The Tasting's `chain` level on its practice seed. It draws a different acceptance at each position of the run, which is nearer to a real engine than one α, and it asks the same question.

:::game
id: verifier
level: chain
mode: practice
:::

With α = 0.8 [estimated] and γ = 3 [estimated] the sum is 1 + 0.8 + 0.64 + 0.512 = 2.952 [derived]. The table gives the sum for more cases.

| α [estimated] | γ = 1 [derived] | γ = 2 [derived] | γ = 4 [derived] | γ = 8 [derived] |
|---|---|---|---|---|
| 0.5 | 1.50 | 1.75 | 1.94 | 2.00 |
| 0.7 | 1.70 | 2.19 | 2.77 | 3.20 |
| 0.9 | 1.90 | 2.71 | 4.10 | 6.13 |

Two things stand out. The sum has a ceiling, 1 ÷ (1 − α) tokens [derived], however long the draft: at α = 0.5 [estimated] it is 2 tokens [derived], and eight drafts [estimated] already come within 0.01 tokens [derived] of it. And the γ-th draft adds α^γ tokens [derived] to the sum, a smaller amount for each draft that is added. Kernelspace's `push-luck` exercise in {{ks:T6.L6}} turns that into a choice of γ: a round costs one target step and γ draft steps, each a fraction of a target step, so the round's speedup is the tokens it emits divided by its cost. Here a draft step costs one tenth [estimated] of a target step, and α is 0.7 [estimated] at every position.

| γ [estimated] | Tokens a round emits [derived] | Cost of a round, in target steps [derived] | Speedup [derived] |
|---|---|---|---|
| 1 | 1.70 | 1.1 | 1.55 |
| 2 | 2.19 | 1.2 | 1.83 |
| 3 | 2.53 | 1.3 | 1.95 |
| 4 | 2.77 | 1.4 | 1.98 |
| 5 | 2.94 | 1.5 | 1.96 |
| 6 | 3.06 | 1.6 | 1.91 |
| 7 | 3.14 | 1.7 | 1.85 |
| 8 | 3.20 | 1.8 | 1.78 |

The best draft here is four tokens, and a fifth costs more than it brings: it adds 0.17 tokens [derived] and 0.1 of a target step [derived]. The speedup is rounded to two places, with halves rounded up. Real acceptance also falls along the run, because a later draft is judged only if the ones before it were kept, which moves the best γ down. The Tasting's `gamma` level is that problem on an acceptance curve and a cost it draws for you, and its answer is the length with the largest speedup.

:::card
kind: warning
title: A longer draft is not a faster one
body: Past the best length every extra draft adds to the cost of every round and to the tokens of a round only a little, and the speedup falls. The best length also moves with the traffic, because acceptance does. Text that repeats itself accepts well, and free-form text does not, so measure the acceptance on your own workload before you choose k.
:::

:::card
kind: notional-machine
id: spec
:::

## What to carry

- A speculative step drafts `k` tokens, verifies `1 + k` positions for every request in one forward, and emits the accepted drafts and one more token.
- Because every decode row presents `1 + k` tokens, the batch is a uniform decode, and a full graph can serve it. A prefill chunk, a request with fewer tokens, a backend that replays only single-token decodes or a step larger than the largest captured size each take that away.
- With one acceptance α, a round emits `1 + α + … + α^γ` tokens, the last draft adds α^γ of them, and the best draft length is where that stops paying for the draft.

## Exit check

This lesson tests two skills: reading what one speculative step computes and emits, and which graph serves it (`tr6.verify-shape`), and working out the tokens a round emits and where a longer draft stops paying (`tr6.acceptance-length`). The ticket is three items on fresh seeds, drawn from the positions a step computes, the tokens it emits and the graph that serves it, and it is passed with at least two right (ASSESSMENT §4.2). The graded `chain` and `gamma` levels of The Tasting earn `tr6.acceptance-length` on their own page, with the other graded levels.

:::item
family: tr6.verify-shape
level: 2
count: 3
:::
