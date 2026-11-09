/**
 * The court's judgement of one case (GAMES.md §11 "Scoring and pass", ASSESSMENT §4.3):
 *   - the flaw is right;
 *   - the p99 falls within ±15% of the recomputed value [estimated];
 *   - the interval contains the recomputed value and is no wider than twice the court's bootstrap interval [estimated].
 * A case stands when all three hold. The arithmetic is in integers: a tolerance in permille and a width as a multiple, against µs, so
 * the same answer gives the same ruling in every runtime and in the grader's replay (D-017). The interval is also scored by log score
 * (logscore.ts), which says how good the learner's range was and moves no pass.
 *
 * The recomputed value is the true flaw's corrected p99 whatever flaw the learner named: a learner who names the wrong flaw and writes
 * the right number has the number right.
 */
import type { Us } from '@es/sim/core'
import { intervalScoreMilli } from './logscore'
import type { Flaw, Prediction } from './types'

/** The p99 passes within this share of the recomputed one, out of 1,000 [estimated: GAMES.md §11]. */
export const NUMBER_TOLERANCE_PERMILLE = 150

/** The interval passes when it is at most this many times as wide as the court's bootstrap interval [estimated: GAMES.md §11]. */
export const INTERVAL_WIDTH_FACTOR = 2

/**
 * The largest µs a prediction may name: about 11.6 days. A p99 above it is not a latency, and below it every product in `judge`
 * stays under 2^53, so the integer arithmetic is exact.
 */
export const MAX_PREDICTION_US = 1_000_000_000_000

/** What the court knows of the answer: the recomputed p99 and the court's own interval on it. */
export interface Key {
  readonly p99Us: Us
  readonly ciLoUs: Us
  readonly ciHiUs: Us
}

export interface Verdict {
  readonly flawOk: boolean
  readonly numberOk: boolean
  readonly intervalOk: boolean
  /** The interval's log score in thousandths of a decade, lower is better. */
  readonly scoreMilli: number
}

/** Whether `p99Us` is within the tolerance of the key: `|p − t| · 1,000 ≤ 150 · t`. */
export const withinTolerance = (key: Key, p99Us: Us): boolean => Math.abs(p99Us - key.p99Us) * 1000 <= NUMBER_TOLERANCE_PERMILLE * key.p99Us

/** Whether the range holds the key and is at most twice as wide as the court's. */
export const intervalStands = (key: Key, loUs: Us, hiUs: Us): boolean => loUs <= key.p99Us && key.p99Us <= hiUs && hiUs - loUs <= INTERVAL_WIDTH_FACTOR * (key.ciHiUs - key.ciLoUs)

/** The court's judgement of one filed case: the flaw named against the true one, and the prediction against the key. */
export function judge(key: Key, trueFlaw: Flaw, named: Flaw, a: Prediction): Verdict {
  return {
    flawOk: named === trueFlaw,
    numberOk: withinTolerance(key, a.p99Us),
    intervalOk: intervalStands(key, a.loUs, a.hiUs),
    scoreMilli: intervalScoreMilli(a.loUs, a.hiUs, key.p99Us),
  }
}

/** Whether a ruling stands: the flaw, the number and the interval, all three. */
export const stands = (v: Pick<Verdict, 'flawOk' | 'numberOk' | 'intervalOk'>): boolean => v.flawOk && v.numberOk && v.intervalOk
