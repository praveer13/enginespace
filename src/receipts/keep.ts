/*
 * What a checked receipt is kept as (ARCHITECTURE §7.1, §7.2, §8.5 rule 10): the record that the `receipts` store holds, and the `receipt` event that
 * the ledger holds beside it.
 *
 *   record  the parsed receipt under its SHA-256, with the report of this check. The raw artifacts stay in the learner's bundle file.
 *   event   `receipt:<stage>`, with the receipt's hash, the challenge token it spent, a verdict for each check (the browser's own, passed or failed,
 *           and the grader's, attested or failed), the grader's version and a one-line summary of the machine. The token is spent by this event:
 *           `heldChallenges` reads it so (src/receipts/challenge.ts).
 *
 * The event carries the provenance that the verdict names, and its weight is applied when the ledger is read and never stored (A§7.3): `gpu-verified` is
 * 1.0, `assisted` and `practice` 0.3, and `gpu-unverified` nothing (ASSESSMENT §3.2). A receipt that is not credited is `ok: false`, at a score of 0.
 *
 * The event is written for a receipt once. A receipt that is checked again, a re-import of the same file, adds a report to its record and no second
 * event: the first one spent the token, and a second would count the receipt twice.
 */
import { LIMITS } from '@es/ledger'
import type { Draft, IsoInstant, Json, LedgerEvent, ReceiptCheck, ReceiptRecord } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { cut, storedReport } from '@es/verify'
import type { CheckedOutcome, Verdict } from '@es/verify'
import { gpuLine } from './records'

const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

/**
 * The verdict of each check, as the event keeps it: `pass` or `fail` for what this browser ran, `attested` for what the grader checked and said it
 * passed, and `fail` for what it said it did not pass. The event holds at most `LIMITS.checks` of them, and at least one: a verdict with more says how
 * many are left out, and one with none says that it has none, which is a failure of its own.
 */
export function checksOf(verdict: Verdict): ReceiptCheck[] {
  if (verdict.checks.length === 0) return [{ id: 'no-checks', verdict: 'fail', bound: 'the receipt lists no check' }]
  const entry = (check: Verdict['checks'][number]): ReceiptCheck => ({ id: check.id, verdict: check.verdict, bound: cut(check.bound, LIMITS.lineChars) })
  if (verdict.checks.length <= LIMITS.checks) return verdict.checks.map(entry)
  const shown = verdict.checks.slice(0, LIMITS.checks - 1)
  const left = verdict.checks.slice(LIMITS.checks - 1)
  const more: ReceiptCheck = {
    id: 'more-checks',
    verdict: left.some((check) => check.verdict === 'fail') ? 'fail' : left.every((check) => check.how === 'attested') ? 'attested' : 'pass',
    bound: `and ${left.length} more checks, not listed here`,
  }
  return [...shown.map(entry), more]
}

/** The machine, in one line of plain text: its GPUs as NVML names them, the engine and the driver. Never a host name or a path (A§9.5): no field it reads could hold one. */
export function environmentLine(receipt: Receipt): string {
  const { engine, driver } = receipt.environment
  const parts = [gpuLine(receipt), engine === undefined ? undefined : `${engine.name} ${engine.version}`, driver === undefined ? undefined : `driver ${driver.version}`]
  return cut(parts.filter((part) => part !== undefined).join(', '), LIMITS.lineChars)
}

/** The `receipt` event for a checked receipt, before the ledger stamps it. */
export function receiptDraft(outcome: CheckedOutcome): Draft<'receipt'> {
  const { receipt, receiptSha256, verdict } = outcome
  const ok = verdict.provenance !== 'gpu-unverified'
  return {
    kind: 'receipt',
    ref: `receipt:${receipt.stage}`,
    score: ok ? 1 : 0,
    ok,
    provenance: verdict.provenance,
    data: {
      receiptSha256,
      challenge: receipt.challenge.token,
      checks: checksOf(verdict),
      graderVersion: receipt.grader.version,
      environment: environmentLine(receipt),
    },
  }
}

/** The record for a checked receipt: the parsed receipt, and the report of this check at `at`. */
export function receiptRecord(outcome: CheckedOutcome, at: IsoInstant): ReceiptRecord {
  return { sha256: outcome.receiptSha256, receipt: toJson(outcome.receipt), reports: [{ at, report: toJson(storedReport(outcome.rules, outcome.sizes)) }] }
}

/** Whether the ledger already holds a `receipt` event for this receipt: it was kept before, and checking it again adds a report and no event. */
export const hasEventFor = (events: readonly LedgerEvent[], sha256: string): boolean =>
  events.some((event) => event.kind === 'receipt' && event.data.receiptSha256 === sha256)
