/**
 * An instant in the learner's own time, as a date and a time: `4 Nov 2026, 09:30`. `timeZone` is for a test. It is `formatWhen` of
 * src/evidence/transfer.ts, written out again on purpose: importing that file from this page would make Rollup cut it out of the chunk
 * that the evidence and settings pages share and give it a chunk of its own, which both of those pages would then load (+0.7 KB gz
 * [measured 2026-11-09 at e6604b3 with this page's tree]). tests/receipts/when.test.ts holds the two to the same text.
 */
export function formatWhen(iso: string, timeZone?: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone, hourCycle: 'h23' }).format(at)
}
