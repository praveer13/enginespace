/*
 * W1-T05: the local-day arithmetic that every date of Today is counted in (src/items/today/days.ts). It reads no clock and no zone,
 * so these hold in every runtime and every time zone.
 */
import { describe, expect, test } from 'bun:test'
import { isLocalDay } from '@es/ledger'
import { addDays, dayNumber, daysBetween, formatDay } from '../../src/items/today/days'
import { localDayNow } from '../../src/items/today/useLocalDay'

describe('days', () => {
  test('a day is its count since 1970-01-01, and a string that is not a calendar day is NaN', () => {
    expect(dayNumber('1970-01-01')).toBe(0)
    expect(dayNumber('1970-01-02')).toBe(1)
    expect(dayNumber('2026-11-04')).toBe(20_761)
    for (const bad of ['', '2026-02-30', '2026-13-01', '2026-1-1', 'yesterday', '2026-11-04T09:00:00Z']) expect(Number.isNaN(dayNumber(bad))).toBe(true)
  })

  test('addDays and daysBetween agree across months, years and a leap day', () => {
    expect(addDays('2026-11-04', 0)).toBe('2026-11-04')
    expect(addDays('2026-11-04', 26)).toBe('2026-11-30')
    expect(addDays('2026-11-04', 27)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-11-04', -4)).toBe('2026-10-31')
    expect(daysBetween('2026-10-31', '2026-11-04')).toBe(4)
    expect(daysBetween('2026-11-04', '2026-10-31')).toBe(-4)
    for (const n of [-400, -31, -1, 0, 1, 7, 30, 365, 1000]) expect(daysBetween('2026-11-04', addDays('2026-11-04', n))).toBe(n)
  })

  test('formats a day the way the printer writes it, from the string alone', () => {
    expect(formatDay('2026-11-04')).toBe('Wed 4 Nov')
    expect(formatDay('2026-11-06')).toBe('Fri 6 Nov')
    expect(formatDay('1970-01-01')).toBe('Thu 1 Jan')
    expect(formatDay('2028-02-29')).toBe('Tue 29 Feb')
    expect(formatDay('not a day')).toBe('not a day')
  })
})

describe('the day the page reads', () => {
  test('is a calendar day in the learner\'s zone now: within a day of the UTC day, whatever the zone', () => {
    const day = localDayNow()
    expect(isLocalDay(day)).toBe(true)
    expect(Math.abs(daysBetween(new Date().toISOString().slice(0, 10), day))).toBeLessThanOrEqual(1)
  })
})
