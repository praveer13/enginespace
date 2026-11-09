/**
 * Back of House's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the Play
 * index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game (`session`, below), so
 * the registry never pulls the lifecycle model into a page that only lists games.
 *
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the first
 * seed from 0 that the level's band accepts (GAMES.md §2.1), and tests/play/engine-floor-entry.test.ts checks that it still is.
 *
 * The 3D scene is W1-T18's. The graded `map` level is W1-T19's: its pinned practice seed is the first that the
 * band accepts, like the others, and a graded run draws a fresh one when it starts.
 */
import type { GameEntry } from '../types'

export const ENGINE_FLOOR: GameEntry = {
  id: 'engine-floor',
  modules: ['tr1'],
  title: 'Back of House',
  subtitle: "a request's lifecycle",
  has3d: true,
  // The graded level, `map`, earns these: a fresh scenario of any of the five engines, with or without ranks, a prefix hit and an abort.
  kcs: ['tr1.five-mechanisms', 'tr1.small-engine-anatomy', 'tr1.vllm-lifecycle', 'tr1.sglang-lifecycle', 'tr1.abort-path'],
  keys: [
    { id: 'run', code: 'KeyR', label: 'R', description: 'Run the laid path' },
    { id: 'unlay', code: 'Backspace', label: 'Backspace', description: 'Take the last stage off the path' },
  ],
  levels: [
    { id: 'nano', title: 'nano-vllm', graded: false, practiceSeed: 0 },
    { id: 'nano-tp', title: 'nano-vllm on two GPUs', graded: false, practiceSeed: 0 },
    { id: 'mini', title: 'Mini-SGLang', graded: false, practiceSeed: 0 },
    { id: 'inside', title: 'Inside vLLM', graded: false, practiceSeed: 0 },
    { id: 'vllm', title: 'vLLM at the pin', graded: false, practiceSeed: 0 },
    { id: 'sglang', title: 'SGLang at the pin', graded: false, practiceSeed: 0 },
    { id: 'abort', title: 'vLLM, the client leaves', graded: false, practiceSeed: 0 },
    { id: 'map', title: 'The lifecycle map', graded: true, practiceSeed: 0 },
  ],
  card: 'lifecycle',
  claims: [
    'vllm.request.engine-core-process',
    'vllm.engine-core.queues',
    'vllm.engine-core.busy-loop',
    'vllm.step.batch-queue',
    'vllm.async-output.copy-stream',
    'vllm.async-output.event-sync',
    'vllm.request.states',
    'inside-vllm.analysis-commit',
    'vllm.http.api-server-shim',
    'sglang.engine.components',
    'sglang.engine.ipc',
    'sglang.overlap.loop',
    'mini-sglang.processes',
    'mini-sglang.transport',
    'mini-sglang.request-path',
    'mini-sglang.overlap-default',
    'nano-vllm.step-shape',
    'nano-vllm.rank0-samples',
    'lifecycle.torch.copy-synchronizes',
    'nano-vllm.tp-worker-process',
    'nano-vllm.tp-shared-memory',
    'nano-vllm.logits-gather',
    'vllm.executor.rpc-broadcast',
    'vllm.executor.message-queue-shm',
    'sglang.tp.request-broadcast',
    'sglang.parallel-sampling.warmup',
    'mini-sglang.n-ignored',
    'vllm.engine-core.aborts',
    'vllm.engine-core.abort-status',
    'inside-vllm.abort-input-queue',
    'sglang.abort.running-request',
  ],
  session: async () => (await import('./session')).floorSession,
}
