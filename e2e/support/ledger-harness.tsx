/*
 * The page that e2e/ledger-conformance.spec.ts loads (W0-T11). The spec builds this file into one script with Vite, serves it
 * from a made-up origin that Playwright answers itself, and drives the engine through `window.__es`. Nothing here is part of
 * the site: the production build never sees this folder.
 *
 * It exposes three things, so the spec can say what it means in a line each:
 *   - the conformance suite of packages/ledger, run against `IdbStore` on a throwaway database for each case;
 *   - the raw store, and the raw IndexedDB API, for the checks only a browser can answer: a newer database, a version change,
 *     a crash between the two steps of a write;
 *   - the app side: `useEvidence()` mounted in a small React tree, and its actions, so that a second tab's write is seen where
 *     a page would see it, in the DOM.
 */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { RESOLVERS, stampEvent, systemClock, uuidFactory } from '@es/ledger'
import type { Checkpoint, CheckpointMeta, CommitResult, Draft, ImportMode, StoreContents, StoreInfo, StoreTx } from '@es/ledger'
import { makeAssert, STORE_CONFORMANCE_CASES } from '@es/ledger/conformance'
import { EvidenceNotice } from '@/evidence/EvidenceNotice'
import { deleteDatabase, IdbStore } from '@/evidence/idb-store'
import { readImportFile } from '@/evidence/import'
import { outboxEntry, stageTx } from '@/evidence/outbox'
import { closeEvidence, configureEvidence, useEvidence } from '@/evidence/useEvidence'
import type { Evidence } from '@/evidence/useEvidence'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The app side                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

let current: Evidence | null = null
const waiting: (() => void)[] = []
const firstSeen: Record<string, number> = {}
let root: Root | null = null

function Probe() {
  const evidence = useEvidence()
  current = evidence
  useEffect(() => {
    const now = Date.now()
    for (const event of evidence.events) if (!(event.id in firstSeen)) firstSeen[event.id] = now
    for (const resolve of waiting.splice(0)) resolve()
  }, [evidence])
  return (
    <section>
      <output data-testid="ready">{String(evidence.ready)}</output>
      <output data-testid="backend">{evidence.backend ?? 'none'}</output>
      <output data-testid="read-only">{String(evidence.readOnly)}</output>
      <output data-testid="reason">{evidence.reason ?? ''}</output>
      <output data-testid="notice">{evidence.notice ?? ''}</output>
      <output data-testid="count">{evidence.events.length}</output>
      <output data-testid="unsaved">{evidence.unsaved}</output>
      <output data-testid="persisted">{String(evidence.persisted)}</output>
      <output data-testid="working">{JSON.stringify([...evidence.working.keys()].sort())}</output>
      <output data-testid="checkpoints">{evidence.checkpoints.length}</output>
      <ol data-testid="events">
        {evidence.events.map((event) => (
          <li key={event.id} data-id={event.id}>
            {event.kind}
          </li>
        ))}
      </ol>
      <EvidenceNotice />
    </section>
  )
}

export interface MountOptions {
  dbName: string
  /** Every instant the engine reads is this one, so that two exports of one ledger can be compared byte for byte. */
  fixedAt?: string
}

/** Renders the probe on a store of its own, after closing any engine this page opened before. */
function mount(options: MountOptions): void {
  closeEvidence()
  current = null
  root?.unmount()
  const clock = options.fixedAt === undefined ? systemClock : { nowIso: () => options.fixedAt as string, tzOffsetMinutes: () => 0 }
  configureEvidence({ store: new IdbStore({ name: options.dbName }), clock })
  const container = document.getElementById('root')
  if (container === null) throw new Error('the page lost its #root element')
  root = createRoot(container)
  root.render(<Probe />)
}

/** The latest value of the hook, once the probe has rendered at least once. */
async function evidence(): Promise<Evidence> {
  if (current === null) await new Promise<void>((resolve) => waiting.push(resolve))
  return current as Evidence
}

let lastExport: { bytes: Uint8Array; filename: string } | null = null

/* ------------------------------------------------------------------------------------------------------------------ */
/* The raw store                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const stores = new Map<number, IdbStore>()
const versionChanges = new Map<number, number>()
let nextStore = 1

const unique = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function need(handle: number): IdbStore {
  const store = stores.get(handle)
  if (store === undefined) throw new Error(`no store ${handle}`)
  return store
}

function rawOpen(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      // A database created here, to be newer than the app's, has one store and nothing the app would know.
      if (!request.result.objectStoreNames.contains('x')) request.result.createObjectStore('x')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('raw open failed'))
    request.onblocked = () => reject(new Error('raw open is blocked by an open connection'))
  })
}

async function rawDump(name: string): Promise<{ version: number; stores: Record<string, unknown[]> }> {
  const db = await rawOpen(name)
  try {
    const out: Record<string, unknown[]> = {}
    for (const storeName of [...db.objectStoreNames]) {
      out[storeName] = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error ?? new Error('raw read failed'))
      })
    }
    return { version: db.version, stores: out }
  } finally {
    db.close()
  }
}

/** A store of the app, opened. The caller closes it, or lets the page go. */
async function openStore(name: string): Promise<{ handle: number; info: StoreInfo }> {
  const store = new IdbStore({ name })
  const handle = nextStore++
  stores.set(handle, store)
  versionChanges.set(handle, 0)
  store.onVersionChange(() => versionChanges.set(handle, (versionChanges.get(handle) ?? 0) + 1))
  return { handle, info: await store.open() }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The conformance suite                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Runs one case on fresh databases, and cleans them up. It resolves to null when the case passes, and to its message when not. */
async function runCase(index: number): Promise<string | null> {
  const conformanceCase = STORE_CONFORMANCE_CASES[index]
  if (conformanceCase === undefined) throw new Error(`no case ${index}`)
  const made: { name: string; store: IdbStore }[] = []
  const makeStore = (): IdbStore => {
    const name = unique('es-conformance')
    const store = new IdbStore({ name })
    made.push({ name, store })
    return store
  }
  try {
    await conformanceCase.run(makeStore, makeAssert())
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    for (const { name, store } of made) {
      store.close()
      await deleteDatabase(name).catch(() => undefined)
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the spec sees                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const harness = {
  caseNames: (): string[] => STORE_CONFORMANCE_CASES.map((conformanceCase) => conformanceCase.name),
  runCase,

  unique,
  rawDump,
  /** Opens a database at a version, which upgrades it when it is higher, and lets go of it. */
  rawUpgrade: async (name: string, version: number): Promise<void> => (await rawOpen(name, version)).close(),
  deleteDatabase: (name: string): Promise<void> => deleteDatabase(name),
  /** What another tab running a newer bundle would say on the channel. */
  postRaw: (message: unknown): void => {
    const channel = new BroadcastChannel('enginespace')
    channel.postMessage(message)
    channel.close()
  },

  openStore,
  storeCommit: (handle: number, tx: StoreTx): Promise<CommitResult> => need(handle).commit(tx, RESOLVERS),
  storeReadAll: (handle: number): Promise<StoreContents> => need(handle).readAll(),
  storeCheckpoints: (handle: number): Promise<CheckpointMeta[]> => need(handle).listCheckpoints(),
  storeCheckpoint: (handle: number, id: string): Promise<Checkpoint | undefined> => need(handle).readCheckpoint(id),
  versionChanges: (handle: number): number => versionChanges.get(handle) ?? 0,
  closeStore: (handle: number): void => need(handle).close(),

  /**
   * A write that stops after step one: the event waits in the outbox of a database and nothing more happens, as when a tab
   * dies between the two transactions. Returns the event's id.
   */
  stageOnly: async (name: string, draft: Draft): Promise<string> => {
    const { handle } = await openStore(name)
    const store = need(handle)
    const meta = (await store.readAll()).meta
    const dev = meta.deviceId ?? 'dev-crashed'
    const event = stampEvent({ clock: systemClock, newId: uuidFactory, dev }, draft)
    await store.commit(stageTx(outboxEntry(event, systemClock.nowIso(), dev)), RESOLVERS)
    store.close()
    return event.id
  },

  mount,
  unmount: (): void => {
    closeEvidence()
    current = null
    root?.unmount()
    root = null
  },
  ready: async (): Promise<void> => {
    await evidence()
  },
  /** When this page first showed an event, in the clock of the page. */
  seenAt: (id: string): number | null => firstSeen[id] ?? null,
  deviceId: async (): Promise<string | undefined> => (await evidence()).deviceId,

  append: async (draft: Draft) => {
    const startedAt = Date.now()
    const result = await (await evidence()).append(draft)
    return result.ok ? { ok: true as const, id: result.event.id, durable: result.durable, startedAt } : { ok: false as const, error: result.error }
  },
  setWorking: async (key: string, value: Parameters<Evidence['setWorking']>[1]) => (await evidence()).setWorking(key, value),
  deleteWorking: async (key: string) => (await evidence()).deleteWorking(key),
  exportLedger: async (gzip: boolean) => {
    const result = await (await evidence()).exportLedger({ gzip })
    if (!result.ok) return { ok: false as const, error: result.error }
    lastExport = { bytes: result.bytes, filename: result.filename }
    return {
      ok: true as const,
      text: result.text,
      filename: result.filename,
      mime: result.mime,
      bytes: result.bytes.byteLength,
      magic: [result.bytes[0], result.bytes[1]],
      events: result.file.events.length,
      receipts: result.file.receipts.length,
    }
  },
  /** Imports what the last export saved, through a File and the file reader, so the real gzip path runs. */
  importLastExport: async (mode: ImportMode) => {
    if (lastExport === null) throw new Error('nothing was exported yet')
    const read = await readImportFile(new File([lastExport.bytes as BlobPart], lastExport.filename))
    if (!read.ok) return read
    return (await evidence()).importLedger(read.text, mode)
  },
  importText: async (text: string, mode: ImportMode) => (await evidence()).importLedger(text, mode),
  previewText: async (text: string, mode: ImportMode) => (await evidence()).previewImport(text, mode),
  undoImport: async () => (await evidence()).undoImport(),
  reset: async () => (await evidence()).reset(),
}

export type Harness = typeof harness

;(window as unknown as { __es: Harness }).__es = harness
