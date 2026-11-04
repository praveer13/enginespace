/**
 * Building and reading `Rich` text (types.ts): the few helpers a family writes its sentences with, and the plain-text form that
 * the gate, the screen-reader label and the leak scan read.
 *
 * A number is a `num` part and not digits in a sentence, so that every figure on a ticket carries its tag. These helpers leave out
 * a key that is `undefined` instead of writing it, because an item has a canonical JSON form (packages/sim `canonicalJson`), and
 * that form has no `undefined`.
 */
import type { ItemTag, NumPart, Part, Rich } from './types'

/** A run of words. */
export const text = (words: string): Part => ({ t: 'text', text: words })

/** Code or an identifier, printed in the mono face. */
export const code = (source: string): Part => ({ t: 'code', code: source })

export interface NumOptions {
  /** Printed after the number, as the readout writes it: `µs`, `ms`, `tokens`, `x`. */
  unit?: string
  /** How the number is known. A scenario number of the course's invented world is `synthetic`, and so is the default. */
  tag?: ItemTag
  /** Digits after the point. */
  digits?: number
}

/** A number with its tag. */
export function num(value: number, options: NumOptions = {}): NumPart {
  const { unit, tag = 'synthetic', digits } = options
  return { t: 'num', value, tag, ...(unit === undefined ? {} : { unit }), ...(digits === undefined ? {} : { digits }) }
}

/** A sentence: a string is a run of words, and a part is itself. */
export function rich(...bits: readonly (string | Part)[]): Rich {
  return bits.map((bit) => (typeof bit === 'string' ? text(bit) : bit))
}

/** A number as it is printed: grouped by thousands, fixed digits, a true minus. (`toFixed` is exact in every engine.) */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  const [whole, fraction] = Math.abs(value).toFixed(digits).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${value < 0 ? '−' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}

/** One part as a person reads it. */
export function partText(part: Part): string {
  switch (part.t) {
    case 'text':
      return part.text
    case 'code':
      return part.code
    case 'num':
      return `${formatNumber(part.value, part.digits)}${part.unit === undefined ? '' : ` ${part.unit}`}`
  }
}

/** Text made of parts, as one string. */
export function plain(parts: Rich): string {
  return parts.map(partText).join('')
}

/** The text parts of `parts`, which is where a digit that carries no tag could hide. */
export function textOf(parts: Rich): string[] {
  return parts.filter((part): part is Extract<Part, { t: 'text' }> => part.t === 'text').map((part) => part.text)
}
