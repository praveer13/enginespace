/*
 * W1-T26 acceptance checks 1 and 2 (ARCHITECTURE §5.10, §8.3; ASSESSMENT §4.6): the error rates of the lab's chi-square check.
 *
 * The check is the lab's: two fresh seeds of 20,000 draws, each tested at α = 1e-4 against the target, and a sampler fails if either
 * rejects (packages/sim/spec/check.ts). A "trial" is one attempt: a seeded case and two seeds.
 *
 *   1. False fails. The exact sampler's trials fail at a rate of at most 5e-4 [estimated bound]: the nominal rate is
 *      1 − (1 − 1e-4)² ≈ 2e-4 [derived]. The trials are spread over the three bands (six tokens on a grid, a sparse target of sixteen,
 *      sixty-four tokens down to 1/65,536) and over chains of one and two drafts, so the pooling of small expected counts and the
 *      zero-weight tokens are both in them. The rate is judged on 200 trials on a PR and 10,000 nightly: `ES_PROPERTY_SEEDS=10000`.
 *   2. Detection. Each member of the bestiary is caught in at least 99% of the trials of its band at N = 20,000. Five of the six
 *      change the distribution by a visible amount, and the Verifier's band is theirs (the lossy one needs a flat target, which is
 *      what makes it differ at all). The sixth, the boundary-inclusive comparison, moves each affected token by 1/65,536, which no
 *      sample of 20,000 sees. What the statistic does see is the token it leaks past a target that rules it out, so its band is a sparse
 *      target, where the drafter proposes at least ten tokens that p excludes. The exhaustive look at the accept step (`acceptStepViolations`)
 *      catches it, and the p > q rule, on every trial of every band.
 *
 * The seeds are fixed, so a run is a deterministic function of the code: the rates are what these seeds give, and a change to the
 * sampler or the generators can move them. `ES_SPEC_REPORT=1` prints the lines below, and `ES_PROPERTY_SEEDS=10000` is the nightly size.
 *
 * Measured on 2026-11-04, Bun 1.3.14 on the dev host, with packages/sim/spec at git tree 4fd0e46 (the branch's commit 4d033ce, before its final
 * rebase onto wave-1, which left that folder as it was) [measured]:
 *   - 200 trials (a PR, 5 to 11 s): no false fail (0 of 67 on the Verifier's band, 0 of 67 sparse, 0 of 66 fine). The statistics' sum is within
 *     z = 0.95 of its expectation, and 2 of 400 are over the 1e-3 value where 0.4 are expected. Each member is rejected by the statistic
 *     in 200 of 200 trials of its band. The accept step is failed by the p > q rule and the boundary-inclusive comparison in 200 of 200
 *     and by no other member. On the Verifier's dense band the statistic rejects the boundary-inclusive comparison in 26 of 200 (13.00%).
 *   - 10,000 trials (nightly, 9 to 11 minutes under load): no false fail (0 of 3,334, 0 of 3,333, 0 of 3,333), z = 1.54, and 21 of 20,000 over the
 *     1e-3 value where 20 are expected. Rejected by the statistic in every trial of its band: the p > q rule, resampling from p,
 *     resampling from q, the off-by-one and the lossy rule. The boundary-inclusive comparison, 9,991 of 10,000 (99.91%) on sparse
 *     targets and 1,255 of 10,000 (12.55%) on the Verifier's dense band, and 10,000 of 10,000 by the accept step.
 *   - The same member at a small total (50 pairs each, on the Verifier's band's rules, 2 seeds of 20,000 draws): the statistic rejects it
 *     in 50 of 50 trials at a total of 64 and in 2 of 50 at 4,096, since its bias is 1 ÷ total per token [derived].
 *   - Trials 10,000 to 49,999, run by hand in the same way: 9 false fails (2, 2 and 5 by band), a rate of 2.25e-4 against a nominal
 *     2e-4 [derived] and a bound of 5e-4. `ES_PROPERTY_SEEDS=50000` runs trials 0 to 49,999.
 *   - The statistic's tail, independently of the sampler: 3,000,000 exact multinomial samples of each of five targets (Python's
 *     standard library, with this file's pooling) put it over the 1e-4 value 290 to 352 times where 300 are nominal.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { below, rngFor } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import {
  BESTIARY,
  EXACT_RULES,
  FINE_BAND,
  LAB_DRAWS,
  LAB_LEVEL,
  LAB_SEEDS,
  REFERENCE,
  SPARSE_BAND,
  SPEC_BAND,
  acceptStepViolations,
  chiSquare,
  criticalValue,
  draftChain,
  drawCase,
  flatPosition,
  labTest,
  overlapWeight,
  runChain,
} from '../../packages/sim/spec'
import type { Dist, Member, PairBand } from '../../packages/sim/spec'
import { SEED_COUNT } from '../seeds'
import { labSeeds } from './spec-support'

const TRIALS = SEED_COUNT
const REPORT = process.env['ES_SPEC_REPORT'] === '1'
const report: string[] = []
const say = (line: string) => report.push(line)
afterAll(() => {
  if (REPORT) console.log(['', `spec rates: ${TRIALS} trials per row, ${LAB_SEEDS} seeds of ${LAB_DRAWS} draws at ${LAB_LEVEL}`, ...report].join('\n'))
})

/** A test at the nightly size takes minutes, and Bun's own five seconds are for a pull request, so every test here sets its own timeout. */
const TIMEOUT_MS = 30 * 60_000

const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(2)}%`

// ---------------------------------------------------------------------------------------------------------------------------
// Check 1: the false-fail rate

describe('check 1: the exact sampler fails falsely at most 5e-4 of the time', () => {
  const BANDS: PairBand[] = [SPEC_BAND, SPARSE_BAND, FINE_BAND]

  test(`over ${TRIALS} trials of two seeds each (200 on a PR, 10,000 nightly)`, () => {
    let falseFails = 0
    let tests = 0
    let statSum = 0
    let dfSum = 0
    let over1e3 = 0
    const dfs = new Set<number>()
    const bandTrials = [0, 0, 0]
    const bandFails = [0, 0, 0]
    for (let trial = 0; trial < TRIALS; trial++) {
      const b = trial % 3
      const gamma = 1 + (Math.floor(trial / 3) % 2)
      const { p, q } = drawCase(trial, gamma, BANDS[b])
      const lab = labTest(labSeeds(trial), p, q, REFERENCE.verify)
      bandTrials[b]++
      if (lab.rejected) {
        falseFails++
        bandFails[b]++
      }
      for (const t of lab.tests) {
        tests++
        statSum += t.stat
        dfSum += t.df
        dfs.add(t.df)
        if (t.stat > criticalValue('1e-3', t.df)) over1e3++
      }
    }
    const rate = falseFails / TRIALS
    say(`check 1: the exact sampler: ${falseFails} false fails in ${TRIALS} trials (${pct(falseFails, TRIALS)}; the bound is 0.05%, the nominal rate 0.02%)`)
    say(`         by band: spec ${bandFails[0]}/${bandTrials[0]}, sparse ${bandFails[1]}/${bandTrials[1]}, fine ${bandFails[2]}/${bandTrials[2]}; ${dfs.size} distinct df, ${tests} seed tests`)
    // The tracker's bound: at most 5e-4, which is 0 failures in 200 trials and 5 in 10,000.
    expect(rate).toBeLessThanOrEqual(5e-4)

    // Every seed test ran (a trial that does not fail runs both), and the bands covered different degrees of freedom.
    expect(tests).toBeGreaterThanOrEqual(2 * TRIALS - falseFails)
    expect(dfs.size).toBeGreaterThanOrEqual(Math.min(6, TRIALS))

    // The statistic is calibrated, not merely quiet. Under exactness a chi-square of df has mean df and variance 2 df, so the sum of
    // the statistics over all seed tests is within 5 standard deviations of the sum of the df.
    const z = (statSum - dfSum) / Math.sqrt(2 * dfSum)
    say(`         the statistics' mean against their df: z = ${z.toFixed(2)}; ${over1e3} of ${tests} are over the 1e-3 value (${((tests * 1e-3).toFixed(1))} expected)`)
    expect(Math.abs(z)).toBeLessThan(5)
    // And its tail: the count over the 1e-3 critical value is Poisson with mean 1e-3 per seed test, so five standard deviations and a
    // little for the discrete count bound it from above; the lower side is only testable once the mean is large enough (nightly).
    const lambda = tests * 1e-3
    expect(over1e3).toBeLessThanOrEqual(Math.ceil(lambda + 5 * Math.sqrt(lambda) + 2))
    if (lambda >= 10) expect(over1e3).toBeGreaterThanOrEqual(Math.floor(lambda / 3))
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------------------------------------------------------
// Check 2: detection

interface Rate {
  /** Trials run. */
  n: number
  /** Trials in which the chi-square check (two seeds) rejected the member. */
  chi: number
  /** Trials in which the exhaustive accept-step check found a token with the wrong number of accepting coins. */
  accept: number
  /** Trials in which either did. */
  suite: number
}

/** Runs `member` through the lab's check on `trials` fair cases of `band` with chains of `gamma` drafts. */
function measure(member: Member, band: PairBand, gamma: number, base: number, fair: (p: readonly Dist[], q: readonly Dist[]) => boolean = () => true): Rate {
  const rate: Rate = { n: 0, chi: 0, accept: 0, suite: 0 }
  for (let i = 0; rate.n < TRIALS; i++) {
    const { p, q } = drawCase(base + i, gamma, band)
    if (!fair(p, q)) continue
    rate.n++
    const chi = labTest(labSeeds(base + i), p, q, member.verify).rejected
    const accept = acceptStepViolations(member.accept, p[0], q[0]).length > 0
    if (chi) rate.chi++
    if (accept) rate.accept++
    if (chi || accept) rate.suite++
  }
  return rate
}

const atLeast99 = (k: number, n: number) => k >= Math.ceil(0.99 * n)

describe('check 2: each bestiary member is caught at least 99% of the time at N = 20,000', () => {
  /**
   * Where each member differs from the exact sampler on every case of its band, and the band that shows it. A case on which a member does
   * not differ is a degenerate draw, which a band is there to reject (GAMES.md §10: "every bestiary rule differs on every band seed").
   * The p > q rule is exact when every token with p ≤ q has p = 0: it then accepts what p accepts, and nothing else (11 cases of the
   * first 10,000 of the Verifier's band, from seed 1,000,000 [measured 2026-11-04, spec tree 4fd0e46]). The lossy rule defers only at a flat position, so a case whose first
   * target is sharp is not a question for it.
   */
  const BAND_OF: Record<string, { band: PairBand; gamma: number; fair?: (p: readonly Dist[], q: readonly Dist[]) => boolean }> = {
    'accept-if-p-over-q': { band: SPEC_BAND, gamma: 1, fair: (p, q) => p[0].weights.some((w, i) => w > 0 && w <= q[0].weights[i]) },
    'resample-from-p': { band: SPEC_BAND, gamma: 1 },
    'resample-from-q': { band: SPEC_BAND, gamma: 1 },
    'residual-off-by-one': { band: SPEC_BAND, gamma: 1 },
    // The lossy rule needs a second draft to look at, so it runs on chains of two.
    'fly-lossy': { band: SPEC_BAND, gamma: 2, fair: (p) => flatPosition(p[0]) },
    // The comparison's bias is 1/65,536 per token. The sparse band is where the statistic sees it: through the tokens it lets past.
    'boundary-inclusive': { band: SPARSE_BAND, gamma: 1 },
  }

  for (const member of BESTIARY) {
    test(`${member.id}: ${member.label}`, () => {
      const { band, gamma, fair } = BAND_OF[member.id]
      const rate = measure(member, band, gamma, 1_000_000, fair)
      say(`check 2: ${member.id.padEnd(20)} chi-square ${pct(rate.chi, rate.n).padStart(7)} (${rate.chi}/${rate.n}), accept step ${pct(rate.accept, rate.n).padStart(7)}, either ${pct(rate.suite, rate.n).padStart(7)}`)
      expect(atLeast99(rate.chi, rate.n), `${member.id}: ${rate.chi} of ${rate.n}`).toBe(true)
      // The exhaustive look is a different check: only the two accept-step bugs show to it.
      const acceptBug = member.id === 'accept-if-p-over-q' || member.id === 'boundary-inclusive'
      expect(rate.accept).toBe(acceptBug ? rate.n : 0)
    }, TIMEOUT_MS)
  }

  test('on dense targets the statistic alone does not see the boundary-inclusive comparison, and the exhaustive look sees it every time', () => {
    const member = BESTIARY.find((m) => m.id === 'boundary-inclusive')!
    const rate = measure(member, SPEC_BAND, 1, 2_000_000)
    say(`check 2: boundary-inclusive on the spec band (dense targets): chi-square ${pct(rate.chi, rate.n)} (${rate.chi}/${rate.n}), accept step ${pct(rate.accept, rate.n)}`)
    // What the statistic sees is the odd zero-weight token that leaks, in a few trials of the many that have one.
    expect(rate.chi / rate.n).toBeLessThan(0.5)
    expect(rate.accept).toBe(rate.n)
    expect(atLeast99(rate.suite, rate.n)).toBe(true)
  }, TIMEOUT_MS)

  test('the statistic sees the same member when the total is small, because the bias is 1 ÷ total per token: every trial at 64, almost none at 4,096', () => {
    // The Verifier's exact levels use a grid of 1/64 (GAMES.md §10), a total of 64 in these units; the course's worlds use 2^16. A pair is
    // six tokens with α from 0.4 to 0.9 and two tokens each way, as in the Verifier's band, cut at random places, so some weights are 0.
    const cut = (rng: Rng, total: number): Dist => {
      const cuts = Array.from({ length: 5 }, () => below(rng, total + 1)).sort((a, b) => a - b)
      const weights: number[] = []
      let before = 0
      for (const c of [...cuts, total]) {
        weights.push(c - before)
        before = c
      }
      return { weights, total }
    }
    const member = BESTIARY.find((m) => m.id === 'boundary-inclusive')!
    const seen: Record<number, number> = {}
    const N = 50
    for (const total of [64, 4096]) {
      const rng = rngFor(total, 'test/spec/small-total')
      seen[total] = 0
      for (let n = 0; n < N; ) {
        const p = cut(rng, total)
        const q = cut(rng, total)
        const alpha = overlapWeight(p, q) / total
        if (alpha < 0.4 || alpha > 0.9) continue
        if (p.weights.filter((w, i) => w > q.weights[i]).length < 2 || q.weights.filter((w, i) => w > p.weights[i]).length < 2) continue
        n++
        if (labTest([rng(), rng()], [p, p], [q], member.verify).rejected) seen[total]++
      }
      say(`check 2: boundary-inclusive at a total of ${total}: chi-square ${pct(seen[total], N)} (${seen[total]}/${N})`)
    }
    expect(seen[64]).toBe(N)
    expect(seen[4096]).toBeLessThan(0.2 * N)
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------------------------------------------------------
// The chain, position by position

describe('the exact chain is exact at every position', () => {
  test('conditional on reaching a position, the token emitted there follows that position\'s target (12 cases of three drafts)', () => {
    for (let seed = 0; seed < 12; seed++) {
      const gamma = 3
      const { p, q } = drawCase(500 + seed, gamma)
      const drafts = rngFor(seed, 'test/spec/position-draft')
      const coins = rngFor(seed, 'test/spec/position-coin')
      const counts = Array.from({ length: gamma + 1 }, () => new Array<number>(p[0].weights.length).fill(0))
      for (let i = 0; i < LAB_DRAWS; i++) {
        const { tokens } = runChain(EXACT_RULES, p, q, draftChain(q, drafts), coins)
        tokens.forEach((token, position) => counts[position][token]++)
      }
      for (let position = 0; position <= gamma; position++) {
        const { stat, df } = chiSquare(counts[position], p[position])
        // Four tests per case at 1e-4 each; the position reached least often still has thousands of draws.
        expect(stat, `seed ${seed} position ${position} reached ${counts[position].reduce((a, b) => a + b, 0)} times`).toBeLessThanOrEqual(criticalValue('1e-4', df))
      }
    }
  }, TIMEOUT_MS)
})
