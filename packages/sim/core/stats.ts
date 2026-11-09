// Integer statistics (ARCHITECTURE §5.2 `core`, §5.6): sums, a numeric sort, and nearest-rank percentiles.
//
// Percentiles are nearest rank on a sorted list of integers (§5.6), so every percentile is one of the data, with no
// interpolation to disagree between languages.

import { divCeil, divRound, isUint } from './int'

/** The comparator of an ascending numeric sort. `Array.prototype.sort` without one orders by string (§5.1). */
export const compareAsc = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0)

/** A sorted copy, ascending. */
export function sortedAsc(xs: readonly number[]): number[] {
  return [...xs].sort(compareAsc)
}

/** The exact sum of integers. It throws on a non-integer and on a total beyond ±2^53, where the sum would stop being exact. */
export function sum(xs: readonly number[]): number {
  let total = 0
  for (const x of xs) {
    if (!Number.isSafeInteger(x)) throw new RangeError(`sum takes integers below 2^53, got ${x}`)
    total += x
    if (!Number.isSafeInteger(total)) throw new RangeError('the sum is beyond 2^53')
  }
  return total
}

/** The mean of non-negative integers, rounded to the nearest integer (halves up). */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError('the mean of an empty sample')
  return divRound(sum(xs), xs.length)
}

/**
 * The p-th percentile by nearest rank, for `sorted` ascending and p in permille, 0 to 1,000: the value at 1-based rank
 * ⌈p · n / 1000⌉, and the smallest value for p = 0. The list's order is the caller's promise.
 */
export function nearestRank(sorted: readonly number[], pPermille: number): number {
  const n = sorted.length
  if (n === 0) throw new RangeError('a percentile of an empty sample')
  if (!isUint(pPermille) || pPermille > 1000) throw new RangeError(`a percentile is an integer from 0 to 1000 permille, got ${pPermille}`)
  const rank = pPermille === 0 ? 1 : divCeil(pPermille * n, 1000)
  return sorted[rank - 1]
}

/** Nearest-rank percentile of an unsorted sample, which it leaves as it was. */
export function percentile(xs: readonly number[], pPermille: number): number {
  return nearestRank(sortedAsc(xs), pPermille)
}
