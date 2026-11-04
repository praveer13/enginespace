/**
 * Service's record in the game registry (ARCHITECTURE §6.3, D-049): what is known about the game without running it, which the
 * Play index, the static-routes script and `verify:games` read. It is data and one loader. The rules load with the game
 * (`session`, below), so the registry never pulls the sim into a page that only lists games.
 *
 * Practice seeds are pinned here as plain numbers because this file may not import the levels (they import the sim). Each is the
 * first seed from 0 that the level's band accepts (GAMES.md §2.1), and tests/play/loop.test.ts checks that it still is.
 */
import type { GameEntry } from '../types'

export const LOOP: GameEntry = {
  id: 'loop',
  // The home module first (GAMES.md §0): TR2 continues the front-page run with its graded levels, and TR6 adds the mask lane.
  modules: ['tr2', 'tr6'],
  title: 'Service',
  subtitle: 'the step loop',
  // The 3D scene is src/games/loop/Scene3D.tsx (W0-T17).
  has3d: true,
  kcs: ['tr2.bubble', 'tr2.async-overlap'],
  keys: [{ id: 'overlap', code: 'KeyO', label: 'O', description: 'Write the next call during this fire (overlap)' }],
  levels: [
    { id: 'first-1-fill', title: 'Fill the rail', graded: false, practiceSeed: 1 },
    { id: 'first-2-slot', title: 'A clip empties', graded: false, practiceSeed: 1 },
    { id: 'first-3-gap', title: 'Mind the gap', graded: false, practiceSeed: 1 },
    { id: 'first-4-par', title: 'Your turn', graded: false, practiceSeed: 1 },
  ],
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
  session: async () => (await import('./session')).loopSession,
}
