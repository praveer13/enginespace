// The broken-benchmark corpus (ARCHITECTURE §5.6; GAMES §11): `brokenBenchCase(seed)` draws a published benchmark claim that is wrong
// because of one flaw, or sound (the control), with the harness and the client log behind it.
//
// How a case is drawn (kernelspace's D39 rule, in `bbCase`):
//   - The seed draws the flaw (`brokenFlawOf`: seed mod 11, so any 11 consecutive seeds hold each flaw once and a graded seed, which is
//     uniform, draws each with probability 1/11), and then the ANSWER, the corrected p99 the scene will give, from a grid that does not
//     depend on the flaw's mechanism (broken-kits.ts). The scene is built to reach it. The flaw's label therefore says how to correct
//     the number and never which number it is, and the best constant per label passes few rounds (tests/sim/bench-broken.test.ts prints
//     the rate against ASSESSMENT §4.1's bound of 15%).
//   - The benchmark's own randomness (its arrivals and lengths) can be drawn again, under another `runSeed`, when the scene does not
//     keep the band. The answer is never redrawn.
//   - The band (`brokenBand`) is what makes a seed a fair question: the corrected p99 rests on at least 1,000 requests (ASSESSMENT B7),
//     the flaw moves the number by 1.5 times or more, the log shows the flaw's signature, and the control's claim is the right number.
//
// What "corrected" means is in `correctBench`, and it takes the scene and a flaw's name, nothing else: the corrected number of a case is
// recomputed from what the learner can see, by the rule of the flaw. Three kinds: from the log's own rows (re-time them from their due
// times, B5), from the rows without the course's warm-up (the first 128 by due time, B8), or by re-running the benchmark with the flaw
// taken out of its setup. The debrief shows that arithmetic.

import { assertSeed, rngFor } from '../core/rng'
import { divRound } from '../core/int'
import { percentile } from '../core/stats'
import type { Seed, Us } from '../core/types'
import { BROKEN_CORRECTED_ROWS, KITS, measuredOf } from './broken-kits'
import { BENCH_MIN_ROWS_FOR_P99, BENCH_WARMUP_ROWS, poissonAt, benchWarmupRows, windowed } from './broken-model'
import { BENCH_FLAWS, BROKEN_MAX_ATTEMPTS, BROKEN_MIN_RATIO_MILLI } from './broken-types'
import type { BenchFlaw, BrokenBand, BrokenCase, BrokenScene, BrokenCorrection, CorrectionKind } from './broken-types'
import { runBench } from './run'
import { arrivalAdherence, bootstrapInterval, checkRows, ttftUs } from './stats'
import type { BootstrapInterval } from './types'
import type { BenchRow, BenchSpec } from './types'

export { BENCH_FLAWS, BROKEN_MAX_ATTEMPTS, BROKEN_MIN_RATIO_MILLI } from './broken-types'
export type { BenchClaim, BenchFlaw, BrokenAnswer, BrokenBand, BrokenCase, BrokenScene, BrokenCorrection, CorrectionKind } from './broken-types'
export { BENCH_MIN_ROWS_FOR_P99, BENCH_WARMUP_ROWS, benchWarmupRows } from './broken-model'
export { BROKEN_CORRECTED_ROWS } from './broken-kits'

/**
 * The claims that ground each flaw in a real tool or paper (content/claims/vllm/bench.yaml and sglang/bench.yaml, W1-T01, and
 * content/claims/broken-bench.yaml, read 2026-11-04): what a debrief cites. The control has none. A flaw that no tool commits says what
 * it is grounded in instead, in the claim's text: `mean-as-tail` in the tool's report layout, and `too-few-samples` in the guide's own
 * ten-prompt example and kernelspace's rule.
 */
export const FLAW_CLAIMS: Readonly<Record<BenchFlaw, readonly string[]>> = {
  'closed-loop': ['vllm.bench.request-rate-default', 'vllm.bench.max-concurrency-closed-loop', 'vllm.bench.max-concurrency-recommended', 'bench.schroeder.closed-vs-open'],
  'coordinated-omission': ['bench.wrk2.from-should-have', 'bench.wrk2.stall-corrected-p99', 'bench.wrk2.stall-uncorrected-p99', 'bench.wrk2.stall-ratio'],
  'client-queue-hidden': ['vllm.bench.client-queue-time', 'vllm.bench.e2el-including-client-queue', 'sglang.bench.max-concurrency-semaphore', 'sglang.bench.timer-inside-request'],
  'warm-up-counted': ['vllm.bench.num-warmups-default', 'sglang.bench.warmup-default', 'bench.kernelspace.warm-up-rule'],
  'warm-cache': ['vllm.bench.prefix-cache-reuse', 'sglang.bench.flush-cache-after-warmup'],
  'capped-output': ['vllm.bench.max-tokens-is-output-len', 'vllm.bench.sharegpt-output-len'],
  'too-few-samples': ['vllm.bench.guide-ten-prompts', 'bench.kernelspace.samples-rule'],
  'mean-as-tail': ['vllm.bench.metric-percentiles-default', 'vllm.bench.guide-mean-median-p99'],
  'client-bottleneck': ['sglang.bench.rust-client-sets-throughput', 'sglang.bench.rust-client-2500-requests'],
  'replay-without-timestamps': ['vllm.bench.self-timed-default', 'vllm.bench.burstgpt-lengths-only'],
  none: [],
}

/** The flaw a seed draws: `BENCH_FLAWS[seed mod 11]`. A uniform 32-bit seed draws each with probability 1/11 to within 3 × 10⁻⁹ [derived: 2³² mod 11 = 4]. */
export function brokenFlawOf(seed: Seed): BenchFlaw {
  assertSeed(seed)
  return BENCH_FLAWS[seed % BENCH_FLAWS.length]
}

// ---------------------------------------------------------------------------------------------------------------------------
// Correcting a benchmark

/** The rows of a corrected benchmark's sample and its p99 (nearest rank, B6). */
function summarizeRows(how: CorrectionKind, rows: readonly BenchRow[]): BrokenCorrection {
  if (rows.length === 0) throw new RangeError('a corrected benchmark with no rows has no p99')
  const ttftUsList = rows.map((r) => ttftUs(r, 'due'))
  return { how, p99Us: percentile(ttftUsList, 990), n: rows.length, ttftUs: ttftUsList }
}

type OptionalSpecKey = 'outputCap' | 'prefixWarm' | 'clientCostUs' | 'lengths'

/** A spec with one optional field taken out. */
function without(spec: BenchSpec, key: OptionalSpecKey): BenchSpec {
  const copy: Partial<BenchSpec> = { ...spec }
  delete copy[key]
  return copy as BenchSpec
}

/**
 * The corrected benchmark of a scene under a flaw's name, which is the rule that flaw's debrief teaches. It reads the scene and nothing
 * else, so it is also what the learner can do by hand, and the case's stored answer must equal it.
 *
 *   - `none`, `mean-as-tail`, `coordinated-omission`, `client-queue-hidden`: the measured rows of the log, timed from their due times
 *     (B5), at the p99 (B6). For the control that is the claim itself.
 *   - `warm-up-counted`: the same, with the first max(100, 2 × `max_num_seqs`) rows by due time left out instead of the warm-up the
 *     harness declared (none) (B8).
 *   - `closed-loop`: re-run with Poisson arrivals at the rate the claim is about, the same requests and the course's warm-up.
 *   - `capped-output`, `warm-cache`, `client-bottleneck`: re-run with no output cap, with a cold prefix cache, with a client that keeps up.
 *   - `too-few-samples`: re-run with enough requests that at least 10 lie beyond the p99 (B7): `BROKEN_CORRECTED_ROWS` after the warm-up.
 *   - `replay-without-timestamps`: re-run with the arrivals of the trace the lengths came from, at its own pace.
 *
 * It is total: a flaw that does not apply to the scene, as `replay-without-timestamps` does not to a scene with no trace, corrects nothing
 * and gives the log's own p99, so a session can ask what any flaw a learner names would have given.
 */
export function correctBench(scene: BrokenScene, flaw: BenchFlaw): BrokenCorrection {
  const { setup, server, runSeed } = scene
  const asLogged = (): BrokenCorrection => summarizeRows('rows', measuredOf(scene.rows, setup.warmupUs))
  /** Re-runs the benchmark with the flaw taken out of its setup, or gives the log as it stands when the setup has no such flaw to take out. */
  const rerun = (correct: () => BenchSpec): BrokenCorrection => {
    let spec: BenchSpec
    try {
      spec = correct()
    } catch (e) {
      if (e instanceof RangeError) return asLogged()
      throw e
    }
    const rows = measuredOf(runBench(runSeed, spec, server).rows, spec.warmupUs)
    return rows.length === 0 ? asLogged() : summarizeRows('rerun', rows)
  }
  switch (flaw) {
    case 'none':
    case 'mean-as-tail':
    case 'coordinated-omission':
    case 'client-queue-hidden':
      return asLogged()
    case 'warm-up-counted': {
      const after = scene.rows.slice(benchWarmupRows(server.maxNumSeqs))
      return after.length === 0 ? asLogged() : summarizeRows('cut', after)
    }
    case 'closed-loop':
      return rerun(() => windowed(runSeed, { ...setup, arrivals: poissonAt(scene.claim.ratePerSMilli) }))
    case 'capped-output':
      return rerun(() => without(setup, 'outputCap'))
    case 'warm-cache':
      return rerun(() => without(setup, 'prefixWarm'))
    case 'client-bottleneck':
      return rerun(() => without(setup, 'clientCostUs'))
    case 'too-few-samples':
      return rerun(() => windowed(runSeed, { ...setup, requests: BENCH_WARMUP_ROWS + BROKEN_CORRECTED_ROWS }))
    case 'replay-without-timestamps':
      return rerun(() => {
        const lengths = setup.lengths
        if (lengths === undefined || lengths.kind !== 'rows') throw new RangeError('a replay case takes its lengths from the trace')
        const { slice } = lengths
        return windowed(runSeed, { ...without(setup, 'lengths'), arrivals: { kind: 'replay', slice, speedPermille: 1000 }, requests: slice.requests.length })
      })
  }
}

/** The 95% bootstrap interval on the corrected p99 (B = 1,000 resamples, §5.6): the interval a learner's own is judged against. It is seeded by the run, so a case always has the same one. */
export function correctedInterval(scene: BrokenScene, flaw: BenchFlaw, resamples = 1000): BootstrapInterval {
  return bootstrapInterval(correctBench(scene, flaw).ttftUs, 990, { resamples, seed: scene.runSeed, stream: 'broken-bench' })
}

// ---------------------------------------------------------------------------------------------------------------------------
// The band

/**
 * B8's "still warming" test on a log: the median first-token latency of the first tenth of the rows is at most 1.25 times the median of
 * the rest [estimated]. A log that fails it was still warming when its measured window began.
 */
export function benchSettled(ttft: readonly Us[]): boolean {
  const tenth = Math.floor(ttft.length / 10)
  if (tenth === 0) return true
  return percentile(ttft.slice(0, tenth), 500) * 1000 <= 1250 * percentile(ttft.slice(tenth), 500)
}

/**
 * Whether a case is a fair question. It fails when: a row is out of order; the corrected p99 rests on under 1,000 rows (B7), or a
 * `too-few-samples` claim rests on over 200 or under 40; the flaw moves the number by less than 1.5 times, or the control's claim is not
 * the corrected number; or the log does not show the flaw: a coordinated-omission or client-queue case whose sends do not slip behind
 * their due times, a client-bottleneck case whose sends do not, a control or warm-up case still warming after the warm-up.
 */
export function brokenBand(c: Pick<BrokenCase, 'flaw' | 'scene' | 'answer'>): BrokenBand {
  const { flaw, scene, answer } = c
  const reasons: string[] = []
  try {
    checkRows(scene.rows)
  } catch (e) {
    reasons.push(e instanceof Error ? e.message : String(e))
  }
  if (answer.n < BENCH_MIN_ROWS_FOR_P99) reasons.push(`the corrected p99 rests on ${answer.n} rows, under ${BENCH_MIN_ROWS_FOR_P99} (B7)`)
  if (flaw === 'too-few-samples' && (scene.claim.n < 40 || scene.claim.n > 200)) reasons.push(`a too-few-samples claim rests on 40 to 200 rows, not ${scene.claim.n}`)

  const claim = scene.claim.valueUs
  const hi = Math.max(claim, answer.p99Us)
  const lo = Math.max(1, Math.min(claim, answer.p99Us))
  const ratioMilli = divRound(hi * 1000, lo)
  if (flaw === 'none') {
    if (claim !== answer.p99Us) reasons.push(`the control's claim (${claim} µs) is not its corrected p99 (${answer.p99Us} µs)`)
  } else if (ratioMilli < BROKEN_MIN_RATIO_MILLI) {
    reasons.push(`the flaw moves the number by ${(ratioMilli / 1000).toFixed(2)} times, under ${BROKEN_MIN_RATIO_MILLI / 1000}`)
  }

  const slips = arrivalAdherence(scene.rows)
  if ((flaw === 'coordinated-omission' || flaw === 'client-queue-hidden') && (slips.ok || slips.lateRows < 5)) {
    reasons.push(`the sends do not slip behind their due times (${slips.lateRows} late rows)`)
  }
  if (flaw === 'client-bottleneck' && slips.ok) reasons.push('the client keeps up with its schedule')
  if (flaw === 'none' && !slips.ok) reasons.push('the control\'s sends slip behind their due times')
  if (flaw === 'none' && !benchSettled(measuredOf(scene.rows, scene.setup.warmupUs).map((r) => ttftUs(r, 'due')))) reasons.push('the control is still warming after its warm-up (B8)')
  if (flaw === 'warm-up-counted' && !benchSettled(scene.rows.slice(benchWarmupRows(scene.server.maxNumSeqs)).map((r) => ttftUs(r, 'due')))) {
    reasons.push('the log is still warming after the course\'s cut (B8)')
  }
  return { ok: reasons.length === 0, reasons, ratioMilli }
}

// ---------------------------------------------------------------------------------------------------------------------------
// A case

/**
 * The case a seed draws. `opts.flaw` fixes the flaw instead of drawing it, for a level that teaches one (`due`, `warm`, `sure`).
 *
 * Draws are made until one keeps the band, up to `BROKEN_MAX_ATTEMPTS`; the first draw uses the seed itself as the benchmark's seed. If none
 * does, the nearest to the band is returned with `band.ok` false, and a session redraws from a new seed (GAMES §2.1's `drawInBand`).
 */
export function brokenBenchCase(seed: Seed, opts: { readonly flaw?: BenchFlaw } = {}): BrokenCase {
  assertSeed(seed)
  const flaw = opts.flaw ?? brokenFlawOf(seed)
  const drawn = KITS[flaw](rngFor(seed, `bench/broken/${flaw}`))
  let best: BrokenCase | null = null
  for (let attempt = 1; attempt <= BROKEN_MAX_ATTEMPTS; attempt++) {
    const runSeed = attempt === 1 ? seed : rngFor(seed, `bench/broken/attempt/${attempt}`)()
    const built = drawn.build(runSeed)
    const scene: BrokenScene = { runSeed, setup: built.setup, server: built.server, claim: built.claim, rows: built.run.rows, capacityPerSMilli: built.capacityPerSMilli }
    const corrected = correctBench(scene, flaw)
    const answer = { how: corrected.how, p99Us: corrected.p99Us, n: corrected.n, targetUs: drawn.targetUs }
    const band = brokenBand({ flaw, scene, answer })
    const made: BrokenCase = { seed, flaw, scene, answer, band, attempts: attempt, claimIds: FLAW_CLAIMS[flaw] }
    if (band.ok) return made
    if (best === null || made.band.reasons.length < best.band.reasons.length) best = made
  }
  if (best === null) throw new Error('internal: no attempt was made')
  return best
}

// ---------------------------------------------------------------------------------------------------------------------------
// Blind strategies

/**
 * The share of the cases that the best constant per flaw label passes, ×1,000: the scene-blind strategy of ASSESSMENT §4.1 that says,
 * for each flaw it is told, one number, and is right when that number is within `tolerancePermille` of the corrected p99 (GAMES §11:
 * ±15%). For each flaw it takes the constant that passes the most of that flaw's cases. The constants are chosen on the same cases they
 * are judged on, so the share is an upper bound on what a constant fixed in advance would get, and it falls toward the truth as the
 * cases grow in number. `perFlaw` lists each flaw's share of its own cases, in permille.
 */
export function bestConstantPerLabel(
  cases: readonly { readonly flaw: BenchFlaw; readonly p99Us: Us }[],
  tolerancePermille = 150,
): { readonly passedPermille: number; readonly perFlaw: readonly { readonly flaw: BenchFlaw; readonly cases: number; readonly passedPermille: number }[] } {
  let passed = 0
  const perFlaw = BENCH_FLAWS.map((flaw) => {
    const sorted = cases
      .filter((c) => c.flaw === flaw)
      .map((c) => c.p99Us)
      .sort((a, b) => a - b)
    // A constant k passes the truths t with |k − t| ≤ tol × t, which for k = t_i(1 + tol) is every t_j from t_i up to t_i (1 + tol)/(1 − tol).
    let most = 0
    let j = 0
    for (let i = 0; i < sorted.length; i++) {
      if (j < i) j = i
      while (j + 1 < sorted.length && sorted[j + 1] * (1000 - tolerancePermille) <= sorted[i] * (1000 + tolerancePermille)) j++
      if (j - i + 1 > most) most = j - i + 1
    }
    passed += most
    return { flaw, cases: sorted.length, passedPermille: sorted.length === 0 ? 0 : divRound(most * 1000, sorted.length) }
  })
  return { passedPermille: cases.length === 0 ? 0 : divRound(passed * 1000, cases.length), perFlaw }
}
