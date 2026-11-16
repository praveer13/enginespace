import type { ReactNode } from 'react'
import type { LoopView } from '@es/play/loop/types'
import { PrinterTape, type PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
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

function linesOf(view: LoopView): PrinterTapeLine[] {
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
  return <PrinterTape label="Step readout, in synthetic ticks" lines={linesOf(view)} feed={view.step} empty="Nothing has run yet" stamp="synthetic ticks" />
}
