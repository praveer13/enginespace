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
import type { CheckedOutcome, Verdict } from '@es/verify'
import { checksOf, environmentLine, hasEventFor, receiptDraft, receiptRecord } from '@/receipts/keep'
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

  test('does not credit the bare sample: not ok, a score of 0, and gpu-unverified, because the stage asks of its evidence what a toy trace cannot give', async () => {
    const draft = receiptDraft(await outcomeOf())
    expect(draft).toMatchObject({ ok: false, score: 0, provenance: 'gpu-unverified' })
  })

  test('credits an honest receipt with the provenance of its verdict: gpu-verified for the replay, ok and at a score of 1 (the weight is applied at read time)', async () => {
    const fixture = replayFixture()
    const outcome = await verifyBundle(fileOf(fixture.bundle), fixture.context)
    if (outcome.kind !== 'checked') throw new Error('refused')
    const draft = receiptDraft(outcome)
    expect(draft).toMatchObject({ ok: true, score: 1, provenance: 'gpu-verified' })
    const event = stampEvent<'receipt'>(writer, draft as Draft<'receipt'> & { kind: 'receipt' })
    expect(event.data.checks.map((check) => check.verdict)).toContain('pass')
    expect(event.data.checks.find((check) => check.id === 'teacher-forced')).toEqual({ id: 'teacher-forced', verdict: 'attested', bound: 'value 0.995, bound 0.99, n 200; teacher-forced agreement on a sample of 200 outputs' })
  })

  test('says of each check what the browser found or the grader said: pass or fail when this browser ran it, attested or fail when only the grader did', () => {
    const verdict: Verdict = {
      provenance: 'gpu-unverified',
      reasons: [],
      checks: [
        { id: 'B6', verdict: 'pass', bound: 'p99 1,000 µs', how: 're-checked', required: true },
        { id: 'B4', verdict: 'fail', bound: '12 sends were late', how: 're-checked', required: true },
        { id: 'agreement', verdict: 'attested', bound: 'value 0.995, bound 0.99, n 200', how: 'attested', required: true },
        { id: 'identity', verdict: 'fail', bound: 'value 0.2, bound 0.99', how: 'attested', required: false },
      ],
    }
    expect(checksOf(verdict)).toEqual([
      { id: 'B6', verdict: 'pass', bound: 'p99 1,000 µs' },
      { id: 'B4', verdict: 'fail', bound: '12 sends were late' },
      { id: 'agreement', verdict: 'attested', bound: 'value 0.995, bound 0.99, n 200' },
      { id: 'identity', verdict: 'fail', bound: 'value 0.2, bound 0.99' },
    ])
  })

  test('holds one check when the verdict has none, and says that is a failure', () => {
    expect(checksOf({ provenance: 'gpu-unverified', reasons: [], checks: [] })).toEqual([{ id: 'no-checks', verdict: 'fail', bound: 'the receipt lists no check' }])
  })

  test('holds at most as many checks as the ledger keeps, and counts the rest in the last, which fails if any of them did', () => {
    const many = (failAt: number | null, how: 're-checked' | 'attested' = 'attested'): Verdict => ({
      provenance: 'gpu-unverified',
      reasons: [],
      checks: Array.from({ length: 200 }, (_, at) => ({ id: `check-${at}`, verdict: at === failAt ? ('fail' as const) : how === 'attested' ? ('attested' as const) : ('pass' as const), bound: 'a bound', how, required: false })),
    })
    const passing = checksOf(many(null))
    expect(passing).toHaveLength(LIMITS.checks)
    expect(passing.at(-1)).toEqual({ id: 'more-checks', verdict: 'attested', bound: `and ${200 - (LIMITS.checks - 1)} more checks, not listed here` })
    expect(checksOf(many(null, 're-checked')).at(-1)?.verdict).toBe('pass')
    expect(checksOf(many(150)).at(-1)?.verdict).toBe('fail')
    const early = checksOf(many(3))
    expect(early.at(-1)?.verdict).toBe('attested')
    expect(early[3].verdict).toBe('fail')
  })

  test('holds an event that passes the codec however many checks the verdict has', async () => {
    const outcome = await outcomeOf()
    const verdict: Verdict = { ...outcome.verdict, checks: Array.from({ length: 200 }, (_, at) => ({ id: `check-${at}`, verdict: 'attested' as const, bound: 'a bound', how: 'attested' as const, required: false })) }
    const draft = receiptDraft({ ...outcome, verdict })
    expect(() => stampEvent<'receipt'>(writer, draft as Draft<'receipt'> & { kind: 'receipt' })).not.toThrow()
    expect(draft.data.checks).toHaveLength(LIMITS.checks)
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
