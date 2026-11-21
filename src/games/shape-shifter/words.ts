import type { ShiftOp } from '@es/sim/tensor'
import { kindName, opText, shapeText, tupleText } from '@es/play/shape-shifter/labels'
import type { OpKind } from '@es/play/shape-shifter/types'

/*
 * The words the page builds around Tensor views' figures: plurals, an operation as a button and as a sentence, and the parts of a copy
 * line written with backticks (packages/play/shape-shifter/copy.ts) as plain words for the places that take a string. Display only: no
 * state holds them.
 */

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** A line of copy.ts with its code spans as plain words: the live region and a moment note take text, not code. */
export const plainWords = (line: string): string => line.replace(/`([^`]*)`/g, '$1')

/** Each piece of a line of copy.ts: words, and code spans (an operation's name, `tl.arange`), in order. */
export function codePieces(line: string): readonly { readonly code: boolean; readonly text: string }[] {
  return line.split('`').map((text, i) => ({ code: i % 2 === 1, text }))
}

/** What an operation button says: the operation's own name, `contiguous()` with its brackets. */
export const opButton = (kind: OpKind): string => kindName(kind)

/** An operation as the log and the reference's plan write it: `transpose(0, 1)`, `view([24])`. */
export const opWords = (op: ShiftOp): string => opText(op)

/** What a choice in a picker says: a shape as an operation takes it, an order, or a pair of dimensions. */
export const shapeChoice = (shape: readonly number[]): string => shapeText(shape)
export const orderChoice = (order: readonly number[]): string => tupleText(order)
export const pairChoice = (a: number, b: number): string => `${a} and ${b}`

/** The name a picker's choice is read by: the operation it applies, in full. */
export function choiceLabel(op: ShiftOp): string {
  switch (op.op) {
    case 'transpose':
      return `transpose dimensions ${op.a} and ${op.b}`
    case 'permute':
      return `permute to the order ${tupleText(op.order)}`
    case 'view':
    case 'reshape':
    case 'expand':
      return `${op.op} to the shape ${shapeText(op.shape)}`
    case 'contiguous':
      return 'contiguous()'
    case 'slice':
      return opText(op)
  }
}

/** "1 copy", "0 copies". */
export const copiesWord = (n: number): string => plural(n, 'copy', 'copies')

/** "1 element", "24 elements". */
export const elementsWord = (n: number): string => plural(n, 'element', 'elements')

/** The unit of a guess, as the field's hint says it. */
export const UNIT_WORDS = { elements: 'elements', addresses: 'addresses', copies: 'copies', lanes: 'lanes' } as const
