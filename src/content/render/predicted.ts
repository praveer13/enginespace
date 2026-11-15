import { useSyncExternalStore } from 'react'
import type { Confidence } from '@es/ledger'
import type { PredictValue } from '@es/play/predictions/grade'
import type { Truth } from '@es/play/predictions/types'
import type { BlockRun } from './runs'

/*
 * The predictions a tab has committed and revealed (W1b-T02): what makes a committed prediction final, and what keeps the box's state when
 * the learner leaves the lesson and comes back. A prediction is committed before the game that follows it is played and revealed after it
 * (ARCHITECTURE §4.3), so it must not change in between: the box commits once, and a second commit of the same prediction is refused here,
 * whatever the page does. Nothing here is stored: the ledger holds the evidence, a `predict` event written at the reveal, and this holds
 * what the tab has done until it closes. A reload is a new tab for it, and a prediction that was committed and not revealed is gone.
 *
 * A commitment notes `latestSeq()` of the runs (runs.ts) at the moment it is made. A run that ended before it was played in sight of the
 * answer, and is no run to reveal after: only one whose `seq` is greater counts.
 */

export interface Commitment {
  /** What the learner wrote: a number, the id of an option, or the ends of a range. */
  readonly value: PredictValue
  /** The tap that says how sure they were, or none. It never gates. */
  readonly conf: Confidence | null
  /** `latestSeq()` when the prediction was committed. */
  readonly after: number
}

/** What a reveal found, and what became of the event it wrote. */
export interface Revealed {
  readonly truth: Truth
  readonly ok: boolean
  readonly score: number
  /** The model's sentence about what it read. */
  readonly reads: string
  /** The run the answer was read from. */
  readonly run: { readonly game: string; readonly level: string; readonly seed: number }
  /** Why the ledger would not take the event, or null when it did. The reveal stands either way. */
  readonly unsaved: string | null
}

export interface PredictionState {
  readonly committed: Commitment | null
  readonly revealed: Revealed | null
}

const EMPTY: PredictionState = { committed: null, revealed: null }
const states = new Map<string, PredictionState>()
const listeners = new Set<() => void>()

const keyOf = (scope: string, id: string): string => `${scope}#${id}`
const notify = (): void => {
  for (const listener of [...listeners]) listener()
}

/**
 * Where a prediction's ticket is: asking for its answer, committed and waiting for the game, ready to reveal because a run of the game ended
 * after the commit, or revealed. A run that ended before the commit (a `seq` at or below the one noted then) was played in sight of the answer,
 * and is no run to reveal after.
 */
export type Phase = 'asking' | 'committed' | 'ready' | 'revealed'

export function phaseOf(state: PredictionState, run: Pick<BlockRun, 'seq'> | null): Phase {
  if (state.revealed !== null) return 'revealed'
  if (state.committed === null) return 'asking'
  return run !== null && run.seq > state.committed.after ? 'ready' : 'committed'
}

/** What the tab has done with a prediction. */
export const predictionState = (scope: string, id: string): PredictionState => states.get(keyOf(scope, id)) ?? EMPTY

/** Commits a prediction. A prediction is committed once: a second commit throws, and so does a commit after the reveal. */
export function commitPrediction(scope: string, id: string, commitment: Commitment): Commitment {
  const key = keyOf(scope, id)
  if (states.has(key)) throw new RangeError('this prediction is committed already, and a committed prediction does not change')
  states.set(key, { committed: commitment, revealed: null })
  notify()
  return commitment
}

/** Records the reveal of a committed prediction, once. */
export function revealPrediction(scope: string, id: string, revealed: Revealed): Revealed {
  const key = keyOf(scope, id)
  const state = states.get(key)
  if (state === undefined || state.committed === null) throw new RangeError('a prediction is revealed after it is committed')
  if (state.revealed !== null) throw new RangeError('this prediction is revealed already')
  states.set(key, { committed: state.committed, revealed })
  notify()
  return revealed
}

/** Calls `listener` after every commit and every reveal. Returns the way to stop. */
export function subscribePredictions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A prediction's state, as React state: the component draws again when it is committed or revealed. */
export function usePrediction(scope: string, id: string): PredictionState {
  return useSyncExternalStore(
    subscribePredictions,
    () => predictionState(scope, id),
    () => EMPTY,
  )
}

/** Forgets every prediction. For tests. */
export function forgetPredictions(): void {
  states.clear()
  notify()
}
