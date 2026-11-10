/*
 * W2-T08: which checks run for a receipt (packages/verify/evaluate.ts). A check that the stage requires always runs, and fails with the reason if the
 * receipt has nothing for it, since a requirement that a forger can meet by leaving the evidence out is none. A check the stage lists as captured, and
 * every check when it says `*`, runs when the evidence supports it and is left out when it does not. Rule 7's re-checks run when the receipt has their
 * artifact. A check that throws is a failed check, and the others still run.
 */
import { describe, expect, test } from 'bun:test'
import { formatChallenge } from '@es/schema/challenge'
import type { Run } from '@es/verify/checks'
import { evaluate } from '@es/verify/evaluate'
import { CHECK_IDS } from '@es/verify'
import { BENCH_CHECKS } from '@es/verify/bench'
import { firstDifference } from '@es/verify/checks'
import { FLOORS_BUILT } from '@es/verify/floors'
import { BENCH_CHECK_IDS, EVIDENCE_CHECK_IDS, FLOOR_CHECK_IDS, RECHECK_IDS, TRACE_CHECK_IDS } from '@es/verify/ids'
import { RECHECKS_BUILT } from '@es/verify/rechecks'
import { TRACE_CHECKS_BUILT } from '@es/verify/trace'
import { edited, REPLAY_SPEC, replayFixture, SERVING, traceFixture } from './synthetic'
import type { Fixture } from './synthetic'
import { verifyBundle } from '@es/verify'
import { checkOf, failed, verify } from './run'
import { fileOf } from './support'

describe('a stage that requires a check the receipt has no evidence for', () => {
  test('fails each, with the reason: a replay with its log taken out, and the artifact left out of the bundle with it', async () => {
    const fixture = edited(replayFixture(), (bundle) => {
      bundle.receipt.artifacts = []
      bundle.artifacts = {}
      bundle.receipt.performance = undefined
    })
    const outcome = await verify(fixture.bundle, fixture.context)
    const ids = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B14', 'P3']
    expect(failed(outcome)).toEqual(ids)
    expect(checkOf(outcome, 'B1')?.bound).toBe('The receipt carries no benchmark log (enginespace/bench-log@1).')
    expect(checkOf(outcome, 'P3')?.bound).toBe('The receipt carries no benchmark log.')
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.rules[7]).toMatchObject({ status: 'fail', summary: '12 checks, 0 passed and 12 failed.' })
  })
})

describe('a stage that lists checks as captured', () => {
  test('runs the ones the evidence supports and leaves out the ones it does not: a trace is not a benchmark', async () => {
    const outcome = await verify(traceFixture().bundle, traceFixture().context)
    const ids = outcome.rules.flatMap((rule) => (rule.checks ?? []).map((check) => check.id))
    expect(ids).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'X4', 'P1'])
    expect(ids.some((id) => id.startsWith('B'))).toBe(false)
  })

  test('runs rule 7\'s re-checks whatever the stage, when the receipt has their artifact, and a stage that asks for none leaves them out otherwise', async () => {
    const outcome = await verify(replayFixture().bundle, replayFixture().context)
    expect(outcome.rules[6]).toMatchObject({ rule: 7, id: 'rechecks', status: 'pass', summary: 'No check of this rule applies to the receipt.' })
  })
})

describe('a stage that asks for evidence (the review of W2\'s grader track)', () => {
  /** A fixture made the receipt of another stage, with the challenge's token naming it. */
  const asStage = (fixture: Fixture, stage: string): Fixture =>
    edited(fixture, (bundle) => {
      const parts = { stage, seed: bundle.receipt.challenge.seed, nonce: bundle.receipt.challenge.nonce, issuedOn: bundle.receipt.challenge.issuedOn }
      bundle.receipt.stage = stage
      bundle.receipt.lab = stage.slice(0, stage.lastIndexOf('.'))
      bundle.receipt.challenge.token = formatChallenge(parts)
    })
  const STAGE = 'tr7.reproduce.s1'
  const evidenceOf = async (fixture: Fixture) => checkOf(await verify(fixture.bundle, fixture.context), 'evidence')
  /** The honest trace of tr3.profile.s5 as a receipt of tr7.reproduce.s1, changed. */
  const traceOf = (change: (trace: { spans: Record<string, number[]>; flows: unknown[]; marks: unknown[] }) => void): Fixture =>
    edited(asStage(traceFixture(), STAGE), (bundle) => change(bundle.artifacts.trace.data as never))

  test('is satisfied by a trace with a span and step windows, and by a log with rows, and the check prints which', async () => {
    expect(await evidenceOf(asStage(traceFixture(), STAGE))).toEqual({ id: 'evidence', status: 'pass', bound: 'The receipt carries 13 step windows in 1 trace to recompute.' })
    // The stage declares no workload here, so nothing says which rows are the warm-up's, and every row counts.
    expect(await evidenceOf(asStage(replayFixture(), STAGE))).toEqual({ id: 'evidence', status: 'pass', bound: 'The receipt carries 1,264 measured rows of a benchmark log to recompute.' })
  })

  test('counts the rows after the warm-up when the stage declares the workload that says how many that is', async () => {
    const fixture = asStage(replayFixture(), STAGE)
    const declared = { ...fixture.context, stages: { [STAGE]: { bench: REPLAY_SPEC, ...SERVING } } }
    expect((await verify(fixture.bundle, declared)).rules[7].checks?.find((check) => check.id === 'evidence')?.bound).toBe('The receipt carries 1,136 measured rows of a benchmark log to recompute.')
  })

  test.each([
    ['carries neither a log nor a trace', () => edited(asStage(traceFixture(), STAGE), (bundle) => ((bundle.receipt.artifacts = []), (bundle.artifacts = {}), (bundle.receipt.performance = undefined)))],
    ['carries a trace with no span, whose step marks are all it has', () => traceOf((trace) => (Object.values(trace.spans).forEach((column) => (column.length = 0)), (trace.flows.length = 0)))],
    ['carries a trace with spans and no step window', () => traceOf((trace) => (trace.marks.length = 0))],
    [
      'carries a benchmark log with no row',
      () => edited(asStage(replayFixture(), STAGE), (bundle) => Object.values((bundle.artifacts['bench-log'].data as { rows: Record<string, number[]> }).rows).forEach((column) => (column.length = 0))),
    ],
  ])('fails a receipt that %s: a check over nothing satisfies nothing', async (_name, make) => {
    const fixture = make()
    const outcome = await verify(fixture.bundle, fixture.context)
    expect(checkOf(outcome, 'evidence')).toEqual({
      id: 'evidence',
      status: 'fail',
      bound: 'The stage asks for a benchmark log or a trace to recompute, and the receipt carries neither with anything in it: no log has a measured row, and no trace has a span and a step window.',
    })
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons.join('\n')).toContain('evidence: The stage asks for a benchmark log or a trace to recompute')
  })

  test('is a check of the stages that ask for it and of no other: the honest replay of tr8.replay.s2 and the practice trace of tr3.profile.s5 have none', async () => {
    expect(await evidenceOf(replayFixture())).toBeUndefined()
    expect(await evidenceOf(traceFixture())).toBeUndefined()
  })

  test('is counted in the verdict as a check the stage requires, re-checked here', async () => {
    const fixture = asStage(traceFixture(), STAGE)
    const outcome = await verify(fixture.bundle, fixture.context)
    expect(outcome.verdict.checks.find((check) => check.id === 'evidence')).toMatchObject({ verdict: 'pass', how: 're-checked', required: true })
  })
})

describe('a stage this version does not list', () => {
  test('runs only what rule 7 reads: nothing is required of it, and the verdict says it cannot tell what is', async () => {
    const fixture = edited(replayFixture(), (bundle) => {
      const parts = { stage: 'tr8.replay.s9', seed: bundle.receipt.challenge.seed, nonce: bundle.receipt.challenge.nonce, issuedOn: bundle.receipt.challenge.issuedOn }
      bundle.receipt.stage = parts.stage
      bundle.receipt.challenge.token = formatChallenge(parts)
    })
    const outcome = await verify(fixture.bundle, fixture.context)
    expect(outcome.rules.slice(0, 6).every((rule) => rule.status === 'pass')).toBe(true)
    expect(outcome.rules.slice(6).map((rule) => (rule.checks ?? []).length)).toEqual([0, 0, 0])
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
    expect(outcome.verdict.reasons).toEqual(['This version of the site lists no stage called tr8.replay.s9, so it cannot say what the stage requires.'])
  })
})

describe('a check that cannot run', () => {
  test('is a failed check with the error as its bound, and the other checks of the receipt still run', () => {
    const fixture = replayFixture()
    // A receipt whose artifacts cannot be read: a getter that throws, as a hostile object might.
    const hostile = new Proxy(fixture.bundle.receipt, {
      get(target, key, receiver) {
        if (key === 'artifacts') throw new Error('this list cannot be read')
        return Reflect.get(target, key, receiver)
      },
    })
    const run: Run = { receipt: hostile, artifacts: fixture.bundle.artifacts, atlas: fixture.context.atlas ?? [], declared: undefined, bank: undefined, synthetic: false, memo: new Map() }
    const results = evaluate(run)
    expect(results.map((rule) => rule.rule)).toEqual([7, 8, 9])
    const checks = results.flatMap((rule) => rule.checks ?? [])
    // Rule 7 reads the artifacts of every receipt and its three re-checks throw; the stage's required checks throw too; and the run goes on to the end.
    expect(checks.length).toBeGreaterThan(10)
    expect(checks.every((check) => check.status === 'fail' && check.bound.startsWith('The check could not run: this list cannot be read'))).toBe(true)
  })
})

describe('the registry', () => {
  test('is the list of ids.ts, which the verdict reads without the rules: each module of checks has exactly the checks that the list gives it', () => {
    expect([...BENCH_CHECKS].sort()).toEqual([...BENCH_CHECK_IDS].sort())
    expect([...TRACE_CHECKS_BUILT].sort()).toEqual([...TRACE_CHECK_IDS].sort())
    expect([...FLOORS_BUILT].sort()).toEqual([...FLOOR_CHECK_IDS].sort())
    expect([...RECHECKS_BUILT].sort()).toEqual([...RECHECK_IDS].sort())
  })

  test('lists the checks of the three rules in the order they run: rule 7\'s three, then evidence, the benchmark\'s and the trace\'s, then the floors', () => {
    expect(EVIDENCE_CHECK_IDS).toEqual(['evidence'])
    expect(CHECK_IDS).toEqual([
      'identity-tally',
      'acceptance-counts',
      'argmax-bank',
      'evidence',
      'B1',
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
      'B7',
      'B8',
      'B9',
      'B10',
      'B12',
      'B14',
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'T8',
      'X4',
      'T10',
      'P1',
      'P3',
    ])
  })
})

describe('the comparison of a claim with what was recomputed', () => {
  test('is equal or it is not, for the keys both have: a figure, an object, a list, and a claim of figures where the rows give none', () => {
    expect(firstDifference({ p99Us: 5 }, { p99Us: 5, p50Us: 3 }, 'latency')).toBeNull()
    expect(firstDifference({ p99Us: 5 }, { p99Us: 6 }, 'latency')).toBe('latency.p99Us: the receipt claims 5 and the rows give 6')
    expect(firstDifference({ a: { b: [1, 2, 3] } }, { a: { b: [1, 2, 3] } }, 'x')).toBeNull()
    expect(firstDifference({ a: { b: [1, 2, 4] } }, { a: { b: [1, 2, 3] } }, 'x')).toBe('x.a.b[2]: the receipt claims 4 and the rows give 3')
    expect(firstDifference([1, 2], [1, 2, 3], 'x')).toBe('x: the receipt claims 2 entries and the rows give 3')
    // A key that the recomputation does not have is not compared: credit never depends on a number the browser does not compute.
    expect(firstDifference({ note: 'fast' }, { p99Us: 1 }, 'x')).toBeNull()
    // Figures claimed where the rows give none are a difference, and so is a figure claimed as another kind.
    expect(firstDifference({ p99Us: 1 }, null, 'latency.tpot')).toBe('latency.tpot: the receipt claims figures and the rows give null')
    expect(firstDifference(null, { p99Us: 1 }, 'latency.tpot')).toBe('latency.tpot: the receipt claims null and the rows give {"p99Us":1}')
    expect(firstDifference('5', 5, 'x')).toBe('x: the receipt claims "5" and the rows give 5')
  })
})

describe('an artifact that is hostile', () => {
  /** What a file may put where a log or a trace belongs: JSON of every shape but the right one. */
  const HOSTILE: [string, unknown][] = [
    ['null', null],
    ['a number', 7],
    ['a string', 'x'.repeat(1000)],
    ['an empty list', []],
    ['a list of lists', [[], [[]], [[[]]]]],
    ['an empty object', {}],
    ['the schema tag alone', { schema: 'enginespace/trace@1' }],
    ['columns that are not columns', { schema: 'enginespace/bench-log@1', cacheResetNs: 0, rows: { id: 'a', dueNs: {}, sentNs: null, firstNs: [], doneNs: [], promptTokens: [], outputTokens: [], status: [] } }],
    ['a field named for the prototype', JSON.parse('{"__proto__": {"polluted": true}, "schema": "enginespace/trace@1"}') as unknown],
    ['numbers beyond 2^53', { schema: 'enginespace/bench-log@1', cacheResetNs: 1e300, rows: {} }],
  ]

  test.each(HOSTILE)('%s in the place of a benchmark log or a trace is a receipt with failed checks, and the check never throws or credits it', async (_name, data) => {
    for (const fixture of [replayFixture(), traceFixture()]) {
      const put = (bundle: typeof fixture.bundle): void => {
        bundle.artifacts[bundle.receipt.artifacts[0].id] = { encoding: 'json', data: data as object }
      }
      let hostile = fixture
      try {
        hostile = edited(fixture, put)
      } catch {
        // Data with no canonical form cannot be signed, and the file that holds it is refused at rule 3: the bundle is sent unsigned.
        const bundle = structuredClone(fixture.bundle)
        put(bundle)
        hostile = { ...fixture, bundle }
      }
      const outcome = await verifyBundle(fileOf(hostile.bundle), hostile.context)
      // It is refused at rule 3 when the data has no canonical bytes, and otherwise checked and not credited: either way, an answer.
      expect(['checked', 'refused']).toContain(outcome.kind)
      if (outcome.kind === 'checked') expect(outcome.verdict.provenance).toBe('gpu-unverified')
    }
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  test('a claim of the wrong shape is a failed check and not a crash: a string, a list or a number where an object of figures belongs', async () => {
    for (const claim of ['fast', [1, 2, 3], 7, null]) {
      const outcome = await verify(edited(replayFixture(), (bundle) => (bundle.receipt.performance = { kind: 'bench', claimed: { 'bench-log': claim } })).bundle, replayFixture().context)
      expect(outcome.verdict.provenance).toBe('gpu-verified')
    }
    const odd = await verify(edited(replayFixture(), (bundle) => (bundle.receipt.performance = { kind: 'bench', claimed: { 'bench-log': { latency: 'x', counts: 5, adherence: [], goodput: null, littles: 'y', p99Intervals: 3 } } })).bundle, replayFixture().context)
    expect(odd.verdict.provenance).toBe('gpu-unverified')
    expect(failed(odd)).toEqual(['B2', 'B4', 'B7', 'B9', 'B10'])
  })
})
