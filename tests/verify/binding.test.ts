/*
 * W2-T07, rule 4 of ARCHITECTURE §8.4 and §8.5: binding. The receipt's token must match an unexpired, unused `challenge` event of this
 * ledger, for this lab and stage, and the seed the receipt reports must be the seed the token derives. A reused token fails binding (the
 * task's third check).
 *
 *   - A token this browser issued, a day ago, that nothing has used, binds. The expiry is 14 days [estimated], to the millisecond, from the
 *     instant the ledger wrote the event.
 *   - A token that no challenge of this ledger carries fails: a friend's receipt, a receipt from another browser, a made-up token.
 *   - A token that another receipt spent fails, whatever that receipt's verdict was, and the message names the receipt. The same receipt checked
 *     again is bound: a re-import is a re-verification, and the ledger spent the token on that very receipt (A§7.1).
 *   - A token spent in time stays spent: used wins over expired.
 *   - A challenge for another stage, or whose parts are not the token's, fails.
 *   - The page and the worker cannot disagree about a token, because they ask the same function (`stateAt`), and the page's lists agree with
 *     the worker's rule on every state (tests/receipts/binding.test.ts holds the other half).
 */
import { describe, expect, test } from 'bun:test'
import { CHALLENGE_TTL_DAYS, checkBinding, stateAt } from '@es/verify'
import { read } from '../ci/support'
import { bookedFor, DAY, ISSUED, NOW, receiptSha, sampleBundle, sha256 } from './support'

const { receipt } = sampleBundle()
const SHA = receiptSha(receipt)
const issued = Date.parse(ISSUED)

describe('a token this browser issued', () => {
  test('binds when nothing has used it: the rule passes and says which challenge, and since when', () => {
    const found = checkBinding(receipt, SHA, [bookedFor(receipt)], NOW)
    expect(found).toMatchObject({ rule: 4, id: 'binding', status: 'pass', problems: [] })
    expect(found.summary).toBe('Bound to the challenge this browser issued for tr3.profile.s2 at 2026-11-08 12:00 UTC: unspent, unexpired, and the seed is the token\'s.')
  })

  test('binds among other challenges: only the one with the receipt\'s token counts', () => {
    const book = [
      bookedFor(receipt, { token: 'es1:tr8.replay.s2:00000001:AAAAAAAAAAAAAAAA:20261108:00000000', stage: 'tr8.replay.s2', usedBy: sha256('x') }),
      bookedFor(receipt),
      bookedFor(receipt, { token: 'es1:tr3.profile.s2:00000002:BBBBBBBBBBBBBBBB:20261108:00000000', at: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(checkBinding(receipt, SHA, book, NOW).status).toBe('pass')
  })
})

describe('a token that has expired', () => {
  test('lasts 14 days [estimated] from the instant the event was written, to the millisecond', () => {
    expect(CHALLENGE_TTL_DAYS).toBe(14)
    const last = issued + 14 * DAY - 1
    expect(checkBinding(receipt, SHA, [bookedFor(receipt)], last).status).toBe('pass')
    const found = checkBinding(receipt, SHA, [bookedFor(receipt)], last + 1)
    expect(found.status).toBe('fail')
    expect(found.summary).toBe('The receipt is not bound to an unused, unexpired challenge of this browser.')
    expect(found.problems).toEqual(['The token expired at 2026-11-22 12:00 UTC: it lasts 14 days [estimated] from the moment this browser issued it, and this check is at 2026-11-22 12:00 UTC.'])
  })

  test('says the day it expired, and the day of the check', () => {
    const found = checkBinding(receipt, SHA, [bookedFor(receipt)], issued + 20 * DAY)
    expect(found.problems[0]).toContain('The token expired at 2026-11-22 12:00 UTC')
    expect(found.problems[0]).toContain('this check is at 2026-11-28 12:00 UTC')
  })

  test('is the time the page uses: an open token is not expired at the instant before, and is at the instant of its expiry', () => {
    const at = ISSUED
    expect(stateAt(at, issued + 14 * DAY - 1, false)).toBe('open')
    expect(stateAt(at, issued + 14 * DAY, false)).toBe('expired')
    expect(stateAt(at, issued + 100 * DAY, true)).toBe('used')
  })
})

describe('a token that no challenge of this ledger carries', () => {
  test('fails: the ledger holds no challenge with it, and the message says where such a receipt is imported', () => {
    for (const book of [[], [bookedFor(receipt, { token: 'es1:tr3.profile.s2:00000002:BBBBBBBBBBBBBBBB:20261108:00000000' })]]) {
      const found = checkBinding(receipt, SHA, book, NOW)
      expect(found.status).toBe('fail')
      expect(found.summary).toBe("This browser's ledger holds no challenge with this token.")
      expect(found.problems[0]).toContain('imported there')
    }
  })
})

describe('a reused token', () => {
  const other = sha256('another receipt')

  test('fails binding when another receipt spent it, and names that receipt', () => {
    const found = checkBinding(receipt, SHA, [bookedFor(receipt, { usedBy: other })], NOW)
    expect(found.status).toBe('fail')
    expect(found.summary).toBe('The receipt is not bound to an unused, unexpired challenge of this browser.')
    expect(found.problems).toHaveLength(1)
    expect(found.problems[0]).toContain(`spent by receipt ${other.slice(0, 8)} already`)
    expect(found.problems[0]).toContain('single-use')
  })

  test('fails whenever the receipt that spent it was first, however much time has passed', () => {
    for (const days of [0, 1, 13, 14, 50]) {
      const found = checkBinding(receipt, SHA, [bookedFor(receipt, { usedBy: other })], issued + days * DAY)
      expect(found.status, `after ${days} days`).toBe('fail')
    }
  })

  test('is bound again when it is this very receipt: a re-import is a re-verification, even after the token\'s life', () => {
    for (const days of [0, 3, 14, 400]) {
      const found = checkBinding(receipt, SHA, [bookedFor(receipt, { usedBy: SHA })], issued + days * DAY)
      expect(found.status, `after ${days} days`).toBe('pass')
      expect(found.summary).toContain('which this same receipt spent when it was first kept')
    }
  })

  test('fails for a second receipt of the same token even when that one was kept as well, because only the first receipt spent it', () => {
    // The ledger spends a token on the earliest receipt event that carries it, so `usedBy` is the first receipt's hash, and the second is not it.
    const first = sha256('the first receipt')
    expect(checkBinding(receipt, SHA, [bookedFor(receipt, { usedBy: first })], NOW).status).toBe('fail')
  })
})

describe('a challenge that is not the receipt\'s', () => {
  test('for another stage fails, and says which', () => {
    const found = checkBinding(receipt, SHA, [bookedFor(receipt, { stage: 'tr3.profile.s3' })], NOW)
    expect(found.status).toBe('fail')
    expect(found.problems).toEqual(['The challenge in the ledger is for tr3.profile.s3, and the receipt is of tr3.profile.s2.'])
  })

  test('whose seed is not the token\'s fails: the run was not made on the challenge this browser issued', () => {
    for (const over of [{ seed: 1 }, { nonce: 'CCCCCCCCCCCCCCCC' }, { issuedOn: '20261101' }]) {
      const found = checkBinding(receipt, SHA, [bookedFor(receipt, over)], NOW)
      expect(found.status, JSON.stringify(over)).toBe('fail')
      expect(found.problems[0]).toContain("is not the seed that the token derives")
    }
  })

  test('is a receipt whose reported seed is not the token\'s: the same failure, from the receipt\'s side', () => {
    const forged = structuredClone(receipt)
    forged.challenge.seed = 12345
    const found = checkBinding(forged, SHA, [bookedFor(receipt)], NOW)
    expect(found.status).toBe('fail')
    expect(found.problems[0]).toContain('is not the seed that the token derives')
  })
})

describe('the rule and the page', () => {
  test('share one definition of a token\'s life: src/receipts/challenge.ts takes it from here', () => {
    const page = read('src/receipts/challenge.ts')
    expect(page).toContain("from '@es/verify/binding'")
    expect(page).not.toMatch(/const CHALLENGE_TTL_DAYS = /)
  })
})
