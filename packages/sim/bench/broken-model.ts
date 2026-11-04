// What the broken-benchmark corpus draws its scenes from (ARCHITECTURE §5.6; GAMES §11): the server every case is run on, the traffic
// presets, a measured capacity for each, and the forward estimates that turn the answer a seed drew first into the scene that gives it.
//
// Nothing here is a fact about a real engine. The server is the step loop run coarse on kernelspace's S5 card ("70B on H100" at TP 4,
// the harness S5's rows were fitted on, WORLD §4.2), the traffic is the corpus's own, and every number below that is not a count of
// named things is a design parameter [estimated] unless it says where it was measured.

import { divRound } from '../core/int'
import type { Rng } from '../core/rng'
import { below } from '../core/rng'
import type { Seed, Us } from '../core/types'
import type { Dist, LengthPlan } from '../workload'
import { planBench } from './plan'
import { runBench } from './run'
import { s5Server } from './server'
import type { ServerModel } from './server'
import { perSMilli } from './stats'
import type { BenchSpec } from './types'

export const SEC = 1_000_000

/** The server of every case: 64 sequences, an 8,192-token budget and chunked prefill, priced by S5's H100 row at TP 4. Inside S5's fitted box (isl up to 8,192). */
export const CORPUS_SERVER: ServerModel = s5Server('h100-vllm-0-10-2-fp8', 4)

/** The objectives a case's spec carries. A p99 claim never reads them, and goodput is not what the corpus asks about. */
export const CORPUS_SLO = { ttftUs: 500_000, tpotUs: 50_000 } as const

/**
 * ASSESSMENT B8: the warm-up is the first W rows by due time, W = max(100, 2 × `max_num_seqs`) [estimated]. The corpus' server has 64
 * sequences, so 128 rows. A harness that declares a warm-up declares this one.
 */
export function benchWarmupRows(maxNumSeqs: number): number {
  return Math.max(100, 2 * maxNumSeqs)
}
export const BENCH_WARMUP_ROWS = benchWarmupRows(CORPUS_SERVER.maxNumSeqs)

/** ASSESSMENT B7: a p99 needs at least 1,000 measured rows, so that at least 10 lie beyond it [derived]. */
export const BENCH_MIN_ROWS_FOR_P99 = 1000

// ---------------------------------------------------------------------------------------------------------------------------
// Traffic

/**
 * A request mix: prompts uniform from `promptLo` to `promptHi`, replies uniform from `outLo` to `outHi`. With `longTokens` and
 * `longPermille`, that share of the requests (out of 1,000) carries a prompt of exactly `longTokens` instead, and the rest draw
 * from the menu `promptLo`, the middle and `promptHi`: the mix a p99 can hide in.
 */
export interface Traffic {
  readonly promptLo: number
  readonly promptHi: number
  readonly outLo: number
  readonly outHi: number
  readonly longTokens?: number
  readonly longPermille?: number
}

/** The short prompts of a mixed traffic: three values, equally likely, so they stand in for a range a menu cannot draw. */
function shortMenu(t: Traffic): number[] {
  return [t.promptLo, divRound(t.promptLo + t.promptHi, 2), t.promptHi]
}

export function promptDist(t: Traffic): Dist {
  if (t.longTokens === undefined || t.longPermille === undefined) return { kind: 'uniform', lo: t.promptLo, hi: t.promptHi }
  const rest = 1000 - t.longPermille
  const third = Math.floor(rest / 3)
  return { kind: 'menu', values: [...shortMenu(t), t.longTokens], weights: [third, third, rest - 2 * third, t.longPermille] }
}

export function lengthsOf(t: Traffic): LengthPlan {
  return { kind: 'dists', prompt: promptDist(t), output: { kind: 'uniform', lo: t.outLo, hi: t.outHi } }
}

/** The saturation run's window: 15 s of ramp-up, then 45 s that count [estimated]. Its requests are more than the fastest mix finishes in 60 s [measured: 83 a second, 2026-11-04]. */
const SAT_RAMP_US = 15 * SEC
const SAT_US = 60 * SEC
const SAT_REQUESTS = 20_000

const capacityMemo = new Map<string, number>()

/**
 * What the server can finish a second on this traffic, times 1,000, from a closed loop of 96 clients with no think time: 64 requests
 * run and 32 wait, so the engine never idles. It counts the requests that finish in the last 45 s of 60. The result is a pure function
 * of the traffic, so it is remembered; the first call for a mix costs one 60 s run of the coarse server.
 */
export function capacityPerSMilli(t: Traffic): number {
  const key = `${t.promptLo}/${t.promptHi}/${t.outLo}/${t.outHi}/${t.longTokens ?? 0}/${t.longPermille ?? 0}`
  const known = capacityMemo.get(key)
  if (known !== undefined) return known
  const spec: BenchSpec = {
    arrivals: { kind: 'closed', clients: 96, thinkUs: 0 },
    lengths: lengthsOf(t),
    requests: SAT_REQUESTS,
    warmupUs: 0,
    durationUs: SAT_US,
    slo: CORPUS_SLO,
  }
  const run = runBench(1, spec, CORPUS_SERVER)
  if (run.rows.length >= SAT_REQUESTS) throw new RangeError(`the saturation run of ${JSON.stringify(t)} used up its ${SAT_REQUESTS} requests`)
  let done = 0
  for (const r of run.rows) if (r.doneUs >= SAT_RAMP_US && r.doneUs < SAT_US) done++
  const capacity = perSMilli(done, SAT_US - SAT_RAMP_US)
  capacityMemo.set(key, capacity)
  return capacity
}

// ---------------------------------------------------------------------------------------------------------------------------
// Specs and windows

/** An arrival window no schedule reaches the end of: `planBench` offers the first `requests` due inside it. */
const FAR_US = 1_000_000_000_000

export const poissonAt = (ratePerSMilli: number) => ({ kind: 'poisson', ratePerSMilli: Math.round(ratePerSMilli) }) as const

/** The due times of the first `requests` of a spec's schedule, which is what the harness knows before it sends anything. */
export function dueTimes(seed: Seed, spec: BenchSpec): Us[] {
  return planBench(seed, { ...spec, warmupUs: 0, durationUs: FAR_US }).reqs.map((r) => r.dueUs ?? 0)
}

/**
 * Fits a spec's window to its schedule: `requests` rows are offered, the arrival window ends just after the last of them is due, and the
 * warm-up ends at the due time of the first row after the warm-up rows (ASSESSMENT B8), so exactly `warmup` rows are excluded.
 */
export function windowed(seed: Seed, spec: BenchSpec, warmup: number = BENCH_WARMUP_ROWS): BenchSpec {
  if (spec.arrivals.kind === 'closed' && spec.arrivals.schedule === undefined) throw new RangeError('a closed loop with no schedule has no due times to fit a window to')
  const due = dueTimes(seed, spec)
  if (due.length <= warmup) throw new RangeError(`a spec of ${due.length} rows cannot have a warm-up of ${warmup} rows`)
  return { ...spec, warmupUs: warmup === 0 ? 0 : due[warmup], durationUs: due[due.length - 1] + 1 }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Grids and the answer drawn first

/** A log-spaced grid from `lo` to at most `hi`, each entry `step`/1000 times the one before (products, so every engine builds the same grid). */
export function logGrid(lo: number, hi: number, stepPermille = 1050): readonly number[] {
  const grid: number[] = []
  for (let x = lo; x <= hi; x = Math.max(x + 1, Math.round((x * stepPermille) / 1000))) grid.push(x)
  return grid
}

/** One entry of a grid, uniformly: the answer a seed draws before anything else about its scene. */
export function drawFrom(rng: Rng, grid: readonly number[]): number {
  return grid[below(rng, grid.length)]
}

/** The x in [lo, hi] at which an increasing `f` reaches `target`, by 60 halvings; `lo` or `hi` when `target` lies outside. */
export function solveIncreasing(f: (x: number) => number, target: number, lo: number, hi: number): number {
  if (f(lo) >= target) return lo
  if (f(hi) <= target) return hi
  let a = lo
  let b = hi
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2
    if (f(mid) < target) a = mid
    else b = mid
  }
  return (a + b) / 2
}

// ---------------------------------------------------------------------------------------------------------------------------
// Forward estimates: the answer a scene gives, before it is run

/**
 * The p99 first-token latency from the due time of an open loop at `rho` times the capacity, in µs, when the arrivals run longer than
 * the server can serve (the fluid reading, as kernelspace's `bbQueue` is): the queue grows at (rho − 1) times capacity from the first
 * request, so the request due at the 99th percentile of the measured window has waited about (rho − 1) × that time, less what the 64
 * running requests hold and what the start-up fills. The last two are a hold of 64 / capacity times (0.32 + 0.1 × (rho − 1)) [estimated;
 * least squares on 252 runs of three traffic mixes at rho from 1.08 to 3 and 1,000 and 2,000 rows, 2026-11-04].
 *
 * `rows` is the measured rows and `warm` the warm-up rows, both of the honest run at that rate.
 */
export function overloadP99Us(rho: number, capacityPerSMilli: number, rows: number, warm: number): number {
  const rate = (rho * capacityPerSMilli) / 1000
  const tWarm = warm / rate
  const t99 = tWarm + (0.99 * rows) / rate
  const hold = (64 * 1000) / capacityPerSMilli
  return Math.max(0, (rho - 1) * t99 - hold * (0.32 + 0.1 * (rho - 1))) * SEC
}

/** The p99 first token of a light load is about this many ms for every token of its longest prompt [estimated; fitted on five longest prompts at four loads, 4 seeds each, 2026-11-04]. */
export function lightMsPerToken(rho: number): number {
  return 0.04 + 0.3 * rho
}

/** The p99 first-token latency of a light load (rho under about 0.7) whose longest prompts have `longest` tokens, in µs, with a floor of 40 ms. */
export function lightP99Us(rho: number, longest: number): number {
  return 40_000 + Math.round(longest * lightMsPerToken(rho) * 1000)
}

/** The multiplier a mixed traffic's p99 takes on from a load of 0.2 to 0.92 [estimated; read off three long prompts at two shares and six loads, 4 seeds each, 2026-11-04]. */
const MIX_MULTIPLIER: readonly (readonly [number, number])[] = [
  [0.2, 1],
  [0.4, 1.3],
  [0.6, 1.85],
  [0.75, 2.45],
  [0.85, 3.5],
  [0.92, 5],
]

/** The multiplier at `rho`, linear between the table's points and flat beyond its ends. */
export function mixMultiplier(rho: number): number {
  const t = MIX_MULTIPLIER
  if (rho <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (rho <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (rho - t[i - 1][0])) / (t[i][0] - t[i - 1][0])
  }
  return t[t.length - 1][1]
}

/**
 * The p99 of a traffic that is mostly short prompts and a few of `longest` tokens, in µs: at a load of 0.2 it is the long prompt's prefill
 * and the step it waits for, 40 ms + 62 µs for every token, and a higher load queues the long prompts behind one another.
 */
export function mixP99Us(rho: number, longest: number): number {
  return Math.round((40_000 + 62 * longest) * mixMultiplier(rho))
}

/**
 * How much longer than the fluid reading the p99 of an overloaded run turns out, at the median, as a function of the p99 in µs [estimated; read off
 * 750 runs of three kits with answers from 5 s to 130 s, 2026-11-04]. A queue's random walk adds to the drift, and at a few seconds it is most of
 * what there is. A scene aimed at `target` is aimed at `target / overloadBias(target)`. tests/sim/bench-broken.test.ts prints how far the scenes land.
 */
const OVERLOAD_BIAS: readonly (readonly [number, number])[] = [
  [5 * SEC, 1.4],
  [6 * SEC, 1.28],
  [8 * SEC, 1.12],
  [11 * SEC, 1.08],
  [15 * SEC, 1.04],
  [22 * SEC, 1.02],
  [35 * SEC, 1],
  [120 * SEC, 1],
]

export function overloadBias(targetUs: Us): number {
  const t = OVERLOAD_BIAS
  if (targetUs <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (targetUs <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (targetUs - t[i - 1][0])) / (t[i][0] - t[i - 1][0])
  }
  return t[t.length - 1][1]
}

