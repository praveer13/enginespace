/*
 * The court's judgement and the interval's log score (GAMES.md §11 "Scoring and pass"; ASSESSMENT §4.3, §4.7):
 *   - a p99 is right within 15% of the recomputed one, a range is right when it holds that number and is at most twice as wide as the
 *     court's own bootstrap interval, and the flaw is right when it is the true one [estimated bars];
 *   - the interval is scored by log score, kernelspace's Winkler score of a 90% interval in decades, written here with the four operations
 *     that every engine rounds alike, since Math.log is banned in the pure packages (D-017).
 */
import { describe, expect, test } from 'bun:test'
import { rngFor } from '@es/sim/core'
import { INTERVAL_WIDTH_FACTOR, MAX_PREDICTION_US, NUMBER_TOLERANCE_PERMILLE, intervalStands, judge, stands, withinTolerance } from '@es/play/broken-bench/judge'
import { WINKLER_PENALTY, intervalScoreMilli, ln, log10 } from '@es/play/broken-bench/logscore'

describe('the logarithm', () => {
  test('agrees with Math.log to a few units in the last place, over a wide grid', () => {
    const values = [1e-9, 0.001, 0.1, 0.5, 0.7071, 0.9999, 1, 1.0001, 1.4142, 1.5, 2, 2.718281828, 10, 99.5, 1e3, 12345.678, 1e6, 123456789, 2 ** 40, 1e15, Number.MAX_SAFE_INTEGER]
    for (const x of values) {
      const got = ln(x)
      const want = Math.log(x)
      expect([x, Math.abs(got - want) <= 1e-13 * Math.max(1, Math.abs(want))]).toEqual([x, true])
    }
    expect(ln(1)).toBe(0)
    expect(log10(1000)).toBeCloseTo(3, 12)
    expect(log10(0.01)).toBeCloseTo(-2, 12)
  })

  test('refuses a number that has none', () => {
    for (const x of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => ln(x)).toThrow('positive')
  })

  test('is a function of its argument only: the same bits twice, and in any order of calls', () => {
    const rng = rngFor(1, 'test/broken-bench/ln')
    const xs = Array.from({ length: 200 }, () => (rng() % 1_000_000_000) + 1)
    const first = xs.map(ln)
    const second = [...xs].reverse().map(ln).reverse()
    expect(second).toEqual(first)
  })
})

/** kernelspace's `winkler` at d478f91 (src/lib/items/grade.ts), in thousandths of a decade, with Math.log10. */
function winklerMilli(lo: number, hi: number, truth: number): number {
  const a = Math.log10(Math.min(lo, hi))
  const b = Math.log10(Math.max(lo, hi))
  const t = Math.log10(truth)
  return Math.round((b - a + 20 * Math.max(0, a - t) + 20 * Math.max(0, t - b)) * 1000)
}

describe('the interval score (log score)', () => {
  test('is kernelspace\'s Winkler score of a 90% interval in log10 space, to a thousandth of a decade', () => {
    expect(WINKLER_PENALTY).toBe(20)
    const rng = rngFor(2, 'test/broken-bench/winkler')
    for (let i = 0; i < 400; i++) {
      const truth = (rng() % 100_000_000) + 1000
      const lo = Math.max(1, Math.round((truth * ((rng() % 2000) + 100)) / 1000))
      const hi = Math.max(1, Math.round((truth * ((rng() % 4000) + 100)) / 1000))
      expect([lo, hi, truth, Math.abs(intervalScoreMilli(lo, hi, truth) - winklerMilli(lo, hi, truth)) <= 1]).toEqual([lo, hi, truth, true])
    }
  })

  test('an interval that holds the truth costs its width in decades, and a miss costs twenty for each decade it is out', () => {
    expect(intervalScoreMilli(100, 1000, 300)).toBe(1000)
    expect(intervalScoreMilli(1000, 1000, 1000)).toBe(0)
    expect(intervalScoreMilli(100, 1000, 10)).toBe(1000 + 20_000)
    expect(intervalScoreMilli(100, 1000, 10_000)).toBe(1000 + 20_000)
    expect(intervalScoreMilli(1000, 100, 300)).toBe(1000)
  })

  test('a tight range that holds the number scores better than a wide one, and a wide one better than a tight miss', () => {
    const tight = intervalScoreMilli(950, 1050, 1000)
    const wide = intervalScoreMilli(100, 10_000, 1000)
    const miss = intervalScoreMilli(500, 600, 1000)
    expect(tight).toBeLessThan(wide)
    expect(wide).toBeLessThan(miss)
  })
})

describe('the number', () => {
  const key = { p99Us: 1_000_000, ciLoUs: 950_000, ciHiUs: 1_050_000 }

  test('is right within 15% of the recomputed p99, the edge included and a microsecond more not', () => {
    expect(NUMBER_TOLERANCE_PERMILLE).toBe(150)
    expect(withinTolerance(key, 1_000_000)).toBe(true)
    expect(withinTolerance(key, 850_000)).toBe(true)
    expect(withinTolerance(key, 1_150_000)).toBe(true)
    expect(withinTolerance(key, 849_999)).toBe(false)
    expect(withinTolerance(key, 1_150_001)).toBe(false)
    expect(withinTolerance(key, 1)).toBe(false)
  })

  test('is exact in integers at the largest the court takes', () => {
    const big = { p99Us: MAX_PREDICTION_US, ciLoUs: 1, ciHiUs: 2 }
    expect(withinTolerance(big, MAX_PREDICTION_US)).toBe(true)
    expect(withinTolerance(big, Math.floor(MAX_PREDICTION_US * 0.85))).toBe(true)
    expect(withinTolerance(big, Math.floor(MAX_PREDICTION_US * 0.85) - 1)).toBe(false)
  })
})

describe('the range', () => {
  const key = { p99Us: 1_000_000, ciLoUs: 950_000, ciHiUs: 1_050_000 }

  test('holds the recomputed p99 and is at most twice as wide as the court\'s own interval, the edge included', () => {
    expect(INTERVAL_WIDTH_FACTOR).toBe(2)
    expect(intervalStands(key, 950_000, 1_050_000)).toBe(true)
    // The court's interval is 100,000 µs wide: twice that is the edge, and a microsecond more is out.
    expect(intervalStands(key, 900_000, 1_100_000)).toBe(true)
    expect(intervalStands(key, 899_999, 1_100_000)).toBe(false)
    expect(intervalStands(key, 900_000, 1_100_001)).toBe(false)
    expect(intervalStands(key, 900_000, 1_000_000)).toBe(true)
    expect(intervalStands(key, 1_000_000, 1_200_000)).toBe(true)
    expect(intervalStands(key, 1_000_000, 1_200_001)).toBe(false)
    expect(intervalStands(key, 1_000_000, 1_000_000)).toBe(true)
  })

  test('misses a number that it does not hold, however narrow', () => {
    expect(intervalStands(key, 1_000_001, 1_000_002)).toBe(false)
    expect(intervalStands(key, 100, 999_999)).toBe(false)
  })
})

describe('the ruling', () => {
  const key = { p99Us: 2_000_000, ciLoUs: 1_900_000, ciHiUs: 2_100_000 }

  test('has three parts, and stands only when all three are right', () => {
    const right = judge(key, 'coordinated-omission', 'coordinated-omission', { p99Us: 2_000_000, loUs: 1_900_000, hiUs: 2_100_000 })
    expect(right).toMatchObject({ flawOk: true, numberOk: true, intervalOk: true })
    expect(stands(right)).toBe(true)
    for (const part of ['flawOk', 'numberOk', 'intervalOk'] as const) expect(stands({ ...right, [part]: false })).toBe(false)
  })

  test('judges the number against the true flaw\'s answer, whatever flaw was named', () => {
    const verdict = judge(key, 'coordinated-omission', 'none', { p99Us: 2_000_000, loUs: 1_900_000, hiUs: 2_100_000 })
    expect(verdict).toMatchObject({ flawOk: false, numberOk: true, intervalOk: true })
    expect(stands(verdict)).toBe(false)
  })

  test('carries the interval\'s score, which moves no pass', () => {
    const verdict = judge(key, 'none', 'none', { p99Us: 2_000_000, loUs: 1_000_000, hiUs: 4_000_000 })
    expect(verdict.intervalOk).toBe(false)
    expect(verdict.scoreMilli).toBe(intervalScoreMilli(1_000_000, 4_000_000, 2_000_000))
  })
})
