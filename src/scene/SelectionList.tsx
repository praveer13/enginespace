import clsx from 'clsx'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Selection } from './selection'

/*
 * The DOM list a scene's selection is mirrored in (ARCHITECTURE §6.4, §6.9): a listbox with a roving tabindex. One option
 * is in the tab order; the arrows, Home and End move it and the selection follows; a click selects. A 3D pick bumps the
 * selection's `focusTick`, and the list moves focus to the picked option, so pointer and keyboard meet in one place. The
 * list is always a way to select: a 3D object never is the only one (A§6.8).
 */

export interface SelectionItem {
  readonly id: string
  readonly label: ReactNode
}

export interface SelectionListProps {
  /** The list's accessible name. */
  label: string
  items: readonly SelectionItem[]
  selection: Selection
  className?: string
}

const KEYS: Record<string, 'next' | 'previous' | 'first' | 'last'> = {
  ArrowDown: 'next',
  ArrowRight: 'next',
  ArrowUp: 'previous',
  ArrowLeft: 'previous',
  Home: 'first',
  End: 'last',
}

export function SelectionList({ label, items, selection, className }: SelectionListProps) {
  const options = useRef(new Map<string, HTMLLIElement>())
  const follow = useRef(false)

  // A pick in the scene, or a key here: focus goes to the active option.
  useEffect(() => {
    if (selection.focusTick === 0) return
    if (selection.active) options.current.get(selection.active)?.focus()
  }, [selection.focusTick, selection.active])
  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    if (selection.active) options.current.get(selection.active)?.focus()
  }, [selection.active])

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const by = KEYS[event.key]
    if (by) {
      event.preventDefault()
      event.stopPropagation()
      follow.current = true
      selection.move(by)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      if (selection.tabStop) selection.select(selection.tabStop)
    }
  }

  return (
    <ul role="listbox" aria-label={label} className={clsx('es-selection', className)} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <li
          key={item.id}
          ref={(node) => {
            if (node) options.current.set(item.id, node)
            else options.current.delete(item.id)
          }}
          role="option"
          aria-selected={selection.selected === item.id}
          tabIndex={item.id === selection.tabStop ? 0 : -1}
          className="es-selection__option"
          data-selected={selection.selected === item.id || undefined}
          onClick={() => selection.select(item.id)}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}
