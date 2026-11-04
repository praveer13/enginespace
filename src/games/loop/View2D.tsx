import { useMemo } from 'react'
import { frameSvg, layoutFrame } from '@es/play/loop/layout'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { svgToReact } from './svg'
import type { LoopRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * Service's 2D view (GAMES.md §3 "2D path", §2.6 "Service"): the pass, drawn flat. It is an SVG of the same two lanes and the same
 * places that the 3D scene draws, with the printer and its waiting tickets, the rail, and (while a fire is on the line) the fired
 * rail. The picture holds no number but a ticket's number and the axis: every count is DOM, on the printer's tape and in the mirror,
 * so the drawing carries nothing unique (D-021, GAMES.md §2.6 rule 7). Under it sit the line's own light and the clock, which are
 * the design system's StationLight and Readout.
 *
 * The drawing is `layoutFrame` of the view, written as SVG by `frameSvg`: the same pure function that scripts/posters.ts uses, so
 * the front page's poster is this view's first frame. Below 480 px wide it takes the portrait layout, where time runs down a
 * phone's height (GAMES.md §2.3).
 */

export function View2D({ run }: { run: LoopRun }) {
  const { view } = run
  const orientation = useOrientation()
  const drawing = useMemo(() => svgToReact(frameSvg(layoutFrame(view, { orientation }))), [view, orientation])
  return (
    <div className="flex flex-col gap-3" data-loop-view="" data-orientation={orientation}>
      <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{drawing}</div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <StationLight lit={view.lineLit} label="The line" size="sm" />
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>Clock</span>
          <Readout value={view.clockUs} unit="ticks" tag="synthetic" size="sm" />
          {view.par === null ? null : (
            <>
              <span>against par</span>
              <Readout value={view.par} unit="ticks" tag="synthetic" size="sm" />
            </>
          )}
        </span>
      </div>
    </div>
  )
}
