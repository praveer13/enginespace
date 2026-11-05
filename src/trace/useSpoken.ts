import { useEffect, useRef, useState } from 'react'
import type { Say } from './state'

/*
 * What the viewer says aloud (ARCHITECTURE §6.9): one polite line, never more than ten a second. The reducer says a sentence for each
 * command, and a key held down makes thirty of them; a screen reader that spoke each in turn would talk over the next. So the
 * sentences that arrive within a tenth of a second are spoken as the last of them, and the table and the printer's tape carry every
 * figure the sentences mention. A new sentence has a new `id`, so the same sentence twice in a row is read twice.
 */

/** Sentences said within this long of the first are spoken as one [estimated]. */
export const SPEAK_WINDOW_MS = 100

export interface Spoken {
  readonly id: number
  readonly text: string
}

export function useSpoken(say: Say | null): Spoken | null {
  const [spoken, setSpoken] = useState<Spoken | null>(null)
  const latest = useRef<Say | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (say === null) return
    latest.current = say
    if (timer.current !== null) return
    timer.current = setTimeout(() => {
      timer.current = null
      if (latest.current !== null) setSpoken({ id: latest.current.seq, text: latest.current.text })
    }, SPEAK_WINDOW_MS)
  }, [say])
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  return spoken
}
