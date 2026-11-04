import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type RefObject } from 'react'
import type { LoopAction, LoopView } from '@es/play/loop/types'
import { changeLine } from './announce'
import type { LoopRun } from './types'

/*
 * The state behind Service's controls (Controls.tsx): Auto, the bell, hanging a ticket and where focus goes after it, and the roving tab
 * stop over the waiting tickets. The pieces in Controls.tsx draw it, wherever a page puts them.
 */

/** The time between two rings of the bell in Auto, in ms [estimated]: long enough to read a fire go by. */
const AUTO_MS = 900

const RING: LoopAction = { t: 'run', until: 'step' }

/** What the shell's `play-pause` key calls: it toggles Auto. Controls puts its toggle here, and the game's `onCommand` calls it. */
export type AutoToggleRef = MutableRefObject<(() => void) | null>

/** The announcement for every change of the view, once the first one has been seen. */
function useAnnouncements(run: LoopRun): void {
  const seen = useRef<LoopView | null>(null)
  const { view, announce } = run
  useEffect(() => {
    const before = seen.current
    seen.current = view
    if (before === null) return
    const line = changeLine(before, view)
    if (line !== '') announce(line)
  }, [view, announce])
}

/** The controls' state and handlers, shared by the pieces wherever a page puts them. */
export interface LoopControls {
  readonly run: LoopRun
  readonly view: LoopView
  readonly auto: boolean
  readonly ring: () => void
  readonly toggleAuto: () => void
  readonly hang: (id: number, index: number) => void
  readonly onListKey: (event: KeyboardEvent<HTMLUListElement>) => void
  /** The waiting ticket that holds the tab stop. */
  readonly tabStop: number
  readonly list: RefObject<HTMLUListElement | null>
  readonly bell: RefObject<HTMLDivElement | null>
  /** Why no ticket can be hung now, or null when one can. */
  readonly hint: string | null
}

export function useLoopControls(run: LoopRun, toggleAutoRef?: AutoToggleRef): LoopControls {
  const { view, dispatch } = run
  const [auto, setAuto] = useState(false)
  const [stop, setStop] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const bell = useRef<HTMLDivElement>(null)
  const focusAfterHang = useRef<number | null>(null)
  useAnnouncements(run)

  // Auto: ring, wait, ring, until the night ends or a decision is pending. It is a switch that turns itself off, and the tape's feed
  // and the live region keep pace. (A pause is derived from the view, so the flag is reset in the render that sees it.)
  const running = auto && view.canFire && !view.done && !view.deciding
  if (auto && !running) setAuto(false)
  const { setAutoplay } = run
  useEffect(() => {
    setAutoplay(running)
    if (!running) return undefined
    const timer = window.setTimeout(() => dispatch(RING), AUTO_MS)
    return () => window.clearTimeout(timer)
  }, [running, view, dispatch, setAutoplay])

  const ring = useCallback(() => {
    if (view.canFire) dispatch(RING)
  }, [view.canFire, dispatch])
  const toggleAuto = useCallback(() => {
    if (auto) setAuto(false)
    else if (view.canFire) {
      setAuto(true)
      dispatch(RING)
    }
  }, [auto, view.canFire, dispatch])
  useEffect(() => {
    if (toggleAutoRef) toggleAutoRef.current = toggleAuto
    return () => {
      if (toggleAutoRef) toggleAutoRef.current = null
    }
  }, [toggleAutoRef, toggleAuto])

  // After a ticket is hung, focus follows to the next in line, or to the bell.
  useEffect(() => {
    const at = focusAfterHang.current
    if (at === null) return
    focusAfterHang.current = null
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const next = buttons && buttons.length > 0 ? buttons[Math.min(at, buttons.length - 1)] : bell.current?.querySelector('button')
    next?.focus()
  }, [view.waiting])

  const hang = (id: number, index: number) => {
    focusAfterHang.current = index
    setStop(index)
    dispatch({ t: 'admit', req: id })
  }

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const target = Math.max(0, Math.min(buttons.length - 1, next))
    setStop(target)
    buttons[target]?.focus()
  }

  const railFull = view.rail.every((clip) => clip.req !== null)
  const hint = view.waiting.length === 0 ? 'No tickets are waiting.' : !view.canHang ? (railFull ? 'Every clip is hung: ring the bell.' : 'The rail takes no more tickets right now.') : null
  const tabStop = Math.min(stop, Math.max(view.waiting.length - 1, 0))
  return { run, view, auto, ring, toggleAuto, hang, onListKey, tabStop, list, bell, hint }
}
