/**
 * `tr3.which-category`: which of the four categories a step's time falls in (TR3; KC `tr3.partition`). It is TR3's Keep family for the
 * partition of a step: every nanosecond of a window is a kernel, a copy with no kernel, a CPU gap (the GPU idle while the main thread is
 * busy) or both idle. The scenes are small synthetic windows written as the spans of a trace, and every key is what `attribute` of
 * `@es/sim/trace` says of the scene's `trace@1`.
 *
 *   stretch   one stretch of a window, chosen inside one of its phases: which category is it? Each category is the key on one seed in four.
 *             From level 1 the main thread's busy time runs on into GPU-busy time (hidden CPU work), so that "the CPU is busy" is not "CPU
 *             gap"; at level 3 a kernel may run on two streams that overlap, and the GPU is busy through their union.
 *   window    a whole window of 4 to 8 stretches: how many µs of it are CPU gap (at level 3 it may be both idle or copy-only instead)?
 *
 * The category words are the viewer's (`CATEGORY_WORDS` of src/trace/marks.ts); tests/play/items-tr3-which-category.test.ts holds them
 * to it and holds the CPU gap's word to `GAP_WORD` of src/copy/terms.ts, which packages/play does not import.
 */
import { below, between } from '@es/sim/core'
import type { AttributionCategory } from '@es/sim/trace'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { attributeUs, CATEGORIES, categoryUs, drawWindow, EXACT, placeEntries, spanLines, us, usDerived, windowTrace, workedPart } from './kit'
import type { Entry, WindowScene } from './kit'

const FAMILY = 'tr3.which-category'
const VERSION = 1
const KC = 'tr3.partition'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'stretch', title: 'The category of one stretch of a step', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'window', title: 'How much of a step is one category', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'stretch' | 'window'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** The words of the four categories, as the viewer prints them (`CATEGORY_WORDS`), and what each means in the course's own plain words. */
export const WORDS: Readonly<Record<AttributionCategory, { term: string; meaning: string }>> = {
  kernel: { term: 'Kernel', meaning: 'the GPU is running a kernel' },
  copy: { term: 'Copy', meaning: 'a copy runs and no kernel does' },
  'cpu-gap': { term: 'CPU gap', meaning: 'the GPU is idle while the CPU prepares the next call' },
  'both-idle': { term: 'Both idle', meaning: 'the CPU and the GPU are both waiting' },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const phasesAt = (variant: VariantId, level: Level, rng: ReturnType<typeof itemRng>): number => {
  if (variant === 'stretch') return level <= 1 ? 4 : level === 2 ? 5 : 6
  return level <= 1 ? 4 : level === 2 ? between(rng, 5, 6) : between(rng, 6, 8)
}

export interface Scene {
  readonly scene: WindowScene
  /** The category asked about: of the stretch, or the one whose µs are asked. */
  readonly category: AttributionCategory
  /** The stretch of the `stretch` variant, in µs. */
  readonly fromUs: number
  readonly toUs: number
}

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  // Answer first: the category asked about is the key's own, one seed in four (a window asks about CPU gap at the lower levels).
  const outcome = (n: number): number => below(itemRng(FAMILY, variant, level, seed, `${purpose}/outcome`), n)
  const category: AttributionCategory = variant === 'stretch' ? CATEGORIES[outcome(4)] : level <= 2 ? 'cpu-gap' : (['cpu-gap', 'both-idle', 'copy'] as const)[outcome(3)]
  const scene = drawWindow(rng, { phases: phasesAt(variant, level, rng), twoStreams: level === 3, hidden: level >= 1, required: category })
  if (variant === 'window') return { scene, category, fromUs: 0, toUs: scene.toUs }
  const wanted = scene.phases.filter((phase) => phase.category === category)
  const phase = wanted[below(rng, wanted.length)]
  const margin = Math.floor((phase.toUs - phase.fromUs) / 4)
  return { scene, category, fromUs: phase.fromUs + between(rng, 0, margin), toUs: phase.toUs - between(rng, 0, margin) }
}

/** The category of the stretch, from the trace model: the whole stretch must be one segment. */
export function categoryOfStretch(s: Scene): AttributionCategory {
  const a = attributeUs(windowTrace(s.scene), s.fromUs, s.toUs)
  if (a.segments.length !== 1) throw new RangeError(`${FAMILY}: the stretch from ${s.fromUs} to ${s.toUs} is ${a.segments.length} segments`)
  return a.segments[0].category
}

/** The µs of the window in the category asked, from the trace model. */
export function usOfWindow(s: Scene): number {
  return categoryUs(attributeUs(windowTrace(s.scene), 0, s.scene.toUs), s.category)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const givensOf = (s: Scene): Given[] => [
  ...spanLines(s.scene).map(({ label, line }) => ({ label, value: code(line) })),
  { label: 'window', value: code(`0 to ${s.scene.toUs}`) },
]

/*
 * The first step of each solution is the rule alone: no figure of the scene, no category's word. At level 1 it is the step a learner
 * is shown before answering, and the questions of a lesson's Test are asked at level 1, so it must not say which category or how long.
 */
const STRETCH_RULE = rich('Ask two things of the whole stretch, on every GPU stream together: does the GPU run something, and is the main thread busy? A kernel running anywhere makes it one category, and a copy with no kernel another; with the GPU idle, the main thread being busy or idle splits the other two.')
const WINDOW_RULE = rich('Cut the window wherever the GPU, on any stream, or the main thread turns busy or idle. Name each piece by the same two questions, then add up the lengths of the pieces of the kind asked for. The main thread being busy while the GPU runs is hidden work, and belongs to no piece but the GPU\'s.')

function stretchSteps(s: Scene): Step[] {
  const trace = windowTrace(s.scene)
  const a = attributeUs(trace, s.fromUs, s.toUs)
  const kind = categoryOfStretch(s)
  const gpu = kind === 'kernel' ? 'a kernel runs' : kind === 'copy' ? 'a copy runs and no kernel does' : 'nothing runs'
  const cpu = kind === 'cpu-gap' || a.overlapNs > 0 ? 'busy' : 'idle'
  return [
    { text: STRETCH_RULE },
    { text: rich('From ', us(s.fromUs), ' to ', us(s.toUs), ' on the GPU ', gpu, ', and the main thread is ', cpu, '.') },
    { text: rich('So the stretch is ', code(WORDS[kind].term), ': ', WORDS[kind].meaning, '.') },
  ]
}

function windowSteps(s: Scene): Step[] {
  const trace = windowTrace(s.scene)
  const a = attributeUs(trace, 0, s.scene.toUs)
  const pieces = a.segments.filter((segment) => segment.category === s.category)
  const key = categoryUs(a, s.category)
  const listed = a.segments.map((segment) => `${segment.fromNs / 1000} to ${segment.toNs / 1000}: ${WORDS[segment.category].term}`)
  return [
    { text: WINDOW_RULE },
    { text: rich('The window falls into these pieces: ', code(listed.join('; ')), '.') },
    {
      text: rich('The pieces of ', code(WORDS[s.category].term), ' are ', ...pieces.flatMap((piece, at) => [...(at === 0 ? [] : [' and ']), usDerived((piece.toNs - piece.fromNs) / 1000)]), ', which come to the answer.'),
      result: usDerived(key),
    },
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
    const s = sceneOfItem(item)
    const a = attributeUs(windowTrace(s.scene), 0, s.scene.toUs)
    if (s.category === 'cpu-gap' && value === categoryUs(a, 'cpu-gap') + categoryUs(a, 'both-idle')) {
      return { id: `${FAMILY}.all-idle-is-cpu-gap`, message: rich('That is all the GPU\'s idle time. A CPU gap is only the idle time in which the main thread is busy; the idle time in which it is idle too is a different category.') }
    }
    return null
  },
  (item, value) => {
    const s = sceneOfItem(item)
    const a = attributeUs(windowTrace(s.scene), 0, s.scene.toUs)
    const cpuBusy = categoryUs(a, 'cpu-gap') + a.overlapNs / 1000
    return a.overlapNs > 0 && value === cpuBusy && value !== usOfWindow(s)
      ? { id: `${FAMILY}.all-cpu-busy`, message: rich('That counts every µs the main thread is busy, including the ones in which the GPU is running a kernel or a copy. That work is hidden: it delays nothing, and only the busy time with the GPU idle is a CPU gap.') }
      : null
  },
  (item, value) => {
    const s = sceneOfItem(item)
    const a = attributeUs(windowTrace(s.scene), 0, s.scene.toUs)
    const other = CATEGORIES.find((category) => category !== s.category && categoryUs(a, category) === value && value > 0)
    return other === undefined ? null : { id: `${FAMILY}.other-category`, message: rich('That is the length of ', code(WORDS[other].term), ' in this window, not of the category asked for.') }
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function entriesFor(s: Scene): Entry[] {
  const right = categoryOfStretch(s)
  return CATEGORIES.map((category): Entry => {
    const text = rich(WORDS[category].term)
    if (category === right) return { text, right: true, why: rich(WORDS[category].term, ': ', WORDS[category].meaning, '. That is what runs across the whole stretch.') }
    const slug = `${category === 'both-idle' ? 'both-idle' : category === 'cpu-gap' ? 'cpu-gap' : category}-taken`
    const why =
      category === 'cpu-gap'
        ? rich(WORDS[category].term, ' needs the GPU idle, and here it is not: what runs, or does not run, on it settles the category before the main thread does.')
        : category === 'both-idle'
          ? rich(WORDS[category].term, ' needs the main thread idle as well, and the stretch does not fit that.')
          : category === 'kernel'
            ? rich(WORDS[category].term, ' needs a kernel running on some stream across the stretch, and none does.')
            : rich(WORDS[category].term, ' needs a copy running with no kernel beside it, and the stretch is not that.')
    return { text, why, miss: `${FAMILY}.${slug}` }
  })
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const s = drawScene(variant, level, seed, 'scene')
  const own = variant === 'stretch' ? stretchSteps(s) : windowSteps(s)
  const gen = { id: FAMILY, version: VERSION }
  const scene = spanLines(s.scene).map(({ label, line }) => `${label}:${line}`).join('|')
  if (variant === 'stretch') {
    const { options, correct } = placeEntries(FAMILY, variant, level, seed, entriesFor(s))
    return finishItem(gen, {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: { scene, window: s.scene.toUs, from: s.fromUs, to: s.toUs },
      stem: rich('A step\'s window is listed below as the spans of its trace. Which category is the stretch from ', us(s.fromUs), ' to ', us(s.toUs), '?'),
      givens: givensOf(s),
      worked: workedPart(level, own, (attempt) => {
        const other = drawScene(variant, level, seed, `example-${attempt}`)
        return categoryOfStretch(other) === categoryOfStretch(s) ? null : stretchSteps(other)
      }),
      answer: { kind: 'choice', label: 'the category of the stretch', options, correct },
    })
  }
  const key = usOfWindow(s)
  return finishItem(gen, {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: { scene, window: s.scene.toUs, category: s.category },
    stem: rich('A step\'s window is listed below as the spans of its trace. How many µs of the window are in the category ', code(WORDS[s.category].term), ' (', WORDS[s.category].meaning, ')?'),
    givens: givensOf(s),
    worked: workedPart(level, own, (attempt) => {
      const other = drawScene(variant, level, seed, `example-${attempt}`)
      return usOfWindow(other) === key ? null : windowSteps(other)
    }),
    answer: { kind: 'numeric', label: 'the time in that category', unit: 'µs', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const whichCategory: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The category of a step\'s time',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the category asked about is drawn first and the window is built to hold it.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    const s = sceneOfItem(item)
    return item.variant === 'stretch' ? stretchSteps(s) : windowSteps(s)
  },
}

