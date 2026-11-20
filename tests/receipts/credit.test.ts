/*
 * W2b-T23 (W2-T07's open check): a receipt event holds the receipt and the report, never the verdict. What a receipt is worth is worked out when the ledger
 * is read (src/receipts/credit.ts), from the receipt, the newest report of its record and what the site knows now.
 *
 * The bank here is a synthetic one that lives in this file: the site holds none (BANKS is empty until the owner's recording is committed).
 */
import { describe, expect, test } from 'bun:test'
import { decodeEvent, parseExport } from '@es/ledger'
import type { Draft, LedgerEvent, ReceiptRecord } from '@es/ledger'
import { ARGMAX_FORMAT, readStoredReport, rulesOnRead, verdictOfStored, verifyBundle } from '@es/verify'
import type { ArgmaxBank } from '@es/verify'
import { sha256 } from '../schema/receipt-support'
import { creditOf, creditReceipts, provenanceOf } from '@/receipts/credit'
import { importReceipt } from '@/receipts/importer'
import type { ImportEnv } from '@/receipts/importer'
import { receiptDraft, receiptRecord } from '@/receipts/keep'
import { SharedDb, openTab } from '../evidence/support'
import type { Tab } from '../evidence/support'
import { fileOf, NOW } from '../verify/support'
import { edited, replayFixture } from '../verify/synthetic'
import type { Fixture } from '../verify/synthetic'

const STAGE = 'tr8.replay.s2'
const BANK: ArgmaxBank = { positions: [3, 9, 27], ids: [101, 202, 303] }
const argmax = (positions: number[], ids: number[]) => ({ schema: ARGMAX_FORMAT, positions, ids })

/** The honest replay, carrying the argmax ids that a stage with a bank would hold it to. */
function withArgmax(data: object): Fixture {
  return edited(replayFixture(), (bundle) => {
    bundle.receipt.artifacts.push({ id: 'argmax', kind: 'outputs', format: ARGMAX_FORMAT, sha256: sha256('x'), bytes: 1, inBundle: true })
    bundle.artifacts.argmax = { encoding: 'json', data }
  })
}

const ISSUED_ISO = new Date(NOW - 86_400_000).toISOString()

async function ledgerFor(fixture: Fixture): Promise<Tab> {
  const tab = await openTab(new SharedDb(), null)
  const { token, seed, nonce, issuedOn } = fixture.bundle.receipt.challenge
  tab.clock.set(ISSUED_ISO)
  await tab.engine.append({ kind: 'challenge', ref: `challenge:${STAGE}`, data: { token, seed, nonce, issuedOn } })
  tab.clock.set(new Date(NOW).toISOString())
  return tab
}

function envOf(tab: Tab, fixture: Fixture): ImportEnv {
  const snapshot = tab.engine.getSnapshot()
  const { graders, pins, atlas, stages, banks } = fixture.context
  return { verify: (file, context) => verifyBundle(file, context), keep: (input) => tab.engine.keepReceipt(input), ledger: { events: snapshot.events, receipts: snapshot.receipts }, now: () => NOW, graders, pins, atlas, stages, banks }
}

const importOnce = async (tab: Tab, fixture: Fixture) => importReceipt(new File([fileOf(fixture.bundle)], 'receipt.es.json.gz'), envOf(tab, fixture))
const receiptEvent = (events: readonly LedgerEvent[]) => events.find((event) => event.kind === 'receipt')

describe('a receipt brought back before the site had a bank', () => {
  test('is credited once the bank is added, from the same record and with no second import', async () => {
    const fixture = withArgmax(argmax([1, 3, 9, 27, 40], [7, 101, 202, 303, 8]))
    const tab = await ledgerFor(fixture)
    const result = await importOnce(tab, fixture)
    expect(result.step).toBe('kept')
    // The site holds no bank for the stage: the check failed for want of it, and the receipt is not credited.
    if (result.step === 'kept') expect(result.verdict.provenance).toBe('gpu-unverified')
    const snapshot = tab.engine.getSnapshot()
    expect(snapshot.events.filter((event) => event.kind === 'receipt')).toHaveLength(1)
    expect(snapshot.receipts).toHaveLength(1)
    expect(snapshot.receipts[0].reports).toHaveLength(1)
    const [record] = snapshot.receipts

    expect(creditReceipts(snapshot.events, snapshot.receipts, { banks: {} }).find((event) => event.kind === 'receipt')).toMatchObject({ ok: false, score: 0, provenance: 'gpu-unverified' })
    expect(provenanceOf(record, {})).toBe('gpu-unverified')

    // The bank is added, to the site and to nothing else: the event, the record and the report are as they were.
    const site = { banks: { [STAGE]: BANK } }
    expect(creditReceipts(snapshot.events, snapshot.receipts, site).find((event) => event.kind === 'receipt')).toMatchObject({ ok: true, score: 1, provenance: 'gpu-verified' })
    expect(creditOf(record, site)).toEqual({ ok: true, score: 1, provenance: 'gpu-verified' })
    expect(tab.engine.getSnapshot().events.filter((event) => event.kind === 'receipt')).toHaveLength(1)
    expect(tab.engine.getSnapshot().receipts[0].reports).toHaveLength(1)
  })

  test('stays uncredited when the bank disagrees with the ids the receipt gave, and says which position', async () => {
    const fixture = withArgmax(argmax([3, 9, 27], [101, 999, 303]))
    const tab = await ledgerFor(fixture)
    await importOnce(tab, fixture)
    const [record] = tab.engine.getSnapshot().receipts
    const site = { banks: { [STAGE]: BANK } }
    expect(provenanceOf(record, site)).toBe('gpu-unverified')
    const report = readStoredReport(record.reports[0].report)
    if (report === null) throw new Error('the report did not read')
    const check = rulesOnRead(fixture.bundle.receipt, report, site).flatMap((rule) => rule.checks ?? []).find((entry) => entry.id === 'argmax-bank')
    expect(check).toEqual({ id: 'argmax-bank', status: 'fail', bound: "Position 9: the receipt's argmax is token 999, and the pinned bank has 202 (every banked position must agree)." })
  })

  test('is held to a bank that changes after it passed one: the verdict follows the site as it stands', async () => {
    const fixture = withArgmax(argmax([3, 9, 27], [101, 202, 303]))
    const tab = await ledgerFor(fixture)
    const withBank = { ...fixture, context: { ...fixture.context, banks: { [STAGE]: BANK } } }
    await importOnce(tab, withBank)
    const [record] = tab.engine.getSnapshot().receipts
    expect(provenanceOf(record, { banks: { [STAGE]: BANK } })).toBe('gpu-verified')
    expect(provenanceOf(record, { banks: { [STAGE]: { positions: [3], ids: [5] } } })).toBe('gpu-unverified')
  })

  test('keeps the ids in the report, and keeps no more than a report keeps', async () => {
    const outcome = await verifyBundle(fileOf(withArgmax(argmax([3, 9], [101, 202])).bundle), withArgmax(argmax([3], [1])).context)
    if (outcome.kind !== 'checked') throw new Error('refused')
    expect(outcome.argmax).toEqual({ positions: [3, 9], ids: [101, 202] })
    const many = Array.from({ length: 4097 }, (_, at) => at)
    const big = withArgmax(argmax(many, many))
    const bigOutcome = await verifyBundle(fileOf(big.bundle), big.context)
    if (bigOutcome.kind !== 'checked') throw new Error('refused')
    expect(bigOutcome.argmax).toBeUndefined()
  })

  test('has nothing to re-read when the receipt carried no ids: the stored result stands', async () => {
    const fixture = replayFixture()
    const outcome = await verifyBundle(fileOf(fixture.bundle), fixture.context)
    if (outcome.kind !== 'checked') throw new Error('refused')
    const record = receiptRecord(outcome, '2026-11-09T12:00:00.000Z')
    const report = readStoredReport(record.reports[0].report)
    expect(report?.argmax).toBeUndefined()
    expect(creditOf(record, {})).toEqual({ ok: true, score: 1, provenance: 'gpu-verified' })
    if (report !== null) expect(verdictOfStored(outcome.receipt, report, {})).toEqual(outcome.verdict)
  })
})

describe('the verdict is computed on read and stored nowhere', () => {
  test('a written receipt event holds none of ok, score, provenance or checks, and a record that is gone credits nothing', async () => {
    const fixture = replayFixture()
    const tab = await ledgerFor(fixture)
    await importOnce(tab, fixture)
    const snapshot = tab.engine.getSnapshot()
    const event = receiptEvent(snapshot.events)
    expect(event).toBeDefined()
    for (const key of ['ok', 'score', 'provenance']) expect(event).not.toHaveProperty(key)
    expect(event?.kind === 'receipt' ? event.data : {}).not.toHaveProperty('checks')
    expect(creditReceipts(snapshot.events, snapshot.receipts, {}).find((entry) => entry.kind === 'receipt')).toMatchObject({ ok: true, provenance: 'gpu-verified' })
    expect(creditReceipts(snapshot.events, [], {}).find((entry) => entry.kind === 'receipt')).toMatchObject({ ok: false, score: 0, provenance: 'gpu-unverified' })
  })

  test('the newest report decides: a report that this build cannot read credits nothing, and a later good one credits', () => {
    const base: ReceiptRecord = { sha256: 'a'.repeat(64), receipt: { not: 'a receipt' }, reports: [] }
    expect(creditOf(base, {})).toEqual({ ok: false, score: 0, provenance: 'gpu-unverified' })
    expect(creditOf(undefined, {})).toEqual({ ok: false, score: 0, provenance: 'gpu-unverified' })
  })
})

describe('a ledger written in the old shape still reads (schema version 1)', () => {
  const legacy = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'ev-old',
    v: 1,
    kind: 'receipt',
    ref: `receipt:${STAGE}`,
    at: '2026-11-04T09:00:00.000Z',
    tz: 0,
    day: '2026-11-04',
    dev: 'dev-old',
    score: 1,
    ok: true,
    provenance: 'gpu-verified',
    data: {
      receiptSha256: 'b'.repeat(64),
      challenge: 'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000',
      checks: [{ id: 'teacher-forced', verdict: 'attested', bound: 'at least 99% of positions' }],
      graderVersion: '0.1.0',
      environment: 'one GPU, one engine at the pin',
    },
    ...over,
  })

  test('decodes with its stored fields as written, since an event is immutable and another device may hold the same copy', () => {
    const decoded = decodeEvent(legacy())
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(legacy() as unknown as LedgerEvent)
  })

  test('is read for what its record says, never for the verdict it stored: a stored gpu-verified is not credit', () => {
    const decoded = decodeEvent(legacy())
    if (!decoded.ok) throw new Error(decoded.reason)
    const [credited] = creditReceipts([decoded.value], [], {})
    expect(credited).toMatchObject({ ok: false, score: 0, provenance: 'gpu-unverified' })
  })

  test('an export of the old shape parses, and one of the new shape holds the version that an older build refuses', async () => {
    const { buildExport, SCHEMA_VERSION } = await import('@es/ledger')
    expect(SCHEMA_VERSION).toBe(2)
    const decoded = decodeEvent(legacy())
    if (!decoded.ok) throw new Error(decoded.reason)
    const old = JSON.stringify({ ...buildExport({ ledger: { events: [decoded.value], receipts: [] }, exportedAt: '2026-11-05T09:00:00.000Z', device: 'dev-old' }), schemaVersion: 1 })
    const parsed = parseExport(old)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.file.events).toHaveLength(1)
    const draft: Draft<'receipt'> = { kind: 'receipt', ref: `receipt:${STAGE}`, data: { receiptSha256: 'c'.repeat(64), challenge: 'x', graderVersion: '0.1.0', environment: 'e' } }
    expect(Object.keys(draft)).toEqual(['kind', 'ref', 'data'])
  })

  test('the draft of a receipt is the same whatever the verdict', async () => {
    const fixture = replayFixture()
    const outcome = await verifyBundle(fileOf(fixture.bundle), fixture.context)
    if (outcome.kind !== 'checked') throw new Error('refused')
    const failing = { ...outcome, verdict: { ...outcome.verdict, provenance: 'gpu-unverified' as const } }
    expect(receiptDraft(failing)).toEqual(receiptDraft(outcome))
  })
})
