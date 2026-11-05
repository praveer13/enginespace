// The structured-output mask's cost (WORLD §2.8; GAMES.md §3.2's `mask` level): how long the engine core's thread takes to fill the
// bitmask of one step. Where the fill falls in a step, and what waits for it, is the loop's (./run). Nothing here draws a number.
//
// What vLLM v0.33.0 does (claims vllm.mask.overlap, vllm.mask.fill-parallel-threshold, vllm.mask.fill-rows-per-request, vllm.mask.deferred-sampling):
//   - the engine core builds the bitmask on its own thread, after it has launched the forward without blocking, so the fill runs while
//     the GPU works, and `sample_tokens` then applies it;
//   - every structured request owns a block of `1 + num_speculative_tokens` rows, one for each position that may be sampled;
//   - up to 128 structured requests the fill is serial. Above that, and only when no speculative tokens are configured, it is cut
//     into tasks of 16 requests on a pool of at most 8 threads, and the engine thread waits for all of them.
// The cost of a row is the host card's `maskPerSeqUs`, which is [estimated] like every host µs until W2-T22 fits it.

import { divCeil } from '../core/int'
import type { Us } from '../core/types'

/** Structured requests in a step above which the fill goes to the thread pool (claim vllm.mask.fill-parallel-threshold). */
export const MASK_PARALLEL_THRESHOLD = 128
/** Requests in one task of the parallel fill (claim vllm.mask.fill-parallel-threshold). */
export const MASK_TASK_REQUESTS = 16
/** Threads of the pool: at most 8, and half the CPUs when there are fewer than 16 (claim vllm.mask.fill-parallel-threshold). The model takes a host with 16 or more. [estimated] */
export const MASK_POOL_THREADS = 8

/**
 * The µs the engine thread spends filling the bitmask of a step with `requests` structured requests that sample a token, at `perRowUs` a
 * row and `specTokens` speculative tokens a request. Serial: `requests · (1 + specTokens)` rows (claim vllm.mask.fill-rows-per-request).
 * Parallel (more than 128 requests and no speculation, claim vllm.mask.fill-parallel-threshold): the tasks of 16 requests go round the
 * 8 threads in the order they are submitted, and the thread that finishes last sets the time. A task takes 16 rows, except the last,
 * which takes what is left.
 */
export function maskFillUs(requests: number, perRowUs: Us, specTokens: number): Us {
  if (!Number.isSafeInteger(requests) || requests < 0) throw new RangeError(`requests must be an integer of at least 0, got ${requests}`)
  if (requests === 0) return 0
  if (requests <= MASK_PARALLEL_THRESHOLD || specTokens > 0) return requests * (1 + specTokens) * perRowUs
  const tasks = divCeil(requests, MASK_TASK_REQUESTS)
  const waves = divCeil(tasks, MASK_POOL_THREADS)
  const lastTask = requests - MASK_TASK_REQUESTS * (tasks - 1)
  // Tasks are as long as each other but the last, so a thread's load is its count of full tasks. The last task sits alone in the
  // final wave when the tasks fill the pool plus one, and then the final wave is as long as that task alone.
  const inFinalWave = tasks - (waves - 1) * MASK_POOL_THREADS
  const rows = inFinalWave === 1 ? (waves - 1) * MASK_TASK_REQUESTS + lastTask : waves * MASK_TASK_REQUESTS
  return rows * perRowUs
}
