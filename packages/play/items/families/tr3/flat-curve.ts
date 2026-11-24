/**
 * `tr3.flat-curve`: what a latency that stays flat as the prompt grows says of the step (TR3; KC `tr3.flat-curve`). A table gives the time
 * of one step at prompts of growing length. A step whose time does not follow its work is not limited by the work: a fixed cost per step
 * sets it, the calls that start its kernels and the small kernels themselves. The course calls that launch-bound, and a step whose time
 * follows the amount of work compute-bound.
 *
 *   which-bound  read the table: is the step launch-bound, compute-bound, or both? Each is the key one seed in three. At level 2 the
 *                table has two columns, graphs off and graphs on, and the question is about the graphs-on column: the graph removes the
 *                launch calls, so what remains of a flat curve is the small kernels' own cost, and a curve that rises is the work.
 *   factor       by what factor did the prompt grow while the latency stayed within a tenth of the first row's?
 *
 * The tenth is the course's own choice [estimated], and the ticket says so. Nothing here rests on a document of an engine: the key is the
 * rule applied to the table that the ticket prints. An engine's guide is said to call a flat latency across a wide range of prompt
 * lengths the signature of launch overhead; that statement is [unverified] (vendor-reported), and no key rests on it.
 *
 * Every time is synthetic, in whole µs.
 */
import { between } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { drawOutcomeOf, EXACT, placeEntries, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.flat-curve'
const VERSION = 1
const KC = 'tr3.flat-curve'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-bound', title: 'What limits a step whose latency is tabulated', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'factor', title: 'How far the prompt grew while the latency stayed flat', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-bound' | 'factor'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** A latency is flat while it stays within this share of the first row's [estimated]: the course's own choice. */
export const FLAT = 0.1

export type Shape = 'flat' | 'work' | 'mixed'
const SHAPES: readonly Shape[] = ['flat', 'work', 'mixed']

export interface Scene {
  /** Prompt lengths in tokens, from the shortest. */
  readonly lengths: readonly number[]
  /** The latencies of the column the question is about, in µs. */
  readonly on: readonly number[]
  /** The same step with graphs off, at level 2: the graphs-on time plus a fixed launch cost. */
  readonly off: readonly number[] | null
  /** The shape the draw was made for. */
  readonly shape: Shape
  /** For `factor`: the last row that is still within a tenth of the first. */
  readonly last: number
}

/** Rows the table has: seven, and eight at level 3. */
const rowsAt = (level: Level): number => (level === 3 ? 8 : 7)
/** The noise of a row, in thousandths: up to three per cent, and five at level 3. */
const noiseAt = (level: Level): number => (level === 3 ? 50 : 30)

function drawLengths(rng: Rng, rows: number): number[] {
  let length = [8, 16, 24, 32][between(rng, 0, 3)]
  const lengths = [length]
  for (let at = 1; at < rows; at += 1) {
    length *= between(rng, 2, 4)
    lengths.push(length)
  }
  return lengths
}

const noisy = (rng: Rng, value: number, level: Level): number => Math.round((value * (1000 + between(rng, -noiseAt(level), noiseAt(level)))) / 1000)

/** The shape of a table, read as the rule reads it: flat when every row is within a tenth of the first, otherwise by how the last row compares with the growth of the prompt. */
export function classify(lengths: readonly number[], times: readonly number[]): Shape {
  const first = times[0]
  if (times.every((time) => Math.abs(time - first) <= FLAT * first)) return 'flat'
  return times[times.length - 1] * lengths[0] >= 0.8 * lengths[lengths.length - 1] * first ? 'work' : 'mixed'
}

/** The last row whose latency, and every one before it, is within a tenth of the first row's. */
export function lastFlat(times: readonly number[]): number {
  let last = 0
  for (let at = 1; at < times.length; at += 1) {
    if (Math.abs(times[at] - times[0]) > FLAT * times[0]) break
    last = at
  }
  return last
}

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const rows = rowsAt(level)
  const lengths = drawLengths(rng, rows)
  const base = between(rng, 80, 400) * 10
  let on: number[]
  let shape: Shape
  let last = 0
  if (variant === 'which-bound') {
    shape = SHAPES[drawOutcomeOf(FAMILY, variant, level, seed, purpose, SHAPES.length)]
    const span = lengths[rows - 1] - lengths[0]
    const growth = between(rng, 200, 400) / 100
    on = lengths.map((length, at) => {
      if (at === 0) return base
      if (shape === 'flat') return noisy(rng, base, level)
      if (shape === 'work') return noisy(rng, (base * length) / lengths[0], level)
      return noisy(rng, (base * (span + (growth - 1) * (length - lengths[0]))) / span, level)
    })
  } else {
    // The prompt grows while the latency stays flat up to row `last`, then follows the work: drawn first, one seed in rows - 1.
    last = 1 + drawOutcomeOf(FAMILY, variant, level, seed, purpose, rows - 1)
    shape = last === rows - 1 ? 'flat' : 'mixed'
    on = lengths.map((length, at) => (at === 0 ? base : at <= last ? noisy(rng, base, level) : noisy(rng, (base * length) / lengths[last], level)))
  }
  const off = level === 2 ? on.map((time) => time + base * between(rng, 6, 14)) : null
  return { lengths, on, off, shape, last }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function givensOf(scene: Scene): Given[] {
  return scene.lengths.map((length, at): Given => ({
    label: `row ${at + 1}`,
    value: code(scene.off === null ? `${length} tokens: ${scene.on[at]} µs` : `${length} tokens: off ${scene.off[at]} µs, on ${scene.on[at]} µs`),
  }))
}

const DEFINITIONS =
  'A step is launch-bound when a fixed cost per step sets its time, the calls that start its kernels and the small kernels themselves, and compute-bound when the amount of work sets it. '

function stemOf(variant: VariantId, level: Level): Item['stem'] {
  const tenth = rich('A latency is flat while it stays within ', num(FLAT * 100, { unit: '%', tag: 'estimated' }), ' of the first row\'s; that tenth is the course\'s own choice, not a law of the engines. ')
  if (variant === 'which-bound') {
    return rich(
      DEFINITIONS,
      ...tenth,
      level === 2 ? 'The table shows one step as the prompt grows, with CUDA graphs off and on. With graphs on, what limits the step?' : 'The table shows one step as the prompt grows. What limits the step?',
    )
  }
  return rich(...tenth, level === 2 ? 'The table shows one step as the prompt grows, with CUDA graphs off and on. With graphs on, by what factor did the prompt grow, from the first row to the last row that is still flat?' : 'The table shows one step as the prompt grows. By what factor did the prompt grow, from the first row to the last row that is still flat?')
}

/*
 * The first step of each solution is the rule alone: no figure of the scene. At level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not hold a number or the answer.
 */
const BOUND_RULE = rich(
  'Compare how far the prompt grew with how far the latency grew. If the latency stays flat while the prompt grows, the time does not follow the work, so a fixed cost per step sets it. If the latency grows by about as much as the prompt does, the work sets it. If it grows, but by far less than the prompt, a fixed cost and the work both count.',
)
const FACTOR_RULE = rich('Read down the column from the first row and stop at the first row whose latency is no longer flat. The prompt grew by the length of the last flat row divided by the length of the first.')

function boundSteps(scene: Scene): Step[] {
  const n = scene.lengths.length
  const growth = scene.lengths[n - 1] / scene.lengths[0]
  const ratio = scene.on[n - 1] / scene.on[0]
  const finish = scene.shape === 'flat' ? 'The latency stayed flat while the prompt grew, so a fixed cost per step sets the time: the step is launch-bound.' : scene.shape === 'work' ? 'The latency grew by about as much as the prompt, so the work sets the time: the step is compute-bound.' : 'The latency grew, but by far less than the prompt, so a fixed cost and the work both count.'
  return [
    { text: BOUND_RULE },
    { text: rich('From the first row to the last the prompt grew by a factor of ', num(growth, { unit: 'x', tag: 'derived', digits: 1 }), ' and the latency by ', num(ratio, { unit: 'x', tag: 'derived', digits: 2 }), '.') },
    { text: rich(finish) },
  ]
}

function factorSteps(scene: Scene): Step[] {
  const n = scene.lengths.length
  const flatUntil = lastFlat(scene.on)
  const factor = scene.lengths[flatUntil] / scene.lengths[0]
  return [
    { text: FACTOR_RULE },
    { text: rich('Row ', num(flatUntil + 1, { tag: 'derived' }), ' of ', num(n, { tag: 'synthetic' }), ' is the last that stays within the first row\'s latency; the next row is not flat.') },
    { text: rich('The prompt grew from ', num(scene.lengths[0], { unit: 'tokens', tag: 'synthetic' }), ' to ', num(scene.lengths[flatUntil], { unit: 'tokens', tag: 'synthetic' }), '.'), result: num(factor, { unit: 'x', tag: 'derived' }) },
  ]
}

/** The key of `factor`. */
export const factorOf = (scene: Scene): number => scene.lengths[lastFlat(scene.on)] / scene.lengths[0]

/** The key of `which-bound`, read from the table. */
export const boundOf = (scene: Scene): Shape => classify(scene.lengths, scene.on)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'variant' | 'level' | 'seed'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  return drawScene(item.variant, item.level, item.seed, 'scene')
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOfItem(item)
    const n = scene.lengths.length
    return value === scene.lengths[n - 1] / scene.lengths[0] ? { id: `${FAMILY}.whole-table`, message: rich('That is the growth of the whole table. The question stops at the last row that is still flat.') } : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const next = lastFlat(scene.on) + 1
    return next < scene.lengths.length && value === scene.lengths[next] / scene.lengths[0] ? { id: `${FAMILY}.one-row-past`, message: rich('That reaches one row too far: the latency of that row is no longer flat.') } : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    if (scene.off === null) return null
    const off = scene.lengths[lastFlat(scene.off)] / scene.lengths[0]
    return value === off && off !== factorOf(scene) ? { id: `${FAMILY}.wrong-column`, message: rich('That reads the graphs-off column. The question is about the graphs-on column.') } : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const flatUntil = lastFlat(scene.on)
    return value === flatUntil || value === flatUntil + 1 ? { id: `${FAMILY}.rows-not-factor`, message: rich('That counts rows. The question asks how many times longer the prompt is, which is the ratio of two prompt lengths.') } : null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const LAUNCH = 'Launch-bound: a fixed cost per step, the launches or the small kernels, sets the time'
const WORK = 'Compute-bound: the amount of work sets the time'
const BOTH = 'Both: a fixed cost, with the work adding on top of it'

function entries(scene: Scene): Entry[] {
  const key = boundOf(scene)
  return [
    {
      text: rich(LAUNCH),
      ...(key === 'flat' ? { right: true as const } : { miss: `${FAMILY}.all-fixed-cost` }),
      why: key === 'flat' ? rich('The latency stays within a tenth of the first row\'s while the prompt grows, so the time does not follow the work: a fixed cost per step sets it.') : rich('That reads the whole step as a fixed cost. The latency does grow with the prompt, so the work counts too.'),
    },
    {
      text: rich(WORK),
      ...(key === 'work' ? { right: true as const } : { miss: `${FAMILY}.all-work` }),
      why: key === 'work' ? rich('The latency grows by about as much as the prompt does, so the work sets the time.') : key === 'flat' ? rich('The work grew and the latency did not move, so the work is not what sets the time.') : rich('The latency grows by far less than the prompt does, so the work is not all of it: a fixed cost is in the time too.'),
    },
    {
      text: rich(BOTH),
      ...(key === 'mixed' ? { right: true as const } : { miss: `${FAMILY}.both-by-default` }),
      why: key === 'mixed' ? rich('The latency grows, but by far less than the prompt: a fixed cost holds the time up, and the work adds on top of it.') : key === 'flat' ? rich('The latency does not grow at all, so there is no work adding on top: the fixed cost is all of it.') : rich('The latency grows by about as much as the prompt, so there is no large fixed cost beside the work.'),
    },
  ]
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const base = {
    variant,
    level,
    seed,
    kcs: spec.kcs,
    params: { lengths: scene.lengths.join(','), on: scene.on.join(','), off: scene.off === null ? '' : scene.off.join(','), shape: scene.shape },
    givens: givensOf(scene),
    stem: stemOf(variant, level),
  }
  const gen = { id: FAMILY, version: VERSION }
  const other = (attempt: number): Scene => drawScene(variant, level, seed, `example-${attempt}`)
  if (variant === 'which-bound') {
    const key = boundOf(scene)
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, entries(scene))
    return finishItem(gen, {
      ...base,
      worked: workedPart(level, boundSteps(scene), (attempt) => {
        const s = other(attempt)
        return boundOf(s) === key ? null : boundSteps(s)
      }),
      answer: { kind: 'choice', label: 'what limits the step', options, correct },
    })
  }
  const key = factorOf(scene)
  return finishItem(gen, {
    ...base,
    worked: workedPart(level, factorSteps(scene), (attempt) => {
      const s = other(attempt)
      return factorOf(s) === key ? null : factorSteps(s)
    }),
    answer: { kind: 'numeric', label: 'the factor the prompt grew', unit: 'x', truth: key, tolerance: EXACT },
  })
}

export const flatCurve: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'A latency that stays flat',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the shape of the table, or the last flat row, is drawn first.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    const scene = sceneOfItem(item)
    return item.variant === 'factor' ? factorSteps(scene) : boundSteps(scene)
  },
}
