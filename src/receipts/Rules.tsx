import { Icon } from '@/design/components/Glyph'
import type { IconName } from '@/design/components/Glyph'
import { Label } from '@/design/components/Label'
import { RULES, VERDICT_RULE } from '@es/verify'
import type { CheckResult, RuleResult, RuleStatus, Verdict } from '@es/verify'
import { CHECK_WORDS, REPORTS, RULE_WORDS, VERDICT_WORDS } from './copy'

/*
 * The result of each verification rule, as a list (ARCHITECTURE §8.5): the rule's number and name, a word and a drawn mark for what it found, the
 * sentence it wrote, and, under it, the problems it named. It draws the report of a check that has just been made (ImportPanel) and the reports
 * that a receipt's page keeps (ReceiptDetail).
 *
 * A result is never a colour alone: it is a word, a mark and, for a rule that failed, the ribbon's red. Everything in a result came out of a
 * file someone else wrote, or out of a rule that quotes one, and it goes on the page as text and nothing else (A§12).
 */

const MARKS: Record<RuleStatus, IconName> = { pass: 'check', fail: 'alert', skipped: 'strike' }
const CHECK_MARKS: Record<'pass' | 'fail' | 'attested', IconName> = { pass: 'check', fail: 'alert', attested: 'check' }

/** The name of a rule, from the verifier's own table: a report names the rule by its id, and the table says what to call it. */
const NAMES: ReadonlyMap<string, string> = new Map(RULES.map((entry) => [entry.id, entry.name]))

/** One check of rules 7 to 9: its id, a word and a mark for how it came out, and the bound it was held to with what was found against it. */
function CheckLine({ check }: { check: CheckResult }) {
  return (
    <li className="es-check" data-status={check.status} data-check={check.id}>
      <span className="es-check__id">{check.id}</span>
      <span className="es-check__result">
        <Icon name={CHECK_MARKS[check.status]} className="es-rule__mark" />
        <span>{CHECK_WORDS[check.status]}</span>
      </span>
      <span className="es-check__bound">{check.bound}</span>
    </li>
  )
}

function Rule({ result, checks }: { result: RuleResult; checks: boolean }) {
  return (
    <li className="es-rule" data-status={result.status} data-rule={result.id}>
      <span className="es-rule__n" aria-hidden="true">
        {result.rule}
      </span>
      <p className="es-rule__name">
        <span className="sr-only">Rule {result.rule}, </span>
        {NAMES.get(result.id) ?? result.id}
      </p>
      <span className="es-rule__result">
        <Icon name={MARKS[result.status]} className="es-rule__mark" />
        <span>{RULE_WORDS[result.status]}</span>
      </span>
      <p className="es-rule__summary">{result.summary}</p>
      {checks && result.checks !== undefined && result.checks.length > 0 ? (
        <ul className="es-rule__checks" aria-label={`Checks of rule ${result.rule}`}>
          {result.checks.map((check) => (
            <CheckLine key={check.id} check={check} />
          ))}
        </ul>
      ) : result.problems.length === 0 ? null : (
        <ul className="es-rule__problems">
          {result.problems.map((problem, at) => (
            <li key={at}>{problem}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The rules as a list. A rule of 7 to 9 lists its checks under its sentence, each with its bound, unless `checks` is false: where the verdict is printed
 * under the list, it lists every check once, and the rules say only what they found.
 */
export function RuleList({ rules, label, checks = true }: { rules: readonly RuleResult[]; label: string; checks?: boolean }) {
  return (
    <ol className="es-rules" aria-label={label}>
      {rules.map((result) => (
        <Rule key={result.id} result={result} checks={checks} />
      ))}
    </ol>
  )
}

/**
 * What the rules came to: the verdict, as a word on masking tape beside what it means, and the reasons under it, one sentence each. The verdict is
 * worked out when it is shown, from the rules and how many of them ran (`verdictOf`), and is never read out of a stored field.
 */
export function VerdictLine({ verdict, grader }: { verdict: Verdict; grader?: string }) {
  return (
    <div className="es-import__verdict" data-rule={VERDICT_RULE.id}>
      <p className="es-import__verdict-line">
        <span className="es-rule__n" aria-hidden="true">
          {VERDICT_RULE.rule}
        </span>
        <span className="sr-only">Rule {VERDICT_RULE.rule}, </span>
        <Label size="sm" tilt="none" className="es-import__worth">
          {VERDICT_WORDS[verdict.provenance]}
        </Label>
        <span>{REPORTS.verdict}</span>
      </p>
      <ul className="es-import__reasons">
        {verdict.reasons.map((reason, at) => (
          <li key={at}>{reason}</li>
        ))}
      </ul>
      {grader === undefined || verdict.checks.length === 0 ? null : <VerdictChecks verdict={verdict} grader={grader} />}
    </div>
  )
}

/**
 * The verdict, check by check (ARCHITECTURE §8.5 rule 10, ASSESSMENT §5.8): each check with a word and a mark, the bound it was held to, and a badge that
 * says who checked it, "re-checked here" or "attested by grader x.y.z", so that the learner sees which is which. A check that the stage requires says so.
 */
function VerdictChecks({ verdict, grader }: { verdict: Verdict; grader: string }) {
  return (
    <div className="es-verdict-checks">
      <h4 className="es-verdict-checks__heading">{REPORTS.checks}</h4>
      <ul className="es-rule__checks" aria-label={REPORTS.checksLabel}>
        {verdict.checks.map((check, at) => (
          <li key={`${check.how}:${check.id}:${at}`} className="es-check" data-status={check.verdict} data-check={check.id} data-how={check.how}>
            <span className="es-check__id">{check.id}</span>
            <span className="es-check__result">
              <Icon name={CHECK_MARKS[check.verdict]} className="es-rule__mark" />
              <span>{CHECK_WORDS[check.verdict]}</span>
            </span>
            <span className="es-check__bound">{check.bound}</span>
            <span className="es-check__badge">{check.how === 're-checked' ? REPORTS.recheckedHere : `${REPORTS.attestedBy} ${grader}`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
