/*
 * What a receipt is worth, worked out when the ledger is read (ARCHITECTURE §8.5 rule 10, §7.3; W2b-T23).
 *
 * A `receipt` event holds the receipt's hash and the challenge it spent, and nothing about how the check came out (keep.ts). Its `ok`, its `score` and its
 * `provenance` are made here, from the receipt in the `receipts` store and the newest report of its record, by the verdict of packages/verify and with the
 * site's data as it stands now: a reference bank that the site gained after the receipt was brought back credits the receipt at once. The weight of the
 * provenance is applied later still, by whoever reads it (A§7.3). Nothing made here is written anywhere.
 *
 * A receipt event whose record is not in the ledger, is not a receipt this build can read, or has no report this build can read is `gpu-unverified`: an
 * event with nothing behind it credits nothing. A ledger of schema version 1 holds the fields that this replaces, and they are not read.
 */
import type { CreditedReceiptEvent, LedgerEvent, Provenance, ReceiptRecord } from '@es/ledger'
import { readStoredReport, verdictOfStored } from '@es/verify'
import type { PublishedGrader, SiteData } from '@es/verify'
import type { Receipt } from '@es/schema/receipt'
import { BANKS } from './declared'
import { PUBLISHED_GRADERS } from './graders'
import { latestReport, readReceipt } from './records'

/** What the site knows that a stored result may depend on: its reference banks. */
export const SITE_DATA: SiteData = { banks: BANKS }

/** An event as a reader sees it: a receipt carries what it is worth. */
export type CreditedEvent = Exclude<LedgerEvent, { kind: 'receipt' }> | CreditedReceiptEvent

export interface Credit {
  readonly ok: boolean
  readonly score: number
  readonly provenance: Provenance
}

const NONE: Credit = { ok: false, score: 0, provenance: 'gpu-unverified' }

/** Whether the receipt says it is synthetic, or came from a grader build that writes only synthetic fixtures. */
export function isSynthetic(receipt: Receipt, graders: readonly PublishedGrader[] = PUBLISHED_GRADERS): boolean {
  const ext = receipt.ext as Record<string, unknown> | undefined
  if (ext !== undefined && ext.synthetic === true) return true
  return graders.some((build) => build.synthetic === true && build.version === receipt.grader.version && build.sourceSha256 === receipt.grader.sourceSha256)
}

/** The provenance a record's receipt earns now, from its newest report. A synthetic receipt, which a test made and no run did, earns none. */
export function provenanceOf(record: ReceiptRecord | undefined, site: SiteData = SITE_DATA): Provenance {
  if (record === undefined) return 'gpu-unverified'
  const held = readReceipt(record)
  if (!held.ok) return 'gpu-unverified'
  if (isSynthetic(held.receipt)) return 'gpu-unverified'
  const newest = latestReport(held.reports)
  const report = newest === undefined ? null : readStoredReport(newest.report)
  return report === null ? 'gpu-unverified' : verdictOfStored(held.receipt, report, site).provenance
}

/** What a record is worth: credited unless the verdict is `gpu-unverified`, at a score of 1 (as every credited receipt has been). */
export function creditOf(record: ReceiptRecord | undefined, site: SiteData = SITE_DATA): Credit {
  const provenance = provenanceOf(record, site)
  return provenance === 'gpu-unverified' ? NONE : { ok: true, score: 1, provenance }
}

/**
 * The events of a ledger with each receipt event given what its receipt is worth. The other events are returned as they are, and a legacy receipt event's
 * stored fields are replaced, never read. The order is the ledger's.
 */
export function creditReceipts(events: readonly LedgerEvent[], records: readonly ReceiptRecord[], site: SiteData = SITE_DATA): CreditedEvent[] {
  const byHash = new Map(records.map((record) => [record.sha256, record]))
  return events.map((event): CreditedEvent => {
    if (event.kind !== 'receipt') return event
    // The fields of schema 1 are written over, never read: the spread puts the credit made here after whatever the stored event holds.
    return { ...event, ...creditOf(byHash.get(event.data.receiptSha256), site) }
  })
}
