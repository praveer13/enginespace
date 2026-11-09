/*
 * Export (ARCHITECTURE §7.5): the ledger as one canonical JSON file, gzipped when asked. The same ledger, device and instant
 * are the same bytes, which is what lets a backup be checked.
 */
import { describe, expect, test } from 'bun:test'
import { buildExport, normalizeLedger, parseExport, serializeExport } from '@es/ledger'
import { exportFilename, gzipBytes, makeExport } from '@/evidence/export'
import { readImportFile } from '@/evidence/import'
import { copy, EXAMPLES, randomLedger } from '../ledger/support'

const AT = '2026-11-04T09:30:00.000Z'
const ledger = () => ({ events: Object.values(EXAMPLES).map(copy), receipts: [{ sha256: 'b'.repeat(64), receipt: { lab: 'tr8.replay' }, reports: [] }] })

describe('exportFilename', () => {
  test('carries the day and the compression', () => {
    expect(exportFilename('2026-11-04', false)).toBe('enginespace-export-2026-11-04.json')
    expect(exportFilename('2026-11-04', true)).toBe('enginespace-export-2026-11-04.json.gz')
  })
})

describe('makeExport', () => {
  test('writes the ledger\'s canonical JSON, which the strict codec reads back to the same ledger', async () => {
    const out = await makeExport({ ledger: ledger(), device: 'dev-a1', exportedAt: AT, tz: 0 })
    expect(out.text).toBe(serializeExport(buildExport({ ledger: ledger(), device: 'dev-a1', exportedAt: AT })))
    expect(out.gzip).toBe(false)
    expect(out.mime).toBe('application/json')
    expect(new TextDecoder().decode(out.bytes)).toBe(out.text)
    const parsed = parseExport(out.text)
    expect(parsed.ok && parsed.file).toEqual(out.file)
    expect(out.file.events).toHaveLength(Object.keys(EXAMPLES).length)
  })

  test('is the same bytes for the same ledger however it was ordered', async () => {
    const shuffled = { ...ledger(), events: [...ledger().events].reverse() }
    const a = await makeExport({ ledger: ledger(), device: 'dev-a1', exportedAt: AT, tz: 0 })
    const b = await makeExport({ ledger: shuffled, device: 'dev-a1', exportedAt: AT, tz: 0 })
    expect(b.text).toBe(a.text)
  })

  test('is the same bytes for any seeded ledger, exported twice', async () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const events = randomLedger(seed)
      const a = await makeExport({ ledger: events, device: 'dev-a1', exportedAt: AT, tz: 0 })
      const b = await makeExport({ ledger: normalizeLedger(events), device: 'dev-a1', exportedAt: AT, tz: 0 })
      expect(b.text).toBe(a.text)
    }
  })

  test('names the file for the learner\'s own day: the zone moves it', async () => {
    const late = '2026-11-04T23:30:00.000Z'
    expect((await makeExport({ ledger: ledger(), device: 'dev-a1', exportedAt: late, tz: 0 })).filename).toBe('enginespace-export-2026-11-04.json')
    expect((await makeExport({ ledger: ledger(), device: 'dev-a1', exportedAt: late, tz: 120 })).filename).toBe('enginespace-export-2026-11-05.json')
    expect((await makeExport({ ledger: ledger(), device: 'dev-a1', exportedAt: late, tz: 0, gzip: true })).filename).toBe('enginespace-export-2026-11-04.json.gz')
  })

  test('gzip gives a smaller file that opens to the same text', async () => {
    const events = randomLedger(7, 40)
    const plain = await makeExport({ ledger: events, device: 'dev-a1', exportedAt: AT, tz: 0 })
    const zipped = await makeExport({ ledger: events, device: 'dev-a1', exportedAt: AT, tz: 0, gzip: true })
    expect(zipped.gzip).toBe(true)
    expect(zipped.mime).toBe('application/gzip')
    expect(zipped.text).toBe(plain.text)
    expect(zipped.bytes.byteLength).toBeLessThan(plain.bytes.byteLength)
    expect([zipped.bytes[0], zipped.bytes[1]]).toEqual([0x1f, 0x8b])
    const read = await readImportFile(new Blob([zipped.bytes]))
    expect(read.ok && read.text).toBe(plain.text)
  })
})

test('gzipBytes round-trips through the file reader', async () => {
  const text = JSON.stringify({ hello: 'world'.repeat(100) })
  const read = await readImportFile(new Blob([await gzipBytes(new TextEncoder().encode(text))]))
  expect(read).toEqual({ ok: true, text })
})
