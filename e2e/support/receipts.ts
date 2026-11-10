/*
 * What the specs of /receipts share (W2-T06): a ledger written the way the page and the importer write it, and the means to put it into
 * the IndexedDB that the app made. The events are `stampEvent`'s, so one that broke the codec would throw here, and the receipt is the
 * synthetic sample of tests/schema/receipt-support.ts: no machine ran it, and its notes say so.
 */
import type { Page } from '@playwright/test'
import type { LedgerEvent, ReceiptRecord } from '../../packages/ledger'
import { Ledger, sampleRecord } from '../../tests/receipts/support'

const DAY = 86_400_000

/** The instant `days` days before now, at the hour given (UTC), as the ledger writes an instant. The browser runs in UTC (playwright.config.ts). */
export function daysAgo(days: number, hour = 10): string {
  const day = new Date(Date.now() - days * DAY)
  day.setUTCHours(hour, 30, 0, 0)
  return day.toISOString()
}

export interface Seeded {
  events: LedgerEvent[]
  receipts: ReceiptRecord[]
  /** The tokens of the three challenges, by state. */
  tokens: { open: string; used: string; expired: string }
  /** The synthetic receipt, as the store keeps it. */
  record: ReceiptRecord
}

/**
 * A ledger a learner could have: a challenge issued two days ago and waiting, one issued five days ago and used by the receipt the store
 * holds, and one issued twenty days ago and never used.
 */
export function seeded(): Seeded {
  const ledger = new Ledger()
  const record = sampleRecord((receipt) => {
    // The receipt answers the challenge that was used.
    receipt.createdAt = new Date(Date.now() - 4 * DAY).toISOString().replace(/\.\d{3}Z$/, 'Z')
  })
  const expired = ledger.challenge(daysAgo(20), 'tr4.sweep.s1', 11)
  const used = ledger.challengeFor(daysAgo(5), (record.receipt as { challenge: { token: string } }).challenge.token)
  const open = ledger.challenge(daysAgo(2), 'tr8.replay.s2', 13)
  ledger.receipt(daysAgo(4), used.data.token, record.sha256)
  return { events: ledger.events, receipts: [record], tokens: { open: open.data.token, used: used.data.token, expired: expired.data.token }, record }
}

/** Puts rows into the stores of the app's own database, which the page made when it first opened the ledger. */
export async function put(page: Page, rows: { events?: readonly LedgerEvent[]; receipts?: readonly ReceiptRecord[] }): Promise<void> {
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['events', 'receipts'], 'readwrite')
          for (const row of data.events ?? []) tx.objectStore('events').put(row)
          for (const row of data.receipts ?? []) tx.objectStore('receipts').put(row)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    rows,
  )
}
