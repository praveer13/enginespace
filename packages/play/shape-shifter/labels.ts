/**
 * What the diagram writes on a thing (GAMES.md §4.1): the table's lines, a slice's tag, a program's index, a shared cell's count and an
 * operation as the learner reads it.
 *
 * These are display text. The state holds the figures, never these strings, and rewording one moves no state hash. An element's label is
 * its number, the address it had in the start's buffer, and an address is a count of elements, never of bytes.
 */
import { isContiguous } from '@es/sim/tensor'
import type { ShiftOp, TView } from '@es/sim/tensor'
import type { OpKind } from './types'

const list = (xs: readonly number[]): string => xs.join(', ')

/** `[4, 6]`, a shape as an operation takes it. */
export const shapeText = (shape: readonly number[]): string => `[${list(shape)}]`

/** `(1, 6)`, the strides or the shape as the table's line writes them. */
export const tupleText = (xs: readonly number[]): string => `(${list(xs)})`

/** The table in one line, as the phone shows it over the cells: `shape (6, 4) · strides (1, 6) · offset 0 · contiguous no`. */
export const tableLine = (v: TView): string => `shape ${tupleText(v.shape)} · strides ${tupleText(v.strides)} · offset ${v.offset} · contiguous ${isContiguous(v) ? 'yes' : 'no'}`

/** The tag over one grid of a rank-3 tensor's cells: the index of the first dimension. */
export const sliceLabel = (i: number): string => `[${i}]`

/** A program's label: its index along each dimension. */
export const programLabel = (index: readonly number[]): string => `(${list(index)})`

/** The count on a buffer cell that several elements share (stride 0). */
export const sharedLabel = (reads: number): string => `× ${reads}`

/** An operation's name as the buttons spell it: `contiguous()` carries its brackets. */
export const kindName = (op: OpKind): string => (op === 'contiguous' ? 'contiguous()' : op)

/** An operation with its arguments, as the log and the first-move line say it. */
export function opText(op: ShiftOp): string {
  switch (op.op) {
    case 'view':
    case 'reshape':
    case 'expand':
      return `${op.op}(${shapeText(op.shape)})`
    case 'permute':
      return `permute(${tupleText(op.order)})`
    case 'transpose':
      return `transpose(${op.a}, ${op.b})`
    case 'slice':
      return `slice(dim ${op.dim}, ${op.start}:${op.stop}:${op.step})`
    case 'contiguous':
      return 'contiguous()'
  }
}
