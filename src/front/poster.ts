/*
 * The poster (ARCHITECTURE §6.11, TRACKER W0-T18): the front page's first picture, painted before any script runs and kept until the
 * 3D pass swaps in for it. It is the 2D view's first frame: the practice seed of the first level of "First service", as a view of the
 * session, laid out by `layoutFrame` through the front page's shot and written as SVG by `frameSvg`, the same pure code the 2D view
 * draws with and the one scripts/posters.ts writes to public/posters/. So the picture in the static HTML is the picture the 2D view
 * paints when the page takes over, and tests/front/shell.test.ts holds the inlined markup to the posters, byte for byte.
 *
 * Both orientations are inlined, because the static HTML cannot know the screen: the landscape frame, and the portrait one a phone's
 * camera stands back for (GAMES.md §2.3). front.css shows the one that fits, at the 2D view's own breakpoint, and places it where the
 * 3D scene's picture stands: centred under the stacked layout, shifted right from 80rem and down on a phone, as the scene's lens is.
 *
 * The front page's run is practice on a pinned seed (D-038), so the poster, the first paint and the challenge are the same for every
 * visitor.
 */
import { frameSvg, layoutFrame, type Orientation } from '@es/play/loop/layout'
import { loopInit, loopLevel, loopView } from '@es/play/loop/session'
import type { SvgNode } from '@es/play/loop/svg'
import type { LoopView } from '@es/play/loop/types'

/** The level and seed the front page opens on: the first level of the run, on its practice seed (packages/play/loop/entry.ts). */
export const POSTER_LEVEL = 'first-1-fill'
export const POSTER_SEED = 1

export const ORIENTATIONS: readonly Orientation[] = ['landscape', 'portrait']

/** The session's first view at the poster's level and seed. */
export function posterView(): LoopView {
  return loopView(loopInit(loopLevel(POSTER_LEVEL, POSTER_SEED)))
}

/** The drawing of a view in one orientation, through the front page's shot (it draws no printer: the page holds its own). */
export function passDrawing(view: LoopView, orientation: Orientation): SvgNode {
  return frameSvg(layoutFrame(view, { orientation, shot: 'front' }))
}
