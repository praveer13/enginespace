import type { GameEntry } from '@es/play'
import { VERIFIER } from '@es/play/verifier/entry'

/*
 * The game's record, as /play/verifier loads it (src/games/registry.ts, GAME_RECORDS): this game's and no other's. It is a function in a
 * module of its own, so the build keeps it a chunk of its own: the record stays in a shared chunk that the pages reading GAMES (and the
 * front page, Service's) import by short names, and only this chunk, which the game's page alone loads, carries the long name.
 */
export function record(): GameEntry {
  return VERIFIER
}
