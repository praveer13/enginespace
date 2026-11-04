// Seeded workloads (ARCHITECTURE §5.2 `workload`; WORLD §2.2): arrivals, lengths, and what requests share, drawn from tables or
// replayed from a recorded slice.
//
// One seed gives one workload, and each part of it has a sub-stream of its own (`rngFor(seed, 'workload/<part>')`), so changing
// what the adapters do never moves an arrival or a length. Every part draws the same number of values for each request whether or
// not the request uses it (a share of 0 or of 1,000 consumes as much as any other), and the draws of request i are made in order of i.
//
// Closed-loop clients are not drawn here. A client sends when the server has answered, so the benchmark (§5.6) owns their
// timing: it takes the shapes of requests from a workload and ignores `dueUs`.

import { assertSeed, below, between, chance, rngFor, weighted } from '../core/rng'
import type { Rng } from '../core/rng'
import { divRound } from '../core/int'
import { expDelayUs } from '../core/exp'
import type { Permille, Seed, Us } from '../core/types'
import { formatCredit, sliceCredit, sliceTickUs } from './slices'
import type { TraceRow, TraceSlice } from './slices'
import type { ReqSpec, Workload, WorkloadOrigin } from './types'

/** A distribution over token counts, every one at least 1. */
export type Dist =
  /** Always `value`. */
  | { readonly kind: 'const'; readonly value: number }
  /** Uniform over the integers from `lo` to `hi`, both included. */
  | { readonly kind: 'uniform'; readonly lo: number; readonly hi: number }
  /** `values[i]` with probability `weights[i]` over the total: a table of integer weights, as a heavy tail is written. */
  | { readonly kind: 'menu'; readonly values: readonly number[]; readonly weights: readonly number[] }

export type ArrivalPlan =
  /** Every request is due at `atUs` (default 0): a burst. */
  | { readonly kind: 'burst'; readonly atUs?: Us }
  /** Request i is due at `startUs + i · gapUs`. */
  | { readonly kind: 'even'; readonly gapUs: Us; readonly startUs?: Us }
  /**
   * A Poisson process of `ratePerSMilli` / 1000 requests per second: exponential gaps from the committed table (`expDelayUs`),
   * added up from `startUs` (default 0), so the first request arrives after one gap.
   */
  | { readonly kind: 'poisson'; readonly ratePerSMilli: number; readonly startUs?: Us }

export type LengthPlan =
  /** Prompt and output lengths drawn independently from their own distributions. */
  | { readonly kind: 'dists'; readonly prompt: Dist; readonly output: Dist }
  /** (prompt, output) pairs resampled with replacement from a slice's rows: the lengths of recorded traffic, in whatever arrival pattern. */
  | { readonly kind: 'rows'; readonly slice: TraceSlice }

/** Prefix sharing: a share of the requests belong to one of `groups` groups, whose members start with the same `prefixTokens` tokens. */
export interface PrefixSharing {
  readonly groups: number
  readonly prefixTokens: number
  readonly sharePermille: Permille
}

/** Adapters: a share of the requests ask for one of `count` LoRA adapters, uniformly or by integer `weights` (one per adapter). */
export interface AdapterUse {
  readonly count: number
  readonly sharePermille: Permille
  readonly weights?: readonly number[]
}

/** What a request may share or carry beyond its timing and lengths. */
export interface Decorations {
  readonly prefix?: PrefixSharing
  readonly adapters?: AdapterUse
  /** The share of requests that carry a grammar. */
  readonly structuredPermille?: Permille
}

export interface WorkloadSpec extends Decorations {
  readonly requests: number
  readonly arrivals: ArrivalPlan
  readonly lengths: LengthPlan
}

export interface ReplaySpec extends Decorations {
  readonly slice: TraceSlice
  /** How many of the slice's first rows to replay: all of them by default. */
  readonly requests?: number
  /** Replay speed out of 1,000: 1,000 is the recorded pace, 8,000 sends eight times as fast. */
  readonly speedPermille: number
}

const SALT = {
  arrivals: 'workload/arrivals',
  prompt: 'workload/prompt',
  output: 'workload/output',
  rows: 'workload/rows',
  prefix: 'workload/prefix',
  adapters: 'workload/adapters',
  structured: 'workload/structured',
} as const

function integer(x: number, least: number, what: string): void {
  if (!Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${x}`)
}

function share(x: number, what: string): void {
  if (!Number.isInteger(x) || x < 0 || x > 1000) throw new RangeError(`${what} must be an integer from 0 to 1000 permille, got ${x}`)
}

function checkDist(dist: Dist, what: string): void {
  if (dist.kind === 'const') integer(dist.value, 1, `${what}.value`)
  else if (dist.kind === 'uniform') {
    integer(dist.lo, 1, `${what}.lo`)
    integer(dist.hi, dist.lo, `${what}.hi`)
  } else {
    if (dist.values.length === 0 || dist.values.length !== dist.weights.length) throw new RangeError(`${what}: a menu needs as many weights as values, and at least one`)
    dist.values.forEach((value, i) => integer(value, 1, `${what}.values[${i}]`))
    // `weighted` checks the weights' own domain when it draws; this catches an all-zero menu before the first draw.
    if (!dist.weights.some((w) => w > 0)) throw new RangeError(`${what}: a menu needs a weight above 0`)
  }
}

function draw(rng: Rng, dist: Dist): number {
  if (dist.kind === 'const') return dist.value
  if (dist.kind === 'uniform') return between(rng, dist.lo, dist.hi)
  return dist.values[weighted(rng, dist.weights)]
}

function checkDecorations(spec: Decorations): void {
  if (spec.prefix) {
    integer(spec.prefix.groups, 1, 'prefix.groups')
    integer(spec.prefix.prefixTokens, 1, 'prefix.prefixTokens')
    share(spec.prefix.sharePermille, 'prefix.sharePermille')
  }
  if (spec.adapters) {
    integer(spec.adapters.count, 1, 'adapters.count')
    share(spec.adapters.sharePermille, 'adapters.sharePermille')
    if (spec.adapters.weights !== undefined && spec.adapters.weights.length !== spec.adapters.count) throw new RangeError('adapters.weights needs one weight per adapter')
  }
  if (spec.structuredPermille !== undefined) share(spec.structuredPermille, 'structuredPermille')
}

function dueTimes(seed: Seed, plan: ArrivalPlan, n: number): Us[] {
  const due: Us[] = []
  if (plan.kind === 'burst') {
    const at = plan.atUs ?? 0
    integer(at, 0, 'arrivals.atUs')
    for (let i = 0; i < n; i++) due.push(at)
  } else if (plan.kind === 'even') {
    integer(plan.gapUs, 0, 'arrivals.gapUs')
    const start = plan.startUs ?? 0
    integer(start, 0, 'arrivals.startUs')
    for (let i = 0; i < n; i++) due.push(start + i * plan.gapUs)
  } else {
    integer(plan.ratePerSMilli, 1, 'arrivals.ratePerSMilli')
    if (plan.ratePerSMilli > 1_000_000_000) throw new RangeError(`arrivals.ratePerSMilli is at most 10^9 (a million requests a second), got ${plan.ratePerSMilli}`)
    const start = plan.startUs ?? 0
    integer(start, 0, 'arrivals.startUs')
    const rng = rngFor(seed, SALT.arrivals)
    let at = start
    for (let i = 0; i < n; i++) {
      at += expDelayUs(rng, 1_000_000_000, plan.ratePerSMilli)
      due.push(at)
    }
  }
  if (n > 0 && !Number.isSafeInteger(due[n - 1])) throw new RangeError('the arrivals run past 2^53 µs')
  return due
}

/** The reqs of a workload from its parts: the lengths of request i are `prompt[i]` and `output[i]`. */
function build(seed: Seed, due: readonly Us[], prompt: readonly number[], output: readonly number[], spec: Decorations): ReqSpec[] {
  const prefixRng = spec.prefix && rngFor(seed, SALT.prefix)
  const adapterRng = spec.adapters && rngFor(seed, SALT.adapters)
  const structuredPermille = spec.structuredPermille
  const structuredRng = structuredPermille === undefined ? undefined : rngFor(seed, SALT.structured)
  return due.map((dueUs, id): ReqSpec => {
    let prefixGroup: number | null = null
    let prefixTokens = 0
    if (spec.prefix && prefixRng) {
      // Both are drawn for every request, so the group a request would join does not depend on the share.
      const member = chance(prefixRng, spec.prefix.sharePermille)
      const group = below(prefixRng, spec.prefix.groups)
      if (member) {
        prefixGroup = group
        prefixTokens = Math.min(spec.prefix.prefixTokens, prompt[id])
      }
    }
    let adapter: number | null = null
    if (spec.adapters && adapterRng) {
      const uses = chance(adapterRng, spec.adapters.sharePermille)
      const which = spec.adapters.weights ? weighted(adapterRng, spec.adapters.weights) : below(adapterRng, spec.adapters.count)
      if (uses) adapter = which
    }
    const structured = structuredRng !== undefined && structuredPermille !== undefined && chance(structuredRng, structuredPermille)
    return { id, dueUs, promptTokens: prompt[id], outputTokens: output[id], prefixGroup, prefixTokens, adapter, structured }
  })
}

/** A workload drawn from the tables and distributions of `spec`, under `seed`. It is synthetic, and says so. */
export function genWorkload(seed: Seed, spec: WorkloadSpec): Workload {
  assertSeed(seed)
  integer(spec.requests, 0, 'requests')
  checkDecorations(spec)
  if (spec.lengths.kind === 'dists') {
    checkDist(spec.lengths.prompt, 'lengths.prompt')
    checkDist(spec.lengths.output, 'lengths.output')
  } else if (spec.lengths.slice.requests.length === 0) {
    throw new RangeError('lengths.slice has no rows to resample')
  }
  const n = spec.requests
  const due = dueTimes(seed, spec.arrivals, n)
  const prompt: number[] = []
  const output: number[] = []
  let origin: WorkloadOrigin = { kind: 'synthetic' }
  if (spec.lengths.kind === 'dists') {
    const promptRng = rngFor(seed, SALT.prompt)
    const outputRng = rngFor(seed, SALT.output)
    for (let i = 0; i < n; i++) {
      prompt.push(draw(promptRng, spec.lengths.prompt))
      output.push(draw(outputRng, spec.lengths.output))
    }
  } else {
    const { slice } = spec.lengths
    const rows: readonly TraceRow[] = slice.requests
    const rng = rngFor(seed, SALT.rows)
    for (let i = 0; i < n; i++) {
      const row = rows[below(rng, rows.length)]
      prompt.push(row.p)
      output.push(row.o)
    }
    origin = { kind: 'slice', use: 'lengths', credit: sliceCredit(slice) }
  }
  return { seed, origin, reqs: build(seed, due, prompt, output, spec) }
}

/**
 * A workload that replays the first `requests` rows of a recorded slice at `speedPermille` / 1000 of its pace: row i is due
 * `round((tick_i − tick_0) · tickUs · 1000 / speedPermille)` µs after the first, and brings its own lengths. Only the decorations
 * (prefix groups, adapters, grammar) are drawn from the seed.
 */
export function replayWorkload(seed: Seed, spec: ReplaySpec): Workload {
  assertSeed(seed)
  checkDecorations(spec)
  integer(spec.speedPermille, 1, 'speedPermille')
  const available = spec.slice.requests.length
  const n = spec.requests ?? available
  if (!Number.isSafeInteger(n) || n < 0 || n > available) throw new RangeError(`requests must be from 0 to the ${available} rows of the slice, got ${n}`)
  const tickUs = sliceTickUs(spec.slice)
  const rows = spec.slice.requests.slice(0, n)
  const first = rows.length > 0 ? rows[0].t : 0
  const due = rows.map((row) => {
    if (row.t < first) throw new RangeError('the rows of a slice are in order of tick')
    return divRound((row.t - first) * tickUs * 1000, spec.speedPermille)
  })
  const origin: WorkloadOrigin = { kind: 'slice', use: 'replay', credit: sliceCredit(spec.slice) }
  return {
    seed,
    origin,
    reqs: build(seed, due, rows.map((row) => row.p), rows.map((row) => row.o), spec),
  }
}

/** The line a screen prints beside a workload: "synthetic", or the credit of the slice it was built from. */
export function originLabel(origin: WorkloadOrigin): string {
  return origin.kind === 'synthetic' ? 'synthetic' : `${origin.use === 'replay' ? 'Replay of' : 'Lengths from'} ${formatCredit(origin.credit)}`
}

