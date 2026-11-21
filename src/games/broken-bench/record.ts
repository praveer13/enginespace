import type { ComponentType } from 'react'
import type { GameEntry } from '@es/play'
import type { GameProps } from '../registry'
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'

/*
 * The game's record, as /play/broken-bench loads it (src/games/registry.ts, GAME_RECORDS): this game's and no other's. It is a function in a
 * module of its own, so the build keeps it a chunk of its own: the record stays in a shared chunk that the pages reading GAMES (and the
 * front page, Service's) import by short names, and only this chunk, which the game's page and a lesson's block of this game load, carries
 * the long name.
 *
 * `game` loads the game's component (GAME_COMPONENTS). The registry loads this chunk for both, so the chunk that every game's page carries
 * names one file per game, and the list of what this game's component needs sits here, in the chunk of this game alone.
 */
export function record(): GameEntry {
  return BROKEN_BENCH
}

export const game = (): Promise<{ default: ComponentType<GameProps> }> => import('./Game')
