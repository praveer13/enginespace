/**
 * `tr0.find-the-sync`: which calls on a GPU tensor wait for the GPU, and how often a loop waits (TR0; KC `tr0.hidden-syncs`). It is
 * TR0's Keep family for the calls that hide a wait. Every key follows from the rule table in `sync-rules.ts`, whose every row is a claim
 * of content/claims/tr0.yaml read in the PyTorch 2.14 documents; a call that no claim states is not in it and so is never asked about.
 *
 *   which-line   five lines of PyTorch on GPU tensors, one of which waits for the GPU: which one? The place of the waiting line is drawn
 *                first, one time in five each. At levels 2 and 3 the five lines are the body of a loop.
 *   count        a loop whose body holds some lines that wait, and lines after it that may: how many times does one pass through the
 *                lines wait? The key is the waits in the body times the passes, plus the waits after the loop.
 *
 * The tests hold each row to its claims and each key to the table, reading both from the lines a ticket prints.
 */
import { between, shuffle } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, oneOf, workedPart } from './kit'
import { QUEUING, ruleById, WAITING } from './sync-rules'
import type { SyncRule } from './sync-rules'

const FAMILY = 'tr0.find-the-sync'
const VERSION = 1
const KC = 'tr0.hidden-syncs'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-line', title: 'The line that waits for the GPU', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'count', title: 'How often a loop waits for the GPU', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-line' | 'count'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** The names of the GPU tensor that a ticket reads, and of what each line assigns to. */
const SOURCES = ['x', 'h', 'logits', 'scores', 'probs', 'hidden'] as const
const DESTS = ['n', 'y', 's', 'out', 'z', 'r', 't', 'u'] as const

const LOOP_HEAD = 'for layer in range('

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface CountScene {
  readonly src: string
  readonly passes: number
  readonly body: readonly SyncRule[]
  readonly after: readonly SyncRule[]
}

/** The waits of one pass through a count scene, from the rule table. */
export function waitsOf(scene: CountScene): number {
  return scene.passes * scene.body.filter((rule) => rule.waits).length + scene.after.filter((rule) => rule.waits).length
}

function pickQueuing(rng: ReturnType<typeof itemRng>, count: number): SyncRule[] {
  return shuffle(rng, QUEUING).slice(0, count)
}

function drawCount(level: Level, seed: number, purpose: string): CountScene {
  const rng = itemRng(FAMILY, 'count', level, seed, purpose)
  const src = oneOf(rng, SOURCES)
  const passes = between(rng, 3, 12)
  // Below level 2 nothing follows the loop. From level 2 on a call after it may wait, and a body that waits once always has one, so that the key is never the number of passes.
  const bodyWaits = level <= 1 ? between(rng, 2, 3) : between(rng, 1, 3)
  const afterWaits = level <= 1 ? 0 : bodyWaits === 1 ? between(rng, 1, 2) : between(rng, 0, 2)
  const afterQueues = level <= 1 ? 0 : between(rng, 0, 1)
  const waiting = shuffle(rng, WAITING)
  const body = shuffle(rng, [...waiting.slice(0, bodyWaits), ...pickQueuing(rng, between(rng, 1, 2))])
  const after = shuffle(rng, [...waiting.slice(bodyWaits, bodyWaits + afterWaits), ...pickQueuing(rng, afterQueues).filter((rule) => !body.includes(rule))])
  return { src, passes, body, after }
}

const linesOfCount = (scene: CountScene): string[] => [
  `${LOOP_HEAD}${scene.passes}):`,
  ...scene.body.map((rule, at) => `    ${rule.line(scene.src, DESTS[at])}`),
  ...scene.after.map((rule, at) => rule.line(scene.src, DESTS[scene.body.length + at])),
]

export interface LineScene {
  readonly src: string
  readonly rules: readonly SyncRule[]
  readonly loop: boolean
}

const linesOfWhich = (scene: LineScene): string[] => scene.rules.map((rule, at) => `${scene.loop ? '    ' : ''}${rule.line(scene.src, DESTS[at])}`)

function drawWhich(level: Level, seed: number, place: number, purpose: string): LineScene {
  const rng = itemRng(FAMILY, 'which-line', level, seed, purpose)
  const src = oneOf(rng, SOURCES)
  const waiting = oneOf(rng, WAITING)
  const others = pickQueuing(rng, 4)
  const rules = [...others.slice(0, place), waiting, ...others.slice(place)]
  return { src, rules, loop: level >= 2 }
}

/** The place of the one line that waits, from the table. */
export const waitingPlace = (scene: LineScene): number => scene.rules.findIndex((rule) => rule.waits)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (lines: readonly string[]): Given[] => lines.map((line, at) => ({ label: `line ${at + 1}`, value: code(line) }))

/*
 * The first step of each solution is the rule alone, naming no line of the ticket: at level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not say which line waits or how many do.
 */
const WHICH_RULE: Rich = rich('Read each line for what it asks of the GPU. A line waits for it when it brings a value or a tensor back to the CPU, or asks to wait; a line that only queues GPU work, or moves no data at all, returns at once.')
const COUNT_RULE: Rich = rich('Every pass runs the whole body again, so a line in the body that waits waits once in each pass, and a line after the loop runs once. Find the lines that wait first, then count.')

function whichSteps(scene: LineScene): Step[] {
  const lines = linesOfWhich(scene)
  const steps: Step[] = [{ text: WHICH_RULE }, ...scene.rules.map((rule, at) => ({ text: rich(code(lines[at].trim()), ': ', rule.why) }))]
  steps.push({ text: rich('So the line that waits for the GPU is ', code(lines[waitingPlace(scene)].trim()), '.') })
  return steps
}

function whichOptions(scene: LineScene): ChoiceOption[] {
  const lines = linesOfWhich(scene)
  const place = waitingPlace(scene)
  // The options are the lines in the order they are printed: the place of the waiting line is the draw's, one time in five each.
  return (
    scene.rules.map(
      (rule, at): ChoiceOption => ({
        id: `line-${at + 1}`,
        text: rich(code(lines[at].trim())),
        why: rich(code(lines[at].trim()), ': ', rule.why),
        ...(at === place ? {} : { miss: `${FAMILY}.${rule.id}-taken-for-a-wait` }),
      }),
    )
  )
}

function countSteps(scene: CountScene): Step[] {
  const lines = linesOfCount(scene)
  const bodyWaits = scene.body.filter((rule) => rule.waits).length
  const afterWaits = scene.after.filter((rule) => rule.waits).length
  const waitingLines = (rules: readonly SyncRule[], from: number): Rich =>
    rich(...rules.flatMap((rule, at) => (rule.waits ? [code(lines[from + at].trim()), ' '] : [])))
  const steps: Step[] = [
    { text: COUNT_RULE },
    { text: rich('In the body these lines wait: ', ...waitingLines(scene.body, 1), 'which is ', num(bodyWaits, { tag: 'derived', unit: 'waits' }), ' in each pass.') },
    { text: rich('The loop runs ', num(scene.passes, { unit: 'passes' }), ', so the body waits ', num(scene.passes * bodyWaits, { tag: 'derived', unit: 'times' }), ' in all.') },
  ]
  steps.push(
    afterWaits === 0
      ? { text: rich('Nothing after the loop waits, so the total is the loop\'s.'), result: num(waitsOf(scene), { tag: 'derived', unit: 'waits' }) }
      : { text: rich('After the loop these lines wait: ', ...waitingLines(scene.after, 1 + scene.body.length), 'which adds ', num(afterWaits, { tag: 'derived', unit: 'waits' }), ' to the total.'), result: num(waitsOf(scene), { tag: 'derived', unit: 'waits' }) },
  )
  return steps
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Params                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const ids = (rules: readonly SyncRule[]): string => rules.map((rule) => rule.id).join('|')
const rulesOf = (text: string): SyncRule[] => (text === '' ? [] : text.split('|').map(ruleById))

function whichOfItem(item: Pick<Item, 'params'>): LineScene {
  const { src, rules, loop } = item.params
  if (typeof src !== 'string' || typeof rules !== 'string' || typeof loop !== 'boolean') throw new TypeError(`${FAMILY}: the params are not a scene`)
  return { src, rules: rulesOf(rules), loop }
}

function countOfItem(item: Pick<Item, 'params'>): CountScene {
  const { src, passes, body, after } = item.params
  if (typeof src !== 'string' || typeof passes !== 'number' || typeof body !== 'string' || typeof after !== 'string') throw new TypeError(`${FAMILY}: the params are not a scene`)
  return { src, passes, body: rulesOf(body), after: rulesOf(after) }
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = countOfItem(item)
    const bodyWaits = scene.body.filter((rule) => rule.waits).length
    const afterWaits = scene.after.filter((rule) => rule.waits).length
    if (afterWaits > 0 && value === scene.passes * bodyWaits) {
      return { id: `${FAMILY}.after-forgotten`, message: rich('That counts the waits in the loop and leaves out the lines after it. A wait there is one more, whether or not it sits in a loop.') }
    }
    if (value === bodyWaits + afterWaits) return { id: `${FAMILY}.loop-once`, message: rich('That counts each line once. The body runs once for every pass of the loop, and every pass waits again.') }
    if (value === scene.body.length * scene.passes + afterWaits || value === scene.body.length * scene.passes) {
      return { id: `${FAMILY}.every-line`, message: rich('That counts every line of the body. Only a call that brings a value back to the CPU, or asks to wait, is a wait: a call that queues work returns at once.') }
    }
    if (value === scene.passes) return { id: `${FAMILY}.passes-only`, message: rich('That is the number of passes. Each pass waits once for every line in the body that waits, which may be more than one.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }
  if (spec.id === 'which-line') {
    const place = drawOutcome(FAMILY, 'which-line', level, seed, 5)
    const scene = drawWhich(level, seed, place, 'scene')
    const loop = scene.loop
    return finishItem(gen, {
      ...base,
      params: { src: scene.src, rules: ids(scene.rules), loop },
      stem: rich(code(scene.src), ' is a tensor on the GPU, and so is ', code('w'), '. ', loop ? 'These five lines are the body of a loop that runs many times. ' : 'These five lines run one after another. ', 'Which line waits for the GPU?'),
      givens: loop ? [{ label: 'loop', value: code('for step in range(steps):') }, ...given(linesOfWhich(scene))] : given(linesOfWhich(scene)),
      worked: workedPart(level, whichSteps(scene), (attempt) => {
        const other = drawWhich(level, seed, (place + 1 + attempt) % 5, `example-${attempt}`)
        return waitingPlace(other) === place && other.src === scene.src ? null : whichSteps(other)
      }),
      answer: { kind: 'choice', label: 'the line that waits', options: whichOptions(scene), correct: `line-${place + 1}` },
    })
  }
  const scene = drawCount(level, seed, 'scene')
  const key = waitsOf(scene)
  return finishItem(gen, {
    ...base,
    params: { src: scene.src, passes: scene.passes, body: ids(scene.body), after: ids(scene.after) },
    stem: rich(code(scene.src), ' is a tensor on the GPU, and so is ', code('w'), '. The loop below runs ', num(scene.passes, { unit: 'passes' }), '. How many times do the lines below wait for the GPU in all?'),
    givens: given(linesOfCount(scene)),
    worked: workedPart(level, countSteps(scene), (attempt) => {
      const other = drawCount(level, seed, `example-${attempt}`)
      return waitsOf(other) === key ? null : countSteps(other)
    }),
    answer: { kind: 'numeric', label: 'the waits', unit: 'waits', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const findTheSync: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The calls that wait for the GPU',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the place of the waiting line, and the waits of a loop, follow from the draw.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    return item.variant === 'count' ? countSteps(countOfItem(item)) : whichSteps(whichOfItem(item))
  },
}

