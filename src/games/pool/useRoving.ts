import { useCallback, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

/*
 * One tab stop for a list of buttons, and the arrows between them (ARCHITECTURE §6.9: a listbox with a roving tabindex). The list is
 * `data-native-keys="arrows"`, so the game's own keys stay out of the arrows' way. The stop is remembered as an index and clamped, so a
 * list that shrinks after a pick leaves the stop on its last button.
 */

export interface Roving {
  readonly list: RefObject<HTMLUListElement | null>
  /** The index of the button that holds the tab stop. */
  readonly stop: number
  onKeyDown(event: KeyboardEvent<HTMLUListElement>): void
  /** Moves the stop to `index` and focuses it. */
  focusAt(index: number): void
  /** Notes that the button at `index` took focus (a click, or a tab). */
  note(index: number): void
}

export function useRoving(count: number): Roving {
  const list = useRef<HTMLUListElement>(null)
  const [at, setAt] = useState(0)
  const stop = Math.max(0, Math.min(at, count - 1))
  const buttons = useCallback((): HTMLButtonElement[] => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button[data-roving]:not(:disabled)') ?? []), [])
  const focusAt = useCallback(
    (index: number) => {
      const found = buttons()
      const target = Math.max(0, Math.min(index, found.length - 1))
      setAt(target)
      found[target]?.focus()
    },
    [buttons],
  )
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const found = buttons()
      const here = found.indexOf(event.target as HTMLButtonElement)
      if (here < 0 || event.ctrlKey || event.altKey || event.metaKey) return
      const next = { ArrowRight: here + 1, ArrowDown: here + 1, ArrowLeft: here - 1, ArrowUp: here - 1, Home: 0, End: found.length - 1 }[event.key]
      if (next === undefined) return
      event.preventDefault()
      focusAt(next)
    },
    [buttons, focusAt],
  )
  return { list, stop, onKeyDown, focusAt, note: setAt }
}
