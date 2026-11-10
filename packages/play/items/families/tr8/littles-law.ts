/**
 * `tr8.littles-law`: Little's law as a check on a benchmark log (TR8, lesson 4; KC `tr8.littles-law`). On a stretch of a log where the server
 * is steady, the mean number of requests in flight equals the rate at which requests finish times the mean time each takes (claim
 * bench.littles-law: L = λW). A log that breaks it is wrong somewhere, and the course holds a run to it within 5% (ASSESSMENT B10) [estimated].
 *
 * The world is the course's own, and every number in it is synthetic. The law is arithmetic on three numbers of a log, and the tests hold it
 * to the benchmark generator's own: `littlesLaw` (packages/sim/bench/stats.ts) on logs the generator and the tests build, for the identity
 * on a steady stretch, for the residual, and for which way a failing log fails.
 *
 * What the variants ask:
 *   in-flight   how many requests are in flight on average, from the rate and the mean latency (levels 0 to 3);
 *   solve-for   the mean latency, or the rate, from the other two numbers and the number in flight, the unknown drawn by the seed (levels 0 to 3);
 *   check       whether a log agrees with itself, drawn answer first over three verdicts: it agrees, it has more requests in flight than
 *               rate × latency accounts for, or fewer. The residual is the gap over the log's own count, `|L − λW| ÷ L`, as the benchmark
 *               generator's `residualPermille` has it, and the log agrees when it is at most 5% [estimated] (levels 0 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown (the law in words), at
 * level 2 the learner is alone with the numbers, and level 3 changes the surface: a log is written in totals and not in rates (so many
 * requests finished in a stretch of so many seconds, each taking so many milliseconds), which is how a log is read in practice.
 *
 * Why a log fails. The sums behind the law (the generator's `littlesLaw`) count a request's whole time in the system for the completions and
 * only the part inside the stretch for the number in flight. A stretch that ends with requests still waiting leaves them in the count in
 * flight and out of the completions' latencies, so the count is higher than rate × latency; a stretch that begins on a backlog that is
 * draining does the opposite, since a request sent before the stretch adds its whole latency to the completions and only its inside part to
 * the count. A latency counted from the due time against a count in flight from the send fails the same way as the second. The check does not
 * say which of the log and the run is at fault, only that one is (lesson 4).
 */
import { divRound } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, drawOutcome, oneOf, shown, workedPart } from '../tr6/kit'

const FAMILY = 'tr8.littles-law'
const VERSION = 1
const KC = 'tr8.littles-law'

type VariantId = 'in-flight' | 'solve-for' | 'check'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'in-flight', title: 'Requests in flight, from the rate and the latency', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'solve-for', title: 'The latency or the rate, from the other two', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'check', title: 'Whether a log agrees with itself', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The law                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The course allows a log 5% between the two sides of the law (ASSESSMENT B10) [estimated], as a residual out of 1,000. */
export const TOLERANCE_PERMILLE = 50

/** The three verdicts on a log. */
export const VERDICTS = ['agrees', 'more-in-flight', 'fewer-in-flight'] as const
export type Verdict = (typeof VERDICTS)[number]

/**
 * Little's law on a steady stretch, in the units a log is written in: the rate in requests a second and the latency in ms. Quantities that
 * are not whole are held in hundredths of a request (`inFlight100`), so the check compares integers and never floats.
 */
export const littlesModel = {
  /** λW in hundredths of a request: the rate times the latency in ms, over ten. Exact when the latency is a multiple of 10 ms. */
  inFlight100: (ratePerS: number, latencyMs: number): number => divRound(ratePerS * latencyMs, 10),
  /** L = λW, in requests. */
  inFlight: (ratePerS: number, latencyMs: number): number => littlesModel.inFlight100(ratePerS, latencyMs) / 100,
  /** The mean latency in ms that goes with a number in flight and a rate: W = L ÷ λ. */
  latencyMs: (inFlight: number, ratePerS: number): number => (inFlight * 1000) / ratePerS,
  /** The rate that goes with a number in flight and a mean latency in ms: λ = L ÷ W. */
  ratePerS: (inFlight: number, latencyMs: number): number => (inFlight * 1000) / latencyMs,
  /** The residual of a log, out of 1,000: the gap between L and λW over L, rounded as the generator's `residualPermille` is. */
  residualPermille: (inFlight100: number, expected100: number): number => (inFlight100 === 0 ? 0 : divRound(Math.abs(inFlight100 - expected100) * 1000, inFlight100)),
  /** What a log says of itself: it agrees within the tolerance, or it counts more requests in flight than λW, or fewer. */
  verdict(inFlight100: number, expected100: number): Verdict {
    if (littlesModel.residualPermille(inFlight100, expected100) <= TOLERANCE_PERMILLE) return 'agrees'
    return inFlight100 > expected100 ? 'more-in-flight' : 'fewer-in-flight'
  },
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const RATES = [3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 32, 40, 48, 50] as const
const LATENCIES_MS = [250, 400, 500, 600, 800, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000] as const
/** The stretch of a log that level 3 writes in totals, in seconds. */
const STRETCHES_S = [30, 60, 90, 120] as const

export interface Flow {
  readonly ratePerS: number
  readonly latencyMs: number
}

/** Every pair of a rate and a latency whose number in flight is from 2 to 240 requests: no pair is trivial, and none is a crowd. */
export const FLOWS: readonly Flow[] = RATES.flatMap((ratePerS) => LATENCIES_MS.map((latencyMs): Flow => ({ ratePerS, latencyMs }))).filter((flow) => {
  const inFlight100 = littlesModel.inFlight100(flow.ratePerS, flow.latencyMs)
  return inFlight100 >= 200 && inFlight100 <= 24_000
})

/** The pairs for `check`: at least 10 requests in flight, so that a count written to a tenth of a request is within a half of a percent of the truth. */
export const CHECK_FLOWS: readonly Flow[] = FLOWS.filter((flow) => littlesModel.inFlight100(flow.ratePerS, flow.latencyMs) >= 1000)

/** How far a log's count in flight is from λW, in permille of λW, for each verdict: a log that agrees is within 3%, and one that fails is at least 10% from it. */
const AGREE_GAPS = [-30, -20, -10, 0, 10, 20, 30] as const
const MORE_GAPS = [120, 150, 200, 250, 300, 400, 500, 700, 1000] as const
const FEWER_GAPS = [100, 120, 150, 200, 250, 300, 400, 500] as const

interface FlowScene {
  readonly variant: 'in-flight' | 'solve-for'
  readonly flow: Flow
  /** Level 3 writes a log in totals: the stretch, in seconds, over which `ratePerS × stretch` requests finished. */
  readonly stretchS: number
  /** `solve-for`: which of the two the learner finds. */
  readonly unknown?: 'latency' | 'rate'
}

interface CheckScene {
  readonly variant: 'check'
  readonly flow: Flow
  readonly stretchS: number
  /** The log's own count of requests in flight, in hundredths of a request, written to a tenth. */
  readonly counted100: number
}

type Scene = FlowScene | CheckScene

const completions = (scene: Pick<Scene, 'flow' | 'stretchS'>): number => scene.flow.ratePerS * scene.stretchS
const sameFlow = (a: Flow, b: Flow): boolean => a.ratePerS === b.ratePerS && a.latencyMs === b.latencyMs

/** A scene of a numeric variant. `unknown` names what a `solve-for` scene finds, for a worked example that finds what the item does; otherwise the seed draws it. */
function drawFlowScene(variant: 'in-flight' | 'solve-for', level: Level, seed: Seed, purpose: string, unknown?: 'latency' | 'rate'): FlowScene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const flow = oneOf(rng, FLOWS)
  const stretchS = oneOf(rng, STRETCHES_S)
  const drawn = oneOf(rng, ['latency', 'rate'] as const)
  return variant === 'in-flight' ? { variant, flow, stretchS } : { variant, flow, stretchS, unknown: unknown ?? drawn }
}

/** The count in flight of a log of `verdict`: λW moved by a gap of the verdict, rounded to a tenth of a request. */
function drawCheckScene(verdict: Verdict, level: Level, seed: Seed, purpose: string): CheckScene {
  const rng = itemRng(FAMILY, 'check', level, seed, purpose)
  const flow = oneOf(rng, CHECK_FLOWS)
  const stretchS = oneOf(rng, STRETCHES_S)
  const expected100 = littlesModel.inFlight100(flow.ratePerS, flow.latencyMs)
  const gap = verdict === 'agrees' ? oneOf(rng, AGREE_GAPS) : verdict === 'more-in-flight' ? oneOf(rng, MORE_GAPS) : -oneOf(rng, FEWER_GAPS)
  // The count is λW scaled by (1 + gap/1000), then rounded to the nearest tenth of a request: ten hundredths.
  const counted100 = 10 * divRound(expected100 * (1000 + gap), 10_000)
  return { variant: 'check', flow, stretchS, counted100 }
}

function paramsOf(scene: Scene): Params {
  const base = { rate: scene.flow.ratePerS, latencyMs: scene.flow.latencyMs, stretch: scene.stretchS }
  if (scene.variant === 'check') return { ...base, counted100: scene.counted100 }
  return scene.unknown === undefined ? base : { ...base, unknown: scene.unknown }
}

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { rate, latencyMs, stretch, counted100, unknown } = item.params
  if (typeof rate !== 'number' || typeof latencyMs !== 'number' || typeof stretch !== 'number') throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  const flow: Flow = { ratePerS: rate, latencyMs }
  if (item.variant === 'check') {
    if (typeof counted100 !== 'number') throw new TypeError(`${FAMILY}: the params of check are not a scene`)
    return { variant: 'check', flow, stretchS: stretch, counted100 }
  }
  if (item.variant === 'solve-for') {
    if (unknown !== 'latency' && unknown !== 'rate') throw new TypeError(`${FAMILY}: the params of solve-for are not a scene`)
    return { variant: 'solve-for', flow, stretchS: stretch, unknown }
  }
  return { variant: 'in-flight', flow, stretchS: stretch }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Digits after the point of a number written to hundredths at most: none for a whole number, one for a tenth, two otherwise. */
const digitsOf = (value: number): number => {
  const hundredths = Math.round(value * 100)
  return hundredths % 100 === 0 ? 0 : hundredths % 10 === 0 ? 1 : 2
}

const given = (value: number, unit: string): NumPart => num(value, { unit, tag: 'synthetic', digits: digitsOf(value) })
const derived = (value: number, unit: string, digits = digitsOf(value)): NumPart => num(value, { unit, tag: 'derived', digits })
const estimated = (value: number, unit: string): NumPart => num(value, { unit, tag: 'estimated' })

const seconds = (latencyMs: number): number => latencyMs / 1000

/** The numbers of a scene as a ticket prints them: a rate and a latency in seconds, or totals and a latency in ms at level 3. */
function flowGivens(scene: Pick<Scene, 'flow' | 'stretchS'>, level: Level): { rate: Given; latency: Given; totals: Given[] } {
  const { ratePerS, latencyMs } = scene.flow
  return {
    rate: { label: 'throughput', value: given(ratePerS, 'req/s') },
    latency: level === 3 ? { label: 'mean latency', value: given(latencyMs, 'ms') } : { label: 'mean latency', value: given(seconds(latencyMs), 's') },
    totals: [
      { label: 'requests that finished in the stretch', value: given(completions(scene), 'requests') },
      { label: 'the stretch', value: given(scene.stretchS, 's') },
    ],
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numeric variants                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const LAW_IN_WORDS = rich('On a steady stretch of a log, the mean number of requests in flight is the rate at which requests finish times the mean time each one takes. That is Little\'s law.')

/** The key of a numeric scene, in its unit, and how that unit is written. */
function keyOf(scene: FlowScene, level: Level): { truth: number; unit: string; label: string } {
  const { ratePerS, latencyMs } = scene.flow
  const inFlight = littlesModel.inFlight(ratePerS, latencyMs)
  if (scene.variant === 'in-flight') return { truth: inFlight, unit: 'requests', label: 'requests in flight' }
  if (scene.unknown === 'latency') return level === 3 ? { truth: latencyMs, unit: 'ms', label: 'mean latency' } : { truth: seconds(latencyMs), unit: 's', label: 'mean latency' }
  return level === 3 ? { truth: completions(scene), unit: 'requests', label: 'requests that finished' } : { truth: ratePerS, unit: 'req/s', label: 'throughput' }
}

function numericSteps(scene: FlowScene, level: Level): Step[] {
  const { ratePerS, latencyMs } = scene.flow
  const inFlight = littlesModel.inFlight(ratePerS, latencyMs)
  const total = completions(scene)
  if (scene.variant === 'in-flight') {
    if (level === 3) {
      return [
        { text: rich('The rate at which requests finish is the number that finished over the stretch, and the mean number in flight is that rate times the mean latency (Little\'s law).') },
        {
          text: rich(given(total, 'requests'), ' in ', given(scene.stretchS, 's'), ' is ', derived(ratePerS, 'req/s'), '. Times ', given(latencyMs, 'ms'), ' (', derived(seconds(latencyMs), 's'), ') gives ', derived(inFlight, 'requests'), ' in flight.'),
          result: derived(inFlight, 'requests'),
        },
      ]
    }
    return [
      { text: LAW_IN_WORDS },
      { text: rich(given(ratePerS, 'req/s'), ' × ', given(seconds(latencyMs), 's'), ' = ', derived(inFlight, 'requests'), ' in flight.'), result: derived(inFlight, 'requests') },
    ]
  }
  if (scene.unknown === 'latency') {
    if (level === 3) {
      return [
        { text: rich('The rate is the number that finished over the stretch. Little\'s law, in flight = rate × latency, solved for the latency, is the number in flight over the rate.') },
        {
          text: rich(given(total, 'requests'), ' ÷ ', given(scene.stretchS, 's'), ' = ', derived(ratePerS, 'req/s'), ', and ', given(inFlight, 'requests'), ' ÷ ', derived(ratePerS, 'req/s'), ' = ', derived(seconds(latencyMs), 's'), ', which is ', derived(latencyMs, 'ms'), '.'),
          result: derived(latencyMs, 'ms'),
        },
      ]
    }
    return [
      { text: rich('Little\'s law says in flight = rate × latency. Solved for the latency, the mean time each request takes is the number in flight over the rate.') },
      { text: rich(given(inFlight, 'requests'), ' ÷ ', given(ratePerS, 'req/s'), ' = ', derived(seconds(latencyMs), 's'), ' each.'), result: derived(seconds(latencyMs), 's') },
    ]
  }
  if (level === 3) {
    return [
      { text: rich('Little\'s law, solved for the rate, is the number in flight over the mean latency. In a stretch, that many requests a second finish for as many seconds as it lasts.') },
      {
        text: rich(given(inFlight, 'requests'), ' ÷ ', derived(seconds(latencyMs), 's'), ' = ', derived(ratePerS, 'req/s'), ', and over ', given(scene.stretchS, 's'), ' that is ', derived(total, 'requests'), '.'),
        result: derived(total, 'requests'),
      },
    ]
  }
  return [
    { text: rich('Little\'s law says in flight = rate × latency. Solved for the rate, the rate at which requests finish is the number in flight over the mean latency.') },
    { text: rich(given(inFlight, 'requests'), ' ÷ ', given(seconds(latencyMs), 's'), ' = ', derived(ratePerS, 'req/s'), '.'), result: derived(ratePerS, 'req/s') },
  ]
}

function buildNumeric(spec: VariantSpec, scene: FlowScene, level: Level, seed: Seed): Item {
  const { rate, latency, totals } = flowGivens(scene, level)
  const inFlight = littlesModel.inFlight(scene.flow.ratePerS, scene.flow.latencyMs)
  const inFlightGiven: Given = { label: 'requests in flight, on average', value: given(inFlight, 'requests') }
  const key = keyOf(scene, level)
  let stem: Rich
  let givens: Given[]
  if (scene.variant === 'in-flight') {
    stem =
      level === 3
        ? rich('A steady stretch of a benchmark log is summarized below, in totals. On average, how many requests were in flight?')
        : rich('A steady stretch of a benchmark log is summarized below. On average, how many requests are in flight?')
    givens = level === 3 ? [...totals, latency] : [rate, latency]
  } else if (scene.unknown === 'latency') {
    stem =
      level === 3
        ? rich('A steady stretch of a benchmark log is summarized below, in totals. What is the mean latency of its requests?')
        : rich('A steady stretch of a benchmark log is summarized below. What is the mean time each request takes?')
    givens = level === 3 ? [...totals, inFlightGiven] : [rate, inFlightGiven]
  } else {
    stem =
      level === 3
        ? rich('A steady stretch of a benchmark log is summarized below. How many requests finished in it?')
        : rich('A steady stretch of a benchmark log is summarized below. At what rate do requests finish?')
    givens = level === 3 ? [totals[1], latency, inFlightGiven] : [latency, inFlightGiven]
  }
  const digits = digitsOf(key.truth)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem,
      givens,
      worked: workedPart(level, numericSteps(scene, level), (attempt) => {
        // The example finds the same thing from another flow, so that its numbers are not the item's.
        const example = drawFlowScene(scene.variant, level, seed, `example-${attempt}`, scene.unknown)
        return sameFlow(example.flow, scene.flow) || keyOf(example, level).truth === key.truth ? null : numericSteps(example, level)
      }),
      answer: { kind: 'numeric', label: key.label, unit: key.unit, truth: key.truth, tolerance: ARITHMETIC, ...(digits === 0 ? {} : { digits }) },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* check                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const expected100Of = (scene: CheckScene): number => littlesModel.inFlight100(scene.flow.ratePerS, scene.flow.latencyMs)
const verdictOf = (scene: CheckScene): Verdict => littlesModel.verdict(scene.counted100, expected100Of(scene))

const VERDICT_TEXT: Readonly<Record<Verdict, Rich>> = {
  agrees: rich('It agrees: the two sides are within the tolerance'),
  'more-in-flight': rich('It fails: more requests are in flight than rate × latency accounts for'),
  'fewer-in-flight': rich('It fails: fewer requests are in flight than rate × latency accounts for'),
}

/** What the gap says about the run or the log, for a log that fails. Neither says which of the two is at fault. */
const CAUSE: Readonly<Record<'more-in-flight' | 'fewer-in-flight', Rich>> = {
  'more-in-flight': rich(
    'Requests that were sent and had not finished when the stretch ended count in the number in flight and not in the completions\' latencies. A queue that was still growing does this, and so does a row that is missing from the completions while the count in flight still has its request.',
  ),
  'fewer-in-flight': rich(
    'The completions\' latencies hold more time than the count in flight does. A stretch that begins on a backlog that is draining does this, since a request sent before the stretch adds its whole latency to the completions and only its inside part to the count, and so does a latency counted from the due time against a count in flight from the send.',
  ),
}

const NOT_YET = rich(' A failed check does not say which of the log and the run is at fault, only that one is, and the number should not be published yet.')

function checkSteps(scene: CheckScene, level: Level): Step[] {
  const { ratePerS, latencyMs } = scene.flow
  const expected100 = expected100Of(scene)
  const expected = expected100 / 100
  const counted = scene.counted100 / 100
  const residual = littlesModel.residualPermille(scene.counted100, expected100) / 10
  const verdict = verdictOf(scene)
  const total = completions(scene)
  const product: Step =
    level === 3
      ? {
          text: rich(given(total, 'requests'), ' ÷ ', given(scene.stretchS, 's'), ' = ', derived(ratePerS, 'req/s'), ', and ', derived(ratePerS, 'req/s'), ' × ', given(seconds(latencyMs), 's'), ' = ', derived(expected, 'requests'), '.'),
          result: derived(expected, 'requests'),
        }
      : { text: rich(given(ratePerS, 'req/s'), ' × ', given(seconds(latencyMs), 's'), ' = ', derived(expected, 'requests'), ' in flight, by the law.'), result: derived(expected, 'requests') }
  return [
    { text: rich('A log agrees with itself when throughput times mean latency matches the number in flight that the log counts for itself. The residual is the gap between the two over the log\'s own count.') },
    product,
    {
      text: rich('The log counts ', given(counted, 'requests'), ' in flight, so the gap is ', derived(Math.abs(counted - expected), 'requests'), ' and the residual is ', derived(residual, '%'), ' against the tolerance of ', estimated(TOLERANCE_PERMILLE / 10, '%'), '.'),
      result: derived(residual, '%'),
    },
    {
      text:
        verdict === 'agrees'
          ? rich('That is inside the tolerance, so the log agrees with itself.')
          : rich(
              verdict === 'more-in-flight' ? 'The log counts more in flight than the law gives. ' : 'The log counts fewer in flight than the law gives. ',
              ...CAUSE[verdict],
              ...NOT_YET,
            ),
    },
  ]
}

/** Why a verdict is not the log's, by the verdict that was taken for it; the right one says why it is. */
function whyVerdict(option: Verdict, scene: CheckScene): { why: Rich; miss?: string } {
  const truth = verdictOf(scene)
  const expected = expected100Of(scene) / 100
  const counted = scene.counted100 / 100
  const residual = littlesModel.residualPermille(scene.counted100, expected100Of(scene)) / 10
  const figures = [derived(expected, 'requests'), ' against ', given(counted, 'requests'), ' counted'] as const
  if (option === truth) {
    if (truth === 'agrees') return { why: rich('The law gives ', ...figures, ': a residual of ', derived(residual, '%'), ', inside the ', estimated(TOLERANCE_PERMILLE / 10, '%'), ' the course allows. The log agrees with itself.') }
    return {
      why: rich('The law gives ', ...figures, ': a residual of ', derived(residual, '%'), ', over the ', estimated(TOLERANCE_PERMILLE / 10, '%'), ' the course allows, and the count is the ', truth === 'more-in-flight' ? 'higher' : 'lower', ' of the two. ', ...CAUSE[truth], ...NOT_YET),
    }
  }
  if (option === 'agrees') {
    return { why: rich('The law gives ', ...figures, ': a residual of ', derived(residual, '%'), ', which is over the ', estimated(TOLERANCE_PERMILLE / 10, '%'), ' the course allows. The log does not agree with itself.'), miss: `${FAMILY}.passes-a-failed-log` }
  }
  if (truth === 'agrees') {
    return {
      why: rich('The law gives ', ...figures, ': a residual of ', derived(residual, '%'), ', inside the ', estimated(TOLERANCE_PERMILLE / 10, '%'), ' the course allows. The two sides match, so the log has neither more nor fewer requests in flight than the law accounts for.'),
      miss: `${FAMILY}.fails-a-good-log`,
    }
  }
  return {
    why: rich('The law gives ', ...figures, ', so the count is the ', truth === 'more-in-flight' ? 'higher' : 'lower', ' of the two and not the ', truth === 'more-in-flight' ? 'lower' : 'higher', '.'),
    miss: `${FAMILY}.reads-the-gap-backwards`,
  }
}

function checkOptions(scene: CheckScene, level: Level, seed: Seed): ChoiceOption[] {
  return shown(
    FAMILY,
    'check',
    level,
    seed,
    VERDICTS.map((id): ChoiceOption => ({ id, text: VERDICT_TEXT[id], ...whyVerdict(id, scene) })),
  )
}

function buildCheck(spec: VariantSpec, scene: CheckScene, level: Level, seed: Seed): Item {
  const { rate, latency, totals } = flowGivens(scene, level)
  const counted: Given = { label: 'requests in flight, as the log counts them', value: given(scene.counted100 / 100, 'requests') }
  const verdict = verdictOf(scene)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem: rich(
        level === 3 ? 'A benchmark log covers a stretch where the server was steady, and is summarized below, in totals. ' : 'A benchmark log covers a stretch where the server was steady, and is summarized below. ',
        'A log agrees with itself when throughput times mean latency is within ',
        estimated(TOLERANCE_PERMILLE / 10, '%'),
        ' of the average number of requests in flight that the log counts. Does this one?',
      ),
      givens: level === 3 ? [...totals, latency, counted] : [rate, latency, counted],
      worked: workedPart(level, checkSteps(scene, level), (attempt) => {
        // The example is another verdict on another flow, so that its numbers are not the item's.
        const other = VERDICTS[(VERDICTS.indexOf(verdict) + 1 + attempt) % VERDICTS.length]
        const example = drawCheckScene(other, level, seed, `example-${attempt}`)
        return sameFlow(example.flow, scene.flow) ? null : checkSteps(example, level)
      }),
      answer: { kind: 'choice', label: 'the verdict on the log', options: checkOptions(scene, level, seed), correct: verdict },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.005)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant === 'check') return null
    const { ratePerS, latencyMs } = scene.flow
    const inFlight = littlesModel.inFlight(ratePerS, latencyMs)
    const latencyS = seconds(latencyMs)
    if (scene.variant === 'in-flight') {
      if (item.level === 3) {
        const total = completions(scene)
        if (near(value, (total * latencyMs) / scene.stretchS)) return { id: `${FAMILY}.milliseconds-as-seconds`, message: rich('That is a thousand times the answer. The latency is in milliseconds, and the rate in requests a second needs it in seconds.') }
        if (near(value, (total * latencyMs) / 1000)) return { id: `${FAMILY}.forgot-the-stretch`, message: rich('You multiplied the requests by their latency and stopped. That is the time they spent in flight, in request-seconds, and the average over the stretch divides it by the stretch.') }
        return null
      }
      if (near(value, ratePerS + latencyS)) return { id: `${FAMILY}.added`, message: rich('You added the rate and the latency. The number in flight is their product.') }
      if (near(value, ratePerS / latencyS)) return { id: `${FAMILY}.divided`, message: rich('You divided the rate by the latency. A request that takes longer is in flight for longer, so the number in flight grows with the latency.') }
      if (near(value, ratePerS * latencyMs)) return { id: `${FAMILY}.milliseconds-as-seconds`, message: rich('That is a thousand times the answer. The rate is per second, so the latency has to be in seconds.') }
      return null
    }
    if (scene.unknown === 'latency') {
      if (item.level === 3) {
        if (near(value, seconds(latencyMs))) return { id: `${FAMILY}.seconds-as-milliseconds`, message: rich('That is the latency in seconds. The answer is asked for in milliseconds.') }
        return null
      }
      if (near(value, inFlight * ratePerS)) return { id: `${FAMILY}.multiplied`, message: rich('You multiplied the number in flight by the rate. The latency is the number in flight divided by the rate.') }
      if (near(value, ratePerS / inFlight)) return { id: `${FAMILY}.upside-down`, message: rich('You divided the rate by the number in flight, which is the latency upside down.') }
      return null
    }
    if (item.level === 3) {
      if (near(value, ratePerS)) return { id: `${FAMILY}.rate-not-total`, message: rich('That is the rate. The question asks for the requests that finished in the whole stretch.') }
      return null
    }
    if (near(value, inFlight * latencyS)) return { id: `${FAMILY}.multiplied`, message: rich('You multiplied the number in flight by the latency. The rate is the number in flight divided by the latency.') }
    if (near(value, latencyS / inFlight)) return { id: `${FAMILY}.upside-down`, message: rich('You divided the latency by the number in flight, which is the rate upside down.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const littlesLaw: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Little\'s law as a check on a log',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (spec.id === 'check') {
      const verdict = VERDICTS[drawOutcome(FAMILY, 'check', level, seed, VERDICTS.length)]
      return buildCheck(spec, drawCheckScene(verdict, level, seed, 'scene'), level, seed)
    }
    if (spec.id !== 'in-flight' && spec.id !== 'solve-for') throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return buildNumeric(spec, drawFlowScene(spec.id, level, seed, 'scene'), level, seed)
  },
  // Every pair of a rate and a latency is a fair question, and `check` is drawn answer first, so no seed is thrown out.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution(item) {
    const scene = sceneOf(item)
    return scene.variant === 'check' ? checkSteps(scene, item.level) : numericSteps(scene, item.level)
  },
}
