/*
 * `useWayOn(lessons, place)`: the way on alone, `nextStep`'s answer over the ledger's events, the map's lessons table and the bookmark
 * (REDESIGN §2.4), without the progress of every knowledge component. `useProgress` calls it for Course and a module page.
 *
 * Once the ledger is open it keeps a copy of the answer as the pointer (`es:next`, D-066), so that the header's Continue says the same
 * thing on every page, the front page included, which opens no ledger. The pointer is a label and a link: it holds no progress, and
 * deleting it changes the label only. `place` is a bookmark held in hand; without one, `es:here` is read. `due` is the reviews due now, which only Review passes: it is what `nextStep`'s last rule reads when every lesson is done.
 */
import { useEffect, useMemo } from 'react'
import type { MapLesson } from '@es/schema/compiled'
import { useEvidence } from '@/evidence/useEvidence'
import { readPlace } from '@/settings/bookmark'
import { keepPointer } from '@/settings/store'
import { nextStep } from './next'
import type { Bookmark, Step } from './next'

export function useWayOn(lessons: readonly MapLesson[] | null, place?: Bookmark | null, due?: number): Step | null {
  const { ready, events } = useEvidence()
  const next = useMemo(() => (lessons === null || !ready ? null : nextStep(events, lessons, place ?? readPlace(), due === undefined ? {} : { due })), [events, lessons, ready, place, due])
  useEffect(() => {
    if (next !== null) keepPointer({ href: next.href, label: next.label, word: next.word, ...(next.minutes === undefined ? {} : { minutes: next.minutes }) })
  }, [next])
  return next
}
