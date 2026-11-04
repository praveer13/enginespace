import type { ReactNode } from 'react'
import type { LoopView } from '@es/play/loop/types'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'

/*
 * The printer tape (GAMES.md §2.6, "Service"; D-048): the live readout. It prints the fire's number, the ticks the step took and
 * the stations busy, and the counters of GAMES.md §3: plates (useful tokens), binned plates (ghost tokens), the dark stretches
 * (bubbles), the clock against par, and the clips the line paid for and nobody ate. The front page's clock is synthetic ticks, so
 * every figure is a Readout that says so.
 *
 * It is DOM and it is independent of the view: the 2D view, the 3D scene and the mirror all draw the same night, and none of them
 * is the only place a number shows.
 */

/** The kitchen's word, then the engine's term (GAMES.md §2.6, rule 2). */
const pair = (kitchen: string, engine: string): ReactNode => (
  <>
    {kitchen} <span className="text-text-2">· {engine}</span>
  </>
)

function linesOf(view: LoopView): PrinterTapeLine[] {
  const c = view.counters
  const ticks = (value: number) => <Readout value={value} unit="ticks" tag="synthetic" size="sm" />
  return [
    { id: 'fire', label: pair('fire', 'step'), value: <Readout value={view.step} pad={4} tag="synthetic" size="sm" /> },
    { id: 'step-ticks', label: 'ticks per step', value: view.stepTicks === null ? <span>not yet</span> : ticks(view.stepTicks) },
    {
      id: 'clock',
      label: view.par === null ? 'clock' : pair('clock', 'against par'),
      value:
        view.par === null ? (
          ticks(c.clockUs)
        ) : (
          <>
            {ticks(c.clockUs)} <span>against</span> {ticks(view.par)}
          </>
        ),
    },
    { id: 'busy', label: pair('stations busy', 'GPU busy'), value: ticks(c.gpuBusyUs) },
    { id: 'dark', label: pair('dark stretches', 'bubble'), value: ticks(c.bubbleUs), tone: c.bubbleUs > 0 ? 'ink-2' : 'ink' },
    { id: 'plates', label: pair('plates', 'useful tokens'), value: <Readout value={c.usefulTokens} unit="tokens" tag="synthetic" size="sm" /> },
    {
      id: 'binned',
      label: pair('binned plates', 'ghost tokens'),
      value: <Readout value={c.ghostTokens} unit="tokens" tag="synthetic" size="sm" />,
      tone: c.ghostTokens > 0 ? 'ink-2' : 'ink',
    },
    {
      id: 'empty',
      label: 'clip paid for, empty',
      value: <Readout value={c.emptyClipSteps} unit="slots" tag="synthetic" size="sm" />,
      tone: c.emptyClipSteps > 0 ? 'ink-2' : 'ink',
    },
  ]
}

export function Tape({ view }: { view: LoopView }) {
  return (
    <PrinterTape
      label="The printer: the night so far, in synthetic ticks"
      lines={linesOf(view)}
      feed={view.step}
      empty="Nothing printed yet"
    />
  )
}
