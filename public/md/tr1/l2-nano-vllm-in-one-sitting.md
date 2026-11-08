# nano-vllm in one sitting: the engine, the scheduler, the block manager and the model runner

_Read the engines · lesson `tr1.l2` · review · about 45 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T5.L5`, `ks:T5.L6`.

Knowledge components: `tr1.small-engine-anatomy`, `tr1.phases-vs-one-budget`.

The quickest way to learn what an engine is made of is to read one small enough to hold in your head. nano-vllm is that engine. It serves one model from a Python library with no server, and it does the four jobs that every engine does: it keeps a queue of requests, decides what each step runs, manages the KV cache in blocks, and drives the GPU. The four jobs are four files. kernelspace T5.L7 had you play the scheduler and kernelspace T5.L5 had you write the block manager. Here you read both as someone else wrote them, and you meet the two other parts that those lessons left out.

Counted on 2026-11-05 at `bb823b3`, the four files are these.

| Part | File | What it owns | Lines [measured] |
|---|---|---|---|
| The engine | [`llm_engine.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py) | the tokenizer, `add_request`, `step` and `generate`: it is the loop | 90 |
| The scheduler | [`scheduler.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py) | the `waiting` and `running` deques, and what each step runs | 92 |
| The block manager | [`block_manager.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py) | the KV blocks, their reference counts, and the hash map that finds a shared prefix | 120 |
| The model runner | [`model_runner.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py) | the model, the KV tensor, the CUDA graphs, each step's inputs, sampling, and the other ranks | 257 |

Together they are 559 lines [derived], the sum of the column. The scheduler keeps its sequences in two deques, `waiting` and `running`. **two deques** [measured] The README calls the whole library about **1200 lines** [unverified] of Python. Counting every Python file under `nanovllm/` with `wc -l` gives 1,385 lines [measured], the model and its layers included, so the four files are about two fifths of the library [derived]. Open the four files beside this page. Every excerpt below names its file, its lines and the pin in its first line, and the sentence before it links the same lines at that pin.

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

Ask, run, tell. The scheduler says which sequences go in this step and whether the step is a prefill. The model runner runs them. The scheduler is told what came out. **schedule, run, postprocess** [measured] `generate` adds every prompt to the scheduler and then calls `step` until nothing is left. There is no thread behind it, no process in front of it and no queue between the caller and the loop: the caller's own thread does all of it, and the output is a list that appears when the last sequence has finished. It decodes token ids back into text once, at the very end, so nothing can stream. **once, after the loop** [measured] **the library's front end is the engine class** [measured]

A request is a `Sequence` ([`sequence.py`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/sequence.py), 83 lines [measured]). It holds the token ids, a `block_table` that lists the KV blocks it owns, how many of its tokens are already in the KV cache (`num_cached_tokens`) and how many this step will add (`num_scheduled_tokens`). It is in one of three states, and you will want to remember the number: vLLM's requests have twelve. **WAITING, RUNNING, FINISHED** [measured] **12 states** [measured] The blocks it needs follow from its length and nothing else. **ceil(num_tokens / block_size)** [measured] A block holds **256 tokens** [measured] by default, and the config insists that the size is a multiple of it.

Now a question about those blocks, because blocks are what make a prefix reusable, and the answer is not the one a token-level cache would give.

> **Predict `tr1.l2.p1`.** An earlier request with a 700-token prompt [estimated] has finished. A new request has a 700-token prompt [estimated] that shares its first 600 tokens [estimated] with the earlier one and then differs. With nano-vllm's blocks of 256 tokens [measured], how many of the new prompt's tokens does the model have to compute?
>
> The learner commits to a number in `tokens`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

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

Read it as a list of rules. It takes sequences from the front of `waiting`, in order. It asks the block manager for the number of blocks it can reuse, or minus one when there is no room, and the tokens left to compute are the prompt less the reused blocks. It cuts a prompt into chunks only for the first sequence of a step, and a later sequence that does not fit waits for the next step. **the first sequence only** [measured] A sequence joins `running` only when the chunk just scheduled completes its prompt, so a long prompt sits at the front of `waiting` for as many steps as it has chunks. **running only once the whole prompt is scheduled** [measured] And if anything at all was scheduled, the method returns at once with the flag set: a prefill step. [Decode](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L57-L73) is not even looked at.

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

The decode half runs only when no prompt was waiting that could be admitted. Each running sequence needs room for one more token. When the block manager cannot give it, the scheduler preempts, and the victim is the last sequence in `running`, or the sequence itself when it is the only one. Preemption is recompute: the victim's blocks are freed, and it goes back to the front of `waiting` as a prefill. **recompute** [measured] So a step is all prefill or all decode, and never both. **prefill or decode, never mixed** [measured]

The last piece is [`postprocess`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L81-L92). It hashes the blocks the step filled, appends each sampled token, and frees the blocks of a sequence that hit the end-of-sequence token or its token limit. It also throws away the sampled token of any sequence whose prompt is not yet complete. The runner samples for every sequence of a prefill step, and only the chunk that finishes a prompt gives a first token. **a partial chunk keeps no sampled token** [measured]

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

- **The hash is a chain.** Each block's hash starts from the hash of the block before it, so a block's identity is the whole prefix up to and including it. Two prompts that agree in their third block and not in their first do not share it. **each block's hash starts from the one before it** [measured]
- **A hash hit is checked.** The candidate's stored token ids are compared with the sequence's, and the walk stops at the first block that differs. **the stored token ids are compared** [measured]
- **Only whole blocks are in the map.** `hash_blocks` hashes a block once a step has filled it, and a partly filled block has no hash. **only whole blocks are hashed** [measured]
- **The last block is never looked up.** The loop stops one block short, so a hit never covers the last block, whole or partial, and the model always computes at least that block. **the last block is never looked up** [measured]

The fourth detail is one spelling of a rule you will meet again: when a whole prompt could be a hit, the last token must still be computed, because the model needs its logits to sample the first new token. vLLM says so in a comment above its lookup, and Mini-SGLang matches one token short of the prompt. **prompt length less one** [measured] **input_ids[: input_len - 1]** [measured]

A block is returned to the free list when its reference count reaches zero, and it keeps its hash. The map forgets a block only when the block is handed out again, so a finished request's prefix can still be hit until something needs its memory. **a freed block keeps its hash until it is handed out again** [measured] Blocks are handed out from the left of a deque and returned to its right, so the block that has been free the longest is reused first. **the block free the longest is reused first** [measured] A decoding sequence gets one more block when its length is one past a multiple of the block size. **a block when the length is one past a multiple** [measured]

> **A buffer pool with a content address.** The block manager is a database's buffer pool. A fixed set of pages, a reference count on each, a free list, and a map from a page's identity to the frame that holds it, so that a page already in memory is found and pinned and not read again. A block's identity here is the hash of the tokens in it and of every block before it.
>
> Where it breaks: A buffer pool finds a page by its id, and one page is one question. Here the identity is a chain, so a lookup is a walk that stops at the first block that differs, and the hit is always a prefix. A pool also never needs the page that comes after the hit to be computed, and the engine does.

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

You know its fifth line from the first lesson: a launch, a copy up and a wait, in one call. **rank 0 samples and copies the ids with .tolist()** [measured] The first line builds the step's inputs on the host, as tensors in pinned memory, and copies them down to the GPU without blocking. **pinned host tensors, copied with non_blocking=True** [measured] The inputs do not all reach the model as arguments. The rest go through a module-level global that `set_context` fills and that the attention layers read back with [`get_context`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/layers/attention.py#L60-L61) inside the forward pass. **a module-level global** [measured] **get_context() inside the forward pass** [measured] That is a small design choice with a large effect on how you read the code: the arguments of `self.model(input_ids, positions)` are not all of its inputs. The method that runs the model is [`run_model`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L196-L212).

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

`run_model` is where CUDA graphs enter. A prefill runs eagerly, because its shape changes with every prompt. A decode step of at most 512 sequences [measured] replays the smallest captured graph that fits the batch, and a bigger decode batch runs eagerly. **eager for a prefill, replay for a decode of at most 512** [measured] The graphs exist for the sizes 1, 2, 4 and 8 and then every multiple of 16 [measured]. **1, 2, 4, 8, then every 16** [measured] A batch of 5 sequences [estimated] therefore replays the graph for 8 [derived] and pads three rows. TR2 is about what that padding costs and which sizes to capture.

## Two ranks

With `tensor_parallel_size` above one, the engine starts a process for each rank above zero, and each runs a `ModelRunner` of its own. **one process for each rank above 0** [measured] Rank zero lives in the caller's process, and what it does with a call, in [`ModelRunner.call`](https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L85-L89), is the part to read.

```python
# nanovllm/engine/model_runner.py, lines 85 to 89 at bb823b3
def call(self, method_name, *args):
    if self.world_size > 1 and self.rank == 0:
        self.write_shm(method_name, *args)
    method = getattr(self, method_name, None)
    return method(*args)
```

Rank zero pickles the method name and its arguments into a shared-memory buffer, sets an `Event` for each worker, and then runs the same method itself. It does not wait for the workers. Each worker sits in `loop`, waits on its event, reads the buffer, and runs the same call. **a shared-memory buffer and an Event** [measured] **rank 0 writes the call, then runs it** [measured] The buffer is created once at a fixed size. **2**20 bytes** [measured] What goes through it is the sequences themselves, and a sequence pickles only what the workers need: all its token ids in a prefill, one token in a decode. **ids for a prefill, the last token for a decode** [measured]

The shared buffer carries calls, and the tensors travel another way. The ranks join an NCCL process group at an address that is a literal in the source, **a literal address** [measured] the layers exchange partial results over it, and the LM head gathers the ranks' logits to rank zero, which alone samples. **dist.gather to rank 0** [measured] So the path of a request at two ranks has a new kind of stage: a hop between processes by shared memory, and a collective between two GPUs.

## Before you play

Two questions are left to commit to before the second level. The first is the one about blocks above. The second is about the scheduler you just read. Two sequences are decoding, a new prompt arrives, and the scheduler is asked for its next step.

> **Predict `tr1.l2.p2`.** Two sequences are in the middle of decoding in nano-vllm, and a new prompt of 300 tokens [estimated] has just joined the waiting deque. The token budget of a step is large enough to hold it. How many tokens does the next step run?
>
> The learner commits to a number in `tokens`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

Then play the second level, `nano-tp`: the same engine at two ranks. It is the first path in the module that crosses a process boundary, and it does so through shared memory and not a socket.

> **Play.** The game `engine-floor`, level `nano-tp`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Back to the predictions

The first answer is 188 tokens [derived]. The 700-token prompts [estimated] fill two whole blocks of 256 tokens, which are tokens 0 to 511 [derived], and 188 tokens of a third. The 600 shared tokens [estimated] cover the two whole blocks and 88 tokens of the third [derived]. Only whole blocks are hashed, so the earlier request left two blocks in the map and never hashed its third. The new prompt's walk stops after two hits, because the loop never tries the last block anyway. The model computes 700 less 512 [derived], which is 188 tokens, and not the 100 [derived] that a cache with a granularity of one token would leave. The 88 tokens of the third block that really are shared are computed again [derived]. Bigger blocks make a prefix cheaper to look up and coarser to reuse, and vLLM's default block of **16 tokens** [measured] loses far less of a shared prefix than nano-vllm's **256 tokens** [measured].

The second answer is 300 tokens [derived]. The waiting prompt is admitted first, and a prefill step is returned before the running sequences are looked at, so the step holds only the new prompt and the two decoders get no token from it. The next step is a decode of three sequences, which holds three tokens [derived]. That is the whole of what the phrase "prefill or decode in a step" means, and it has a cost you can name: while a long prompt is being prefilled, every running sequence waits, so their inter-token latency includes the full prefill. kernelspace T5.L8 had a name for the cure.

## One budget, not two phases

vLLM's scheduler does not have the two phases. Its own code says so, in a comment above the loop: there is no "decoding phase" and no "prefill phase" in it, only the tokens each request has computed and the tokens it should have, and one token budget handed out so that every request catches up. **one token budget** [measured] Within a step it serves the running requests first and the waiting ones after them, out of the same budget. **running first, then waiting** [measured] Chunked prefill is on by default there, so a prompt that does not fit what is left of the budget is cut and carried on. **true** [measured]

Run the second prediction's queue through both.

| The same queue | nano-vllm | vLLM v0.33.0 |
|---|---|---|
| What a step is | all prefill or all decode | one pool of tokens for every request |
| Who is served first | the waiting prompts, then the running sequences only if no prompt was scheduled | the running requests, then the waiting ones |
| Two decoders and a 300-token prompt [estimated]: the first step | the prompt alone | the two decoders and the prompt |
| Tokens in that step | 300 [derived] | 302 [derived] |
| Tokens the decoders get from it | 0 [derived] | 2 [derived] |

The difference is not that one engine is better. nano-vllm is simpler to read, and its steps are uniform, so the only graphs it captures are for decode. vLLM's step is a mix of prefill chunks and decodes, so its default graph mode is a full graph for the batches that are uniform decodes and piecewise graphs for the rest, which TR2 teaches. **FULL_AND_PIECEWISE** [measured] What matters for reading is that you carry the right model into each code base. A reader who learns the scheduler from nano-vllm and then opens vLLM looks for `is_prefill`, and does not find it.

> **nano-vllm is not a small vLLM.** nano-vllm borrows vLLM's names, a Scheduler, a BlockManager and a ModelRunner, and not its structure. It is an offline library with steps that are all prefill or all decode, blocks of 256 tokens [measured], one model and a loop that waits for every step. Learn the parts from it, and do not carry its scheduler, its block size or its loop into vLLM.

## What nano-vllm leaves out

Every gap in the list below is a stage you will add to the path in the next lessons.

- **A front end.** The library has no server, so there is no API process, no HTTP and no tokenizer worker. The caller tokenizes in `add_request` and the engine decodes at the end. **the library's front end is the engine class** [measured]
- **Streaming and abort.** Nothing leaves the loop until every sequence has finished, and nothing can be taken back, because the loop never gives the caller control. The same search that finds no server finds no `abort` and no `cancel`.
- **Greedy decoding.** `SamplingParams` refuses a temperature near zero. **temperature, max_tokens, ignore_eos** [measured]
- **A second model.** The runner builds one class. **Qwen3ForCausalLM** [measured]
- **Overlap.** `step` waits for the sampled ids before it plans the next step, so the host and the GPU take turns. Every engine after this one tries to stop taking turns.

> **Card.** The notional-machine card `lifecycle`.

## What to carry

- An engine is a queue, a scheduler, a block manager and a model runner, joined by a loop that asks, runs and tells. Name which of the four owns any decision you read about.
- A block is the unit of reuse, so the cache works at the granularity of its block size, and the last block of a prompt is always computed.
- nano-vllm runs prefill or decode in a step. vLLM has one token budget for every request. Say which you are reading before you read a scheduler.

## Exit check

This lesson tests two skills: naming what each part of a small engine owns (`tr1.small-engine-anatomy`), and saying how a scheduler that runs prefill or decode in a step differs from one token budget (`tr1.phases-vs-one-budget`). The exit ticket is three items on fresh seeds, and it tests the second skill: each gives a queue of running and waiting requests and a budget, names the engine, and asks what its next step holds. It is passed with at least two right (ASSESSMENT §4.2). The first skill is earned by the module's graded map, on its nano-vllm scenarios.

> **Practice.** Items from the generator family `tr1.step-budget`, level `2`, `3` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `mini-sglang.prefix-hit-last-token`: Mini-SGLang matches a request's prefix against the radix cache one token short of its prompt, over all of input_ids but its last token, so the last token is always computed. Value input_ids[: input_len - 1] [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/scheduler/cache.py, CacheManager.match_req <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/scheduler/cache.py#L27-L30>, read 2026-11-05).
- `nano-vllm.attention-reads-context`: nano-vllm's attention layer reads the step's metadata with get_context() when it runs, and uses its slot mapping to store the new keys and values and its block tables and sequence lengths to attend over the cache. Value get_context() inside the forward pass [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/layers/attention.py, Attention.forward <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/layers/attention.py#L59-L75>, read 2026-11-05).
- `nano-vllm.block-size`: nano-vllm's KV block holds 256 tokens by default, and the config asserts that the size is a multiple of 256. vLLM's default block holds 16. Value 256 tokens [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/config.py, Config <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/config.py#L17-L22>, read 2026-11-04).
- `nano-vllm.chunked-prefill-first-only`: nano-vllm cuts a prompt into chunks only for the first sequence of a prefill step. A later sequence that does not fit the token budget waits for the next step. Value the first sequence only [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.schedule <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L42-L43>, read 2026-11-04).
- `nano-vllm.context-global`: nano-vllm keeps each step's attention metadata, the slot mapping, the sequence lengths and the block tables, in a module-level global that set_context replaces and get_context returns. Value a module-level global [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/utils/context.py, set_context <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/utils/context.py#L16-L27>, read 2026-11-05).
- `nano-vllm.decode-at-the-end`: nano-vllm's generate adds every prompt to the scheduler and then calls step until the scheduler is finished. After the loop it turns token ids back into text once, for every sequence, so nothing is detokenized while the loop runs. Value once, after the loop [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/llm_engine.py, LLMEngine.generate <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py#L59-L90>, read 2026-11-05).
- `nano-vllm.engine-step`: nano-vllm's whole engine loop is LLMEngine.step. It asks the scheduler for the sequences of the step and whether they are a prefill, runs them through the model runner, and hands the sampled ids back to the scheduler's postprocess. Value schedule, run, postprocess [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/llm_engine.py, LLMEngine.step <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py#L49-L55>, read 2026-11-05).
- `nano-vllm.free-list-fifo`: nano-vllm hands out blocks from the left of a deque and returns freed blocks to its right, so the block that has been free the longest is the next one reused. Value the block free the longest is reused first [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager._allocate_block and _deallocate_block <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L43-L56>, read 2026-11-05).
- `nano-vllm.freed-blocks-stay-cached`: A freed nano-vllm block keeps its hash and its entry in hash_to_block_id. The entry is deleted only when _allocate_block hands the block out again, so a finished request's prefix can still be hit. Value a freed block keeps its hash until it is handed out again [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager._allocate_block <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L43-L56>, read 2026-11-05).
- `nano-vllm.full-blocks-hashed`: nano-vllm hashes a block only once the step has filled it. hash_blocks counts the whole blocks that the step completes, and a partly filled block gets no hash. Value only whole blocks are hashed [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager.hash_blocks <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L110-L120>, read 2026-11-05).
- `nano-vllm.graph-sizes`: nano-vllm captures one decode graph for each batch size in a short list, 1, 2, 4 and 8 and then every multiple of 16 up to the batch limit. Value 1, 2, 4, 8, then every 16 [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.capture_cudagraph <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L234>, read 2026-11-05).
- `nano-vllm.graphs-decode-only`: nano-vllm runs a prefill eagerly, and replays a captured CUDA graph only for a decode step of at most 512 sequences, the smallest captured graph that fits the batch. A larger decode batch, or enforce_eager, runs eagerly too. Value eager for a prefill, replay for a decode of at most 512 [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.run_model <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L195-L212>, read 2026-11-05).
- `nano-vllm.h2d-pinned-copies`: nano-vllm builds each prefill step's inputs on the host as tensors in pinned memory and copies each one to the GPU with .cuda(non_blocking=True). The inputs are the token ids, the positions, the cumulative sequence lengths and the slot mapping. Value pinned host tensors, copied with non_blocking=True [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.prepare_prefill <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L164-L168>, read 2026-11-05).
- `nano-vllm.hash-chain`: A nano-vllm block's hash is computed over its token ids after the previous block's hash, so a block's identity is the whole prefix up to and including it, not its own tokens alone. Value each block's hash starts from the one before it [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager.compute_hash <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L35-L41>, read 2026-11-05).
- `nano-vllm.hit-verified`: A nano-vllm prefix hit is not taken on the hash alone. can_allocate also compares the candidate block's stored token ids with the sequence's, and stops at the first block that differs. Value the stored token ids are compared [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager.can_allocate <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L62-L70>, read 2026-11-05).
- `nano-vllm.last-block-uncached`: can_allocate tries every block of a sequence except its last, so a nano-vllm prefix hit never covers the last block, whole or partial, and the model always computes at least that block. Value the last block is never looked up [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager.can_allocate <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L58-L73>, read 2026-11-05).
- `nano-vllm.llm-is-the-engine`: nano-vllm's public LLM class is the engine and nothing more, an empty subclass of LLMEngine. Searching nanovllm/ for zmq, asyncio, threading, stream, abort and cancel finds no match, so the library has no server, no event loop, no streaming and no way to take a request back. Value the library's front end is the engine class [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/llm.py <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/llm.py#L4-L5>, read 2026-11-05).
- `nano-vllm.logits-gather`: At tensor-parallel size above 1, nano-vllm's LM head gathers the ranks' logits to rank 0 with dist.gather, and only rank 0 concatenates them. Value dist.gather to rank 0 [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/layers/embed_head.py, ParallelLMHead.forward <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/layers/embed_head.py#L61-L66>, read 2026-11-04).
- `nano-vllm.nccl-init`: nano-vllm joins its ranks in an NCCL process group at an address that is a literal in the model runner, tcp://localhost:2333, and not a field of its Config. Value a literal address [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.__init__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L26>, read 2026-11-05).
- `nano-vllm.new-block-at-boundary`: A decoding nano-vllm sequence gets a new block when its length is one more than a multiple of the block size, which is when the token that the step is about to process is the first of a new block. Value a block when the length is one past a multiple [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/block_manager.py, BlockManager.can_append and may_append <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/block_manager.py#L103-L108>, read 2026-11-05).
- `nano-vllm.partial-chunk-no-token`: The model runner samples for every sequence of a prefill step, but nano-vllm's postprocess throws the sampled token away for a sequence whose prompt is not yet complete. Only the chunk that finishes the prompt yields a first token. Value a partial chunk keeps no sampled token [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.postprocess <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L81-L92>, read 2026-11-05).
- `nano-vllm.preempt-recompute`: nano-vllm preempts by recomputation, as vLLM does. A preempted sequence goes back to the front of the waiting queue as a prefill with its blocks freed. The victim during decode is the last running sequence, and the sequence itself when it is the only one. Value recompute [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.preempt <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L58-L79>, read 2026-11-04).
- `nano-vllm.prefill-complete-to-running`: A nano-vllm sequence joins the running deque only when the chunk just scheduled completes its prompt. Until then it stays at the front of waiting, and each step schedules another chunk of it. Value running only once the whole prompt is scheduled [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.schedule <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L46-L52>, read 2026-11-05).
- `nano-vllm.queues-are-deques`: nano-vllm's scheduler keeps its sequences in two deques, waiting and running. Value two deques [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.__init__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L16-L17>, read 2026-11-05).
- `nano-vllm.qwen3-only`: nano-vllm's model runner builds one model class, Qwen3ForCausalLM, and does not choose among architectures. Value Qwen3ForCausalLM [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.__init__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L31>, read 2026-11-05).
- `nano-vllm.rank0-runs-too`: In nano-vllm, rank 0 writes a call to the shared buffer first and then runs the same method itself. It does not wait for the other ranks to finish. Value rank 0 writes the call, then runs it [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.call <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L85-L89>, read 2026-11-05).
- `nano-vllm.rank0-samples`: Only rank 0 samples in nano-vllm, and it turns the sampled ids into a Python list with .tolist() in the same line, which is a copy of a CUDA tensor to the host. Value rank 0 samples and copies the ids with .tolist() [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.run <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L214-L220>, read 2026-11-04).
- `nano-vllm.readme-lines`: nano-vllm's README says its implementation is about 1,200 lines of Python. The count is the README's own and has not been checked here. Value 1200 lines [unverified], checked 2026-11-04 (source: nano-vllm at bb823b3, README.md <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/README.md#L16>, read 2026-11-04).
- `nano-vllm.sampling-params`: nano-vllm's SamplingParams has three fields, temperature, max_tokens and ignore_eos, and it refuses any temperature at or below 1e-10, so the library has no greedy sampling. Value temperature, max_tokens, ignore_eos [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/sampling_params.py, SamplingParams <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/sampling_params.py#L5-L11>, read 2026-11-05).
- `nano-vllm.sequence-blocks`: A nano-vllm sequence needs as many blocks as its tokens fill, rounded up. num_blocks is the token count plus the block size less one, integer-divided by the block size. Value ceil(num_tokens / block_size) [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/sequence.py, Sequence.num_blocks <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/sequence.py#L55-L57>, read 2026-11-05).
- `nano-vllm.sequence-pickle`: When a nano-vllm sequence is pickled for another rank, it carries its counters and its block table, and then all its token ids if it is still a prefill but only its last token if it is not. Value ids for a prefill, the last token for a decode [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/sequence.py, Sequence.__getstate__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/sequence.py#L72-L74>, read 2026-11-05).
- `nano-vllm.sequence-states`: A nano-vllm sequence is in one of three states, WAITING, RUNNING or FINISHED. Value WAITING, RUNNING, FINISHED [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/sequence.py, SequenceStatus <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/sequence.py#L8-L11>, read 2026-11-05).
- `nano-vllm.shm-buffer`: The shared-memory buffer through which nano-vllm's rank 0 hands calls to the other ranks is created once, named nanovllm, at 2**20 bytes. Value 2**20 bytes [measured], checked 2026-11-05 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.__init__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L41-L48>, read 2026-11-05).
- `nano-vllm.step-shape`: nano-vllm's Scheduler.schedule returns a list of sequences and a flag that says whether they are prefill. It admits waiting sequences first, and it schedules a decode step only when no prefill was scheduled, so a step is all prefill or all decode. vLLM's scheduler has no such phases. Value prefill or decode, never mixed [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/scheduler.py, Scheduler.schedule <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/scheduler.py#L25-L73>, read 2026-11-04).
- `nano-vllm.tp-shared-memory`: Rank 0's ModelRunner hands each call to the other ranks through a shared-memory buffer named nanovllm. It pickles the method name and its arguments into the buffer and sets an Event for each worker, and a worker's loop waits on its Event and runs the call it reads. Value a shared-memory buffer and an Event [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/model_runner.py, ModelRunner.loop, read_shm and write_shm <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/model_runner.py#L61-L83>, read 2026-11-04).
- `nano-vllm.tp-worker-process`: With tensor_parallel_size above 1, nano-vllm's LLMEngine starts a process for each rank above 0, which runs a ModelRunner, and gives each an Event. Rank 0's ModelRunner stays in the caller's process, so the first tensor-parallel level of The Engine Floor has a second process. Value one process for each rank above 0 [measured], checked 2026-11-04 (source: nano-vllm at bb823b3, nanovllm/engine/llm_engine.py, LLMEngine.__init__ <https://github.com/GeeeekExplorer/nano-vllm/blob/bb823b3e06983d71485a8e1f23715ebd87d98ef8/nanovllm/engine/llm_engine.py#L25-L31>, read 2026-11-04).
- `vllm.cache.block-size-default`: The KV cache block holds 16 tokens by default at v0.33.0. Value 16 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/cache.py, DEFAULT_BLOCK_SIZE <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/cache.py#L185>, read 2026-11-04).
- `vllm.cudagraph.default-mode`: The default optimization level at v0.33.0 is -O2, which captures FULL_AND_PIECEWISE graphs, a full graph for uniform decode batches and piecewise graphs for the rest. -O1 gives PIECEWISE graphs and -O0 gives none. Value FULL_AND_PIECEWISE [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/optimization_levels.md <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/optimization_levels.md#L7-L10>, read 2026-11-04).
- `vllm.prefix-hit-last-token`: vLLM caps a prefix-cache hit one token short of the prompt. When every token of a prompt hits the cache it must still recompute the last token to get logits, so get_computed_blocks defaults the longest hit to the prompt length less one. Value prompt length less one [measured], checked 2026-11-05 (source: vLLM v0.33.0, vllm/v1/core/kv_cache_manager.py, KVCacheManager.get_computed_blocks <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/kv_cache_manager.py#L295-L302>, read 2026-11-05).
- `vllm.request.states`: At v0.33.0 a request is in one of 12 states, WAITING, WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR, WAITING_FOR_REMOTE_KVS, WAITING_FOR_STREAMING_REQ, RUNNING, PREEMPTED, and six finished states that begin FINISHED_. Value 12 states [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/request.py, RequestStatus <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/request.py#L370-L386>, read 2026-11-04).
- `vllm.scheduler.chunked-prefill-default`: At v0.33.0 chunked prefill is on by default, so a prompt that does not fit the step's token budget is cut into chunks. Value true [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/scheduler.py, enable_chunked_prefill <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/scheduler.py#L134>, read 2026-11-04).
- `vllm.scheduler.no-phases`: The v1 scheduler has no prefill phase and no decode phase. Each request has only the tokens it has computed and the tokens it should have, and each step hands out one token budget so that every request catches up. Value one token budget [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L701-L710>, read 2026-11-04).
- `vllm.scheduler.order`: Within one step the scheduler serves the running requests first and the waiting requests after them, all out of the same token budget. Value running first, then waiting [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/v1/core/sched/scheduler.py#L793>, read 2026-11-04).
