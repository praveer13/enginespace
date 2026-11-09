# One token budget: chunked prefill, recompute preemption, and defaults that depend on your GPU

_The step loop · lesson `tr2.l2` · review · about 34 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T5.L3`, `ks:T5.L8`, `ks:T2.L4`, `ks:T2.L3`.

Knowledge components: `tr2.one-budget`, `tr2.gpu-dependent-defaults`.

The first call of a step is `schedule()`, and it is the one that decides what the rest of the step has to do. You wrote a scheduler in `lab 06` and compared it with a twin of vLLM v0.31.0's. The twin still holds at the pin: the policy is first come, first served, chunked prefill is on, the whole prompt must fit before a request is admitted, and the victim of a preemption is the last request to join the running list. **fcfs** [measured] **true** [measured] **true** [measured] **the last running request** [measured] This lesson re-reads the scheduler at v0.33.0 for what a policy leaves out. It has one budget, which every step spends in the same order, and that budget, with the cap on how many requests run, is set by your GPU's memory.

## No prefill phase and no decode phase

kernelspace T5.L7 and kernelspace T5.L3 taught prefill and decode as two kinds of work with two costs, and kernelspace T5.L8 mixed them with chunked prefill. The scheduler at the pin does not have the two kinds at all. Its own comment says there is no decoding phase and no prefill phase: each request has the tokens it has computed and the tokens it should have, and at each step the scheduler assigns tokens so that every request catches up. **one token budget** [measured]

That one idea covers a lot. A request in decode is one token behind. A request with a prompt is thousands behind. A request that just got a prefix-cache hit starts closer to the end, and a request with drafts has a few extra tokens to verify. The scheduler treats them alike, and so a step is a mix, not a phase. That is the difference from nano-vllm, whose step is all prefill or all decode, and which you read in TR1. **prefill or decode, never mixed** [measured]

## One budget, running first

Each step has a budget of tokens, and `max_num_batched_tokens` sets it unless the finer setting `max_num_scheduled_tokens` is given. **max_num_batched_tokens** [measured] The config calls it the most tokens that can be processed in one iteration. **tokens in one iteration** [measured] A second setting caps how many requests the step may hold, `max_num_seqs`. **sequences in one iteration** [measured] In the game below, that cap is the number of clips on the rail.

The scheduler spends the budget in a fixed order. It serves the running requests first, and the waiting requests after them, out of the same budget. **running first, then waiting** [measured] A running request in decode asks for one token, or one plus its drafts. A waiting request asks for its whole prompt, and gets the smaller of that and what is left of the budget, which is what cuts a long prompt into chunks. **the smaller of need and budget** [measured]

Commit to a number before you read on. The numbers in this question are round and made up, and they are the defaults of a `24 GB` card.

> **Predict `tr2.l2.p1`.** The budget of a step is 2,048 tokens [estimated], and 100 requests [estimated] are decoding, one token each. A prompt of 3,000 tokens [estimated] arrives and chunked prefill is on. How many tokens of the prompt does the first step that carries it take?
>
> The learner commits to a number in `tokens`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Play `first-2-slot`, "A clip empties", the second beat of First service. It is the cap on requests in a world of ticks: the rail has a fixed number of clips, a clip with no ticket is paid for and empty, and the level stops when a ticket has ended and you have dealt with its clip. The game dresses the loop as a line kitchen, where a ticket is a request and a clip is one of the `max_num_seqs` places in a step.

> **Play.** The game `loop`, level `first-2-slot`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## The same arithmetic in the sim

Here is the prediction's night in the course's step-loop model, on the small model's card, with a budget of 2,048 tokens [estimated] and room for 256 requests [estimated], which are vLLM's server defaults on a `24 GB` card. A hundred requests are decoding, and the prompt of 3,000 tokens [estimated] arrives. The steps are the ones that carry it, with the step just before them. Read on 2026-11-08 at `b5fb81a`.

| Step | Decode rows [measured] | Tokens of the prompt [measured] | Tokens in the step [measured] | The forward, µs [measured] |
|---|---|---|---|---|
| Before the prompt | 100 | 0 | 100 | 1,900 |
| The first with the prompt | 100 | 1,948 | 2,048 | 16,725 |
| The second with the prompt | 100 | 1,052 | 1,152 | 10,510 |
| After it | 101 | 0 | 101 | 2,278 |

![Two bars as long as the token budget, each a narrow segment for the decodes followed by the prompt's chunk](../../figures/tr2/l2-budget.svg)

_Two bars, one for each of the two steps that carry the long prompt, each as long as the token budget. In each the first segment, narrow and dark, is one token for each of the hundred running requests. In the first step the rest of the budget is the prompt's first chunk. In the second step the prompt's remaining tokens follow the decodes, and the part of the budget that is left is drawn as a dashed box._

The decodes come first and take 100 tokens [derived], so the prompt gets what is left, 1,948 tokens [derived], and the 1,052 [derived] that remain go in the next step. The second step leaves 896 tokens [derived] of its budget unused, because nothing else is waiting. Now look at the last column. Every request that is decoding waits for the whole step before it gets its next token. In the step that carries a chunk that is 16,725 µs [measured], where a decode-only step is 1,900 µs [measured]. A chunk costs the others in proportion to its size. That is the trade that kernelspace T5.L8 named: smaller chunks protect the running requests' time between tokens, and larger chunks get the new prompt its first token sooner.

With chunked prefill off, the prompt would not fit the budget that is left, and the scheduler would stop admitting waiting requests for that step. **stops the waiting loop** [measured] A prompt longer than the whole budget would never fit, and the course's model refuses to start such a run, because the prompt could never be scheduled. That is what the on-by-default setting buys you: a long prompt can always be served.

> **A time slice.** An operating system gives each runnable process a quantum, serves the processes it is already running, and cuts a long job to the slice that is left so that short ones are not stuck behind it. The token budget is the quantum, a chunk is a slice of a long prompt, and the running decodes are the short jobs.
>
> Where it breaks: A process keeps its state between slices. A prompt's state is the KV cache, which the next chunk reads, and if the pool runs out the request loses all of it. The scheduler frees its blocks, sets its computed tokens back to zero and recomputes.

## When the pool runs out

The budget limits tokens per step. The KV pool limits tokens held. When a running request needs a block and the pool has none, the scheduler preempts. Preemption at the pin is recompute only: the victim's blocks are freed, its count of computed tokens goes back to zero, and it returns to the front of the waiting queue. **recompute** [measured] Under first come, first served the victim is the request that joined the running list last. Under the priority policy it is the one with the largest priority value, and then the latest arrival. **the last running request** [measured]

kernelspace t2.swap-vs-recompute gave you the two ways to evict state, swapping it out and recomputing it, and V0 could do either. V1 at the pin has only the second: a request that is preempted recomputes what it lost when it comes back, and no copy of its state is kept. How much that costs depends on the pool. A freed block that has a hash goes to the back of the free queue and leaves it in least-recently-used order, **unhashed to the front, hashed to the back** [measured] so a victim that returns soon may find some of its blocks still cached, and TR5a takes that pool apart.

Admission has a rule that avoids some of this. At the pin the scheduler checks that a waiting request's whole prompt fits in the KV cache before it admits the request, and not only its first chunk. **true** [measured] A request that is let in has room for its prompt, so what can run the pool dry later is the tokens that the running requests generate.

## The same command on two GPUs

The budget and the cap are not constants. `get_batch_defaults` picks them from the card's memory, and the picks differ by the entry point, the server or the offline `LLM` class. Here are the three tiers that the course meets.

| Card | `max_num_batched_tokens` of `vllm serve` | `max_num_seqs` |
|---|---|---|
| `RTX 4090`, `24 GB` | **2048 tokens** [measured] | **256 sequences** [measured] |
| H100, `80 GB` | **8192 tokens** [measured] | **1024 sequences** [measured] |
| B200, `160 GiB` or more | **16384 tokens** [measured] | **1024 sequences** [measured] |

The line between the first two tiers is a card memory of `70 GiB`, and an A100 stays on the small tier whatever its memory. **70 GiB** [measured] The offline class has larger budgets on the same card, 8,192 tokens [measured] on a `4090` where the server has 2,048 [measured]. **8192 tokens** [measured] So `vllm serve model` on your `4090` and the same command on a rented H100 are two different configurations: a quarter of the token budget, and a quarter of the sequences [derived]. They are the same program, and they do not make the same steps.

SGLang sets its numbers by memory in the same spirit, and they are other numbers. It chunks prefill at **4096 tokens** [measured] on a `4090`-class card and **8192 tokens** [measured] on an H100, and its default policy is first come, first served too. **fcfs** [measured]

This is why the grader's fingerprint of a GPU run records `max_num_batched_tokens` and `max_num_seqs` beside the engine's version (ARCHITECTURE §9.5): a number from a run is a number for a configuration, and the configuration is partly the card's.

## Read the pin, not the post

Inside vLLM, the post you read in TR1, was written at a commit from before any of this, and it says that in V1 you enable chunked prefill by setting `long_prefill_token_threshold` to a positive integer. **long_prefill_token_threshold** [measured] At the pin chunked prefill is on without being asked, and the threshold defaults to zero, which means no cap on one prompt's chunk, and a request that is alone in the batch is never capped. **0 tokens** [measured] If you tuned the threshold because the post said to, you tuned a cap on a feature that was already running.

> **Card.** The notional-machine card `trace-room-steploop`.

## What to carry

- Every step has one budget of tokens, and a cap on requests. The scheduler serves the running requests first, then the waiting ones, and cuts a waiting prompt to what is left.
- A chunk costs every decoding request the whole step, so the chunk size trades their time between tokens for the new prompt's first token.
- Preemption at the pin is recompute only, and the victim is the last request to join the running list. Both the budget and the cap are set by the card's memory, so the same command is not the same configuration on two GPUs.

## Exit check

This lesson tests two skills: saying how a scheduler that spends one token budget on running and waiting requests together chooses what runs, and what it does when the KV pool runs out (`tr2.one-budget`), and saying why the same server command is a different configuration on two GPUs (`tr2.gpu-dependent-defaults`). The exit ticket is three items on fresh seeds. One gives the order requests joined and asks which is preempted, and two give a card and a command and ask for the budget or the cap. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2).

> **Practice.** Items from the generator family `tr2.preempt-victim`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr2.default-budget`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `inside-vllm.chunked-prefill-by-hand`: The post says that in V1 you enable chunked prefill by setting long_prefill_token_threshold to a positive integer. Value long_prefill_token_threshold [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `nano-vllm.step-shape`: nano-vllm's Scheduler.schedule returns a list of sequences and a flag that says whether they are prefill. It admits waiting sequences first, and it schedules a decode step only when no prefill was scheduled, so a step is all prefill or all decode. vLLM's scheduler has no such phases. Value prefill or decode, never mixed [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.schedule <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L25-L73>, read 2026-11-04).
- `sglang.sched.chunked-prefill-size.large`: On a card with 60 GiB to under 90 GiB of memory, which the source lists as H100 and A100, SGLang chunks prefill at 8,192 tokens by default at v0.5.23. Value 8192 tokens [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/memory_hook.py, handle_gpu_memory_settings <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/memory_hook.py#L132-L140>, read 2026-11-04).
- `sglang.sched.chunked-prefill-size.small`: On a card with 20 GiB to under 35 GiB of memory, which the source lists as A10, 4090 and 5090, and when the user sets nothing, SGLang chunks prefill at 4,096 tokens at v0.5.23. Value 4096 tokens [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/memory_hook.py, handle_gpu_memory_settings <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/memory_hook.py#L101-L112>, read 2026-11-04).
- `sglang.sched.policy-default`: SGLang's default schedule policy is fcfs. The other choices include lpm, random, dfs-weight, lof, priority, routing-key, hrrn and shortest-prefill-first. Value fcfs [measured], checked 2026-11-04 (source: SGLang v0.5.23, srt/arg_groups/fields/schedule.py, schedule_policy <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/fields/schedule.py#L86-L102>, read 2026-11-04).
- `vllm.batch-defaults.large.seqs`: On those cards max_num_seqs defaults to 1,024, for the server and for the offline class. Value 1024 sequences [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (70 GiB tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2993-L2996>, read 2026-11-04).
- `vllm.batch-defaults.large.server-tokens`: On a card with 70 GiB or more that is not an A100 and is not a GB10, such as an H100 or an H200, vllm serve defaults max_num_batched_tokens to 8,192. Value 8192 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (70 GiB tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2983-L2996>, read 2026-11-04).
- `vllm.batch-defaults.small.offline-tokens`: On the same cards the offline LLM class defaults max_num_batched_tokens to 8,192. Value 8192 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (the default tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2997-L3006>, read 2026-11-04).
- `vllm.batch-defaults.small.seqs`: On the same cards max_num_seqs defaults to 256, for the server and for the offline class. Value 256 sequences [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (the default tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L3003-L3006>, read 2026-11-04).
- `vllm.batch-defaults.small.server-tokens`: On a card with less than 70 GiB of memory, vllm serve defaults max_num_batched_tokens to 2,048 at v0.33.0. The course's RTX 4090 lab lands in this tier [derived], because the card's memory is under the line. Value 2048 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (the default tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2997-L3006>, read 2026-11-04).
- `vllm.batch-defaults.threshold.large-gib`: The 70 GiB line between the small and the large tier is a card memory of 70 GiB or more, and an A100 stays on the small tier whatever its memory. Value 70 GiB [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2983-L2987>, read 2026-11-04).
- `vllm.batch-defaults.xlarge.seqs`: On a card with 160 GiB or more max_num_seqs defaults to 1,024, for the server and for the offline class. Value 1024 sequences [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (160 GiB tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2979-L2982>, read 2026-11-04).
- `vllm.batch-defaults.xlarge.tokens`: On a card with 160 GiB or more, such as a B200 or a B300, both the server and the offline class default max_num_batched_tokens to 16,384. Value 16384 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/engine/arg_utils.py, get_batch_defaults (160 GiB tier) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/engine/arg_utils.py#L2973-L2982>, read 2026-11-04).
- `vllm.kv-pool.free-order`: When the last holder of a block lets go, the pool puts a block with no hash at the front of the free queue, where it is reused first, and a block with a hash at the back, so that cached blocks leave in least-recently-used order. The blocks go in the order the caller gives. Value unhashed to the front, hashed to the back [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/block_pool.py, BlockPool.free_blocks <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/block_pool.py#L816-L849>, read 2026-11-04).
- `vllm.scheduler.budget-default`: The token budget of a scheduling step is max_num_scheduled_tokens, which is max_num_batched_tokens unless it is set. Value max_num_batched_tokens [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.__init__ (max_num_scheduled_tokens) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L139-L142>, read 2026-11-05).
- `vllm.scheduler.budget-meaning`: The config documents max_num_batched_tokens as the maximum number of tokens that can be processed in a single iteration. Value tokens in one iteration [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/config/scheduler.py, SchedulerConfig.max_num_batched_tokens <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L49>, read 2026-11-05).
- `vllm.scheduler.chunk-to-budget`: When the scheduler takes a waiting request, the new tokens it gives it are the smaller of the tokens the request still needs and the token budget that is left, which is what cuts a long prompt into chunks. Value the smaller of need and budget [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule (a waiting request) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1346>, read 2026-11-05).
- `vllm.scheduler.chunked-prefill-default`: At v0.33.0 chunked prefill is on by default, so a prompt that does not fit the step's token budget is cut into chunks. Value true [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, enable_chunked_prefill <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L134>, read 2026-11-04).
- `vllm.scheduler.long-prefill-threshold-default`: The long-prefill token threshold defaults to 0, which means no cap on one prompt's chunk. The cap never applies to a request that is alone in the batch. Value 0 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, long_prefill_token_threshold <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L79>, read 2026-11-04).
- `vllm.scheduler.no-chunk-stop`: With chunked prefill off, a waiting request whose new tokens do not fit the budget that is left ends the scheduling of waiting requests for that step. Value stops the waiting loop [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule (chunked prefill off) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1338-L1344>, read 2026-11-05).
- `vllm.scheduler.no-phases`: The v1 scheduler has no prefill phase and no decode phase. Each request has only the tokens it has computed and the tokens it should have, and each step hands out one token budget so that every request catches up. Value one token budget [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L701-L710>, read 2026-11-04).
- `vllm.scheduler.order`: Within one step the scheduler serves the running requests first and the waiting requests after them, all out of the same token budget. Value running first, then waiting [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L793>, read 2026-11-04).
- `vllm.scheduler.policy-default`: The default scheduling policy at v0.33.0 is first come, first served. Value fcfs [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, policy <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L159>, read 2026-11-04).
- `vllm.scheduler.preemption-recompute`: Preemption in vLLM v0.33.0 is recompute only. The victim's blocks are freed, its computed-token count goes back to 0, and it returns to the front of the waiting queue. Value recompute [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, _preempt_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1799-L1842>, read 2026-11-04).
- `vllm.scheduler.preemption-victim`: Under the first-come, first-served policy the victim of a preemption is the request that joined the running list last. Under the priority policy it is the one with the largest priority value and then the latest arrival. Value the last running request [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L930-L938>, read 2026-11-04).
- `vllm.scheduler.reserve-full-isl`: At v0.33.0 the scheduler checks that a waiting request's whole prompt fits in the KV cache before it admits the request, not only its first chunk. Value true [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, scheduler_reserve_full_isl <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L190>, read 2026-11-04).
- `vllm.scheduler.seqs-meaning`: The config documents max_num_seqs as the maximum number of sequences to be processed in a single iteration. Value sequences in one iteration [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/config/scheduler.py, SchedulerConfig.max_num_seqs <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L63>, read 2026-11-05).
