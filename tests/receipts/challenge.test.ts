/*
 * W2-T06, acceptance 1 and 2 (src/receipts/challenge.ts): a token the page issues is one the shared codec reads, and a token that is used
 * or expired is shown as such.
 *
 *   1. Tokens decode with the shared codec. A challenge that the page makes, over 200 seeds [estimated] and in every zone, is a token that
 *      packages/schema's `checkChallenge` takes apart into the parts it was made from, that the ledger's own reader takes too, that
 *      `challengeSchema` accepts as the object a receipt records, and whose event the ledger's codec stamps. The seed and the nonce
 *      come from the entropy and nothing else, the nonce is all of the base32 alphabet and nothing but it, and the date is the learner's day.
 *   2. A token is open, used or expired. The boundary is 14 days [estimated] to the millisecond from the instant the event was written,
 *      a spent token stays spent whatever its age, a receipt for another token spends nothing, and the order does not depend on the order
 *      the ledger lists its events in.
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent } from '@es/ledger'
import { challengeSchema, checkChallenge, NONCE_ALPHABET, NONCE_LENGTH, parseChallenge } from '@es/schema/challenge'
import { parseChallengeToken } from '@es/ledger/codec'
import {
  CHALLENGE_TTL_DAYS,
  countChallenges,
  drawParts,
  ENTROPY_WORDS,
  expiryOf,
  gradeCommand,
  heldChallenges,
  issueChallenge,
  stateAt,
} from '@/receipts/challenge'
import { RECEIPT_STAGES } from '@/receipts/labs'
import { seeds } from '../seeds'
import { entropyOf, Ledger, sha256, wordsOf } from './support'

const SEEDS = seeds(1)
const AT = '2026-11-09T12:30:00.000Z'
const DAY = 86_400_000
const ZONES = [-720, -480, 0, 60, 330, 765, 840]

describe('the draw', () => {
  test('takes the seed from the first word whole, and the nonce from the other words, five bits to a character', () => {
    const none = drawParts('tr8.replay.s2', '20261109', wordsOf())
    expect(none).toEqual({ stage: 'tr8.replay.s2', seed: 0, nonce: 'A'.repeat(NONCE_LENGTH), issuedOn: '20261109' })
    const all = drawParts('tr8.replay.s2', '20261109', wordsOf(0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff))
    expect(all.seed).toBe(4_294_967_295)
    expect(all.nonce).toBe('7'.repeat(NONCE_LENGTH))
    // Characters 0 to 5 of a word are its 5-bit groups from the low end: A B C D E F, then G H I J K L from the next word.
    const group = (a: number, b: number, c: number, d: number, e: number, f: number) => a | (b << 5) | (c << 10) | (d << 15) | (e << 20) | (f << 25)
    const spelled = drawParts('tr8.replay.s2', '20261109', wordsOf(7, group(0, 1, 2, 3, 4, 5), group(6, 7, 8, 9, 10, 11), group(12, 13, 14, 15, 16, 17)))
    expect(spelled.seed).toBe(7)
    expect(spelled.nonce).toBe('ABCDEFGHIJKLMNOP')
  })

  test('reads the high bits of a word as nothing: the 2 bits left over in each of the three words change no character', () => {
    const base = drawParts('tr8.replay.s2', '20261109', wordsOf(1, 0x12345678, 0x0abcdef0, 0x13572468))
    const high = drawParts('tr8.replay.s2', '20261109', wordsOf(1, 0x12345678 ^ 0xc0000000, 0x0abcdef0 ^ 0xc0000000, 0x13572468 ^ 0xc0000000))
    expect(high).toEqual(base)
  })

  test('asks for as many words as it uses, and refuses a source that gives fewer', () => {
    expect(ENTROPY_WORDS).toBe(4)
    expect(() => drawParts('tr8.replay.s2', '20261109', () => new Uint32Array(3))).toThrow(RangeError)
  })

  test('reaches every character of the alphabet, and no other', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) for (const char of drawParts('tr8.replay.s2', '20261109', entropyOf(seed)).nonce) seen.add(char)
    expect([...seen].sort().join('')).toBe([...NONCE_ALPHABET].sort().join(''))
  })
})

describe('a challenge the page issues', () => {
  test.each(RECEIPT_STAGES.map((stage) => stage.id))('for %s is a token that the shared codec reads back as it was made', (stage) => {
    const issued = issueChallenge(stage, AT, 0, entropyOf(7))
    const checked = checkChallenge(issued.token)
    expect(checked.ok).toBe(true)
    expect(issued.token.startsWith(`es1:${stage}:`)).toBe(true)
    expect(parseChallenge(issued.token)).toMatchObject({ stage, seed: issued.parts.seed, nonce: issued.parts.nonce, issuedOn: '20261109' })
  })

  test(`over ${SEEDS.length} seeds and in every zone: the codec, the ledger's reader, the receipt's object and the stamped event all agree`, () => {
    for (const seed of SEEDS) {
      const stage = RECEIPT_STAGES[seed % RECEIPT_STAGES.length].id
      const tz = ZONES[seed % ZONES.length]
      const issued = issueChallenge(stage, AT, tz, entropyOf(seed))
      const parts = parseChallenge(issued.token)
      expect(parts, `seed ${seed}`).not.toBeNull()
      expect(parts).toMatchObject({ stage, seed: issued.parts.seed, nonce: issued.parts.nonce, issuedOn: issued.parts.issuedOn })
      expect(parseChallengeToken(issued.token), `the ledger's reader, seed ${seed}`).toMatchObject({ stage, seed: issued.parts.seed, nonce: issued.parts.nonce, issuedOn: issued.parts.issuedOn })
      expect(challengeSchema.safeParse({ token: issued.token, seed: issued.parts.seed, nonce: issued.parts.nonce, issuedOn: issued.parts.issuedOn }).success).toBe(true)
      expect(issued.parts.nonce).toMatch(/^[A-Z2-7]{16}$/)
      expect(Number.isInteger(issued.parts.seed) && issued.parts.seed >= 0 && issued.parts.seed <= 0xffffffff).toBe(true)
      const ledger = new Ledger()
      const event = ledger.write(AT, issued.draft, tz)
      expect(decodeEvent(event).ok).toBe(true)
      // The date the token holds is the day the ledger froze into the event, which is the learner's day.
      expect(event.day.replaceAll('-', '')).toBe(issued.parts.issuedOn)
      expect(event.ref).toBe(`challenge:${stage}`)
    }
  })

  test("carries the learner's day in the token: 23:30 UTC is the next day east of Greenwich and the day before west of it", () => {
    expect(issueChallenge('tr8.replay.s2', '2026-11-09T23:30:00.000Z', 120, wordsOf()).parts.issuedOn).toBe('20261110')
    expect(issueChallenge('tr8.replay.s2', '2026-11-09T03:00:00.000Z', -480, wordsOf()).parts.issuedOn).toBe('20261108')
    expect(issueChallenge('tr8.replay.s2', '2026-12-31T23:59:59.999Z', 60, wordsOf()).parts.issuedOn).toBe('20270101')
    expect(issueChallenge('tr8.replay.s2', '2028-02-28T23:30:00.000Z', 60, wordsOf()).parts.issuedOn).toBe('20280229')
  })

  test('is the same token for the same entropy, and another for another', () => {
    const one = issueChallenge('tr8.replay.s2', AT, 0, entropyOf(1)).token
    expect(issueChallenge('tr8.replay.s2', AT, 0, entropyOf(1)).token).toBe(one)
    expect(issueChallenge('tr8.replay.s2', AT, 0, entropyOf(2)).token).not.toBe(one)
  })

  test('holds the extremes of the seed that the vectors cover: 0 and 0xffffffff', () => {
    expect(issueChallenge('tr0.forward.s1', AT, 0, wordsOf(0)).token.split(':')[2]).toBe('00000000')
    expect(issueChallenge('tr0.forward.s1', AT, 0, wordsOf(0xffffffff)).token.split(':')[2]).toBe('ffffffff')
    for (const seed of [0, 0xffffffff]) {
      const token = issueChallenge('tr0.forward.s1', AT, 0, wordsOf(seed)).token
      expect(parseChallenge(token)?.seed).toBe(seed)
    }
  })

  test('refuses a stage that is not one, and never writes a token it would refuse', () => {
    for (const stage of ['', 'tr8.replay', 'tr8.replay.s', 'TR8.replay.s1', 'tr9.replay.s1', 'tr8.replay.s1 ']) {
      expect(() => issueChallenge(stage, AT, 0, entropyOf(1)), JSON.stringify(stage)).toThrow(RangeError)
    }
  })

  test('is written as the event that A§7.2 describes: a challenge: ref for the stage, the token and its parts, and no result', () => {
    const issued = issueChallenge('tr3.profile.s2', AT, 0, entropyOf(3))
    expect(issued.draft).toEqual({
      kind: 'challenge',
      ref: 'challenge:tr3.profile.s2',
      data: { token: issued.token, seed: issued.parts.seed, nonce: issued.parts.nonce, issuedOn: '20261109' },
    })
  })
})

describe('the state of a challenge', () => {
  const written = Date.parse(AT)

  test(`is open for ${CHALLENGE_TTL_DAYS} days to the millisecond, and expired from then on`, () => {
    expect(CHALLENGE_TTL_DAYS).toBe(14)
    expect(stateAt(AT, written, false)).toBe('open')
    expect(stateAt(AT, written + 14 * DAY - 1, false)).toBe('open')
    expect(stateAt(AT, written + 14 * DAY, false)).toBe('expired')
    expect(stateAt(AT, written + 400 * DAY, false)).toBe('expired')
    expect(expiryOf(AT)).toBe('2026-11-23T12:30:00.000Z')
  })

  test('is open before it was written, as a ledger from a clock that ran ahead would hold it', () => {
    expect(stateAt(AT, written - 3 * DAY, false)).toBe('open')
  })

  test('is used once a receipt carries its token, whatever its age: a spent token stays spent', () => {
    const ledger = new Ledger()
    const fresh = ledger.challenge(AT, 'tr8.replay.s2', 1)
    const old = ledger.challenge('2026-09-01T09:00:00.000Z', 'tr3.profile.s2', 2)
    ledger.receipt('2026-11-09T13:00:00.000Z', fresh.data.token, sha256('one'))
    ledger.receipt('2026-09-02T09:00:00.000Z', old.data.token, sha256('two'))
    const held = heldChallenges(ledger.events, written + 20 * DAY)
    expect(held.map((entry) => [entry.stage, entry.state])).toEqual([
      ['tr8.replay.s2', 'used'],
      ['tr3.profile.s2', 'used'],
    ])
    expect(held[0].usedBy).toBe(sha256('one'))
    expect(held[1].usedBy).toBe(sha256('two'))
  })

  test('is spent by the earliest of the receipts that carry it, and by none that carry another token', () => {
    const ledger = new Ledger()
    const mine = ledger.challenge(AT, 'tr8.replay.s2', 1)
    const other = ledger.challenge(AT, 'tr8.replay.s2', 2)
    ledger.receipt('2026-11-10T09:00:00.000Z', mine.data.token, sha256('late'))
    ledger.receipt('2026-11-09T14:00:00.000Z', mine.data.token, sha256('early'))
    const held = heldChallenges(ledger.events, written + DAY)
    const byToken = new Map(held.map((entry) => [entry.token, entry]))
    expect(byToken.get(mine.data.token)).toMatchObject({ state: 'used', usedBy: sha256('early') })
    expect(byToken.get(other.data.token)?.state).toBe('open')
    expect(byToken.get(other.data.token)?.usedBy).toBeUndefined()
  })

  test('lists the newest first, whatever order the ledger gave them in, and says when each expires', () => {
    const ledger = new Ledger()
    const a = ledger.challenge('2026-11-01T10:00:00.000Z', 'tr0.forward.s2', 1)
    const b = ledger.challenge('2026-11-05T10:00:00.000Z', 'tr4.sweep.s1', 2)
    const c = ledger.challenge('2026-11-03T10:00:00.000Z', 'tr6.proposer.s1', 3)
    const forwards = heldChallenges(ledger.events, Date.parse('2026-11-06T00:00:00.000Z'))
    const backwards = heldChallenges([...ledger.events].reverse(), Date.parse('2026-11-06T00:00:00.000Z'))
    expect(forwards.map((entry) => entry.event.id)).toEqual([b.id, c.id, a.id])
    expect(backwards).toEqual(forwards)
    expect(forwards.map((entry) => entry.expiresAt)).toEqual(['2026-11-19T10:00:00.000Z', '2026-11-17T10:00:00.000Z', '2026-11-15T10:00:00.000Z'])
  })

  test('counts each state, and reads the events that are not challenges as nothing', () => {
    const ledger = new Ledger()
    const open = ledger.challenge('2026-11-08T10:00:00.000Z', 'tr8.replay.s2', 1)
    const used = ledger.challenge('2026-11-07T10:00:00.000Z', 'tr8.replay.s2', 2)
    ledger.challenge('2026-10-01T10:00:00.000Z', 'tr8.replay.s2', 3)
    ledger.challenge('2026-10-02T10:00:00.000Z', 'tr8.replay.s2', 4)
    ledger.receipt('2026-11-07T11:00:00.000Z', used.data.token)
    ledger.write('2026-11-08T10:00:00.000Z', { kind: 'ack', ref: 'screen:welcome' })
    const held = heldChallenges(ledger.events, Date.parse('2026-11-09T00:00:00.000Z'))
    expect(held).toHaveLength(4)
    expect(countChallenges(held)).toEqual({ open: 1, used: 1, expired: 2 })
    expect(held.find((entry) => entry.token === open.data.token)?.state).toBe('open')
    expect(countChallenges([])).toEqual({ open: 0, used: 0, expired: 0 })
  })
})

describe('the command', () => {
  test('is the grader command of A§9.4, with the stage and the token and nothing a shell would read', () => {
    const token = issueChallenge('tr8.replay.s2', AT, 0, entropyOf(5)).token
    expect(gradeCommand('tr8.replay.s2', token)).toBe(`enginespace grade tr8.replay.s2 --challenge ${token}`)
    expect(token).toMatch(/^[A-Za-z0-9.:_-]+$/)
  })
})
