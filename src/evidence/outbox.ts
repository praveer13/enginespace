/**
 * The write-ahead outbox (ARCHITECTURE §7.4, kernelspace's I9): how a graded result survives a crash.
 *
 * A graded result goes to the outbox first, as a record in the `working` store under `outbox:<event id>`, and then to
 * `events` in one transaction that also deletes the outbox record. The two steps are two transactions that the store runs
 * in the order they were made, so a crash between them leaves one of two states and never a third:
 *
 *   - neither step ran: nothing was written, and the learner saw nothing saved;
 *   - the first ran: the event waits in the outbox, and the next start flushes it (`recoverOutbox`);
 *   - both ran: the event is in `events` and the outbox record is gone.
 *
 * Flushing is idempotent, because an event is inserted by its id and the same id with the same content changes nothing. So a
 * tab that starts while another tab is between its two steps may flush that tab's entry, and the other tab's second step
 * then finds the work done. Nothing needs a lock.
 *
 * An outbox record is data from storage and is untrusted like an import: a record that does not decode as an event stays
 * where it is, untouched and counted, and never reaches `events`. Nothing here deletes what it cannot read.
 */
import { decodeEvent, decodeWorkingRecord } from '@es/ledger'
import type { DeviceId, EventId, IsoInstant, Json, LedgerEvent, StoreTx, WorkingRecord } from '@es/ledger'

export const OUTBOX_PREFIX = 'outbox:'

export const outboxKey = (id: EventId): string => `${OUTBOX_PREFIX}${id}`
export const isOutboxKey = (key: string): boolean => key.startsWith(OUTBOX_PREFIX)

/** An event as the JSON that a `working` record holds. An event is made of JSON values, so this changes nothing but the type. */
const asJson = (event: LedgerEvent): Json => JSON.parse(JSON.stringify(event)) as Json

/**
 * The record that holds an event while it waits. It is checked against the codec that reads working records, so a record
 * that would not read back is a bug found here, where the event is written, and not at the next start.
 */
export function outboxEntry(event: LedgerEvent, at: IsoInstant, dev: DeviceId): WorkingRecord {
  const record: WorkingRecord = { key: outboxKey(event.id), value: asJson(event), at, dev }
  const decoded = decodeWorkingRecord(record)
  if (!decoded.ok) throw new Error(`cannot stage the event ${event.id}: ${decoded.reason}`)
  return decoded.value
}

/** Step one: the event waits in the outbox. */
export const stageTx = (entry: WorkingRecord): StoreTx => ({ putWorking: [entry] })

/** Step two: the events are written and their outbox records go, in one transaction. */
export const settleTx = (events: readonly LedgerEvent[]): StoreTx => ({
  putEvents: [...events],
  deleteWorkingKeys: events.map((event) => outboxKey(event.id)),
})

/** An outbox record that did not decode as an event. */
export interface StuckEntry {
  key: string
  reason: string
}

export interface Recovered {
  /** The events to flush, each decoded. */
  events: LedgerEvent[]
  /** The outbox keys of those events, to delete in the same transaction. */
  keys: string[]
  /** The records that are left alone. */
  stuck: StuckEntry[]
}

/**
 * Sorts the `working` records into what a flush writes and what it leaves. A record is flushed when its value decodes as an
 * event whose id is the id in its key: a value filed under another id is somebody's mistake, and it stays.
 */
export function recoverOutbox(working: readonly WorkingRecord[]): Recovered {
  const out: Recovered = { events: [], keys: [], stuck: [] }
  for (const record of working) {
    if (!isOutboxKey(record.key)) continue
    const decoded = decodeEvent(record.value)
    if (!decoded.ok) {
      out.stuck.push({ key: record.key, reason: decoded.reason })
    } else if (outboxKey(decoded.value.id) !== record.key) {
      out.stuck.push({ key: record.key, reason: `the event ${decoded.value.id} is filed under another id` })
    } else {
      out.events.push(decoded.value)
      out.keys.push(record.key)
    }
  }
  return out
}
