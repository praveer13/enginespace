/**
 * What TR0's four item families share (W2b-T29): the tolerances and the draws that the other modules' families already use, the way a
 * tensor scene is written as lines of PyTorch and read back from its params, and the shapes that a tensor of so many elements can be
 * viewed as. Each family keeps its own world, its own words and its own band in its own file.
 *
 * Every key of the tensor families comes from `@es/sim/tensor`, the model that tests/fixtures/tensor/torch-vectors.json holds to torch's
 * own answers. Like the rest of packages/play this is pure (D-017): no DOM, no clock, no entropy.
 */
import { below } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { applyOp, contiguousView, numel } from '@es/sim/tensor'
import type { ShiftOp, TView } from '@es/sim/tensor'
import type { Rich, Step } from '../../types'
import { code, num, rich } from '../../rich'

export { ARITHMETIC, EXACT, drawOutcome, oneOf, shown, workedPart } from '../tr6/kit'
export { derived, given } from '../tr2/kit'

/** The unit of a stride or of a count of elements moved. */
export const ELEMENTS = 'elements'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Operations as text                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const list = (xs: readonly number[]): string => xs.join(', ')

/** An operation as a field of params: `transpose:0:1`, `slice:1:2` (dim and step; a slice here always starts at 0 and runs to the end). */
export function opToString(o: ShiftOp, shape: readonly number[]): string {
  switch (o.op) {
    case 'view':
    case 'reshape':
    case 'expand':
      return `${o.op}:${o.shape.join(',')}`
    case 'permute':
      return `permute:${o.order.join(',')}`
    case 'transpose':
      return `transpose:${o.a}:${o.b}`
    case 'slice':
      return `slice:${o.dim}:${o.step}:${shape[o.dim] ?? 0}`
    case 'contiguous':
      return 'contiguous'
  }
}

/** The inverse of `opToString`. Throws on text that no `opToString` wrote, so a corrupt param is not read as another scene. */
export function opFromString(text: string): ShiftOp {
  const [name, ...rest] = text.split(':')
  const ints = (s: string | undefined): number[] => (s === undefined || s === '' ? [] : s.split(',').map(Number))
  switch (name) {
    case 'view':
    case 'reshape':
    case 'expand':
      return { op: name, shape: ints(rest[0]) }
    case 'permute':
      return { op: 'permute', order: ints(rest[0]) }
    case 'transpose':
      return { op: 'transpose', a: Number(rest[0]), b: Number(rest[1]) }
    case 'slice':
      return { op: 'slice', dim: Number(rest[0]), start: 0, stop: Number(rest[2]), step: Number(rest[1]) }
    case 'contiguous':
      return { op: 'contiguous' }
    default:
      throw new TypeError(`tr0: "${text}" is not an operation`)
  }
}

export const opsToString = (ops: readonly ShiftOp[], start: readonly number[]): string => {
  const parts: string[] = []
  let shape = [...start]
  for (const o of ops) {
    parts.push(opToString(o, shape))
    const r = applyOp(contiguousView(shape), o)
    // Only the shape of the running view matters for the next slice's size, and a contiguous start of this shape is the same shape.
    if (!('error' in r)) shape = [...r.view.shape]
  }
  return parts.join(';')
}

export const opsFromString = (text: string): ShiftOp[] => (text === '' ? [] : text.split(';').map(opFromString))

export const shapeFromString = (text: string): number[] => text.split(',').map(Number)

/** The line of PyTorch that applies `o` to the tensor called `from`, as the learner reads it: `b = a.transpose(0, 1)`. */
export function opLine(into: string, from: string, o: ShiftOp): string {
  const rhs = ((): string => {
    switch (o.op) {
      case 'view':
      case 'reshape':
      case 'expand':
        return `${from}.${o.op}(${list(o.shape)})`
      case 'permute':
        return `${from}.permute(${list(o.order)})`
      case 'transpose':
        return `${from}.transpose(${o.a}, ${o.b})`
      case 'slice':
        return `${from}[${':, '.repeat(o.dim)}::${o.step}]`
      case 'contiguous':
        return `${from}.contiguous()`
    }
  })()
  return `${into} = ${rhs}`
}

export const NAMES = ['a', 'b', 'c', 'd', 'e'] as const

/** The lines of a scene: the start, then one line for each operation. */
export function sceneLines(start: readonly number[], ops: readonly ShiftOp[]): string[] {
  const lines = [`a = torch.empty(${list(start)})`]
  ops.forEach((o, at) => {
    lines.push(opLine(NAMES[at + 1], NAMES[at], o))
  })
  return lines
}

/** The views of a scene, from the contiguous start through each operation, or null if some operation is an error. */
export function trace(start: readonly number[], ops: readonly ShiftOp[]): { views: TView[]; copied: number[] } | null {
  const views: TView[] = [contiguousView(start)]
  const copied: number[] = []
  for (const o of ops) {
    const r = applyOp(views[views.length - 1], o)
    if ('error' in r) return null
    views.push(r.view)
    copied.push(r.copied)
  }
  return { views, copied }
}

/** A tuple as it is printed: `(6, 1)`. */
export const tupleText = (xs: readonly number[]): string => `(${list(xs)})`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Shapes                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Every shape of rank 1 to `maxRank` with dims of at least 2 whose product is `n`, in a fixed order. */
export function shapesOf(n: number, maxRank = 3): number[][] {
  const out: number[][] = []
  const grow = (rest: number, prefix: number[]): void => {
    if (rest === 1) {
      if (prefix.length > 0) out.push(prefix)
      return
    }
    if (prefix.length === maxRank) return
    for (let d = 2; d <= rest; d += 1) if (rest % d === 0) grow(rest / d, [...prefix, d])
  }
  grow(n, [])
  return out
}

/** A random shape of the same element count as `shape` and not equal to it, or null when there is none. */
export function otherShape(rng: Rng, shape: readonly number[], maxRank = 3): number[] | null {
  const n = numel(shape)
  const options = shapesOf(n, maxRank).filter((s) => s.join() !== shape.join())
  return options.length === 0 ? null : options[below(rng, options.length)]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A step of a solution that shows the strides after a line. */
export function lineStep(line: string, view: TView): Step {
  return { text: rich('After ', code(line), ' the shape is ', code(tupleText(view.shape)), ' and the strides are ', code(tupleText(view.strides)), '.') }
}

/** A step that ends in a number. */
export function keyStep(words: Rich, value: number, unit: string): Step {
  return { text: words, result: num(value, { unit, tag: 'derived' }) }
}
