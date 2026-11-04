import type { Announcement } from './announcer'

/*
 * The game's live region (ARCHITECTURE §6.9): one polite region for the turn's line, and one status region for outcomes (the
 * run is over, the debrief is ready). Both stay in the page from the first render, empty, because a screen reader announces
 * a change to a live region that was already there and not one that arrives with its text. Both are visually hidden: the
 * mirror carries every number the view draws, so the line is for the ear.
 *
 * A new announcement renders under a new key, so the same sentence twice in a row is read twice.
 */

export interface LiveRegionProps {
  /** The turn's line, from `useAnnouncer`. */
  announcement: Announcement | null
  /** An outcome: "The run is over. The debrief is ready." Empty until there is one. */
  outcome?: string
}

export function LiveRegion({ announcement, outcome = '' }: LiveRegionProps) {
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-live="line">
        {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
      </div>
      <div role="status" className="sr-only" data-live="outcome">
        {outcome}
      </div>
    </>
  )
}
