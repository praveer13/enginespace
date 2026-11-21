/*
 * The worked numbers of TR0's lessons, computed from the course's tensor model (`packages/sim/tensor`) and Tensor views' levels, so that a
 * number a lesson prints is one this file recomputes. `tests/content/tr0-module.test.ts` holds each lesson's text to these functions, and
 * when the model or a level's practice seed moves a number, the test names the lesson and the figure that went stale.
 *
 * Every tensor here is synthetic: the model follows PyTorch's view rules for the strides alone, and tests/sim/tensor-torch.test.ts holds it
 * to what torch answered. A lesson tags a number of a level's run [synthetic] and gives the day and the commit it was printed at.
 */
import { addresses, applyOp, contiguousView, isContiguous } from '../../packages/sim/tensor'
import type { ShiftOp, TView } from '../../packages/sim/tensor'
import { SHAPE_SHIFTER } from '../../packages/play/shape-shifter/entry'
import { opText } from '../../packages/play/shape-shifter/labels'
import { buildLevel } from '../../packages/play/shape-shifter/levels'
import type { LayoutLevel, ShiftLevelId } from '../../packages/play/shape-shifter/types'
import type { ModelTable } from './module-kit'

/** A level of Tensor views on its pinned practice seed, which is the run a lesson's practice block plays. */
export function practiceLevel(id: Exclude<ShiftLevelId, 'grid'>): LayoutLevel {
  const seed = SHAPE_SHIFTER.levels.find((level) => level.id === id)?.practiceSeed
  if (seed === undefined) throw new Error(`Tensor views has no practice seed for ${id}`)
  const level = buildLevel(id, seed)
  if (level.kind !== 'layout') throw new Error(`${id} is not a layout level`)
  return level
}

/** A tuple as Python prints it: `(4, 6)`, and `(24,)` for one element. */
export const pyTuple = (xs: readonly number[]): string => (xs.length === 1 ? `(${xs[0]},)` : `(${xs.join(', ')})`)

const code = (text: string): string => `\`${text}\``

/** One step of a chain: the tensor after it, and the elements it moved. */
export interface Step {
  readonly op: ShiftOp | null
  readonly view: TView
  readonly moved: number
}

/** The tensors along a chain of operations from a start, the start first. Throws on an operation the model refuses. */
export function chain(start: TView, ops: readonly ShiftOp[]): Step[] {
  const steps: Step[] = [{ op: null, view: start, moved: 0 }]
  for (const op of ops) {
    const out = applyOp(steps[steps.length - 1].view, op)
    if ('error' in out) throw new Error(`the model refuses ${opText(op)}: ${out.error}`)
    steps.push({ op, view: out.view, moved: out.copied })
  }
  return steps
}

/** The reference's run on `views` at its practice seed: the start, `transpose(0, 1)` and `reshape([24])`. */
export const viewsRun = (): Step[] => {
  const task = practiceLevel('views').tasks[0]
  return chain(task.start, task.ghost)
}

/** The run on `stride-zero` at its practice seed: `expand`, then `contiguous()`. */
export const strideZeroRun = (): Step[] => {
  const task = practiceLevel('stride-zero').tasks[0]
  return chain(task.start, task.ghost)
}

/** The addresses that the transposed tensor of `views` reads first, in the order of its indices. */
export const transposedWalk = (count: number): number[] => addresses(viewsRun()[1].view).slice(0, count)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface NumericPrediction {
  readonly kind: 'numeric'
  readonly unit: string
  readonly reference: () => number
}

/** The figure each prediction's answer is, from the numbers of its prompt alone and the tensor model. */
export const PREDICTIONS: Readonly<Record<string, NumericPrediction>> = {
  // A (4, 6) tensor, transposed, then read as one row: the reshape cannot be a view, and its copy moves every element.
  'tr0.l1.p1': {
    kind: 'numeric',
    unit: 'elements',
    reference: () => {
      const steps = chain(contiguousView([4, 6]), [{ op: 'transpose', a: 0, b: 1 }, { op: 'reshape', shape: [24] }])
      return steps.reduce((sum, step) => sum + step.moved, 0)
    },
  },
  // x[:, ::2] on a contiguous (3, 5) tensor: the step multiplies the columns' stride.
  'tr0.l1.p2': {
    kind: 'numeric',
    unit: 'elements',
    reference: () => chain(contiguousView([3, 5]), [{ op: 'slice', dim: 1, start: 0, stop: 5, step: 2 }])[1].view.strides[1],
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1's table of slices, transposes and copies                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The calls of lesson 1's second table, each on a contiguous (4, 6) tensor, as the lesson spells them, with the model's operations. */
export const CALLS: readonly (readonly [string, readonly ShiftOp[]])[] = [
  ['x[1:, :]', [{ op: 'slice', dim: 0, start: 1, stop: 4, step: 1 }]],
  ['x[:, ::2]', [{ op: 'slice', dim: 1, start: 0, stop: 6, step: 2 }]],
  ['x.transpose(0, 1)', [{ op: 'transpose', a: 0, b: 1 }]],
  ['x.transpose(0, 1).contiguous()', [{ op: 'transpose', a: 0, b: 1 }, { op: 'contiguous' }]],
]

/** The rows of that table: the call, then the offset, the shape and the strides the model gives, and what it moved. */
export function callRows(): string[][] {
  return CALLS.map(([call, ops]) => {
    const steps = chain(contiguousView([4, 6]), ops)
    const end = steps[steps.length - 1].view
    const moved = steps.reduce((sum, step) => sum + step.moved, 0)
    return [code(call), code(String(end.offset)), code(pyTuple(end.shape)), code(pyTuple(end.strides)), moved === 0 ? 'nothing' : 'every element, into a new buffer']
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model tables                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Every table of TR0's lessons whose header or caption carries [synthetic]: the header row word for word, tags included, and the rows that
 * the model recomputes. The module kit (module-kit.ts) fails a lesson that prints a model table this list does not hold.
 */
export const MODEL_TABLES: readonly ModelTable[] = [
  {
    lesson: 'tr0.l1',
    header: '| After | Shape [synthetic] | Strides [synthetic] | Contiguous | Elements moved [synthetic] |',
    rows: () =>
      viewsRun().map((step) => [
        step.op === null ? 'the start' : code(opText(step.op)),
        code(pyTuple(step.view.shape)),
        code(pyTuple(step.view.strides)),
        isContiguous(step.view) ? 'yes' : 'no',
        String(step.moved),
      ]),
  },
]
