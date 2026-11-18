/*
 * W2-T08, rule 10, the verdict (ARCHITECTURE §8.5 rule 10, ASSESSMENT §3.2 and §5.8). The verdict is per check, `pass`, `fail` or `attested`, each with
 * its bound and a badge, and the receipt is
 *
 *   gpu-verified    every required check passes or is attested, and rules 1 to 6 passed                                          (weight 1.0)
 *   assisted        it would be, and the learner declared `assisted: code` or `agent: true`                                       (0.3)
 *   practice        the stage requires nothing, and the receipt is whole and consistent                                           (0.3)
 *   gpu-unverified  anything else: a rule or a check failed, a required check is missing or is not built yet, or the report is an older build's   (0)
 *
 * It is worked out when it is read, from the receipt and the stored results, so a stored report is judged by the rows of the stage as they are now.
 */
import { describe, expect, test } from 'bun:test'
import { verdictOf, RULES_IN_ALL } from '@es/verify'
import type { RuleResult } from '@es/verify'
import type { Receipt } from '@es/schema/receipt'
import { sampleReceipt } from '../schema/receipt-support'
import { edited, replayFixture, traceFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, failed, verify } from './run'

const run = async (fixture: Fixture) => verify(fixture.bundle, fixture.context)

/** The nine stored results of a receipt that every rule passed, with the checks of rules 7 to 9 given. */
function results(checks: Record<number, readonly { id: string; status: 'pass' | 'fail'; bound: string }[]> = {}, failedRules: readonly number[] = []): RuleResult[] {
  const ids = ['caps', 'schema', 'integrity', 'binding', 'grader', 'pins', 'rechecks', 'recomputation', 'floors'] as const
  return ids.map((id, at) => ({
    rule: at + 1,
    id,
    status: failedRules.includes(at + 1) ? ('fail' as const) : ('pass' as const),
    summary: `${id} ${failedRules.includes(at + 1) ? 'failed' : 'held'}.`,
    problems: [],
    ...(at >= 6 ? { checks: checks[at + 1] ?? [] } : {}),
  }))
}
const receiptOf = (stage: string, over: Partial<Receipt> = {}): Receipt => {
  const base = structuredClone(sampleReceipt())
  return { ...base, stage, lab: stage.slice(0, stage.lastIndexOf('.')), ...over }
}
const pass = (id: string) => ({ id, status: 'pass' as const, bound: `${id} held` })

describe('gpu-verified', () => {
  test('is the honest replay: its required grader check is attested, and each of the thirteen browser checks passes', async () => {
    const outcome = await run(replayFixture())
    expect(outcome.verdict.provenance).toBe('gpu-verified')
    expect(outcome.verdict.reasons).toEqual([])
    expect(outcome.verdict.checks.every((check) => check.verdict !== 'fail')).toBe(true)
    expect(outcome.verdict.checks.every((check) => (check.how === 'attested') === (check.verdict === 'attested'))).toBe(true)
  })

  test('is also the replay declared "assisted: explain" with no agent: help in words is not help with the code (ASSESSMENT §3.2)', async () => {
    const outcome = await run(edited(replayFixture(), (bundle) => (bundle.receipt.provenance = { assisted: 'explain', agent: false, guard: 'off' })))
    expect(outcome.verdict.provenance).toBe('gpu-verified')
  })
})

describe('assisted', () => {
  test.each([
    ['assisted: code', { assisted: 'code' as const, agent: false, guard: 'on' as const }],
    ['agent: true', { assisted: 'none' as const, agent: true, guard: 'on' as const }],
    ['both', { assisted: 'code' as const, agent: true, guard: 'off' as const }],
  ])('is the replay of a learner who declared %s: every check still passes, and the receipt counts as assisted work', async (_name, provenance) => {
    const outcome = await run(edited(replayFixture(), (bundle) => (bundle.receipt.provenance = provenance)))
    expect(outcome.verdict.provenance).toBe('assisted')
    expect(outcome.verdict.reasons[0]).toMatch(/^You declared that you had help with code or from an agent \(assisted: \w+, agent: (yes|no)\), so the receipt counts as assisted work\.$/)
    expect(failed(outcome)).toEqual([])
  })
})

describe('practice', () => {
  test('is the honest trace of an optional stage: the stage requires nothing, and what the receipt captured is consistent', async () => {
    const outcome = await run(traceFixture())
    expect(outcome.verdict.provenance).toBe('practice')
    expect(outcome.verdict.reasons).toEqual(['tr3.profile.s5 asks nothing of a receipt, so this one earns practice credit only.'])
  })

  test('is not the same receipt with a capture that is not consistent: a check that ran and failed takes it back to gpu-unverified', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => ((bundle.artifacts.trace.data as { spans: { startNs: number[] } }).spans.startNs[0] = -1)))
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons.join(' ')).toContain('T2: ')
  })

  test('is a stage whose optional grader check fails, with no effect: the stage lists it as optional', () => {
    const receipt = receiptOf('tr0.forward.s1', { checks: [{ id: 'layer0-hidden', kind: 'correctness', pass: false, value: 0.01, bound: 0.0001, detail: '' }] })
    const verdict = verdictOf(receipt, results())
    expect(verdict.provenance).toBe('practice')
    expect(verdict.checks).toEqual([{ id: 'layer0-hidden', verdict: 'fail', bound: 'value 0.01, bound 0.0001', how: 'attested', required: false }])
  })

  test('is not credited when a check the stage does not list fails: only the checks that a row names as optional may fail without effect', () => {
    const receipt = receiptOf('tr0.forward.s1', { checks: [{ id: 'something-else', kind: 'property', pass: false, detail: 'it broke' }] })
    const verdict = verdictOf(receipt, results())
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toEqual(["The grader's check something-else failed: it broke."])
  })
})

describe('gpu-unverified', () => {
  test('is a rule of the first six that failed: the reason is the rule\'s sentence', () => {
    for (const rule of [1, 2, 3, 4, 5, 6]) {
      const verdict = verdictOf(receiptOf('tr1.fork.s1'), results({}, [rule]))
      expect(verdict.provenance).toBe('gpu-unverified')
      expect(verdict.reasons[0]).toMatch(/ failed\.$/)
    }
  })

  test('is a grader check that the stage requires and the receipt does not list: named, with the stage', () => {
    const verdict = verdictOf(receiptOf('tr1.fork.s1', { checks: [] }), results())
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toEqual(['The receipt lists no check called teacher-forced, which tr1.fork.s1 requires of the grader.'])
    expect(verdict.checks).toEqual([{ id: 'teacher-forced', verdict: 'fail', bound: 'The receipt lists no check called teacher-forced, which tr1.fork.s1 requires of the grader.', how: 'attested', required: true }])
  })

  test('is a required grader check that failed, and a required one that passed is attested and not "pass": only this browser\'s own work is pass', () => {
    const failing = receiptOf('tr1.fork.s1', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: false, value: 0.5, bound: 0.99, n: 200, detail: 'low' }] })
    expect(verdictOf(failing, results()).reasons).toEqual(["The grader's check teacher-forced failed: value 0.5, bound 0.99, n 200; low."])
    const passing = receiptOf('tr1.fork.s1', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: true, value: 0.995, bound: 0.99, n: 200, detail: '' }] })
    const verdict = verdictOf(passing, results())
    expect(verdict.provenance).toBe('gpu-verified')
    expect(verdict.checks).toEqual([{ id: 'teacher-forced', verdict: 'attested', bound: 'value 0.995, bound 0.99, n 200', how: 'attested', required: true }])
  })

  test('is a check that a browser re-run failed, with its bound as the reason', () => {
    const receipt = receiptOf('tr8.replay.s1', { checks: [] })
    const verdict = verdictOf(receipt, results({ 8: [pass('B1'), { id: 'B2', status: 'fail', bound: '3 requests failed.' }, pass('B3')] }, [8]))
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toContain('B2: 3 requests failed.')
  })

  test('is a check that a stage requires of the browser and nothing has run: not built yet, with the task that builds it', () => {
    const verdict = verdictOf(receiptOf('tr4.sweep.s2', { checks: [{ id: 'sdpa-tolerance', kind: 'correctness', pass: true, detail: '' }] }), results())
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toEqual(['sweep-errors is a check this site does not run yet, so a receipt of tr4.sweep.s2 does not count until it does.'])
  })

  test('is a check that the results do not hold at all: a stored report with no result for a check that the stage requires is not credited', () => {
    const verdict = verdictOf(receiptOf('tr8.replay.s2', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: true, detail: '' }] }), results())
    // Nothing ran of the replay's thirteen, since the results above hold no checks: each is missing, and says so.
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons.join('\n')).toContain('B1 is required, and the report holds no result for it, so it cannot be told whether the receipt passed it.')
  })

  test('is a stage that asks for the evidence of its receipt, with a receipt that carries none: the check of evidence failed, and its bound is the reason', () => {
    const none = { id: 'evidence', status: 'fail' as const, bound: 'The stage asks for a benchmark log or a trace to recompute, and the receipt carries neither with anything in it.' }
    const verdict = verdictOf(receiptOf('tr7.reproduce.s1', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: true, detail: '' }] }), results({ 8: [none] }, [8]))
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toContain(`evidence: ${none.bound}`)
    expect(verdict.checks.find((check) => check.id === 'evidence')).toEqual({ id: 'evidence', verdict: 'fail', bound: none.bound, how: 're-checked', required: true })
  })

  test('is a stored report with no result for the evidence a stage asks for, which is not credited either: it cannot be told whether there was any', () => {
    const verdict = verdictOf(receiptOf('tr7.reproduce.s1', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: true, detail: '' }] }), results())
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons).toContain('evidence is required, and the report holds no result for it, so it cannot be told whether the receipt passed it.')
  })

  test('is a stage this version does not list: it cannot say what the stage requires', () => {
    const verdict = verdictOf(receiptOf('tr9.later.s1'), results())
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons[0]).toBe('This version of the site lists no stage called tr9.later.s1, so it cannot say what the stage requires.')
  })

  test('is a report that an earlier build wrote, which ran fewer than ten rules: it is re-derived, and says the file has to be brought back', () => {
    const verdict = verdictOf(receiptOf('tr8.replay.s1'), results().slice(0, 6), 6)
    expect(verdict.provenance).toBe('gpu-unverified')
    expect(verdict.reasons[0]).toBe(`This check was made by an earlier version of the site that ran 6 of the ${RULES_IN_ALL} rules. Bring the receipt's file back, and it is checked by all of them.`)
  })

  test('says it once for a stage that requires checks of the browser: the missing results of rules 7 to 9 are not each check\'s fault, and a check that is not built yet still names its task', () => {
    const verdict = verdictOf(receiptOf('tr8.replay.s2', { checks: [{ id: 'teacher-forced', kind: 'correctness', pass: true, detail: '' }] }), results().slice(0, 6), 6)
    expect(verdict.reasons).toEqual([`This check was made by an earlier version of the site that ran 6 of the ${RULES_IN_ALL} rules. Bring the receipt's file back, and it is checked by all of them.`])
    const pending = verdictOf(receiptOf('tr4.sweep.s2', { checks: [{ id: 'sdpa-tolerance', kind: 'correctness', pass: true, detail: '' }] }), results().slice(0, 6), 6)
    expect(pending.reasons).toHaveLength(2)
    expect(pending.reasons[1]).toBe('sweep-errors is a check this site does not run yet, so a receipt of tr4.sweep.s2 does not count until it does.')
  })

  test('says at most eight reasons and counts the rest: a receipt cannot fill the page with them', () => {
    const many = Array.from({ length: 20 }, (_, at) => ({ id: `T${at}`, status: 'fail' as const, bound: 'broke' }))
    const verdict = verdictOf(receiptOf('tr3.profile.s5'), results({ 8: many }, [8]))
    expect(verdict.reasons).toHaveLength(9)
    expect(verdict.reasons.at(-1)).toBe('And 12 more problems.')
    expect(verdict.checks.filter((check) => check.how === 're-checked')).toHaveLength(20)
  })
})

describe('the verdict is not stored: it follows the table as it stands', () => {
  test('the same results give another verdict for a stage that is not the same stage', () => {
    const rules = results({ 8: [pass('B1')] })
    expect(verdictOf(receiptOf('tr8.replay.s1'), rules).provenance).toBe('practice')
    expect(verdictOf(receiptOf('tr8.replay.s2'), rules).provenance).toBe('gpu-unverified')
  })

  test('is decided by the checks of the report and not by a field of the receipt that says it passed', async () => {
    const outcome = await run(replayFixture())
    const lying = edited(replayFixture(), (bundle) => {
      bundle.receipt.checks = [{ id: 'teacher-forced', kind: 'correctness', pass: true, value: 1, bound: 0.5, n: 1, detail: 'this receipt passed' }]
      bundle.receipt.ext = { verdict: 'gpu-verified', pass: true }
    })
    const again = await run(lying)
    expect(again.verdict.provenance).toBe(outcome.verdict.provenance)
    expect(checkOf(again, 'B6')?.status).toBe('pass')
  })
})
