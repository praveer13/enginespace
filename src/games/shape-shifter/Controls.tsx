import { useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { ShiftOp } from '@es/sim/tensor'
import { BLOCK_MAX } from '@es/play/shape-shifter/draw'
import { GRID_MAX } from '@es/play/shape-shifter/session'
import type { OpKind, ShiftAction } from '@es/play/shape-shifter/types'
import type { ShiftView } from '@es/play/shape-shifter/view'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Marker } from '@/design/components/Marker'
import { sameAction } from '@/games/kit/first-move'
import { LessonGuessContext } from '@/games/kit/lessonGuess'
import { changeLine } from './announce'
import { earlyKey, heldKey, KEY_SETTLE, seatInDock } from './hand'
import { Words } from './CodeWords'
import { choicesOf, picks } from './focus'
import type { ShiftMode, ShiftRun } from './types'
import { choiceLabel, opButton, orderChoice, pairChoice, shapeChoice, UNIT_WORDS } from './words'

/*
 * Tensor views' dock (GAMES.md §4.1, "Dock"): the opening guess, then the operation bar, or on `grid` the BLOCK and grid steppers and
 * Launch. HTML for every action, so a pointer, a keyboard and a screen reader reach the same things.
 *
 *   the operation bar   one 44 px button per operation the level offers, one tab stop, the arrows along it. `view`, `reshape` and
 *                       `expand` open a shape picker built from the element count's factors, `permute` an order picker, `transpose` a
 *                       picker of two dimensions; `contiguous()` applies at once. The picker opens under the bar, so the bar stays where
 *                       the hand is, and a choice applies the operation and puts focus back on its button.
 *   grid                a stepper for BLOCK and one for the grid along each dimension (BLOCK from 1 to 32; the grid starts at cdiv of
 *                       the BLOCK just set), then Launch (L). A graded run shows the readout after Launch only.
 *
 * Nothing in the dock grows above the control in hand: the guess and the bar take the same place, the picker and the moment come under
 * it, and on a phone the dock keeps one height while the run is played (shape-shifter.css).
 *
 * The first run (REDESIGN §2.6) holds the guess back until the parts have been named, then puts the amber ring on the reference run's first
 * move: its operation's button, and in its picker the choice it takes.
 */

/**
 * Whether a control wears the first run's ring: `on` while the intro points at it; `spent` once the first move is made, while the frame holds
 * the strip over it (the ring is not drawn, its room is kept); `gone` once the strip has gone (the ring and its room are gone, the marker's
 * box stays, so the control is never drawn again, which would drop the focus on it); and `off` otherwise.
 */
type Ring = 'on' | 'spent' | 'gone' | 'off'

/** The ring the intro has on a control now, the one whose room is held, and the one it had on this target. */
interface Rings {
  readonly ring: ShiftAction | null
  readonly spent: ShiftAction | null
  readonly gone: ShiftAction | null
}

/** The ring's state for the controls that `matches` picks out. */
function ringOf(rings: Rings, matches: (action: ShiftAction) => boolean): Ring {
  if (rings.ring !== null && matches(rings.ring)) return 'on'
  if (rings.spent !== null && matches(rings.spent)) return 'spent'
  return rings.gone !== null && matches(rings.gone) ? 'gone' : 'off'
}

/**
 * The control the intro points at, in the marker's ring; any other control as it is. A spent ring keeps the marker's box with nothing drawn
 * in it, so the control is not drawn again and does not move: a second press lands on it, and focus stays on it.
 */
function Ringed({ on, children }: { on: Ring | boolean; children: ReactNode }) {
  if (on === false || on === 'off') return children
  return (
    <Marker kind="ring" word="first move" className={on === true || on === 'on' ? 'es-shift-dock__ring' : `es-shift-dock__ring es-shift-dock__ring--${on}`}>
      {children}
    </Marker>
  )
}

/** One tab stop for a row of buttons, and the arrows between them (a roving tabindex). */
function useRow(count: number) {
  const [at, setAt] = useState(0)
  const stop = Math.max(0, Math.min(at, count - 1))
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-roving]:not(:disabled)'))
    const here = buttons.indexOf(event.target as HTMLButtonElement)
    if (here < 0 || event.ctrlKey || event.altKey || event.metaKey) return
    const next = { ArrowRight: here + 1, ArrowDown: here + 1, ArrowLeft: here - 1, ArrowUp: here - 1, Home: 0, End: buttons.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const to = Math.max(0, Math.min(next, buttons.length - 1))
    setAt(to)
    const target = buttons[to]
    if (target === undefined) return
    // The page stays where it is (DC-F); a box that scrolls inside the dock brings the button into its own view.
    target.focus({ preventScroll: true })
    seatInDock(target)
  }
  return { stop, onKeyDown, note: setAt }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The guess                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Guess({ run, onSkip }: { run: ShiftRun; onSkip: () => void }) {
  const { predict } = run.view
  const lesson = useContext(LessonGuessContext)
  const [text, setText] = useState('')
  const value = text.trim() === '' ? null : Number(text)
  const bad = value !== null && (!Number.isInteger(value) || value < 0)
  const titleId = useId()
  return (
    <section className="es-shift-dock__guess" aria-labelledby={titleId} data-shift-predict="">
      <h3 id={titleId} className="es-shift-dock__title">
        Your guess
      </h3>
      <p className="es-shift-dock__text">{lesson?.ask ?? <Words line={predict.ask} />}</p>
      {lesson?.sure}
      <form
        className="es-shift-dock__guess-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (value === null || bad) return
          lesson?.commit(value)
          run.dispatch({ t: 'commit', prediction: value })
        }}
      >
        {/* Commit stands beside the field, on the slip's own line, so a phone's pinned dock holds both whole. */}
        <div className="es-shift-dock__guess-line" data-shift-guess-line="">
          <Field
            label="Your guess"
            numeric
            value={text}
            inputMode="numeric"
            onChange={(event) => setText(event.target.value)}
            hint={`A whole number of ${UNIT_WORDS[predict.unit]}. The run answers it.`}
            error={bad ? 'Write a whole number, 0 or more.' : undefined}
          />
          <Button type="submit" variant="ink" className="es-shift-dock__commit" disabled={value === null || bad}>
            Commit
          </Button>
        </div>
        <div className="es-shift-dock__row">
          <Button variant="quiet" onClick={onSkip}>
            Skip the guess
          </Button>
        </div>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The operation bar                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a choice's button shows: the shape, the order or the pair it takes. */
function choiceFace(op: ShiftOp): string {
  switch (op.op) {
    case 'view':
    case 'reshape':
    case 'expand':
      return shapeChoice(op.shape)
    case 'permute':
      return orderChoice(op.order)
    case 'transpose':
      return pairChoice(op.a, op.b)
    default:
      return opButton(op.op)
  }
}

const PICKER_HEAD: Readonly<Record<OpKind, string>> = {
  view: 'View it as',
  reshape: 'Reshape it to',
  expand: 'Expand it to',
  permute: 'Put the dimensions in the order',
  transpose: 'Swap dimensions',
  contiguous: '',
  slice: '',
}

function OpBar({ run, view, rings }: { run: ShiftRun; view: ShiftView; rings: Rings }) {
  const layout = view.layout
  const offered = view.offered
  const [open, setOpen] = useState<OpKind | null>(null)
  const bar = useRow(offered.length)
  const shape = layout?.table.map((row) => row.size) ?? []
  const choices = open === null ? [] : choicesOf(open, shape)
  const pickerRow = useRow(choices.length)
  const barRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerId = useId()

  // A picker that opens takes focus to its first choice (or the ringed one), so the keyboard is where the choice is made. A key that presses
  // a choice moments after the picker opened is the key that opened it, pressed twice (earlyKey, hand.ts): it is ignored.
  const opened = useRef<OpKind | null>(null)
  const openedAt = useRef(0)
  const byKey = useRef(false)
  // Whether the open picker takes a key's press of its choices yet: `data-settled` on the picker says so, for a reader and a test.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (open === null) return
    openedAt.current = performance.now()
    const timer = window.setTimeout(() => setSettled(true), KEY_SETTLE)
    return () => window.clearTimeout(timer)
  }, [open])
  useEffect(() => {
    if (open === opened.current) return
    opened.current = open
    if (open === null) return
    const ringed = pickerRef.current?.querySelector<HTMLButtonElement>('.es-shift-dock__ring:not(.es-shift-dock__ring--spent) button[data-roving]')
    const first = ringed ?? pickerRef.current?.querySelector<HTMLButtonElement>('button[data-roving]')
    if (first === null || first === undefined) return
    first.focus({ preventScroll: true })
    // The choice in focus is seated in the picker's own room, and the bar does not move. A picker opened by a key brings that choice into
    // view on the page too, over the readout (its scroll-margin): the key's learner reads the choice before the next key presses it.
    seatInDock(first, pickerRef.current)
    if (byKey.current) first.scrollIntoView({ block: 'nearest' })
  }, [open])

  // The bar is where the next operation starts: once a choice has applied (or Escape has closed the picker), focus goes back to the button
  // that opened it, in the commit that closes the picker, so a key pressed next lands on the bar and never on a picker about to go.
  const returnTo = useRef<OpKind | null>(null)
  useEffect(() => {
    const kind = returnTo.current
    if (kind === null) return
    returnTo.current = null
    barRef.current?.querySelector<HTMLButtonElement>(`button[data-op="${kind}"]`)?.focus({ preventScroll: true })
  })

  const apply = (op: ShiftOp) => {
    returnTo.current = op.op
    setOpen(null)
    run.dispatch({ t: 'op', op })
  }

  return (
    // A key held on an operation or a choice repeats; its repeats are not presses (heldKey, hand.ts), so a held Enter applies nothing.
    <div
      className="es-shift-dock__ops"
      onKeyDownCapture={(event) => {
        if (heldKey(event)) event.preventDefault()
      }}
    >
      <div
        ref={barRef}
        role="toolbar"
        aria-label="Operations"
        aria-orientation="horizontal"
        className="es-shift-dock__bar"
        data-native-keys="arrows"
        data-shift-bar=""
        onKeyDown={bar.onKeyDown}
      >
        {offered.map((kind, at) => {
          const ringed = ringOf(rings, (action) => action.t === 'op' && action.op.op === kind)
          return (
            <Ringed key={kind} on={ringed}>
              <button
                type="button"
                className="es-shift-dock__op"
                data-roving=""
                data-op={kind}
                tabIndex={at === bar.stop ? 0 : -1}
                aria-expanded={picks(kind) ? open === kind : undefined}
                aria-controls={picks(kind) && open === kind ? pickerId : undefined}
                onFocus={() => bar.note(at)}
                onClick={(event) => {
                  byKey.current = event.detail === 0
                  if (!picks(kind)) apply({ op: 'contiguous' })
                  else {
                    setSettled(false)
                    setOpen(open === kind ? null : kind)
                  }
                }}
              >
                <code>{opButton(kind)}</code>
              </button>
            </Ringed>
          )
        })}
      </div>
      {open === null ? null : (
        <div
          ref={pickerRef}
          id={pickerId}
          role="group"
          aria-label={`${opButton(open)}: choose`}
          className="es-shift-dock__picker"
          data-native-keys="arrows"
          data-shift-picker={open}
          data-settled={settled ? '' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              returnTo.current = open
              setOpen(null)
              return
            }
            pickerRow.onKeyDown(event)
          }}
        >
          <p className="es-shift-dock__picker-head">
            <code>{opButton(open)}</code> · {PICKER_HEAD[open]}
          </p>
          <div className="es-shift-dock__choices">
            {choices.map((op, at) => (
              <Ringed key={choiceFace(op)} on={ringOf(rings, (action) => sameAction(action, { t: 'op', op } as ShiftAction))}>
                <button
                  type="button"
                  className="es-shift-dock__choice font-numeric"
                  data-roving=""
                  data-choice={choiceFace(op)}
                  tabIndex={at === pickerRow.stop ? 0 : -1}
                  aria-label={choiceLabel(op)}
                  onFocus={() => pickerRow.note(at)}
                  onClick={(event) => {
                    if (earlyKey(openedAt.current, event.timeStamp, event.detail)) return
                    apply(op)
                  }}
                >
                  {choiceFace(op)}
                </button>
              </Ringed>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The grid's steppers                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

function Stepper({ name, face, value, min, max, onSet, ringMore }: { name: string; face: ReactNode; value: number; min: number; max: number; onSet: (value: number) => void; ringMore: Ring }) {
  // The first press ends the first run, and its ring goes from round the button: the button is drawn again, and focus stays on it, so
  // a key held on "one more" keeps counting.
  const group = useRef<HTMLDivElement>(null)
  const pressed = useRef<'less' | 'more' | null>(null)
  useEffect(() => {
    const step = pressed.current
    if (step === null) return
    pressed.current = null
    const here = document.activeElement
    if (here === null || here === document.body || !here.isConnected) group.current?.querySelector<HTMLButtonElement>(`[data-step="${step}"]`)?.focus({ preventScroll: true })
  })
  const set = (step: 'less' | 'more', next: number) => {
    pressed.current = step
    onSet(next)
  }
  return (
    <div ref={group} className="es-shift-dock__stepper" role="group" aria-label={name} data-stepper={name} tabIndex={-1}>
      <span className="es-shift-dock__stepper-name" aria-hidden="true">
        {face}
      </span>
      <button type="button" className="es-shift-dock__step" data-step="less" aria-label={`${name}: one less`} disabled={value <= min} onClick={() => set('less', value - 1)}>
        <span aria-hidden="true" className="es-shift-dock__step-mark" data-sign="less" />
      </button>
      <output className="es-shift-dock__value font-numeric" aria-live="off">
        {value}
      </output>
      <Ringed on={ringMore}>
        <button type="button" className="es-shift-dock__step" data-step="more" aria-label={`${name}: one more`} disabled={value >= max} onClick={() => set('more', value + 1)}>
          <span aria-hidden="true" className="es-shift-dock__step-mark" data-sign="more" />
        </button>
      </Ringed>
    </div>
  )
}

function GridControls({ run, view, mode, rings }: { run: ShiftRun; view: ShiftView; mode: ShiftMode; rings: Rings }) {
  const grid = view.grid
  if (grid === null) return null
  const dims = grid.shape.map((_, d) => d)
  return (
    <div className="es-shift-dock__grid" data-shift-steppers="">
      {/* A table of steppers: BLOCK and the grid down the side, the dimensions across the top. Under 24rem each stands on its own row, named in full. */}
      <div className="es-shift-dock__steppers" style={{ '--es-dims': dims.length } as CSSProperties}>
        <span className="es-shift-dock__corner" aria-hidden="true" />
        {dims.map((d) => (
          <span key={`head-${d}`} className="es-shift-dock__head" aria-hidden="true">
            dimension {d}
          </span>
        ))}
        <span className="es-shift-dock__side" aria-hidden="true">
          BLOCK
        </span>
        {dims.map((d) => (
          <Stepper
            key={`block-${d}`}
            name={`BLOCK along dimension ${d}`}
            face={`BLOCK, dimension ${d}`}
            value={grid.block[d] ?? 1}
            min={1}
            max={BLOCK_MAX}
            onSet={(value) => run.dispatch({ t: 'block', dim: d, value })}
            ringMore={ringOf(rings, (action) => action.t === 'block' && action.dim === d)}
          />
        ))}
        <span className="es-shift-dock__side" aria-hidden="true">
          Grid
        </span>
        {dims.map((d) => (
          <Stepper
            key={`grid-${d}`}
            name={`Grid along dimension ${d}`}
            face={`Grid, dimension ${d}`}
            value={grid.grid[d] ?? 1}
            min={1}
            max={GRID_MAX}
            onSet={(value) => run.dispatch({ t: 'grid', dim: d, value })}
            ringMore={ringOf(rings, (action) => action.t === 'grid' && action.dim === d)}
          />
        ))}
      </div>
      <div className="es-shift-dock__row">
        <Ringed on={ringOf(rings, (action) => action.t === 'launch')}>
          <Button variant="ink" aria-keyshortcuts="L" onClick={() => run.dispatch({ t: 'launch' })} data-shift-launch-button="">
            Launch
          </Button>
        </Ringed>
        <span className="es-shift-dock__note">{mode === 'graded' && !grid.readoutsShown ? 'A graded run shows the counts after Launch.' : 'BLOCK must be a power of two.'}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The dock                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The announcement for every change of the view, once the first one has been seen. */
function useAnnouncements(run: ShiftRun): void {
  const seen = useRef<ShiftView | null>(null)
  const { view, announce } = run
  useEffect(() => {
    const before = seen.current
    seen.current = view
    if (before === null) return
    const line = changeLine(before, view)
    if (line !== '') announce(line)
  }, [view, announce])
}

export interface ControlsProps {
  run: ShiftRun
  mode: ShiftMode
}

/** Where the run stands, in one line: the target of how many, and the operations made on it. */
function whereLine(view: ShiftView): string {
  const of = view.task.of > 1 ? `${view.grid !== null ? 'Tensor' : 'Target'} ${view.task.at + 1} of ${view.task.of}` : null
  const count = view.layout !== null ? `operation ${view.layout.readouts.operations + 1}` : view.grid !== null ? 'set BLOCK and the grid, then launch' : ''
  return [of, count].filter((part) => part !== null && part !== '').join(' · ')
}

export function Controls({ run, mode }: ControlsProps) {
  const { view } = run
  const ask = run.ask
  // The guess of each target: the first one's skip is the frame's (the intro hears it); a later target's is kept here.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set())
  const at = view.task.at
  const skip = () => {
    if (at === 0) run.skipGuess()
    else run.announce('Guess skipped.')
    setSkipped(new Set([...skipped, at]))
  }
  const guessSkipped = at === 0 ? run.guessSkipped || skipped.has(0) : skipped.has(at)
  const guessing = ask?.kind === 'commit' && !guessSkipped && run.intro.askShown
  useAnnouncements(run)
  const titleId = useId()
  const body = useRef<HTMLDivElement>(null)

  // The control the ring was on keeps the ring's room, drawn empty, while the strip is held over it (it goes when the hand leaves the dock,
  // Frame.tsx), and the marker's box for the rest of its target, so the control is never drawn again under a press or a key (React's way to
  // keep state from a prop).
  const [kept, setKept] = useState<{ readonly at: number; readonly action: ShiftAction } | null>(null)
  const live = run.intro.ring ?? run.intro.spent ?? null
  if (live !== null && (kept === null || kept.at !== at || !sameAction(kept.action, live))) setKept({ at, action: live })
  const rings: Rings = { ring: run.intro.ring, spent: run.intro.spent ?? null, gone: live === null && kept?.at === at ? kept.action : null }

  // The control the intro rings is seated in the dock's room as the ring comes on: on a short pinned dock it stood in the steppers' own
  // scroll, under the readout. It runs after the frame has set the dock's new phase at its top (Frame.tsx), and scrolls the dock no
  // further than the ringed control needs.
  const ringed = JSON.stringify(run.intro.ring)
  useEffect(() => {
    const ring = body.current?.querySelector<HTMLElement>('.es-shift-dock__ring:not(.es-shift-dock__ring--spent, .es-shift-dock__ring--gone)')
    if (ring === null || ring === undefined) return
    // Where the steppers stand one under another (a phone under 24rem), BLOCK's last dimension is seated with the ringed first one, so its
    // "one more" is whole in the dock while the first-move strip is held over the ringed one, and nothing need move under the hand.
    const last = [...(body.current?.querySelectorAll<HTMLElement>('[data-stepper^="BLOCK along"]') ?? [])].at(-1)
    if (last !== undefined && !last.contains(ring)) seatInDock(last)
    seatInDock(ring)
  }, [ringed, guessing])

  // When the guess closes or a new target opens, focus goes to the bar's first control if the learner's focus was in the dock or nowhere. On
  // `grid` it goes to the first stepper's group, which presses nothing: its first control is "one more", and the key that committed the
  // guess, pressed again, would press it. Tab goes on to it.
  const key = `${at}|${guessing ? 'guess' : view.grid !== null ? 'steppers' : 'play'}`
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const here = document.activeElement
    const lost = here === null || here === document.body || !here.isConnected || ('disabled' in here && here.disabled === true)
    const dock = body.current?.closest('[data-dock]') ?? null
    if (!lost && !(dock?.contains(here) ?? false)) return
    const first = body.current?.querySelector<HTMLElement>(key.endsWith('|steppers') ? '[data-stepper]' : 'input, button[data-roving][tabindex="0"], button:not(:disabled)')
    first?.focus({ preventScroll: true })
  }, [key])

  if (run.done) return null
  return (
    <div className="es-shift-dock" data-shift-controls="" data-ask={guessing ? 'commit' : (ask?.kind ?? 'none')}>
      <section className="es-shift-dock__decision" aria-labelledby={titleId} data-ask-card="">
        <h3 id={titleId} className="es-shift-dock__title">
          {view.grid !== null ? 'Set the launch' : 'Choose an operation'}
          <span className="es-shift-dock__where">{whereLine(view)}</span>
        </h3>
        <div ref={body} className="es-shift-dock__body">
          {guessing ? <Guess key={at} run={run} onSkip={skip} /> : view.grid !== null ? <GridControls run={run} view={view} mode={mode} rings={rings} /> : <OpBar key={at} run={run} view={view} rings={rings} />}
        </div>
      </section>
    </div>
  )
}
