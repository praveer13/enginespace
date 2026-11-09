# "Inside vLLM" and what moved by v0.33.0

_Read the engines · lesson `tr1.l4` · review · about 40 minutes [estimated]_

Builds on kernelspace: `ks:T5.L10`, `ks:T5.L7`, `ks:T5.L5`.

Knowledge components: `tr1.read-at-the-pin`, `tr1.vllm-lifecycle`.

"Inside vLLM" is the most-read map of vLLM's V1 engine. It walks one engine from the offline `LLM` class to a multi-node server, **from the offline engine to multi-GPU, multi-node serving** [measured] and it says on its first page which code it read, as a commit. **42172ad** [measured] That commit is dated 2025-08-09. **2025-08-09** [measured] The version this course pins, v0.33.0, was uploaded to PyPI on 2026-11-02, which is 450 days after the commit [derived]. **2026-11-02** [measured]

The post is worth reading because most of what it says is still true. What changes between the post and the pin is the code's address and its detail. A learner who reads the post as a description of v0.33.0 will name a file that is now a shim, a state that is now called something else, and a feature the post lists as experimental that is now on by default. This lesson teaches the skill of reading an old map at a new pin: take a name from the post, find it at the pin, and when it is not there, find what took its place. The same skill applies to every blog post, conference talk and design document you will ever use to find your way into a fast-moving code base.

## What the post draws

The post builds in layers. It starts with the synchronous engine, the `LLM` class driving an `EngineCore` in the caller's process. It adds the scheduler, the KV cache manager, prefix caching, structured output, speculation and KV transfer. Then it moves the engine core into a process of its own, with a `MultiProcExecutor` for more than one GPU. Last it puts an `AsyncLLM` in front, with a ZeroMQ socket between the two. The last picture is the one the game's `inside` level draws.

The engine core process of that picture has three threads, and the post names them. An input thread blocks on the socket and puts each decoded request on `input_queue`. A main thread takes from it and runs the engine's step. An output thread takes results from `output_queue` and sends them to the API server. **input thread, main thread, output thread** [measured] The post also says what the V1 scheduler can do that its predecessor could not: it mixes prefill and decode requests in the same step. **both kinds in the same step** [measured] You read the other side of that sentence in the second lesson.

## Before you play

Two questions, to commit to before you lay the post's path. The first is the game's own, and the engine is the one the post describes. The second asks how much the file you will spend most of your time in has grown, and you can estimate it from the age of the post.

> **Predict `tr1.l4.p1`.** In the engine that the post describes, serving a streamed answer at one rank, how many process boundaries does a sampled token cross on its way to the client?
>
> The learner commits to a number in `boundaries`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Predict `tr1.l4.p2`.** The post's vllm/v1/core/sched/scheduler.py has 1,163 lines [measured] at commit 42172ad. By what factor has the file grown by v0.33.0?
>
> The learner commits to a number in `x`, graded within a relative tolerance of `0.15` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Then play the `inside` level on its practice seed. It lays the post's world: an API server and an engine core as two processes, and in the engine core an input thread, the busy loop and an output thread passing the ticket on spikes. Notice what is not in it. There is no `aborts_queue`, no `sample_tokens`, and no step that is launched before it is read.

> **Play.** The game `engine-floor`, level `inside`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

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

Three calls in a row: schedule, a model call that returns when the step has been run, and an update of the scheduler from what came back. **schedule, execute_model, update_from_output** [measured] The model call includes the sampling. The model runner samples inside `execute_model`, and it copies the sampled ids to the host with `.tolist()` before it returns, so the step is stopped there until they are back. **the runner samples inside execute_model** [measured] You counted that wait as a copy and a sync in the first lesson.

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

Four things were added, and each one is a lesson of its own later. The forward is launched without blocking, and the step holds a future. The CPU builds the grammar mask while the forward runs. Sampling became a second call, `sample_tokens`, which takes the mask. In the default runner `execute_model` returns nothing, and the sampler runs in that second call. **schedule, launch, mask, wait, sample, update** [measured] **execute_model returns nothing, and sample_tokens samples** [measured] And a queue of aborts is drained just before the scheduler is updated, which is the subject of the seventh lesson. **aborts_queue** [measured]

There is a second step method beside it, `step_with_batch_queue`, and its history is the neatest example of a name that outlived its purpose. At the post's commit the engine core builds a batch queue only when the executor allows more than one batch in flight, and its comment says it is there for pipeline parallelism, to remove pipeline bubbles. **a batch queue for pipeline parallelism** [measured] At the pin the engine core uses it whenever async scheduling is on, and that is the default: it schedules a new batch whenever the queue has room and blocks on the oldest batch's result only when it is full. **the batch queue first** [measured] **on** [measured]

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

Five kinds of change show up, and each tells you what to do next. **Same file** means the post's address still works, and only the line is stale. **Moved** means search for the symbol across the tree, and read the old file for a notice: the completions route was a function of [`api_server.py`](https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/entrypoints/openai/api_server.py#L701-L703) in the post, wrapped in the cancellation decorator, **create_completion in vllm/entrypoints/openai/api_server.py** [measured] and it was moved, and the old module says it is deprecated. **deprecated shim** [measured] **create_completion** [measured] **Renamed** means the concept survived, and you find it by what it did: the state a request waits in while its grammar compiles is `WAITING_FOR_FSM` in the post's code and `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR` at the pin, **guided decoding starts a request in WAITING_FOR_FSM** [measured] **WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR** [measured] and the list around it grew from nine states to twelve. **9 states** [measured] **12 states** [measured] **Replaced** means the job is done somewhere else: the post keeps each request's block hashes in a dict of the KV cache manager, and at the pin they are a list on the request itself. **req_to_block_hashes** [measured] **hash_request_tokens fills the dict when it is empty** [measured] **a list on the request** [measured] **New** means that no amount of searching the post will help: `aborts_queue` and `sample_tokens` are in no sentence of it.

The default runner row deserves a second look. The post reads Model Runner V1. Since v0.29.0 the default is Model Runner V2, which is a different file with a different shape, and V1 is still shipped as the runner a configuration falls back to. **v0.29.0** [measured] **present** [measured] Whenever the post says "the model runner", the pin's answer is the other file.

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

- **Async scheduling is experimental.** The post lists it under experimental features. **Experimental** [measured] At v0.33.0 it is on by default unless an incompatible option is set. **on** [measured] It has been the default since v0.14.0. **v0.14.0** [measured]
- **V1 has no draft-model method.** The post says V1 does not support the draft model method and implements n-gram, EAGLE and Medusa instead. **n-gram, EAGLE, Medusa** [measured] At v0.33.0 the methods include a draft model, and Medusa was removed in that very release. **ngram, draft_model, suffix, eagle, mtp and more** [measured] **removed in v0.33.0** [measured]
- **Chunked prefill is a threshold you set.** The post says to enable it by setting `long_prefill_token_threshold` to a positive number. **long_prefill_token_threshold** [measured] At the pin chunked prefill is on by default, and the threshold defaults to zero, which caps nothing. **true** [measured] **0 tokens** [measured]
- **`VLLM_USE_V1="1"` selects the V1 engine.** The post's setup code sets it. **VLLM_USE_V1=1** [measured] The name no longer exists, because V1 is the only engine, and the switch that remains chooses a model runner. **no VLLM_USE_V1** [measured]
- **The API server is [`openai/api_server.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/api_server.py).** That module is a shim at the pin, and the live entry points are under `launchers/`. **deprecated shim** [measured]

Several statements did not go stale, and a good reader keeps them. The three threads and the two queues that join them still have those names. **input_queue, output_queue** [measured] The scheduler still serves the running requests before the waiting ones, from one budget. **running first, then waiting** [measured] Prefix caching is still on by default, and the block is still sixteen tokens. **on** [measured] **true** [measured] **16 tokens** [measured] **16 tokens** [measured] And the shared-memory queue that carries a step to the workers is still `rpc_broadcast_mq`. **rpc_broadcast_mq** [measured]

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

> **The architecture doc of a service you inherit.** You have read it. Every box in the diagram is real, some boxes have been renamed, one is now two services, and the doc is right about the problem and wrong about the file. A post about an open-source engine is that document with a date on it, and a pin is the revision you are working against.
>
> Where it breaks: An internal doc has an author down the hall and no way to tell whether it is current. A post has a commit hash on its first page, and the project publishes its removals. Use the hash and the release notes before you ask anyone.

> **A line number is a date.** A link to a line of a branch is a link to whatever is there when you click it. Cite a file at a tag or a commit, say which, and expect the line to move. Everything in this module that points into an engine points at a pin.

> **Card.** The notional-machine card `lifecycle`.

## What to carry

- Read a post at its commit and then at your pin. The loop it draws is probably still the loop, and the file it names is probably not still the file.
- Five kinds of change: same file, moved, renamed, replaced and new. Say which kind each box is before you cite it.
- The statements to distrust first are the ones about defaults and about experimental features, because those are what a project changes on purpose.

## Exit check

This lesson tests two skills: finding where a box of an older post lives in the pinned code and saying which of the post's statements are stale (`tr1.read-at-the-pin`), and tracing a request through vLLM's engine core (`tr1.vllm-lifecycle`). The exit ticket is three items on fresh seeds, and it tests the first skill: each gives a name or a statement from the post and asks where it is at the pin, or whether it still holds. It is passed with at least two right (ASSESSMENT §4.2). The graded map tests the second skill on a whole path.

> **Practice.** Items from the generator family `tr1.what-moved`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `inside-vllm.analysis-commit`: The Inside vLLM post, published on 2025-09-05, says its analysis is based on vLLM commit 42172ad of August 9th, 2025. That is a source tree from before Model Runner V2 and before the CUDA-graph dispatcher. Value 42172ad [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `inside-vllm.async-experimental`: The post lists async scheduling under Experimental. Value Experimental [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `inside-vllm.batch-queue-for-pp`: At the post's commit the engine core creates its batch queue only when the executor allows more than one batch in flight, and its own comment says the queue is there for pipeline parallelism, to remove pipeline bubbles. Value a batch queue for pipeline parallelism [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/engine/core.py, EngineCore.__init__ <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L131-L141>, read 2026-11-05).
- `inside-vllm.block-hashes-in-the-manager`: At the post's commit the KV cache manager keeps every request's block hashes in a dict of its own, req_to_block_hashes, so that the hashes are not recomputed on each call of get_computed_blocks or allocate_slots. Value req_to_block_hashes [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/core/kv_cache_manager.py, KVCacheManager.__init__ <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/kv_cache_manager.py#L117-L121>, read 2026-11-05).
- `inside-vllm.block-size-16`: The post gives vLLM's default KV block size as 16 tokens. Value 16 tokens [measured], checked 2026-11-05 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-05).
- `inside-vllm.chunked-prefill-by-hand`: The post says that in V1 you enable chunked prefill by setting long_prefill_token_threshold to a positive integer. Value long_prefill_token_threshold [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `inside-vllm.commit-date`: The full commit is 42172ad18fbc22c89d0063184e4570cc84186e16, dated 2025-08-09 at 11:50:03 -0700, with the subject "Add triton mrope to replace the torch code path (#22375)". Value 2025-08-09 [measured], checked 2026-11-04 (source: vLLM commit 42172ad18fbc22c89d0063184e4570cc84186e16 (patch) <https://github.com/vllm-project/vllm/commit/42172ad18fbc22c89d0063184e4570cc84186e16.patch>, read 2026-11-04).
- `inside-vllm.completions-route`: At the commit the post reads, the completions route is create_completion, a function of vllm/entrypoints/openai/api_server.py. It is wrapped in with_cancellation, so the request is cancelled when its client disconnects. Value create_completion in vllm/entrypoints/openai/api_server.py [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/entrypoints/openai/api_server.py, create_completion <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/entrypoints/openai/api_server.py#L701-L703>, read 2026-11-05).
- `inside-vllm.fsm-wait`: At the post's commit a generative request whose sampling parameters ask for guided decoding starts in WAITING_FOR_FSM and not in WAITING. Value guided decoding starts a request in WAITING_FOR_FSM [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/request.py, Request.__init__ <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/request.py#L65-L67>, read 2026-11-05).
- `inside-vllm.hash-request-tokens`: At the post's commit get_computed_blocks reads a request's hashes from req_to_block_hashes, and when the list is empty it fills it by calling hash_request_tokens. Value hash_request_tokens fills the dict when it is empty [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/core/kv_cache_manager.py, KVCacheManager.get_computed_blocks <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/core/kv_cache_manager.py#L164-L171>, read 2026-11-05).
- `inside-vllm.mixes-prefill-decode`: The post says the V1 scheduler can mix prefill and decode requests in the same step, where the V0 engine could do only one kind at once. Value both kinds in the same step [measured], checked 2026-11-05 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-05).
- `inside-vllm.no-draft-model`: The post says that V1 does not support the LLM draft-model method, and that it implements n-gram, EAGLE and Medusa proposal schemes instead. Value n-gram, EAGLE, Medusa [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `inside-vllm.prefix-caching-default`: The post says that prefix caching is enabled by default. Value on [measured], checked 2026-11-05 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-05).
- `inside-vllm.request-states`: At the post's commit a request is in one of 9 states, WAITING, WAITING_FOR_FSM, WAITING_FOR_REMOTE_KVS, RUNNING, PREEMPTED and four finished states that begin FINISHED_. Value 9 states [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/request.py, RequestStatus <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/request.py#L194-L206>, read 2026-11-05).
- `inside-vllm.sample-in-execute-model`: At the post's commit the model runner samples inside execute_model, in the same call as the forward pass, and copies the sampled ids to the host with .tolist() before it returns. The engine core's step is blocked until they are there. Value the runner samples inside execute_model [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/worker/gpu_model_runner.py, GPUModelRunner.execute_model <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/worker/gpu_model_runner.py#L1595-L1667>, read 2026-11-05).
- `inside-vllm.scope`: The post's subtitle gives its range as everything from paged attention, continuous batching, prefix caching and speculative decoding to multi-GPU, multi-node dynamic serving at scale. Value from the offline engine to multi-GPU, multi-node serving [measured], checked 2026-11-05 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-05).
- `inside-vllm.step-three-calls`: At the post's commit EngineCore.step is three calls in a row. It schedules, runs execute_model and waits for it to return, and updates the scheduler from the output. Nothing is launched without blocking, no grammar mask is built meanwhile, and no queue of aborts is drained. Value schedule, execute_model, update_from_output [measured], checked 2026-11-05 (source: vLLM at 42172ad, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/42172ad18fbc22c89d0063184e4570cc84186e16/vllm/v1/engine/core.py#L261-L280>, read 2026-11-05).
- `inside-vllm.three-threads`: The post describes each engine core process as three threads. The input thread blocks on the input socket and puts each decoded request on input_queue, the main thread takes from it and runs the engine, and the output thread takes results from output_queue and sends them to the API server. Value input thread, main thread, output thread [measured], checked 2026-11-05 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-05).
- `inside-vllm.use-v1`: The post's setup code selects the V1 engine with VLLM_USE_V1="1". Value VLLM_USE_V1=1 [measured], checked 2026-11-04 (source: Inside vLLM: Anatomy of a High-Throughput LLM Inference System (Aleksa Gordic, 2025-09-05) <https://vllm.ai/blog/2025-09-05-anatomy-of-vllm>, read 2026-11-04).
- `vllm.async-scheduling.default`: At v0.33.0 vLLM turns async scheduling on by default, unless an incompatible option is set. The config resolves an unset field to on, or to off with a warning when an option conflicts. Value on [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py (async scheduling resolved at L1685) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L1685-L1686>, read 2026-11-04).
- `vllm.async-scheduling.since`: Async scheduling became vLLM's default in v0.14.0, released on 2026-01-20. The release notes list it as a breaking change that users can undo with --no-async-scheduling. Value v0.14.0 [measured], checked 2026-11-04 (source: vLLM v0.14.0 release notes <https://github.com/vllm-project/vllm/releases/tag/v0.14.0>, read 2026-11-04).
- `vllm.cache.block-size-default`: The KV cache block holds 16 tokens by default at v0.33.0. Value 16 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/cache.py, DEFAULT_BLOCK_SIZE <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/cache.py#L185>, read 2026-11-04).
- `vllm.cache.prefix-caching-default`: Prefix caching is on by default at v0.33.0. Value true [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/cache.py, enable_prefix_caching <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/cache.py#L257>, read 2026-11-04).
- `vllm.engine-core.aborts`: Aborts arrive on their own queue, aborts_queue, and EngineCore.step drains it after the forward returns and before it updates the scheduler from the output. Value aborts_queue [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L688-L690>, read 2026-11-04).
- `vllm.engine-core.queues`: At v0.33.0 the engine core process keeps a thread-safe input_queue of client requests and an output_queue of engine outputs. Value input_queue, output_queue [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1184-L1185>, read 2026-11-04).
- `vllm.env.no-use-v1`: vllm/envs.py at v0.33.0 has no VLLM_USE_V1, and searching the vllm/ package for the name finds no use of it. The V1 engine is the only engine, and the switch that remains for the engine is which model runner it uses, VLLM_USE_V2_MODEL_RUNNER. Value no VLLM_USE_V1 [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/envs.py, VLLM_USE_V2_MODEL_RUNNER <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/envs.py#L312>, read 2026-11-05).
- `vllm.executor.rpc-broadcast`: With more than one rank the engine core's executor is MultiprocExecutor, and its collective_rpc enqueues a call, which is the method, its arguments and the output rank, on a queue named rpc_broadcast_mq. Value rpc_broadcast_mq [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/executor/multiproc_executor.py, MultiprocExecutor.collective_rpc <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/multiproc_executor.py#L492>, read 2026-11-04).
- `vllm.http.api-server-shim`: At v0.33.0 the old HTTP entry module, vllm/entrypoints/openai/api_server.py, only re-exports names from vllm.entrypoints.launchers and warns that it is deprecated. The live entry is under vllm/entrypoints/launchers/. Value deprecated shim [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/entrypoints/openai/api_server.py <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/api_server.py#L20-L27>, read 2026-11-04).
- `vllm.http.create-completion`: The completions route that the Inside vLLM post follows, create_completion, still exists at v0.33.0, in vllm/entrypoints/openai/completion/api_router.py. Value create_completion [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/entrypoints/openai/completion/api_router.py <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/completion/api_router.py#L52>, read 2026-11-04).
- `vllm.mrv1.still-ships`: At v0.33.0 the MRV1 runner, class GPUModelRunner in vllm/v1/worker/gpu_model_runner.py, is still part of vLLM and is the runner that the engine falls back to, so the v0.32 removal target of the v0.29.0 notes slipped. Value present [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu_model_runner.py <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu_model_runner.py#L475>, read 2026-11-04).
- `vllm.mrv2.default-since`: Model Runner V2 became vLLM's default runner for all models in v0.29.0, released on 2026-09-09. A pooling-model rollout came first. Value v0.29.0 [measured], checked 2026-11-04 (source: vLLM v0.29.0 release notes <https://github.com/vllm-project/vllm/releases/tag/v0.29.0>, read 2026-11-04).
- `vllm.release.pypi-upload`: vLLM 0.33.0 was uploaded to PyPI on 2026-11-02, at 10:12 UTC, the day after its tag. PyPI listed no newer release on 2026-11-04. Value 2026-11-02 [measured], checked 2026-11-04 (source: vllm 0.33.0 on PyPI (JSON API) <https://pypi.org/pypi/vllm/0.33.0/json>, read 2026-11-04).
- `vllm.request.block-hashes`: At v0.33.0 each Request carries its own block_hashes list and a block hasher that fills it. The KV cache manager's req_to_block_hashes dict of the post's commit is gone, and so is the function hash_request_tokens that filled it. Value a list on the request [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, Request.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L225-L230>, read 2026-11-05).
- `vllm.request.grammar-wait`: A generative request that has a structured-output request starts in WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, and not in WAITING, while its grammar compiles. Value WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, Request.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L112-L117>, read 2026-11-05).
- `vllm.request.states`: At v0.33.0 a request is in one of 12 states, WAITING, WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, WAITING_FOR_REMOTE_KVS, WAITING_FOR_STREAMING_REQ, RUNNING, PREEMPTED, and six finished states that begin FINISHED_. Value 12 states [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/request.py, RequestStatus <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L370-L386>, read 2026-11-04).
- `vllm.scheduler.chunked-prefill-default`: At v0.33.0 chunked prefill is on by default, so a prompt that does not fit the step's token budget is cut into chunks. Value true [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, enable_chunked_prefill <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L134>, read 2026-11-04).
- `vllm.scheduler.long-prefill-threshold-default`: The long-prefill token threshold defaults to 0, which means no cap on one prompt's chunk. The cap never applies to a request that is alone in the batch. Value 0 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, long_prefill_token_threshold <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L79>, read 2026-11-04).
- `vllm.scheduler.order`: Within one step the scheduler serves the running requests first and the waiting requests after them, all out of the same token budget. Value running first, then waiting [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L793>, read 2026-11-04).
- `vllm.spec.medusa-removed`: Medusa and the MLP speculator were removed in v0.33.0 (pull request 61701). Value removed in v0.33.0 [measured], checked 2026-11-04 (source: vLLM v0.33.0 release notes (kept on the v0.33.0rc3 release; the tag is the v0.33.0 commit) <https://github.com/vllm-project/vllm/releases/tag/v0.33.0rc3>, read 2026-11-04).
- `vllm.spec.methods`: At v0.33.0 the speculative method is one of ngram, draft_model, suffix, custom_class, the eagle family (eagle, eagle3, extract_hidden_states, dflash and a long list of model-specific mtp names), ngram_gpu or dspark. Value ngram, draft_model, suffix, eagle, mtp and more [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/speculative.py, SpeculativeMethod <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/speculative.py#L68-L82>, read 2026-11-04).
- `vllm.step.batch-queue`: With async scheduling the engine core uses step_with_batch_queue. It schedules a new batch whenever the queue has room and returns at once, and it blocks on the oldest batch's result only when the queue is full or nothing else can be scheduled. Value the batch queue first [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step_with_batch_queue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708-L723>, read 2026-11-04).
- `vllm.step.execute-then-sample`: In the default runner, MRV2, execute_model runs the forward pass, keeps its state in execute_model_state, and returns None. Sampling is a second call, sample_tokens, which takes the grammar output. Value execute_model returns nothing, and sample_tokens samples [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/model_runner.py, GPUModelRunner.sample_tokens <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L2123-L2156>, read 2026-11-05).
- `vllm.step.order`: At v0.33.0 EngineCore.step schedules, launches execute_model without blocking, builds the grammar bitmask on the CPU while the forward runs, waits on the future, samples with the bitmask, and updates the scheduler from the output. Value schedule, launch, mask, wait, sample, update [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L677-L691>, read 2026-11-04).
