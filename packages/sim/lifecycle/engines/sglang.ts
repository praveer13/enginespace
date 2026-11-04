// SGLang at the pin, v0.5.23 (course.lock.json key `sglang`; the tag's commit): one request from the OpenAI route to the first streamed token,
// and, for an abort, the path of the abort. Read on 2026-11-04 from the tag's tarball. The default request path is Python; the Rust HTTP
// server is opt-in (SGLANG_RUST_SERVER, off by default) and not drawn.
//
// The shape (the `lifecycle` card; claims sglang.engine.components, sglang.engine.ipc, sglang.overlap.loop):
//   - the HTTP server, the engine and the tokenizer manager share the main process; the scheduler (one process per tensor-parallel rank) and the
//     detokenizer manager are subprocesses, and ZMQ sockets join the three. The tokenizer manager's `handle_loop` is an asyncio task of the
//     main process's loop that reads the detokenizer's replies and wakes the request's waiting coroutine;
//   - the scheduler runs the overlap loop (on by default): it launches batch N, then processes the result of batch N-1 from `result_queue`.
//     The result of a batch is copied to the host on `copy_stream` and its `copy_done` event is waited for in the NEXT turn;
//   - `n` greater than one makes the tokenizer manager send the shared prompt first, with `max_new_tokens=0`, to fill the radix cache, and
//     then the `n` samples (claim sglang.parallel-sampling.warmup): a whole extra round trip that the path draws as one stage;
//   - rank 0's scheduler pulls requests from the tokenizer manager and broadcasts them to the other ranks over the CPU group (claim
//     sglang.tp.request-broadcast); every rank schedules and runs them. The path follows the request through rank 1 and back to rank 0, which
//     sends the tokens on;
//   - an abort from a client that left marks the running request to finish, and the existing finishing code frees it a pass later
//     (sglang.abort.running-request).
//
// What the path leaves out: the CPU-side `async_d2h_copy_worker` (used under confidential computing only), the FutureMap that relays a
// decode's last tokens on the GPU (it matters from the second step on), and the repetition of the loop for each token.

import { citer, gpu, host, pathBuilder } from '../build'
import type { EngineDef, Scenario } from '../types'

const REPO = 'sgl-project/sglang'
const REF = '297e54fd105e974cdf401e5b4d20253a22c16f90'
const cite = citer({ repo: REPO, ref: REF })

const CLIENT = host('client', 'http-client')
const API = host('api-server', 'handler-task')
const API_LOOP = host('api-server', 'handle-loop-task')
const DETOKENIZER = host('detokenizer', 'main')
const scheduler = (rank: number) => host(`scheduler-${rank}`, 'main', rank)
const device = (rank: number) => gpu(`scheduler-${rank}`, rank)

const SRT = 'python/sglang/srt/'
const HTTP = `${SRT}entrypoints/http_server.py`
const SERVING_BASE = `${SRT}entrypoints/openai/serving_base.py`
const SERVING = `${SRT}entrypoints/openai/serving_completions.py`
const TOKENIZER = `${SRT}managers/tokenizer_manager.py`
const RECEIVER = `${SRT}managers/scheduler_components/request_receiver.py`
const SCHEDULER = `${SRT}managers/scheduler.py`
const OVERLAP = `${SRT}managers/overlap_utils.py`
const RUNNER = `${SRT}model_executor/model_runner.py`
const TP_WORKER = `${SRT}managers/tp_worker.py`
const RESULTS = `${SRT}managers/scheduler_components/batch_result_processor.py`
const STREAMER = `${SRT}managers/scheduler_components/output_streamer.py`
const DETOKENIZER_PY = `${SRT}managers/detokenizer_manager.py`
const LINEAR = `${SRT}layers/linear.py`

function path(sc: Scenario) {
  const two = sc.tp === 2
  // The rank that runs the middle of the path: the one the broadcast reaches.
  const w = two ? 1 : 0
  const b = pathBuilder(CLIENT)

  b.go('sglang.http-request', 'ipc', 'POST `/v1/completions` (`openai_v1_completions`)', API, cite(HTTP, 'openai_v1_completions', 1861, 'async def openai_v1_completions(request: CompletionRequest, raw_request: Request):'))
  b.go('sglang.handle-request', 'call', 'convert the request off the loop (`handle_request`)', API, cite(SERVING_BASE, 'OpenAIServingBase.handle_request', 102, 'adapted_request, processed_request = await loop.run_in_executor('))
  if (sc.n === 2) {
    b.go('sglang.tokenize-batch', 'call', 'tokenize the prompt for `n` samples (`_handle_batch_request`)', API, cite(TOKENIZER, 'TokenizerManager._handle_batch_request', 2127, '*(self._tokenize_one_request(obj) for obj in objs)'))
    b.go('sglang.n-warmup', 'call', 'warm the shared prefix with `max_new_tokens=0`, then send the `n` samples', API, cite(TOKENIZER, 'TokenizerManager._handle_batch_request', 2130, '# Cache the common prefix for parallel sampling'))
  } else {
    b.go('sglang.tokenize', 'call', 'tokenize the prompt (`_tokenize_one_request`)', API, cite(TOKENIZER, 'TokenizerManager.generate_request', 946, 'tokenized_obj = await self._tokenize_one_request(obj)'))
  }
  b.go('sglang.dispatch', 'ipc', 'ZMQ push to the scheduler (`_dispatch_to_scheduler`)', scheduler(0), cite(TOKENIZER, 'TokenizerManager._dispatch_to_scheduler', 701, 'sock_send(self.send_to_scheduler, obj)'))
  if (two) b.go('sglang.broadcast', 'ipc', 'CPU-group broadcast to the other ranks (`broadcast_pyobj`)', scheduler(1), cite(RECEIVER, 'SchedulerRequestReceiver._broadcast_reqs_across_ranks', 206, 'recv_reqs = broadcast_pyobj('))
  b.go('sglang.waiting-queue', 'queue', '`waiting_queue`', scheduler(w), cite(SCHEDULER, 'Scheduler._add_request_to_queue', 3493, 'self.waiting_queue.append(req)'))
  b.go('sglang.schedule', 'call', '`get_new_batch_prefill`', scheduler(w), cite(SCHEDULER, 'Scheduler.get_new_batch_prefill', 4052, 'def get_new_batch_prefill(self, running_batch: ScheduleBatch) -> NextBatchPlan:'))
  if (sc.prefixHit) b.go('sglang.prefix-hit', 'call', 'radix-tree match (`init_next_round_input`)', scheduler(w), cite(SCHEDULER, 'Scheduler._get_new_batch_prefill_raw', 4260, 'req.init_next_round_input(self.tree_cache)'))
  b.go('sglang.run-batch', 'call', '`run_batch` hands the batch to the model worker', scheduler(w), cite(SCHEDULER, 'Scheduler.run_batch', 4704, 'batch_result = self.model_worker.forward_batch_generation('))
  b.go('sglang.h2d', 'h2d', 'prefill ids to the GPU (`resolve_forward_inputs`)', device(w), cite(OVERLAP, 'resolve_forward_inputs', 120, 'prefill_gpu = batch.prefill_input_ids_cpu.to(batch.device, non_blocking=True)'))
  b.go('sglang.forward', 'launch', 'the forward pass (`ModelRunner._forward_raw`)', device(w), cite(RUNNER, 'ModelRunner._forward_raw', 2063, 'ret = self.eager_runner.execute('))
  if (two) b.go('sglang.all-reduce', 'collective', 'tensor-parallel all-reduce (`RowParallelLinear`)', device(0), cite(LINEAR, 'RowParallelLinear.forward', 1824, 'output = tensor_model_parallel_all_reduce(output_parallel)'))
  b.go('sglang.sample', 'launch', 'sampling (`ModelRunner.sample`)', device(0), cite(TP_WORKER, 'TpModelWorker.forward_batch_generation', 744, 'batch_result.next_token_ids = self.model_runner.sample('))
  b.go('sglang.d2h', 'd2h', 'results to the host on `copy_stream` (`copy_to_cpu`)', scheduler(0), cite(SCHEDULER, 'Scheduler._copy_result_to_cpu', 5035, 'copy_fn()'))
  b.go('sglang.result-queue', 'queue', '`result_queue`', scheduler(0), cite(SCHEDULER, 'Scheduler.event_loop_overlap', 2112, 'self.result_queue.append((batch.copy(), batch_result))'))
  b.go('sglang.copy-sync', 'sync', '`copy_done.synchronize()`, in the next turn of the loop', scheduler(0), cite(RESULTS, 'SchedulerBatchResultProcessor.process_batch_result_prefill', 268, 'result.copy_done.synchronize()'))
  b.go('sglang.process-result', 'call', '`process_batch_result`', scheduler(0), cite(SCHEDULER, 'Scheduler.process_batch_result', 5099, 'self.batch_result_processor.process_batch_result_prefill(batch, result)'))
  b.go('sglang.stream-output', 'ipc', 'ZMQ push to the detokenizer (`stream_output`)', DETOKENIZER, cite(STREAMER, 'SchedulerOutputStreamer._stream_output_generation', 235, 'self.send_to_detokenizer.send_output(payload)'))
  b.go('sglang.detokenize', 'call', '`DetokenizerManager` decodes the tokens', DETOKENIZER, cite(DETOKENIZER_PY, 'DetokenizerManager.event_loop', 189, 'output = self._request_dispatcher(recv_obj)'))
  b.go('sglang.detokenizer-send', 'ipc', 'ZMQ push back to the tokenizer manager', API_LOOP, cite(DETOKENIZER_PY, 'DetokenizerManager.event_loop', 191, 'sock_send(self.send_to_tokenizer, output)'))
  b.go('sglang.handle-loop', 'queue', '`state.out_list`, woken by `state.event`', API, cite(TOKENIZER, 'TokenizerManager._handle_batch_output', 2779, 'state.out_list.append(out_dict)'))
  if (sc.streaming) {
    b.go('sglang.sse-chunk', 'ipc', 'server-sent event (`_generate_completion_stream`)', CLIENT, cite(SERVING, 'OpenAIServingCompletion._generate_completion_stream', 403, 'yield f"data: {chunk.model_dump_json()}\\n\\n"'))
  } else {
    b.go('sglang.full-response', 'ipc', 'JSON response (`_build_completion_response`)', CLIENT, cite(SERVING, 'OpenAIServingCompletion._handle_non_streaming_request', 524, 'response = self._build_completion_response('))
  }

  // The client leaves mid-stream: a background task of the response aborts the request, and the running request is marked to finish.
  if (sc.abort) {
    b.go('sglang.disconnect', 'ipc', 'the client closes the connection', API, cite(TOKENIZER, 'TokenizerManager.create_abort_task', 2428, '# Abort the request if the client is disconnected.'))
    b.go('sglang.abort-request', 'call', '`TokenizerManager.abort_request`', API, cite(TOKENIZER, 'TokenizerManager.abort_request', 2254, 'req = AbortReq(rid=rid, abort_all=abort_all)'))
    b.go('sglang.abort-dispatch', 'ipc', 'ZMQ push of an `AbortReq` (`_dispatch_to_scheduler`)', scheduler(0), cite(TOKENIZER, 'TokenizerManager._dispatch_to_scheduler', 701, 'sock_send(self.send_to_scheduler, obj)'))
    b.go('sglang.abort-release', 'call', '`Scheduler.abort_request` marks the running request `FINISH_ABORT`', scheduler(0), cite(SCHEDULER, 'Scheduler.abort_request', 5812, 'req.to_finish = FINISH_ABORT()'))
  }
  return b.build()
}

export const SGLANG: EngineDef = {
  id: 'sglang',
  title: 'SGLang v0.5.23',
  repo: REPO,
  ref: REF,
  readOn: '2026-11-04',
  entry: CLIENT,
  supports: { streaming: [false, true], tp: [1, 2], abort: [false, true], prefixHit: [false, true], n: [1, 2] },
  path,
}
