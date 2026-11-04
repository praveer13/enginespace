import type { Draft, Json } from '@es/ledger'
import type { ItemResult } from '@es/play/items'

/*
 * An answered item as the ledger takes it (ARCHITECTURE §7.2): an `item` event whose ref names the family and variant, whose
 * `provenance` says how the seed was drawn, and whose `data.answer` is the learner's response with the level it was made at. It
 * holds the seed and the fingerprint, so grading can run again (packages/play/items/regrade.ts), and it holds no key, no solution
 * and no time (nothing in this course is graded on speed).
 */
export function itemDraft(result: ItemResult): Draft<'item'> {
  return {
    kind: 'item',
    ref: result.ref,
    score: result.score,
    ok: result.ok,
    provenance: result.provenance,
    seed: result.seed,
    ...(result.conf === undefined ? {} : { conf: result.conf }),
    rev: result.rev,
    data: { answer: result.answer as unknown as Json },
  }
}
