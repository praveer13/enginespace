import { useMemo } from 'react'
import { frameSvg, layoutFrame, PASS_LENS } from '@es/play/loop/layout'
import { Readout } from '@/design/components/Readout'
import { StationLight } from '@/design/components/StationLight'
import { FrameTapes } from './FrameTapes'
import { svgToReact } from './svg'
import type { LoopRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * Service's 2D view (GAMES.md §3 "2D path", §2.6 "Service"): the pass, drawn flat at the scale the 3D scene draws it. It is an SVG of
 * the same kitchen through the same shot, over the expediter's shoulder: the room and its hood, the line burning or cold, the rail and
 * its tickets, the heat lamps and their pools on the pass, the plates of the last fire, the printer and its waiting tickets, and (while
 * a fire is on the line) the fired rail. The picture holds no number but a ticket's number: every count is DOM, on the printer's tape
 * and in the mirror, so the drawing carries nothing unique (D-021, GAMES.md §2.6 rule 7). The kitchen's names are the design system's
 * tape in the DOM over it, each stuck on what it names (FrameTapes.tsx), so they read at the size ramp's smallest step or larger at any
 * width. Under it sit the line's own light and the clock, which are the design system's StationLight and Readout.
 *
 * The drawing is `layoutFrame` of the view through Service's own shot, written as SVG by `frameSvg`. In landscape it covers its box as the
 * scene does: the shot's full height, its sides cut where the box is narrower than the frame. Below 480 px wide it takes the portrait shot
 * through a wider lens (`PASS_LENS`), fitted to the box's width, so the whole pass stays in view on a phone: the printer that issues the
 * tickets at its left, and the bell and the spike at its right. The room the frame draws past its edges fills a taller box above and
 * below it. The box is a size container, so the tapes' print scales with it.
 */

export function View2D({ run }: { run: LoopRun }) {
  const { view } = run
  const orientation = useOrientation()
  const phone = orientation === 'portrait'
  const frame = useMemo(() => layoutFrame(view, { orientation, shot: 'loop', ...(phone ? { lens: PASS_LENS } : {}) }), [view, orientation, phone])
  const drawing = useMemo(() => svgToReact(frameSvg(frame, { cover: !phone })), [frame, phone])
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-loop-view="" data-orientation={orientation}>
      <div className="relative min-h-0 flex-1 overflow-hidden [container-type:size] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full [&>svg]:w-full" data-loop-drawing="">
        {drawing}
        <FrameTapes frame={frame} fit={phone ? 'contain' : 'cover'} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 pb-2">
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
