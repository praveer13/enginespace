import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Glyph } from '@/design/components/Glyph'
import { Marker } from '@/design/components/Marker'
import { sameAction } from '@/games/kit/first-move'
import { LessonGuessContext } from '@/games/kit/lessonGuess'
import type { AskView, PoolAction, PoolView, TicketView } from '@es/play/pool/types'
import { changeLine } from './announce'
import type { Dump } from './dump'
import { stateGlyph, unitWord } from './glyphs'
import type { PoolMode, PoolRun } from './types'
import { useRoving } from './useRoving'
import { pagesWord, reqName, stepsWord, tokensWord } from './words'

/*
 * KV page pool's dock (REDESIGN §2.6, GAMES.md §8 "Controls"): the guess slot, then the current decision. HTML for every action, so a
 * pointer, a keyboard and a screen reader all reach the same things:
 *   admit     the waiting requests, as buttons that admit them, and "Admit none this step" (W);
 *   evict     the cached pages in the free queue's order, as toggles. The free queue's next pages are chosen to begin with, as the engine
 *             would evict them; the learner changes what they disagree with, and confirms (D);
 *   preempt   the running requests, as buttons that preempt them;
 *   load      the LoRA adapters that waiting requests need, as buttons that load them, and "Load none yet" (W).
 * Each list is one tab stop, and the arrows move along it (a roving tabindex). When an action opens the next decision, focus goes to its
 * list, so a keyboard never loses its place. A new decision is announced in the dock and in the live region. In practice each eviction
 * shows its cost before it is chosen; in a graded run it does not, and the dock says so (ASSESSMENT §4.3).
 *
 * Before the guess is answered, a waiting request's row shows its tokens and its prefix hit, and not its page count, which is the answer.
 *
 * The first run (REDESIGN §2.6) holds the guess back until the parts have been named and the first request looked at, and then puts the
 * amber ring on the reference run's first move. Skipping the guess dispatches nothing: the frame keeps it, so the intro hears it.
 */

/** The control the intro points at, in the marker's ring; any other control as it is. */
function Ringed({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return children
  return (
    <Marker kind="ring" word="first move" className="es-dock__ring">
      {children}
    </Marker>
  )
}

const ringOn = (run: PoolRun, action: PoolAction) => sameAction(run.intro.ring, action)

interface AskProps {
  run: PoolRun
  dump: Dump
  mode: PoolMode
  /** The pages a row is pointing at, for the diagram to ring. */
  onPoint: (pages: readonly number[]) => void
  /** The guess is still open: rows hold back what would answer it. */
  guessing: boolean
}

const num = (value: number) => <span className="font-numeric">{value}</span>

/** The pages a waiting request's prefix hit starts from: what the diagram rings when the request is pointed at. */
const hitPages = (view: PoolView, id: number): number[] => view.pans.filter((page) => page.spokenFor.includes(id) || page.holders.includes(id)).map((page) => page.id)

const convo = (ticket: TicketView) => `conversation ${ticket.letter}, turn ${ticket.turn + 1} of ${ticket.turns}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* The guess                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function Guess({ run, onSkip }: { run: PoolRun; onSkip: () => void }) {
  const { predict } = run.view
  // In a lesson whose guess asks this level's question, the lesson's words stand in, and its commit keeps the prediction (one prompt).
  const lesson = useContext(LessonGuessContext)
  const [text, setText] = useState('')
  const value = text.trim() === '' ? null : Number(text)
  const bad = value !== null && (!Number.isInteger(value) || value < 0)
  const titleId = useId()
  return (
    <section className="es-dock__guess" aria-labelledby={titleId} data-pool-predict="">
      <h3 id={titleId} className="es-dock__title">
        Your guess
      </h3>
      <p className="es-dock__text">{lesson?.ask ?? predict.ask}</p>
      {lesson?.sure}
      <form
        className="es-dock__guess-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (value === null || bad) return
          lesson?.commit(value)
          run.dispatch({ t: 'commit', prediction: value })
        }}
      >
        <Field
          label="Your guess"
          numeric
          value={text}
          inputMode="numeric"
          onChange={(event) => setText(event.target.value)}
          hint={`A whole number of ${unitWord(predict.unit)}. The run answers it.`}
          error={bad ? 'Write a whole number, 0 or more.' : undefined}
        />
        <div className="es-dock__row">
          <Button type="submit" variant="ink" disabled={value === null || bad}>
            Commit
          </Button>
          <Button variant="quiet" onClick={onSkip}>
            Skip the guess
          </Button>
        </div>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The decisions                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

function AdmitAsk({ run, mode, onPoint, guessing }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'admit' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  const graded = mode === 'graded'
  return (
    <>
      <p className="es-dock__text es-dock__text--wide">Admit one waiting request, or none this step. An admitted request pins the cached pages its prefix hit reuses.</p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-dock__list" data-ask-list="admit">
        {view.waiting.map((id) => {
          const ticket = view.tickets[id]
          const at = ask.candidates.indexOf(id)
          const can = at >= 0
          const why = ticket.kitReady === false ? 'its adapter has not loaded' : ticket.fits === false ? 'its pages do not fit yet' : null
          return (
            <li key={id}>
              <Ringed on={ringOn(run, { t: 'admit', req: id })}>
                <button
                  type="button"
                  className="es-dock__option"
                  data-roving=""
                  disabled={!can}
                  tabIndex={can && at === stop ? 0 : -1}
                  aria-label={`Admit request ${id + 1}, ${convo(ticket)}${why === null ? '' : `, ${why}`}`}
                  onClick={() => run.dispatch({ t: 'admit', req: id })}
                  onFocus={() => {
                    note(Math.max(at, 0))
                    onPoint(hitPages(view, id))
                  }}
                  onBlur={() => onPoint([])}
                  onPointerEnter={() => onPoint(hitPages(view, id))}
                  onPointerLeave={() => onPoint([])}
                >
                  <span className="es-dock__option-name">
                    Admit <strong>{reqName(id)}</strong>
                  </span>
                  <span className="es-dock__option-meta">
                    conversation {ticket.letter} · {num(ticket.tokens)} {tokensWord(ticket.tokens)}
                    {graded ? null : (
                      <>
                        {' '}
                        · prefix hit {num(ticket.hit)}
                      </>
                    )}
                    {graded || guessing || ticket.fresh === null ? null : (
                      <>
                        {' '}
                        · {num(ticket.fresh)} new {pagesWord(ticket.fresh)}
                      </>
                    )}
                  </span>
                  {why === null ? null : <span className="es-dock__option-why">{why}</span>}
                </button>
              </Ringed>
            </li>
          )
        })}
      </ul>
      <div className="es-dock__row">
        <Ringed on={ringOn(run, { t: 'admit', req: null })}>
          <Button variant="quiet" aria-keyshortcuts="W" onClick={() => run.dispatch({ t: 'admit', req: null })}>
            Admit none this step
          </Button>
        </Ringed>
      </div>
    </>
  )
}

function EvictAsk({ run, dump, mode, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'evict' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  const graded = mode === 'graded'
  const target = ask.for === 'admit' ? `to make room for ${reqName(ask.target)}` : `to make room for adapter ${ask.target + 1}, whose pages come out of the same pool`
  return (
    <>
      <p className="es-dock__text">
        Choose <strong>{ask.need}</strong> cached {pagesWord(ask.need)} to evict {target}. The free queue&apos;s next are chosen, as the engine would evict them. A prefix hit counts only
        as far as every KV group still holds its pages, so change what you disagree with.
      </p>
      <p className="es-dock__note" data-pool-costs={graded ? 'hidden' : 'shown'}>
        {graded ? 'A graded run shows no costs: read them off the diagram.' : 'Each page shows the tokens that evicting it costs.'}
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-dock__list" data-ask-list="evict">
        {ask.candidates.map((page, rank) => {
          const cell = view.pans[page]
          const picked = dump.isPicked(page)
          const group = cell.station === null ? null : view.stations[cell.station]
          const waiting = ask.spoken[rank]
          const seated = ask.seated[rank]
          const reqs = (ids: readonly number[]) => ids.map((id) => reqName(id)).join(', ')
          return (
            <li key={page}>
              <button
                type="button"
                className="es-dock__option"
                data-pick-row=""
                data-roving=""
                data-picked={picked || undefined}
                aria-pressed={picked}
                tabIndex={rank === stop ? 0 : -1}
                onClick={() => dump.toggle(page)}
                onFocus={() => {
                  note(rank)
                  onPoint([page])
                }}
                onBlur={() => onPoint([])}
                onPointerEnter={() => onPoint([page])}
                onPointerLeave={() => onPoint([])}
              >
                <span className="es-dock__option-name">
                  <Glyph shape={stateGlyph(picked ? 'evicted' : cell.state)} className="es-dock__mark" data-state={picked ? 'evicted' : cell.state} />
                  <span>page {page + 1}</span>
                  {cell.tape === null ? null : <span className="es-dock__label">{cell.tape}</span>}
                </span>
                <span className="es-dock__option-meta">
                  {group === null ? null : <>group {group.id}</>}
                  {graded ? null : waiting.length > 0 ? (
                    <span data-cost="waiting">
                      {' '}
                      · {reqs(waiting)} waits on it: costs {num(ask.price[rank])} {tokensWord(ask.price[rank])}
                    </span>
                  ) : seated.length > 0 ? (
                    <span data-cost="soon">
                      {' '}
                      · conversation {[...new Set(seated.map((id) => view.tickets[id].letter))].join(', ')} returns: would cost {num(ask.soon[rank])} {tokensWord(ask.soon[rank])}
                    </span>
                  ) : (
                    <span data-cost="free"> · costs nothing now</span>
                  )}
                </span>
                <span className="sr-only">{picked ? ', chosen to evict' : ', kept'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="es-dock__row">
        <span className="es-dock__count" role="status">
          Chosen {num(dump.pages.length)} of {num(ask.need)} {pagesWord(ask.need)}
        </span>
        <Button variant="quiet" onClick={dump.reset}>
          The free queue&apos;s next
        </Button>
      </div>
      <Button
        variant="ink"
        className="es-dock__go"
        disabled={!dump.ready}
        aria-keyshortcuts="D"
        onClick={() => {
          if (dump.ready) run.dispatch({ t: 'evict', pages: [...dump.pages].sort((a, b) => a - b) })
        }}
      >
        {`Evict ${ask.need} ${pagesWord(ask.need)}`}
      </Button>
    </>
  )
}

function PreemptAsk({ run, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'preempt' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  return (
    <>
      <p className="es-dock__text">
        {reqName(ask.stalled)} cannot grow: the free queue has no page left to give it. Preempt a running request, and its pages go back to the free queue. It is admitted
        again later, and what the pool no longer holds of it is recomputed.
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-dock__list" data-ask-list="preempt">
        {ask.candidates.map((id, at) => {
          const ticket = view.tickets[id]
          return (
            <li key={id}>
              <button
                type="button"
                className="es-dock__option"
                data-roving=""
                tabIndex={at === stop ? 0 : -1}
                aria-label={`Preempt request ${id + 1}, ${convo(ticket)}${id === ask.stalled ? ', the one that cannot grow' : ''}`}
                onClick={() => run.dispatch({ t: 'preempt', req: id })}
                onFocus={() => {
                  note(at)
                  onPoint(hitPages(view, id))
                }}
                onBlur={() => onPoint([])}
              >
                <span className="es-dock__option-name">
                  Preempt <strong>{reqName(id)}</strong>
                </span>
                <span className="es-dock__option-meta">
                  conversation {ticket.letter} · {num(ticket.tokens)} {tokensWord(ticket.tokens)} held{id === ask.stalled ? ' · cannot grow' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function PrefetchAsk({ run }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'prefetch' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  return (
    <>
      <p className="es-dock__text">
        A waiting request needs a LoRA adapter that is not loaded. Load it now, while the batch runs, and it lands in a few steps, taking its pages from the same pool. Or load none
        yet.
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-dock__list" data-ask-list="prefetch">
        {ask.candidates.map((id, at) => {
          const kit = view.kits[id]
          return (
            <li key={id}>
              <button
                type="button"
                className="es-dock__option"
                data-roving=""
                tabIndex={at === stop ? 0 : -1}
                aria-label={`Load adapter ${kit.id + 1}, rank ${kit.rank}`}
                onClick={() => run.dispatch({ t: 'prefetch', adapter: id })}
                onFocus={() => note(at)}
              >
                <span className="es-dock__option-name">
                  Load <strong>adapter {kit.id + 1}</strong>
                </span>
                <span className="es-dock__option-meta">
                  rank {kit.rank} · {num(kit.pages)} {pagesWord(kit.pages)} · {num(kit.loadSteps)} {stepsWord(kit.loadSteps)} to load · for {kit.wanted.map((t) => reqName(t)).join(', ')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="es-dock__row">
        <Button variant="quiet" aria-keyshortcuts="W" onClick={() => run.dispatch({ t: 'prefetch', adapter: null })}>
          Load none yet
        </Button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The open decision                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const HEADLINES = {
  admit: 'Admit a request',
  evict: 'New decision: the pool is full',
  preempt: 'New decision: the batch cannot grow',
  prefetch: 'New decision: load an adapter',
} as const

/** A key for the open decision, which changes whenever a new one opens, or the guess closes, so that focus can follow it. */
function askKey(view: PoolView, guessing: boolean): string {
  const ask = view.ask
  const predicting = guessing ? 'guess' : 'play'
  if (ask === null) return `none:${predicting}`
  const target = ask.kind === 'evict' ? `${ask.for}${ask.target}` : ask.kind === 'preempt' ? `${ask.stalled}` : ''
  return `${view.step}:${ask.kind}:${target}:${ask.candidates.length}:${predicting}`
}

/** The announcement for every change of the view, once the first one has been seen. */
function useAnnouncements(run: PoolRun): void {
  const seen = useRef<PoolView | null>(null)
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
  run: PoolRun
  dump: Dump
  mode: PoolMode
  onPoint: (pages: readonly number[]) => void
}

export function Controls({ run, dump, mode, onPoint }: ControlsProps) {
  const { view } = run
  const ask = view.ask
  const body = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // The guess holds the page counts back while it is open, and shows once the intro has named the parts.
  const guessing = view.predict.open && !run.guessSkipped
  useAnnouncements(run)
  // When a new decision opens, focus goes to its first control if the learner's focus was in the dock or had nowhere to be. A pointer user
  // who is somewhere else on the page is not pulled away.
  const key = askKey(view, guessing)
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const here = document.activeElement
    const lost = here === null || here === document.body || !here.isConnected || ('disabled' in here && here.disabled === true)
    const dock = body.current?.closest('[data-dock]') ?? null
    if (!lost && !(dock?.contains(here) ?? false)) return
    const first = body.current?.querySelector<HTMLElement>('button[data-roving]:not(:disabled), button:not(:disabled)')
    first?.focus({ preventScroll: true })
    body.current?.closest<HTMLElement>('[data-ask-card]')?.scrollIntoView({ block: 'nearest' })
  }, [key])

  if (run.done) return null
  let content: ReactNode = null
  if (ask !== null) {
    const props: AskProps = { run, dump, mode, onPoint, guessing }
    content =
      ask.kind === 'admit' ? <AdmitAsk {...props} /> : ask.kind === 'evict' ? <EvictAsk {...props} /> : ask.kind === 'preempt' ? <PreemptAsk {...props} /> : <PrefetchAsk {...props} />
  }
  return (
    <div className="es-dock" data-pool-controls="" data-ask={ask === null ? 'none' : ask.kind}>
      {guessing && run.intro.askShown ? <Guess run={run} onSkip={run.skipGuess} /> : null}
      <section className="es-dock__decision" aria-labelledby={titleId} data-ask-card="" data-new={ask !== null && ask.kind !== 'admit' ? '' : undefined}>
        <h3 id={titleId} className="es-dock__title">
          {ask === null ? 'Nothing to decide this step' : HEADLINES[ask.kind]}
        </h3>
        <div ref={body} className="es-dock__body">
          {content}
        </div>
      </section>
    </div>
  )
}
