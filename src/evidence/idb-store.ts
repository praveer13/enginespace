/**
 * IdbStore: the IndexedDB `LedgerStore` (ARCHITECTURE §7.1, D-024).
 *
 * The database is `enginespace`, at IndexedDB version 1, with the five stores of §7.1: `events`, `receipts`, `working`,
 * `meta` and `checkpoints`. `meta.schemaVersion` is the data model's version and is a different number from the IndexedDB
 * version; both can put a bundle into read-only mode (guard.ts). It keeps the contract of packages/ledger/conformance.ts,
 * which a Playwright spec runs against it in a real browser (e2e/ledger-conformance.spec.ts).
 *
 * The rules this file follows:
 *   - One IndexedDB transaction for each `commit`, over only the stores it touches, so a commit is all or nothing. Requests
 *     are placed in the transaction's first task or from a request's callback and never after an `await`, because a
 *     transaction commits itself as soon as it has no request left.
 *   - A commit applies the same order as the memory store: clear, deletes, puts. A put to a key that already holds a record
 *     goes through the `Resolvers` that the caller passes, and this file holds no merge policy of its own.
 *   - What the memory store does record by record, this store does id by id: it reads the stored record once, then folds the
 *     records of the batch that share the id into it in their order, and writes the result once. So the two stores report the
 *     same `eventIds` and `clashIds` for the same batch, and two records with one id in one batch cannot race.
 *   - A resolver that throws, or any request that fails, aborts the transaction, and the commit rejects with that error.
 *   - Default durability. The outbox covers the window of a crash (outbox.ts).
 *
 * A newer database is not an error to recover from: `open()` reports it as read-only (`newer-idb`), and the app goes
 * read-only and asks for a reload (guard.ts). A browser with no IndexedDB, or a database that cannot be opened for another
 * reason, makes `open()` reject, and the engine falls back to the memory store (engine.ts).
 */
import { checkpointMeta, LIMITS, sameJson } from '@es/ledger'
import type {
  Checkpoint,
  CheckpointMeta,
  CommitResult,
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
} from '@es/ledger'

export const DB_NAME = 'enginespace'
/** The IndexedDB version of the database's layout. Bump it only when a store or an index changes (`createSchema`). */
export const IDB_VERSION = 1

const EVENTS = 'events'
const RECEIPTS = 'receipts'
const WORKING = 'working'
const META = 'meta'
const CHECKPOINTS = 'checkpoints'

/** The `meta` keys, each with the type its value must have. A row of any other key or type is not read. */
const META_TYPES: Readonly<Record<MetaKey, 'number' | 'string'>> = { schemaVersion: 'number', deviceId: 'string', createdAt: 'string' }
const isMetaKey = (key: string): key is MetaKey => Object.hasOwn(META_TYPES, key)

interface MetaRow {
  key: MetaKey
  value: unknown
}

export interface IdbStoreOptions {
  /** The database's name. A test names a throwaway one. */
  name?: string
  /** Injected for a test. It defaults to the global `indexedDB`. */
  factory?: IDBFactory
}

function createSchema(db: IDBDatabase, oldVersion: number): void {
  // Switch on oldVersion when a later version changes the layout, and create only what is missing.
  if (oldVersion < 1) {
    db.createObjectStore(EVENTS, { keyPath: 'id' })
    db.createObjectStore(RECEIPTS, { keyPath: 'sha256' })
    db.createObjectStore(WORKING, { keyPath: 'key' })
    db.createObjectStore(META, { keyPath: 'key' })
    db.createObjectStore(CHECKPOINTS, { keyPath: 'id' })
  }
}

/** Newest first: by `at`, then by `id`, both descending. The memory store orders checkpoints the same way. */
const newestFirst = (a: Checkpoint, b: Checkpoint): number => (a.at !== b.at ? (a.at < b.at ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [item])
    else group.push(item)
  }
  return groups
}

interface Folded<T> {
  value: T | undefined
  /** The record under the key is new, or another one replaced it. */
  changed: boolean
  /** A record met a different one under its key, whichever one stayed. */
  clashed: boolean
}

/**
 * What a run of incoming records does to the record stored under one key, one record at a time as the memory store does it:
 * the first one is inserted when the key is empty, an identical one changes nothing, and a different one meets the stored
 * record in `pick`, which returns the one to keep.
 */
function fold<T>(stored: T | undefined, incoming: readonly T[], pick: (stored: T, incoming: T) => T): Folded<T> {
  let value = stored
  let changed = false
  let clashed = false
  for (const next of incoming) {
    if (value === undefined) {
      value = next
      changed = true
    } else if (!sameJson(value, next)) {
      clashed = true
      const winner = pick(value, next)
      if (!sameJson(winner, value)) {
        value = winner
        changed = true
      }
    }
  }
  return { value, changed, clashed }
}

const nonEmpty = (list: readonly unknown[] | undefined): boolean => list !== undefined && list.length > 0
const definedEntries = (meta: Partial<Meta> | undefined): [MetaKey, Meta[MetaKey]][] =>
  Object.entries(meta ?? {}).filter((entry): entry is [MetaKey, Meta[MetaKey]] => isMetaKey(entry[0]) && entry[1] !== undefined)

export class IdbStore implements LedgerStore {
  readonly backend = 'idb' as const
  private readonly name: string
  private readonly factory: IDBFactory | undefined
  private db: IDBDatabase | null = null
  private readonly listeners = new Set<() => void>()

  constructor(options: IdbStoreOptions = {}) {
    this.name = options.name ?? DB_NAME
    this.factory = options.factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB)
  }

  open(): Promise<StoreInfo> {
    const factory = this.factory
    if (factory === undefined) return Promise.reject(new Error('IndexedDB is not available'))
    return new Promise<StoreInfo>((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = factory.open(this.name, IDB_VERSION)
      } catch (error) {
        reject(error)
        return
      }
      request.onupgradeneeded = (event) => createSchema(request.result, event.oldVersion)
      request.onerror = (event) => {
        const error = request.error
        // A database at a newer version belongs to a newer bundle: read-only, and never a fallback that would hide it.
        if (error?.name === 'VersionError') {
          event.preventDefault()
          resolve({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' })
          return
        }
        reject(error ?? new Error('IndexedDB open failed'))
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          // Another context wants to upgrade: let go of the connection first, or its upgrade waits for this tab. Then say so.
          db.close()
          if (this.db === db) this.db = null
          for (const listener of [...this.listeners]) listener()
        }
        db.onclose = () => {
          if (this.db === db) this.db = null
        }
        this.db = db
        this.readSchemaVersion(db).then(
          (schemaVersion) => resolve({ backend: 'idb', schemaVersion, readOnly: false }),
          (error: unknown) => {
            db.close()
            if (this.db === db) this.db = null
            reject(error)
          },
        )
      }
    })
  }

  private readSchemaVersion(db: IDBDatabase): Promise<number | null> {
    return new Promise((resolve, reject) => {
      try {
        const request = db.transaction(META, 'readonly').objectStore(META).get('schemaVersion')
        request.onsuccess = () => {
          const row = request.result as MetaRow | undefined
          resolve(typeof row?.value === 'number' ? row.value : null)
        }
        request.onerror = () => reject(request.error ?? new Error('meta read failed'))
      } catch (error) {
        reject(error)
      }
    })
  }

  private connection(): IDBDatabase {
    if (this.db === null) throw new Error('IdbStore is not open: it is closed, read-only, or another context took the database')
    return this.db
  }

  readAll(): Promise<StoreContents> {
    return new Promise<StoreContents>((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = this.connection().transaction([EVENTS, RECEIPTS, WORKING, META], 'readonly')
      } catch (error) {
        reject(error)
        return
      }
      const out: StoreContents = { events: [], receipts: [], working: [], meta: {} }
      const events = transaction.objectStore(EVENTS).getAll()
      events.onsuccess = () => {
        out.events = events.result as LedgerEvent[]
      }
      const receipts = transaction.objectStore(RECEIPTS).getAll()
      receipts.onsuccess = () => {
        out.receipts = receipts.result as ReceiptRecord[]
      }
      const working = transaction.objectStore(WORKING).getAll()
      working.onsuccess = () => {
        out.working = working.result as WorkingRecord[]
      }
      const meta = transaction.objectStore(META).getAll()
      meta.onsuccess = () => {
        for (const row of meta.result as MetaRow[]) {
          if (isMetaKey(row.key) && typeof row.value === META_TYPES[row.key]) Object.assign(out.meta, { [row.key]: row.value })
        }
      }
      transaction.oncomplete = () => resolve(out)
      transaction.onabort = () => reject(transaction.error ?? new Error('readAll aborted'))
      transaction.onerror = () => reject(transaction.error ?? new Error('readAll failed'))
    })
  }

  commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    return new Promise<CommitResult>((done, fail) => {
      const clear = tx.clear ?? []
      const touched = new Set<string>(clear)
      if (nonEmpty(tx.deleteEventIds) || nonEmpty(tx.putEvents)) touched.add(EVENTS)
      if (nonEmpty(tx.deleteReceiptIds) || nonEmpty(tx.putReceipts)) touched.add(RECEIPTS)
      if (nonEmpty(tx.deleteWorkingKeys) || nonEmpty(tx.putWorking)) touched.add(WORKING)
      if (nonEmpty(tx.deleteMeta) || definedEntries(tx.putMeta).length > 0 || definedEntries(tx.putMetaIfAbsent).length > 0) touched.add(META)
      if (nonEmpty(tx.deleteCheckpointIds) || tx.putCheckpoint !== undefined) touched.add(CHECKPOINTS)

      const result: CommitResult = { eventIds: [], clashIds: [], receiptIds: [], workingKeys: [], metaClaimed: [] }
      if (touched.size === 0) {
        done(result)
        return
      }

      let transaction: IDBTransaction
      try {
        transaction = this.connection().transaction([...touched], 'readwrite')
      } catch (error) {
        fail(error)
        return
      }
      let failure: unknown = null
      const abort = (error: unknown): void => {
        if (failure === null) failure = error
        try {
          transaction.abort()
        } catch {
          // The transaction has finished or is aborting already.
        }
      }
      transaction.oncomplete = () => done(result)
      transaction.onabort = () => fail(failure ?? transaction.error ?? new Error('commit aborted'))
      // A failed request reaches here first, and the abort event follows and rejects. Remember the cause.
      transaction.onerror = () => {
        if (failure === null) failure = transaction.error
      }
      // A throw in a request's callback becomes an abort, so a resolver that throws writes nothing.
      const guarded =
        (step: () => void) =>
        (): void => {
          try {
            step()
          } catch (error) {
            abort(error)
          }
        }

      try {
        const store = (name: string): IDBObjectStore => transaction.objectStore(name)

        // 1. clear
        for (const name of clear) store(name).clear()

        // 2. deletes
        if (nonEmpty(tx.deleteEventIds)) for (const id of tx.deleteEventIds ?? []) store(EVENTS).delete(id)
        if (nonEmpty(tx.deleteReceiptIds)) for (const sha256 of tx.deleteReceiptIds ?? []) store(RECEIPTS).delete(sha256)
        if (nonEmpty(tx.deleteWorkingKeys)) for (const key of tx.deleteWorkingKeys ?? []) store(WORKING).delete(key)
        if (nonEmpty(tx.deleteMeta)) for (const key of tx.deleteMeta ?? []) store(META).delete(key)
        if (nonEmpty(tx.deleteCheckpointIds)) for (const id of tx.deleteCheckpointIds ?? []) store(CHECKPOINTS).delete(id)

        // 3. puts
        if (nonEmpty(tx.putEvents)) {
          const events = store(EVENTS)
          for (const [id, incoming] of groupBy<LedgerEvent>(tx.putEvents ?? [], (event) => event.id)) {
            const get = events.get(id)
            get.onsuccess = guarded(() => {
              const folded = fold(get.result as LedgerEvent | undefined, incoming, resolve.event)
              if (folded.clashed) result.clashIds.push(id)
              if (folded.changed && folded.value !== undefined) {
                events.put(folded.value)
                result.eventIds.push(id)
              }
            })
          }
        }
        if (nonEmpty(tx.putReceipts)) {
          const receipts = store(RECEIPTS)
          for (const [sha256, incoming] of groupBy<ReceiptRecord>(tx.putReceipts ?? [], (record) => record.sha256)) {
            const get = receipts.get(sha256)
            get.onsuccess = guarded(() => {
              const folded = fold(get.result as ReceiptRecord | undefined, incoming, resolve.receipt)
              if (folded.changed && folded.value !== undefined) {
                receipts.put(folded.value)
                result.receiptIds.push(sha256 as Sha256)
              }
            })
          }
        }
        if (nonEmpty(tx.putWorking)) {
          const working = store(WORKING)
          for (const [key, incoming] of groupBy<WorkingRecord>(tx.putWorking ?? [], (record) => record.key)) {
            const get = working.get(key)
            get.onsuccess = guarded(() => {
              const folded = fold(get.result as WorkingRecord | undefined, incoming, resolve.working)
              if (folded.changed && folded.value !== undefined) {
                working.put(folded.value)
                result.workingKeys.push(key)
              }
            })
          }
        }
        if (touched.has(META)) {
          const meta = store(META)
          const written = new Set<MetaKey>()
          for (const [key, value] of definedEntries(tx.putMeta)) {
            meta.put({ key, value } satisfies MetaRow)
            written.add(key)
          }
          for (const [key, value] of definedEntries(tx.putMetaIfAbsent)) {
            // A key that putMeta wrote in this commit counts as present.
            if (written.has(key)) continue
            const get = meta.get(key)
            get.onsuccess = guarded(() => {
              if (get.result !== undefined) return
              meta.put({ key, value } satisfies MetaRow)
              result.metaClaimed.push(key)
            })
          }
        }
        if (tx.putCheckpoint !== undefined) {
          const checkpoints = store(CHECKPOINTS)
          checkpoints.put(tx.putCheckpoint)
          // The store keeps the newest few: read them back, after this put, and delete the rest.
          const all = checkpoints.getAll()
          all.onsuccess = guarded(() => {
            for (const old of (all.result as Checkpoint[]).sort(newestFirst).slice(LIMITS.checkpoints)) checkpoints.delete(old.id)
          })
        }
      } catch (error) {
        abort(error)
      }
    })
  }

  listCheckpoints(): Promise<CheckpointMeta[]> {
    return this.read(CHECKPOINTS, (store) => store.getAll()).then((rows) => (rows as Checkpoint[]).sort(newestFirst).map(checkpointMeta))
  }

  readCheckpoint(id: string): Promise<Checkpoint | undefined> {
    return this.read(CHECKPOINTS, (store) => store.get(id)).then((row) => row as Checkpoint | undefined)
  }

  /** One request in a transaction of its own. */
  private read(storeName: string, request: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      try {
        const issued = request(this.connection().transaction(storeName, 'readonly').objectStore(storeName))
        issued.onsuccess = () => resolve(issued.result)
        issued.onerror = () => reject(issued.error ?? new Error(`${storeName} read failed`))
      } catch (error) {
        reject(error)
      }
    })
  }

  onVersionChange(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  close(): void {
    this.db?.close()
    this.db = null
  }
}

/**
 * Deletes a database, for a test that makes throwaway ones. It rejects when a connection to it is still open, because the
 * deletion would wait for that connection and never finish.
 */
export function deleteDatabase(name: string, factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<void> {
  if (factory === undefined) return Promise.reject(new Error('IndexedDB is not available'))
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('deleteDatabase failed'))
    request.onblocked = () => reject(new Error(`deleteDatabase(${name}) is blocked by an open connection`))
  })
}

