/*
 * What a checked receipt is kept as (ARCHITECTURE §7.1, §7.2, §8.5 rule 10): the record that the `receipts` store holds, and the `receipt` event that
 * the ledger holds beside it.
 *
 *   record  the parsed receipt under its SHA-256, with the report of this check. The raw artifacts stay in the learner's bundle file.
 *   event   `receipt:<stage>`, with the receipt's hash, the challenge token it spent, the grader's version and a one-line summary of the machine. The token
 *           is spent by this event: `heldChallenges` reads it so (src/receipts/challenge.ts).
 *
 * The event holds no verdict, no `ok`, no `score` and no `provenance` (W2b-T23, schema version 2). What a receipt is worth is worked out when the ledger is
 * read, from the receipt and the newest report of its record (src/receipts/credit.ts, A§8.5 rule 10), and its weight is applied after that (A§7.3):
 * `gpu-verified` is 1.0, `assisted` and `practice` 0.3, and `gpu-unverified` nothing (ASSESSMENT §3.2). So a receipt that was brought back before the
 * site had a reference bank is credited once the bank is added, without being brought back again.
 *
 * The event is written for a receipt once. A receipt that is checked again, a re-import of the same file, adds a report to its record and no second
 * event: the first one spent the token, and a second would count the receipt twice.
 */
import { LIMITS } from '@es/ledger'
import type { Draft, IsoInstant, Json, LedgerEvent, ReceiptRecord } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { cut, storedReport } from '@es/verify'
import type { CheckedOutcome } from '@es/verify'
import { gpuLine } from './records'

const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

/** The machine, in one line of plain text: its GPUs as NVML names them, the engine and the driver. Never a host name or a path (A§9.5): no field it reads could hold one. */
export function environmentLine(receipt: Receipt): string {
  const { engine, driver } = receipt.environment
  const parts = [gpuLine(receipt), engine === undefined ? undefined : `${engine.name} ${engine.version}`, driver === undefined ? undefined : `driver ${driver.version}`]
  return cut(parts.filter((part) => part !== undefined).join(', '), LIMITS.lineChars)
}

/** The `receipt` event for a checked receipt, before the ledger stamps it. */
export function receiptDraft(outcome: CheckedOutcome): Draft<'receipt'> {
  const { receipt, receiptSha256 } = outcome
  return {
    kind: 'receipt',
    ref: `receipt:${receipt.stage}`,
    data: {
      receiptSha256,
      challenge: receipt.challenge.token,
      graderVersion: receipt.grader.version,
      environment: environmentLine(receipt),
    },
  }
}

/** The record for a checked receipt: the parsed receipt, and the report of this check at `at`. */
export function receiptRecord(outcome: CheckedOutcome, at: IsoInstant): ReceiptRecord {
  return { sha256: outcome.receiptSha256, receipt: toJson(outcome.receipt), reports: [{ at, report: toJson(storedReport(outcome.rules, outcome.sizes, outcome.argmax)) }] }
}

/** Whether the ledger already holds a `receipt` event for this receipt: it was kept before, and checking it again adds a report and no event. */
export const hasEventFor = (events: readonly LedgerEvent[], sha256: string): boolean =>
  events.some((event) => event.kind === 'receipt' && event.data.receiptSha256 === sha256)
