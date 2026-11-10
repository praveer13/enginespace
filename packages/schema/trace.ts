/**
 * `enginespace/trace@1` as JSON (ARCHITECTURE §5.7, §9.6): the columns a trace is stored in, as the grader's exporter writes them
 * (`enginespace trace export`, W2-T19) and as a bundle's trace artifact carries them.
 *
 * packages/sim/trace/codec.ts is the reader the site runs on a trace (`traceFromJson`), and this is the same shape for the schemas the
 * grader validates against (D-030). tests/schema/trace.test.ts runs the two over the same documents, good and bad, and fails where they
 * disagree, so a field changed in one and not the other cannot ship. Like the reader, this judges the shape of a trace and not its
 * physics: a span that starts before 0 reads fine here, and `traceChecks` (T2) is what fails it.
 *
 * JSON Schema cannot say what ties one column to another, so the export holds only the shape of each field, and the site checks the rest.
 * The grader's exporter has to write them too:
 *   - the six span columns have one length;
 *   - a span's `track` is the `id` of a track, and track ids differ;
 *   - every `name` and `cat` of a span, a track and a mark is an index into `strings`;
 *   - a flow's two ends are spans of the trace;
 *   - a span ends below 2^53 ns, and no time is -0;
 *   - `meta.synthetic` is true exactly when `meta.source` is "synthetic".
 */
import { z } from './zod'
import { hasLoneSurrogate, plainText, sha256Hex, utcInstant } from './common'

/** The `schema` of every trace. packages/sim/trace/types.ts has the same string, and a test holds the two together. */
export const TRACE_SCHEMA_TAG = 'enginespace/trace@1'

/** Who made the trace (A§5.7). */
export const TRACE_SOURCES = ['synthetic', 'owner', 'learner'] as const

/** What a track holds (A§5.7). */
export const TRACK_KINDS = ['cpu-thread', 'cuda-api', 'gpu-stream', 'marker'] as const

/** What a flow arrow joins (A§5.7). */
export const FLOW_KINDS = ['launch', 'sync', 'copy'] as const

/** The largest id or index of a column: an `int32` in the Chrome-trace-style exporters, and the bound of `Int32Array` in the site. */
const INT32_MAX = 0x7fffffff

const index = z.int().min(0).max(INT32_MAX)
const nanoseconds = z.int()

const metaSchema = z.strictObject({
  source: z.enum(TRACE_SOURCES),
  engine: plainText(128).optional(),
  version: plainText(64).optional(),
  gpu: plainText(128).optional(),
  /** When it was captured, as a UTC date-time. */
  capturedAt: utcInstant.optional(),
  /** The SHA-256 of the raw capture this trace was normalised from. The trace's own hash is of its canonical text. */
  sha256: sha256Hex.optional(),
  /** True exactly when `source` is "synthetic": a screen labels such a trace "synthetic" and never presents it as a measurement. */
  synthetic: z.boolean(),
})

const trackSchema = z.strictObject({
  id: index,
  kind: z.enum(TRACK_KINDS),
  /** An index into `strings`. */
  name: index,
})

/** The columns of the spans. Row i of every column is span i. */
const spansSchema = z.strictObject({
  /** A track's `id`. */
  track: z.array(index),
  /** Nanoseconds from the trace's origin. */
  startNs: z.array(nanoseconds),
  durNs: z.array(nanoseconds),
  /** Indices into `strings`. */
  name: z.array(index),
  cat: z.array(index),
  /** The correlation id that ties a launch to the GPU work it started, or -1 when there is none. */
  corr: z.array(z.int().min(-1).max(INT32_MAX)),
})

const flowSchema = z.strictObject({ from: index, to: index, kind: z.enum(FLOW_KINDS) })

const markSchema = z.strictObject({ tNs: nanoseconds, name: index })

/** How many problems the cross-checks of a trace list before they stop [estimated]: packages/sim/trace/codec.ts stops at the same count. */
const PROBLEM_LIMIT = 20

/** Whether a number is -0, which JSON writes as 0 and a hash must not: `Object.is` tells it from 0. */
const negativeZero = (value: number): boolean => Object.is(value, -0)

export const traceSchema = z
  .strictObject({
    schema: z.literal(TRACE_SCHEMA_TAG),
    meta: metaSchema,
    /** The name and category table: every `name` and `cat` in the trace is an index into it. */
    strings: z.array(z.string().refine((text) => !hasLoneSurrogate(text), 'must not hold a lone surrogate')),
    tracks: z.array(trackSchema),
    spans: spansSchema,
    flows: z.array(flowSchema),
    marks: z.array(markSchema),
  })
  .superRefine((trace, ctx) => {
    // A hostile trace could earn an issue for each of millions of rows, so the walk stops after PROBLEM_LIMIT of them, as the reader does.
    let reported = 0
    const add = (message: string, path: (string | number)[]): void => {
      reported += 1
      if (reported <= PROBLEM_LIMIT) ctx.addIssue({ code: 'custom', message, path })
    }
    const stringCount = trace.strings.length

    if (trace.meta.synthetic !== (trace.meta.source === 'synthetic')) {
      add('must be true exactly when meta.source is "synthetic"', ['meta', 'synthetic'])
    }

    const ids = new Set<number>()
    trace.tracks.forEach((track, i) => {
      if (ids.has(track.id)) add(`track id ${track.id} is used twice`, ['tracks', i, 'id'])
      ids.add(track.id)
      if (track.name >= stringCount) add('is not an index into strings', ['tracks', i, 'name'])
    })

    const { track, startNs, durNs, name, cat, corr } = trace.spans
    const count = track.length
    for (const [key, column] of [['startNs', startNs], ['durNs', durNs], ['name', name], ['cat', cat], ['corr', corr]] as const) {
      if (column.length !== count) add(`has ${column.length} rows, where spans.track has ${count}`, ['spans', key])
    }
    const rows = Math.min(count, startNs.length, durNs.length, name.length, cat.length, corr.length)
    for (let i = 0; i < rows; i += 1) {
      if (!ids.has(track[i])) add(`track ${track[i]} is not a track of the trace`, ['spans', 'track', i])
      if (name[i] >= stringCount) add('is not an index into strings', ['spans', 'name', i])
      if (cat[i] >= stringCount) add('is not an index into strings', ['spans', 'cat', i])
      if (negativeZero(startNs[i])) add('is -0', ['spans', 'startNs', i])
      else if (negativeZero(durNs[i])) add('is -0', ['spans', 'durNs', i])
      else if (!Number.isSafeInteger(startNs[i] + durNs[i])) add('the span ends beyond 2^53 ns', ['spans', 'durNs', i])
      if (reported >= PROBLEM_LIMIT) return
    }

    trace.flows.forEach((flow, i) => {
      if (flow.from >= count) add('is not a span of the trace', ['flows', i, 'from'])
      if (flow.to >= count) add('is not a span of the trace', ['flows', i, 'to'])
    })
    trace.marks.forEach((mark, i) => {
      if (negativeZero(mark.tNs)) add('is -0', ['marks', i, 'tNs'])
      if (mark.name >= stringCount) add('is not an index into strings', ['marks', i, 'name'])
    })
  })
  .meta({
    title: TRACE_SCHEMA_TAG,
    description:
      'A trace in columns (ARCHITECTURE §5.7). Checked by the site and not expressible in JSON Schema: the six span columns have one length; a span\'s track is the id of a track and track ids differ; every name and cat is an index into strings; a flow joins two spans; a span ends below 2^53 ns and no time is -0; meta.synthetic is true exactly when meta.source is "synthetic".',
  })

export type TraceDocument = z.infer<typeof traceSchema>
