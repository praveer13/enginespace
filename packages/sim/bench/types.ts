// The benchmark generator's vocabulary (ARCHITECTURE §5.6; WORLD §5 `bench`; GAMES §11): what a benchmark is told to do, what the
// server is, what the client logged, and what a summary of the log says.
//
// Nothing here runs. Every value is a plain number, string or array of them, so a run crosses a worker boundary, a canonical-JSON
// hash and the receipt verifier unchanged. Times are integer µs (§5.1); a receipt's log is in ns (ASSESSMENT §6.2), and the
// verifier converts with `NS_PER_US` before it calls `summarizeRows`.

import type { Permille, ReqId, Seed, Us } from '../core/types'
import type { LengthPlan, TraceSlice, WorkloadOrigin } from '../workload'

// ---------------------------------------------------------------------------------------------------------------------------
// What the benchmark is told to do

/**
 * Arrivals that do not depend on the server: the schedule an open-loop client follows, and the schedule a closed-loop harness
 * means to follow (its due times). Both are the workload module's, so one seed gives the same due times here and in `genWorkload`.
 */
export type OpenArrivals =
  /** A Poisson process of `ratePerSMilli` / 1000 requests per second, from the committed exponential-quantile table (§5.1, §5.6). */
  | { readonly kind: 'poisson'; readonly ratePerSMilli: number }
  /**
   * A recorded slice replayed in time: row i is due `(tick_i − tick_0) · tickUs · 1000 / speedPermille` after the first, with its own
   * lengths (WORLD §2.2). The slice travels in the spec, parsed by `parseSlice`, because this package loads no files.
   */
  | { readonly kind: 'replay'; readonly slice: TraceSlice; readonly speedPermille: number }
  /** Every request is due at `atUs` (default 0): `vllm bench serve --request-rate inf`, its default (vllm B1). */
  | { readonly kind: 'burst'; readonly atUs?: Us }

export type ArrivalSpec =
  | OpenArrivals
  /**
   * `clients` clients that each wait for a reply before they send again, then think for `thinkUs` (Schroeder, Wierman and
   * Harchol-Balter 2006: in a closed system new arrivals are triggered only by completions). The next request goes to the client
   * that finishes first, as `vllm bench serve --max-concurrency` hands requests to whichever permit frees first (vllm B2).
   *
   * `schedule` is the intended load that the harness tries to follow: each request has the due time the schedule gives it, and a
   * client never sends it before then. A server slower than the schedule asks of it holds the clients back, so sends slip behind
   * their due times: coordinated omission, by construction. With a `burst` schedule this is `vllm bench serve --request-rate inf
   * --max-concurrency N`, whose waiting time for a permit is `client_queue_time` (vllm B2).
   *
   * Without a `schedule` the loop has no intended times of its own, and a request is due when its client is ready to send it: the
   * client's previous reply plus its think time. Its log then shows no slip, which is how a closed loop hides an overload.
   */
  | { readonly kind: 'closed'; readonly clients: number; readonly thinkUs: Us; readonly schedule?: OpenArrivals }

export interface BenchSpec {
  readonly arrivals: ArrivalSpec
  /**
   * The prompt and output lengths of the requests. A replay brings its own, and its spec must not carry any; every other spec must.
   * The k-th request offered (or sent, in a pure closed loop) has the k-th length the seed draws, whatever its timing.
   */
  readonly lengths?: LengthPlan
  /**
   * At most this many requests are offered: the first `requests` of the schedule that fall due before `durationUs`. A closed loop
   * without a schedule sends this many at most, and sends no new request at or after `durationUs`.
   */
  readonly requests: number
  /**
   * The warm-up window the harness declares: requests due in `[0, warmupUs)` stay in the log and are excluded from the measured
   * statistics, which `summarize` reports apart (ASSESSMENT B8). A server that starts cold (`ServerModel.cold`) is what makes this
   * matter; a harness that declares 0 counts the cold start.
   */
  readonly warmupUs: Us
  /** The arrival window, `[0, durationUs)`: where goodput's denominator comes from (the course's definition) and where the load stops. */
  readonly durationUs: Us
  /** The harness sends `max_tokens` = this, so every reply is cut at it. */
  readonly outputCap?: number
  /**
   * The previous run left these prompts in the server's prefix cache (`vllm bench serve` run twice against one server; vllm B3), so
   * every full block of every prompt is a hit and only the rest is prefilled. At least the last token is always recomputed.
   */
  readonly prefixWarm?: boolean
  /**
   * The client's own CPU time per request, on one thread: sends are at least this far apart, so a client asked to send faster than
   * `1 / clientCostUs` falls behind its schedule whatever the server does (WORLD §5 "client CPU contention as a stated client cost").
   */
  readonly clientCostUs?: Us
  /** The objectives goodput counts against: a request meets them when its TTFT (from its due time) and its TPOT are both within. */
  readonly slo: { readonly ttftUs: Us; readonly tpotUs: Us }
}

// ---------------------------------------------------------------------------------------------------------------------------
// What the client logged

/**
 * One request of a benchmark's log (ASSESSMENT §6.2: id, due time, actual send, first token, last token, prompt and output tokens),
 * in integer µs from the start of the run.
 */
export interface BenchRow {
  /** The request's place in the schedule, from 0. */
  readonly id: ReqId
  /** The client that sent it, or null in an open loop. */
  readonly client: number | null
  /** When the harness meant to send it. Latency counts from here (ASSESSMENT B5). */
  readonly dueUs: Us
  /** When it was sent, never before `dueUs`. */
  readonly sentUs: Us
  /** When its first token reached the client. */
  readonly firstUs: Us
  /** When its last token reached the client. */
  readonly doneUs: Us
  readonly promptTokens: number
  /** Tokens the server emitted for it, after any cap. At least 1. */
  readonly outputTokens: number
}

export interface BenchRun {
  readonly seed: Seed
  /** Where the requests' numbers come from, which a screen must show (D-012). */
  readonly origin: WorkloadOrigin
  /** One row per request, in schedule order. */
  readonly rows: readonly BenchRow[]
  /** The spec the run was given. */
  readonly spec: BenchSpec
  /** When the last request finished: the end of the drain tail. */
  readonly endUs: Us
  /** Steps the server ran, and the µs its GPU spent in them. */
  readonly steps: number
  readonly gpuBusyUs: Us
}

// ---------------------------------------------------------------------------------------------------------------------------
// What a summary says

/** Percentiles by nearest rank on a sorted sample of integers (§5.6), with the mean rounded to a whole µs. */
export interface LatencyPercentiles {
  readonly n: number
  readonly meanUs: Us
  readonly p50Us: Us
  readonly p90Us: Us
  readonly p99Us: Us
  readonly maxUs: Us
  /** How many observations lie beyond the p99: ASSESSMENT B7 asks for at least 10, which takes 1,000 measured rows. */
  readonly beyondP99: number
}

/** A percentile bootstrap interval (§5.6) with the point estimate it brackets. */
export interface BootstrapInterval {
  readonly pointUs: Us
  readonly loUs: Us
  readonly hiUs: Us
  /** The resamples drawn, and the interval's nominal level out of 1,000. */
  readonly resamples: number
  readonly levelPermille: Permille
}

/**
 * Little's law over a window (§5.6): L = λW. The window's mean number in flight, `inFlightUs / window`, against the completions in it
 * per second times their mean latency, `sojournUs / window`. Both are sums over requests, so the window cancels from the residual.
 */
export interface LittlesLaw {
  readonly fromUs: Us
  readonly toUs: Us
  /** Requests that finished inside the window. */
  readonly completions: number
  /** The integral of the number in flight over the window, in request·µs: each request counts the part of `[start, done)` inside it. */
  readonly inFlightUs: number
  /** The sum, over the completions, of their whole time in the system: `done − start`. */
  readonly sojournUs: number
  /** L, the mean number in flight, times 1,000. */
  readonly meanInFlightMilli: number
  /** λ, completions per second, times 1,000. */
  readonly throughputPerSMilli: number
  /** W, the completions' mean latency. */
  readonly meanLatencyUs: Us
  /** λW times 1,000, which L should equal. */
  readonly expectedInFlightMilli: number
  /** `|L − λW| / L` out of 1,000, from the sums. 0 when nothing was in flight. */
  readonly residualPermille: Permille
}

/**
 * How closely the sends followed their schedule (ASSESSMENT B4): lateness is `sent − due`. A client that waits for the server
 * falls behind exactly when the server is slow, and that is coordinated omission.
 */
export interface ArrivalAdherence {
  readonly rows: number
  /** Rows sent more than `toleranceUs` after they were due, and more than `hardLimitUs` after. */
  readonly lateRows: number
  readonly veryLateRows: number
  readonly maxLateUs: Us
  readonly toleranceUs: Us
  readonly hardLimitUs: Us
  /** B4 as written: at least 99.9% of rows within the tolerance, and every row within the hard limit. */
  readonly ok: boolean
}

export interface BenchSummary {
  readonly counts: {
    /** Rows in the log. */
    readonly offered: number
    /** Rows due before the warm-up ends, kept apart. */
    readonly warmup: number
    /** Every other row, which each statistic below counts except Little's law and the adherence, which read the whole log. */
    readonly measured: number
  }
  /** The measured arrival window: from the end of the warm-up to the end of the arrival window. */
  readonly window: { readonly fromUs: Us; readonly toUs: Us }
  /**
   * Latency of the measured rows. "From due" is the course's rule (ASSESSMENT B5). "From sent" is what a harness that starts its
   * timer when it sends reports; the two agree exactly when every send was on time. A TPOT is the same from either start.
   */
  readonly latency: {
    readonly ttftFromDue: LatencyPercentiles | null
    readonly ttftFromSent: LatencyPercentiles | null
    readonly tpot: LatencyPercentiles | null
    readonly e2eFromDue: LatencyPercentiles | null
    readonly e2eFromSent: LatencyPercentiles | null
  }
  /** The 95% bootstrap intervals on the p99 of the measured rows, from the due time. Null when `bootstrap` was 0 or the sample is empty. */
  readonly p99Intervals: {
    readonly ttftFromDue: BootstrapInterval | null
    readonly tpot: BootstrapInterval | null
    readonly e2eFromDue: BootstrapInterval | null
  }
  /** Goodput at the SLO: measured requests that met both objectives, wherever they finished, per second ×1,000 under each denominator. */
  readonly goodput: {
    readonly met: number
    /** Over the arrival window: the course's definition (kernelspace's knee). */
    readonly arrivalWindowPerSMilli: number
    /** Over the time from the window's start to the last measured request's end, drain tail included: SGLang's `--goodput` (sglang T6). */
    readonly totalDurationPerSMilli: number
  }
  /** Measured rows per second ×1,000 by when they were due (the rate the harness meant to offer) and by when they were sent (the rate it achieved). */
  readonly rates: { readonly intendedPerSMilli: number; readonly sentPerSMilli: number }
  readonly littles: LittlesLaw
  readonly adherence: ArrivalAdherence
}
