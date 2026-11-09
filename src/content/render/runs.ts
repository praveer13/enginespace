import { useSyncExternalStore } from 'react'
import type { GameMode, RunResult } from '@es/play'

/*
 * The runs that a page's game blocks finished (W1b-T01): the seam for a block that reads a game's result, as the prediction box does when
 * it reveals after the game (W1b-T02; A§4.3, `reveal: after-game`). A lesson's game block puts every run that ends here, as it writes it
 * to the ledger, and a reader takes the run of the block it answers to. Nothing here is stored: the ledger holds the evidence, and this
 * holds what the tab has played, until it closes.
 *
 * A run is found by the page and by the game block's place among the page's blocks (`lesson.blocks[at]`), so a block finds the game it
 * follows by counting. Each run that ends replaces the block's last, and carries `seq`, which grows with every run that ends in the tab: a
 * reader that notes `latestSeq()` when the learner commits a prediction reveals on the first run whose `seq` is greater, so a run played
 * before the commit never answers it.
 *
 * `result` is the session's result as the debrief reads it: the record (game, level, seed, actions and the lesson's `rev`), the grade, the
 * debrief and the hash of the last state. The reference a prediction is scored against is the pure model's, computed from that record
 * (packages/play), never read off the page.
 */

export interface BlockRun {
  /** The page the block is on: the lesson's id (`tr2.l3`), as its tickets' head line prints it. */
  readonly scope: string
  /** The game block's place among the page's blocks. */
  readonly at: number
  readonly game: string
  readonly level: string
  /** The run's own mode: the block's, unless the learner took the level's other way in the game (a graded run from a practice block). */
  readonly mode: GameMode
  readonly result: RunResult
  /** Grows by one with every run that ends in the tab, on any block. */
  readonly seq: number
}

const runs = new Map<string, BlockRun>()
const listeners = new Set<() => void>()
let seq = 0

const keyOf = (scope: string, at: number): string => `${scope}#${at}`

/** Puts a run that ended, and tells every reader. The game block calls it from the game's `onFinish`. */
export function finishBlockRun(run: Omit<BlockRun, 'seq'>): BlockRun {
  seq += 1
  const stored: BlockRun = { ...run, seq }
  runs.set(keyOf(run.scope, run.at), stored)
  for (const listener of [...listeners]) listener()
  return stored
}

/** The last run of a block, or null while it has none. */
export function blockRun(scope: string, at: number): BlockRun | null {
  return runs.get(keyOf(scope, at)) ?? null
}

/** The `seq` of the last run that ended in the tab, 0 before any. */
export function latestSeq(): number {
  return seq
}

/** Calls `listener` after every run that ends. Returns the way to stop. */
export function subscribeBlockRuns(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The last run of a block, as React state: the component draws again when a run of any block ends. */
export function useBlockRun(scope: string, at: number): BlockRun | null {
  return useSyncExternalStore(
    subscribeBlockRuns,
    () => blockRun(scope, at),
    () => null,
  )
}

/** Forgets every run. For tests. */
export function forgetBlockRuns(): void {
  runs.clear()
  seq = 0
  for (const listener of [...listeners]) listener()
}
