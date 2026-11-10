/**
 * The challenge (ARCHITECTURE §8.4, D-027): the token that the learner's browser issues and the grader decodes, and the object that a
 * receipt records for it.
 *
 *   es1:<lab>.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>
 *
 * §8.4 leaves five things open, and this file settles them so that the site and the grader read a token the same way.
 * schemas/vectors/challenge.json holds the cases, and the Python port has to match every one:
 *   - The stage is a stage id (refs.ts), such as `tr8.replay.s2`: a lab's id, then `.s` and the stage's number.
 *   - The seed is 8 lower-case hex digits, an unsigned 32-bit integer. The grader derives every seeded input from it with `rngFor`.
 *   - The nonce is 16 characters of RFC 4648 base32 in upper case (A to Z and 2 to 7). That is 80 bits [derived: 16 × 5], and the same
 *     16 characters decode to 10 bytes in Python's `base64.b32decode` and in any other library, with no padding to add.
 *   - The date is a day of the Gregorian calendar written as 8 digits, in years 1 to 9999.
 *   - The checksum is the FNV-1a hash of the token's text up to the last colon, `es1:` through the date, as 8 lower-case hex digits. It
 *     catches a mistyped or cut-off token and is not security (§8.4). A token is read whole: a space, a line break or any other text
 *     around it is an error, and the caller trims what the learner pasted.
 *
 * A receipt records the token with its parts (`challenge`, A§9.6), and the browser compares them with the token and with the issuing
 * ledger's `challenge` event. This file checks that the parts agree with the token. Whether the token is unexpired and unused is for the
 * ledger, which knows the clock and the events.
 *
 * Nothing here imports another package (A§2.3), so the checksum's FNV-1a is written out. It is the function that `hash32` is in
 * vendor/kernelspace/src/lib/rng.ts, and tests/schema/challenge.test.ts holds the two to the same values.
 */
import { z } from './zod'
import { isCalendarDay, uint32 } from './common'
import { STAGE_ID_SOURCE } from './refs'

/** The token's version tag. A change to the format is a new tag, and a reader refuses a tag it does not know. */
export const CHALLENGE_TAG = 'es1'

/** The nonce's characters: RFC 4648's base32 alphabet, in order. */
export const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** How many characters a nonce has. */
export const NONCE_LENGTH = 16

/**
 * FNV-1a over the UTF-16 code units of `text`, 32 bits: `hash32` of kernelspace's rng.ts. For ASCII text, which is all a token and a
 * salt are, it is the ordinary byte-wise FNV-1a that any language computes.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const hex8 = (value: number): string => value.toString(16).padStart(8, '0')

/** The checksum of a token whose text before the last colon is `body`: 8 lower-case hex digits. */
export const challengeChecksum = (body: string): string => hex8(fnv1a32(body))

const SEED = '[0-9a-f]{8}'
const NONCE = `[A-Z2-7]{${NONCE_LENGTH}}`
const DATE = '[0-9]{8}'
const CHECKSUM = '[0-9a-f]{8}'

/** The token's pattern, for the export to JSON Schema. The capture groups, in order, are the stage, the seed, the nonce, the date and the checksum. */
export const CHALLENGE_TOKEN_SOURCE = `^${CHALLENGE_TAG}:(${STAGE_ID_SOURCE}):(${SEED}):(${NONCE}):(${DATE}):(${CHECKSUM})$`
const TOKEN = new RegExp(CHALLENGE_TOKEN_SOURCE)
const STAGE = new RegExp(`^${STAGE_ID_SOURCE}$`)
const NONCE_TEXT = new RegExp(`^${NONCE}$`)
const DATE_TEXT = new RegExp(`^${DATE}$`)

/** Whether `text` is 8 digits that name a day of the calendar, as `YYYYMMDD`. */
export function isIssueDate(text: string): boolean {
  if (!DATE_TEXT.test(text)) return false
  return isCalendarDay(Number.parseInt(text.slice(0, 4), 10), Number.parseInt(text.slice(4, 6), 10), Number.parseInt(text.slice(6), 10))
}

/** What a token says, apart from its checksum. */
export interface ChallengeParts {
  readonly stage: string
  readonly seed: number
  readonly nonce: string
  /** `YYYYMMDD`. */
  readonly issuedOn: string
}

/** A token taken apart: its parts, and the checksum as written. */
export type ParsedChallenge = ChallengeParts & { readonly checksum: string }

/** What can be wrong with a token, in the order `checkChallenge` looks. */
export type ChallengeProblem = 'shape' | 'date' | 'checksum'

export type ChallengeCheck =
  | { readonly ok: true; readonly parts: ParsedChallenge }
  | { readonly ok: false; readonly problem: ChallengeProblem; readonly message: string }

const SHAPE_MESSAGE = 'must be a challenge token es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<checksum> (ARCHITECTURE §8.4)'

/** Takes a token apart and says what is wrong with it, if anything: its shape, then its date, then its checksum. */
export function checkChallenge(token: string): ChallengeCheck {
  const found = TOKEN.exec(token)
  if (found === null) return { ok: false, problem: 'shape', message: SHAPE_MESSAGE }
  const [, stage, seed, nonce, issuedOn, checksum] = found
  if (!isIssueDate(issuedOn)) return { ok: false, problem: 'date', message: `the issue date ${issuedOn} is not a day of the calendar` }
  const expected = challengeChecksum(token.slice(0, token.lastIndexOf(':')))
  if (checksum !== expected) return { ok: false, problem: 'checksum', message: `the checksum is ${checksum}, and the token's text gives ${expected}` }
  return { ok: true, parts: { stage, seed: Number.parseInt(seed, 16), nonce, issuedOn, checksum } }
}

/** A token taken apart, or null when it is not a token. */
export function parseChallenge(token: string): ParsedChallenge | null {
  const checked = checkChallenge(token)
  return checked.ok ? checked.parts : null
}

/** What is wrong with the parts of a token, as sentences: empty when `formatChallenge` can write them. */
export function challengePartsProblems(parts: ChallengeParts): string[] {
  const problems: string[] = []
  if (!STAGE.test(parts.stage)) problems.push(`the stage ${JSON.stringify(parts.stage)} is not a stage id such as tr8.replay.s2`)
  if (!uint32.safeParse(parts.seed).success) problems.push(`the seed ${String(parts.seed)} is not an unsigned 32-bit integer`)
  if (!NONCE_TEXT.test(parts.nonce)) problems.push(`the nonce ${JSON.stringify(parts.nonce)} is not ${NONCE_LENGTH} characters of A to Z and 2 to 7`)
  if (!isIssueDate(parts.issuedOn)) problems.push(`the issue date ${JSON.stringify(parts.issuedOn)} is not a day of the calendar written YYYYMMDD`)
  return problems
}

/** The token for these parts, with its checksum. It throws a RangeError that lists what is wrong with parts that do not make one. */
export function formatChallenge(parts: ChallengeParts): string {
  const problems = challengePartsProblems(parts)
  if (problems.length > 0) throw new RangeError(`challenge: ${problems.join('; ')}`)
  const body = `${CHALLENGE_TAG}:${parts.stage}:${hex8(parts.seed)}:${parts.nonce}:${parts.issuedOn}`
  return `${body}:${challengeChecksum(body)}`
}

/** A challenge token. The pattern is what the export says, and the date and the checksum are checked as well. */
export const challengeTokenSchema = z
  .string()
  .regex(TOKEN, SHAPE_MESSAGE)
  .superRefine((token, ctx) => {
    const checked = checkChallenge(token)
    if (!checked.ok && checked.problem !== 'shape') ctx.addIssue({ code: 'custom', message: checked.message })
  })

/**
 * The challenge as a receipt records it (A§9.6): the token, and its seed, nonce and issue date, which the browser derives from the token
 * again and compares. The parts have to be the token's own. They are the fields of the ledger's `challenge` event as well.
 */
export const challengeSchema = z
  .strictObject({
    token: challengeTokenSchema,
    seed: uint32,
    nonce: z.string().regex(NONCE_TEXT, `must be ${NONCE_LENGTH} characters of A to Z and 2 to 7 (RFC 4648 base32)`),
    issuedOn: z
      .string()
      .regex(DATE_TEXT, 'must be a day written YYYYMMDD')
      .refine(isIssueDate, 'must be a day of the calendar'),
  })
  .superRefine((challenge, ctx) => {
    const token = parseChallenge(challenge.token)
    if (token === null) return
    if (challenge.seed !== token.seed) ctx.addIssue({ code: 'custom', message: 'must be the seed in the token', path: ['seed'] })
    if (challenge.nonce !== token.nonce) ctx.addIssue({ code: 'custom', message: 'must be the nonce in the token', path: ['nonce'] })
    if (challenge.issuedOn !== token.issuedOn) ctx.addIssue({ code: 'custom', message: 'must be the issue date in the token', path: ['issuedOn'] })
  })
  .meta({
    title: 'enginespace challenge',
    description:
      'The challenge a receipt was graded on (ARCHITECTURE §8.4). Checked by the site and not expressible in JSON Schema: the issue date is a day of the calendar, the token\'s checksum is the FNV-1a hash of its text up to the last colon, and seed, nonce and issuedOn are the token\'s own.',
  })

export type Challenge = z.infer<typeof challengeSchema>
