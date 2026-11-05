---
id: tr1.l6
module: tr1
title: "SGLang at the pin: the overlap loop, result_queue, FutureMap, three streams and the Rust pieces"
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.sglang-lifecycle]
builds_on: [ks:T5.L10, ks:T5.L6, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

Mini-SGLang is the small cousin of the engine you read now: its README calls it a compact implementation of SGLang. {{claim:mini-sglang.readme-compact}} The two share a shape, so what you learned about Mini-SGLang's processes, mailbox and overlap loop carries over, in a bigger form. SGLang v0.5.23 is the version the course pins. Its scheduler file, [`scheduler.py`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py), is 6,409 lines [measured] and its tokenizer manager file, [`tokenizer_manager.py`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/tokenizer_manager.py), is 4,107 [measured], counted with `wc -l` on 2026-11-05 in the tarball of the tag, whose commit is `297e54f`. So this lesson does not read the files. It reads the loop that makes SGLang SGLang, the things the loop leans on, and the places where the engine differs from vLLM in ways that a map of one would get wrong about the other.

The shape is three components. The tokenizer manager tokenizes requests and sends them on. The scheduler runs in a subprocess, schedules batches, runs the forward and sends the output tokens on. The detokenizer manager runs in another subprocess, turns the tokens into text and sends it back. {{claim:sglang.engine.components}} The HTTP server, the engine and the tokenizer manager all run in the main process, and the processes talk over ZeroMQ. {{claim:sglang.engine.ipc}} So SGLang has no API server process of its own. The main process does the work of the front end and the tokenizer both.

## Before you play

Two questions, to commit to before you lay the path. The first is the game's own. The second is about what a request for two samples makes the engine do, and the answer is different in every engine you have read.

:::predict
id: tr1.l6.p1
prompt: In SGLang v0.5.23, serving a streamed answer at one rank, how many process boundaries does a sampled token cross on its way to the client?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.sglang-lifecycle]
:::

:::predict
id: tr1.l6.p2
prompt: A client asks SGLang for two samples of one prompt. How many requests does the tokenizer manager send to the scheduler?
answer: { kind: numeric, unit: requests, rel_tol: 0 }
reveal: after-game
kcs: [tr1.sglang-lifecycle]
:::

Then play the `sglang` level on its practice seed. The scheduler launches one batch and reads the result of the one before it in the next turn of its loop, and a prefix hit is found in the radix tree before the batch is built.

:::game
id: engine-floor
level: sglang
mode: practice
:::

## The path, by symbol

Here is the whole path of the practice level: one streamed request at one rank, with a prefix hit and one sample. The first column is the stage's id in the lifecycle model, and the last is the symbol that the stage was read from, linked at its pinned line.

| Stage | What happens | Mechanism | Read it at |
|---|---|---|---|
| `sglang.http-request` | the client POSTs to the completions route | IPC | [`openai_v1_completions`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/entrypoints/http_server.py#L1861) |
| `sglang.handle-request` | the request is converted off the event loop | compute | [`handle_request`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/entrypoints/openai/serving_base.py#L102) |
| `sglang.tokenize` | the tokenizer manager tokenizes the prompt | compute | [`generate_request`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/tokenizer_manager.py#L946) |
| `sglang.dispatch` | the tokenized request is pushed to rank zero's scheduler | IPC | [`_dispatch_to_scheduler`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/tokenizer_manager.py#L701) |
| `sglang.waiting-queue` | the request waits in `waiting_queue` | queue | [`_add_request_to_queue`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L3493) |
| `sglang.schedule` | the scheduler builds a prefill batch | compute | [`get_new_batch_prefill`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L4052) |
| `sglang.prefix-hit` | the radix tree is matched against the prompt | compute | [`_get_new_batch_prefill_raw`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L4260) |
| `sglang.run-batch` | `run_batch` hands the batch to the model worker | compute | [`run_batch`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L4704) |
| `sglang.h2d` | the prefill ids go down to the GPU | copy | [`resolve_forward_inputs`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/overlap_utils.py#L120) |
| `sglang.forward` | the model runs | compute | [`_forward_raw`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/model_executor/model_runner.py#L2063) |
| `sglang.sample` | the sampler picks the next tokens | compute | [`forward_batch_generation`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/tp_worker.py#L744) |
| `sglang.d2h` | the results start up to the host on the copy stream | copy | [`_copy_result_to_cpu`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L5035) |
| `sglang.result-queue` | the batch and its result are appended to `result_queue` | queue | [`event_loop_overlap`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L2112) |
| `sglang.copy-sync` | the next turn waits on the copy's event | sync | [`process_batch_result_prefill`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler_components/batch_result_processor.py#L268) |
| `sglang.process-result` | the scheduler processes the batch's result | compute | [`process_batch_result`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L5099) |
| `sglang.stream-output` | the scheduler pushes the tokens to the detokenizer | IPC | [`_stream_output_generation`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler_components/output_streamer.py#L235) |
| `sglang.detokenize` | the detokenizer manager decodes them | compute | [`event_loop`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/detokenizer_manager.py#L189) |
| `sglang.detokenizer-send` | it pushes the text back to the tokenizer manager | IPC | [`event_loop`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/detokenizer_manager.py#L191) |
| `sglang.handle-loop` | `handle_loop` appends to `out_list` and sets the request's event | queue | [`_handle_batch_output`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/tokenizer_manager.py#L2779) |
| `sglang.sse-chunk` | the handler streams a chunk to the client | IPC | [`_generate_completion_stream`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/entrypoints/openai/serving_completions.py#L403) |

## Two languages

SGLang is Python at the pin, with Rust beside it, and a lifecycle map has to say which path it draws. The default request path is Python end to end. A Rust HTTP server exists in the tree, a typed frontend that exchanges requests and responses with the Python scheduler, and it is opt-in: its switch is off by default. {{claim:sglang.rust.server-what}} {{claim:sglang.rust.server-opt-in}} vLLM has the same arrangement. It ships a Rust frontend that talks to the Python engine core over ZeroMQ, its README calls it experimental, and its switch is off. {{claim:vllm.rust.frontend-experimental}} {{claim:vllm.rust.frontend-off}}

SGLang's Rust is on by default in one place, and it is in the middle of the path. The core of the radix tree is the Rust one by default, chosen by an environment variable, and the Python core is a switch away. {{claim:sglang.radix.rust-core-default}} The Rust core is conditional, though. The registry falls back to Python for a list of cases, so a trace can come from the Python core on another machine. {{claim:sglang.radix.rust-core-fallback}} The path above is the same either way, because the radix match is a call inside the scheduler's process and not a hop.

## The overlap loop

The loop is the reason to read SGLang, and the version at the pin is the one you met in Mini-SGLang, grown up. The overlap scheduler is on by default, and a flag turns it off. {{claim:sglang.overlap.default}} Here is [the skeleton of `event_loop_overlap`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L2061-L2131), with the lines that a request's path does not need left out.

```python
# python/sglang/srt/managers/scheduler.py, lines 2061 to 2131 at v0.5.23
def event_loop_overlap(self):
    ...
    self.result_queue: Deque[
        Tuple[ScheduleBatch, Union[GenerationBatchResult, EmbeddingBatchResult]]
    ] = deque()

    def pop_and_process():
        # Process the results of the last batch
        tmp_batch, tmp_result = self.result_queue.popleft()
        self.process_batch_result(tmp_batch, tmp_result)

    while True:
        ...
        # Receive requests
        self.ingest_requests()
        ...
        # Get the next batch to run
        plan = self.get_next_batch_to_run(
        ...
        # Launch the current batch
        if batch:
            batch_result = self.run_batch(batch)
            ...
            self.result_queue.append((batch.copy(), batch_result))
        ...
        # Process the last batch
        if self.last_batch:
            if not disable_overlap_for_batch:
                pop_and_process()
        ...
        # Update last_batch
        self.last_batch = batch
```

Read the order. The loop receives requests, picks the next batch, launches it with `run_batch`, appends the batch and its result to `result_queue`, and only then processes the result of the previous batch. {{claim:sglang.overlap.loop}} {{claim:sglang.overlap.process-last}} The queue that Mini-SGLang carried in one argument, `last_data`, is here a real deque, and it is the `sglang.result-queue` stage of the path. {{claim:mini-sglang.overlap-loop-order}} The wait is part of processing a result. The prefill processor and the decode processor both wait on the batch's `copy_done` event before they read the result. {{claim:sglang.overlap.sync-in-result-processor}} {{claim:sglang.overlap.sync-in-decode-processor}} So the sync of batch N sits in the turn that launches batch N plus one, and the model draws the queue between the copy and the sync.

There is one exception worth knowing, because it is a rule about when overlap is worth having. For two consecutive prefill batches the loop can process the first one's result at once, to keep the first batch's time to first token short, and it does so only if an environment switch is set. {{claim:sglang.overlap.consecutive-prefill}} The switch is off by default. {{claim:sglang.overlap.consecutive-prefill-default}}

## What the loop leans on

Overlap works only if the CPU can launch batch N plus one without having batch N's answer on the host. SGLang's trick is the most surprising thing in the engine: in the plain path, the next batch's input ids do not come from the host.

At the start of a forward pass the scheduler fills a prefill batch's input ids by a copy down from pinned CPU staging. It fills a decode batch's by a gather from the **FutureMap**, which holds the last iteration's sampled token. {{claim:sglang.overlap.decode-inputs-on-gpu}} The FutureMap is a relay indexed by request-pool slot. A forward pass writes its results to it, and the next iteration reads them back. {{claim:sglang.overlap.future-map}} After a forward pass without speculation the scheduler publishes the batch's new lengths to the map and clears the batch's input ids, because the next iteration's are relayed through it. {{claim:sglang.overlap.publish-and-drop}} The map's token buffer is one integer for each slot, allocated on the map's device and not in host memory, and the scheduler builds the map with its own device. {{claim:sglang.overlap.future-map-device}} {{claim:sglang.overlap.future-map-built-on-scheduler-device}}

Say that again, because it is the idea of the whole lesson. The next decode's input ids are gathered from a buffer on the device, so launching batch N plus one does not wait for batch N's tokens to reach the host [derived]. The copy up to the host, `sglang.d2h` in the path, brings the same tokens to the CPU for its own work, and the CPU does that work one turn late. The GPU feeds itself, and the CPU follows. vLLM's default runner has the same idea in another place: it prepares its inputs on the GPU with Triton kernels, so that a value the CPU does not know yet can still be derived there. {{claim:vllm.mrv2.gpu-input-prep}}

The price of following late is paid at a request's end. A stop by length is predictable without the token, so before it launches a decode SGLang drops the requests that a queued result is about to finish by length. {{claim:sglang.overlap.skip-finishing-by-length}} A stop on a sampled token is not predictable, and the decode result processor has a branch for a request that is already finished, which a note in the code says only happens when overlap is on. {{claim:sglang.overlap.finished-in-next-batch}} In effect, one more batch can be launched for a request that has already stopped, and its result is skipped.

The loop works with three streams. The model runner creates the forward stream. {{claim:sglang.overlap.forward-stream}} The scheduler creates a stream of its own. {{claim:sglang.overlap.schedule-stream}} In `run_batch`, the forward stream first waits for that schedule stream, and then the forward pass is launched in it. {{claim:sglang.overlap.forward-waits-schedule}} The third stream does the readback. The docstring of the function that issues it says the readback goes on `copy_stream` so that it overlaps the next forward, and that the forward stream never waits for it. {{claim:sglang.overlap.copy-stream}} The figure draws the loop on the host's lane, above the forward stream's lane on the GPU.

:::figure
src: figures/tr1/l6-overlap.svg
alt: Three turns of SGLang's overlap loop on a host lane above a GPU lane whose forward passes follow each other without a gap
description: Two lanes against time, the host above and the GPU below, in three turns of the loop. In each turn the host lane has a schedule block and a launch block, and from the second turn on a dashed wait block and a process block for the batch before. The GPU lane has three forward blocks end to end with no gap. An arrow runs from each launch block to the start of its forward, and the arrow from the second launch is labelled queued, because the first forward is still running. Each wait block ends where the forward it waits for ends. The copy back to the host is not drawn, and nothing is to scale.
origin: authored
:::

## A prefix hit and a request for two samples

A prefix hit is found while the batch is built, and it is the `sglang.prefix-hit` stage of the path. In the scheduler's loop over the waiting requests, each candidate's prefix is matched against the tree cache by `init_next_round_input`, before the batch adder is asked to take the request. {{claim:sglang.prefix-hit-match}} The match is capped one token short of the input, so the last token is always computed, and the comment gives the reason as the logprob computation. {{claim:sglang.prefix-hit-last-token}} It is one rule in four spellings. nano-vllm never looks up a prompt's last block, {{claim:nano-vllm.last-block-uncached}} vLLM defaults the longest hit to the prompt length less one, {{claim:vllm.prefix-hit-last-token}} and Mini-SGLang matches all of the input ids but the last. {{claim:mini-sglang.prefix-hit-last-token}}

The second prediction's answer is three. When a request asks for `n` greater than one, the tokenizer manager does not send it once. It first sends the shared prompt as a request of its own with `max_new_tokens` set to zero, to put its prefix in the cache, waits for it, and then sends the `n` sample requests. {{claim:sglang.parallel-sampling.warmup}} For two samples that is one warmup and two samples, which is three requests [derived]. The other engines you have read do it differently. vLLM wraps the request in a parent and sends a child for each sample, so two requests. {{claim:vllm.frontend.fan-out}} Mini-SGLang accepts `n` and serves one sample. {{claim:mini-sglang.n-ignored}} nano-vllm's sampling parameters have no `n` at all. {{claim:nano-vllm.sampling-params}} Count the requests and you have a fact that no diagram of the shape shows.

## Two ranks

With more than one rank, each rank is a scheduler process. Rank zero's scheduler receives the requests from the tokenizer manager and broadcasts them to all the other ranks. {{claim:sglang.tp.request-broadcast}} The path gains two stages, `sglang.broadcast` to the second rank and `sglang.all-reduce` between the two GPUs, and nothing else changes.

## The same shape, told two ways

You have now read both production engines. They are alike enough to confuse, and the confusion is what the graded map tests, because its tray holds real stages of the other engine. This is the table to have in your head.

| The question | vLLM v0.33.0 | SGLang v0.5.23 |
|---|---|---|
| Where does the HTTP server run? | in the API server's process, which is not the engine core's | in the main process, beside the tokenizer manager |
| Where is the answer turned back into text? | in the API server, by the output processor | in a detokenizer process of its own |
| What holds a launched batch? | `batch_queue` | `result_queue` |
| Where is the wait? | `AsyncOutput.get_output`, on `copy_event` | the result processor, on `copy_done` |
| How many requests does two samples make? | two | three |
| How does a second rank get the request? | the executor enqueues the call on `rpc_broadcast_mq` | rank zero's scheduler broadcasts it |
| Process boundaries a sampled token crosses, at one rank | 2 [derived] | 3 [derived] |

The vLLM column is what the fifth lesson read. The API server has a process of its own, and the engine core is another. {{claim:vllm.request.engine-core-process}} The output processor in the API server turns the tokens into text. {{claim:vllm.frontend.output-processor-detokenizes}} Launched batches wait in `batch_queue`, {{claim:vllm.step.batch-queue}} the wait is `AsyncOutput.get_output` on the copy's event, {{claim:vllm.async-output.event-sync}} and a second rank gets the request through a queue named `rpc_broadcast_mq`. {{claim:vllm.executor.rpc-broadcast}}

The first answer is the last row. A token leaves SGLang's scheduler process for the detokenizer's, leaves the detokenizer's for the main process, and leaves the main process for the client, which is three process boundaries [derived]. In vLLM the detokenizer is inside the API server, and the same trip is two.

The last stages of the path are a mailbox in both. SGLang's tokenizer manager keeps a state for each request, and its `handle_loop` appends each reply of the detokenizer to the request's `out_list` and sets the request's event. {{claim:sglang.frontend.mailbox}} The coroutine that waits for the event also wakes on a timeout, and then asks whether the client has gone. {{claim:sglang.frontend.poll-disconnect}} Mini-SGLang gives each request an ack list and an event, and its listener task files each reply under its request. {{claim:mini-sglang.api-mailbox}} It looks for a disconnect only between chunks. {{claim:mini-sglang.disconnect-checked-per-chunk}}

:::card
kind: isomorphism
title: The same mailbox, spelled differently
body: Mini-SGLang gives each request an ack list and an Event, and SGLang's tokenizer manager gives each one a state with an out_list and an event. In both, one task reads every reply off a socket, files it under its request's id, and sets the event that wakes the one coroutine waiting for it. It is a map from a correlation id to a promise.
breaks: The waits differ. SGLang's coroutine also wakes on a timeout to ask whether its client has gone, and Mini-SGLang looks for a disconnect only between the chunks it sends.
:::

:::card
kind: warning
title: The default path is Python
body: Both engines have a Rust frontend in the repository, and both are off by default. A lifecycle map of the default launch has no Rust in it, except the radix tree's core in SGLang, which is on by default and falls back to Python. Say which path you traced.
:::

:::card
kind: notional-machine
id: lifecycle
:::

## What to carry

- The overlap loop launches batch N plus one and then processes batch N. The queue between them is `result_queue`, and the wait is part of the result processor.
- A decode batch's input ids are gathered from the FutureMap on the device, so the launch does not wait for the host's copy. That copy feeds the CPU's own work, one turn late.
- vLLM and SGLang look alike and differ in the same few places: where the detokenizer runs, how many requests an `n` makes, and what holds the launched batch.

## Exit check

This lesson tests one skill: tracing a request through SGLang at the pin, and saying where each stage runs (`tr1.sglang-lifecycle`). The exit ticket is three items on fresh seeds. Two ask in which process and on which thread or stream a stage of SGLang's path runs, and one asks which mechanism joins two of its stages. It is passed with at least two right (ASSESSMENT §4.2). The graded map at the end of the module tests the same skill on a whole path.

:::item
family: tr1.where-does-it-run
level: 2
count: 2
:::

:::item
family: tr1.which-mechanism
level: 2
count: 1
:::
