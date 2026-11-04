// Mini-SGLang at the pin (course.lock.json key `mini-sglang`; the last commit on main, 9a91cfa): one request through its processes. Read on
// 2026-11-04 from the commit's tarball, with docs/structures.md's eight-step request lifecycle as the answer key (claim mini-sglang.request-path).
//
// The processes are the API server (FastAPI, one asyncio loop), a tokenizer worker, a detokenizer worker (the same function, on the other
// socket) and one scheduler process per tensor-parallel rank, all joined by ZMQ push and pull sockets; the GPUs of the ranks are joined by
// NCCL. The scheduler runs the overlap loop (on by default, claim mini-sglang.overlap-default): it launches a batch, and processes the batch
// before it, so the sync on a copy comes in the NEXT turn of the loop. Rank 0 receives from the tokenizer and publishes each message to the
// other ranks; every rank schedules it and runs the engine. The path follows the request through rank 1 and back to rank 0, which returns
// the token.
//
// `n` is accepted by the request model and ignored (`v1_completions` builds one TokenizeMsg; claim mini-sglang.n-ignored), so the engine
// supports n = 1 only. A client that leaves mid-stream is noticed by `stream_with_cancellation`, which has the API server tell the
// tokenizer, which tells the scheduler.

import { citer, gpu, host, pathBuilder } from '../build'
import type { EngineDef, Scenario } from '../types'

const REPO = 'sgl-project/mini-sglang'
const REF = '9a91cfafe754aa85daee49998176275667eb58f2'
const cite = citer({ repo: REPO, ref: REF })

const CLIENT = host('client', 'http-client')
const API = host('api-server', 'handler-task')
const LISTEN = host('api-server', 'listen-task')
const TOKENIZER = host('tokenizer-0', 'main')
const DETOKENIZER = host('detokenizer-0', 'main')
const scheduler = (rank: number) => host(`scheduler-${rank}`, 'main', rank)
const device = (rank: number) => gpu(`scheduler-${rank}`, rank)

const SERVER = 'python/minisgl/server/api_server.py'
const WORKER = 'python/minisgl/tokenizer/server.py'
const IO = 'python/minisgl/scheduler/io.py'
const PREFILL = 'python/minisgl/scheduler/prefill.py'
const SCHEDULER = 'python/minisgl/scheduler/scheduler.py'
const ENGINE = 'python/minisgl/engine/engine.py'

function path(sc: Scenario) {
  const two = sc.tp === 2
  // The rank that runs the middle of the path: the one the broadcast reaches.
  const w = two ? 1 : 0
  const b = pathBuilder(CLIENT)

  b.go('mini.http-request', 'ipc', 'POST `/v1/chat/completions` (`v1_completions`)', API, cite(SERVER, 'v1_completions', 256, 'async def v1_completions(req: OpenAICompletionRequest, request: Request):'))
  b.go('mini.tokenize-msg', 'ipc', 'ZMQ push of a `TokenizeMsg` (`send_one`)', TOKENIZER, cite(SERVER, 'FrontendManager.send_one', 132, 'await self.send_tokenizer.put(msg)'))
  b.go('mini.tokenize', 'call', '`TokenizeManager.tokenize`', TOKENIZER, cite(WORKER, 'tokenize_worker', 88, 'tensors = tokenize_manager.tokenize(tokenize_msg)'))
  b.go('mini.to-scheduler', 'ipc', 'ZMQ push of a `UserMsg` to rank 0', scheduler(0), cite(WORKER, 'tokenize_worker', 101, 'send_backend.put(batch_output)'))
  if (two) b.go('mini.to-rank1', 'ipc', 'ZMQ publish to the other ranks (`_send_into_ranks`)', scheduler(1), cite(IO, 'SchedulerIOMixin._recv_msg_multi_rank0', 105, 'self._send_into_ranks.put_raw(raw)'))
  b.go('mini.waiting-queue', 'queue', '`pending_list`', scheduler(w), cite(PREFILL, 'PrefillManager.add_one_req', 124, 'self.pending_list.append(PendingReq(req.uid, req.input_ids, req.sampling_params))'))
  b.go('mini.schedule', 'call', '`PrefillManager.schedule_next_batch`', scheduler(w), cite(SCHEDULER, 'Scheduler._schedule_next_batch', 222, 'self.prefill_manager.schedule_next_batch(self.prefill_budget)'))
  if (sc.prefixHit) b.go('mini.prefix-hit', 'call', 'radix match and lock (`match_req`)', scheduler(w), cite(PREFILL, 'PrefillAdder._try_allocate_one', 44, 'handle = self.cache_manager.match_req(req).cuda_handle'))
  b.go('mini.h2d', 'h2d', 'step inputs to the GPU (`_make_positions`)', device(w), cite(SCHEDULER, '_make_positions', 249, 'return indices_host.to(device, non_blocking=True)'))
  b.go('mini.forward', 'launch', 'the forward pass (`Engine.forward_batch`)', device(w), cite(ENGINE, 'Engine.forward_batch', 197, 'logits = self.model.forward()'))
  if (two) b.go('mini.all-reduce', 'collective', 'tensor-parallel all-reduce (`dist.all_reduce`)', device(0), cite('python/minisgl/distributed/impl.py', 'TorchDistributedImpl.all_reduce', 30, 'dist.all_reduce(x, op=dist.ReduceOp.SUM)'))
  b.go('mini.sample', 'launch', 'sampling (`Sampler.sample`)', device(0), cite(ENGINE, 'Engine.forward_batch', 202, 'next_tokens_gpu = self.sampler.sample(logits[: batch.size], args).to(torch.int32)'))
  b.go('mini.d2h', 'd2h', 'next tokens to the host, non-blocking', scheduler(0), cite(ENGINE, 'Engine.forward_batch', 203, 'next_tokens_cpu = next_tokens_gpu.to("cpu", non_blocking=True)'))
  b.go('mini.sync', 'sync', '`copy_done.synchronize()`, in the next turn of the loop', scheduler(0), cite(SCHEDULER, 'Scheduler._process_last_data', 143, 'copy_done.synchronize()'))
  b.go('mini.process-result', 'call', '`_process_last_data` builds a `DetokenizeMsg`', scheduler(0), cite(SCHEDULER, 'Scheduler._process_last_data', 156, 'reply.append(DetokenizeMsg(uid=req.uid, next_token=next_token, finished=finished))'))
  b.go('mini.to-detokenizer', 'ipc', 'ZMQ push to the detokenizer (`_reply_tokenizer_rank0`)', DETOKENIZER, cite(IO, 'SchedulerIOMixin._reply_tokenizer_rank0', 128, 'self._send_into_tokenizer.put(reply[0])'))
  b.go('mini.detokenize', 'call', '`DetokenizeManager.detokenize`', DETOKENIZER, cite(WORKER, 'tokenize_worker', 72, 'replies = detokenize_manager.detokenize(detokenize_msg)'))
  b.go('mini.to-frontend', 'ipc', 'ZMQ push of a `UserReply` to the API server', LISTEN, cite(WORKER, 'tokenize_worker', 85, 'send_frontend.put(batch_output)'))
  b.go('mini.ack-mailbox', 'queue', '`ack_map` and its `Event`', API, cite(SERVER, 'FrontendManager.listen', 123, 'self.event_map[msg.uid].set()'))
  if (sc.streaming) {
    b.go('mini.sse-chunk', 'ipc', 'server-sent event (`stream_chat_completions`)', CLIENT, cite(SERVER, 'FrontendManager.stream_chat_completions', 175, 'yield f"data: {json.dumps(chunk)}\\n\\n".encode()'))
  } else {
    b.go('mini.full-response', 'ipc', 'JSON response (`chat.completion`)', CLIENT, cite(SERVER, 'v1_completions', 295, '"object": "chat.completion",'))
  }

  // The client leaves mid-stream: the API server tells the tokenizer, which tells rank 0's scheduler, which frees the request.
  if (sc.abort) {
    b.go('mini.disconnect', 'ipc', 'the client closes the connection', API, cite(SERVER, 'FrontendManager.stream_with_cancellation', 194, 'if await request.is_disconnected():'))
    b.go('mini.abort-msg', 'ipc', 'ZMQ push of an `AbortMsg` (`abort_user`)', TOKENIZER, cite(SERVER, 'FrontendManager.abort_user', 209, 'await self.send_one(AbortMsg(uid=uid))'))
    b.go('mini.abort-forward', 'ipc', 'ZMQ push of an `AbortBackendMsg` to rank 0', scheduler(0), cite(WORKER, 'tokenize_worker', 108, 'send_backend.put(batch_output)'))
    b.go('mini.abort-req', 'call', '`abort_req`, then `_free_req_resources`', scheduler(0), cite(SCHEDULER, 'Scheduler._process_one_msg', 192, 'req_to_free = self.prefill_manager.abort_req(msg.uid)'))
  }
  return b.build()
}

export const MINI: EngineDef = {
  id: 'mini-sglang',
  title: 'Mini-SGLang',
  repo: REPO,
  ref: REF,
  readOn: '2026-11-04',
  entry: CLIENT,
  supports: { streaming: [false, true], tp: [1, 2], abort: [false, true], prefixHit: [false, true], n: [1] },
  path,
}
