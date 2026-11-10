/*
 * The worked numbers of TR8's lessons (W1-T34), computed from the benchmark generator, so that a number a lesson prints is one this file
 * recomputes. `tests/content/tr8-module.test.ts` holds each lesson's text to these functions, and when the generator or its S5 card moves a
 * number, the test names the lesson and the figure that went stale.
 *
 * Every scene is synthetic (D-012). The server is the corpus's own: the step loop run coarse on S5's "70B on H100" row at tensor-parallel 4,
 * with 64 sequences and an 8,192-token budget (`CORPUS_SERVER`). The traffic is chat-sized: prompts of 200 to 800 tokens and replies of 60 to
 * 200, which the server finishes at about 17 a second. All of it is a design parameter [estimated]. The numbers are [measured] by running
 * the generator, and a lesson gives the commit they were measured at.
 *
 * Nothing here draws with Math.log: the exponential delays come from the course's committed table (`expDelayUs`), as the generator's own
 * do, so a lesson's numbers do not depend on the runtime's libm.
 */
import { bootstrapInterval, latencyPercentiles, littlesLaw, runBench, summarize, ttftUs } from '../../packages/sim/bench'
import type { BenchSpec, ServerModel } from '../../packages/sim/bench'
import { BENCH_WARMUP_ROWS, benchSettled } from '../../packages/sim/bench/broken'
import { CORPUS_SERVER, CORPUS_SLO, SEC, capacityPerSMilli, lengthsOf } from '../../packages/sim/bench/broken-model'
import { below, expDelayUs, rngFor } from '../../packages/sim/core'
import { parseSlice } from '../../packages/sim/workload'
import { binomialCdf, exactCoverage } from '../sim/bench-support'

/** The traffic of every demo: prompts of 200 to 800 tokens, replies of 60 to 200. */
export const TRAFFIC = { promptLo: 200, promptHi: 800, outLo: 60, outHi: 200 } as const

/** What the server can finish a second on this traffic, times 1,000, from a saturation run (the corpus's own measure). */
export const capacity = (): number => capacityPerSMilli(TRAFFIC)

const open = (rate: number) => ({ kind: 'poisson', ratePerSMilli: rate }) as const

const baseSpec = (requests: number, durationUs: number): Omit<BenchSpec, 'arrivals'> => ({
  lengths: lengthsOf(TRAFFIC),
  requests,
  warmupUs: 0,
  durationUs,
  slo: CORPUS_SLO,
})

/** The window that `requests` Poisson arrivals at `rate` (per second times 1,000) fill, in µs, to the nearest µs. */
const windowOf = (requests: number, rate: number): number => Math.round((requests * 1e9) / rate)

/** The p99 of a list of numbers by nearest rank, as the course takes it. */
export const p99Of = (xs: readonly number[]): number => latencyPercentiles(xs)?.p99Us ?? NaN

/** How many of `n` values lie beyond their p99 by nearest rank. */
export const beyondP99 = (n: number): number => latencyPercentiles(Array.from({ length: n }, (_, i) => i + 1))?.beyondP99 ?? NaN

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: the toy log, and the freeze                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ToyRow {
  readonly n: number
  readonly dueMs: number
  readonly sentMs: number
  readonly replyMs: number
  readonly fromSentMs: number
  readonly fromDueMs: number
}

/**
 * The prediction of lesson 1, as a closed loop of one client (the toy needs no server model): 200 requests due every 500 ms, each answered in
 * 100 ms, except that the server freezes for 2,000 ms as request 3 is sent, so that its reply comes 2,100 ms after its send. The client sends
 * a request when it is due or when the last reply has come, whichever is later.
 */
export function toyLog(requests = 200): ToyRow[] {
  const rows: ToyRow[] = []
  let free = 0
  for (let i = 0; i < requests; i++) {
    const dueMs = 500 * i
    const sentMs = Math.max(dueMs, free)
    const latency = i === 2 ? 2100 : 100
    const replyMs = sentMs + latency
    free = replyMs
    rows.push({ n: i + 1, dueMs, sentMs, replyMs, fromSentMs: replyMs - sentMs, fromDueMs: replyMs - dueMs })
  }
  return rows
}

export interface FreezeCell {
  /** p99 time to first token timed from the send and from the due time, in ms. */
  readonly sentMs: number
  readonly dueMs: number
  /** Requests sent more than 2 ms after they were due. */
  readonly late: number
}

export interface FreezeDemo {
  readonly seed: number
  readonly requests: number
  readonly ratePerS: number
  readonly cap: number
  readonly freezeS: number
  readonly open: { readonly calm: FreezeCell; readonly freeze: FreezeCell }
  readonly capped: { readonly calm: FreezeCell; readonly freeze: FreezeCell }
}

/**
 * Lesson 1's table: the same server, the same offered traffic and, in the second column of each pair, a freeze of 3 s in the middle of the
 * run, for an open loop and for a harness with the same schedule and a cap of 24 requests in flight (`--request-rate` with `--max-concurrency`).
 */
export function freezeDemo(seed = 7, requests = 1500, cap = 24, freezeS = 3): FreezeDemo {
  const rate = Math.round(capacity() * 0.5)
  const windowUs = windowOf(requests, rate)
  const base = baseSpec(requests, windowUs)
  const cell = (spec: BenchSpec, frozen: boolean): FreezeCell => {
    const server: ServerModel = frozen ? { ...CORPUS_SERVER, stalls: [{ atUs: Math.round(windowUs / 2), forUs: freezeS * SEC }] } : CORPUS_SERVER
    const run = runBench(seed, spec, server)
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    return { sentMs: (s.latency.ttftFromSent?.p99Us ?? NaN) / 1000, dueMs: (s.latency.ttftFromDue?.p99Us ?? NaN) / 1000, late: s.adherence.lateRows }
  }
  const openSpec: BenchSpec = { ...base, arrivals: open(rate) }
  const cappedSpec: BenchSpec = { ...base, arrivals: { kind: 'closed', clients: cap, thinkUs: 0, schedule: open(rate) } }
  return {
    seed,
    requests,
    ratePerS: rate / 1000,
    cap,
    freezeS,
    open: { calm: cell(openSpec, false), freeze: cell(openSpec, true) },
    capped: { calm: cell(cappedSpec, false), freeze: cell(cappedSpec, true) },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: the cold start, and the width of an interval                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface WarmCell {
  /** Requests left out of the statistics, counted from the first by due time. */
  readonly cut: number
  readonly p99Ms: number
  /** The course's still-warming check on what remains (B8): true when the run had settled. */
  readonly settled: boolean
}

export interface WarmDemo {
  readonly seed: number
  readonly requests: number
  readonly coldS: number
  readonly slowdown: number
  readonly rows: readonly WarmCell[]
  /** The same scene with a cold start of 20 s, which outlasts the declared window. */
  readonly longCold: { readonly coldS: number; readonly rows: readonly WarmCell[] }
}

/**
 * Lesson 2's table: 1,600 requests at half the server's capacity, to a server that starts cold, so that for the first `coldS` seconds its
 * steps take `slowdown` times as long. The report leaves out nothing, the first 20 requests, the course's 128 (B8: the larger of 100 and twice
 * `max_num_seqs`), or 400. A request's time is timed from its due time.
 */
export function warmDemo(seed = 5, requests = 1600, coldS = 12, slowdown = 3): WarmDemo {
  const rate = Math.round(capacity() * 0.5)
  const spec: BenchSpec = { ...baseSpec(requests, windowOf(requests, rate)), arrivals: open(rate) }
  const rowsFor = (cold: number): WarmCell[] => {
    const server: ServerModel = { ...CORPUS_SERVER, cold: { untilUs: cold * SEC, slowdownPermille: slowdown * 1000 } }
    const run = runBench(seed, spec, server)
    const ttft = run.rows.map((r) => ttftUs(r, 'due'))
    return [0, 20, BENCH_WARMUP_ROWS, 400].map((cut): WarmCell => {
      const kept = ttft.slice(cut)
      return { cut, p99Ms: p99Of(kept) / 1000, settled: benchSettled(kept) }
    })
  }
  return { seed, requests, coldS, slowdown, rows: rowsFor(coldS), longCold: { coldS: 20, rows: rowsFor(20) } }
}

export interface WidthCell {
  readonly n: number
  readonly seeds: number
  /** The median over the seeds of the 95% interval's width on the p99, in ms. */
  readonly medianMs: number
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Lesson 2's second table: how wide the course's 95% interval on a p99 is, for samples of exponential latencies with a mean of 100 ms, as the
 * sample grows. Each seed draws a sample and resamples it 1,000 times (B, ASSESSMENT B7). The delays come from the committed exponential
 * table, whose largest value is about 7.9 times its mean, so the tail is the table's and not an unbounded one.
 */
export function widthDemo(sizes: readonly number[] = [250, 1000, 4000], seeds: readonly number[] = [40, 40, 20]): WidthCell[] {
  return sizes.map((n, i) => {
    const widths: number[] = []
    for (let seed = 0; seed < seeds[i]; seed++) {
      const draw = rngFor(seed, 'tr8/width')
      const sample = Array.from({ length: n }, () => expDelayUs(draw, 100_000))
      const ci = bootstrapInterval(sample, 990, { resamples: 1000, seed })
      widths.push(ci.hiUs - ci.loUs)
    }
    return { n, seeds: seeds[i], medianMs: median(widths) / 1000 }
  })
}

export interface CoverageDemo {
  /** The share of the time, in percent, that a nominal 95% bootstrap interval on a p99 covers the true p99 of a continuous distribution, exactly. */
  readonly at1000: { readonly streams: number; readonly percent: number }
  readonly at5000: { readonly streams: number; readonly percent: number }
}

/**
 * The exact coverage of the course's interval (tests/sim/bench-stats.test.ts says why it is computed and not drawn): the interval of a sample
 * of 1, 2, ..., n has the ranks of its two ends, and the probability that those ranks bracket the true quantile is a binomial sum. It is
 * averaged over the resampler's seeds. A p99 is where the percentile method is too short, and the shortfall closes as n grows.
 */
export function coverageDemo(streams1000 = 100, streams5000 = 20): CoverageDemo {
  const exactMean = (n: number, streams: number): number => {
    const cdf = binomialCdf(n, 0.99)
    let total = 0
    for (let seed = 0; seed < streams; seed++) {
      const ci = bootstrapInterval(
        Array.from({ length: n }, (_, i) => i + 1),
        990,
        { resamples: 1000, seed },
      )
      total += exactCoverage(cdf, ci.loUs, ci.hiUs)
    }
    return (100 * total) / streams
  }
  return { at1000: { streams: streams1000, percent: exactMean(1000, streams1000) }, at5000: { streams: streams5000, percent: exactMean(5000, streams5000) } }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: the rush, goodput's denominator, and Little's law                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Pcts {
  readonly p50Ms: number
  readonly p90Ms: number
  readonly p99Ms: number
}

export interface RushDemo {
  readonly seed: number
  /** The requests of the trace, and how many lie beyond the p99 of its replay in time. */
  readonly requests: number
  readonly beyondP99: number
  /** The trace's mean rate in requests a second, and as a share of the server's capacity in percent. */
  readonly meanRatePerS: number
  readonly meanSharePct: number
  readonly inTime: Pcts
  readonly steady: Pcts
}

/** A rush as stretches of seconds at a load in permille of the capacity: 70 s at 40%, 8 s at 160%, 70 s at 40%. */
export const RUSH: readonly (readonly [number, number])[] = [
  [70, 400],
  [8, 1600],
  [70, 400],
]

/**
 * Lesson 4's table: a synthetic trace of the three stretches above, replayed in time against the corpus server, and the same requests sent at
 * the trace's mean rate, which is what a rate flag does to a trace's lengths (the court's "replay that ignores timestamps"). The arrivals of
 * each stretch are Poisson at that stretch's rate, from the committed table, and each request is drawn a prompt of 200 to 800 tokens and a reply
 * of 60 to 200. A tick of the slice is a millisecond.
 */
export function rushDemo(seed = 7): RushDemo {
  const cap = capacity()
  const rng = rngFor(seed, 'tr8/rush')
  const requests: { t: number; p: number; o: number }[] = []
  let startUs = 0
  for (const [seconds, loadPermille] of RUSH) {
    const rate = Math.round((cap * loadPermille) / 1000)
    const endUs = startUs + seconds * SEC
    let atUs = startUs
    for (;;) {
      atUs += expDelayUs(rng, 1_000_000_000, rate)
      if (atUs >= endUs) break
      requests.push({ t: Math.round(atUs / 1000), p: 200 + below(rng, 601), o: 60 + below(rng, 141) })
    }
    startUs = endUs
  }
  const slice = parseSlice({
    schemaVersion: 1,
    id: 'tr8-rush',
    name: 'A synthetic rush',
    kind: 'synthetic-profile',
    source: 'tests/content/tr8-demos.ts',
    sourceRevision: 'synthetic',
    license: 'none',
    attribution: 'synthetic',
    note: 'Seeded arrivals and lengths of the course.',
    sampling: { sourceMillisecondsPerTick: 1 },
    requestCount: requests.length,
    requests,
  })
  const n = requests.length
  const spanUs = requests[n - 1].t * 1000
  const meanRate = Math.round((n * 1e9) / spanUs)
  const common = { requests: n, warmupUs: 0, durationUs: spanUs + 1, slo: CORPUS_SLO }
  const percentiles = (rows: readonly { dueUs: number; firstUs: number }[]): { pcts: Pcts; beyond: number } => {
    const p = latencyPercentiles(rows.map((r) => r.firstUs - r.dueUs))
    if (p === null) throw new Error('a rush with no rows')
    return { pcts: { p50Ms: p.p50Us / 1000, p90Ms: p.p90Us / 1000, p99Ms: p.p99Us / 1000 }, beyond: p.beyondP99 }
  }
  const inTime = percentiles(runBench(seed, { ...common, arrivals: { kind: 'replay', slice, speedPermille: 1000 } }, CORPUS_SERVER).rows)
  const steady = percentiles(runBench(seed, { ...common, arrivals: open(meanRate), lengths: { kind: 'rows', slice } }, CORPUS_SERVER).rows)
  return { seed, requests: n, beyondP99: inTime.beyond, meanRatePerS: meanRate / 1000, meanSharePct: (100 * meanRate) / cap, inTime: inTime.pcts, steady: steady.pcts }
}

export interface LoadCell {
  /** The load as a multiple of what the server can finish, out of 10: 5 is half, 20 is twice. */
  readonly loadTenths: number
  readonly rows: number
  /** Requests that met both objectives. */
  readonly met: number
  /** Goodput over the arrival window and over the whole run, drain tail included, in requests a second. */
  readonly windowPerS: number
  readonly wholePerS: number
  /** The whole run's length in s, from the first arrival to the last completion. */
  readonly endS: number
  /** Little's law over the arrival window, from the send: the residual out of 1,000, and the two sides in requests. */
  readonly residualPermille: number
  readonly inFlight: number
  readonly lambdaW: number
}

/** Lesson 4's two tables: 60 s of Poisson arrivals at four loads against the same server, with a TTFT objective of 500 ms and a TPOT objective of 50 ms. */
export function goodputDemo(seed = 11, loadsTenths: readonly number[] = [5, 10, 20, 30]): LoadCell[] {
  const cap = capacity()
  return loadsTenths.map((loadTenths) => {
    const rate = Math.round((cap * loadTenths) / 10)
    const durationUs = 60 * SEC
    const requests = Math.round((rate * 60) / 1000)
    const spec: BenchSpec = { ...baseSpec(requests, durationUs), arrivals: open(rate) }
    const run = runBench(seed, spec, CORPUS_SERVER)
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    const ll = littlesLaw(run.rows, { fromUs: 0, toUs: durationUs }, 'sent')
    return {
      loadTenths,
      rows: run.rows.length,
      met: s.goodput.met,
      windowPerS: s.goodput.arrivalWindowPerSMilli / 1000,
      wholePerS: s.goodput.totalDurationPerSMilli / 1000,
      endS: run.endUs / SEC,
      residualPermille: ll.residualPermille,
      inFlight: ll.meanInFlightMilli / 1000,
      lambdaW: ll.expectedInFlightMilli / 1000,
    }
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a cap and a latency let a run send in steady state, in requests a second: the least of the rate asked for and permits ÷ latency (Little's law). */
export const sendRate = (requested: number, permits: number, latencyS: number): number => Math.min(requested, permits / latencyS)

/** A goodput in requests a second: the requests that met their objectives over a duration in seconds. */
export const goodputPerS = (met: number, seconds: number): number => met / seconds

/**
 * The reference of each prediction of TR8's lessons, from the numbers its prompt gives and the course's own functions. Nothing is stored
 * in a lesson (A§1, I3). None of TR8's four has a run to read it from (the questions are toy runs and a tool's arithmetic, and The
 * Inspection plays cases drawn from the seed), so the lesson's box says that its reveal waits for W2-T43 (packages/play/predictions/plan.ts),
 * and these figures are what that task starts from.
 */
export const PREDICTIONS: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = {
  'tr8.l1.p1': { unit: 'ms', reference: () => p99Of(toyLog().map((r) => r.fromSentMs)) },
  'tr8.l2.p1': { unit: 'requests', reference: () => beyondP99(250) },
  'tr8.l3.p1': { unit: 'requests/s', reference: () => sendRate(10, 8, 1.2) },
  'tr8.l4.p1': { unit: 'requests/s', reference: () => goodputPerS(600, 100) },
}
