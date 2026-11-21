import type { ComponentType } from 'react'
import type { GameEntry } from '@es/play'
import type { GameProps } from '../registry'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'

/*
 * The game's record, as /play/shape-shifter loads it (src/games/registry.ts, GAME_RECORDS): this game's and no other's. It is a function in
 * a module of its own, so the build keeps it a chunk of its own, as every game's record.ts does.
 *
 * `game` loads the game's component (GAME_COMPONENTS). The registry loads this chunk for both, so the chunk that every game's page carries
 * names one file per game, and the list of what this game's component needs sits here, in the chunk of this game alone.
 */
export function record(): GameEntry {
  return SHAPE_SHIFTER
}

export const game = (): Promise<{ default: ComponentType<GameProps> }> => import('./Game')
