// vLLM at the pin, v0.33.0 (course.lock.json key `vllm`; the tag's commit): one request from the OpenAI route to the first streamed token,
// and, for an abort, the path of the abort. Read on 2026-11-04 from the tag's tarball; every stage names its file, symbol, line and quote,
// and tests/sim/lifecycle-sources.test.ts checks them against the unpacked tree.
//
// The shape (the `lifecycle` card; claims vllm.request.engine-core-process, vllm.engine-core.queues, vllm.step.batch-queue):
//   - the API server (one process, one asyncio loop) and the engine core (a second process) are joined by ZMQ. The core has three
//     threads: an input thread, the busy loop, and an output thread, joined by `input_queue` and `output_queue`;
//   - with one rank the model executor is the engine core's own (UniProcExecutor), so the busy loop launches the forward itself and
//     the sampled ids come back on a copy stream, which the host waits on by an event (claims vllm.async-output.copy-stream and
//     vllm.async-output.event-sync). With two ranks the executor is MultiprocExecutor: the busy loop broadcasts the step to the workers
//     through a shared-memory queue, and a worker's output thread sends the result back the same way (vllm.executor.rpc-broadcast and
//     vllm.executor.message-queue-shm);
//   - async scheduling is on by default (since v0.14.0), so the busy loop runs `step_with_batch_queue`: it schedules a batch, queues
//     its future in `batch_queue`, and blocks on the oldest future only when the queue is full.
//
// What the path leaves out, which the card says: the busy loop's repetition for each token; the small copies of one step, which are
// one `h2d`; the host calls that only launch GPU work (execute_model returns None, and sample_tokens launches the sampler); the
// tokenizer's thread pool; the tensor-parallel ranks that run in parallel with the one the path follows (it follows the request through
// worker 1 and back to worker 0, which sends the result); and the second `sample_tokens` RPC of a two-rank step, which carries no request.
// MRV2 (the default runner since v0.29.0) is the runner followed.

import { citer, gpu, host, pathBuilder } from '../build'
import type { EngineDef, Scenario } from '../types'

const REPO = 'vllm-project/vllm'
const REF = '4ba787ec9959e566d3b587a796dff07673324da5'
const cite = citer({ repo: REPO, ref: REF })

const CLIENT = host('client', 'http-client')
const API = host('api-server', 'handler-task')
const API_OUT = host('api-server', 'output-handler-task')
const API_SOCKET = host('api-server', 'socket-task')
const CORE_IN = host('engine-core', 'input-thread')
const CORE = host('engine-core', 'main')
const CORE_OUT = host('engine-core', 'output-thread')
const CORE_GPU = gpu('engine-core', 0)
const WORKER0 = host('worker-0', 'main', 0)
const WORKER0_OUT = host('worker-0', 'async-output-thread', 0)
const WORKER1 = host('worker-1', 'main', 1)
const WORKER0_GPU = gpu('worker-0', 0)
const WORKER1_GPU = gpu('worker-1', 1)

const ROUTER = 'vllm/entrypoints/openai/completion/api_router.py'
const SERVING = 'vllm/entrypoints/openai/completion/serving.py'
const ASYNC_LLM = 'vllm/v1/engine/async_llm.py'
const CLIENT_PY = 'vllm/v1/engine/core_client.py'
const CORE_PY = 'vllm/v1/engine/core.py'
const SCHEDULER = 'vllm/v1/core/sched/scheduler.py'
const OUTPUTS = 'vllm/v1/engine/output_processor.py'
const MULTIPROC = 'vllm/v1/executor/multiproc_executor.py'
const WORKER = 'vllm/v1/worker/gpu_worker.py'
const RUNNER = 'vllm/v1/worker/gpu/model_runner.py'
const ASYNC_OUT = 'vllm/v1/worker/gpu/async_utils.py'
const LINEAR = 'vllm/model_executor/layers/linear.py'

function path(sc: Scenario) {
  const two = sc.tp === 2
  const b = pathBuilder(CLIENT)

  // The API server: route, render, and the AsyncLLM client.
  b.go('vllm.http-request', 'ipc', 'POST `/v1/completions` (`create_completion`)', API, cite(ROUTER, 'create_completion', 52, 'async def create_completion(request: CompletionRequest, raw_request: Request):'))
  b.go('vllm.render', 'call', 'tokenize the prompt (`render_completion_request`)', API, cite(SERVING, 'OpenAIServingCompletion.render_completion_request', 113, 'return await self.online_renderer.render_completion(request)'))
  b.go('vllm.process-inputs', 'call', 'build the `EngineCoreRequest` (`AsyncLLM.add_request`)', API, cite(ASYNC_LLM, 'AsyncLLM.add_request', 483, 'request = self.input_processor.process_inputs('))
  if (sc.n === 2) b.go('vllm.fan-out', 'call', 'fan out `n` child requests (`ParentRequest`)', API, cite(ASYNC_LLM, 'AsyncLLM.add_request', 542, 'parent_request = ParentRequest(request)'))

  // To the engine core, and into its scheduler.
  b.go('vllm.zmq-add', 'ipc', 'ZMQ ROUTER to DEALER (`AsyncMPClient`)', CORE_IN, cite(CLIENT_PY, 'AsyncMPClient._send_input_message', 1300, 'return self.input_socket.send_multipart((engine,) + message, copy=False)'))
  b.go('vllm.input-queue', 'queue', '`input_queue`', CORE, cite(CORE_PY, 'EngineCoreProc.process_input_sockets', 2040, 'self.input_queue.put_nowait((request_type, request))'))
  b.go('vllm.add-request', 'call', '`_handle_client_request` adds the request', CORE, cite(CORE_PY, 'EngineCoreProc._handle_client_request', 1761, 'self.add_request(req, request_wave)'))
  b.go('vllm.waiting-queue', 'queue', 'the scheduler\'s `waiting` queue', CORE, cite(SCHEDULER, 'Scheduler._enqueue_waiting_request', 2715, 'self.waiting.add_request(request)'), 'WAITING')
  b.go('vllm.schedule', 'call', '`Scheduler.schedule`', CORE, cite(SCHEDULER, 'Scheduler.schedule', 1572, 'request.status = RequestStatus.RUNNING'), 'RUNNING')
  if (sc.prefixHit) b.go('vllm.prefix-hit', 'call', 'cached blocks found (`get_computed_blocks`)', CORE, cite(SCHEDULER, 'Scheduler._get_local_prefix_cache_hit', 674, 'self.kv_cache_manager.get_computed_blocks(request, max_cache_hit_length)'))

  // The step: one rank runs it in the busy loop's own process, two ranks run it in workers.
  const device = two ? WORKER1_GPU : CORE_GPU
  if (two) {
    b.go('vllm.rpc-broadcast', 'shm', 'shared-memory queue to the workers (`rpc_broadcast_mq`)', WORKER1, cite(MULTIPROC, 'MultiprocExecutor.collective_rpc', 492, 'self.rpc_broadcast_mq.enqueue((send_method, args, kwargs, output_rank))'))
    b.go('vllm.worker-execute', 'call', '`Worker.execute_model`', WORKER1, cite(WORKER, 'Worker.execute_model', 1360, 'output = self.model_runner.execute_model('))
  } else {
    b.go('vllm.execute-model', 'call', '`execute_model(non_block=True)`', CORE, cite(CORE_PY, 'EngineCore.step_with_batch_queue', 737, 'exec_future = self.model_executor.execute_model('))
  }
  b.go('vllm.h2d', 'h2d', 'step inputs to the GPU (`prepare_inputs`)', device, cite(RUNNER, 'GPUModelRunner.prepare_inputs', 1406, 'idx_mapping = async_tensor_h2d('))
  b.go('vllm.forward', 'launch', 'the forward pass (`model(**model_inputs)`, or a graph replay)', device, cite(RUNNER, 'GPUModelRunner.execute_model', 2097, 'model_output = self.model(**model_inputs)'))
  if (two) b.go('vllm.all-reduce', 'collective', 'tensor-parallel all-reduce (`RowParallelLinear`)', WORKER0_GPU, cite(LINEAR, 'RowParallelLinear.forward', 1818, 'output = tensor_model_parallel_all_reduce(output_parallel)'))
  b.go('vllm.sample', 'launch', 'sampling (`sample_tokens`)', two ? WORKER0_GPU : CORE_GPU, cite(RUNNER, 'GPUModelRunner.sample_tokens', 2200, 'sampler_output, num_sampled, num_rejected = self.sample('))
  b.go('vllm.d2h', 'd2h', 'sampled ids to the host on a copy stream (`AsyncOutput`)', two ? WORKER0 : CORE, cite(ASYNC_OUT, 'AsyncOutput.__init__', 141, 'self.sampled_token_ids = async_copy_to_np(sampler_output.sampled_token_ids)'))
  if (two) {
    b.go('vllm.async-output-queue', 'queue', '`async_output_queue`', WORKER0_OUT, cite(MULTIPROC, 'WorkerProc.handle_output', 1133, 'self.async_output_queue.put(output)'))
  } else {
    b.go('vllm.batch-queue', 'queue', '`batch_queue`', CORE, cite(CORE_PY, 'EngineCore.step_with_batch_queue', 763, 'batch_queue.appendleft((future, scheduler_output, exec_future))'))
  }
  b.go('vllm.copy-sync', 'sync', '`copy_event.synchronize()` (`AsyncOutput.get_output`)', two ? WORKER0_OUT : CORE, cite(ASYNC_OUT, 'AsyncOutput.get_output', 175, 'self.copy_event.synchronize()'))
  if (two) b.go('vllm.response-mq', 'shm', 'shared-memory queue back to the engine core (`worker_response_mq`)', CORE, cite(MULTIPROC, 'WorkerProc.enqueue_output', 1125, 'response_mq.enqueue(result)'))
  b.go('vllm.update-from-output', 'call', '`update_from_output`', CORE, cite(CORE_PY, 'EngineCore.step_with_batch_queue', 793, 'engine_core_outputs = self.scheduler.update_from_output('))

  // Back out: output thread, ZMQ, the API server's socket task, output handler and the request's own collector.
  b.go('vllm.output-queue', 'queue', '`output_queue`', CORE_OUT, cite(CORE_PY, 'EngineCoreProc._process_engine_step', 1686, 'self.output_queue.put_nowait(output)'))
  b.go('vllm.zmq-out', 'ipc', 'ZMQ PUSH to PULL (`process_output_sockets`)', API_SOCKET, cite(CORE_PY, 'EngineCoreProc.process_output_sockets', 2101, 'tracker = self._send_msg_tracking_payload('))
  b.go('vllm.outputs-queue', 'queue', '`outputs_queue`', API_OUT, cite(CLIENT_PY, 'AsyncMPClient._ensure_output_queue_task', 1260, 'outputs_queue.put_nowait(outputs)'))
  b.go('vllm.process-outputs', 'call', 'detokenize (`OutputProcessor.process_outputs`)', API_OUT, cite(ASYNC_LLM, 'AsyncLLM._run_output_handler', 905, 'processed_outputs = output_processor.process_outputs('))
  b.go('vllm.collector', 'queue', '`RequestOutputCollector`', API, cite(OUTPUTS, 'OutputProcessor.process_outputs', 863, 'req_state.queue.put(request_output)'))
  if (sc.streaming) {
    b.go('vllm.sse-chunk', 'ipc', 'server-sent event (`completion_stream_generator`)', CLIENT, cite(SERVING, 'OpenAIServingCompletion.completion_stream_generator', 487, 'yield f"data: {response_json}\\n\\n"'))
  } else {
    b.go('vllm.full-response', 'ipc', 'JSON response (`CompletionResponse`)', CLIENT, cite(ROUTER, 'create_completion', 66, 'elif isinstance(generator, CompletionResponse):'))
  }

  // The client leaves mid-stream. The abort rides its own queue and is drained before the step updates the scheduler.
  if (sc.abort) {
    b.go('vllm.disconnect', 'ipc', 'the client closes the connection', API, cite(ASYNC_LLM, 'AsyncLLM.generate', 804, '# If the request is disconnected by the client, generate()'))
    b.go('vllm.abort-request', 'call', '`AsyncLLM.abort`', API, cite(ASYNC_LLM, 'AsyncLLM.abort', 955, 'all_request_ids = self.output_processor.abort_requests(request_ids, internal)'))
    b.go('vllm.abort-zmq', 'ipc', 'ZMQ ABORT message (`abort_requests_async`)', CORE_IN, cite(CLIENT_PY, 'AsyncMPClient.abort_requests_async', 1346, 'await self._send_input(EngineCoreRequestType.ABORT, request_ids)'))
    b.go('vllm.aborts-queue', 'queue', '`aborts_queue`', CORE, cite(CORE_PY, 'EngineCoreProc.process_input_sockets', 2037, 'self.aborts_queue.put_nowait(request)'))
    b.go('vllm.process-aborts', 'call', '`_process_aborts_queue`, before `update_from_output`', CORE, cite(CORE_PY, 'EngineCore.step_with_batch_queue', 792, 'self._process_aborts_queue()'))
    b.go('vllm.finish-aborted', 'call', '`finish_requests` with `FINISHED_ABORTED`', CORE, cite(CORE_PY, 'EngineCore.abort_requests', 569, 'self.scheduler.finish_requests(request_ids, RequestStatus.FINISHED_ABORTED)'), 'FINISHED_ABORTED')
  }
  return b.build()
}

export const VLLM: EngineDef = {
  id: 'vllm',
  title: 'vLLM v0.33.0',
  repo: REPO,
  ref: REF,
  readOn: '2026-11-04',
  entry: CLIENT,
  supports: { streaming: [false, true], tp: [1, 2], abort: [false, true], prefixHit: [false, true], n: [1, 2] },
  path,
}
