import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Glyph } from '@/design/components/Glyph'
import { Legend } from '@/design/components/Legend'
import { PartPopover } from '@/games/kit/PartPopover'
import { PAGE_ENGINE_LINE, partOf } from '@es/play/pool/copy'
import type { PanView, PoolView, StationView, TicketView } from '@es/play/pool/types'
import type { Dump } from './dump'
import { groupNo, KIND_WORDS, pageTitle, STATE_SLOT, STATE_WORDS, stateGlyph } from './glyphs'
import type { PoolRun } from './types'
import { reqName } from './words'

/*
 * KV page pool's diagram (REDESIGN §2.6, §2.9, §3.5): the engine's own picture of its page pool, drawn flat.
 *
 *   - The running batch: one slot per batch slot, dashed while empty. A running request draws its block table as a ruler: a row for each
 *     KV group, a segment for each block, solid where the group holds the page and dashed where a sliding window has let it go.
 *   - The page pool: every page in its cell, in rows of 16, each in its place for its whole life. A page's state is its colour and its
 *     glyph (the legend under the diagram), and on a wide screen its KV group's number sits in its corner.
 *   - The free queue: the pages nobody holds, in the order they will be evicted, the next on the left. Free pages lead it, counted.
 *
 * It holds no fact the table does not: the drawing is hidden from assistive technology, and State as a table lists every figure. The
 * pages an open eviction would take are drawn in the evicted state with the marker's ring (now); a page a list row points at takes the
 * ink ring. On a wide screen a pointer may pick a page of the open eviction in the grid; the dock's list is the way for every other hand.
 *
 * Touch a part, get its source (REDESIGN §2.6): the name of each region (the running batch, the KV page pool, the free queue) is its part's
 * popover, from the same rows of packages/play/pool/copy.ts that the parts list reads, and a page the pointer selects opens the KV page's
 * popover with that page's owner and state. A lesson's dock draws the same parts (DockView.tsx).
 */

/** The largest cell, by rows: a pool of three rows draws large cells, one of thirteen keeps the grid within the diagram [estimated]. */
const cellMax = (rows: number): number => Math.max(18, Math.min(44, Math.floor(300 / rows)))

/** The free queue shows this many cached pages, and counts the rest. */
const QUEUE_SHOWN = 48

interface CellProps {
  page: PanView
  view: PoolView
  chosen: boolean
  pointed: boolean
  onPick?: () => void
  /** A press on a page that is not being picked selects it, and its popover opens. */
  onSelect?: () => void
  selected?: boolean
}

export function Cell({ page, view, chosen, pointed, onPick, onSelect, selected = false }: CellProps) {
  const state = chosen ? 'evicted' : page.state
  const group = page.station === null ? null : view.stations[page.station]
  return (
    <li
      className="es-pool__cell"
      data-state={state}
      data-id={page.id}
      data-chosen={chosen || undefined}
      data-pointed={pointed || undefined}
      data-pick={onPick === undefined ? undefined : ''}
      data-selected={selected || undefined}
      title={pageTitle(page, view, chosen)}
      onClick={onPick ?? onSelect}
    >
      <Glyph shape={stateGlyph(state)} className="es-pool__glyph" />
      {group !== null && view.stations.length > 1 ? <span className="es-pool__group">{groupNo(group)}</span> : null}
    </li>
  )
}

/** One request's block table: a row for each KV group, a segment for each block. */
export function BlockTable({ ticket, stations }: { ticket: TicketView; stations: readonly StationView[] }) {
  if (ticket.ruler.length === 0) return null
  return (
    <span className="es-pool__ruler" aria-hidden="true">
      {ticket.ruler.map((row, g) => (
        <span key={stations[g].id} className="es-pool__ruler-row">
          {stations.length > 1 ? <span className="es-pool__ruler-group">{g + 1}</span> : null}
          <span className="es-pool__segs" style={{ '--es-blocks': row.length } as CSSProperties}>
            {row.map((seg, j) => (
              <span key={j} className="es-pool__seg" data-seg={seg} />
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

function Batch({ view }: { view: PoolView }) {
  const slots = Array.from({ length: view.cap }, (_, at) => view.running[at] ?? null)
  return (
    <section className="es-pool__batch" aria-label="Running batch" data-pool-batch="">
      <h3 className="es-pool__label">
        <PartName id="batch" />{' '}
        <span className="es-pool__count">
          <span className="font-numeric">{view.running.length}</span> of <span className="font-numeric">{view.cap}</span> slots
        </span>
      </h3>
      <ol className="es-pool__slots" aria-hidden="true" style={{ '--es-slots': view.cap } as CSSProperties}>
        {slots.map((id, at) => {
          if (id === null)
            return (
              <li key={`empty-${at}`} className="es-pool__slot" data-empty="">
                empty slot
              </li>
            )
          const ticket = view.tickets[id]
          return (
            <li key={id} className="es-pool__slot" data-req={id}>
              <span className="es-pool__slot-head">
                <strong>{reqName(id)}</strong> <span className="es-pool__slot-meta">conversation {ticket.letter}</span>
              </span>
              <BlockTable ticket={ticket} stations={view.stations} />
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export interface DiagramProps {
  run: PoolRun
  dump: Dump
  /** The pages a list row points at. */
  pointed: readonly number[]
  /** Whether a pointer may pick a page of the open eviction in the grid. Phones pick from the list. */
  pick?: boolean
}

export function View2D({ run, dump, pointed, pick = true }: DiagramProps) {
  const { view } = run
  const [selected, setSelected] = useState<number | null>(null)
  const rows = Math.ceil(view.pans.length / view.cols)
  const open = dump.open && view.ask?.kind === 'evict' ? view.ask.candidates : []
  const stock = view.stock
  const order = view.rotation
  const free = order.filter((id) => view.pans[id].state === 'free').length
  const cached = order.slice(free)
  const shown = cached.slice(0, QUEUE_SHOWN)
  return (
    <div className="es-pool" data-pool-view="" style={{ '--es-cols': view.cols, '--es-cell-max': `${cellMax(rows)}px` } as CSSProperties}>
      <Batch view={view} />
      <section className="es-pool__grid-box" aria-label="Pages of the pool" data-pool-grid="">
        <h3 className="es-pool__label">
          <PartName id="pool" />{' '}
          <span className="es-pool__count">
            <span className="font-numeric">{view.pans.length}</span> pages · free <span className="font-numeric">{stock.bare}</span> · in use{' '}
            <span className="font-numeric">{stock.held}</span> · cached <span className="font-numeric">{stock.cached}</span>
            {stock.kits > 0 ? (
              <>
                {' '}
                · adapters <span className="font-numeric">{stock.kits}</span>
              </>
            ) : null}
          </span>
          <PagePick view={view} page={selected} onClose={() => setSelected(null)} />
        </h3>
        <ol className="es-pool__grid" aria-hidden="true">
          {view.pans.map((page) => {
            const candidate = open.includes(page.id)
            return (
              <Cell
                key={page.id}
                page={page}
                view={view}
                chosen={candidate && dump.isPicked(page.id)}
                pointed={pointed.includes(page.id)}
                onPick={pick && candidate ? () => dump.toggle(page.id) : undefined}
                onSelect={() => setSelected(page.id)}
                selected={selected === page.id}
              />
            )
          })}
        </ol>
      </section>
      <section className="es-pool__queue" aria-label="Free queue" data-pool-queue="">
        <h3 className="es-pool__label">
          <PartName id="free-queue" /> <span className="es-pool__count">next to evict on the left</span>
        </h3>
        <ol className="es-pool__strip" aria-hidden="true">
          {free > 0 ? (
            <li className="es-pool__free-run">
              <span className="font-numeric">{free}</span> free
            </li>
          ) : null}
          {shown.map((id) => (
            <Cell key={id} page={view.pans[id]} view={view} chosen={open.includes(id) && dump.isPicked(id)} pointed={pointed.includes(id)} />
          ))}
          {cached.length > shown.length ? (
            <li className="es-pool__free-run">
              and <span className="font-numeric">{cached.length - shown.length}</span> more
            </li>
          ) : null}
          {order.length === 0 ? <li className="es-pool__free-run">empty: every page is in use</li> : null}
        </ol>
      </section>
    </div>
  )
}

/** A region's name, as its part's popover: the part's row of the parts table (copy.ts), its sentence, value, tag and source. */
export function PartName({ id, children }: { id: string; children?: ReactNode }) {
  const part = partOf(id)
  if (part === undefined) return <>{children}</>
  return <PartPopover part={part} trigger={children} />
}

/** Who holds a page, who would start from it, and its KV group, in words. */
function owners(page: PanView, view: PoolView): string {
  const reqs = (ids: readonly number[]) => ids.map((id) => reqName(id)).join(', ')
  const held = page.kit !== null ? `Adapter ${page.kit + 1} holds it.` : page.holders.length === 0 ? 'Nobody holds it.' : `Held by ${reqs(page.holders)}.`
  const waits = page.spokenFor.length === 0 ? '' : ` ${reqs(page.spokenFor)} would start from it.`
  const group = page.station === null ? '' : ` KV group ${view.stations[page.station].id}.`
  return `${held}${waits}${group}`
}

/**
 * The KV page's popover for the page a pointer selected: the page's row of the parts table, the page's own state and owner, and the pool's
 * class in vLLM, named once. It opens when a page is pressed, and its trigger (the page's number, beside the pool's name) takes focus, so
 * Escape closes it and leaves focus there. A keyboard reads every page's state in State as a table.
 */
export function PagePick({ view, page: id, onClose }: { view: PoolView; page: number | null; onClose: () => void }) {
  const box = useRef<HTMLSpanElement>(null)
  const part = partOf('page')
  useEffect(() => {
    if (id !== null) box.current?.querySelector<HTMLElement>('.es-pop__trigger')?.focus({ preventScroll: true })
  }, [id])
  const page = id === null ? undefined : view.pans[id]
  if (part === undefined || page === undefined) return null
  return (
    <span ref={box} className="es-pool__pick">
      <PartPopover
        part={part}
        trigger={`Page ${page.id + 1}`}
        triggerLabel={`Page ${page.id + 1}, KV page`}
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        detail={
          <>
            Page <span className="font-numeric">{page.id + 1}</span>: {STATE_WORDS[page.state]}
            {page.tape === null ? '' : `, ${page.tape}`}. {owners(page, view)}
          </>
        }
        engineLine={
          <>
            {PAGE_ENGINE_LINE.before}
            <code>{PAGE_ENGINE_LINE.engine}</code>
            {PAGE_ENGINE_LINE.after}
          </>
        }
      />
    </span>
  )
}

/** The legend under the diagram: the states a page takes on this level, by colour and glyph, and the KV groups by number. */
export function PoolLegend({ view }: { view: PoolView }) {
  const states = (['free', 'used', 'cached', 'shared', 'evicted'] as const).filter((state) => state !== 'evicted' || view.ask?.kind === 'evict')
  const entries = [...states, ...(view.kits.length > 0 ? (['adapter'] as const) : [])].map((state) => ({ slot: STATE_SLOT[state], word: STATE_WORDS[state] }))
  return (
    <div className="es-pool__legend" data-pool-legend="">
      <Legend entries={entries} label="Legend: a page's state" />
      {view.stations.length > 1 ? (
        <p className="es-pool__groups">
          KV groups:{' '}
          {view.stations.map((group, at) => (
            <span key={group.id} className="es-pool__groups-item">
              <span className="es-pool__groups-n">{groupNo(group)}</span> <code>{group.id}</code> {KIND_WORDS[group.kind]}
              {at < view.stations.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      ) : (
        <p className="es-pool__groups" data-one="">
          One KV group, <code>{view.stations[0].id}</code>: {KIND_WORDS[view.stations[0].kind]}. A page holds a block of <span className="font-numeric">{view.blockTokens}</span> tokens.
        </p>
      )}
    </div>
  )
}
