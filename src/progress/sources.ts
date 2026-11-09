/*
 * What the app knows of the ref-to-KC map (kcmap.ts), assembled from what is built: the compiled map's exact refs, the game registry, the
 * item families' faces and the graded forge labs' tables. A page that shows progress calls these two and hands them to `deriveProgress`.
 *
 * Every source is data, and none is the code it describes (D-059), because the map and the module pages carry whatever they import:
 *   - items: the faces of packages/play/items/catalog.ts, which Today and a lesson's item block plan with: a family's words, and the KCs of
 *     each of its variants, which are the ones the item a variant makes carries (`Item.kcs`) and the ones Today reads (src/items/today/kcs.ts).
 *     The eight faces are 1,732 B of gzip [measured 2026-11-09 on 3a8aaa4 with this change], and each family that a later task adds is about
 *     220 B more [derived]. A family's code is 16 to 18 KB each [measured 2026-11-09 at 3a8aaa4] and loads when an item is drawn
 *     (src/items/families.ts);
 *   - labs: the tables of packages/sim/forge/check-kcs.ts, 314 B [measured 2026-11-09 on 3a8aaa4 with this change]. They are the KCs of
 *     `LAB_CHECK_KCS` (kcs.ts) without its checks. Importing `LAB_CHECK_KCS` itself put the checks' oracles on both pages: the map went from
 *     166,672 B to 196,603 B and the module page from 180,036 B to 207,510 B, 7,510 B over its gate [measured 2026-11-09 at 3a8aaa4 and
 *     with the faces wired as well].
 *
 * One source is still empty, and an event it would have placed moves no KC until it is filled (it still counts for its module): the KCs of
 * a GPU lab's stages (W2).
 */
import { GAMES } from '@es/play'
import { faceById } from '@es/play/items/catalog'
import type { CourseMap } from '@es/schema/compiled'
import { kcsOfLab } from '@es/sim/forge/check-kcs'
import type { KcSources } from './kcmap'

/** The sources of the map, over the game registry, the families' faces and the graded labs' tables. */
export function appSources(map: Pick<CourseMap, 'refs'>): KcSources {
  return {
    refs: map.refs,
    game: (game) => GAMES.get(game)?.kcs ?? [],
    variant: (family, variant) => faceById(family)?.variants.find((spec) => spec.id === variant)?.kcs ?? [],
    lab: kcsOfLab,
  }
}

/** A game's home module: the first its registry entry lists (packages/play/types.ts), as the Evidence page counts a game run. */
export const homeModule = (game: string): string | undefined => GAMES.get(game)?.modules[0]
