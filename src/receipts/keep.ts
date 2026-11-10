/*
 * What a checked receipt is kept as (ARCHITECTURE §7.1, §7.2, §8.5 rule 10): the record that the `receipts` store holds, and the `receipt` event that
 * the ledger holds beside it.
 *
 *   record  the parsed receipt under its SHA-256, with the report of this check. The raw artifacts stay in the learner's bundle file.
 *   event   `receipt:<stage>`, with the receipt's hash, the challenge token it spent, a verdict for each check the grader ran, the grader's version
 *           and a one-line summary of the machine. The token is spent by this event: `heldChallenges` reads it so (src/receipts/challenge.ts).
 *
 * The event carries the provenance that the verdict names, and its weight is applied when the ledger is read and never stored (A§7.3). While rules
 * 7 to 10 are not built (W2-T08) the verdict is `gpu-unverified` for every receipt (packages/verify/report.ts), so the event is `ok: false`, at a
 * score of 0, and credits nothing. Each of the grader's checks is `attested` when the grader says it passed and `fail` when it says it did not:
 * this browser re-runs none of them yet, and says so by not calling any of them `pass`.
 *
 * The event is written for a receipt once. A receipt that is checked again, a re-import of the same file, adds a report to its record and no second
 * event: the first one spent the token, and a second would count the receipt twice.
 */
import { LIMITS } from '@es/ledger'
import type { Draft, IsoInstant, Json, LedgerEvent, ReceiptCheck, ReceiptRecord } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { cut, storedReport } from '@es/verify'
import type { CheckedOutcome } from '@es/verify'
import { gpuLine } from './records'

const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

/** What the receipt's own numbers for a check say, in one line: `value 0.995, bound 0.99`. A check with none has no bound to print. */
function boundOf(check: Receipt['checks'][number]): string | undefined {
  const parts = (
    [
      ['value', check.value],
      ['bound', check.bound],
      ['tolerance', check.tolerance],
      ['n', check.n],
    ] as const
  )
    .filter(([, number]) => number !== undefined)
    .map(([name, number]) => `${name} ${number}`)
  return parts.length === 0 ? undefined : cut(parts.join(', '), LIMITS.lineChars)
}

/**
 * The verdict of each check the grader ran, as the browser has it: `attested` for a check the grader says passed, and `fail` for one it says
 * did not. The event holds at most `LIMITS.checks` of them, and at least one: a receipt with more says how many are left out, and one with none
 * says that it has none, which is a failure of its own.
 */
export function checksOf(receipt: Receipt): ReceiptCheck[] {
  if (receipt.checks.length === 0) return [{ id: 'no-checks', verdict: 'fail', bound: 'the receipt lists no check' }]
  const verdict = (check: Receipt['checks'][number]): ReceiptCheck['verdict'] => (check.pass ? 'attested' : 'fail')
  const entry = (check: Receipt['checks'][number]): ReceiptCheck => {
    const bound = boundOf(check)
    return { id: check.id, verdict: verdict(check), ...(bound === undefined ? {} : { bound }) }
  }
  if (receipt.checks.length <= LIMITS.checks) return receipt.checks.map(entry)
  const shown = receipt.checks.slice(0, LIMITS.checks - 1)
  const left = receipt.checks.slice(LIMITS.checks - 1)
  const more: ReceiptCheck = {
    id: 'more-checks',
    verdict: left.some((check) => !check.pass) ? 'fail' : 'attested',
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
      checks: checksOf(receipt),
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
