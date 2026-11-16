import { useDeltas } from '@/games/kit/moments'
import { DeltaChip } from '@/design/components/DeltaChip'
import { Stamp } from '@/design/components/Stamp'
import { formatReadout } from '@/design/format'
import type { FullView } from '@es/play/loop/full/types'
import { fullStripItems, hiddenReadout } from './strip'
import { stampWord, tagOf } from './tags'

/*
 * The full levels' readout strip (REDESIGN §2.6, §3.7): the stage's own metric, median TPOT, GPU busy, the bubble per step and one more, under
 * one stamp. Each number steps to its new value at once and its change stands over it for a second. Each µs keeps its tag for a screen reader.
 * A closed-book stage hides the live numbers, says so, and prints them once its run is served.
 */
export function FullReadout({ view }: { view: FullView }) {
  const items = fullStripItems(view)
  const deltas = useDeltas(Object.fromEntries(items.flatMap((item) => (item.value === null ? [] : [[item.id, item.value] as const]))))
  const hidden = hiddenReadout(view)
  const against = view.stage.sealed && !view.stage.closed ? null : view.stage.houseMetric
  return (
    <div className="es-loopstrip" data-loop-readout="" data-full-readout="" data-hidden={hidden || undefined}>
      <div className="es-loopstrip__head">
        <span>Readout</span>
        <Stamp word={stampWord(view)} />
      </div>
      {hidden ? (
        <p className="es-loopstrip__hidden" data-readout-hidden="">
          The live readout is hidden: this run is graded. Its numbers print once the run is served.
        </p>
      ) : null}
      <dl className="es-loopstrip__list">
        {items.map((item) => (
          <div key={item.id} className="es-loopstrip__item" data-readout-id={item.id}>
            <dt className="es-loopstrip__label">
              {item.label}
              {(item.id === 'clock' || item.id === 'capture') && against !== null ? <span className="es-loopstrip__ref"> · reference</span> : null}
            </dt>
            <dd className="es-loopstrip__value">
              {item.value === null ? <span className="es-loopstrip__unit">not yet</span> : formatReadout(item.value)}
              {item.unit === null || item.value === null ? null : <span className="es-loopstrip__unit">{item.unit}</span>}
              {item.unit === 'µs' && item.value !== null ? <span className="sr-only">, {tagOf(view, item.kind)}</span> : null}
              {(item.id === 'clock' || item.id === 'capture') && against !== null ? (
                <span className="es-loopstrip__unit es-loopstrip__ref">
                  {' · '}
                  <span className="font-numeric">{formatReadout(against)}</span>
                  <span className="sr-only"> µs for the reference run, {tagOf(view, 'host')}</span>
                </span>
              ) : null}
              {deltas[item.id] === undefined ? null : <DeltaChip key={deltas[item.id].key} value={deltas[item.id].value} className="es-loopstrip__delta" />}
            </dd>
          </div>
        ))}
      </dl>
      {against !== null ? <span className="sr-only">The second figure of the lead number is the reference run’s.</span> : null}
    </div>
  )
}
