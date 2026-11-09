/*
 * The evidence engine (ARCHITECTURE §7.4 and §7.5) on the memory store, with a fake channel and a fake storage manager: the
 * write path and its outbox, the tab sync, the schema guard, the persistence request, and export, import, undo and reset.
 * The same flows run against IndexedDB in a real browser in e2e/ledger-conformance.spec.ts.
 */
import { describe, expect, spyOn, test } from 'bun:test'
import { MemoryStore, seededIds } from '@es/ledger'
import type { Json, LedgerEvent, LedgerStore, ReceiptRecord, WorkingRecord } from '@es/ledger'
import { CHANNEL_NAME } from '@/evidence/channel'
import { createEvidence, NOT_READY } from '@/evidence/engine'
import { outboxEntry } from '@/evidence/outbox'
import { copy, EXAMPLES, HEX_A } from '../ledger/support'
import { ACK, CHALLENGE, FakeBus, fakeStorage, fixedClock, ITEM, openTab, quiet, REVIEW, SharedDb, until, watch } from './support'

const sha = (digit: string): string => digit.repeat(64)
const receipt = (digit: string): ReceiptRecord => ({ sha256: sha(digit), receipt: { lab: 'tr8.replay' }, reports: [] })
const outboxOf = (event: LedgerEvent): WorkingRecord => outboxEntry(event, '2026-11-04T08:00:00.000Z', 'dev-a1')

const idsOf = (events: readonly LedgerEvent[]): string[] => events.map((event) => event.id)

describe('opening', () => {
  test('a fresh database gets a device id, a creation time and the schema version, once', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const snapshot = engine.getSnapshot()
    expect(snapshot.ready).toBe(true)
    expect(snapshot.backend).toBe('memory')
    expect(snapshot.readOnly).toBe(false)
    expect(snapshot.events).toEqual([])
    expect(snapshot.deviceId).toBeDefined()
    expect((await db.data.readAll()).meta).toEqual({ deviceId: snapshot.deviceId, createdAt: '2026-11-04T09:00:00.000Z', schemaVersion: 1 })
    expect(db.commits).toBe(1)
  })

  test('a second tab finds the device id and writes nothing', async () => {
    const db = new SharedDb()
    const first = await openTab(db, null)
    const second = await openTab(db, null)
    expect(second.engine.getSnapshot().deviceId).toBe(first.engine.getSnapshot().deviceId)
    expect(db.commits).toBe(1)
  })

  test('two tabs that open a fresh database together agree on one device id', async () => {
    const db = new SharedDb()
    const [a, b] = await Promise.all([openTab(db, null), openTab(db, null)])
    const ids = new Set([a.engine.getSnapshot().deviceId, b.engine.getSnapshot().deviceId, (await db.data.readAll()).meta.deviceId])
    expect(ids.size).toBe(1)
    expect([...ids][0]).toBeDefined()
  })

  test('upgrades an older schema version in the database', async () => {
    const db = new SharedDb({ meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 1 } })
    const { engine } = await openTab(db, null, { schemaVersion: 2 })
    expect(engine.getSnapshot().readOnly).toBe(false)
    expect((await db.data.readAll()).meta).toEqual({ deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 2 })
  })

  test('reads the ledger that is there', async () => {
    const db = new SharedDb({
      events: [copy(EXAMPLES.item), copy(EXAMPLES.play)],
      receipts: [receipt('b'), receipt('a')],
      meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 1 },
    })
    const { engine } = await openTab(db, null)
    const snapshot = engine.getSnapshot()
    // Both were written at one instant, so the id breaks the tie.
    expect(idsOf(snapshot.events)).toEqual(['g1', 'i1'])
    expect(snapshot.receipts.map((record) => record.sha256)).toEqual([sha('a'), sha('b')])
    expect(snapshot.deviceId).toBe('dev-a1')
  })

  test('flushes the outbox a crash left behind, and leaves the records it cannot read', async () => {
    const waiting = copy(EXAMPLES.play)
    const db = new SharedDb({
      working: [
        outboxOf(waiting),
        { key: 'outbox:broken', value: { id: 'broken', kind: 'quest' }, at: '2026-11-04T08:00:00.000Z', dev: 'dev-a1' },
        { key: 'settings:reduced-motion', value: true, at: '2026-11-04T08:00:00.000Z', dev: 'dev-a1' },
      ],
      meta: { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 1 },
    })
    const { engine } = await openTab(db, null)
    const snapshot = engine.getSnapshot()
    expect(snapshot.events).toEqual([waiting])
    expect(snapshot.stuck).toBe(1)
    // The outbox is not working data: the snapshot hides it, and the settings stay.
    expect([...snapshot.working.keys()]).toEqual(['settings:reduced-motion'])
    const stored = await db.data.readAll()
    expect(stored.events).toEqual([waiting])
    expect(stored.working.map((record) => record.key).sort()).toEqual(['outbox:broken', 'settings:reduced-motion'])
  })

  test('falls back to memory when the store cannot open, and works', async () => {
    const broken: LedgerStore = {
      backend: 'idb',
      open: () => Promise.reject(new Error('IndexedDB is blocked')),
      readAll: () => Promise.reject(new Error('never opened')),
      commit: () => Promise.reject(new Error('never opened')),
      listCheckpoints: () => Promise.reject(new Error('never opened')),
      readCheckpoint: () => Promise.reject(new Error('never opened')),
      onVersionChange: () => () => undefined,
      close: () => undefined,
    }
    const { engine } = await openTab(new SharedDb(), null, { store: broken, fallbackStore: () => new MemoryStore() })
    expect(engine.getSnapshot().backend).toBe('memory')
    expect(engine.getSnapshot().readOnly).toBe(false)
    const result = await engine.append(ACK)
    expect(result.ok && result.durable).toBe(true)
    expect(engine.getSnapshot().events).toHaveLength(1)
  })

  test('falls back to memory when the first read fails, too', async () => {
    const db = new SharedDb()
    const failing = watch(db.connect(), {
      readAll: () => {
        throw new Error('the disk is full')
      },
    })
    const { engine } = await openTab(db, null, { store: failing })
    expect(engine.getSnapshot().ready).toBe(true)
    expect((await engine.append(ACK)).ok).toBe(true)
    // The evidence went to the fallback store and not to the database that failed.
    expect((await db.data.readAll()).events).toEqual([])
  })

  test('a store that was never opened gives the not-ready state', () => {
    expect(NOT_READY.ready).toBe(false)
    expect(NOT_READY.events).toEqual([])
    expect(NOT_READY.backend).toBeNull()
  })
})

describe('writing', () => {
  test('stamps the event with this device, the clock and the learner\'s own day, and keeps it', async () => {
    const db = new SharedDb()
    const { engine, clock } = await openTab(db, null)
    // 21:30 UTC on the 4th, in a zone five hours east: 02:30 on the 5th.
    clock.set('2026-11-04T21:30:00.000Z')
    const tz = { nowIso: clock.nowIso, tzOffsetMinutes: () => 300 }
    const { engine: east } = await openTab(db, null, { clock: tz })
    const result = await east.append(ITEM)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.durable).toBe(true)
    expect(result.event).toMatchObject({ kind: 'item', at: '2026-11-04T21:30:00.000Z', tz: 300, day: '2026-11-05', dev: east.getSnapshot().deviceId })
    expect((await db.data.readAll()).events).toEqual([result.event])
    expect(engine).toBeDefined()
  })

  test('shows the event at once, and confirms it when the store has it', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    let notified = 0
    engine.subscribe(() => {
      notified += 1
    })
    const pending = engine.append(ITEM)
    // Before the store has answered, the learner already sees it, marked unsaved.
    expect(engine.getSnapshot().events).toHaveLength(1)
    expect(engine.getSnapshot().unsaved).toBe(1)
    expect(notified).toBe(1)
    await pending
    expect(engine.getSnapshot().events).toHaveLength(1)
    expect(engine.getSnapshot().unsaved).toBe(0)
    expect(notified).toBe(2)
  })

  test('writes the outbox first, then the event and the deletion of its record in one transaction', async () => {
    const db = new SharedDb()
    const store = watch(db.connect())
    const { engine } = await openTab(db, null, { store })
    const before = store.commits.length
    const result = await engine.append(ITEM)
    if (!result.ok) throw new Error('not written')
    const [stage, settle, ...rest] = store.commits.slice(before)
    expect(rest).toEqual([])
    expect(Object.keys(stage)).toEqual(['putWorking'])
    expect(stage.putWorking?.[0].key).toBe(`outbox:${result.event.id}`)
    expect(stage.putWorking?.[0].value).toEqual(result.event as unknown as Json)
    expect(settle.putEvents).toEqual([result.event])
    expect(settle.deleteWorkingKeys).toEqual([`outbox:${result.event.id}`])
    const stored = await db.data.readAll()
    expect(stored.events).toEqual([result.event])
    expect(stored.working).toEqual([])
  })

  test('a crash between the two steps loses nothing: the next start finds the event in the outbox', async () => {
    const db = new SharedDb()
    // The tab dies when the second transaction starts.
    const dying = watch(db.connect(), {
      commit: (_tx, call) => {
        if (call === 3) throw new Error('the tab died')
      },
    })
    const { engine } = await openTab(db, null, { store: dying })
    const result = await engine.append(ITEM)
    if (!result.ok) throw new Error('not written')
    expect(result.durable).toBe(false)
    expect(engine.getSnapshot().unsaved).toBe(1)
    expect((await db.data.readAll()).events).toEqual([])
    expect((await db.data.readAll()).working.map((record) => record.key)).toEqual([`outbox:${result.event.id}`])

    const next = await openTab(db, null)
    expect(next.engine.getSnapshot().events).toEqual([result.event])
    expect((await db.data.readAll()).working).toEqual([])
  })

  test('an event that could not be saved is retried by the next write, with the rest', async () => {
    const db = new SharedDb()
    let failing = false
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (failing && tx.putEvents) throw new Error('QuotaExceededError')
      },
    })
    const { engine } = await openTab(db, null, { store })
    failing = true
    const first = await engine.append(ITEM)
    expect(first.ok && first.durable).toBe(false)
    expect(engine.getSnapshot().unsaved).toBe(1)
    failing = false
    const second = await engine.append(ACK)
    expect(second.ok && second.durable).toBe(true)
    expect(engine.getSnapshot().unsaved).toBe(0)
    expect((await db.data.readAll()).events).toHaveLength(2)
    expect((await db.data.readAll()).working).toEqual([])
  })

  test('flush() retries an event that could not be saved', async () => {
    const db = new SharedDb()
    let failing = false
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (failing && tx.putEvents) throw new Error('QuotaExceededError')
      },
    })
    const { engine } = await openTab(db, null, { store })
    failing = true
    await engine.append(ITEM)
    failing = false
    await engine.flush()
    expect(engine.getSnapshot().unsaved).toBe(0)
    expect((await db.data.readAll()).events).toHaveLength(1)
  })

  test('still writes the event when only the outbox step fails', async () => {
    const db = new SharedDb()
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (tx.putWorking?.some((record) => record.key.startsWith('outbox:'))) throw new Error('could not stage')
      },
    })
    const { engine } = await openTab(db, null, { store })
    const result = await engine.append(ITEM)
    expect(result.ok && result.durable).toBe(true)
    expect((await db.data.readAll()).events).toHaveLength(1)
  })

  test('a draft that breaks a rule throws where the bug is, and writes and shows nothing', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const bad = { ...ITEM, score: 2 }
    await expect(engine.append(bad)).rejects.toThrow('cannot write the event')
    expect(engine.getSnapshot().events).toEqual([])
    expect(engine.getSnapshot().unsaved).toBe(0)
    expect((await db.data.readAll()).events).toEqual([])
  })

  test('events never carry a weight: provenance is stored, and nothing derived from it', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    const result = await engine.append(ITEM)
    if (!result.ok) throw new Error('not written')
    expect(Object.keys(result.event).sort()).toEqual(['at', 'data', 'day', 'dev', 'id', 'kind', 'ok', 'provenance', 'ref', 'score', 'tz', 'v'])
  })

  test('many appends at once are saved once each, with no record left in the outbox', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const results = await Promise.all(Array.from({ length: 25 }, () => engine.append(ACK)))
    expect(results.every((result) => result.ok && result.durable)).toBe(true)
    const stored = await db.data.readAll()
    expect(stored.events).toHaveLength(25)
    expect(new Set(idsOf(stored.events)).size).toBe(25)
    expect(stored.working).toEqual([])
    expect(engine.getSnapshot().events).toHaveLength(25)
  })

  test('keeps the events in export order: by when, then by id', async () => {
    const { engine, clock } = await openTab(new SharedDb(), null)
    await engine.append(ACK)
    clock.advance(1000)
    await engine.append(ITEM)
    clock.set('2026-11-04T08:00:00.000Z')
    await engine.append(REVIEW)
    expect(engine.getSnapshot().events.map((event) => event.kind)).toEqual(['review', 'ack', 'item'])
  })

  test('an event the snapshot shows is a new object each time the ledger changes, and the same one while it does not', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    const first = engine.getSnapshot()
    expect(engine.getSnapshot()).toBe(first)
    await engine.append(ACK)
    expect(engine.getSnapshot()).not.toBe(first)
    const second = engine.getSnapshot()
    expect(engine.getSnapshot()).toBe(second)
  })
})

describe('working records', () => {
  test('are written, shown at once, and read by the next tab', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    const pending = engine.setWorking('settings:reduced-motion', true)
    expect(engine.getSnapshot().working.get('settings:reduced-motion')?.value).toBe(true)
    expect(await pending).toEqual({ ok: true })
    const next = await openTab(db, null)
    expect(next.engine.getSnapshot().working.get('settings:reduced-motion')?.value).toBe(true)
  })

  test('the latest write wins, even inside one millisecond', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    // The clock does not move, so both writes carry the same instant: the engine keeps them apart.
    await Promise.all([engine.setWorking('settings:tier-cap', 1), engine.setWorking('settings:tier-cap', 2), engine.setWorking('settings:tier-cap', 3)])
    expect(engine.getSnapshot().working.get('settings:tier-cap')?.value).toBe(3)
    await engine.flush()
    expect(engine.getSnapshot().working.get('settings:tier-cap')?.value).toBe(3)
  })

  test('are deleted', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.setWorking('draft:tr2.l3', { text: 'half a thought' })
    expect(await engine.deleteWorking('draft:tr2.l3')).toEqual({ ok: true })
    expect(engine.getSnapshot().working.has('draft:tr2.l3')).toBe(false)
    expect((await db.data.readAll()).working).toEqual([])
  })

  test('refuse a key that is not <namespace>:<name>, the outbox\'s keys, and a value that is too big', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    for (const key of ['reduced-motion', 'Settings:x', 'settings:', 'a b:c']) {
      const result = await engine.setWorking(key, true)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.error).toBe('invalid')
    }
    const reserved = await engine.setWorking('outbox:e1', true)
    expect(!reserved.ok && reserved.detail).toContain('outbox')
    expect((await engine.deleteWorking('outbox:e1')).ok).toBe(false)
    const huge = await engine.setWorking('draft:big', 'x'.repeat(300_000))
    expect(huge.ok).toBe(false)
    expect(engine.getSnapshot().working.size).toBe(0)
  })

  test('are never evidence, and never exported', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    await engine.setWorking('settings:reduced-motion', true)
    expect(engine.getSnapshot().events).toEqual([])
    const out = await engine.exportLedger()
    expect(out.ok && out.text).not.toContain('reduced-motion')
  })
})

describe('the other tabs', () => {
  test('an event written in one tab shows in the other', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const b = await openTab(db, bus)
    let notified = 0
    b.engine.subscribe(() => {
      notified += 1
    })
    const result = await a.engine.append(ITEM)
    if (!result.ok) throw new Error('not written')
    await until(() => b.engine.getSnapshot().events.length === 1, 'the event in the second tab')
    expect(b.engine.getSnapshot().events).toEqual([result.event])
    expect(notified).toBeGreaterThan(0)
  })

  test('the channel carries a notice and never the event', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    await openTab(db, bus)
    bus.posted.length = 0
    await a.engine.append(ITEM)
    expect(bus.posted).toEqual([{ t: 'changed', what: 'append', from: a.tabId, schemaVersion: 1 }])
  })

  test('says hello when it opens, so that an older tab can step aside', async () => {
    const bus = new FakeBus()
    const a = await openTab(new SharedDb(), bus)
    expect(bus.posted).toEqual([{ t: 'hello', from: a.tabId, schemaVersion: 1 }])
  })

  test('a burst of messages is one read of the store', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const watched = watch(db.connect())
    const b = await openTab(db, bus, { store: watched, refreshDelayMs: 40 })
    const readsAtStart = watched.reads
    for (let n = 0; n < 12; n += 1) await a.engine.append(ACK)
    await until(() => b.engine.getSnapshot().events.length === 12, 'all twelve events')
    expect(watched.reads - readsAtStart).toBeLessThan(6)
  })

  test('an event written here and not yet confirmed survives a read of the store that was started by a message', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    let failing = true
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (failing && tx.putEvents) throw new Error('QuotaExceededError')
      },
    })
    const a = await openTab(db, bus, { store })
    const b = await openTab(db, bus)
    const mine = await a.engine.append(ITEM)
    expect(mine.ok && mine.durable).toBe(false)
    // The other tab writes, and this tab reads the store because of it. Its own event is not in the store.
    await b.engine.append(ACK)
    await until(() => a.engine.getSnapshot().events.length === 2, 'both events in the first tab')
    expect(a.engine.getSnapshot().unsaved).toBe(1)
    failing = false
    await a.engine.flush()
    expect(a.engine.getSnapshot().unsaved).toBe(0)
    await until(() => b.engine.getSnapshot().events.length === 2, 'both events in the second tab')
  })

  test('a setting changed in one tab applies in the other', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const b = await openTab(db, bus)
    await a.engine.setWorking('settings:reduced-motion', true)
    await until(() => b.engine.getSnapshot().working.get('settings:reduced-motion')?.value === true, 'the setting in the second tab')
    await a.engine.deleteWorking('settings:reduced-motion')
    await until(() => !b.engine.getSnapshot().working.has('settings:reduced-motion'), 'the deletion in the second tab')
  })

  test('hears a message that arrives while it is still opening', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const gate: { open: () => void } = { open: () => undefined }
    const held = new Promise<void>((resolve) => {
      gate.open = resolve
    })
    const slow = watch(db.connect(), { readAll: () => held })
    const opening = openTab(db, bus, { store: slow })
    await quiet(5)
    // The first tab writes while the second is still reading the store for the first time.
    await a.engine.append(ACK)
    gate.open()
    const b = await opening
    await until(() => b.engine.getSnapshot().events.length === 1, 'the event the second tab opened beside')
  })

  test('stops hearing the others once it is closed', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const b = await openTab(db, bus)
    b.engine.close()
    await a.engine.append(ACK)
    await quiet()
    expect(b.engine.getSnapshot().events).toEqual([])
  })
})

describe('the schema guard', () => {
  const NEWER = { deviceId: 'dev-a1', createdAt: '2026-10-01T00:00:00.000Z', schemaVersion: 2 }

  test('a database with a newer schemaVersion puts the tab in read-only mode, with a reload prompt', async () => {
    const db = new SharedDb({ events: [copy(EXAMPLES.item)], meta: NEWER })
    const bus = new FakeBus()
    const { engine } = await openTab(db, bus)
    const snapshot = engine.getSnapshot()
    expect(snapshot.ready).toBe(true)
    expect(snapshot.readOnly).toBe(true)
    expect(snapshot.reason).toBe('newer-schema')
    expect(snapshot.notice).toContain('read-only')
    expect(snapshot.notice).toContain('Reload to update')
    // A newer bundle owns the data: this one reads nothing of it.
    expect(snapshot.events).toEqual([])
    // It says nothing on the channel either: a hello from an older bundle is no use to the newer one.
    expect(bus.posted).toEqual([])
  })

  test('every write refuses, and the database is exactly as it was', async () => {
    const db = new SharedDb({ events: [copy(EXAMPLES.item)], meta: NEWER })
    const before = await db.data.readAll()
    const { engine } = await openTab(db, null)
    const append = await engine.append(ACK)
    expect(append).toMatchObject({ ok: false, error: 'read-only' })
    expect(!append.ok && append.detail).toContain('Reload to update')
    expect(await engine.setWorking('settings:reduced-motion', true)).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.deleteWorking('settings:reduced-motion')).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.importLedger('{}', 'merge')).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.previewImport('{}', 'merge')).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.undoImport()).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.reset()).toMatchObject({ ok: false, error: 'read-only' })
    expect(await engine.exportLedger()).toMatchObject({ ok: false, error: 'read-only' })
    await engine.flush()
    expect(await db.data.readAll()).toEqual(before)
    expect(db.commits).toBe(0)
  })

  test('a database at a newer IndexedDB version is read-only too', async () => {
    const newerIdb: LedgerStore = {
      ...new MemoryStore(),
      backend: 'idb',
      open: async () => ({ backend: 'idb', schemaVersion: null, readOnly: true, reason: 'newer-idb' }),
      onVersionChange: () => () => undefined,
      close: () => undefined,
    }
    const { engine } = await openTab(new SharedDb(), null, { store: newerIdb })
    expect(engine.getSnapshot()).toMatchObject({ ready: true, readOnly: true, reason: 'newer-idb', backend: 'idb' })
    expect(engine.getSnapshot().notice).toContain('Reload to update')
    expect(await engine.append(ACK)).toMatchObject({ ok: false, error: 'read-only' })
  })

  test('a newer bundle in another tab makes this one read-only the moment it says hello', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const old = await openTab(db, bus)
    await old.engine.append(ACK)
    let notified = 0
    old.engine.subscribe(() => {
      notified += 1
    })
    const newer = await openTab(db, bus, { schemaVersion: 2 })
    await until(() => old.engine.getSnapshot().readOnly, 'the old tab to stop')
    expect(old.engine.getSnapshot().reason).toBe('newer-schema')
    expect(notified).toBeGreaterThan(0)
    expect(await old.engine.append(ITEM)).toMatchObject({ ok: false, error: 'read-only' })
    // The newer tab is untouched by it: it upgraded the data model, and writes.
    expect((await db.data.readAll()).meta.schemaVersion).toBe(2)
    expect((await newer.engine.append(ITEM)).ok).toBe(true)
    // And what the old tab showed before it stopped is still there.
    expect(old.engine.getSnapshot().events).toHaveLength(1)
  })

  test('a message from a newer bundle that this build cannot read still counts', async () => {
    const bus = new FakeBus()
    const { engine } = await openTab(new SharedDb(), bus)
    bus.inject(CHANNEL_NAME, { t: 'rebuilt-the-index', from: 'future', schemaVersion: 9, payload: [1, 2, 3] })
    await until(() => engine.getSnapshot().readOnly, 'the tab to stop')
    expect(engine.getSnapshot().reason).toBe('newer-schema')
  })

  test('a message from the same or an older bundle does not', async () => {
    const bus = new FakeBus()
    const { engine } = await openTab(new SharedDb(), bus)
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'same', schemaVersion: 1 })
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'old', schemaVersion: 0 })
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'liar', schemaVersion: 'two' })
    await quiet()
    expect(engine.getSnapshot().readOnly).toBe(false)
  })

  test('another tab taking the database for an upgrade makes this one read-only, and keeps what it shows', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.append(ITEM)
    db.upgrade()
    const snapshot = engine.getSnapshot()
    expect(snapshot.readOnly).toBe(true)
    expect(snapshot.reason).toBe('versionchange')
    expect(snapshot.notice).toContain('Reload to keep saving')
    expect(snapshot.events).toHaveLength(1)
    expect(await engine.append(ACK)).toMatchObject({ ok: false, error: 'read-only' })
    // What it shows can still be saved to a file.
    const out = await engine.exportLedger()
    expect(out.ok && out.file.events).toHaveLength(1)
  })

  test('the first reason is kept', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const { engine } = await openTab(db, bus)
    db.upgrade()
    bus.inject(CHANNEL_NAME, { t: 'hello', from: 'future', schemaVersion: 9 })
    await quiet()
    expect(engine.getSnapshot().reason).toBe('versionchange')
  })

  test('reload() calls what the browser gave it', async () => {
    let reloads = 0
    const { engine } = await openTab(new SharedDb({ meta: NEWER }), null, {
      reload: () => {
        reloads += 1
      },
    })
    engine.reload()
    expect(reloads).toBe(1)
  })

  test('an older bundle reads nothing and writes nothing of a database a newer one upgraded, and a newer one reads an older one\'s', async () => {
    const db = new SharedDb()
    const older = await openTab(db, null, { schemaVersion: 1 })
    await older.engine.append(ITEM)
    const newer = await openTab(db, null, { schemaVersion: 2 })
    expect(newer.engine.getSnapshot().readOnly).toBe(false)
    expect(newer.engine.getSnapshot().events).toHaveLength(1)
    const laterOlder = await openTab(db, null, { schemaVersion: 1 })
    expect(laterOlder.engine.getSnapshot().readOnly).toBe(true)
    expect(laterOlder.engine.getSnapshot().events).toEqual([])
  })
})

describe('asking for persistent storage', () => {
  test('is done once, after the first graded event', async () => {
    const storage = fakeStorage({ persisted: false, persist: true })
    const { engine } = await openTab(new SharedDb(), null, { storageManager: storage })
    // Opening only asks whether storage is persistent: that never prompts.
    expect(storage.persistedCalls).toBe(1)
    expect(storage.persistCalls).toBe(0)
    expect(engine.getSnapshot().persisted).toBe(false)

    await engine.append(ACK)
    await engine.append(CHALLENGE)
    await engine.flush()
    expect(storage.persistCalls).toBe(0)

    await engine.append(ITEM)
    await engine.flush()
    await until(() => engine.getSnapshot().persisted === true, 'the answer')
    expect(storage.persistCalls).toBe(1)

    await engine.append(REVIEW)
    await engine.append(ITEM)
    await engine.flush()
    expect(storage.persistCalls).toBe(1)
  })

  test('is not done for events that grade nothing', async () => {
    const storage = fakeStorage()
    const { engine } = await openTab(new SharedDb(), null, { storageManager: storage })
    await engine.append(ACK)
    await engine.append(CHALLENGE)
    await quiet()
    expect(storage.persistCalls).toBe(0)
  })

  test('is not done when storage is persistent already', async () => {
    const storage = fakeStorage({ persisted: true })
    const { engine } = await openTab(new SharedDb(), null, { storageManager: storage })
    expect(engine.getSnapshot().persisted).toBe(true)
    await engine.append(ITEM)
    await engine.flush()
    await quiet()
    expect(storage.persistCalls).toBe(0)
  })

  test('a refusal is remembered for 30 days, in a working record that is not exported', async () => {
    const db = new SharedDb()
    const refusing = fakeStorage({ persisted: false, persist: false })
    const first = await openTab(db, null, { storageManager: refusing })
    await first.engine.append(ITEM)
    await first.engine.flush()
    await until(() => first.engine.getSnapshot().working.has('device:persist'), 'the record of the answer')
    expect(first.engine.getSnapshot().persisted).toBe(false)
    expect(first.engine.getSnapshot().working.get('device:persist')?.value).toEqual({ at: '2026-11-04T09:00:00.000Z', granted: false })
    expect(refusing.persistCalls).toBe(1)

    // A later session within the month does not ask again.
    const second = await openTab(db, null, { storageManager: refusing })
    second.clock.advance(29 * 24 * 60 * 60 * 1000)
    await second.engine.append(ITEM)
    await second.engine.flush()
    await quiet()
    expect(refusing.persistCalls).toBe(1)

    // A session after the month does.
    const third = await openTab(db, null, { storageManager: refusing })
    third.clock.advance(31 * 24 * 60 * 60 * 1000)
    await third.engine.append(ITEM)
    await third.engine.flush()
    await until(() => refusing.persistCalls === 2, 'the second request')
  })

  test('is not done on memory, where nothing persists', async () => {
    const broken: LedgerStore = {
      backend: 'idb',
      open: () => Promise.reject(new Error('blocked')),
      readAll: () => Promise.reject(new Error('never opened')),
      commit: () => Promise.reject(new Error('never opened')),
      listCheckpoints: () => Promise.reject(new Error('never opened')),
      readCheckpoint: () => Promise.reject(new Error('never opened')),
      onVersionChange: () => () => undefined,
      close: () => undefined,
    }
    const storage = fakeStorage()
    const { engine } = await openTab(new SharedDb(), null, { store: broken, storageManager: storage })
    await engine.append(ITEM)
    await engine.flush()
    await quiet()
    expect(storage.persistCalls).toBe(0)
    expect(engine.getSnapshot().persisted).toBeNull()
  })

  test('a browser without the API, or one that throws, is no error', async () => {
    for (const manager of [null, {}, { persist: async () => { throw new Error('denied') } }]) {
      const { engine } = await openTab(new SharedDb(), null, { storageManager: manager })
      const result = await engine.append(ITEM)
      expect(result.ok && result.durable).toBe(true)
      await engine.flush()
    }
  })
})

describe('export, clear and import', () => {
  async function filled() {
    const db = new SharedDb({ receipts: [receipt('a')] })
    const tab = await openTab(db, null)
    tab.clock.set('2026-11-04T09:00:00.000Z')
    for (const draft of [ITEM, ACK, REVIEW, CHALLENGE]) {
      tab.clock.advance(1000)
      await tab.engine.append(draft)
    }
    return { db, ...tab }
  }

  test('export, clear, then import (merge) gives byte-identical canonical JSON', async () => {
    const { engine, clock } = await filled()
    clock.set('2026-11-10T12:00:00.000Z')
    const first = await engine.exportLedger()
    if (!first.ok) throw new Error('export refused')
    expect(first.file.events).toHaveLength(4)
    expect(first.file.receipts).toHaveLength(1)

    expect(await engine.reset()).toEqual({ ok: true })
    expect(engine.getSnapshot().events).toEqual([])
    expect(engine.getSnapshot().receipts).toEqual([])

    const imported = await engine.importLedger(first.text, 'merge')
    expect(imported).toMatchObject({ ok: true, summary: { newEvents: 4, newReceipts: 1, mode: 'merge' } })
    expect(engine.getSnapshot().events).toHaveLength(4)

    // The same instant, the same device, the same ledger: the same file.
    const second = await engine.exportLedger()
    if (!second.ok) throw new Error('export refused')
    expect(second.text).toBe(first.text)
    expect(second.bytes).toEqual(first.bytes)
    expect(second.filename).toBe('enginespace-export-2026-11-10.json')
  })

  test('the same holds for a gzip export, and through a fresh tab', async () => {
    const { db, engine, clock } = await filled()
    clock.set('2026-11-10T12:00:00.000Z')
    const first = await engine.exportLedger({ gzip: true })
    if (!first.ok) throw new Error('export refused')
    expect(first.filename).toBe('enginespace-export-2026-11-10.json.gz')
    await engine.reset()
    const fresh = await openTab(db, null)
    fresh.clock.set('2026-11-10T12:00:00.000Z')
    const { readImportFile } = await import('@/evidence/import')
    const read = await readImportFile(new Blob([first.bytes]))
    if (!read.ok) throw new Error('could not read the file')
    expect(read.text).toBe(first.text)
    expect(await fresh.engine.importLedger(read.text, 'merge')).toMatchObject({ ok: true })
    const second = await fresh.engine.exportLedger({ gzip: true })
    expect(second.ok && second.text).toBe(first.text)
  })

  test('importing the same file again changes nothing and keeps no checkpoint', async () => {
    const { engine } = await filled()
    const out = await engine.exportLedger()
    if (!out.ok) throw new Error('export refused')
    const result = await engine.importLedger(out.text, 'merge')
    expect(result).toMatchObject({ ok: true, checkpointId: null, summary: { newEvents: 0, sameEvents: 4 } })
    expect(engine.getSnapshot().checkpoints).toEqual([])
  })

  test('records the export for the backup nudge', async () => {
    const { engine, clock } = await filled()
    expect(engine.getSnapshot().lastExportAt).toBeUndefined()
    clock.set('2026-11-10T12:00:00.000Z')
    await engine.exportLedger()
    expect(engine.getSnapshot().lastExportAt).toBe('2026-11-10T12:00:00.000Z')
  })

  test('the file holds the ledger and not the settings, the outbox or the device\'s bookkeeping', async () => {
    const { engine } = await filled()
    await engine.setWorking('settings:reduced-motion', true)
    const out = await engine.exportLedger()
    if (!out.ok) throw new Error('export refused')
    expect(Object.keys(out.file).sort()).toEqual(['device', 'events', 'exportedAt', 'receipts', 'schema', 'schemaVersion'])
    expect(out.file.device).toBe(engine.getSnapshot().deviceId)
    expect(out.text).not.toContain('settings:')
    expect(out.text).not.toContain('outbox:')
  })

  test('reset erases the evidence, the receipts, the undo points and the working records, and keeps the device', async () => {
    const { db, engine } = await filled()
    const device = engine.getSnapshot().deviceId
    await engine.setWorking('settings:reduced-motion', true)
    const out = await engine.exportLedger()
    if (!out.ok) throw new Error('export refused')
    await engine.importLedger(out.text, 'replace')
    expect(engine.getSnapshot().checkpoints).toHaveLength(0)
    const other = JSON.parse(out.text) as { events: { id: string }[] }
    other.events.pop()
    await engine.importLedger(JSON.stringify(other), 'replace')
    expect(engine.getSnapshot().checkpoints).toHaveLength(1)

    expect(await engine.reset()).toEqual({ ok: true })
    const snapshot = engine.getSnapshot()
    expect(snapshot.events).toEqual([])
    expect(snapshot.receipts).toEqual([])
    expect(snapshot.working.size).toBe(0)
    expect(snapshot.checkpoints).toEqual([])
    expect(snapshot.deviceId).toBe(device)
    const stored = await db.data.readAll()
    expect(stored).toEqual({ events: [], receipts: [], working: [], meta: { deviceId: device, createdAt: '2026-11-04T09:00:00.000Z', schemaVersion: 1 } })
    expect(await db.data.listCheckpoints()).toEqual([])
  })

  test('events written after a reset are the device\'s own, with the same device id', async () => {
    const { engine } = await filled()
    const device = engine.getSnapshot().deviceId
    await engine.reset()
    const result = await engine.append(ITEM)
    expect(result.ok && result.event.dev).toBe(device)
  })
})

describe('import and undo', () => {
  const FILE_AT = '2026-11-03T09:00:00.000Z'
  const fromOtherDevice = async (events: LedgerEvent[], receipts: ReceiptRecord[] = []): Promise<string> => {
    const { buildExport, serializeExport } = await import('@es/ledger')
    return serializeExport(buildExport({ ledger: { events, receipts }, device: 'dev-b2', exportedAt: FILE_AT }))
  }
  const theirs = (): LedgerEvent[] => [copy(EXAMPLES.play), copy(EXAMPLES.prove)]

  test('a preview says what would happen and writes nothing', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.append(ACK)
    const commits = db.commits
    const preview = await engine.previewImport(await fromOtherDevice(theirs(), [receipt('c')]), 'merge')
    if (!preview.ok) throw new Error(preview.detail)
    expect(preview.preview.summary).toMatchObject({ mode: 'merge', fileEvents: 2, newEvents: 2, newReceipts: 1, removedEvents: 0 })
    expect(preview.preview.device).toBe('dev-b2')
    expect(preview.preview.exportedAt).toBe(FILE_AT)
    expect(db.commits).toBe(commits)
    expect(engine.getSnapshot().events).toHaveLength(1)
  })

  test('a merge adds, keeps a checkpoint, and an undo takes it back while keeping what was earned since', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.append(ACK)
    const imported = await engine.importLedger(await fromOtherDevice(theirs(), [receipt('c')]), 'merge')
    if (!imported.ok) throw new Error(imported.detail)
    expect(imported.checkpointId).not.toBeNull()
    expect(imported.summary).toMatchObject({ newEvents: 2, newReceipts: 1 })
    expect(engine.getSnapshot().events).toHaveLength(3)
    expect(engine.getSnapshot().receipts).toHaveLength(1)
    expect(engine.getSnapshot().checkpoints).toEqual([
      expect.objectContaining({ id: imported.checkpointId, reason: 'import-merge', addedEvents: 2, addedReceipts: 1 }),
    ])

    await engine.append(ITEM)
    const undone = await engine.undoImport()
    expect(undone).toEqual({ ok: true, checkpointId: imported.checkpointId as string })
    const kinds = engine.getSnapshot().events.map((event) => event.kind).sort()
    expect(kinds).toEqual(['ack', 'item'])
    expect(engine.getSnapshot().receipts).toEqual([])
    expect(engine.getSnapshot().checkpoints).toEqual([])
    expect(await db.data.listCheckpoints()).toEqual([])
  })

  test('a replace makes the ledger the file\'s, and an undo puts the original back', async () => {
    const db = new SharedDb({ receipts: [receipt('a')] })
    const { engine } = await openTab(db, null)
    await engine.append(ACK)
    await engine.append(ITEM)
    const original = engine.getSnapshot().events.map((event) => event.id)

    const imported = await engine.importLedger(await fromOtherDevice(theirs()), 'replace')
    if (!imported.ok) throw new Error(imported.detail)
    expect(imported.summary).toMatchObject({ mode: 'replace', newEvents: 2, removedEvents: 2, removedReceipts: 1 })
    expect(engine.getSnapshot().events.map((event) => event.kind).sort()).toEqual(['play', 'prove'])
    expect(engine.getSnapshot().receipts).toEqual([])

    expect(await engine.undoImport(imported.checkpointId as string)).toMatchObject({ ok: true })
    expect(engine.getSnapshot().events.map((event) => event.id).sort()).toEqual([...original].sort())
    expect(engine.getSnapshot().receipts.map((record) => record.sha256)).toEqual([sha('a')])
  })

  test('undoes the newest import first', async () => {
    const { engine, clock } = await openTab(new SharedDb(), null)
    const one = await engine.importLedger(await fromOtherDevice([copy(EXAMPLES.play)]), 'merge')
    clock.advance(1000)
    const two = await engine.importLedger(await fromOtherDevice([copy(EXAMPLES.prove)]), 'merge')
    expect(engine.getSnapshot().checkpoints.map((c) => c.id)).toEqual([two.ok ? (two.checkpointId as string) : '', one.ok ? (one.checkpointId as string) : ''])
    await engine.undoImport()
    expect(engine.getSnapshot().events.map((event) => event.kind)).toEqual(['play'])
  })

  test('has nothing to undo before any import', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    expect(await engine.undoImport()).toMatchObject({ ok: false, error: 'no-checkpoint' })
    expect(await engine.undoImport('nope')).toMatchObject({ ok: false, error: 'no-checkpoint' })
  })

  test('keeps the newest three checkpoints', async () => {
    const { engine, clock } = await openTab(new SharedDb(), null)
    for (const example of [EXAMPLES.play, EXAMPLES.prove, EXAMPLES.review, EXAMPLES.predict]) {
      clock.advance(1000)
      await engine.importLedger(await fromOtherDevice([copy(example)]), 'merge')
    }
    expect(engine.getSnapshot().checkpoints).toHaveLength(3)
  })

  test('refuses a file that is not an export, and a file that was edited, and changes nothing', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    await engine.append(ACK)
    const commits = db.commits
    expect(await engine.importLedger('not json', 'merge')).toMatchObject({ ok: false, error: 'parse' })
    expect(await engine.importLedger('{"hello":1}', 'merge')).toMatchObject({ ok: false, error: 'unknown-format' })
    const edited = JSON.parse(await fromOtherDevice(theirs())) as { events: { score?: number }[] }
    edited.events[0].score = 5
    expect(await engine.importLedger(JSON.stringify(edited), 'replace')).toMatchObject({ ok: false, error: 'invalid' })
    const newer = JSON.parse(await fromOtherDevice(theirs())) as { schemaVersion: number }
    newer.schemaVersion = 9
    expect(await engine.importLedger(JSON.stringify(newer), 'merge')).toMatchObject({ ok: false, error: 'newer-schema' })
    expect(db.commits).toBe(commits)
    expect(engine.getSnapshot().events).toHaveLength(1)
  })

  test('refuses cleanly when the store fails, and the ledger stays as it was', async () => {
    const db = new SharedDb()
    let failing = false
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (failing && tx.putCheckpoint) throw new Error('QuotaExceededError')
      },
    })
    const { engine } = await openTab(db, null, { store })
    await engine.append(ACK)
    failing = true
    expect(await engine.importLedger(await fromOtherDevice(theirs()), 'replace')).toMatchObject({ ok: false, error: 'failed' })
    expect(engine.getSnapshot().events).toHaveLength(1)
    expect((await db.data.readAll()).events).toHaveLength(1)
  })

  test('saves what this tab has written before it imports, so a replace takes the right things away', async () => {
    const db = new SharedDb()
    let failing = true
    const store = watch(db.connect(), {
      commit: (tx) => {
        if (failing && tx.putEvents) throw new Error('QuotaExceededError')
      },
    })
    const { engine } = await openTab(db, null, { store })
    const written = await engine.append(ITEM)
    expect(written.ok && written.durable).toBe(false)
    failing = false
    const imported = await engine.importLedger(await fromOtherDevice(theirs()), 'replace')
    expect(imported).toMatchObject({ ok: true, summary: { removedEvents: 1 } })
    expect(engine.getSnapshot().unsaved).toBe(0)
    // The event that was waiting is part of what the checkpoint holds, so undo brings it back.
    await engine.undoImport()
    expect(engine.getSnapshot().events.map((event) => event.kind)).toEqual(['item'])
    expect((await db.data.readAll()).working).toEqual([])
  })

  test('another tab sees an import, an undo and a reset', async () => {
    const db = new SharedDb()
    const bus = new FakeBus()
    const a = await openTab(db, bus)
    const b = await openTab(db, bus)
    const imported = await a.engine.importLedger(await fromOtherDevice(theirs()), 'merge')
    await until(() => b.engine.getSnapshot().events.length === 2, 'the import in the second tab')
    expect(b.engine.getSnapshot().checkpoints).toHaveLength(1)
    expect(imported.ok).toBe(true)
    await a.engine.undoImport()
    await until(() => b.engine.getSnapshot().events.length === 0, 'the undo in the second tab')
    await a.engine.append(ACK)
    await until(() => b.engine.getSnapshot().events.length === 1, 'the event in the second tab')
    await a.engine.reset()
    await until(() => b.engine.getSnapshot().events.length === 0, 'the reset in the second tab')
  })
})

describe('the engine\'s lifetime', () => {
  test('once closed, it writes nothing and tells nobody', async () => {
    const db = new SharedDb()
    const { engine } = await openTab(db, null)
    let notified = 0
    engine.subscribe(() => {
      notified += 1
    })
    engine.close()
    const commits = db.commits
    expect(await engine.append(ACK)).toMatchObject({ ok: false, error: 'closed' })
    expect(await engine.setWorking('settings:reduced-motion', true)).toMatchObject({ ok: false, error: 'closed' })
    expect(await engine.reset()).toMatchObject({ ok: false })
    expect(await engine.importLedger('{}', 'merge')).toMatchObject({ ok: false })
    engine.close()
    expect(notified).toBe(0)
    expect(db.commits).toBe(commits)
  })

  test('a listener is told of a change, and not after it unsubscribes', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    let told = 0
    const off = engine.subscribe(() => {
      told += 1
    })
    await engine.append(ACK)
    expect(told).toBeGreaterThan(0)
    const seen = told
    off()
    await engine.append(ACK)
    expect(told).toBe(seen)
  })

  test('a listener that throws neither breaks a write nor keeps the others from hearing', async () => {
    const { engine } = await openTab(new SharedDb(), null)
    const logged = spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      let heard = 0
      engine.subscribe(() => {
        throw new Error('a page bug')
      })
      engine.subscribe(() => {
        heard += 1
      })
      const result = await engine.append(ACK)
      expect(result.ok && result.durable).toBe(true)
      expect(heard).toBeGreaterThan(0)
      expect(logged).toHaveBeenCalled()
      expect(String(logged.mock.calls[0][1])).toContain('a page bug')
    } finally {
      logged.mockRestore()
    }
  })

  test('the tests\' id streams do not collide: two tabs never make the same id', () => {
    expect(seededIds(1001)()).not.toBe(seededIds(1002)())
    expect(fixedClock().nowIso()).toBe('2026-11-04T09:00:00.000Z')
    expect(HEX_A).toHaveLength(64)
    expect(createEvidence).toBeFunction()
  })
})
