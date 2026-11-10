/*
 * W2-T07: the page and the worker cannot disagree about a token (src/receipts/challenge.ts, src/receipts/book.ts, packages/verify/binding.ts).
 *
 * The page lists the ledger's challenges as open, used or expired (`heldChallenges`), and the receipt worker binds a receipt to a challenge of
 * the same ledger (`checkBinding`). The worker reads a book that the page makes from the same events, and works the state of a token out with
 * the function the page uses. These tests put the two side by side over every state and a spread of moments, so that a change to one that the
 * other did not get fails here and not in front of a learner.
 */
import { describe, expect, test } from 'bun:test'
import { checkBinding } from '@es/verify'
import { challengeBook } from '@/receipts/book'
import { CHALLENGE_TTL_DAYS, heldChallenges } from '@/receipts/challenge'
import { Ledger, sampleReceipt, sha256 } from './support'

const DAY = 86_400_000
const ISSUED = '2026-11-01T12:00:00.000Z'
const issued = Date.parse(ISSUED)

const receipt = sampleReceipt()
const SHA = sha256('the receipt under test')
const OTHER = sha256('another receipt')

/** A ledger with the receipt's challenge issued at ISSUED, and, if asked, a receipt event that spent it. */
function ledgerWith(spentBy?: string, spentAfterDays = 1) {
  const ledger = new Ledger()
  ledger.challengeFor(ISSUED, receipt.challenge.token)
  if (spentBy !== undefined) ledger.receipt(new Date(issued + spentAfterDays * DAY).toISOString(), receipt.challenge.token, spentBy)
  return ledger
}

describe('the book', () => {
  test('has a line for each challenge the ledger holds, newest first, with the parts of its token and the receipt that spent it', () => {
    const ledger = new Ledger()
    const old = ledger.challenge('2026-11-01T09:00:00.000Z', 'tr8.replay.s2', 1)
    const fresh = ledger.challenge('2026-11-05T09:00:00.000Z', 'tr4.sweep.s1', 2)
    ledger.receipt('2026-11-06T09:00:00.000Z', old.data.token, SHA)
    const book = challengeBook(ledger.events, Date.parse('2026-11-07T00:00:00.000Z'))
    expect(book).toEqual([
      { token: fresh.data.token, stage: 'tr4.sweep.s1', seed: fresh.data.seed, nonce: fresh.data.nonce, issuedOn: fresh.data.issuedOn, at: '2026-11-05T09:00:00.000Z' },
      { token: old.data.token, stage: 'tr8.replay.s2', seed: old.data.seed, nonce: old.data.nonce, issuedOn: old.data.issuedOn, at: '2026-11-01T09:00:00.000Z', usedBy: SHA },
    ])
  })

  test('is plain data: it survives the clone that a worker\'s message makes, and a JSON round trip', () => {
    const book = challengeBook(ledgerWith(OTHER).events, issued + DAY)
    expect(structuredClone(book)).toEqual(book)
    expect(JSON.parse(JSON.stringify(book))).toEqual(book)
  })

  test('is empty for a ledger with no challenge, and ignores every other kind of event', () => {
    expect(challengeBook([], issued)).toEqual([])
    const ledger = new Ledger()
    ledger.receipt(ISSUED, receipt.challenge.token, SHA)
    expect(challengeBook(ledger.events, issued)).toEqual([])
  })
})

describe('the page and the worker, over every state of a token', () => {
  // The moments to ask at: the instant the token was issued, a day later, the last millisecond of its life, the instant it ends, and after.
  const moments = [0, 1, CHALLENGE_TTL_DAYS - 1e-9, CHALLENGE_TTL_DAYS, CHALLENGE_TTL_DAYS + 1, 60].map((days) => issued + Math.floor(days * DAY))

  test('an unspent token: the page says open and the worker binds, or the page says expired and the worker refuses', () => {
    for (const now of moments) {
      const ledger = ledgerWith()
      const [held] = heldChallenges(ledger.events, now)
      const found = checkBinding(receipt, SHA, challengeBook(ledger.events, now), now)
      expect([now - issued, held.state, found.status]).toEqual([now - issued, held.state, held.state === 'open' ? 'pass' : 'fail'])
    }
  })

  test('a token that another receipt spent: the page says used, by that receipt, and the worker refuses whenever it is asked', () => {
    for (const now of moments) {
      const ledger = ledgerWith(OTHER)
      const [held] = heldChallenges(ledger.events, now)
      const found = checkBinding(receipt, SHA, challengeBook(ledger.events, now), now)
      expect(held.state).toBe('used')
      expect(held.usedBy).toBe(OTHER)
      expect(found.status).toBe('fail')
      expect(found.problems[0]).toContain(OTHER.slice(0, 8))
    }
  })

  test('a token that this receipt spent: the page says used, and the worker binds it again whenever it is asked, even after the token\'s life', () => {
    for (const now of moments) {
      const ledger = ledgerWith(SHA)
      const [held] = heldChallenges(ledger.events, now)
      expect(held.state).toBe('used')
      expect(checkBinding(receipt, SHA, challengeBook(ledger.events, now), now).status).toBe('pass')
    }
  })

  test('two receipts for one token: the earlier one spent it, as the page lists it, and the worker agrees with the page about which', () => {
    const ledger = ledgerWith(SHA, 1)
    ledger.receipt(new Date(issued + 2 * DAY).toISOString(), receipt.challenge.token, OTHER)
    const now = issued + 3 * DAY
    const [held] = heldChallenges(ledger.events, now)
    expect(held.usedBy).toBe(SHA)
    expect(checkBinding(receipt, SHA, challengeBook(ledger.events, now), now).status).toBe('pass')
    expect(checkBinding(receipt, OTHER, challengeBook(ledger.events, now), now).status).toBe('fail')
  })
})
