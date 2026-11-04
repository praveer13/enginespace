/**
 * Ids, the clock and the day an event freezes: everything a writer injects to make an event (ARCHITECTURE §7.2).
 *
 * The package never reads the time or draws a random number on its own. A writer passes a `Clock` and an `IdFactory`, and the
 * defaults here (`systemClock`, `uuidFactory`) are the only places that touch `Date.now` and `crypto`. A test passes a fixed
 * clock and a seeded factory, and gets the same events every time.
 */
import type { Clock, IdFactory, IsoInstant, LocalDay } from './types'

/** A random UUID, version 4. Ids are never parsed: the ref and the kind live in their own fields. */
export const uuidFactory: IdFactory = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Ids in the shape of a UUID, drawn from a seed: the same seed gives the same ids. For tests and fixtures. The generator is
 * splitmix32, written out here because a package may not import `vendor/` (A§2.3).
 */
export function seededIds(seed: number): IdFactory {
  let state = seed | 0
  const next = (): number => {
    state = (state + 0x9e3779b9) | 0
    let t = state ^ (state >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t = t ^ (t >>> 15)
    t = Math.imul(t, 0x735a2d97)
    return (t ^ (t >>> 15)) >>> 0
  }
  const hex = (): string => next().toString(16).padStart(8, '0')
  return () => {
    const a = hex()
    const b = hex()
    const c = hex()
    const d = hex()
    return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${(8 + (parseInt(c[0], 16) & 3)).toString(16)}${c.slice(1, 4)}-${c.slice(4)}${d}`
  }
}

/** The real clock. `tzOffsetMinutes` is `-getTimezoneOffset()` at that instant, so a daylight-saving change is honoured. */
export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
  tzOffsetMinutes: (at) => -new Date(at).getTimezoneOffset(),
}

/** The calendar day of `at` shifted by `tz` minutes east of UTC. With the offset in force at `at` it is the learner's local day. */
export function dayOf(at: IsoInstant, tz: number): LocalDay {
  return new Date(Date.parse(at) + tz * 60_000).toISOString().slice(0, 10)
}

/** True for a canonical `Date#toISOString()` instant, the only form an event may carry. */
export function isIsoInstant(value: unknown): value is IsoInstant {
  if (typeof value !== 'string' || value.length !== 24) return false
  const ms = Date.parse(value)
  return !Number.isNaN(ms) && new Date(ms).toISOString() === value
}

/** True for a real calendar day written `YYYY-MM-DD`. */
export function isLocalDay(value: unknown): value is LocalDay {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value
}
