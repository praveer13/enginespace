import type { GameEntry } from '@es/play'
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'

/*
 * The game's record, as /play/broken-bench loads it (src/games/registry.ts, GAME_RECORDS): this game's and no other's. It is a function in a
 * module of its own, so the build keeps it a chunk of its own: the record stays in a shared chunk that the pages reading GAMES (and the
 * front page, Service's) import by short names, and only this chunk, which the game's page alone loads, carries the long name.
 */
export function record(): GameEntry {
  return BROKEN_BENCH
}
