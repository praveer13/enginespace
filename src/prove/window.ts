import type { LedgerEvent } from '@es/ledger/types'

/*
 * The Prove window (ASSESSMENT §7.3), read from the ledger and from nothing else: a Prove attempt that counted, passed or not, is a `play`
 * event of the level's ref with provenance `proved`, and the next attempt that counts opens 24 hours after the newest of them. Until then
 * a Prove run can be played at once, on fresh seeds, and is stamped `practice` (src/games/kit/record.ts). A failed attempt can therefore be
 * retried straight away at practice weight, and a credited one opens a 24-hour window before the next credited attempt.
 *
 * The 24 hours are kernelspace's (`RETRY_AFTER_MS` in its prove.ts at d478f91), as ASSESSMENT §7.1 records. Everything here is a function
 * of its arguments: the clock is passed in, so a test sets it.
 */

/** How long after an attempt that counted the next one opens: 24 hours (ASSESSMENT §7.1 and §7.3). */
export const PROVE_WINDOW_MS = 24 * 60 * 60 * 1000

/** The newest attempt that counted, and when the next one opens. */
export interface ProveStake {
  /** Whether an attempt made now counts: no attempt that counted lies in the 24 hours before now. */
  readonly counts: boolean
  /** The newest attempt that counted, at any time, if there is one. */
  readonly last: { readonly at: number; readonly ok: boolean } | null
  /** When the next attempt that counts opens, in ms; null when one made now counts. */
  readonly opensAt: number | null
}

/** The ref a Prove run of this level writes: the level's own `play:` ref, as any run of it does. */
export const proveRef = (game: string, level: string): string => `play:${game}/${level}`

/** What an attempt made at `now` is worth, from the events the ledger holds. Events of other refs and other provenances are left out. */
export function stakeOf(events: readonly LedgerEvent[], ref: string, now: number): ProveStake {
  let last: { at: number; ok: boolean } | null = null
  for (const event of events) {
    if (event.kind !== 'play' || event.ref !== ref || event.provenance !== 'proved') continue
    const at = Date.parse(event.at)
    if (!Number.isFinite(at)) continue
    if (last === null || at > last.at) last = { at, ok: event.ok }
  }
  const opensAt = last === null ? null : last.at + PROVE_WINDOW_MS
  return opensAt !== null && now < opensAt ? { counts: false, last, opensAt } : { counts: true, last, opensAt: null }
}

/**
 * The stake once an attempt has been played: an attempt that counted moves the window to start at its own time. It is what the page knows
 * before the ledger has read the event back.
 */
export function afterAttempt(
  stake: ProveStake,
  attempt: {
    readonly at: number
    readonly ok: boolean
    readonly counted: boolean
  },
): ProveStake {
  if (!attempt.counted) return stake
  return {
    counts: false,
    last: { at: attempt.at, ok: attempt.ok },
    opensAt: attempt.at + PROVE_WINDOW_MS,
  }
}

/** The stake at `now`, from what was known earlier: the window ends on its own. */
export function stakeAt(stake: ProveStake, now: number): ProveStake {
  return stake.opensAt !== null && now >= stake.opensAt ? { counts: true, last: stake.last, opensAt: null } : stake
}

/**
 * When the next attempt opens, in the learner's words: "at 14:05 tomorrow", "at 09:30 today". The time zone and the locale are the
 * browser's unless a test gives them.
 */
export function opensWords(opensAt: number, now: number, options: { readonly timeZone?: string; readonly locale?: string } = {}): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: options.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const time = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(opensAt)
  const opens = day.format(opensAt)
  if (opens === day.format(now)) return `at ${time} today`
  if (opens === day.format(now + PROVE_WINDOW_MS)) return `at ${time} tomorrow`
  const date = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    day: 'numeric',
    month: 'long',
  }).format(opensAt)
  return `at ${time} on ${date}`
}
