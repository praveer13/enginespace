---
id: tr1.l2
module: tr1
title: "nano-vllm in one sitting: the engine, the scheduler, the block manager and the model runner"
minutes: 45                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr1.small-engine-anatomy, tr1.phases-vs-one-budget]
builds_on: [ks:T5.L7, ks:T5.L5, ks:T5.L6]
status: review                    # draft | review | live
lanes: [B]
games: [engine-floor]
---

The quickest way to learn what an engine is made of is to read one small enough to hold in your head. nano-vllm is that engine. It serves one model from a Python library with no server, and it does the four jobs that every engine does: it keeps a queue of requests, decides what each step runs, manages the KV cache in blocks, and drives the GPU. The four jobs are four files. {{ks:T5.L7}} had you play the scheduler and {{ks:T5.L5}} had you write the block manager. Here you read both as someone else wrote them, and you meet the two other parts that those lessons left out.

Counted on 2026-11-05 at `bb823b3`, the four files are these.

| Part | File | What it owns | Lines [measured] |
|---|---|---|---|
| The engine | [`llm_engine.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py) | the tokenizer, `add_request`, `step` and `generate`: it is the loop | 90 |
| The scheduler | [`scheduler.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py) | the `waiting` and `running` deques, and what each step runs | 92 |
| The block manager | [`block_manager.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py) | the KV blocks, their reference counts, and the hash map that finds a shared prefix | 120 |
| The model runner | [`model_runner.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py) | the model, the KV tensor, the CUDA graphs, each step's inputs, sampling, and the other ranks | 257 |

Together they are 559 lines [derived], the sum of the column. The scheduler keeps its sequences in two deques, `waiting` and `running`. {{claim:nano-vllm.queues-are-deques}} The README calls the whole library about {{claim:nano-vllm.readme-lines}} of Python. Counting every Python file under `nanovllm/` with `wc -l` gives 1,385 lines [measured], the model and its layers included, so the four files are about two fifths of the library [derived]. Open the four files beside this page. Every excerpt below names its file, its lines and the pin in its first line, and the sentence before it links the same lines at that pin.

## The loop: schedule, run, postprocess

[`LLMEngine.step`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py#L49-L55) is the engine. Everything else in the library is something that this method calls.

```python
# nanovllm/engine/llm_engine.py, lines 49 to 55 at bb823b3
def step(self):
    seqs, is_prefill = self.scheduler.schedule()
    num_tokens = sum(seq.num_scheduled_tokens for seq in seqs) if is_prefill else -len(seqs)
    token_ids = self.model_runner.call("run", seqs, is_prefill)
    self.scheduler.postprocess(seqs, token_ids, is_prefill)
    outputs = [(seq.seq_id, seq.completion_token_ids) for seq in seqs if seq.is_finished]
    return outputs, num_tokens
```

Ask, run, tell. The scheduler says which sequences go in this step and whether the step is a prefill. The model runner runs them. The scheduler is told what came out. {{claim:nano-vllm.engine-step}} `generate` adds every prompt to the scheduler and then calls `step` until nothing is left. There is no thread behind it, no process in front of it and no queue between the caller and the loop: the caller's own thread does all of it, and the output is a list that appears when the last sequence has finished. It decodes token ids back into text once, at the very end, so nothing can stream. {{claim:nano-vllm.decode-at-the-end}} {{claim:nano-vllm.llm-is-the-engine}}

A request is a `Sequence` ([`sequence.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/sequence.py), 83 lines [measured]). It holds the token ids, a `block_table` that lists the KV blocks it owns, how many of its tokens are already in the KV cache (`num_cached_tokens`) and how many this step will add (`num_scheduled_tokens`). It is in one of three states, and you will want to remember the number: vLLM's requests have twelve. {{claim:nano-vllm.sequence-states}} {{claim:vllm.request.states}} The blocks it needs follow from its length and nothing else. {{claim:nano-vllm.sequence-blocks}} A block holds {{claim:nano-vllm.block-size}} by default, and the config insists that the size is a multiple of it.

Now a question about those blocks, because blocks are what make a prefix reusable, and the answer is not the one a token-level cache would give.

:::predict
id: tr1.l2.p1
prompt: An earlier request with a 700-token prompt [estimated] has finished. A new request has a 700-token prompt [estimated] that shares its first 600 tokens [estimated] with the earlier one and then differs. With nano-vllm's blocks of 256 tokens [measured], how many of the new prompt's tokens does the model have to compute?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr1.small-engine-anatomy]
:::

## The scheduler: prefill first, then decode, never both

The scheduler is 92 lines [measured]. The first half of [`Scheduler.schedule`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L29-L55) admits waiting prompts.

```python
# nanovllm/engine/scheduler.py, lines 29 to 55 at bb823b3
# prefill
while self.waiting and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.waiting[0]
    remaining = self.max_num_batched_tokens - num_batched_tokens
    ...
    if not seq.block_table:
        num_cached_blocks = self.block_manager.can_allocate(seq)
        if num_cached_blocks == -1:
            break
        num_tokens = seq.num_tokens - num_cached_blocks * self.block_size
    ...
    if remaining < num_tokens and scheduled_seqs:  # only allow chunked prefill for the first seq
        break
    ...
    seq.num_scheduled_tokens = min(num_tokens, remaining)
    ...
    scheduled_seqs.append(seq)

if scheduled_seqs:
    return scheduled_seqs, True
```

Read it as a list of rules. It takes sequences from the front of `waiting`, in order. It asks the block manager for the number of blocks it can reuse, or minus one when there is no room, and the tokens left to compute are the prompt less the reused blocks. It cuts a prompt into chunks only for the first sequence of a step, and a later sequence that does not fit waits for the next step. {{claim:nano-vllm.chunked-prefill-first-only}} A sequence joins `running` only when the chunk just scheduled completes its prompt, so a long prompt sits at the front of `waiting` for as many steps as it has chunks. {{claim:nano-vllm.prefill-complete-to-running}} And if anything at all was scheduled, the method returns at once with the flag set: a prefill step. [Decode](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L57-L73) is not even looked at.

```python
# nanovllm/engine/scheduler.py, lines 57 to 73 at bb823b3
# decode
while self.running and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.running.popleft()
    while not self.block_manager.can_append(seq):
        if self.running:
            self.preempt(self.running.pop())
        else:
            self.preempt(seq)
            break
    else:
        seq.num_scheduled_tokens = 1
        seq.is_prefill = False
        self.block_manager.may_append(seq)
        scheduled_seqs.append(seq)
assert scheduled_seqs
self.running.extendleft(reversed(scheduled_seqs))
return scheduled_seqs, False
```

The decode half runs only when no prompt was waiting that could be admitted. Each running sequence needs room for one more token. When the block manager cannot give it, the scheduler preempts, and the victim is the last sequence in `running`, or the sequence itself when it is the only one. Preemption is recompute: the victim's blocks are freed, and it goes back to the front of `waiting` as a prefill. {{claim:nano-vllm.preempt-recompute}} So a step is all prefill or all decode, and never both. {{claim:nano-vllm.step-shape}}

The last piece is [`postprocess`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L81-L92). It hashes the blocks the step filled, appends each sampled token, and frees the blocks of a sequence that hit the end-of-sequence token or its token limit. It also throws away the sampled token of any sequence whose prompt is not yet complete. The runner samples for every sequence of a prefill step, and only the chunk that finishes a prompt gives a first token. {{claim:nano-vllm.partial-chunk-no-token}}

## The block manager: blocks, hashes and a free list

The block manager is 120 lines [measured], and [one method of it](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L58-L73) answers the prediction.

```python
# nanovllm/engine/block_manager.py, lines 58 to 73 at bb823b3
def can_allocate(self, seq: Sequence) -> int:
    h = -1
    num_cached_blocks = 0
    num_new_blocks = seq.num_blocks
    for i in range(seq.num_blocks - 1):
        token_ids = seq.block(i)
        h = self.compute_hash(token_ids, h)
        block_id = self.hash_to_block_id.get(h, -1)
        if block_id == -1 or self.blocks[block_id].token_ids != token_ids:
            break
        num_cached_blocks += 1
        if block_id in self.used_block_ids:
            num_new_blocks -= 1
    if len(self.free_block_ids) < num_new_blocks:
        return -1
    return num_cached_blocks
```

[`can_allocate`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L58-L73) walks a sequence's blocks from the first, hashes each, and looks the hash up. Four details make it a prefix cache and not a bag of blocks.

- **The hash is a chain.** Each block's hash starts from the hash of the block before it, so a block's identity is the whole prefix up to and including it. Two prompts that agree in their third block and not in their first do not share it. {{claim:nano-vllm.hash-chain}}
- **A hash hit is checked.** The candidate's stored token ids are compared with the sequence's, and the walk stops at the first block that differs. {{claim:nano-vllm.hit-verified}}
- **Only whole blocks are in the map.** `hash_blocks` hashes a block once a step has filled it, and a partly filled block has no hash. {{claim:nano-vllm.full-blocks-hashed}}
- **The last block is never looked up.** The loop stops one block short, so a hit never covers the last block, whole or partial, and the model always computes at least that block. {{claim:nano-vllm.last-block-uncached}}

The fourth detail is one spelling of a rule you will meet again: when a whole prompt could be a hit, the last token must still be computed, because the model needs its logits to sample the first new token. vLLM says so in a comment above its lookup, and Mini-SGLang matches one token short of the prompt. {{claim:vllm.prefix-hit-last-token}} {{claim:mini-sglang.prefix-hit-last-token}}

A block is returned to the free list when its reference count reaches zero, and it keeps its hash. The map forgets a block only when the block is handed out again, so a finished request's prefix can still be hit until something needs its memory. {{claim:nano-vllm.freed-blocks-stay-cached}} Blocks are handed out from the left of a deque and returned to its right, so the block that has been free the longest is reused first. {{claim:nano-vllm.free-list-fifo}} A decoding sequence gets one more block when its length is one past a multiple of the block size. {{claim:nano-vllm.new-block-at-boundary}}

:::card
kind: isomorphism
title: A buffer pool with a content address
body: The block manager is a database's buffer pool. A fixed set of pages, a reference count on each, a free list, and a map from a page's identity to the frame that holds it, so that a page already in memory is found and pinned and not read again. A block's identity here is the hash of the tokens in it and of every block before it.
breaks: A buffer pool finds a page by its id, and one page is one question. Here the identity is a chain, so a lookup is a walk that stops at the first block that differs, and the hit is always a prefix. A pool also never needs the page that comes after the hit to be computed, and the engine does.
:::

## The model runner: inputs, graphs and the one wait

The runner is 257 lines [measured], most of them taken up with the model's setup, the KV tensor and the CUDA graphs. The part you read for the request path is [`ModelRunner.run`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L214-L220), seven lines long.

```python
# nanovllm/engine/model_runner.py, lines 214 to 220 at bb823b3
def run(self, seqs: list[Sequence], is_prefill: bool) -> list[int]:
    input_ids, positions = self.prepare_prefill(seqs) if is_prefill else self.prepare_decode(seqs)
    temperatures = self.prepare_sample(seqs) if self.rank == 0 else None
    logits = self.run_model(input_ids, positions, is_prefill)
    token_ids = self.sampler(logits, temperatures).tolist() if self.rank == 0 else None
    reset_context()
    return token_ids
```

You know its fifth line from the first lesson: a launch, a copy up and a wait, in one call. {{claim:nano-vllm.rank0-samples}} The first line builds the step's inputs on the host, as tensors in pinned memory, and copies them down to the GPU without blocking. {{claim:nano-vllm.h2d-pinned-copies}} The inputs do not all reach the model as arguments. The rest go through a module-level global that `set_context` fills and that the attention layers read back with [`get_context`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/layers/attention.py#L60-L61) inside the forward pass. {{claim:nano-vllm.context-global}} {{claim:nano-vllm.attention-reads-context}} That is a small design choice with a large effect on how you read the code: the arguments of `self.model(input_ids, positions)` are not all of its inputs. The method that runs the model is [`run_model`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L196-L212).

```python
# nanovllm/engine/model_runner.py, lines 196 to 212 at bb823b3
def run_model(self, input_ids: torch.Tensor, positions: torch.Tensor, is_prefill: bool):
    if is_prefill or self.enforce_eager or input_ids.size(0) > 512:
        return self.model.compute_logits(self.model(input_ids, positions))
    else:
        bs = input_ids.size(0)
        ...
        graph = self.graphs[next(x for x in self.graph_bs if x >= bs)]
        ...
        graph.replay()
        return self.model.compute_logits(graph_vars["outputs"][:bs])
```

`run_model` is where CUDA graphs enter. A prefill runs eagerly, because its shape changes with every prompt. A decode step of at most 512 sequences [measured] replays the smallest captured graph that fits the batch, and a bigger decode batch runs eagerly. {{claim:nano-vllm.graphs-decode-only}} The graphs exist for the sizes 1, 2, 4 and 8 and then every multiple of 16 [measured]. {{claim:nano-vllm.graph-sizes}} A batch of 5 sequences [estimated] therefore replays the graph for 8 [derived] and pads three rows. TR2 is about what that padding costs and which sizes to capture.

## Two ranks

With `tensor_parallel_size` above one, the engine starts a process for each rank above zero, and each runs a `ModelRunner` of its own. {{claim:nano-vllm.tp-worker-process}} Rank zero lives in the caller's process, and what it does with a call, in [`ModelRunner.call`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L85-L89), is the part to read.

```python
# nanovllm/engine/model_runner.py, lines 85 to 89 at bb823b3
def call(self, method_name, *args):
    if self.world_size > 1 and self.rank == 0:
        self.write_shm(method_name, *args)
    method = getattr(self, method_name, None)
    return method(*args)
```

Rank zero pickles the method name and its arguments into a shared-memory buffer, sets an `Event` for each worker, and then runs the same method itself. It does not wait for the workers. Each worker sits in `loop`, waits on its event, reads the buffer, and runs the same call. {{claim:nano-vllm.tp-shared-memory}} {{claim:nano-vllm.rank0-runs-too}} The buffer is created once at a fixed size. {{claim:nano-vllm.shm-buffer}} What goes through it is the sequences themselves, and a sequence pickles only what the workers need: all its token ids in a prefill, one token in a decode. {{claim:nano-vllm.sequence-pickle}}

The shared buffer carries calls, and the tensors travel another way. The ranks join an NCCL process group at an address that is a literal in the source, {{claim:nano-vllm.nccl-init}} the layers exchange partial results over it, and the LM head gathers the ranks' logits to rank zero, which alone samples. {{claim:nano-vllm.logits-gather}} So the path of a request at two ranks has a new kind of stage: a hop between processes by shared memory, and a collective between two GPUs.

## Before you play

Two questions are left to commit to before the second level. The first is the one about blocks above. The second is about the scheduler you just read. Two sequences are decoding, a new prompt arrives, and the scheduler is asked for its next step.

:::predict
id: tr1.l2.p2
prompt: Two sequences are in the middle of decoding in nano-vllm, and a new prompt of 300 tokens [estimated] has just joined the waiting deque. The token budget of a step is large enough to hold it. How many tokens does the next step run?
answer: { kind: numeric, unit: tokens, rel_tol: 0 }
reveal: after-game
kcs: [tr1.phases-vs-one-budget]
:::

Then play the second level, `nano-tp`: the same engine at two ranks. It is the first path in the module that crosses a process boundary, and it does so through shared memory and not a socket.

:::game
id: engine-floor
level: nano-tp
mode: practice
:::

## Back to the predictions

The first answer is 188 tokens [derived]. The 700-token prompts [estimated] fill two whole blocks of 256 tokens, which are tokens 0 to 511 [derived], and 188 tokens of a third. The 600 shared tokens [estimated] cover the two whole blocks and 88 tokens of the third [derived]. Only whole blocks are hashed, so the earlier request left two blocks in the map and never hashed its third. The new prompt's walk stops after two hits, because the loop never tries the last block anyway. The model computes 700 less 512 [derived], which is 188 tokens, and not the 100 [derived] that a cache with a granularity of one token would leave. The 88 tokens of the third block that really are shared are computed again [derived]. Bigger blocks make a prefix cheaper to look up and coarser to reuse, and vLLM's default block of {{claim:vllm.cache.block-size-default}} loses far less of a shared prefix than nano-vllm's {{claim:nano-vllm.block-size}}.

The second answer is 300 tokens [derived]. The waiting prompt is admitted first, and a prefill step is returned before the running sequences are looked at, so the step holds only the new prompt and the two decoders get no token from it. The next step is a decode of three sequences, which holds three tokens [derived]. That is the whole of what the phrase "prefill or decode in a step" means, and it has a cost you can name: while a long prompt is being prefilled, every running sequence waits, so their inter-token latency includes the full prefill. {{ks:T5.L8}} had a name for the cure.

## One budget, not two phases

vLLM's scheduler does not have the two phases. Its own code says so, in a comment above the loop: there is no "decoding phase" and no "prefill phase" in it, only the tokens each request has computed and the tokens it should have, and one token budget handed out so that every request catches up. {{claim:vllm.scheduler.no-phases}} Within a step it serves the running requests first and the waiting ones after them, out of the same budget. {{claim:vllm.scheduler.order}} Chunked prefill is on by default there, so a prompt that does not fit what is left of the budget is cut and carried on. {{claim:vllm.scheduler.chunked-prefill-default}}

Run the second prediction's queue through both.

| The same queue | nano-vllm | vLLM v0.33.0 |
|---|---|---|
| What a step is | all prefill or all decode | one pool of tokens for every request |
| Who is served first | the waiting prompts, then the running sequences only if no prompt was scheduled | the running requests, then the waiting ones |
| Two decoders and a 300-token prompt [estimated]: the first step | the prompt alone | the two decoders and the prompt |
| Tokens in that step | 300 [derived] | 302 [derived] |
| Tokens the decoders get from it | 0 [derived] | 2 [derived] |

The difference is not that one engine is better. nano-vllm is simpler to read, and its steps are uniform, so the only graphs it captures are for decode. vLLM's step is a mix of prefill chunks and decodes, so its default graph mode is a full graph for the batches that are uniform decodes and piecewise graphs for the rest, which TR2 teaches. {{claim:vllm.cudagraph.default-mode}} What matters for reading is that you carry the right model into each code base. A reader who learns the scheduler from nano-vllm and then opens vLLM looks for `is_prefill`, and does not find it.

:::card
kind: warning
title: nano-vllm is not a small vLLM
body: nano-vllm borrows vLLM's names, a Scheduler, a BlockManager and a ModelRunner, and not its structure. It is an offline library with steps that are all prefill or all decode, blocks of 256 tokens [measured], one model and a loop that waits for every step. Learn the parts from it, and do not carry its scheduler, its block size or its loop into vLLM.
:::

## What nano-vllm leaves out

Every gap in the list below is a stage you will add to the path in the next lessons.

- **A front end.** The library has no server, so there is no API process, no HTTP and no tokenizer worker. The caller tokenizes in `add_request` and the engine decodes at the end. {{claim:nano-vllm.llm-is-the-engine}}
- **Streaming and abort.** Nothing leaves the loop until every sequence has finished, and nothing can be taken back, because the loop never gives the caller control. The same search that finds no server finds no `abort` and no `cancel`.
- **Greedy decoding.** `SamplingParams` refuses a temperature near zero. {{claim:nano-vllm.sampling-params}}
- **A second model.** The runner builds one class. {{claim:nano-vllm.qwen3-only}}
- **Overlap.** `step` waits for the sampled ids before it plans the next step, so the host and the GPU take turns. Every engine after this one tries to stop taking turns.

:::card
kind: notional-machine
id: lifecycle
:::

## What to carry

- An engine is a queue, a scheduler, a block manager and a model runner, joined by a loop that asks, runs and tells. Name which of the four owns any decision you read about.
- A block is the unit of reuse, so the cache works at the granularity of its block size, and the last block of a prompt is always computed.
- nano-vllm runs prefill or decode in a step. vLLM has one token budget for every request. Say which you are reading before you read a scheduler.

## Exit check

This lesson tests two skills: naming what each part of a small engine owns (`tr1.small-engine-anatomy`), and saying how a scheduler that runs prefill or decode in a step differs from one token budget (`tr1.phases-vs-one-budget`). The exit ticket is three items on fresh seeds, and it tests the second skill: each gives a queue of running and waiting requests and a budget, names the engine, and asks what its next step holds. It is passed with at least two right (ASSESSMENT §4.2). The first skill is earned by the module's graded map, on its nano-vllm scenarios.

:::item
family: tr1.step-budget
level: 2
count: 3
:::
