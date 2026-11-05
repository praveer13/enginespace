import type { ReactNode } from 'react'
import type { FullView } from '@es/play/loop/full/types'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { stampOf, tagOf } from './tags'

/*
 * The full service's printer tape (GAMES.md §2.6, "the printer tape"; D-048): the live readout in µs on the model's clock, with the
 * cost card's tags. It prints the fire's number, the µs between the last two fires, the clock against the house's, the line busy and the
 * dark stretches, plates and binned plates, padded places, the expo's calls and the fires it called dish by dish; on the mold rack the
 * capture cost, and on the mask level the allergy card's µs. Stamped once at its head; each figure keeps its tag for a screen reader.
 */

const pair = (kitchen: string, engine: string): ReactNode => (
  <>
    {kitchen} <span className="text-text-2">· {engine}</span>
  </>
)

function linesOf(view: FullView): PrinterTapeLine[] {
  const c = view.counters
  const us = (value: number, kind: 'line' | 'expo') => <Readout value={value} unit="µs" tag={tagOf(view, kind)} size="sm" />
  const count = (value: number) => <Readout value={value} tag={tagOf(view, 'count')} size="sm" />
  const capture = view.stage.metric === 'capture'
  const lines: PrinterTapeLine[] = [
    {
      id: 'fire',
      label: pair('fire', 'step'),
      value:
        view.nightFires === null ? (
          <span>not yet</span>
        ) : (
          <>
            <Readout value={view.step} pad={2} tag={tagOf(view, 'count')} size="sm" /> <span>of</span> <Readout value={view.nightFires} pad={2} tag={tagOf(view, 'count')} size="sm" />
          </>
        ),
    },
    { id: 'step-us', label: pair('step time', 'between two fires'), value: view.stepUs === null ? <span>not yet</span> : us(view.stepUs, 'expo') },
    {
      id: 'clock',
      label: pair(capture ? 'cost' : 'clock', 'against the house'),
      value: (
        <>
          {us(capture ? c.captureUs : c.clockUs, 'expo')} <span>against</span> {us(view.stage.houseMetric, 'expo')}
        </>
      ),
    },
    { id: 'busy', label: pair('line busy', 'GPU busy'), value: us(c.gpuBusyUs, 'line') },
    { id: 'dark', label: pair('dark stretches', 'bubble'), value: us(c.bubbleUs, 'expo'), tone: c.bubbleUs > 0 ? 'ink-2' : 'ink' },
    { id: 'plates', label: pair('plates', 'useful tokens'), value: count(c.usefulTokens) },
    { id: 'binned', label: pair('binned plates', 'ghost tokens'), value: count(c.ghostTokens), tone: c.ghostTokens > 0 ? 'ink-2' : 'ink' },
    { id: 'padded', label: pair('empty mold places', 'padded tokens'), value: count(c.paddedTokens), tone: c.paddedTokens > 0 ? 'ink-2' : 'ink' },
    { id: 'calls', label: pair('calls', 'launches'), value: count(c.launches) },
    { id: 'eager', label: pair('dish by dish', 'eager fires'), value: count(c.eagerSteps), tone: c.eagerSteps > 0 ? 'ink-2' : 'ink' },
  ]
  if (view.allergy !== null) lines.push({ id: 'mask', label: pair('allergy card', 'mask µs'), value: us(c.maskUs, 'expo') })
  if (view.counters.tpotP50Us !== null) lines.push({ id: 'tpot', label: pair('per course', 'TPOT p50'), value: us(view.counters.tpotP50Us, 'expo') })
  return lines
}

export function FullTape({ view }: { view: FullView }) {
  return <PrinterTape label="The printer: the night so far, in µs on the model's clock" lines={linesOf(view)} feed={`${view.at}|${view.step}`} empty="Nothing printed yet" stamp={stampOf(view)} />
}
