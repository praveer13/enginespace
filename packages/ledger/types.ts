/**
 * The ledger's data model (ARCHITECTURE §7, D-024): the event envelope and the ten kinds, the records of the other stores, the
 * store contract that the memory store and the IndexedDB store both keep, and the export file.
 *
 * This file is types and constants only, so importing a type costs a bundle nothing. codec.ts holds the zod schemas that
 * decode untrusted input into these types, and each schema's output is checked against its type here at compile time.
 *
 * Three rules shape the model.
 *   - Evidence is append-only, and a write never modifies a stored event. The one exception is an import that meets a different
 *     event under a stored id: the canonical rule in merge.ts keeps the earlier `at`, which may be the file's, and the
 *     checkpoint keeps the original, so the import can be undone.
 *   - An event stores its provenance and never a weight (A§7.3). Weights are applied when the ledger is read.
 *   - Nothing derived is stored. KCs come from a ref-to-KC map at read time, and so does every status (A§4.5, ASSESSMENT §3.3).
 *
 * Every limit in LIMITS is a design parameter [estimated]: it bounds what a hand-edited import file can make the tab hold.
 */
import type { Provenance } from './provenance'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Primitives                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A UTC instant in `Date#toISOString()` form, such as `2026-11-04T09:30:00.123Z`. It is 24 characters and sorts as text. */
export type IsoInstant = string
/** The learner's calendar day, `YYYY-MM-DD`, computed from `at` and `tz` once, when the event is written. */
export type LocalDay = string
/** An event's id, unique in a ledger. Ids are keys of Maps in this package: never index a plain object with one. */
export type EventId = string
/** A device's id, a random id per browser profile (the `meta` store's `deviceId`). */
export type DeviceId = string
/** Lowercase hex SHA-256: 64 digits. */
export type Sha256 = string

/** Any JSON value. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/**
 * The version of the data model that the stores and the export file carry (A§7.1's `meta.schemaVersion`). Bump it when an
 * event's fields, a kind or a ref form changes. A bundle that finds a newer version goes read-only and asks for a reload
 * (A§7.4), and an export from a newer build is refused, so no build ever drops a field it does not know.
 */
export const SCHEMA_VERSION = 1
/** The envelope's `v`. */
export const EVENT_VERSION = 1
/** The `schema` field of an export file (A§7.5). */
export const EXPORT_SCHEMA = 'enginespace/export@1'

/** What bounds the size and shape of untrusted input. Each is a design parameter [estimated]. */
export const LIMITS = {
  /** Characters in an event id, a device id and a check id. */
  idChars: 64,
  /** Characters in a ref. */
  refChars: 200,
  /** Characters in a `rev`, at least and at most. */
  revCharsMin: 4,
  revChars: 64,
  /** How far `tz` may be from UTC, in minutes: a day. */
  tzMinutes: 1440,
  /** The compressed action log of a `play` event. */
  actionsChars: 65_536,
  /** An item's answer, and a Prove reply, as the characters of their JSON. */
  answerChars: 4_096,
  /** The marks of a `trace-mark` event, as the characters of their JSON. */
  marksChars: 65_536,
  /** One line of text in an event: a bound, a grader version, an environment summary. */
  lineChars: 300,
  /** Check results in a `lab-check` or `receipt` event. */
  checks: 64,
  /** Seeds in a `lab-check` event. */
  seeds: 32,
  /** A parsed receipt, and one verification report, as the characters of their JSON. */
  receiptChars: 262_144,
  /** Verification reports kept for one receipt. */
  reports: 50,
  /** A `working` record's value, as the characters of its JSON. */
  workingChars: 262_144,
  /** How deep a JSON value inside an event may nest. */
  jsonDepth: 12,
  /** An import file, in bytes. */
  importBytes: 20 * 1024 * 1024,
  /** Checkpoints the store keeps (A§7.1: at most 3). */
  checkpoints: 3,
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* Events                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A§7.2's ten kinds, in its order. */
export const KINDS = ['predict', 'item', 'play', 'lab-check', 'prove', 'trace-mark', 'challenge', 'receipt', 'review', 'ack'] as const
export type Kind = (typeof KINDS)[number]

/** The kinds that carry a result: everything except a challenge, which is issued and not graded, and an ack. */
export const GRADED_KINDS = ['predict', 'item', 'play', 'lab-check', 'prove', 'trace-mark', 'receipt', 'review'] as const
export type GradedKind = (typeof GRADED_KINDS)[number]

/** The learner's tap before an answer is revealed (A§7.2). It feeds the Mirror and Today and never gates anything. */
export const CONFIDENCES = ['guess', 'think', 'sure'] as const
export type Confidence = (typeof CONFIDENCES)[number]

/**
 * What every event has (A§7.2). The ref says what the event is about, in the grammar of A§4.5; codec.ts holds which ref forms a
 * kind may take.
 */
export interface Envelope<K extends Kind> {
  id: EventId
  /** The envelope's version, `EVENT_VERSION`. */
  v: typeof EVENT_VERSION
  kind: K
  ref: string
  at: IsoInstant
  /** Minutes east of UTC at `at`. */
  tz: number
  /** `at` shifted by `tz`, as a calendar day. Frozen at write, so a later change of zone moves no past day. */
  day: LocalDay
  dev: DeviceId
  /** The content revision the result was graded against. An event graded against an older `rev` shows "re-check" and loses nothing (A§4.2). */
  rev?: string
}

/** What a graded event adds (A§7.2). */
export interface Graded {
  /** In [0, 1]. For a game run it is a cache: grading replays the action log, so an edited score changes nothing (A§6.3). */
  score: number
  /** Whether the attempt passed. */
  ok: boolean
  /** How the result was earned. What it is worth is applied at read time (provenance.ts). */
  provenance: Provenance
  /** The seed the attempt ran on, a uint32. */
  seed?: number
  conf?: Confidence
}

/** A prediction's value, or the truth revealed after it: a number, a choice by option id, or an interval (ASSESSMENT §4.7). */
export type PredictValue = number | string | { lo: number; hi: number }

/** `predict:<lesson>#<id>`: the learner's value and the outcome at the reveal. */
export interface PredictData {
  value: PredictValue
  truth: PredictValue
  unit?: string
}

/** `item:gen/<family>/<variant>`: the learner's answer. The key is computed at grade time and stored nowhere (A§1 I3). */
export interface ItemData {
  answer: Json
}

/** `play:<game>/<level>`: the action log, compressed, and its hash. The seed and `rev` ride on the envelope (A§6.3). */
export interface PlayData {
  actions: string
  actionsSha256: Sha256
}

/** One check of a forge run (kernelspace's `LabCheckDetail`). */
export interface LabCheckResult {
  id: string
  status: 'pass' | 'fail' | 'trap' | 'timeout'
  seed?: number
}

/** `lab:<lab>`: the module that was graded, the seeds it ran on and each check's result (A§8.3). */
export interface LabCheckData {
  wasmSha256: Sha256
  seeds: number[]
  checks: LabCheckResult[]
}

/**
 * `prove:<lab>`: the learner's predicted reply and the module's actual reply, with the learner's attestation that the agent was
 * closed (ASSESSMENT §7.1). A forge lab (a bare slug) names its module by `wasmSha256`, and a lab with a receipt (module-prefixed)
 * names the receipt it asked about by `receiptSha256`.
 */
export interface ProveData {
  predicted: Json
  /** The reply the simulator read from the module or the receipt, or null when it gave none. */
  actual: Json | null
  agentClosed: boolean
  wasmSha256?: Sha256
  receiptSha256?: Sha256
}

/**
 * `trace:<trace>/<task>`: the spans the learner marked, and the attribution error that the task computed against the truth
 * (A§7.2). The marks are free JSON within a budget, and the error is a number of at least 0: the trace viewer (W1-T09) owns their
 * shape and unit, and tightens this type when it writes the first event.
 */
export interface TraceMarkData {
  marks: Json[]
  error: number
}

/** `challenge:<lab>.<stage>`: the token the browser issued (A§8.4), with its parts, so binding can compare them. Not graded. */
export interface ChallengeData {
  /** `es1:<lab>.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>`. */
  token: string
  seed: number
  nonce: string
  /** `YYYYMMDD`, as the token writes it. */
  issuedOn: string
}

/** One required check of a receipt, with the verdict it got and the bound that was printed beside it (A§8.5 rule 10). */
export interface ReceiptCheck {
  id: string
  verdict: 'pass' | 'fail' | 'attested'
  bound?: string
}

/** `receipt:<lab>.<stage>`: what the browser concluded from an imported receipt. The receipt itself is in the `receipts` store. */
export interface ReceiptData {
  receiptSha256: Sha256
  /** The challenge token the receipt was bound to. */
  challenge: string
  checks: ReceiptCheck[]
  graderVersion: string
  /** A one-line summary: plain text, never the hostname, a path or a serial number (A§9.5). */
  environment: string
}

/** `review:<kc>`: the grade Today gave, as FSRS reads it: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export interface ReviewData {
  grade: 1 | 2 | 3 | 4
}

export type PredictEvent = Envelope<'predict'> & Graded & { data: PredictData }
export type ItemEvent = Envelope<'item'> & Graded & { data: ItemData }
export type PlayEvent = Envelope<'play'> & Graded & { data: PlayData }
export type LabCheckEvent = Envelope<'lab-check'> & Graded & { data: LabCheckData }
export type ProveEvent = Envelope<'prove'> & Graded & { data: ProveData }
export type TraceMarkEvent = Envelope<'trace-mark'> & Graded & { data: TraceMarkData }
export type ChallengeEvent = Envelope<'challenge'> & { data: ChallengeData }
export type ReceiptEvent = Envelope<'receipt'> & Graded & { data: ReceiptData }
export type ReviewEvent = Envelope<'review'> & Graded & { data: ReviewData }
/** `screen:<id>` or `change:<id>`: the learner saw it. It carries nothing else. */
export type AckEvent = Envelope<'ack'>

export type LedgerEvent =
  | PredictEvent
  | ItemEvent
  | PlayEvent
  | LabCheckEvent
  | ProveEvent
  | TraceMarkEvent
  | ChallengeEvent
  | ReceiptEvent
  | ReviewEvent
  | AckEvent

export type EventOf<K extends Kind> = Extract<LedgerEvent, { kind: K }>

/** The fields that stamping fills in. */
export type StampedKey = 'id' | 'v' | 'at' | 'tz' | 'day' | 'dev'
/** An event before it is stamped: what the code that grades something supplies. */
export type Draft<K extends Kind = Kind> = K extends Kind ? Omit<EventOf<K>, StampedKey> : never

/** The clock a writer reads, injected so a test can fix it. */
export interface Clock {
  nowIso(): IsoInstant
  /** Minutes east of UTC at that instant, and daylight-saving aware in a browser. */
  tzOffsetMinutes(at: IsoInstant): number
}

export type IdFactory = () => EventId

/** What stamping an event needs. */
export interface WriterContext {
  clock: Clock
  newId: IdFactory
  dev: DeviceId
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The other stores                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What one verification of a receipt found. Verdicts are re-derived when the rules change, so a re-verification adds a report (A§7.1, A§8.5). */
export interface VerificationReport {
  at: IsoInstant
  report: Json
}

/** The `receipts` store: a parsed receipt keyed by its SHA-256, with its reports. The raw artifacts stay in the learner's bundle file (A§7.1). */
export interface ReceiptRecord {
  sha256: Sha256
  receipt: Json
  reports: VerificationReport[]
}

/**
 * The `working` store: settings, drafts, the current position, remembered tabs and the write-ahead outbox. The latest write
 * wins, and nothing in it is evidence.
 */
export interface WorkingRecord {
  /** `<namespace>:<name>`, such as `settings:reduced-motion` or `outbox:<event id>`. */
  key: string
  value: Json
  at: IsoInstant
  dev: DeviceId
}

/** The `meta` store (A§7.1). */
export interface Meta {
  schemaVersion: number
  deviceId: DeviceId
  createdAt: IsoInstant
}
export type MetaKey = keyof Meta

/** The mergeable part of a device's state: the evidence, and the receipts that back some of it. */
export interface Ledger {
  events: LedgerEvent[]
  receipts: ReceiptRecord[]
}

export type CheckpointReason = 'import-merge' | 'import-replace'

/**
 * What an import changed, for undo (A§7.1, A§7.5). It holds the difference between the ledger before and after, not a copy of
 * the ledger: the ids the import added, and the originals of what it removed or replaced. Undoing it removes the first and
 * puts back the second, so events written after the import stay.
 */
export interface Checkpoint {
  id: string
  reason: CheckpointReason
  at: IsoInstant
  addedEventIds: EventId[]
  restoredEvents: LedgerEvent[]
  addedReceiptIds: Sha256[]
  restoredReceipts: ReceiptRecord[]
}

/** A checkpoint without its payload, for the Undo button. */
export interface CheckpointMeta {
  id: string
  reason: CheckpointReason
  at: IsoInstant
  addedEvents: number
  restoredEvents: number
  addedReceipts: number
  restoredReceipts: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The store contract                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Why a bundle stopped writing (A§7.4's schema guard). IndexedDB being unavailable is not read-only: the app falls back to memory. */
export type ReadOnlyReason = 'newer-schema' | 'newer-idb' | 'versionchange'

export interface StoreInfo {
  backend: 'idb' | 'memory'
  /** `meta.schemaVersion`, or null for a database nobody has written to. */
  schemaVersion: number | null
  readOnly: boolean
  reason?: ReadOnlyReason
}

export interface StoreContents {
  events: LedgerEvent[]
  receipts: ReceiptRecord[]
  working: WorkingRecord[]
  meta: Partial<Meta>
}

/** The stores that `clear` may empty. `meta` is never cleared. */
export type StoreName = 'events' | 'receipts' | 'working' | 'checkpoints'

/**
 * One atomic write, applied in this order: clear, deletes, puts. Either all of it happens or none of it does.
 *
 * Events are inserted and never edited. `deleteEventIds` exists for an import that replaces the ledger, for its undo, and for
 * nothing else.
 */
export interface StoreTx {
  clear?: StoreName[]
  deleteEventIds?: EventId[]
  deleteReceiptIds?: Sha256[]
  deleteWorkingKeys?: string[]
  deleteMeta?: MetaKey[]
  deleteCheckpointIds?: string[]
  /** Insert. An id that is stored with the same content changes nothing, and with other content it is a clash that `Resolvers.event` settles. */
  putEvents?: LedgerEvent[]
  /** Insert, or join: a receipt that is stored already is combined with this one by `Resolvers.receipt`. */
  putReceipts?: ReceiptRecord[]
  /** Last writer wins, by `Resolvers.working`. */
  putWorking?: WorkingRecord[]
  /** Overwrites. */
  putMeta?: Partial<Meta>
  /** Writes each key only when it is absent: how two tabs that open a fresh database agree on one device id. */
  putMetaIfAbsent?: Partial<Meta>
  /** Adds the checkpoint, then drops the oldest until `LIMITS.checkpoints` remain. */
  putCheckpoint?: Checkpoint
}

/**
 * The conflict rules, injected so that no store holds merge policy (merge.ts has the real ones). Each takes the stored record and
 * the incoming one, and returns the one to keep.
 */
export interface Resolvers {
  event(existing: LedgerEvent, incoming: LedgerEvent): LedgerEvent
  receipt(existing: ReceiptRecord, incoming: ReceiptRecord): ReceiptRecord
  working(existing: WorkingRecord, incoming: WorkingRecord): WorkingRecord
}

export interface CommitResult {
  /** Events that were created or replaced. */
  eventIds: EventId[]
  /** Ids that met a stored event with other content, whichever one was kept. */
  clashIds: EventId[]
  /** Receipts that were created or changed. */
  receiptIds: Sha256[]
  workingKeys: string[]
  /** The keys that `putMetaIfAbsent` wrote. A key that is absent from here was already there. */
  metaClaimed: MetaKey[]
}

/** The adapter every store implements: memory-store.ts here, and the IndexedDB store in `src/evidence`. conformance.ts is its contract. */
export interface LedgerStore {
  readonly backend: StoreInfo['backend']
  open(): Promise<StoreInfo>
  readAll(): Promise<StoreContents>
  commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult>
  /** Newest first. */
  listCheckpoints(): Promise<CheckpointMeta[]>
  readCheckpoint(id: string): Promise<Checkpoint | undefined>
  /** Fires when another context upgrades the database, so the app can go read-only. */
  onVersionChange(callback: () => void): () => void
  close(): void
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Export                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `enginespace/export@1` (A§7.5): the ledger as one JSON file. Working records are device settings and are not exported. */
export interface ExportFile {
  schema: typeof EXPORT_SCHEMA
  exportedAt: IsoInstant
  schemaVersion: number
  /** The device that wrote the file. */
  device: DeviceId
  /** In the order (`at`, `id`). */
  events: LedgerEvent[]
  /** In the order of their SHA-256. */
  receipts: ReceiptRecord[]
}
