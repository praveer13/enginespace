/**
 * Merge, import and undo (ARCHITECTURE §7.5, D-024): the rules that make two ledgers one, and the plans that carry an import
 * file into a store and back out of it.
 *
 * The events of two devices form a set with a join, and the join does not depend on the order of arrival:
 *   - Events are matched by id. The same id with the same content is one event, and nothing happens (a double import is a
 *     no-op).
 *   - The same id with other content is a clash. The earlier `at` stays and the other is flagged. When the instants are equal
 *     too, the smaller canonical JSON stays, so the rule is a total order on content. That makes the join commutative,
 *     associative and idempotent, and a ledger that was merged in any order is the same ledger.
 *   - Receipts are matched by SHA-256, and their verification reports are united.
 *
 * `planImport` and `planUndo` are pure: they take the ledger as it is and return the ledger it becomes, together with the one
 * transaction that gets a store there and, for an import, the checkpoint that undoes it. The caller reads the store, plans,
 * shows `summary` as a preview and commits `tx` with `RESOLVERS`. Nothing here reads a clock or draws an id: the caller
 * names the checkpoint and the time.
 */
import type {
  Checkpoint,
  EventId,
  IsoInstant,
  Ledger,
  LedgerEvent,
  ReceiptRecord,
  Resolvers,
  Sha256,
  StoreTx,
  VerificationReport,
  WorkingRecord,
} from './types'

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Canonical text                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * JSON with every object's keys sorted and no whitespace, so equal values always give the same text. It is the ledger's own
 * canonical form, for comparing records, ordering a clash and writing an export that is byte for byte the same each time. It is
 * not A§9.8's cross-language form for hashing. Like `JSON.stringify`, it leaves out members that are `undefined`.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return inner
    const source = inner as Record<string, unknown>
    // No prototype, so a key named `__proto__` (a value from a hand-edited file may have one) is a plain member.
    const sorted = Object.create(null) as Record<string, unknown>
    for (const key of Object.keys(source).sort(byText)) sorted[key] = source[key]
    return sorted
  })
}

export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || canonicalJson(a) === canonicalJson(b)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rules                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The export order of events: by `at`, then by `id`. */
export function compareEvents(a: LedgerEvent, b: LedgerEvent): number {
  return a.at !== b.at ? byText(a.at, b.at) : byText(a.id, b.id)
}

/** The export order of receipts: by SHA-256. */
export function compareReceipts(a: ReceiptRecord, b: ReceiptRecord): number {
  return byText(a.sha256, b.sha256)
}

/**
 * Which of two events with one id stays (A§7.5): the earlier `at`, and on a tie the smaller canonical JSON. It returns one of
 * the two objects it was given.
 */
export function canonicalEvent(a: LedgerEvent, b: LedgerEvent): LedgerEvent {
  if (a === b) return a
  if (a.at !== b.at) return a.at < b.at ? a : b
  return canonicalJson(b) < canonicalJson(a) ? b : a
}

function compareReports(a: VerificationReport, b: VerificationReport): number {
  return a.at !== b.at ? byText(a.at, b.at) : byText(canonicalJson(a), canonicalJson(b))
}

/**
 * Two records of one receipt become one: the reports of both, without repeats and in order (A§7.1: re-verification adds a
 * report). The receipt's SHA-256 is a hash of its content, so the two parsed receipts are the same; if a damaged file says
 * otherwise, the smaller canonical JSON stays.
 */
export function mergeReceiptRecord(a: ReceiptRecord, b: ReceiptRecord): ReceiptRecord {
  if (a.sha256 !== b.sha256) throw new Error(`cannot join receipts ${a.sha256} and ${b.sha256}`)
  const seen = new Map<string, VerificationReport>()
  for (const report of [...a.reports, ...b.reports]) seen.set(canonicalJson(report), report)
  return {
    sha256: a.sha256,
    receipt: canonicalJson(b.receipt) < canonicalJson(a.receipt) ? b.receipt : a.receipt,
    reports: [...seen.values()].sort(compareReports),
  }
}

/** A `working` record is last-writer-wins: the later `at`, then the larger device id, then the larger canonical JSON. */
export function lwwWorking(a: WorkingRecord, b: WorkingRecord): WorkingRecord {
  if (a === b) return a
  if (a.at !== b.at) return a.at > b.at ? a : b
  if (a.dev !== b.dev) return a.dev > b.dev ? a : b
  return canonicalJson(b) > canonicalJson(a) ? b : a
}

/** The rules a store applies on a conflict, in the form `LedgerStore.commit` takes. */
export const RESOLVERS: Resolvers = { event: canonicalEvent, receipt: mergeReceiptRecord, working: lwwWorking }

/* ------------------------------------------------------------------------------------------------------------------ */
/* Merge                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The union of the lists by id, with a clash settled by `canonicalEvent`, in export order. */
export function mergeEvents(...lists: Iterable<LedgerEvent>[]): LedgerEvent[] {
  const byId = new Map<EventId, LedgerEvent>()
  for (const list of lists) {
    for (const event of list) {
      const previous = byId.get(event.id)
      byId.set(event.id, previous === undefined ? event : canonicalEvent(previous, event))
    }
  }
  return [...byId.values()].sort(compareEvents)
}

/**
 * The union of the lists by SHA-256, with the reports of a repeated receipt united, in export order. A receipt seen once is
 * joined with itself, which puts its reports in order and drops a repeat, so every record that comes out is in normal form.
 */
export function mergeReceipts(...lists: Iterable<ReceiptRecord>[]): ReceiptRecord[] {
  const bySha = new Map<Sha256, ReceiptRecord>()
  for (const list of lists) {
    for (const record of list) {
      const previous = bySha.get(record.sha256) ?? record
      bySha.set(record.sha256, mergeReceiptRecord(previous, record))
    }
  }
  return [...bySha.values()].sort(compareReceipts)
}

/** The join of two ledgers. The result depends on the two sets and not on their order, and it is in normal form. */
export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  return { events: mergeEvents(a.events, b.events), receipts: mergeReceipts(a.receipts, b.receipts) }
}

/** A ledger in normal form: no repeated id, in export order. Two ledgers with the same content have the same normal form. */
export function normalizeLedger(ledger: Ledger): Ledger {
  return { events: mergeEvents(ledger.events), receipts: mergeReceipts(ledger.receipts) }
}

/** Whether two ledgers hold the same content, however their lists are ordered. */
export function sameLedger(a: Ledger, b: Ledger): boolean {
  return canonicalJson(normalizeLedger(a)) === canonicalJson(normalizeLedger(b))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Import and undo                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Merge takes the union. Replace makes the ledger exactly the file's, and a checkpoint lets the learner undo it (A§7.5). */
export type ImportMode = 'merge' | 'replace'

export interface ImportContext {
  /** The id the checkpoint gets, from the caller's id factory. */
  checkpointId: string
  at: IsoInstant
}

/** Two events with one id and different content: the one that stays, and the one that is flagged. */
export interface Clash {
  id: EventId
  kept: LedgerEvent
  flagged: LedgerEvent
}

/** What an import would do, for the preview. */
export interface ImportSummary {
  mode: ImportMode
  /** Events in the file, once each. */
  fileEvents: number
  /** Not in the ledger yet. */
  newEvents: number
  /** In the ledger already, with the same content. */
  sameEvents: number
  /** In the ledger already, with other content. */
  clashedEvents: number
  /** Replace only: in the ledger and not in the file. */
  removedEvents: number
  fileReceipts: number
  newReceipts: number
  /** In the ledger already, and the import would change the record. */
  changedReceipts: number
  removedReceipts: number
}

export interface ImportPlan {
  summary: ImportSummary
  /** One for each id that met other content, in the order of the file. In a merge `kept` is the canonical winner; in a replace it is the file's event. */
  clashes: Clash[]
  /** The ledger after the import. */
  next: Ledger
  /** The one commit that gets a store from the ledger as planned to `next`, checkpoint included. Empty when nothing changes. */
  tx: StoreTx
  /** What undoes the import, or null when it changes nothing, so a no-op never pushes a useful checkpoint out. */
  checkpoint: Checkpoint | null
}

/**
 * Plans an import of `file` into `current` (A§7.5). Merge adds what is new, keeps the earlier `at` on a clash and joins
 * receipts. Replace makes the ledger the file's. A file that repeats an id is settled by the same rule before it is compared.
 */
export function planImport(current: Ledger, file: Ledger, mode: ImportMode, context: ImportContext): ImportPlan {
  const merging = mode === 'merge'
  const fileEvents = mergeEvents(file.events)
  const fileReceipts = mergeReceipts(file.receipts)
  // A store holds one event per id, so this changes nothing for a ledger that was read from one.
  const currentEvents = mergeEvents(current.events)
  const currentReceipts = mergeReceipts(current.receipts)
  const stored = new Map(currentEvents.map((event) => [event.id, event]))
  const storedReceipts = new Map(currentReceipts.map((record) => [record.sha256, record]))

  const addedEventIds: EventId[] = []
  const restoredEvents: LedgerEvent[] = []
  const putEvents: LedgerEvent[] = []
  const deleteEventIds: EventId[] = []
  const clashes: Clash[] = []
  let sameEvents = 0
  for (const incoming of fileEvents) {
    const existing = stored.get(incoming.id)
    if (existing === undefined) {
      addedEventIds.push(incoming.id)
      putEvents.push(incoming)
    } else if (sameJson(existing, incoming)) {
      sameEvents += 1
    } else {
      const winner = merging ? canonicalEvent(existing, incoming) : incoming
      clashes.push({ id: incoming.id, kept: winner, flagged: winner === incoming ? existing : incoming })
      if (winner === incoming) {
        restoredEvents.push(existing)
        putEvents.push(incoming)
        // The store would keep the earlier of the two, which in a replace may be the stored one.
        if (!merging) deleteEventIds.push(incoming.id)
      }
    }
  }
  const inFile = new Set(fileEvents.map((event) => event.id))
  let removedEvents = 0
  if (!merging) {
    for (const existing of currentEvents) {
      if (inFile.has(existing.id)) continue
      removedEvents += 1
      deleteEventIds.push(existing.id)
      restoredEvents.push(existing)
    }
  }

  const addedReceiptIds: Sha256[] = []
  const restoredReceipts: ReceiptRecord[] = []
  const putReceipts: ReceiptRecord[] = []
  const deleteReceiptIds: Sha256[] = []
  let changedReceipts = 0
  for (const incoming of fileReceipts) {
    const existing = storedReceipts.get(incoming.sha256)
    if (existing === undefined) {
      addedReceiptIds.push(incoming.sha256)
      putReceipts.push(incoming)
      continue
    }
    const result = merging ? mergeReceiptRecord(existing, incoming) : incoming
    if (sameJson(result, existing)) continue
    changedReceipts += 1
    restoredReceipts.push(existing)
    putReceipts.push(incoming)
    if (!merging) deleteReceiptIds.push(incoming.sha256)
  }
  const receiptsInFile = new Set(fileReceipts.map((record) => record.sha256))
  let removedReceipts = 0
  if (!merging) {
    for (const existing of currentReceipts) {
      if (receiptsInFile.has(existing.sha256)) continue
      removedReceipts += 1
      deleteReceiptIds.push(existing.sha256)
      restoredReceipts.push(existing)
    }
  }

  const changed = addedEventIds.length + restoredEvents.length + addedReceiptIds.length + restoredReceipts.length > 0
  const checkpoint: Checkpoint | null = changed
    ? {
        id: context.checkpointId,
        reason: merging ? 'import-merge' : 'import-replace',
        at: context.at,
        addedEventIds,
        restoredEvents,
        addedReceiptIds,
        restoredReceipts,
      }
    : null

  const tx: StoreTx = {}
  if (deleteEventIds.length > 0) tx.deleteEventIds = deleteEventIds
  if (deleteReceiptIds.length > 0) tx.deleteReceiptIds = deleteReceiptIds
  if (putEvents.length > 0) tx.putEvents = putEvents
  if (putReceipts.length > 0) tx.putReceipts = putReceipts
  if (checkpoint !== null) tx.putCheckpoint = checkpoint

  return {
    summary: {
      mode,
      fileEvents: fileEvents.length,
      newEvents: addedEventIds.length,
      sameEvents,
      clashedEvents: clashes.length,
      removedEvents,
      fileReceipts: fileReceipts.length,
      newReceipts: addedReceiptIds.length,
      changedReceipts,
      removedReceipts,
    },
    clashes,
    next: merging ? mergeLedgers(current, { events: fileEvents, receipts: fileReceipts }) : { events: fileEvents, receipts: fileReceipts },
    tx,
    checkpoint,
  }
}

export interface UndoPlan {
  /** The ledger after the undo. */
  next: Ledger
  /** The one commit that undoes the import and drops its checkpoint. */
  tx: StoreTx
}

/**
 * Plans the undo of an import: the events and receipts it added go, and the originals of what it removed or replaced come
 * back. Whatever was written after the import stays, because the checkpoint names only what the import changed.
 */
export function planUndo(current: Ledger, checkpoint: Checkpoint): UndoPlan {
  const events = new Map(mergeEvents(current.events).map((event) => [event.id, event]))
  const receipts = new Map(mergeReceipts(current.receipts).map((record) => [record.sha256, record]))
  const deleteEventIds: EventId[] = []
  const putEvents: LedgerEvent[] = []
  const deleteReceiptIds: Sha256[] = []
  const putReceipts: ReceiptRecord[] = []

  for (const id of checkpoint.addedEventIds) {
    if (events.delete(id)) deleteEventIds.push(id)
  }
  for (const original of checkpoint.restoredEvents) {
    const existing = events.get(original.id)
    if (existing !== undefined && sameJson(existing, original)) continue
    // A record that is there with other content is deleted first, so the store's rule cannot keep it over the original.
    if (existing !== undefined) deleteEventIds.push(original.id)
    putEvents.push(original)
    events.set(original.id, original)
  }
  for (const sha256 of checkpoint.addedReceiptIds) {
    if (receipts.delete(sha256)) deleteReceiptIds.push(sha256)
  }
  for (const original of checkpoint.restoredReceipts) {
    const existing = receipts.get(original.sha256)
    if (existing !== undefined && sameJson(existing, original)) continue
    if (existing !== undefined) deleteReceiptIds.push(original.sha256)
    putReceipts.push(original)
    receipts.set(original.sha256, original)
  }

  const tx: StoreTx = { deleteCheckpointIds: [checkpoint.id] }
  if (deleteEventIds.length > 0) tx.deleteEventIds = deleteEventIds
  if (deleteReceiptIds.length > 0) tx.deleteReceiptIds = deleteReceiptIds
  if (putEvents.length > 0) tx.putEvents = putEvents
  if (putReceipts.length > 0) tx.putReceipts = putReceipts
  return { next: normalizeLedger({ events: [...events.values()], receipts: [...receipts.values()] }), tx }
}
