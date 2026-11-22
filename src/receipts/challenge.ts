/*
 * Issuing a challenge, and reading the ones a ledger holds (ARCHITECTURE §8.4, D-027; W2-T06).
 *
 * A challenge is a token, `es1:<lab>.<stage>:<seed>:<nonce>:<issued>:<checksum>`, that this browser makes for a stage and writes to its
 * ledger as a `challenge` event. The learner copies it to the machine that runs the grader, which derives every seeded input from it; the
 * receipt that comes back is accepted only if the ledger holds an unexpired, unused challenge with the same token (A§8.5 rule 4). The
 * token's format is packages/schema's (challenge.ts, with its vectors in schemas/vectors), so the grader and this browser read a token
 * the same way, and this file makes tokens only through its `formatChallenge`.
 *
 * Nothing here reads the clock or draws a random number on its own: the instant, the zone and the entropy are parameters, so a test
 * fixes them and the page passes the browser's. Nothing is stored that can be derived (A§7): whether a token is open, used or expired
 * is worked out from the events each time, so a rule that changes rewrites no history.
 *
 * A token is in one of three states.
 *   - Used: the ledger holds a `receipt` event for it. A token is single-use (D-027), and a receipt that fails its checks still used it,
 *     because the grader's seeds were seen. Used wins over expired: a token that was spent in time stays spent.
 *   - Expired: it was not used, and `CHALLENGE_TTL_DAYS` days have passed since the event was written. The count is from the event's
 *     instant, to the millisecond, and not from the token's date, which has only the day.
 *   - Open: neither.
 * The receipt worker's binding rule (A§8.5 rule 4, W2-T07) reads the same function, so the page and the worker cannot disagree about a token:
 * `stateAt` and `CHALLENGE_TTL_DAYS` are defined once, in packages/verify/binding.ts, which this file re-exports.
 */
import { dayOf, systemClock } from '@es/ledger'
import type { ChallengeEvent, Clock, Draft, IsoInstant, LedgerEvent, Sha256 } from '@es/ledger'
import { formatChallenge, NONCE_ALPHABET, NONCE_LENGTH } from '@es/schema/challenge'
import type { ChallengeParts } from '@es/schema/challenge'
import { CHALLENGE_TTL_DAYS, stateAt } from '@es/verify/binding'
import type { ChallengeState } from '@es/verify/binding'
import { GRADED_LABS } from '@/labs/published'

/** How long a token is good for, in days [estimated]: ARCHITECTURE §8.4 and ASSESSMENT §5.3. The definition is the binding rule's (packages/verify/binding.ts). */
export { CHALLENGE_TTL_DAYS, stateAt }
export type { ChallengeState }

const DAY_MS = 86_400_000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making a token                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Where randomness comes from: `count` unsigned 32-bit words. The browser's is `crypto.getRandomValues`, and a test passes its own. */
export type Entropy = (count: number) => Uint32Array

export const browserEntropy: Entropy = (count) => crypto.getRandomValues(new Uint32Array(count))

/** The characters of the nonce that one 32-bit word gives: 5 bits each, so 6 in 30 bits. */
const CHARS_PER_WORD = 6
/** Words a challenge draws: one for the seed, and as many as the nonce's characters need. */
export const ENTROPY_WORDS = 1 + Math.ceil(NONCE_LENGTH / CHARS_PER_WORD)

/**
 * The parts of a challenge for a stage on a day. The seed is the first word whole. The nonce is 16 characters of RFC 4648's base32, each
 * the low 5 bits of a word shifted down by the character's place: 32 divides 2^32, so every character is uniform, with no modulo bias.
 */
export function drawParts(stage: string, issuedOn: string, entropy: Entropy): ChallengeParts {
  const words = entropy(ENTROPY_WORDS)
  if (words.length < ENTROPY_WORDS) throw new RangeError(`challenge: ${ENTROPY_WORDS} words of entropy are needed, and ${words.length} came`)
  let nonce = ''
  for (let at = 0; at < NONCE_LENGTH; at += 1) {
    const word = words[1 + Math.floor(at / CHARS_PER_WORD)]
    nonce += NONCE_ALPHABET[(word >>> (5 * (at % CHARS_PER_WORD))) & 31]
  }
  return { stage, seed: words[0] >>> 0, nonce, issuedOn }
}

/** A challenge made but not yet written: its token, the parts the token holds, and the event that records it. */
export interface Issued {
  readonly token: string
  readonly parts: ChallengeParts
  readonly draft: Draft<'challenge'>
}

/**
 * A new challenge for a stage, made at `at` in the zone `tz` (minutes east of UTC). The token's date is the learner's day at that
 * instant, the day the ledger freezes into the event it stamps a moment later (A§7.2), so that the date the page prints for the token
 * and for the event are one. Throws a RangeError for a stage id that is not one: the page offers only the stages of labs.ts.
 */
export function issueChallenge(stage: string, at: IsoInstant, tz: number, entropy: Entropy = browserEntropy): Issued {
  const issuedOn = dayOf(at, tz).replaceAll('-', '')
  const parts = drawParts(stage, issuedOn, entropy)
  const token = formatChallenge(parts)
  return { token, parts, draft: { kind: 'challenge', ref: `challenge:${stage}`, data: { token, seed: parts.seed, nonce: parts.nonce, issuedOn } } }
}

/** What issuing came to: the event the ledger took, and whether its store confirmed it, or why the ledger would not take it. */
export type IssueOutcome = { ok: true; event: ChallengeEvent; durable: boolean } | { ok: false; detail: string }

/** The part of the ledger that issuing needs: `append` of `useEvidence()`, and of the engine under it. */
export interface Appender {
  append(draft: Draft<'challenge'> & { kind: 'challenge' }): Promise<{ ok: true; event: ChallengeEvent; durable: boolean } | { ok: false; error: string; detail: string }>
}

/**
 * Issues a challenge for a stage and writes it to the ledger: the token is made at the clock's instant in the clock's zone, and the
 * ledger stamps the event a moment later. Nothing is sent anywhere (I1). The outcome says what the ledger did, and a ledger that
 * will not write (it is read-only, or closed) says why, in its own words.
 */
export async function writeChallenge(stage: string, ledger: Appender, clock: Clock = systemClock, entropy: Entropy = browserEntropy): Promise<IssueOutcome> {
  const at = clock.nowIso()
  const made = issueChallenge(stage, at, clock.tzOffsetMinutes(at), entropy)
  const result = await ledger.append(made.draft)
  return result.ok ? { ok: true, event: result.event, durable: result.durable } : { ok: false, detail: result.detail }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the ledger's challenges                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A challenge the ledger holds, with the state it is in at the instant it was asked about. */
export interface HeldChallenge {
  readonly event: ChallengeEvent
  readonly token: string
  readonly stage: string
  readonly state: ChallengeState
  /** The instant the token stops being good: when it was issued, and `CHALLENGE_TTL_DAYS` days. */
  readonly expiresAt: IsoInstant
  /** For a used token, the SHA-256 of the first receipt that used it. */
  readonly usedBy?: Sha256
}

/** The instant a challenge written at `at` expires. */
export const expiryOf = (at: IsoInstant): IsoInstant => new Date(Date.parse(at) + CHALLENGE_TTL_DAYS * DAY_MS).toISOString()

/** Now, in milliseconds. It is a function of its own so that the page reads the clock where it counts the states, and not while it draws. */
export const clockNow = (): number => Date.now()

/** Newest first: by the instant written, then by id, so that the order does not depend on the order the ledger listed them in. */
const newestFirst = (a: ChallengeEvent, b: ChallengeEvent): number => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1)

/**
 * The challenges in a ledger, newest first, each in the state it is in at `nowMs`. A receipt event uses the token it names, whichever
 * stage it is for: a token is spent by the first receipt (the earliest `at`) that carries it.
 */
export function heldChallenges(events: readonly LedgerEvent[], nowMs: number): HeldChallenge[] {
  const spent = new Map<string, { at: IsoInstant; sha: Sha256 }>()
  const challenges: ChallengeEvent[] = []
  for (const event of events) {
    if (event.kind === 'challenge') challenges.push(event)
    else if (event.kind === 'receipt') {
      const first = spent.get(event.data.challenge)
      if (first === undefined || event.at < first.at) spent.set(event.data.challenge, { at: event.at, sha: event.data.receiptSha256 })
    }
  }
  return challenges.sort(newestFirst).map((event) => {
    const by = spent.get(event.data.token)
    const stage = event.ref.slice('challenge:'.length)
    return {
      event,
      token: event.data.token,
      stage,
      state: stateAt(event.at, nowMs, by !== undefined),
      expiresAt: expiryOf(event.at),
      ...(by === undefined ? {} : { usedBy: by.sha }),
    }
  })
}

/** How many of each state. */
export interface ChallengeCounts {
  readonly open: number
  readonly used: number
  readonly expired: number
}

export function countChallenges(held: readonly HeldChallenge[]): ChallengeCounts {
  const counts = { open: 0, used: 0, expired: 0 }
  for (const challenge of held) counts[challenge.state] += 1
  return counts
}

/** Where a lab page's command takes the token. */
const TOKEN_SLOT = '<token>'

/**
 * The command that runs a challenge on the learner's machine (A§9.4), in two parts around the token. A lab with a page prints its own
 * command for each stage (src/labs/published.ts), which runs the grader through the kit's environment, so the ticket prints that same
 * command: a bare `enginespace` is on no PATH after the kit's `uv sync`. A lab with no page yet keeps the grader's bare command.
 */
export function gradeCommandParts(stage: string): { readonly before: string; readonly after: string } {
  for (const lab of Object.values(GRADED_LABS)) {
    const line = lab.stages.find((candidate) => candidate.id === stage)?.run.line
    const at = line?.indexOf(TOKEN_SLOT) ?? -1
    if (line !== undefined && at >= 0) return { before: line.slice(0, at), after: line.slice(at + TOKEN_SLOT.length) }
  }
  return { before: `enginespace grade ${stage} --challenge `, after: '' }
}

/** The whole command, with the token in it. The token is quoted by nothing: it holds no character a shell reads. */
export function gradeCommand(stage: string, token: string): string {
  const { before, after } = gradeCommandParts(stage)
  return `${before}${token}${after}`
}
