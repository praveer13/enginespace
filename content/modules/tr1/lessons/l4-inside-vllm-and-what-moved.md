---
id: tr1.l4
module: tr1
title: '"Inside vLLM" and what moved by v0.33.0'
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.read-at-the-pin, tr1.vllm-lifecycle]
builds_on: [ks:T5.L10, ks:T5.L7, ks:T5.L5]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

"Inside vLLM" is the most-read map of vLLM's V1 engine. It walks one engine from the offline `LLM` class to a multi-node server, {{claim:inside-vllm.scope}} and it says on its first page which code it read, as a commit. {{claim:inside-vllm.analysis-commit}} That commit is dated 2025-08-09. {{claim:inside-vllm.commit-date}} The version this course pins, v0.33.0, was uploaded to PyPI on 2026-11-02, which is 450 days after the commit [derived]. {{claim:vllm.release.pypi-upload}}

The post is worth reading because most of what it says is still true. What changes between the post and the pin is the code's address and its detail. A learner who reads the post as a description of v0.33.0 will name a file that is now a shim, a state that is now called something else, and a feature the post lists as experimental that is now on by default. This lesson teaches the skill of reading an old map at a new pin: take a name from the post, find it at the pin, and when it is not there, find what took its place. The same skill applies to every blog post, conference talk and design document you will ever use to find your way into a fast-moving code base.

## What the post draws

The post builds in layers. It starts with the synchronous engine, the `LLM` class driving an `EngineCore` in the caller's process. It adds the scheduler, the KV cache manager, prefix caching, structured output, speculation and KV transfer. Then it moves the engine core into a process of its own, with a `MultiProcExecutor` for more than one GPU. Last it puts an `AsyncLLM` in front, with a ZeroMQ socket between the two. The last picture is the one the game's `inside` level draws.

The engine core process of that picture has three threads, and the post names them. An input thread blocks on the socket and puts each decoded request on `input_queue`. A main thread takes from it and runs the engine's step. An output thread takes results from `output_queue` and sends them to the API server. {{claim:inside-vllm.three-threads}} The post also says what the V1 scheduler can do that its predecessor could not: it mixes prefill and decode requests in the same step. {{claim:inside-vllm.mixes-prefill-decode}} You read the other side of that sentence in the second lesson.

## Before you play

Two questions, to commit to before you lay the post's path. The first is the game's own, and the engine is the one the post describes. The second asks how much the file you will spend most of your time in has grown, and you can estimate it from the age of the post.

:::predict
id: tr1.l4.p1
prompt: In the engine that the post describes, serving a streamed answer at one rank, how many process boundaries does a sampled token cross on its way to the client?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.vllm-lifecycle]
:::

:::predict
id: tr1.l4.p2
prompt: The post's vllm/v1/core/sched/scheduler.py has 1,163 lines [measured] at commit 42172ad. By what factor has the file grown by v0.33.0?
answer: { kind: numeric, unit: x, rel_tol: 0.15 }
reveal: after-game
kcs: [tr1.read-at-the-pin]
:::

Then play the `inside` level on its practice seed. It lays the post's world: an API server and an engine core as two processes, and in the engine core an input thread, the busy loop and an output thread passing the ticket on spikes. Notice what is not in it. There is no `aborts_queue`, no `sample_tokens`, and no step that is launched before it is read.

:::game
id: engine-floor
level: inside
mode: practice
:::

## The step, then and now

The engine core's step is the best place to see how far a name can stay the same while its body changes. [This](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L261-L280) is the post's, at its commit.

```python
# vllm/v1/engine/core.py, lines 261 to 280 at 42172ad
def step(self) -> tuple[dict[int, EngineCoreOutputs], bool]:
    ...
    if not self.scheduler.has_requests():
        return {}, False
    scheduler_output = self.scheduler.schedule()
    model_output = self.execute_model_with_error_logging(
        self.model_executor.execute_model,  # type: ignore
        scheduler_output)
    engine_core_outputs = self.scheduler.update_from_output(
        scheduler_output, model_output)  # type: ignore

    return (engine_core_outputs,
            scheduler_output.total_num_scheduled_tokens > 0)
```

Three calls in a row: schedule, a model call that returns when the step has been run, and an update of the scheduler from what came back. {{claim:inside-vllm.step-three-calls}} The model call includes the sampling. The model runner samples inside `execute_model`, and it copies the sampled ids to the host with `.tolist()` before it returns, so the step is stopped there until they are back. {{claim:inside-vllm.sample-in-execute-model}} You counted that wait as a copy and a sync in the first lesson.

[This](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L667-L697) is the same method at the pin.

```python
# vllm/v1/engine/core.py, lines 667 to 697 at v0.33.0
def step(self) -> tuple[dict[int, EngineCoreOutputs], bool]:
    ...
    scheduler_output = self.scheduler.schedule(self._should_throttle_prefills())
    future = self.model_executor.execute_model(scheduler_output, non_block=True)
    grammar_output = self.scheduler.get_grammar_bitmask(scheduler_output)
    with (
        self.capture_iteration_details(scheduler_output) as iteration_details,
        self.log_error_detail(scheduler_output),
    ):
        model_output = future.result()
        if model_output is None:
            model_output = self.model_executor.sample_tokens(grammar_output)

    # Before processing the model output, process any aborts that happened
    # during the model execution.
    self._process_aborts_queue()
    engine_core_outputs = self.scheduler.update_from_output(
        scheduler_output, model_output
    )
    ...
    return engine_core_outputs, scheduler_output.total_num_scheduled_tokens > 0
```

Four things were added, and each one is a lesson of its own later. The forward is launched without blocking, and the step holds a future. The CPU builds the grammar mask while the forward runs. Sampling became a second call, `sample_tokens`, which takes the mask. In the default runner `execute_model` returns nothing, and the sampler runs in that second call. {{claim:vllm.step.order}} {{claim:vllm.step.execute-then-sample}} And a queue of aborts is drained just before the scheduler is updated, which is the subject of the seventh lesson. {{claim:vllm.engine-core.aborts}}

There is a second step method beside it, `step_with_batch_queue`, and its history is the neatest example of a name that outlived its purpose. At the post's commit the engine core builds a batch queue only when the executor allows more than one batch in flight, and its comment says it is there for pipeline parallelism, to remove pipeline bubbles. {{claim:inside-vllm.batch-queue-for-pp}} At the pin the engine core uses it whenever async scheduling is on, and that is the default: it schedules a new batch whenever the queue has room and blocks on the oldest batch's result only when it is full. {{claim:vllm.step.batch-queue}} {{claim:vllm.async-scheduling.default}}

## Where did the post's boxes go

Take a box from the post's pictures and find it at the pin. The table gives the post's name, the line it was at in the post's commit, the line it is at in v0.33.0, and what happened. Every address in it is a permalink.

| The post's box | Where it was at `42172ad` | Where it is at v0.33.0 | What happened |
|---|---|---|---|
| `create_completion`, the completions route | [`api_server.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/entrypoints/openai/api_server.py#L703) | [`api_router.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/completion/api_router.py#L52) | moved. The old file is a deprecated shim |
| `AsyncLLM` | [`async_llm.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/async_llm.py#L46) | [`async_llm.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L93) | same file |
| `AsyncMPClient` | [`core_client.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core_client.py#L722) | [`core_client.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L1149) | same file |
| `EngineCoreProc` | [`core.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L430) | [`core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1165) | same file |
| `EngineCore.step` | [`core.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L261) | [`core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L667) | same name, a different body |
| `step_with_batch_queue` | [`core.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L282) | [`core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708) | same name. It served pipeline parallelism, and at the pin it serves async scheduling |
| `aborts_queue` | none | [`core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L237) | new |
| `Scheduler` | [`scheduler.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/sched/scheduler.py#L41) | [`scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L86) | same file |
| `allocate_slots` | [`kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/kv_cache_manager.py#L192) | [`kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_manager.py#L380) | same name |
| `free_block_queue` | [`block_pool.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/block_pool.py#L49) | [`block_pool.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/block_pool.py#L182) | same name |
| `req_to_block_hashes` | [`kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/kv_cache_manager.py#L120) | [`Request.block_hashes`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L225) | replaced: the hashes live on the request |
| `WAITING_FOR_FSM` | [`request.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/request.py#L197) | [`request.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L374) | renamed `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR` |
| `GPUModelRunner.execute_model`, which samples inside | [`gpu_model_runner.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/worker/gpu_model_runner.py#L1440) | [`model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L1764) | the default runner moved. The old one is still at [`gpu_model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu_model_runner.py) |
| `sample_tokens` | none | [`model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L2149) | new: sampling is its own call |
| `RejectionSampler` | [`rejection_sampler.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/sample/rejection_sampler.py#L23) | [`rejection_sampler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/spec_decode/rejection_sampler.py#L147) | the default runner has its own |

Five kinds of change show up, and each tells you what to do next. **Same file** means the post's address still works, and only the line is stale. **Moved** means search for the symbol across the tree, and read the old file for a notice: the completions route was a function of [`api_server.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/entrypoints/openai/api_server.py#L701-L703) in the post, wrapped in the cancellation decorator, {{claim:inside-vllm.completions-route}} and it was moved, and the old module says it is deprecated. {{claim:vllm.http.api-server-shim}} {{claim:vllm.http.create-completion}} **Renamed** means the concept survived, and you find it by what it did: the state a request waits in while its grammar compiles is `WAITING_FOR_FSM` in the post's code and `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR` at the pin, {{claim:inside-vllm.fsm-wait}} {{claim:vllm.request.grammar-wait}} and the list around it grew from nine states to twelve. {{claim:inside-vllm.request-states}} {{claim:vllm.request.states}} **Replaced** means the job is done somewhere else: the post keeps each request's block hashes in a dict of the KV cache manager, and at the pin they are a list on the request itself. {{claim:inside-vllm.block-hashes-in-the-manager}} {{claim:inside-vllm.hash-request-tokens}} {{claim:vllm.request.block-hashes}} **New** means that no amount of searching the post will help: `aborts_queue` and `sample_tokens` are in no sentence of it.

The default runner row deserves a second look. The post reads Model Runner V1. Since v0.29.0 the default is Model Runner V2, which is a different file with a different shape, and V1 is still shipped as the runner a configuration falls back to. {{claim:vllm.mrv2.default-since}} {{claim:vllm.mrv1.still-ships}} Whenever the post says "the model runner", the pin's answer is the other file.

## How much grew

Counted on 2026-11-05 at `42172ad` and at v0.33.0, the files that a request crosses grew a lot, and the two that shrank did so because their contents were moved out.

| File | Lines at `42172ad` [measured] | Lines at v0.33.0 [measured] | Growth [derived] |
|---|---|---|---|
| [`vllm/v1/core/sched/scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py) | [1,163](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/sched/scheduler.py) | 3,783 | 3.3 |
| [`vllm/v1/engine/core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py) | [1,199](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py) | 2,860 | 2.4 |
| [`vllm/v1/worker/gpu_model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu_model_runner.py) (Model Runner V1) | [3,069](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/worker/gpu_model_runner.py) | 7,192 | 2.3 |
| [`vllm/v1/core/kv_cache_manager.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_manager.py) | [407](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/kv_cache_manager.py) | 931 | 2.3 |
| [`vllm/v1/engine/async_llm.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py) | [684](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/async_llm.py) | 1,447 | 2.1 |
| [`vllm/v1/engine/core_client.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py) | [1,306](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core_client.py) | 2,170 | 1.7 |
| [`vllm/entrypoints/openai/api_server.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/api_server.py) | [1,918](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/entrypoints/openai/api_server.py) | 59 | 0.03 |
| [`vllm/config/__init__.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/__init__.py) | [4,501](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/config/__init__.py) | 160 | 0.04 |

The first answer is two. The engine core's output thread sends a token to the API server, and the API server sends it to the client, so a token crosses two process boundaries [derived], and at two ranks it crosses three, because the worker's result reaches the engine core through shared memory first. The second answer is 3.3 [derived]: the scheduler is more than three times the size it was in the post, and it is the file you will spend the most time in. Notice too that the sizes of the engine files barely changed what the post is about. They changed how much of the post is incomplete.

## What the post says that is stale

Take the statements of the post, one at a time, with the pin's side of each.

- **Async scheduling is experimental.** The post lists it under experimental features. {{claim:inside-vllm.async-experimental}} At v0.33.0 it is on by default unless an incompatible option is set. {{claim:vllm.async-scheduling.default}} It has been the default since v0.14.0. {{claim:vllm.async-scheduling.since}}
- **V1 has no draft-model method.** The post says V1 does not support the draft model method and implements n-gram, EAGLE and Medusa instead. {{claim:inside-vllm.no-draft-model}} At v0.33.0 the methods include a draft model, and Medusa was removed in that very release. {{claim:vllm.spec.methods}} {{claim:vllm.spec.medusa-removed}}
- **Chunked prefill is a threshold you set.** The post says to enable it by setting `long_prefill_token_threshold` to a positive number. {{claim:inside-vllm.chunked-prefill-by-hand}} At the pin chunked prefill is on by default, and the threshold defaults to zero, which caps nothing. {{claim:vllm.scheduler.chunked-prefill-default}} {{claim:vllm.scheduler.long-prefill-threshold-default}}
- **`VLLM_USE_V1="1"` selects the V1 engine.** The post's setup code sets it. {{claim:inside-vllm.use-v1}} The name no longer exists, because V1 is the only engine, and the switch that remains chooses a model runner. {{claim:vllm.env.no-use-v1}}
- **The API server is [`openai/api_server.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/api_server.py).** That module is a shim at the pin, and the live entry points are under `launchers/`. {{claim:vllm.http.api-server-shim}}

Several statements did not go stale, and a good reader keeps them. The three threads and the two queues that join them still have those names. {{claim:vllm.engine-core.queues}} The scheduler still serves the running requests before the waiting ones, from one budget. {{claim:vllm.scheduler.order}} Prefix caching is still on by default, and the block is still sixteen tokens. {{claim:inside-vllm.prefix-caching-default}} {{claim:vllm.cache.prefix-caching-default}} {{claim:inside-vllm.block-size-16}} {{claim:vllm.cache.block-size-default}} And the shared-memory queue that carries a step to the workers is still `rpc_broadcast_mq`. {{claim:vllm.executor.rpc-broadcast}}

## How to read a post at a pin

The method is the same every time, and it takes a few minutes for each name.

1. Take the name from the post and search the pin's tree for it, at the tag and not on the default branch.
2. If it is there, read the line and check the claim against the code in hand. If it moved, the search shows where.
3. If it is not there, search for what it did: a string in a log message, a field it set, a call that it made. Names change; behaviour usually leaves a trace.
4. Check the release notes between the two versions for a removal or a rename, and cite the version where you found it.

```sh
# Nothing in this lesson runs these. They are the method, for the day you have the repository.
git clone --filter=blob:none https://github.com/vllm-project/vllm && cd vllm
git grep -n "class EngineCoreProc" v0.33.0 -- vllm
git grep -n "WAITING_FOR_FSM" v0.33.0 -- vllm || echo "gone: search for what it did"
```

:::card
kind: isomorphism
title: The architecture doc of a service you inherit
body: You have read it. Every box in the diagram is real, some boxes have been renamed, one is now two services, and the doc is right about the problem and wrong about the file. A post about an open-source engine is that document with a date on it, and a pin is the revision you are working against.
breaks: An internal doc has an author down the hall and no way to tell whether it is current. A post has a commit hash on its first page, and the project publishes its removals. Use the hash and the release notes before you ask anyone.
:::

:::card
kind: warning
title: A line number is a date
body: A link to a line of a branch is a link to whatever is there when you click it. Cite a file at a tag or a commit, say which, and expect the line to move. Everything in this module that points into an engine points at a pin.
:::

:::card
kind: notional-machine
id: lifecycle
:::

## What to carry

- Read a post at its commit and then at your pin. The loop it draws is probably still the loop, and the file it names is probably not still the file.
- Five kinds of change: same file, moved, renamed, replaced and new. Say which kind each box is before you cite it.
- The statements to distrust first are the ones about defaults and about experimental features, because those are what a project changes on purpose.

## Exit check

This lesson tests two skills: finding where a box of an older post lives in the pinned code and saying which of the post's statements are stale (`tr1.read-at-the-pin`), and tracing a request through vLLM's engine core (`tr1.vllm-lifecycle`). The exit ticket is three items on fresh seeds, and it tests the first skill: each gives a name or a statement from the post and asks where it is at the pin, or whether it still holds. It is passed with at least two right (ASSESSMENT §4.2). The graded map tests the second skill on a whole path.

:::item
family: tr1.what-moved
level: 2
count: 3
:::
