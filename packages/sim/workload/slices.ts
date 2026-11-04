// Recorded request slices, read from kernelspace's vendored artifacts (ARCHITECTURE §5.2 `workload`, §13; VENDOR.md "traces").
//
// vendor/kernelspace/public/traces/ holds three slices of recorded traffic, thinned and clamped by kernelspace for its own
// tick-based simulators (its README beside them says how). Each is arrival offsets and token counts only: no prompt text, no
// output, no account or session. Two are BurstGPT v2.0 (CC BY 4.0) and one is Mooncake's Kimi conversation trace (Apache-2.0).
// This module does not load them. A caller imports the JSON at build time, as `src/` and the tests do, and hands the object to
// `parseSlice`, so their 104,643 bytes [measured 2026-11-03: 28,769 + 3,552 + 72,322] never ride in a chunk that does not use them.
//
// The attribution travels with the data: `sliceCredit` is what to print wherever a slice, or a workload drawn from it, is shown
// (VENDOR.md; the licences are in NOTICE). The rows are not the source's: BurstGPT's hour is 480 rows sampled evenly from
// 33,305 [measured: the artifact's `sampling.sourceRowsInWindow`], so a replay is a thinned stream, and the note says what was clamped.

import type { Us } from '../core/types'

/** The vendored slices, by the name of the file in `public/traces/` (not the artifact's own `id`). */
export type SliceId = 'burstgpt-v2-busiest-hour' | 'burstgpt-v2-busiest-minute' | 'kimi-conversation'
export const SLICE_IDS: readonly SliceId[] = ['burstgpt-v2-busiest-hour', 'burstgpt-v2-busiest-minute', 'kimi-conversation']

/** One request of a slice: arrival tick, prompt tokens and output tokens. */
export interface TraceRow {
  readonly t: number
  readonly p: number
  readonly o: number
}

/** A slice, in the shape of kernelspace's trace artifact (schema version 1). Fields that enginespace does not read are left untyped. */
export interface TraceSlice {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly source: string
  readonly sourceRevision: string
  readonly license: string
  readonly attribution: string
  readonly note: string
  /** How the rows were cut. `secondsPerTick` or `sourceMillisecondsPerTick` says how long a tick is. */
  readonly sampling: Readonly<Record<string, unknown>>
  readonly requestSha256: string | null
  /** In source order: ticks never decrease. */
  readonly requests: readonly TraceRow[]
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') throw new TypeError(`a slice needs a non-empty string "${key}"`)
  return value
}

/** Checks a parsed JSON value against the artifact schema and returns it typed. It throws on the first thing that is wrong. */
export function parseSlice(data: unknown): TraceSlice {
  if (!isRecord(data)) throw new TypeError('a slice is a JSON object')
  if (data.schemaVersion !== 1) throw new TypeError(`a slice has schemaVersion 1, got ${String(data.schemaVersion)}`)
  const sampling = data.sampling
  if (!isRecord(sampling)) throw new TypeError('a slice needs a "sampling" object')
  const requests = data.requests
  if (!Array.isArray(requests) || requests.length === 0) throw new TypeError('a slice needs a non-empty "requests" array')
  let previous = 0
  const rows: TraceRow[] = requests.map((row: unknown, i) => {
    if (!isRecord(row)) throw new TypeError(`request ${i} is not an object`)
    const { t, p, o } = row
    if (!Number.isSafeInteger(t) || (t as number) < previous) throw new TypeError(`request ${i}: the tick must be an integer that does not go back, got ${String(t)}`)
    if (!Number.isSafeInteger(p) || (p as number) < 1) throw new TypeError(`request ${i}: the prompt must be at least 1 token, got ${String(p)}`)
    if (!Number.isSafeInteger(o) || (o as number) < 1) throw new TypeError(`request ${i}: the output must be at least 1 token, got ${String(o)}`)
    previous = t as number
    return { t: t as number, p: p as number, o: o as number }
  })
  if (data.requestCount !== undefined && data.requestCount !== rows.length) {
    throw new TypeError(`requestCount says ${String(data.requestCount)} and the slice holds ${rows.length}`)
  }
  const slice: TraceSlice = {
    schemaVersion: 1,
    id: text(data, 'id'),
    name: text(data, 'name'),
    kind: text(data, 'kind'),
    source: text(data, 'source'),
    sourceRevision: text(data, 'sourceRevision'),
    license: text(data, 'license'),
    attribution: text(data, 'attribution'),
    note: text(data, 'note'),
    sampling,
    requestSha256: typeof data.requestSha256 === 'string' ? data.requestSha256 : null,
    requests: rows,
  }
  sliceTickUs(slice)
  return slice
}

/** How long one tick of a slice's `t` is, in µs: `secondsPerTick` (BurstGPT) or `sourceMillisecondsPerTick` (Kimi). */
export function sliceTickUs(slice: TraceSlice): Us {
  const { secondsPerTick, sourceMillisecondsPerTick } = slice.sampling
  const seconds = secondsPerTick !== undefined
  const milliseconds = sourceMillisecondsPerTick !== undefined
  if (seconds === milliseconds) throw new TypeError(`slice ${slice.id}: sampling must give exactly one of secondsPerTick and sourceMillisecondsPerTick`)
  const value = seconds ? secondsPerTick : sourceMillisecondsPerTick
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`slice ${slice.id}: a tick is a whole number of ${seconds ? 'seconds' : 'milliseconds'}, got ${String(value)}`)
  return (value as number) * (seconds ? 1_000_000 : 1_000)
}

/** What to print wherever a slice, or a workload built from one, is shown. */
export interface SliceCredit {
  readonly id: string
  readonly license: string
  readonly attribution: string
  readonly source: string
  readonly sourceRevision: string
  /** The slice's own account of what was sampled and clamped. */
  readonly note: string
}

export function sliceCredit(slice: TraceSlice): SliceCredit {
  const { id, license, attribution, source, sourceRevision, note } = slice
  return { id, license, attribution, source, sourceRevision, note }
}

/** The credit as one line of text. */
export function formatCredit(credit: SliceCredit): string {
  return `${credit.attribution}. ${credit.license}. ${credit.source} (${credit.sourceRevision}). ${credit.note}`
}
