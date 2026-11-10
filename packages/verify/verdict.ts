/**
 * Rule 10, the verdict (ARCHITECTURE §8.5 rule 10, ASSESSMENT §3.2 and §5.8; W2-T08).
 *
 * The verdict is per check: `pass` or `fail` for what this browser re-ran, recomputed or bounded, and `attested` for what only the grader could
 * check and said it passed. Each is shown with its bound and a badge, "re-checked here" or "attested by grader x.y.z". The receipt is
 *
 *   gpu-verified   when every required check passes or is attested, and the rules 1 to 6 passed (a grader the site published, an unspent challenge, the
 *                  pins). The weight of that is ASSESSMENT's: 1.0
 *   assisted       when it would be gpu-verified and the learner declared `assisted: code`, or `agent: true` (ASSESSMENT §3.2)
 *   practice       when the stage requires nothing (§5.9 "optional") and the receipt is whole and consistent: it earns practice credit only
 *   gpu-unverified when anything else: a rule failed, a check failed (a required one, or one that no row of the stage allows to fail), a required
 *                  check is missing or is not built yet, or the report is an older build's. It is shown with its reasons and never credited
 *
 * The verdict is computed at read time from the receipt and the stored results of rules 1 to 9, and the receipt never stores it (statespace §10.3).
 * So a rule that a later build adds, or a stage whose row changes, re-derives every verdict; the report says how many rules the build that wrote it
 * ran, and a verdict from fewer than ten says that the file has to be brought back to be checked by all of them.
 *
 * O-10, answered by its default: grader-attested correctness counts at full weight when every browser-runnable check also passes (DECISIONS O-10).
 */
import type { Receipt } from '@es/schema/receipt'
import { cut, firstProblems } from './format'
import { PROBLEM_CHARS } from './limits'
import { CHECK_IDS } from './ids'
import { RULES_IN_ALL, RULES_RUN } from './report'
import type { CheckResult, RuleResult } from './report'
import { canonical, isPractice, PENDING, stageRow } from './stages'

export type VerdictProvenance = 'gpu-verified' | 'assisted' | 'practice' | 'gpu-unverified'

/** One check of the verdict. */
export interface VerdictCheck {
  readonly id: string
  readonly verdict: 'pass' | 'fail' | 'attested'
  /** The bound it was held to and what was found, in a sentence. */
  readonly bound: string
  /** Whether this browser ran it (`re-checked`) or the grader did and this browser takes its word (`attested`). */
  readonly how: 're-checked' | 'attested'
  /** Whether the stage requires it. */
  readonly required: boolean
}

export interface Verdict {
  readonly provenance: VerdictProvenance
  /** Why, one sentence for each reason: the rules and checks that failed, what is missing, and what is not built yet. */
  readonly reasons: readonly string[]
  readonly checks: readonly VerdictCheck[]
}

/** What the receipt's own numbers for a check say, in one line: `value 0.995, bound 0.99`. A check with none has no bound to print. */
export function attestedBound(check: Receipt['checks'][number]): string {
  const parts = ([['value', check.value], ['bound', check.bound], ['tolerance', check.tolerance], ['n', check.n]] as const)
    .filter(([, number]) => number !== undefined)
    .map(([name, number]) => `${name} ${number}`)
  const numbers = parts.join(', ')
  return cut(check.detail === '' ? (numbers === '' ? 'no number given' : numbers) : numbers === '' ? check.detail : `${numbers}; ${check.detail}`, PROBLEM_CHARS)
}

const olderReason = (ran: number): string =>
  `This check was made by an earlier version of the site that ran ${ran} of the ${RULES_IN_ALL} rules. Bring the receipt's file back, and it is checked by all of them.`

/**
 * The verdict of a receipt, from the results of its rules. `ran` is how many rules the build that wrote the results ran.
 */
export function verdictOf(receipt: Receipt, rules: readonly RuleResult[], ran: number = RULES_RUN): Verdict {
  const reasons: string[] = []
  const checks: VerdictCheck[] = []
  for (const result of rules) if (result.status === 'fail' && result.rule <= 6) reasons.push(result.summary)
  if (ran < RULES_IN_ALL) reasons.push(olderReason(ran))

  const row = stageRow(receipt.stage)
  if (row === undefined) reasons.push(`This version of the site lists no stage called ${cut(receipt.stage, 40)}, so it cannot say what the stage requires.`)

  // What this browser ran: every check of rules 7 to 9, passed or failed, and whether the stage required it.
  const required = new Set((row?.rechecked ?? []).map(canonical))
  const ran79: CheckResult[] = rules.flatMap((result) => result.checks ?? [])
  for (const check of ran79) {
    checks.push({ id: check.id, verdict: check.status, bound: check.bound, how: 're-checked', required: required.has(check.id) })
    if (check.status === 'fail') reasons.push(`${check.id}: ${check.bound}`)
  }
  // What the stage requires of this browser and it has not got: a check that is not built yet, or one that nothing in the receipt let it run.
  for (const id of required) {
    if (ran79.some((check) => check.id === id)) continue
    const task = PENDING[id]
    // A report of an earlier build holds no result of rules 7 to 9, and says so once, above: a missing result is not each check's own fault.
    if (task === undefined && ran < RULES_IN_ALL && CHECK_IDS.includes(id)) continue
    const bound =
      task !== undefined
        ? `${id} is not built yet: ${task} builds it, and a receipt of ${receipt.stage} is not credited until it exists.`
        : CHECK_IDS.includes(id)
          ? `${id} is required, and the report holds no result for it, so it cannot be told whether the receipt passed it.`
          : `${id} is required, and this version of the site has no check of that name.`
    checks.push({ id, verdict: 'fail', bound, how: 're-checked', required: true })
    reasons.push(bound)
  }
  // What the grader checked: the required ones must be there and have passed; the others are shown, and a failure of one that the stage does not list as optional counts.
  const optional = new Set(row?.optional ?? [])
  const wanted = new Set(row?.attested ?? [])
  const listed = new Set(receipt.checks.map((check) => check.id))
  for (const id of wanted) {
    if (listed.has(id)) continue
    const bound = `The receipt lists no check called ${id}, which ${receipt.stage} requires of the grader.`
    checks.push({ id, verdict: 'fail', bound, how: 'attested', required: true })
    reasons.push(bound)
  }
  for (const check of receipt.checks) {
    const mine = wanted.has(check.id)
    const verdict = check.pass ? 'attested' : 'fail'
    checks.push({ id: check.id, verdict, bound: attestedBound(check), how: 'attested', required: mine })
    if (!check.pass && !optional.has(check.id)) reasons.push(`The grader's check ${check.id} failed: ${attestedBound(check)}.`)
  }

  const shown = firstProblems(reasons, 8)
  if (shown.length > 0 || row === undefined) return { provenance: 'gpu-unverified', reasons: shown, checks }
  if (isPractice(row)) return { provenance: 'practice', reasons: [`${receipt.stage} asks nothing of a receipt, so this one earns practice credit only (ASSESSMENT §5.9).`], checks }
  const assisted = receipt.provenance.assisted === 'code' || receipt.provenance.agent
  if (assisted) {
    const said = `assisted: ${receipt.provenance.assisted}, agent: ${receipt.provenance.agent ? 'yes' : 'no'}`
    return { provenance: 'assisted', reasons: [`You declared that you had help with code or from an agent (${said}), so the receipt counts as assisted work (ASSESSMENT §3.2).`], checks }
  }
  return { provenance: 'gpu-verified', reasons: [], checks }
}
