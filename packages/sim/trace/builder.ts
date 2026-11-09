// A builder for traces (ARCHITECTURE §5.7): the way `traceFromRun` writes one, and the way W1-T16's lifecycle traces and a test's
// hand-made traces are written. It interns the strings, checks every value as it goes in, and turns the rows into the columns of
// `trace@1` at the end.

import type { EsTrace, TraceFlow, TraceFlowKind, TraceMark, TraceMeta, TraceTrack, TraceTrackKind } from './types'
import { TRACE_SCHEMA } from './types'

interface SpanRow {
  readonly track: number
  readonly startNs: number
  readonly durNs: number
  readonly name: number
  readonly cat: number
  readonly corr: number
}

export interface TraceBuilder {
  /** The index of `text` in the string table, adding it on first use. Strings are numbered in the order they are first used. */
  string(text: string): number
  /** Adds a track and returns its id, from 0 in the order added. */
  track(kind: TraceTrackKind, name: string): number
  /**
   * Adds a span and returns its handle, which `flow` takes. The handle is the span's index in the finished trace when spans are
   * added in the order `build` lists them (below), and `build` renumbers the flows when they are not. `corr` is −1 by default.
   */
  span(track: number, startNs: number, durNs: number, name: string, cat: string, corr?: number): number
  flow(from: number, to: number, kind: TraceFlowKind): void
  mark(tNs: number, name: string): void
  /**
   * The finished trace. Spans are listed by start time, then by the order of their tracks, then the longer first (so a frame comes
   * before the frames nested in it that start with it), then in the order added. Marks are listed by time. Flows keep their order.
   */
  build(meta: TraceMeta): EsTrace
}

function nonNegative(x: number, what: string): void {
  if (!Number.isSafeInteger(x) || x < 0) throw new RangeError(`${what} must be a non-negative integer below 2^53, got ${x}`)
}

export function traceBuilder(): TraceBuilder {
  const strings: string[] = []
  const interned = new Map<string, number>()
  const tracks: TraceTrack[] = []
  const rows: SpanRow[] = []
  const arrows: TraceFlow[] = []
  const instants: TraceMark[] = []

  const string = (text: string): number => {
    const known = interned.get(text)
    if (known !== undefined) return known
    strings.push(text)
    interned.set(text, strings.length - 1)
    return strings.length - 1
  }

  return {
    string,
    track(kind, name) {
      tracks.push({ id: tracks.length, kind, name: string(name) })
      return tracks.length - 1
    },
    span(track, startNs, durNs, name, cat, corr = -1) {
      if (!Number.isInteger(track) || track < 0 || track >= tracks.length) throw new RangeError(`a span's track must be one added with track(), got ${track}`)
      nonNegative(startNs, 'a span\'s start')
      nonNegative(durNs, 'a span\'s duration')
      nonNegative(startNs + durNs, 'a span\'s end')
      if (!Number.isInteger(corr) || corr < -1 || corr > 0x7fffffff) throw new RangeError(`a correlation id is −1 or an integer below 2^31, got ${corr}`)
      rows.push({ track, startNs, durNs, name: string(name), cat: string(cat), corr })
      return rows.length - 1
    },
    flow(from, to, kind) {
      arrows.push({ from, to, kind })
    },
    mark(tNs, name) {
      nonNegative(tNs, 'a mark\'s time')
      instants.push({ tNs, name: string(name) })
    },
    build(meta) {
      for (const flow of arrows) {
        for (const end of [flow.from, flow.to]) {
          if (!Number.isInteger(end) || end < 0 || end >= rows.length) throw new RangeError(`a flow joins spans that were added, got ${end} of ${rows.length}`)
        }
      }
      const order = rows.map((_, handle) => handle)
      order.sort((a, b) => {
        const x = rows[a]
        const y = rows[b]
        return x.startNs - y.startNs || x.track - y.track || y.durNs - x.durNs || a - b
      })
      const rank = new Array<number>(rows.length)
      order.forEach((handle, place) => {
        rank[handle] = place
      })
      const spans = {
        track: new Int32Array(rows.length),
        startNs: new Float64Array(rows.length),
        durNs: new Float64Array(rows.length),
        name: new Int32Array(rows.length),
        cat: new Int32Array(rows.length),
        corr: new Int32Array(rows.length),
      }
      order.forEach((handle, place) => {
        const row = rows[handle]
        spans.track[place] = row.track
        spans.startNs[place] = row.startNs
        spans.durNs[place] = row.durNs
        spans.name[place] = row.name
        spans.cat[place] = row.cat
        spans.corr[place] = row.corr
      })
      const marks = instants.map((m, i) => ({ m, i })).sort((a, b) => a.m.tNs - b.m.tNs || a.i - b.i).map(({ m }) => m)
      return {
        schema: TRACE_SCHEMA,
        meta: { ...meta },
        strings: [...strings],
        tracks: [...tracks],
        spans,
        flows: arrows.map((f) => ({ from: rank[f.from], to: rank[f.to], kind: f.kind })),
        marks,
      }
    },
  }
}
