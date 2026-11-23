/**
 * What a check of a receipt leaves behind: one result for each rule of ARCHITECTURE §8.5 that ran, in the rules' order, and the verdict that
 * they come to.
 *
 * A report is stored with the receipt it is about (A§7.1: the `receipts` store keeps "parsed receipts with their verification report", and a
 * re-verification adds a report), and the page draws it under "How this browser checked it". It is plain JSON, so the ledger can keep it and
 * an export can carry it, and it is read back through `readStoredReport`, which trusts nothing: a ledger file is a file the learner chose, and
 * may have been edited.
 *
 * The verdict is not in the report. A§8.5 rule 10 computes it at read time, from the results and the receipt, and re-derives it when the rules
 * change, so a report that was written under six rules reads under ten without being rewritten. `verdictOf` is that function.
 */
import { PROBLEM_CHARS } from './limits'

/**
 * The rules of A§8.5 whose results a report stores, in order: the number each has there, and the name this code gives it. Rule 10, the verdict, is
 * not among them: it is worked out when the report is read (`verdictOf`, verdict.ts), from these results and the receipt.
 */
export const RULES = [
  { rule: 1, id: 'caps', name: 'Caps' },
  { rule: 2, id: 'schema', name: 'Schema' },
  { rule: 3, id: 'integrity', name: 'Integrity' },
  { rule: 4, id: 'binding', name: 'Binding' },
  { rule: 5, id: 'grader', name: 'Grader identity' },
  { rule: 6, id: 'pins', name: 'Pins' },
  { rule: 7, id: 'rechecks', name: 'Re-checks' },
  { rule: 8, id: 'recomputation', name: 'Recomputation' },
  { rule: 9, id: 'floors', name: 'Physics floors' },
] as const

export type RuleId = (typeof RULES)[number]['id']

/** The number of rules in A§8.5. */
export const RULES_IN_ALL = 10

/** How many of A§8.5's ten rules this build of the verifier runs: all of them, the verdict being the tenth. A report written by an older build says how many it ran. */
export const RULES_RUN = RULES_IN_ALL

/** The tenth rule, which stores no result of its own (verdict.ts). The page prints the verdict under the list of the other nine, with this name. */
export const VERDICT_RULE = { rule: 10, id: 'verdict', name: 'Verdict' } as const

/**
 * What a rule found. `skipped` is a rule that did not run because an earlier one had stopped the check: a file that is not a bundle has no
 * artifacts to hash, and a receipt that does not hash has no seeds to bind.
 */
export type RuleStatus = 'pass' | 'fail' | 'skipped'

/**
 * One check that a rule made (rules 7 to 9): the browser's own result for one thing it re-ran, recomputed or bounded, with the bound it was held to
 * printed beside what it found. `id` is ASSESSMENT's: B6 (percentiles), T7 (the partition), P1 (a step against its floor), or a re-check's own name.
 */
export interface CheckResult {
  readonly id: string
  readonly status: 'pass' | 'fail'
  /** The bound, and what was found against it, in one sentence. */
  readonly bound: string
}

export interface RuleResult {
  /** The rule's number in A§8.5. */
  readonly rule: number
  readonly id: RuleId
  readonly status: RuleStatus
  /** What the rule found, in one sentence. */
  readonly summary: string
  /** What is wrong, one sentence for each of the first few problems. Empty for a rule that passed or did not run. */
  readonly problems: readonly string[]
  /** The checks of rules 7 to 9, passed and failed, each with its bound. Rules 1 to 6 are one check each and leave this out. */
  readonly checks?: readonly CheckResult[]
}

/** How many checks a result keeps [estimated]: a receipt's checks are a few dozen, and a report is stored in the learner's ledger. */
export const CHECKS_KEPT = 64

/** The size of the file as rule 1 counted it, when it got that far. */
export interface Sizes {
  readonly compressedBytes: number
  readonly decompressedBytes: number
}

/** A report as the ledger stores it (`receipts[].reports[].report`). */
export interface StoredReport {
  readonly v: 1
  /** How many of A§8.5's rules the verifier that wrote it ran: a rule that a later build adds is not in an older report. */
  readonly ran: number
  readonly sizes?: Sizes
  readonly rules: readonly RuleResult[]
  /**
   * What the receipt gave for a re-check that depends on the site and not on the receipt alone: its argmax ids, at the positions it gave (rechecks.ts `keptArgmax`).
   * A bank that the site gains after the receipt was brought back is compared with these when the report is read (reread.ts), so that the receipt is credited
   * without being brought back again. A report from before this field holds none, and its stored result of the check stands.
   */
  readonly argmax?: { readonly positions: readonly number[]; readonly ids: readonly number[] }
}

export const REPORT_VERSION = 1

/** How many argmax positions a stored report keeps [estimated]. */
export const ARGMAX_KEPT_ROWS = 4096

const RULE_IDS: ReadonlySet<string> = new Set(RULES.map((entry) => entry.id))
const STATUSES: ReadonlySet<string> = new Set<RuleStatus>(['pass', 'fail', 'skipped'])
const CHECK_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** A sentence that came out of storage, cut to what a result may hold. */
const sentence = (value: unknown): string | null => (typeof value === 'string' && value.length <= PROBLEM_CHARS ? value : null)

function readCheck(value: unknown): CheckResult | null {
  if (!isObject(value)) return null
  const { id, status, bound } = value
  const said = sentence(bound)
  if (typeof id !== 'string' || !CHECK_ID.test(id) || (status !== 'pass' && status !== 'fail') || said === null) return null
  return { id, status, bound: said }
}

function readRule(value: unknown): RuleResult | null {
  if (!isObject(value)) return null
  const { rule, id, status, summary, problems, checks } = value
  const said = sentence(summary)
  if (!isCount(rule) || typeof id !== 'string' || !RULE_IDS.has(id) || typeof status !== 'string' || !STATUSES.has(status) || said === null) return null
  if (!Array.isArray(problems) || problems.length > 50) return null
  const listed: string[] = []
  for (const problem of problems) {
    const text = sentence(problem)
    if (text === null) return null
    listed.push(text)
  }
  const base = { rule, id: id as RuleId, status: status as RuleStatus, summary: said, problems: listed }
  if (checks === undefined) return base
  if (!Array.isArray(checks) || checks.length > CHECKS_KEPT) return null
  const kept: CheckResult[] = []
  for (const entry of checks) {
    const check = readCheck(entry)
    if (check === null) return null
    kept.push(check)
  }
  return { ...base, checks: kept }
}

/** A report read back from the ledger, or null for JSON that is not one (a newer build's, or an edited file's). */
export function readStoredReport(value: unknown): StoredReport | null {
  if (!isObject(value) || value.v !== REPORT_VERSION || !isCount(value.ran) || !Array.isArray(value.rules) || value.rules.length > 50) return null
  const rules: RuleResult[] = []
  for (const entry of value.rules) {
    const read = readRule(entry)
    if (read === null) return null
    rules.push(read)
  }
  const argmax = readArgmaxKept(value.argmax)
  if (argmax === null) return null
  const held = argmax === undefined ? {} : { argmax }
  const { sizes } = value
  if (sizes === undefined) return { v: REPORT_VERSION, ran: value.ran, rules, ...held }
  if (!isObject(sizes) || !isCount(sizes.compressedBytes) || !isCount(sizes.decompressedBytes)) return null
  return { v: REPORT_VERSION, ran: value.ran, sizes: { compressedBytes: sizes.compressedBytes, decompressedBytes: sizes.decompressedBytes }, rules, ...held }
}

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

/** The argmax ids a report keeps: undefined when it keeps none, null when what it holds is not two columns of integers of one length. */
function readArgmaxKept(value: unknown): StoredReport['argmax'] | null | undefined {
  if (value === undefined) return undefined
  if (!isObject(value) || !Array.isArray(value.positions) || !Array.isArray(value.ids)) return null
  const { positions, ids } = value
  if (positions.length !== ids.length || positions.length > ARGMAX_KEPT_ROWS) return null
  if (!positions.every(isInt) || !ids.every(isInt)) return null
  return { positions: [...(positions as number[])], ids: [...(ids as number[])] }
}

/** The report of a check, as the ledger stores it. */
export function storedReport(rules: readonly RuleResult[], sizes?: Sizes, argmax?: StoredReport['argmax']): StoredReport {
  return { v: REPORT_VERSION, ran: RULES_RUN, ...(sizes === undefined ? {} : { sizes }), rules, ...(argmax === undefined ? {} : { argmax }) }
}
