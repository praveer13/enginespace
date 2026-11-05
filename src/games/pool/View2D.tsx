import { Pass, Shelf } from './Pass'
import { Rack, Rotation } from './Rack'
import type { PoolRun } from './types'
import type { Dump } from './dump'

/*
 * The Reach-In's 2D view (GAMES.md §8 "2D path", §2.6): the cabinet of pans in rows of sixteen, the rotation along its base, and the pass
 * in front of it, with the recipe kits on their shelf. It is the same kitchen as the 3D scene's (W1-T24), drawn flat, from the same view:
 * the first paint, and the path of a device that draws no 3D. It is DOM, built from the design system's own objects (the hotel pan, the
 * ticket, masking tape and the printer's dots), and it holds no fact the mirror does not: the drawing is hidden from assistive technology,
 * and the table beside it lists every figure it shows.
 */

export function View2D({ run, dump, pointed, pick = true }: { run: PoolRun; dump: Dump; pointed: readonly number[]; pick?: boolean }) {
  const { view } = run
  return (
    <div className="es-reachin" data-pool-view="">
      <p className="es-type-body max-w-prose" data-pool-prompt="">
        {view.prompt}
      </p>
      <Rack view={view} dump={dump} pointed={pointed} pick={pick} />
      <Rotation view={view} dump={dump} pointed={pointed} />
      <Pass view={view} />
      <Shelf view={view} />
    </div>
  )
}
