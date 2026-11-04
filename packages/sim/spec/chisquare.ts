// Pearson's chi-square goodness of fit of a sampler's counts against a target p (ARCHITECTURE §5.5, §8.3).
//
// The statistic is Σ (O − E)² ÷ E over the tokens, with E = N · p ÷ total. With p an integer weight, that is (O·total − N·w)² ÷
// (total · N·w) per token: the numerator's base is an exact integer, so the only floating point is the square, the quotient and the
// sum, which IEEE 754 makes the same bits in every engine. The sum runs over the bins in token order, with a pool that stands alone
// last. The critical values come from a generated table of integers (critical.ts), so nothing here calls Math.log or Math.exp.

import { sum } from '../core/stats'
import type { Dist } from './dist'
import { CRITICAL, CRITICAL_MAX_DF, CRITICAL_SCALE } from './critical'

export { CRITICAL, CRITICAL_MAX_DF, CRITICAL_SCALE }

/** A level of the table: the probability that an exact sampler's statistic exceeds the critical value. */
export type CriticalLevel = keyof typeof CRITICAL

/** A token is tested alone only if its expected count is at least this; the smaller ones are pooled (upstream's rule, claim vllm.spec.chi-square.min-expected) [estimated]. */
export const MIN_EXPECTED = 5

interface Bin {
  observed: number
  /** Expected count × total: N · weight, an integer. */
  scaled: number
}

/**
 * The statistic and the degrees of freedom for `counts` (one per token, from tokens drawn by a sampler that should follow p).
 *
 * Tokens of weight 0 are not categories. If one was drawn, the sampler emitted what p rules out, and the statistic is Infinity: that
 * is a certain failure, not a statistical one. Tokens whose expected count is under MIN_EXPECTED are pooled into one bin, and a pool
 * that is itself under it joins the kept bin with the least expected count (the lowest token on a tie). The degrees of freedom are
 * the bins minus one, so a p with one possible token has df 0 and statistic 0.
 */
export function chiSquare(counts: readonly number[], p: Dist): { stat: number; df: number } {
  if (counts.length !== p.weights.length) throw new RangeError(`${counts.length} counts for a distribution of ${p.weights.length} tokens`)
  for (const c of counts) {
    if (!Number.isSafeInteger(c) || c < 0) throw new RangeError(`a count is a non-negative integer, got ${c}`)
  }
  const n = sum(counts)
  if (n < 1) throw new RangeError('no draws to test')
  const bins: Bin[] = []
  const pool: Bin = { observed: 0, scaled: 0 }
  let pooled = 0
  let impossible = false
  for (let i = 0; i < counts.length; i++) {
    const w = p.weights[i]
    if (w === 0) {
      if (counts[i] > 0) impossible = true
      continue
    }
    const scaled = n * w
    if (scaled < MIN_EXPECTED * p.total) {
      pool.observed += counts[i]
      pool.scaled += scaled
      pooled++
    } else {
      bins.push({ observed: counts[i], scaled })
    }
  }
  if (pooled > 0) {
    if (pool.scaled >= MIN_EXPECTED * p.total || bins.length === 0) bins.push(pool)
    else {
      let least = 0
      for (let i = 1; i < bins.length; i++) if (bins[i].scaled < bins[least].scaled) least = i
      bins[least] = { observed: bins[least].observed + pool.observed, scaled: bins[least].scaled + pool.scaled }
    }
  }
  let stat = 0
  for (const { observed, scaled } of bins) {
    const d = observed * p.total - scaled
    stat += (d * d) / (p.total * scaled)
  }
  return { stat: impossible ? Infinity : stat, df: bins.length - 1 }
}

/** The critical value for `df` degrees of freedom at `level`: the table's integer ÷ 1000. */
export function criticalValue(level: CriticalLevel, df: number): number {
  if (!Number.isInteger(df) || df < 0 || df > CRITICAL_MAX_DF) throw new RangeError(`df must be an integer from 0 to ${CRITICAL_MAX_DF}, got ${df}`)
  return CRITICAL[level][df] / CRITICAL_SCALE
}

/** Whether a statistic is beyond the critical value of `level`: an exact sampler's is, with probability about the level or less (the chi-square approximation's, which the rates test measures). */
export function exceedsCritical(stat: number, df: number, level: CriticalLevel): boolean {
  return stat > criticalValue(level, df)
}
