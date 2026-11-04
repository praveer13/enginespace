/**
 * The `LedgerStore` conformance suite (ARCHITECTURE §7.1, D-024): what every store must do, written once.
 *
 * It takes a store factory and an assert object, and imports no test runner. `bun test` drives it against the memory store
 * (tests/ledger/memory-store.test.ts), and a Playwright spec drives it against the IndexedDB store in a real browser
 * (e2e/ledger-conformance.spec.ts, W0-T11). It is the design of kernelspace's `store-conformance.ts`, re-implemented for
 * enginespace's five stores and its rule that a stored event is never modified.
 *
 * Each case makes its own store, opens it, and closes it. The suite passes the conflict rules of merge.ts to every commit, as
 * the app does, and it states each expected winner in its own words ("the earlier at stays"), so a store that ignores the
 * rules it is given fails, and so does a rule that is wrong.
 *
 * It is not part of the package's index: production code does not import it.
 */
import { canonicalJson, RESOLVERS } from './merge'
import { LIMITS } from './types'
import type {
  AckEvent,
  Checkpoint,
  CommitResult,
  ItemEvent,
  Json,
  LedgerStore,
  ReceiptRecord,
  Resolvers,
  VerificationReport,
  WorkingRecord,
} from './types'

export interface ConformanceAssert {
  ok(value: unknown, message: string): void
  equal(actual: unknown, expected: unknown, message: string): void
  /** Equality of JSON-like values, whatever the order of their keys. */
  deepEqual(actual: unknown, expected: unknown, message: string): void
}

export type MakeStore = () => LedgerStore | Promise<LedgerStore>

export interface ConformanceCase {
  name: string
  run(makeStore: MakeStore, assert: ConformanceAssert): Promise<void>
}

/** An assert that throws `Error(message)`: enough for a browser harness and for any runner. */
export function makeAssert(): ConformanceAssert {
  const fail = (message: string, detail: string): never => {
    throw new Error(`${message} (${detail})`)
  }
  return {
    ok: (value, message) => {
      if (!value) throw new Error(message)
    },
    equal: (actual, expected, message) => {
      if (actual !== expected) fail(message, `expected ${String(expected)}, got ${String(actual)}`)
    },
    deepEqual: (actual, expected, message) => {
      const a = canonicalJson(actual)
      const b = canonicalJson(expected)
      if (a !== b) fail(message, `expected ${b}, got ${a}`)
    },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Fixtures                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const DAY = '2026-11-04'
const T0 = '2026-11-04T08:00:00.000Z'
const EARLY = '2026-11-04T07:00:00.000Z'
const LATE = '2026-11-04T09:00:00.000Z'

const ack = (id: string, over: Partial<AckEvent> = {}): AckEvent => ({
  id,
  v: 1,
  kind: 'ack',
  ref: 'screen:welcome',
  at: T0,
  tz: 0,
  day: DAY,
  dev: 'dev-a',
  ...over,
})

const item = (id: string, answer: Json): ItemEvent => ({
  id,
  v: 1,
  kind: 'item',
  ref: 'item:gen/tr2.bubble-width/async-on',
  at: T0,
  tz: 0,
  day: DAY,
  dev: 'dev-a',
  score: 1,
  ok: true,
  provenance: 'unseen',
  data: { answer },
})

const sha = (digit: string): string => digit.repeat(64)

const report = (at: string, finding: string): VerificationReport => ({ at, report: { finding } })

const receipt = (digit: string, reports: VerificationReport[] = []): ReceiptRecord => ({
  sha256: sha(digit),
  receipt: { lab: 'tr8.replay', stage: 'tr8.replay.s2' },
  reports,
})

const work = (key: string, value: Json, at: string, dev = 'dev-a'): WorkingRecord => ({ key, value, at, dev })

const checkpoint = (id: string, at: string, over: Partial<Checkpoint> = {}): Checkpoint => ({
  id,
  reason: 'import-merge',
  at,
  addedEventIds: [],
  restoredEvents: [],
  addedReceiptIds: [],
  restoredReceipts: [],
  ...over,
})

const NO_CHANGE: CommitResult = { eventIds: [], clashIds: [], receiptIds: [], workingKeys: [], metaClaimed: [] }

const ids = (events: { id: string }[]): string[] => events.map((event) => event.id).sort()

async function withStore(makeStore: MakeStore, run: (store: LedgerStore) => Promise<void>): Promise<void> {
  const store = await makeStore()
  try {
    await store.open()
    await run(store)
  } finally {
    store.close()
  }
}

async function rejects(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise
    return false
  } catch {
    return true
  }
}

const boom = (): never => {
  throw new Error('resolver boom')
}
const THROWING: Resolvers = { event: boom, receipt: boom, working: boom }

/* ------------------------------------------------------------------------------------------------------------------ */
/* Cases                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export const STORE_CONFORMANCE_CASES: ConformanceCase[] = [
  {
    name: 'a fresh store reports no schema and reads empty',
    run: async (makeStore, a) => {
      const store = await makeStore()
      try {
        const info = await store.open()
        a.equal(info.backend, store.backend, 'info.backend matches store.backend')
        a.equal(info.schemaVersion, null, 'a fresh schemaVersion is null')
        a.equal(info.readOnly, false, 'a fresh store is writable')
        a.deepEqual(await store.readAll(), { events: [], receipts: [], working: [], meta: {} }, 'a fresh store is empty')
        a.deepEqual(await store.listCheckpoints(), [], 'no checkpoints')
        a.equal(await store.readCheckpoint('nope'), undefined, 'no checkpoint by that id')
      } finally {
        store.close()
      }
    },
  },
  {
    name: 'an empty commit is a no-op',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        a.deepEqual(await store.commit({}, RESOLVERS), NO_CHANGE, 'the result is empty')
      }),
  },
  {
    name: 'putEvents inserts, and an identical re-put changes nothing and flags nothing',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const event = ack('e1')
        const first = await store.commit({ putEvents: [event] }, RESOLVERS)
        a.deepEqual(first.eventIds, ['e1'], 'the first put reports the id')
        const second = await store.commit({ putEvents: [event, structuredClone(event)] }, RESOLVERS)
        a.deepEqual(second, NO_CHANGE, 'an identical re-put changes nothing')
        a.deepEqual((await store.readAll()).events, [event], 'exactly one event is stored')
      }),
  },
  {
    name: 'a clash on an id keeps the earlier at, whichever arrives first, and flags the id',
    run: async (makeStore, a) => {
      const early = ack('x', { at: EARLY })
      const late = ack('x', { at: LATE })
      for (const [first, second] of [
        [early, late],
        [late, early],
      ]) {
        await withStore(makeStore, async (store) => {
          const r1 = await store.commit({ putEvents: [first] }, RESOLVERS)
          a.deepEqual(r1.eventIds, ['x'], 'the first put creates the event')
          a.deepEqual(r1.clashIds, [], 'the first put clashes with nothing')
          const r2 = await store.commit({ putEvents: [second] }, RESOLVERS)
          a.deepEqual(r2.clashIds, ['x'], 'the second put is flagged as a clash')
          a.deepEqual(r2.eventIds, first === late ? ['x'] : [], 'a replacement is reported only when the stored event changed')
          a.deepEqual((await store.readAll()).events, [early], 'the event with the earlier at stays, whatever the order')
        })
      }
    },
  },
  {
    name: 'two events with one id inside a batch settle to the earlier at',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const early = ack('x', { at: EARLY })
        const late = ack('x', { at: LATE })
        const result = await store.commit({ putEvents: [late, early, structuredClone(late)] }, RESOLVERS)
        a.deepEqual(result.eventIds, ['x'], 'the id is reported once')
        a.deepEqual(result.clashIds, ['x'], 'and flagged once')
        a.deepEqual((await store.readAll()).events, [early], 'the earlier event is stored')
      }),
  },
  {
    name: 'working records are last-writer-wins',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const key = 'settings:reduced-motion'
        const older = work(key, false, '2026-11-04T08:00:00.000Z')
        const newer = work(key, true, '2026-11-04T08:00:01.000Z')
        await store.commit({ putWorking: [newer] }, RESOLVERS)
        const r1 = await store.commit({ putWorking: [older] }, RESOLVERS)
        a.deepEqual(r1.workingKeys, [], 'an older write does not replace')
        a.deepEqual((await store.readAll()).working, [newer], 'the newer record stays')
        const r2 = await store.commit({ putWorking: [older, newer] }, RESOLVERS)
        a.deepEqual(r2.workingKeys, [], 'a batch with the same winner changes nothing')
        const newest = work(key, false, '2026-11-04T08:00:02.000Z')
        const r3 = await store.commit({ putWorking: [newest] }, RESOLVERS)
        a.deepEqual(r3.workingKeys, [key], 'a newer write replaces')
        a.deepEqual((await store.readAll()).working, [newest], 'the newest record stays')
        // At the same instant the larger device id wins.
        const tieA = work('draft:tr2.l3', 'a', T0, 'dev-a')
        const tieB = work('draft:tr2.l3', 'b', T0, 'dev-b')
        await store.commit({ putWorking: [tieB, tieA] }, RESOLVERS)
        const draft = (await store.readAll()).working.find((record) => record.key === 'draft:tr2.l3')
        a.deepEqual(draft, tieB, 'the larger device id wins a tie on at')
      }),
  },
  {
    name: 'putMetaIfAbsent claims a key once and never overwrites it',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const r1 = await store.commit({ putMetaIfAbsent: { deviceId: 'dev-1', createdAt: T0 } }, RESOLVERS)
        a.deepEqual([...r1.metaClaimed].sort(), ['createdAt', 'deviceId'], 'the first claim wins every key')
        const r2 = await store.commit({ putMetaIfAbsent: { deviceId: 'dev-2' } }, RESOLVERS)
        a.deepEqual(r2.metaClaimed, [], 'a second claim is refused')
        a.deepEqual((await store.readAll()).meta, { deviceId: 'dev-1', createdAt: T0 }, 'the first claim is kept')
        // putMeta overwrites, and a key it writes in the same commit counts as present.
        const r3 = await store.commit({ putMeta: { schemaVersion: 1 }, putMetaIfAbsent: { schemaVersion: 2 } }, RESOLVERS)
        a.deepEqual(r3.metaClaimed, [], 'a key written in the same commit is not claimed')
        await store.commit({ putMeta: { deviceId: 'dev-3' } }, RESOLVERS)
        a.deepEqual((await store.readAll()).meta, { deviceId: 'dev-3', createdAt: T0, schemaVersion: 1 }, 'putMeta overwrites')
      }),
  },
  {
    name: 'a resolver that throws leaves no partial write',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const stored = ack('keep', { at: EARLY })
        await store.commit({ putEvents: [stored], putReceipts: [receipt('a', [report(T0, 'first')])], putMeta: { deviceId: 'dev-1' } }, RESOLVERS)
        const before = await store.readAll()
        const tx = {
          clear: ['working' as const],
          deleteEventIds: ['other'],
          putEvents: [ack('fresh'), ack('keep', { at: LATE })],
          putReceipts: [receipt('b')],
          putWorking: [work('settings:reduced-motion', true, T0)],
          putMeta: { schemaVersion: 1 },
          putCheckpoint: checkpoint('c1', T0),
        }
        a.ok(await rejects(store.commit(tx, THROWING)), 'the commit rejects when a resolver throws')
        a.deepEqual(await store.readAll(), before, 'the stored contents are unchanged')
        a.deepEqual(await store.listCheckpoints(), [], 'no checkpoint was written')
      }),
  },
  {
    name: 'clear empties the stores it names and no others',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        await store.commit(
          {
            putEvents: [ack('e1'), ack('e2')],
            putReceipts: [receipt('a')],
            putWorking: [work('settings:reduced-motion', true, T0)],
            putMeta: { deviceId: 'dev-1' },
            putCheckpoint: checkpoint('c1', T0),
          },
          RESOLVERS,
        )
        const result = await store.commit({ clear: ['events', 'working'], putEvents: [ack('e3')] }, RESOLVERS)
        a.deepEqual(result.eventIds, ['e3'], 'only the new event is reported')
        const all = await store.readAll()
        a.deepEqual(ids(all.events), ['e3'], 'events were replaced')
        a.deepEqual(all.working, [], 'working was cleared')
        a.deepEqual(ids(all.receipts.map((record) => ({ id: record.sha256 }))), [sha('a')], 'receipts survived')
        a.deepEqual(all.meta, { deviceId: 'dev-1' }, 'meta survived')
        a.deepEqual((await store.listCheckpoints()).map((c) => c.id), ['c1'], 'checkpoints survived')
        await store.commit({ clear: ['receipts', 'checkpoints'] }, RESOLVERS)
        a.deepEqual((await store.readAll()).receipts, [], 'receipts were cleared')
        a.deepEqual(await store.listCheckpoints(), [], 'checkpoints were cleared')
      }),
  },
  {
    name: 'a commit applies clear, then deletes, then puts',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        await store.commit({ putEvents: [ack('a'), ack('b'), ack('c')] }, RESOLVERS)
        await store.commit({ clear: ['events'], deleteEventIds: ['b'], putEvents: [ack('b'), ack('d')] }, RESOLVERS)
        a.deepEqual(ids((await store.readAll()).events), ['b', 'd'], 'a put after a delete after a clear stays')
        // A delete followed by a put also overrides a stored event that the clash rule would keep.
        await store.commit({ putEvents: [ack('b', { at: EARLY })] }, RESOLVERS)
        const replaced = ack('b', { at: LATE })
        await store.commit({ deleteEventIds: ['b'], putEvents: [replaced] }, RESOLVERS)
        a.deepEqual((await store.readAll()).events.find((event) => event.id === 'b'), replaced, 'delete then put overrides')
      }),
  },
  {
    name: 'deletes remove events, receipts, working records, meta and checkpoints',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        await store.commit(
          {
            putEvents: [ack('a'), ack('b')],
            putReceipts: [receipt('a'), receipt('b')],
            putWorking: [work('settings:reduced-motion', true, T0), work('settings:tier-cap', 2, T0)],
            putMeta: { deviceId: 'dev-1', createdAt: T0 },
            putCheckpoint: checkpoint('c1', T0),
          },
          RESOLVERS,
        )
        await store.commit(
          {
            deleteEventIds: ['a', 'missing'],
            deleteReceiptIds: [sha('a')],
            deleteWorkingKeys: ['settings:reduced-motion'],
            deleteMeta: ['createdAt'],
            deleteCheckpointIds: ['c1'],
          },
          RESOLVERS,
        )
        const all = await store.readAll()
        a.deepEqual(ids(all.events), ['b'], 'the event was deleted')
        a.deepEqual(all.receipts.map((record) => record.sha256), [sha('b')], 'the receipt was deleted')
        a.deepEqual(all.working.map((record) => record.key), ['settings:tier-cap'], 'the working record was deleted')
        a.deepEqual(all.meta, { deviceId: 'dev-1' }, 'the meta key was deleted')
        a.deepEqual(await store.listCheckpoints(), [], 'the checkpoint was deleted')
      }),
  },
  {
    name: 'a receipt is inserted once, and re-verification adds a report',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const first = report('2026-11-04T08:00:00.000Z', 'first rules')
        const second = report('2026-11-05T08:00:00.000Z', 'later rules')
        const r1 = await store.commit({ putReceipts: [receipt('a', [first])] }, RESOLVERS)
        a.deepEqual(r1.receiptIds, [sha('a')], 'the receipt is created')
        const r2 = await store.commit({ putReceipts: [receipt('a', [first])] }, RESOLVERS)
        a.deepEqual(r2.receiptIds, [], 'an identical re-put changes nothing')
        const r3 = await store.commit({ putReceipts: [receipt('a', [second])] }, RESOLVERS)
        a.deepEqual(r3.receiptIds, [sha('a')], 'a new report changes the record')
        const stored = (await store.readAll()).receipts
        a.equal(stored.length, 1, 'there is still one receipt')
        a.deepEqual(stored[0].reports, [first, second], 'it holds both reports, oldest first')
      }),
  },
  {
    name: 'a store keeps only the newest checkpoints',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const written = LIMITS.checkpoints + 2
        for (let n = 1; n <= written; n += 1) {
          await store.commit({ putCheckpoint: checkpoint(`c${n}`, `2026-11-${String(n).padStart(2, '0')}T08:00:00.000Z`) }, RESOLVERS)
        }
        const kept = Array.from({ length: LIMITS.checkpoints }, (_, index) => `c${written - index}`)
        a.deepEqual((await store.listCheckpoints()).map((c) => c.id), kept, 'the newest ones stay, newest first')
        a.equal(await store.readCheckpoint('c1'), undefined, 'the oldest are gone')
        a.ok((await store.readCheckpoint(kept[kept.length - 1])) !== undefined, 'the kept ones can be read')
      }),
  },
  {
    name: 'a checkpoint reads back whole, and the list holds counts only',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const whole = checkpoint('c1', T0, {
          reason: 'import-replace',
          addedEventIds: ['n1', 'n2'],
          restoredEvents: [ack('old')],
          addedReceiptIds: [sha('a')],
          restoredReceipts: [receipt('b', [report(T0, 'kept')])],
        })
        await store.commit({ putCheckpoint: whole }, RESOLVERS)
        a.deepEqual(await store.readCheckpoint('c1'), whole, 'the checkpoint round-trips')
        a.deepEqual(
          await store.listCheckpoints(),
          [{ id: 'c1', reason: 'import-replace', at: T0, addedEvents: 2, restoredEvents: 1, addedReceipts: 1, restoredReceipts: 1 }],
          'the list is metadata',
        )
      }),
  },
  {
    name: 'stored data is isolated from the caller',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const event = item('iso', { lo: 1, hi: 2 })
        const record = work('draft:tr2.l3', { text: 'a' }, T0)
        await store.commit({ putEvents: [event], putWorking: [record] }, RESOLVERS)
        // Changing what was written must not reach the store.
        event.at = '2000-01-01T00:00:00.000Z'
        ;(event.data.answer as { lo: number }).lo = 99
        ;(record.value as { text: string }).text = 'b'
        const first = await store.readAll()
        a.equal(first.events[0].at, T0, 'a change to the written event does not leak in')
        a.deepEqual((first.events[0] as ItemEvent).data.answer, { lo: 1, hi: 2 }, 'nor does a change inside its data')
        a.deepEqual(first.working[0].value, { text: 'a' }, 'nor a change to the written working record')
        // Changing what was read must not reach the store either.
        first.events[0].at = '2001-01-01T00:00:00.000Z'
        ;(first.working[0].value as { text: string }).text = 'c'
        const second = await store.readAll()
        a.equal(second.events[0].at, T0, 'a change to a read event does not leak back')
        a.deepEqual(second.working[0].value, { text: 'a' }, 'nor a change to a read working record')
      }),
  },
  {
    name: 'an event and its outbox entry move in one commit',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const event = ack('e1')
        const pending = work('outbox:e1', JSON.parse(JSON.stringify(event)) as Json, T0)
        await store.commit({ putWorking: [pending] }, RESOLVERS)
        a.deepEqual((await store.readAll()).working, [pending], 'the entry waits in working')
        const result = await store.commit({ putEvents: [event], deleteWorkingKeys: ['outbox:e1'] }, RESOLVERS)
        a.deepEqual(result.eventIds, ['e1'], 'the event is written')
        const all = await store.readAll()
        a.deepEqual(all.events, [event], 'the event is stored')
        a.deepEqual(all.working, [], 'and the entry is gone')
      }),
  },
  {
    name: 'many events commit in one batch',
    run: (makeStore, a) =>
      withStore(makeStore, async (store) => {
        const events = Array.from({ length: 2000 }, (_, index) => ack(`bulk-${index}`))
        const result = await store.commit({ putEvents: events }, RESOLVERS)
        a.equal(result.eventIds.length, 2000, 'every id is reported')
        const again = await store.commit({ putEvents: events }, RESOLVERS)
        a.equal(again.eventIds.length, 0, 'a second pass changes nothing')
        a.equal((await store.readAll()).events.length, 2000, 'all of them are stored, once')
      }),
  },
]

/**
 * Runs every case in order. It rejects with the first failure after running them all, and `onCase` sees each result as it
 * comes, so a harness can print a line per case.
 */
export async function runStoreConformance(
  makeStore: MakeStore,
  assert: ConformanceAssert,
  onCase?: (name: string, error?: unknown) => void,
): Promise<void> {
  let first: unknown
  for (const conformanceCase of STORE_CONFORMANCE_CASES) {
    try {
      await conformanceCase.run(makeStore, assert)
      onCase?.(conformanceCase.name)
    } catch (error) {
      onCase?.(conformanceCase.name, error)
      first ??= error
    }
  }
  if (first !== undefined) throw first
}
