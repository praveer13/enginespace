---
id: tr1.l1
module: tr1
title: "Five mechanisms: queue, IPC, copy, sync, compute"
minutes: 35                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.five-mechanisms]
builds_on: [ks:T5.L10, ks:T2.L1, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

{{ks:T5.L10}} drew vLLM and SGLang as boxes joined by arrows, and named each box's design centre. Every arrow in a picture like that hides a decision, and this module is about those decisions. The skill it teaches first is small, and everything else hangs on it: given two adjacent steps of a request's life, say which of five mechanisms joins them. A queue, IPC, a copy, a sync, or compute. With that vocabulary an engine's request path stops being a diagram and becomes a list, and a list can be checked line by line against the source. The module's graded map does exactly that.

It is also how you find the time. {{ks:T0.L6}} gave the recurring cast of an LLM-serving profile: the Python scheduler tax, the detokenizer drip, the NCCL stall and the KV-copy surprise. Each of the four hides in one kind of arrow. The scheduler tax is the host's work between two launches. The drip is the hops that tokens make on their way out. The NCCL stall is a wait on a collective between GPUs, and the KV-copy surprise is a copy that took a detour. Name the arrow and you have named the suspect.

## A request is data in a place

Think of a request as a piece of data that is always somewhere. Where has three parts: a **process**, a **thread** inside it, and a **device**, which is the host or a GPU. {{ks:T2.L1}} gave you the first two. A process is an address space with resources of its own, and the threads of a process share that space. The third part is the new one. A GPU is a second processor with memory of its own, and a host thread drives it by launching work and going on before the work is done.

The course's lifecycle model (`packages/sim/lifecycle`, the machine under this module's game) writes a request's path as a list of stages. A stage says where the request is when it starts, where it is when it ends, and how it got from one to the other. That is all a stage says, and all it needs to. If the two places are the same, the stage is work done where the request stands. If they differ, they differ in one of a few ways, and each way has one kind of bridge.

| The mechanism | What it joins | You know it as | In code it looks like |
|---|---|---|---|
| Compute | Nothing: work done where the request stands, on the host as a call or on the GPU as a launch | A function call | `schedule()`, `model(...)` |
| A queue | Two threads of one process, or two steps of one thread | A channel, a blocking queue | `queue.Queue`, a `deque` |
| IPC | Two processes, over a socket or through shared memory | An RPC to another service, a ring buffer both sides map | `socket.send`, `SharedMemory` |
| A copy | The host and a GPU: down before the work, up after it | A call to a machine with memory of its own | `.cuda(non_blocking=True)`, `.tolist()` |
| A sync | A value that is still being produced, and the code that wants to read it | A `future.get()`, an `await` | `event.synchronize()`, `future.result()` |

The game's tiles use nine words for these five, because three of them split. IPC is a socket or shared memory, a copy is down or up, and compute is a call on the host, a launch on a GPU, or a collective between the GPUs of two ranks. Back of House (`engine-floor`) draws the five as a house. The request is a ticket. IPC is a ticket window between floors, a queue is a spike where a ticket waits for the next pair of hands, a copy is the dumbwaiter between the floors and the line, and a sync is the hands stopping at "Heard!" until the line calls back. The kitchen's words name the objects, and the engine's words lead everywhere you will meet them again.

## The five rules

The game turns the table into five rules, and a path is legal only if every stage keeps all of them.

1. A stage starts where the last one ended.
2. A change of process needs IPC or shared memory.
3. A change of thread inside a process needs a queue.
4. Host to GPU needs a copy or a launch, and GPU to host needs a copy.
5. Reading a value produced asynchronously needs a sync first.

The first four say where a request can go. The fifth says when it can be read, and it is the rule that costs the most to get wrong. They hold in every engine. What differs between engines is only which stages each has and where each puts them, and that is what the next six lessons read.

## Before you play

Here is [one line](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L218) of the smallest engine you will read. It samples a token on the GPU and gives it to the Python caller.

```python
# nanovllm/engine/model_runner.py, line 218 at bb823b3
token_ids = self.sampler(logits, temperatures).tolist() if self.rank == 0 else None
```

Two questions, and commit to both before you play. The first is the game's own question: how far does a token travel? The second asks you to count the model's stages in that one line.

:::predict
id: tr1.l1.p1
prompt: In nano-vllm's offline LLM.generate on one GPU, how many process boundaries does a sampled token cross on its way back to the caller?
answer: { kind: numeric, unit: boundaries, rel_tol: 0 }
reveal: after-game
kcs: [tr1.five-mechanisms]
:::

:::predict
id: tr1.l1.p2
prompt: The line of nano-vllm's model runner shown above samples a token and hands it to the Python caller. How many stages of the lifecycle model's path for one request does that single line hold?
answer: { kind: numeric, unit: stages, rel_tol: 0 }
reveal: after-game
kcs: [tr1.five-mechanisms]
:::

Then play the first level on its practice seed. It is nano-vllm called as a library, `nano`: one process, a path short enough to lay in one sitting, and the rules do the work. The request moves only past a stage that keeps them. Where it stops, the reason names the rule, and the debrief cites the file and the line that the stage was read from. `R` runs your path and `Backspace` takes the last stage back.

:::game
id: engine-floor
level: nano
mode: practice
:::

## The fifth rule: a copy is not a read

GPU work is asynchronous. A host thread launches a kernel and goes on, long before the kernel has finished. A copy up to the host is asynchronous in the same way when it is issued without blocking. In both cases the host holds a handle to a value that is not there yet. Reading it early would read whatever the buffer holds, so something must wait between the copy and the read. The model enforces this: after a copy up to the host, the only stages that may follow before a sync are a queue, which carries the handle and reads nothing, and the sync itself.

Now count the line. The sampler is a launch. `.tolist()` is a copy up to the host, and it is also a wait, because PyTorch performs the synchronization that a copy between the CPU and the GPU needs, so a blocking copy of a CUDA tensor to the host returns once the data is there. {{claim:nano-vllm.rank0-samples}} {{claim:lifecycle.torch.copy-synchronizes}} The line holds three stages, a launch, a copy and a sync, and the model draws all three from this one line of source. The copy and the wait are one call, so you cannot see the wait. It is implicit, and the model draws it anyway because the host really does stop there.

The process question has the shortest answer in the module. At one rank, nano-vllm's caller, scheduler and model runner share a process and a thread, so a token crosses no process boundary on its way back. The only boundary on the whole path is the one between the host and the GPU, crossed twice: down with the step's inputs, which are several small copies that the model draws as one, and up with the sampled ids. {{claim:nano-vllm.h2d-pinned-copies}}

## The same three words in three engines

Every engine you will read has a launch, a copy up and a wait. What differs is where it puts the wait. Mini-SGLang writes the three as separate pieces of code. [The engine](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/engine.py#L202-L206) samples, starts a non-blocking copy of the sampled ids to the host, records an event on its stream, and returns without reading anything.

```python
# python/minisgl/engine/engine.py, lines 202 to 206 at 9a91cfa
next_tokens_gpu = self.sampler.sample(logits[: batch.size], args).to(torch.int32)
next_tokens_cpu = next_tokens_gpu.to("cpu", non_blocking=True)
copy_done_event = torch.cuda.Event()
copy_done_event.record(self.stream)
return ForwardOutput(next_tokens_gpu, next_tokens_cpu, copy_done_event)
```

{{claim:mini-sglang.copy-event}} The wait is in another file, and it comes later. The scheduler's loop launches the current batch first and only then processes the previous one, and [processing it begins by waiting on that batch's event](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/scheduler.py#L142-L143). {{claim:mini-sglang.overlap-loop-order}} {{claim:mini-sglang.copy-done-sync}}

```python
# python/minisgl/scheduler/scheduler.py, lines 142 to 143 at 9a91cfa
batch, (_, next_tokens_cpu, copy_done) = last_data[0].batch, last_data[1]
copy_done.synchronize()
```

vLLM's model runner does it a third way. It copies the sampled ids on a stream of its own after that stream has waited for the main one, and the host waits on the copy's event when it needs the ids. {{claim:vllm.async-output.copy-stream}} {{claim:vllm.async-output.event-sync}}

So nano-vllm puts the wait right after the copy, and the host does nothing in between. The other two put one whole launch of the next batch between the copy and the wait, so the CPU's work on one batch overlaps the GPU's work on the next. That placement is the idea of overlap, and TR2 spends a module on it. For now it is enough to see it as a stage that you have to place. The graded map asks you to put the sync where the engine puts it, and the lifecycle model shows the difference in the path: vLLM and SGLang keep the launched batch in a queue before they wait on it, and the model draws that queue between the copy and the sync. {{claim:vllm.step.batch-queue}} {{claim:sglang.overlap.loop}}

:::card
kind: isomorphism
title: The menu you already choose from
body: Between two services you already pick a mechanism for every hop. A function call inside a process, a channel between threads, an RPC between processes, and a callback or a future when the answer comes later. An engine's request path is that menu with a GPU added to the end of it.
breaks: An RPC blocks until the reply arrives, or you write the callback yourself. A GPU launch returns at once and the work is not done, and no callback follows. Someone has to remember to wait, and where the wait goes decides how much time the CPU and the GPU each waste.
:::

:::card
kind: warning
title: A wait you did not write is still a wait
body: A call like .tolist() reads like any other line, and it stops the host until the GPU's copy has landed. A wait hidden in a convenient call is the easiest kind to miss when you read an engine and the easiest to put in the wrong place when you write one. When you map a path, write the sync as a stage of its own, even where the code never names it.
:::

:::figure
src: figures/tr1/l1-boundaries.svg
alt: A request crossing a queue between two threads, IPC to another process, a copy down to a GPU, and a copy back up past a sync gate
description: "Three host threads in a row. Thread A hands the request to thread B through a queue, and thread B hands it to thread C in another process over IPC. A dashed line marks the process boundary between B and C. Thread C copies the request down to a GPU box, where a launch runs the work, and a second arrow copies the result back up. A bar across the upward arrow, marked sync, is the gate: nothing on the host reads the result before it."
origin: authored
:::

## What to carry

- Every arrow in an engine diagram is one of five mechanisms, and what the arrow crosses says which: nothing, a thread, a process, the host and a GPU, or a value that is not there yet.
- A copy up to the host is not a read. Between the two, only a handle may travel, and the sync is a stage of its own.
- Ask of every wait where it sits, what the host does before it, and what the GPU does while it lasts.

## Exit check

This lesson tests one skill: saying which mechanism carries a request across a boundary, and where each stage of its path runs (`tr1.five-mechanisms`). The exit ticket is three items on fresh seeds. Each shows one stage of a real engine's path, with the place it starts and the place it ends, and asks which mechanism joins them. It is passed with at least two right (ASSESSMENT §4.2). The graded map at the end of the module tests the same skill on a whole path.

:::item
family: tr1.which-mechanism
level: 2
count: 3
:::
