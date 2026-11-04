/*
 * The broken-benchmark corpus (ARCHITECTURE §5.6; GAMES §11; W1-T32): `brokenBenchCase(seed)` draws a published benchmark claim that is
 * wrong because of one of ten flaws, or sound (the control), with the harness and the client log behind it.
 *
 * W1-T32's acceptance checks, and where they are:
 *   1. Each of the eleven cases appears in 1/11 ± 3% of seeds [estimated tolerance]: "the draw of a flaw".
 *   2. The best constant per flaw label passes at most as often as ASSESSMENT §4.1's bound, 15% [estimated]: "the answer is drawn first".
 *      The rate is measured on the cases of BLIND_SEEDS seeds and printed, as kernelspace's D39 rule asks, in two ways: with the constants
 *      chosen on the cases they are judged on (an upper bound, which falls toward the true best as the cases grow in number) and with the
 *      constants chosen on one half and judged on the other (what a strategy fixed in advance gets). A PR judges the second; the nightly
 *      run (ES_PROPERTY_SEEDS=10000) judges the first, at 1,000 cases for each flaw.
 *   3. Every case's corrected answer recomputes from its scene: "the corrected answer recomputes from the scene". The scene is round-tripped
 *      through canonical JSON first, so nothing outside it can be needed, and the rule is restated here in the test for the flaws whose
 *      correction is a re-run.
 * The rest holds the corpus to its own rules: the band, the flaw's signature in each log, determinism, and the claims a debrief cites.
 *
 * Numbers printed under "broken-bench corpus" at the end of the file are [measured] on the machine and commit that ran the test.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import {
  BENCH_FLAWS,
  BENCH_MIN_ROWS_FOR_P99,
  BENCH_WARMUP_ROWS,
  BROKEN_CORRECTED_ROWS,
  BROKEN_MAX_ATTEMPTS,
  BROKEN_MIN_RATIO_MILLI,
  FLAW_CLAIMS,
  arrivalAdherence,
  benchSettled,
  bestConstantPerLabel,
  brokenBand,
  brokenBenchCase,
  brokenFlawOf,
  checkRows,
  correctBench,
  correctedInterval,
  runBench,
  ttftUs,
} from '../../packages/sim/bench'
import type { BenchFlaw, BrokenCase } from '../../packages/sim/bench'
import { BURST_GRID, LIGHT_GRID, MIX_GRID, OVERLOAD_GRID, STALL_GRID } from '../../packages/sim/bench/broken-kits'
import { canonicalJson, rngFor } from '../../packages/sim/core'
import { replayWorkload } from '../../packages/sim/workload'
import { inFlightMax } from './bench-support'
import { BLIND_SEEDS, NIGHTLY_SEEDS, PER_FLAW, SEED_COUNT, caseOf, casesOf, nearestRankOf, pct } from './bench-broken-support'

const root = path.resolve(import.meta.dirname, '../..')
const report: string[] = []
const say = (line: string) => report.push(line)
afterAll(() => {
  console.log(['', `broken-bench corpus (${PER_FLAW} cases per flaw for the per-flaw lines, ${BLIND_SEEDS} cases for the blind-strategy lines):`, ...report].join('\n'))
})

/** Whole minutes of a run at the nightly size: a test over 10,000 cases takes a few minutes, so every test here may run that long. */
const TIMEOUT_MS = 30 * 60_000
const it = (name: string, fn: () => void) => test(name, fn, TIMEOUT_MS)

/** A copy of an object without one key. */
function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const copy = { ...o }
  delete copy[key]
  return copy
}

const ALL: readonly BenchFlaw[] = BENCH_FLAWS
const allCases = (): BrokenCase[] => ALL.flatMap((flaw) => casesOf(flaw))
const fromDue = (c: BrokenCase, rows = c.scene.rows) => rows.filter((r) => r.dueUs >= c.scene.setup.warmupUs).map((r) => ttftUs(r, 'due'))

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 1

describe('the draw of a flaw (acceptance check 1)', () => {
  it('any eleven consecutive seeds draw each flaw once, so 11,000 draw each 1,000 times', () => {
    const counts = new Map<BenchFlaw, number>()
    for (let seed = 0; seed < 11_000; seed++) counts.set(brokenFlawOf(seed), (counts.get(brokenFlawOf(seed)) ?? 0) + 1)
    for (const flaw of ALL) expect(counts.get(flaw), flaw).toBe(1000)
    expect(brokenFlawOf(0)).toBe(BENCH_FLAWS[0])
    expect(brokenFlawOf(4294967295)).toBe(BENCH_FLAWS[4294967295 % 11])
  })

  it('uniform 32-bit seeds, the graded kind, draw each flaw 1/11 of the time to within half a point over 220,000 draws', () => {
    const rng = rngFor(11, 'test/broken/seeds')
    const counts = new Map<BenchFlaw, number>()
    const n = 220_000
    for (let i = 0; i < n; i++) {
      const flaw = brokenFlawOf(rng())
      counts.set(flaw, (counts.get(flaw) ?? 0) + 1)
    }
    for (const flaw of ALL) {
      const share = (counts.get(flaw) ?? 0) / n
      expect(Math.abs(share - 1 / 11), `${flaw}: ${share}`).toBeLessThan(0.005)
    }
  })

  it('the cases that are drawn, BLIND_SEEDS of them, hold each flaw 1/11 ± 3 points of the time, and a case has the flaw its seed draws', () => {
    const cases = Array.from({ length: BLIND_SEEDS }, (_, seed) => caseOf(seed))
    const shares = ALL.map((flaw) => cases.filter((c) => c.flaw === flaw).length / cases.length)
    say(`  flaw shares over ${cases.length} seeds: ${ALL.map((flaw, i) => `${flaw} ${(100 * shares[i]).toFixed(2)}%`).join(', ')} (1/11 is 9.09%)`)
    for (const [i, flaw] of ALL.entries()) expect(Math.abs(shares[i] - 1 / 11), flaw).toBeLessThan(0.03)
    for (const c of cases) expect(c.flaw).toBe(brokenFlawOf(c.seed))
  })

  it('a flaw can be asked for by name, and the case then has it whatever the seed would have drawn', () => {
    for (const flaw of ALL) {
      const c = brokenBenchCase(5, { flaw })
      expect(c.flaw).toBe(flaw)
      expect(c.seed).toBe(5)
    }
  })

  it('refuses a seed that is not an unsigned 32-bit integer', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => brokenFlawOf(seed)).toThrow(RangeError)
      expect(() => brokenBenchCase(seed)).toThrow(RangeError)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Every case is a fair question

describe('every case is a fair question: the band', () => {
  it(`keeps the band on all but a few cases, within ${BROKEN_MAX_ATTEMPTS} draws of the benchmark's own randomness, and says why when it does not`, () => {
    const cases = Array.from({ length: BLIND_SEEDS }, (_, seed) => caseOf(seed))
    const out = cases.filter((c) => !c.band.ok)
    const attempts = cases.map((c) => c.attempts)
    say(
      `  band: ${cases.length - out.length} of ${cases.length} cases in band (${pct(cases.length - out.length, cases.length)}); draws per case: mean ${(attempts.reduce((a, b) => a + b, 0) / cases.length).toFixed(2)}, most ${Math.max(...attempts)}; the flaw moves the number by at least ${BROKEN_MIN_RATIO_MILLI / 1000} times`,
    )
    if (out.length > 0) say(`  out of band: ${out.map((c) => `${c.seed} ${c.flaw} (${c.band.reasons.join('; ')})`).join(', ')}`)
    // A seed that no draw puts in band is rare, and a session redraws from another seed (GAMES §2.1): at most 2 in 1,000 [estimated].
    expect(out.length / cases.length).toBeLessThanOrEqual(0.002)
    for (const c of cases) expect(c.attempts).toBeLessThanOrEqual(BROKEN_MAX_ATTEMPTS)
  })

  it('a case\'s band is the band of its own parts, and a case of every flaw but the control is off by 1.5 times or more', () => {
    for (const c of allCases()) {
      expect(brokenBand(c), `${c.seed} ${c.flaw}`).toEqual(c.band)
      expect(c.band.ok).toBe(true)
      const hi = Math.max(c.scene.claim.valueUs, c.answer.p99Us)
      const lo = Math.min(c.scene.claim.valueUs, c.answer.p99Us)
      if (c.flaw === 'none') expect(c.scene.claim.valueUs).toBe(c.answer.p99Us)
      else expect(hi * 1000, `${c.seed} ${c.flaw}`).toBeGreaterThanOrEqual(BROKEN_MIN_RATIO_MILLI * lo)
    }
  })

  it('the corrected p99 rests on at least 1,000 rows, except for a too-few-samples claim, which rests on 40 to 200', () => {
    for (const c of allCases()) {
      expect(c.answer.n, `${c.seed} ${c.flaw}`).toBeGreaterThanOrEqual(BENCH_MIN_ROWS_FOR_P99)
      if (c.flaw === 'too-few-samples') {
        expect(c.scene.claim.n).toBeGreaterThanOrEqual(40)
        expect(c.scene.claim.n).toBeLessThanOrEqual(200)
        expect(c.answer.n).toBe(BROKEN_CORRECTED_ROWS)
      } else if (c.flaw !== 'warm-up-counted') {
        // At least 10 rows lie beyond the p99 (ASSESSMENT B7).
        expect(c.answer.n - Math.ceil((990 * c.answer.n) / 1000)).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('every log is a log: rows in order, ids dense from 0, integers, and a case survives canonical JSON', () => {
    for (const c of allCases()) {
      checkRows(c.scene.rows)
      expect(c.scene.rows.map((r) => r.id), `${c.seed} ${c.flaw}`).toEqual(c.scene.rows.map((_, i) => i))
      expect(() => canonicalJson(c)).not.toThrow()
      // The flaw's name is not in what the learner sees.
      const seen = canonicalJson(c.scene)
      for (const flaw of ALL) if (flaw !== 'none') expect(seen.includes(flaw), `${c.seed} ${c.flaw} shows ${flaw}`).toBe(false)
    }
  })
})

describe('every flaw shows in its log', () => {
  const rowsOf = (c: BrokenCase) => c.scene.rows
  const measured = (c: BrokenCase) => rowsOf(c).filter((r) => r.dueUs >= c.scene.setup.warmupUs)

  it('closed-loop: clients that each wait for a reply, never more in flight than there are clients, at the server\'s capacity, for a rate past it', () => {
    for (const c of casesOf('closed-loop')) {
      const a = c.scene.setup.arrivals
      if (a.kind !== 'closed') throw new Error('not closed')
      expect(a.schedule, `${c.seed}`).toBeUndefined()
      expect(rowsOf(c).every((r) => r.sentUs === r.dueUs)).toBe(true)
      expect(inFlightMax(rowsOf(c), (r) => r.sentUs, (r) => r.doneUs)).toBe(a.clients)
      // After the warm-up the loop finishes what the server can: the measured capacity, to 10%.
      const from = c.scene.setup.warmupUs
      const to = Math.max(...rowsOf(c).map((r) => r.doneUs))
      const done = rowsOf(c).filter((r) => r.doneUs >= from && r.doneUs < to).length
      const rate = (done * 1_000_000_000) / (to - from)
      expect(Math.abs(rate - c.scene.capacityPerSMilli) / c.scene.capacityPerSMilli, `${c.seed}: ${rate} against ${c.scene.capacityPerSMilli}`).toBeLessThan(0.1)
      expect(c.scene.claim.ratePerSMilli).toBeGreaterThan(c.scene.capacityPerSMilli)
      expect(c.scene.claim.timerStartsAt).toBe('send')
    }
  })

  it('coordinated-omission: the server freezes, the sends right after fall behind their due times, and nothing before it does', () => {
    for (const c of casesOf('coordinated-omission')) {
      const stalls = c.scene.server.stalls ?? []
      expect(stalls, `${c.seed}`).toHaveLength(1)
      const { atUs, forUs } = stalls[0]
      const rows = rowsOf(c)
      expect(rows.filter((r) => r.dueUs < atUs).every((r) => r.sentUs === r.dueUs)).toBe(true)
      const slip = arrivalAdherence(rows)
      expect(slip.ok).toBe(false)
      expect(slip.lateRows).toBeGreaterThanOrEqual(5)
      expect(slip.maxLateUs).toBeGreaterThan(forUs / 3)
      // Of the requests due while it is frozen, only the one the clients had room for is sent into it.
      const during = rows.filter((r) => r.dueUs > atUs && r.dueUs < atUs + forUs)
      expect(during.filter((r) => r.sentUs < atUs + forUs).length).toBeLessThanOrEqual(3)
      expect(c.scene.claim.timerStartsAt).toBe('send')
      // The harness's own timer, from the send, does not see the freeze, and the course's, from the due time, does.
      expect(c.answer.p99Us).toBeGreaterThan(forUs / 2)
    }
  })

  it('client-queue-hidden: a cap on the clients, a queue in the client that grows through the run, and a timer that starts after it', () => {
    for (const c of casesOf('client-queue-hidden')) {
      const a = c.scene.setup.arrivals
      if (a.kind !== 'closed' || a.schedule === undefined) throw new Error('not a closed loop with a schedule')
      expect(a.clients).toBeGreaterThanOrEqual(64)
      expect(inFlightMax(rowsOf(c), (r) => r.sentUs, (r) => r.doneUs)).toBeLessThanOrEqual(a.clients)
      expect(c.scene.server.stalls).toBeUndefined()
      expect(arrivalAdherence(rowsOf(c)).ok).toBe(false)
      const late = rowsOf(c).map((r) => r.sentUs - r.dueUs)
      const quarter = Math.floor(late.length / 4)
      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
      expect(mean(late.slice(-quarter)), `${c.seed}`).toBeGreaterThan(2 * mean(late.slice(0, quarter)))
      expect(c.scene.claim.timerStartsAt).toBe('send')
    }
  })

  it('warm-up-counted: no warm-up declared, a cold start before the course\'s cut, and a p99 over everything that the cut takes down', () => {
    for (const c of casesOf('warm-up-counted')) {
      expect(c.scene.setup.warmupUs).toBe(0)
      const cold = c.scene.server.cold
      if (cold === undefined) throw new Error('no cold start')
      const rows = rowsOf(c)
      expect(cold.untilUs, `${c.seed}`).toBeLessThan(rows[BENCH_WARMUP_ROWS].dueUs)
      expect(cold.slowdownPermille).toBeGreaterThanOrEqual(2500)
      expect(c.scene.claim.n).toBe(rows.length)
      expect(c.answer.how).toBe('cut')
      expect(c.answer.n).toBe(rows.length - BENCH_WARMUP_ROWS)
      // At least 1% of the rows are slower than the p99 of the rest, which is what lifts the p99.
      expect(rows.filter((r) => ttftUs(r, 'due') > c.answer.p99Us).length).toBeGreaterThanOrEqual(Math.ceil(rows.length / 100))
    }
  })

  it('warm-cache: the prompts were left in the prefix cache by the run before', () => {
    for (const c of casesOf('warm-cache')) {
      expect(c.scene.setup.prefixWarm, `${c.seed}`).toBe(true)
      expect(c.answer.how).toBe('rerun')
      // The same requests with a cold cache take longer at every percentile that counts.
      const cold = runBench(c.scene.runSeed, { ...c.scene.setup, prefixWarm: false }, c.scene.server)
      const coldP50 = nearestRankOf(cold.rows.filter((r) => r.dueUs >= c.scene.setup.warmupUs).map((r) => ttftUs(r, 'due')), 500)
      expect(coldP50).toBeGreaterThan(nearestRankOf(fromDue(c), 500))
    }
  })

  it('capped-output: every reply is cut at max_tokens, which is under the shortest reply that production gives', () => {
    for (const c of casesOf('capped-output')) {
      const cap = c.scene.setup.outputCap
      if (cap === undefined) throw new Error('no cap')
      const lengths = c.scene.setup.lengths
      if (lengths === undefined || lengths.kind !== 'dists' || lengths.output.kind !== 'uniform') throw new Error('not uniform replies')
      expect(cap, `${c.seed}`).toBeLessThan(lengths.output.lo)
      expect(rowsOf(c).every((r) => r.outputTokens === cap)).toBe(true)
    }
  })

  it('too-few-samples: a log of 60 to 120 rows, whose p99 is its last rank or the one before, and a corrected one that rests on 1,500', () => {
    for (const c of casesOf('too-few-samples')) {
      const rows = rowsOf(c)
      expect(rows.length, `${c.seed}`).toBeGreaterThanOrEqual(60)
      expect(rows.length).toBeLessThanOrEqual(120)
      expect(c.scene.claim.n).toBe(rows.length)
      // Nearest rank: the 99th percentile of n ≤ 100 is the largest, and of n ≤ 200 one of the largest two.
      const sorted = rows.map((r) => ttftUs(r, 'due')).sort((a, b) => a - b)
      expect([sorted[sorted.length - 1], sorted[sorted.length - 2]]).toContain(c.scene.claim.valueUs)
      expect(c.answer.n).toBe(BROKEN_CORRECTED_ROWS)
    }
  })

  it('mean-as-tail: the number reported as the p99 is the mean of the first-token latencies', () => {
    for (const c of casesOf('mean-as-tail')) {
      const sample = fromDue(c)
      const sum = sample.reduce((s, x) => s + x, 0)
      expect(c.scene.claim.valueUs, `${c.seed}`).toBe(Math.floor((2 * sum + sample.length) / (2 * sample.length)))
      expect(c.scene.claim.n).toBe(sample.length)
      expect(c.answer.p99Us).toBe(nearestRankOf(sample, 990))
      expect(c.answer.p99Us).toBeGreaterThan(c.scene.claim.valueUs)
    }
  })

  it('client-bottleneck: sends spaced by the client\'s own cost, a rate achieved well under the one asked for, and a server that is never full', () => {
    for (const c of casesOf('client-bottleneck')) {
      const cost = c.scene.setup.clientCostUs
      if (cost === undefined) throw new Error('no client cost')
      const rows = rowsOf(c)
      const gaps = rows.slice(1).map((r, i) => r.sentUs - rows[i].sentUs)
      expect(Math.min(...gaps), `${c.seed}`).toBeGreaterThanOrEqual(cost)
      // Once the client is behind, which is almost at once, it sends one a cost.
      expect(gaps.slice(Math.floor(gaps.length / 10)).filter((g) => g === cost).length).toBeGreaterThanOrEqual(Math.floor(0.9 * (gaps.length - Math.floor(gaps.length / 10))))
      const achieved = (rows.length * 1_000_000_000) / (rows[rows.length - 1].sentUs - rows[0].sentUs)
      expect(achieved).toBeLessThan(0.8 * c.scene.capacityPerSMilli)
      expect(c.scene.claim.ratePerSMilli).toBeGreaterThan(c.scene.capacityPerSMilli)
      expect(inFlightMax(rows, (r) => r.sentUs, (r) => r.doneUs)).toBeLessThan(c.scene.server.maxNumSeqs)
      expect(arrivalAdherence(rows).ok).toBe(false)
    }
  })

  it('replay-without-timestamps: the trace\'s lengths and its mean rate, sent as Poisson, from a synthetic trace that has a burst past the capacity', () => {
    for (const c of casesOf('replay-without-timestamps')) {
      const { setup, claim } = c.scene
      expect(setup.arrivals.kind, `${c.seed}`).toBe('poisson')
      if (setup.lengths === undefined || setup.lengths.kind !== 'rows') throw new Error('not the rows of a trace')
      const { slice } = setup.lengths
      expect(slice.kind).toBe('synthetic')
      expect(slice.requests).toHaveLength(rowsOf(c).length)
      const span = (slice.requests[slice.requests.length - 1].t - slice.requests[0].t) * 1000
      expect(Math.abs((slice.requests.length * 1_000_000_000) / span - claim.ratePerSMilli) / claim.ratePerSMilli).toBeLessThan(0.01)
      // Its timestamps have a burst: the busiest two seconds are well past the capacity, and the mean is well under it.
      const replay = replayWorkload(c.scene.runSeed, { slice, speedPermille: 1000 })
      const due = replay.reqs.map((r) => r.dueUs)
      let busiest = 0
      for (let i = 0, j = 0; i < due.length; i++) {
        while (due[i] - due[j] > 2_000_000) j++
        busiest = Math.max(busiest, i - j + 1)
      }
      expect((busiest * 1_000_000_000) / 2_000_000, `${c.seed}`).toBeGreaterThan(1.2 * c.scene.capacityPerSMilli)
      expect(claim.ratePerSMilli).toBeLessThan(c.scene.capacityPerSMilli)
    }
  })

  it('none: the control is an open loop that keeps its schedule, with nothing done to it, and its claim is its corrected p99', () => {
    for (const c of casesOf('none')) {
      const { setup, server, claim } = c.scene
      expect(setup.arrivals.kind, `${c.seed}`).toBe('poisson')
      expect([setup.outputCap, setup.prefixWarm, setup.clientCostUs]).toEqual([undefined, undefined, undefined])
      expect([server.stalls, server.cold]).toEqual([undefined, undefined])
      expect(arrivalAdherence(rowsOf(c)).ok).toBe(true)
      expect(benchSettled(fromDue(c))).toBe(true)
      expect(claim.valueUs).toBe(c.answer.p99Us)
      expect(claim.n).toBe(measured(c).length)
      expect(c.claimIds).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 3

describe('the corrected answer recomputes from the scene (acceptance check 3)', () => {
  it('from the scene alone, round-tripped through canonical JSON, the corrected p99 of every case is the stored one', () => {
    for (const c of allCases()) {
      const scene = JSON.parse(canonicalJson(c.scene)) as BrokenCase['scene']
      const again = correctBench(scene, c.flaw)
      expect(again.p99Us, `${c.seed} ${c.flaw}`).toBe(c.answer.p99Us)
      expect(again.n).toBe(c.answer.n)
      expect(again.how).toBe(c.answer.how)
    }
  })

  it('is a rule, not a stored number: a scene whose log is changed corrects to a different number', () => {
    const c = casesOf('coordinated-omission')[0]
    const rows = c.scene.rows.map((r, i) => (i === c.scene.rows.length - 1 ? { ...r, firstUs: r.firstUs + 10_000_000, doneUs: r.doneUs + 10_000_000 } : r))
    const changed = { ...c.scene, rows }
    expect(correctBench(changed, c.flaw).p99Us).not.toBe(c.answer.p99Us)
  })

  it('the kind of correction is the flaw\'s: from the rows, with the cut, or by re-running the benchmark', () => {
    const kind: Record<BenchFlaw, string> = {
      none: 'rows',
      'mean-as-tail': 'rows',
      'coordinated-omission': 'rows',
      'client-queue-hidden': 'rows',
      'warm-up-counted': 'cut',
      'closed-loop': 'rerun',
      'capped-output': 'rerun',
      'warm-cache': 'rerun',
      'client-bottleneck': 'rerun',
      'too-few-samples': 'rerun',
      'replay-without-timestamps': 'rerun',
    }
    for (const c of allCases()) expect(c.answer.how, c.flaw).toBe(kind[c.flaw])
  })

  it('the rules that read the rows are the course\'s, restated: from the due time (B5), nearest rank (B6), and for the cut the first 128 rows (B8)', () => {
    for (const flaw of ['none', 'mean-as-tail', 'coordinated-omission', 'client-queue-hidden'] as const) {
      for (const c of casesOf(flaw)) {
        const sample = c.scene.rows.filter((r) => r.dueUs >= c.scene.setup.warmupUs).map((r) => r.firstUs - r.dueUs)
        expect(nearestRankOf(sample, 990), `${c.seed} ${flaw}`).toBe(c.answer.p99Us)
      }
    }
    for (const c of casesOf('warm-up-counted')) {
      const after = c.scene.rows.slice(128).map((r) => r.firstUs - r.dueUs)
      expect(nearestRankOf(after, 990), `${c.seed}`).toBe(c.answer.p99Us)
      expect(BENCH_WARMUP_ROWS).toBe(Math.max(100, 2 * c.scene.server.maxNumSeqs))
    }
  })

  it('the rules that re-run are the course\'s, restated: Poisson at the claimed rate, no cap, a cold cache, a client that keeps up, 1,500 rows, the trace\'s own timestamps', () => {
    const p99 = (run: ReturnType<typeof runBench>, warmupUs: number) => nearestRankOf(run.rows.filter((r) => r.dueUs >= warmupUs).map((r) => r.firstUs - r.dueUs), 990)
    for (const c of casesOf('closed-loop')) {
      const { setup, claim, runSeed, server } = c.scene
      // The same requests, offered as a Poisson process at the rate of the claim; the warm-up is the first 128 rows by due time.
      const spec = { ...setup, arrivals: { kind: 'poisson', ratePerSMilli: claim.ratePerSMilli } as const }
      const probe = runBench(runSeed, { ...spec, warmupUs: 0 }, server)
      const warmupUs = probe.rows[128].dueUs
      expect(p99(runBench(runSeed, { ...spec, warmupUs, durationUs: probe.rows[probe.rows.length - 1].dueUs + 1 }, server), warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
    }
    for (const c of casesOf('capped-output')) {
      const open = omit(c.scene.setup, 'outputCap')
      expect(p99(runBench(c.scene.runSeed, open, c.scene.server), open.warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
    }
    for (const c of casesOf('warm-cache')) {
      const cold = omit(c.scene.setup, 'prefixWarm')
      expect(p99(runBench(c.scene.runSeed, cold, c.scene.server), cold.warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
    }
    for (const c of casesOf('client-bottleneck')) {
      const fast = omit(c.scene.setup, 'clientCostUs')
      expect(p99(runBench(c.scene.runSeed, fast, c.scene.server), fast.warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
    }
    for (const c of casesOf('too-few-samples')) {
      const { setup, runSeed, server } = c.scene
      const spec = { ...setup, requests: 128 + 1500, durationUs: 1_000_000_000_000 }
      const probe = runBench(runSeed, spec, server)
      const warmupUs = probe.rows[128].dueUs
      expect(p99(probe, warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
      expect(probe.rows.filter((r) => r.dueUs >= warmupUs)).toHaveLength(1500)
    }
    for (const c of casesOf('replay-without-timestamps')) {
      const { setup, runSeed, server } = c.scene
      if (setup.lengths === undefined || setup.lengths.kind !== 'rows') throw new Error('no trace')
      const { slice } = setup.lengths
      const replay = replayWorkload(runSeed, { slice, speedPermille: 1000 })
      const due = replay.reqs.map((r) => r.dueUs)
      const warmupUs = due[128]
      const spec = { arrivals: { kind: 'replay', slice, speedPermille: 1000 } as const, requests: slice.requests.length, warmupUs, durationUs: due[due.length - 1] + 1, slo: setup.slo }
      expect(p99(runBench(runSeed, spec, server), warmupUs), `${c.seed}`).toBe(c.answer.p99Us)
    }
  })

  it('is total: every flaw a learner could name corrects every kind of case, to the log\'s own p99 where it does not apply', () => {
    for (const flaw of ALL) {
      const c = casesOf(flaw, 1)[0]
      for (const named of ALL) {
        const r = correctBench(c.scene, named)
        expect(Number.isSafeInteger(r.p99Us) && r.p99Us > 0, `${flaw} read as ${named}`).toBe(true)
        expect(r.n).toBeGreaterThan(0)
      }
    }
    // A flaw the setup does not have is not removed from it: a replay correction of a scene with no trace is the log as it stands.
    const c = casesOf('closed-loop', 1)[0]
    expect(correctBench(c.scene, 'replay-without-timestamps').p99Us).toBe(correctBench(c.scene, 'none').p99Us)
  })

  it('a flaw that is not the case\'s corrects to something else: a warm-cache case read as a mean-as-tail one gives its claim', () => {
    const c = casesOf('warm-cache')[0]
    expect(correctBench(c.scene, 'mean-as-tail').p99Us).toBe(c.scene.claim.valueUs)
    expect(correctBench(c.scene, c.flaw).p99Us).not.toBe(c.scene.claim.valueUs)
  })

  it('the interval on the corrected p99 is a seeded 95% bootstrap with B = 1,000: the same every time, around the point, and wider for fewer rows', () => {
    const wide = casesOf('too-few-samples')[0]
    const tight = casesOf('none')[0]
    for (const c of [wide, tight]) {
      const a = correctedInterval(c.scene, c.flaw)
      expect(correctedInterval(c.scene, c.flaw)).toEqual(a)
      expect(a.resamples).toBe(1000)
      expect(a.levelPermille).toBe(950)
      expect(a.pointUs).toBe(c.answer.p99Us)
      expect(a.loUs).toBeLessThanOrEqual(a.pointUs)
      expect(a.hiUs).toBeGreaterThanOrEqual(a.pointUs)
    }
    const width = (c: BrokenCase) => {
      const i = correctedInterval(c.scene, c.flaw)
      return (i.hiUs - i.loUs) / i.pointUs
    }
    // A control's interval rests on a thousand rows and is tight; a too-few-samples case's corrected one rests on 1,500 and the claim's own 60 to 120 would not be.
    expect(width(tight)).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 2

describe('the answer is drawn first, and the flaw\'s label does not name it (acceptance check 2)', () => {
  const grids: Record<BenchFlaw, readonly (readonly number[])[]> = {
    'closed-loop': [OVERLOAD_GRID],
    'coordinated-omission': [STALL_GRID],
    'client-queue-hidden': [OVERLOAD_GRID],
    'warm-up-counted': [LIGHT_GRID],
    'warm-cache': [OVERLOAD_GRID, LIGHT_GRID],
    'capped-output': [OVERLOAD_GRID],
    'too-few-samples': [OVERLOAD_GRID, MIX_GRID],
    'mean-as-tail': [OVERLOAD_GRID, MIX_GRID],
    'client-bottleneck': [OVERLOAD_GRID],
    'replay-without-timestamps': [BURST_GRID],
    none: [LIGHT_GRID, MIX_GRID],
  }

  it('the target of every case is an entry of its flaw\'s grid, which does not depend on the scene', () => {
    for (const c of allCases()) expect(grids[c.flaw].some((g) => g.includes(c.answer.targetUs)), `${c.seed} ${c.flaw}: ${c.answer.targetUs}`).toBe(true)
  })

  it('the target comes from the seed alone: the same seed asked for by name gives the same case, and another seed another target', () => {
    const [a, b] = casesOf('closed-loop', 2)
    expect(canonicalJson(brokenBenchCase(a.seed, { flaw: 'closed-loop' }))).toBe(canonicalJson(a))
    expect(a.answer.targetUs).not.toBe(b.answer.targetUs)
  })

  it('the scene lands near the answer that was drawn: the median of corrected over target is within 10% of 1, and 80% of cases are within 0.6 and 1.6 of it', () => {
    const smear: number[] = []
    for (const flaw of ALL) {
      const cases = casesOf(flaw)
      const r = cases.map((c) => c.answer.p99Us / c.answer.targetUs).sort((a, b) => a - b)
      say(`  ${flaw.padEnd(26)} corrected over drawn, p10 / median / p90: ${r[Math.floor(r.length * 0.1)].toFixed(2)} / ${r[Math.floor(r.length / 2)].toFixed(2)} / ${r[Math.floor(r.length * 0.9)].toFixed(2)}`)
      smear.push(...r)
    }
    smear.sort((a, b) => a - b)
    const within = smear.filter((x) => x >= 0.6 && x <= 1.6).length / smear.length
    say(`  all flaws: median ${smear[Math.floor(smear.length / 2)].toFixed(3)}, ${pct(Math.round(within * smear.length), smear.length)} within 0.6 to 1.6 of the drawn answer`)
    expect(Math.abs(smear[Math.floor(smear.length / 2)] - 1)).toBeLessThan(0.1)
    expect(within).toBeGreaterThanOrEqual(0.8)
  })

  it('the best constant per flaw label passes under 15% of the cases, chosen on half the cases and judged on the other', () => {
    const cases = Array.from({ length: BLIND_SEEDS }, (_, seed) => caseOf(seed)).map((c) => ({ flaw: c.flaw, p99Us: c.answer.p99Us }))
    // Judge on odd positions the constant chosen on even ones. Within one flaw the cases are in seed order, which is not an order of the answer.
    const train = cases.filter((_, i) => i % 2 === 0)
    const test = cases.filter((_, i) => i % 2 === 1)
    let passed = 0
    for (const flaw of ALL) {
      const mine = train.filter((c) => c.flaw === flaw).map((c) => c.p99Us)
      // The constant that passes the most training cases: the best of the training answers, and of 1.15 times each (the constant a window starts at).
      let best = mine[0]
      let bestCount = -1
      for (const candidate of mine) {
        const count = mine.filter((x) => Math.abs(candidate - x) * 1000 <= 150 * x).length
        if (count > bestCount) {
          bestCount = count
          best = candidate
        }
      }
      passed += test.filter((c) => c.flaw === flaw && Math.abs(best - c.p99Us) * 1000 <= 150 * c.p99Us).length
    }
    const split = passed / test.length
    const all = bestConstantPerLabel(cases)
    say(`  best constant per label, ±15% of the corrected p99, over ${cases.length} cases: chosen on half and judged on the other half ${(100 * split).toFixed(1)}%; chosen on the cases it is judged on ${(all.passedPermille / 10).toFixed(1)}% (an upper bound)`)
    say(`    in-sample, by flaw: ${all.perFlaw.map((f) => `${f.flaw} ${(f.passedPermille / 10).toFixed(0)}% of ${f.cases}`).join(', ')}`)
    expect(split).toBeLessThan(0.15)
    // 15% is the share of one fresh seed; three in a row is 0.34% [derived: 0.15 cubed].
    expect(0.15 * 0.15 * 0.15).toBeLessThan(0.0035)
  })

  it(`at the nightly size, the best constant chosen on the cases it is judged on passes under 15% too (${NIGHTLY_SEEDS} cases, 1,000 of each flaw)`, () => {
    if (BLIND_SEEDS < NIGHTLY_SEEDS) {
      say(`  (the in-sample bound is judged at ES_PROPERTY_SEEDS=${NIGHTLY_SEEDS}, not at ${BLIND_SEEDS}: with 100 cases of a flaw the best of its windows is chosen on too few to be a bound)`)
      return
    }
    const all = bestConstantPerLabel(Array.from({ length: BLIND_SEEDS }, (_, seed) => caseOf(seed)).map((c) => ({ flaw: c.flaw, p99Us: c.answer.p99Us })))
    expect(all.passedPermille).toBeLessThan(150)
  })

  it('a scene-blind answer to the flaw alone passes about 1 case in 11: always saying the same flaw is right on a case with that flaw, and nothing else', () => {
    const cases = Array.from({ length: BLIND_SEEDS }, (_, seed) => caseOf(seed))
    for (const flaw of ALL) {
      const right = cases.filter((c) => c.flaw === flaw).length / cases.length
      expect(right, flaw).toBeLessThan(1 / 11 + 0.03)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Determinism

describe('determinism', () => {
  it('a case is a function of its seed: made twice, in either order, it is the same bytes', () => {
    const seeds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 33, 1234567]
    const first = seeds.map((s) => canonicalJson(brokenBenchCase(s)))
    const second = [...seeds].reverse().map((s) => canonicalJson(brokenBenchCase(s))).reverse()
    expect(second).toEqual(first)
  })

  it('different seeds of one flaw give different scenes', () => {
    for (const flaw of ['closed-loop', 'none', 'replay-without-timestamps'] as const) {
      const [a, b] = casesOf(flaw, 2)
      expect(canonicalJson(a.scene)).not.toBe(canonicalJson(b.scene))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The claims a debrief cites

describe('the claims that ground the flaws (content/claims/broken-bench.yaml)', () => {
  const result = compileContent({ root })
  const claims = new Map(result.claims.map((r) => [r.claim.id, r.claim]))
  const fileClaims = result.claims.filter((r) => r.file.endsWith('broken-bench.yaml')).map((r) => r.claim)

  it('every flaw but the control cites at least two, each of them in the claims file', () => {
    for (const flaw of ALL) {
      if (flaw === 'none') expect(FLAW_CLAIMS[flaw]).toEqual([])
      else expect(FLAW_CLAIMS[flaw].length, flaw).toBeGreaterThanOrEqual(2)
      for (const id of FLAW_CLAIMS[flaw]) expect(claims.has(id), `${flaw}: ${id}`).toBe(true)
    }
    expect(casesOf('closed-loop', 1)[0].claimIds).toEqual(FLAW_CLAIMS['closed-loop'])
  })

  it('the claims file holds those and no others, each named for its flaw', () => {
    const cited = new Set(ALL.flatMap((flaw) => FLAW_CLAIMS[flaw]))
    expect(new Set(fileClaims.map((c) => c.id))).toEqual(cited)
    for (const flaw of ALL) for (const id of FLAW_CLAIMS[flaw]) expect(id.startsWith(`broken-bench.${flaw}.`), id).toBe(true)
  })

  it('each is sourced: a URL, the source\'s words, the day they were read, a TTL, and a pin for a tool\'s version', () => {
    for (const claim of fileClaims) {
      if (claim.tag === 'derived') {
        expect(claim.derived?.inputs.length).toBeGreaterThanOrEqual(1)
        continue
      }
      expect(claim.source, claim.id).toBeDefined()
      expect(claim.source!.url.startsWith('https://')).toBe(true)
      expect(claim.source!.quote.length).toBeGreaterThan(10)
      expect(claim.source!.accessed).toBe('2026-11-04')
      expect(claim.verifiedAt).toBe('2026-11-04')
      expect(claim.ttlDays).toBeGreaterThan(0)
      if (claim.source!.url.includes('/vllm-project/vllm/')) expect(claim.pin, claim.id).toBe('vllm')
      if (claim.source!.url.includes('/sgl-project/sglang/')) expect(claim.pin, claim.id).toBe('sglang')
      // A tool's file is cited at a tag or a commit, never at a branch.
      expect(claim.source!.url.includes('/blob/main/') || claim.source!.url.includes('/blob/master/'), claim.id).toBe(false)
    }
  })

  it('the numbers the vendor reports and this course has not reproduced are marked unverified', () => {
    expect(claims.get('broken-bench.client-bottleneck.sglang-bench-2500-requests')?.tag).toBe('unverified')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The smaller pieces

describe('bestConstantPerLabel', () => {
  it('finds the window of answers within ±15% of one constant, per flaw', () => {
    // 100, 110, 130 fit one constant (k = 115: 100 is 15% under k and 130 is 13% over... |115 − 130| = 15 ≤ 19.5), 200 and 400 do not.
    const cases = [100, 110, 130, 200, 400].map((p99Us) => ({ flaw: 'closed-loop' as const, p99Us }))
    const r = bestConstantPerLabel(cases)
    expect(r.passedPermille).toBe(600)
    expect(r.perFlaw.find((f) => f.flaw === 'closed-loop')).toEqual({ flaw: 'closed-loop', cases: 5, passedPermille: 600 })
  })

  it('judges each flaw on its own: the constants do not carry over from one flaw to another', () => {
    const cases = [
      ...[100, 101, 102].map((p99Us) => ({ flaw: 'none' as const, p99Us })),
      ...[100, 300, 900].map((p99Us) => ({ flaw: 'closed-loop' as const, p99Us })),
    ]
    expect(bestConstantPerLabel(cases).passedPermille).toBe(Math.round((4 * 1000) / 6))
  })

  it('the edge of the window passes and a hair beyond does not', () => {
    // k passes t when |k − t| ≤ 0.15 t: for t = 85 and 115, k = 100 passes both (15 and 15) but not t = 85 and 116.
    expect(bestConstantPerLabel([85, 115].map((p99Us) => ({ flaw: 'none' as const, p99Us }))).passedPermille).toBe(1000)
    expect(bestConstantPerLabel([85, 118].map((p99Us) => ({ flaw: 'none' as const, p99Us }))).passedPermille).toBe(500)
  })

  it('is 0 for no cases, and 1,000 for one', () => {
    expect(bestConstantPerLabel([]).passedPermille).toBe(0)
    expect(bestConstantPerLabel([{ flaw: 'none', p99Us: 7 }]).passedPermille).toBe(1000)
  })
})

describe('the band, by mutation: a case that is broken in one way fails for that reason', () => {
  const base = (flaw: BenchFlaw) => casesOf(flaw, 1)[0]
  const reasons = (c: Pick<BrokenCase, 'flaw' | 'scene' | 'answer'>) => brokenBand(c).reasons.join(' | ')

  it('a flaw that moves the number less than 1.5 times is out of band', () => {
    const c = base('closed-loop')
    const near = { ...c, scene: { ...c.scene, claim: { ...c.scene.claim, valueUs: Math.round(c.answer.p99Us / 1.2) } } }
    expect(reasons(near)).toContain('the flaw moves the number by 1.20 times')
  })

  it('a control whose claim is not its corrected p99 is out of band', () => {
    const c = base('none')
    expect(reasons({ ...c, scene: { ...c.scene, claim: { ...c.scene.claim, valueUs: c.scene.claim.valueUs + 1 } } })).toContain('is not its corrected p99')
  })

  it('a corrected p99 on fewer than 1,000 rows, and a too-few-samples claim on more than 200, are out of band', () => {
    expect(reasons({ ...base('none'), answer: { ...base('none').answer, n: 999 } })).toContain('rests on 999 rows')
    const c = base('too-few-samples')
    const many = { ...c, scene: { ...c.scene, claim: { ...c.scene.claim, n: 201 } } }
    expect(reasons(many)).toContain('rests on 40 to 200 rows, not 201')
  })

  it('a coordinated-omission or client-queue case whose sends keep their schedule, and a client-bottleneck one, are out of band', () => {
    for (const flaw of ['coordinated-omission', 'client-queue-hidden', 'client-bottleneck'] as const) {
      const c = base(flaw)
      const onTime = { ...c, scene: { ...c.scene, rows: c.scene.rows.map((r) => ({ ...r, sentUs: r.dueUs })) } }
      expect(reasons(onTime), flaw).toMatch(/do not slip|keeps up/)
    }
  })

  it('a log that is still warming after the cut is out of band: B8\'s median test', () => {
    const steady = Array.from({ length: 18 }, () => 100)
    expect(benchSettled([100, 100, ...steady])).toBe(true)
    // The first tenth is two rows of twenty. Its median is the smaller of the two (nearest rank), so both must be slow to move it.
    expect(benchSettled([200, 100, ...steady])).toBe(true)
    expect(benchSettled([200, 200, ...steady])).toBe(false)
    // More than 1.25 times the rest's median fails, and exactly 1.25 times passes.
    expect(benchSettled([125, 125, ...steady])).toBe(true)
    expect(benchSettled([126, 126, ...steady])).toBe(false)
    expect(benchSettled([1, 2, 3])).toBe(true)
  })

  it('a row out of order is out of band', () => {
    const c = base('none')
    const rows = c.scene.rows.map((r, i) => (i === 3 ? { ...r, firstUs: r.sentUs - 1 } : r))
    expect(reasons({ ...c, scene: { ...c.scene, rows } })).toContain('is not in order')
  })
})

describe('what a case carries', () => {
  it('the claim is a TTFT p99 in µs from the rows the harness measured, and the rate it is about is the one production offers', () => {
    for (const c of allCases()) {
      const { claim } = c.scene
      expect(claim.metric).toBe('ttft-p99')
      expect(Number.isSafeInteger(claim.valueUs)).toBe(true)
      expect(Number.isSafeInteger(claim.ratePerSMilli)).toBe(true)
      expect(claim.ratePerSMilli).toBeGreaterThan(0)
      expect(['send', 'due']).toContain(claim.timerStartsAt)
      expect(c.scene.rows.filter((r) => r.dueUs >= c.scene.setup.warmupUs)).toHaveLength(claim.n)
    }
  })

  it('the controls and the open loops send on time, and the three flaws of the client do not', () => {
    const late = (c: BrokenCase) => arrivalAdherence(c.scene.rows).lateRows
    for (const flaw of ['none', 'warm-cache', 'warm-up-counted', 'capped-output', 'too-few-samples', 'mean-as-tail', 'replay-without-timestamps'] as const) {
      for (const c of casesOf(flaw, 3)) expect(late(c), `${flaw} ${c.seed}`).toBe(0)
    }
    for (const flaw of ['coordinated-omission', 'client-queue-hidden', 'client-bottleneck'] as const) {
      for (const c of casesOf(flaw, 3)) expect(late(c), `${flaw} ${c.seed}`).toBeGreaterThan(0)
    }
  })

  it('the seed of the benchmark is the case\'s seed unless the band asked for another, and the run is reproducible from it', () => {
    for (const c of allCases()) {
      if (c.attempts === 1) expect(c.scene.runSeed).toBe(c.seed)
      else expect(c.scene.runSeed).not.toBe(c.seed)
    }
    expect(SEED_COUNT).toBeGreaterThanOrEqual(200)
  })
})
