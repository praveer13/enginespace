/*
 * Counting the ledger (ARCHITECTURE §3.1, `/evidence`; §7.2; ASSESSMENT §3.3): how many events there are of each kind, and how
 * many under each module. A count is derived from the events when the page draws and is never stored (A§7: "nothing derived
 * is stored"), and it is a count of events written, which is not credit: what an event is worth comes from its provenance,
 * and the map and the module pages derive that (W1-T06). This page's first version only says what the ledger holds.
 *
 * An event names its module through its ref (A§4.5), where the ref says one:
 *
 *   predict:<lesson>#<id>        the lesson's module            `tr2.l3` is tr2
 *   item:gen/<family>/<variant>  the family's module            `tr2.bubble-width` is tr2
 *   lab:<lab>, prove:<lab>       the lab's module, when it has one; a forge lab is a bare slug and names none
 *   challenge:/receipt:<stage>   the stage's module             `tr8.replay.s2` is tr8
 *   review:<kc>                  the KC's module                `cap.` KCs are the capstone's
 *   play:<game>/<level>          the game's home module, the first its registry entry lists. A game that serves several modules
 *                                (`loop` serves tr2 and tr6) counts under its home until a level can name its own.
 *   trace:, screen:, change:     none: a trace belongs to every module that reads it, and an acknowledgement to the site
 *
 * Whatever names no module is counted apart, so every event lands in exactly one row.
 */
import { GRADED_KINDS, KINDS } from '@es/ledger'
import type { Kind, LedgerEvent } from '@es/ledger'
import { moduleOfRef } from '@es/schema/refs'

/** Which module a ref belongs to is the ref grammar's to say (packages/schema/refs.ts), and the map and the module pages ask the same function. */
export { moduleOfRef }

/** Events of each kind, and their number. */
export interface Tally {
  total: number
  kinds: Record<Kind, number>
}

export const emptyTally = (): Tally => ({ total: 0, kinds: Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<Kind, number> })

export interface EventCounts {
  /** Every event in the ledger. */
  all: Tally
  /** The events of each module that has any, by module id. A module with none has no entry. */
  byModule: ReadonlyMap<string, Tally>
  /** The events that name no module. */
  unplaced: Tally
}

/** Counts events by kind, and by module through their refs. Every event is counted once in `all` and once in one row below it. */
export function countEvents(events: readonly LedgerEvent[], gameModule: (game: string) => string | undefined): EventCounts {
  const all = emptyTally()
  const unplaced = emptyTally()
  const byModule = new Map<string, Tally>()
  for (const event of events) {
    all.total += 1
    all.kinds[event.kind] += 1
    const module = moduleOfRef(event.ref, gameModule)
    let row = unplaced
    if (module !== null) {
      row = byModule.get(module) ?? emptyTally()
      byModule.set(module, row)
    }
    row.total += 1
    row.kinds[event.kind] += 1
  }
  return { all, byModule, unplaced }
}

const GRADED = new Set<Kind>(GRADED_KINDS)

/** Whether an event of this kind carries a graded result (A§7.2). A challenge is issued and not graded, and an acknowledgement says only that a screen was seen. */
export const isGradedKind = (kind: Kind): boolean => GRADED.has(kind)

/** What each kind is called and means, in the learner's words (A§7.2). */
export const KIND_FACTS: Readonly<Record<Kind, { name: string; what: string }>> = {
  predict: { name: 'Predictions', what: 'A value you committed before the reveal, and what the reveal showed.' },
  item: { name: 'Items', what: 'A generated question, and your answer.' },
  play: { name: 'Game runs', what: 'A level played: its action log, which is regraded from its replay.' },
  'lab-check': { name: 'Lab checks', what: 'A forge lab graded in this tab, check by check.' },
  prove: { name: 'Prove-its', what: 'What you predicted a module would reply, and what it did, with your agent closed.' },
  'trace-mark': { name: 'Trace marks', what: 'Spans you marked on a trace, and how far off they were.' },
  challenge: { name: 'Challenges', what: 'Issued for a GPU or local lab. Not graded: a receipt is.' },
  receipt: { name: 'Receipts', what: "A grader's receipt, verified in this browser." },
  review: { name: 'Reviews', what: "Today's grade for a knowledge component." },
  ack: { name: 'Acknowledgements', what: 'A screen or a change card you have seen. They carry no result.' },
}
