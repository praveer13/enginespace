// `trace@1` as bytes (ARCHITECTURE §5.7, §9.6): the columns as plain JSON, its canonical text, and the strict reader that turns
// text back into the same trace.
//
// A trace travels as one JSON object whose span columns are arrays of integers (the bundle's `json` encoding, §9.6). The text is
// canonical (core/json), so its SHA-256 means the same in every runtime and in the Python grader (§9.8), and
// `decodeTrace(encodeTrace(t))` is `t`, value for value and column type for column type. The reader is strict where a lenient one
// would let two texts mean one trace: a field it does not know, a missing field, a column of another length, a value that is not
// an integer, an index outside its table, and -0 are all errors that name the field. It judges the shape of a trace and not its
// physics: a span that starts before 0 reads fine, and `traceChecks` (T2) is what fails it.

import { canonicalJson } from '../core/json'
import type { EsTrace, TraceFlow, TraceFlowKind, TraceJson, TraceMark, TraceMeta, TraceSource, TraceSpanView, TraceTrack, TraceTrackKind } from './types'
import { TRACE_SCHEMA } from './types'

const SOURCES: ReadonlySet<string> = new Set<TraceSource>(['synthetic', 'owner', 'learner'])
const TRACK_KINDS: ReadonlySet<string> = new Set<TraceTrackKind>(['cpu-thread', 'cuda-api', 'gpu-stream', 'marker'])
const FLOW_KINDS: ReadonlySet<string> = new Set<TraceFlowKind>(['launch', 'sync', 'copy'])
const SHA256 = /^[0-9a-f]{64}$/
const INT32_MAX = 0x7fffffff
/** A high surrogate with no low surrogate after it, or a low surrogate with no high surrogate before it: no UTF-8 form, so no canonical text (core/json). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

/** How many problems `validateTrace` lists before it stops. */
const PROBLEM_LIMIT = 20

// ---------------------------------------------------------------------------------------------------------------------------
// Structure

const safe = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && !Object.is(x, -0)

/**
 * What is wrong with the shape of a trace, as sentences; empty when it is well formed. Shape is everything a reader needs to
 * trust the columns: the schema, `meta` (a synthetic trace is marked synthetic and no other is), a string table of strings,
 * tracks with distinct ids and known kinds, six span columns of one length and the right types holding integers, indices
 * inside the string table and the track list, flows between spans that exist, and marks at integer times. It does not look at
 * what the numbers mean: negative durations and overlapping kernels are for `traceChecks`.
 */
export function validateTrace(t: EsTrace): string[] {
  const problems: string[] = []
  const bad = (message: string): void => {
    if (problems.length < PROBLEM_LIMIT) problems.push(message)
  }

  if (t.schema !== TRACE_SCHEMA) bad(`schema is ${JSON.stringify(t.schema)}, not "${TRACE_SCHEMA}"`)

  const meta: Partial<TraceMeta> | null = typeof t.meta === 'object' ? t.meta : null
  if (meta === null) bad('meta is not an object')
  else {
    if (typeof meta.source !== 'string' || !SOURCES.has(meta.source)) bad(`meta.source is ${JSON.stringify(meta.source)}, not synthetic, owner or learner`)
    if (typeof meta.synthetic !== 'boolean') bad('meta.synthetic is not a boolean')
    else if (meta.synthetic !== (meta.source === 'synthetic')) bad('meta.synthetic must be true exactly when meta.source is "synthetic"')
    for (const key of ['engine', 'version', 'gpu', 'capturedAt'] as const) {
      const value: unknown = meta[key]
      if (value !== undefined && typeof value !== 'string') bad(`meta.${key} is not a string`)
      else if (typeof value === 'string' && LONE_SURROGATE.test(value)) bad(`meta.${key} has a lone surrogate, which has no UTF-8 form`)
    }
    if (meta.sha256 !== undefined && !(typeof meta.sha256 === 'string' && SHA256.test(meta.sha256))) bad('meta.sha256 is not 64 lower-case hex digits')
  }

  const strings: unknown = t.strings
  const stringCount = Array.isArray(strings) ? strings.length : 0
  if (!Array.isArray(strings)) bad('strings is not an array')
  else {
    strings.forEach((s: unknown, i) => {
      if (typeof s !== 'string') bad(`strings[${i}] is not a string`)
      else if (LONE_SURROGATE.test(s)) bad(`strings[${i}] has a lone surrogate, which has no UTF-8 form`)
    })
  }

  const inTable = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < stringCount

  const ids = new Set<number>()
  if (!Array.isArray(t.tracks)) bad('tracks is not an array')
  else {
    t.tracks.forEach((track, i) => {
      if (!(Number.isInteger(track.id) && track.id >= 0 && track.id <= INT32_MAX)) bad(`tracks[${i}].id is not an integer from 0 to 2^31 - 1`)
      else if (ids.has(track.id)) bad(`tracks[${i}].id ${track.id} is used twice`)
      else ids.add(track.id)
      if (typeof track.kind !== 'string' || !TRACK_KINDS.has(track.kind)) bad(`tracks[${i}].kind is ${JSON.stringify(track.kind)}`)
      if (!inTable(track.name)) bad(`tracks[${i}].name is not an index into strings`)
    })
  }

  const columns = [
    ['track', Int32Array],
    ['startNs', Float64Array],
    ['durNs', Float64Array],
    ['name', Int32Array],
    ['cat', Int32Array],
    ['corr', Int32Array],
  ] as const
  const spans = t.spans as Partial<Record<(typeof columns)[number][0], unknown>> | null
  let count = -1
  let columnsOk = typeof spans === 'object' && spans !== null
  if (!columnsOk) bad('spans is not an object')
  else {
    for (const [key, type] of columns) {
      const column = spans?.[key]
      if (!(column instanceof type)) {
        bad(`spans.${key} is not a ${type.name}`)
        columnsOk = false
      } else if (count === -1) count = column.length
      else if (column.length !== count) {
        bad(`spans.${key} has ${column.length} rows, where spans.track has ${count}`)
        columnsOk = false
      }
    }
  }
  if (columnsOk && spans) {
    const { track, startNs, durNs, name, cat, corr } = t.spans
    for (let i = 0; i < count; i++) {
      if (!ids.has(track[i])) bad(`span ${i}: track ${track[i]} is not a track of the trace`)
      if (!inTable(name[i])) bad(`span ${i}: name ${name[i]} is not an index into strings`)
      if (!inTable(cat[i])) bad(`span ${i}: cat ${cat[i]} is not an index into strings`)
      if (corr[i] < -1) bad(`span ${i}: corr ${corr[i]} is below -1`)
      if (!safe(startNs[i])) bad(`span ${i}: startNs ${startNs[i]} is not an integer below 2^53`)
      else if (!safe(durNs[i])) bad(`span ${i}: durNs ${durNs[i]} is not an integer below 2^53`)
      else if (!Number.isSafeInteger(startNs[i] + durNs[i])) bad(`span ${i}: the span ends beyond 2^53`)
      if (problems.length >= PROBLEM_LIMIT) break
    }
  }

  if (!Array.isArray(t.flows)) bad('flows is not an array')
  else {
    t.flows.forEach((flow, i) => {
      for (const end of ['from', 'to'] as const) {
        if (!(Number.isInteger(flow[end]) && flow[end] >= 0 && flow[end] < Math.max(count, 0))) bad(`flows[${i}].${end} is not a span of the trace`)
      }
      if (typeof flow.kind !== 'string' || !FLOW_KINDS.has(flow.kind)) bad(`flows[${i}].kind is ${JSON.stringify(flow.kind)}`)
    })
  }

  if (!Array.isArray(t.marks)) bad('marks is not an array')
  else {
    t.marks.forEach((mark, i) => {
      if (!safe(mark.tNs)) bad(`marks[${i}].tNs is not an integer below 2^53`)
      if (!inTable(mark.name)) bad(`marks[${i}].name is not an index into strings`)
    })
  }
  return problems
}

// ---------------------------------------------------------------------------------------------------------------------------
// Writing

/** The JSON form of a trace: its columns as plain arrays. */
export function traceToJson(t: EsTrace): TraceJson {
  const { track, startNs, durNs, name, cat, corr } = t.spans
  return {
    schema: t.schema,
    meta: { ...t.meta },
    strings: [...t.strings],
    tracks: t.tracks.map((x) => ({ id: x.id, kind: x.kind, name: x.name })),
    spans: {
      track: Array.from(track),
      startNs: Array.from(startNs),
      durNs: Array.from(durNs),
      name: Array.from(name),
      cat: Array.from(cat),
      corr: Array.from(corr),
    },
    flows: t.flows.map((x) => ({ from: x.from, to: x.to, kind: x.kind })),
    marks: t.marks.map((x) => ({ tNs: x.tNs, name: x.name })),
  }
}

/**
 * The canonical text of a trace: the one string whose SHA-256 is the trace's hash. It throws, naming the problem, for a trace whose
 * shape `validateTrace` rejects, so no malformed trace is ever written out.
 */
export function encodeTrace(t: EsTrace): string {
  const problems = validateTrace(t)
  if (problems.length > 0) throw new RangeError(`trace@1: cannot encode: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`)
  return canonicalJson(traceToJson(t))
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading

function plain(value: unknown, path: string): Record<string, unknown> {
  const proto: unknown = typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.getPrototypeOf(value) : undefined
  if (proto !== Object.prototype && proto !== null) throw new RangeError(`trace@1: ${path}: expected an object`)
  return value as Record<string, unknown>
}

function fields(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const record = plain(value, path)
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) throw new RangeError(`trace@1: ${path}: unknown field "${key}"`)
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) throw new RangeError(`trace@1: ${path}: missing field "${key}"`)
  }
  return record
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new RangeError(`trace@1: ${path}: expected an array`)
  return value as readonly unknown[]
}

function integer(value: unknown, path: string, lo: number, hi: number): number {
  if (!safe(value) || value < lo || value > hi) throw new RangeError(`trace@1: ${path}: expected an integer from ${lo} to ${hi}`)
  return value
}

/** A column of integers: every entry is checked, so a typed array never silently coerces a string or truncates a float. */
function column(value: unknown, path: string, lo: number, hi: number): number[] {
  const items = list(value, path)
  const out = new Array<number>(items.length)
  for (let i = 0; i < items.length; i++) out[i] = integer(items[i], `${path}[${i}]`, lo, hi)
  return out
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new RangeError(`trace@1: ${path}: expected a string`)
  return value
}

/** Reads the JSON form of a trace (`JSON.parse`'s output, or `traceToJson`'s). Strict: see the head of this file. */
export function traceFromJson(x: unknown): EsTrace {
  const root = fields(x, '$', ['schema', 'meta', 'strings', 'tracks', 'spans', 'flows', 'marks'])
  if (root.schema !== TRACE_SCHEMA) throw new RangeError(`trace@1: $.schema: expected "${TRACE_SCHEMA}", got ${JSON.stringify(root.schema)}`)

  const m = fields(root.meta, '$.meta', ['source', 'synthetic'], ['engine', 'version', 'gpu', 'capturedAt', 'sha256'])
  const meta: { -readonly [K in keyof TraceMeta]: TraceMeta[K] } = {
    source: text(m.source, '$.meta.source') as TraceSource,
    synthetic: m.synthetic as boolean,
  }
  for (const key of ['engine', 'version', 'gpu', 'capturedAt', 'sha256'] as const) {
    if (Object.hasOwn(m, key)) meta[key] = text(m[key], `$.meta.${key}`)
  }

  const strings = list(root.strings, '$.strings').map((s, i) => text(s, `$.strings[${i}]`))
  const stringMax = Math.max(strings.length - 1, 0)

  const tracks: TraceTrack[] = list(root.tracks, '$.tracks').map((value, i) => {
    const track = fields(value, `$.tracks[${i}]`, ['id', 'kind', 'name'])
    return {
      id: integer(track.id, `$.tracks[${i}].id`, 0, INT32_MAX),
      kind: text(track.kind, `$.tracks[${i}].kind`) as TraceTrackKind,
      name: integer(track.name, `$.tracks[${i}].name`, 0, stringMax),
    }
  })

  const s = fields(root.spans, '$.spans', ['track', 'startNs', 'durNs', 'name', 'cat', 'corr'])
  const columns = {
    track: column(s.track, '$.spans.track', 0, INT32_MAX),
    startNs: column(s.startNs, '$.spans.startNs', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    durNs: column(s.durNs, '$.spans.durNs', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    name: column(s.name, '$.spans.name', 0, stringMax),
    cat: column(s.cat, '$.spans.cat', 0, stringMax),
    corr: column(s.corr, '$.spans.corr', -1, INT32_MAX),
  }
  for (const key of ['startNs', 'durNs', 'name', 'cat', 'corr'] as const) {
    if (columns[key].length !== columns.track.length) throw new RangeError(`trace@1: $.spans.${key}: ${columns[key].length} rows, where $.spans.track has ${columns.track.length}`)
  }

  const flows: TraceFlow[] = list(root.flows, '$.flows').map((value, i) => {
    const flow = fields(value, `$.flows[${i}]`, ['from', 'to', 'kind'])
    return {
      from: integer(flow.from, `$.flows[${i}].from`, 0, INT32_MAX),
      to: integer(flow.to, `$.flows[${i}].to`, 0, INT32_MAX),
      kind: text(flow.kind, `$.flows[${i}].kind`) as TraceFlowKind,
    }
  })
  const marks: TraceMark[] = list(root.marks, '$.marks').map((value, i) => {
    const mark = fields(value, `$.marks[${i}]`, ['tNs', 'name'])
    return { tNs: integer(mark.tNs, `$.marks[${i}].tNs`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), name: integer(mark.name, `$.marks[${i}].name`, 0, stringMax) }
  })

  const trace: EsTrace = {
    schema: TRACE_SCHEMA,
    meta,
    strings,
    tracks,
    spans: {
      track: Int32Array.from(columns.track),
      startNs: Float64Array.from(columns.startNs),
      durNs: Float64Array.from(columns.durNs),
      name: Int32Array.from(columns.name),
      cat: Int32Array.from(columns.cat),
      corr: Int32Array.from(columns.corr),
    },
    flows,
    marks,
  }
  const problems = validateTrace(trace)
  if (problems.length > 0) throw new RangeError(`trace@1: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`)
  return trace
}

/** Reads the text `encodeTrace` writes, or any JSON text of a trace. */
export function decodeTrace(source: string): EsTrace {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new RangeError(`trace@1: not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return traceFromJson(parsed)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading a trace's rows

export function spanCount(t: EsTrace): number {
  return t.spans.track.length
}

/** Span `i` with its track's kind and its strings looked up. */
export function spanView(t: EsTrace, i: number): TraceSpanView {
  if (!Number.isInteger(i) || i < 0 || i >= spanCount(t)) throw new RangeError(`there is no span ${i} in a trace of ${spanCount(t)}`)
  const track = t.spans.track[i]
  const owner = t.tracks.find((x) => x.id === track)
  if (owner === undefined) throw new RangeError(`span ${i} is on track ${track}, which the trace does not have`)
  return {
    index: i,
    track,
    kind: owner.kind,
    startNs: t.spans.startNs[i],
    endNs: t.spans.startNs[i] + t.spans.durNs[i],
    durNs: t.spans.durNs[i],
    name: t.strings[t.spans.name[i]],
    cat: t.strings[t.spans.cat[i]],
    corr: t.spans.corr[i],
  }
}

/** A deep copy: the typed arrays are copied too, so a test can break the copy and leave the trace as it was. */
export function cloneTrace(t: EsTrace): EsTrace {
  return {
    schema: t.schema,
    meta: { ...t.meta },
    strings: [...t.strings],
    tracks: t.tracks.map((x) => ({ ...x })),
    spans: {
      track: t.spans.track.slice(),
      startNs: t.spans.startNs.slice(),
      durNs: t.spans.durNs.slice(),
      name: t.spans.name.slice(),
      cat: t.spans.cat.slice(),
      corr: t.spans.corr.slice(),
    },
    flows: t.flows.map((x) => ({ ...x })),
    marks: t.marks.map((x) => ({ ...x })),
  }
}
