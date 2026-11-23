/**
 * A stored report read again (ARCHITECTURE §8.5 rule 10, §7.1; W2b-T23): the results of rules 1 to 9 as a check left them, held to what the site knows now.
 *
 * A receipt is checked once, when its file is brought back, and the file's artifacts stay with the learner. Most of what a check found is a fact about the
 * file and stays as it was found. A re-check that is decided by the site's own data is not: a receipt of a stage whose reference bank the owner had not recorded
 * yet failed `argmax-bank` for want of the bank, and that is no fault of the receipt. The report keeps the ids the receipt gave (report.ts `argmax`), so that
 * when the bank is added the check is made again from them, and the receipt is credited without being brought back a second time.
 *
 * Nothing here is stored. The ledger's `receipt` event holds neither the verdict nor what it was worth, and `verdictOfStored` is what a reader calls.
 */
import type { Receipt } from '@es/schema/receipt'
import type { Banks } from './checks'
import { summarize } from './evaluate'
import { argmaxAgainst } from './rechecks'
import type { RuleResult, StoredReport } from './report'
import { verdictOf } from './verdict'
import type { Verdict } from './verdict'

/** What the site knows now, that a stored result may depend on: the reference banks of rule 7, by stage. */
export interface SiteData {
  readonly banks?: Banks
}

/** The rules of a stored report, with the result of each check that the site's data decides worked out again. */
export function rulesOnRead(receipt: Receipt, report: StoredReport, site: SiteData): readonly RuleResult[] {
  const { argmax } = report
  if (argmax === undefined) return report.rules
  return report.rules.map((rule) => {
    if (rule.id !== 'rechecks' || rule.checks === undefined || !rule.checks.some((check) => check.id === 'argmax-bank')) return rule
    const checks = rule.checks.map((check) => (check.id === 'argmax-bank' ? argmaxAgainst(receipt.stage, argmax, site.banks?.[receipt.stage]) : check))
    return summarize({ rule: 7, id: 'rechecks' }, checks)
  })
}

/** The verdict of a stored report: worked out from the receipt, the rules as they stand now and the number of rules the build that wrote the report ran. */
export function verdictOfStored(receipt: Receipt, report: StoredReport, site: SiteData): Verdict {
  return verdictOf(receipt, rulesOnRead(receipt, report, site), report.ran)
}
