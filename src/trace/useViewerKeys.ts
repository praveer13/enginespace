import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { handleKey } from './key-rules'
import type { KeyPress } from './key-rules'
import { REPEATING, TRACE_KEYS } from './keys'

/*
 * The viewer's keys, bound on its own container (ARCHITECTURE §6.8): they act only while focus is inside it (WCAG 2.1.4), by the
 * rules in key-rules.ts. The listener is native, so it does not hear a dialog that is portalled out of the container.
 */

export interface ViewerKeyHandling {
  /** Settings can turn shortcuts off (WCAG 2.1.4), and a host can too. */
  readonly enabled: boolean
  /** Called with a key's id. Return false when the command does not apply, so the key keeps its browser meaning. */
  readonly onCommand: (id: string) => boolean | void
}

/** Binds the viewer's keys on the element that gets the returned ref. The handling may change on every render; the listener reads the latest. */
export function useViewerKeys(handling: ViewerKeyHandling): RefObject<HTMLElement | null> {
  const container = useRef<HTMLElement | null>(null)
  const latest = useRef(handling)
  useEffect(() => {
    latest.current = handling
  })
  useEffect(() => {
    const element = container.current
    if (element === null) return undefined
    const listener = (event: KeyboardEvent) => {
      handleKey(event satisfies KeyPress, { keys: TRACE_KEYS, repeating: REPEATING, enabled: latest.current.enabled, onCommand: latest.current.onCommand })
    }
    element.addEventListener('keydown', listener)
    return () => element.removeEventListener('keydown', listener)
  }, [])
  return container
}
