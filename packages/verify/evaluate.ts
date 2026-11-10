/**
 * Rules 7, 8 and 9 on one receipt (ARCHITECTURE §8.5; W2-T08): which checks the stage asks for (stages.ts), each run once, and the three results that
 * the report keeps, one for each rule, with every check's bound in them.
 *
 *   7  rechecks       the correctness re-checks (rechecks.ts)
 *   8  recomputation  a log's B-checks (bench.ts) and a trace's T-checks and X4 (trace.ts)
 *   9  floors         P1 and P3 (floors.ts)
 *
 * What runs. A check the stage requires always runs; if the receipt has nothing for it, it fails and says what is missing, since a requirement that
 * a forger can meet by leaving the evidence out is no requirement. A check the stage lists as captured ("as captured", "optional R" in §5.9),
 * and every check when the stage says `*`, runs when the evidence supports it and counts only when it fails. Rule 7's three re-checks run
 * whenever the receipt has the artifact they read. A check that the stage requires and this build lacks does not run, and the verdict
 * names it (stages.ts, `PENDING`).
 *
 * A check cannot break the others. One that throws is a failed check with the error as its bound, so that a receipt built to crash the verifier
 * gets a result and no more.
 */
import { benchCheck } from './bench'
import { fail, isNa } from './checks'
import type { Outcome, Run } from './checks'
import { floorCheck } from './floors'
import { BENCH_CHECK_IDS, FLOOR_CHECK_IDS, RECHECK_IDS, TRACE_CHECK_IDS } from './ids'
import { recheck } from './rechecks'
import type { CheckResult, RuleResult } from './report'
import { canonical, stageRow } from './stages'
import { traceCheck } from './trace'

interface Group {
  readonly rule: 7 | 8 | 9
  readonly id: 'rechecks' | 'recomputation' | 'floors'
  readonly ids: readonly string[]
  readonly run: (run: Run, id: string) => Outcome
  /** Whether a check of the group runs for every receipt that has its artifact, whatever the stage asks (rule 7's re-checks). */
  readonly always: boolean
}

const GROUPS: readonly Group[] = [
  { rule: 7, id: 'rechecks', ids: RECHECK_IDS, run: recheck, always: true },
  {
    rule: 8,
    id: 'recomputation',
    ids: [...BENCH_CHECK_IDS, ...TRACE_CHECK_IDS],
    run: (run, id) => (BENCH_CHECK_IDS.includes(id) ? benchCheck(run, id) : traceCheck(run, id)),
    always: false,
  },
  { rule: 9, id: 'floors', ids: FLOOR_CHECK_IDS, run: floorCheck, always: false },
]

const guarded = (group: Group, run: Run, id: string): Outcome => {
  try {
    return group.run(run, id)
  } catch (error) {
    return fail(id, `the check could not run: ${error instanceof Error ? error.message : String(error)}`.slice(0, 280))
  }
}

function summarize(group: Group, checks: readonly CheckResult[]): RuleResult {
  const failed = checks.filter((check) => check.status === 'fail')
  const base = { rule: group.rule, id: group.id, checks }
  if (checks.length === 0) return { ...base, status: 'pass', summary: 'No check of this rule applies to the receipt.', problems: [] }
  const summary = `${checks.length} ${checks.length === 1 ? 'check' : 'checks'}, ${checks.length - failed.length} passed and ${failed.length} failed.`
  // The checks carry their bounds, passed or failed, so the rule keeps no list of problems beside them.
  return { ...base, status: failed.length > 0 ? 'fail' : 'pass', summary, problems: [] }
}

/** The results of rules 7, 8 and 9, in that order. */
export function evaluate(run: Run): readonly RuleResult[] {
  const row = stageRow(run.receipt.stage)
  const required = new Set((row?.rechecked ?? []).map(canonical))
  const captured = new Set((row?.captured ?? []).map(canonical))
  const everything = captured.has('*') || required.has('evidence')
  return GROUPS.map((group) => {
    const checks: CheckResult[] = []
    for (const id of group.ids) {
      const must = required.has(id)
      if (!(must || group.always || captured.has(id) || everything)) continue
      const outcome = guarded(group, run, id)
      if (!isNa(outcome)) checks.push(outcome)
      else if (must) checks.push(fail(id, outcome.na.endsWith('.') ? outcome.na.slice(0, 280) : `${outcome.na.slice(0, 279)}.`))
    }
    return summarize(group, checks)
  })
}
