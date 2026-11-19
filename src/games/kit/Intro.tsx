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
 *   The coach strip, at the top of the dock: "What you are looking at", Next and Skip intro, and the parts as an ordered list, then the
 *   look, the ask and the pointed first move, each with its words. "Next" carries the amber ring while the intro leads; "Skip intro" ends it
 *   at any step. On a phone the list shows one part at a time, and Next walks it.
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

/*
 * Which of the listed parts have a disc on the drawing, per frame: the callouts write it as they place their discs, and the coach strip
 * reads it, so a row whose part has no disc (it is not drawn on this screen, or is out of view) does not wear one either. The rule is the
 * frame's: no game can claim a disc it did not draw.
 */
const drawnIn = new WeakMap<Element, string>()
const drawnWatchers = new Set<() => void>()
let drawnVersion = 0
function publishDrawn(frame: Element, drawn: string): void {
  if (drawnIn.get(frame) === drawn) return
  drawnIn.set(frame, drawn)
  drawnVersion += 1
  for (const watcher of drawnWatchers) watcher()
}
const watchDrawn = (change: () => void) => {
  drawnWatchers.add(change)
  return () => void drawnWatchers.delete(change)
}

export interface IntroCoachProps {
  title: string
  step: IntroStep
  parts: readonly KitPart[]
  replay: boolean
  look: KitLook | null
  /** The session's first ask, in its own words. */
  ask: ReactNode
  /** The ask step's own words, where the ask is not a guess. */
  askLead?: ReactNode
  /** Whether the session lets the learner skip its ask, and if not, why. */
  skip: 'allowed' | string
  moveWords: string
  /** What the pointed move is, where it is not the reference run's first move (a game whose reference moves are the answers): "a first move that gives no answer away". */
  moveKind?: string
  /** Inside a lesson. The list is shown whole on a wide screen and walked one part at a time on a phone, as on the game's page. */
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
export function IntroCoach({ title, step, parts, replay, look, ask, askLead, skip, moveWords, moveKind, partAt, onPartAt, onNext, onEnd, onAct }: IntroCoachProps) {
  const wide = useWideFrame()
  const headingId = useId()
  const root = useRef<HTMLElement>(null)
  const walking = step === 'parts' && !wide && partAt < parts.length - 1

  // Next moved the learner on: the step's heading takes focus, so a keyboard and a screen reader start reading the new step at its top. At
  // the ask, focus goes on to the ask's own field under the strip, in view. On a phone's walk through the parts, Next stays in hand: the
  // strip's title is said to a reader only there, so focus on it would be a ring nobody sees, and Enter would walk no further. The list says
  // each part it shows, as a carousel's slides do (a polite live region).
  const pressed = useRef<'walk' | 'step' | null>(null)
  useEffect(() => {
    const how = pressed.current
    pressed.current = null
    if (how !== 'step') return
    const field = step === 'ask' ? root.current?.parentElement?.querySelector<HTMLElement>('input:not(:disabled), textarea, select') : null
    if (field !== null && field !== undefined) {
      field.focus({ preventScroll: true })
      field.scrollIntoView({ block: 'nearest' })
      return
    }
    root.current?.querySelector<HTMLElement>('[data-intro-focus]')?.focus({ preventScroll: true })
  }, [step, partAt])

  const next = () => {
    pressed.current = walking ? 'walk' : 'step'
    if (walking) onPartAt(partAt + 1)
    else onNext()
  }

  // A row keeps its disc only where the drawing has one with its number.
  const drawnTick = useSyncExternalStore(
    watchDrawn,
    () => drawnVersion,
    () => 0,
  )
  useLayoutEffect(() => {
    const frame = root.current?.closest('[data-game]')
    const drawn = frame === null || frame === undefined ? undefined : drawnIn.get(frame)
    if (drawn === undefined) return
    const at = new Set(drawn.split(','))
    root.current?.querySelectorAll('.es-intro__parts > .es-parts__item').forEach((row, index) => row.toggleAttribute('data-undrawn', !at.has(String(index))))
  }, [drawnTick, step, parts])

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
          {replay || parts.length === 1 ? <p className="es-intro__lead">{replay ? 'Every part this level draws, the ones you have not met first.' : 'One part is new on this level.'}</p> : null}
          <div aria-live={wide ? undefined : 'polite'}>
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
          </div>
        </>
      )
      primary = nextButton('Next')
      break
    case 'look':
      body = (
        <>
          <p className="es-intro__lead">
            {look?.lead ?? <>Select {look?.label ?? 'it'} and read what it holds. What you will guess is not on it: the run answers that.</>}
          </p>
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
            {askLead !== undefined ? (
              askLead
            ) : (
              <>
                {ask === null ? null : <>The guess below asks it in the words you just met. </>}
                {skip === 'allowed' ? 'Commit a number, or skip the guess: either one uses the chance, since the guess comes before any move.' : skip}
              </>
            )}
          </p>
        </>
      )
      break
    case 'move':
      body = <p className="es-intro__lead">{moveWords}: the control with the ring. It is a real move, {moveKind ?? 'the reference run’s first'}, and it goes into your run.</p>
      primary = (
        <Button variant="plate" onClick={onAct}>
          {moveWords}
        </Button>
      )
      break
    case 'point':
      // A level whose reference is its answer (the graded map of a request's path) points at nothing.
      body =
        moveWords === '' ? (
          <p className="es-intro__lead">Nothing is pointed at on this level: finding the first move is part of it. From here the level is yours.</p>
        ) : (
          <p className="es-intro__lead">
            <strong>{moveWords}</strong>, in the ring, is {moveKind === undefined ? 'the reference run’s first move' : moveKind}. From here the level is yours.
          </p>
        )
      break
  }

  return (
    <section ref={root} className="es-intro" aria-labelledby={headingId} data-intro={step} data-intro-walk={step === 'parts' && !wide ? partAt : undefined}>
      <h3 id={headingId} className="es-intro__title" tabIndex={-1} data-intro-focus="">
        {TITLES[step]}
      </h3>
      {/* Next and Skip intro stand under the step's title, before what it lists, so a long list never runs under them. */}
      <div className="es-intro__actions">
        {primary}
        <button type="button" className="es-intro__skip" onClick={onEnd} data-intro-skip="">
          {step === 'point' ? 'Close the intro' : 'Skip intro'}
        </button>
      </div>
      {body}
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
 * Where a part's disc goes. A number in the readout keeps its digits clear: the disc stands over the middle of its item, in the strip's head
 * room, never over the item beside it. A bar or a page of the pool is marked inside its own top. At a desk a part drawn on the diagram is marked in the diagram's own gutter at its left, level with
 * the part, as the front page marks its lanes: a disc never covers a word, a glyph or a mark of the drawing. Elsewhere (a phone, which calls
 * out one part at a time, or a part in the dock) the disc goes just after the part's own name, or the first line of its text; at the box's
 * top right where the line runs to the edge.
 */
function discAt(host: Element, target: Element, whole: Box, wide: boolean): Box {
  const item = target.closest('.es-frame__readout [data-readout-id], [data-callout-above]')
  if (item !== null) {
    const at = boxIn(host, item)
    return { top: at.top - DISC + 2, left: at.left + at.width / 2 - DISC / 2, width: DISC, height: DISC }
  }
  // A bar is marked inside its own top, under the count printed over it.
  const bar = target.closest('[data-callout-in], .es-pool__cell')
  if (bar !== null) {
    const at = boxIn(host, bar)
    return { top: at.top + 3, left: at.left + at.width / 2 - DISC / 2, width: DISC, height: DISC }
  }
  // A drawing whose parts keep room after their names (Broken benchmark's board) is marked there, beside each part, and not in the gutter.
  const surface = wide && target.closest('[data-callout-after]') === null ? target.closest('.es-frame__surface') : null
  if (surface !== null) {
    const gutter = boxIn(host, surface)
    return { top: whole.top + Math.min(whole.height, DISC) / 2 - DISC / 2, left: gutter.left + 1, width: DISC, height: DISC }
  }
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

/** Discs that share the gutter keep a gap between them: one that would overlap the disc above it moves down past it. */
function spread(placed: readonly Placed[]): Placed[] {
  const out: Placed[] = []
  for (const disc of [...placed].sort((a, b) => a.box.top - b.box.top)) {
    const above = [...out].reverse().find((other) => Math.abs(other.box.left - disc.box.left) < DISC && disc.box.top < other.box.top + DISC + 2)
    out.push(above === undefined ? disc : { n: disc.n, box: { ...disc.box, top: above.box.top + DISC + 2 } })
  }
  return out.sort((a, b) => a.n - b.n)
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
export function IntroCallouts({ host, parts, partAt }: { host: RefObject<HTMLElement | null>; parts: readonly KitPart[]; partAt: number; embedded: boolean }) {
  const wide = useWideFrame()
  const current = wide ? null : partAt
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
      const box = discAt(frame, target, whole, wide)
      // A part scrolled out of its box is not called out over whatever lies past the box's edge.
      const clip = target.closest('.es-frame__view, .es-frame__dock-main')
      if (clip !== null) {
        const edge = boxIn(frame, clip)
        if (whole.top + 8 < edge.top || whole.top > edge.top + edge.height - 8) return
      }
      next.push({ n: index + 1, box })
    })
    const spaced = spread(next)
    setPlaced((now) => (JSON.stringify(now) === JSON.stringify(spaced) ? now : spaced))
    publishDrawn(frame, spaced.map((disc) => disc.n - 1).join(','))
  }
  useMeasured(host, measure, `${current}|${parts.map((part) => part.id).join(',')}`)

  // On a phone, Next brings the part it names into view where the page has left it off the screen (a lesson's Run, scrolled by the
  // learner): the part is whole in view while its words are read under it.
  const named = useRef(current)
  useEffect(() => {
    if (named.current === current) return
    named.current = current
    const anchor = current === null ? undefined : parts[current]?.anchor
    const target = anchor === undefined ? null : host.current?.querySelector(anchor)
    if (target === null || target === undefined) return
    const box = target.getBoundingClientRect()
    if (box.top < 0 || box.bottom > window.innerHeight) target.scrollIntoView({ block: 'nearest' })
  }, [current, parts, host])
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
