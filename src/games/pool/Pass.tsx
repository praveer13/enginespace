import { Glyph } from '@/design/components/Glyph'
import { formatReadout } from '@/design/format'
import { Rail } from '@/design/components/Rail'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import type { PoolView, SegState, StationView, TicketView } from '@es/play/pool/types'
import { stationGlyph } from './glyphs'
import { useWide } from './useWide'
import { pansWord, stepsWord } from './words'

/*
 * The pass, in front of the reach-in (GAMES.md §2.6): the tickets on the line, the tickets waiting, and who has left or is seated. A
 * ticket is a ruler: one row for each station, one segment for each block of the order. A hung ticket's segments are solid where its
 * station holds the pan and an open groove where the station has let it go. A waiting ticket's are green where the reach-in already holds
 * the pans it starts from (shared mise, a prefix hit, which counts only as far as every station holds it) and hollow where it must prep
 * them. The drawing carries no number but the ticket's own; the counts are Readouts, and the mirror lists every figure.
 */

const SEG_WORDS: Record<SegState, string> = { held: 'held', 'let-go': 'let go', hit: 'shared', fresh: 'to prep' }

/** One ticket's ruler: a row of segments for each station. */
export function Ruler({ ticket, stations }: { ticket: TicketView; stations: readonly StationView[] }) {
  if (ticket.ruler.length === 0) return null
  return (
    <span className="es-ruler" aria-hidden="true">
      {ticket.ruler.map((row, g) => (
        <span key={stations[g].id} className="es-ruler__row" data-kind={stations[g].kind}>
          <Glyph shape={stationGlyph(stations[g])} className="es-ruler__glyph" />
          <span className="es-ruler__segs" style={{ ['--es-ruler-blocks' as string]: row.length }}>
            {row.map((seg, j) => (
              <span key={j} className="es-ruler__seg" data-seg={seg} />
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

/** The words a reader hears for a ticket's ruler, for a station: how many blocks are held, let go, shared or to prep. */
function rulerWords(ticket: TicketView, stations: readonly StationView[]): string {
  return ticket.ruler
    .map((row, g) => {
      const counts = (['held', 'hit', 'fresh', 'let-go'] as const)
        .map((seg) => [seg, row.filter((s) => s === seg).length] as const)
        .filter(([, n]) => n > 0)
        .map(([seg, n]) => `${n} ${SEG_WORDS[seg]}`)
      return `station ${stations[g].id}: ${counts.join(', ')}`
    })
    .join('; ')
}

const STATUS_WORDS = { future: 'thinking', waiting: 'waiting', running: 'on the line', done: 'served' } as const

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

export function TicketCard({ ticket, view, as = 'li' }: { ticket: TicketView; view: PoolView; as?: 'li' | 'div' }) {
  const kit = ticket.adapter === null ? null : view.kits[ticket.adapter]
  return (
    <Ticket
      as={as}
      compact
      hole={false}
      width="full"
      head={`No. ${ticket.no}`}
      meta={`table ${ticket.letter} · ${ticket.turn + 1}/${ticket.turns}`}
      data-ticket={ticket.id}
      data-status={ticket.status}
    >
      <Ruler ticket={ticket} stations={view.stations} />
      <TicketLine note={ticket.status === 'waiting' ? <>{num(ticket.hit)} tokens</> : ticket.status === 'running' ? <>{num(ticket.tokens)} tokens</> : null}>
        {ticket.status === 'waiting' ? 'shared mise' : ticket.status === 'running' ? 'in the order' : STATUS_WORDS[ticket.status]}
      </TicketLine>
      {kit === null ? null : (
        <TicketLine tone={ticket.kitReady === false ? 'ink-2' : 'ink'}>
          {`kit ${kit.id + 1}, ${kit.state === 'ready' ? 'landed' : kit.state === 'loading' ? 'landing' : 'not in'}`}
        </TicketLine>
      )}
      <span className="sr-only">
        {`Ticket No. ${ticket.no}, table ${ticket.letter}, ${ticket.turn + 1} of ${ticket.turns}, ${STATUS_WORDS[ticket.status]}. ${rulerWords(ticket, view.stations)}`}
      </span>
    </Ticket>
  )
}

/** Tables that are seated and have a ticket to come, and the tickets already served. */
function Seated({ view }: { view: PoolView }) {
  const letters = new Set<string>()
  for (const ticket of view.tickets) if (ticket.status === 'future' && ticket.turn > 0 && ticket.arrives !== null) letters.add(ticket.letter)
  const left = view.tickets.filter((ticket) => ticket.status === 'done')
  if (letters.size === 0 && left.length === 0) return null
  const seated = [...letters].sort()
  return (
    <p className="es-pass__note">
      {seated.length > 0 ? <span>Seated, thinking: {seated.length === 1 ? `table ${seated[0]}` : `tables ${seated.join(', ')}`}. </span> : null}
      {left.length > 0 ? <span>Served: {left.map((ticket) => ticket.no).join(', ')}.</span> : null}
      <span> Every count here is a token, a pan or a slot of the synthetic world.</span>
    </p>
  )
}

export function Pass({ view }: { view: PoolView }) {
  const online = view.running.map((id) => view.tickets[id])
  const waiting = view.waiting.map((id) => view.tickets[id])
  const wide = useWide()
  return (
    <section className="es-pass" aria-label="The pass: tickets" data-reachin-pass="">
      <div className="es-pass__lane" data-lane="line">
        <div className="es-pass__title">
          <TapeLabel size="sm" tilt="left">
            On the line
          </TapeLabel>
          <span className="es-pass__clips">
            {num(online.length)} of {num(view.cap)} slots
          </span>
        </div>
        {wide ? (
          // The rail: a clip for each batch slot, a ticket hung on each taken clip and an open clip, paid for and empty, on the rest.
          <Rail clips={view.cap} tickets={online.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} view={view} as="div" />)} label={`The line: ${view.cap} clips`} />
        ) : (
          <>
            {online.length === 0 ? <p className="es-pass__empty">Every clip is open.</p> : null}
            <ul className="es-pass__tickets">
              {online.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} view={view} />
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="es-pass__lane" data-lane="waiting">
        <div className="es-pass__title">
          <TapeLabel size="sm" tilt="right">
            Waiting
          </TapeLabel>
          <span className="es-pass__clips">{num(waiting.length)} waiting</span>
        </div>
        {waiting.length === 0 ? <p className="es-pass__empty">Nobody is waiting.</p> : null}
        <ul className="es-pass__tickets">
          {waiting.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} view={view} />
          ))}
        </ul>
      </div>
      <Seated view={view} />
    </section>
  )
}

/** The kit shelf (GAMES.md §2.6): a recipe kit is a variant's own mise, in pans from the same reach-in. */
export function Shelf({ view }: { view: PoolView }) {
  if (view.kits.length === 0) return null
  return (
    <section className="es-shelf" aria-label="Recipe kits" data-reachin-shelf="">
      <div className="es-pass__title">
        <TapeLabel size="sm" tilt="left">
          Recipe kits
        </TapeLabel>
        <span className="es-shelf__note">pans from the same reach-in</span>
      </div>
      <ul className="es-shelf__kits">
        {view.kits.map((kit) => (
          <Ticket
            key={kit.id}
            as="li"
            compact
            hole={false}
            width="full"
            head={`Kit ${kit.id + 1}`}
            meta={kit.state === 'ready' ? 'landed' : kit.state === 'loading' ? 'landing' : 'not in'}
            data-kit={kit.id}
          >
            <TicketLine note={<>{num(kit.pages)} {pansWord(kit.pages)}</>}>{`rank ${kit.rank}`}</TicketLine>
            <TicketLine note={<>{num(kit.loadSteps)} {stepsWord(kit.loadSteps)}</>}>to land</TicketLine>
            {kit.wanted.length > 0 ? <TicketLine tone="ink-2">{`waiting: ${kit.wanted.map((id) => `No. ${view.tickets[id].no}`).join(', ')}`}</TicketLine> : null}
          </Ticket>
        ))}
      </ul>
    </section>
  )
}
