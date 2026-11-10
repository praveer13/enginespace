/**
 * Rule 4, binding (ARCHITECTURE §8.4 and §8.5, D-027): the receipt's token must match an unexpired, unused `challenge` event in this ledger,
 * for this lab and stage, and the seed the receipt reports must be the one the token derives.
 *
 * Without a server the only authority for a fresh seed is the learner's own browser, which drew it when the challenge was issued
 * (kernelspace's "unseen, not secret", carried to the GPU lane). So a receipt is accepted for a token that this browser issued, once, within
 * a few days; a friend's receipt, a receipt of one's own that was imported already, and a receipt for a token that nobody here issued each
 * fail this rule by name (ASSESSMENT §10).
 *
 * This package does not read the ledger (A§2.3), so the page hands it a book: for each challenge the ledger holds, the token and its parts,
 * the instant the event was written and the receipt that spent it, if one did. The page makes the book from the same events and the same
 * functions that list the learner's challenges as open, used or expired (src/receipts/challenge.ts), and the state of a token is worked out
 * here by `stateAt`, which that file uses too, so the list on the page and the verdict of the worker cannot disagree about a token.
 *
 * One receipt may be checked again. The ledger spends a token on the first receipt event that carries it, and a re-import of that same
 * receipt (a re-verification, A§7.1) finds its own token spent by itself and is bound. Any other receipt for the token is not.
 */
import { parseChallenge } from '@es/schema/challenge'
import type { Receipt } from '@es/schema/receipt'
import { when } from './format'
import type { RuleResult } from './report'

/** How long a token is good for, in days [estimated]: ARCHITECTURE §8.4 and ASSESSMENT §5.3. */
export const CHALLENGE_TTL_DAYS = 14

const DAY_MS = 86_400_000

export type ChallengeState = 'open' | 'used' | 'expired'

/**
 * The state of a token whose challenge was written at `at`, at the instant `nowMs`, and whether a receipt spent it. Used wins over expired:
 * a token that was spent in time stays spent. The count is from the event's instant, to the millisecond, and not from the token's date,
 * which has only the day.
 */
export function stateAt(at: string, nowMs: number, used: boolean): ChallengeState {
  if (used) return 'used'
  return nowMs >= Date.parse(at) + CHALLENGE_TTL_DAYS * DAY_MS ? 'expired' : 'open'
}

/** A challenge the ledger holds, as the worker needs it: plain data, so that it crosses to the worker as it is. */
export interface BookedChallenge {
  readonly token: string
  /** The stage the `challenge` event's ref names. */
  readonly stage: string
  readonly seed: number
  readonly nonce: string
  readonly issuedOn: string
  /** The instant the ledger wrote the `challenge` event. */
  readonly at: string
  /** The SHA-256 of the receipt that spent the token: the earliest `receipt` event that carries it. Absent for a token that no receipt has used. */
  readonly usedBy?: string
}

export type ChallengeBook = readonly BookedChallenge[]

const short = (sha: string): string => sha.slice(0, 8)

const outcome = (status: 'pass' | 'fail', summary: string, problems: readonly string[] = []): RuleResult => ({ rule: 4, id: 'binding', status, summary, problems })

/**
 * Rule 4 for a receipt whose own SHA-256 is `receiptSha256`, against the book, at the instant `nowMs`. The clock is the page's and is
 * passed in: this package reads none, so a test fixes the moment.
 */
export function checkBinding(receipt: Receipt, receiptSha256: string, book: ChallengeBook, nowMs: number): RuleResult {
  const { token } = receipt.challenge
  // Two events with one token would be one challenge written twice (a merge of two devices' ledgers); the earlier governs, as it expires first.
  const booked = book.filter((entry) => entry.token === token).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))[0]
  if (booked === undefined) {
    return outcome('fail', "This browser's ledger holds no challenge with this token.", [
      'A token binds to the browser that issued it (ARCHITECTURE §8.4). A receipt for a challenge from another browser or device is imported there, and a receipt for a token nobody issued here is not bound to anything.',
    ])
  }
  const problems: string[] = []
  const derived = parseChallenge(token)
  if (booked.stage !== receipt.stage) problems.push(`The challenge in the ledger is for ${booked.stage}, and the receipt is of ${receipt.stage}.`)
  if (derived === null || receipt.challenge.seed !== derived.seed || booked.seed !== derived.seed || booked.nonce !== derived.nonce || booked.issuedOn !== derived.issuedOn) {
    problems.push('The seed the receipt reports is not the seed that the token derives, so the run was not made on the challenge this browser issued.')
  }
  const state = stateAt(booked.at, nowMs, booked.usedBy !== undefined)
  if (state === 'used' && booked.usedBy !== receiptSha256) {
    problems.push(
      `The token was spent by receipt ${short(booked.usedBy ?? '')} already. A token is single-use (D-027): the first receipt that carries it counts for good, whatever its verdict, because the run's seeds were seen.`,
    )
  } else if (state === 'expired') {
    const expired = Date.parse(booked.at) + CHALLENGE_TTL_DAYS * DAY_MS
    problems.push(`The token expired at ${when(expired)}: it lasts ${CHALLENGE_TTL_DAYS} days [estimated] from the moment this browser issued it, and this check is at ${when(nowMs)}.`)
  }
  if (problems.length > 0) return outcome('fail', 'The receipt is not bound to an unused, unexpired challenge of this browser.', problems)
  return state === 'used'
    ? outcome('pass', `Bound to the challenge this browser issued for ${receipt.stage} at ${when(Date.parse(booked.at))}, which this same receipt spent when it was first kept.`)
    : outcome('pass', `Bound to the challenge this browser issued for ${receipt.stage} at ${when(Date.parse(booked.at))}: unspent, unexpired, and the seed is the token's.`)
}
