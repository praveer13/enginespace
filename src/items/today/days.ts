/*
 * Local days (ARCHITECTURE §7.2): the grain Today counts in. An event freezes its `day` when it is written, as `YYYY-MM-DD` in the
 * learner's zone then, so everything here is arithmetic on those strings and reads no clock and no zone. A day is the count of
 * days since 1970-01-01 of that calendar date, taken in UTC so that a daylight-saving change cannot add or lose an hour.
 */
import { isLocalDay } from '@es/ledger'
import type { LocalDay } from '@es/ledger'

const DAY_MS = 86_400_000

/** The day as a count of days since 1970-01-01. A string that is not a calendar day gives NaN, which compares false with everything. */
export function dayNumber(day: LocalDay): number {
  if (!isLocalDay(day)) return Number.NaN
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS
}

/** `day` moved by `n` whole days; a negative `n` goes back. */
export const addDays = (day: LocalDay, n: number): LocalDay => new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10)

/** Whole days from `from` to `to`: negative when `to` is the earlier. */
export const daysBetween = (from: LocalDay, to: LocalDay): number => dayNumber(to) - dayNumber(from)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** A day as the printer writes it: `Tue 4 Nov`. The same in every zone and every locale, because it comes from the string alone. */
export function formatDay(day: LocalDay): string {
  if (!isLocalDay(day)) return day
  // 1970-01-01 was a Thursday.
  const weekday = (((dayNumber(day) + 4) % 7) + 7) % 7
  return `${WEEKDAYS[weekday]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
}
