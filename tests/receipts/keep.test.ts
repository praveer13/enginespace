/*
 * W2-T07, W2-T08: what a checked receipt is kept as (src/receipts/keep.ts): the `receipt` event and the record.
 *
 *   - The event passes the ledger's own codec, the function that every event is made by, so a draft that broke a rule would throw here.
 *   - A receipt that is not credited is `ok: false` at a score of 0, with the provenance `gpu-unverified`; one that is credited carries the provenance its
 *     verdict names (the weight is applied at read time). Each check of the verdict is `pass` or `fail` for what this browser ran, and `attested` or
 *     `fail` for what the grader checked: the event never calls a grader's check `pass`.
 *   - The event holds at least one check and at most the ledger's limit, whatever the receipt has; the one-line summary of the machine is plain text
 *     within a line, and holds no host name, user name, address or path (A§9.5): none of the fields it reads could.
 *   - The record is the parsed receipt and the report of the check, as JSON that the ledger's codec takes, under the receipt's identity.
 */
import { describe, expect, test } from 'bun:test'
import { decodeReceiptRecord, LIMITS, stampEvent } from '@es/ledger'
import type { Draft } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { readStoredReport, verifyBundle } from '@es/verify'
import type { CheckedOutcome } from '@es/verify'
import { environmentLine, hasEventFor, receiptDraft, receiptRecord } from '@/receipts/keep'
import { contextFor, fileOf, sampleBundle } from '../verify/support'
import { replayFixture } from '../verify/synthetic'
import { Ledger } from './support'

const outcomeOf = async (bundle = sampleBundle()): Promise<CheckedOutcome> => {
  const outcome = await verifyBundle(fileOf(bundle), contextFor(bundle))
  if (outcome.kind !== 'checked') throw new Error('refused')
  return outcome
}
const sample = (await outcomeOf()).receipt
const edited = (change: (receipt: Receipt) => void): Receipt => {
  const receipt = structuredClone(sample)
  change(receipt)
  return receipt
}
const writer = { clock: { nowIso: () => '2026-11-09T12:00:00.000Z', tzOffsetMinutes: () => 0 }, newId: () => 'ev-keep', dev: 'dev-keep' }

describe('the event', () => {
  test('is a receipt event that the ledger\'s codec takes, for the stage, naming the receipt, the token, the grader and the machine', async () => {
    const outcome = await outcomeOf()
    const event = stampEvent<'receipt'>(writer, receiptDraft(outcome) as Draft<'receipt'> & { kind: 'receipt' })
    expect(event).toMatchObject({
      kind: 'receipt',
      ref: 'receipt:tr3.profile.s2',
      data: { receiptSha256: outcome.receiptSha256, challenge: sample.challenge.token, graderVersion: '0.1.0', environment: 'Example GPU 24GB, vllm 0.33.0, driver 580.82.07' },
    })
  })

  test('holds no verdict: no ok, no score, no provenance and no check, so that nothing is frozen at import', async () => {
    const draft = receiptDraft(await outcomeOf())
    expect(Object.keys(draft).sort()).toEqual(['data', 'kind', 'ref'])
    expect(Object.keys(draft.data).sort()).toEqual(['challenge', 'environment', 'graderVersion', 'receiptSha256'])
    const fixture = replayFixture()
    const honest = await verifyBundle(fileOf(fixture.bundle), fixture.context)
    if (honest.kind !== 'checked') throw new Error('refused')
    // An honest receipt that the verdict credits as gpu-verified is written the same way: the credit is read from its record (credit.test.ts).
    expect(honest.verdict.provenance).toBe('gpu-verified')
    expect(Object.keys(receiptDraft(honest)).sort()).toEqual(['data', 'kind', 'ref'])
    const event = stampEvent<'receipt'>(writer, receiptDraft(honest) as Draft<'receipt'> & { kind: 'receipt' })
    expect(event).not.toHaveProperty('ok')
    expect(event).not.toHaveProperty('score')
    expect(event).not.toHaveProperty('provenance')
  })

  test('describes the machine in one line of plain text: its GPUs, the engine and the driver, and says no GPU for a laptop', () => {
    expect(environmentLine(sample)).toBe('Example GPU 24GB, vllm 0.33.0, driver 580.82.07')
    const two = edited((r) => {
      r.environment.gpus = [r.environment.gpus[0], r.environment.gpus[0]]
    })
    expect(environmentLine(two)).toBe('2 × Example GPU 24GB, vllm 0.33.0, driver 580.82.07')
    const laptop = edited((r) => {
      r.environment.gpus = []
      delete r.environment.engine
      delete r.environment.driver
    })
    expect(environmentLine(laptop)).toBe('no GPU')
  })

  test('cuts a line that is too long to the ledger\'s line, and holds no line break', () => {
    const long = edited((r) => {
      r.environment.gpus = [{ ...r.environment.gpus[0], name: 'G'.repeat(128) }, { ...r.environment.gpus[0], name: 'H'.repeat(128) }, { ...r.environment.gpus[0], name: 'J'.repeat(128) }]
    })
    const line = environmentLine(long)
    expect(line.length).toBeLessThanOrEqual(LIMITS.lineChars)
    expect(line).not.toMatch(/\p{Cc}/u)
  })

  test('names no host, user, address or path of the machine it describes', async () => {
    const draft = receiptDraft(await outcomeOf())
    const body = JSON.stringify(draft)
    // Built from pieces, so that this file does not hold them either: a home folder, a drive, an address and a host name.
    const needles = [['/ho', 'me/'], ['/Us', 'ers/'], ['C:', '\\'], ['@'], ['host', 'name']].map((pieces) => pieces.join(''))
    for (const needle of needles) expect([needle, body.includes(needle)]).toEqual([needle, false])
  })
})

describe('the record', () => {
  test('is the parsed receipt under its identity, with the report of the check at the moment given, and the ledger\'s codec takes it', async () => {
    const outcome = await outcomeOf()
    const record = receiptRecord(outcome, '2026-11-09T12:00:00.000Z')
    expect(record.sha256).toBe(outcome.receiptSha256)
    expect(record.receipt).toEqual(JSON.parse(JSON.stringify(sample)))
    expect(record.reports).toHaveLength(1)
    expect(record.reports[0].at).toBe('2026-11-09T12:00:00.000Z')
    expect(decodeReceiptRecord(record).ok).toBe(true)
  })

  test('has a report that reads back through the verifier\'s own reader, with the sizes and the nine rules it stores', async () => {
    const outcome = await outcomeOf()
    const report = readStoredReport(receiptRecord(outcome, '2026-11-09T12:00:00.000Z').reports[0].report)
    expect(report).toMatchObject({ v: 1, ran: 10, sizes: outcome.sizes })
    expect(report?.rules.map((rule) => rule.id)).toEqual(['caps', 'schema', 'integrity', 'binding', 'grader', 'pins', 'rechecks', 'recomputation', 'floors'])
  })

  test('holds the raw artifacts of the bundle nowhere: they stay in the learner\'s file', async () => {
    const record = JSON.stringify(receiptRecord(await outcomeOf(), '2026-11-09T12:00:00.000Z'))
    expect(record).not.toContain('server started')
    expect(record).not.toContain('decode_attention')
  })
})

describe('an event that is there already', () => {
  test('is found by the receipt\'s hash, and a receipt event of another hash is not it', () => {
    const ledger = new Ledger()
    ledger.receipt('2026-11-09T12:00:00.000Z', sample.challenge.token, 'a'.repeat(64))
    ledger.challenge('2026-11-09T12:00:00.000Z', 'tr8.replay.s2', 3)
    expect(hasEventFor(ledger.events, 'a'.repeat(64))).toBe(true)
    expect(hasEventFor(ledger.events, 'b'.repeat(64))).toBe(false)
    expect(hasEventFor([], 'a'.repeat(64))).toBe(false)
  })
})
