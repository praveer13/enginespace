/*
 * The challenges of this ledger, as the receipt worker needs them (ARCHITECTURE §8.5 rule 4).
 *
 * The worker reads no ledger, so the page hands it a book: for each challenge the ledger holds, its token and parts, the instant the event was
 * written and the receipt that spent it. The book is made from `heldChallenges`, the function that lists the learner's challenges as open, used
 * or expired, so the page and the worker work from one reading of the events, and the worker asks `stateAt` for the state, which that file
 * takes from the same place (packages/verify/binding.ts).
 */
import type { LedgerEvent } from '@es/ledger'
import type { BookedChallenge, ChallengeBook } from '@es/verify'
import { heldChallenges } from './challenge'

/** The ledger's challenges at the instant `nowMs`, newest first, as plain data that crosses to a worker as it is. */
export function challengeBook(events: readonly LedgerEvent[], nowMs: number): ChallengeBook {
  return heldChallenges(events, nowMs).map(
    (held): BookedChallenge => ({
      token: held.token,
      stage: held.stage,
      seed: held.event.data.seed,
      nonce: held.event.data.nonce,
      issuedOn: held.event.data.issuedOn,
      at: held.event.at,
      ...(held.usedBy === undefined ? {} : { usedBy: held.usedBy }),
    }),
  )
}
