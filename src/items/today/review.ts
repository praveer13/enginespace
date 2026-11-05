/*
 * The event a review writes (ARCHITECTURE §7.2: `review` | `review:<kc>` | "the Today grade"; ASSESSMENT §8). One event for each ticket
 * that was checked, whatever the answer: the ref names the idea, the data holds the FSRS grade that the answer earned, and the
 * envelope holds what the framework keeps of every graded result: how right it was, how the seed was drawn, the seed itself, the tap
 * for how sure, and the fingerprint of the item (so that a ticket whose family changed later reads as "re-check" and loses nothing).
 *
 * A review is graded like any item and stamped `unseen` when its seed was drawn fresh and the learner had not met it (ASSESSMENT §8).
 * Today draws every seed that way, so every review is `unseen`; whether it was right is `ok`, and whether it was worth anything is
 * the provenance's weight, applied when the ledger is read. The event holds no key, no solution and no time.
 */
import type { Confidence, Draft } from '@es/ledger'
import type { Item } from '@es/play/items'
import { gradeOf } from './fsrs'
import type { Rating } from './fsrs'

export interface Checked {
  readonly kc: string
  readonly item: Item
  readonly ok: boolean
  readonly score: number
  readonly conf?: Confidence
}

/** The grade that the answer to a ticket earns the idea. */
export const ratingOf = (checked: Pick<Checked, 'ok' | 'conf'>): Rating => gradeOf(checked.conf === undefined ? { ok: checked.ok } : { ok: checked.ok, conf: checked.conf })

export function reviewDraft(checked: Checked): Draft<'review'> {
  return {
    kind: 'review',
    ref: `review:${checked.kc}`,
    score: checked.score,
    ok: checked.ok,
    provenance: 'unseen',
    seed: checked.item.seed,
    ...(checked.conf === undefined ? {} : { conf: checked.conf }),
    rev: checked.item.rev,
    data: { grade: ratingOf(checked) },
  }
}
