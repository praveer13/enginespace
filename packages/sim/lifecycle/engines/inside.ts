// vLLM at the commit "Inside vLLM" analyses (course.lock.json key `inside-vllm`; 42172ad, 2025-08-09, claim inside-vllm.analysis-commit): the
// same request as the pinned engine's path, in the code the post reads. Read on 2026-11-04 from the commit's tarball. The post predates Model
// Runner V2 and the CUDA-graph dispatcher, and this path is where the learner sees what moved:
//   - the engine core's `step` is `schedule`, a blocking `execute_model` and `update_from_output`. Async scheduling is an experimental option
//     (claim inside-vllm.async-experimental), so there is no `batch_queue` at one pipeline stage and no `sample_tokens`: the runner samples
//     inside `execute_model` and copies the ids to the host with `.tolist()`, which waits for them;
//   - an abort travels on the same `input_queue` as a new request, and is handled at the top of the next turn of the busy loop, after the step in
//     flight has been read back (claim inside-vllm.abort-input-queue). The pinned engine drains a queue of its own before the step updates the
//     scheduler;
//   - with two ranks the executor is MultiprocExecutor, as at the pin: a shared-memory queue to the workers and one back. The worker runs
//     `execute_model` in its own main thread and answers from it, with no output thread of its own.
//
// What the path leaves out is what vllm.ts leaves out.

import { citer, gpu, host, pathBuilder } from '../build'
import type { EngineDef, Scenario } from '../types'

const REPO = 'vllm-project/vllm'
const REF = '42172ad18fbc22c89d0063184e4570cc84186e16'
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
const WORKER1 = host('worker-1', 'main', 1)
const WORKER0_GPU = gpu('worker-0', 0)
const WORKER1_GPU = gpu('worker-1', 1)

const API_SERVER = 'vllm/entrypoints/openai/api_server.py'
const SERVING = 'vllm/entrypoints/openai/serving_completion.py'
const ASYNC_LLM = 'vllm/v1/engine/async_llm.py'
const CLIENT_PY = 'vllm/v1/engine/core_client.py'
const CORE_PY = 'vllm/v1/engine/core.py'
const SCHEDULER = 'vllm/v1/core/sched/scheduler.py'
const OUTPUTS = 'vllm/v1/engine/output_processor.py'
const MULTIPROC = 'vllm/v1/executor/multiproc_executor.py'
const WORKER = 'vllm/v1/worker/gpu_worker.py'
const RUNNER = 'vllm/v1/worker/gpu_model_runner.py'
const LINEAR = 'vllm/model_executor/layers/linear.py'

function path(sc: Scenario) {
  const two = sc.tp === 2
  const b = pathBuilder(CLIENT)

  b.go('inside.http-request', 'ipc', 'POST `/v1/completions` (`create_completion`)', API, cite(API_SERVER, 'create_completion', 703, 'async def create_completion(request: CompletionRequest, raw_request: Request):'))
  b.go('inside.tokenize', 'call', 'tokenize the prompt (`_preprocess_completion`)', API, cite(SERVING, 'OpenAIServingCompletion.create_completion', 130, 'request_prompts, engine_prompts = await self._preprocess_completion('))
  b.go('inside.process-inputs', 'call', 'build the `EngineCoreRequest` (`AsyncLLM.add_request`)', API, cite(ASYNC_LLM, 'AsyncLLM.add_request', 250, 'prompt_str, request = self.processor.process_inputs('))
  if (sc.n === 2) b.go('inside.fan-out', 'call', 'fan out `n` child requests (`ParentRequest`)', API, cite(ASYNC_LLM, 'AsyncLLM.add_request', 259, 'parent_request = ParentRequest(request_id, params)'))

  b.go('inside.zmq-add', 'ipc', 'ZMQ ROUTER to DEALER (`AsyncMPClient`)', CORE_IN, cite(CLIENT_PY, 'AsyncMPClient._send_input_message', 834, 'return self.input_socket.send_multipart(msg, copy=False)'))
  b.go('inside.input-queue', 'queue', '`input_queue`', CORE, cite(CORE_PY, 'EngineCoreProc.process_input_sockets', 852, 'self.input_queue.put_nowait((request_type, request))'))
  b.go('inside.add-request', 'call', '`_handle_client_request` adds the request', CORE, cite(CORE_PY, 'EngineCoreProc._handle_client_request', 741, 'self.add_request(req, request_wave)'))
  b.go('inside.waiting-queue', 'queue', 'the scheduler\'s `waiting` queue', CORE, cite(SCHEDULER, 'Scheduler.add_request', 972, 'self.waiting.add_request(request)'), 'WAITING')
  b.go('inside.schedule', 'call', '`Scheduler.schedule`', CORE, cite(SCHEDULER, 'Scheduler.schedule', 505, 'request.status = RequestStatus.RUNNING'), 'RUNNING')
  if (sc.prefixHit) b.go('inside.prefix-hit', 'call', 'cached blocks found (`get_computed_blocks`)', CORE, cite(SCHEDULER, 'Scheduler.schedule', 380, 'self.kv_cache_manager.get_computed_blocks('))

  const device = two ? WORKER1_GPU : CORE_GPU
  if (two) {
    b.go('inside.rpc-broadcast', 'shm', 'shared-memory queue to the workers (`rpc_broadcast_mq`)', WORKER1, cite(MULTIPROC, 'MultiprocExecutor.collective_rpc', 216, 'self.rpc_broadcast_mq.enqueue('))
    b.go('inside.worker-execute', 'call', '`Worker.execute_model`', WORKER1, cite(WORKER, 'Worker.execute_model', 367, 'output = self.model_runner.execute_model(scheduler_output,'))
  } else {
    b.go('inside.execute-model', 'call', '`execute_model`, which blocks', CORE, cite(CORE_PY, 'EngineCore.step', 273, 'model_output = self.execute_model_with_error_logging('))
  }
  b.go('inside.h2d', 'h2d', 'step inputs to the GPU (`_prepare_inputs`)', device, cite(RUNNER, 'GPUModelRunner._prepare_inputs', 711, 'self.input_ids[:total_num_scheduled_tokens].copy_('))
  b.go('inside.forward', 'launch', 'the forward pass (`self.model(...)`)', device, cite(RUNNER, 'GPUModelRunner.execute_model', 1542, 'model_output = self.model('))
  if (two) b.go('inside.all-reduce', 'collective', 'tensor-parallel all-reduce (`RowParallelLinear`)', WORKER0_GPU, cite(LINEAR, 'RowParallelLinear.forward', 1389, 'output = tensor_model_parallel_all_reduce(output_parallel)'))
  b.go('inside.sample', 'launch', 'sampling (`self.sampler`)', two ? WORKER0_GPU : CORE_GPU, cite(RUNNER, 'GPUModelRunner.execute_model', 1598, 'sampler_output = self.sampler('))
  b.go('inside.d2h', 'd2h', 'sampled ids to the host (`.tolist()`)', two ? WORKER0 : CORE, cite(RUNNER, 'GPUModelRunner.execute_model', 1667, 'valid_sampled_token_ids = sampled_token_ids.tolist()'))
  b.go('inside.sync', 'sync', '`.tolist()` returns when the copy has landed', two ? WORKER0 : CORE, cite(RUNNER, 'GPUModelRunner.execute_model', 1667, 'valid_sampled_token_ids = sampled_token_ids.tolist()'))
  if (two) b.go('inside.response-mq', 'shm', 'shared-memory queue back to the engine core (`worker_response_mq`)', CORE, cite(MULTIPROC, 'WorkerProc.worker_busy_loop', 600, 'self.worker_response_mq.enqueue('))
  b.go('inside.update-from-output', 'call', '`update_from_output`', CORE, cite(CORE_PY, 'EngineCore.step', 276, 'engine_core_outputs = self.scheduler.update_from_output('))

  b.go('inside.output-queue', 'queue', '`output_queue`', CORE_OUT, cite(CORE_PY, 'EngineCoreProc._process_engine_step', 731, 'self.output_queue.put_nowait(output)'))
  b.go('inside.zmq-out', 'ipc', 'ZMQ PUSH to PULL (`process_output_sockets`)', API_SOCKET, cite(CORE_PY, 'EngineCoreProc.process_output_sockets', 905, 'tracker = sockets[client_index].send_multipart(buffers,'))
  b.go('inside.outputs-queue', 'queue', '`outputs_queue`', API_OUT, cite(CLIENT_PY, 'AsyncMPClient._ensure_output_queue_task', 791, 'outputs_queue.put_nowait(outputs)'))
  b.go('inside.process-outputs', 'call', 'detokenize (`OutputProcessor.process_outputs`)', API_OUT, cite(ASYNC_LLM, 'AsyncLLM._run_output_handler', 406, 'processed_outputs = output_processor.process_outputs('))
  b.go('inside.collector', 'queue', '`RequestOutputCollector`', API, cite(OUTPUTS, 'OutputProcessor.process_outputs', 417, 'req_state.queue.put(request_output)'))
  if (sc.streaming) {
    b.go('inside.sse-chunk', 'ipc', 'server-sent event (`completion_stream_generator`)', CLIENT, cite(SERVING, 'OpenAIServingCompletion.completion_stream_generator', 444, 'yield f"data: {response_json}\\n\\n"'))
  } else {
    b.go('inside.full-response', 'ipc', 'JSON response (`CompletionResponse`)', CLIENT, cite(API_SERVER, 'create_completion', 721, 'elif isinstance(generator, CompletionResponse):'))
  }

  // The client leaves mid-stream. The abort waits in `input_queue` behind the step in flight.
  if (sc.abort) {
    b.go('inside.disconnect', 'ipc', 'the client closes the connection', API, cite(ASYNC_LLM, 'AsyncLLM.generate', 343, '# If the request is disconnected by the client, generate()'))
    b.go('inside.abort-request', 'call', '`AsyncLLM.abort`', API, cite(ASYNC_LLM, 'AsyncLLM.abort', 438, 'await self.engine_core.abort_requests_async(request_ids)'))
    b.go('inside.abort-zmq', 'ipc', 'ZMQ ABORT message (`abort_requests_async`)', CORE_IN, cite(CLIENT_PY, 'AsyncMPClient.abort_requests_async', 872, 'await self._send_input(EngineCoreRequestType.ABORT, request_ids)'))
    b.go('inside.abort-input-queue', 'queue', '`input_queue`, behind the step in flight', CORE, cite(CORE_PY, 'EngineCoreProc.process_input_sockets', 852, 'self.input_queue.put_nowait((request_type, request))'))
    b.go('inside.abort-requests', 'call', '`_handle_client_request` aborts the request', CORE, cite(CORE_PY, 'EngineCoreProc._handle_client_request', 743, 'self.abort_requests(request)'))
    b.go('inside.finish-aborted', 'call', '`finish_requests` with `FINISHED_ABORTED`', CORE, cite(CORE_PY, 'EngineCore.abort_requests', 240, 'self.scheduler.finish_requests(request_ids,'), 'FINISHED_ABORTED')
  }
  return b.build()
}

export const INSIDE: EngineDef = {
  id: 'inside-vllm',
  title: 'vLLM at 42172ad (Inside vLLM)',
  repo: REPO,
  ref: REF,
  readOn: '2026-11-04',
  entry: CLIENT,
  supports: { streaming: [false, true], tp: [1, 2], abort: [false, true], prefixHit: [false, true], n: [1, 2] },
  path,
}
