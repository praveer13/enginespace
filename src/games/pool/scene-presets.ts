/*
 * The Reach-In's camera presets, as the page holds them (GAMES.md §2.6, "The Reach-In", Cameras; A§6.1: front, per-group filter, top):
 * three plates and `C` to cycle them. The page needs their names before the 3D chunk loads, so the names live here, with no three in
 * them; the framings depend on the size of the reach-in, and the scene's layout (scene-layout.ts) works them out for each level.
 *
 *   Front of the reach-in  Establish: the rail of the tickets on the line across the top, the rack of pans in the middle, and the pass
 *                          with the waiting tickets under its heat lamps at the bottom.
 *   One station            the same shot with only one station's tapes and twine: where one group's pages are, scattered over the
 *                          one pool (A§6.1's per-group filter). The page says which station. The first level has the same name; the
 *                          plate is in the camera's own group.
 *   From above             Top: straight down on the rack, the pans as a grid of sixteen to a row.
 */

export const POOL_CAMERAS = [
  { id: 'front', label: 'Front of the reach-in' },
  { id: 'station', label: 'One station' },
  { id: 'top', label: 'From above' },
] as const

export type PoolCamera = (typeof POOL_CAMERAS)[number]['id']

export const DEFAULT_CAMERA: PoolCamera = 'front'
