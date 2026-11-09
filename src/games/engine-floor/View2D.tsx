import { useId, useMemo, useState } from 'react'
import { frameSvg, layoutMap, mapOfView } from '@es/play/engine-floor/layout'
import { placeName } from '@es/play/engine-floor/words'
import { TapeLabel } from '@/design/components/TapeLabel'
import { inkIn, svgToReact } from './svg'
import type { FloorRun } from './types'
import { useOrientation } from './useOrientation'

/*
 * Back of House's 2D view (GAMES.md §5 "2D path", §2.6 "Back of House"): the house in section, drawn flat. It is an SVG of the floors, the
 * lanes on them, the route the ticket has taken and the stops it has been pencilled for, with the ticket standing where the last stop
 * that held left it and the heat lamp over the end of the laid path. The picture holds no number but a stage's number: every fact in it
 * is also in the mirror, and every count is DOM (D-021, GAMES.md §2.6 rule 7).
 *
 * The drawing is `layoutMap` of the view, written as SVG by `frameSvg`. The house is built when the prediction is written down, and
 * from then nothing in it moves when a stage is laid. Below 480 px wide it takes the portrait layout, where the route runs down a
 * phone's height (GAMES.md §2.3).
 *
 * Motion has one moment. When a run gets the ticket further, its new stops are inked in one after another in the printer's line steps,
 * and the stop that did not hold arrives last, in the ribbon's red. Under reduced motion every duration is 0 and they are simply there.
 */

/** The stops of the last run that are new: the stages from `from` up to `to`. They keep their mark until the next run changes the picture. */
interface Ink {
  readonly reached: number
  readonly stopped: number | null
  readonly from: number
  readonly to: number
}

export function View2D({ run }: { run: FloorRun }) {
  const { view } = run
  const orientation = useOrientation()
  const id = useId().replaceAll(/\W/g, '')

  // (Adjusting state when the view changes: React re-renders at once.)
  const stopped = view.stop === null ? null : view.stop.at
  const [ink, setInk] = useState<Ink>({ reached: view.reached, stopped, from: 0, to: 0 })
  if (ink.reached !== view.reached || ink.stopped !== stopped) {
    const grew = view.reached > ink.reached
    const arrived = stopped !== null && ink.stopped === null
    const from = grew ? ink.reached : view.reached
    const to = grew || arrived ? view.reached + (stopped === null ? 0 : 1) : view.reached
    setInk({ reached: view.reached, stopped, from, to })
  }

  const drawing = useMemo(() => {
    const tree = frameSvg(layoutMap(mapOfView(view), { orientation }), id)
    return svgToReact(ink.to > ink.from ? inkIn(tree, ink.from, ink.to) : tree)
  }, [view, orientation, id, ink])
  return (
    <div className="flex flex-col gap-3" data-floor-view="" data-orientation={orientation}>
      <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{drawing}</div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TapeLabel size="sm">the ticket</TapeLabel>
        <span>
          stands at <code className="es-type-mono">{placeName(view.capsule)}</code>
        </span>
      </p>
    </div>
  )
}
