/**
 * The evidence engine (ARCHITECTURE §7.4 and §7.5, D-024): everything that sits between a learner's graded result and the
 * IndexedDB store, in one place that does not know about React.
 *
 * `createEvidence(deps)` opens the store, reads the ledger and resolves with a running engine. Everything it touches outside
 * itself arrives in `deps` (the store, the clock, the id factory, the channel, the storage manager), so the tests run it on
 * the memory store with a fake channel, and the browser runs it on `IdbStore` with `BroadcastChannel`.
 *
 * How the pieces fit:
 *
 *   write     `append` stamps an event (packages/ledger), shows it at once, stages it in the outbox and writes it (outbox.ts),
 *             tells the other tabs (channel.ts), and asks for persistent storage after the first graded one.
 *   read      the store is the source of truth. The engine keeps what it last read, plus the events this tab has written
 *             that the store has not confirmed, and nothing that is derived: every status is computed from the events by
 *             whoever shows it (ASSESSMENT §3.3).
 *   tabs      another tab's `changed` message makes this tab read the store again, a few milliseconds later, so a burst of
 *             writes is one read. The channel never carries an event.
 *   guard     a newer `schemaVersion`, a newer IndexedDB version or an upgrade by another tab makes the engine read-only for
 *             good (guard.ts). Every write then refuses, and the snapshot carries the note that asks for a reload.
 *   files     `exportLedger`, `previewImport`, `importLedger` and `undoImport` (export.ts, import.ts).
 *
 * Writes that change the store (an append, an import, an undo, a reset, a working record) run one at a time, in the order
 * they were asked, on a promise queue. A write that fails leaves the store as it was: the commit is one transaction.
 */
import {
  GRADED_KINDS,
  lwwWorking,
  MemoryStore,
  mergeEvents,
  mergeReceipts,
  decodeWorkingRecord,
  planUndo,
  RESOLVERS,
  SCHEMA_VERSION,
  stampEvent,
} from '@es/ledger'
import type {
  CheckpointMeta,
  Clock,
  Draft,
  DeviceId,
  EventId,
  EventOf,
  IdFactory,
  ImportMode,
  ImportSummary,
  IsoInstant,
  Json,
  Kind,
  Ledger,
  LedgerEvent,
  LedgerStore,
  ReadOnlyReason,
  ReceiptRecord,
  StoreContents,
  StoreTx,
  WorkingRecord,
} from '@es/ledger'
import { openChannel } from './channel'
import type { ChannelLike, ChannelMessage } from './channel'
import { makeExport } from './export'
import type { ExportOutput } from './export'
import { createGuard, readOnlyNote } from './guard'
import { pickCheckpoint, planFromText, refuse, REFUSAL_MESSAGES } from './import'
import type { ImportPreview, Refused } from './import'
import { isOutboxKey, outboxEntry, recoverOutbox, settleTx, stageTx } from './outbox'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the engine is given, and what it gives                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The slice of `navigator.storage` that the engine uses. `persisted()` never prompts, and `persist()` may. */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>
  persist?(): Promise<boolean>
}

export interface EvidenceDeps {
  store: LedgerStore
  /** Used when the store cannot open, or its first read or commit fails. It defaults to a fresh memory store. */
  fallbackStore?: () => LedgerStore
  clock: Clock
  newId: IdFactory
  /** This tab's id, unique for this page load. */
  tabId: string
  /** This bundle's `SCHEMA_VERSION`. A test passes another to play an older or a newer bundle. */
  schemaVersion?: number
  /** `undefined` is BroadcastChannel where it exists, and `null` is no channel. */
  channelFactory?: ((name: string) => ChannelLike) | null
  storageManager?: StorageManagerLike | null
  /** What `reload()` does. The browser passes `() => location.reload()`. */
  reload?: () => void
  /** How long a burst of change messages waits before the store is read again. */
  refreshDelayMs?: number
}

export type Backend = 'idb' | 'memory'

/** What the engine knows, as one immutable value. A new object is made when anything in it changes. */
export interface EvidenceSnapshot {
  /** False until the store is open and read. The hook shows this state before the engine exists. */
  ready: boolean
  /** Where the evidence is kept. `memory` means IndexedDB failed, so nothing survives a reload: say so, and offer an export. */
  backend: Backend | null
  /** True once the engine has stopped writing (guard.ts). It stays true until the tab is reloaded. */
  readOnly: boolean
  reason?: ReadOnlyReason
  /** The prompt to show when read-only: what happened, that nothing is lost, and what to do. */
  notice?: string
  /** `navigator.storage.persisted()`, or null where it is unknown or unsupported. */
  persisted: boolean | null
  deviceId?: DeviceId
  /** Events this tab has written that the store has not confirmed. They are in `events` too. */
  unsaved: number
  /** Outbox records that did not decode as events. They are left alone in `working`. */
  stuck: number
  /** When the learner last exported (for the backup nudge of A§7.5). */
  lastExportAt?: IsoInstant
  /** The ledger, in export order: events by (`at`, `id`), receipts by SHA-256. */
  events: readonly LedgerEvent[]
  receipts: readonly ReceiptRecord[]
  /** Settings, drafts and the rest, by key, without the outbox. Never evidence. */
  working: ReadonlyMap<string, WorkingRecord>
  /** The imports that can be undone, newest first. */
  checkpoints: readonly CheckpointMeta[]
}

export const NOT_READY: EvidenceSnapshot = {
  ready: false,
  backend: null,
  readOnly: false,
  persisted: null,
  unsaved: 0,
  stuck: 0,
  events: [],
  receipts: [],
  working: new Map(),
  checkpoints: [],
}

export type AppendResult<K extends Kind = Kind> =
  | {
      ok: true
      event: EventOf<K>
      /** False when the store did not confirm the write. The event stays in `events`, and a later write or start retries it. */
      durable: boolean
    }
  | { ok: false; error: 'read-only' | 'closed'; detail: string }

export type WorkingResult = { ok: true } | { ok: false; error: 'read-only' | 'closed' | 'invalid'; detail: string }

export type PreviewResult = { ok: true; preview: ImportPreview } | Refused

export type ImportResult =
  | {
      ok: true
      summary: ImportSummary
      /** Ids that met other content, in a merge or a replace. */
      clashes: number
      /** Records the file repeated. */
      duplicates: number
      /** The checkpoint that undoes the import, or null when the import changed nothing. */
      checkpointId: string | null
    }
  | Refused

export type UndoResult = { ok: true; checkpointId: string } | Refused

export type ExportResult = ({ ok: true } & ExportOutput) | Refused

export type ResetResult = { ok: true } | { ok: false; error: 'read-only' | 'failed'; detail: string }

export interface EvidenceEngine {
  getSnapshot(): EvidenceSnapshot
  subscribe(listener: () => void): () => void
  /** Stamps and writes an event. Resolves when the store has it, or when it is clear that it will not. */
  append<K extends Kind>(draft: Draft<K> & { kind: K }): Promise<AppendResult<K>>
  /** Last writer wins. A key is `<namespace>:<name>`, such as `settings:reduced-motion`; `outbox:` is reserved. */
  setWorking(key: string, value: Json): Promise<WorkingResult>
  deleteWorking(key: string): Promise<WorkingResult>
  /** The ledger as a file. The same ledger, device and instant give the same bytes. */
  exportLedger(options?: { gzip?: boolean }): Promise<ExportResult>
  /** Plans an import and commits nothing. */
  previewImport(text: string, mode: ImportMode): Promise<PreviewResult>
  /** Imports a file, and keeps a checkpoint so the import can be undone. */
  importLedger(text: string, mode: ImportMode): Promise<ImportResult>
  /** Undoes an import: the newest by default. What was earned after it stays. */
  undoImport(checkpointId?: string): Promise<UndoResult>
  /** Erases the evidence, the receipts, the undo points and the working records. The device id stays. */
  reset(): Promise<ResetResult>
  /** Resolves when every write asked so far has finished and a scheduled read of the store has run. */
  flush(): Promise<void>
  reload(): void
  close(): void
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Constants                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How long a burst of change messages is coalesced [estimated]. A second tab shows a write well inside a second. */
export const REFRESH_DELAY_MS = 25

/** Ask for persistent storage at most this often, 30 days [estimated] as in kernelspace: a browser that refused will refuse again. */
const PERSIST_RETRY_MS = 30 * 24 * 60 * 60 * 1000

/** The working keys the engine keeps for itself. */
const EXPORT_KEY = 'export:last'
const PERSIST_KEY = 'device:persist'

const GRADED: ReadonlySet<Kind> = new Set<Kind>(GRADED_KINDS)

const noop = (): void => {}

const readOnlyDetail = (reason: ReadOnlyReason | undefined): string => (reason === undefined ? REFUSAL_MESSAGES['read-only'] : readOnlyNote(reason))

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The engine                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export async function createEvidence(deps: EvidenceDeps): Promise<EvidenceEngine> {
  const bundle = deps.schemaVersion ?? SCHEMA_VERSION
  const clock = deps.clock
  const refreshDelay = deps.refreshDelayMs ?? REFRESH_DELAY_MS

  let store = deps.store
  let fellBack = false
  let closed = false
  let ready = false

  /* ---- what the store holds, as last read ---- */
  let storedEvents: LedgerEvent[] = []
  let storedReceipts: ReceiptRecord[] = []
  let storedWorking = new Map<string, WorkingRecord>()
  let checkpoints: CheckpointMeta[] = []
  let deviceId: DeviceId | undefined
  let stuck = 0
  /* ---- what this tab has written that the store has not confirmed ---- */
  const pendingEvents = new Map<EventId, LedgerEvent>()
  const pendingWorking = new Map<string, WorkingRecord>()
  /* ---- status ---- */
  let backend: Backend | null = null
  let persisted: boolean | null = null
  let persistAsked = false
  let lastWorkingMs = 0

  const listeners = new Set<() => void>()
  let snapshot: EvidenceSnapshot = NOT_READY

  const guard = createGuard(bundle, () => emit())

  /** The ledger as the learner sees it: what the store holds, and what this tab has written on top. */
  function view(): Ledger {
    return {
      events: pendingEvents.size === 0 ? storedEvents : mergeEvents(storedEvents, pendingEvents.values()),
      receipts: storedReceipts,
    }
  }

  function build(): EvidenceSnapshot {
    const working = new Map<string, WorkingRecord>()
    for (const [key, record] of storedWorking) if (!isOutboxKey(key)) working.set(key, record)
    for (const [key, record] of pendingWorking) {
      const stored = working.get(key)
      working.set(key, stored === undefined ? record : lwwWorking(stored, record))
    }
    const exported = working.get(EXPORT_KEY)?.value
    const lastExportAt = isRecord(exported) && typeof exported.at === 'string' ? exported.at : undefined
    const ledger = view()
    return {
      ready,
      backend,
      readOnly: guard.readOnly,
      ...(guard.reason === undefined ? {} : { reason: guard.reason, notice: readOnlyNote(guard.reason) }),
      persisted,
      ...(deviceId === undefined ? {} : { deviceId }),
      unsaved: pendingEvents.size,
      stuck,
      ...(lastExportAt === undefined ? {} : { lastExportAt }),
      events: ledger.events,
      receipts: ledger.receipts,
      working,
      checkpoints,
    }
  }

  function emit(): void {
    if (closed) return
    snapshot = build()
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch (error) {
        // A listener that throws is the page's bug, and it must not break a write or keep the others from hearing.
        console.error('A listener of the evidence ledger threw.', error)
      }
    }
  }

  /* ---- the channel ---- */
  const channel = openChannel({ tabId: deps.tabId, schemaVersion: bundle, factory: deps.channelFactory })

  /* ---- writes, one at a time ---- */
  let queue: Promise<unknown> = Promise.resolve()
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.then(noop, noop)
    return run
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Reading the store                                                                                                */
  /* ---------------------------------------------------------------------------------------------------------------- */

  function applyContents(contents: StoreContents, list: CheckpointMeta[]): void {
    storedEvents = mergeEvents(contents.events)
    storedReceipts = mergeReceipts(contents.receipts)
    storedWorking = new Map(contents.working.map((record) => [record.key, record]))
    deviceId = contents.meta.deviceId ?? deviceId
    stuck = recoverOutbox(contents.working).stuck.length
    checkpoints = list
  }

  /** Reads the store again and publishes. Called from the queue. */
  async function refresh(): Promise<void> {
    // A closed connection (another tab took the database) or a newer data model cannot be read, and what is held stays.
    if (closed || guard.readOnly) return
    applyContents(await store.readAll(), await store.listCheckpoints())
    emit()
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleRefresh(): void {
    if (refreshTimer !== null || closed) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      enqueue(refresh).catch(noop)
    }, refreshDelay)
  }

  /** The ledger as the store holds it now, with this tab's unconfirmed events on top. Called from the queue. */
  async function currentLedger(): Promise<Ledger> {
    await refresh()
    return view()
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Opening                                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  // A holder, because TypeScript does not see an assignment made inside openAndLoad() and narrows a bare `let` to null.
  const versionWatch: { off: (() => void) | null } = { off: null }

  async function openAndLoad(): Promise<void> {
    const info = await store.open()
    backend = info.backend
    guard.storeInfo(info)
    versionWatch.off = store.onVersionChange(() => {
      guard.versionChange()
      emit()
    })
    // A newer bundle owns the data: read nothing and write nothing, so no field that this build does not know is dropped.
    if (guard.readOnly) return

    let contents = await store.readAll()
    const recovered = recoverOutbox(contents.working)
    // One commit: this device's id and the schema version when they are missing, and the events a crash left in the outbox.
    const tx: StoreTx = recovered.events.length > 0 ? settleTx(recovered.events) : {}
    if (contents.meta.deviceId === undefined) tx.putMetaIfAbsent = { deviceId: deps.newId(), createdAt: clock.nowIso() }
    if (info.schemaVersion === null || info.schemaVersion < bundle) tx.putMeta = { schemaVersion: bundle }
    if (Object.keys(tx).length > 0) {
      await store.commit(tx, RESOLVERS)
      contents = await store.readAll()
    }
    applyContents(contents, await store.listCheckpoints())
  }

  const early: ChannelMessage[] = []
  const offChannel = channel.subscribe((message) => {
    // Hold what arrives while the store is being read, so nothing between the read and the subscription is lost.
    if (!ready) early.push(message)
    else onMessage(message)
  })

  try {
    await openAndLoad()
  } catch {
    // IndexedDB is unavailable or failing: carry on in memory, so the page works and an export still saves the evidence.
    versionWatch.off?.()
    versionWatch.off = null
    try {
      store.close()
    } catch {
      // Already unusable.
    }
    store = deps.fallbackStore === undefined ? new MemoryStore() : deps.fallbackStore()
    fellBack = true
    await openAndLoad()
  }

  if (!fellBack && !guard.readOnly && deps.storageManager?.persisted !== undefined) {
    try {
      persisted = await deps.storageManager.persisted()
    } catch {
      // Unsupported: leave it unknown.
    }
  }
  ready = true
  emit()
  for (const message of early.splice(0)) onMessage(message)
  if (!guard.readOnly) channel.post({ t: 'hello' })

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Messages from the other tabs                                                                                     */
  /* ---------------------------------------------------------------------------------------------------------------- */

  function onMessage(message: ChannelMessage): void {
    if (closed) return
    // A message from a newer bundle makes this tab read-only: its events may hold what this build would drop.
    if (guard.message(message)) return
    if (message.t === 'changed') scheduleRefresh()
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Writing                                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Writes the events that are still unconfirmed, in one transaction with the deletion of their outbox records. */
  async function savePending(): Promise<void> {
    if (guard.readOnly || closed) return
    const events = [...pendingEvents.values()]
    if (events.length === 0) return
    try {
      await store.commit(settleTx(events), RESOLVERS)
    } catch {
      // They stay pending, and in the outbox when it was staged: the next write or the next start tries again.
      return
    }
    for (const event of events) pendingEvents.delete(event.id)
    storedEvents = mergeEvents(storedEvents, events)
    emit()
    channel.post({ t: 'changed', what: 'append' })
    void requestPersistence(events)
  }

  function workingStamp(): IsoInstant {
    // Last writer wins on `at`, so two writes in one millisecond must not tie: the later one is at least a millisecond on.
    lastWorkingMs = Math.max(Date.parse(clock.nowIso()), lastWorkingMs + 1)
    return new Date(lastWorkingMs).toISOString()
  }

  async function appendDraft(draft: Draft): Promise<AppendResult> {
    if (closed) return { ok: false, error: 'closed', detail: 'The evidence ledger is closed.' }
    if (guard.readOnly) return { ok: false, error: 'read-only', detail: readOnlyDetail(guard.reason) }
    if (deviceId === undefined) return { ok: false, error: 'read-only', detail: REFUSAL_MESSAGES['read-only'] }
    // A draft that breaks a rule throws here, where the bug is.
    const event = stampEvent({ clock, newId: deps.newId, dev: deviceId }, draft)
    const dev = deviceId
    pendingEvents.set(event.id, event)
    emit()
    const durable = await enqueue(async () => {
      if (guard.readOnly || closed) return false
      // A write queued before this one has saved it already, with the events that were waiting.
      if (!pendingEvents.has(event.id)) return true
      // Step one, the outbox, and step two, the events: two transactions that the store runs in the order they were made.
      let staged: Promise<void> = Promise.resolve()
      try {
        staged = store.commit(stageTx(outboxEntry(event, clock.nowIso(), dev)), RESOLVERS).then(noop, noop)
      } catch {
        // An entry that cannot be made is not a reason to lose the event: write it straight to `events`.
      }
      await savePending()
      await staged
      return !pendingEvents.has(event.id)
    })
    return { ok: true, event, durable }
  }

  async function saveWorking(record: WorkingRecord): Promise<void> {
    if (guard.readOnly || closed) return
    try {
      await store.commit({ putWorking: [record] }, RESOLVERS)
    } catch {
      return // It stays in `working` as shown, and the next read of the store shows the truth.
    }
    if (pendingWorking.get(record.key) === record) pendingWorking.delete(record.key)
    const stored = storedWorking.get(record.key)
    storedWorking.set(record.key, stored === undefined ? record : lwwWorking(stored, record))
    emit()
    channel.post({ t: 'changed', what: 'working' })
  }

  async function setWorking(key: string, value: Json): Promise<WorkingResult> {
    if (closed) return { ok: false, error: 'closed', detail: 'The evidence ledger is closed.' }
    if (guard.readOnly) return { ok: false, error: 'read-only', detail: readOnlyDetail(guard.reason) }
    if (deviceId === undefined) return { ok: false, error: 'read-only', detail: REFUSAL_MESSAGES['read-only'] }
    if (isOutboxKey(key)) return { ok: false, error: 'invalid', detail: 'The outbox: keys belong to the write path.' }
    const decoded = decodeWorkingRecord({ key, value, at: workingStamp(), dev: deviceId })
    if (!decoded.ok) return { ok: false, error: 'invalid', detail: decoded.reason }
    pendingWorking.set(key, decoded.value)
    emit()
    await enqueue(() => saveWorking(decoded.value))
    return { ok: true }
  }

  async function deleteWorking(key: string): Promise<WorkingResult> {
    if (closed) return { ok: false, error: 'closed', detail: 'The evidence ledger is closed.' }
    if (guard.readOnly) return { ok: false, error: 'read-only', detail: readOnlyDetail(guard.reason) }
    if (isOutboxKey(key)) return { ok: false, error: 'invalid', detail: 'The outbox: keys belong to the write path.' }
    pendingWorking.delete(key)
    storedWorking.delete(key)
    emit()
    await enqueue(async () => {
      if (guard.readOnly || closed) return
      try {
        await store.commit({ deleteWorkingKeys: [key] }, RESOLVERS)
      } catch {
        return // The key shows as deleted until the next read of the store, which shows the truth.
      }
      // A read of the store that ran between the delete above and this commit may have brought the key back.
      if (storedWorking.delete(key)) emit()
      channel.post({ t: 'changed', what: 'working' })
    })
    return { ok: true }
  }

  /**
   * Persistent storage (A§7.4): asked for once, after the first graded event, and not again for a while when a browser
   * refuses. `persisted()` never prompts. `persist()` may, in Firefox, and a dismissed prompt waits out `PERSIST_RETRY_MS`.
   */
  async function requestPersistence(events: readonly LedgerEvent[]): Promise<void> {
    const manager = deps.storageManager
    if (persistAsked || fellBack || guard.readOnly || manager == null || manager.persist === undefined) return
    if (!events.some((event) => GRADED.has(event.kind))) return
    persistAsked = true
    try {
      if (manager.persisted !== undefined) persisted = await manager.persisted()
      if (persisted !== true) {
        const asked = build().working.get(PERSIST_KEY)?.value
        const askedAt = isRecord(asked) && typeof asked.at === 'string' ? Date.parse(asked.at) : Number.NaN
        const recently = !Number.isNaN(askedAt) && Date.parse(clock.nowIso()) - askedAt < PERSIST_RETRY_MS
        if (!recently) {
          persisted = await manager.persist()
          await setWorking(PERSIST_KEY, { at: clock.nowIso(), granted: persisted })
        }
      }
      emit()
    } catch {
      // A refused or a failed request is not an error: the evidence is stored either way.
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Export, import and undo                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  async function exportLedger(options?: { gzip?: boolean }): Promise<ExportResult> {
    if (closed) return refuse('failed', 'The evidence ledger is closed.')
    // A newer data model cannot be read here, so an export would be a file with nothing in it. Reload, and the newer build exports.
    if (guard.readOnly && guard.reason !== 'versionchange') return refuse('read-only', readOnlyDetail(guard.reason))
    return enqueue(async (): Promise<ExportResult> => {
      const ledger = await currentLedger()
      const device = deviceId
      if (device === undefined) return refuse('read-only')
      const at = clock.nowIso()
      let output: ExportOutput
      try {
        output = await makeExport({ ledger, device, exportedAt: at, tz: clock.tzOffsetMinutes(at), gzip: options?.gzip })
      } catch (error) {
        return refuse('failed', error instanceof Error ? error.message : REFUSAL_MESSAGES.failed)
      }
      if (!guard.readOnly) {
        // The backup nudge counts the days since this (A§7.5). It is a working record, so it is never exported.
        const record = decodeWorkingRecord({ key: EXPORT_KEY, value: { at, events: output.file.events.length }, at: workingStamp(), dev: device })
        if (record.ok) {
          pendingWorking.set(EXPORT_KEY, record.value)
          await saveWorking(record.value)
        }
      }
      return { ok: true, ...output }
    })
  }

  async function previewImport(text: string, mode: ImportMode): Promise<PreviewResult> {
    if (closed) return refuse('failed', 'The evidence ledger is closed.')
    if (guard.readOnly) return refuse('read-only', readOnlyDetail(guard.reason))
    return enqueue(async (): Promise<PreviewResult> => {
      const ledger = await currentLedger()
      const planned = planFromText(text, ledger, mode, { checkpointId: 'preview', at: clock.nowIso() })
      return planned.ok ? { ok: true, preview: planned.planned.preview } : planned
    })
  }

  async function importLedger(text: string, mode: ImportMode): Promise<ImportResult> {
    if (closed) return refuse('failed', 'The evidence ledger is closed.')
    if (guard.readOnly) return refuse('read-only', readOnlyDetail(guard.reason))
    return enqueue(async (): Promise<ImportResult> => {
      if (guard.readOnly) return refuse('read-only', readOnlyDetail(guard.reason))
      // What this tab has written but the store has not confirmed becomes part of the ledger before the import is planned.
      await savePending()
      const ledger = await currentLedger()
      const planned = planFromText(text, ledger, mode, { checkpointId: deps.newId(), at: clock.nowIso() })
      if (!planned.ok) return planned
      const { plan, preview } = planned.planned
      try {
        // The checkpoint is written with the import, in one transaction, so a replace can always be undone.
        await store.commit(plan.tx, RESOLVERS)
      } catch {
        return refuse('failed')
      }
      await refresh().catch(scheduleRefresh)
      channel.post({ t: 'changed', what: 'import' })
      return {
        ok: true,
        summary: plan.summary,
        clashes: plan.clashes.length,
        duplicates: preview.duplicates,
        checkpointId: plan.checkpoint?.id ?? null,
      }
    })
  }

  async function undoImport(checkpointId?: string): Promise<UndoResult> {
    if (closed) return refuse('failed', 'The evidence ledger is closed.')
    if (guard.readOnly) return refuse('read-only', readOnlyDetail(guard.reason))
    return enqueue(async (): Promise<UndoResult> => {
      if (guard.readOnly) return refuse('read-only', readOnlyDetail(guard.reason))
      await savePending()
      const picked = pickCheckpoint(await store.listCheckpoints(), checkpointId)
      const checkpoint = picked === null ? undefined : await store.readCheckpoint(picked.id)
      if (checkpoint === undefined) return refuse('no-checkpoint')
      const plan = planUndo(await currentLedger(), checkpoint)
      try {
        await store.commit(plan.tx, RESOLVERS)
      } catch {
        return refuse('failed')
      }
      await refresh().catch(scheduleRefresh)
      channel.post({ t: 'changed', what: 'undo' })
      return { ok: true, checkpointId: checkpoint.id }
    })
  }

  async function reset(): Promise<ResetResult> {
    if (closed) return { ok: false, error: 'failed', detail: 'The evidence ledger is closed.' }
    if (guard.readOnly) return { ok: false, error: 'read-only', detail: readOnlyDetail(guard.reason) }
    return enqueue(async (): Promise<ResetResult> => {
      if (guard.readOnly) return { ok: false, error: 'read-only', detail: readOnlyDetail(guard.reason) }
      try {
        // `meta` stays: the device id and the data model's version describe this browser, not the learner.
        await store.commit({ clear: ['events', 'receipts', 'working', 'checkpoints'] }, RESOLVERS)
      } catch {
        return { ok: false, error: 'failed', detail: REFUSAL_MESSAGES.failed }
      }
      pendingEvents.clear()
      pendingWorking.clear()
      await refresh().catch(scheduleRefresh)
      channel.post({ t: 'changed', what: 'reset' })
      return { ok: true }
    })
  }

  async function flush(): Promise<void> {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
      await enqueue(refresh).catch(noop)
    }
    await enqueue(savePending)
  }

  function close(): void {
    if (closed) return
    closed = true
    if (refreshTimer !== null) clearTimeout(refreshTimer)
    refreshTimer = null
    listeners.clear()
    offChannel()
    channel.close()
    versionWatch.off?.()
    try {
      store.close()
    } catch {
      // Already closed.
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    // TypeScript cannot relate two instantiations of the conditional type `Draft<K>`, so the generic signature is stated here.
    append: appendDraft as EvidenceEngine['append'],
    setWorking,
    deleteWorking,
    exportLedger,
    previewImport,
    importLedger,
    undoImport,
    reset,
    flush,
    reload: () => deps.reload?.(),
    close,
  }
}
