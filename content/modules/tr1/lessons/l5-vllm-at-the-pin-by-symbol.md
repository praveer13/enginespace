---
id: tr1.l5
module: tr1
title: "vLLM at the pin, by symbol: from create_completion to sample_tokens"
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.vllm-lifecycle, tr1.request-states, tr1.phases-vs-one-budget]
builds_on: [ks:T5.L10, ks:T5.L7, ks:T2.L1, ks:T3.L6]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

The post gave you vLLM's shape. Now you read it at the version the course pins, v0.33.0, by symbol. The shape is the one Mini-SGLang taught, in fewer boxes: an API server process, an engine core process that schedules and drives the GPU, and sockets between them. {{claim:vllm.request.engine-core-process}} Two things make the lap harder to read at the pin than in the post. The engine core launches the next batch before it has read the last one, and the model runner is not the one the post reads. This lesson walks one request through the symbols that matter, names every queue and every thread, and ends with the thing the whole module has been circling: the states a request passes through.

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

:::predict
id: tr1.l5.p1
prompt: In vLLM v0.33.0, serving a streamed answer on two GPUs, how many process boundaries does a sampled token cross on its way to the client?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.vllm-lifecycle]
:::

:::predict
id: tr1.l5.p2
prompt: Two requests are in the middle of decoding in vLLM v0.33.0, and a new prompt of 300 tokens [estimated] has just joined the waiting queue. The token budget of a step is large enough to hold it. How many tokens does the next step run?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr1.phases-vs-one-budget]
:::

:::predict
id: tr1.l5.p3
prompt: A vLLM request at v0.33.0 is always in one of twelve statuses. How many of the twelve count as finished?
answer: { kind: numeric, unit: statuses, rel_tol: 0 }
reveal: after-game
kcs: [tr1.request-states]
:::

Then play the `vllm` level on its practice seed. The engine plans a step before it has read the last one, so the sync that follows a copy is not in the same turn of the loop, and a queue sits between the copy and the wait. The debrief lays this engine's floor plan beside the post's.

:::game
id: engine-floor
level: vllm
mode: practice
:::

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

:::figure
src: figures/tr1/l5-vllm-threads.svg
alt: vLLM's API server with three asyncio tasks and its engine core with three threads and a GPU, joined by ZMQ sockets and queues
description: Two large boxes side by side. The API server on the left holds three asyncio tasks, a handler task above an output handler task above a socket task, joined upward by the outputs queue and the collector. The engine core on the right holds an input thread, a main thread and an output thread, joined downward by input_queue and output_queue, with a GPU box beside the main thread. A ZMQ arrow runs from the handler task to the input thread, and another from the output thread to the socket task. A caption notes that the busy loop also keeps batch_queue and aborts_queue.
origin: authored
:::

The API server is one process with one asyncio event loop, and the work in it is tasks. There is a handler task for each request. The route that starts it is wrapped so that a client that disconnects cancels it. {{claim:vllm.frontend.cancellation}} Two background tasks serve every request at once. The client's socket task reads the output socket into an asyncio queue, so that socket I/O is separate from what processes the outputs. {{claim:vllm.frontend.socket-task}} The output handler pulls from that queue, runs the output processor, which detokenizes and finds stop strings, and pushes each result onto its request's own collector. {{claim:vllm.frontend.output-handler}} {{claim:vllm.frontend.output-processor-step}} {{claim:vllm.frontend.output-processor-detokenizes}} The generator that a handler iterates reads its collector, without awaiting where it can, because the comment above it says a task switch under load costs. {{claim:vllm.frontend.collector-drain}} The two sockets are a ROUTER that the client binds for requests and a PULL for outputs. {{claim:vllm.frontend.zmq-router-pull}}

The engine core is the second process. It runs in the background with its own busy loop, and its client pushes requests to it and pulls outputs from it. {{claim:vllm.request.engine-core-process}} It has three threads. The input thread connects a DEALER socket to the client's ROUTER and puts what it reads on `input_queue`. {{claim:vllm.engine-core.zmq-dealer}} {{claim:vllm.engine-core.input-thread-queue}} The main thread runs the busy loop. The output thread takes `output_queue` and pushes each batch of outputs on a PUSH socket. {{claim:vllm.engine-core.zmq-push}} The queues are thread-safe queues that the process creates for them. {{claim:vllm.engine-core.queues}} The source gives the reason for the arrangement in a comment: socket I/O in background threads releases the GIL and overlaps with the GPU, and the busy loop reads only queues. {{claim:vllm.engine-core.io-threads}}

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

Poll the input queue, then step the engine and put the outputs on the output queue. {{claim:vllm.engine-core.busy-loop}} The step is the method the fourth lesson put beside the post's. With async scheduling on, which is the default, the loop calls `step_with_batch_queue`, and the method where the overlap lives is [these few lines](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L761-L778).

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

A launched batch's future goes into `batch_queue`. If the queue still has room, the method returns at once, and the loop comes back, schedules and launches the next batch. Only when the queue is full, or nothing more can be scheduled, does it pop the oldest future and wait for its result. {{claim:vllm.step.batch-queue}} The queue's size is the pipeline-parallel size plus one in the default runner, so two batches in flight when there is no pipeline parallelism [derived]. {{claim:vllm.step.max-concurrent-batches.mrv2}} That is the whole mechanism of async scheduling as far as the loop is concerned: one batch is on the GPU while the CPU plans the next. When a step ran no model but the scheduler still holds requests, for instance while they wait for remote KV, the loop sleeps for a moment so that background threads can make progress. {{claim:vllm.step.idle-sleep}}

## The runner, and where the wait sits

In the default runner the step is two calls. `execute_model` launches the forward pass, keeps what it needs in `execute_model_state`, and returns nothing. `sample_tokens` then takes the grammar output, launches the sampler, and starts the copy of the sampled ids up to the host on a stream of its own, after that stream has waited for the main one. {{claim:vllm.step.execute-then-sample}} {{claim:vllm.async-output.copy-stream}} The result is an `AsyncOutput`, and its `get_output` is the wait: `copy_event.synchronize()`. {{claim:vllm.async-output.event-sync}}

The part that is easy to miss is whose thread waits, because it depends on the number of ranks. With one rank the executor lives in the engine core's own process, and `execute_model(non_block=True)` hands back a future whose `result()` calls `get_output` in whichever thread asks for it. That thread is the busy loop's, so the sync is in the main thread. {{claim:vllm.executor.uniproc-future}} {{claim:vllm.engine-core.result-waits-in-busy-loop}} With two ranks the executor enqueues each step on a shared-memory queue that the workers read, and the engine core waits for the answer on another. {{claim:vllm.executor.rpc-broadcast}} {{claim:vllm.executor.message-queue-shm}} In a worker the main thread hands each output to a queue, and a thread of its own takes it, calls `get_output`, which waits for the copy, and sends the result back. {{claim:vllm.executor.worker-async-output-thread}} The model draws both as a sync stage, and the debrief shows which thread owns it. So the first prediction's answer is three. A token leaves the worker for the engine core through shared memory, leaves the engine core for the API server over a socket, and leaves the API server for the client, which is three process boundaries [derived] at two ranks and two at one.

## The states of a request

A request is never just "running". The scheduler gives it a status, and the status decides which queue it sits in and what the next step may do with it. There are twelve. {{claim:vllm.request.states}}

- **Four ways to wait.** WAITING is the ordinary queue for admission. WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR is the wait while a grammar compiles. WAITING_FOR_REMOTE_KVS is the wait while a connector loads the request's KV from elsewhere. WAITING_FOR_STREAMING_REQ is a session that has stopped and is waiting for its next input.
- **Two ways to be active.** RUNNING is in the running list and gets tokens each step. PREEMPTED is what a running request becomes when the scheduler takes its blocks back: it waits again, from the front of the queue, to recompute.
- **Six ways to finish.** FINISHED_STOPPED, FINISHED_LENGTH_CAPPED, FINISHED_ABORTED, FINISHED_IGNORED, FINISHED_ERROR and FINISHED_REPETITION. A status is finished when it comes after PREEMPTED in the enum, so the order of the members is part of the rule. {{claim:vllm.request.finished-order}} Each maps to the finish reason the client sees. {{claim:vllm.request.finish-reasons}}

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

Read the claims behind the rows: the request is admitted where it joins the running list, {{claim:vllm.request.admitted}} and only a running request can be preempted. {{claim:vllm.request.preempted-status}} {{claim:vllm.scheduler.preemption-recompute}} A new request that has a grammar starts in the grammar wait. {{claim:vllm.request.grammar-wait}} {{claim:vllm.request.grammar-ready}} A remote load puts a request in its wait and takes it out again. {{claim:vllm.request.remote-kv-wait}} {{claim:vllm.request.remote-kv-ready}} The stop check sets three of the finished states. {{claim:vllm.request.check-stop}} A grammar can also finish a request with an error, {{claim:vllm.request.grammar-error}} and a stopped session can wait for its next input. {{claim:vllm.request.streaming-wait}}

Twelve states, and one of them is never entered. FINISHED_IGNORED is in the enum and in the finish-reason map, where its comment says it stands for a prompt longer than the model's length cap, and nothing in the package assigns it. {{claim:vllm.request.ignored-unassigned}} That is a good habit to take from this lesson: read the transitions and not the enum, because an enum lists what someone once meant to have. The answer to the third prediction is six, and the table above shows why only five of them are ever assigned.

## One budget, again

The second prediction's answer is 302 tokens [derived]. The scheduler serves the running requests first, one token each, and then the waiting ones, out of the same budget. {{claim:vllm.scheduler.order}} The two decoders take two tokens, and the new prompt takes its 300 [estimated], so the step holds both. In nano-vllm the same queue gave a step of 300 tokens [derived] with nothing for the decoders, and a second step of three. The scheduler in this lesson has no notion of a prefill step. {{claim:vllm.scheduler.no-phases}}

:::card
kind: isomorphism
title: An event loop with a work queue
body: The busy loop is the event loop of a single-threaded server. Other threads do the blocking I/O and hand work to it through queues, and it never waits on a socket itself.
breaks: A server's loop waits for I/O, and this loop waits for the GPU. The batch queue exists so that the loop schedules the next batch before it waits, which an ordinary event loop has no need to do.
:::

:::card
kind: warning
title: An enum lists what someone meant to have
body: The twelve statuses are a list, and the transitions are the machine. One status is never assigned, three are entered only in special configurations, and the order of the members decides which count as finished. Read where a status is set before you describe what it means.
:::

:::card
kind: notional-machine
id: lifecycle
:::

## What to carry

- Two processes, three threads in the second, and a queue between every pair of threads. The busy loop reads only queues, and the sockets are read by threads that release the GIL.
- The step is two calls, a launch and a sample, and the wait sits at the oldest batch's result. Which thread waits depends on the executor.
- A request has twelve statuses, six of them finished. Read the transitions, because one of the twelve is never assigned.

## Exit check

This lesson tests three skills: tracing a request through vLLM at the pin, naming each queue, process boundary, copy and sync (`tr1.vllm-lifecycle`), naming the states of a request and what moves it from one to the next (`tr1.request-states`), and saying what one token budget makes of a step (`tr1.phases-vs-one-budget`). The exit ticket is three items on fresh seeds, two on states and one on the step. It is passed with at least two right (ASSESSMENT §4.2). The first skill is earned by the module's graded map, on its vLLM scenarios.

:::item
family: tr1.request-state
level: 2
count: 2
:::

:::item
family: tr1.step-budget
level: 2
count: 1
:::
