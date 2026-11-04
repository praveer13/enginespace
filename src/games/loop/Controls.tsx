import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { ticketNo } from '@es/play/loop/layout'
import type { LoopAction, LoopView } from '@es/play/loop/types'
import { Bell } from '@/design/components/Bell'
import { Button } from '@/design/components/Button'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { Toggle } from '@/design/components/Toggle'
import { changeLine } from './announce'
import type { LoopRun } from './types'

/*
 * Service's controls (GAMES.md §3 "Controls", §2.6 "First service's copy"): HTML for every action, so a pointer, a keyboard and a
 * screen reader all reach the same things. The waiting tickets are buttons ("Tap a ticket to hang it on the rail"), the bell fires
 * the next step, Auto rings it until the loop needs a decision, and, from the third level on, one switch writes the next call
 * during this fire (overlap, async scheduling).
 *
 * The tickets are one tab stop and the arrows move along them (roving tabindex). When a ticket is hung, focus goes to the next
 * ticket in line, or to the bell when none is left, so a keyboard never loses its place. Auto pauses when a clip opens with a ticket
 * waiting, because the loop then waits for a decision (GAMES.md §3.1, beat 2), and it is never on to begin with (reduced motion,
 * WCAG 2.2.2).
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

export function Controls({ run, toggleAutoRef }: { run: LoopRun; toggleAutoRef?: AutoToggleRef }) {
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

  return (
    <div className="flex flex-col gap-4" data-loop-controls="">
      <p className="es-type-body max-w-prose" data-loop-prompt="">
        {view.prompt}
      </p>

      <section aria-label="Tickets waiting" className="flex flex-col gap-2">
        {view.waiting.length > 0 ? (
          <ul
            ref={list}
            onKeyDown={onListKey}
            data-native-keys="arrows"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          >
            {view.waiting.map((id, index) => (
              <li key={id} className="min-w-0">
                <Ticket
                  as="button"
                  compact
                  hole={false}
                  width="full"
                  head={`No. ${ticketNo(id)}`}
                  state={view.canHang ? 'default' : 'disabled'}
                  tabIndex={index === tabStop ? 0 : -1}
                  aria-label={`Hang ticket No. ${ticketNo(id)} on the rail`}
                  onClick={() => hang(id, index)}
                >
                  <TicketLine>hang</TicketLine>
                </Ticket>
              </li>
            ))}
          </ul>
        ) : null}
        {hint ? <p className="text-text-2">{hint}</p> : null}
      </section>

      <div className="flex flex-wrap items-center gap-6">
        <div ref={bell}>
          <Bell step={view.step} onRing={ring} disabled={!view.canFire} size="lg" caption="fire" />
        </div>
        <Button size="lg" variant="plate" aria-pressed={auto} aria-keyshortcuts="Space" disabled={!view.canFire && !auto} onClick={toggleAuto}>
          Auto
        </Button>
        {view.overlapAvailable ? (
          <Toggle
            label="Write the next call during this fire"
            hint="overlap (async scheduling)"
            checked={view.overlap}
            disabled={view.done}
            onCheckedChange={(on) => dispatch({ t: 'lever', name: 'async', value: on })}
            id="loop-overlap"
          />
        ) : null}
      </div>
    </div>
  )
}
