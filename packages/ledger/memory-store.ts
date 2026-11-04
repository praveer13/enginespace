/**
 * The memory store (ARCHITECTURE §7.1): the reference `LedgerStore`. It backs the tests, the conformance suite's first run, and
 * the app when IndexedDB is unavailable.
 *
 * Every read and write goes through `structuredClone`, so a caller that keeps a reference to something it stored, or something
 * it read, cannot change the store behind its back. A commit is applied to copies of the maps and swapped in only when it
 * completes, so a resolver that throws leaves nothing half written.
 *
 * No merge policy lives here: a clash is settled by the `Resolvers` that `commit` is given. The only rule the store owns is
 * the one the contract gives it, that it keeps the newest `LIMITS.checkpoints` checkpoints.
 */
import { sameJson } from './merge'
import { LIMITS } from './types'
import type {
  Checkpoint,
  CheckpointMeta,
  CommitResult,
  EventId,
  LedgerEvent,
  LedgerStore,
  Meta,
  MetaKey,
  ReceiptRecord,
  Resolvers,
  Sha256,
  StoreContents,
  StoreInfo,
  StoreTx,
  WorkingRecord,
} from './types'

export interface MemoryStoreSeed {
  events?: LedgerEvent[]
  receipts?: ReceiptRecord[]
  working?: WorkingRecord[]
  meta?: Partial<Meta>
  checkpoints?: Checkpoint[]
}

interface Data {
  events: Map<EventId, LedgerEvent>
  receipts: Map<Sha256, ReceiptRecord>
  working: Map<string, WorkingRecord>
  meta: Partial<Meta>
  checkpoints: Map<string, Checkpoint>
}

const clone = <T>(value: T): T => structuredClone(value)

/** Newest first: by `at`, then by `id`, both descending. */
const newestFirst = (a: Checkpoint, b: Checkpoint): number => (a.at !== b.at ? (a.at < b.at ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

export function checkpointMeta(checkpoint: Checkpoint): CheckpointMeta {
  return {
    id: checkpoint.id,
    reason: checkpoint.reason,
    at: checkpoint.at,
    addedEvents: checkpoint.addedEventIds.length,
    restoredEvents: checkpoint.restoredEvents.length,
    addedReceipts: checkpoint.addedReceiptIds.length,
    restoredReceipts: checkpoint.restoredReceipts.length,
  }
}

export class MemoryStore implements LedgerStore {
  readonly backend = 'memory' as const
  private data: Data
  private readonly listeners = new Set<() => void>()
  private closed = false

  constructor(seed: MemoryStoreSeed = {}) {
    this.data = {
      events: new Map((seed.events ?? []).map((event) => [event.id, clone(event)])),
      receipts: new Map((seed.receipts ?? []).map((record) => [record.sha256, clone(record)])),
      working: new Map((seed.working ?? []).map((record) => [record.key, clone(record)])),
      meta: clone(seed.meta ?? {}),
      checkpoints: new Map((seed.checkpoints ?? []).map((checkpoint) => [checkpoint.id, clone(checkpoint)])),
    }
  }

  async open(): Promise<StoreInfo> {
    this.closed = false
    return { backend: 'memory', schemaVersion: this.data.meta.schemaVersion ?? null, readOnly: false }
  }

  async readAll(): Promise<StoreContents> {
    return {
      events: [...this.data.events.values()].map(clone),
      receipts: [...this.data.receipts.values()].map(clone),
      working: [...this.data.working.values()].map(clone),
      meta: clone(this.data.meta),
    }
  }

  async commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    if (this.closed) throw new Error('MemoryStore is closed')
    const next: Data = {
      events: new Map(this.data.events),
      receipts: new Map(this.data.receipts),
      working: new Map(this.data.working),
      meta: { ...this.data.meta },
      checkpoints: new Map(this.data.checkpoints),
    }
    const eventIds = new Set<EventId>()
    const clashIds = new Set<EventId>()
    const receiptIds = new Set<Sha256>()
    const workingKeys = new Set<string>()
    const metaClaimed: MetaKey[] = []

    // 1. clear
    for (const name of tx.clear ?? []) next[name].clear()
    // 2. deletes
    for (const id of tx.deleteEventIds ?? []) next.events.delete(id)
    for (const sha256 of tx.deleteReceiptIds ?? []) next.receipts.delete(sha256)
    for (const key of tx.deleteWorkingKeys ?? []) next.working.delete(key)
    for (const key of tx.deleteMeta ?? []) delete next.meta[key]
    for (const id of tx.deleteCheckpointIds ?? []) next.checkpoints.delete(id)
    // 3. puts
    for (const incoming of tx.putEvents ?? []) {
      const existing = next.events.get(incoming.id)
      if (existing === undefined) {
        next.events.set(incoming.id, clone(incoming))
        eventIds.add(incoming.id)
      } else if (!sameJson(existing, incoming)) {
        clashIds.add(incoming.id)
        const winner = resolve.event(clone(existing), clone(incoming))
        if (!sameJson(winner, existing)) {
          next.events.set(incoming.id, clone(winner))
          eventIds.add(incoming.id)
        }
      }
    }
    for (const incoming of tx.putReceipts ?? []) {
      const existing = next.receipts.get(incoming.sha256)
      if (existing === undefined) {
        next.receipts.set(incoming.sha256, clone(incoming))
        receiptIds.add(incoming.sha256)
      } else if (!sameJson(existing, incoming)) {
        const joined = resolve.receipt(clone(existing), clone(incoming))
        if (!sameJson(joined, existing)) {
          next.receipts.set(incoming.sha256, clone(joined))
          receiptIds.add(incoming.sha256)
        }
      }
    }
    for (const incoming of tx.putWorking ?? []) {
      const existing = next.working.get(incoming.key)
      if (existing === undefined) {
        next.working.set(incoming.key, clone(incoming))
        workingKeys.add(incoming.key)
      } else if (!sameJson(existing, incoming)) {
        const winner = resolve.working(clone(existing), clone(incoming))
        if (!sameJson(winner, existing)) {
          next.working.set(incoming.key, clone(winner))
          workingKeys.add(incoming.key)
        }
      }
    }
    Object.assign(next.meta, clone(tx.putMeta ?? {}))
    const claims = tx.putMetaIfAbsent ?? {}
    for (const key of Object.keys(claims) as MetaKey[]) {
      // A key that putMeta wrote in this commit counts as present.
      if (next.meta[key] !== undefined) continue
      Object.assign(next.meta, { [key]: clone(claims[key]) })
      metaClaimed.push(key)
    }
    if (tx.putCheckpoint !== undefined) {
      next.checkpoints.set(tx.putCheckpoint.id, clone(tx.putCheckpoint))
      const kept = [...next.checkpoints.values()].sort(newestFirst).slice(0, LIMITS.checkpoints)
      next.checkpoints = new Map(kept.map((checkpoint) => [checkpoint.id, checkpoint]))
    }

    this.data = next
    return { eventIds: [...eventIds], clashIds: [...clashIds], receiptIds: [...receiptIds], workingKeys: [...workingKeys], metaClaimed }
  }

  async listCheckpoints(): Promise<CheckpointMeta[]> {
    return [...this.data.checkpoints.values()].sort(newestFirst).map(checkpointMeta)
  }

  async readCheckpoint(id: string): Promise<Checkpoint | undefined> {
    const found = this.data.checkpoints.get(id)
    return found === undefined ? undefined : clone(found)
  }

  onVersionChange(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  close(): void {
    this.closed = true
  }

  /** For a test: behave as if another context upgraded the database. */
  simulateVersionChange(): void {
    this.close()
    for (const callback of [...this.listeners]) callback()
  }
}
