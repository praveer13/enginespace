/*
 * Which knowledge components a ledger event is evidence for (ARCHITECTURE §4.5: "KCs come from a ref→KC map at read time and are never
 * stored"). An event keeps its ref and never its KCs, so a KC retagged in content applies to evidence already written. The rule is
 * kernelspace's static map (`kcsOfEvent`, rule 3 at d478f91): the ref names a thing, and the thing names its KCs.
 *
 *   review:<kc>                  that KC itself
 *   item:gen/<family>/<variant>  the KCs of that variant of the family (A§8.2: a variant assesses its own)
 *   play:<game>/<level>          the KCs the game exercises (the registry's `kcs`; a level names none of its own yet)
 *
 *   predict:<lesson>#<id>        the KCs the lesson's prediction names, from the compiled map's `refs` (W1-T06; src/progress/kcmap.ts reads
 *                                the same). A prediction of either reveal, after the run or at commit (D-067), writes the same event. It may
 *                                reschedule an idea that is already earned (ASSESSMENT §4.7) and never earns one: that is cards.ts's `earns`,
 *                                which a prediction fails by its kind, so this map only says which ideas it is about. Without `refs` it names none.
 *
 * Every other ref names none yet, and an event with such a ref moves no card:
 *   - lab:, prove:, receipt:   the KCs of a lab's checks are named by the lab tasks (W1-T10, W1-T22, W1-T27);
 *   - trace:, challenge:, screen:, change:   a trace belongs to every module that reads it, and the rest are not graded.
 *
 * What is known to the build is passed in as `KcSources`: the app builds them from the families' faces (the catalog) and the game registry
 * (`sourcesOf`), and a test builds them from fixtures. The map's `refs`, once the page reads the map, add the other refs here and nowhere else.
 */
import { GAMES } from '@es/play'
import { CATALOG } from '@es/play/items/catalog'
import type { GenFace } from '@es/play/items/types'
import { parseRef } from '@es/schema/refs'

export interface KcSources {
  /** The KCs a variant of an item family assesses. */
  variant(family: string, variant: string): readonly string[]
  /** The KCs a game exercises. */
  game(game: string): readonly string[]
  /** The exact refs that content assigns to KCs: a prediction's (the compiled map's `refs`). Left out, a prediction names no KC. */
  refs?: Readonly<Record<string, readonly string[]>>
}

/** The KCs a ref is evidence for, without repeats, or none. */
export type KcsOfRef = (ref: string) => readonly string[]

export function kcsOfRef(ref: string, sources: KcSources): readonly string[] {
  const parsed = parseRef(ref)
  if (parsed === null) return []
  let kcs: readonly string[]
  switch (parsed.kind) {
    case 'review':
      kcs = [parsed.kc]
      break
    case 'item':
      kcs = sources.variant(parsed.family, parsed.variant)
      break
    case 'play':
      kcs = sources.game(parsed.game)
      break
    case 'predict':
      kcs = (sources.refs !== undefined && Object.hasOwn(sources.refs, ref) ? sources.refs[ref] : undefined) ?? []
      break
    default:
      return []
  }
  return kcs.length < 2 ? kcs : [...new Set(kcs)]
}

/** The sources of this build: the item families and the games of the registries. */
export function sourcesOf(families: readonly GenFace[] = CATALOG, refs?: KcSources['refs']): KcSources {
  return {
    ...(refs === undefined ? {} : { refs }),
    variant: (family, variant) => families.find((gen) => gen.id === family)?.variants.find((spec) => spec.id === variant)?.kcs ?? [],
    game: (game) => GAMES.get(game)?.kcs ?? [],
  }
}

/** The resolver the page uses. */
export const appKcsOfRef: KcsOfRef = (ref) => kcsOfRef(ref, sourcesOf())

/** The resolver once the compiled map is read: the same, with the map's refs, so that a prediction names the ideas its lesson says it is about. */
export const kcsOfRefWith =
  (refs: KcSources['refs']): KcsOfRef =>
  (ref) =>
    kcsOfRef(ref, sourcesOf(CATALOG, refs))
