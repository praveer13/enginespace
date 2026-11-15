import type { CompiledBlock } from '@es/schema'
import type { PredictAnswer, PredictValue } from '@es/play/predictions/grade'
import { parseNumber } from '@/items/answer'
import { readoutUnit } from './model'

/*
 * What the prediction box reads from a slip (W1b-T02): the number a learner wrote, the option they ticked, or the two ends of a range,
 * checked before the prediction is committed, because a committed prediction does not change. Small pure functions, so that a test can
 * hold them to a table without a browser. A slip that is not an answer is a sentence that says what to write and how, and never a guess
 * at what was meant: the box asks again.
 */

type PredictBlock = Extract<CompiledBlock, { type: 'predict' }>

/** The unit as the readout names it (`us` is µs, `percent` is %), or undefined for a unit the readout has no name for (`boundaries`). */
export const readoutName = (unit: string): ReturnType<typeof readoutUnit> => (unit === 'percent' ? '%' : readoutUnit(unit))

/** A unit as the learner reads it: the readout's name for it, or what the lesson writes when the readout has none. */
export const unitName = (unit: string): string => readoutName(unit) ?? unit

/** Reads a number in a unit from a slip: the number alone, or followed by the unit as the page prints it or as the lesson writes it (`380 µs`, `380 us`, `15 %`). */
export function readNumber(text: string, unit: string): number | null {
  const printed = unitName(unit)
  return parseNumber(text, printed) ?? (printed === unit ? null : parseNumber(text, unit))
}

/** What the learner typed and ticked. */
export interface Slip {
  readonly text: string
  readonly pick: string | null
  readonly lo: string
  readonly hi: string
}

export type Read = { readonly ok: true; readonly value: PredictValue } | { readonly ok: false; readonly problem: string }

/** The value on a slip for the shape of answer a prediction asks for, or the sentence that says what is missing. */
export function readSlip(answer: PredictAnswer, slip: Slip): Read {
  switch (answer.kind) {
    case 'numeric': {
      const value = readNumber(slip.text, answer.unit)
      return value === null ? { ok: false, problem: `Write a number, in ${unitName(answer.unit)}, and then commit.` } : { ok: true, value }
    }
    case 'choice':
      return slip.pick === null || !answer.options.some((option) => option.id === slip.pick)
        ? { ok: false, problem: 'Tick one line, and then commit.' }
        : { ok: true, value: slip.pick }
    case 'interval': {
      const lo = readNumber(slip.lo, answer.unit)
      const hi = readNumber(slip.hi, answer.unit)
      // The score is on logarithms, so a range is of positive numbers; one written the wrong way round is read the way it was meant.
      if (lo === null || hi === null || !(lo > 0) || !(hi > 0)) {
        return { ok: false, problem: `Write the low end and the high end, in ${unitName(answer.unit)}, both above nothing, and then commit.` }
      }
      return { ok: true, value: { lo: Math.min(lo, hi), hi: Math.max(lo, hi) } }
    }
  }
}

/** The text of the option with this id, or the id itself for one the block does not list. */
export const optionText = (block: PredictBlock, id: string): string => (block.answer.kind === 'choice' ? (block.answer.options.find((option) => option.id === id)?.text ?? id) : id)
