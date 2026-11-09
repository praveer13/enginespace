// The eleven kits of the broken-benchmark corpus (ARCHITECTURE §5.6; GAMES §11): for each flaw, how a seed's answer is drawn first and
// the scene built to give it. A kit draws in two steps, as kernelspace's `bbCase` does (D39):
//
//   1. `kit(rng)` draws the answer, the corrected p99 the scene will give, from a log-spaced grid that does not depend on the flaw's
//      mechanism, and then the knobs of the scene (the traffic, the load, the sizes) that reach it by the forward estimates of
//      broken-model.ts. It runs no benchmark; the one thing it runs is the saturation run that measures a traffic's capacity, once per
//      traffic. The flaw's label therefore says how the answer is reached and rarely which number it is: five flaws can only happen to
//      a server past its capacity (the replay's burst is past it), two only to a light one, and the other four draw either (a freeze
//      can fall on a server at any load).
//   2. `build(runSeed)` runs the benchmark as the broken harness ran it, under the seed of the benchmark's own draws, and returns the
//      log and the claim. If the scene does not keep the band (broken.ts), the case draws again with another `runSeed`; the answer
//      and the knobs stay.
//
// Where the estimate is a fluid reading it is only as good as the run's luck: a queue is a random walk, and the first 1.5 s or so of a
// p99 over a few thousand requests are noise. The case's `answer.p99Us` is what the scene gives when it is recomputed (`correctBench`),
// and `answer.targetUs` is what the seed drew; tests/sim/bench-broken.test.ts measures how far apart they are.

import { expDelayUs } from '../core/exp'
import { divRound } from '../core/int'
import type { Rng } from '../core/rng'
import { below, between, rngFor } from '../core/rng'
import { mean, percentile } from '../core/stats'
import type { Seed, Us } from '../core/types'
import type { TraceRow, TraceSlice } from '../workload'
import type { BenchClaim, BenchFlaw } from './broken-types'
import {
  CORPUS_SERVER,
  CORPUS_SLO,
  SEC,
  BENCH_WARMUP_ROWS,
  capacityPerSMilli,
  drawFrom,
  lengthsOf,
  lightP99Us,
  logGrid,
  mixP99Us,
  overloadBias,
  overloadP99Us,
  poissonAt,
  solveIncreasing,
  windowed,
} from './broken-model'
import type { Traffic } from './broken-model'
import { runBench } from './run'
import type { ServerModel } from './server'
import { ttftUs } from './stats'
import type { BenchRow, BenchRun, BenchSpec } from './types'

/** What a kit's `build` returns: the as-run benchmark, its log and its claim. */
export interface Built {
  readonly setup: BenchSpec
  readonly server: ServerModel
  readonly run: BenchRun
  readonly claim: BenchClaim
  readonly capacityPerSMilli: number
}

/** A kit's draw: the answer first, and a function that builds the scene under a seed. */
export interface Drawn {
  readonly targetUs: Us
  build(runSeed: Seed): Built
}

export type Kit = (rng: Rng) => Drawn

/** The rows the corrected benchmark of a `too-few-samples` case measures, after the warm-up rows (ASSESSMENT B7 asks for 1,000: this is half as many again) [estimated]. */
export const BROKEN_CORRECTED_ROWS = 1500

// ---------------------------------------------------------------------------------------------------------------------------
// The grids the answer is drawn from [estimated]

/**
 * A server past its capacity, whose p99 is the queue it built: 5 s to 120 s, in steps of 5%. Below 5 s the queue's own random walk
 * (about 1.5 s over a run of a thousand requests) decides the number, and the scene cannot be aimed.
 */
export const OVERLOAD_GRID = /* @__PURE__ */ logGrid(5 * SEC, 120 * SEC)
/** A freeze's reach: 0.35 s to 60 s. */
export const STALL_GRID = /* @__PURE__ */ logGrid(350_000, 60 * SEC)
/** A light load, whose p99 is the longest prompts' prefill and what waits behind it: 70 ms to 2 s. */
export const LIGHT_GRID = /* @__PURE__ */ logGrid(70_000, 2 * SEC)
/** A light load that mixes a few long prompts into short ones, so that the p99 is theirs: 0.12 s to 3 s, which the prompts up to S5's 8,192 reach at a load of 0.9. */
export const MIX_GRID = /* @__PURE__ */ logGrid(120_000, 3 * SEC)
/** A burst's queue: 2 s to 60 s. */
export const BURST_GRID = /* @__PURE__ */ logGrid(2 * SEC, 60 * SEC)

// ---------------------------------------------------------------------------------------------------------------------------
// Traffic

/** The mixes of an overloaded case: prompts from a quarter of the top to the top, three tops, three reply lengths. The capacity of each is measured. */
export const OVERLOAD_TRAFFIC: readonly Traffic[] = /* @__PURE__ */ [512, 1024, 2048].flatMap((hi) =>
  [
    [32, 96],
    [64, 192],
    [128, 384],
  ].map(([outLo, outHi]) => ({ promptLo: hi / 4, promptHi: hi, outLo, outHi })),
)

/** The mixes a capped-output case may use: the capped run is bound by prefill, so prompts stay short and replies long to leave it room below the uncapped run's load. */
const CAPPED_TRAFFIC: readonly Traffic[] = [
  { promptLo: 128, promptHi: 512, outLo: 64, outHi: 192 },
  { promptLo: 128, promptHi: 512, outLo: 128, outHi: 384 },
]

/** The mixes of an overloaded warm-cache case: long prompts and short replies, which a warm cache makes cheap enough that the run that reuses it is not overloaded. */
const CACHE_TRAFFIC: readonly Traffic[] = /* @__PURE__ */ [2048, 4096, 8192].map((hi) => ({ promptLo: hi / 4, promptHi: hi, outLo: 8, outHi: 32 }))

/** The longest prompts of a light case, in tokens: S5's fitted box ends at a prompt of 8,192 (isl in its box). */
const LIGHT_PROMPT_TOPS = [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144, 8192] as const
/** The replies of a light case: short, so a long run costs few steps. */
const LIGHT_OUTPUT = { outLo: 8, outHi: 32 } as const

const nearest = (grid: readonly number[], x: number): number => grid.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), grid[0])

// ---------------------------------------------------------------------------------------------------------------------------
// Claims and rows

/** The rows a harness measured: those due at or after its declared warm-up. */
export const measuredOf = (rows: readonly BenchRow[], warmupUs: Us): BenchRow[] => rows.filter((r) => r.dueUs >= warmupUs)

/**
 * The first instant in `[fromUs, toUs)` at which the most requests are in flight at once, and how many: sent and not yet done. A request
 * that ends at an instant and one that starts at it do not overlap.
 */
export function inFlightPeak(rows: readonly BenchRow[], fromUs: Us, toUs: Us): { readonly count: number; readonly atUs: Us } {
  const events: [Us, number][] = []
  for (const r of rows) events.push([r.sentUs, 1], [r.doneUs, -1])
  events.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
  let open = 0
  let count = 0
  let atUs = fromUs
  for (const [t, delta] of events) {
    if (t >= toUs) break
    open += delta
    if (delta === 1 && t >= fromUs && open > count) {
      count = open
      atUs = t
    }
  }
  return { count, atUs }
}

/** The claim of a harness that reports the p99 of the first-token latency its timer sees over the rows it measured. */
function p99Claim(rows: readonly BenchRow[], warmupUs: Us, timer: 'send' | 'due', ratePerSMilli: number): BenchClaim {
  const measured = measuredOf(rows, warmupUs)
  const sample = measured.map((r) => ttftUs(r, timer === 'send' ? 'sent' : 'due'))
  return { metric: 'ttft-p99', valueUs: percentile(sample, 990), n: measured.length, ratePerSMilli, timerStartsAt: timer }
}

/** An open-loop Poisson spec at `rate` for the first `warm + rows` requests, its window fitted to its schedule. */
function openSpec(seed: Seed, traffic: Traffic, ratePerSMilli: number, rows: number, extra: Partial<BenchSpec> = {}): BenchSpec {
  const spec: BenchSpec = { arrivals: poissonAt(ratePerSMilli), lengths: lengthsOf(traffic), requests: BENCH_WARMUP_ROWS + rows, warmupUs: 0, durationUs: 1, slo: CORPUS_SLO, ...extra }
  return windowed(seed, spec)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Three ways to aim a scene at an answer

/** What a scene is made of before it is run: a traffic, what the server can do on it, the rate to offer, and how many rows the honest benchmark measures. */
interface Aim {
  readonly traffic: Traffic
  readonly capacityPerSMilli: number
  readonly ratePerSMilli: number
  readonly rows: number
}

/**
 * Past capacity: an open loop at the load whose fluid p99 is `targetUs` (`overloadP99Us`). The queue grows the whole run, so the answer
 * is mostly the run's length: the longer the run, the lower the load that gives it.
 */
function heavy(rng: Rng, targetUs: Us, traffics: readonly Traffic[], rows?: number): Aim {
  const traffic = traffics[below(rng, traffics.length)]
  const capacity = capacityPerSMilli(traffic)
  // A queue can be no longer than the run is long: the answer needs a run of about 1.3 times its length in requests, at the capacity.
  const longEnough = Math.ceil((1.3 * targetUs * capacity) / 1_000_000_000 / 250) * 250
  const measured = rows ?? Math.min(6000, Math.max(1000, longEnough)) + 250 * below(rng, 3)
  const rho = solveIncreasing((r) => overloadP99Us(r, capacity, measured, BENCH_WARMUP_ROWS), targetUs / overloadBias(targetUs), 1.02, 8)
  return { traffic, capacityPerSMilli: capacity, ratePerSMilli: Math.round(rho * capacity), rows: measured }
}

/** Well under capacity: the longest prompt on the grid that is nearest, and the load (at most 0.7) that makes up the rest (`lightP99Us`). */
function light(rng: Rng, targetUs: Us): Aim {
  // At a load of 0.4 the p99 is about 40 ms + 0.16 ms for every token of the longest prompt.
  const top = nearest(LIGHT_PROMPT_TOPS, (targetUs - 40_000) / 160)
  const rho = solveIncreasing((r) => lightP99Us(r, top), targetUs, 0.1, 0.7)
  const traffic: Traffic = { promptLo: top / 8, promptHi: top, ...LIGHT_OUTPUT }
  const capacity = capacityPerSMilli(traffic)
  return { traffic, capacityPerSMilli: capacity, ratePerSMilli: Math.round(rho * capacity), rows: 1000 + 100 * below(rng, 6) }
}

/**
 * Short prompts and a few long ones (1.5 to 3% of them), at a load from 0.15 to 0.92: a p99 that is the long prompts' and a mean that is not
 * (`mixP99Us`). The long prompt is the nearest on the grid that leaves the load in the middle of its range, and the load makes up the rest.
 */
function mixed(rng: Rng, targetUs: Us, rows: number): Aim {
  const longPermille = [15, 20, 25, 30][below(rng, 4)]
  const longest = nearest(
    LIGHT_PROMPT_TOPS.filter((t) => t >= 1024),
    (targetUs / 2 - 40_000) / 62,
  )
  const traffic: Traffic = { promptLo: 64, promptHi: 192, ...LIGHT_OUTPUT, longTokens: longest, longPermille }
  const rho = solveIncreasing((r) => mixP99Us(r, longest), targetUs, 0.15, 0.92)
  const capacity = capacityPerSMilli(traffic)
  return { traffic, capacityPerSMilli: capacity, ratePerSMilli: Math.round(rho * capacity), rows }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The overloaded family: closed-loop, client-queue-hidden, client-bottleneck and capped-output. Each has an honest benchmark that is an
// open loop past the server's capacity, and each is a harness that did something else with the same requests.

const closedLoop: Kit = (rng) => {
  const targetUs = drawFrom(rng, OVERLOAD_GRID)
  const aim = heavy(rng, targetUs, OVERLOAD_TRAFFIC)
  const clients = [64, 64, 72, 80][below(rng, 4)]
  return {
    targetUs,
    build(runSeed) {
      // The harness ran `--num-prompts` requests from `clients` clients that each wait for a reply: a pure closed loop, with no schedule.
      const probe: BenchSpec = { arrivals: { kind: 'closed', clients, thinkUs: 0 }, lengths: lengthsOf(aim.traffic), requests: BENCH_WARMUP_ROWS + aim.rows, warmupUs: 0, durationUs: 1_000_000 * SEC, slo: CORPUS_SLO }
      const run = runBench(runSeed, probe, CORPUS_SERVER)
      // Its warm-up is the first rows it handed out (B8), which in a closed loop is a time only the log knows.
      const warmupUs = run.rows[BENCH_WARMUP_ROWS].dueUs
      const setup: BenchSpec = { ...probe, warmupUs }
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, warmupUs, 'send', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const clientQueueHidden: Kit = (rng) => {
  const targetUs = drawFrom(rng, OVERLOAD_GRID)
  const aim = heavy(rng, targetUs, OVERLOAD_TRAFFIC)
  // The cap sits at the server's slots or a little above: the engine is full and the rest of the queue is the client's.
  const cap = [64, 64, 72, 80, 96][below(rng, 5)]
  return {
    targetUs,
    build(runSeed) {
      const base = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows)
      const setup: BenchSpec = { ...base, arrivals: { kind: 'closed', clients: cap, thinkUs: 0, schedule: poissonAt(aim.ratePerSMilli) } }
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'send', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const clientBottleneck: Kit = (rng) => {
  const targetUs = drawFrom(rng, OVERLOAD_GRID)
  const aim = heavy(rng, targetUs, OVERLOAD_TRAFFIC)
  // The client can send this share of the server's capacity: far under what the schedule asks, and under what the server can take.
  const share = between(rng, 350, 750)
  return {
    targetUs,
    build(runSeed) {
      const clientCostUs = Math.max(1, divRound(1_000_000_000_000, share * aim.capacityPerSMilli))
      const setup = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows, { clientCostUs })
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'send', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const cappedOutput: Kit = (rng) => {
  const targetUs = drawFrom(rng, OVERLOAD_GRID)
  const aim = heavy(rng, targetUs, CAPPED_TRAFFIC)
  const cap = [4, 8, 16][below(rng, 3)]
  return {
    targetUs,
    build(runSeed) {
      const setup = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows, { outputCap: cap })
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'due', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Coordinated omission: the server freezes, the clients wait for replies, and sends slip behind their due times.

const coordinatedOmission: Kit = (rng) => {
  const targetUs = drawFrom(rng, STALL_GRID)
  const traffic = OVERLOAD_TRAFFIC[1 + 3 * below(rng, 3)]
  const rho = between(rng, 250, 650) / 1000
  const where = between(rng, 350, 550)
  return {
    targetUs,
    build(runSeed) {
      const capacity = capacityPerSMilli(traffic)
      const rate = Math.round(rho * capacity)
      // A frozen engine delays every request due while it is frozen by up to the freeze: the p99 of the delay from due is about the freeze, less half a second.
      const stallUs = targetUs + 500_000
      // Enough rows that the freeze is a minority of the window.
      const rows = Math.max(1000, Math.ceil((rate * 3.5 * stallUs) / 1_000_000_000))
      const base = openSpec(runSeed, traffic, rate, rows)
      // The freeze starts when the schedule, in an open loop with the same requests, has its most requests in flight in the first part of the window
      // after the warm-up, and the clients are one more than the most there were at any moment up to then, the warm-up included. So the schedule is
      // never held back before the freeze and is held back right after it starts. One client is spare when the freeze begins, and more when the warm-up
      // was busier than that moment. A spare client sends the request that falls due in the freeze into it, and the harness's own timer, from the send,
      // shows the rest of the freeze; there are too few of them to reach the harness's p99, which tests/sim/bench-broken.test.ts checks.
      const from = base.warmupUs + divRound((base.durationUs - base.warmupUs) * where, 1000)
      const pilot = runBench(runSeed, base, CORPUS_SERVER).rows
      const peak = inFlightPeak(pilot, base.warmupUs, from)
      // More than the busiest moment before the freeze, the warm-up included, so that no send before it is held back.
      const clients = inFlightPeak(pilot, 0, peak.atUs + 1).count + 1
      const setup: BenchSpec = { ...base, arrivals: { kind: 'closed', clients, thinkUs: 0, schedule: poissonAt(rate) } }
      const server: ServerModel = { ...CORPUS_SERVER, stalls: [{ atUs: peak.atUs, forUs: stallUs }] }
      const run = runBench(runSeed, setup, server)
      return { setup, server, run, claim: p99Claim(run.rows, setup.warmupUs, 'send', rate), capacityPerSMilli: capacity }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The control and the light family: warm-up-counted, and the cases that run well under capacity or past it as the draw falls.

/** A light scene for the cases that stay under capacity: either prompts up to some top, or a few long prompts among short ones. */
function underCapacity(rng: Rng): { targetUs: Us; aim: Aim } {
  const mix = below(rng, 2) === 0
  const targetUs = drawFrom(rng, mix ? MIX_GRID : LIGHT_GRID)
  return { targetUs, aim: mix ? mixed(rng, targetUs, 1000 + 100 * below(rng, 6)) : light(rng, targetUs) }
}

const none: Kit = (rng) => {
  const { targetUs, aim } = underCapacity(rng)
  return {
    targetUs,
    build(runSeed) {
      const setup = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows)
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'due', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const warmUpCounted: Kit = (rng) => {
  // Uniform prompts only: with a few long prompts among many short ones the load is high enough that the cut, 128 rows in, falls within a few seconds of the start.
  const targetUs = drawFrom(rng, LIGHT_GRID)
  const aim = light(rng, targetUs)
  const slowdownPermille = [2500, 3000, 4000, 5000][below(rng, 4)]
  const share = between(rng, 400, 900)
  return {
    targetUs,
    build(runSeed) {
      const base = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows)
      // The harness declared no warm-up, so every row counts. The cold start ends before the course's cut, and the queue it built drains before it too.
      const rho = aim.ratePerSMilli / aim.capacityPerSMilli
      const backlog = Math.max(0, rho - 1000 / slowdownPermille)
      const lastsUs = divRound(base.warmupUs * share, 1000)
      const untilUs = Math.max(1, Math.round(lastsUs / (1 + backlog / Math.max(0.05, 1 - rho))))
      const server: ServerModel = { ...CORPUS_SERVER, cold: { untilUs, slowdownPermille } }
      const setup: BenchSpec = { ...base, warmupUs: 0 }
      const run = runBench(runSeed, setup, server)
      return { setup, server, run, claim: p99Claim(run.rows, 0, 'due', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

/** The kits that run the honest benchmark and change one thing in it draw a light scene or an overloaded one; the answer's grid says which. */
const warmCache: Kit = (rng) => {
  const pastCapacity = below(rng, 2) === 0
  const targetUs = drawFrom(rng, pastCapacity ? OVERLOAD_GRID : LIGHT_GRID)
  const aim = pastCapacity ? heavy(rng, targetUs, CACHE_TRAFFIC) : light(rng, targetUs)
  return {
    targetUs,
    build(runSeed) {
      const setup = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows, { prefixWarm: true })
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'due', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const tooFewSamples: Kit = (rng) => {
  const pastCapacity = below(rng, 2) === 0
  const targetUs = drawFrom(rng, pastCapacity ? OVERLOAD_GRID : MIX_GRID)
  // The corrected benchmark measures BROKEN_CORRECTED_ROWS after the warm-up rows, so the answer is aimed at a run of that size.
  const aim = pastCapacity ? heavy(rng, targetUs, OVERLOAD_TRAFFIC, BROKEN_CORRECTED_ROWS) : mixed(rng, targetUs, BROKEN_CORRECTED_ROWS)
  const rows = between(rng, 60, 120)
  return {
    targetUs,
    build(runSeed) {
      const probe: BenchSpec = { arrivals: poissonAt(aim.ratePerSMilli), lengths: lengthsOf(aim.traffic), requests: rows, warmupUs: 0, durationUs: 1, slo: CORPUS_SLO }
      const setup = windowed(runSeed, probe, 0)
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, 0, 'due', aim.ratePerSMilli), capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

const meanAsTail: Kit = (rng) => {
  const pastCapacity = below(rng, 2) === 0
  const targetUs = drawFrom(rng, pastCapacity ? OVERLOAD_GRID : MIX_GRID)
  const aim = pastCapacity ? heavy(rng, targetUs, OVERLOAD_TRAFFIC) : mixed(rng, targetUs, 1000 + 100 * below(rng, 6))
  return {
    targetUs,
    build(runSeed) {
      const setup = openSpec(runSeed, aim.traffic, aim.ratePerSMilli, aim.rows)
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      // The report says "p99" and prints the mean of the same column.
      const measured = measuredOf(run.rows, setup.warmupUs)
      const claim: BenchClaim = { metric: 'ttft-p99', valueUs: mean(measured.map((r) => ttftUs(r, 'due'))), n: measured.length, ratePerSMilli: aim.ratePerSMilli, timerStartsAt: 'due' }
      return { setup, server: CORPUS_SERVER, run, claim, capacityPerSMilli: aim.capacityPerSMilli }
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// A "replay" that ignores the trace's timestamps: the harness took the trace's lengths and its mean rate, and sent Poisson arrivals.

/**
 * A seeded trace with one burst: a calm stretch at `calmRate`, a burst at `burstRate` that lasts `burstUs`, and a calm stretch again.
 * Synthetic, and labelled so: its timestamps are drawn from the committed exponential table, in whole ms (a tick is 1 ms), and its lengths
 * from the traffic. It is shaped like a recorded slice (kernelspace's artifact schema), so the workload module replays it as it would a real one.
 */
export function burstTrace(seed: Seed, traffic: Traffic, calmRate: number, burstRate: number, calmUs: Us, burstUs: Us): TraceSlice {
  const arrivals = rngFor(seed, 'bench/broken/trace/arrivals')
  const lengths = rngFor(seed, 'bench/broken/trace/lengths')
  const rows: TraceRow[] = []
  let at = 0
  const segments: [number, Us][] = [
    [calmRate, divRound(calmUs, 2)],
    [burstRate, burstUs],
    [calmRate, calmUs - divRound(calmUs, 2)],
  ]
  let end = 0
  for (const [rate, lasts] of segments) {
    end += lasts
    for (;;) {
      at += expDelayUs(arrivals, 1_000_000_000, rate)
      if (at >= end) break
      rows.push({ t: Math.round(at / 1000), p: between(lengths, traffic.promptLo, traffic.promptHi), o: between(lengths, traffic.outLo, traffic.outHi) })
    }
  }
  return {
    schemaVersion: 1,
    id: 'synthetic-burst',
    name: 'A synthetic trace with one burst',
    kind: 'synthetic',
    source: 'enginespace broken-bench corpus',
    sourceRevision: `seed ${seed}`,
    license: 'none: synthetic',
    attribution: 'Synthetic, drawn from a seed',
    note: "A stand-in for a recorded bursty trace: calm, then one burst past the server's capacity, then calm. Timestamps are whole ms.",
    sampling: { sourceMillisecondsPerTick: 1 },
    requestSha256: null,
    requests: rows,
  }
}

const replayWithoutTimestamps: Kit = (rng) => {
  const targetUs = drawFrom(rng, BURST_GRID)
  const traffic = OVERLOAD_TRAFFIC[3 * below(rng, 3) + 1]
  const peak = between(rng, 1500, 2600) / 1000
  const calm = between(rng, 150, 350) / 1000
  return {
    targetUs,
    build(runSeed) {
      const capacity = capacityPerSMilli(traffic)
      // A burst at `peak` times capacity that lasts d queues (peak − 1) × d seconds of work; the p99 of the waits in it is about 0.8 of the longest [estimated; read off 1,100 cases, 2026-11-04].
      const burstUs = Math.max(1_000_000, Math.round((targetUs * 1.25) / (peak - 1)))
      // The calm stretch: rows enough that the trace has about 1,250, but not over 30 times the burst's, so that the burst is over 3% of the rows and the p99 is in it;
      // and not under 300, so that the warm-up rows (the first 128, B8) are all calm. And long enough that the trace's mean rate is under 90% of the capacity, so that
      // the harness's Poisson run at the mean is no overload of its own: the burst is what it leaves out.
      const burstRows = (peak * capacity * burstUs) / 1_000_000_000
      const calmRows = Math.max(300, Math.min(30 * burstRows, 1250 - burstRows))
      const calmUs = Math.max(Math.round((calmRows * 1_000_000_000) / Math.round(calm * capacity)), Math.ceil((burstUs * (peak - 0.9)) / (0.9 - calm)))
      const slice = burstTrace(runSeed, traffic, Math.round(calm * capacity), Math.round(peak * capacity), calmUs, burstUs)
      const rows = slice.requests.length
      const durationUs = (slice.requests[rows - 1].t - slice.requests[0].t) * 1000
      // The harness read the trace's lengths and its mean rate, and ignored its timestamps.
      const meanRate = Math.round((rows * 1_000_000_000) / durationUs)
      const probe: BenchSpec = { arrivals: poissonAt(meanRate), lengths: { kind: 'rows', slice }, requests: rows, warmupUs: 0, durationUs: 1_000_000 * SEC, slo: CORPUS_SLO }
      const setup = windowed(runSeed, probe)
      const run = runBench(runSeed, setup, CORPUS_SERVER)
      return { setup, server: CORPUS_SERVER, run, claim: p99Claim(run.rows, setup.warmupUs, 'due', meanRate), capacityPerSMilli: capacity }
    },
  }
}

export const KITS: Readonly<Record<BenchFlaw, Kit>> = {
  'closed-loop': closedLoop,
  'coordinated-omission': coordinatedOmission,
  'client-queue-hidden': clientQueueHidden,
  'warm-up-counted': warmUpCounted,
  'warm-cache': warmCache,
  'capped-output': cappedOutput,
  'too-few-samples': tooFewSamples,
  'mean-as-tail': meanAsTail,
  'client-bottleneck': clientBottleneck,
  'replay-without-timestamps': replayWithoutTimestamps,
  none,
}
