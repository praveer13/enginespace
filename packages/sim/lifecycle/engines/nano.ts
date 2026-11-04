// nano-vllm at the pin (course.lock.json key `nano-vllm`; the last commit on main, bb823b3): the offline `LLM.generate`, one request through
// one prefill step. Read on 2026-11-04 from the commit's tarball. There is no server: the caller, the scheduler and rank 0's ModelRunner share
// one process and one thread, so a request crosses no process and no thread boundary at one rank, and the path is calls, copies and one
// implicit sync. It supports no streaming, no abort and no `n`: the library has none (SamplingParams holds temperature, max_tokens and
// ignore_eos).
//
// With two ranks (`tensor_parallel_size=2`) the engine spawns a worker PROCESS for rank 1 (`LLMEngine.__init__` starts a `ctx.Process` for
// each rank above 0, which GAMES.md's `nano-tp` level assumed and W1-T16 confirmed at the pin: claim nano-vllm.tp-worker-process) and joins it
// to rank 0 by a shared-memory buffer and an Event (nano-vllm.tp-shared-memory); the layers join the GPUs with NCCL (`dist.all_reduce` in every
// row-parallel layer, and a `dist.gather` of the logits to rank 0, nano-vllm.logits-gather). The path follows the request through rank 1 and
// back to rank 0, which samples and returns the ids (nano-vllm.rank0-samples); rank 0 runs the same steps beside it.
//
// The ids are copied to the host by `.tolist()`. A copy of a CUDA tensor to the host returns when the data is there, which is PyTorch's
// behaviour and not nano-vllm's code (claim lifecycle.torch.copy-synchronizes, from PyTorch 2.14's CUDA semantics note, read 2026-11-04): the
// model draws that line as the copy followed by the wait it contains.

import { citer, gpu, host, pathBuilder } from '../build'
import type { EngineDef, Scenario } from '../types'

const REPO = 'GeeeekExplorer/nano-vllm'
const REF = 'bb823b3e06983d71485a8e1f23715ebd87d98ef8'
const cite = citer({ repo: REPO, ref: REF })

const USER = host('main', 'main')
const USER_GPU = gpu('main', 0)
const WORKER = host('worker-1', 'main', 1)
const WORKER_GPU = gpu('worker-1', 1)

const ENGINE = 'nanovllm/engine/llm_engine.py'
const SCHEDULER = 'nanovllm/engine/scheduler.py'
const BLOCKS = 'nanovllm/engine/block_manager.py'
const RUNNER = 'nanovllm/engine/model_runner.py'

function path(sc: Scenario) {
  const two = sc.tp === 2
  const b = pathBuilder(USER)

  b.go('nano.tokenize', 'call', 'tokenize the prompt (`LLMEngine.add_request`)', USER, cite(ENGINE, 'LLMEngine.add_request', 45, 'prompt = self.tokenizer.encode(prompt)'))
  b.go('nano.waiting-queue', 'queue', 'the scheduler\'s `waiting` deque', USER, cite(SCHEDULER, 'Scheduler.add', 23, 'self.waiting.append(seq)'), 'WAITING')
  b.go('nano.schedule', 'call', '`Scheduler.schedule`: a prefill step', USER, cite(SCHEDULER, 'Scheduler.schedule', 49, 'seq.status = SequenceStatus.RUNNING'), 'RUNNING')
  if (sc.prefixHit) b.go('nano.prefix-hit', 'call', 'cached blocks reused (`BlockManager.allocate`)', USER, cite(BLOCKS, 'BlockManager.allocate', 84, 'block.ref_count += 1'))

  if (two) {
    b.go('nano.broadcast', 'shm', 'shared memory and an Event to rank 1 (`write_shm`)', WORKER, cite(RUNNER, 'ModelRunner.write_shm', 81, 'self.shm.buf[4:n+4] = data'))
    b.go('nano.worker-loop', 'call', 'rank 1\'s `loop` runs the call it read', WORKER, cite(RUNNER, 'ModelRunner.loop', 64, 'self.call(method_name, *args)'))
  }
  const device = two ? WORKER_GPU : USER_GPU
  b.go('nano.h2d', 'h2d', sc.prefixHit ? 'step inputs and block tables to the GPU (`prepare_prefill`)' : 'step inputs to the GPU (`prepare_prefill`)', device, cite(RUNNER, 'ModelRunner.prepare_prefill', 164, 'input_ids = torch.tensor(input_ids, dtype=torch.int64, pin_memory=True).cuda(non_blocking=True)'))
  b.go('nano.forward', 'launch', 'the forward pass (`run_model`)', device, cite(RUNNER, 'ModelRunner.run_model', 198, 'return self.model.compute_logits(self.model(input_ids, positions))'))
  if (two) b.go('nano.gather', 'collective', 'logits gathered to rank 0 (`dist.gather`)', USER_GPU, cite('nanovllm/layers/embed_head.py', 'ParallelLMHead.forward', 64, 'dist.gather(logits, all_logits, 0)'))
  b.go('nano.sample', 'launch', 'sampling (`Sampler`)', USER_GPU, cite(RUNNER, 'ModelRunner.run', 218, 'self.sampler(logits, temperatures)'))
  b.go('nano.d2h', 'd2h', 'sampled ids to the host (`.tolist()`)', USER, cite(RUNNER, 'ModelRunner.run', 218, '.tolist() if self.rank == 0 else None'))
  b.go('nano.sync', 'sync', '`.tolist()` returns when the copy has landed', USER, cite(RUNNER, 'ModelRunner.run', 218, 'token_ids = self.sampler(logits, temperatures).tolist()'))
  b.go('nano.postprocess', 'call', '`Scheduler.postprocess`', USER, cite(ENGINE, 'LLMEngine.step', 53, 'self.scheduler.postprocess(seqs, token_ids, is_prefill)'))
  b.go('nano.detokenize', 'call', 'decode the output (`tokenizer.decode`)', USER, cite(ENGINE, 'LLMEngine.generate', 89, 'self.tokenizer.decode(token_ids)'))
  return b.build()
}

export const NANO: EngineDef = {
  id: 'nano-vllm',
  title: 'nano-vllm',
  repo: REPO,
  ref: REF,
  readOn: '2026-11-04',
  entry: USER,
  supports: { streaming: [false], tp: [1, 2], abort: [false], prefixHit: [false, true], n: [1] },
  path,
}
