/*
 * The export file and the records of the other stores (ARCHITECTURE §7.1 and §7.5): one JSON file that the same ledger always
 * writes as the same bytes, and a reader that refuses what it cannot be sure of.
 */
import { describe, expect, test } from 'bun:test'
import {
  buildExport,
  canonicalJson,
  decodeReceiptRecord,
  decodeWorkingRecord,
  EXPORT_SCHEMA,
  IMPORT_ERROR_MESSAGES,
  LIMITS,
  parseExport,
  SCHEMA_VERSION,
  serializeExport,
} from '@es/ledger'
import type { ExportFile, Ledger } from '@es/ledger'
import { backticked, between, read, tableRows } from '../ci/support'
import { copy, EXAMPLES, randomLedger, rngOf } from './support'

const ledger: Ledger = {
  events: [copy(EXAMPLES.play), copy(EXAMPLES.item), copy(EXAMPLES.ack)],
  receipts: [{ sha256: 'c'.repeat(64), receipt: { lab: 'tr8.replay' }, reports: [{ at: '2026-11-05T08:00:00.000Z', report: { ok: true } }] }],
}
const build = (from: Ledger = ledger): ExportFile => buildExport({ ledger: from, device: 'dev-a1', exportedAt: '2026-11-10T08:00:00.000Z' })
const text = (from: Ledger = ledger): string => serializeExport(build(from))

function refused(input: string): { error: string; detail: string } {
  const parsed = parseExport(input)
  if (parsed.ok) throw new Error('the export was accepted')
  return { error: parsed.error, detail: parsed.detail }
}

describe('ARCHITECTURE §7.5 and §7.1', () => {
  const architecture = read('docs/ARCHITECTURE.md')

  test('the export carries the fields §7.5 lists, under the schema it names', () => {
    const bullet = /`(enginespace\/export@\d+)` is one JSON file, gzip optional: `\{([^}]+)\}`/.exec(architecture)
    if (bullet === null) throw new Error('§7.5 no longer describes the export')
    expect(bullet[1]).toBe(EXPORT_SCHEMA)
    const documented = bullet[2].split(',').map((field) => field.trim().replace('[]', ''))
    expect(Object.keys(build())).toEqual(documented)
  })

  test('the stores §7.1 lists are the ones the contract names, and it keeps the checkpoints it says', () => {
    const section = between(architecture, '### 7.1 Stores', '### 7.2')
    const stores = tableRows(section).map((row) => backticked(row[0])[0])
    expect(stores).toEqual(['events', 'receipts', 'working', 'meta', 'checkpoints'])
    expect(section).toMatch(new RegExp(`at most ${LIMITS.checkpoints} kept`))
  })
})

describe('building and writing an export', () => {
  test('the events come in the order of their instant and id, and the receipts in the order of their hash', () => {
    const file = build(randomLedger(11, 20))
    const events = file.events.map((event) => `${event.at} ${event.id}`)
    expect(events).toEqual([...events].sort())
    const shas = file.receipts.map((record) => record.sha256)
    expect(shas).toEqual([...shas].sort())
  })

  test('the same ledger is the same bytes, however its lists were ordered', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const original = randomLedger(seed, 12)
      const r = rngOf(seed)
      const shuffled = {
        events: [...original.events].sort(() => r.int(3) - 1),
        receipts: [...original.receipts].sort(() => r.int(3) - 1),
      }
      expect(text(shuffled)).toBe(text(original))
    }
  })

  test('the text is canonical JSON: sorted keys and no whitespace', () => {
    const written = text()
    expect(written).toBe(canonicalJson(JSON.parse(written)))
    expect(written).not.toMatch(/\s(?=([^"]*"[^"]*")*[^"]*$)/)
    expect(Object.keys(JSON.parse(written) as object)).toEqual(Object.keys(JSON.parse(written) as object).sort())
  })

  test('it names the schema, the data model version, the device and the instant', () => {
    const file = build()
    expect(file.schema).toBe('enginespace/export@1')
    expect(file.schemaVersion).toBe(SCHEMA_VERSION)
    expect(file.device).toBe('dev-a1')
    expect(file.exportedAt).toBe('2026-11-10T08:00:00.000Z')
  })
})

describe('reading an export', () => {
  test('a file that was written reads back to the same ledger and the same bytes', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const written = text(randomLedger(seed, 12))
      const parsed = parseExport(written)
      if (!parsed.ok) throw new Error(`seed ${seed}: ${parsed.detail}`)
      expect(parsed.duplicates).toBe(0)
      expect(serializeExport(parsed.file)).toBe(written)
    }
  })

  test('an empty ledger is a file', () => {
    const parsed = parseExport(text({ events: [], receipts: [] }))
    expect(parsed.ok && parsed.file.events.length === 0 && parsed.file.receipts.length === 0).toBe(true)
  })

  test('every message is plain and names no number the code does not own', () => {
    expect(IMPORT_ERROR_MESSAGES['too-large']).toBe(`this file is over ${LIMITS.importBytes / (1024 * 1024)} MiB`)
    for (const message of Object.values(IMPORT_ERROR_MESSAGES)) expect(message).not.toMatch(/undefined|NaN|\[object/)
  })

  test('a file over the size limit is refused before it is parsed', () => {
    const result = refused('a'.repeat(LIMITS.importBytes + 1))
    expect(result.error).toBe('too-large')
    expect(result.detail).toBe(IMPORT_ERROR_MESSAGES['too-large'])
    // The limit counts bytes, so a short string of wide characters can be over it.
    expect(refused('é'.repeat(LIMITS.importBytes / 2 + 1)).error).toBe('too-large')
  })

  test('text that is not JSON is refused', () => {
    for (const input of ['', '{', 'not json', '{"schema":', '[1,2', "{'a':1}"]) expect(refused(input).error).toBe('parse')
  })

  test('JSON that is not an enginespace export is refused', () => {
    for (const input of ['null', '[]', '5', '"x"', '{}', '{"schema":5}', '{"schema":"kernelspace-progress"}', '{"schema":"enginespace/export"}', '{"schema":"enginespace/export@x"}']) {
      expect(refused(input).error).toBe('unknown-format')
    }
  })

  test('an export from a newer build is refused, before its records are read', () => {
    const file = JSON.parse(text()) as Record<string, unknown>
    expect(refused(JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION + 1 })).error).toBe('newer-schema')
    expect(refused(JSON.stringify({ ...file, schema: 'enginespace/export@2' })).error).toBe('newer-schema')
    // A newer build may write what this one cannot read; that is why the version is checked first.
    const unreadable = { ...file, schemaVersion: SCHEMA_VERSION + 1, events: [{ kind: 'from-the-future' }] }
    expect(refused(JSON.stringify(unreadable)).error).toBe('newer-schema')
    expect(refused(JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION + 1 })).detail).toContain('reload')
  })

  test('a damaged header is refused as invalid', () => {
    const file = JSON.parse(text()) as Record<string, unknown>
    const without = (key: string) => {
      const copyOf = { ...file }
      delete copyOf[key]
      return JSON.stringify(copyOf)
    }
    for (const key of ['exportedAt', 'schemaVersion', 'device', 'events', 'receipts']) expect(refused(without(key)).error).toBe('invalid')
    for (const [key, value] of [['schemaVersion', 0], ['schemaVersion', 1.5], ['schemaVersion', '1'], ['exportedAt', 'yesterday'], ['device', ''], ['events', {}], ['receipts', 'x'], ['extra', 1]] as const) {
      expect(refused(JSON.stringify({ ...file, [key]: value })).error).toBe('invalid')
    }
  })

  test('one bad record refuses the file, and the message says which record and why', () => {
    const file = JSON.parse(text()) as { events: Record<string, unknown>[]; receipts: Record<string, unknown>[] }
    const badEvent = refused(JSON.stringify({ ...file, events: [file.events[0], { ...file.events[1], score: 2 }] }))
    expect(badEvent.error).toBe('invalid')
    expect(badEvent.detail).toContain('events[1]')
    expect(badEvent.detail).toContain('score')

    const unknownKind = refused(JSON.stringify({ ...file, events: [{ ...file.events[0], kind: 'visit' }] }))
    expect(unknownKind.detail).toContain('events[0]: unknown kind "visit"')

    const badRef = refused(JSON.stringify({ ...file, events: [{ ...file.events[0], ref: 'play:' }] }))
    expect(badRef.detail).toContain('ref')

    const badReceipt = refused(JSON.stringify({ ...file, receipts: [{ ...file.receipts[0], sha256: 'abc' }] }))
    expect(badReceipt.error).toBe('invalid')
    expect(badReceipt.detail).toContain('receipts[0]')
  })

  test('a file that repeats an id is settled by the merge rule, and it says how many records that took away', () => {
    const early = { ...copy(EXAMPLES.ack), id: 'twice', at: '2026-11-04T07:00:00.000Z', tz: 0 }
    const late = { ...copy(EXAMPLES.ack), id: 'twice', at: '2026-11-04T09:00:00.000Z', tz: 0 }
    const file = { ...build({ events: [], receipts: [] }), events: [late, early, late] }
    const parsed = parseExport(JSON.stringify(file))
    if (!parsed.ok) throw new Error(parsed.detail)
    expect(parsed.file.events).toEqual([early])
    expect(parsed.duplicates).toBe(2)
  })

  test('a file that repeats a receipt joins the reports', () => {
    const first = { sha256: 'd'.repeat(64), receipt: { n: 1 }, reports: [{ at: '2026-11-05T08:00:00.000Z', report: { v: 1 } }] }
    const second = { ...first, reports: [{ at: '2026-11-06T08:00:00.000Z', report: { v: 2 } }] }
    const parsed = parseExport(JSON.stringify({ ...build({ events: [], receipts: [] }), receipts: [second, first] }))
    if (!parsed.ok) throw new Error(parsed.detail)
    expect(parsed.file.receipts).toHaveLength(1)
    expect(parsed.file.receipts[0].reports.map((report) => report.at)).toEqual(['2026-11-05T08:00:00.000Z', '2026-11-06T08:00:00.000Z'])
    expect(parsed.duplicates).toBe(1)
  })

  test('the working records of a device are not part of the file', () => {
    const parsed = parseExport(JSON.stringify({ ...build(), working: [] }))
    expect(parsed.ok).toBe(false)
  })
})

describe('the records of the other stores', () => {
  const record = ledger.receipts[0]

  test('a receipt record is a SHA-256, the parsed receipt and its reports', () => {
    expect(decodeReceiptRecord(record).ok).toBe(true)
    expect(decodeReceiptRecord({ ...record, reports: [] }).ok).toBe(true)
    for (const bad of [
      { ...record, sha256: 'abc' },
      { ...record, sha256: record.sha256.toUpperCase() },
      { ...record, receipt: undefined },
      { ...record, reports: undefined },
      { ...record, reports: [{ at: 'x', report: {} }] },
      { ...record, reports: [{ at: '2026-11-05T08:00:00.000Z' }] },
      { ...record, reports: [{ at: '2026-11-05T08:00:00.000Z', report: {}, extra: 1 }] },
      { ...record, extra: 1 },
      { ...record, receipt: { huge: 'x'.repeat(LIMITS.receiptChars) } },
      { ...record, reports: Array.from({ length: LIMITS.reports + 1 }, () => ({ at: '2026-11-05T08:00:00.000Z', report: {} })) },
      null,
      [],
    ]) {
      expect(decodeReceiptRecord(bad).ok).toBe(false)
    }
  })

  test('a working record is a key of the form namespace:name, a JSON value, an instant and a device', () => {
    const work = { key: 'settings:reduced-motion', value: true, at: '2026-11-05T08:00:00.000Z', dev: 'dev-a1' }
    expect(decodeWorkingRecord(work).ok).toBe(true)
    for (const key of ['outbox:0f8b2c64-3e1d-4a52-9d7a-61f1c0b1a2c3', 'draft:tr2.l3#tr2.l3.p1', 'tabs:evidence:filter', 'position:m/tr2']) {
      expect(decodeWorkingRecord({ ...work, key }).ok).toBe(true)
    }
    for (const key of ['', 'settings', 'settings:', ':x', 'Settings:x', 'a b:c', 'x:__proto__', 'x: y', `x:${'a'.repeat(LIMITS.refChars)}`, 5]) {
      expect(decodeWorkingRecord({ ...work, key }).ok).toBe(false)
    }
    for (const bad of [{ ...work, value: undefined }, { ...work, value: () => 1 }, { ...work, at: 'x' }, { ...work, dev: '' }, { ...work, extra: 1 }, { ...work, value: 'x'.repeat(LIMITS.workingChars) }]) {
      expect(decodeWorkingRecord(bad).ok).toBe(false)
    }
  })
})
