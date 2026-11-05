import { useMemo } from 'react'
import { frameSvg } from '@es/play/loop/layout'
import { fullFrame } from '@es/play/loop/full/layout'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { svgToReact } from '../svg'
import { useOrientation } from '../useOrientation'
import { tagOf } from './tags'
import type { FullRun } from './types'

/*
 * The full service's 2D view (GAMES.md §3 "2D path", §2.6): Service's pass drawn flat through the scene's own shot, with the full
 * service's objects in it (the mold rack, the padding, the comb, the allergy card; packages/play/loop/full/layout.ts). The picture holds
 * no number but a ticket's: every count is DOM, on the tape and in the mirror. Under it sit the line's light and the clock.
 */
export function FullView2D({ run }: { run: FullRun }) {
  const { view } = run
  const orientation = useOrientation()
  const drawing = useMemo(() => svgToReact(frameSvg(fullFrame(view, { orientation, shot: 'loop' }), { cover: true })), [view, orientation])
  const capture = view.stage.metric === 'capture'
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-loop-view="" data-full-view="" data-orientation={orientation}>
      <div className="relative min-h-0 flex-1 overflow-hidden [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full [&>svg]:w-full" data-loop-drawing="">
        {drawing}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 pb-2">
        <StationLight lit={view.lineLit} label="The line" size="sm" />
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{capture ? 'Capture cost' : 'Clock'}</span>
          <Readout value={capture ? view.counters.captureUs : view.clockUs} unit="µs" tag={tagOf(view, 'expo')} size="sm" />
          <span>against the house</span>
          <Readout value={view.stage.houseMetric} unit="µs" tag={tagOf(view, 'expo')} size="sm" />
        </span>
      </div>
    </div>
  )
}
