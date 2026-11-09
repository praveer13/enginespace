import { useEffect, useRef, useState, type ReactNode } from 'react'
import { changeLine } from './announce'
import { Button } from '@/design/components/Button'
import { Field } from '@/design/components/Field'
import { Glyph } from '@/design/components/Glyph'
import { Pan } from '@/design/components/Pan'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { formatReadout } from '@/design/format'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import type { AskView, PoolView } from '@es/play/pool/types'
import { stationGlyph, unitWord } from './glyphs'
import { pansWord, stepsWord } from './words'
import type { PoolMode, PoolRun } from './types'
import type { Dump } from './dump'
import { useRoving } from './useRoving'

/*
 * The Reach-In's controls (GAMES.md §8 "Controls", §2.6): HTML for every action, so a pointer, a keyboard and a screen reader all reach
 * the same things. The open ask is a ticket under the heat lamp, and its list is the way to act on it:
 *   admit     the waiting tickets, as buttons that hang them, and a plate to hang none ("W");
 *   evict     the cached pans in the rotation's order, as buttons that choose them. The rotation's next pans are chosen to begin with, as
 *             the engine would dump them; the learner changes what they disagree with, and the stub confirms ("D");
 *   preempt   the tickets on the line, as buttons that pull them;
 *   prefetch  the kits that waiting tickets need, as buttons that bring them in, and a plate for none yet ("W").
 * Each list is one tab stop, and the arrows move along it (a roving tabindex). When an action opens the next ask, focus goes to that ask's
 * list, so that a keyboard never loses its place. In a graded level the price of a dump and the shared mise a ticket would find are not
 * printed in the lists: the drawing still shows the rulers, and the learner reads them (ASSESSMENT §4.3).
 */

interface AskProps {
  run: PoolRun
  dump: Dump
  mode: PoolMode
  /** The pans a row or a ticket is pointing at, for the drawing to ring. */
  onPoint: (pages: readonly number[]) => void
}

/** A count in the printer's dots. The lists say once that every count is the synthetic world's, and a row does not repeat it. */
const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

/** The pans a waiting ticket's hit starts from: what the rack rings when the ticket is pointed at. */
const hitPages = (view: PoolView, id: number): number[] => view.pans.filter((pan) => pan.spokenFor.includes(id) || pan.holders.includes(id)).map((pan) => pan.id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The prediction                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function Predict({ run }: { run: PoolRun }) {
  const { predict } = run.view
  const [text, setText] = useState('')
  const value = text.trim() === '' ? null : Number(text)
  const bad = value !== null && (!Number.isInteger(value) || value < 0)
  return (
    <Ticket as="section" width="full" hole={false} titleAs="h3" title="Say it first." data-pool-predict="">
      <p>{predict.ask}</p>
      <Field
        label="Your answer"
        numeric
        value={text}
        inputMode="numeric"
        onChange={(event) => setText(event.target.value)}
        hint={`A whole number of ${unitWord(predict.unit)}. You can skip this and play.`}
        error={bad ? 'Write a whole number of at least 0.' : undefined}
      />
      <div className="es-ask__row">
        <Stub
          disabled={value === null || bad}
          onClick={() => {
            if (value !== null && !bad) run.dispatch({ t: 'commit', prediction: value })
          }}
        >
          Commit
        </Stub>
      </div>
    </Ticket>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The asks                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

function AdmitAsk({ run, mode, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'admit' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  const graded = mode === 'graded'
  return (
    <>
      <p>Pick the ticket to hang (admit), or hang none this step. A ticket that is hung pins the pans it starts from.</p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-ask__list" data-ask-list="admit">
        {view.waiting.map((id) => {
          const ticket = view.tickets[id]
          const at = ask.candidates.indexOf(id)
          const can = at >= 0
          const why = ticket.kitReady === false ? 'its kit has not landed' : ticket.fits === false ? 'its pans do not fit yet' : null
          return (
            <li key={id} className="es-ask__item">
              <Ticket
                as="button"
                compact
                hole={false}
                width="full"
                state={can ? 'default' : 'disabled'}
                head={`No. ${ticket.no}`}
                meta={`table ${ticket.letter}`}
                data-roving=""
                tabIndex={can && at === stop ? 0 : -1}
                aria-label={`Hang ticket No. ${ticket.no}, table ${ticket.letter}${why === null ? '' : `, ${why}`}`}
                onClick={() => run.dispatch({ t: 'admit', req: id })}
                onFocus={() => {
                  note(Math.max(at, 0))
                  onPoint(hitPages(view, id))
                }}
                onBlur={() => onPoint([])}
              >
                <TicketLine>hang</TicketLine>
                {graded ? null : <TicketLine note={<>{num(ticket.hit)} tokens</>}>shared mise</TicketLine>}
                {graded || ticket.fresh === null ? null : <TicketLine note={<>{num(ticket.fresh)} {pansWord(ticket.fresh)}</>}>to take</TicketLine>}
                {why === null ? null : <TicketLine tone="ink-2">{why}</TicketLine>}
              </Ticket>
            </li>
          )
        })}
      </ul>
      <div className="es-ask__row">
        <Button variant="plate" aria-keyshortcuts="W" onClick={() => run.dispatch({ t: 'admit', req: null })}>
          Hang none
        </Button>
        {graded ? null : <span className="es-ask__unit">Counts are tokens and pans of the synthetic world.</span>}
      </div>
    </>
  )
}

function EvictAsk({ run, dump, mode, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'evict' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  const graded = mode === 'graded'
  const target =
    ask.for === 'admit' ? `room for ticket No. ${view.tickets[ask.target].no}` : `room for kit ${ask.target + 1}, whose pans come out of the same reach-in`
  return (
    <>
      <p>
        Dump <strong>{ask.need}</strong> cached {pansWord(ask.need)} to make {target} (evict). The rotation&apos;s next {pansWord(ask.need)} are chosen, as the engine would dump
        them. A ticket hits only as far as every station still holds its pans, so change what you disagree with.
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-ask__list es-ask__list--pans" data-ask-list="evict">
        {ask.candidates.map((page, rank) => {
          const pan = view.pans[page]
          const picked = dump.isPicked(page)
          const station = pan.station === null ? null : view.stations[pan.station]
          const waiting = ask.spoken[rank]
          const seated = ask.seated[rank]
          const tell = (ids: readonly number[]) => ids.map((id) => `No. ${view.tickets[id].no}`).join(', ')
          return (
            <li key={page} className="es-ask__item">
              <button
                type="button"
                className="es-pick"
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
              >
                <span className="es-pick__rank font-numeric">{String(rank + 1).padStart(2, '0')}</span>
                <Pan state={picked ? 'evicted' : pan.state} name={`pan ${page + 1}`} size="sm" />
                <TapeLabel size="sm" tilt="none">
                  {pan.tape ?? `pan ${page + 1}`}
                </TapeLabel>
                {station === null ? null : (
                  <span className="es-pick__station">
                    <Glyph shape={stationGlyph(station)} className="es-pick__glyph" />
                    <span>{station.id}</span>
                  </span>
                )}
                {graded ? null : waiting.length > 0 ? (
                  <span className="es-pick__tag" data-tone="waiting">
                    {`waiting: ${tell(waiting)}, loses `}
                    {num(ask.price[rank])} tokens
                  </span>
                ) : seated.length > 0 ? (
                  <span className="es-pick__tag" data-tone="seated">
                    {`seated: table ${[...new Set(seated.map((id) => view.tickets[id].letter))].join(', ')}, would lose `}
                    {num(ask.soon[rank])} tokens
                  </span>
                ) : (
                  <span className="es-pick__tag" data-tone="free">
                    nobody waits on it
                  </span>
                )}
                <span className="sr-only">{picked ? 'chosen to dump' : 'not chosen'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="es-ask__row">
        <span className="es-ask__count" role="status">
          Chosen {num(dump.pages.length)} of {num(ask.need)} {pansWord(ask.need)}
        </span>
        <Button variant="quiet" size="sm" onClick={dump.reset}>
          The rotation&apos;s next
        </Button>
      </div>
      <Stub
        disabled={!dump.ready}
        onClick={() => {
          if (dump.ready) run.dispatch({ t: 'evict', pages: [...dump.pages].sort((a, b) => a - b) })
        }}
      >
        {`Dump the ${ask.need} ${pansWord(ask.need)}`}
      </Stub>
    </>
  )
}

function PreemptAsk({ run, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask as Extract<AskView, { kind: 'preempt' }>
  const { list, stop, onKeyDown, note } = useRoving(ask.candidates.length)
  return (
    <>
      <p>
        Ticket No. {view.tickets[ask.stalled].no} cannot grow: the rotation has no pan left to give it. Pull a ticket from the line (preempt), and its pans go back to the rotation.
        It hangs again later, and what the rotation no longer holds of it is prepped again.
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-ask__list" data-ask-list="preempt">
        {ask.candidates.map((id, at) => {
          const ticket = view.tickets[id]
          return (
            <li key={id} className="es-ask__item">
              <Ticket
                as="button"
                compact
                hole={false}
                width="full"
                head={`No. ${ticket.no}`}
                meta={`table ${ticket.letter}`}
                data-roving=""
                tabIndex={at === stop ? 0 : -1}
                aria-label={`Pull ticket No. ${ticket.no}, table ${ticket.letter}${id === ask.stalled ? ', the one that cannot grow' : ''}`}
                onClick={() => run.dispatch({ t: 'preempt', req: id })}
                onFocus={() => {
                  note(at)
                  onPoint(hitPages(view, id))
                }}
                onBlur={() => onPoint([])}
              >
                <TicketLine>pull</TicketLine>
                <TicketLine note={<>{num(ticket.tokens)} tokens</>}>in the order</TicketLine>
                {id === ask.stalled ? <TicketLine tone="ink-2">cannot grow</TicketLine> : null}
              </Ticket>
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
      <p>
        A ticket in the waiting line needs a recipe kit that is not in the reach-in. Bring a kit in (prefetch) while the line is busy, and it lands in a few steps, taking its pans
        from the same pool. Or bring none yet.
      </p>
      <ul ref={list} onKeyDown={onKeyDown} data-native-keys="arrows" className="es-ask__list" data-ask-list="prefetch">
        {ask.candidates.map((id, at) => {
          const kit = view.kits[id]
          return (
            <li key={id} className="es-ask__item">
              <Ticket
                as="button"
                compact
                hole={false}
                width="full"
                head={`Kit ${kit.id + 1}`}
                meta={`rank ${kit.rank}`}
                data-roving=""
                tabIndex={at === stop ? 0 : -1}
                aria-label={`Bring kit ${kit.id + 1} in, rank ${kit.rank}`}
                onClick={() => run.dispatch({ t: 'prefetch', adapter: id })}
                onFocus={() => note(at)}
              >
                <TicketLine note={<>{num(kit.pages)} {pansWord(kit.pages)}</>}>takes</TicketLine>
                <TicketLine note={<>{num(kit.loadSteps)} {stepsWord(kit.loadSteps)}</>}>to land</TicketLine>
                <TicketLine>{`for ${kit.wanted.map((t) => `No. ${view.tickets[t].no}`).join(', ')}`}</TicketLine>
              </Ticket>
            </li>
          )
        })}
      </ul>
      <div className="es-ask__row">
        <Button variant="plate" aria-keyshortcuts="W" onClick={() => run.dispatch({ t: 'prefetch', adapter: null })}>
          Bring none yet
        </Button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The open ask                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const HEADLINES = { admit: 'Hang a ticket.', evict: 'Dump the pans.', preempt: 'Pull a ticket.', prefetch: 'Bring a kit in.' } as const

/** A key for the open ask, which changes whenever a new decision opens, or the prediction closes, so that focus can follow it. */
function askKey(view: PoolView): string {
  const ask = view.ask
  const predicting = view.predict.open ? 'predict' : 'play'
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

export function Controls({ run, dump, mode, onPoint }: AskProps) {
  const { view } = run
  const ask = view.ask
  const body = useRef<HTMLDivElement>(null)
  useAnnouncements(run)
  // When a new ask opens, focus goes to its first control if the learner's focus was in the controls or had nowhere to be. A pointer
  // user who is somewhere else on the page is not pulled away.
  const key = askKey(view)
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const here = document.activeElement
    const lost = here === null || here === document.body || !here.isConnected || ('disabled' in here && here.disabled === true)
    if (!lost && !(body.current?.contains(here) ?? false)) return
    const first = body.current?.querySelector<HTMLElement>('button[data-roving]:not(:disabled), .es-stub__pull:not(:disabled), button:not(:disabled)')
    first?.focus({ preventScroll: true })
    // The ask opens under the drawing, below where the learner was looking: bring the whole of it into view, and move the page no more
    // than that, so that an ask that is already on the screen does not move it at all.
    body.current?.closest<HTMLElement>('[data-ask-card]')?.scrollIntoView({ block: 'nearest' })
  }, [key])

  // The night is over: focus goes to the way on, which the shell prints under the controls.
  const ended = useRef(run.done)
  useEffect(() => {
    if (ended.current === run.done) return
    ended.current = run.done
    if (!run.done) return
    const way = document.querySelector<HTMLElement>('[data-end] button')
    way?.focus({ preventScroll: true })
    way?.scrollIntoView({ block: 'nearest' })
  }, [run.done])

  if (run.done) {
    return (
      <Ticket as="section" width="full" hole={false} titleAs="h3" title={view.incomplete ? 'Tickets left unserved.' : 'Every ticket is served.'}>
        <p>{view.incomplete ? 'The night ran out of steps with tickets waiting.' : 'Open the debrief to see what the house would have done.'}</p>
      </Ticket>
    )
  }
  let content: ReactNode = null
  if (ask !== null) {
    const props: AskProps = { run, dump, mode, onPoint }
    content =
      ask.kind === 'admit' ? <AdmitAsk {...props} /> : ask.kind === 'evict' ? <EvictAsk {...props} /> : ask.kind === 'preempt' ? <PreemptAsk {...props} /> : <PrefetchAsk {...props} />
  }
  return (
    <div className="es-ask-stack" data-pool-controls="" data-ask={ask === null ? 'none' : ask.kind}>
      {view.predict.open ? <Predict run={run} /> : null}
      <Ticket
        as="section"
        width="full"
        hole={false}
        lamp={ask !== null}
        titleAs="h3"
        title={ask === null ? 'Nothing to decide.' : HEADLINES[ask.kind]}
        aria-label="The open ask"
        data-ask-card=""
      >
        <div ref={body} className="es-ask__body">
          {content}
        </div>
      </Ticket>
    </div>
  )
}
