/*
 * The worked numbers of TR6's lessons (W1-T30), computed from the course's own models, so that a number a lesson prints is one this file
 * recomputes. `tests/content/tr6-module.test.ts` holds each lesson's text to these functions, and when a model moves a number, the test
 * names the lesson and the figure that went stale.
 *
 * Every scene is synthetic (D-012), and the numbers a model gives are [measured] by running it: a lesson says on what day and at which commit.
 * The worlds are the course's own: the speculation sampler of `packages/sim/spec` (the exact accept-and-recover rule, in integer weights,
 * the acceptance-length model and the lab's chi-square check), The Tasting's exact arithmetic (`packages/play/verifier`, in rationals), and
 * the step loop's grammar mask (`packages/sim/steploop`). Nothing here draws with Math.log, Math.exp or Math.pow.
 */
import { compare, ratio } from '../../packages/play/verifier/ratio'
import type { Ratio } from '../../packages/play/verifier/ratio'
import { alphaExact, caseOutput, caseTv, excessWeights, outputExact, tvExact, wrongRules } from '../../packages/play/verifier/exact'
import { roundCost, speedupOf, tokensPerRound } from '../../packages/play/verifier/gamma'
import type { Dist } from '../../packages/sim/spec'
import {
  acceptStepViolations,
  BESTIARY,
  chiSquare,
  criticalValue,
  drawCase,
  expectedTokensPerRound,
  FINE_BAND,
  flatPosition,
  labTest,
  LAB_DRAWS,
  LAB_SEEDS,
  overlapWeight,
  REFERENCE,
  SPARSE_BAND,
  SPEC_BAND,
} from '../../packages/sim/spec'
import type { Member, PairBand } from '../../packages/sim/spec'
import { defaultCaptureSizes, paddedSize, runStepLoop, TICK_CARD } from '../../packages/sim/steploop'
import type { Span } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import { maskModel } from '../../packages/play/items/families/tr6/mask-fits'
import { outcomeOf } from '../../packages/play/items/families/tr6/which-runner'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Decimals, by integers                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A non-negative ratio to `digits` decimals with halves rounded up, by integers, as a lesson writes it: 1.825 is `1.83` whatever the nearest
 * double says (a double that holds 1.825 is a hair under it, and `toFixed` would write `1.82`).
 */
export function fixed(r: Ratio, digits: number): string {
  if (r.num < 0n) throw new RangeError('fixed writes a non-negative ratio')
  const scale = 10n ** BigInt(digits)
  const rounded = ((2n * r.num * scale + r.den) / (2n * r.den)).toString().padStart(digits + 1, '0')
  return digits === 0 ? rounded : `${rounded.slice(0, -digits)}.${rounded.slice(-digits)}`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: the round, and its economics                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The tokens a round emits on average when every draft is accepted with probability `alphaPermille` ÷ 1,000: 1 + α + … + α^γ. */
export const tokensPerRoundAt = (alphaPermille: number, gamma: number): number => expectedTokensPerRound(alphaPermille, gamma)

/** The grid of lesson 1's table: α in permille down the side, γ along the top. */
export const ROUND_ALPHAS = [500, 700, 900] as const
export const ROUND_GAMMAS = [1, 2, 4, 8] as const

/** What a draft costs, as a share of one target step, and the acceptance of lesson 1's economics table [estimated]. */
export const ECONOMICS = { alphaPermille: 700, costPermille: 100 } as const

/** The speedup E(γ) ÷ (1 + γc) at γ = 1 to 8, in the game's own exact arithmetic, as numbers; and the best draft length. */
export function economics(): { rows: { gamma: number; tokens: number; speedup: number }[]; best: number } {
  const alphas = Array.from({ length: 8 }, () => ECONOMICS.alphaPermille)
  const rows = Array.from({ length: 8 }, (_, i) => {
    const gamma = i + 1
    const tokens = tokensPerRound(alphas, gamma)
    const speedup = speedupOf(alphas, ECONOMICS.costPermille, gamma)
    return { gamma, tokens: Number(tokens.num) / Number(tokens.den), speedup: Number(speedup.num) / Number(speedup.den) }
  })
  const best = rows.reduce((top, row) => (row.speedup > top.speedup ? row : top), rows[0]).gamma
  return { rows, best }
}

/** The tokens a round emits at one acceptance in every position, exactly: 1 + α + … + α^γ as a ratio. */
export const tokensExact = (alphaPermille: number, gamma: number): Ratio => tokensPerRound(Array.from({ length: Math.max(1, gamma) }, () => alphaPermille), gamma)

/** The rows of lesson 1's economics table, exactly: tokens, cost in target steps, and speedup, for γ = 1 to 8. */
export function economicsRows(): { gamma: number; tokens: Ratio; cost: Ratio; speedup: Ratio }[] {
  const alphas = Array.from({ length: 8 }, () => ECONOMICS.alphaPermille)
  return Array.from({ length: 8 }, (_, i) => {
    const gamma = i + 1
    return { gamma, tokens: tokensPerRound(alphas, gamma), cost: roundCost(ECONOMICS.costPermille, gamma), speedup: speedupOf(alphas, ECONOMICS.costPermille, gamma) }
  })
}

/** The padding example of lesson 1: a step of `decodes` requests with `drafts` each, and the captured size it is padded to. */
export function paddingExample(decodes = 5, drafts = 3): { tokens: number; padded: number; wasted: number } {
  const tokens = decodes * (1 + drafts)
  const sizes = defaultCaptureSizes(512)
  const padded = paddedSize(sizes, tokens) ?? tokens
  return { tokens, padded, wasted: padded - tokens }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: the rule, on a pair of three tokens                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The pair of lesson 2's table: three dishes, in tenths. p is the target, q the draft. */
export const PAIR: { readonly p: Dist; readonly q: Dist } = { p: { weights: [5, 3, 2], total: 10 }, q: { weights: [2, 5, 3], total: 10 } }

const fraction = (r: Ratio): number => Number(r.num) / Number(r.den)

/** The same table, exactly: each token's share as a ratio, and the distance from p as a ratio. */
export function rulesTableExact(): { id: string; out: Ratio[]; tv: Ratio }[] {
  const { p, q } = PAIR
  const exact = outputExact(p, q, 'min-ratio', { kind: 'excess' })
  return [
    { id: 'exact', out: exact, tv: tvExact(exact, p) },
    ...wrongRules(p, q).map((rule) => ({ id: rule.id, out: caseOutput(rule, p, q), tv: caseTv(rule, p, q) })),
  ]
}

/** Each token's share of what a round puts out, under the exact rule and under each plausible wrong rule, and the total-variation distance from p. */
export function rulesTable(): { id: string; out: number[]; tv: number }[] {
  const { p, q } = PAIR
  const exact = outputExact(p, q, 'min-ratio', { kind: 'excess' })
  return [
    { id: 'exact', out: exact.map(fraction), tv: fraction(tvExact(exact, p)) },
    ...wrongRules(p, q).map((rule) => ({ id: rule.id, out: caseOutput(rule, p, q).map(fraction), tv: fraction(caseTv(rule, p, q)) })),
  ]
}

/** α, the overlap Σ min(p, q), and the residual's weights. */
export function pairFacts(): { alpha: number; overlap: number[]; residual: number[]; rejected: number } {
  const { p, q } = PAIR
  const overlap = p.weights.map((w, x) => Math.min(w, q.weights[x]))
  return { alpha: fraction(alphaExact(p, q)), overlap, residual: excessWeights(p, q), rejected: 1 - fraction(alphaExact(p, q)) }
}

/** The pair's token-by-token sum of what is kept and what the residual re-plates, which is p. */
export function kept(): number[] {
  const { p, q } = PAIR
  return p.weights.map((w, x) => Math.min(w, q.weights[x]) / p.total)
}

export { ratio, compare }

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: which check sees which sampler                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The band and the draft length that a member is judged on: where it differs from the exact sampler on every case (tests/sim/spec-rates.test.ts). */
const BAND_OF: Readonly<Record<string, { band: PairBand; gamma: number; fair?: (p: readonly Dist[]) => boolean }>> = {
  'accept-if-p-over-q': { band: SPEC_BAND, gamma: 1 },
  'resample-from-p': { band: SPEC_BAND, gamma: 1 },
  'resample-from-q': { band: SPEC_BAND, gamma: 1 },
  'residual-off-by-one': { band: SPEC_BAND, gamma: 1 },
  'fly-lossy': { band: SPEC_BAND, gamma: 2, fair: (p) => flatPosition(p[0]) },
  'boundary-inclusive': { band: SPARSE_BAND, gamma: 1 },
}

export interface Detection {
  readonly id: string
  readonly trials: number
  readonly chi: number
  readonly enumeration: number
}

/** The seeds of the trial `base + i`, as the rates test draws them. */
const seedsOf = (n: number): [number, number] => [n * 2 + 1, n * 2 + 2]

/**
 * How many of `trials` fair cases the lab's two checks catch a member in: the chi-square check on two seeds of 20,000 draws at 1e-4, and the
 * exhaustive look at every coin of the accept step. The trials are the first `trials` fair cases of the member's band from seed 1,000,000.
 */
export function detection(member: Member, trials: number, band?: PairBand, gamma?: number): Detection {
  const spec = BAND_OF[member.id] ?? { band: SPEC_BAND, gamma: 1 }
  const chosen = band ?? spec.band
  const length = gamma ?? spec.gamma
  let chi = 0
  let enumeration = 0
  let n = 0
  for (let i = 0; n < trials; i += 1) {
    const { p, q } = drawCase(1_000_000 + i, length, chosen)
    if (spec.fair !== undefined && band === undefined && !spec.fair(p)) continue
    n += 1
    if (labTest(seedsOf(1_000_000 + i), p, q, member.verify).rejected) chi += 1
    if (acceptStepViolations(member.accept, p[0], q[0]).length > 0) enumeration += 1
  }
  return { id: member.id, trials, chi, enumeration }
}

export const BESTIARY_IDS = BESTIARY.map((member) => member.id)

/** The detection of every member of the bestiary on its own band, and of the exact sampler for the false-fail count. */
export function detections(trials: number): Detection[] {
  return BESTIARY.map((member) => detection(member, trials))
}

export { overlapWeight }

/** The control row of lesson 3's table: the exact sampler on the Verifier's band, which neither check may flag. */
export function referenceDetection(trials: number): Detection {
  return detection(REFERENCE, trials)
}

/** One row of lesson 3's second table: the boundary-inclusive member on one band. */
export interface LeakRow {
  readonly trials: number
  /** Trials whose target rules out a token that the draft proposes (weight 0 in p, above 0 in q): the only trials in which the member can leak. */
  readonly leakable: number
  readonly chi: number
  readonly enumeration: number
  /** The chi-square rejections, and the enumeration's flags, in the trials with no such token. */
  readonly chiWithoutLeak: number
  readonly enumerationWithoutLeak: number
  /** The mean number of such tokens in a leakable trial. */
  readonly forbiddenPerLeakable: number
}

/** The boundary-inclusive member's chi-square and enumeration counts on one band, with the trials split by whether a token could leak. */
export function leakRow(band: PairBand, trials: number): LeakRow {
  const member = BESTIARY.find((m) => m.id === 'boundary-inclusive')
  if (member === undefined) throw new Error('the bestiary has no boundary-inclusive member')
  let leakable = 0
  let chi = 0
  let enumeration = 0
  let chiWithoutLeak = 0
  let enumerationWithoutLeak = 0
  let forbidden = 0
  for (let i = 0; i < trials; i += 1) {
    const { p, q } = drawCase(1_000_000 + i, 1, band)
    const ruledOut = p[0].weights.filter((w, x) => w === 0 && q[0].weights[x] > 0).length
    const rejected = labTest(seedsOf(1_000_000 + i), p, q, member.verify).rejected
    const flagged = acceptStepViolations(member.accept, p[0], q[0]).length > 0
    if (ruledOut > 0) {
      leakable += 1
      forbidden += ruledOut
    }
    if (rejected) chi += 1
    if (flagged) enumeration += 1
    if (ruledOut === 0 && rejected) chiWithoutLeak += 1
    if (ruledOut === 0 && flagged) enumerationWithoutLeak += 1
  }
  return { trials, leakable, chi, enumeration, chiWithoutLeak, enumerationWithoutLeak, forbiddenPerLeakable: leakable === 0 ? 0 : forbidden / leakable }
}

/** The three rows of lesson 3's second table: The Tasting's band, the sparse band and the fine band. */
export function leakRows(trials: number): { dense: LeakRow; sparse: LeakRow; fine: LeakRow } {
  return { dense: leakRow(SPEC_BAND, trials), sparse: leakRow(SPARSE_BAND, trials), fine: leakRow(FINE_BAND, trials) }
}

/**
 * The pooling example of lesson 3: 1,000 draws on a target of nine tokens with these weights in a thousand. Run through the sim's
 * `chiSquare` with counts equal to the expected counts, so that the bins and the degrees of freedom are the ones the lab's check uses.
 */
export const POOL_EXAMPLE = { draws: 1000, weights: [450, 300, 200, 40, 4, 3, 2, 1, 0] } as const
export function poolExample(): { df: number; bins: number; pooledTokens: number; pooledExpected: number; ruledOut: number } {
  const { draws, weights } = POOL_EXAMPLE
  const counts = weights.map((w) => (draws * w) / 1000)
  const { df } = chiSquare(counts, { weights: [...weights], total: 1000 })
  const small = weights.filter((w) => w > 0 && (draws * w) / 1000 < 5)
  return { df, bins: df + 1, pooledTokens: small.length, pooledExpected: small.reduce<number>((a, w) => a + (draws * w) / 1000, 0), ruledOut: weights.filter((w) => w === 0).length }
}

/** The lab's level and the false-fail it implies: `1 − (1 − 1e-4)^2` for two seeds, as parts in 10,000 (by repeated products, so no pow). */
export function labFalseFailPer10k(): { seeds: number; level: number; per10k: number; df5Critical: number; df5Threshold: number } {
  const level = 1 / 10_000
  let pass = 1
  for (let s = 0; s < LAB_SEEDS; s += 1) pass *= 1 - level
  const df = 5
  return { seeds: LAB_SEEDS, level, per10k: (1 - pass) * 10_000, df5Critical: criticalValue('1e-4', df), df5Threshold: df + 10 * Math.sqrt(2 * df) }
}

/** The noise example of lesson 3: a token of probability 0.25 over the lab's draws, and a bias of one coin in 65,536. */
export function noiseExample(permille = 250, draws = LAB_DRAWS): { sePpm: number; biasPpm: number; ratio: number; millions: number; labMultiple: number; scaling: number } {
  const sePpm = Math.sqrt((permille * (1000 - permille)) / draws) * 1000 // √(p(1−p)/N) in ppm, with p(1−p) = permille · (1000 − permille) ÷ 10^6
  const biasPpm = 1_000_000 / 65_536
  // N = p(1 − p) ÷ δ² with δ = 1 ÷ 65,536: p(1 − p) · 65,536², in millions.
  const millions = (permille * (1000 - permille) * 65_536 * 65_536) / 1_000_000 / 1_000_000
  return { sePpm, biasPpm, ratio: sePpm / biasPpm, millions, labMultiple: (millions * 1_000_000) / draws, scaling: Math.sqrt(100) }
}

/** The chance that two seeds of the lab's draws show one leak that happens once in 65,536 rounds: `1 − e^(−2 · 20,000 ÷ 65,536)`, by a series (no exp). */
export function leakShownByTwoSeeds(): { expected: number; shown: number; perSeed: number } {
  const expected = (LAB_SEEDS * LAB_DRAWS) / 65_536
  // e^(−x) by its series to 20 terms: plenty for x < 1.
  let term = 1
  let sum = 1
  for (let k = 1; k < 20; k += 1) {
    term *= -expected / k
    sum += term
  }
  return { expected, shown: 1 - sum, perSeed: LAB_DRAWS / 65_536 }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 5: the mask against the forward                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A scene of the mask timeline: the step's phases and the grammar's weight, in µs [estimated]. The forward is 500 µs, the plan 100, the read 60. */
export const MASK_SCENE = { plan: 100, read: 60, forward: 500, requests: 12 } as const

export type TimelineMode = 'overlap' | 'serial' | 'async'

export interface Timeline {
  readonly mode: TimelineMode
  readonly rowUs: number
  readonly fillUs: number
  /** The GPU's idle time between two forwards, in a steady state. */
  readonly gapUs: number
  /** The same step with no grammar. */
  readonly freeUs: number
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
}

/** Runs the step loop on `MASK_SCENE` with a grammar of `rowUs` a row and `drafts` speculative tokens a request, and reads three steps of its steady state. */
export function timeline(mode: TimelineMode, rowUs: number, drafts = 0): Timeline {
  const run = (structured: boolean) => {
    const card = { ...TICK_CARD, scheduleBaseUs: MASK_SCENE.plan, syncUs: MASK_SCENE.read, forwardUs: MASK_SCENE.forward, admitUs: 0, maskPerSeqUs: rowUs }
    const workload = genWorkload(5, {
      requests: MASK_SCENE.requests,
      arrivals: { kind: 'burst' },
      lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 1 }, output: { kind: 'uniform', lo: 30, hi: 30 } },
      ...(structured ? { structuredPermille: 1000 } : {}),
    })
    return runStepLoop(
      workload,
      {
        maxNumSeqs: MASK_SCENE.requests,
        maxBatchedTokens: 1_000_000,
        chunkedPrefill: true,
        asyncScheduling: mode === 'async',
        inputIds: 'device',
        graphs: { mode: 'NONE', captureSizes: [] },
        ...(structured ? { structured: { overlap: mode !== 'serial' } } : {}),
        // Drafts that are never accepted: every step carries 1 + k rows for each request, and the forward is the scene's.
        ...(drafts > 0 ? { runner: 'mrv2' as const, spec: { k: drafts, alphaPermille: 0, draftCostPermille: 0 } } : {}),
      },
      card,
      card,
      { horizonUs: 1_000_000_000 },
    )
  }
  const median = (xs: number[]): number => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const withMask = run(true)
  const free = run(false)
  const steady = (r: ReturnType<typeof run>): number => median(r.steps.slice(6, 20).map((step) => step.bubbleUs))
  return {
    mode,
    rowUs,
    fillUs: MASK_SCENE.requests * (1 + drafts) * rowUs,
    gapUs: steady(withMask),
    freeUs: steady(free),
    cpu: withMask.lanes['cpu-main'].filter((span) => span.step >= 6 && span.step <= 8),
    gpu: withMask.lanes['gpu-stream'].filter((span) => span.step >= 6 && span.step <= 8),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: the runner of a configuration                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The configurations of lesson 4's table, with the runner and the async setting the engine ends up with (claims vllm.mrv2.fallback-reasons, vllm.async-scheduling.mrv1-limits). */
export const RUNNER_ROWS = [
  { text: '`eagle3`, nothing else set', config: { method: 'eagle3', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' } },
  { text: '`ngram`, nothing else set', config: { method: 'ngram', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' } },
  { text: '`suffix`, nothing else set', config: { method: 'suffix', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' } },
  { text: '`suffix`, async scheduling requested', config: { method: 'suffix', parallelDrafting: false, heterogeneousVocab: false, async: 'on' } },
  { text: '`custom_class`, nothing else set', config: { method: 'custom_class', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' } },
  { text: '`draft_model` with a vocabulary of its own', config: { method: 'draft_model', parallelDrafting: false, heterogeneousVocab: true, async: 'unset' } },
] as const

/** What a configuration ends up as, in the words of lesson 4's table: the runner, then the async setting. */
export function runnerCells(config: (typeof RUNNER_ROWS)[number]['config']): [string, string] {
  switch (outcomeOf(config)) {
    case 'mrv2':
      return ['MRV2', 'on']
    case 'mrv2-off':
      return ['MRV2', 'off']
    case 'v1-on':
      return ['MRV1', 'on']
    case 'v1-off':
      return ['MRV1', 'off, with one warning']
    case 'refused':
      return ['the engine refuses to start', 'not applicable']
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface NumericPrediction {
  readonly kind: 'numeric'
  readonly unit: string
  readonly reference: () => number
}

export interface ChoicePrediction {
  readonly kind: 'choice'
  readonly options: readonly string[]
  readonly reference: () => string
}

/**
 * What each lesson's prediction is worth, computed from the course's own models: the reveal's reference answer, which no content file stores
 * (A§1, I3). None of TR6's five has a run to read it from (the questions carry numbers of their own that no level of The Tasting or of the
 * allergy card holds), so the lesson's box says that its reveal waits for W2-T43 (packages/play/predictions/plan.ts), and these figures are
 * what that task starts from.
 */
export const PREDICTIONS: Readonly<Record<string, NumericPrediction | ChoicePrediction>> = {
  // Each draft kept with probability 0.8, three drafts: 1 + 0.8 + 0.64 + 0.512.
  'tr6.l1.p1': { kind: 'numeric', unit: 'tokens', reference: () => tokensPerRoundAt(800, 3) },
  // p = 0.6, 0.3, 0.1 and q = 0.2, 0.3, 0.5: the overlap, which is the chance that the draft is kept.
  'tr6.l2.p1': { kind: 'numeric', unit: 'probability', reference: () => fraction(alphaExact({ weights: [600, 300, 100], total: 1000 }, { weights: [200, 300, 500], total: 1000 })) },
  // A bias of one coin in 65,536 equals the standard error of a token of 0.25 after this many draws, in millions.
  'tr6.l3.p1': { kind: 'numeric', unit: 'Mdraws', reference: () => noiseExample().millions },
  'tr6.l4.p1': {
    kind: 'choice',
    options: ['mrv2-on', 'mrv1-on', 'mrv1-off', 'refused'],
    reference: () => ({ mrv2: 'mrv2-on', 'mrv2-off': 'mrv2-off', 'v1-on': 'mrv1-on', 'v1-off': 'mrv1-off', refused: 'refused' })[outcomeOf({ method: 'custom_class', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' })],
  },
  // The plain step, fill overlapped: 100 + 60 + max(0, 12 × 60 − 500), read off the step loop and not from the formula.
  'tr6.l5.p1': { kind: 'numeric', unit: 'us', reference: () => timeline('overlap', 60).gapUs },
}

/** The formula of the same prediction, to hold the sim to. */
export const formulaGap = (mode: TimelineMode, rowUs: number, drafts = 0): number =>
  maskModel.gap(mode, MASK_SCENE.plan, MASK_SCENE.read, MASK_SCENE.forward, maskModel.fill(maskModel.rows(MASK_SCENE.requests, drafts), rowUs))
