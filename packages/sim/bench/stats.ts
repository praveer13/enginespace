// What a benchmark's log says (ARCHITECTURE §5.6; ASSESSMENT §6.2): percentiles, the bootstrap interval on a percentile, goodput at
// the SLO, Little's law and arrival adherence, all in exact integer arithmetic on the rows of a log.
//
// The functions take rows and numbers, never a `BenchRun`, because the browser recomputes the same statistics from the raw rows of a
// receipt (ARCHITECTURE §8.5, rule 8; D-028): a log from the simulator and a log from a learner's GPU go through one set of code.

import { divCeil, divRound, isUint } from '../core/int'
import { below, rngFor } from '../core/rng'
import { mean, nearestRank, sortedAsc } from '../core/stats'
import type { Seed, Us } from '../core/types'
import type { ArrivalAdherence, BenchRow, BootstrapInterval, LatencyPercentiles, LittlesLaw } from './types'

// ---------------------------------------------------------------------------------------------------------------------------
// Rows

/** Throws unless every row is a request that went through in order: `0 ≤ due ≤ sent ≤ first ≤ done`, at least one output token, integers throughout (ASSESSMENT B3). */
export function checkRows(rows: readonly BenchRow[]): void {
  for (const [i, r] of rows.entries()) {
    const ok = isUint(r.dueUs) && isUint(r.sentUs) && isUint(r.firstUs) && isUint(r.doneUs) && r.dueUs <= r.sentUs && r.sentUs <= r.firstUs && r.firstUs <= r.doneUs
    if (!ok) throw new RangeError(`row ${i} (request ${r.id}) is not in order: due ${r.dueUs}, sent ${r.sentUs}, first token ${r.firstUs}, done ${r.doneUs}`)
    if (!Number.isSafeInteger(r.outputTokens) || r.outputTokens < 1) throw new RangeError(`row ${i} (request ${r.id}) has ${r.outputTokens} output tokens, and a completed request has at least one`)
  }
}

/** Time to first token, counted from the due time (the course's rule, ASSESSMENT B5) or from the actual send. */
export function ttftUs(row: BenchRow, from: 'due' | 'sent' = 'due'): Us {
  return row.firstUs - (from === 'due' ? row.dueUs : row.sentUs)
}

/** Time from the start to the last token, from the due time or from the actual send. */
export function e2eUs(row: BenchRow, from: 'due' | 'sent' = 'due'): Us {
  return row.doneUs - (from === 'due' ? row.dueUs : row.sentUs)
}

/** Time per output token after the first: `(last − first) / (output tokens − 1)` rounded to whole µs (ASSESSMENT B12, vllm B5). Null for a single token. */
export function tpotUs(row: BenchRow): Us | null {
  return row.outputTokens < 2 ? null : divRound(row.doneUs - row.firstUs, row.outputTokens - 1)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Percentiles and the bootstrap

/** Percentiles of a sample by nearest rank (§5.6), or null for an empty one. */
export function latencyPercentiles(xs: readonly number[]): LatencyPercentiles | null {
  const n = xs.length
  if (n === 0) return null
  const sorted = sortedAsc(xs)
  return {
    n,
    meanUs: mean(sorted),
    p50Us: nearestRank(sorted, 500),
    p90Us: nearestRank(sorted, 900),
    p99Us: nearestRank(sorted, 990),
    maxUs: sorted[n - 1],
    beyondP99: n - divCeil(990 * n, 1000),
  }
}

/** The resamples a bootstrap draws by default: B = 1,000 [estimated] (§5.6, ASSESSMENT B7). */
export const BOOTSTRAP_RESAMPLES = 1000

/** The interval's nominal level by default, out of 1,000: 95%. */
export const BOOTSTRAP_LEVEL_PERMILLE = 950

export interface BootstrapOptions {
  /** Resamples to draw, B. At least 1. */
  readonly resamples: number
  /** The resampler's seed. A receipt's is derived from its challenge (ASSESSMENT B7). */
  readonly seed: Seed
  /** Names the stream within the seed, so intervals on different metrics draw independently. Default `p<percentile>`. ASCII. */
  readonly stream?: string
  /** The nominal level out of 1,000, even, from 2 to 998. Default 950. */
  readonly levelPermille?: number
}

/**
 * The percentile bootstrap interval on the `pPermille`-th percentile of `sample` (§5.6): draw `resamples` samples of the same size
 * with replacement, take each one's nearest-rank percentile, sort those, and read the interval off them at the nominal level's
 * tails, by nearest rank (a 95% interval is the 25th and the 975th of 1,000).
 *
 * A resample is n draws of an index in `[0, n)`, each made without bias by rejection (`below`). The sample is sorted first, so a
 * resample's percentile is the value at one rank of the multiset of indices it drew, and that is found by counting how often each
 * index was drawn: no resample is built or sorted. The draws come from `rngFor(seed, 'bench/bootstrap/<stream>')`, resample after
 * resample, n draws each, so the interval is a function of the sample, the percentile, the seed, the stream and B.
 *
 * Coverage is not quite what the nominal level says. This is the textbook percentile method, and for a percentile with few
 * observations beyond it the interval is too short. On a continuous distribution with B = 1,000, a nominal 95% interval covers the
 * true median 94.8% of the time at n = 200 and the true p90 94.7% at n = 1,000, but the true p99 only 92.6% of the time at
 * n = 1,000, 93.5% at 2,000, 93.8% at 2,500 and 94.5% at 5,000 [measured 2026-11-04, W1-T31 on c80dfad: the exact probability that
 * the interval's two order statistics bracket the quantile, averaged over 400, 400, 200, 150 and 60 resampler seeds, which carries
 * no sampling noise of a data set; tests/sim/bench-stats.test.ts repeats it]. ASSESSMENT B7's 1,000 rows, with 10 beyond the p99,
 * is a minimum for the p99 to mean anything, and the interval it gets is optimistic by about two points.
 */
export function bootstrapInterval(sample: readonly number[], pPermille: number, o: BootstrapOptions): BootstrapInterval {
  const n = sample.length
  if (n === 0) throw new RangeError('a bootstrap interval of an empty sample')
  if (!isUint(pPermille) || pPermille > 1000) throw new RangeError(`a percentile is an integer from 0 to 1000 permille, got ${pPermille}`)
  if (!Number.isSafeInteger(o.resamples) || o.resamples < 1) throw new RangeError(`resamples must be an integer of at least 1, got ${o.resamples}`)
  const level = o.levelPermille ?? BOOTSTRAP_LEVEL_PERMILLE
  if (!Number.isInteger(level) || level < 2 || level > 998 || level % 2 !== 0) throw new RangeError(`the level is an even integer from 2 to 998 permille, got ${level}`)
  const tail = (1000 - level) / 2

  const sorted = sortedAsc(sample)
  const rank = pPermille === 0 ? 1 : divCeil(pPermille * n, 1000)
  // The rank-th smallest of a multiset is the rank-th from the bottom, or the (n − rank + 1)-th from the top: scan from the nearer end.
  const fromBottom = rank <= n - rank + 1
  const target = fromBottom ? rank : n - rank + 1
  const rng = rngFor(o.seed, `bench/bootstrap/${o.stream ?? `p${pPermille}`}`)
  const counts = new Uint32Array(n)
  const replicates: number[] = []
  for (let b = 0; b < o.resamples; b++) {
    counts.fill(0)
    for (let i = 0; i < n; i++) counts[below(rng, n)]++
    let seen = 0
    let j = fromBottom ? 0 : n - 1
    for (;;) {
      seen += counts[j]
      if (seen >= target) break
      j += fromBottom ? 1 : -1
    }
    replicates.push(sorted[j])
  }
  const ordered = sortedAsc(replicates)
  return {
    pointUs: nearestRank(sorted, pPermille),
    loUs: nearestRank(ordered, tail),
    hiUs: nearestRank(ordered, 1000 - tail),
    resamples: o.resamples,
    levelPermille: level,
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Goodput

export interface Slo {
  readonly ttftUs: Us
  readonly tpotUs: Us
}

/**
 * Whether a request met both objectives: its TTFT from its due time within `ttftUs`, and its TPOT within `tpotUs`. A request of one
 * token has no TPOT and meets that objective (ASSESSMENT B9, vllm B1).
 */
export function meetsSlo(row: BenchRow, slo: Slo): boolean {
  const tpot = tpotUs(row)
  return ttftUs(row, 'due') <= slo.ttftUs && (tpot === null || tpot <= slo.tpotUs)
}

/** Requests per second times 1,000: `count` over a window of `windowUs`, rounded. 0 for an empty window. */
export function perSMilli(count: number, windowUs: Us): number {
  return windowUs > 0 ? divRound(count * 1_000_000_000, windowUs) : 0
}

// ---------------------------------------------------------------------------------------------------------------------------
// Little's law

/**
 * Little's law over `[fromUs, toUs)` (§5.6, ASSESSMENT B10): the window's time-averaged number in flight against the throughput of
 * its completions times their mean latency.
 *
 * A request is in flight from `start` to `doneUs`, where `start` is its send (the server's own view, the default) or its due time (the
 * whole system, the client's queue included). Three sums over the rows, none of which needs the window's length:
 *   - `inFlightUs`: for every request, the part of `[start, done)` inside the window. Divided by the window, this is L.
 *   - `sojournUs`: for every request that finished inside the window, `done − start`. Divided by the window, this is λ times W, as
 *     λ is the completions per µs and W is their sojourn on average.
 *   - the residual `|L − λW| / L` is the difference of the two over the first.
 * Requests that straddle the window's edges are why the two differ at all: one that started before the window and finished inside
 * adds its whole sojourn to the second sum and only its inside part to the first. In steady state the edge at the end makes up for
 * the edge at the start, so a window that is long against the latency, on a run that is not backing up, has a small residual.
 */
export function littlesLaw(rows: readonly BenchRow[], window: { readonly fromUs: Us; readonly toUs: Us }, start: 'sent' | 'due' = 'sent'): LittlesLaw {
  const { fromUs, toUs } = window
  if (!isUint(fromUs) || !isUint(toUs) || toUs < fromUs) throw new RangeError(`a window is two times with the first no later than the second, got ${fromUs} and ${toUs}`)
  const length = toUs - fromUs
  let completions = 0
  let inFlightUs = 0
  let sojournUs = 0
  for (const r of rows) {
    const from = start === 'sent' ? r.sentUs : r.dueUs
    const inside = Math.min(r.doneUs, toUs) - Math.max(from, fromUs)
    if (inside > 0) inFlightUs += inside
    if (r.doneUs >= fromUs && r.doneUs < toUs) {
      completions++
      sojournUs += r.doneUs - from
    }
  }
  if (!Number.isSafeInteger(inFlightUs) || !Number.isSafeInteger(sojournUs)) throw new RangeError('the sums are beyond 2^53')
  return {
    fromUs,
    toUs,
    completions,
    inFlightUs,
    sojournUs,
    meanInFlightMilli: length > 0 ? divRound(inFlightUs * 1000, length) : 0,
    throughputPerSMilli: perSMilli(completions, length),
    meanLatencyUs: completions > 0 ? divRound(sojournUs, completions) : 0,
    expectedInFlightMilli: length > 0 ? divRound(sojournUs * 1000, length) : 0,
    residualPermille: inFlightUs > 0 ? divRound(Math.abs(inFlightUs - sojournUs) * 1000, inFlightUs) : 0,
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Arrival adherence

/** B4's tolerance: a send is on time when it is at most 2 ms late [estimated]. */
export const ADHERENCE_TOLERANCE_US = 2_000
/** B4's hard limit: no send is more than 20 ms late [estimated]. */
export const ADHERENCE_HARD_LIMIT_US = 20_000

/**
 * How closely the sends followed their schedule (ASSESSMENT B4): `ok` when at least 99.9% of rows were sent within the tolerance and
 * every row within the hard limit. Closed-loop clients, a client that is slower than the schedule, and a stalled server with a
 * waiting client all fail it, and that is coordinated omission.
 */
export function arrivalAdherence(rows: readonly BenchRow[], o: { readonly toleranceUs?: Us; readonly hardLimitUs?: Us } = {}): ArrivalAdherence {
  const toleranceUs = o.toleranceUs ?? ADHERENCE_TOLERANCE_US
  const hardLimitUs = o.hardLimitUs ?? ADHERENCE_HARD_LIMIT_US
  let lateRows = 0
  let veryLateRows = 0
  let maxLateUs: Us = 0
  for (const r of rows) {
    const late = r.sentUs - r.dueUs
    if (late > toleranceUs) lateRows++
    if (late > hardLimitUs) veryLateRows++
    if (late > maxLateUs) maxLateUs = late
  }
  // At least 99.9% within the tolerance: late × 1,000 ≤ rows.
  return { rows: rows.length, lateRows, veryLateRows, maxLateUs, toleranceUs, hardLimitUs, ok: lateRows * 1000 <= rows.length && veryLateRows === 0 }
}
