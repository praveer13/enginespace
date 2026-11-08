---
id: tr2.l2
module: tr2
title: "One token budget: chunked prefill, recompute preemption, and defaults that depend on your GPU"
minutes: 34                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.one-budget, tr2.gpu-dependent-defaults]
builds_on: [ks:T5.L7, ks:T5.L3, ks:T5.L8, ks:T2.L4, ks:T2.L3]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

The first call of a step is `schedule()`, and it is the one that decides what the rest of the step has to do. You wrote a scheduler in `lab 06` and compared it with a twin of vLLM v0.31.0's. The twin still holds at the pin: the policy is first come, first served, chunked prefill is on, the whole prompt must fit before a request is admitted, and the victim of a preemption is the last request to join the running list. {{claim:vllm.scheduler.policy-default}} {{claim:vllm.scheduler.chunked-prefill-default}} {{claim:vllm.scheduler.reserve-full-isl}} {{claim:vllm.scheduler.preemption-victim}} This lesson re-reads the scheduler at v0.33.0 for what a policy leaves out. It has one budget, which every step spends in the same order, and that budget, with the cap on how many requests run, is set by your GPU's memory.

## No prefill phase and no decode phase

{{ks:T5.L7}} and {{ks:T5.L3}} taught prefill and decode as two kinds of work with two costs, and {{ks:T5.L8}} mixed them with chunked prefill. The scheduler at the pin does not have the two kinds at all. Its own comment says there is no decoding phase and no prefill phase: each request has the tokens it has computed and the tokens it should have, and at each step the scheduler assigns tokens so that every request catches up. {{claim:vllm.scheduler.no-phases}}

That one idea covers a lot. A request in decode is one token behind. A request with a prompt is thousands behind. A request that just got a prefix-cache hit starts closer to the end, and a request with drafts has a few extra tokens to verify. The scheduler treats them alike, and so a step is a mix, not a phase. That is the difference from nano-vllm, whose step is all prefill or all decode, and which you read in TR1. {{claim:nano-vllm.step-shape}}

## One budget, running first

Each step has a budget of tokens, and `max_num_batched_tokens` sets it unless the finer setting `max_num_scheduled_tokens` is given. {{claim:vllm.scheduler.budget-default}} The config calls it the most tokens that can be processed in one iteration. {{claim:vllm.scheduler.budget-meaning}} A second setting caps how many requests the step may hold, `max_num_seqs`. {{claim:vllm.scheduler.seqs-meaning}} In the game below, that cap is the number of clips on the rail.

The scheduler spends the budget in a fixed order. It serves the running requests first, and the waiting requests after them, out of the same budget. {{claim:vllm.scheduler.order}} A running request in decode asks for one token, or one plus its drafts. A waiting request asks for its whole prompt, and gets the smaller of that and what is left of the budget, which is what cuts a long prompt into chunks. {{claim:vllm.scheduler.chunk-to-budget}}

Commit to a number before you read on. The numbers in this question are round and made up, and they are the defaults of a `24 GB` card.

:::predict
id: tr2.l2.p1
prompt: "The budget of a step is 2,048 tokens [estimated], and 100 requests [estimated] are decoding, one token each. A prompt of 3,000 tokens [estimated] arrives and chunked prefill is on. How many tokens of the prompt does the first step that carries it take?"
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr2.one-budget]
:::

Play `first-2-slot`, "A clip empties", the second beat of First service. It is the cap on requests in a world of ticks: the rail has a fixed number of clips, a clip with no ticket is paid for and empty, and the level stops when a ticket has ended and you have dealt with its clip. The game dresses the loop as a line kitchen, where a ticket is a request and a clip is one of the `max_num_seqs` places in a step.

:::game
id: loop
level: first-2-slot
mode: practice
:::

## The same arithmetic in the sim

Here is the prediction's night in the course's step-loop model, on the small model's card, with a budget of 2,048 tokens [estimated] and room for 256 requests [estimated], which are vLLM's server defaults on a `24 GB` card. A hundred requests are decoding, and the prompt of 3,000 tokens [estimated] arrives. The steps are the ones that carry it, with the step just before them. Read on 2026-11-08 at `b5fb81a`.

| Step | Decode rows [measured] | Tokens of the prompt [measured] | Tokens in the step [measured] | The forward, µs [measured] |
|---|---|---|---|---|
| Before the prompt | 100 | 0 | 100 | 1,900 |
| The first with the prompt | 100 | 1,948 | 2,048 | 16,725 |
| The second with the prompt | 100 | 1,052 | 1,152 | 10,510 |
| After it | 101 | 0 | 101 | 2,278 |

:::figure
src: figures/tr2/l2-budget.svg
alt: Two bars as long as the token budget, each a narrow segment for the decodes followed by the prompt's chunk
description: Two bars, one for each of the two steps that carry the long prompt, each as long as the token budget. In each the first segment, narrow and dark, is one token for each of the hundred running requests. In the first step the rest of the budget is the prompt's first chunk. In the second step the prompt's remaining tokens follow the decodes, and the part of the budget that is left is drawn as a dashed box.
origin: generated
:::

The decodes come first and take 100 tokens [derived], so the prompt gets what is left, 1,948 tokens [derived], and the 1,052 [derived] that remain go in the next step. The second step leaves 896 tokens [derived] of its budget unused, because nothing else is waiting. Now look at the last column. Every request that is decoding waits for the whole step before it gets its next token. In the step that carries a chunk that is 16,725 µs [measured], where a decode-only step is 1,900 µs [measured]. A chunk costs the others in proportion to its size. That is the trade that {{ks:T5.L8}} named: smaller chunks protect the running requests' time between tokens, and larger chunks get the new prompt its first token sooner.

With chunked prefill off, the prompt would not fit the budget that is left, and the scheduler would stop admitting waiting requests for that step. {{claim:vllm.scheduler.no-chunk-stop}} A prompt longer than the whole budget would never fit, and the course's model refuses to start such a run, because the prompt could never be scheduled. That is what the on-by-default setting buys you: a long prompt can always be served.

:::card
kind: isomorphism
title: A time slice
body: An operating system gives each runnable process a quantum, serves the processes it is already running, and cuts a long job to the slice that is left so that short ones are not stuck behind it. The token budget is the quantum, a chunk is a slice of a long prompt, and the running decodes are the short jobs.
breaks: A process keeps its state between slices. A prompt's state is the KV cache, which the next chunk reads, and if the pool runs out the request loses all of it. The scheduler frees its blocks, sets its computed tokens back to zero and recomputes.
:::

## When the pool runs out

The budget limits tokens per step. The KV pool limits tokens held. When a running request needs a block and the pool has none, the scheduler preempts. Preemption at the pin is recompute only: the victim's blocks are freed, its count of computed tokens goes back to zero, and it returns to the front of the waiting queue. {{claim:vllm.scheduler.preemption-recompute}} Under first come, first served the victim is the request that joined the running list last. Under the priority policy it is the one with the largest priority value, and then the latest arrival. {{claim:vllm.scheduler.preemption-victim}}

{{ks:t2.swap-vs-recompute}} gave you the two ways to evict state, swapping it out and recomputing it, and V0 could do either. V1 at the pin has only the second: a request that is preempted recomputes what it lost when it comes back, and no copy of its state is kept. How much that costs depends on the pool. A freed block that has a hash goes to the back of the free queue and leaves it in least-recently-used order, {{claim:vllm.kv-pool.free-order}} so a victim that returns soon may find some of its blocks still cached, and TR5a takes that pool apart.

Admission has a rule that avoids some of this. At the pin the scheduler checks that a waiting request's whole prompt fits in the KV cache before it admits the request, and not only its first chunk. {{claim:vllm.scheduler.reserve-full-isl}} A request that is let in has room for its prompt, so what can run the pool dry later is the tokens that the running requests generate.

## The same command on two GPUs

The budget and the cap are not constants. `get_batch_defaults` picks them from the card's memory, and the picks differ by the entry point, the server or the offline `LLM` class. Here are the three tiers that the course meets.

| Card | `max_num_batched_tokens` of `vllm serve` | `max_num_seqs` |
|---|---|---|
| `RTX 4090`, `24 GB` | {{claim:vllm.batch-defaults.small.server-tokens}} | {{claim:vllm.batch-defaults.small.seqs}} |
| H100, `80 GB` | {{claim:vllm.batch-defaults.large.server-tokens}} | {{claim:vllm.batch-defaults.large.seqs}} |
| B200, `160 GiB` or more | {{claim:vllm.batch-defaults.xlarge.tokens}} | {{claim:vllm.batch-defaults.xlarge.seqs}} |

The line between the first two tiers is a card memory of `70 GiB`, and an A100 stays on the small tier whatever its memory. {{claim:vllm.batch-defaults.threshold.large-gib}} The offline class has larger budgets on the same card, 8,192 tokens [measured] on a `4090` where the server has 2,048 [measured]. {{claim:vllm.batch-defaults.small.offline-tokens}} So `vllm serve model` on your `4090` and the same command on a rented H100 are two different configurations: a quarter of the token budget, and a quarter of the sequences [derived]. They are the same program, and they do not make the same steps.

SGLang sets its numbers by memory in the same spirit, and they are other numbers. It chunks prefill at {{claim:sglang.sched.chunked-prefill-size.small}} on a `4090`-class card and {{claim:sglang.sched.chunked-prefill-size.large}} on an H100, and its default policy is first come, first served too. {{claim:sglang.sched.policy-default}}

This is why the grader's fingerprint of a GPU run records `max_num_batched_tokens` and `max_num_seqs` beside the engine's version (ARCHITECTURE §9.5): a number from a run is a number for a configuration, and the configuration is partly the card's.

## Read the pin, not the post

Inside vLLM, the post you read in TR1, was written at a commit from before any of this, and it says that in V1 you enable chunked prefill by setting `long_prefill_token_threshold` to a positive integer. {{claim:inside-vllm.chunked-prefill-by-hand}} At the pin chunked prefill is on without being asked, and the threshold defaults to zero, which means no cap on one prompt's chunk, and a request that is alone in the batch is never capped. {{claim:vllm.scheduler.long-prefill-threshold-default}} If you tuned the threshold because the post said to, you tuned a cap on a feature that was already running.

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What to carry

- Every step has one budget of tokens, and a cap on requests. The scheduler serves the running requests first, then the waiting ones, and cuts a waiting prompt to what is left.
- A chunk costs every decoding request the whole step, so the chunk size trades their time between tokens for the new prompt's first token.
- Preemption at the pin is recompute only, and the victim is the last request to join the running list. Both the budget and the cap are set by the card's memory, so the same command is not the same configuration on two GPUs.

## Exit check

This lesson tests two skills: saying how a scheduler that spends one token budget on running and waiting requests together chooses what runs, and what it does when the KV pool runs out (`tr2.one-budget`), and saying why the same server command is a different configuration on two GPUs (`tr2.gpu-dependent-defaults`). The exit ticket is three items on fresh seeds. One gives the order requests joined and asks which is preempted, and two give a card and a command and ask for the budget or the cap. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2).

:::item
family: tr2.preempt-victim
level: 2
count: 1
:::

:::item
family: tr2.default-budget
level: 2
count: 2
:::
