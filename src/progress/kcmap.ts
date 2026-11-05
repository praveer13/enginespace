/*
 * The ref-to-KC map (ARCHITECTURE §4.5; ASSESSMENT §3.3): which knowledge components a ledger event is evidence for.
 *
 * An event stores its ref and never its KCs, so a KC retagged in content applies to evidence already written, and a KC is never
 * stored with a learner's work. The KCs come from the ref when it is read, by the same rule as kernelspace's `kcsOfEvent`
 * (src/lib/kc/resolve.ts at d478f91, rule 3, the static map): the exact ref first, then the thing the ref names.
 *
 *   review:<kc>                 that KC itself
 *   play:<game>/<level>         the KCs the game exercises (the registry's `kcs`; a level names none of its own yet)
 *   item:gen/<family>/<v>       the KCs the family assesses (`Gen.kcs`, A§8.2)
 *   lab:<lab>, prove:<lab>      the KCs the lab's checks assess
 *   receipt:<stage>             the KCs of the stage's lab
 *   predict:<lesson>#<id>       the KCs the lesson's prediction names, from the exact refs the compiler writes (map.json)
 *   trace:, challenge:, screen:, change:   none: a trace belongs to every module that reads it, and a challenge and an
 *                                          acknowledgement are not graded
 *
 * What is known to the build is passed in, as `KcSources`: the app builds them from the game registry and the compiled map, and a
 * test builds them from fixtures. An event whose ref names no KC still counts for the module it belongs to (derive.ts); it just
 * moves no knowledge component.
 */
import { labOfStage, parseRef } from '@es/schema/refs'

export interface KcSources {
  /** The KCs a game's level exercises. */
  game(game: string, level: string): readonly string[]
  /** The KCs an item family assesses. */
  family(family: string): readonly string[]
  /** The KCs a lab's checks assess, for a forge lab (`hybrid-kv`) and a GPU or local lab (`tr8.replay`) alike. */
  lab(lab: string): readonly string[]
  /** The exact refs that content assigns to KCs: a prediction's. */
  refs: Readonly<Record<string, readonly string[]>>
}

const unique = (ids: readonly string[]): readonly string[] => (ids.length < 2 ? ids : [...new Set(ids)])

/** The KCs a ref is evidence for, without repeats, or none. A ref that is not one of the grammar's forms names none. */
export function kcsOfRef(ref: string, sources: KcSources): readonly string[] {
  const exact = Object.hasOwn(sources.refs, ref) ? sources.refs[ref] : undefined
  if (exact !== undefined && exact.length > 0) return unique(exact)
  const parsed = parseRef(ref)
  if (parsed === null) return []
  switch (parsed.kind) {
    case 'review':
      return [parsed.kc]
    case 'play':
      return unique(sources.game(parsed.game, parsed.level))
    case 'item':
      return unique(sources.family(parsed.family))
    case 'lab':
    case 'prove':
      return unique(sources.lab(parsed.lab))
    case 'receipt':
      return unique(sources.lab(labOfStage(parsed.stage)))
    case 'predict':
    case 'trace':
    case 'challenge':
    case 'screen':
    case 'change':
      return []
  }
}
