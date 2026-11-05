/*
 * The trace viewer's index of a trace (ARCHITECTURE §5.7, GAMES.md §2.6 "The Tape"): what the viewer needs to ask of 100,000 spans
 * many times a second, built once from the columns of a `trace@1`.
 *
 * A trace stores its spans in columns, in the order the exporter wrote them. The viewer draws them in lanes, one lane to a track, so
 * the index keeps for each lane the spans in start order, the row each span sits on when frames nest (a frame inside a frame is the
 * row under it), and the running maximum of the ends, which turns "which spans touch this window" into two binary searches. A
 * span's style (frame, launch, kernel, copy, sync or note) is decided once, from its track's kind and its category.
 *
 * Nothing here draws or touches the DOM. The viewer's pure parts (this file, viewport, plan, marks and state) run under Bun, so the
 * tests hold them to the columns they were built from.
 */
import { CAT_COPY, CAT_KERNEL, CAT_SYNC, spanCount, stepWindows } from '@es/sim/trace'
import type { EsTrace, StepWindow, TraceTrackKind } from '@es/sim/trace'

/** The most rows a lane stacks. A frame nested deeper than this is drawn on the last row. */
export const MAX_ROWS = 8

/** A half-open window of the trace's clock, in integer ns: from, up to and not including to. */
export interface Win {
  readonly fromNs: number
  readonly toNs: number
}

// ---------------------------------------------------------------------------------------------------------------------------
// Styles

/**
 * What a span looks like, decided by where it is and what it is called. The set is small on purpose: the categorical code is the
 * only colour code (DESIGN.md, "The Only Code Rule"), and a lane tells the rest.
 *   - `frame`: the engine's main thread at work (the expo writing);
 *   - `launch`: a CUDA call that starts GPU work, or any call that is not a copy or a sync (the expo calling a dish);
 *   - `kernel`: a kernel on a GPU stream (cooking);
 *   - `copy`: a copy, on a stream or as a call (the dumbwaiter);
 *   - `sync`: a blocking call, "Heard!";
 *   - `note`: anything else, drawn as an outline: a range on a marker track, a stream annotation.
 */
export const SPAN_STYLES = ['frame', 'launch', 'kernel', 'copy', 'sync', 'note'] as const
export type SpanStyle = (typeof SPAN_STYLES)[number]

export function styleOf(kind: TraceTrackKind, cat: string): SpanStyle {
  if (cat === CAT_COPY) return 'copy'
  if (cat === CAT_SYNC) return 'sync'
  if (kind === 'gpu-stream') return cat === CAT_KERNEL ? 'kernel' : 'note'
  if (kind === 'cuda-api') return 'launch'
  if (kind === 'cpu-thread') return 'frame'
  return 'note'
}

/** A style's number, the index into `SPAN_STYLES` that `TraceIndex.style` holds. */
export const styleNumber = (style: SpanStyle): number => SPAN_STYLES.indexOf(style)

// ---------------------------------------------------------------------------------------------------------------------------
// The index

export interface Lane {
  /** Where the lane sits, top to bottom. */
  readonly index: number
  /** The track's id in the trace. */
  readonly track: number
  readonly kind: TraceTrackKind
  /** The track's own name: the engine's term (GAMES.md §2.6, rule 2). */
  readonly name: string
  /** How many rows the lane stacks, from 1. */
  readonly rows: number
  /** The lane's spans, as indices into the trace's columns, in start order (longer first when they start together). */
  readonly order: Int32Array
  /** The row of `order[k]`. */
  readonly row: Uint8Array
  /** The largest end among `order[0..k]`. */
  readonly maxEnd: Float64Array
}

export interface TraceIndex {
  readonly trace: EsTrace
  readonly lanes: readonly Lane[]
  /** The lane of each span, or −1 when the span's track is not in the trace (a trace that failed `validateTrace`). */
  readonly spanLane: Int16Array
  /** Where each span sits in its lane's `order`. */
  readonly spanPos: Int32Array
  /** Each span's style, as an index into `SPAN_STYLES`. */
  readonly style: Uint8Array
  /** From the earliest start to the latest end of any span or mark; a trace with nothing in it is 0 to 1 µs. */
  readonly extent: Win
  /** The step windows, bell to bell (`stepWindows`). */
  readonly steps: readonly StepWindow[]
}

/** Lanes are laid out in the order the work flows: notes, then the expo's thread, then its calls, then the line. */
const LANE_RANK: Readonly<Record<TraceTrackKind, number>> = { marker: 0, 'cpu-thread': 1, 'cuda-api': 2, 'gpu-stream': 3 }

export function buildIndex(trace: EsTrace): TraceIndex {
  const count = spanCount(trace)
  const { track, startNs, durNs, cat } = trace.spans
  const tracks = [...trace.tracks].sort((a, b) => LANE_RANK[a.kind] - LANE_RANK[b.kind] || a.id - b.id)
  const laneOfTrack = new Map<number, number>()
  tracks.forEach((t, i) => laneOfTrack.set(t.id, i))

  const spanLane = new Int16Array(count)
  const counts = new Int32Array(tracks.length)
  for (let i = 0; i < count; i++) {
    const lane = laneOfTrack.get(track[i]) ?? -1
    spanLane[i] = lane
    if (lane >= 0) counts[lane]++
  }
  const members = tracks.map((_, lane) => new Int32Array(counts[lane]))
  const filled = new Int32Array(tracks.length)
  for (let i = 0; i < count; i++) {
    const lane = spanLane[i]
    if (lane >= 0) members[lane][filled[lane]++] = i
  }

  const spanPos = new Int32Array(count).fill(-1)
  const style = new Uint8Array(count)
  const lanes: Lane[] = tracks.map((t, laneIndex) => {
    // A category's style, worked out once per lane and not once per span.
    const styleOfCat = new Int8Array(trace.strings.length).fill(-1)
    const order = members[laneIndex]
    const before = (a: number, b: number) => startNs[a] - startNs[b] || durNs[b] - durNs[a] || a - b
    let sorted = true
    for (let k = 1; k < order.length && sorted; k++) if (before(order[k - 1], order[k]) > 0) sorted = false
    if (!sorted) order.sort(before)

    const row = new Uint8Array(order.length)
    const maxEnd = new Float64Array(order.length)
    const open: number[] = []
    let rows = 1
    let furthest = Number.NEGATIVE_INFINITY
    for (let k = 0; k < order.length; k++) {
      const i = order[k]
      const start = startNs[i]
      const end = start + durNs[i]
      while (open.length > 0 && open[open.length - 1] <= start) open.pop()
      const depth = Math.min(open.length, MAX_ROWS - 1)
      row[k] = depth
      if (depth + 1 > rows) rows = depth + 1
      open.push(end)
      if (end > furthest) furthest = end
      maxEnd[k] = furthest
      spanPos[i] = k
      if (styleOfCat[cat[i]] < 0) styleOfCat[cat[i]] = styleNumber(styleOf(t.kind, trace.strings[cat[i]]))
      style[i] = styleOfCat[cat[i]]
    }
    return { index: laneIndex, track: t.id, kind: t.kind, name: trace.strings[t.name], rows, order, row, maxEnd }
  })

  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (let i = 0; i < count; i++) {
    if (spanLane[i] < 0) continue
    if (startNs[i] < lo) lo = startNs[i]
    if (startNs[i] + durNs[i] > hi) hi = startNs[i] + durNs[i]
  }
  for (const mark of trace.marks) {
    if (mark.tNs < lo) lo = mark.tNs
    if (mark.tNs > hi) hi = mark.tNs
  }
  const extent: Win = lo <= hi ? { fromNs: lo, toNs: hi > lo ? hi : lo + 1_000 } : { fromNs: 0, toNs: 1_000 }
  return { trace, lanes, spanLane, spanPos, style, extent, steps: stepWindows(trace) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Queries

/** The first position in a lane's order whose start is at or after `t`, or the lane's length. */
export function firstStartingAt(index: TraceIndex, lane: Lane, t: number): number {
  const { startNs } = index.trace.spans
  let lo = 0
  let hi = lane.order.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (startNs[lane.order[mid]] < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The first position whose running maximum end is past `t`: no span before it reaches `t`. */
export function firstReaching(lane: Lane, t: number): number {
  let lo = 0
  let hi = lane.maxEnd.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (lane.maxEnd[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The positions [lo, hi) of a lane that can touch the window: every span that starts before `toNs` and ends after `fromNs` is inside,
 * and a few that end before `fromNs` may be too (frames that ended while a longer one before them was still open), so a caller
 * checks the end.
 */
export function laneRange(index: TraceIndex, lane: Lane, win: Win): readonly [lo: number, hi: number] {
  // One before the window's start, so that an instant exactly on it (it ends where it starts) is inside the range.
  return [firstReaching(lane, win.fromNs - 1), firstStartingAt(index, lane, win.toNs)]
}

/** One span's start, end and style, without allocating. */
export const spanStart = (index: TraceIndex, i: number): number => index.trace.spans.startNs[i]
export const spanEnd = (index: TraceIndex, i: number): number => index.trace.spans.startNs[i] + index.trace.spans.durNs[i]
export const spanName = (index: TraceIndex, i: number): string => index.trace.strings[index.trace.spans.name[i]]
export const spanCat = (index: TraceIndex, i: number): string => index.trace.strings[index.trace.spans.cat[i]]
export const styleName = (index: TraceIndex, i: number): SpanStyle => SPAN_STYLES[index.style[i]]

/** Whether span `i` touches the window: it ends after the window starts and starts before it ends. An instant inside the window counts. */
export function touches(index: TraceIndex, i: number, win: Win): boolean {
  const start = spanStart(index, i)
  const end = spanEnd(index, i)
  return start < win.toNs && (end > win.fromNs || (end === start && start >= win.fromNs))
}

export interface WindowSpans {
  readonly lane: Lane
  /** The first `limit` spans of the lane that touch the window, in start order. */
  readonly spans: readonly number[]
  /** How many spans of the lane touch the window. */
  readonly total: number
}

/** The spans in a window, lane by lane, `limit` of each at most. This is what the DOM mirror lists. */
export function spansInWindow(index: TraceIndex, win: Win, limit: number): WindowSpans[] {
  return index.lanes.map((lane) => {
    const [lo, hi] = laneRange(index, lane, win)
    const spans: number[] = []
    let total = 0
    for (let k = lo; k < hi; k++) {
      const i = lane.order[k]
      if (!touches(index, i, win)) continue
      total++
      if (spans.length < limit) spans.push(i)
    }
    return { lane, spans, total }
  })
}

/**
 * The span under a point: in `lane`, on `row`, at time `t`, within `slackNs` either side (a span thinner than a pixel is still
 * pickable). The span that contains `t` wins, the narrowest first; failing that, the one whose edge is nearest.
 */
export function pickSpan(index: TraceIndex, lane: Lane, row: number, t: number, slackNs: number): number | null {
  const [lo, hi] = laneRange(index, lane, { fromNs: t - slackNs, toNs: t + slackNs + 1 })
  let best: number | null = null
  let bestKey = Number.POSITIVE_INFINITY
  for (let k = lo; k < hi; k++) {
    if (lane.row[k] !== row) continue
    const i = lane.order[k]
    const start = spanStart(index, i)
    const end = spanEnd(index, i)
    if (end < t - slackNs || start > t + slackNs) continue
    // Inside: the narrowest span wins. Outside, within the slack: the distance to its nearest edge, kept above every inside key.
    const key = start <= t && t <= end ? end - start : 1e18 + Math.min(Math.abs(t - start), Math.abs(t - end))
    if (key < bestKey) {
      bestKey = key
      best = i
    }
  }
  return best
}

/** The index of the step window that holds `t`: the nearest one when `t` is outside them all, and −1 when the trace has no windows. */
export function windowAt(index: TraceIndex, t: number): number {
  const { steps } = index
  if (steps.length === 0) return -1
  let lo = 0
  let hi = steps.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (steps[mid].toNs <= t) lo = mid + 1
    else hi = mid
  }
  return Math.min(lo, steps.length - 1)
}

/** The step the window is on, by its middle, or the whole tape when the trace has no step marks: what the unaccounted counter counts. */
export function stepOfWindow(index: TraceIndex, win: Win): Win {
  const at = windowAt(index, Math.round((win.fromNs + win.toNs) / 2))
  return at < 0 ? index.extent : index.steps[at]
}

// ---------------------------------------------------------------------------------------------------------------------------
// Edges: where the cursor can stand

/** The cursor stands on one edge of one span: its start or its end. Marks snap to these (GAMES.md §6: "from one event edge to another"). */
export type EdgeKind = 'start' | 'end'

export interface Cursor {
  readonly span: number
  readonly edge: EdgeKind
}

/** A lane's edges in time order: at one time, ends come before starts, so touching spans read end, start. */
interface Edges {
  readonly time: Float64Array
  /** The span of each edge. */
  readonly span: Int32Array
  /** 1 for an end, 0 for a start. */
  readonly isEnd: Uint8Array
  /** Where the start and the end of `order[k]` sit in the edge list. */
  readonly startAt: Int32Array
  readonly endAt: Int32Array
}

const edgeCache = new WeakMap<Lane, Edges>()

function edgesOf(index: TraceIndex, lane: Lane): Edges {
  const known = edgeCache.get(lane)
  if (known !== undefined) return known
  const n = lane.order.length
  const { startNs, durNs } = index.trace.spans
  const starts = new Float64Array(n)
  const ends = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    starts[k] = startNs[lane.order[k]]
    ends[k] = starts[k] + durNs[lane.order[k]]
  }
  // Ends in time order. Frames nest, so the inner one ends first: of two ends at one time, the later-starting (higher k) comes first.
  const byEnd = new Int32Array(n)
  for (let k = 0; k < n; k++) byEnd[k] = k
  let ordered = true
  for (let k = 1; k < n && ordered; k++) if (ends[k - 1] > ends[k]) ordered = false
  if (!ordered) byEnd.sort((a, b) => ends[a] - ends[b] || b - a)

  const time = new Float64Array(2 * n)
  const span = new Int32Array(2 * n)
  const isEnd = new Uint8Array(2 * n)
  const startAt = new Int32Array(n)
  const endAt = new Int32Array(n)
  let s = 0
  let e = 0
  for (let at = 0; at < 2 * n; at++) {
    // Take the end when it is due no later than the next start, and its own start has been taken (a span of no length starts, then ends).
    const takeEnd = s >= n || (e < n && byEnd[e] < s && ends[byEnd[e]] <= starts[s])
    if (takeEnd) {
      const k = byEnd[e++]
      time[at] = ends[k]
      span[at] = lane.order[k]
      isEnd[at] = 1
      endAt[k] = at
    } else {
      time[at] = starts[s]
      span[at] = lane.order[s]
      startAt[s] = at
      s++
    }
  }
  const edges: Edges = { time, span, isEnd, startAt, endAt }
  edgeCache.set(lane, edges)
  return edges
}

/** The time of the edge a cursor stands on. */
export const cursorNs = (index: TraceIndex, c: Cursor): number => (c.edge === 'start' ? spanStart(index, c.span) : spanEnd(index, c.span))

const laneOf = (index: TraceIndex, span: number): Lane => index.lanes[index.spanLane[span]]

/** The edge after (`dir` 1) or before (−1) the cursor on its own lane, or null at the end of the lane. */
export function stepEdge(index: TraceIndex, c: Cursor, dir: 1 | -1): Cursor | null {
  const lane = laneOf(index, c.span)
  const edges = edgesOf(index, lane)
  const k = index.spanPos[c.span]
  const at = (c.edge === 'start' ? edges.startAt : edges.endAt)[k] + dir
  if (at < 0 || at >= edges.time.length) return null
  return { span: edges.span[at], edge: edges.isEnd[at] === 1 ? 'end' : 'start' }
}

/** The first edge of a lane at or after time `t` (the last edge if all are before it), or null for a lane with no spans. */
export function edgeNear(index: TraceIndex, lane: Lane, t: number): Cursor | null {
  const edges = edgesOf(index, lane)
  const n = edges.time.length
  if (n === 0) return null
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (edges.time[mid] < t) lo = mid + 1
    else hi = mid
  }
  const at = Math.min(lo, n - 1)
  return { span: edges.span[at], edge: edges.isEnd[at] === 1 ? 'end' : 'start' }
}

/** The lane above (−1) or below (1) the cursor's, at the cursor's time, skipping lanes with no spans. */
export function stepLane(index: TraceIndex, c: Cursor, dir: 1 | -1): Cursor | null {
  const t = cursorNs(index, c)
  for (let i = laneOf(index, c.span).index + dir; i >= 0 && i < index.lanes.length; i += dir) {
    const found = edgeNear(index, index.lanes[i], t)
    if (found !== null) return found
  }
  return null
}

/** The first span of the trace in lane and start order, as a cursor on its start: where the keyboard begins. */
export function firstCursor(index: TraceIndex): Cursor | null {
  for (const lane of index.lanes) if (lane.order.length > 0) return { span: lane.order[0], edge: 'start' }
  return null
}

/** The spans that share a correlation id with `span`, other than itself: a launch and the kernels it started (GAMES.md §2.6). */
export function correlated(index: TraceIndex, span: number, limit = 8): number[] {
  const { corr } = index.trace.spans
  const id = corr[span]
  if (id < 0) return []
  let map = corrCache.get(index)
  if (map === undefined) {
    map = new Map<number, number[]>()
    for (let i = 0; i < corr.length; i++) {
      if (corr[i] < 0) continue
      const list = map.get(corr[i])
      if (list === undefined) map.set(corr[i], [i])
      else list.push(i)
    }
    corrCache.set(index, map)
  }
  return (map.get(id) ?? []).filter((i) => i !== span).slice(0, limit)
}

const corrCache = new WeakMap<TraceIndex, Map<number, number[]>>()
