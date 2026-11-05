/*
 * What one frame draws (GAMES.md §6 "Budget": Canvas2D with per-pixel bucketing, at most 5,000 rectangles a frame). Between the
 * index and the painter there is a plan: the rectangles of every span that touches the window, already merged so that a pixel is
 * never drawn twice.
 *
 * The merge is the whole trick, and it is for dust. Spans reach the plan in start order, one lane at a time. A span wide enough
 * to show (`WIDE_PX`) is a rectangle of its own, so two kernels that touch keep the edge between them, which is where a mark snaps.
 * A thinner span joins the open run of its row and style when it begins within a pixel of the run's end, and otherwise closes the
 * run and opens a new one. So a hundred thousand spans zoomed out to a window of a thousand pixels become, at worst, a few hundred
 * runs per row and style, and a window zoomed in on a few spans draws each as it is. A gap a pixel wide or more stays a gap.
 * Nothing here allocates once the plan exists: the arrays are reused from frame to frame.
 */
import { rowY } from './geometry'
import type { TapeGeometry } from './geometry'
import { laneRange, MAX_ROWS, SPAN_STYLES, spanEnd, spanStart, touches } from './model'
import type { TraceIndex, Win } from './model'

/** A span whose start is within this many px of the open run's end joins the run. Below a pixel a gap cannot be seen anyway. */
export const MERGE_GAP_PX = 0.75
/** A span at least this wide is drawn as it is, with its own edges, even when it touches the next; only thinner spans are merged. */
export const WIDE_PX = 3
/** Every rectangle is at least this wide, so a span thinner than a pixel still leaves a mark. */
export const MIN_RECT_PX = 1

const STYLE_COUNT = SPAN_STYLES.length

export interface DrawPlan {
  /** Per style, the rectangles' left edges, widths and tops, in CSS px. */
  readonly x: Float32Array[]
  readonly w: Float32Array[]
  readonly y: Float32Array[]
  /** How many rectangles each style has. */
  readonly count: Int32Array
  /** All of them. */
  total: number
  /** How many spans this frame looked at. */
  visited: number
  readonly capacity: number
}

/** A plan that holds `capacity` rectangles of each style. The limit is in the arrays, so a frame cannot grow without bound. */
export function createPlan(capacity = 4096): DrawPlan {
  return {
    x: SPAN_STYLES.map(() => new Float32Array(capacity)),
    w: SPAN_STYLES.map(() => new Float32Array(capacity)),
    y: SPAN_STYLES.map(() => new Float32Array(capacity)),
    count: new Int32Array(STYLE_COUNT),
    total: 0,
    visited: 0,
    capacity,
  }
}

const runOn = new Uint8Array(MAX_ROWS * STYLE_COUNT)
const runX0 = new Float64Array(MAX_ROWS * STYLE_COUNT)
const runX1 = new Float64Array(MAX_ROWS * STYLE_COUNT)

/** Fills `plan` with the rectangles of the window, drawn across the paper that `g` lays out. */
export function buildPlan(plan: DrawPlan, index: TraceIndex, win: Win, g: TapeGeometry): void {
  plan.count.fill(0)
  plan.total = 0
  plan.visited = 0
  const scale = g.plotW / (win.toNs - win.fromNs)
  const left = g.plotX
  const right = g.plotX + g.plotW
  const { startNs } = index.trace.spans

  for (const lane of index.lanes) {
    const box = g.lanes[lane.index]
    runOn.fill(0)
    const emit = (slot: number, row: number, style: number): void => {
      const n = plan.count[style]
      const width = Math.max(MIN_RECT_PX, runX1[slot] - runX0[slot])
      if (n >= plan.capacity) {
        // Out of room: stretch the last rectangle over this one, so the ink is still there.
        const last = n - 1
        const end = Math.max(plan.x[style][last] + plan.w[style][last], runX0[slot] + width)
        plan.w[style][last] = end - plan.x[style][last]
        return
      }
      plan.x[style][n] = runX0[slot]
      plan.w[style][n] = width
      plan.y[style][n] = rowY(box, row)
      plan.count[style] = n + 1
      plan.total++
    }

    const [lo, hi] = laneRange(index, lane, win)
    for (let k = lo; k < hi; k++) {
      const i = lane.order[k]
      if (!touches(index, i, win)) continue
      plan.visited++
      const row = lane.row[k]
      const style = index.style[i]
      const slot = row * STYLE_COUNT + style
      const x0 = Math.max(left, left + (startNs[i] - win.fromNs) * scale)
      const x1 = Math.min(right, left + (spanEnd(index, i) - win.fromNs) * scale)
      if (x1 - x0 >= WIDE_PX) {
        // A span you can see is drawn whole: close the run that was open, and give this one a rectangle of its own.
        if (runOn[slot] === 1) emit(slot, row, style)
        runOn[slot] = 0
        runX0[slot] = x0
        runX1[slot] = x1
        emit(slot, row, style)
        continue
      }
      if (runOn[slot] === 1 && x0 - runX1[slot] <= MERGE_GAP_PX) {
        if (x1 > runX1[slot]) runX1[slot] = x1
        continue
      }
      if (runOn[slot] === 1) emit(slot, row, style)
      runOn[slot] = 1
      runX0[slot] = x0
      runX1[slot] = x1
    }
    for (let row = 0; row < lane.rows; row++) {
      for (let style = 0; style < STYLE_COUNT; style++) {
        const slot = row * STYLE_COUNT + style
        if (runOn[slot] === 1) emit(slot, row, style)
      }
    }
  }
}

/** The pixel columns a window's spans cover, for a test: the union of the plan's rectangles in one row of one lane. */
export function inkOf(plan: DrawPlan, y: number): [number, number][] {
  const out: [number, number][] = []
  for (let style = 0; style < STYLE_COUNT; style++) {
    for (let n = 0; n < plan.count[style]; n++) {
      if (Math.abs(plan.y[style][n] - y) < 0.001) out.push([plan.x[style][n], plan.x[style][n] + plan.w[style][n]])
    }
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** The same cut for the exact rectangle of one span: its left and right edge on the paper, clipped to it. For tests and the painter's lamp. */
export function spanBox(index: TraceIndex, win: Win, g: TapeGeometry, i: number): { x0: number; x1: number } {
  const scale = g.plotW / (win.toNs - win.fromNs)
  return { x0: g.plotX + (spanStart(index, i) - win.fromNs) * scale, x1: g.plotX + (spanEnd(index, i) - win.fromNs) * scale }
}
