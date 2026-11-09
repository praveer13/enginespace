/**
 * Helpers for the evidence tests: a clock that moves when told to, a database that several tabs connect to, a bus that
 * stands in for BroadcastChannel, and a few valid drafts. Nothing here touches the real IndexedDB or the real channel, so a
 * test is the same on every host. The real ones are exercised in Playwright (e2e/ledger-conformance.spec.ts).
 */
import { MemoryStore, seededIds } from '@es/ledger'
import type {
  Checkpoint,
  CheckpointMeta,
  Clock,
  CommitResult,
  Draft,
  LedgerStore,
  Resolvers,
  StoreContents,
  StoreInfo,
  StoreTx,
} from '@es/ledger'
import type { ChannelLike } from '@/evidence/channel'
import { createEvidence } from '@/evidence/engine'
import type { EvidenceDeps, EvidenceEngine, StorageManagerLike } from '@/evidence/engine'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Time                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface TestClock extends Clock {
  advance(ms: number): void
  set(at: string): void
}

/** A clock that stays where it is until a test moves it. `tz` is minutes east of UTC. */
export function fixedClock(start = '2026-11-04T09:00:00.000Z', tz = 0): TestClock {
  let now = Date.parse(start)
  return {
    nowIso: () => new Date(now).toISOString(),
    tzOffsetMinutes: () => tz,
    advance: (ms) => {
      now += ms
    },
    set: (at) => {
      now = Date.parse(at)
    },
  }
}

/** Polls until `check` holds, with real timers, so the tests do not depend on how many ticks a message takes. */
export async function until(check: () => boolean, what = 'the condition', timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

/** A few macrotasks, for the cases where nothing is expected to happen. */
export async function quiet(ms = 15): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* One database, many tabs                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * One connection of one tab to a shared database. It is a `LedgerStore` like any other. Closing it closes this tab's
 * connection and leaves the data and the other tabs alone, and `SharedDb.upgrade()` plays another context taking the
 * database for an upgrade.
 */
class Connection implements LedgerStore {
  readonly backend = 'memory' as const
  private closed = false
  private readonly listeners = new Set<() => void>()
  private readonly db: SharedDb

  constructor(db: SharedDb) {
    this.db = db
  }

  async open(): Promise<StoreInfo> {
    this.closed = false
    return this.db.data.open()
  }

  private need(): void {
    if (this.closed) throw new Error('this connection is closed')
  }

  async readAll(): Promise<StoreContents> {
    this.need()
    return this.db.data.readAll()
  }

  async commit(tx: StoreTx, resolve: Resolvers): Promise<CommitResult> {
    this.need()
    this.db.commits += 1
    return this.db.data.commit(tx, resolve)
  }

  async listCheckpoints(): Promise<CheckpointMeta[]> {
    this.need()
    return this.db.data.listCheckpoints()
  }

  async readCheckpoint(id: string): Promise<Checkpoint | undefined> {
    this.need()
    return this.db.data.readCheckpoint(id)
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

  /** Another context asks for the database: this connection lets go, then says so. */
  versionChange(): void {
    this.closed = true
    for (const callback of [...this.listeners]) callback()
  }
}

export class SharedDb {
  readonly data: MemoryStore
  /** The commits that reached the database, from any connection. */
  commits = 0
  private readonly connections: Connection[] = []

  constructor(seed: ConstructorParameters<typeof MemoryStore>[0] = {}) {
    this.data = new MemoryStore(seed)
  }

  connect(): LedgerStore {
    const connection = new Connection(this)
    this.connections.push(connection)
    return connection
  }

  /** Another context upgrades the database, so every open connection is told to let go. */
  upgrade(): void {
    for (const connection of this.connections) connection.versionChange()
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A bus that stands in for BroadcastChannel                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

type Listener = (event: { data: unknown }) => void

/**
 * Every channel made by `factory` with one name hears the others' posts, never its own, and hears them later, as a real
 * BroadcastChannel does. A posted value is cloned, as a real one is.
 */
export class FakeBus {
  /** Every message posted, in order, for a test to read. */
  readonly posted: unknown[] = []
  private readonly channels: { name: string; listeners: Set<Listener>; closed: boolean }[] = []

  factory = (name: string): ChannelLike => {
    const channel = { name, listeners: new Set<Listener>(), closed: false }
    this.channels.push(channel)
    return {
      postMessage: (message) => {
        if (channel.closed) throw new Error('the channel is closed')
        const data = structuredClone(message)
        this.posted.push(data)
        for (const other of this.channels) {
          if (other === channel || other.name !== name || other.closed) continue
          setTimeout(() => {
            for (const listener of [...other.listeners]) listener({ data: structuredClone(data) })
          }, 0)
        }
      },
      addEventListener: (_type, listener) => {
        channel.listeners.add(listener)
      },
      removeEventListener: (_type, listener) => {
        channel.listeners.delete(listener)
      },
      close: () => {
        channel.closed = true
      },
    }
  }

  /** What a tab outside the engine says on the channel, as a newer bundle would. */
  inject(name: string, data: unknown): void {
    for (const channel of this.channels) {
      if (channel.name !== name || channel.closed) continue
      setTimeout(() => {
        for (const listener of [...channel.listeners]) listener({ data: structuredClone(data) })
      }, 0)
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Tabs                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

let tabs = 0

export interface Tab {
  engine: EvidenceEngine
  clock: TestClock
  tabId: string
}

/** A storage manager that counts the questions it is asked. */
export function fakeStorage(answers: { persisted?: boolean; persist?: boolean } = {}): StorageManagerLike & {
  persistedCalls: number
  persistCalls: number
} {
  const manager = {
    persistedCalls: 0,
    persistCalls: 0,
    persisted: async () => {
      manager.persistedCalls += 1
      return answers.persisted ?? false
    },
    persist: async () => {
      manager.persistCalls += 1
      return answers.persist ?? true
    },
  }
  return manager
}

/** Opens a tab on a database and a bus. Each tab draws ids from a stream of its own, so two tabs never make the same id. */
export async function openTab(db: SharedDb, bus: FakeBus | null, options: Partial<EvidenceDeps> = {}): Promise<Tab> {
  tabs += 1
  const clock = fixedClock()
  const tabId = `tab-${tabs}`
  const engine = await createEvidence({
    store: db.connect(),
    clock,
    newId: seededIds(1000 + tabs),
    tabId,
    channelFactory: bus === null ? null : bus.factory,
    storageManager: null,
    refreshDelayMs: 0,
    ...options,
  })
  return { engine, clock, tabId }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drafts                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export const ACK: Draft<'ack'> = { kind: 'ack', ref: 'screen:welcome' }

export const ITEM: Draft<'item'> = {
  kind: 'item',
  ref: 'item:gen/tr2.bubble-width/async-on',
  score: 1,
  ok: true,
  provenance: 'unseen',
  data: { answer: 3 },
}

export const CHALLENGE: Draft<'challenge'> = {
  kind: 'challenge',
  ref: 'challenge:tr8.replay.s2',
  data: {
    token: 'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:1a2b3c4d',
    seed: 0x0badc0de,
    nonce: 'ABCDEFGHJKLMNPQR',
    issuedOn: '20261104',
  },
}

export const REVIEW: Draft<'review'> = {
  kind: 'review',
  ref: 'review:tr2.async-overlap',
  score: 1,
  ok: true,
  provenance: 'unseen',
  data: { grade: 3 },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A store that can be watched and made to fail                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Hooks {
  /** Runs before each commit, with the transaction and the number of commits so far, this one included. May throw or wait. */
  commit?(tx: StoreTx, call: number): void | Promise<void>
  /** Runs before each readAll. */
  readAll?(): void | Promise<void>
}

export interface WatchedStore extends LedgerStore {
  /** Every transaction that was handed to `commit`, in the order the calls were made, failed ones included. */
  readonly commits: StoreTx[]
  reads: number
}

/** Wraps a store: records what is asked of it, and lets a test fail or delay a call. */
export function watch(inner: LedgerStore, hooks: Hooks = {}): WatchedStore {
  const commits: StoreTx[] = []
  const watched: WatchedStore = {
    backend: inner.backend,
    commits,
    reads: 0,
    open: () => inner.open(),
    readAll: async () => {
      watched.reads += 1
      await hooks.readAll?.()
      return inner.readAll()
    },
    commit: async (tx, resolve) => {
      commits.push(tx)
      await hooks.commit?.(tx, commits.length)
      return inner.commit(tx, resolve)
    },
    listCheckpoints: () => inner.listCheckpoints(),
    readCheckpoint: (id) => inner.readCheckpoint(id),
    onVersionChange: (callback) => inner.onVersionChange(callback),
    close: () => inner.close(),
  }
  return watched
}
