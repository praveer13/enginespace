/**
 * Service's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the
 * Play index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game
 * (`session`, below), so the registry never pulls the sim into a page that only lists games.
 *
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the
 * first seed from 0 that the level's band accepts (GAMES.md §2.1), and tests/play/loop.test.ts checks that it still is.
 */
import type { GameEntry, LevelEntry } from '../types'

/** The front page's run, "First service" (GAMES.md §3.1): the four levels the front page walks, and nothing after them. */
export const FIRST_SERVICE: readonly LevelEntry[] = [
  { id: 'first-1-fill', title: 'Fill the rail', graded: false, practiceSeed: 1 },
  { id: 'first-2-slot', title: 'A clip empties', graded: false, practiceSeed: 1 },
  { id: 'first-3-gap', title: 'Mind the gap', graded: false, practiceSeed: 1 },
  { id: 'first-4-par', title: 'Your turn', graded: false, practiceSeed: 1 },
]

/**
 * TR2's levels and TR6's mask lane, "the full service" (GAMES.md §3.2; W1-T13): practice levels on µs of the model's clock, each a few
 * stages that `[` and `]` move between. `keys` waits for the owner's dispatcher tables (Q-10) and `close` is W1-T14's.
 */
export const FULL_SERVICE: readonly LevelEntry[] = [
  { id: 'async', title: 'Write during the fire', graded: false, practiceSeed: 0, stages: ['70b', 'small'] },
  { id: 'graphs', title: 'Drilled routines', graded: false, practiceSeed: 0, stages: ['comb', 'sizes', 'modes'] },
  { id: 'mrv2', title: 'The V2 runner', graded: false, practiceSeed: 0, stages: ['small', '70b'] },
  { id: 'mask', title: 'The allergy card', graded: false, practiceSeed: 0, stages: ['mask'] },
]

/** The keys that the full service alone binds; the first service, on the front page and on Service's page, neither binds nor lists them. */
export const FULL_SERVICE_KEYS: readonly string[] = ['graph-mode', 'runner']

export const LOOP: GameEntry = {
  id: 'loop',
  // The home module first (GAMES.md §0): TR2 continues the front-page run with its graded levels, and TR6 adds the mask lane.
  modules: ['tr2', 'tr6'],
  title: 'Service',
  subtitle: 'the step loop',
  // The 3D scene is src/games/loop/Scene3D.tsx (W0-T17).
  has3d: true,
  kcs: ['tr2.bubble', 'tr2.async-overlap'],
  keys: [
    { id: 'overlap', code: 'KeyO', label: 'O', description: 'Write the next call during this fire (overlap)' },
    { id: 'graph-mode', code: 'KeyG', label: 'G', description: 'Cycle the CUDA-graph mode (the full service)' },
    { id: 'runner', code: 'KeyM', label: 'M', description: 'Switch the model runner (the full service)' },
  ],
  levels: [...FIRST_SERVICE, ...FULL_SERVICE],
  card: 'trace-room-steploop',
  claims: [
    'loop.world.plan-ticks',
    'loop.world.forward-ticks',
    'loop.world.admit-ticks',
    'loop.world.read-ticks',
    'loop.world.clips',
    'loop.world.step-ticks-serial',
    'loop.world.step-ticks-overlap',
    'loop.anchor.tpot-conc-4',
    'loop.anchor.tpot-conc-64',
    'loop.anchor.tpot-ratio',
    'loop.anchor.tput-ratio',
  ],
  // Both services' rules, one session keyed by the level (./game.ts); the front page imports the first service's alone.
  session: async () => (await import('./game')).serviceSession,
}
