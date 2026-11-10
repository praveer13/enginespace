import { Icon } from '@/design/components/Glyph'
import type { IconName } from '@/design/components/Glyph'
import { TapeLabel } from '@/design/components/TapeLabel'
import { RULES } from '@es/verify'
import type { RuleResult, RuleStatus, Verdict } from '@es/verify'
import { REPORTS, RULE_WORDS, VERDICT_WORDS } from './copy'

/*
 * The result of each verification rule, as a list (ARCHITECTURE §8.5): the rule's number and name, a word and a drawn mark for what it found, the
 * sentence it wrote, and, under it, the problems it named. It draws the report of a check that has just been made (ImportPanel) and the reports
 * that a receipt's page keeps (ReceiptDetail).
 *
 * A result is never a colour alone: it is a word, a mark and, for a rule that failed, the ribbon's red. Everything in a result came out of a
 * file someone else wrote, or out of a rule that quotes one, and it goes on the page as text and nothing else (A§12).
 */

const MARKS: Record<RuleStatus, IconName> = { pass: 'check', fail: 'alert', skipped: 'strike' }

/** The name of a rule, from the verifier's own table: a report names the rule by its id, and the table says what to call it. */
const NAMES: ReadonlyMap<string, string> = new Map(RULES.map((entry) => [entry.id, entry.name]))

function Rule({ result }: { result: RuleResult }) {
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
      {result.problems.length === 0 ? null : (
        <ul className="es-rule__problems">
          {result.problems.map((problem, at) => (
            <li key={at}>{problem}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function RuleList({ rules, label }: { rules: readonly RuleResult[]; label: string }) {
  return (
    <ol className="es-rules" aria-label={label}>
      {rules.map((result) => (
        <Rule key={result.id} result={result} />
      ))}
    </ol>
  )
}

/**
 * What the rules came to: the verdict, as a word on masking tape beside what it means, and the reasons under it, one sentence each. The verdict is
 * worked out when it is shown, from the rules and how many of them ran (`verdictOf`), and is never read out of a stored field.
 */
export function VerdictLine({ verdict }: { verdict: Verdict }) {
  return (
    <div className="es-import__verdict">
      <p className="es-import__verdict-line">
        <TapeLabel size="sm" tilt="none" className="es-import__worth">
          {VERDICT_WORDS[verdict.provenance]}
        </TapeLabel>
        <span>{REPORTS.verdict}</span>
      </p>
      <ul className="es-import__reasons">
        {verdict.reasons.map((reason, at) => (
          <li key={at}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
