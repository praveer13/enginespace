---
id: tr1.l7
module: tr1
title: "Abort inside the engine: where the news goes and who frees the blocks"
minutes: 60                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.abort-path]
builds_on: [ks:T5.L7, ks:T2.L1]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

A streamed answer is a promise to keep working, and the client can break it at any moment. A tab closes, a phone goes into a tunnel, a script gives up. From that moment every token the engine makes is paid for and thrown away, and the blocks of KV memory that the request holds are taken from requests that somebody still wants. An engine that cannot take a request back leaks capacity, so abort belongs to the lifecycle and not to its edge.

nano-vllm has no abort. Its package has no way to take a request back, so every request in it runs to its end. {{claim:nano-vllm.llm-is-the-engine}} The other four engines each have a path for the news, and the four paths are the best test of the lifecycle in this module, because an abort crosses sockets, queues and threads, the mechanisms of the first lesson, and then has to win a race against the GPU.

This is a minimal version of a lesson that another course owns. The Data Plane specialization teaches the stream that survives: the disconnect at the HTTP or gRPC edge, `select!` safety, shutdown, hedging and retries, in its fifth lesson, `DP5`. That course has not shipped, so TR1 carries the part that happens inside the engine, in under an hour [estimated]. The story here starts when the engine's front end notices that the client has gone, and it ends when the blocks are back in the pool.

## Before you play

Two questions, to commit to before you lay the path. The first counts the places that the news has to cross. The second is about a race, because the GPU is busy with a step when the news arrives.

:::predict
id: tr1.l7.p1
prompt: In vLLM at the pin, a client disconnects in the middle of a stream. How many process boundaries does the news cross between the client and the engine core?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.abort-path]
:::

:::predict
id: tr1.l7.p2
prompt: In SGLang at the pin, an abort reaches the scheduler while its request is running. How many more forward passes does the request run before its blocks are freed?
answer: { kind: numeric, unit: passes, rel_tol: 0 }
reveal: after-game
kcs: [tr1.abort-path]
:::

Then play the `abort` level. It is vLLM at the pin with a stream whose client leaves. Lay the way the first token took, which you know from the fifth lesson, and then lay the abort.

:::game
id: engine-floor
level: abort
mode: practice
:::

## The abort at the pin

Here are the stages that the level adds after the first token. The first column is the stage's id in the lifecycle model.

| Stage | What happens | Mechanism | Read it at |
|---|---|---|---|
| `vllm.disconnect` | the client closes the connection, and `generate` catches the cancellation | IPC | [`generate`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L804) |
| `vllm.abort-request` | `AsyncLLM.abort` forgets the request in the output processor | compute | [`abort`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/async_llm.py#L955) |
| `vllm.abort-zmq` | an ABORT message goes to the engine core | IPC | [`abort_requests_async`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core_client.py#L1346) |
| `vllm.aborts-queue` | the input thread puts the abort on `aborts_queue` | queue | [`process_input_sockets`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2037) |
| `vllm.process-aborts` | `_process_aborts_queue` runs before `update_from_output` | compute | [`step_with_batch_queue`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L792) |
| `vllm.finish-aborted` | the scheduler finishes the request as `FINISHED_ABORTED` | compute | [`abort_requests`](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L569) |

Two of the six stages cross a process boundary, the client's disconnect and the ABORT message to the engine core, so the first prediction's answer is two [derived]. The first two stages are the front end's. The route that serves the completion is wrapped so that a client that disconnects cancels its handler task. {{claim:vllm.frontend.cancellation}} Then `AsyncLLM.generate` catches the cancellation, or the generator being collected, and aborts the request in the engine before it re-raises. {{claim:vllm.frontend.generate-aborts}} `AsyncLLM.abort` forgets the request in its own output processor first, and only then sends the engine core a message with the request ids, so that both halves of the system forget it. {{claim:vllm.frontend.abort-two-places}}

The next three stages are the engine core's, and they hold the idea of the lesson. The message arrives on the engine core's input thread, and the input thread does something that a request never gets. [These lines](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L2032-L2040) put an abort on two queues.

```python
# vllm/v1/engine/core.py, lines 2032 to 2040 at v0.33.0
    if request_type == EngineCoreRequestType.ABORT:
        # Aborts are added to *both* queues, allows us to eagerly
        # process aborts while also ensuring ordering in the input
        # queue to avoid leaking requests. This is ok because
        # aborting in the scheduler is idempotent.
        self.aborts_queue.put_nowait(request)

# Push to input queue for core busy loop.
self.input_queue.put_nowait((request_type, request))
```

The copy on `aborts_queue` lets the engine process the abort eagerly, and the copy on `input_queue` keeps the order of the input queue, so that no request is leaked. The comment gives the reason that makes two copies safe: aborting in the scheduler is idempotent. {{claim:vllm.engine-core.abort-both-queues}} What "at once" means is in [these lines](https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/engine/core.py#L790-L795), in the step that you read in the fifth lesson.

```python
# vllm/v1/engine/core.py, lines 790 to 795 at v0.33.0
# Before processing the model output, process any aborts that happened
# during the model execution.
self._process_aborts_queue()
engine_core_outputs = self.scheduler.update_from_output(
    scheduler_output, model_output
)
```

The engine core drains `aborts_queue` after the forward returns and before it updates the scheduler from the output. {{claim:vllm.engine-core.aborts}} That is the whole reason for the queue of its own. An abort has to be seen between two steps and not wait behind them, and the engine core has one place between the forward and the update where it can look. The figure puts the idea on three lanes of time.

:::figure
src: figures/tr1/l7-abort.svg
alt: An abort in vLLM that arrives while step N runs, and is handled between the forward and the update
description: Three lanes against time. The API server lane has a cancel block and then an abort block. A ZMQ arrow runs from the abort block to the input thread's lane, where one block puts the abort on both queues. The main thread's lane has a long block for the forward of step N, and after it an aborts block and an update block. An arrow labelled aborts_queue runs from the queues block to the aborts block, which begins where the forward ends. The abort arrives while the step runs, and it is handled after the forward and before the update.
origin: authored
:::

An engine that is idle empties `aborts_queue` without processing it, because every abort is also on `input_queue` and will be handled there. {{claim:vllm.engine-core.abort-idle-drain}}

The last stage is the scheduler's. The engine core tells the scheduler to finish the requests with the status `FINISHED_ABORTED`. {{claim:vllm.engine-core.abort-status}} `finish_requests` skips an id that is unknown or already finished, takes each of the others out of `running` or the waiting queues, sets the status, and frees the request. {{claim:vllm.scheduler.finish-requests}} The blocks go back to the pool through `kv_cache_manager.free`, unless a connector delays the free or a step in flight may still write them. {{claim:vllm.scheduler.free-blocks}} The client sees the status as the finish reason `abort`. {{claim:vllm.request.finish-reasons}}

## The step in flight

The queue of its own exists because of a race. When the abort reaches the engine core, the GPU may be running a step that includes the request, and with async scheduling the engine may have planned the one after it. Whatever the engine does, it must end with no block leaked and no token sent to a client who has gone. The three engines that you have read that can abort give three different answers.

vLLM frees the request when it processes the abort, and makes sure that the step in flight cannot undo it. It processes the abort before the scheduler update, so that when `update_from_output` reads the step's output for the request, the request is already finished and the update skips it. Its own comment names the case: a request aborted while the model is executing it, which can happen with pipeline parallelism or with async scheduling. {{claim:vllm.engine-core.update-skips-finished}}

Mini-SGLang frees the request in the turn of its loop that handles the message. The scheduler asks the prefill manager and then the decode manager to take the request out, and if either had it, frees its table slot and its cache entry. {{claim:mini-sglang.abort-frees}} {{claim:mini-sglang.free-req-resources}} A request that has not started has little to free: the prefill manager removes its pending entry and returns the chunked request that the entry holds, if there is one. {{claim:mini-sglang.abort-pending}}

SGLang does not free a running request at all. It marks the request to finish. The request runs one more forward pass, and the code that finishes any request cleans up its KV allocation, which the comment gives as the reason: the abort reuses all the existing code. {{claim:sglang.abort.running-request}} The price is one more step, and what it buys is one place that frees blocks. SGLang has two other methods for requests that have not started to run. A request in the waiting queue is popped straight out of it, and something is still sent back to the tokenizer manager to clean up its state. {{claim:sglang.abort.waiting-queue}} A request in the grammar queue still runs one prefill, cut down to one token to make it cheap. {{claim:sglang.abort.grammar-queue}}

So the second prediction's answer is one. Each of the three designs pays where you can point at it. vLLM needs a rule that the update skips a finished request, Mini-SGLang needs its scheduler to free in the middle of its loop, and SGLang pays a forward pass.

## The same news, four ways

The news does not reach the scheduler the same way in each engine, and the differences are the path's stages.

Mini-SGLang notices late and sends the news the long way. The API server looks for a disconnect only when the next chunk is ready to send. {{claim:mini-sglang.disconnect-checked-per-chunk}} When it finds one it raises `CancelledError`, and the handler for that exception starts `abort_user` as a task of its own. {{claim:mini-sglang.abort-task}} `abort_user` waits a tenth of a second, deletes the request's mailbox entries, and sends an `AbortMsg` through `send_one`, {{claim:mini-sglang.abort-user}} which puts it on `send_tokenizer`. {{claim:mini-sglang.send-one}} The tokenizer worker is one loop for tokenize, detokenize and abort messages, {{claim:mini-sglang.worker-one-loop}} and it turns each `AbortMsg` into an `AbortBackendMsg` that goes to the scheduler. {{claim:mini-sglang.abort-forward}} That is three process boundaries from the client to the scheduler [derived]: the client to the API server, the API server to the tokenizer, and the tokenizer to the scheduler.

"Inside vLLM" has no queue of its own for aborts. At the post's commit the engine core handles an ABORT request in the same dispatch as an ADD, so the abort reaches the busy loop on the same input queue as a new request, behind the requests before it. {{claim:inside-vllm.abort-input-queue}} Each turn of that loop begins by polling the queue, and the poll handles every request that is waiting, so an abort that arrives during a step waits for the step to end and for the update to run. {{claim:inside-vllm.abort-handled-at-top}} The status it ends in is the pin's. {{claim:inside-vllm.abort-finishes}} So one of the boxes of the post moved, and it moved in a way that is easy to miss: the pin's engine looks for aborts between the forward and the update, and the post's looks at the top of the next turn.

SGLang notices in two places. A task that runs after the response ends waits two seconds and then aborts each of the request's ids that still has a state, {{claim:sglang.abort.task}} and a coroutine that waits for its request's event also wakes on a timeout to ask whether the client has gone. {{claim:sglang.frontend.poll-disconnect}} The tokenizer manager sends the scheduler one abort for each request. {{claim:sglang.abort.request-once}} The tokenizer manager shares the main process with the HTTP server, so the news crosses two process boundaries from the client to the scheduler [derived].

The count of process boundaries is the quickest way to tell the engines' paths apart, and the model computes it from the stages.

| Engine | Process boundaries from the client to the process that frees the request | Where the request is freed |
|---|---|---|
| nano-vllm | no abort | not applicable |
| Mini-SGLang | 3 [derived] | the scheduler, in the turn that handles the message |
| "Inside vLLM" | 2 [derived] | the engine core, at the top of the next turn |
| vLLM | 2 [derived] | the engine core, between the forward and the update |
| SGLang | 2 [derived] | the scheduler, by its finishing code, one forward pass later |

## An abort the engine starts

A client that leaves is not the only reason to abort a request. vLLM's engine core never sees text, so a stop string is found in the API server, in the output processor, whose comment says that its step turns each request's new token ids into text and performs the stop checks. {{claim:vllm.frontend.output-processor-detokenizes}} The output handler then sends the engine core an abort for each request that finished on a stop string, as its comment says. {{claim:vllm.frontend.stop-string-abort}} It is the same path with another cause, and it is the reason that the engine core has to survive an abort for a request that is already finished.

:::card
kind: isomorphism
title: Cancelling a running database query
body: A cancel for a running query comes in out of band, on another connection, and the backend acts on it at the next point where it can stop safely, then releases what the query held. An abort is that. It is a message that travels beside the request and not along it, it is acted on at a safe point, and the safe point decides what the cancelled work costs.
breaks: A database backend can look for a cancel in the middle of its own work. A GPU step cannot be cut short from the host, so an engine acts on an abort between two steps, and a step already launched still runs to its end.
:::

:::card
kind: warning
title: A gone request can still be in a batch
body: In every engine here the abort arrives while a step is in flight. A trace that shows the last forward pass of a request after its client has left is not a bug. Look for what skips it. It is the update that passes over a finished request, or the finishing code that runs one pass later.
:::

:::card
kind: notional-machine
id: lifecycle
:::

## The graded map

This is the end of the module's reading, and its proof. The `map` level draws a fresh scenario of any of the five engines: streaming or not, one rank or two, with an abort or without, with a prefix hit or without, and with one sample or two. You lay its whole path from the tray in one run. There is no undo and no live readout, and nothing is timed. Every stage you lay is matched, in order, to a span of the scenario's synthetic trace, and the tray holds real stages of the other engines, so knowing one engine's most common path is not enough. It passes when the whole path is right on its first run, on three fresh seeds [estimated] (ASSESSMENT §4.3).

:::game
id: engine-floor
level: map
mode: graded
:::

## What to carry

- An abort is a message that travels beside the request, and it has to win a race against the step in flight. The engines differ in where they let it win.
- vLLM at the pin gives the abort a queue of its own, drains it between the forward and the update, and skips the finished request in the update. Mini-SGLang frees at once. SGLang marks the request to finish and pays one more forward pass.
- The pin is not the post. The post's engine looks for an abort at the top of the next turn, and the pin's looks before the update.

## Exit check

This lesson tests one skill: tracing an abort from the front end to the freed blocks and saying what each engine does with a step in flight (`tr1.abort-path`). The exit ticket is three items on fresh seeds. Two ask which state a request is in, or which status it ends in, after an abort, and one asks in which process a stage of an abort's path runs. It is passed with at least two right (ASSESSMENT §4.2).

:::item
family: tr1.request-state
level: 2
count: 2
:::

:::item
family: tr1.where-does-it-run
level: 2
count: 1
:::
