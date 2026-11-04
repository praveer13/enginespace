/*
 * W1-T10, acceptance 4: "`lab-check` events carry `wasmSha256` and seeds". What a forge run writes to the ledger (src/forge/record.ts),
 * checked through the ledger's own codec, so that a draft the codec would refuse fails here and not on a learner's machine.
 */
import { describe, expect, test } from 'bun:test'
import { LIMITS, stampEvent } from '@es/ledger'
import type { WriterContext } from '@es/ledger'
import type { CheckResult, LabRun } from '../../src/forge/invoke'
import { isRecordable, labCheckDraft } from '../../src/forge/record'

const SHA = '0123456789abcdef'.repeat(4)

const context: WriterContext = {
  clock: { nowIso: () => '2026-11-04T09:30:00.000Z', tzOffsetMinutes: () => 0 },
  newId: () => 'event-1',
  dev: 'dev-1',
}

const result = (id: string, status: CheckResult['status'], seed?: number): CheckResult => ({
  id,
  label: id,
  stage: 1,
  status,
  msg: 'm',
  commands: 7,
  ...(seed === undefined ? {} : { seed, fresh: true }),
})

function run(overrides: Partial<LabRun> = {}): LabRun {
  return {
    lab: 'toy',
    reference: false,
    version: 1,
    wasmSha256: SHA,
    seeds: 'fresh',
    complete: true,
    checks: [result('fill', 'pass'), result('hits', 'pass'), result('dump', 'pass'), result('recency', 'pass'), result('churn', 'pass', 3_141_592_653)],
    ...overrides,
  }
}

describe('a run on fresh seeds', () => {
  test('is one `lab-check` event with the module\'s SHA-256, the seeds and each check\'s status', () => {
    const draft = labCheckDraft(run())
    expect(draft).toEqual({
      kind: 'lab-check',
      ref: 'lab:toy',
      score: 1,
      ok: true,
      provenance: 'unseen',
      data: {
        wasmSha256: SHA,
        seeds: [3_141_592_653],
        checks: [
          { id: 'fill', status: 'pass' },
          { id: 'hits', status: 'pass' },
          { id: 'dump', status: 'pass' },
          { id: 'recency', status: 'pass' },
          { id: 'churn', status: 'pass', seed: 3_141_592_653 },
        ],
      },
    })
  })

  test('is an event the ledger accepts, stamped with its id, its time and its device', () => {
    const draft = labCheckDraft(run())
    expect(draft).not.toBeNull()
    const event = stampEvent(context, draft!)
    expect(event).toMatchObject({ id: 'event-1', v: 1, kind: 'lab-check', ref: 'lab:toy', at: '2026-11-04T09:30:00.000Z', day: '2026-11-04', dev: 'dev-1' })
    expect(event.data.wasmSha256).toBe(SHA)
    expect(event.data.seeds).toEqual([3_141_592_653])
  })

  test('that failed is written too, as "check failed, retry": ok is false, the score is the share that passed, and the provenance is `unseen`', () => {
    const red = run({ checks: [result('fill', 'pass'), result('hits', 'fail'), result('dump', 'trap'), result('recency', 'timeout'), result('churn', 'fail', 7)] })
    const draft = labCheckDraft(red)
    expect(draft).toMatchObject({ ok: false, score: 0.2, provenance: 'unseen' })
    expect(draft?.data.checks.map((check) => check.status)).toEqual(['pass', 'fail', 'trap', 'timeout', 'fail'])
    expect(() => stampEvent(context, draft!)).not.toThrow()
  })

  test('carries a seed for each seeded check, and none for the rest', () => {
    const two = run({ checks: [result('a', 'pass', 1), result('b', 'pass'), result('c', 'pass', 0xffff_ffff)] })
    expect(labCheckDraft(two)?.data.seeds).toEqual([1, 0xffff_ffff])
    expect(labCheckDraft(two)?.data.checks.map((check) => 'seed' in check)).toEqual([true, false, true])
  })

  test('stays inside what the ledger allows an event to hold', () => {
    expect(LIMITS.seeds).toBeGreaterThanOrEqual(1)
    expect(LIMITS.checks).toBeGreaterThanOrEqual(5)
  })
})

describe('a run that is not written', () => {
  test('a reference build earns nothing and is not recorded', () => {
    const reference = run({ reference: true })
    expect(isRecordable(reference)).toBe(false)
    expect(labCheckDraft(reference)).toBeNull()
  })

  test('a replay of seeds the learner has seen is not recorded', () => {
    expect(labCheckDraft(run({ seeds: 'replay' }))).toBeNull()
  })

  test('a run that did not run every check is not recorded, and neither is one with no checks', () => {
    expect(labCheckDraft(run({ complete: false }))).toBeNull()
    expect(labCheckDraft(run({ checks: [] }))).toBeNull()
  })
})
