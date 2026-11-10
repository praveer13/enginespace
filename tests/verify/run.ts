/*
 * What the tests of rules 7 to 10 share (W2-T08): verifying a fixture, and finding a check in the result.
 */
import { verifyBundle } from '@es/verify'
import type { CheckedOutcome, CheckResult, VerifyContext } from '@es/verify'
import type { Bundle } from '@es/schema/bundle'
import { fileOf } from './support'

/** Verifies a bundle in a context and returns the receipt-reading outcome: the test fails if the file was refused. */
export async function verify(bundle: Bundle, context: VerifyContext): Promise<CheckedOutcome> {
  const outcome = await verifyBundle(fileOf(bundle), context)
  if (outcome.kind !== 'checked') throw new Error(`the file was refused: ${JSON.stringify(outcome.rules.filter((rule) => rule.status !== 'pass').map((rule) => `${rule.id}: ${rule.summary} ${rule.problems.join(' ')}`))}`)
  return outcome
}

/** A check of rules 7 to 9 by its id, wherever it is, or undefined when no rule made it. */
export function checkOf(outcome: CheckedOutcome, id: string): CheckResult | undefined {
  for (const rule of outcome.rules) for (const check of rule.checks ?? []) if (check.id === id) return check
  return undefined
}

/** The ids of the checks that failed, in the order the rules made them. */
export const failed = (outcome: CheckedOutcome): string[] => outcome.rules.flatMap((rule) => (rule.checks ?? []).filter((check) => check.status === 'fail').map((check) => check.id))
