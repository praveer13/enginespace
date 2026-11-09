---
id: tr1.l3
module: tr1
title: "Mini-SGLang: one request through four processes"
minutes: 40                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.sglang-lifecycle]
builds_on: [ks:T5.L10, ks:T2.L1, ks:T3.L6]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

nano-vllm had no front. A caller, a loop and a GPU shared one thread, and a request crossed nothing but the host-to-GPU boundary. Mini-SGLang is what the same engine looks like once it is a server. It has an API server that speaks HTTP, a tokenizer, a detokenizer, and a scheduler for each GPU, joined by ZeroMQ for control messages and by NCCL for the tensors the GPUs exchange. {{claim:mini-sglang.processes}} {{claim:mini-sglang.transport}} It is the smallest honest example of the shape that vLLM and SGLang share, and {{ks:T5.L10}} drew that shape from far away. Here you stand next to it.

The README calls the codebase about {{claim:mini-sglang.readme-lines}} of Python. The Python files under `python/minisgl` have 8,090 physical lines [measured] at `9a91cfa`, counted on 2026-11-05. The part you need for a request's path is much smaller: the scheduler package is 846 lines [measured] and the server package is 840 [measured]. Every link in this lesson is a permalink at that commit, and the lines were read from its tarball.

## Three processes or four

The documentation draws four kinds of process: an API server, a tokenizer worker, a detokenizer worker, and a scheduler worker for each GPU. Launch it with its defaults and you get three. The reason is one line of the server's arguments. `num_tokenizer` defaults to zero, and zero means that the tokenizer is shared with the detokenizer. {{claim:mini-sglang.shared-tokenizer-default}} The launcher starts one scheduler for each rank, a single process named `minisgl-detokenizer-0`, and as many tokenizer processes as `num_tokenizer` says. The API server is the process that launched the others. {{claim:mini-sglang.launch-processes}}

The "worker" that does both jobs is one function, [`tokenize_worker`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/tokenizer/server.py#L59-L70), in one loop. It receives whatever arrives, sorts it into detokenize messages, tokenize messages and abort messages, and handles each kind. {{claim:mini-sglang.worker-one-loop}} Both kinds of message reach it on the same socket when the tokenizer is shared, and that is why one function needs three cases.

Why does the lifecycle model draw four? Because the path has the same shape either way. The request goes out to the tokenizer, on to the scheduler, back to the detokenizer and back to the API server, and each of those is a hop over a socket whether the two ends of a hop are one process or two. The model draws the tokenizer and the detokenizer as two places so that a single path serves both launches, and it counts the same number of boundaries that a sampled token crosses on the way out. Keep that in mind when you lay the path: the shape is the lesson, and the process count is a flag.

The sockets are `ipc://` endpoints under `/tmp`, suffixed with the pid of the launching process, so the processes talk over Unix-domain sockets on one machine and not over a network. {{claim:mini-sglang.ipc-sockets}} The messages are msgpack frames on ZeroMQ's push and pull sockets, {{claim:mini-sglang.zmq-msgpack}} with publish and subscribe for the one fan-out, which is rank zero to the other ranks. {{claim:mini-sglang.zmq-pubsub}} [`ZmqAsyncPushQueue`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/utils/mp.py#L33-L47) is the same socket with an `await` on its send, for the API server's event loop. {{claim:mini-sglang.zmq-async}}

:::figure
src: figures/tr1/l3-mini-sglang.svg
alt: Mini-SGLang's client, API server, tokenizer and detokenizer, and scheduler, joined by sockets, with a GPU under the scheduler
description: "Four boxes in a row: the client, the API server, a box for the tokenizer and the detokenizer, and a scheduler. Between each pair, one arrow runs to the right on the way in and one runs to the left on the way out. The client and the API server are joined by HTTP in and a server-sent event stream out, and the other pairs by ZeroMQ. The tokenizer and the detokenizer share one dashed box, because by default they are one process. Under the scheduler, a GPU box has an arrow down for the copy of the step's inputs and an arrow up for the copy of the sampled tokens."
origin: authored
:::

## Before you play

Two questions about the shape, to commit to before you lay a path. The first is the game's own. The second asks what a second GPU adds.

:::predict
id: tr1.l3.p1
prompt: In Mini-SGLang at one rank, serving a streamed answer, how many process boundaries does a sampled token cross on its way to the client?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.sglang-lifecycle]
:::

:::predict
id: tr1.l3.p2
prompt: Mini-SGLang is launched on two GPUs instead of one. How many stages does one request's path gain, counting the request's trip through the second rank?
answer: { kind: numeric, unit: stages, rel_tol: 0 }
reveal: after-game
kcs: [tr1.sglang-lifecycle]
:::

Then play the `mini` level on its practice seed. It is a streamed request through four processes, and the scheduler overlaps, so the sync on a copy comes in the next turn of its loop. A path that sends the ticket through the wrong window stops where it goes wrong, and the debrief cites the file and the line.

:::game
id: engine-floor
level: mini
mode: practice
:::

## The path, hand-off by hand-off

Here is the whole path of one streamed request at one rank. The first column is the stage's id in the course's lifecycle model, so that you can find it in the game's mirror, and the last is the pinned line the stage was read from.

| Stage | What happens | Mechanism | Read it at |
|---|---|---|---|
| `mini.http-request` | the client POSTs to the chat route | IPC | [`v1_completions`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/server/api_server.py#L256) |
| `mini.tokenize-msg` | the handler pushes a `TokenizeMsg` | IPC | [`send_one`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/server/api_server.py#L132) |
| `mini.tokenize` | the prompt becomes token ids | compute | [`tokenize_worker`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/tokenizer/server.py#L88) |
| `mini.to-scheduler` | a `UserMsg` goes to rank zero's scheduler | IPC | [`tokenize_worker`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/tokenizer/server.py#L101) |
| `mini.waiting-queue` | the request waits in `pending_list` | queue | [`add_one_req`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/prefill.py#L124) |
| `mini.schedule` | the prefill manager builds a batch | compute | [`_schedule_next_batch`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L222) |
| `mini.h2d` | the batch's inputs go down to the GPU | copy | [`_make_positions`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L249) |
| `mini.forward` | the model runs, from a graph or eagerly | compute | [`forward_batch`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/engine.py#L197) |
| `mini.sample` | the sampler picks the next tokens | compute | [`forward_batch`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/engine.py#L202) |
| `mini.d2h` | the token ids start up to the host | copy | [`forward_batch`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/engine.py#L203) |
| `mini.sync` | the next turn waits on the copy's event | sync | [`_process_last_data`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L143) |
| `mini.process-result` | the scheduler builds a `DetokenizeMsg` | compute | [`_process_last_data`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L156) |
| `mini.to-detokenizer` | rank zero pushes it to the detokenizer | IPC | [`_reply_tokenizer_rank0`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/io.py#L128) |
| `mini.detokenize` | token ids become text | compute | [`tokenize_worker`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/tokenizer/server.py#L72) |
| `mini.to-frontend` | a `UserReply` goes to the API server | IPC | [`tokenize_worker`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/tokenizer/server.py#L85) |
| `mini.ack-mailbox` | the listener task wakes the handler | queue | [`listen`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/server/api_server.py#L123) |
| `mini.sse-chunk` | the handler streams a chunk to the client | IPC | [`stream_chat_completions`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/server/api_server.py#L175) |

Read the table's mechanisms down the page and the path has a rhythm. Six hand-offs between processes, which are HTTP in, four hops over ZeroMQ and the stream out. A queue where the request waits in the scheduler and a queue where the reply wakes its handler in the API server. A copy down, two launches, a copy up, and a sync that belongs to the next turn. Two of the hand-offs are quieter than the rest. The first is the API server's mailbox. Each request gets a uid, a list and an `asyncio.Event`, and a listener task reads every reply off the socket, appends it to its request's list and sets its event. The handler that is waiting on the event wakes and streams the chunk, and it waits with a bare `await` and no timeout. {{claim:mini-sglang.wait-no-deadline}} That is a queue between two tasks of one event loop, and it is where `mini.ack-mailbox` sits. {{claim:mini-sglang.api-mailbox}} The second is the scheduler's own waiting list, `pending_list`, a plain Python list. The loop below reads the messages that add to it and schedules from it in one thread, so it is a queue between two steps of one thread and not between two threads.

## The scheduler's loop

The loop is where the overlap lives, and [`overlap_loop`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L83-L106) is short enough to read whole.

```python
# python/minisgl/scheduler/scheduler.py, lines 83 to 106 at 9a91cfa
def overlap_loop(self, last_data: ForwardData | None) -> ForwardData | None:
    ...
    blocking = not (
        last_data is not None  # don't block if we have a batch to be processed
        or self.prefill_manager.runnable
        or self.decode_manager.runnable
    )
    for msg in self.receive_msg(blocking=blocking):
        self._process_one_msg(msg)

    forward_input = self._schedule_next_batch()
    ongoing_data = None
    if forward_input is not None:
        with self.engine_stream_ctx:  # run the batch in the engine's stream
            self.engine.stream.wait_stream(self.stream)
            ongoing_data = (forward_input, self._forward(forward_input))

    self._process_last_data(last_data)
    return ongoing_data
```

One turn does five things in this order. It reads messages from the socket, and blocks only if there is nothing else to do. It schedules a batch. It launches the batch on the engine's stream. It processes the previous turn's data, whose first act is the wait on that batch's copy event. And it hands this turn's data to the next one. {{claim:mini-sglang.overlap-loop-order}} The queue between the copy and the sync, which you met as a stage in vLLM and SGLang, is here a single argument: `last_data` is a one-slot buffer that carries a launched batch across one turn of the loop. {{claim:mini-sglang.copy-done-sync}}

Overlap has a price, and the authors wrote it into a comment. A request that finishes in one batch may already have been scheduled into the next, because the next was launched before the first was read. The scheduler keeps a set of the requests it finished last turn so that it does not free a request twice. {{claim:mini-sglang.finished-twice}} The switch that turns overlap off is an environment variable, and it is on by default. {{claim:mini-sglang.overlap-default}}

The scheduler's rule for what to run is the one you read in nano-vllm. It builds a prefill batch if a request is pending, and a decode batch only if none is. {{claim:mini-sglang.prefill-or-decode}} The prefill budget is a number of tokens for the whole batch, and a longer prompt is cut into chunks of that size. {{claim:mini-sglang.prefill-budget}} {{claim:mini-sglang.prefill-chunk}} A request that has only part of its prompt in a batch is a `ChunkedReq`, and result processing skips it, so the token sampled at the end of a partial chunk is thrown away. {{claim:mini-sglang.chunked-req-no-token}} Chunked prefill is on by default. {{claim:mini-sglang.chunked-prefill-default}}

The cache is a radix cache by default, and the match is made one token short of the prompt, so the last token is always computed. {{claim:mini-sglang.radix-default}} {{claim:mini-sglang.prefix-hit-last-token}} The engine replays a CUDA graph when the batch can use one and runs eagerly otherwise. {{claim:mini-sglang.graph-or-eager}} {{claim:mini-sglang.cuda-graph-default}} The inputs of a step are built in pinned host memory and copied down without blocking, as they are in nano-vllm. {{claim:mini-sglang.h2d-pinned}}

## Two ranks

With more than one GPU, each rank has its own scheduler process, and the schedulers must agree on what to run. Rank zero is the only one that talks to the tokenizer. It receives the messages, publishes each raw message to the other ranks on a ZeroMQ publish socket, and broadcasts how many messages there are over the CPU process group, so that every rank handles the same list in the same turn. {{claim:mini-sglang.rank0-broadcast}} Every rank then schedules, copies and launches, and the GPUs join their partial results with a collective inside the model. Only rank zero sends results on to the detokenizer. {{claim:mini-sglang.rank0-replies}}

So the second prediction has a short answer. The path gains the publish to the second rank, a hop over a socket, and the collective between the two GPUs. That is two stages [measured by the course's sim on 2026-11-05 at `905b782`]. The model follows the request through rank one's side of the pair, where the engine runs every rank in parallel, until the collective brings the result back to rank zero, which samples and replies.

## Back to the first prediction

A sampled token leaves the scheduler's process for the detokenizer's, leaves the detokenizer's for the API server's, and leaves the API server for the client. That is three process boundaries [derived], and the number is the same whether the tokenizer and the detokenizer are one process or two, because the hop from the scheduler to the shared process and the hop back from it are still two hops. Keep the number for the contrast with vLLM, where the engine core sends its tokens to the API server, which turns them into text, so the same trip crosses two boundaries. {{claim:vllm.request.engine-core-process}} {{claim:vllm.frontend.output-processor-detokenizes}}

:::card
kind: isomorphism
title: A request id and a promise
body: The API server's mailbox is the correlation id of a message-driven service. A request goes out with an id, the reply comes back on a different channel, and a map from the id to a waiting task joins the two. Here the map is ack_map and event_map, and the waiting task is an async handler that sleeps on an Event.
breaks: A service that works this way usually puts a deadline on the wait and a retry on the send. This handler waits on its Event with no deadline, and its check for a client that has gone runs only between chunks, so a request that produces nothing is never found to be abandoned.
:::

:::card
kind: warning
title: The diagram is not the launch
body: The documentation draws four processes and the default launch runs three. The diagram is still right about the path, and wrong about the process table you will see in ps. When you read an engine, read its launcher as well as its architecture page, and write down which flags change the number of processes.
:::

## What Mini-SGLang leaves out

It serves chat completions, tensor parallelism, chunked prefill, a radix cache, CUDA graphs and three families of dense models, and the list of what it does not do is as useful as the list of what it does. {{claim:mini-sglang.feature-list}} The request model accepts more fields than the handler reads: `n`, `stop` and the two penalties are parsed and never used, so a request for two samples is served as one. {{claim:mini-sglang.accepted-and-ignored}} {{claim:mini-sglang.n-ignored}} It notices that a client has gone only between chunks. {{claim:mini-sglang.disconnect-checked-per-chunk}} It runs on Linux only. {{claim:mini-sglang.linux-only}} It pins `torch<2.10.0`, which is not the version the course's engines pin, so it needs an environment of its own. {{claim:mini-sglang.torch-pin}}

:::card
kind: notional-machine
id: lifecycle
:::

## What to carry

- Mini-SGLang is a request's path with every hop visible: HTTP in, a socket to the tokenizer, a socket to the scheduler, a socket to the detokenizer, a socket to the API server, HTTP out. Each hop is a boundary the sampled token crosses on its way out.
- The overlap is one argument. The scheduler launches this turn's batch and then waits on last turn's copy, and `last_data` is the whole queue between them.
- Read the launcher before you trust a diagram. A flag can turn two boxes into one process without changing the path.

## Exit check

This lesson tests one skill: tracing a request through an engine that has a front end, and saying where each stage runs (`tr1.sglang-lifecycle`). The exit ticket is three items on fresh seeds. Each names a stage of Mini-SGLang's path, or of an engine that you have read so far, and asks in which process and on which thread or stream it runs. It is passed with at least two right (ASSESSMENT §4.2). The graded map at the end of the module tests the same skill on a whole path.

:::item
family: tr1.where-does-it-run
level: 2
count: 3
:::
