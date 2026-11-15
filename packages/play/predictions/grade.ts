/**
 * Grading a prediction at its reveal (ASSESSMENT §4.7): "numeric within the prediction's tolerance, an interval by log score, or a choice".
 *
 * The three shapes are the lesson block's own (`answer` in packages/schema's `predictShape`): a number within a relative tolerance, where
 * 0 asks for the exact value; one option of a few, by id; or a range that should hold the true value. The truth is the model's, read from
 * a run (./truth), and the verdict is a function of the two and of the shape. A prediction moves no completion and no credit (§4.7), so
 * the score is the learner's own check on their estimate: it is written to the ledger and read by Today, which a prediction may
 * reschedule an idea in and never earn one.
 */
import type { CompiledBlock } from '@es/schema'
import { intervalScoreMilli } from '../broken-bench/logscore'
import { withinTolerance } from '../items/grade'
import type { Truth } from './types'

/** The shape of the answer a `predict` block asks for. */
export type PredictAnswer = Extract<CompiledBlock, { type: 'predict' }>['answer']

/** What a learner wrote: a number, the id of an option, or the ends of a range. */
export type PredictValue = number | string | { readonly lo: number; readonly hi: number }

export interface Verdict {
  /** The number was within the tolerance, the option was the right one, or the range held the truth. */
  readonly ok: boolean
  /** In [0, 1]: 1 or 0 for a number and a choice, and for a range 1 ÷ (1 + the interval score in decades), so that a tight range that holds the truth scores near 1. */
  readonly score: number
}

/**
 * The verdict on a value against the model's truth. Throws when the value and the truth are not of the shape that the answer asks for, or
 * when a range's ends and the truth are not positive (the score is on logarithms): the box checks a slip before it commits, so a throw
 * here is a bug and not a learner's mistake.
 */
export function gradePrediction(answer: PredictAnswer, value: PredictValue, truth: Truth): Verdict {
  switch (answer.kind) {
    case 'numeric': {
      if (typeof value !== 'number' || typeof truth !== 'number') throw new TypeError('a numeric prediction is a number against a number')
      const ok = withinTolerance(truth, value, answer.rel_tol === 0 ? {} : { rel: answer.rel_tol })
      return { ok, score: ok ? 1 : 0 }
    }
    case 'choice': {
      if (typeof value !== 'string' || typeof truth !== 'string') throw new TypeError('a choice is the id of an option against the id of the right one')
      if (!answer.options.some((option) => option.id === value)) throw new RangeError(`"${value}" is not an option of this prediction`)
      const ok = value === truth
      return { ok, score: ok ? 1 : 0 }
    }
    case 'interval': {
      if (typeof value !== 'object' || typeof truth !== 'number') throw new TypeError('an interval is a range against a number')
      if (!(value.lo > 0) || !(value.hi > 0) || !(truth > 0)) throw new RangeError('the score is on logarithms: the ends of the range and the truth must be positive')
      const lo = Math.min(value.lo, value.hi)
      const hi = Math.max(value.lo, value.hi)
      const decades = intervalScoreMilli(lo, hi, truth) / 1000
      return { ok: lo <= truth && truth <= hi, score: 1 / (1 + decades) }
    }
  }
}
