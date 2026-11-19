import { useEffect, useState } from 'react'
import type { LedgerEvent } from '@es/ledger'

/*
 * The reviews due, for the quiet line under Course's way on. What is due comes from the deck, which is the item catalog and the FSRS
 * model: code that Course has no other use for, so it loads after the ledger has been read, in a chunk of its own, and the page does
 * not wait for it. Until it arrives, and when nothing is due, the line is not there.
 */

export interface Due {
  readonly count: number
  /** The nominal minutes of the session, at least one. */
  readonly minutes: number
}

export function useDue(events: readonly LedgerEvent[], ready: boolean, refs?: Readonly<Record<string, readonly string[]>>): Due | null {
  const [due, setDue] = useState<Due | null>(null)
  useEffect(() => {
    if (!ready) return
    let live = true
    import('./dueCount')
      .then((module) => {
        if (live) setDue(module.dueSummary(events, refs))
      })
      .catch(() => {
        if (live) setDue(null)
      })
    return () => {
      live = false
    }
  }, [events, ready, refs])
  return due
}
