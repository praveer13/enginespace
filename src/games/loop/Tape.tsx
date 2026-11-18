import type { ReactNode } from 'react'
import type { LoopView } from '@es/play/loop/types'
import { DeltaChip } from '@/design/components/DeltaChip'
import { ReadoutStrip, type ReadoutStripLine } from '@/design/components/ReadoutStrip'
import { Readout } from '@/design/components/Readout'
import { Stamp } from '@/design/components/Stamp'
import { formatReadout } from '@/design/format'
import { readoutItems } from './strip'
import { stepClockOf } from './readout'

/*
 * The step readout (D-048): the live numbers of a run. It prints the step's number, the ticks the step took and the slots live, and the
 * counters of GAMES.md §3: output tokens (useful tokens), ghost tokens, the bubbles, the clock against the reference run, and the slots
 * the GPU paid for and nobody used. The front page's clock is synthetic ticks, so every figure is a Readout that says so.
 *
 * It is DOM and it is independent of the view: the 2D view, the 3D scene and the mirror all draw the same run, and none of them is the
 * only place a number shows. The readout is stamped "synthetic ticks" once at its head; each figure keeps its own tag for a screen reader.
 */

/** The step clock, or "not yet" before the first step. */
function stepTicksLine(view: LoopView): ReactNode {
  const clock = stepClockOf(view)
  return clock === null ? <span>not yet</span> : <Readout value={clock} unit="ticks" tag="synthetic" size="sm" />
}

function linesOf(view: LoopView): ReadoutStripLine[] {
  const c = view.counters
  const ticks = (value: number) => <Readout value={value} unit="ticks" tag="synthetic" size="sm" />
  return [
    { id: 'fire', label: 'step', value: <Readout value={view.step} pad={4} tag="synthetic" size="sm" /> },
    { id: 'step-ticks', label: 'ticks per step', value: stepTicksLine(view) },
    {
      id: 'clock',
      label: view.par === null ? 'clock' : 'clock against the reference',
      value:
        view.par === null ? (
          ticks(c.clockUs)
        ) : (
          <>
            {ticks(c.clockUs)} <span>against</span> {ticks(view.par)}
          </>
        ),
    },
    { id: 'busy', label: 'GPU busy', value: ticks(c.gpuBusyUs) },
    { id: 'dark', label: 'bubble', value: ticks(c.bubbleUs), tone: c.bubbleUs > 0 ? 'ink-2' : 'ink' },
    { id: 'plates', label: 'output tokens', value: <Readout value={c.usefulTokens} unit="tokens" tag="synthetic" size="sm" /> },
    {
      id: 'binned',
      label: 'ghost tokens',
      value: <Readout value={c.ghostTokens} unit="tokens" tag="synthetic" size="sm" />,
      tone: c.ghostTokens > 0 ? 'ink-2' : 'ink',
    },
    {
      id: 'empty',
      label: 'empty slots, paid for',
      value: <Readout value={c.emptyClipSteps} unit="slots" tag="synthetic" size="sm" />,
      tone: c.emptyClipSteps > 0 ? 'ink-2' : 'ink',
    },
  ]
}

export function Tape({ view }: { view: LoopView }) {
  return <ReadoutStrip label="Step readout, in synthetic ticks" lines={linesOf(view)} feed={view.step} empty="Nothing has run yet" stamp="synthetic ticks" />
}

/**
 * The readout strip in the instrument frame's dock (REDESIGN §2.6, §3.1): step · tokens out · GPU busy · GPU idle, and on the levels with
 * async scheduling the ghost tokens, with the clock against the reference's where the level has one. One stamp for the strip; each number
 * steps to its new value at once and its change stands over it for a second (the kit's delta).
 */
export function LoopReadout({ view, deltas }: { view: LoopView; deltas: Readonly<Record<string, { value: number; key: number }>> }) {
  const c = view.counters
  const items = readoutItems(view)
  return (
    <div className="es-loopstrip" data-loop-readout="">
      <div className="es-loopstrip__head">
        <span>Readout</span>
        <Stamp word="synthetic" />
      </div>
      <dl className="es-loopstrip__list">
        {items.map((item) => (
          <div key={item.id} className="es-loopstrip__item" data-readout-id={item.id}>
            <dt className="es-loopstrip__label">{item.label}</dt>
            <dd className="es-loopstrip__value">
              {formatReadout(item.value)}
              {item.unit === null ? null : <span className="es-loopstrip__unit">{item.unit}</span>}
              {item.id === 'clock' && view.par !== null ? (
                <span className="es-loopstrip__unit">
                  {' · '}
                  <span className="font-numeric">{formatReadout(view.par)}</span>
                </span>
              ) : null}
              {deltas[item.id] === undefined ? null : <DeltaChip key={deltas[item.id].key} value={deltas[item.id].value} className="es-loopstrip__delta" />}
            </dd>
          </div>
        ))}
      </dl>
      <span className="sr-only">
        Every figure is a synthetic tick or token. GPU busy {c.gpuBusyUs} ticks, idle {c.bubbleUs} ticks.
      </span>
    </div>
  )
}
