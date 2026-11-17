/**
 * The replay check of a figure (R-T45): the figure's actions, replayed on the game's pure session from the level's start, as the dock replays them.
 * It is the one file of the content compiler that reaches packages/play, so the Vite config's closure (which has no `@es` paths) never loads it:
 * verify:content and the tests pass it to `compileContent`. A game joins by adding its session here and its id to REPLAY_GAMES in the schema.
 */
import { serviceSession } from '../../packages/play/loop/game.ts'
import { replay } from '../../packages/play/replay.ts'
import type { AnySession } from '../../packages/play/types.ts'
import type { ReplayCheck } from './directives.ts'

const SESSIONS: Readonly<Record<string, AnySession>> = { loop: serviceSession }

export const checkReplay: ReplayCheck = (given) => {
  const session = SESSIONS[given.game]
  if (session === undefined) return { reason: `no game "${given.game}" can be replayed`, at: null }
  const played = replay(session, { game: given.game, level: given.level, seed: given.seed, actions: given.actions })
  return played.ok ? null : { reason: played.reason, at: played.at }
}
