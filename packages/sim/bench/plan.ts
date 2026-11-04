// What a benchmark means to send (ARCHITECTURE §5.6): the requests of a spec, with their lengths and their due times, drawn from the
// workload module's generators so that one seed gives one schedule here, in `genWorkload` and in the Python grader (§9.8).
//
// A plan is the harness's intention. When each request is actually sent is the client's business (`run.ts`), and when it is served is the
// server's (`server.ts`).

import { divFloor } from '../core/int'
import { assertSeed } from '../core/rng'
import type { Seed, Us } from '../core/types'
import { genWorkload, replayWorkload } from '../workload'
import type { ArrivalPlan, ReqSpec, WorkloadOrigin } from '../workload'
import type { BenchSpec } from './types'

/** vLLM's default block: 16 tokens, and prefix caching shares whole blocks [measured at v0.33.0, read 2026-11-03: vllm M9]. */
export const PREFIX_BLOCK_TOKENS = 16

/**
 * The leading tokens of a prompt that a previous run left in the prefix cache: every full block of the prompt except that at least
 * the last token is always computed, since the engine needs its logits (vllm M9 for the block size; the rule is the model's).
 */
export function cachedPrefixTokens(promptTokens: number): number {
  return promptTokens <= 1 ? 0 : divFloor(promptTokens - 1, PREFIX_BLOCK_TOKENS) * PREFIX_BLOCK_TOKENS
}

/** A request the benchmark means to offer. */
export interface PlannedRequest {
  /** Its place in the schedule, from 0. */
  readonly id: number
  /** When the harness means to send it, or null in a closed loop without a schedule, where it is due when its client is ready to send it. */
  readonly dueUs: Us | null
  readonly promptTokens: number
  /** Tokens the server will emit for it: its length, cut at `outputCap`. */
  readonly outputTokens: number
  /** Leading prompt tokens that are already cached: 0 unless the spec says the cache is warm. */
  readonly cachedTokens: number
}

export interface BenchPlan {
  readonly origin: WorkloadOrigin
  readonly reqs: readonly PlannedRequest[]
}

function atLeast(x: unknown, least: number, what: string): void {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${String(x)}`)
}

/** Throws unless the spec is one the generator can run. The arrival kinds check their own numbers when the workload module draws them. */
export function checkSpec(spec: BenchSpec): void {
  atLeast(spec.requests, 0, 'requests')
  atLeast(spec.warmupUs, 0, 'warmupUs')
  atLeast(spec.durationUs, 1, 'durationUs')
  if (spec.warmupUs > spec.durationUs) throw new RangeError(`warmupUs (${spec.warmupUs}) is longer than the arrival window (${spec.durationUs})`)
  if (spec.outputCap !== undefined) atLeast(spec.outputCap, 1, 'outputCap')
  if (spec.clientCostUs !== undefined) atLeast(spec.clientCostUs, 0, 'clientCostUs')
  atLeast(spec.slo.ttftUs, 1, 'slo.ttftUs')
  atLeast(spec.slo.tpotUs, 1, 'slo.tpotUs')
  if (spec.arrivals.kind === 'closed') {
    atLeast(spec.arrivals.clients, 1, 'arrivals.clients')
    atLeast(spec.arrivals.thinkUs, 0, 'arrivals.thinkUs')
  }
}

/** Draws the requests of `spec` under `seed`: first the schedule and the lengths, then the cap and the cache hits applied to them. */
export function planBench(seed: Seed, spec: BenchSpec): BenchPlan {
  assertSeed(seed)
  checkSpec(spec)
  const schedule = spec.arrivals.kind === 'closed' ? (spec.arrivals.schedule ?? null) : spec.arrivals

  let reqs: readonly ReqSpec[]
  let origin: WorkloadOrigin
  if (schedule !== null && schedule.kind === 'replay') {
    if (spec.lengths !== undefined) throw new RangeError('a replay brings the lengths of its slice, so the spec must not give any')
    const w = replayWorkload(seed, { slice: schedule.slice, requests: Math.min(spec.requests, schedule.slice.requests.length), speedPermille: schedule.speedPermille })
    reqs = w.reqs
    origin = w.origin
  } else {
    if (spec.lengths === undefined) throw new RangeError('a benchmark that is not a replay needs lengths')
    const arrivals: ArrivalPlan =
      schedule === null || schedule.kind === 'burst'
        ? { kind: 'burst', ...(schedule?.atUs === undefined ? {} : { atUs: schedule.atUs }) }
        : { kind: 'poisson', ratePerSMilli: schedule.ratePerSMilli }
    const w = genWorkload(seed, { requests: spec.requests, arrivals, lengths: spec.lengths })
    reqs = w.reqs
    origin = w.origin
  }

  // A scheduled benchmark offers the requests that fall due inside the arrival window. A pure closed loop has no due times to cut by.
  const offered = schedule === null ? reqs : reqs.filter((r) => r.dueUs < spec.durationUs)
  return {
    origin,
    reqs: offered.map(
      (r, id): PlannedRequest => ({
        id,
        dueUs: schedule === null ? null : r.dueUs,
        promptTokens: r.promptTokens,
        outputTokens: spec.outputCap === undefined ? r.outputTokens : Math.min(r.outputTokens, spec.outputCap),
        cachedTokens: spec.prefixWarm === true ? cachedPrefixTokens(r.promptTokens) : 0,
      }),
    ),
  }
}
