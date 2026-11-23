import type { LedgerEvent } from '@es/ledger'
import { useEvidence } from '@/evidence/useEvidence'

/*
 * The learner's own record of a game, read from the ledger's `play` events (REDESIGN §2.6, "A reason to run again"): the best score on a
 * level, and the levels played. Nothing is stored for it: the events are the record, and these are read from them when a page draws
 * (ASSESSMENT §3.3).
 *
 * The hooks open the ledger, so only a lazy chunk that a page with a ledger loads calls them: the result, and the first run's check of what
 * the learner has met. The front page never opens the ledger (D-038), so it reads only the intro flag.
 */

/** A level's best: the highest score its runs got (the session's grade, 1 at most), and how many runs there were. */
export interface Best {
  readonly score: number
  readonly runs: number
}

const refOf = (game: string, level: string) => `play:${game}/${level}`

/** The best run of a level in these events, or null when it has none. */
export function bestOf(events: readonly LedgerEvent[], game: string, level: string): Best | null {
  const ref = refOf(game, level)
  let score = 0
  let runs = 0
  for (const event of events) {
    // A run left before its end (`data.left`, W2b-T78) is not a run the learner finished.
    if (event.kind !== 'play' || event.data?.left !== undefined || event.ref !== ref) continue
    runs += 1
    if (typeof event.score === 'number' && Number.isFinite(event.score)) score = Math.max(score, event.score)
  }
  return runs === 0 ? null : { score, runs }
}

/** The levels of a game that have a run in these events. */
export function playedLevels(events: readonly LedgerEvent[], game: string): ReadonlySet<string> {
  const prefix = `play:${game}/`
  const levels = new Set<string>()
  for (const event of events) if (event.kind === 'play' && event.data?.left === undefined && event.ref.startsWith(prefix)) levels.add(event.ref.slice(prefix.length))
  return levels
}

/** The best of a level, from the ledger, or null until the ledger is read or while the level has no run. */
export function useBest(game: string, level: string): Best | null {
  const { ready, events } = useEvidence()
  return ready ? bestOf(events, game, level) : null
}

/** The levels of a game played, from the ledger, or null until the ledger is read. */
export function usePlayed(game: string): ReadonlySet<string> | null {
  const { ready, events } = useEvidence()
  return ready ? playedLevels(events, game) : null
}
