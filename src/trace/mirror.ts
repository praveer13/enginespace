/*
 * The DOM mirror's rows (ARCHITECTURE §6.9: "the canvas holds no unique information"): the spans in the window, lane by lane, as many
 * of each lane as a table can hold. A window zoomed out over a hundred thousand spans cannot list them all, and a table of that
 * size helps nobody, so a lane lists its first `ROWS_PER_LANE` spans in the window and counts the rest. A button under the lane
 * lists up to `ROWS_PER_LANE_ALL` of them, and zooming in lists the rest. The span the cursor stands on is always listed, wherever
 * it falls in the lane, so the table and the lamp never disagree.
 */
import { spansInWindow } from './model'
import type { Cursor, Lane, TraceIndex, Win } from './model'

/** How many spans of one lane the table lists at first [estimated]. */
export const ROWS_PER_LANE = 16
/** How many it lists when asked for them all [estimated]: a window of more than this wants to be zoomed. */
export const ROWS_PER_LANE_ALL = 200

export interface MirrorGroup {
  readonly lane: Lane
  readonly spans: readonly number[]
  /** How many spans of the lane touch the window. */
  readonly total: number
}

/** `all` names the lanes that have been asked to list everything they can. */
export function mirrorGroups(index: TraceIndex, win: Win, cursor: Cursor | null, all: ReadonlySet<number> = new Set()): MirrorGroup[] {
  const groups = spansInWindow(index, win, ROWS_PER_LANE_ALL).map((found): MirrorGroup => {
    const limit = all.has(found.lane.index) ? ROWS_PER_LANE_ALL : ROWS_PER_LANE
    return { lane: found.lane, spans: found.spans.slice(0, limit), total: found.total }
  })
  if (cursor !== null) {
    const lane = index.lanes[index.spanLane[cursor.span]]
    const at = groups.findIndex((group) => group.lane === lane)
    if (at >= 0 && !groups[at].spans.includes(cursor.span)) {
      // Listed where it falls among the lane's spans in start order, which is after the rows that start before it.
      const spans = [...groups[at].spans, cursor.span].sort((a, b) => index.spanPos[a] - index.spanPos[b])
      groups[at] = { lane, spans, total: groups[at].total }
    }
  }
  return groups.filter((group) => group.spans.length > 0)
}
