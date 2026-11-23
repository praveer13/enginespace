import type { LedgerEvent } from '@es/ledger/types'

/*
 * The Prove window (ASSESSMENT §7.3), read from the ledger and from nothing else: a Prove attempt that counted, passed or not, is a `play`
 * event of the level's ref with provenance `proved`, and the next attempt that counts opens 24 hours after the newest of them. Until then
 * a Prove run can be played at once, on fresh seeds, and is stamped `practice` (src/games/kit/record.ts). A failed attempt can therefore be
 * retried straight away at practice weight, and a credited one opens a 24-hour window before the next credited attempt.
 *
 * An attempt that counts is written when it starts, as the ledger's working record `openKey(ref)` with the time it started and the time it
 * was last seen alive, and taken out when the run ends and its event is written. The tab that plays it writes the time again about every
 * 30 seconds (`BEAT_MS`). An attempt left before its end, by a reload, by leaving the page or by Leave Prove mode, is written by the page
 * that leaves it as a `play` event of the level, `proved`, a miss, with `data.left` set to the time it started (src/games/kit/left.ts):
 * it counts as a miss at the time it started, and opens the window as a miss does, and the export shows it. Otherwise a target that failed
 * could be wiped, and the seed drawn again until the first target looked easy.
 *
 * A record that a page finds, and that is not its own, is one of two things. While its time is newer than `LAPSE_MS` an attempt is open in
 * another tab, which may yet pass: the page says so, and says nothing is lost. When the time has lapsed (a tab that was closed without a
 * chance to write, a computer that slept) the page writes the event for it and takes the record out. A record from before the time was
 * written holds only when it started, and is read as lapsed. The record is a working record, not evidence: it credits nothing.
 *
 * The 24 hours are kernelspace's (`RETRY_AFTER_MS` in its prove.ts at d478f91), as ASSESSMENT §7.1 records. Everything here is a function
 * of its arguments: the clock is passed in, so a test sets it.
 */

/** How long after an attempt that counted the next one opens: 24 hours (ASSESSMENT §7.1 and §7.3). */
export const PROVE_WINDOW_MS = 24 * 60 * 60 * 1000

/** How often the tab that plays an attempt that counts writes that it is alive [estimated]. */
export const BEAT_MS = 30_000

/** How long without a beat an open record is taken as left: four beats, so one that a background tab's timer delayed is not [estimated]. */
export const LAPSE_MS = 4 * BEAT_MS

/** The newest attempt that counted, and when the next one opens. */
export interface ProveStake {
  /** Whether an attempt made now counts: no attempt that counted lies in the 24 hours before now. */
  readonly counts: boolean
  /** The newest attempt that counted, at any time, if there is one: `left` when it was left before its end. */
  readonly last: { readonly at: number; readonly ok: boolean; readonly left?: true; readonly elsewhere?: true } | null
  /** When the next attempt that counts opens, in ms; null when one made now counts. */
  readonly opensAt: number | null
}

/** The ref a Prove run of this level writes: the level's own `play:` ref, as any run of it does. */
export const proveRef = (game: string, level: string): string => `play:${game}/${level}`

/**
 * Where a page that is leaving writes, at once and in the one way a closing page can, that it left the attempt that began at the time it holds:
 * the browser's own storage, which a page writes without waiting. A page that finds it settles that attempt as left without waiting for the
 * record to lapse. A browser that refuses the storage loses nothing but that speed.
 */
export const leftNoteKey = (ref: string): string => `es:prove-left:${ref}`

/** The working record of a Prove attempt of `ref` that has started and not yet ended: `{ at }`, the time it started. */
export const openKey = (ref: string): string => `prove-open:${ref}`

/** When the open attempt in a working record's value started, in ms, or null where the value holds none. */
export function openAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('at' in value) || typeof value.at !== 'string') return null
  const at = Date.parse(value.at)
  return Number.isFinite(at) ? at : null
}

/** An open attempt's working record: when it started (the text as written, and in ms) and when its tab last said it was alive. */
export interface OpenRecord {
  readonly began: string
  readonly at: number
  readonly beat: number
}

/** The open attempt in a working record's value, or null where the value holds none. A record without `beat` is an older one: it was last seen when it started. */
export function openRecord(value: unknown): OpenRecord | null {
  if (typeof value !== 'object' || value === null || !('at' in value) || typeof value.at !== 'string') return null
  const at = Date.parse(value.at)
  if (!Number.isFinite(at)) return null
  const beat = 'beat' in value && typeof value.beat === 'string' ? Date.parse(value.beat) : at
  return { began: value.at, at, beat: Number.isFinite(beat) ? Math.max(beat, at) : at }
}

/** Whether another tab's open record is still alive at `now`: its last beat is newer than `LAPSE_MS`. */
export const aliveAt = (record: OpenRecord, now: number): boolean => now - record.beat < LAPSE_MS

/**
 * What an attempt made at `now` is worth, from the events the ledger holds. Events of other refs and other provenances are left out. A game's Prove
 * run is a `play` event; "Defend your receipt" writes a `prove` event of its lab (src/receipts/defend), and reads its window with `kind` `prove`.
 * `left` is when an attempt that counted started and never ended (openKey), or null: newer than every event, it is the last attempt, a miss.
 */
export function stakeOf(
  events: readonly LedgerEvent[],
  ref: string,
  now: number,
  kind: 'play' | 'prove' = 'play',
  left: number | null = null,
  elsewhere = false,
): ProveStake {
  let last: { at: number; ok: boolean; left?: true; elsewhere?: true } | null = null
  for (const event of events) {
    if (event.kind !== kind || event.ref !== ref || event.provenance !== 'proved') continue
    // An attempt left before its end counts from the time it started (`data.left`), not from the time a page wrote it down.
    const began = event.kind === 'play' && event.data?.left !== undefined ? Date.parse(event.data.left) : Number.NaN
    const at = Number.isFinite(began) ? began : Date.parse(event.at)
    if (!Number.isFinite(at)) continue
    if (last === null || at > last.at) last = Number.isFinite(began) ? { at, ok: false, left: true } : { at, ok: event.ok }
  }
  if (left !== null && (last === null || left > last.at)) last = elsewhere ? { at: left, ok: false, left: true, elsewhere: true } : { at: left, ok: false, left: true }
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
 * browser's unless a test gives them. The clock is the 24-hour one that /receipts writes (src/receipts/when.ts), so a time reads the same
 * on both pages.
 */
export function opensWords(opensAt: number, now: number, options: { readonly timeZone?: string; readonly locale?: string } = {}): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: options.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const time = new Intl.DateTimeFormat(options.locale ?? 'en-GB', {
    timeZone: options.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(opensAt)
  const opens = day.format(opensAt)
  if (opens === day.format(now)) return `at ${time} today`
  if (opens === day.format(now + PROVE_WINDOW_MS)) return `at ${time} tomorrow`
  const date = new Intl.DateTimeFormat(options.locale ?? 'en-GB', {
    timeZone: options.timeZone,
    day: 'numeric',
    month: 'long',
  }).format(opensAt)
  return `at ${time} on ${date}`
}
