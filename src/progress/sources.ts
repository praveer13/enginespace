/*
 * What the app knows of the ref-to-KC map (kcmap.ts), assembled from what is built: the compiled map's exact refs, and the game
 * registry. A page that shows progress calls these two and hands them to `deriveProgress`.
 *
 * Two sources are empty for now, and an event they would have placed moves no KC until they are filled (it still counts for its module):
 *   - item families: `Gen.kcs` (packages/play/items, W1-T04, A§8.2). Reading it here would carry every family's generator into the map
 *     and the module pages, and each family a later task adds would make them dearer, so this waits for a table of the families' KCs
 *     that costs those pages nothing, or for a load that only a ledger with item events pays for;
 *   - labs: the KCs of a forge lab's checks and of a GPU lab's stages (W1-T10, W1-T22, W1-T27, W2).
 */
import { GAMES } from '@es/play'
import type { CourseMap } from '@es/schema/compiled'
import type { KcSources } from './kcmap'

/** The sources of the map, over the game registry. */
export function appSources(map: Pick<CourseMap, 'refs'>): KcSources {
  return {
    refs: map.refs,
    game: (game) => GAMES.get(game)?.kcs ?? [],
    family: () => [],
    lab: () => [],
  }
}

/** A game's home module: the first its registry entry lists (packages/play/types.ts), as the Evidence page counts a game run. */
export const homeModule = (game: string): string | undefined => GAMES.get(game)?.modules[0]
