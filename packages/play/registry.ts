/**
 * The game registry (ARCHITECTURE §6.3, D-049): one record per game, with the display name and subtitle that the learner sees,
 * the knowledge components, whether it has a 3D scene, the keys it binds, its levels, its card and its sources. The page, the
 * Play index, the static-routes script and `verify:games` all read it, and none keeps a list of games of its own.
 *
 * It holds data and a loader for each game's session, never the rules themselves: importing the registry costs a page the
 * records and not the games. `src/games/registry.ts` maps the same ids to the lazy components (kernelspace's PLAY_REGISTRY
 * pattern), and `verify:games` fails when the two disagree.
 *
 * A game joins by adding its entry to `GAMES` below. W0-T16 added `loop`, the first, and W1-T28 added `verifier`.
 *
 * The keys and `levelOf` are in keys.ts, and this module re-exports them. The front page reads those and no game's record besides
 * Service's, and its first-paint closure (D-023) is gated: with the keys in a module of their own and the call that makes `GAMES` marked
 * pure, a build in which nothing reads `GAMES` leaves this module out of that closure, and every game added here costs it nothing.
 */
import { levelOf } from './keys'
import { LOOP } from './loop/entry'
import { regrade } from './replay'
import type { Regrade } from './replay'
import type { GameEntry, StoredRun } from './types'
import { VERIFIER } from './verifier/entry'

export { COMMON_KEYS, keyProblems, keymapOf, levelOf } from './keys'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The registry                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface GameRegistry {
  readonly games: readonly GameEntry[]
  has(id: string): boolean
  /** The entry for a game id, or undefined. A name such as `constructor` is unknown, not a function from a prototype. */
  get(id: string): GameEntry | undefined
}

/** A registry over `games`. Throws when two games share an id, because a ref `play:<game>/<level>` would name both. */
export function createRegistry(games: readonly GameEntry[]): GameRegistry {
  const byId = new Map<string, GameEntry>()
  for (const game of games) {
    if (byId.has(game.id)) throw new Error(`two games are registered as "${game.id}"`)
    byId.set(game.id, game)
  }
  const list = Object.freeze([...games])
  return { games: list, has: (id) => byId.has(id), get: (id) => byId.get(id) }
}

/** Every game of the course. Each game's task adds its entry here: `loop` is the first (W0-T16), and `verifier` follows (W1-T28). */
export const GAMES: GameRegistry = /* @__PURE__ */ createRegistry([LOOP, VERIFIER])

/**
 * Grades a stored `play` run by its log: finds the game, loads its session and replays. A run of a game this build does not have,
 * or of a level it does not have, earns nothing and says so. This is what the Evidence page calls (A§6.3).
 */
export async function regradeStored(registry: GameRegistry, stored: StoredRun): Promise<Regrade> {
  const game = registry.get(stored.game)
  if (game === undefined) return { valid: false, at: null, reason: `this build has no game "${stored.game}"` }
  if (levelOf(game, stored.level) === undefined) return { valid: false, at: null, reason: `${game.id} has no level "${stored.level}"` }
  return regrade(await game.session(), stored)
}
