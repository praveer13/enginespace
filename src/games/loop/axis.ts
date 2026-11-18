/*
 * The timing diagram's axis numbers (View2D.tsx): where each stands on its tick, so none is cut by the track's edges.
 */

/** An axis number's width a character, in px: the numbers' face at the micro size [estimated: 0.6 em of 11 px, and a margin]. */
const TICK_CHAR = 7

/**
 * Where an axis number stands on its tick: centred on it; from it, or up to it, at the track's two edges; or not at all, where it would be
 * cut by an edge, so the axis never shows part of a number ("0" for 20 where the window starts just before tick 20). The tick stays.
 */
export function tickAnchor(x: number, text: string, left: number, right: number): 'start' | 'middle' | 'end' | null {
  if (x <= left + 4) return 'start'
  if (x >= right - 4) return 'end'
  const half = (text.length * TICK_CHAR) / 2
  return x - half < left || x + half > right ? null : 'middle'
}

/**
 * Where a track that scrolls sideways starts its window, from where it would: a little to the left where an axis number would straddle the
 * window's edge, so the window opens on a whole number (the debrief at 390 read "0" for tick 20). It moves by less than one number's width,
 * so now stays about where it was put.
 */
export function wholeAxisLeft(left: number, ticks: readonly { readonly x: number; readonly text: string }[]): number {
  for (const tick of ticks) {
    const half = (tick.text.length * TICK_CHAR) / 2
    if (tick.x - half < left && left < tick.x + half) return Math.max(0, tick.x - half - 2)
  }
  return left
}
