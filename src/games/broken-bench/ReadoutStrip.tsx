import { Stamp } from '@/design/components/Stamp'
import { DeltaChip } from '@/design/components/DeltaChip'
import { formatReadout } from '@/design/format'
import { useDeltas } from '@/games/kit/moments'
import type { DeskApi } from './desk'
import type { BenchRun } from './types'

/*
 * Broken benchmark's readout strip (REDESIGN §2.6, §3.5): the reported p99, the p99 the log gives at the switch's and the cut's settings,
 * the requests measured, and the requests sent late; one stamp for the strip. Each changes at once when the learner moves the switch or the
 * cut, and the change sits beside it for one second (the kit's delta). A graded attempt does not say where the p99 sits (ASSESSMENT §4.3):
 * the measured p99 is left out, and so is its delta, and the learner finds the p99 by counting down the tail.
 */

/** Tenths of a millisecond, so the delta is a whole number to compare. */
const tenths = (us: number): number => Math.round(us / 100)

export function ReadoutStrip({ run, desk }: { run: BenchRun; desk: DeskApi | null }) {
  const scene = run.view.scene
  const practice = run.mode === 'practice'
  const items =
    scene === null || desk === null
      ? []
      : [
          { id: 'reported', label: 'reported p99, ms', count: tenths(scene.claim.valueUs), shown: <>{formatReadout(scene.claim.valueUs / 1000, 1)}</>, digits: 1 },
          ...(practice ? [{ id: 'measured', label: 'p99 now, ms', count: tenths(desk.reading.p99Us), shown: <>{formatReadout(desk.reading.p99Us / 1000, 1)}</>, digits: 1 }] : []),
          { id: 'requests', label: 'requests measured', count: desk.reading.n, shown: <>{formatReadout(desk.reading.n)}</>, digits: 0 },
          { id: 'late', label: 'sent late', count: scene.facts.lateSends, shown: <>{formatReadout(scene.facts.lateSends)}</>, digits: 0 },
        ]
  const deltas = useDeltas(Object.fromEntries(items.map((item) => [item.id, item.count])))
  return (
    <div className="es-bench-strip" data-bench-readout="">
      <div className="es-bench-strip__head">
        <span>Readout</span>
        <Stamp word="synthetic" />
      </div>
      <dl className="es-bench-strip__list">
        {items.map((item) => (
          <div key={item.id} className="es-bench-strip__item" data-readout-id={item.id}>
            <dt className="es-bench-strip__label">{item.label}</dt>
            <dd className="es-bench-strip__value font-numeric">
              {item.shown}
              {deltas[item.id] === undefined ? null : (
                <DeltaChip key={deltas[item.id].key} value={item.digits === 1 ? deltas[item.id].value / 10 : deltas[item.id].value} digits={item.digits} className="es-bench-strip__delta" />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
