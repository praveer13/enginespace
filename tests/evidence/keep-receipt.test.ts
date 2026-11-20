/*
 * W2-T07: the engine keeps a checked receipt (`keepReceipt`). The parsed receipt and its report go to the `receipts` store, and the event
 * that spends the challenge's token goes to `events`, in one transaction, so a receipt is never held without the event that spent its token and
 * the event is never written for a receipt that is not there (ARCHITECTURE §7.1, §7.4).
 *
 *   - One commit holds both. A store that refuses it leaves the ledger as it was, and the answer says so.
 *   - A receipt that is kept already gains the report of the new check and no second event; it keeps its newest `LIMITS.reports` reports, so that
 *     an export of the ledger can always be read back (the codec refuses a record with more).
 *   - A record the codec would refuse is refused here, where the receipt is, and not at the next import: an export that carried it would be
 *     refused whole.
 *   - A ledger that has a newer schema is read-only, and keeps nothing. Another tab sees what was kept.
 *   - What was kept exports, and imports again, as any receipt does.
 */
import { describe, expect, test } from 'bun:test'
import { decodeReceiptRecord, LIMITS, parseExport } from '@es/ledger'
import type { Draft, Json, ReceiptRecord, VerificationReport } from '@es/ledger'
import { CHANNEL_NAME } from '@/evidence/channel'
import { sha256 as hashOf, sampleReceipt } from '../schema/receipt-support'
import { FakeBus, openTab, SharedDb, until, watch } from './support'

const SHA = hashOf('a receipt')
const TOKEN = sampleReceipt().challenge.token

const report = (at: string, note = 'checked'): VerificationReport => ({ at, report: { v: 1, ran: 6, rules: [], note } })
const record = (reports: VerificationReport[] = [report('2026-11-04T09:00:00.000Z')]): ReceiptRecord => ({ sha256: SHA, receipt: { lab: 'tr3.profile' }, reports })

const event: Draft<'receipt'> = {
  kind: 'receipt',
  ref: 'receipt:tr3.profile.s2',
  data: {
    receiptSha256: SHA,
    challenge: TOKEN,
    graderVersion: '0.1.0',
    environment: 'Example GPU 24GB, vllm 0.33.0, driver 580.82.07',
  },
}

describe('keeping a receipt', () => {
  test('writes the record and the event in one commit, and the snapshot shows both', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const before = db.commits
    const kept = await engine.keepReceipt({ record: record(), event })
    expect(kept.ok).toBe(true)
    expect(db.commits - before).toBe(1)
    const stored = await db.data.readAll()
    expect(stored.receipts.map((entry) => entry.sha256)).toEqual([SHA])
    expect(stored.events.map((entry) => entry.kind)).toEqual(['receipt'])
    const snapshot = engine.getSnapshot()
    expect(snapshot.receipts).toHaveLength(1)
    expect(snapshot.events).toHaveLength(1)
    if (kept.ok) {
      expect(kept.event).toMatchObject({ kind: 'receipt', data: { receiptSha256: SHA, challenge: TOKEN } })
      expect(Object.keys(kept.event ?? {})).not.toEqual(expect.arrayContaining(['ok']))
      expect(kept.event).not.toHaveProperty('score')
      expect(kept.event).not.toHaveProperty('provenance')
      expect(kept.event?.data).not.toHaveProperty('checks')
      expect(kept.event?.dev).toBe(snapshot.deviceId)
      expect(kept.record.reports).toHaveLength(1)
    }
  })

  test('stamps the event as any event is stamped: a day, a zone, an instant, an id', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.keepReceipt({ record: record(), event })
    const [written] = engine.getSnapshot().events
    expect(written).toMatchObject({ v: 1, at: '2026-11-04T09:00:00.000Z', tz: 0, day: '2026-11-04' })
    expect(written.id.length).toBeGreaterThan(8)
  })

  test('asks the browser to keep the learner\'s storage after the first graded event, as a lab check does', async () => {
    const db = new SharedDb()
    let asked = 0
    const { engine } = await openTab(db, null, { storageManager: { persisted: async () => false, persist: async () => ((asked += 1), true) } })
    await engine.keepReceipt({ record: record(), event })
    await engine.flush()
    await until(() => asked > 0, 'the request for persistent storage')
    expect(asked).toBe(1)
  })

  test('leaves the ledger as it was when the store refuses the commit, and says so', async () => {
    const db = new SharedDb()
    // Only the commit that carries a receipt fails: the opening's own commits go through.
    const failing = watch(db.connect(), {
      commit: (tx) => {
        if (tx.putReceipts !== undefined) throw new Error('the disk is full')
      },
    })
    const { engine } = await openTab(db, null, { store: failing })
    const kept = await engine.keepReceipt({ record: record(), event })
    expect(kept).toEqual({ ok: false, error: 'failed', detail: 'The browser could not save the change, and nothing was changed.' })
    const stored = await db.data.readAll()
    expect(stored.receipts).toEqual([])
    expect(stored.events).toEqual([])
    expect(engine.getSnapshot().receipts).toEqual([])
    expect(engine.getSnapshot().events).toEqual([])
  })
})

describe('keeping a receipt that is kept already', () => {
  test('adds the report of the new check to the record and writes no second event', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.keepReceipt({ record: record([report('2026-11-04T09:00:00.000Z')]), event })
    const again = await engine.keepReceipt({ record: record([report('2026-11-05T10:00:00.000Z')]) })
    expect(again.ok).toBe(true)
    const stored = await db.data.readAll()
    expect(stored.receipts).toHaveLength(1)
    expect(stored.receipts[0].reports.map((entry) => entry.at)).toEqual(['2026-11-04T09:00:00.000Z', '2026-11-05T10:00:00.000Z'])
    expect(stored.events).toHaveLength(1)
    if (again.ok) expect(again.event).toBeUndefined()
  })

  test('writes no second event even when the caller offers one: a receipt has one event, which spent its token, as another tab may have written it first', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const first = await openTab(db, bus)
    const second = await openTab(db, bus)
    // Both tabs looked at a ledger with no event for the receipt, and both offer one.
    const [a, b] = [await first.engine.keepReceipt({ record: record(), event }), await second.engine.keepReceipt({ record: record([report('2026-11-04T09:05:00.000Z')]), event })]
    expect(a.ok && a.event !== undefined).toBe(true)
    expect(b.ok).toBe(true)
    if (b.ok) expect(b.event).toBeUndefined()
    const stored = await db.data.readAll()
    expect(stored.events.filter((entry) => entry.kind === 'receipt')).toHaveLength(1)
    expect(stored.receipts[0].reports).toHaveLength(2)
  })

  test('is the same report once: a check that left the same report adds nothing', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.keepReceipt({ record: record(), event })
    await engine.keepReceipt({ record: record() })
    expect((await db.data.readAll()).receipts[0].reports).toHaveLength(1)
  })

  test('keeps its newest reports when it has more than an export can carry, and the oldest go', async () => {
    const reports = Array.from({ length: LIMITS.reports }, (_, at) => report(`2026-11-04T09:${String(at).padStart(2, '0')}:00.000Z`, `check ${at}`))
    const db = new SharedDb({ receipts: [record(reports)], meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 1 } })
    const { engine } = await openTab(db, null)
    const kept = await engine.keepReceipt({ record: record([report('2026-11-05T09:00:00.000Z', 'the newest')]) })
    expect(kept.ok).toBe(true)
    const stored = (await db.data.readAll()).receipts[0]
    expect(stored.reports).toHaveLength(LIMITS.reports)
    expect(stored.reports[0].at).toBe('2026-11-04T09:01:00.000Z')
    expect(stored.reports.at(-1)?.at).toBe('2026-11-05T09:00:00.000Z')
    // What is kept can still be read by the codec that an import reads with.
    expect(decodeReceiptRecord(stored).ok).toBe(true)
  })
})

describe('a record the codec would refuse', () => {
  test('is refused as invalid, with the codec\'s reason, and nothing is written', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const before = db.commits
    const deep = (n: number): Json => (n === 0 ? 1 : { a: deep(n - 1) })
    const kept = await engine.keepReceipt({ record: { sha256: SHA, receipt: deep(LIMITS.jsonDepth + 3), reports: [] }, event })
    expect(kept.ok).toBe(false)
    if (!kept.ok) {
      expect(kept.error).toBe('invalid')
      expect(kept.detail).toContain('the parsed receipt')
    }
    expect(db.commits).toBe(before)
    expect((await db.data.readAll()).events).toEqual([])
  })

  test('is a record of a SHA-256 that is not one, or with too many characters', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    expect((await engine.keepReceipt({ record: { ...record(), sha256: 'abc' } })).ok).toBe(false)
    const big: Json = { text: 'x'.repeat(LIMITS.receiptChars) }
    expect((await engine.keepReceipt({ record: { sha256: SHA, receipt: big, reports: [] } })).ok).toBe(false)
  })
})

describe('a ledger that cannot be written', () => {
  test('keeps nothing when a newer version of the site has it', async () => {
    const db = new SharedDb({ meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 9 } })
    const { engine } = await openTab(db, null, { schemaVersion: 1 })
    expect(engine.getSnapshot().readOnly).toBe(true)
    const kept = await engine.keepReceipt({ record: record(), event })
    expect(kept.ok).toBe(false)
    if (!kept.ok) expect(kept.error).toBe('read-only')
    expect((await db.data.readAll()).receipts).toEqual([])
  })

  test('keeps nothing once the engine is closed', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    engine.close()
    expect(await engine.keepReceipt({ record: record(), event })).toEqual({ ok: false, error: 'closed', detail: 'The evidence ledger is closed.' })
  })
})

describe('another tab', () => {
  test('sees the receipt and the event that were kept', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const writer = await openTab(db, bus)
    const reader = await openTab(db, bus)
    await writer.engine.keepReceipt({ record: record(), event })
    await until(() => reader.engine.getSnapshot().receipts.length === 1, 'the other tab to read the receipt')
    expect(reader.engine.getSnapshot().events.map((entry) => entry.kind)).toEqual(['receipt'])
    expect(bus.posted).toContainEqual(expect.objectContaining({ t: 'changed', what: 'append' }))
    expect(CHANNEL_NAME).toBe('enginespace')
  })
})

describe('what was kept', () => {
  test('exports, and imports again as an export is read: the record and the event both pass the codec', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.keepReceipt({ record: record(), event })
    const exported = await engine.exportLedger()
    expect(exported.ok).toBe(true)
    if (!exported.ok) return
    expect(exported.file.receipts).toHaveLength(1)
    const parsed = parseExport(exported.text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.file.receipts.map((entry) => entry.sha256)).toEqual([SHA])
  })
})
