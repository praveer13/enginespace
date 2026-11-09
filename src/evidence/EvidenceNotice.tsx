import { useSyncExternalStore } from 'react'
import { Stub } from '@/design/components/Stub'
import { Ticket } from '@/design/components/Ticket'
import { getReadOnlyNotice, subscribeReadOnlyNotice } from './notice'

/*
 * The reload prompt of the schema guard (ARCHITECTURE §7.4). When a newer version of enginespace owns the learner's data,
 * this tab stops writing, and this ticket says so at the head of the page: what happened, that the evidence is safe, and
 * the one thing to do. It is the error ticket of The Pass with a stub to pull, and it shows nothing in the ordinary case.
 */
export function EvidenceNotice() {
  // The site is rendered in the browser only. The server renderer runs in tests, and shows what the store holds there.
  const notice = useSyncExternalStore(subscribeReadOnlyNotice, getReadOnlyNotice, getReadOnlyNotice)
  if (notice === null) return null
  return (
    // The ticket hangs above the page, and the page starts a group's distance below it (the spacing role `space-8`).
    <div style={{ marginBlockEnd: 'var(--es-space-8)' }}>
      <Ticket
        as="section"
        head="Read-only"
        meta="Nothing saved here"
        title="This tab has stopped saving."
        state="error"
        error={notice.text}
        width="full"
        data-reason={notice.reason}
        stub={<Stub onClick={() => window.location.reload()}>Reload</Stub>}
      />
    </div>
  )
}
