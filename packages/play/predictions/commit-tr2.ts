/**
 * TR2's predictions that are revealed at commit (D-067): the question carries numbers of its own, round and made up, that no level of the
 * step loop holds, or its lesson has no game. Each answer is the step-loop model's rule on those numbers, and takes no run.
 * tests/play/predictions.test.ts holds each to the figure that tests/content/tr2-demos.ts computes.
 */
import { paddedSize, SMALL_CARD } from '@es/sim/steploop'
import { figure } from './figure'
import type { Commit } from './types'

/** The CPU's work that stays on the critical path with async scheduling on: the plan and the read, less the forward they hide behind. */
const exposed = (plan: number, read: number, forward: number): number => Math.max(0, plan + read - forward)

/** The rows that a batch wastes when it is padded up to the next size of a list. */
function wasted(sizes: readonly number[], rows: number): number {
  const padded = paddedSize(sizes, rows)
  if (padded === null) throw new RangeError(`a batch of ${rows} rows is larger than every size of the list`)
  return padded - rows
}

/** The question's bytes of one token of KV cache, which the lesson's small model has. */
const KV_BYTES_PER_TOKEN = SMALL_CARD.spec.model.kvBytesPerToken

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr2.l2.p1': {
    says: ['2,048 tokens', '100 requests', '3,000 tokens', 'chunked prefill'],
    working: [
      'The scheduler gives a waiting request the smaller of the tokens it still needs and the budget that is left, which is what cuts a long prompt into chunks.',
      `The 100 decoding requests take 100 tokens of the budget of ${figure(2048)} tokens, and ${figure(2048 - 100)} tokens are left, which is less than the ${figure(3000)} the prompt needs.`,
      `The first step that carries the prompt takes ${figure(2048)} − 100 = ${figure(2048 - 100)} tokens of it.`,
    ],
    sources: [{ claim: 'vllm.scheduler.chunk-to-budget', text: 'vLLM v0.33.0, vllm/v1/core/sched/scheduler.py, Scheduler.schedule (a waiting request)' }],
    tag: 'derived',
    truth: () => 2048 - 100,
  },
  'tr2.l3.p1': {
    says: ['1,000 µs', '500 µs', '1,200 µs', 'Async scheduling is on'],
    working: [
      "With async scheduling on, the CPU's work for the next step runs while this step's forward runs.",
      `The CPU's work is ${figure(1000)} + ${figure(500)} = ${figure(1500)} µs, and the forward hides ${figure(1200)} µs of it.`,
      `What stays on the critical path is ${figure(1500)} − ${figure(1200)} = ${figure(exposed(1000, 500, 1200))} µs.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => exposed(1000, 500, 1200),
  },
  'tr2.l6.p2': {
    says: ['0.96 GB', '114,688 bytes'],
    working: [
      `The graphs' estimate is 0.96 GB, which is 960,000,000 bytes, and one token of KV cache takes ${figure(KV_BYTES_PER_TOKEN)} bytes.`,
      `960,000,000 ÷ ${figure(KV_BYTES_PER_TOKEN)} = ${figure(960_000_000 / KV_BYTES_PER_TOKEN)} tokens of KV cache.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => 960_000_000 / KV_BYTES_PER_TOKEN,
  },
  'tr2.l7.p1': {
    says: ['8, 16 and 24', '8, 12, 16 and 24', '10 rows'],
    working: [
      "A batch is padded up to the next size in the engine's list.",
      `vLLM's list has 16 after 8, so the batch of 10 rows is padded to 16 and wastes ${wasted([8, 16, 24], 10)} rows.`,
      `SGLang's list has 12 after 8, so the same batch is padded to 12 and wastes ${wasted([8, 12, 16, 24], 10)} rows.`,
      `SGLang wastes ${wasted([8, 16, 24], 10)} − ${wasted([8, 12, 16, 24], 10)} = ${wasted([8, 16, 24], 10) - wasted([8, 12, 16, 24], 10)} fewer rows.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => wasted([8, 16, 24], 10) - wasted([8, 12, 16, 24], 10),
  },
}
