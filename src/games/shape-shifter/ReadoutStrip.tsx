import type { ReactNode } from 'react'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Stamp } from '@/design/components/Stamp'
import { useDeltas } from '@/games/kit/moments'
import type { ShiftView } from '@es/play/shape-shifter/view'

/*
 * Tensor views' readout strip (GAMES.md §4.1, REDESIGN §2.6): four numbers in the numeric face, with one stamp for the strip. On the view
 * levels: copies, elements moved, operations, and the elements already in the target's order. On `grid`: programs, lanes, masked lanes and the
 * elements covered. A number changes at once when an operation lands, and its change sits beside it for one second (the kit's delta).
 * A graded `grid` shows its counts after Launch, not before, so that sweeping the steppers reads nothing.
 */

interface Item {
  readonly id: string
  readonly label: string
  /** What a reader who cannot see the strip's width hears after the label. */
  readonly more?: string
  readonly count: number
  readonly value: ReactNode
}

const num = (value: number) => <span className="font-numeric">{value}</span>

function itemsOf(view: ShiftView): { items: readonly Item[]; hidden: boolean } {
  if (view.grid !== null) {
    const r = view.grid.readouts
    return {
      hidden: !view.grid.readoutsShown,
      items: [
        { id: 'programs', label: 'programs', count: r.programs, value: num(r.programs) },
        { id: 'lanes', label: 'lanes', count: r.lanes, value: num(r.lanes) },
        { id: 'masked', label: 'masked lanes', count: r.masked, value: num(r.masked) },
        { id: 'covered', label: 'covered', count: r.covered, value: <>{num(r.covered)} of {num(r.of)}</> },
      ],
    }
  }
  const r = view.layout?.readouts ?? { copies: 0, moved: 0, operations: 0, inPlace: 0, of: 0 }
  return {
    hidden: false,
    items: [
      { id: 'copies', label: 'copies', count: r.copies, value: num(r.copies) },
      { id: 'moved', label: 'elements moved', count: r.moved, value: num(r.moved) },
      { id: 'operations', label: 'operations', count: r.operations, value: num(r.operations) },
      { id: 'in-place', label: 'in order', more: ' with the target', count: r.inPlace, value: <>{num(r.inPlace)} of {num(r.of)}</> },
    ],
  }
}

export function ReadoutStrip({ view }: { view: ShiftView }) {
  const { items, hidden } = itemsOf(view)
  const deltas = useDeltas(Object.fromEntries(items.map((item) => [item.id, hidden ? 0 : item.count])))
  return (
    <div className="es-shift-strip" data-shift-readout="" data-hidden={hidden || undefined}>
      <div className="es-shift-strip__head">
        <span>Readout</span>
        <Stamp word="synthetic" className="es-shift-strip__stamp" />
      </div>
      <dl className="es-shift-strip__list">
        {items.map((item) => (
          <div key={item.id} className="es-shift-strip__item" data-readout-id={item.id} data-callout-above="">
            <dt className="es-shift-strip__label">
              {item.label}
              {item.more === undefined ? null : <span className="sr-only">{item.more}</span>}
            </dt>
            <dd className="es-shift-strip__value font-numeric">
              {hidden ? <span aria-label="shown after Launch">–</span> : item.value}
              {hidden || deltas[item.id] === undefined ? null : <DeltaChip key={deltas[item.id].key} value={deltas[item.id].value} className="es-shift-strip__delta" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
