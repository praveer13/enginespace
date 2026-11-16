import clsx from 'clsx'
import type { ReactNode } from 'react'
import { requestName } from '@es/play/loop/copy'
import type { FullFire, FullView } from '@es/play/loop/full/types'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { tagOf, type FigureKind } from './tags'
import type { FullRun } from './types'

/*
 * The full levels' state table (GAMES.md §2.3, §3; A§6.9): a DOM table of the run, so nothing is only in the picture. A row for every
 * step of the window: its slots (a token, a ghost token, a padded place or an empty slot, with the request's name), the GPU busy time,
 * the bubble before it, the capture size it replayed or the mode it ran as, the CPU's launches and its ghost tokens; the sizes stage
 * adds the step's capture cost. µs on the model's clock (D-048); the heads say so. The latest step is the marked row.
 */

/** Steps the table lists one by one; older ones are summed in a row [estimated]. */
const WINDOW = 16

const WORD = { plate: 'token', binned: 'ghost token', empty: 'empty slot', padding: 'padded place' } as const

/** Each place's state, with the first `padded` empty places marked as the captured size's padding. */
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
            {place.req === null ? '' : `, request ${requestName(place.req)}`}
          </span>
          <span
            aria-hidden="true"
            className={clsx(
              'inline-flex h-6 min-w-7 items-center justify-center border-2 font-numeric text-size-micro leading-none',
              look[states[index]],
            )}
          >
            {place.req === null ? '' : requestName(place.req)}
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
    { key: 'graph', head: head('Graph', 'size, or mode'), label: 'Graph' },
    { key: 'calls', head: head('Launches', 'calls'), label: 'Launches', numeric: true },
    { key: 'ghost', head: 'Ghost tokens', numeric: true },
  ]
  if (view.stage.metric === 'capture')
    columns.push({ key: 'cost', head: head('Capture cost', 'µs, padded + eager'), label: 'Capture cost, µs', numeric: true })
  if (view.allergy !== null) columns.push({ key: 'mask', head: head('Mask', 'µs'), label: 'Mask, µs', numeric: true })
  return columns
}

const count = (value: number) => formatReadout(value)

/** A µs figure with its tag for a screen reader: the head says µs, and the tag says where the number comes from. */
const us = (view: FullView, kind: FigureKind, value: number): ReactNode => (
  <>
    {formatReadout(value)}
    <span className="sr-only"> µs, {tagOf(view, kind)}</span>
  </>
)

function rowOf(view: FullView, fire: FullFire, lamp: boolean): MirrorRow {
  return {
    id: `fire-${fire.index}`,
    lamp,
    cells: {
      step: (
        <>
          <span className="font-numeric">{String(fire.index + 1).padStart(4, '0')}</span>
          <span className="sr-only"> step{fire.onLine ? ', still running' : ''}</span>
        </>
      ),
      slots: <Slots fire={fire} />,
      busy: us(view, 'line', fire.endUs - fire.startUs),
      bubble: us(view, 'host', fire.bubbleUs),
      graph: fire.mold === null ? (fire.mode === 'NONE' ? 'eager' : fire.mode) : `${fire.mode} · size ${fire.mold}`,
      calls: count(fire.calls),
      ghost: count(fire.ghosts),
      cost: us(view, 'host', (fire.paddedUs ?? 0) + (fire.eagerUs ?? 0)),
      mask: us(view, 'host', fire.maskUs ?? 0),
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
        busy: us(view, 'line', sum((fire) => fire.endUs - fire.startUs)),
        bubble: us(view, 'host', sum((fire) => fire.bubbleUs)),
        graph: <span className="text-text-2">summed</span>,
        calls: count(sum((fire) => fire.calls)),
        ghost: count(sum((fire) => fire.ghosts)),
        cost: us(view, 'host', sum((fire) => (fire.paddedUs ?? 0) + (fire.eagerUs ?? 0))),
        mask: us(view, 'host', sum((fire) => fire.maskUs ?? 0)),
      },
    })
  }
  const shown = fires.slice(hidden)
  shown.forEach((fire, i) => rows.push(rowOf(view, fire, i === shown.length - 1 && !view.nightOver)))
  return rows
}

const num = (value: number) => <span className="tabular-nums">{formatReadout(value)}</span>

export function FullMirror({ run }: { run: FullRun }) {
  const { view } = run
  const c = view.counters
  const capture = view.stage.metric === 'capture'
  // A closed-book stage keeps the reference run's clock to itself until its run is served.
  const hidden = view.stage.sealed && !view.stage.closed
  const table = (
    <MirrorTable
      className="min-w-0"
      id={run.mirrorId}
      head={`State · ${view.stage.title}`}
      caption="Every step of the run so far: its slots, the GPU busy time, the bubble before it, its graph, its launches and its ghost tokens"
      summary={
        <>
          {view.stage.title}. Step {num(view.step)}
          {view.nightFires === null ? '' : <> of {num(view.nightFires)}</>}. {capture ? 'Capture cost' : 'Clock'} {num(capture ? c.captureUs : c.clockUs)} µs
          {hidden ? '' : <> against the reference run’s {num(view.stage.houseMetric)}</>}. Useful tokens {num(c.usefulTokens)}, ghost tokens {num(c.ghostTokens)}, padded places {num(c.paddedTokens)},
          launches {num(c.launches)}, eager steps {num(c.eagerSteps)}. GPU busy {num(c.gpuBusyUs)} µs, bubble {num(c.bubbleUs)} µs.{' '}
          {view.synthetic ? 'Every figure is synthetic.' : 'The GPU’s µs are derived from S5’s fit; the CPU’s are estimated.'}
        </>
      }
      columns={columnsOf(view)}
      rows={rowsOf(view)}
      empty={view.stage.sealed ? 'No run has been served yet. Commit the prediction, set the levers from the cards and run it.' : 'No step has run yet. Commit the prediction, set the levers and press Step.'}
    />
  )
  return table
}
