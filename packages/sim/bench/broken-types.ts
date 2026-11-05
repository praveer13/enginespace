// The broken-benchmark corpus's vocabulary (ARCHITECTURE §5.6; GAMES §11). A case is a published benchmark claim, the harness and log
// behind it, and the one thing wrong with it; the learner names the flaw and predicts the number the claim should have been.
//
// Nothing here runs. A case is plain numbers, strings and arrays, so it crosses a worker boundary, a canonical-JSON hash and the
// Python grader's vectors unchanged. Everything in it is synthetic: the server is the step loop run coarse on S5's card, the traffic
// is the corpus's own, and no log is a real engine's (PRODUCT.md, "Evidence on Hand").

import type { Seed, Us } from '../core/types'
import type { ServerModel } from './server'
import type { BenchRow, BenchSpec } from './types'

/**
 * The ten flaws and the control (A§5.6, GAMES §11). The first four extend kernelspace's `broken-bench` (closed loop, capped output,
 * warm cache, counted warm-up). The order is the order of `brokenFlawOf`: seed `s` draws `BENCH_FLAWS[s mod 11]`.
 */
export const BENCH_FLAWS = [
  'closed-loop',
  'coordinated-omission',
  'client-queue-hidden',
  'warm-up-counted',
  'warm-cache',
  'capped-output',
  'too-few-samples',
  'mean-as-tail',
  'client-bottleneck',
  'replay-without-timestamps',
  'none',
] as const
export type BenchFlaw = (typeof BENCH_FLAWS)[number]

/**
 * What the harness reported (GAMES §11's `claim`): a p99 of the time to first token, in µs, from `n` requests, at the request rate the
 * report says it is about. Every claim is a TTFT p99, so the corrected number is comparable across flaws.
 */
export interface BenchClaim {
  readonly metric: 'ttft-p99'
  readonly valueUs: Us
  /** The rows the number was computed from: the measured rows of the log, after any warm-up the harness declared. */
  readonly n: number
  /** The rate the report says it describes, requests a second ×1,000: production's, which the benchmark meant to offer. */
  readonly ratePerSMilli: number
  /** Where the harness's timer starts, per request: `send` is the moment it was sent (a client queue before it is invisible), `due` the moment it was due. */
  readonly timerStartsAt: 'send' | 'due'
}

/** Everything the learner may see of a case. The Inspection decides what to draw; the flaw's name is not here. */
export interface BrokenScene {
  /** The seed of the benchmark's own draws (arrivals, lengths, the bootstrap's resamples): a case's `seed`, or a later attempt's. */
  readonly runSeed: Seed
  /** What the harness was told to do: the flags, in the vocabulary of `runBench`. */
  readonly setup: BenchSpec
  /** The server it ran against, including a stall or a cold start where there was one: the world, which a debrief may show. */
  readonly server: ServerModel
  readonly claim: BenchClaim
  /** The client's log: one row per request, in schedule order. */
  readonly rows: readonly BenchRow[]
  /** What the server can finish a second on this traffic, ×1,000, from a saturation run: the engine card's number. */
  readonly capacityPerSMilli: number
}

/** How a corrected number is found: from the log's own rows, from the log with its warm-up rows cut, or by re-running the benchmark with the flaw taken out. */
export type CorrectionKind = 'rows' | 'cut' | 'rerun'

/** The corrected benchmark's result. `ttftUs` is the sample the p99 is the 99th percentile of, in row order. */
export interface BrokenCorrection {
  readonly how: CorrectionKind
  readonly p99Us: Us
  readonly n: number
  readonly ttftUs: readonly Us[]
}

/** The answer a case was drawn for, and what it recomputed to. */
export interface BrokenAnswer {
  readonly how: CorrectionKind
  /** The corrected p99, from due times: recomputed from the scene by `correctBench`. */
  readonly p99Us: Us
  /** The rows it rests on: at least 1,000 (ASSESSMENT B7), also for `too-few-samples`, whose answer is a re-run of 1,500 rows. It is that flaw's claim that rests on fewer. */
  readonly n: number
  /** The answer the seed drew first (D39), before any scene: the corrected p99 the scene was built to give. The scene lands near it, not on it (tests/sim/bench-broken.test.ts prints how near). */
  readonly targetUs: Us
}

export interface BrokenBand {
  readonly ok: boolean
  /** What failed, in words, when `ok` is false. */
  readonly reasons: readonly string[]
  /** The claim and the corrected number, the larger over the smaller, ×1,000. The flaw must move the number by 1.5 times or more (kernelspace's `BB_MIN_RATIO`). */
  readonly ratioMilli: number
}

export interface BrokenCase {
  /** The seed the case was drawn from. */
  readonly seed: Seed
  /** Which of `BENCH_FLAWS` it is: hidden by the session. */
  readonly flaw: BenchFlaw
  readonly scene: BrokenScene
  readonly answer: BrokenAnswer
  readonly band: BrokenBand
  /** Draws of the benchmark's own randomness that this case took before one kept the band: 1 when the first did. */
  readonly attempts: number
  /** The claims that ground the flaw in a real tool or paper, which the debrief cites (content/claims/broken-bench.yaml). Empty for the control. */
  readonly claimIds: readonly string[]
}

/** The least the flaw may move the number by, as the larger over the smaller, ×1,000: kernelspace's `BB_MIN_RATIO` of 1.5 [measured: kernelspace at d478f91]. */
export const BROKEN_MIN_RATIO_MILLI = 1500

/** Draws of the benchmark's own randomness a case may take before it gives the best it has, flagged out of band. */
export const BROKEN_MAX_ATTEMPTS = 24
