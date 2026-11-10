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

/** The rules of A§8.5 in order: the number each has there, and the name this code gives it. */
export const RULES = [
  { rule: 1, id: 'caps', name: 'Caps' },
  { rule: 2, id: 'schema', name: 'Schema' },
  { rule: 3, id: 'integrity', name: 'Integrity' },
  { rule: 4, id: 'binding', name: 'Binding' },
  { rule: 5, id: 'grader', name: 'Grader identity' },
  { rule: 6, id: 'pins', name: 'Pins' },
] as const

export type RuleId = (typeof RULES)[number]['id']

/** How many of A§8.5's ten rules this build of the verifier runs. W2-T08 builds the other four (the re-checks, the recomputation, the floors and the verdict). */
export const RULES_RUN = RULES.length

/** The number of rules in A§8.5. */
export const RULES_IN_ALL = 10

/**
 * What a rule found. `skipped` is a rule that did not run because an earlier one had stopped the check: a file that is not a bundle has no
 * artifacts to hash, and a receipt that does not hash has no seeds to bind.
 */
export type RuleStatus = 'pass' | 'fail' | 'skipped'

export interface RuleResult {
  /** The rule's number in A§8.5. */
  readonly rule: number
  readonly id: RuleId
  readonly status: RuleStatus
  /** What the rule found, in one sentence. */
  readonly summary: string
  /** What is wrong, one sentence for each of the first few problems. Empty for a rule that passed or did not run. */
  readonly problems: readonly string[]
}

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
}

export const REPORT_VERSION = 1

const RULE_IDS: ReadonlySet<string> = new Set(RULES.map((entry) => entry.id))
const STATUSES: ReadonlySet<string> = new Set<RuleStatus>(['pass', 'fail', 'skipped'])

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** A sentence that came out of storage, cut to what a result may hold. */
const sentence = (value: unknown): string | null => (typeof value === 'string' && value.length <= PROBLEM_CHARS ? value : null)

function readRule(value: unknown): RuleResult | null {
  if (!isObject(value)) return null
  const { rule, id, status, summary, problems } = value
  const said = sentence(summary)
  if (!isCount(rule) || typeof id !== 'string' || !RULE_IDS.has(id) || typeof status !== 'string' || !STATUSES.has(status) || said === null) return null
  if (!Array.isArray(problems) || problems.length > 50) return null
  const listed: string[] = []
  for (const problem of problems) {
    const text = sentence(problem)
    if (text === null) return null
    listed.push(text)
  }
  return { rule, id: id as RuleId, status: status as RuleStatus, summary: said, problems: listed }
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
  const { sizes } = value
  if (sizes === undefined) return { v: REPORT_VERSION, ran: value.ran, rules }
  if (!isObject(sizes) || !isCount(sizes.compressedBytes) || !isCount(sizes.decompressedBytes)) return null
  return { v: REPORT_VERSION, ran: value.ran, sizes: { compressedBytes: sizes.compressedBytes, decompressedBytes: sizes.decompressedBytes }, rules }
}

/** The report of a check, as the ledger stores it. */
export function storedReport(rules: readonly RuleResult[], sizes?: Sizes): StoredReport {
  return { v: REPORT_VERSION, ran: RULES_RUN, ...(sizes === undefined ? {} : { sizes }), rules }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The verdict (A§8.5 rule 10)                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a receipt is worth, by the provenance names of A§7.3. Only `gpu-unverified` is possible while rules 7 to 10 are not built: a receipt
 * is `gpu-verified` when its required checks pass or are attested, and this browser re-runs none of them yet (W2-T08), so it takes no
 * grader's `pass` flag on trust (I6, A§8.5). The union is wider than that on purpose: W2-T08 widens what `verdictOf` returns and not this type.
 */
export type VerdictProvenance = 'gpu-verified' | 'assisted' | 'gpu-unverified'

export interface Verdict {
  readonly provenance: VerdictProvenance
  /** Why, one sentence for each reason: the rules that failed, and what is not built yet. */
  readonly reasons: readonly string[]
}

/** The reason that holds every receipt back until the rest of the rules exist. */
export const NOT_BUILT_REASON =
  'Rules 7 to 10 (the re-checks, the recomputation, the physics floors and the verdict) are not built in this version of the site, so no check of the grader\'s is re-run here and no receipt can be credited yet.'

/**
 * The verdict of a report. A rule that failed is a reason, and so is a rule that is missing: a receipt that no rule has looked at is not
 * verified. While `RULES_RUN` is below `RULES_IN_ALL` the verdict is `gpu-unverified` for every receipt, and says why.
 */
export function verdictOf(rules: readonly RuleResult[], ran: number = RULES_RUN): Verdict {
  const reasons = rules.filter((result) => result.status === 'fail').map((result) => result.summary)
  if (ran < RULES_IN_ALL) reasons.push(NOT_BUILT_REASON)
  return { provenance: 'gpu-unverified', reasons }
}
