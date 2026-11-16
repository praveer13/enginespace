import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Button } from '@/design/components/Button'
import { Callout } from '@/design/components/Callout'
import { Marker } from '@/design/components/Marker'
import { PartsList } from '@/design/components/PartsList'
import { Popover } from '@/design/components/Popover'
import { usePlayed } from './best'
import type { IntroStep, KitLook, KitPart } from './first-move'
import './intro.css'

/*
 * The first run's coach strip and its callouts (REDESIGN §2.6, §3.5): a lazy chunk, loaded only when the intro shows, so the game's route
 * carries none of it. The frame owns the steps (first-move.ts); this file draws them.
 *
 *   The coach strip, at the top of the dock: "What you are looking at" and the parts as an ordered list, then the look, the ask and the
 *   pointed first move, each with its words. "Next" carries the amber ring while the intro leads; "Skip intro" ends it at any step. On a
 *   phone the list shows one part at a time, and Next walks it.
 *   The callouts: an ink disc on each listed part's object in the drawing, numbered as the list is. They are decoration for the list, hidden
 *   from assistive technology, and never take a press.
 *
 * Nothing here is modal: no control is disabled, focus is not trapped, and the game plays under it.
 */

const WIDE = '(min-width: 64rem)'
const subscribe = (change: () => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
const useWideFrame = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  )

export interface IntroCoachProps {
  title: string
  step: IntroStep
  parts: readonly KitPart[]
  replay: boolean
  look: KitLook | null
  /** The session's first ask, in its own words. */
  ask: ReactNode
  /** Whether the session lets the learner skip its ask, and if not, why. */
  skip: 'allowed' | string
  moveWords: string
  /** Inside a lesson the column sets the room, and the list is shown whole. */
  embedded: boolean
  /** On a phone, the part the list shows. */
  partAt: number
  onPartAt(at: number): void
  onNext(): void
  onEnd(): void
  /** The learner makes the first move: the frame dispatches it. */
  onAct(): void
}

const TITLES: Readonly<Record<IntroStep, string>> = {
  parts: 'What you are looking at',
  look: 'Look before you guess',
  ask: 'Now the guess',
  move: 'Your first move',
  point: 'Your first move',
}

/** The coach strip. Focus follows its Next onto the step it opens, and leaves the strip alone otherwise. */
export function IntroCoach({ title, step, parts, replay, look, ask, skip, moveWords, embedded, partAt, onPartAt, onNext, onEnd, onAct }: IntroCoachProps) {
  const wide = useWideFrame() || embedded
  const headingId = useId()
  const root = useRef<HTMLElement>(null)
  const walking = step === 'parts' && !wide && partAt < parts.length - 1

  // Next moved the learner on: the step's heading takes focus, so a keyboard and a screen reader start reading the new step at its top. At
  // the ask, focus goes on to the ask's own field under the strip, in view.
  const pressed = useRef(false)
  useEffect(() => {
    if (!pressed.current) return
    pressed.current = false
    const field = step === 'ask' ? root.current?.parentElement?.querySelector<HTMLElement>('input:not(:disabled), textarea, select') : null
    if (field !== null && field !== undefined) {
      field.focus({ preventScroll: true })
      field.scrollIntoView({ block: 'nearest' })
      return
    }
    root.current?.querySelector<HTMLElement>('[data-intro-focus]')?.focus({ preventScroll: true })
  }, [step, partAt])

  const next = () => {
    pressed.current = true
    if (walking) onPartAt(partAt + 1)
    else onNext()
  }

  const nextButton = (label: string) => (
    <Marker kind="ring" word="now" className="es-intro__ring">
      <Button variant="ink" onClick={next} data-intro-next="">
        {label}
      </Button>
    </Marker>
  )

  let body: ReactNode
  let primary: ReactNode = null
  switch (step) {
    case 'parts':
      body = (
        <>
          <p className="es-intro__lead">
            {replay
              ? 'Every part this level draws, the ones you have not met first.'
              : parts.length === 1
                ? 'One part is new on this level.'
                : 'The numbers on the drawing match this list.'}
          </p>
          <PartsList
            parts={parts.map((part) => ({
              id: part.id,
              name: part.name,
              code: part.code,
              sentence: part.sentence,
              isNew: replay ? part.isNew : undefined,
            }))}
            label={`Parts of the ${title}`}
            className="es-intro__parts"
          />
        </>
      )
      primary = nextButton(walking ? 'Next part' : 'Next')
      break
    case 'look':
      body = (
        <>
          <p className="es-intro__lead">Select {look?.label ?? 'it'} and read what it holds. What you will guess is not on it: the run answers that.</p>
          {look === null ? null : (
            <Popover trigger={look.label} title={look.title} className="es-intro__look" triggerData={{ 'data-intro-look': '' }}>
              <p>{look.detail}</p>
            </Popover>
          )}
        </>
      )
      primary = nextButton('Next')
      break
    case 'ask':
      body = (
        <>
          <p className="es-intro__lead es-intro__lead--wide">
            {ask === null ? null : <>The guess below asks it in the words you just met. </>}
            {skip === 'allowed' ? 'Commit a number, or skip the guess: either one uses the chance, since the guess comes before any move.' : skip}
          </p>
        </>
      )
      break
    case 'move':
      body = <p className="es-intro__lead">{moveWords}: the control with the ring. It is a real move, the reference run&apos;s first, and it goes into your run.</p>
      primary = (
        <Button variant="plate" onClick={onAct}>
          {moveWords}
        </Button>
      )
      break
    case 'point':
      body = (
        <p className="es-intro__lead">
          <strong>{moveWords}</strong>, in the ring, is the reference run&apos;s first move. From here the level is yours.
        </p>
      )
      break
  }

  return (
    <section ref={root} className="es-intro" aria-labelledby={headingId} data-intro={step} data-intro-walk={step === 'parts' && !wide ? partAt : undefined}>
      <h3 id={headingId} className="es-intro__title" tabIndex={-1} data-intro-focus="">
        {TITLES[step]}
      </h3>
      {body}
      <div className="es-intro__actions">
        {primary}
        <button type="button" className="es-intro__skip" onClick={onEnd} data-intro-skip="">
          {step === 'point' ? 'Close the intro' : 'Skip intro'}
        </button>
      </div>
    </section>
  )
}

/**
 * Waits for the ledger and says which parts the learner met on a level they played: the intro does not name them again. Rendered only on a
 * page that has a ledger; the front page reads the flag alone.
 */
export function IntroLedger({ game, levelParts, onRead }: { game: string; levelParts: (level: string) => readonly string[]; onRead: (met: readonly string[]) => void }) {
  const played = usePlayed(game)
  const told = useRef(false)
  useEffect(() => {
    if (played === null || told.current) return
    told.current = true
    onRead([...played].flatMap((level) => levelParts(level)))
  }, [played, levelParts, onRead])
  return null
}

interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

interface Placed {
  readonly n: number
  readonly box: Box
}

/*
 * Where an element is drawn inside the frame. The frame has its own copy for the named moments (moments.ts); this chunk keeps one of its
 * own, since a value it took from the frame's modules would fold the game's chunk into this one's imports.
 */
function boxIn(host: Element, element: Element): Box {
  const outer = host.getBoundingClientRect()
  const inner = element.getBoundingClientRect()
  return { top: inner.top - outer.top, left: inner.left - outer.left, width: inner.width, height: inner.height }
}

/** The disc's size, with its paper edge [estimated from the Callout's 1.625rem disc]. */
const DISC = 30

/**
 * Where a part's disc goes: just after the part's own name, or the first line of its text, so the number reads as a mark on the word and
 * never covers it; at the box's top right where the line runs to the edge. A game leaves room after a name the intro marks (pool.css).
 */
function discAt(host: Element, target: Element, whole: Box): Box {
  // A part whose drawing starts with its own name is marked after the name; else after the first line of everything it shows.
  const range = document.createRange()
  const name = target.firstChild
  if (name !== null && name.nodeType === Node.TEXT_NODE && (name.textContent ?? '').trim() !== '') range.selectNodeContents(name)
  else range.selectNodeContents(target)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0)
  const line = rects[0]
  const outer = host.getBoundingClientRect()
  const room = outer.width - DISC - 4
  if (line !== undefined) {
    // The end of the first line: the rightmost of the pieces of text that share its top.
    const end = Math.max(...rects.filter((rect) => Math.abs(rect.top - line.top) < line.height / 2).map((rect) => rect.right))
    const left = end - outer.left + 6
    // Centred on the line, a little high, so the disc keeps clear of a line of small words under it.
    const top = line.top - outer.top + line.height / 2 - DISC / 2 - 4
    if (left <= room) return { top, left, width: DISC, height: DISC }
  }
  return { top: whole.top - DISC / 2, left: Math.min(room, whole.left + whole.width - DISC), width: DISC, height: DISC }
}

/** Runs `measure` now, and again when the frame resizes, when anything in it scrolls, and when the window does. */
function useMeasured(host: RefObject<HTMLElement | null>, measure: () => void, key: string): void {
  const latest = useRef(measure)
  useLayoutEffect(() => {
    latest.current = measure
  })
  useLayoutEffect(() => latest.current(), [key])
  useEffect(() => {
    const element = host.current
    if (element === null) return
    let frame = 0
    const again = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => latest.current())
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again)
    observer?.observe(element)
    element.addEventListener('scroll', again, true)
    window.addEventListener('scroll', again, { passive: true })
    window.addEventListener('resize', again)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      element.removeEventListener('scroll', again, true)
      window.removeEventListener('scroll', again)
      window.removeEventListener('resize', again)
    }
  }, [host])
}

/** The ink discs on the drawing, one for each part given (the frame gives at most five) that is drawn and in view. */
export function IntroCallouts({ host, parts, partAt, embedded }: { host: RefObject<HTMLElement | null>; parts: readonly KitPart[]; partAt: number; embedded: boolean }) {
  const current = useWideFrame() || embedded ? null : partAt
  const [placed, setPlaced] = useState<readonly Placed[]>([])
  const measure = () => {
    const frame = host.current
    if (frame === null) return
    const next: Placed[] = []
    parts.forEach((part, index) => {
      if (part.anchor === undefined) return
      const target = frame.querySelector(part.anchor)
      if (target === null) return
      const whole = boxIn(frame, target)
      if (whole.width === 0 && whole.height === 0) return
      const box = discAt(frame, target, whole)
      // A part scrolled out of its box is not called out over whatever lies past the box's edge.
      const clip = target.closest('.es-frame__view, .es-frame__dock-main')
      if (clip !== null) {
        const edge = boxIn(frame, clip)
        if (whole.top + 8 < edge.top || whole.top > edge.top + edge.height - 8) return
      }
      next.push({ n: index + 1, box })
    })
    setPlaced((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next))
  }
  useMeasured(host, measure, `${current}|${parts.map((part) => part.id).join(',')}`)
  return (
    <div className="es-intro-callouts" aria-hidden="true" data-intro-callouts="">
      {placed.map(({ n, box }) => (
        <span
          key={n}
          className="es-intro-callouts__at"
          data-current={current === null || current === n - 1 ? '' : undefined}
          style={
            {
              top: `${Math.max(0, box.top)}px`,
              left: `${Math.max(0, box.left)}px`,
            } as CSSProperties
          }
        >
          <Callout n={n} />
        </span>
      ))}
    </div>
  )
}
