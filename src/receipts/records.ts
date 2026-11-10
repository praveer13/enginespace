/*
 * Reading the receipts a ledger holds (ARCHITECTURE §7.1, §9.6; W2-T06).
 *
 * The `receipts` store keeps each parsed receipt under its SHA-256, with the reports of the times it was checked, and never the raw
 * artifacts, which stay in the learner's bundle file. The receipt is stored as JSON and read back as JSON, and the store checks only
 * that it is JSON of a bounded size (packages/ledger/codec.ts): an export file is a file the learner chose and may have edited. So this
 * page reads a record through the receipt's own schema, packages/schema's `receiptSchema`, and shows what passes. A record that fails it
 * is listed all the same, with the first reason, because it is in the learner's ledger and an export carries it.
 *
 * Nothing here says whether a receipt is good. Whether it passed its checks in this browser is the verdict, which is computed at read
 * time from the receipt and its reports (A§8.5 rule 10), and the worker and the verification rules that make it are W2-T07 and W2-T08.
 * What a record shows today is what the receipt says of itself, and what the grader says of its own checks.
 */
import type { ReceiptRecord, Sha256, VerificationReport } from '@es/ledger'
import { receiptSchema } from '@es/schema/receipt'
import type { Receipt } from '@es/schema/receipt'

export type HeldReceipt =
  | { readonly ok: true; readonly sha256: Sha256; readonly receipt: Receipt; readonly reports: readonly VerificationReport[] }
  | { readonly ok: false; readonly sha256: Sha256; readonly problem: string; readonly reports: readonly VerificationReport[] }

/** How many reasons a record that is not a receipt is told [estimated]: the first is where to look, and a long list is no more help. */
const REASONS = 3

/** A record read through the schema: the receipt it holds, or why it is not one. */
export function readReceipt(record: ReceiptRecord): HeldReceipt {
  const parsed = receiptSchema.safeParse(record.receipt)
  if (parsed.success) return { ok: true, sha256: record.sha256, receipt: parsed.data, reports: record.reports }
  const shown = parsed.error.issues.slice(0, REASONS).map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(the record)'}: ${issue.message}`)
  const more = parsed.error.issues.length - shown.length
  return { ok: false, sha256: record.sha256, problem: more > 0 ? `${shown.join('; ')} (and ${more} more)` : shown.join('; '), reports: record.reports }
}

/** The moment a receipt was made, in milliseconds; a record that is not a receipt has none. */
const madeAt = (held: HeldReceipt): number => (held.ok ? Date.parse(held.receipt.createdAt) : Number.NEGATIVE_INFINITY)

/** The receipts of a ledger, newest first, and the records that are not receipts after them, in the order of their hashes. */
export function heldReceipts(records: readonly ReceiptRecord[]): HeldReceipt[] {
  return records
    .map(readReceipt)
    .sort((a, b) => (madeAt(a) === madeAt(b) ? (a.sha256 < b.sha256 ? -1 : 1) : madeAt(b) - madeAt(a)))
}

/** The fragment of a receipt's address, `#<sha256>`, as the SHA-256 it names, or null for any other fragment. */
export function hashOfFragment(fragment: string): Sha256 | null {
  const found = /^#([0-9a-f]{64})$/.exec(fragment)
  return found === null ? null : found[1]
}

/** The id of a receipt as the page prints it: the first eight digits of its SHA-256. */
export const shortHash = (sha: string): string => sha.slice(0, 8)

/** The address of a receipt's detail (A§3.1): `/receipts#<sha256>`. */
export const detailAddress = (sha: Sha256) => ({ pathname: '/receipts', hash: sha })

/** How the grader's own checks came out, as it reported them. They are attestations until this browser re-checks the ones it can. */
export interface CheckSummary {
  readonly total: number
  readonly passed: number
  readonly failed: number
}

export function summarizeChecks(receipt: Receipt): CheckSummary {
  const passed = receipt.checks.filter((check) => check.pass).length
  return { total: receipt.checks.length, passed, failed: receipt.checks.length - passed }
}

/**
 * The GPUs of a run as a line: `2 × NVIDIA H100 80GB HBM3`, several kinds joined by a comma, and `no GPU` for a run on the laptop's CPU.
 * The name is NVML's, which is the truth of what ran (a rented "H100" may be an H200, ASSESSMENT §5.6).
 */
export function gpuLine(receipt: Receipt): string {
  const counts = new Map<string, number>()
  for (const gpu of receipt.environment.gpus) counts.set(gpu.name, (counts.get(gpu.name) ?? 0) + 1)
  if (counts.size === 0) return 'no GPU'
  return [...counts].map(([name, count]) => (count === 1 ? name : `${count} × ${name}`)).join(', ')
}

/** The newest report of a record, or undefined for one that was never checked. */
export function latestReport(reports: readonly VerificationReport[]): VerificationReport | undefined {
  let newest: VerificationReport | undefined
  for (const report of reports) if (newest === undefined || report.at > newest.at) newest = report
  return newest
}
