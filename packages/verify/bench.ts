/**
 * Rule 8 for a benchmark log (ARCHITECTURE §8.5 rule 8, ASSESSMENT §6.2): B1 to B10, B12 and B14, each recomputed from the log's own rows with
 * packages/sim/bench, the code that summarizes a simulated run. B13, the throughput ceiling, is a physics floor and is rule 9's (floors.ts).
 *
 *   B1   the ids, due times and prompt lengths are the ones the challenge's seed draws                (the stage's declared workload)
 *   B2   the counts add up, no id repeats, and every request completed                                  [v1: a failed or aborted request is not credited]
 *   B3   each request went through in order: due <= sent <= first token <= last token, with a token
 *   B4   arrival adherence: at least 99.9% of sends within 2 ms of their due time, and none past 20 ms  [estimated bounds]: closed loop fails here
 *   B5   latency is counted from the due time: a claim that is the figure counted from the send is named
 *   B6   the percentiles of the time to first token, the end-to-end time, and the claims about them
 *   B7   the bootstrap interval reproduces, from a seed drawn from the challenge, and the p99 rests on at least 1,000 measured rows
 *   B8   the warm-up is the declared one, and the run is not still warming
 *   B9   goodput under both denominators, and the rates
 *   B10  Little's law holds within 5% [estimated]
 *   B12  the time per output token
 *   B14  the server's start, or a prefix-cache reset, is recorded before the first request is due
 *
 * Units. The log is in ns, as ASSESSMENT writes it, and packages/sim/bench works in whole µs, which is plenty for a request that lasts milliseconds.
 * Each time is rounded to a whole µs, halves up, before it is summarized, and a rounding that keeps order cannot break it. Claims are in µs, as
 * `BenchSummary` writes them: `performance.claimed[<artifact id>]` is that object, from the grader's port of the same arithmetic. A claim is
 * compared key by key for the keys it has, and a key of the summary that it leaves out is not compared, since credit never depends on a number.
 */
import { ADHERENCE_HARD_LIMIT_US, ADHERENCE_TOLERANCE_US, arrivalAdherence } from '@es/sim/bench/stats'
import { planBench } from '@es/sim/bench/plan'
import type { BenchPlan } from '@es/sim/bench/plan'
import { summarizeRows } from '@es/sim/bench/summary'
import type { BenchRow, BenchSummary } from '@es/sim/bench/types'
import { divRound } from '@es/sim/core/int'
import { nearestRank, sortedAsc } from '@es/sim/core/stats'
import { claimOf, fail, firstDifference, firstDifferenceIn, isObject, memoized, na, pass, together } from './checks'
import type { Outcome, Run } from './checks'
import { BENCH_LOG_FORMAT, benchLogs, STATUS } from './evidence'
import type { BenchLog, Parsed } from './evidence'
import { cut, grouped, plural } from './format'
import { PROBLEM_CHARS } from './limits'
import type { CheckResult } from './report'

/** The most that Little's law may be off, in permille [estimated] (B10: within 5%). */
export const LITTLES_PERMILLE = 50
/** The share of rows in the first tenth of the measured window against the rest that still counts as warm, as a ratio of 5 to 4 [estimated] (B8). */
const WARM_NUM = 5
const WARM_DEN = 4
/** B8: the warm-up is the first W rows by due time, W = max(100, 2 × max_num_seqs) [estimated]. */
export const warmupRows = (maxNumSeqs: number): number => Math.max(100, 2 * maxNumSeqs)
/** The rows a p99 needs (B7): 1,000 measured, so that 10 lie beyond it [derived]. */
export const P99_ROWS = 1000
/** Resamples of the bootstrap (B7) [estimated]. */
const RESAMPLES = 1000

const us = (n: number): string => `${grouped(n)} µs`
const ms = (n: number): string => `${grouped(Math.round(n / 1000))} ms`
const bounded = (id: string, text: string, ok: boolean) => (ok ? pass(id, cut(text, PROBLEM_CHARS)) : fail(id, cut(text, PROBLEM_CHARS)))

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a log comes to                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Analysis {
  /** The first rows that break B3's order, and how many there are. */
  readonly disorder: { readonly first: string; readonly count: number } | null
  /** The rows in whole µs, when B3 holds. */
  readonly rows: readonly BenchRow[] | null
  readonly plan: BenchPlan | null
  /** The measured window starts here (the due time of the request after the warm-up), when the plan allows. */
  readonly warmupUs: number | null
  readonly summary: BenchSummary | null
  /** Why `summary` is null, in a sentence. */
  readonly why: string
}

const toUs = (ns: number): number => divRound(ns, 1000)

/** The first row to break B3's order, and how many do. */
function disorderOf(log: BenchLog): Analysis['disorder'] {
  const { id, dueNs, sentNs, firstNs, doneNs, outputTokens } = log.rows
  let first = ''
  let count = 0
  for (let i = 0; i < id.length; i += 1) {
    const ordered = dueNs[i] >= 0 && dueNs[i] <= sentNs[i] && sentNs[i] <= firstNs[i] && firstNs[i] <= doneNs[i] && outputTokens[i] >= 1
    if (ordered) continue
    count += 1
    if (first === '') {
      first =
        outputTokens[i] < 1
          ? `row ${i} (request ${id[i]}) completed with ${outputTokens[i]} output tokens, and a completed request has at least one`
          : `row ${i} (request ${id[i]}) has due ${grouped(dueNs[i])}, sent ${grouped(sentNs[i])}, first token ${grouped(firstNs[i])} and last token ${grouped(doneNs[i])} ns, which are not in order from 0`
    }
  }
  return count === 0 ? null : { first, count }
}

function analysisOf(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>): Analysis {
  return memoized(run, `bench:analysis:${parsed.id}`, () => {
    const log = parsed.value
    const disorder = disorderOf(log)
    const spec = run.declared?.bench
    let plan: BenchPlan | null = null
    let why = ''
    if (spec === undefined) why = `this site declares no workload for ${run.receipt.stage}, so the schedule cannot be drawn again from the challenge`
    else {
      try {
        plan = planBench(run.receipt.challenge.seed, spec)
      } catch (error) {
        why = `the declared workload cannot be drawn: ${cut(error instanceof Error ? error.message : String(error), 120)}`
      }
    }
    const { id, dueNs, sentNs, firstNs, doneNs, promptTokens, outputTokens } = log.rows
    const rows: BenchRow[] | null =
      disorder === null
        ? id.map((_, i): BenchRow => ({ id: id[i], client: null, dueUs: toUs(dueNs[i]), sentUs: toUs(sentNs[i]), firstUs: toUs(firstNs[i]), doneUs: toUs(doneNs[i]), promptTokens: promptTokens[i], outputTokens: outputTokens[i] }))
        : null
    if (rows === null && why === '') why = 'the rows are not in order (B3)'
    const warm = warmupRows(run.receipt.environment.engineConfig?.maxNumSeqs ?? 0)
    const warmupUs = plan === null ? null : (plan.reqs[warm]?.dueUs ?? null)
    if (plan !== null && warmupUs === null) why = `the declared workload draws ${grouped(plan.reqs.length)} requests, and the warm-up alone is ${grouped(warm)}`
    let summary: BenchSummary | null = null
    if (spec !== undefined && rows !== null && warmupUs !== null) {
      try {
        summary = summarizeRows(rows, { warmupUs, durationUs: spec.durationUs, slo: spec.slo }, { bootstrap: RESAMPLES, seed: run.receipt.challenge.seed })
      } catch (error) {
        why = `the rows cannot be summarized: ${cut(error instanceof Error ? error.message : String(error), 120)}`
      }
    }
    return { disorder, rows, plan, warmupUs, summary, why }
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Claims                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A comparison of one part of the claimed summary with the same part of the recomputed one: the sentence for a check that compares, or null when they agree. */
function compare(run: Run, id: string, parts: readonly (keyof BenchSummary)[], summary: BenchSummary): string | null {
  for (const part of parts) {
    const found = firstDifferenceIn(run, id, part, summary[part])
    if (found !== null) return found
  }
  return null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

type LogCheck = (run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis) => Outcome

const needs = (analysis: Analysis): Outcome | null => (analysis.summary === null ? na(analysis.why) : null)

function b1(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  if (analysis.plan === null) return na(analysis.why)
  const { id, dueNs, promptTokens } = parsed.value.rows
  const expected = analysis.plan.reqs
  if (id.length !== expected.length) return fail('B1', cut(`the log has ${plural(id.length, 'row')} and the challenge's seed draws ${plural(expected.length, 'request')}, so this is not the run that the challenge asked for: a run on other seeds fails here.`, PROBLEM_CHARS))
  let differ = 0
  let first = ''
  for (let i = 0; i < id.length; i += 1) {
    const want = expected[i]
    if (id[i] === want.id && dueNs[i] === (want.dueUs ?? -1) * 1000 && promptTokens[i] === want.promptTokens) continue
    differ += 1
    if (first === '') first = `row ${i} is request ${id[i]}, due ${grouped(dueNs[i])} ns with a prompt of ${grouped(promptTokens[i])} tokens, and the schedule has request ${want.id}, due ${grouped((want.dueUs ?? 0) * 1000)} ns with ${grouped(want.promptTokens)}`
  }
  if (differ > 0) return fail('B1', cut(`${first}${differ > 1 ? ` (and ${plural(differ - 1, 'more row')} differ)` : ''}: a run on other seeds fails here.`, PROBLEM_CHARS))
  return pass('B1', `${plural(id.length, 'row')}: the ids, due times and prompt lengths are the ones that seed ${run.receipt.challenge.seed.toString(16).padStart(8, '0')} draws.`)
}

function b2(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const { id, status } = parsed.value.rows
  const done = status.filter((s) => s === STATUS.completed).length
  const failed = status.filter((s) => s === STATUS.failed).length
  const aborted = status.length - done - failed
  const repeats = id.length - new Set(id).size
  const problems: string[] = []
  if (repeats > 0) problems.push(`${plural(repeats, 'request id')} repeat`)
  if (failed + aborted > 0) problems.push(`${plural(failed, 'request')} failed and ${plural(aborted, 'request')} aborted, and this version credits only a run in which every request completed`)
  if (analysis.summary !== null) {
    const found = firstDifferenceIn(run, parsed.id, 'counts', analysis.summary.counts)
    if (found !== null) problems.push(found)
  }
  const text = `${plural(done, 'request')} completed, ${failed} failed and ${aborted} aborted make ${plural(id.length, 'row')}`
  return problems.length > 0 ? fail('B2', cut(`${problems.join('; ')}.`, PROBLEM_CHARS)) : pass('B2', `${text}, and no id repeats.`)
}

function b3(_run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const rows = plural(parsed.value.rows.id.length, 'row')
  if (analysis.disorder === null) return pass('B3', `${rows}, and each request was due, sent, answered and finished in that order, with a token.`)
  return fail('B3', cut(`${analysis.disorder.first}${analysis.disorder.count > 1 ? ` (and ${plural(analysis.disorder.count - 1, 'more row')})` : ''}.`, PROBLEM_CHARS))
}

function b4(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  if (analysis.rows === null) return na(analysis.why)
  const found = arrivalAdherence(analysis.rows)
  const claimed = firstDifferenceIn(run, parsed.id, 'adherence', found)
  const bounds = `at least 99.9% of sends within ${us(ADHERENCE_TOLERANCE_US)} of their due time and none past ${us(ADHERENCE_HARD_LIMIT_US)} [estimated]`
  if (!found.ok) {
    return fail('B4', cut(`${plural(found.lateRows, 'send')} of ${grouped(found.rows)} came more than ${us(found.toleranceUs)} after their due time, the latest by ${us(found.maxLateUs)}. The bound is ${bounds}: a client that waits for the server is coordinated omission, and a closed loop shows exactly this.`, PROBLEM_CHARS))
  }
  if (claimed !== null) return fail('B4', cut(`${claimed}.`, PROBLEM_CHARS))
  return pass('B4', `${plural(found.lateRows, 'send')} of ${grouped(found.rows)} were late, the latest by ${us(found.maxLateUs)}. The bound is ${bounds}.`)
}

function b5(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const claim = claimOf(run, parsed.id)
  const claimedLatency = isObject(claim?.latency) ? claim.latency : undefined
  const mislabelled: string[] = []
  for (const [due, sent] of [['ttftFromDue', 'ttftFromSent'], ['e2eFromDue', 'e2eFromSent']] as const) {
    const said = claimedLatency?.[due]
    const claimedP99 = isObject(said) ? said.p99Us : undefined
    const fromDue = summary.latency[due]?.p99Us
    const fromSent = summary.latency[sent]?.p99Us
    if (typeof claimedP99 === 'number' && claimedP99 !== fromDue && claimedP99 === fromSent) mislabelled.push(`${due} p99 ${us(claimedP99)} is the figure counted from the actual send`)
  }
  if (mislabelled.length > 0) return fail('B5', cut(`${mislabelled.join('; ')}, and the course counts from the due time, ${ms(summary.latency.ttftFromDue?.p99Us ?? 0)} at the p99 of the first token.`, PROBLEM_CHARS))
  return pass('B5', 'The latencies are counted from the due time, and the figures counted from the actual send are labelled apart.')
}

const FAMILIES = ['ttftFromDue', 'ttftFromSent', 'e2eFromDue', 'e2eFromSent'] as const

function b6(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const claim = claimOf(run, parsed.id)
  const latency = summary.latency.ttftFromDue
  const headline = latency === null ? 'no rows' : `time to first token p50 ${us(latency.p50Us)}, p90 ${us(latency.p90Us)}, p99 ${us(latency.p99Us)}`
  if (isObject(claim?.latency)) {
    for (const family of FAMILIES) {
      if (!Object.hasOwn(claim.latency, family)) continue
      const found = firstDifference(claim.latency[family], summary.latency[family], `latency.${family}`)
      if (found !== null) return fail('B6', cut(`${found} (nearest rank on the integer rows, ${plural(summary.counts.measured, 'measured row')}).`, PROBLEM_CHARS))
    }
  }
  return pass('B6', `Recomputed by nearest rank from ${plural(summary.counts.measured, 'measured row')}: ${headline}.`)
}

function b7(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const found = compare(run, parsed.id, ['p99Intervals'], summary)
  if (found !== null) return fail('B7', cut(`${found} (a percentile bootstrap of ${grouped(RESAMPLES)} resamples [estimated], seeded from the challenge).`, PROBLEM_CHARS))
  if (summary.counts.measured < P99_ROWS) {
    return fail('B7', cut(`the p99 rests on ${plural(summary.counts.measured, 'measured row')}, and it needs at least ${grouped(P99_ROWS)}, so that 10 lie beyond it [derived].`, PROBLEM_CHARS))
  }
  const interval = summary.p99Intervals.ttftFromDue
  return pass('B7', `${plural(summary.counts.measured, 'measured row')}${interval === null ? '' : `, and the 95% interval on the p99 of the first token is ${us(interval.loUs)} to ${us(interval.hiUs)}`}.`)
}

function b8(run: Run, _parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const rows = (analysis.rows ?? []).filter((row) => row.dueUs >= (analysis.warmupUs ?? 0))
  const warm = warmupRows(run.receipt.environment.engineConfig?.maxNumSeqs ?? 0)
  const tenth = Math.floor(rows.length / 10)
  if (tenth < 1) return fail('B8', cut(`only ${plural(rows.length, 'row')} follow the warm-up of ${plural(summary.counts.warmup, 'row')}, too few to see whether the run settled.`, PROBLEM_CHARS))
  const ttft = (row: BenchRow): number => row.firstUs - row.dueUs
  const early = nearestRank(sortedAsc(rows.slice(0, tenth).map(ttft)), 500)
  const rest = nearestRank(sortedAsc(rows.slice(tenth).map(ttft)), 500)
  if (early * WARM_DEN > rest * WARM_NUM) {
    return fail('B8', cut(`still warming: the median time to first token of the first tenth after the warm-up is ${us(early)}, more than ${WARM_NUM}/${WARM_DEN} of the ${us(rest)} of the rest [estimated bound].`, PROBLEM_CHARS))
  }
  return pass('B8', `The first ${plural(summary.counts.warmup, 'row')} (the declared ${grouped(warm)} [estimated]) are apart, and the median first token of the next tenth, ${us(early)}, is within ${WARM_NUM}/${WARM_DEN} of the rest, ${us(rest)}.`)
}

function b9(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const found = compare(run, parsed.id, ['goodput', 'rates', 'window'], summary)
  if (found !== null) return fail('B9', cut(`${found} (goodput counts the requests that met both objectives, over the arrival window and, apart, over the total duration with the drain tail).`, PROBLEM_CHARS))
  const g = summary.goodput
  return pass('B9', `${plural(g.met, 'request')} met both objectives: ${grouped(g.arrivalWindowPerSMilli)} per 1,000 s over the arrival window, and ${grouped(g.totalDurationPerSMilli)} over the total duration.`)
}

function b10(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const littles = summary.littles
  const claimed = compare(run, parsed.id, ['littles'], summary)
  if (claimed !== null) return fail('B10', cut(`${claimed}.`, PROBLEM_CHARS))
  const text = `the mean number in flight is ${grouped(littles.meanInFlightMilli)} thousandths and throughput times mean latency is ${grouped(littles.expectedInFlightMilli)}, ${grouped(littles.residualPermille)} permille apart`
  return bounded('B10', `${text}; Little's law holds within ${LITTLES_PERMILLE} permille [estimated].`, littles.residualPermille <= LITTLES_PERMILLE)
}

function b12(run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>, analysis: Analysis): Outcome {
  const missing = needs(analysis)
  if (missing !== null) return missing
  const summary = analysis.summary as BenchSummary
  const claim = claimOf(run, parsed.id)
  const found = isObject(claim?.latency) && Object.hasOwn(claim.latency, 'tpot') ? firstDifference(claim.latency.tpot, summary.latency.tpot, 'latency.tpot') : null
  if (found !== null) return fail('B12', cut(`${found} (the time per output token of a request is the last token minus the first, over the output tokens less one).`, PROBLEM_CHARS))
  const tpot = summary.latency.tpot
  return pass('B12', tpot === null ? 'No request has more than one output token.' : `Per-request time per output token, from ${plural(tpot.n, 'request')}: p50 ${us(tpot.p50Us)}, p99 ${us(tpot.p99Us)}.`)
}

function b14(_run: Run, parsed: Extract<Parsed<BenchLog>, { ok: true }>): Outcome {
  const { dueNs } = parsed.value.rows
  let first = dueNs.length === 0 ? 0 : dueNs[0]
  for (const due of dueNs) if (due < first) first = due
  const reset = parsed.value.cacheResetNs
  const text = `the server's prefix cache was reset at ${grouped(reset)} ns and the first request is due at ${grouped(first)} ns`
  return bounded('B14', reset <= first ? `${text}: no earlier run's cache can have helped.` : `${text}: a reset after the first request leaves a previous run's cache in the measured window.`, reset <= first)
}

const LOG_CHECKS: Readonly<Record<string, LogCheck>> = { B1: b1, B2: b2, B3: b3, B4: b4, B5: b5, B6: b6, B7: b7, B8: b8, B9: b9, B10: b10, B12: b12, B14: b14 }

/** The checks of this file, by id: ids.ts lists them, and a test holds the two together. */
export const BENCH_CHECKS: readonly string[] = Object.keys(LOG_CHECKS)

/** Runs B-check `id` over every benchmark log of the receipt. `na` when the receipt has none. */
export function benchCheck(run: Run, id: string): Outcome {
  const check = LOG_CHECKS[id]
  const logs = benchLogs(run)
  if (check === undefined || logs.length === 0) return na(`the receipt carries no benchmark log (${BENCH_LOG_FORMAT})`)
  const parts: { label: string; result: CheckResult }[] = []
  for (const parsed of logs) {
    if (!parsed.ok) {
      parts.push({ label: parsed.id, result: fail(id, cut(`the log could not be read: ${parsed.problem}.`, PROBLEM_CHARS)) })
      continue
    }
    const outcome = check(run, parsed, analysisOf(run, parsed))
    if ('na' in outcome) return outcome
    parts.push({ label: parsed.id, result: outcome })
  }
  return together(id, parts)
}

/**
 * How many rows of the benchmark logs of a receipt count as measured, in all: the rows after the warm-up when the stage declares the workload that tells how many the warm-up is,
 * and every row of a log when it does not, since nothing then says which are the warm-up's. A log that cannot be read counts for none.
 */
export function measuredRows(run: Run): number {
  let total = 0
  for (const parsed of benchLogs(run)) {
    if (!parsed.ok) continue
    total += analysisOf(run, parsed).summary?.counts.measured ?? parsed.value.rows.id.length
  }
  return total
}

/** What the throughput ceiling (P3) needs of the logs: the measured output tokens per second of each, from the rows. */
export function throughputOf(run: Run): readonly { readonly id: string; readonly tokensPerS: number; readonly rows: number }[] | string {
  const out: { id: string; tokensPerS: number; rows: number }[] = []
  for (const parsed of benchLogs(run)) {
    if (!parsed.ok) return `the log "${parsed.id}" could not be read`
    const analysis = analysisOf(run, parsed)
    if (analysis.rows === null || analysis.warmupUs === null) return analysis.why
    const measured = analysis.rows.filter((row) => row.dueUs >= (analysis.warmupUs ?? 0))
    if (measured.length === 0) return `the log "${parsed.id}" has no measured row`
    let lastDone = 0
    for (const row of measured) if (row.doneUs > lastDone) lastDone = row.doneUs
    const span = lastDone - (analysis.warmupUs ?? 0)
    const tokens = measured.reduce((total, row) => total + row.outputTokens, 0)
    out.push({ id: parsed.id, tokensPerS: span > 0 ? divRound(tokens * 1_000_000, span) : 0, rows: measured.length })
  }
  return out
}
