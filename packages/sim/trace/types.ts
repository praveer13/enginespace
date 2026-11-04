// The trace model's vocabulary (ARCHITECTURE §5.7; WORLD §3, §5): `trace@1`, the step windows a trace is cut into, what attribution
// says about a window, what the structural checks report, and the knobs of the synthetic generator.
//
// A trace is stored in columns, not rows: one typed array per field of a span, so a trace of 100,000 spans is six arrays and not
// 100,000 objects. Times are integer nanoseconds from one origin (§5.1: every value stays below 2^53), held in Float64Array
// columns, which are exact for them. Nothing here runs.
//
// What an exporter must write for the rest of this package to read a trace as it is meant (W2-T19's exporter for the pinned and the
// learner's traces; the synthetic generator already does):
//   - a mark named `STEP_MARK` at each step boundary, so that n marks give the n − 1 step windows that `attribute` partitions;
//   - GPU work as spans of category `CAT_KERNEL` or `CAT_COPY` on `gpu-stream` tracks, and anything else on them as another category;
//   - the engine's main thread as `cpu-thread` tracks, and the CUDA calls it makes as `cuda-api` tracks, since a span on either makes
//     the main thread busy; threads that are not the engine's main thread are left out;
//   - a correlation id on each CUDA launch or copy call, repeated on the GPU work it started, and −1 where there is none;
//   - `meta.synthetic` true exactly when `meta.source` is `'synthetic'`, and a field of `meta` left out when it is not known.
// `encodeTrace` writes the canonical text of a trace, and a Python exporter has to write the same bytes (A§9.8) for the browser to
// get the hash the grader got.

/** The `schema` of every trace this package reads and writes. */
export const TRACE_SCHEMA = 'enginespace/trace@1'

/** The id of this model's notional-machine card, `content/cards/trace-room-trace.md` (§5.9: each model exports its card id). */
export const TRACE_CARD_ID = 'trace-room-trace'

/**
 * The name a mark has when it bounds a step: the marks with this name, in time order, cut the trace into step windows, each from
 * one mark to the next (§5.7). Marks with other names, such as NVTX ranges, bound nothing.
 */
export const STEP_MARK = 'step'

/** The categories (a span's `cat`, through the string table) that this package reads. Any other category is carried and ignored. */
export const CAT_KERNEL = 'kernel'
export const CAT_COPY = 'copy'
export const CAT_LAUNCH = 'launch'
export const CAT_SYNC = 'sync'

// ---------------------------------------------------------------------------------------------------------------------------
// trace@1

/** Who made the trace. A learner's trace is never marked synthetic (ASSESSMENT T1), and a synthetic one always is. */
export type TraceSource = 'synthetic' | 'owner' | 'learner'

export interface TraceMeta {
  readonly source: TraceSource
  readonly engine?: string
  readonly version?: string
  readonly gpu?: string
  /** When it was captured, as a UTC date-time. */
  readonly capturedAt?: string
  /** The SHA-256 (lower-case hex) of the raw capture this trace was normalised from. The hash of the trace itself is of `encodeTrace`'s text. */
  readonly sha256?: string
  /** True exactly when `source` is `'synthetic'`: a screen labels such a trace "synthetic" and never presents it as a measurement (PRODUCT.md). */
  readonly synthetic: boolean
}

/**
 * What a track holds, and so what its spans mean to attribution (§5.7):
 *   - `cpu-thread`: a thread's frames. With `cuda-api`, they are the engine's main thread, and the main thread is busy when a span covers it.
 *   - `cuda-api`: the CUDA calls that thread makes: launches (`launch`), copies (`copy`) and blocking calls (`sync`).
 *   - `gpu-stream`: a stream's work. A span of category `kernel` or `copy` is the GPU busy; any other category is an annotation.
 *   - `marker`: ranges that are drawn and bound nothing.
 */
export type TraceTrackKind = 'cpu-thread' | 'cuda-api' | 'gpu-stream' | 'marker'

export interface TraceTrack {
  readonly id: number
  readonly kind: TraceTrackKind
  /** An index into `strings`. */
  readonly name: number
}

/** The columns of a trace's spans. Row i of every column is span i, and spans are listed in start order by the generators here. */
export interface TraceSpans {
  /** A track's `id`. */
  readonly track: Int32Array
  /** Nanoseconds from the trace's origin. */
  readonly startNs: Float64Array
  readonly durNs: Float64Array
  /** Indices into `strings`. */
  readonly name: Int32Array
  readonly cat: Int32Array
  /** The correlation id that ties a launch to the GPU work it started, or −1 when there is none. */
  readonly corr: Int32Array
}

export type TraceFlowKind = 'launch' | 'sync' | 'copy'

/** An arrow from span `from` to span `to`: a launch to its kernel, a copy call to its copy, or the GPU work a blocking call waited for to that call. */
export interface TraceFlow {
  readonly from: number
  readonly to: number
  readonly kind: TraceFlowKind
}

/** An instant: a step boundary when `strings[name]` is `STEP_MARK`. */
export interface TraceMark {
  readonly tNs: number
  /** An index into `strings`. */
  readonly name: number
}

export interface EsTrace {
  readonly schema: typeof TRACE_SCHEMA
  readonly meta: TraceMeta
  /** The name and category table: every `name` and `cat` in the trace is an index into it. */
  readonly strings: readonly string[]
  readonly tracks: readonly TraceTrack[]
  readonly spans: TraceSpans
  readonly flows: readonly TraceFlow[]
  readonly marks: readonly TraceMark[]
}

/** The JSON form of a trace: the same fields, with each typed array written as a plain array. `encodeTrace` writes its canonical text. */
export interface TraceJson {
  readonly schema: typeof TRACE_SCHEMA
  readonly meta: TraceMeta
  readonly strings: readonly string[]
  readonly tracks: readonly TraceTrack[]
  readonly spans: {
    readonly track: readonly number[]
    readonly startNs: readonly number[]
    readonly durNs: readonly number[]
    readonly name: readonly number[]
    readonly cat: readonly number[]
    readonly corr: readonly number[]
  }
  readonly flows: readonly TraceFlow[]
  readonly marks: readonly TraceMark[]
}

/** One span with its names looked up: for tests, tooltips and the viewer's DOM mirror. */
export interface TraceSpanView {
  readonly index: number
  readonly track: number
  readonly kind: TraceTrackKind
  readonly startNs: number
  readonly endNs: number
  readonly durNs: number
  readonly name: string
  readonly cat: string
  readonly corr: number
}

// ---------------------------------------------------------------------------------------------------------------------------
// Attribution

/** A step window: from one step mark to the next, in ns. The window is the step's TPOT (§5.7). */
export interface StepWindow {
  readonly fromNs: number
  readonly toNs: number
}

/**
 * What every ns of a window is, in Gap Hunt's four words (GAMES.md §6):
 *   - `kernel`: the GPU is busy and at least one kernel runs;
 *   - `copy`: the GPU is busy with copies and no kernel runs (GPU-busy, copy-only);
 *   - `cpu-gap`: the GPU is idle while the engine's main thread is busy, which is the GPU waiting on the CPU;
 *   - `both-idle`: the GPU and the main thread are both idle.
 */
export type AttributionCategory = 'kernel' | 'copy' | 'cpu-gap' | 'both-idle'

/** A maximal run of one category. The segments of an attribution follow each other from the window's start to its end, with no gap and no overlap. */
export interface AttributionSegment {
  readonly fromNs: number
  readonly toNs: number
  readonly category: AttributionCategory
}

/** A maximal run of GPU-idle time inside a window: its `cpu-gap` and `both-idle` ns, which add up to its length. */
export interface AttributionGap {
  readonly fromNs: number
  readonly toNs: number
  readonly cpuGapNs: number
  readonly bothIdleNs: number
}

/**
 * The partition of a step window (§5.7, GAMES.md §6, ASSESSMENT T7), in integer ns:
 *
 *   windowNs = gpuBusyNs + cpuGapNs + bothIdleNs,   gpuBusyNs = kernelNs + copyOnlyNs
 *
 * exactly. `overlapNs`, the main thread's busy time inside GPU-busy (hidden CPU work), is reported beside the partition and is in
 * none of its parts.
 */
export interface Attribution {
  readonly fromNs: number
  readonly toNs: number
  /** `toNs - fromNs`: the step's TPOT. */
  readonly windowNs: number
  readonly gpuBusyNs: number
  /** GPU time with a kernel running on any stream. */
  readonly kernelNs: number
  /** GPU time with a copy running and no kernel. */
  readonly copyOnlyNs: number
  readonly cpuGapNs: number
  readonly bothIdleNs: number
  readonly overlapNs: number
  readonly segments: readonly AttributionSegment[]
  readonly gaps: readonly AttributionGap[]
}

// ---------------------------------------------------------------------------------------------------------------------------
// Checks

/** The physics floors `traceChecks` holds a trace to (ASSESSMENT T9, §6.4). The caller computes them from the hardware atlas, so this package reads no claims. */
export interface TraceFloors {
  /**
   * The least GPU-busy time of a step, in ns (P1: weight bytes plus the KV bytes the step reads, over the datasheet bandwidth). One
   * number holds for every step window. A list holds one floor per window in time order, with null for a step that has none, such as a prefill.
   */
  readonly stepBusyNs?: number | readonly (number | null)[]
  /** The least duration of every span with this name (P4: an attention call takes at least the bytes it reads and writes over the bandwidth). */
  readonly spans?: readonly { readonly name: string; readonly minNs: number }[]
}

/** One check's verdict. A failing check names its first offender and prints the bound it broke (statespace's rule, A§8.5 rule 9). */
export interface TraceCheckResult {
  /** `structure` (the columns are consistent) or ASSESSMENT §6.1's id: `T2`, `T3`, `T4`, `T5`, `T9`. */
  readonly id: string
  readonly title: string
  readonly pass: boolean
  readonly detail: string
  /** How many things the check looked at. */
  readonly checked: number
  readonly failed: number
  /** Up to 8 offending spans, as indices into the trace's columns, for a viewer to highlight. */
  readonly spans: readonly number[]
}

// ---------------------------------------------------------------------------------------------------------------------------
// The generator

/**
 * How `traceFromRun` roughens a run (WORLD §3.5). Every field is a judgment [estimated] and is printed on the card. The jitter
 * works inside the run's own spans and never moves where the GPU or the main thread starts or stops being busy, so a synthetic
 * trace's ground truth is exact: it is the run's own.
 */
export interface JitterSpec {
  /** Kernels in a forward, and so launch calls in an eagerly launched step, from 1 to 200. A real step has far more; the trace folds them. */
  readonly kernelsPerForward: number
  /** How far a kernel's duration, or a launch call's, may stray from its nominal share, in permille either way, from 0 to 900. */
  readonly spreadPermille: number
  /** Each of a forward's two copies (the inputs in, the sampled ids out) as a share of the forward, in permille, from 1 to 100. */
  readonly copyPermille: number
  /** The share of an eager launch frame that falls between its calls, in permille, from 0 to 900. */
  readonly launchGapPermille: number
  /** The most a boundary between two touching main-thread frames moves, and the most a blocking call sits in from either edge of its frame, in ns, from 0 to 250. */
  readonly cpuNoiseNs: number
}
