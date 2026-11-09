/*
 * Shared by the benchmark generator's tests (tests/sim/bench-*.test.ts): the servers and specs they run, a host card of zeros, and
 * oracles that do not share the generator's code:
 *   - `inFlightMax` finds the most requests in flight at one instant by sorting the starts and the ends and sweeping them;
 *   - `exactCoverage` is the probability that an interval [x_(l), x_(u)] of order statistics covers a continuous distribution's
 *     p-quantile, which is a binomial sum, so the coverage of a bootstrap interval can be computed without drawing a sample.
 * A test that imports from here is checking the generator against a second statement of the same rules.
 */
import type { Us } from '../../packages/sim/core'
import { compareAsc } from '../../packages/sim/core'
import type { HostCard } from '../../packages/sim/host'
import { s5Card } from '../../packages/sim/steploop'
import { s5Server } from '../../packages/sim/bench'
import type { BenchRow, BenchSpec, ServerModel } from '../../packages/sim/bench'

/** Every host phase at zero: `runStepLoop` with this card is the coarse server's definition (ARCHITECTURE §5.6). */
export const ZERO_HOST: HostCard = {
  scheduleBaseUs: 0,
  schedulePerSeqUs: 0,
  prepPerTokenUs: 0,
  launchPerKernelUs: 0,
  kernelsPerLayer: 0,
  graphReplayUs: 0,
  syncUs: 0,
  samplePerSeqUs: 0,
  detokPerTokenUs: 0,
  maskPerSeqUs: 0,
  ipcUs: 0,
}

/** The harness S5's rows were fitted on: 64 sequences and an 8,192-token budget (WORLD §4.2), on "70B on H100" at TP 4. */
export const H100_TP4_GPU = s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu')
export const S5_SERVER: ServerModel = s5Server('h100-vllm-0-10-2-fp8', 4)

/** A 5 s freeze at 30 s: the stall of the coordinated-omission tests. */
export const STALL = { atUs: 30_000_000, forUs: 5_000_000 } as const

export const SEC = 1_000_000

/**
 * Chat-sized requests on the 70B card: prompts of 128 to 512 tokens and replies of 64 to 192, about 2 s each at a quarter load.
 * A 120 s arrival window with the first 10 s as warm-up, and objectives of 500 ms to the first token and 50 ms a token after.
 */
export const LLM_SPEC: Omit<BenchSpec, 'arrivals'> = {
  lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 128, hi: 512 }, output: { kind: 'uniform', lo: 64, hi: 192 } },
  requests: 4000,
  warmupUs: 10 * SEC,
  durationUs: 120 * SEC,
  slo: { ttftUs: 500_000, tpotUs: 50_000 },
}

/** `rps` requests a second, as the spec writes a Poisson rate. */
export const poisson = (rps: number) => ({ kind: 'poisson', ratePerSMilli: rps * 1000 }) as const

/**
 * The most requests in flight at one instant, where a request is in flight from `start(row)` to `end(row)`, the start included and
 * the end not: a request that finishes at t and one that starts at t do not overlap.
 */
export function inFlightMax(rows: readonly BenchRow[], start: (r: BenchRow) => Us, end: (r: BenchRow) => Us): number {
  const events: [Us, number][] = []
  for (const r of rows) {
    events.push([start(r), 1])
    events.push([end(r), -1])
  }
  // At one instant the ends come before the starts.
  events.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
  let open = 0
  let most = 0
  for (const [, delta] of events) {
    open += delta
    if (open > most) most = open
  }
  return most
}

/** The sorted copy of a list of numbers. */
export const ascending = (xs: readonly number[]): number[] => [...xs].sort(compareAsc)

/**
 * P(Binomial(n, p) ≤ k) for every k from 0 to n, summed from the probabilities in log space. Tests only: it uses Math.log and
 * Math.exp, which packages/sim bans.
 */
export function binomialCdf(n: number, p: number): Float64Array {
  const logFactorial = new Float64Array(n + 2)
  for (let i = 1; i <= n + 1; i++) logFactorial[i] = logFactorial[i - 1] + Math.log(i)
  const cdf = new Float64Array(n + 1)
  let total = 0
  for (let k = 0; k <= n; k++) {
    total += Math.exp(logFactorial[n] - logFactorial[k] - logFactorial[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p))
    cdf[k] = total
  }
  return cdf
}

/**
 * The probability that [x_(low), x_(high)], the low-th and the high-th smallest of n independent draws from a continuous
 * distribution, contains that distribution's p-quantile (1-based ranks): x_(low) is at most the quantile when at least `low` of
 * the draws are, and x_(high) is at least it when fewer than `high` are below it, so the probability is
 * P(low ≤ Binomial(n, p) ≤ high − 1).
 */
export function exactCoverage(cdf: Float64Array, low: number, high: number): number {
  return cdf[high - 1] - (low >= 1 ? cdf[low - 1] : 0)
}
