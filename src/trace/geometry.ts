/*
 * Where everything sits on the tape, in CSS px: the feed-hole rail that carries the ruler, the rail the marks are stuck on, the
 * lanes with their rows, and the strip along the foot. One pure function turns the lanes' row counts and the width into these boxes, and
 * the painter, the DOM labels over the canvas and the pointer all read the same boxes, so a label can never drift from what it names.
 *
 * Wide, the lane names stand in a stainless gutter at the left of the paper. Narrow (a phone), there is no gutter and each lane's
 * name sits on a strip above the lane, so the paper keeps the whole width for time.
 */
import type { Win } from './model'

/** Below this width the lane names move above their lanes. */
export const STACKED_BELOW = 600

export const GUTTER_PX = 164
const RIGHT_PAD = 14
const RULER_H = 38
const RAIL_H = 32
const LANE_PAD = 12
const FOOT_H = 18
/** The strip that holds a lane's name when the gutter is gone. */
const LABEL_H = 26

export interface Box {
  readonly y: number
  readonly h: number
}

export interface LaneBox extends Box {
  /** The name strip above the rows, in a stacked layout; 0 when the names stand in the gutter. */
  readonly labelH: number
  /** Where the first row starts. */
  readonly rowsY: number
  readonly rowH: number
  readonly rows: number
}

export interface TapeGeometry {
  readonly width: number
  readonly height: number
  readonly stacked: boolean
  /** The gutter's width, and the paper's left edge. */
  readonly gutter: number
  readonly plotX: number
  readonly plotW: number
  /** The feed-hole rail: holes along the paper's top edge, and the numbers under them. */
  readonly ruler: Box
  /** The rail the marks are stuck on, or a box of no height when marking is off. */
  readonly rail: Box
  readonly lanes: readonly LaneBox[]
  /** The strip of holes along the foot. */
  readonly foot: Box
}

export interface GeometryOptions {
  /** Whether the tape has a rail for marks. */
  readonly rail: boolean
}

/** The rows of a lane are `rowH` tall with this much paper between. */
export const ROW_GAP = 4

export function tapeGeometry(rowsPerLane: readonly number[], width: number, options: GeometryOptions = { rail: true }): TapeGeometry {
  const stacked = width < STACKED_BELOW
  const gutter = stacked ? 0 : GUTTER_PX
  const rowH = stacked ? 24 : 32
  const labelH = stacked ? LABEL_H : 0
  const pad = stacked ? LANE_PAD - 4 : LANE_PAD
  const railH = options.rail ? RAIL_H : 0
  let y = RULER_H + railH
  const lanes: LaneBox[] = rowsPerLane.map((rows) => {
    const h = labelH + pad * 2 + rows * rowH + (rows - 1) * ROW_GAP
    const box: LaneBox = { y, h, labelH, rowsY: y + labelH + pad, rowH, rows }
    y += h
    return box
  })
  const plotX = gutter
  return {
    width,
    height: y + FOOT_H,
    stacked,
    gutter,
    plotX,
    plotW: Math.max(40, width - plotX - RIGHT_PAD),
    ruler: { y: 0, h: RULER_H },
    rail: { y: RULER_H, h: railH },
    lanes,
    foot: { y, h: FOOT_H },
  }
}

/** The x of a time on the paper, in CSS px from the tape's left edge. */
export function timeToX(g: TapeGeometry, win: Win, ns: number): number {
  return g.plotX + ((ns - win.fromNs) * g.plotW) / (win.toNs - win.fromNs)
}

/** The time under an x. */
export function xToTime(g: TapeGeometry, win: Win, x: number): number {
  return win.fromNs + ((x - g.plotX) * (win.toNs - win.fromNs)) / g.plotW
}

/** The y of a row's top. */
export const rowY = (lane: LaneBox, row: number): number => lane.rowsY + row * (lane.rowH + ROW_GAP)

/** The lane and row under a y, or null where there is paper but no row (a lane's padding, the rails). */
export function rowAt(g: TapeGeometry, y: number): { lane: number; row: number } | null {
  for (let i = 0; i < g.lanes.length; i++) {
    const box = g.lanes[i]
    if (y < box.y || y >= box.y + box.h) continue
    const within = y - box.rowsY
    if (within < -4) return null
    const row = Math.min(box.rows - 1, Math.max(0, Math.floor(within / (box.rowH + ROW_GAP))))
    return { lane: i, row }
  }
  return null
}
