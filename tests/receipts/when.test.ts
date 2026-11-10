/*
 * W2-T06: the page prints a moment as the evidence page does. `formatWhen` of src/receipts/when.ts is the one of src/evidence/transfer.ts
 * written out again (the comment of the first says why), and a test holds the two to the same text, in other zones and for a text that is
 * not a moment.
 */
import { describe, expect, test } from 'bun:test'
import { formatWhen as evidence } from '@/evidence/transfer'
import { formatWhen } from '@/receipts/when'

describe('formatWhen', () => {
  test('prints the same text as the evidence page does, in any zone', () => {
    for (const at of ['2026-11-04T09:30:00.000Z', '2026-11-04T23:30:00.000Z', '2026-12-31T23:59:59.999Z', '2028-02-29T00:00:00.000Z']) {
      for (const zone of [undefined, 'UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati']) expect(formatWhen(at, zone)).toBe(evidence(at, zone))
    }
  })

  test('prints a date and a time in the learner\'s zone, and leaves a text that is not a moment alone', () => {
    expect(formatWhen('2026-11-04T09:30:00.000Z', 'UTC')).toBe('4 Nov 2026, 09:30')
    expect(formatWhen('2026-11-04T23:30:00.000Z', 'Asia/Kolkata')).toBe('5 Nov 2026, 05:00')
    expect(formatWhen('yesterday')).toBe('yesterday')
  })
})
