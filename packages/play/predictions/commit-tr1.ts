/**
 * TR1's predictions that are revealed at commit (D-067), where no run of Request path answers them: the question carries numbers of its
 * own, or asks for a fact about an engine's source. Each answer is computed from the question's own numbers, or read from the claim the
 * question is about, and takes no run. tests/play/predictions.test.ts holds each to the figure that tests/content/tr1-demos.ts computes.
 */
import { figure } from './figure'
import type { Commit } from './types'

/** nano-vllm's block, in tokens: the default of `Config.kvcache_block_size` (claim nano-vllm.block-size). */
const NANO_BLOCK_TOKENS = 256

/** nano-vllm's source, where its hit rule and its step shape live. */
const NANO = 'nano-vllm at bb823b3'

/**
 * The tokens that nano-vllm's model has to compute for a prompt whose first `shared` tokens match a sequence in the cache. A hit is a run of
 * whole blocks from the start, and it never covers the prompt's last block.
 */
function tokensToCompute(prompt: number, shared: number): { hits: number; computed: number } {
  const walkable = Math.ceil(prompt / NANO_BLOCK_TOKENS) - 1
  const hits = Math.min(Math.floor(shared / NANO_BLOCK_TOKENS), walkable)
  return { hits, computed: prompt - hits * NANO_BLOCK_TOKENS }
}

/** The statuses of vLLM's request that count as finished: the ones after PREEMPTED (claim vllm.request.finished-order). */
const FINISHED = ['FINISHED_STOPPED', 'FINISHED_LENGTH_CAPPED', 'FINISHED_ABORTED', 'FINISHED_IGNORED', 'FINISHED_ERROR', 'FINISHED_REPETITION'] as const

/** The lines of vLLM's scheduler at the post's commit and at the pin, counted by the lesson on the day it says [measured]. */
const SCHEDULER_LINES = { post: 1163, pin: 3783 } as const

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr1.l2.p1': {
    says: ['700-token prompt', 'first 600 tokens', 'blocks of 256 tokens'],
    working: [
      'A nano-vllm prefix hit is a run of whole blocks from the start of the prompt, and it never covers the last block.',
      `The shared 600 tokens fill ${tokensToCompute(700, 600).hits} whole blocks of ${NANO_BLOCK_TOKENS} tokens, which is ${figure(tokensToCompute(700, 600).hits * NANO_BLOCK_TOKENS)} tokens, and a prompt of 700 tokens has 3 blocks, so the third is never a hit.`,
      `The model computes 700 − ${figure(tokensToCompute(700, 600).hits * NANO_BLOCK_TOKENS)} = ${figure(tokensToCompute(700, 600).computed)} tokens.`,
    ],
    sources: [
      { claim: 'nano-vllm.block-size', text: `${NANO}, nanovllm/config.py, Config` },
      { claim: 'nano-vllm.last-block-uncached', text: `${NANO}, nanovllm/engine/block_manager.py, BlockManager.can_allocate` },
    ],
    tag: 'derived',
    truth: () => tokensToCompute(700, 600).computed,
  },
  'tr1.l2.p2': {
    says: ['Two sequences', 'prompt of 300 tokens'],
    working: [
      'nano-vllm admits waiting sequences first, and it schedules a decode step only when no prefill was scheduled, so a step is all prefill or all decode.',
      'The new prompt of 300 tokens is scheduled, and the 2 decoding sequences wait for the next step.',
      'The step runs 300 tokens.',
    ],
    sources: [{ claim: 'nano-vllm.step-shape', text: `${NANO}, nanovllm/engine/scheduler.py, Scheduler.schedule` }],
    tag: 'derived',
    truth: () => 300,
  },
  'tr1.l4.p2': {
    says: ['1,163 lines', 'v0.33.0'],
    working: [
      `The file has ${figure(SCHEDULER_LINES.pin)} lines at v0.33.0, counted on the day the lesson gives, and ${figure(SCHEDULER_LINES.post)} at the post's commit.`,
      `${figure(SCHEDULER_LINES.pin)} ÷ ${figure(SCHEDULER_LINES.post)} = ${figure(SCHEDULER_LINES.pin / SCHEDULER_LINES.post)}.`,
    ],
    sources: [{ text: 'vLLM at 42172ad and at v0.33.0, vllm/v1/core/sched/scheduler.py, lines counted by the lesson on 2026-11-05' }],
    tag: 'derived',
    truth: () => SCHEDULER_LINES.pin / SCHEDULER_LINES.post,
  },
  'tr1.l5.p2': {
    says: ['Two requests', 'prompt of 300 tokens'],
    working: [
      'vLLM serves the running requests first and the waiting requests after them, all out of one token budget.',
      'Each of the 2 running requests takes 1 token, and the new prompt takes its 300 tokens, because the budget is large enough.',
      `The next step runs 2 + 300 = ${figure(302)} tokens.`,
    ],
    sources: [{ claim: 'vllm.scheduler.order', text: 'vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule' }],
    tag: 'derived',
    truth: () => 2 + 300,
  },
  'tr1.l5.p3': {
    says: ['twelve statuses', 'finished'],
    working: [
      'A status counts as finished when it is greater than PREEMPTED, so the statuses that begin FINISHED_ are the last of the enum.',
      `There are ${FINISHED.length}: ${FINISHED.join(', ')}.`,
    ],
    sources: [{ claim: 'vllm.request.finished-order', text: 'vLLM v0.33.0, vllm/v1/request.py, RequestStatus' }],
    tag: 'measured',
    truth: () => FINISHED.length,
  },
  'tr1.l7.p2': {
    says: ['SGLang', 'abort', 'forward passes'],
    working: [
      "An abort that reaches SGLang's scheduler while a request is running does not free it at once.",
      "The scheduler sets the request's to_finish, the request runs one more forward pass, and the existing finishing code then cleans up its KV allocation.",
      'The request runs 1 more forward pass.',
    ],
    sources: [{ claim: 'sglang.abort.running-request', text: 'SGLang v0.5.23, srt/managers/scheduler.py, Scheduler.abort_request' }],
    tag: 'measured',
    truth: () => 1,
  },
}
