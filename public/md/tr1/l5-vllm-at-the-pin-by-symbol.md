# vLLM at the pin, by symbol: from create_completion to sample_tokens

_Read the engines · lesson `tr1.l5` · review · about 40 minutes [estimated]_

Builds on kernelspace: `ks:T5.L10`, `ks:T5.L7`, `ks:T2.L1`, `ks:T3.L6`.

Knowledge components: `tr1.vllm-lifecycle`, `tr1.request-states`, `tr1.phases-vs-one-budget`.

The post gave you vLLM's shape. Now you read it at the version the course pins, v0.33.0, by symbol. The shape is the one Mini-SGLang taught, in fewer boxes: an API server process, an engine core process that schedules and drives the GPU, and sockets between them. **a background process with a busy loop** [measured] Two things make the lap harder to read at the pin than in the post. The engine core launches the next batch before it has read the last one, and the model runner is not the one the post reads. This lesson walks one request through the symbols that matter, names every queue and every thread, and ends with the thing the whole module has been circling: the states a request passes through.

Reading a large engine means choosing what not to read. These are the five files that a request's path crosses, counted on 2026-11-05 at `4ba787e`.

| File | Lines [measured] | What to read in it |
|---|---|---|
| [`vllm/v1/engine/async_llm.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py) | 1,447 | `generate`, `add_request`, `abort` and the output handler |
| [`vllm/v1/engine/core_client.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py) | 2,170 | `AsyncMPClient` and its two sockets |
| [`vllm/v1/engine/core.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py) | 2,860 | `EngineCoreProc`, the busy loop, `step_with_batch_queue` |
| [`vllm/v1/core/sched/scheduler.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py) | 3,783 | `schedule`, `update_from_output`, and every place a status changes |
| [`vllm/v1/worker/gpu/model_runner.py`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py) | 2,519 | `execute_model` and `sample_tokens` |

The five add up to 12,779 lines [derived]. The lesson reads named symbols and not whole files, and by the end you could read the rest of any of them with a map.

## Before you play

Three questions, to commit to before you lay the path. The first is the game's own, at two ranks. The second picks up where the second lesson left off. The third is about the last section of this one.

> **Predict `tr1.l5.p1`.** In vLLM v0.33.0, serving a streamed answer on two GPUs, how many process boundaries does a sampled token cross on its way to the client?
>
> The learner commits to a number in `boundaries`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Predict `tr1.l5.p2`.** Two requests are in the middle of decoding in vLLM v0.33.0, and a new prompt of 300 tokens [estimated] has just joined the waiting queue. The token budget of a step is large enough to hold it. How many tokens does the next step run?
>
> The learner commits to a number in `tokens`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Predict `tr1.l5.p3`.** A vLLM request at v0.33.0 is always in one of twelve statuses. How many of the twelve count as finished?
>
> The learner commits to a number in `statuses`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Then play the `vllm` level on its practice seed. The engine plans a step before it has read the last one, so the sync that follows a copy is not in the same turn of the loop, and a queue sits between the copy and the wait. The debrief lays this engine's floor plan beside the post's.

> **Play.** The game `engine-floor`, level `vllm`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## The path, by symbol

Here is the whole path of one streamed request at one rank. The first column is the stage's id in the lifecycle model, and the last is the pinned line the stage was read from. The post's path had twenty-one stages [measured by the course's sim on 2026-11-05 at `905b782`], and this one has twenty-two. The difference is the queue that holds a launched batch.

| Stage | What happens | Mechanism | Read it at |
|---|---|---|---|
| `vllm.http-request` | the client POSTs to the completions route | IPC | [`create_completion`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/completion/api_router.py#L52) |
| `vllm.render` | the prompt is tokenized in the API server | compute | [`render_completion_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/completion/serving.py#L113) |
| `vllm.process-inputs` | an `EngineCoreRequest` is built | compute | [`add_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L483) |
| `vllm.zmq-add` | the client sends it over its ROUTER socket | IPC | [`_send_input_message`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L1300) |
| `vllm.input-queue` | the input thread puts it on `input_queue` | queue | [`process_input_sockets`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2040) |
| `vllm.add-request` | the busy loop adds it to the scheduler | compute | [`_handle_client_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1761) |
| `vllm.waiting-queue` | it waits in the scheduler's `waiting` queue | queue | [`_enqueue_waiting_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2715) |
| `vllm.schedule` | `schedule` admits it, and its status is RUNNING | compute | [`schedule`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1572) |
| `vllm.execute-model` | the step is launched without blocking | compute | [`step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L737) |
| `vllm.h2d` | the step's inputs go down to the GPU | copy | [`prepare_inputs`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L1406) |
| `vllm.forward` | the model runs, from a graph or eagerly | compute | [`execute_model`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L2097) |
| `vllm.sample` | the sampler picks the next tokens | compute | [`sample_tokens`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L2200) |
| `vllm.d2h` | the sampled ids start up to the host on a copy stream | copy | [`AsyncOutput`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L141) |
| `vllm.batch-queue` | the launched batch's future waits in `batch_queue` | queue | [`step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L763) |
| `vllm.copy-sync` | the oldest future's result waits on the copy's event | sync | [`get_output`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L175) |
| `vllm.update-from-output` | the scheduler takes the tokens and checks for a stop | compute | [`step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L793) |
| `vllm.output-queue` | the busy loop puts the outputs on `output_queue` | queue | [`_process_engine_step`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1686) |
| `vllm.zmq-out` | the output thread pushes them over a PUSH socket | IPC | [`process_output_sockets`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2101) |
| `vllm.outputs-queue` | the client's socket task queues them | queue | [`_ensure_output_queue_task`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L1260) |
| `vllm.process-outputs` | the output handler detokenizes | compute | [`_run_output_handler`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L905) |
| `vllm.collector` | the request's collector hands it to the generator | queue | [`process_outputs`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/output_processor.py#L863) |
| `vllm.sse-chunk` | the handler streams a chunk to the client | IPC | [`completion_stream_generator`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/openai/completion/serving.py#L487) |

## Two processes, three threads, four queues

The picture below is the part of the path that you will draw from memory in the graded map, so it is worth fixing now.

![vLLM's API server with three asyncio tasks and its engine core with three threads and a GPU, joined by ZMQ sockets and queues](../../figures/tr1/l5-vllm-threads.svg)

_Two large boxes side by side. The API server on the left holds three asyncio tasks, a handler task above an output handler task above a socket task, joined upward by the outputs queue and the collector. The engine core on the right holds an input thread, a main thread and an output thread, joined downward by input_queue and output_queue, with a GPU box beside the main thread. A ZMQ arrow runs from the handler task to the input thread, and another from the output thread to the socket task. A caption notes that the busy loop also keeps batch_queue and aborts_queue._

The API server is one process with one asyncio event loop, and the work in it is tasks. There is a handler task for each request. The route that starts it is wrapped so that a client that disconnects cancels it. **a route handler is cancelled when the client disconnects** [measured] Two background tasks serve every request at once. The client's socket task reads the output socket into an asyncio queue, so that socket I/O is separate from what processes the outputs. **socket reads in a task of their own** [measured] The output handler pulls from that queue, runs the output processor, which detokenizes and finds stop strings, and pushes each result onto its request's own collector. **one background loop for all outputs** [measured] **the outputs go through the output processor, the results to their queues** [measured] **the output processor detokenizes and performs the stop checks** [measured] The generator that a handler iterates reads its collector, without awaiting where it can, because the comment above it says a task switch under load costs. **drain without a task switch where possible** [measured] The two sockets are a ROUTER that the client binds for requests and a PULL for outputs. **a ROUTER for requests, a PULL for outputs** [measured]

The engine core is the second process. It runs in the background with its own busy loop, and its client pushes requests to it and pulls outputs from it. **a background process with a busy loop** [measured] It has three threads. The input thread connects a DEALER socket to the client's ROUTER and puts what it reads on `input_queue`. **the input thread connects a DEALER** [measured] **the input thread puts each request on input_queue** [measured] The main thread runs the busy loop. The output thread takes `output_queue` and pushes each batch of outputs on a PUSH socket. **the output thread pushes** [measured] The queues are thread-safe queues that the process creates for them. **input_queue, output_queue** [measured] The source gives the reason for the arrangement in a comment: socket I/O in background threads releases the GIL and overlaps with the GPU, and the busy loop reads only queues. **threads for the sockets, queues for the busy loop** [measured]

A fourth queue, `aborts_queue`, carries aborts, and the seventh lesson reads it. That is the answer to a question you may have asked since the first lesson, which is why an engine needs a queue between two threads at all. The busy loop reads only queues, and the threads that wait on the sockets are what fill them.

## The busy loop and the batch queue

The main thread's loop, [`run_busy_loop`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1621-L1632), is short enough to read whole.

```python
# vllm/v1/engine/core.py, lines 1621 to 1632 at v0.33.0
def run_busy_loop(self):
    """Core busy loop of the EngineCore."""
    while self._handle_shutdown():
        # 1) Poll the input queue until there is work to do.
        self._process_input_queue()
        # Publish request counts before and after GPU step to ensure freshness.
        self._maybe_publish_request_counts()
        # 2) Step the engine core and return the outputs.
        self._process_engine_step()
        self._maybe_publish_request_counts()

    raise SystemExit
```

Poll the input queue, then step the engine and put the outputs on the output queue. **poll the input queue, then step** [measured] The step is the method the fourth lesson put beside the post's. With async scheduling on, which is the default, the loop calls `step_with_batch_queue`, and the method where the overlap lives is [these few lines](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L761-L778).

```python
# vllm/v1/engine/core.py, lines 761 to 778 at v0.33.0
    if not deferred_scheduler_output:
        # Add this step's future to the queue.
        batch_queue.appendleft((future, scheduler_output, exec_future))
        if len(batch_queue) < self.batch_queue_size and (
            model_executed or self.scheduler.has_requests()
        ):
            # Don't block on next worker response unless the queue is full
            # or there are no more requests to schedule.
            return None, model_executed
...
# Block until the next result is available.
future, scheduler_output, exec_model_fut = batch_queue.pop()
```

A launched batch's future goes into `batch_queue`. If the queue still has room, the method returns at once, and the loop comes back, schedules and launches the next batch. Only when the queue is full, or nothing more can be scheduled, does it pop the oldest future and wait for its result. **the batch queue first** [measured] The queue's size is the pipeline-parallel size plus one in the default runner, so two batches in flight when there is no pipeline parallelism [derived]. **pp_size + 1** [measured] That is the whole mechanism of async scheduling as far as the loop is concerned: one batch is on the GPU while the CPU plans the next. When a step ran no model but the scheduler still holds requests, for instance while they wait for remote KV, the loop sleeps for a moment so that background threads can make progress. **0.001 s** [measured]

## The runner, and where the wait sits

In the default runner the step is two calls. `execute_model` launches the forward pass, keeps what it needs in `execute_model_state`, and returns nothing. `sample_tokens` then takes the grammar output, launches the sampler, and starts the copy of the sampled ids up to the host on a stream of its own, after that stream has waited for the main one. **execute_model returns nothing, and sample_tokens samples** [measured] **a copy stream that waits for the main stream** [measured] The result is an `AsyncOutput`, and its `get_output` is the wait: `copy_event.synchronize()`. **copy_event.synchronize()** [measured]

The part that is easy to miss is whose thread waits, because it depends on the number of ranks. With one rank the executor lives in the engine core's own process, and `execute_model(non_block=True)` hands back a future whose `result()` calls `get_output` in whichever thread asks for it. That thread is the busy loop's, so the sync is in the main thread. **result() calls get_output() in the calling thread** [measured] **the oldest batch's future is waited on in step_with_batch_queue** [measured] With two ranks the executor enqueues each step on a shared-memory queue that the workers read, and the engine core waits for the answer on another. **rpc_broadcast_mq** [measured] **shared memory for readers on the same host** [measured] In a worker the main thread hands each output to a queue, and a thread of its own takes it, calls `get_output`, which waits for the copy, and sends the result back. **a thread in the worker waits for the copy** [measured] The model draws both as a sync stage, and the debrief shows which thread owns it. So the first prediction's answer is three. A token leaves the worker for the engine core through shared memory, leaves the engine core for the API server over a socket, and leaves the API server for the client, which is three process boundaries [derived] at two ranks and two at one.

## The states of a request

A request is never just "running". The scheduler gives it a status, and the status decides which queue it sits in and what the next step may do with it. There are twelve. **12 states** [measured]

- **Four ways to wait.** WAITING is the ordinary queue for admission. WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR is the wait while a grammar compiles. WAITING_FOR_REMOTE_KVS is the wait while a connector loads the request's KV from elsewhere. WAITING_FOR_STREAMING_REQ is a session that has stopped and is waiting for its next input.
- **Two ways to be active.** RUNNING is in the running list and gets tokens each step. PREEMPTED is what a running request becomes when the scheduler takes its blocks back: it waits again, from the front of the queue, to recompute.
- **Six ways to finish.** FINISHED_STOPPED, FINISHED_LENGTH_CAPPED, FINISHED_ABORTED, FINISHED_IGNORED, FINISHED_ERROR and FINISHED_REPETITION. A status is finished when it comes after PREEMPTED in the enum, so the order of the members is part of the rule. **finished means after PREEMPTED** [measured] Each maps to the finish reason the client sees. **a finish reason for each finished state** [measured]

The table says what moves a request from one to the next.

| From | To | What moves it | Read it at |
|---|---|---|---|
| a new request | WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR | it has a structured-output request | [`Request.__init__`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L117) |
| WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR | WAITING | its grammar has compiled | [`_handle_blocked_waiting_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L3547) |
| WAITING | WAITING_FOR_REMOTE_KVS | a connector loads its KV asynchronously | [`schedule`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1523) |
| WAITING_FOR_REMOTE_KVS | WAITING, or PREEMPTED | the load has finished | [`_handle_blocked_waiting_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L3531) |
| WAITING, PREEMPTED | RUNNING | the scheduler admits it into a step | [`schedule`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1572) |
| RUNNING | PREEMPTED | the scheduler needs its blocks | [`_preempt_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1821) |
| RUNNING | FINISHED_STOPPED, FINISHED_LENGTH_CAPPED, FINISHED_REPETITION | `check_stop`, after each output | [`check_stop`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/utils.py#L118) |
| RUNNING | FINISHED_ERROR | the grammar rejects what was sampled | [`update_from_output`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2441) |
| RUNNING | WAITING_FOR_STREAMING_REQ | a resumable session stops with no input queued | [`_handle_stopped_request`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2739) |
| any unfinished status | FINISHED_ABORTED | `finish_requests`, from an abort | [`finish_requests`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L3026) |

Read the claims behind the rows: the request is admitted where it joins the running list, **RUNNING, when it joins the running list** [measured] and only a running request can be preempted. **only a running request, which goes to PREEMPTED** [measured] **recompute** [measured] A new request that has a grammar starts in the grammar wait. **WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR** [measured] **promoted to WAITING** [measured] A remote load puts a request in its wait and takes it out again. **WAITING_FOR_REMOTE_KVS** [measured] **back to WAITING, or to PREEMPTED** [measured] The stop check sets three of the finished states. **STOPPED, LENGTH_CAPPED or REPETITION, by check_stop** [measured] A grammar can also finish a request with an error, **FINISHED_ERROR when the grammar rejects what was sampled** [measured] and a stopped session can wait for its next input. **WAITING_FOR_STREAMING_REQ** [measured]

Twelve states, and one of them is never entered. FINISHED_IGNORED is in the enum and in the finish-reason map, where its comment says it stands for a prompt longer than the model's length cap, and nothing in the package assigns it. **nothing assigns FINISHED_IGNORED** [measured] That is a good habit to take from this lesson: read the transitions and not the enum, because an enum lists what someone once meant to have. The answer to the third prediction is six, and the table above shows why only five of them are ever assigned.

## One budget, again

The second prediction's answer is 302 tokens [derived]. The scheduler serves the running requests first, one token each, and then the waiting ones, out of the same budget. **running first, then waiting** [measured] The two decoders take two tokens, and the new prompt takes its 300 [estimated], so the step holds both. In nano-vllm the same queue gave a step of 300 tokens [derived] with nothing for the decoders, and a second step of three. The scheduler in this lesson has no notion of a prefill step. **one token budget** [measured]

> **An event loop with a work queue.** The busy loop is the event loop of a single-threaded server. Other threads do the blocking I/O and hand work to it through queues, and it never waits on a socket itself.
>
> Where it breaks: A server's loop waits for I/O, and this loop waits for the GPU. The batch queue exists so that the loop schedules the next batch before it waits, which an ordinary event loop has no need to do.

> **An enum lists what someone meant to have.** The twelve statuses are a list, and the transitions are the machine. One status is never assigned, three are entered only in special configurations, and the order of the members decides which count as finished. Read where a status is set before you describe what it means.

> **Card.** The notional-machine card `lifecycle`.

## What to carry

- Two processes, three threads in the second, and a queue between every pair of threads. The busy loop reads only queues, and the sockets are read by threads that release the GIL.
- The step is two calls, a launch and a sample, and the wait sits at the oldest batch's result. Which thread waits depends on the executor.
- A request has twelve statuses, six of them finished. Read the transitions, because one of the twelve is never assigned.

## Exit check

This lesson tests three skills: tracing a request through vLLM at the pin, naming each queue, process boundary, copy and sync (`tr1.vllm-lifecycle`), naming the states of a request and what moves it from one to the next (`tr1.request-states`), and saying what one token budget makes of a step (`tr1.phases-vs-one-budget`). The exit ticket is three items on fresh seeds, two on states and one on the step. It is passed with at least two right (ASSESSMENT §4.2). The first skill is earned by the module's graded map, on its vLLM scenarios.

> **Practice.** Items from the generator family `tr1.request-state`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr1.step-budget`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `vllm.async-output.copy-stream`: Model Runner V2 copies the sampled ids to host memory on a separate copy stream, after that stream has waited for the main stream, so that the ids are complete. Value a copy stream that waits for the main stream [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L137-L141>, read 2026-11-04).
- `vllm.async-output.event-sync`: AsyncOutput.get_output waits on the copy's event with copy_event.synchronize() before it reads the sampled ids, so the host blocks there until the copy has landed. Value copy_event.synchronize() [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/worker/gpu/async_utils.py, AsyncOutput.get_output <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/async_utils.py#L174-L176>, read 2026-11-04).
- `vllm.engine-core.busy-loop`: The engine core's busy loop at v0.33.0 polls the input queue until there is work, runs one engine step, and goes round again. Value poll the input queue, then step [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.run_busy_loop <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1621-L1632>, read 2026-11-04).
- `vllm.engine-core.input-thread-queue`: The engine core's input thread puts each request that it decodes on input_queue, which its comment calls the input queue for the core busy loop. Value the input thread puts each request on input_queue [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.process_input_sockets <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2039-L2040>, read 2026-11-05).
- `vllm.engine-core.io-threads`: The engine core's source gives the reason for its threads and queues. Socket I/O in background threads releases the GIL and overlaps with the GPU, and some serialization overlaps with the forward pass. The threads move messages between the sockets and the queues, and the busy loop reads only the queues. Value threads for the sockets, queues for the busy loop [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1250-L1254>, read 2026-11-05).
- `vllm.engine-core.queues`: At v0.33.0 the engine core process keeps a thread-safe input_queue of client requests and an output_queue of engine outputs. Value input_queue, output_queue [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1184-L1185>, read 2026-11-04).
- `vllm.engine-core.result-waits-in-busy-loop`: In step_with_batch_queue, under the comment "Block until the next result is available", the engine core takes the oldest batch off batch_queue and calls result() on its future in the same thread. Value the oldest batch's future is waited on in step_with_batch_queue [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step_with_batch_queue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L777-L783>, read 2026-11-05).
- `vllm.engine-core.zmq-dealer`: The engine core's input thread connects a ZMQ DEALER socket, with the engine's identity, to the client's ROUTER. Value the input thread connects a DEALER [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.process_input_sockets <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1947-L1955>, read 2026-11-05).
- `vllm.engine-core.zmq-push`: The engine core's output thread sends each batch of outputs on a ZMQ PUSH socket, to the client's PULL. Value the output thread pushes [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCoreProc.process_output_sockets <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2058-L2064>, read 2026-11-05).
- `vllm.executor.message-queue-shm`: vLLM's MessageQueue class, in shm_broadcast.py, reaches its readers on the same host through shared memory. Value shared memory for readers on the same host [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/distributed/device_communicators/shm_broadcast.py, MessageQueue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/distributed/device_communicators/shm_broadcast.py#L495-L500>, read 2026-11-04).
- `vllm.executor.rpc-broadcast`: With more than one rank the engine core's executor is MultiprocExecutor, and its collective_rpc enqueues a call, which is the method, its arguments and the output rank, on a queue named rpc_broadcast_mq. Value rpc_broadcast_mq [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/executor/multiproc_executor.py, MultiprocExecutor.collective_rpc <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/multiproc_executor.py#L492>, read 2026-11-04).
- `vllm.executor.uniproc-future`: With one rank the executor is UniProcExecutor, and execute_model(non_block=True) hands back a future whose result() calls AsyncOutput.get_output(), the wait on the copy, in whichever thread asks for the result. Value result() calls get_output() in the calling thread [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/executor/uniproc_executor.py, AsyncOutputFuture <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/uniproc_executor.py#L32-L48>, read 2026-11-05).
- `vllm.executor.worker-async-output-thread`: In a worker process with async scheduling on, the main thread puts each output on async_output_queue, and a thread of its own, WorkerAsyncOutputCopy, takes it, calls get_output, which waits for the copy, and puts the result on the worker's response queue. Value a thread in the worker waits for the copy [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/executor/multiproc_executor.py, WorkerProc.handle_output and async_output_busy_loop <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/executor/multiproc_executor.py#L1127-L1152>, read 2026-11-05).
- `vllm.frontend.cancellation`: The decorator on vLLM's completions route runs the handler as one asyncio task and a listener for the HTTP disconnect message as another. When the listener finishes first, the handler task is cancelled. Value a route handler is cancelled when the client disconnects [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/entrypoints/serve/utils/api_utils.py, with_cancellation <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/entrypoints/serve/utils/api_utils.py#L68-L111>, read 2026-11-05).
- `vllm.frontend.collector-drain`: AsyncLLM.generate reads its request's collector without awaiting when something is already there, and its comment says this avoids a task switch under load. Value drain without a task switch where possible [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/async_llm.py, AsyncLLM.generate <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L789-L802>, read 2026-11-05).
- `vllm.frontend.output-handler`: AsyncLLM has one background loop, _run_output_handler, which its docstring says pulls from the EngineCore and pushes to AsyncStreams. Value one background loop for all outputs [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/async_llm.py, AsyncLLM._run_output_handler <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L856-L857>, read 2026-11-05).
- `vllm.frontend.output-processor-detokenizes`: In OutputProcessor.process_outputs, a comment says the step turns each request's new token ids into text and performs the stop checks. The request's detokenizer returns a stop string when it finds one, and the request's finish reason then becomes STOP. Value the output processor detokenizes and performs the stop checks [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/output_processor.py, OutputProcessor.process_outputs <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/output_processor.py#L823-L830>, read 2026-11-05).
- `vllm.frontend.output-processor-step`: In the output handler's loop, each slice of the engine core's outputs goes through output_processor.process_outputs, and a note in the code says the RequestOutputs are pushed to their queues. Value the outputs go through the output processor, the results to their queues [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/async_llm.py, AsyncLLM._run_output_handler <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L904-L911>, read 2026-11-05).
- `vllm.frontend.socket-task`: The engine core client reads the output socket in an asyncio task of its own and puts what it reads on an asyncio queue, so the socket's I/O is separate from the task that processes the outputs. Value socket reads in a task of their own [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core_client.py, AsyncMPClient._ensure_output_queue_task <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L1193-L1262>, read 2026-11-05).
- `vllm.frontend.zmq-router-pull`: The engine core client in the API server binds a ZMQ ROUTER socket that it sends requests on and a PULL socket that it receives outputs on. Value a ROUTER for requests, a PULL for outputs [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/engine/core_client.py, MPClient.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L674-L686>, read 2026-11-05).
- `vllm.request.admitted`: A waiting or preempted request becomes RUNNING in Scheduler.schedule, at the point where it is moved onto the running list and given its tokens for the step. Value RUNNING, when it joins the running list [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1547-L1573>, read 2026-11-05).
- `vllm.request.check-stop`: check_stop sets a request's status after each output. It sets FINISHED_STOPPED for the end-of-sequence token or a stop token, FINISHED_LENGTH_CAPPED for the model's length or the request's max_tokens, and FINISHED_REPETITION when repetition detection finds a repeated pattern. Value STOPPED, LENGTH_CAPPED or REPETITION, by check_stop [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/utils.py, check_stop <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/utils.py#L98-L140>, read 2026-11-05).
- `vllm.request.engine-core-process`: In vLLM's multi-process mode the engine core runs in a background process with its own busy loop, and the client in the API server's process pushes requests to it and pulls outputs from it through ZMQ sockets. Value a background process with a busy loop [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core_client.py, MPClient <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L598-L604>, read 2026-11-04).
- `vllm.request.finish-reasons`: Each finished status maps to the finish reason that the client sees. FINISHED_ABORTED maps to abort, FINISHED_STOPPED to stop, and FINISHED_LENGTH_CAPPED and FINISHED_IGNORED both to length. Value a finish reason for each finished state [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, _FINISHED_REASON_MAP <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L400-L412>, read 2026-11-05).
- `vllm.request.finished-order`: A status counts as finished when it is greater than PREEMPTED, so the six statuses that begin FINISHED_ are the last six of the enum, and the order of the members is part of the rule. Value finished means after PREEMPTED [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, RequestStatus <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L379-L393>, read 2026-11-05).
- `vllm.request.grammar-error`: update_from_output finishes a request with FINISHED_ERROR when the structured-output grammar does not accept the tokens that the model sampled for it. Value FINISHED_ERROR when the grammar rejects what was sampled [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.update_from_output <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2432-L2443>, read 2026-11-05).
- `vllm.request.grammar-ready`: The scheduler promotes a request that was waiting for its grammar to WAITING once the grammar has compiled. A grammar that failed to compile leaves it where it is, with an error recorded for the request. Value promoted to WAITING [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler._handle_blocked_waiting_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L3535-L3547>, read 2026-11-05).
- `vllm.request.grammar-wait`: A generative request that has a structured-output request starts in WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, and not in WAITING, while its grammar compiles. Value WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, Request.__init__ <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L112-L117>, read 2026-11-05).
- `vllm.request.ignored-unassigned`: FINISHED_IGNORED appears in the vllm package only in the enum and in the finish-reason map, where its comment says it stands for a prompt longer than the model's length cap. Nothing in the package assigns it, so no request reaches it. Value nothing assigns FINISHED_IGNORED [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/request.py, RequestStatus and _FINISHED_REASON_MAP <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L378-L412>, read 2026-11-05).
- `vllm.request.preempted-status`: Only a running request can be preempted, and _preempt_request asserts it. It frees the request's blocks, sets PREEMPTED, sets the computed-token count back to zero and puts the request at the front of the waiting queue. Value only a running request, which goes to PREEMPTED [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler._preempt_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1812-L1843>, read 2026-11-05).
- `vllm.request.remote-kv-ready`: When the remote load has finished, the scheduler promotes the request to WAITING, or to PREEMPTED if it has been preempted before. Value back to WAITING, or to PREEMPTED [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler._handle_blocked_waiting_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L3519-L3534>, read 2026-11-05).
- `vllm.request.remote-kv-wait`: When a KV connector loads a waiting request's cache asynchronously, the scheduler allocates its memory, sets the request to WAITING_FOR_REMOTE_KVS and skips it for the step. Value WAITING_FOR_REMOTE_KVS [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1514-L1545>, read 2026-11-05).
- `vllm.request.states`: At v0.33.0 a request is in one of 12 states, WAITING, WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, WAITING_FOR_REMOTE_KVS, WAITING_FOR_STREAMING_REQ, RUNNING, PREEMPTED, and six finished states that begin FINISHED_. Value 12 states [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/request.py, RequestStatus <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L370-L386>, read 2026-11-04).
- `vllm.request.streaming-wait`: A request that stopped but is resumable, because it is a streaming input session with no further input queued, is set to WAITING_FOR_STREAMING_REQ and is counted among the sessions waiting for input. Value WAITING_FOR_STREAMING_REQ [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler._handle_stopped_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L2732-L2742>, read 2026-11-05).
- `vllm.scheduler.no-phases`: The v1 scheduler has no prefill phase and no decode phase. Each request has only the tokens it has computed and the tokens it should have, and each step hands out one token budget so that every request catches up. Value one token budget [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L701-L710>, read 2026-11-04).
- `vllm.scheduler.order`: Within one step the scheduler serves the running requests first and the waiting requests after them, all out of the same token budget. Value running first, then waiting [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L793>, read 2026-11-04).
- `vllm.scheduler.preemption-recompute`: Preemption in vLLM v0.33.0 is recompute only. The victim's blocks are freed, its computed-token count goes back to 0, and it returns to the front of the waiting queue. Value recompute [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, _preempt_request <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L1799-L1842>, read 2026-11-04).
- `vllm.step.batch-queue`: With async scheduling the engine core uses step_with_batch_queue. It schedules a new batch whenever the queue has room and returns at once, and it blocks on the oldest batch's result only when the queue is full or nothing else can be scheduled. Value the batch queue first [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, EngineCore.step_with_batch_queue <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L708-L723>, read 2026-11-04).
- `vllm.step.execute-then-sample`: In the default runner, MRV2, execute_model runs the forward pass, keeps its state in execute_model_state, and returns None. Sampling is a second call, sample_tokens, which takes the grammar output. Value execute_model returns nothing, and sample_tokens samples [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/worker/gpu/model_runner.py, GPUModelRunner.sample_tokens <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/worker/gpu/model_runner.py#L2123-L2156>, read 2026-11-05).
- `vllm.step.idle-sleep`: When a step ran no model but the scheduler still holds requests, as when requests wait for remote KV or for a delayed free, the engine core loop sleeps 0.001 s to let background threads progress. Value 0.001 s [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/engine/core.py, _process_engine_step <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L1690-L1694>, read 2026-11-04).
- `vllm.step.max-concurrent-batches.mrv2`: With async scheduling on, Model Runner V2 (MRV2) keeps pipeline-parallel size plus 1 batches in flight, so 2 batches without pipeline parallelism. Value pp_size + 1 [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, max_concurrent_batches <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L592-L594>, read 2026-11-04).
