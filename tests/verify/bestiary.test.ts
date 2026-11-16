/*
 * W2-T08: the honest fixtures pass, and the forged bestiary fails, check by check, with the bound printed (ARCHITECTURE §8.5; ASSESSMENT §13).
 *
 * The task's two checks:
 *   1. Honest synthetic bundles pass: every rule, and the verdict their stage earns (`gpu-verified` for the replay, `practice` for the trace).
 *   2. Each forgery fails its named check with the bound printed: an edited p99 (B6), a closed-loop log presented as open loop (B4), a trace faster than
 *      its physics floor (P1), an attribution that does not partition its step window (T7), a replayed receipt (rule 4), an unknown grader (rule 5); and
 *      ASSESSMENT §13's other three: a re-signed hash (B6), a reused token (rule 4), and a pair run on different seeds (B1).
 * The forgeries are built from the fixtures by tests/verify/bestiary.ts, which reads whatever bundle it is given, so that the owner's bundles of W2-T12
 * are forged the same way. And the limit of the design is a test too: a forger who edits the rows and recomputes every summary is not caught (A§8.6).
 *
 * The review of W2's grader track added two, each of a hole it found: a trace too fast with a smaller model typed into the
 * receipt's inputs (P1 made its floor from the receipt's own figure), and an acceptance artifact with no round in it (acceptance-counts passed over nothing). Each passed
 * before its fix, and fails its named check now.
 */
import { describe, expect, test } from 'bun:test'
import { verifyBundle } from '@es/verify'
import type { CheckedOutcome, Outcome, RuleResult } from '@es/verify'
import { BESTIARY, forgeriesFor } from './bestiary'
import { edited, proposerFixture, replayFixture, traceFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { fileOf } from './support'

const checked = (outcome: Outcome): CheckedOutcome => {
  if (outcome.kind !== 'checked') throw new Error(`the file was refused: ${JSON.stringify(outcome.rules.filter((rule) => rule.status !== 'pass').map((rule) => rule.summary))}`)
  return outcome
}
const run = async (fixture: Fixture): Promise<CheckedOutcome> => checked(await verifyBundle(fileOf(fixture.bundle), fixture.context))

/** What a rule found for a check, for rules 7 to 9 by the check's id, and for rules 1 to 6 by the rule's. */
function found(outcome: CheckedOutcome, rule: number, check: string): { status: string; bound: string } {
  const result: RuleResult | undefined = outcome.rules.find((entry) => entry.rule === rule)
  if (result === undefined) throw new Error(`no result for rule ${rule}`)
  if (rule <= 6) return { status: result.status, bound: [result.summary, ...result.problems].join(' ') }
  const inside = result.checks?.find((entry) => entry.id === check)
  if (inside === undefined) throw new Error(`rule ${rule} made no check called ${check}: ${(result.checks ?? []).map((entry) => entry.id).join(', ')}`)
  return { status: inside.status, bound: inside.bound }
}

const FIXTURES = [replayFixture, traceFixture, proposerFixture]

describe('the honest synthetic fixtures', () => {
  test.each(FIXTURES.map((make) => [make().name, make] as const))('%s passes every rule, and earns the verdict of its stage', async (_name, make) => {
    const fixture = make()
    const outcome = await run(fixture)
    expect(outcome.rules.map((rule) => `${rule.rule}:${rule.id}:${rule.status}`)).toEqual([
      '1:caps:pass',
      '2:schema:pass',
      '3:integrity:pass',
      '4:binding:pass',
      '5:grader:pass',
      '6:pins:pass',
      '7:rechecks:pass',
      '8:recomputation:pass',
      '9:floors:pass',
    ])
    expect(outcome.verdict.provenance).toBe(fixture.provenance)
    expect(outcome.verdict.checks.filter((check) => check.verdict === 'fail')).toEqual([])
  })

  test('the proposer is credited in full: the grader\'s identity check is attested, and the browser\'s one check of the counts is re-checked here', async () => {
    const outcome = await run(proposerFixture())
    expect(outcome.verdict).toMatchObject({ provenance: 'gpu-verified', reasons: [] })
    expect(outcome.verdict.checks).toEqual([
      { id: 'acceptance-counts', verdict: 'pass', bound: '1 artifact: in every round accepted ≤ proposed and tokens out = accepted + bonus, and any claimed acceptance equals the totals.', how: 're-checked', required: true },
      { id: 'tie-aware-identity', verdict: 'attested', bound: 'value 200, bound 200, n 200; synthetic: 200 of 200 sequences identical to the plain run', how: 'attested', required: true },
    ])
  })

  test('the replay is credited in full: its grader-attested check is attested, and the thirteen checks of the replay are re-checked here', async () => {
    const outcome = await run(replayFixture())
    expect(outcome.verdict).toMatchObject({ provenance: 'gpu-verified', reasons: [] })
    const rechecked = outcome.verdict.checks.filter((check) => check.how === 're-checked').map((check) => check.id)
    expect(rechecked).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B14', 'P3'])
    expect(outcome.verdict.checks.filter((check) => check.how === 'attested')).toEqual([expect.objectContaining({ id: 'teacher-forced', verdict: 'attested', required: true })])
  })

  test('the bench evidence is recomputed from the rows: the numbers the receipt claims are the ones the browser finds', async () => {
    const outcome = await run(replayFixture())
    expect(found(outcome, 8, 'B6').bound).toMatch(/^Recomputed by nearest rank from 1,136 measured rows: time to first token p50 [\d,]+ µs, p90 [\d,]+ µs, p99 [\d,]+ µs\.$/)
    expect(found(outcome, 8, 'B7').bound).toMatch(/1,136 measured rows, and the 95% interval on the p99/)
    expect(found(outcome, 8, 'B10').bound).toMatch(/Little's law holds within 50 permille \[estimated\]/)
  })

  test('the trace evidence is recomputed from the spans: thirteen step windows, each partitioned to the ns, and every step above its floor', async () => {
    const outcome = await run(traceFixture())
    expect(found(outcome, 8, 'T7').bound).toMatch(/13 windows: each claimed attribution adds up to its window to the ns/)
    expect(found(outcome, 9, 'P1').bound).toMatch(/13 floors, and none is broken; every step lasts at least the floor, 70,000,000,000 weight bytes × 80% \[estimated\] ÷ 13,400 GB\/s over 4 GPUs = 4,179,104 ns/)
  })
})

describe('the forged bestiary', () => {
  test('has the nine forgeries of ASSESSMENT §13, once each, the two that the review of the grader track added, and the one of the second review', () => {
    expect(BESTIARY.map((forgery) => forgery.id)).toEqual([
      'edited-p99',
      'resigned-hash',
      'reused-token',
      'replayed-receipt',
      'closed-loop',
      'too-fast',
      'unknown-grader',
      'not-a-partition',
      'other-seed',
      'smaller-model',
      'empty-evidence',
      'faster-gpu-typed',
      'relabelled-trace',
    ])
    expect(BESTIARY.map((forgery) => forgery.title)).toEqual([
      'an edited p99',
      'a re-signed hash',
      'a reused token',
      'a replayed old receipt',
      'a closed-loop log presented as open loop',
      'a trace faster than its physics floor',
      'an unknown grader build',
      'an attribution that does not partition its step window',
      'a pair run on different seeds',
      'a trace faster than its physics floor, with a smaller model typed in',
      'evidence left out and its entry left in: an acceptance artifact with no round',
      "a trace faster than its physics floor, with a faster GPU typed into the receipt's list",
      'a trace faster than its physics floor, with its entry relabelled as a log in the receipt',
    ])
  })

  test('every forgery has an honest fixture to be made from, and the three kinds of fixture are forged into seven, five and one', () => {
    expect(forgeriesFor(replayFixture()).map((forgery) => forgery.id)).toEqual(['edited-p99', 'resigned-hash', 'reused-token', 'replayed-receipt', 'closed-loop', 'unknown-grader', 'other-seed'])
    expect(forgeriesFor(traceFixture()).map((forgery) => forgery.id)).toEqual(['too-fast', 'not-a-partition', 'smaller-model', 'faster-gpu-typed', 'relabelled-trace'])
    expect(forgeriesFor(proposerFixture()).map((forgery) => forgery.id)).toEqual(['empty-evidence'])
    const covered = new Set([...forgeriesFor(replayFixture()), ...forgeriesFor(traceFixture()), ...forgeriesFor(proposerFixture())].map((forgery) => forgery.id))
    expect(covered.size).toBe(BESTIARY.length)
  })

  for (const make of FIXTURES) {
    const honest = make()
    describe(`from the ${honest.name} fixture`, () => {
      for (const forgery of forgeriesFor(honest)) {
        test(`${forgery.title} fails ${forgery.fails.check} (rule ${forgery.fails.rule}), with the bound it broke printed, and the receipt is not credited`, async () => {
          const control = found(await run(make()), forgery.fails.rule, forgery.fails.check)
          expect(control.status).toBe('pass')

          const forged = forgery.forge(make())
          const outcome = await run(forged)
          const result = found(outcome, forgery.fails.rule, forgery.fails.check)
          expect(result.status).toBe('fail')
          expect(result.bound).toMatch(forgery.bound)
          // The reason of the verdict is the sentence of the rule (rules 1 to 6) or the check with its bound (rules 7 to 9), and the receipt earns nothing.
          expect(outcome.verdict.provenance).toBe('gpu-unverified')
          const reasons = outcome.verdict.reasons.join('\n')
          if (forgery.fails.rule <= 6) expect(reasons).toContain(outcome.rules[forgery.fails.rule - 1].summary)
          else expect(reasons).toMatch(forgery.bound)
        })
      }
    })
  }

  test('a forgery fails what it is named for and little else: the edited p99 breaks B6 and the others of its rule hold, the closed loop breaks B4 and the file is still a receipt', async () => {
    const p99 = BESTIARY.find((forgery) => forgery.id === 'edited-p99')?.forge(replayFixture())
    const outcome = await run(p99 as Fixture)
    expect(outcome.rules.slice(0, 7).map((rule) => rule.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass'])
    expect(outcome.rules[7].checks?.filter((check) => check.status === 'fail').map((check) => check.id)).toEqual(['B6'])
  })
})

describe('the limit of the design (A§8.6)', () => {
  test('a forger who edits the rows and recomputes every summary that follows from them is not caught by rules 7 to 9, and the receipt says nothing against it', async () => {
    const honest = replayFixture()
    const forged = edited(honest, (bundle) => {
      const artifact = bundle.artifacts['bench-log']
      if (artifact.encoding !== 'json') throw new Error('a benchmark log is JSON')
      const log = artifact.data as { rows: Record<string, number[]> }
      for (let i = 0; i < log.rows.id.length; i += 1) log.rows.firstNs[i] = log.rows.sentNs[i] + Math.floor(((log.rows.firstNs[i] - log.rows.sentNs[i]) * 7) / 10)
      // The summary is made again from the edited rows, by the same arithmetic.
      bundle.receipt.performance = { kind: 'bench', claimed: { 'bench-log': claimAgain(honest, log) } }
    })
    const outcome = await run(forged)
    expect(outcome.verdict.provenance).toBe('gpu-verified')
  })
})

import { claimedSummary } from './synthetic'
import { REPLAY_SPEC } from './synthetic'
import { runBench, s5Server } from '../../packages/sim/bench'
function claimAgain(honest: Fixture, log: { rows: Record<string, number[]> }): Record<string, unknown> {
  // A run object with the edited rows in µs, for the same summary function the honest claim came from.
  const run = runBench(honest.bundle.receipt.challenge.seed, REPLAY_SPEC, s5Server('h100-vllm-0-10-2-fp8', 4))
  const rows = run.rows.map((row, i) => ({ ...row, firstUs: Math.round(log.rows.firstNs[i] / 1000) }))
  return claimedSummary({ ...run, rows }, REPLAY_SPEC, honest.bundle.receipt.challenge.seed) as Record<string, unknown>
}
