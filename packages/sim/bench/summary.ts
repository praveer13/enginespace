// The summary of a benchmark's log (ARCHITECTURE §5.6): what a harness would report, and what the course reports instead.
//
// `summarize` takes a run and `summarizeRows` takes any log, which is what the receipt verifier has (ASSESSMENT §6.2, rule 8 of
// ARCHITECTURE §8.5): the same code summarizes a simulated run and a learner's rows, and the verifier compares the result with the
// numbers the receipt claims.

import type { Seed, Us } from '../core/types'
import {
  arrivalAdherence,
  bootstrapInterval,
  checkRows,
  e2eUs,
  latencyPercentiles,
  littlesLaw,
  meetsSlo,
  perSMilli,
  tpotUs,
  ttftUs,
} from './stats'
import type { Slo } from './stats'
import type { BenchRow, BenchRun, BenchSummary, BootstrapInterval } from './types'

export interface SummarizeOptions {
  /** Resamples for the 95% intervals on the p99, B (§5.6: 1,000 [estimated]). 0 leaves the intervals out. */
  readonly bootstrap: number
  /** The resampler's seed. */
  readonly seed: Seed
  /** The warm-up to exclude, instead of the spec's. A benchmark that counted its warm-up is corrected by passing the cold start's end here. */
  readonly warmupUs?: Us
  /** The intervals' nominal level out of 1,000. Default 950. */
  readonly levelPermille?: number
}

/** What a log needs beyond its rows to be summarized: the harness's declared warm-up, the arrival window and the objectives. */
export interface SummaryParams {
  readonly warmupUs: Us
  readonly durationUs: Us
  readonly slo: Slo
}

/** The summary of a run, under the spec's own warm-up unless `o.warmupUs` says otherwise. */
export function summarize(run: BenchRun, o: SummarizeOptions): BenchSummary {
  const { warmupUs, durationUs, slo } = run.spec
  return summarizeRows(run.rows, { warmupUs, durationUs, slo }, o)
}

/**
 * Summarizes the rows of a log. A row is measured when it was due at or after the end of the warm-up; the others are counted apart.
 * Latencies are those of the measured rows, from their due time (the course's rule) and from their actual send (the harness's), and
 * a TPOT is the same from either start. Goodput counts the measured rows that met both objectives, wherever they finished.
 */
export function summarizeRows(rows: readonly BenchRow[], p: SummaryParams, o: SummarizeOptions): BenchSummary {
  checkRows(rows)
  if (!Number.isSafeInteger(o.bootstrap) || o.bootstrap < 0) throw new RangeError(`bootstrap is a number of resamples from 0, got ${o.bootstrap}`)
  const warmupUs = o.warmupUs ?? p.warmupUs
  if (!Number.isSafeInteger(warmupUs) || warmupUs < 0 || warmupUs > p.durationUs) throw new RangeError(`the warm-up is from 0 to the arrival window (${p.durationUs}), got ${warmupUs}`)
  const windowUs = p.durationUs - warmupUs

  const measured = rows.filter((r) => r.dueUs >= warmupUs)
  const ttftDue = measured.map((r) => ttftUs(r, 'due'))
  const ttftSent = measured.map((r) => ttftUs(r, 'sent'))
  const e2eDue = measured.map((r) => e2eUs(r, 'due'))
  const e2eSent = measured.map((r) => e2eUs(r, 'sent'))
  const tpot: Us[] = []
  for (const r of measured) {
    const t = tpotUs(r)
    if (t !== null) tpot.push(t)
  }

  const interval = (sample: readonly number[], stream: string): BootstrapInterval | null =>
    o.bootstrap === 0 || sample.length === 0
      ? null
      : bootstrapInterval(sample, 990, { resamples: o.bootstrap, seed: o.seed, stream, ...(o.levelPermille === undefined ? {} : { levelPermille: o.levelPermille }) })

  const met = measured.filter((r) => meetsSlo(r, p.slo)).length
  let lastDoneUs: Us = warmupUs
  for (const r of measured) if (r.doneUs > lastDoneUs) lastDoneUs = r.doneUs
  const sentInWindow = measured.filter((r) => r.sentUs < p.durationUs).length

  return {
    counts: { offered: rows.length, warmup: rows.length - measured.length, measured: measured.length },
    window: { fromUs: warmupUs, toUs: p.durationUs },
    latency: {
      ttftFromDue: latencyPercentiles(ttftDue),
      ttftFromSent: latencyPercentiles(ttftSent),
      tpot: latencyPercentiles(tpot),
      e2eFromDue: latencyPercentiles(e2eDue),
      e2eFromSent: latencyPercentiles(e2eSent),
    },
    p99Intervals: { ttftFromDue: interval(ttftDue, 'ttft'), tpot: interval(tpot, 'tpot'), e2eFromDue: interval(e2eDue, 'e2e') },
    goodput: {
      met,
      arrivalWindowPerSMilli: perSMilli(met, windowUs),
      totalDurationPerSMilli: perSMilli(met, lastDoneUs - warmupUs),
    },
    rates: { intendedPerSMilli: perSMilli(measured.length, windowUs), sentPerSMilli: perSMilli(sentInWindow, windowUs) },
    littles: littlesLaw(rows, { fromUs: warmupUs, toUs: p.durationUs }),
    adherence: arrivalAdherence(rows),
  }
}
