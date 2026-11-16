/*
 * schemas/vectors/challenge.json (ARCHITECTURE §8.4, §9.8): the challenge token, as vectors. Tokens the codec accepts, with the parts it
 * reads from each and the checksum it computes, tokens it refuses, each wrong in one way only, and the receipt's `challenge` object where
 * its parts agree with its token or do not.
 *
 * Each refused token is made from a good body with a checksum that is right for that body, except where the checksum is the fault, so
 * that a port which refuses it refuses it for the reason the note gives. The checksum guards against typos (§8.4), and it must not hide a
 * port that skips the date or the alphabet.
 */
import { challengeChecksum, challengeSchema, checkChallenge, formatChallenge } from '../../packages/schema/challenge.ts'
import type { ChallengeParts } from '../../packages/schema/challenge.ts'
import { splitmix32u } from '../../packages/sim/core/rng.ts'
import type { Vector, VectorFile } from './format.ts'

const hex8 = (value: number): string => value.toString(16).padStart(8, '0')

/** A token's text up to the last colon, and the token with the checksum that is right for it. */
const sealed = (body: string): string => `${body}:${challengeChecksum(body)}`

const GOOD: ChallengeParts = { stage: 'tr8.replay.s2', seed: 0x0badc0de, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261104' }
const bodyOf = (parts: ChallengeParts): string => `es1:${parts.stage}:${hex8(parts.seed)}:${parts.nonce}:${parts.issuedOn}`

interface Valid {
  readonly id: string
  readonly note?: string
  readonly parts: ChallengeParts
}

const VALID: Valid[] = [
  { id: 'seed-0', note: 'seed 0 is 8 zeros', parts: { stage: 'tr0.forward.s1', seed: 0, nonce: 'AAAAAAAAAAAAAAAA', issuedOn: '20260101' } },
  { id: 'seed-0xffffffff', note: 'the largest seed is 8 f\'s, and a reader must not take it as a negative number', parts: { stage: 'tr8.replay.s2', seed: 0xffffffff, nonce: '7777777777777777', issuedOn: '20261231' } },
  { id: 'ledger-fixture', note: 'the token that the ledger\'s tests use, with the checksum that this codec computes for it', parts: GOOD },
  { id: 'seed-0x80000000', note: 'the smallest seed that a signed 32-bit integer cannot hold', parts: { stage: 'tr5b.connector.s3', seed: 0x80000000, nonce: 'A2B3C4D5E6F7G2H3', issuedOn: '20280229' } },
  { id: 'seed-0x7fffffff', parts: { stage: 'tr3.profile.s5', seed: 0x7fffffff, nonce: 'MFRGGZDFMZTWQ2LK', issuedOn: '20260630' } },
  { id: 'capstone-and-leap-day', note: '2024-02-29 is a real day', parts: { stage: 'capstone.pair.s1', seed: 1, nonce: 'ZYXWVUTSRQPONMLK', issuedOn: '20240229' } },
  { id: 'two-digit-stage-number', parts: { stage: 'tr6.proposer.s10', seed: 0x12345678, nonce: 'BBBBBBBBBBBBBBBB', issuedOn: '20260715' } },
  { id: 'hyphenated-lab', parts: { stage: 'tr1.nano-vllm.s2', seed: 0xdeadbeef, nonce: 'Q2Q2Q2Q2Q2Q2Q2Q2', issuedOn: '20261009' } },
  { id: 'last-day-of-9999', note: 'years run from 1 to 9999', parts: { stage: 'tr4.sweep.s4', seed: 42, nonce: 'LLLLLLLLLLLLLLLL', issuedOn: '99991231' } },
  { id: 'first-day-of-year-1', parts: { stage: 'tr7.reproduce.s1', seed: 7, nonce: 'MMMMMMMMMMMMMMMM', issuedOn: '00010101' } },
]

function validVectors(): Vector[] {
  return VALID.map(({ id, note, parts }) => {
    const token = formatChallenge(parts)
    const checked = checkChallenge(token)
    if (!checked.ok) throw new Error(`challenge vector ${id}: ${checked.message}`)
    const body = token.slice(0, token.lastIndexOf(':'))
    const next = splitmix32u(parts.seed)
    return {
      id: `valid-${id}`,
      ...(note === undefined ? {} : { note }),
      fn: 'token',
      token,
      stage: parts.stage,
      seed: parts.seed,
      seedHex: hex8(parts.seed),
      nonce: parts.nonce,
      issuedOn: parts.issuedOn,
      body,
      checksum: checked.parts.checksum,
      firstDraws: Array.from({ length: 4 }, () => next()),
    }
  })
}

interface Refused {
  readonly id: string
  readonly note: string
  readonly token: string
}

function refusedTokens(): Refused[] {
  const body = bodyOf(GOOD)
  const good = sealed(body)
  const withParts = (change: Partial<{ stage: string; seed: string; nonce: string; date: string; tag: string }>): string =>
    sealed(`${change.tag ?? 'es1'}:${change.stage ?? GOOD.stage}:${change.seed ?? hex8(GOOD.seed)}:${change.nonce ?? GOOD.nonce}:${change.date ?? GOOD.issuedOn}`)
  const lastColon = good.lastIndexOf(':')
  const flipped = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0')
  const refused: Refused[] = [
    { id: 'empty', note: 'nothing', token: '' },
    { id: 'words', note: 'not a token at all', token: 'hello' },
    { id: 'tag-es2', note: 'a tag this codec does not know: a change of format is a new tag', token: withParts({ tag: 'es2' }) },
    { id: 'tag-upper-case', note: 'the tag is lower case', token: withParts({ tag: 'ES1' }) },
    { id: 'stage-without-number', note: 'a lab, not a stage', token: withParts({ stage: 'tr8.replay' }) },
    { id: 'stage-number-missing-digits', note: 'the stage number has no digits', token: withParts({ stage: 'tr8.replay.s' }) },
    { id: 'stage-module-tr9', note: 'there is no module tr9', token: withParts({ stage: 'tr9.replay.s1' }) },
    { id: 'stage-upper-case', note: 'a stage is lower case', token: withParts({ stage: 'TR8.replay.s2' }) },
    { id: 'stage-double-hyphen', note: 'words of a stage are joined by single hyphens', token: withParts({ stage: 'tr8.re--play.s2' }) },
    { id: 'seed-7-digits', note: 'the seed is 8 hex digits', token: withParts({ seed: '0badc0d' }) },
    { id: 'seed-9-digits', note: 'the seed is 8 hex digits', token: withParts({ seed: '00badc0de' }) },
    { id: 'seed-upper-case', note: 'the seed is lower-case hex', token: withParts({ seed: '0BADC0DE' }) },
    { id: 'seed-not-hex', note: 'g is not a hex digit', token: withParts({ seed: '0badc0dg' }) },
    { id: 'nonce-15-characters', note: 'a nonce is 16 characters', token: withParts({ nonce: GOOD.nonce.slice(0, 15) }) },
    { id: 'nonce-17-characters', note: 'a nonce is 16 characters', token: withParts({ nonce: `${GOOD.nonce}A` }) },
    { id: 'nonce-lower-case', note: 'the base32 alphabet is upper case', token: withParts({ nonce: GOOD.nonce.toLowerCase() }) },
    { id: 'nonce-digit-0', note: '0 is not in the base32 alphabet (2 to 7 are)', token: withParts({ nonce: `0${GOOD.nonce.slice(1)}` }) },
    { id: 'nonce-digit-1', note: '1 is not in the base32 alphabet', token: withParts({ nonce: `1${GOOD.nonce.slice(1)}` }) },
    { id: 'nonce-digit-8', note: '8 is not in the base32 alphabet', token: withParts({ nonce: `8${GOOD.nonce.slice(1)}` }) },
    { id: 'nonce-digit-9', note: '9 is not in the base32 alphabet', token: withParts({ nonce: `9${GOOD.nonce.slice(1)}` }) },
    { id: 'nonce-padding', note: 'a nonce is 16 characters of the alphabet and no padding', token: withParts({ nonce: `${GOOD.nonce.slice(0, 15)}=` }) },
    { id: 'date-month-13', note: 'there is no month 13', token: withParts({ date: '20261301' }) },
    { id: 'date-month-0', note: 'there is no month 0', token: withParts({ date: '20260001' }) },
    { id: 'date-day-0', note: 'there is no day 0', token: withParts({ date: '20260100' }) },
    { id: 'date-april-31', note: 'April has 30 days', token: withParts({ date: '20260431' }) },
    { id: 'date-feb-29-in-2023', note: '2023 is not a leap year', token: withParts({ date: '20230229' }) },
    { id: 'date-feb-29-in-2100', note: '2100 is divisible by 100 and not by 400, so it is not a leap year', token: withParts({ date: '21000229' }) },
    { id: 'date-year-0', note: 'years run from 1', token: withParts({ date: '00000101' }) },
    { id: 'date-with-hyphens', note: 'the date is 8 digits', token: withParts({ date: '2026-11-04' }) },
    { id: 'date-7-digits', note: 'the date is 8 digits', token: withParts({ date: '2026110' }) },
    { id: 'checksum-one-digit-off', note: 'the checksum does not match the text before it', token: flipped },
    { id: 'checksum-upper-case', note: 'the checksum is lower-case hex', token: `${good.slice(0, lastColon + 1)}${good.slice(lastColon + 1).toUpperCase()}` },
    { id: 'checksum-7-digits', note: 'the checksum is 8 hex digits', token: good.slice(0, -1) },
    { id: 'checksum-of-the-wrong-text', note: 'the checksum is of the text before the last colon, with the colon left out', token: `${body}:${challengeChecksum(body.replace(/:/g, ''))}` },
    { id: 'checksum-of-the-text-with-its-colon', note: 'the checksum is of the text before the last colon, and not of the text with that colon', token: `${body}:${challengeChecksum(`${body}:`)}` },
    { id: 'no-checksum', note: 'the last field is missing', token: body },
    { id: 'empty-checksum', note: 'the last field is empty', token: `${body}:` },
    { id: 'extra-field', note: 'a sixth field after the checksum', token: `${good}:extra` },
    { id: 'trailing-newline', note: 'a token is read whole: Python\'s $ would let a final newline pass, so a port matches the whole text', token: `${good}\n` },
    { id: 'leading-space', note: 'a token is read whole, and the caller trims what the learner pasted', token: ` ${good}` },
    { id: 'trailing-space', note: 'a token is read whole', token: `${good} ` },
    { id: 'inner-space', note: 'no space inside', token: good.replace(':ABC', ': ABC') },
  ]
  for (const { id, token } of refused) {
    if (checkChallenge(token).ok) throw new Error(`challenge vector refused-${id}: the codec takes ${JSON.stringify(token)}`)
  }
  return refused
}

function consistencyVectors(): Vector[] {
  const token = formatChallenge(GOOD)
  const challenge = { token, seed: GOOD.seed, nonce: GOOD.nonce, issuedOn: GOOD.issuedOn }
  const cases: [string, string, Record<string, unknown>, boolean][] = [
    ['agrees', 'the parts are the token\'s own', challenge, true],
    ['seed-differs', 'the seed is not the token\'s', { ...challenge, seed: GOOD.seed + 1 }, false],
    ['nonce-differs', 'the nonce is not the token\'s', { ...challenge, nonce: 'AAAAAAAAAAAAAAAA' }, false],
    ['date-differs', 'the issue date is not the token\'s', { ...challenge, issuedOn: '20261105' }, false],
    ['token-bad-checksum', 'the token\'s checksum is wrong', { ...challenge, token: `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}` }, false],
    ['seed-above-32-bits', 'the seed does not fit 32 bits', { ...challenge, seed: 2 ** 32 }, false],
    ['extra-key', 'a receipt\'s challenge has these four fields and no other', { ...challenge, checksum: 'abcdef01' }, false],
    ['missing-key', 'a receipt\'s challenge has these four fields', { token, seed: GOOD.seed, nonce: GOOD.nonce }, false],
  ]
  return cases.map(([id, note, value, valid]) => {
    if (challengeSchema.safeParse(value).success !== valid) throw new Error(`challenge vector consistency-${id}: the schema says otherwise`)
    return { id: `challenge-object-${id}`, note, fn: 'object', value, valid }
  })
}

export function challengeFile(): VectorFile {
  return {
    spec: 'enginespace/vectors-challenge@1',
    description:
      'The challenge token es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<checksum> (ARCHITECTURE section 8.4, D-027), and the receipt\'s challenge object. A port reads a token the way packages/schema/challenge.ts does.',
    reading: [
      'A "token" vector gives a token that must be accepted, with what a port reads from it: "stage", "seed" (the 8 hex digits of "seedHex" as an unsigned integer), "nonce", "issuedOn" (YYYYMMDD) and "checksum". "body" is the token\'s text up to the last colon, and "checksum" is the 32-bit FNV-1a hash of "body" (hash32, subseed.json) as 8 lower-case hex digits. "firstDraws" are the first draws of splitmix32u(seed), which ties the seed to the stream of rng.json.',
      'The grammar, read whole with no text around it (Python: fullmatch, never a search, and never $ which also matches before a final newline): the tag "es1"; a stage id, which is a module (tr0 to tr8 with an optional a or b after the digit, or "capstone"), a dot, lower-case words joined by single hyphens, ".s" and digits; 8 lower-case hex digits; 16 characters of A to Z and 2 to 7; 8 digits; 8 lower-case hex digits. The date must be a day of the Gregorian calendar, in years 1 to 9999 (a year is a leap year when 4 divides it, and 100 does not unless 400 does).',
      'A "refused" vector gives a token that must be refused, each wrong in one way only, with a checksum that is right for its text except where the checksum is the fault. A "challenge-object" vector gives a receipt\'s challenge object: "valid" says whether it is accepted, which needs exactly the keys token, seed, nonce and issuedOn, the seed an unsigned 32-bit integer, a good token, and the seed, nonce and issue date that the token carries.',
    ],
    source: 'scripts/schemas/challenge-vectors.ts; bun scripts/export-schemas.ts writes it',
    oracle: 'packages/schema/challenge.ts; the refused tokens are made by hand from a good body, and the builder checks that the codec refuses each',
    vectors: [
      ...validVectors(),
      ...refusedTokens().map(({ id, note, token }): Vector => ({ id: `refused-${id}`, note, fn: 'refused', token })),
      ...consistencyVectors(),
    ],
  }
}
