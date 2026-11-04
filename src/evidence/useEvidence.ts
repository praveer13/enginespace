/**
 * `useEvidence()`: the evidence ledger, for React (ARCHITECTURE §7, D-024).
 *
 * A page calls the hook and gets the ledger as it stands (`events`, `receipts`, `working`, the status) together with the
 * actions that change it (`append`, `setWorking`, `exportLedger`, `importLedger`, `undoImport`, `reset`). Every component
 * shares one engine for the tab, and the engine opens its store the first time a component subscribes. That is on purpose:
 * the front page writes nothing (D-038), so it never calls the hook and never opens IndexedDB, and the engine's code stays
 * out of the first-paint closure (ARCHITECTURE §6.10) because only lazily loaded pages import this module.
 *
 * Until the store is open the hook returns `NOT_READY`: `ready` is false and the ledger is empty. A page shows what it
 * needs without waiting, and an action asked early waits for the engine. The server render sees the same state.
 *
 * Nothing derived is stored (ASSESSMENT §3.3): the hook hands over events, and the page computes counts, states and weights
 * from them when it draws.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { systemClock, uuidFactory } from '@es/ledger'
import type { Draft, ImportMode, Json, Kind } from '@es/ledger'
import { createEvidence, NOT_READY } from './engine'
import type {
  AppendResult,
  EvidenceDeps,
  EvidenceEngine,
  EvidenceSnapshot,
  ExportResult,
  ImportResult,
  PreviewResult,
  ResetResult,
  UndoResult,
  WorkingResult,
} from './engine'
import { IdbStore } from './idb-store'
import { setReadOnlyNotice } from './notice'

export interface EvidenceActions {
  /** Stamps an event and writes it. A graded one makes the browser asked, once, to keep the learner's storage. */
  append<K extends Kind>(draft: Draft<K> & { kind: K }): Promise<AppendResult<K>>
  /** A setting, a draft or a remembered position, by `<namespace>:<name>`. The latest write wins. Never evidence. */
  setWorking(key: string, value: Json): Promise<WorkingResult>
  deleteWorking(key: string): Promise<WorkingResult>
  /** The ledger as a file; pass it to `saveFile` (export.ts). */
  exportLedger(options?: { gzip?: boolean }): Promise<ExportResult>
  /** What an import would do, with nothing written. */
  previewImport(text: string, mode: ImportMode): Promise<PreviewResult>
  /** Merge takes the union. Replace makes the ledger the file's. Both can be undone. */
  importLedger(text: string, mode: ImportMode): Promise<ImportResult>
  undoImport(checkpointId?: string): Promise<UndoResult>
  /** Erases the evidence, the receipts, the undo points and the working records. Offer an export first. */
  reset(): Promise<ResetResult>
  /** Reloads the page: what the read-only notice asks for. */
  reload(): void
}

export type Evidence = EvidenceSnapshot & EvidenceActions

/* ------------------------------------------------------------------------------------------------------------------ */
/* The engine of this tab                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

let overrides: Partial<EvidenceDeps> = {}
let booting: Promise<EvidenceEngine> | null = null
let engine: EvidenceEngine | null = null
let offEngine: (() => void) | null = null
const listeners = new Set<() => void>()

const notify = (): void => {
  for (const listener of [...listeners]) listener()
}

/** Tells the shell whether to show the reload prompt (notice.ts), which has to work before any page has opened the ledger. */
function publishNotice(snapshot: EvidenceSnapshot): void {
  setReadOnlyNotice(snapshot.readOnly && snapshot.reason !== undefined && snapshot.notice !== undefined ? { reason: snapshot.reason, text: snapshot.notice } : null)
}

/**
 * Replaces parts of what the engine is built from, before the first subscriber opens it: a test or a harness passes a store
 * with a throwaway database name, or a fixed clock. The app never calls this.
 */
export function configureEvidence(options: Partial<EvidenceDeps>): void {
  if (booting !== null) throw new Error('configureEvidence must run before the first useEvidence(): the engine is open already')
  overrides = options
}

/** Closes this tab's engine and forgets it, so the next subscriber opens a new one. For tests and harnesses. */
export function closeEvidence(): void {
  offEngine?.()
  engine?.close()
  engine = null
  offEngine = null
  booting = null
  overrides = {}
  setReadOnlyNotice(null)
  notify()
}

function browserDeps(): EvidenceDeps {
  return {
    store: new IdbStore(),
    clock: systemClock,
    newId: uuidFactory,
    tabId: uuidFactory(),
    storageManager: typeof navigator === 'undefined' ? null : (navigator.storage ?? null),
    reload: () => window.location.reload(),
  }
}

function boot(): Promise<EvidenceEngine> {
  if (booting === null) {
    const attempt = createEvidence({ ...browserDeps(), ...overrides }).then(
      (created) => {
        engine = created
        offEngine = created.subscribe(() => {
          publishNotice(created.getSnapshot())
          notify()
        })
        publishNotice(created.getSnapshot())
        notify()
        return created
      },
      (error: unknown) => {
        // Even the memory fallback failed: say so once, and let the next subscriber or action try again.
        console.error('The evidence ledger could not be opened.', error)
        if (booting === attempt) booting = null
        throw error
      },
    )
    booting = attempt
  }
  return booting
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  boot().catch(() => undefined)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): EvidenceSnapshot => (engine === null ? NOT_READY : engine.getSnapshot())
const getServerSnapshot = (): EvidenceSnapshot => NOT_READY

/** The actions wait for the engine, so a page may call one before the store is open. */
const ACTIONS: EvidenceActions = {
  // TypeScript cannot relate two instantiations of the conditional type `Draft<K>`, so the generic signature is stated by cast.
  append: (<K extends Kind>(draft: Draft<K> & { kind: K }) => boot().then((evidence) => evidence.append<K>(draft))) as EvidenceActions['append'],
  setWorking: (key, value) => boot().then((evidence) => evidence.setWorking(key, value)),
  deleteWorking: (key) => boot().then((evidence) => evidence.deleteWorking(key)),
  exportLedger: (options) => boot().then((evidence) => evidence.exportLedger(options)),
  previewImport: (text, mode) => boot().then((evidence) => evidence.previewImport(text, mode)),
  importLedger: (text, mode) => boot().then((evidence) => evidence.importLedger(text, mode)),
  undoImport: (checkpointId) => boot().then((evidence) => evidence.undoImport(checkpointId)),
  reset: () => boot().then((evidence) => evidence.reset()),
  reload: () => {
    if (engine !== null) engine.reload()
    else window.location.reload()
  },
}

export function useEvidence(): Evidence {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => ({ ...snapshot, ...ACTIONS }), [snapshot])
}
