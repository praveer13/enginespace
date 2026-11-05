/**
 * The interval's log score (ASSESSMENT §4.7, GAMES.md §11: "predicts the corrected p99 with an interval, scored by log score").
 *
 * It is kernelspace's: the Winkler interval score of a 90% interval, taken on the logarithm of the numbers, so that missing by a factor
 * costs the same at 100 ms and at 100 s. For an interval [lo, hi] and a truth t, with L the log base 10:
 *
 *     S = (L(hi) − L(lo)) + 20 · max(0, L(lo) − L(t)) + 20 · max(0, L(t) − L(hi))
 *
 * and lower is better. The first term is the interval's width in decades, which is what a wide guess costs; the other two are the 20
 * decades of penalty for each decade the truth falls outside, which is 2 ÷ 0.1 for a 90% interval [measured: kernelspace's
 * `winkler` in `src/lib/items/grade.ts` at d478f91, `WINKLER_PENALTY = 20`]. An interval that holds the truth costs only its width.
 *
 * Math.log is banned in this package (D-017: its last bit differs between engines), and the score is part of a ruling that the state
 * keeps and hashes. So the logarithm here is written with the four operations IEEE 754 fixes exactly, which every engine rounds the
 * same way: halve or double the number into [√½, √2), then sum the series 2 · (z + z³/3 + z⁵/5 + …) for z = (m − 1) ÷ (m + 1), where
 * |z| ≤ 0.172 and 21 terms leave less than 10⁻³⁰ of truncation. The result agrees with Math.log to a few units in the last place
 * (tests/play/broken-bench-logscore.test.ts), and what is stored is the score rounded to a thousandth.
 */

const LN2 = 0.6931471805599453
const LN10 = 2.302585092994046
const SQRT2 = 1.4142135623730951
const SQRT_HALF = 0.7071067811865476

/** The penalty weight 2 ÷ α for a 90% interval (α = 0.1). */
export const WINKLER_PENALTY = 20

/** ln x for a positive finite x, by the series above. Throws for anything else, since the score of a number with no logarithm is meaningless. */
export function ln(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError(`the logarithm is of a positive number, got ${x}`)
  let m = x
  let k = 0
  while (m >= SQRT2) {
    m /= 2
    k += 1
  }
  while (m < SQRT_HALF) {
    m *= 2
    k -= 1
  }
  const z = (m - 1) / (m + 1)
  const z2 = z * z
  let term = z
  let sum = 0
  for (let i = 1; i <= 41; i += 2) {
    sum += term / i
    term *= z2
  }
  return 2 * sum + k * LN2
}

/** log₁₀ x, as `ln` gives it. */
export const log10 = (x: number): number => ln(x) / LN10

/**
 * The interval score of [lo, hi] against `truth`, in decades and as a number of thousandths of a decade, rounded (lower is better).
 * A reversed interval is read the way it was meant. All three must be positive.
 */
export function intervalScoreMilli(lo: number, hi: number, truth: number): number {
  const a = log10(Math.min(lo, hi))
  const b = log10(Math.max(lo, hi))
  const t = log10(truth)
  const score = b - a + WINKLER_PENALTY * Math.max(0, a - t) + WINKLER_PENALTY * Math.max(0, t - b)
  return Math.round(score * 1000)
}
