/**
 * The stage's requirement of "evidence" (ARCHITECTURE §8.5 rule 8, ASSESSMENT §5.9; W2-T08, and the review of W2's grader track): `tr7.reproduce.s1` asks of the browser "the
 * target's B-rules or T-rules", which is to say a benchmark log or a trace for the rules to recompute. This is the check that there is one, as a check of its own that the
 * report keeps, `evidence`, with its bound.
 *
 * It used to be satisfied by any check of rule 8 or 9, and a check over nothing passes: a trace with no span passed T2 to T5, and a log with no row passed B2, B3 and B14. So the
 * evidence has to be something: a trace with a span inside a step window, or a benchmark log with a measured row. A log counts the rows after its warm-up when the stage
 * declares the workload that tells how many the warm-up is, and every row otherwise (bench.ts, `measuredRows`). It runs only for a stage that requires it, and the rest of what a
 * stage requires is the checks that are made over this evidence.
 */
import { stepWindows } from '@es/sim/trace'
import { measuredRows } from './bench'
import { fail, pass } from './checks'
import type { Outcome, Run } from './checks'
import { traces } from './evidence'
import { cut, plural } from './format'
import { PROBLEM_CHARS } from './limits'

export function evidenceCheck(run: Run): Outcome {
  const rows = measuredRows(run)
  let windows = 0
  let traced = 0
  for (const parsed of traces(run)) {
    if (!parsed.ok || parsed.value.spans.track.length === 0) continue
    const found = stepWindows(parsed.value).length
    if (found === 0) continue
    windows += found
    traced += 1
  }
  if (rows === 0 && windows === 0) {
    return fail('evidence', cut('the stage asks for a benchmark log or a trace to recompute, and the receipt carries neither with anything in it: no log has a measured row, and no trace has a span and a step window.', PROBLEM_CHARS))
  }
  const parts = [rows > 0 ? `${plural(rows, 'measured row')} of a benchmark log` : '', windows > 0 ? `${plural(windows, 'step window')} in ${plural(traced, 'trace')}` : ''].filter((part) => part !== '')
  return pass('evidence', `The receipt carries ${parts.join(' and ')} to recompute.`)
}
