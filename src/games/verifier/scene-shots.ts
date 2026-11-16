/*
 * The rejection sampler's camera shots as the page names them (GAMES.md §2.6): their ids and the words on their buttons.
 * The page holds them, so its buttons and the `C` key stand before the 3D chunk loads, and hands them to the scene, whose plan
 * (scene-plan.ts) frames each one. Only the page imports this file: a module that the page and the scene both imported would join the
 * page's chunk, and the scene would reach the whole game through it.
 */

export type ShotId = 'run' | 'course' | 'walk'

export interface Shot {
  readonly id: ShotId
  readonly label: string
}

export const TASTING_SHOTS: readonly Shot[] = [
  { id: 'run', label: 'Over the run' },
  { id: 'course', label: 'One draft position' },
  { id: 'walk', label: 'Follow the target' },
]

export const DEFAULT_PRESET: ShotId = 'run'
