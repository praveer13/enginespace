/**
 * `tr0.view-or-copy`: what a chain of calls on a tensor does, view or copy or error, and how many elements it moves (TR0; KC
 * `tr0.view-vs-copy`). It is TR0's Keep family for the rule that a view moves nothing and a copy moves every element.
 *
 *   last-call   a chain of two to four calls on a tensor of rank 2 (levels 0 and 1) or 3, and the question is what the last one does: a
 *               view, a copy, or an error. The outcome is drawn first, one time in three each, and the chain is searched for that follows
 *               from it. `view` is a view where the strides can express the new shape and raises an error where they cannot (claims
 *               torch.view.needs-compatible-strides, torch.view.otherwise-copy); `reshape` is a view where `view` would work and a copy
 *               where it would not (claim torch.reshape.view-if-compatible); `contiguous` copies a tensor that is not contiguous (claim
 *               torch.views.contiguous-copies).
 *   moved       a chain of calls that may copy, and the question is the elements moved in all. A copy moves every element the tensor holds at
 *               that point, which a slice before it may have made fewer.
 *
 * Keys come from `applyOp` of `@es/sim/tensor`, which tests/fixtures/tensor/torch-vectors.json holds to torch 2.14.0; the tests read them
 * again from the lines each ticket prints.
 */
import { below, between } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { applyOp, contiguousView, isContiguous, numel } from '@es/sim/tensor'
import type { ShiftOp, TView } from '@es/sim/tensor'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { derived, ELEMENTS, EXACT, drawOutcome, opLine, opsFromString, opsToString, otherShape, shapeFromString, shown, trace, tupleText, workedPart, NAMES } from './kit'

const FAMILY = 'tr0.view-or-copy'
const VERSION = 1
const KC = 'tr0.view-vs-copy'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'last-call', title: 'What the last call of a chain does', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'moved', title: 'The elements a chain of calls moves', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'last-call' | 'moved'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** What a call does to the buffer. */
export type Outcome = 'view' | 'copy' | 'fail'
const OUTCOMES: readonly Outcome[] = ['view', 'copy', 'fail']

/** The outcome of the last of `ops` applied to a contiguous tensor of `start`, from the `tensor` model; null if an earlier call fails. */
export function lastOutcome(start: readonly number[], ops: readonly ShiftOp[]): { outcome: Outcome; moved: number } | null {
  if (ops.length === 0) return null
  const before = trace(start, ops.slice(0, -1))
  if (before === null) return null
  const r = applyOp(before.views[before.views.length - 1], ops[ops.length - 1])
  if ('error' in r) return r.error === 'not-viewable' ? { outcome: 'fail', moved: 0 } : null
  return { outcome: r.copied > 0 ? 'copy' : 'view', moved: r.copied }
}

/** The elements moved by every call of the chain, or null when a call fails. */
export function totalMoved(start: readonly number[], ops: readonly ShiftOp[]): number | null {
  const run = trace(start, ops)
  return run === null ? null : run.copied.reduce((a, b) => a + b, 0)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drawing a scene                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

function startShape(rng: Rng, level: Level, variant: VariantId): number[] {
  const rank = level <= 1 ? 2 : 3
  return Array.from({ length: rank }, () => (variant === 'moved' ? between(rng, 2, 10) : between(rng, 2, 8)))
}

/** A call that is always a view: a transpose, a permute, a slice with a step, or a `view` to another shape the strides allow. */
function prefixOp(rng: Rng, view: TView): ShiftOp {
  const shape = view.shape
  const rank = shape.length
  const kinds = ['slice', 'view', ...(rank >= 2 ? ['transpose'] : []), ...(rank >= 3 ? ['permute'] : [])] as const
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const kind = kinds[below(rng, kinds.length)]
    let o: ShiftOp
    if (kind === 'transpose') {
      const a = below(rng, rank)
      o = { op: 'transpose', a, b: (a + 1 + below(rng, rank - 1)) % rank }
    } else if (kind === 'slice') {
      const dim = below(rng, rank)
      if (shape[dim] < 3) continue
      o = { op: 'slice', dim, start: 0, stop: shape[dim], step: 2 }
    } else if (kind === 'view') {
      const target = otherShape(rng, shape)
      if (target === null) continue
      o = { op: 'view', shape: target }
    } else {
      const order = Array.from({ length: rank }, (_, at) => (at + 1) % rank)
      o = { op: 'permute', order }
    }
    const r = applyOp(view, o)
    if (!('error' in r) && r.copied === 0) return o
  }
  return rank >= 2 ? { op: 'transpose', a: 0, b: rank - 1 } : { op: 'slice', dim: 0, start: 0, stop: shape[0], step: 1 }
}

const hasView = (outcome: Outcome, o: ShiftOp, before: TView): boolean => {
  const r = applyOp(before, o)
  return !('error' in r) && (outcome === 'copy' ? r.copied > 0 : r.copied === 0)
}

/** The last call that gives `outcome` after the calls so far, or null if none was found in a few tries. */
function closing(rng: Rng, outcome: Outcome, view: TView): ShiftOp | null {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const shape = otherShape(rng, view.shape)
    if (shape === null) return null
    const choose = below(rng, 6)
    let o: ShiftOp
    if (outcome === 'fail') o = { op: 'view', shape }
    else if (outcome === 'copy') o = choose < 4 ? { op: 'reshape', shape } : { op: 'contiguous' }
    else o = choose < 3 ? { op: 'view', shape } : { op: 'reshape', shape }
    const r = applyOp(view, o)
    if (outcome === 'fail' ? 'error' in r && r.error === 'not-viewable' : hasView(outcome, o, view)) {
      // A reshape that is a view where the learner would expect a copy is the point of the "view" outcome, and `contiguous` is asked only of a tensor that needs it.
      if (o.op === 'contiguous' && isContiguous(view)) continue
      return o
    }
  }
  return null
}

export interface Scene {
  readonly start: readonly number[]
  readonly ops: readonly ShiftOp[]
}

export function drawLast(level: Level, seed: number, outcome: Outcome, purpose: string): Scene {
  let fallback: Scene | null = null
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rng = itemRng(FAMILY, 'last-call', level, seed, `${purpose}-${attempt}`)
    const start = startShape(rng, level, 'last-call')
    const prefix = level === 3 ? 2 : level === 2 ? between(rng, 1, 2) : 1
    const ops: ShiftOp[] = []
    let view = contiguousView(start)
    for (let at = 0; at < prefix; at += 1) {
      const o = prefixOp(rng, view)
      const r = applyOp(view, o)
      if ('error' in r) continue
      ops.push(o)
      view = r.view
    }
    const last = closing(rng, outcome, view)
    if (last === null) continue
    const scene = { start, ops: [...ops, last] }
    fallback = scene
    // The first chain that gives the outcome and in which no call but the last is where the story ends.
    if (lastOutcome(scene.start, scene.ops)?.outcome === outcome) return scene
  }
  if (fallback === null) throw new RangeError(`${FAMILY}: no scene found for ${outcome}`)
  return fallback
}

export function drawMoved(level: Level, seed: number, purpose: string): Scene {
  let fallback: Scene | null = null
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rng = itemRng(FAMILY, 'moved', level, seed, `${purpose}-${attempt}`)
    const start = startShape(rng, level, 'moved')
    const count = level <= 1 ? 2 : level === 2 ? 3 : 4
    const ops: ShiftOp[] = []
    let view = contiguousView(start)
    for (let at = 0; at < count; at += 1) {
      const slot = below(rng, 5)
      let o: ShiftOp
      if (slot <= 1) o = prefixOp(rng, view)
      else if (slot === 2) o = { op: 'contiguous' }
      else {
        const shape = otherShape(rng, view.shape)
        o = shape === null ? { op: 'contiguous' } : { op: 'reshape', shape }
      }
      const r = applyOp(view, o)
      if ('error' in r) continue
      ops.push(o)
      view = r.view
    }
    if (ops.length !== count) continue
    const scene = { start, ops }
    fallback = scene
    const total = totalMoved(start, ops)
    // A chain that copies at least once, and not by the same call twice over a tensor that is already contiguous.
    if (total !== null && total > 0) return scene
  }
  if (fallback === null) throw new RangeError(`${FAMILY}: no moved scene found`)
  return fallback
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const linesOf = (scene: Scene): string[] => [`a = torch.empty(${scene.start.join(', ')})`, ...scene.ops.map((o, at) => opLine(NAMES[at + 1], NAMES[at], o))]

const givensOf = (scene: Scene): Given[] => linesOf(scene).map((line, at) => ({ label: `line ${at + 1}`, value: code(line) }))

const OPTION_TEXT: Readonly<Record<Outcome, Rich>> = {
  view: rich('It makes a view'),
  copy: rich('It makes a copy'),
  fail: rich('It fails with an error'),
}

/** The sentence that says what the last call did, and why: from the model's own answer. */
function lastWhy(scene: Scene, outcome: Outcome): Rich {
  const last = scene.ops[scene.ops.length - 1]
  const run = trace(scene.start, scene.ops.slice(0, -1))
  const view = run === null ? contiguousView(scene.start) : run.views[run.views.length - 1]
  const line = linesOf(scene)[scene.ops.length]
  const strides = rich('The strides going in are ', code(tupleText(view.strides)), ' for the shape ', code(tupleText(view.shape)), '.')
  if (last.op === 'contiguous') return rich(...strides, ' The tensor is not contiguous, so ', code(line), ' writes a new buffer and moves every element.')
  if (outcome === 'fail') {
    return rich(...strides, ' The new shape of ', code(line), ' needs a dimension that cuts across dimensions whose strides do not chain, so the strides cannot express it: view raises an error, where reshape would copy.')
  }
  if (outcome === 'copy') {
    return rich(...strides, ' The strides cannot express the new shape of ', code(line), ', so reshape writes a new buffer and moves every element, where view would raise an error.')
  }
  return rich(...strides, ' The strides can express the new shape of ', code(line), ', so no element moves: it reads the same buffer through new metadata.')
}

function lastSteps(scene: Scene, outcome: Outcome): Step[] {
  const run = trace(scene.start, scene.ops.slice(0, -1))
  const steps: Step[] = []
  if (run !== null) {
    const lines = linesOf(scene)
    scene.ops.slice(0, -1).forEach((_, at) => {
      steps.push({ text: rich('After ', code(lines[at + 1]), ' the shape is ', code(tupleText(run.views[at + 1].shape)), ' and the strides are ', code(tupleText(run.views[at + 1].strides)), '.') })
    })
  }
  steps.push({ text: lastWhy(scene, outcome) })
  return steps
}

function movedSteps(scene: Scene): Step[] {
  const run = trace(scene.start, scene.ops)
  if (run === null) throw new RangeError(`${FAMILY}: the scene is not valid`)
  const lines = linesOf(scene)
  const steps: Step[] = scene.ops.map((o, at) => {
    const after = run.views[at + 1]
    const copied = run.copied[at]
    return copied > 0
      ? { text: rich(code(lines[at + 1]), ' writes a new buffer, because the strides cannot express the result without one, and moves every element it holds, ', num(copied, { unit: ELEMENTS, tag: 'derived' }), '.') }
      : { text: rich(code(lines[at + 1]), o.op === 'contiguous' ? ' finds a tensor that is contiguous already and returns it, so it moves nothing; the strides are ' : ' is a view and moves nothing; the strides are ', code(tupleText(after.strides)), '.') }
  })
  steps.push({ text: rich('The calls move, in all, the sum of the copies above: '), result: derived(run.copied.reduce((a, b) => a + b, 0), ELEMENTS) })
  return steps
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Items                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'params'>): Scene {
  const { start, ops } = item.params
  if (typeof start !== 'string' || typeof ops !== 'string') throw new TypeError(`${FAMILY}: the params are not a scene`)
  return { start: shapeFromString(start), ops: opsFromString(ops) }
}

const paramsOf = (scene: Scene): { start: string; ops: string } => ({ start: scene.start.join(','), ops: opsToString(scene.ops, scene.start) })

function lastOptions(scene: Scene, outcome: Outcome, level: Level, seed: number): ChoiceOption[] {
  const run = trace(scene.start, scene.ops.slice(0, -1))
  const view = run === null ? contiguousView(scene.start) : run.views[run.views.length - 1]
  const last = scene.ops[scene.ops.length - 1]
  const lures: Readonly<Record<Outcome, Rich>> = {
    view: last.op === 'contiguous' ? rich('A call that writes a new buffer is a copy, not a view: this one moves every element of a tensor that is not contiguous.') : rich('The strides ', code(tupleText(view.strides)), ' decide it: where they cannot express the new shape, the call does not make a view.'),
    copy: last.op === 'view' ? rich('view never copies: where the strides cannot express the new shape it raises an error, and where they can it makes a view.') : rich('No element moves here: the strides ', code(tupleText(view.strides)), ' can express the new shape, so the result reads the same buffer.'),
    fail: last.op === 'view' ? rich('The strides ', code(tupleText(view.strides)), ' can express this shape, so view works and makes a view.') : rich('Only view raises an error when the strides cannot express a shape. reshape and contiguous never fail here: they copy instead.'),
  }
  return shown(
    FAMILY,
    'last-call',
    level,
    seed,
    OUTCOMES.map((id): ChoiceOption => ({ id, text: OPTION_TEXT[id], why: id === outcome ? lastWhy(scene, outcome) : lures[id], ...(id === outcome ? {} : { miss: `${FAMILY}.${id}-taken-for` }) })),
  )
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }
  const gen = { id: FAMILY, version: VERSION }
  if (variant === 'last-call') {
    const outcome = OUTCOMES[drawOutcome(FAMILY, 'last-call', level, seed, OUTCOMES.length)]
    const scene = drawLast(level, seed, outcome, 'scene')
    return finishItem(gen, {
      ...base,
      params: { ...paramsOf(scene), outcome },
      stem: rich('A tensor of shape ', code(tupleText(scene.start)), ' is made and then changed by the lines below. Does the last line make a view, make a copy, or fail with an error?'),
      givens: givensOf(scene),
      worked: workedPart(level, lastSteps(scene, outcome), (attempt) => {
        const other = OUTCOMES[(OUTCOMES.indexOf(outcome) + 1 + (attempt % 2)) % OUTCOMES.length]
        return lastSteps(drawLast(level, seed, other, `example-${attempt}`), other)
      }),
      answer: { kind: 'choice', label: 'what the last line does', options: lastOptions(scene, outcome, level, seed), correct: outcome },
    })
  }
  const scene = drawMoved(level, seed, 'scene')
  const key = totalMoved(scene.start, scene.ops) ?? 0
  return finishItem(gen, {
    ...base,
    params: paramsOf(scene),
    stem: rich('A tensor of shape ', code(tupleText(scene.start)), ' is made and then changed by the lines below. How many elements do the lines move in all? A view moves none, and a copy moves every element the tensor holds at that line.'),
    givens: givensOf(scene),
    worked: workedPart(level, movedSteps(scene), (attempt) => {
      const example = drawMoved(level, seed, `example-${attempt}`)
      return totalMoved(example.start, example.ops) === key ? null : movedSteps(example)
    }),
    answer: { kind: 'numeric', label: 'the elements moved', unit: ELEMENTS, truth: key, tolerance: EXACT },
  })
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const copies = run.copied.filter((c) => c > 0).length
    return copies > 0 && value === numel(scene.start) * copies
      ? { id: `${FAMILY}.counted-the-start`, message: rich('A copy moves the elements the tensor holds at that line, and a slice before it may have left fewer than it started with.') }
      : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const copies = run.copied.filter((c) => c > 0)
    return copies.length > 1 && copies.includes(value) ? { id: `${FAMILY}.one-copy`, message: rich('That is the elements one copy moves. Each line that copies moves its own, and the total is their sum.') } : null
  },
  (_item, value) => (value === 0 ? { id: `${FAMILY}.all-views`, message: rich('At least one of these lines writes a new buffer. A line moves nothing only where the strides can express its result, or where the tensor is contiguous already.') } : null),
]

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const viewOrCopy: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'View, copy or error',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the outcome is drawn first and the chain follows from it.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, DIAGNOSES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    const scene = sceneOfItem(item)
    if (item.variant === 'moved') return movedSteps(scene)
    const outcome = lastOutcome(scene.start, scene.ops)?.outcome
    if (outcome === undefined) throw new TypeError(`${FAMILY}: the params of last-call are not a scene`)
    return lastSteps(scene, outcome)
  },
}
