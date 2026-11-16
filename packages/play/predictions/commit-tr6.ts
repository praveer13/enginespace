/**
 * TR6's predictions that are revealed at commit (D-067): each question carries a rate, three distributions, a count or a configuration of its
 * own, or asks which runner serves a method (a rule of the engine's configuration). Each answer is the course's own model on those numbers,
 * or read from the claims of the rule, and takes no run. tests/play/predictions.test.ts holds each to the figure that tests/content/tr6-demos.ts computes.
 */
import { outcomeOf } from '../items/families/tr6/which-runner'
import { maskModel } from '../items/families/tr6/mask-fits'
import { alphaExact } from '../verifier/exact'
import { expectedTokensPerRound } from '@es/sim/spec'
import { figure } from './figure'
import type { Commit } from './types'

/** The probability that the sampler keeps the draft's token: the overlap of the two distributions, which is the sum of the smaller weight of each token. */
function acceptance(target: readonly number[], draft: readonly number[]): { overlap: number[]; alpha: number } {
  const total = 1000
  const overlap = target.map((weight, i) => Math.min(weight, draft[i]))
  const kept = alphaExact({ weights: [...target], total }, { weights: [...draft], total })
  return { overlap, alpha: Number(kept.num) / Number(kept.den) }
}

/** The draws after which the standard error of a token's frequency is no bigger than a bias of one coin in 65,536, in millions. */
const drawsToSeeBias = (permille: number): number => (permille * (1000 - permille) * 65_536 * 65_536) / 1_000_000 / 1_000_000

/** The idle time of a plain step with the grammar's fill overlapped with the forward. */
const fillGap = (plan: number, read: number, forward: number, requests: number, rowUs: number): number =>
  maskModel.gap('overlap', plan, read, forward, maskModel.fill(maskModel.rows(requests, 0), rowUs))

/** The runner and the async state of a custom proposer on vLLM's defaults, as the lesson's options name them. */
const RUNNER_OPTION = { mrv2: 'mrv2-on', 'mrv2-off': 'mrv2-off', 'v1-on': 'mrv1-on', 'v1-off': 'mrv1-off', refused: 'refused' } as const

export const COMMITS: Readonly<Record<string, Commit>> = {
  'tr6.l1.p1': {
    says: ['probability 0.8', 'three tokens', 'extra token'],
    working: [
      'A draft is kept only if every draft before it was kept, so the first is kept with probability 0.8, the second with 0.8 × 0.8 = 0.64 and the third with 0.8 × 0.8 × 0.8 = 0.512.',
      'The round always emits 1 token more, the one it samples itself.',
      `The round emits 1 + 0.8 + 0.64 + 0.512 = ${figure(expectedTokensPerRound(800, 3))} tokens on average.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => expectedTokensPerRound(800, 3),
  },
  'tr6.l2.p1': {
    says: ['0.6, 0.3 and 0.1', '0.2, 0.3 and 0.5'],
    working: [
      'The sampler accepts a drafted token with probability the smaller of the target\'s and the draft\'s for that token, so the chance of acceptance is the overlap of the two distributions.',
      `The smaller weights are ${acceptance([600, 300, 100], [200, 300, 500]).overlap.map((w) => w / 1000).join(', ')}, and they add up to ${figure(acceptance([600, 300, 100], [200, 300, 500]).alpha)}.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => acceptance([600, 300, 100], [200, 300, 500]).alpha,
  },
  'tr6.l3.p1': {
    says: ['probability 0.25', '3,062 parts per million', 'one part in 65,536'],
    working: [
      'The standard error of a frequency is the square root of p × (1 − p) ÷ N, and the bug moves it by 1 ÷ 65,536.',
      'Setting them equal gives N = p × (1 − p) × 65,536², and p × (1 − p) = 0.25 × 0.75 = 0.1875.',
      `N = 0.1875 × 4,294,967,296, which is ${figure(drawsToSeeBias(250))} million draws.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => drawsToSeeBias(250),
  },
  'tr6.l4.p1': {
    says: ['custom_class', 'vLLM v0.33.0', 'async scheduling'],
    working: [
      'At v0.33.0 the methods suffix and custom_class send a configuration back from MRV2 to the legacy runner, MRV1, so a custom proposer runs on MRV1.',
      'On MRV1, async scheduling works with only some methods: the EAGLE family, n-gram on the GPU, a draft model, DSpark and DFlash. Left to its default with another method, it turns itself off with one warning.',
      'So a custom proposer runs on MRV1, with async scheduling off.',
    ],
    sources: [
      { claim: 'vllm.mrv2.fallback-reasons', text: 'vLLM v0.33.0, vllm/config/vllm.py, _get_v2_model_runner_unsupported_features' },
      { claim: 'vllm.async-scheduling.mrv1-limits', text: 'vLLM v0.33.0, vllm/config/vllm.py (async scheduling checks, L1651-L1719)' },
    ],
    tag: 'measured',
    truth: () => RUNNER_OPTION[outcomeOf({ method: 'custom_class', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' })],
  },
  'tr6.l5.p1': {
    says: ['async scheduling off', '100 µs', '60 µs', '500 µs', '12 structured requests'],
    working: [
      'With async scheduling off, the plan and the read are idle time between two forwards, and the grammar mask is built while the forward runs, so only the part of the fill that outlasts the forward is idle too.',
      `The fill is 12 × 60 = ${figure(12 * 60)} µs, and the forward of 500 µs hides ${figure(500)} of it, so ${figure(Math.max(0, 12 * 60 - 500))} µs are left.`,
      `The GPU idles 100 + 60 + ${figure(Math.max(0, 12 * 60 - 500))} = ${figure(fillGap(100, 60, 500, 12, 60))} µs between two forwards.`,
    ],
    sources: [],
    tag: 'derived',
    truth: () => fillGap(100, 60, 500, 12, 60),
  },
}
