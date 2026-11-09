import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ticketNo } from '@es/play/loop/layout'
import type { FullFire, FullView } from '@es/play/loop/full/types'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { CloseCards } from './CloseCards'
import type { FullRun } from './types'

/*
 * The full service's mirror (GAMES.md §2.3, §3; A§6.9): a DOM table of the night, so nothing is only in the picture. A row for every
 * fire of the window: its slots (a plate, a binned plate, an empty mold place or an empty clip, with the ticket's number), the line busy,
 * the dark stretch before it, the mold it dropped into or the mode it ran as, the expo's calls and its binned plates; the sizes stage
 * adds the fire's capture cost. µs on the model's clock (D-048); the heads say so. The lamp falls on the latest fire.
 */

/** Fires the mirror lists one by one; older ones are summed in a row [estimated]. */
const WINDOW = 16

const WORD = { plate: 'plate', binned: 'binned plate', empty: 'empty place', padding: 'empty mold place' } as const

/** Each place's state, with the first `padded` empty places marked as the mold's padding. */
function statesOf(fire: FullFire): (FullFire['places'][number]['state'] | 'padding')[] {
  const out: (FullFire['places'][number]['state'] | 'padding')[] = []
  let pads = fire.padded
  for (const place of fire.places) {
    if (place.state === 'empty' && pads > 0) {
      pads -= 1
      out.push('padding')
    } else out.push(place.state)
  }
  return out
}

function Slots({ fire }: { fire: FullFire }) {
  const states = statesOf(fire)
  const look = {
    plate: 'border-cat-green-edge bg-paper text-paper-ink',
    empty: 'border-surface-3 bg-surface-3 text-paper',
    binned: 'border-dashed border-edge bg-paper text-paper-ink-2 line-through',
    padding: 'border-surface-3 bg-surface-1 text-text-1 rounded-round',
  }
  return (
    <ul className="flex flex-wrap gap-0.5" data-slots="">
      {fire.places.map((place, index) => (
        <li key={index} data-place={states[index]}>
          <span className="sr-only">
            Slot {index + 1}: {WORD[states[index]]}
            {place.req === null ? '' : `, ticket ${ticketNo(place.req)}`}
          </span>
          <span
            aria-hidden="true"
            className={clsx(
              'inline-flex h-6 min-w-7 items-center justify-center border-2 font-numeric text-size-micro leading-none',
              look[states[index]],
            )}
          >
            {place.req === null ? '' : ticketNo(place.req)}
          </span>
        </li>
      ))}
    </ul>
  )
}

const head = (term: string, unit: string): ReactNode => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

function columnsOf(view: FullView): MirrorColumn[] {
  const columns: MirrorColumn[] = [
    { key: 'step', head: 'Step' },
    { key: 'slots', head: 'Slots' },
    { key: 'busy', head: head('GPU busy', 'µs'), label: 'GPU busy, µs', numeric: true },
    { key: 'bubble', head: head('Bubble', 'µs'), label: 'Bubble, µs', numeric: true },
    { key: 'graph', head: head('Graph', 'mold, or mode'), label: 'Graph' },
    { key: 'calls', head: head('Launches', 'calls'), label: 'Launches', numeric: true },
    { key: 'ghost', head: 'Ghost tokens', numeric: true },
  ]
  if (view.stage.metric === 'capture')
    columns.push({ key: 'cost', head: head('Capture cost', 'µs, padded + eager'), label: 'Capture cost, µs', numeric: true })
  if (view.allergy !== null) columns.push({ key: 'mask', head: head('Mask', 'µs'), label: 'Mask, µs', numeric: true })
  return columns
}

const us = (value: number) => formatReadout(value)

function rowOf(fire: FullFire, lamp: boolean): MirrorRow {
  return {
    id: `fire-${fire.index}`,
    lamp,
    cells: {
      step: (
        <>
          <span className="font-numeric">{String(fire.index + 1).padStart(4, '0')}</span>
          <span className="sr-only"> fire{fire.onLine ? ', on the line' : ''}</span>
        </>
      ),
      slots: <Slots fire={fire} />,
      busy: us(fire.endUs - fire.startUs),
      bubble: us(fire.bubbleUs),
      graph: fire.mold === null ? (fire.mode === 'NONE' ? 'eager' : fire.mode) : `${fire.mode} · mold ${fire.mold}`,
      calls: us(fire.calls),
      ghost: us(fire.ghosts),
      cost: us((fire.paddedUs ?? 0) + (fire.eagerUs ?? 0)),
      mask: us(fire.maskUs ?? 0),
    },
  }
}

function rowsOf(view: FullView): MirrorRow[] {
  const fires = view.fires
  const hidden = Math.max(0, fires.length - WINDOW)
  const rows: MirrorRow[] = []
  if (hidden > 0) {
    const older = fires.slice(0, hidden)
    const sum = (pick: (fire: FullFire) => number) => older.reduce((total, fire) => total + pick(fire), 0)
    rows.push({
      id: 'earlier',
      cells: {
        step: <span className="text-text-2">earlier: {hidden}</span>,
        slots: <span className="text-text-2">not listed</span>,
        busy: us(sum((fire) => fire.endUs - fire.startUs)),
        bubble: us(sum((fire) => fire.bubbleUs)),
        graph: <span className="text-text-2">summed</span>,
        calls: us(sum((fire) => fire.calls)),
        ghost: us(sum((fire) => fire.ghosts)),
        cost: us(sum((fire) => (fire.paddedUs ?? 0) + (fire.eagerUs ?? 0))),
        mask: us(sum((fire) => fire.maskUs ?? 0)),
      },
    })
  }
  const shown = fires.slice(hidden)
  shown.forEach((fire, i) => rows.push(rowOf(fire, i === shown.length - 1 && !view.nightOver)))
  return rows
}

const num = (value: number) => <span className="tabular-nums">{formatReadout(value)}</span>

export function FullMirror({ run }: { run: FullRun }) {
  const { view } = run
  const c = view.counters
  const capture = view.stage.metric === 'capture'
  // A closed-book stage keeps the house's clock to itself until its night is served.
  const hidden = view.stage.sealed && !view.stage.closed
  const table = (
    <MirrorTable
      className="min-w-0"
      id={run.mirrorId}
      head={`Mirror · ${view.stage.title}`}
      caption="Every fire of the night so far: its slots, the line busy, the dark stretch before it, its graph, its calls and its binned plates"
      summary={
        <>
          {view.stage.title}. Fire {num(view.step)}
          {view.nightFires === null ? '' : <> of {num(view.nightFires)}</>}. {capture ? 'Capture cost' : 'Clock'} {num(capture ? c.captureUs : c.clockUs)} µs
          {hidden ? '' : <> against the house's {num(view.stage.houseMetric)}</>}. Plates {num(c.usefulTokens)}, binned {num(c.ghostTokens)}, padded places {num(c.paddedTokens)},
          calls {num(c.launches)}, dish by dish {num(c.eagerSteps)}. Line busy {num(c.gpuBusyUs)} µs, dark {num(c.bubbleUs)} µs.{' '}
          {view.synthetic ? 'Every figure is synthetic.' : "The line's µs are derived from S5's fit; the expo's are estimated."}
        </>
      }
      columns={columnsOf(view)}
      rows={rowsOf(view)}
      empty={view.stage.sealed ? 'No night has been served yet. Call the prediction, set the levers from the cards and serve the night.' : 'No fire has been rung yet. Call the prediction, set the levers and ring the bell.'}
    />
  )
  if (view.stage.cards === null) return table
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CloseCards view={view} />
      {table}
    </div>
  )
}
