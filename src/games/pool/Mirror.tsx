import { formatReadout } from '@/design/format'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { PanState, PoolView, TicketView } from '@es/play/pool/types'
import type { PoolRun } from './types'

/*
 * The Reach-In's mirror (GAMES.md §2.3, §8 "2D path"; A§6.9): the printer's tape with the counters of the night, and two DOM tables that
 * list everything the drawing shows, so a screen reader, a zoomed page and a phone read what the rack and the pass show and nothing is
 * only in the picture. The page table lists every pan that holds something (id, form, station, tape, hash, holders), and the request
 * table every ticket (its place, its tokens, the hit it found and the blocks it holds at each group). Column heads are the engine's
 * terms, with the kitchen's word under each, and the cells say the kitchen's words (GAMES.md §2.6, rule 2; §8, "2D path"). Every time is
 * a step of the model's clock and every count is a count of tokens, pans or tickets of the synthetic world, and the heads say so (D-048).
 *
 * The lamp falls on the present: the ticket the open ask is about.
 */

/** The kitchen's word, then the engine's term (GAMES.md §2.6, rule 2). */
const pair = (kitchen: string, engine: string) => (
  <>
    {kitchen} <span className="text-text-2">· {engine}</span>
  </>
)

function linesOf(view: PoolView): PrinterTapeLine[] {
  const c = view.counts
  const served = view.tickets.filter((ticket) => ticket.status === 'done').length
  return [
    { id: 'step', label: pair('step', 'engine step'), value: <Readout value={view.step} pad={4} tag="synthetic" size="sm" /> },
    { id: 'served', label: pair('tickets served', 'completed'), value: <Readout value={served} unit="requests" tag="synthetic" size="sm" /> },
    { id: 'shared', label: pair('shared mise', 'hit tokens'), value: <Readout value={c.hitTokens} unit="tokens" tag="synthetic" size="sm" /> },
    { id: 'prepped', label: pair('prepped again', 'recomputed tokens'), value: <Readout value={c.recomputedTokens} unit="tokens" tag="synthetic" size="sm" />, tone: c.recomputedTokens > 0 ? 'ink-2' : 'ink' },
    { id: 'dumped', label: pair('pans dumped', 'evictions'), value: <Readout value={c.evictions} unit="pages" tag="synthetic" size="sm" /> },
    { id: 'pulled', label: pair('tickets pulled', 'preemptions'), value: <Readout value={c.preemptions} unit="requests" tag="synthetic" size="sm" /> },
    ...(view.kits.length === 0
      ? []
      : [{ id: 'stall', label: pair('kit stall steps', 'adapter stalls'), value: <Readout value={c.adapterStallSteps} unit="steps" tag="synthetic" size="sm" />, tone: c.adapterStallSteps > 0 ? ('ink-2' as const) : ('ink' as const) }]),
    { id: 'price', label: 'price', value: <Readout value={c.cost} unit="tokens" tag="derived" size="sm" /> },
  ]
}

const FORMS: Record<PanState, string> = { free: 'bare', used: 'held', cached: 'cached', shared: 'shared mise', adapter: "a kit's", evicted: 'dumped' }
const STATUS: Record<TicketView['status'], string> = { future: 'thinking', waiting: 'waiting', running: 'on the line', done: 'served' }

const head = (term: string, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

const TICKET_COLUMNS: readonly MirrorColumn[] = [
  { key: 'ticket', head: head('Request', 'the ticket'), label: 'Request, the ticket' },
  { key: 'status', head: 'State' },
  { key: 'tokens', head: head('Tokens', 'synthetic'), label: 'Tokens, synthetic', numeric: true },
  { key: 'hit', head: head('Hit tokens', 'shared mise, synthetic'), label: 'Hit tokens, shared mise, synthetic', numeric: true },
  { key: 'prepped', head: head('Recomputed tokens', 'prepped again, synthetic'), label: 'Recomputed tokens, prepped again, synthetic', numeric: true },
  { key: 'pans', head: head('Blocks per group', 'pans at each station'), label: 'Blocks per group, pans at each station' },
]

/** A ticket's pans at each station, in words: `full0 9, sw0 2, sw1 2`. A waiting ticket's are the pans it would find and the pans it must take. */
function pansOf(ticket: TicketView, view: PoolView): string {
  if (ticket.ruler.length === 0) return 'none'
  return ticket.ruler
    .map((row, g) => {
      const held = row.filter((seg) => seg === 'held').length
      const shared = row.filter((seg) => seg === 'hit').length
      const fresh = row.filter((seg) => seg === 'fresh').length
      const text = ticket.status === 'running' ? `${held}` : `${shared} shared, ${fresh} to take`
      return `${view.stations[g].id} ${text}`
    })
    .join(', ')
}

/** The tickets the drawing shows: the ones that have arrived. A ticket still thinking is not on the pass, so it is not a row. */
function ticketRows(view: PoolView): MirrorRow[] {
  const lit = view.ask === null ? [] : view.ask.kind === 'evict' ? (view.ask.for === 'admit' ? [view.ask.target] : []) : view.ask.kind === 'preempt' ? [view.ask.stalled] : []
  return view.tickets
    .filter((ticket) => ticket.status !== 'future')
    .map((ticket): MirrorRow => ({
    id: `ticket-${ticket.id}`,
    lamp: lit.includes(ticket.id),
    cells: {
      ticket: (
        <>
          <span className="font-numeric">{`No. ${ticket.no}`}</span>
          <span className="text-text-2">{` · table ${ticket.letter}, ${ticket.turn + 1} of ${ticket.turns}`}</span>
        </>
      ),
      status: STATUS[ticket.status],
      tokens: <span className="font-numeric">{formatReadout(ticket.tokens)}</span>,
      hit: <span className="font-numeric">{formatReadout(ticket.hit)}</span>,
      prepped: <span className="font-numeric">{formatReadout(ticket.recomputed)}</span>,
      pans: pansOf(ticket, view),
    },
  }))
}

const PAN_COLUMNS: readonly MirrorColumn[] = [
  { key: 'pan', head: head('Page', 'the pan'), label: 'Page, the pan' },
  { key: 'form', head: 'State' },
  { key: 'station', head: head('Group', 'the station'), label: 'Group, the station' },
  { key: 'tape', head: 'Tape' },
  { key: 'hash', head: head('Hash', 'last six digits'), label: 'Hash, last six digits' },
  { key: 'refs', head: head('Refs', 'tickets that hold it'), label: 'Refs, tickets that hold it' },
]

function panRows(view: PoolView): MirrorRow[] {
  return view.pans
    .filter((pan) => pan.state !== 'free')
    .map((pan): MirrorRow => ({
      id: `pan-${pan.id}`,
      cells: {
        pan: <span className="font-numeric">{String(pan.id + 1).padStart(3, '0')}</span>,
        form: FORMS[pan.state],
        station: pan.station === null ? (pan.kit === null ? '' : `kit ${pan.kit + 1}`) : view.stations[pan.station].id,
        tape: pan.tape ?? '',
        hash: pan.hash === null ? '' : <span className="font-numeric">{pan.hash.toString(16).slice(-6)}</span>,
        refs: pan.holders.length === 0 ? '' : pan.holders.map((id) => `No. ${view.tickets[id].no}`).join(', '),
      },
    }))
}

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

export function Mirror({ run }: { run: PoolRun }) {
  const { view } = run
  const c = view.counts
  const served = view.tickets.filter((ticket) => ticket.status === 'done').length
  return (
    <div className="flex flex-col gap-6">
      <PrinterTape label="The printer: the night so far, in synthetic units" lines={linesOf(view)} feed={view.step} empty="Nothing printed yet" />
      <MirrorTable
        id={run.mirrorId}
        head="Mirror · the tickets"
        caption="Every ticket of the night: its place, its tokens, the shared mise it found, what it prepped again, and its pans at each station"
        summary={
          <>
            Step {num(view.step)}. Tickets served {num(served)} of {num(view.tickets.length)}. Shared mise {num(c.hitTokens)} tokens, prepped again {num(c.recomputedTokens)} tokens, pans dumped{' '}
            {num(c.evictions)}, tickets pulled {num(c.preemptions)}
            {view.kits.length > 0 ? <>, kit stall steps {num(c.adapterStallSteps)}</> : null}. Pans: bare {num(view.stock.bare)}, held {num(view.stock.held)}, cached{' '}
            {num(view.stock.cached)}
            {view.stock.kits > 0 ? <>, kits {num(view.stock.kits)}</> : null}. Every figure is a count of the synthetic world.
          </>
        }
        columns={TICKET_COLUMNS}
        rows={ticketRows(view)}
        empty="No ticket has arrived yet."
      />
      <details className="es-mirror-fold">
        <summary className="cursor-pointer font-bold">
          All pans that hold something ({formatReadout(view.pans.length - view.tally.free)} of {formatReadout(view.pans.length)})
        </summary>
        <MirrorTable
          head="Mirror · the pans"
          caption="Every pan that holds something: its form, its station, its tape, its hash and the tickets that hold it"
          columns={PAN_COLUMNS}
          rows={panRows(view)}
          empty="Every pan is bare."
        />
      </details>
    </div>
  )
}
