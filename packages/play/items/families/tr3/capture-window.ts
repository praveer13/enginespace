/**
 * `tr3.capture-window`: which steps of a run a profiler capture holds (TR3; KC `tr3.capture-window`). It is TR3's Keep family for the
 * window settings of an engine's profiler. The scene is a run of steps, numbered from 0 from the moment the capture is started, written
 * as the step marks of a `trace@1`; the key is the steps of `stepWindows` (`@es/sim/trace`) that the two settings let through.
 *
 *   vLLM     `delay_iterations` skips that many steps after /start_profile, and `max_iterations` is how many steps are collected after the
 *            delay (claims vllm.profiling.delay-iterations, vllm.profiling.max-iterations and vllm.profiling.delay-counts-steps).
 *   SGLang   `start_step` is the first step held, inclusive, and `num_steps` is how many are held from it (claims
 *            sglang.profiling.start-step, sglang.profiling.num-steps and sglang.profiling.step-range, which holds the documented example).
 *
 * Levels 0 and 1 use vLLM's pair and levels 2 and 3 SGLang's, with level 3 drawing either, so that the new setting is the other engine's
 * words for the same window.
 *
 *   which-steps   the settings and a run longer than the capture: which steps does the capture hold?
 *   count         the settings and a run that may end inside the window: how many steps does the capture hold? One time in ten the run is
 *                 long enough, and the key is the second setting, so that "the number printed" is not a habit that passes.
 *   done-by-end   the settings and a long run: how many steps of the run have finished when the capture ends, the skipped ones included?
 *
 * The step numbering, from 0 at the start of the capture, is stated on the ticket; the course's scenes are synthetic.
 */
import { between, shuffle } from '@es/sim/core'
import { stepWindows, traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { count, derived, drawOutcome, EXACT, NS, placeEntries, workedPart } from './kit'
import type { Entry } from './kit'

const FAMILY = 'tr3.capture-window'
const VERSION = 1
const KC = 'tr3.capture-window'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-steps', title: 'The steps a capture holds', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'count', title: 'How many steps a capture holds', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'done-by-end', title: 'The steps finished when a capture ends', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-steps' | 'count' | 'done-by-end'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

type Engine = 'vllm' | 'sglang'

/** The words of the two settings in each engine: the one that places the window's start, and the one that sizes it. */
const KNOBS: Readonly<Record<Engine, { start: string; size: string; engine: string }>> = {
  vllm: { start: 'delay_iterations', size: 'max_iterations', engine: 'vLLM' },
  sglang: { start: 'start_step', size: 'num_steps', engine: 'SGLang' },
}

export interface Scene {
  readonly engine: Engine
  /** The first step held: vLLM's delay, SGLang's start_step. */
  readonly start: number
  /** The most steps held: vLLM's max_iterations, SGLang's num_steps. */
  readonly size: number
  /** Steps the run has, numbered from 0. */
  readonly run: number
}

const engineAt = (level: Level, seed: number): Engine => (level <= 1 ? 'vllm' : level === 2 ? 'sglang' : drawOutcome(FAMILY, 'engine', level, seed, 2) === 0 ? 'vllm' : 'sglang')

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const start = between(rng, 2, 9)
  const size = between(rng, start + 3, 16)
  const engine = engineAt(level, seed)
  if (variant !== 'count') return { engine, start, size, run: start + size + between(rng, 2, 6) }
  // One time in ten the run is long enough for the whole window: the key is then the size. Otherwise the run ends inside it.
  return { engine, start, size, run: drawOutcome(FAMILY, variant, level, seed, 10) === 0 ? start + size + between(rng, 1, 4) : between(rng, start + 1, start + size - 1) }
}

/** The run as a `trace@1`: one step mark at the start of each step and one at the end of the last, steps of 1.5 to 2.5 ms. */
export function runTrace(scene: Scene, seed: number): EsTrace {
  const rng = itemRng(FAMILY, 'run', 0, seed, `${scene.run}`)
  const b = traceBuilder()
  let at = 0
  b.mark(at, 'step')
  for (let step = 0; step < scene.run; step += 1) {
    at += between(rng, 1500, 2500) * NS
    b.mark(at, 'step')
  }
  return b.build({ source: 'synthetic', synthetic: true })
}

/** The numbers of the steps the capture holds, from the trace's step windows: the settings let through every step from `start` for at most `size`. */
export function heldSteps(scene: Scene, seed: number): number[] {
  const windows = stepWindows(runTrace(scene, seed))
  return windows.flatMap((_, at) => (at >= scene.start && at < scene.start + scene.size ? [at] : []))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function givensOf(scene: Scene, variant: VariantId): Given[] {
  const words = KNOBS[scene.engine]
  return [
    { label: words.start, value: num(scene.start, { tag: 'synthetic', unit: scene.start === 1 ? 'step' : 'steps' }) },
    { label: words.size, value: num(scene.size, { tag: 'synthetic', unit: scene.size === 1 ? 'step' : 'steps' }) },
    ...(variant === 'count' ? [{ label: 'steps in the run', value: count(scene.run, 'step', 'steps') } as Given] : []),
  ]
}

const stemOf = (scene: Scene, variant: VariantId): Item['stem'] => {
  const words = KNOBS[scene.engine]
  const lead = rich(`${words.engine}'s profiler is started before the first step of a run, and the steps are numbered from zero from that moment. It is given `, code(words.start), ' and ', code(words.size), '. ')
  if (variant === 'which-steps') return rich(...lead, 'The run has more steps than the capture needs. Which steps does the capture hold?')
  if (variant === 'count') return rich(...lead, 'The run ends after its last step, and the capture stops there. How many steps does the capture hold?')
  return rich(...lead, 'The run has more steps than the capture needs. The capture stops after the last step it holds. How many steps of the run have finished by then, the skipped ones included?')
}

/*
 * The first step of each solution is the rule alone: no figure of the scene. At level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not say which steps, how many, or which is the last.
 */
const RULES: Readonly<Record<Engine, Step>> = {
  vllm: { text: rich('The first steps after the profiler starts are skipped, as many as the delay says. The capture then holds the steps that follow, as many as the maximum says, or fewer if the run ends first. Number the steps from zero.') },
  sglang: { text: rich('The capture starts at the step the start setting names, and that step is held. It then holds as many steps as the count setting says, one after the other, or fewer if the run ends first. Number the steps from zero.') },
}

function stepsOf(scene: Scene, variant: VariantId, seed: number): Step[] {
  const words = KNOBS[scene.engine]
  const held = heldSteps(scene, seed)
  const first = held[0]
  const last = held[held.length - 1]
  const opening: Step = {
    text:
      scene.engine === 'vllm'
        ? rich('Steps ', code(`0 to ${scene.start - 1}`), ' are skipped, so the capture starts at step ', num(first, { tag: 'derived' }), '.')
        : rich('The capture starts at ', code(words.start), ', step ', num(first, { tag: 'derived' }), ', and that step is held.'),
  }
  if (variant === 'which-steps') return [RULES[scene.engine], opening, { text: rich('It holds ', num(held.length, { tag: 'derived', unit: held.length === 1 ? 'step' : 'steps' }), ', so it ends at step ', num(last, { tag: 'derived' }), ': steps ', code(`${first} to ${last}`), '.') }]
  if (variant === 'count') {
    const short = scene.run < scene.start + scene.size
    return [
      RULES[scene.engine],
      opening,
      {
        text: short
          ? rich('The run has ', count(scene.run, 'step', 'steps'), ', so its last step is ', num(scene.run - 1, { tag: 'derived' }), ' and the capture ends there, before it holds ', num(scene.size, { tag: 'synthetic', unit: 'steps' }), '.')
          : rich('The run reaches the end of the window, so the capture holds the whole count.'),
        result: derived(held.length, held.length === 1 ? 'step' : 'steps'),
      },
    ]
  }
  return [
    RULES[scene.engine],
    opening,
    { text: rich('From step ', num(first, { tag: 'derived' }), ' it holds ', num(held.length, { tag: 'derived', unit: held.length === 1 ? 'step' : 'steps' }), ', so the last is step ', num(last, { tag: 'derived' }), '. With steps numbered from zero, the steps finished by the end of step ', num(last, { tag: 'derived' }), ' are one more.'), result: derived(last + 1, 'steps') },
  ]
}

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
    if (item.variant === 'done-by-end' && value === scene.start + scene.size - 1) {
      return { id: `${FAMILY}.number-for-count`, message: rich('That is the number of the last step held. Steps are numbered from zero, so the steps finished when it ends are one more than its number.') }
    }
    if (item.variant === 'done-by-end' && value === scene.size) {
      return { id: `${FAMILY}.skipped-forgotten`, message: rich('That counts only the steps held. The steps skipped before the capture started have finished too.') }
    }
    if (item.variant === 'count' && value === scene.run) return { id: `${FAMILY}.skipped-counted`, message: rich('That counts the skipped steps as held. The steps before the capture starts are not in it.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const range = (from: number, to: number): Item['stem'] => rich('steps ', num(from, { tag: 'synthetic' }), ' to ', num(to, { tag: 'synthetic' }))

function entriesFor(scene: Scene, seed: number): Entry[] {
  const held = heldSteps(scene, seed)
  const words = KNOBS[scene.engine]
  const { start, size } = scene
  const lures: { from: number; to: number; slug: string; why: Item['stem'] }[] = [
    { from: 0, to: size - 1, slug: 'start-ignored', why: rich('That starts at the very first step and leaves the ', code(words.start), ' setting out: the first steps are skipped.') },
    { from: start, to: start + size, slug: 'one-too-many', why: rich('That holds one step more than ', code(words.size), ' allows. The capture holds that many steps in all, counting the first.') },
    { from: start + 1, to: start + size, slug: 'one-late', why: rich('That skips one step too many. The step the setting names is held, with steps numbered from zero, and not the one after it.') },
    { from: start, to: size - 1, slug: 'count-as-step', why: rich('That reads ', code(words.size), ' as the number of the last step. It is how many steps the capture holds from its first.') },
  ]
  const chosen = shuffle(itemRng(FAMILY, 'lures', 0, seed, 'which'), lures).slice(0, 3)
  return [
    { text: range(held[0], held[held.length - 1]), right: true, why: rich('The capture starts at step ', num(held[0], { tag: 'derived' }), ' and holds ', num(held.length, { tag: 'derived', unit: 'steps' }), ', so it ends at step ', num(held[held.length - 1], { tag: 'derived' }), '.') },
    ...chosen.map((lure): Entry => ({ text: range(lure.from, lure.to), why: lure.why, miss: `${FAMILY}.${lure.slug}` })),
  ]
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const own = stepsOf(scene, variant, seed)
  const gen = { id: FAMILY, version: VERSION }
  const base = {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: { engine: scene.engine, start: scene.start, size: scene.size, run: scene.run },
    stem: stemOf(scene, variant),
    givens: givensOf(scene, variant),
  }
  const other = (attempt: number): Scene => drawScene(variant, level, seed, `example-${attempt}`)
  const keyOf = (s: Scene): number => {
    const h = heldSteps(s, seed)
    return variant === 'count' ? h.length : h[h.length - 1] + 1
  }
  if (variant === 'which-steps') {
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, entriesFor(scene, seed))
    return finishItem(gen, {
      ...base,
      worked: workedPart(level, own, (attempt) => {
        const s = other(attempt)
        return s.start === scene.start && s.size === scene.size ? null : stepsOf(s, variant, seed)
      }),
      answer: { kind: 'choice', label: 'the steps the capture holds', options, correct },
    })
  }
  const key = keyOf(scene)
  return finishItem(gen, {
    ...base,
    worked: workedPart(level, own, (attempt) => {
      const s = other(attempt)
      return keyOf(s) === key ? null : stepsOf(s, variant, seed)
    }),
    answer: { kind: 'numeric', label: variant === 'count' ? 'the steps held' : 'the steps finished', unit: 'steps', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const captureWindow: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The steps a profiler capture holds',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the settings are drawn so that the window is never empty and no lure repeats the key.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    return stepsOf(sceneOfItem(item), item.variant, item.seed)
  },
}
