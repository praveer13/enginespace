import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import type { PanState, PoolView, TicketView } from '@es/play/pool/types'
import type { PoolRun } from './types'
import { reqName } from './words'

/*
 * KV page pool's state as a table (GAMES.md §2.3, §8 "2D path"; A§6.9; REDESIGN §2.6): two DOM tables that list everything the diagram
 * shows, so a screen reader, a zoomed page and a phone read what the grid, the batch and the free queue show, and nothing is only in the
 * picture. The request table lists every request that has arrived (its conversation, its tokens, the prefix hit it found, what it
 * recomputed, and the blocks it holds in each KV group), and the page table every page that holds something (its state, its group, its
 * label, its hash and the requests that hold it). Every time is a step of the model's clock and every count is a count of the synthetic
 * world, and the summary says so (D-048). The row the open decision is about carries the marker.
 */

const FORMS: Record<PanState, string> = { free: 'free', used: 'in use', cached: 'cached', shared: 'cached, a prefix hit waits on it', adapter: "an adapter's", evicted: 'evicted' }
const STATUS: Record<TicketView['status'], string> = { future: 'not arrived', waiting: 'waiting', running: 'running', done: 'finished' }

const n = (value: number) => <span className="font-numeric">{value}</span>

const TICKET_COLUMNS: readonly MirrorColumn[] = [
  { key: 'ticket', head: 'Request' },
  { key: 'status', head: 'State' },
  { key: 'tokens', head: 'Tokens', numeric: true },
  { key: 'hit', head: 'Prefix-hit tokens', numeric: true },
  { key: 'recomputed', head: 'Recomputed tokens', numeric: true },
  { key: 'blocks', head: 'Blocks per KV group' },
]

/** A request's blocks in each group, in words: `full0 9, sw0 2, sw1 2`. A waiting request's are the blocks it would reuse and the ones it needs. */
function blocksOf(ticket: TicketView, view: PoolView): string {
  if (ticket.ruler.length === 0) return 'none'
  return ticket.ruler
    .map((row, g) => {
      const held = row.filter((seg) => seg === 'held').length
      const hit = row.filter((seg) => seg === 'hit').length
      const fresh = row.filter((seg) => seg === 'fresh').length
      const text = ticket.status === 'running' ? `${held}` : `${hit} reused, ${fresh} new`
      return `${view.stations[g].id} ${text}`
    })
    .join(', ')
}

/** The requests the diagram shows: the ones that have arrived. */
function ticketRows(view: PoolView): MirrorRow[] {
  const lit = view.ask === null ? [] : view.ask.kind === 'evict' ? (view.ask.for === 'admit' ? [view.ask.target] : []) : view.ask.kind === 'preempt' ? [view.ask.stalled] : []
  return view.tickets
    .filter((ticket) => ticket.status !== 'future')
    .map(
      (ticket): MirrorRow => ({
        id: `request-${ticket.id}`,
        lamp: lit.includes(ticket.id),
        cells: {
          ticket: (
            <>
              <span className="font-numeric">{reqName(ticket.id)}</span>
              <span className="text-text-2">{` · conversation ${ticket.letter}, turn ${ticket.turn + 1} of ${ticket.turns}`}</span>
            </>
          ),
          status: STATUS[ticket.status],
          tokens: n(ticket.tokens),
          hit: n(ticket.hit),
          recomputed: n(ticket.recomputed),
          blocks: blocksOf(ticket, view),
        },
      }),
    )
}

const PAGE_COLUMNS: readonly MirrorColumn[] = [
  { key: 'page', head: 'Page' },
  { key: 'form', head: 'State' },
  { key: 'group', head: 'KV group' },
  { key: 'label', head: 'Label' },
  { key: 'hash', head: 'Hash, last six digits' },
  { key: 'holders', head: 'Held by' },
]

function pageRows(view: PoolView): MirrorRow[] {
  return view.pans
    .filter((page) => page.state !== 'free')
    .map(
      (page): MirrorRow => ({
        id: `page-${page.id}`,
        cells: {
          page: <span className="font-numeric">{page.id + 1}</span>,
          form: FORMS[page.state],
          group: page.station === null ? (page.kit === null ? '' : `adapter ${page.kit + 1}`) : view.stations[page.station].id,
          label: page.tape ?? '',
          hash: page.hash === null ? '' : <span className="font-numeric">{page.hash.toString(16).slice(-6)}</span>,
          holders: page.holders.map((id) => reqName(id)).join(', '),
        },
      }),
    )
}

export function Mirror({ run }: { run: PoolRun }) {
  const { view } = run
  const c = view.counts
  const served = view.tickets.filter((ticket) => ticket.status === 'done').length
  return (
    <>
      <MirrorTable
        id={run.mirrorId}
        head="Requests"
        caption="Every request that has arrived: its state, its tokens, its prefix hit, what it recomputed, and its blocks in each KV group"
        summary={
          <>
            Step {n(view.step)}. Finished {n(served)} of {n(view.tickets.length)} requests. Prefix-hit tokens {n(c.hitTokens)}, recomputed tokens {n(c.recomputedTokens)}, evictions{' '}
            {n(c.evictions)}, preemptions {n(c.preemptions)}
            {view.kits.length > 0 ? <>, steps waiting for an adapter {n(c.adapterStallSteps)}</> : null}, cost {n(c.cost)}. Pages: free {n(view.stock.bare)}, in use{' '}
            {n(view.stock.held)}, cached {n(view.stock.cached)}
            {view.stock.kits > 0 ? <>, adapters {n(view.stock.kits)}</> : null}. Every figure is a count of the synthetic model.
          </>
        }
        columns={TICKET_COLUMNS}
        rows={ticketRows(view)}
        empty="No request has arrived yet."
      />
      <MirrorTable
        head="Pages"
        caption={`Every page that holds something: ${view.pans.length - view.tally.free} of ${view.pans.length}, with its state, KV group, label, hash and the requests that hold it`}
        columns={PAGE_COLUMNS}
        rows={pageRows(view)}
        empty="Every page is free."
      />
    </>
  )
}
