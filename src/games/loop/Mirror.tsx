import clsx from 'clsx'
import { MIRROR_TICKS, ticketNo, windowOf } from '@es/play/loop/layout'
import type { FireView, LoopView, PlaceView } from '@es/play/loop/types'
import { formatReadout } from '@/design/format'
import { MirrorTable, type MirrorColumn, type MirrorRow } from '@/games/kit/MirrorTable'
import { Tape } from './Tape'
import type { LoopRun } from './types'

/*
 * Service's mirror (GAMES.md §2.3, §3; A§6.9): a DOM table of the whole night, so a screen reader, a zoomed page and a phone read
 * what the drawing shows and nothing is only in the picture. A row for every visible fire lists its slots, how long the line was
 * busy, the dark stretch before it and its binned plates. Column heads are the engine's terms, and the cells say the kitchen's words
 * (GAMES.md §2.6, rule 2). On the front page the times are ticks of the synthetic clock, and the heads say so (D-048); TR2's levels
 * will print µs on the model's clock and the graph hit (W1-T13).
 *
 * The lamp falls on the present row: the fire on the line, or the latest one.
 */

const WORD: Readonly<Record<PlaceView['state'], string>> = { plate: 'plate', empty: 'empty place', binned: 'binned plate' }

/** A fire's slots: a glyph for each clip (a solid plate, an open groove or a hollow binned plate), its ticket's number, and the words for assistive technology. */
function Slots({ places }: { places: readonly PlaceView[] }) {
  const look: Readonly<Record<PlaceView['state'], string>> = {
    plate: 'border-cat-green-edge bg-paper text-paper-ink',
    empty: 'border-surface-3 bg-surface-3 text-paper',
    binned: 'border-dashed border-edge bg-paper text-paper-ink-2 line-through',
  }
  return (
    <ul className="flex gap-0.5" data-slots="">
      {places.map((place, index) => (
        <li key={index} data-place={place.state}>
          <span className="sr-only">
            Slot {index + 1}: {WORD[place.state]}
            {place.req === null ? '' : `, ticket ${ticketNo(place.req)}`}
          </span>
          <span aria-hidden="true" className={clsx('inline-flex h-6 min-w-7 items-center justify-center border-2 font-numeric text-size-micro leading-none', look[place.state])}>
            {place.req === null ? '' : ticketNo(place.req)}
          </span>
        </li>
      ))}
    </ul>
  )
}

const ticks = (value: number) => formatReadout(value)

/** A column head: the engine's term, and under it the unit, which says synthetic (D-048). */
const head = (term: string, unit: string) => (
  <>
    {term}
    <span className="block text-sm font-normal text-text-2">{unit}</span>
  </>
)

const COLUMNS: readonly MirrorColumn[] = [
  { key: 'step', head: 'Step' },
  { key: 'slots', head: 'Slots' },
  { key: 'busy', head: head('GPU busy', 'ticks, synthetic'), label: 'GPU busy, synthetic ticks', numeric: true },
  { key: 'bubble', head: head('Bubble', 'ticks, synthetic'), label: 'Bubble, synthetic ticks', numeric: true },
  { key: 'ghost', head: head('Ghost tokens', 'synthetic'), label: 'Ghost tokens, synthetic', numeric: true },
]

function rowOf(fire: FireView, lamp: boolean): MirrorRow {
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
      slots: <Slots places={fire.places} />,
      busy: ticks(fire.endUs - fire.startUs),
      bubble: ticks(fire.bubbleUs),
      ghost: ticks(fire.ghosts),
    },
  }
}

/** The rows of the mirror: the fires in the window the drawing shows, and one row that adds up the older ones. */
function rowsOf(view: LoopView): MirrorRow[] {
  const shown = windowOf(view, MIRROR_TICKS)
  const rows: MirrorRow[] = []
  if (shown.hidden > 0) {
    const older = view.fires.slice(0, shown.hidden)
    const sum = (pick: (fire: FireView) => number) => older.reduce((total, fire) => total + pick(fire), 0)
    rows.push({
      id: 'earlier',
      cells: {
        step: <span className="text-text-2">earlier: {shown.hidden}</span>,
        slots: <span className="text-text-2">not drawn</span>,
        busy: ticks(sum((fire) => fire.endUs - fire.startUs)),
        bubble: ticks(sum((fire) => fire.bubbleUs)),
        ghost: ticks(sum((fire) => fire.ghosts)),
      },
    })
  }
  const last = shown.fires.length - 1
  shown.fires.forEach((fire, index) => rows.push(rowOf(fire, index === last && !view.done)))
  return rows
}

const num = (value: number) => <span className="font-numeric">{formatReadout(value)}</span>

export function Mirror({ run }: { run: LoopRun }) {
  const { view } = run
  const c = view.counters
  return (
    // On a wide screen the table stands under the view and the tape under the controls, in the play's two columns; on a narrow one the
    // tape comes first.
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-start">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">
        <Tape view={view} />
      </div>
      <MirrorTable
        className="min-w-0 lg:col-start-1 lg:row-start-1"
        id={run.mirrorId}
        head="Mirror · the night so far"
        caption="Every fire in the window: its slots, how long the line was busy, the dark stretch before it, and its binned plates"
        summary={
          <>
            Fire {num(view.step)}. Clock {num(c.clockUs)} ticks{view.par === null ? '' : <> against par {num(view.par)}</>}. Plates {num(c.usefulTokens)}, binned plates {num(c.ghostTokens)}. Stations
            busy {num(c.gpuBusyUs)} ticks, dark {num(c.bubbleUs)} ticks, clips paid for, empty {num(c.emptyClipSteps)}. Every figure is a synthetic tick or token.
          </>
        }
        columns={COLUMNS}
        rows={rowsOf(view)}
        empty="No fire has been rung yet. Hang a ticket on the rail and ring the bell."
      />
    </div>
  )
}
