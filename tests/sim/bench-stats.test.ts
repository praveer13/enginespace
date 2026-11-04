/*
 * The statistics of a benchmark's log (ARCHITECTURE §5.6; ASSESSMENT §6.2): percentiles by nearest rank, the percentile bootstrap,
 * goodput at the SLO, Little's law and arrival adherence, all on the rows of a log.
 *
 * W1-T31 acceptance check 2: on a known distribution, the nominal 95% bootstrap interval covers within [93%, 97%] over 2,000 seeds
 * [estimated tolerance]. The first coverage tests below are that check, on the median at the sample sizes where the method is
 * calibrated, and on the p99 they say where it is not: a percentile bootstrap on the p99 is too short at n = 1,000 and reaches the
 * band at n = 2,000 to 2,500. The p99 numbers come from the exact index distribution (see `exactCoverage`), so they carry no sampling
 * noise of a data set; `ES_HEAVY=1` also runs the 2,000-seed check on the p99 itself.
 */
import { describe, expect, test } from 'bun:test'
import { below, between, rngFor } from '../../packages/sim/core'
import {
  ADHERENCE_HARD_LIMIT_US,
  ADHERENCE_TOLERANCE_US,
  arrivalAdherence,
  bootstrapInterval,
  checkRows,
  e2eUs,
  latencyPercentiles,
  littlesLaw,
  meetsSlo,
  perSMilli,
  summarizeRows,
  tpotUs,
  ttftUs,
} from '../../packages/sim/bench'
import type { BenchRow } from '../../packages/sim/bench'
import { ascending, binomialCdf, exactCoverage } from './bench-support'

/** A row, with the parts a statistic reads. The prompt length is 10 whatever it is. */
function row(id: number, o: { due: number; sent?: number; first: number; done: number; out?: number }): BenchRow {
  return { id, client: null, dueUs: o.due, sentUs: o.sent ?? o.due, firstUs: o.first, doneUs: o.done, promptTokens: 10, outputTokens: o.out ?? 5 }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Rows

describe('the times of a row', () => {
  const r = row(0, { due: 100, sent: 130, first: 180, done: 380, out: 5 })

  test('TTFT and end-to-end latency count from the due time or from the send, and a TPOT is the span after the first token over the tokens in it', () => {
    expect(ttftUs(r)).toBe(80)
    expect(ttftUs(r, 'due')).toBe(80)
    expect(ttftUs(r, 'sent')).toBe(50)
    expect(e2eUs(r)).toBe(280)
    expect(e2eUs(r, 'sent')).toBe(250)
    // (380 − 180) / (5 − 1) = 50.
    expect(tpotUs(r)).toBe(50)
    // Rounded to the nearest µs, halves up: 201 / 4 = 50.25, and 202 / 4 = 50.5.
    expect(tpotUs(row(0, { due: 0, first: 0, done: 201, out: 5 }))).toBe(50)
    expect(tpotUs(row(0, { due: 0, first: 0, done: 202, out: 5 }))).toBe(51)
  })

  test('a request of one token has no TPOT', () => {
    expect(tpotUs(row(0, { due: 0, first: 10, done: 10, out: 1 }))).toBeNull()
  })

  test('a log must be in order: due, send, first token, last token, with whole µs and at least one output token', () => {
    expect(() => checkRows([r])).not.toThrow()
    expect(() => checkRows([row(0, { due: 100, sent: 90, first: 180, done: 380 })])).toThrow(/not in order/)
    expect(() => checkRows([row(0, { due: 100, first: 90, done: 380 })])).toThrow(/not in order/)
    expect(() => checkRows([row(0, { due: 100, first: 200, done: 190 })])).toThrow(/not in order/)
    expect(() => checkRows([row(0, { due: 100.5, first: 200, done: 300 })])).toThrow(/not in order/)
    expect(() => checkRows([row(0, { due: 100, first: 200, done: 300, out: 0 })])).toThrow(/output tokens/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Percentiles

describe('percentiles by nearest rank', () => {
  test('on 1 to 100, the p50 is the 50th value, the p90 the 90th, the p99 the 99th, and one observation lies beyond the p99', () => {
    const xs = ascending(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(latencyPercentiles(xs)).toEqual({ n: 100, meanUs: 51, p50Us: 50, p90Us: 90, p99Us: 99, maxUs: 100, beyondP99: 1 })
  })

  test('on 1 to 1,000, ten observations lie beyond the p99, which ASSESSMENT B7 asks of a p99 claim', () => {
    const p = latencyPercentiles(Array.from({ length: 1000 }, (_, i) => i + 1))
    expect(p).toMatchObject({ p99Us: 990, beyondP99: 10 })
  })

  test('is a function of the sample as a set: the order it comes in does not matter, and the caller\'s list is left as it was', () => {
    const xs = [9, 3, 7, 1, 5, 8, 2, 6, 4, 10]
    const copy = [...xs]
    expect(latencyPercentiles(xs)).toEqual(latencyPercentiles(ascending(xs)))
    expect(xs).toEqual(copy)
  })

  test('on a single observation every percentile is that observation, and an empty sample has none', () => {
    expect(latencyPercentiles([7])).toEqual({ n: 1, meanUs: 7, p50Us: 7, p90Us: 7, p99Us: 7, maxUs: 7, beyondP99: 0 })
    expect(latencyPercentiles([])).toBeNull()
  })

  test('is monotone: p50 ≤ p90 ≤ p99 ≤ max, over 200 seeded samples', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = rngFor(seed, 'test/bench/percentiles')
      const xs = Array.from({ length: between(rng, 1, 500) }, () => below(rng, 10_000))
      const p = latencyPercentiles(xs)!
      expect(p.p50Us).toBeLessThanOrEqual(p.p90Us)
      expect(p.p90Us).toBeLessThanOrEqual(p.p99Us)
      expect(p.p99Us).toBeLessThanOrEqual(p.maxUs)
      expect(xs).toContain(p.p99Us)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The bootstrap

/**
 * The percentile bootstrap as it is defined, with no cleverness: sort the sample; for each resample, draw n indices in order with
 * `below`, build the resample from them, sort it and take its nearest-rank percentile; then sort the percentiles and take the
 * interval's two ranks.
 */
function literalBootstrap(sample: readonly number[], pPermille: number, resamples: number, seed: number, stream: string, tail = 25) {
  const n = sample.length
  const ordered = ascending(sample)
  const rng = rngFor(seed, `bench/bootstrap/${stream}`)
  const rank = pPermille === 0 ? 1 : Math.floor((pPermille * n + 999) / 1000)
  const replicates: number[] = []
  for (let b = 0; b < resamples; b++) {
    const resample = ascending(Array.from({ length: n }, () => ordered[below(rng, n)]))
    replicates.push(resample[rank - 1])
  }
  const sorted = ascending(replicates)
  const at = (permille: number) => sorted[Math.floor((permille * resamples + 999) / 1000) - 1]
  return { loUs: at(tail), hiUs: at(1000 - tail) }
}

describe('the percentile bootstrap', () => {
  test('is the literal definition: the sorted sample resampled n indices at a time with `below`, each resample\'s nearest-rank percentile, and the 25th and 975th of 1,000 of those', () => {
    const cases: { n: number; p: number; resamples: number }[] = [
      { n: 1, p: 990, resamples: 20 },
      { n: 2, p: 990, resamples: 50 },
      { n: 3, p: 500, resamples: 50 },
      { n: 10, p: 990, resamples: 200 },
      { n: 10, p: 0, resamples: 200 },
      { n: 10, p: 1000, resamples: 200 },
      { n: 101, p: 500, resamples: 300 },
      { n: 101, p: 990, resamples: 300 },
      { n: 250, p: 900, resamples: 200 },
      { n: 400, p: 100, resamples: 120 },
      { n: 64, p: 950, resamples: 1000 },
    ]
    for (const [k, c] of cases.entries()) {
      const rng = rngFor(k + 1, 'test/bench/sample')
      const sample = Array.from({ length: c.n }, () => below(rng, 1000))
      const seed = 100 + k
      const got = bootstrapInterval(sample, c.p, { resamples: c.resamples, seed })
      const want = literalBootstrap(sample, c.p, c.resamples, seed, `p${c.p}`)
      expect(got.loUs, JSON.stringify(c)).toBe(want.loUs)
      expect(got.hiUs, JSON.stringify(c)).toBe(want.hiUs)
      expect(got.resamples).toBe(c.resamples)
      expect(got.levelPermille).toBe(950)
    }
  })

  test('takes the level\'s tails: 90% is the 50th and 950th, and 99% the 5th and 995th, of 1,000', () => {
    const rng = rngFor(1, 'test/bench/sample')
    const sample = Array.from({ length: 80 }, () => below(rng, 100_000))
    for (const [level, tail] of [[900, 50], [990, 5], [500, 250]] as const) {
      const got = bootstrapInterval(sample, 990, { resamples: 1000, seed: 3, levelPermille: level })
      const want = literalBootstrap(sample, 990, 1000, 3, 'p990', tail)
      expect([got.loUs, got.hiUs]).toEqual([want.loUs, want.hiUs])
    }
  })

  test('is a function of the sample, the percentile, the seed, the stream and B, and the sample\'s order does not matter', () => {
    const rng = rngFor(2, 'test/bench/sample')
    const sample = Array.from({ length: 300 }, () => below(rng, 100_000))
    const a = bootstrapInterval(sample, 990, { resamples: 400, seed: 9 })
    expect(bootstrapInterval(sample, 990, { resamples: 400, seed: 9 })).toEqual(a)
    expect(bootstrapInterval([...sample].reverse(), 990, { resamples: 400, seed: 9 })).toEqual(a)
    expect(bootstrapInterval(sample, 990, { resamples: 400, seed: 10 })).not.toEqual(a)
    expect(bootstrapInterval(sample, 990, { resamples: 400, seed: 9, stream: 'ttft' })).not.toEqual(a)
    expect(bootstrapInterval(sample, 990, { resamples: 401, seed: 9 })).not.toEqual(a)
  })

  test('brackets the point estimate, which is the nearest-rank percentile of the sample, over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = rngFor(seed, 'test/bench/sample')
      const n = between(rng, 1, 400)
      const sample = Array.from({ length: n }, () => below(rng, 10_000))
      const p = [0, 100, 500, 900, 990, 1000][below(rng, 6)]
      const ci = bootstrapInterval(sample, p, { resamples: 100, seed })
      expect(ci.pointUs).toBe(ascending(sample)[(p === 0 ? 1 : Math.floor((p * n + 999) / 1000)) - 1])
      expect(ci.loUs, `seed ${seed}`).toBeLessThanOrEqual(ci.pointUs)
      expect(ci.pointUs, `seed ${seed}`).toBeLessThanOrEqual(ci.hiUs)
    }
  })

  test('a higher level is a wider interval, from the same resamples', () => {
    const rng = rngFor(4, 'test/bench/sample')
    const sample = Array.from({ length: 200 }, () => below(rng, 100_000))
    const widths = [500, 900, 950, 990].map((level) => {
      const ci = bootstrapInterval(sample, 500, { resamples: 1000, seed: 5, levelPermille: level })
      return ci.hiUs - ci.loUs
    })
    expect(widths).toEqual(ascending(widths))
    expect(widths[3]).toBeGreaterThan(widths[0])
  })

  test('a sample of one value has an interval of that value, and so does a constant sample', () => {
    expect(bootstrapInterval([42], 990, { resamples: 10, seed: 1 })).toMatchObject({ pointUs: 42, loUs: 42, hiUs: 42 })
    expect(bootstrapInterval(Array.from({ length: 50 }, () => 7), 990, { resamples: 10, seed: 1 })).toMatchObject({ loUs: 7, hiUs: 7 })
  })

  test('more observations make a narrower interval: 16 times as many halve it twice', () => {
    const width = (n: number): number => {
      let total = 0
      for (let seed = 1; seed <= 20; seed++) {
        const rng = rngFor(seed, 'test/bench/sample')
        const sample = Array.from({ length: n }, () => below(rng, 1_000_000))
        const ci = bootstrapInterval(sample, 500, { resamples: 300, seed })
        total += ci.hiUs - ci.loUs
      }
      return total / 20
    }
    const ratio = width(100) / width(1600)
    expect(ratio).toBeGreaterThan(3)
    expect(ratio).toBeLessThan(5)
  })

  test('refuses what it cannot bootstrap', () => {
    const ok = { resamples: 10, seed: 1 }
    expect(() => bootstrapInterval([], 990, ok)).toThrow(/empty sample/)
    expect(() => bootstrapInterval([1, 2], 1001, ok)).toThrow(/percentile/)
    expect(() => bootstrapInterval([1, 2], 990, { ...ok, resamples: 0 })).toThrow(/resamples/)
    expect(() => bootstrapInterval([1, 2], 990, { ...ok, levelPermille: 951 })).toThrow(/level/)
    expect(() => bootstrapInterval([1, 2], 990, { ...ok, levelPermille: 1000 })).toThrow(/level/)
    expect(() => bootstrapInterval([1, 2], 990, { ...ok, seed: -1 })).toThrow(/seed/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 2: coverage

/** The share of 2,000 seeds whose interval covers the truth. One seed draws a sample of `n` from `draw`, and its interval from the seed too. */
function coverage(seeds: number, n: number, p: number, draw: (rng: () => number) => number, truth: number, resamples = 1000): number {
  let covered = 0
  for (let seed = 0; seed < seeds; seed++) {
    const rng = rngFor(seed, 'test/bench/coverage')
    const sample = Array.from({ length: n }, () => draw(rng))
    const ci = bootstrapInterval(sample, p, { resamples, seed })
    if (ci.loUs <= truth && truth <= ci.hiUs) covered++
  }
  return (100 * covered) / seeds
}

describe('check 2: the nominal 95% interval covers within [93%, 97%] over 2,000 seeds', () => {
  // Each of these draws B = 1,000 resamples of n values for every one of its seeds, which takes seconds on a busy host.
  const SLOW = 60_000

  test('the median of a uniform distribution on 1 to 1,000,000, from samples of 200: its median is 500,000', () => {
    const percent = coverage(2000, 200, 500, (rng) => 1 + below(rng, 1_000_000), 500_000)
    expect(percent).toBeGreaterThanOrEqual(93)
    expect(percent).toBeLessThanOrEqual(97)
  }, SLOW)

  test('the median of an exponential distribution of mean 100,000 µs, from samples of 200 and 600 seeds: its median is 100,000 · ln 2', () => {
    // A heavier tail than the uniform's. With 600 seeds the share covered has a standard error of 0.9 points, so the band is wider.
    const exponential = (rng: () => number): number => Math.round(-100_000 * Math.log(1 - rng() / 4294967296))
    const percent = coverage(600, 200, 500, exponential, 100_000 * Math.LN2)
    expect(percent).toBeGreaterThanOrEqual(91.5)
    expect(percent).toBeLessThanOrEqual(98)
  }, SLOW)

  // For a continuous distribution the interval is [x_(L), x_(U)], and L and U depend on the resampler's draws and not on the data. So
  // the probability that it covers the true quantile is a binomial sum, and its mean over streams has no sampling noise of a data
  // set. Run on the indices 1 to n, the function returns L and U themselves.
  const exactMean = (n: number, p: number, streams: number): number => {
    const cdf = binomialCdf(n, p)
    let total = 0
    for (let seed = 0; seed < streams; seed++) {
      const ci = bootstrapInterval(Array.from({ length: n }, (_, i) => i + 1), Math.round(p * 1000), { resamples: 1000, seed })
      total += exactCoverage(cdf, ci.loUs, ci.hiUs)
    }
    return (100 * total) / streams
  }

  test('the p90, from samples of 1,000, which leave 100 observations beyond it: exactly, over 40 resampler seeds', () => {
    const percent = exactMean(1000, 0.9, 40)
    expect(percent).toBeGreaterThanOrEqual(93)
    expect(percent).toBeLessThanOrEqual(97)
  }, SLOW)

  test('the p99 is where the percentile method is too short: its coverage at n = 1,000 is under the band, and it reaches the band as n grows', () => {
    // 60 streams at n = 1,000 and 20 at n = 2,500 are enough to fix the mean to two tenths of a percentage point.
    const at1000 = exactMean(1000, 0.99, 60)
    const at2500 = exactMean(2500, 0.99, 20)
    // [measured 2026-11-04, W1-T31 on c80dfad: 92.6% at n = 1,000 over 400 streams, 93.5% at 2,000 over 200, 93.8% at 2,500 over 150 and
    // 94.5% at 5,000 over 60; the median 94.8% at n = 200 and the p90 94.7% at n = 1,000.] The bounds below are those means plus or
    // minus what 60 and 20 streams leave unsettled.
    expect(at1000).toBeGreaterThan(91.5)
    expect(at1000).toBeLessThan(93.2)
    expect(at2500).toBeGreaterThan(93.2)
    expect(at2500).toBeLessThan(94.5)
    expect(at2500).toBeGreaterThan(at1000)
  }, SLOW)

  test.skipIf(process.env['ES_HEAVY'] !== '1')('the p99, 2,000 seeds of the real pipeline on an exponential distribution (ES_HEAVY=1; about a minute)', () => {
    const exponential = (rng: () => number): number => Math.round(-100_000 * Math.log(1 - rng() / 4294967296))
    const truth = 100_000 * Math.log(100)
    const at1000 = coverage(2000, 1000, 990, exponential, truth)
    const at2500 = coverage(2000, 2500, 990, exponential, truth)
    console.log(`p99 coverage over 2,000 seeds: ${at1000.toFixed(1)}% at n = 1,000, ${at2500.toFixed(1)}% at n = 2,500`)
    expect(at1000).toBeGreaterThan(90)
    expect(at2500).toBeGreaterThan(92)
    expect(at2500).toBeLessThan(97)
  }, 1_800_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// Goodput

describe('goodput at the SLO', () => {
  const slo = { ttftUs: 100, tpotUs: 10 }

  test('a request meets it when its TTFT from the due time and its TPOT are both within, the limits included', () => {
    // 100 to the first token, (180 − 100) / 8 = 10 a token: exactly on both.
    expect(meetsSlo(row(0, { due: 0, first: 100, done: 180, out: 9 }), slo)).toBe(true)
    expect(meetsSlo(row(0, { due: 0, first: 101, done: 180, out: 9 }), slo)).toBe(false)
    expect(meetsSlo(row(0, { due: 0, first: 100, done: 189, out: 9 }), slo)).toBe(false)
    // A TTFT counts from the due time, so a late send misses it however fast the server was.
    expect(meetsSlo(row(0, { due: 0, sent: 90, first: 110, done: 150, out: 9 }), slo)).toBe(false)
    // One token has no TPOT.
    expect(meetsSlo(row(0, { due: 0, first: 100, done: 100, out: 1 }), slo)).toBe(true)
  })

  test('is counted over the arrival window, and again over the whole run with its drain tail', () => {
    // Four requests due in a 1 s window; three meet the SLO; the last one finishes 1.5 s after the window ends.
    const rows = [
      row(0, { due: 0, first: 50, done: 130, out: 9 }),
      row(1, { due: 200_000, first: 200_050, done: 200_130, out: 9 }),
      row(2, { due: 400_000, first: 400_050, done: 400_130, out: 9 }),
      row(3, { due: 900_000, first: 900_050, done: 2_500_000, out: 9 }),
    ]
    const s = summarizeRows(rows, { warmupUs: 0, durationUs: 1_000_000, slo }, { bootstrap: 0, seed: 1 })
    expect(s.goodput.met).toBe(3)
    // 3 requests in 1 s: 3 a second, ×1,000. In the whole 2.5 s run: 1.2 a second.
    expect(s.goodput.arrivalWindowPerSMilli).toBe(3000)
    expect(s.goodput.totalDurationPerSMilli).toBe(1200)
  })

  test('a slow request that finishes after the window still counts as offered, and as a miss', () => {
    const rows = [row(0, { due: 0, first: 50, done: 130, out: 9 }), row(1, { due: 10, first: 5000, done: 9000, out: 9 })]
    const s = summarizeRows(rows, { warmupUs: 0, durationUs: 100, slo }, { bootstrap: 0, seed: 1 })
    expect(s.counts.measured).toBe(2)
    expect(s.goodput.met).toBe(1)
  })

  test('perSMilli rounds to the nearest and gives 0 for an empty window', () => {
    expect(perSMilli(1, 3_000_000)).toBe(333)
    expect(perSMilli(2, 3_000_000)).toBe(667)
    expect(perSMilli(5, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Little's law

describe('Little\'s law', () => {
  const rows = [
    row(0, { due: 0, first: 5, done: 10 }),
    row(1, { due: 5, first: 8, done: 15 }),
    row(2, { due: 12, first: 14, done: 20 }),
  ]

  test('over a window that holds every request, L = λW exactly: the sums are the same sum', () => {
    const l = littlesLaw(rows, { fromUs: 0, toUs: 21 })
    // In flight: 10 + 10 + 8 request·µs.
    expect(l).toMatchObject({ completions: 3, inFlightUs: 28, sojournUs: 28, residualPermille: 0, meanLatencyUs: 9 })
    expect(l.meanInFlightMilli).toBe(1333)
    expect(l.expectedInFlightMilli).toBe(1333)
  })

  test('a window that ends while a request is in flight counts its inside part and not its sojourn, so the two sums differ', () => {
    // Window [0, 20): the third request is still in flight at 20 (done is 20, the window is half open). Completions: the first two, 10 + 10.
    const l = littlesLaw(rows, { fromUs: 0, toUs: 20 })
    expect(l).toMatchObject({ completions: 2, inFlightUs: 28, sojournUs: 20 })
    expect(l.residualPermille).toBe(286)
  })

  test('a window that starts while a request is in flight counts its part inside and its whole sojourn', () => {
    // Window [7, 21): the first request is inside from 7 to 10 and the second from 7 to 15, though they were sent at 0 and 5. All three finish in
    // the window, with sojourns of 10, 10 and 8.
    const l = littlesLaw(rows, { fromUs: 7, toUs: 21 })
    expect(l).toMatchObject({ completions: 3, inFlightUs: 3 + 8 + 8, sojournUs: 10 + 10 + 8 })
    expect(l.residualPermille).toBe(474)
  })

  test('counts the client\'s queue too when the clock starts at the due time', () => {
    const queued = [row(0, { due: 0, sent: 50, first: 60, done: 100 })]
    expect(littlesLaw(queued, { fromUs: 0, toUs: 200 }, 'sent').sojournUs).toBe(50)
    expect(littlesLaw(queued, { fromUs: 0, toUs: 200 }, 'due').sojournUs).toBe(100)
  })

  test('an empty window or an empty log has nothing in flight, and a backwards window is refused', () => {
    expect(littlesLaw([], { fromUs: 0, toUs: 100 })).toMatchObject({ completions: 0, inFlightUs: 0, residualPermille: 0, meanLatencyUs: 0 })
    expect(littlesLaw(rows, { fromUs: 5, toUs: 5 })).toMatchObject({ inFlightUs: 0, meanInFlightMilli: 0, residualPermille: 0 })
    expect(() => littlesLaw(rows, { fromUs: 6, toUs: 5 })).toThrow(/window/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Arrival adherence

describe('arrival adherence (ASSESSMENT B4)', () => {
  const late = (us: number): BenchRow => row(0, { due: 1_000_000, sent: 1_000_000 + us, first: 2_000_000 + us, done: 3_000_000 + us })

  test('the defaults are 2 ms and 20 ms', () => {
    expect(ADHERENCE_TOLERANCE_US).toBe(2000)
    expect(ADHERENCE_HARD_LIMIT_US).toBe(20_000)
  })

  test('counts the rows later than the tolerance and later than the hard limit, strictly, and the latest of all', () => {
    const rows = [0, 1999, 2000, 2001, 20_000, 20_001].map(late)
    expect(arrivalAdherence(rows)).toEqual({ rows: 6, lateRows: 3, veryLateRows: 1, maxLateUs: 20_001, toleranceUs: 2000, hardLimitUs: 20_000, ok: false })
  })

  test('is ok when at least 99.9% are within the tolerance and none is beyond the hard limit', () => {
    const thousand = Array.from({ length: 1000 }, () => late(0))
    expect(arrivalAdherence(thousand).ok).toBe(true)
    expect(arrivalAdherence([...thousand.slice(1), late(2001)]).ok).toBe(true)
    expect(arrivalAdherence([...thousand.slice(2), late(2001), late(2001)]).ok).toBe(false)
    expect(arrivalAdherence([...thousand.slice(1), late(20_001)]).ok).toBe(false)
  })

  test('takes the limits it is given', () => {
    expect(arrivalAdherence([late(500)], { toleranceUs: 100, hardLimitUs: 1000 })).toMatchObject({ lateRows: 1, veryLateRows: 0, ok: false })
    expect(arrivalAdherence([late(500)], { toleranceUs: 600, hardLimitUs: 1000 })).toMatchObject({ lateRows: 0, ok: true })
  })

  test('an empty log is on time', () => {
    expect(arrivalAdherence([]).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The summary of a log

describe('summarizing a log by hand', () => {
  // Six requests due at 0, 100, ..., 500 in a 600 µs window with a warm-up of 100 µs, so the first is the warm-up.
  const rows = [
    row(0, { due: 0, first: 900, done: 1900 }),
    row(1, { due: 100, first: 150, done: 450, out: 7 }),
    row(2, { due: 200, sent: 230, first: 260, done: 560, out: 7 }),
    row(3, { due: 300, first: 340, done: 640, out: 7 }),
    row(4, { due: 400, first: 400, done: 700, out: 1 }),
    row(5, { due: 500, first: 700, done: 1000, out: 7 }),
  ]
  const slo = { ttftUs: 100, tpotUs: 60 }
  const s = summarizeRows(rows, { warmupUs: 100, durationUs: 600, slo }, { bootstrap: 0, seed: 1 })

  test('counts the warm-up apart and measures the rest', () => {
    expect(s.counts).toEqual({ offered: 6, warmup: 1, measured: 5 })
    expect(s.window).toEqual({ fromUs: 100, toUs: 600 })
  })

  test('latency from the due time and from the send, and a TPOT that is the same from either', () => {
    // From due: 50, 60, 40, 0, 200. From sent: 50, 30, 40, 0, 200.
    expect(s.latency.ttftFromDue).toEqual({ n: 5, meanUs: 70, p50Us: 50, p90Us: 200, p99Us: 200, maxUs: 200, beyondP99: 0 })
    expect(s.latency.ttftFromSent).toEqual({ n: 5, meanUs: 64, p50Us: 40, p90Us: 200, p99Us: 200, maxUs: 200, beyondP99: 0 })
    // (300 / 6, 300 / 6, 300 / 6, 300 / 6) = 50 each, and the one-token request has none.
    expect(s.latency.tpot).toEqual({ n: 4, meanUs: 50, p50Us: 50, p90Us: 50, p99Us: 50, maxUs: 50, beyondP99: 0 })
    // End to end from due: 350, 360, 340, 300, 500. From sent: 350, 330, 340, 300, 500.
    expect(s.latency.e2eFromDue).toMatchObject({ n: 5, p50Us: 350, maxUs: 500 })
    expect(s.latency.e2eFromSent).toMatchObject({ n: 5, p50Us: 340, maxUs: 500 })
  })

  test('goodput: the requests with a TTFT of at most 100 from the due time and a TPOT of at most 60, over the window and over the run', () => {
    // Met: requests 1, 2, 3 and 4 (TTFTs 50, 60, 40, 0). Request 5 took 200.
    expect(s.goodput.met).toBe(4)
    // 4 in 500 µs: 8,000 a second. The last measured request finished at 1000, 900 µs after the window opened: about 4,444 a second.
    expect(s.goodput.arrivalWindowPerSMilli).toBe(8_000_000)
    expect(s.goodput.totalDurationPerSMilli).toBe(4_444_444)
  })

  test('the rate offered and the rate achieved: a send that lands after the window is not in it', () => {
    expect(s.rates.intendedPerSMilli).toBe(10_000_000)
    expect(s.rates.sentPerSMilli).toBe(10_000_000)
    const slipped = [...rows.slice(0, 5), row(5, { due: 500, sent: 640, first: 700, done: 1000, out: 7 })]
    const t = summarizeRows(slipped, { warmupUs: 100, durationUs: 600, slo }, { bootstrap: 0, seed: 1 })
    expect(t.rates).toEqual({ intendedPerSMilli: 10_000_000, sentPerSMilli: 8_000_000 })
  })

  test('the warm-up is the spec\'s unless the caller\'s says otherwise, and cannot be longer than the window', () => {
    const none = summarizeRows(rows, { warmupUs: 100, durationUs: 600, slo }, { bootstrap: 0, seed: 1, warmupUs: 0 })
    expect(none.counts).toEqual({ offered: 6, warmup: 0, measured: 6 })
    expect(none.latency.ttftFromDue!.maxUs).toBe(900)
    expect(() => summarizeRows(rows, { warmupUs: 100, durationUs: 600, slo }, { bootstrap: 0, seed: 1, warmupUs: 601 })).toThrow(/warm-up/)
  })

  test('intervals are left out at B = 0 and drawn from the measured rows at B > 0, from the due time, with a stream of their own for each metric', () => {
    expect(s.p99Intervals).toEqual({ ttftFromDue: null, tpot: null, e2eFromDue: null })
    const t = summarizeRows(rows, { warmupUs: 100, durationUs: 600, slo }, { bootstrap: 200, seed: 4 })
    const want = bootstrapInterval([50, 60, 40, 0, 200], 990, { resamples: 200, seed: 4, stream: 'ttft' })
    expect(t.p99Intervals.ttftFromDue).toEqual(want)
    expect(t.p99Intervals.tpot).toEqual(bootstrapInterval([50, 50, 50, 50], 990, { resamples: 200, seed: 4, stream: 'tpot' }))
    expect(t.p99Intervals.e2eFromDue!.levelPermille).toBe(950)
  })

  test('a log out of order is refused before anything is computed', () => {
    expect(() => summarizeRows([row(0, { due: 100, sent: 50, first: 200, done: 300 })], { warmupUs: 0, durationUs: 600, slo }, { bootstrap: 0, seed: 1 })).toThrow(/not in order/)
    expect(() => summarizeRows(rows, { warmupUs: 0, durationUs: 600, slo }, { bootstrap: -1, seed: 1 })).toThrow(/bootstrap/)
  })
})
