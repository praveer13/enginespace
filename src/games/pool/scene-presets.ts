/*
 * KV page pool's camera presets in the 3D view, as the page holds them (A§6.1: front, per-group filter, top): three buttons and `C` to
 * cycle them. The page needs their names before the 3D chunk loads, so the names live here, with no three in them; the framings depend on
 * the size of the pool, and the scene's layout (scene-layout.ts) works them out for each level. The ids are the first ones and do not
 * change; the labels are display copy.
 *
 *   Front of the page pool  the running requests across the top, the pool's pages in the middle, the waiting requests at the bottom.
 *   One KV group            the same shot with only one group's pages and threads: where one group's pages are, scattered over the one
 *                           pool (A§6.1's per-group filter). The page says which group.
 *   From above              straight down on the pool, the pages as a grid of sixteen to a row.
 */

export const POOL_CAMERAS = [
  { id: 'front', label: 'Front of the page pool' },
  { id: 'station', label: 'One KV group' },
  { id: 'top', label: 'From above' },
] as const

export type PoolCamera = (typeof POOL_CAMERAS)[number]['id']

export const DEFAULT_CAMERA: PoolCamera = 'front'
