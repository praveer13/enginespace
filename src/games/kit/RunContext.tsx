import { createContext, useContext, useSyncExternalStore, type ComponentType } from 'react'
import type { GameAction, GameMode } from '@es/play'

/*
 * The run a lesson's dock shows (REDESIGN §2.5, §2.6; D-018): a second view of the same run state. The instrument frame owns the run, and
 * where a lesson placed it (a `RunPlace` from the game block), the frame publishes what the dock needs here on every render: the view, the
 * run's own dispatch, undo and restart, and the game's compact view. The dock reads the run the learner touched last on this page, so an
 * action taken in either shows in both, and nothing is copied: the dock calls the frame's own functions.
 *
 * Nothing here is stored and nothing is evidence. The frame's run writes the ledger when it ends, as it does with no dock at all. This file
 * imports no game, so the lesson can read it without loading one; a game's DockView arrives with the game's own chunk.
 */

/** Where a lesson placed a run: the lesson, the block's key on the page, and the id of the instrument's box, for "Back to my run". */
export interface RunPlace {
  readonly scope: string
  readonly key: string
  readonly anchor: string
}

/** Given by a lesson's game block; the game page and the front page give none, and their frames publish nothing. */
export const RunPlaceContext = createContext<RunPlace | null>(null)

export const useRunPlace = (): RunPlace | null => useContext(RunPlaceContext)

/** What a game's compact view receives: the run as the dock holds it. */
export interface DockViewProps<View = unknown> {
  readonly run: LiveRun<View>
}

/** A run as the dock sees it: what to draw, and the frame's own ways to act on it. */
export interface LiveRun<View = unknown> {
  readonly place: RunPlace
  readonly game: string
  readonly gameTitle: string
  readonly levelTitle: string
  readonly mode: GameMode
  readonly view: View
  readonly done: boolean
  readonly turns: number
  readonly canUndo: boolean
  /** The session's first ask is still open (the guess): the dock's Step waits for it, since a move would use up the chance to guess. */
  readonly askOpen: boolean
  /** The move Step takes now, or null when there is none to take. */
  readonly step: GameAction | null
  /** What Step does, in the game's words. */
  readonly stepWords: string
  dispatch(action: GameAction): void
  undo(): void
  restart(): void
  /** The game's compact 2D view, or null for a game that gives none: the dock then points back to the run. */
  readonly DockView: ComponentType<DockViewProps<View>> | null
  /** Grows each time the learner starts or moves this run: the dock follows the largest. */
  readonly touched: number
}

const runs = new Map<string, LiveRun>()
const listeners = new Set<() => void>()
let touches = 0

const tell = () => {
  for (const listener of [...listeners]) listener()
}

/** The next touch: a run that starts or moves takes it, and the dock follows it. */
export const nextTouch = (): number => {
  touches += 1
  return touches
}

/** Puts a run's latest state where the dock reads it. */
export function publishRun(run: LiveRun): void {
  runs.set(run.place.key, run)
  tell()
}

/** A run that left the page (its instrument folded, or the page changed): the dock shows the one touched before it. */
export function retireRun(key: string): void {
  if (runs.delete(key)) tell()
}

/** The run touched last in a lesson, or null before any. */
export function latestRun(scope: string): LiveRun | null {
  let best: LiveRun | null = null
  for (const run of runs.values()) if (run.place.scope === scope && (best === null || run.touched > best.touched)) best = run
  return best
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The run touched last in a lesson, as React state. A server render reads the same store, which holds no run unless a test put one there. */
export function useLatestRun(scope: string): LiveRun | null {
  const read = () => latestRun(scope)
  return useSyncExternalStore(subscribe, read, read)
}

/** Forgets every run. For tests. */
export function forgetRuns(): void {
  runs.clear()
  touches = 0
  tell()
}
