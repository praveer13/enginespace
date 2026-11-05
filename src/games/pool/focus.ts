import type { PanView, PoolView, StationView } from '@es/play/pool/types'

/*
 * The focus of the night, as the page says it (GAMES.md §2.6 "The Reach-In"): the ticket hung last, its pans at each station in the
 * order of its blocks, and the pan at the head of its order with the station that keeps it, whose layers that one pan holds. The 3D scene
 * runs its twine through those pans and fans the head pan into its layers (scene-layout.ts's nightOf, which works the focus out the same
 * way: tests/play/pool-scene.test.ts holds the two equal); the page prints what the fan shows beside the scene (Game.tsx). The scene does
 * not import this module, because a module that the page and the scene both import folds the page into a chunk the scene loads.
 */

export interface Focus {
  /** The ticket hung last, or undefined while the line is empty. */
  readonly ticket: number | undefined
  /** Its pans at each station, in the order of its blocks: empty for a station it holds nothing at, or one the filter leaves out. */
  readonly tables: readonly (readonly PanView[])[]
  /** The pan at the head of its order, at the first station that holds any. */
  readonly head: PanView | undefined
  /** The station that keeps the head pan. */
  readonly group: StationView | null
}

/** The focus of `view`: of every station, or only of station `station` (the One station preset). */
export function focusOf(view: PoolView, station: number | null): Focus {
  const ticket = view.running[view.running.length - 1] as number | undefined
  const tables = view.stations.map((_, g) =>
    ticket === undefined || (station !== null && g !== station) ? [] : view.pans.filter((pan) => pan.station === g && pan.holders.includes(ticket)).sort((a, b) => (a.block ?? 0) - (b.block ?? 0)),
  )
  const head = tables.find((list) => list.length > 0)?.[0]
  return { ticket, tables, head, group: head?.station == null ? null : view.stations[head.station] }
}
