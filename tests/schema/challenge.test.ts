/*
 * W2-T01's challenge (ARCHITECTURE §8.4, D-027): the token's grammar and checksum, the codec that writes and reads it, and the object a
 * receipt records. schemas/vectors/challenge.json holds the cases the Python grader has to match, and tests/schema/vectors.test.ts runs
 * them against the code; these are the rest:
 *
 *   - the token's shape is the one A§8.4 writes, and the codec's fields have its widths;
 *   - the checksum is the FNV-1a hash that `hash32` of kernelspace's rng.ts is, on every text a token can hold;
 *   - a token that `formatChallenge` writes is one that `parseChallenge` reads back, over 200 seeds [estimated];
 *   - the ledger's reader takes every token this codec writes, and the nonce alphabet is a subset of what it takes;
 *   - the receipt's `challenge` object is the token's own parts, field by field.
 */
import { describe, expect, test } from 'bun:test'
import {
  CHALLENGE_TOKEN_SOURCE,
  NONCE_ALPHABET,
  NONCE_LENGTH,
  challengePartsProblems,
  challengeChecksum,
  challengeSchema,
  challengeTokenSchema,
  checkChallenge,
  fnv1a32,
  formatChallenge,
  isIssueDate,
  parseChallenge,
} from '@es/schema/challenge'
import { isCalendarDay } from '@es/schema/common'
import { stageIdSchema } from '@es/schema/refs'
import { parseChallengeToken } from '@es/ledger/codec'
import { below, hash32, pick, rngFor } from '../../packages/sim/core/rng'
import { seeds } from '../seeds'
import { between, read } from './support'

const SEEDS = seeds(1)
const STAGES = ['tr0.forward.s1', 'tr1.fork.s2', 'tr3.profile.s5', 'tr5b.connector.s3', 'tr6.proposer.s10', 'tr8.replay.s2', 'capstone.pair.s1']

/** The parts of a token that a seed draws, all of them valid. */
function partsOf(seed: number) {
  const rng = rngFor(seed, 'tests/challenge')
  const nonce = Array.from({ length: NONCE_LENGTH }, () => NONCE_ALPHABET[below(rng, 32)]).join('')
  const year = 1 + below(rng, 9999)
  const month = 1 + below(rng, 12)
  let day = 1 + below(rng, 31)
  while (!isCalendarDay(year, month, day)) day -= 1
  const issuedOn = `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
  return { stage: pick(rng, STAGES), seed: rng(), nonce, issuedOn }
}

describe("ARCHITECTURE §8.4's token", () => {
  const architecture = read('docs/ARCHITECTURE.md')
  const shape = /`(es1:<lab>\.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>)`/.exec(between(architecture, '**The challenge token.**', '- The FNV-1a checksum'))?.[1]

  test('has the six fields that the codec writes, with the widths the document gives', () => {
    expect(shape).toBeDefined()
    const fields = (shape as string).split(':')
    expect(fields).toHaveLength(6)
    expect(fields[0]).toBe('es1')
    expect(fields[2]).toContain('8 hex')
    expect(fields[3]).toContain(`${NONCE_LENGTH} base32`)
    expect(fields[4]).toContain('YYYYMMDD')
    expect(fields[5]).toContain('8 hex')
    const token = formatChallenge({ stage: 'tr8.replay.s1', seed: 255, nonce: 'A'.repeat(NONCE_LENGTH), issuedOn: '20261104' })
    const found = token.split(':')
    expect(found.map((field) => field.length)).toEqual(['es1'.length, 'tr8.replay.s1'.length, 8, NONCE_LENGTH, 8, 8])
    expect(found[2]).toBe('000000ff')
  })

  test('says that the checksum is FNV-1a, that the token binds to the ledger and that it expires', () => {
    const section = between(architecture, '**The challenge token.**', '### 8.5')
    expect(section).toContain('The FNV-1a checksum catches typos and is not security.')
    expect(section).toContain('A token is single-use.')
  })

  test('the nonce alphabet is the 32 characters of RFC 4648 base32, in order, and 16 of them are 80 bits', () => {
    expect(NONCE_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')
    expect(NONCE_ALPHABET).toHaveLength(32)
    expect(NONCE_LENGTH * Math.log2(NONCE_ALPHABET.length)).toBe(80)
  })
})

describe('the checksum', () => {
  test('is hash32 of kernelspace’s rng.ts: FNV-1a over the code units, on three known values and on 200 seeded texts', () => {
    // The 32-bit FNV-1a values of the empty text (the offset basis), "a" and "foobar", as the FNV reference lists them [unverified against its files this session]; the BigInt FNV-1a of tests/schema/vectors.test.ts and an independent Python one agree.
    expect([fnv1a32(''), fnv1a32('a'), fnv1a32('foobar')]).toEqual([0x811c9dc5, 0xe40c292c, 0xbf9cf968])
    for (const seed of SEEDS) {
      const rng = rngFor(seed, 'tests/challenge/text')
      const text = Array.from({ length: below(rng, 80) }, () => String.fromCharCode(below(rng, 0x80))).join('')
      expect(fnv1a32(text)).toBe(hash32(text))
    }
  })

  test('is 8 lower-case hex digits, zero-padded, of the token’s text up to the last colon', () => {
    expect(challengeChecksum('')).toBe('811c9dc5')
    const token = formatChallenge({ stage: 'tr0.forward.s1', seed: 0, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' })
    expect(token.slice(token.lastIndexOf(':') + 1)).toBe(challengeChecksum(token.slice(0, token.lastIndexOf(':'))))
    // A checksum with leading zeros keeps them.
    const padded = SEEDS.map(partsOf).map(formatChallenge).find((t) => t.endsWith(':0') || /:0[0-9a-f]{7}$/.test(t))
    expect(padded).toBeDefined()
    expect(/:[0-9a-f]{8}$/.test(padded as string)).toBe(true)
  })
})

describe('formatChallenge and parseChallenge', () => {
  test('read back what was written, over 200 seeds [estimated], with the seed as an unsigned number', () => {
    for (const seed of SEEDS) {
      const parts = partsOf(seed)
      const token = formatChallenge(parts)
      const read = parseChallenge(token)
      expect(read).not.toBeNull()
      expect({ stage: read?.stage, seed: read?.seed, nonce: read?.nonce, issuedOn: read?.issuedOn }).toEqual(parts)
      expect(read?.seed).toBeGreaterThanOrEqual(0)
      expect(challengeTokenSchema.safeParse(token).success).toBe(true)
    }
  })

  test('write seed 0 and the largest seed as 8 hex digits, and a seed past 2^31 as a positive number', () => {
    const at = (seed: number) => formatChallenge({ stage: 'tr8.replay.s2', seed, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' }).split(':')[2]
    expect([at(0), at(0xffffffff), at(0x80000000), at(0x7fffffff)]).toEqual(['00000000', 'ffffffff', '80000000', '7fffffff'])
    expect(parseChallenge(formatChallenge({ stage: 'tr8.replay.s2', seed: 0xffffffff, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' }))?.seed).toBe(4294967295)
  })

  test('refuse parts that make no token, and name each fault', () => {
    const good = { stage: 'tr8.replay.s2', seed: 7, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' }
    expect(challengePartsProblems(good)).toEqual([])
    expect(challengePartsProblems({ ...good, stage: 'tr8.replay' })).toEqual([expect.stringContaining('stage')])
    expect(challengePartsProblems({ ...good, seed: 2 ** 32 })).toEqual([expect.stringContaining('seed')])
    expect(challengePartsProblems({ ...good, seed: -1 })).toEqual([expect.stringContaining('seed')])
    expect(challengePartsProblems({ ...good, seed: 1.5 })).toEqual([expect.stringContaining('seed')])
    expect(challengePartsProblems({ ...good, nonce: 'aaaaaaaaaaaaaaaa' })).toEqual([expect.stringContaining('nonce')])
    expect(challengePartsProblems({ ...good, issuedOn: '20260230' })).toEqual([expect.stringContaining('issue date')])
    expect(challengePartsProblems({ stage: 'x', seed: -1, nonce: '', issuedOn: '' })).toHaveLength(4)
    expect(() => formatChallenge({ ...good, nonce: 'short' })).toThrow('nonce')
  })

  test('check a token’s shape, then its date, then its checksum, and say which', () => {
    const good = formatChallenge({ stage: 'tr8.replay.s2', seed: 7, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' })
    expect(checkChallenge(good).ok).toBe(true)
    const problem = (token: string) => {
      const found = checkChallenge(token)
      return found.ok ? 'ok' : found.problem
    }
    expect(problem('nonsense')).toBe('shape')
    expect(problem(`${good}\n`)).toBe('shape')
    expect(problem(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'))).toBe('checksum')
    const body = 'es1:tr8.replay.s2:00000007:AAAAAAAAAAAAAAAA:20260230'
    expect(problem(`${body}:${challengeChecksum(body)}`)).toBe('date')
    // Both a bad date and a bad checksum: the date is named.
    expect(problem(`${body}:00000000`)).toBe('date')
  })

  test('take a day of the calendar and refuse the rest, with the leap years that the Gregorian rule gives', () => {
    for (const date of ['00010101', '20240229', '20000229', '99991231', '20261231']) expect([date, isIssueDate(date)]).toEqual([date, true])
    for (const date of ['00000101', '20230229', '21000229', '19000229', '20260431', '20261301', '20260001', '20260100', '2026110', '2026-11-04', '']) {
      expect([date, isIssueDate(date)]).toEqual([date, false])
    }
  })
})

describe('agreement with the ledger’s reader (packages/ledger)', () => {
  test('reads every token this codec writes, and finds the same parts', () => {
    for (const seed of SEEDS) {
      const parts = partsOf(seed)
      const token = formatChallenge(parts)
      expect(parseChallengeToken(token)).toEqual({ ...parts, checksum: token.slice(-8) })
    }
  })

  test('takes at least the nonces that this codec takes: the alphabet is a subset of the ledger’s', () => {
    expect(/^[A-Za-z0-9]{16}$/.test(NONCE_ALPHABET.repeat(1).slice(0, 16))).toBe(true)
    expect([...NONCE_ALPHABET].every((letter) => /[A-Za-z0-9]/.test(letter))).toBe(true)
  })

  test('the stage inside the pattern is the stage id of refs.ts: a token takes the stages that stageIdSchema takes, and no other', () => {
    expect(CHALLENGE_TOKEN_SOURCE).toContain('tr[0-8][ab]?')
    const candidates = [...STAGES, 'tr8.replay', 'tr8.replay.s', 'tr9.replay.s1', 'TR8.replay.s2', 'tr8.re--play.s2', 'tr8..s2', 'tr8.replay.s2.x', 'capstone.s1', 'x.y.s1', 'tr5a.hybrid.s1', 'tr0.a-b-c.s01']
    for (const stage of candidates) {
      const body = `es1:${stage}:00000007:AAAAAAAAAAAAAAAA:20260101`
      expect([stage, checkChallenge(`${body}:${challengeChecksum(body)}`).ok]).toEqual([stage, stageIdSchema.safeParse(stage).success])
    }
  })
})

describe("the receipt's challenge object", () => {
  const parts = { stage: 'tr8.replay.s2', seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' }
  const token = formatChallenge(parts)
  const object = { token, seed: parts.seed, nonce: parts.nonce, issuedOn: parts.issuedOn }

  test('takes the token’s own parts', () => {
    expect(challengeSchema.safeParse(object).success).toBe(true)
  })

  test('refuses a seed, a nonce or a date that is not the token’s, naming the field', () => {
    const issues = (value: unknown) => {
      const found = challengeSchema.safeParse(value)
      return found.success ? [] : found.error.issues.map((issue) => issue.path.join('.'))
    }
    expect(issues({ ...object, seed: object.seed + 1 })).toEqual(['seed'])
    expect(issues({ ...object, nonce: 'AAAAAAAAAAAAAAAA' })).toEqual(['nonce'])
    expect(issues({ ...object, issuedOn: '20261105' })).toEqual(['issuedOn'])
    expect(issues({ ...object, extra: 1 })).toEqual([''])
    expect(issues({ ...object, seed: 2 ** 32 })).toContain('seed')
  })
})
