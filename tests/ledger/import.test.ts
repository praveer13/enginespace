/*
 * W0-T10's acceptance check 2: "Over 200 seeds, double import, merging in any order, and replace-then-undo all give identical
 * ledgers." (merge.test.ts has the laws of the join itself.)
 *
 * Each property runs twice. Once on plain ledgers, through `planImport` and `planUndo`, and once on a memory store, where the
 * plan's one transaction is committed and the store's own rules do the work. The two must agree with each other: the plan says
 * what the ledger becomes, and the store, which knows nothing of the plan, has to arrive there.
 *
 * The seeds draw from a small pool of ids, so a file and a ledger share ids, with the same content and with other content. How many
 * seeds there are is the knob of tests/seeds.ts: 200 on a pull request, 10,000 in the nightly run.
 */
import { describe, expect, test } from 'bun:test'
import {
  buildExport,
  canonicalJson,
  checkpointMeta,
  mergeLedgers,
  MemoryStore,
  normalizeLedger,
  parseExport,
  planImport,
  planUndo,
  RESOLVERS,
  sameLedger,
  serializeExport,
} from '@es/ledger'
import type { Checkpoint, ImportMode, Ledger, LedgerEvent, ReceiptRecord, Resolvers } from '@es/ledger'
import { seeds } from '../seeds'
import { copy, EXAMPLES, importInto, randomLedger, snapshot, undoIn } from './support'

const SEEDS = seeds(1)
const NOW = '2026-11-10T08:00:00.000Z'
const ctx = (id = 'cp-1') => ({ checkpointId: id, at: NOW })
// A store holds one event per id, so it is seeded with the ledger in normal form.
const fresh = (ledger: Ledger = { events: [], receipts: [] }) => new MemoryStore(copy(normalizeLedger(ledger)))
const text = (ledger: Ledger) => canonicalJson(normalizeLedger(ledger))

/** A pair of ledgers for a seed: what the learner has, and the file they import. */
const pair = (seed: number): { current: Ledger; file: Ledger } => ({ current: randomLedger(seed * 2, 10), file: randomLedger(seed * 2 + 1, 10) })

const ack = (id: string, over: Partial<LedgerEvent> = {}): LedgerEvent => ({ ...copy(EXAMPLES.ack), id, tz: 0, day: '2026-11-04', at: '2026-11-04T08:00:00.000Z', ...over }) as LedgerEvent
const receipt = (digit: string, reports: { at: string; report: object }[] = []): ReceiptRecord => ({ sha256: digit.repeat(64), receipt: { lab: 'tr8.replay' }, reports: reports as never })
const EARLY = '2026-11-04T07:00:00.000Z'
const LATE = '2026-11-04T09:00:00.000Z'

describe('a double import gives the ledger of a single import', () => {
  test.each(['merge', 'replace'] as ImportMode[])(`%s, over ${SEEDS.length} seeds, on ledgers`, (mode) => {
    let changed = 0
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const once = planImport(current, file, mode, ctx())
      const twice = planImport(once.next, file, mode, ctx('cp-2'))
      expect(text(twice.next)).toBe(text(once.next))
      expect(twice.tx).toEqual({})
      expect(twice.checkpoint).toBeNull()
      expect(twice.summary.newEvents).toBe(0)
      expect(twice.summary.removedEvents).toBe(0)
      expect(twice.summary.changedReceipts + twice.summary.newReceipts + twice.summary.removedReceipts).toBe(0)
      if (once.checkpoint !== null) changed += 1
    }
    // Most imports change something, so the property is not about empty plans.
    expect(changed).toBeGreaterThan(150)
  })

  test.each(['merge', 'replace'] as ImportMode[])(`%s, over ${SEEDS.length} seeds, on a store`, async (mode) => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const store = fresh(current)
      const first = await importInto(store, file, mode, 'cp-1')
      const afterFirst = await snapshot(store)
      expect(text(afterFirst)).toBe(text(first.next))
      const checkpoints = await store.listCheckpoints()

      const second = await importInto(store, file, mode, 'cp-2')
      expect(await snapshot(store)).toEqual(afterFirst)
      expect(second.tx).toEqual({})
      expect(await store.listCheckpoints()).toEqual(checkpoints)
    }
  })

  test('the same file read from its text twice is the same import', async () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { current, file } = pair(seed)
      const written = serializeExport(buildExport({ ledger: file, device: 'dev-b2', exportedAt: NOW }))
      const parsed = parseExport(written)
      if (!parsed.ok) throw new Error(parsed.detail)
      const store = fresh(current)
      await importInto(store, parsed.file, 'merge', 'cp-1')
      const once = await snapshot(store)
      await importInto(store, parsed.file, 'merge', 'cp-2')
      expect(await snapshot(store)).toEqual(once)
      expect(text(once)).toBe(text(mergeLedgers(current, file)))
    }
  })
})

describe('merging in any order gives the same ledger', () => {
  test(`on ledgers, three files imported in all six orders, over ${SEEDS.length} seeds`, () => {
    for (const seed of SEEDS) {
      const current = randomLedger(seed * 4, 8)
      const files = [1, 2, 3].map((n) => randomLedger(seed * 4 + n, 8))
      const results = new Set(
        orders([0, 1, 2]).map((order) => text(order.reduce((ledger, n, step) => planImport(ledger, files[n], 'merge', ctx(`cp-${step}`)).next, current))),
      )
      expect(results.size).toBe(1)
      expect([...results][0]).toBe(text(files.reduce((joined, file) => mergeLedgers(joined, file), current)))
    }
  })

  test(`on a store, the same three files in all six orders, over ${SEEDS.length} seeds`, async () => {
    for (const seed of SEEDS) {
      const current = randomLedger(seed * 4, 8)
      const files = [1, 2, 3].map((n) => randomLedger(seed * 4 + n, 8))
      const results = new Set<string>()
      for (const order of orders([0, 1, 2])) {
        const store = fresh(current)
        for (const [step, n] of order.entries()) await importInto(store, files[n], 'merge', `cp-${step}`)
        results.add(text(await snapshot(store)))
      }
      expect(results.size).toBe(1)
    }
  })

  test('a merge is the join of the two ledgers, and a plan and a store agree on it', async () => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const plan = planImport(current, file, 'merge', ctx())
      expect(text(plan.next)).toBe(text(mergeLedgers(current, file)))
      const store = fresh(current)
      await store.commit(plan.tx, RESOLVERS)
      expect(text(await snapshot(store))).toBe(text(plan.next))
    }
  })
})

describe('replace-then-undo gives the ledger back', () => {
  test.each(['merge', 'replace'] as ImportMode[])(`%s then undo, over ${SEEDS.length} seeds, on ledgers`, (mode) => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const plan = planImport(current, file, mode, ctx())
      if (plan.checkpoint === null) {
        expect(text(plan.next)).toBe(text(current))
        continue
      }
      expect(plan.checkpoint.reason).toBe(mode === 'merge' ? 'import-merge' : 'import-replace')
      const undone = planUndo(plan.next, plan.checkpoint)
      expect(text(undone.next)).toBe(text(current))
      expect(undone.tx.deleteCheckpointIds).toEqual(['cp-1'])
    }
  })

  test.each(['merge', 'replace'] as ImportMode[])(`%s then undo, over ${SEEDS.length} seeds, on a store`, async (mode) => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const store = fresh(current)
      const before = await snapshot(store)
      const plan = await importInto(store, file, mode, 'cp-1')
      if (plan.checkpoint === null) {
        expect(await snapshot(store)).toEqual(before)
        expect(await store.listCheckpoints()).toEqual([])
        continue
      }
      expect(await store.listCheckpoints()).toHaveLength(1)
      const undo = await undoIn(store, 'cp-1')
      expect(await snapshot(store)).toEqual(before)
      expect(text(undo.next)).toBe(text(current))
      expect(await store.listCheckpoints()).toEqual([])
      expect(await store.readCheckpoint('cp-1')).toBeUndefined()
    }
  })

  test(`two replaces are undone one after the other, newest first, over ${SEEDS.length} seeds`, async () => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const other = randomLedger(seed * 2 + 7, 10)
      const store = fresh(current)
      const before = await snapshot(store)
      const first = await importInto(store, file, 'replace', 'cp-1')
      const middle = await snapshot(store)
      const second = await importInto(store, other, 'replace', 'cp-2')
      if (second.checkpoint !== null) {
        await undoIn(store, 'cp-2')
        expect(await snapshot(store)).toEqual(middle)
      }
      if (first.checkpoint !== null) {
        await undoIn(store, 'cp-1')
        expect(await snapshot(store)).toEqual(before)
      }
    }
  })

  test(`what was written after the import stays, over ${SEEDS.length} seeds`, async () => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      for (const mode of ['merge', 'replace'] as ImportMode[]) {
        const store = fresh(current)
        const before = await snapshot(store)
        const plan = await importInto(store, file, mode, 'cp-1')
        const later = ack(`later-${seed}`, { at: '2026-11-12T08:00:00.000Z' })
        await store.commit({ putEvents: [later] }, RESOLVERS)
        if (plan.checkpoint === null) continue
        await undoIn(store, 'cp-1')
        expect(text(await snapshot(store))).toBe(text(mergeLedgers(before, { events: [later], receipts: [] })))
      }
    }
  })

  test('undoing twice changes nothing the second time', async () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { current, file } = pair(seed)
      const store = fresh(current)
      const plan = await importInto(store, file, 'replace', 'cp-1')
      if (plan.checkpoint === null) continue
      const checkpoint = (await store.readCheckpoint('cp-1')) as Checkpoint
      await undoIn(store, 'cp-1')
      const once = await snapshot(store)
      // The checkpoint is gone, but a caller that kept it can plan the undo again, and it finds nothing to do.
      const again = planUndo(once, checkpoint)
      expect(text(again.next)).toBe(text(once))
      expect(again.tx.putEvents ?? []).toEqual([])
      expect(again.tx.deleteEventIds ?? []).toEqual([])
    }
  })
})

describe('what an import does, case by case', () => {
  test('a merge adds what is new, keeps what is the same and flags a clash', () => {
    const a = ack('a')
    const clashing = ack('a', { at: LATE })
    const b = ack('b')
    const c = ack('c')
    const plan = planImport({ events: [a, b], receipts: [] }, { events: [clashing, b, c], receipts: [] }, 'merge', ctx())
    expect(plan.summary).toEqual({
      mode: 'merge',
      fileEvents: 3,
      newEvents: 1,
      sameEvents: 1,
      clashedEvents: 1,
      removedEvents: 0,
      fileReceipts: 0,
      newReceipts: 0,
      changedReceipts: 0,
      removedReceipts: 0,
    })
    expect(plan.clashes).toEqual([{ id: 'a', kept: a, flagged: clashing }])
    expect(plan.next.events.map((event) => event.id)).toEqual(['a', 'b', 'c'])
    expect(plan.next.events[0]).toEqual(a)
    expect(plan.tx).toEqual({ putEvents: [c], putCheckpoint: plan.checkpoint as Checkpoint })
    expect(plan.checkpoint).toEqual({ id: 'cp-1', reason: 'import-merge', at: NOW, addedEventIds: ['c'], restoredEvents: [], addedReceiptIds: [], restoredReceipts: [] })
  })

  test('a merge takes the file\'s event when its at is the earlier, and undo puts the original back', async () => {
    const stored = ack('a', { at: LATE })
    const earlier = ack('a', { at: EARLY })
    const store = fresh({ events: [stored], receipts: [] })
    const plan = await importInto(store, { events: [earlier], receipts: [] }, 'merge', 'cp-1')
    expect(plan.clashes).toEqual([{ id: 'a', kept: earlier, flagged: stored }])
    expect(plan.checkpoint?.restoredEvents).toEqual([stored])
    expect((await snapshot(store)).events).toEqual([earlier])
    await undoIn(store, 'cp-1')
    expect((await snapshot(store)).events).toEqual([stored])
  })

  test('a replace makes the ledger the file\'s, takes the file\'s event on a clash even when the stored one is earlier, and counts what it removes', async () => {
    const goneEvent = ack('gone')
    const storedEarly = ack('x', { at: EARLY })
    const fileLate = ack('x', { at: LATE })
    const added = ack('new')
    const store = fresh({ events: [goneEvent, storedEarly], receipts: [receipt('1'), receipt('2', [{ at: EARLY, report: { n: 1 } }])] })
    const file = { events: [fileLate, added], receipts: [receipt('2', [{ at: LATE, report: { n: 2 } }]), receipt('3')] }
    const plan = await importInto(store, file, 'replace', 'cp-1')
    expect(plan.summary).toMatchObject({ fileEvents: 2, newEvents: 1, sameEvents: 0, clashedEvents: 1, removedEvents: 1, fileReceipts: 2, newReceipts: 1, changedReceipts: 1, removedReceipts: 1 })
    expect(plan.clashes).toEqual([{ id: 'x', kept: fileLate, flagged: storedEarly }])
    expect(plan.tx.deleteEventIds?.slice().sort()).toEqual(['gone', 'x'])
    const after = await snapshot(store)
    expect(after.events.map((event) => event.id).sort()).toEqual(['new', 'x'])
    expect(after.events.find((event) => event.id === 'x')).toEqual(fileLate)
    expect(after.receipts.map((record) => record.sha256)).toEqual([receipt('2').sha256, receipt('3').sha256])
    expect(after.receipts[0].reports).toEqual([{ at: LATE, report: { n: 2 } }])

    await undoIn(store, 'cp-1')
    const undone = await snapshot(store)
    expect(undone.events.map((event) => event.id).sort()).toEqual(['gone', 'x'])
    expect(undone.events.find((event) => event.id === 'x')).toEqual(storedEarly)
    expect(undone.receipts.map((record) => record.sha256)).toEqual([receipt('1').sha256, receipt('2').sha256])
    expect(undone.receipts[1].reports).toEqual([{ at: EARLY, report: { n: 1 } }])
  })

  test('a merge joins the reports of a receipt, and undo takes the joined record back to the original', async () => {
    const store = fresh({ events: [], receipts: [receipt('2', [{ at: EARLY, report: { n: 1 } }])] })
    const plan = await importInto(store, { events: [], receipts: [receipt('2', [{ at: LATE, report: { n: 2 } }]), receipt('4')] }, 'merge', 'cp-1')
    expect(plan.summary).toMatchObject({ newReceipts: 1, changedReceipts: 1, removedReceipts: 0 })
    const joined = await snapshot(store)
    expect(joined.receipts.map((record) => record.sha256)).toEqual([receipt('2').sha256, receipt('4').sha256])
    expect(joined.receipts[0].reports.map((report) => report.at)).toEqual([EARLY, LATE])
    await undoIn(store, 'cp-1')
    const undone = await snapshot(store)
    expect(undone.receipts).toEqual([receipt('2', [{ at: EARLY, report: { n: 1 } }])])
  })

  test('a file that adds nothing is no change, no transaction and no checkpoint', async () => {
    const ledger: Ledger = { events: [ack('a'), ack('b')], receipts: [receipt('1')] }
    const store = fresh(ledger)
    const first = await importInto(store, { events: [ack('x')], receipts: [] }, 'merge', 'cp-1')
    expect(first.checkpoint).not.toBeNull()
    const noop = await importInto(store, ledger, 'merge', 'cp-2')
    expect(noop.tx).toEqual({})
    expect(noop.checkpoint).toBeNull()
    expect((await store.listCheckpoints()).map((c) => c.id)).toEqual(['cp-1'])
    // A clash that the stored event wins changes nothing either.
    const clash = await importInto(store, { events: [ack('a', { at: LATE })], receipts: [] }, 'merge', 'cp-3')
    expect(clash.summary.clashedEvents).toBe(1)
    expect(clash.tx).toEqual({})
    expect(clash.checkpoint).toBeNull()
  })

  test('a file that repeats an id is settled before it is compared', () => {
    const plan = planImport({ events: [], receipts: [] }, { events: [ack('a', { at: LATE }), ack('a', { at: EARLY })], receipts: [] }, 'merge', ctx())
    expect(plan.summary.fileEvents).toBe(1)
    expect(plan.next.events).toEqual([ack('a', { at: EARLY })])
  })

  test('the plans do not change the ledgers they are given', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { current, file } = pair(seed)
      const before = canonicalJson([current, file])
      for (const mode of ['merge', 'replace'] as ImportMode[]) {
        const plan = planImport(current, file, mode, ctx())
        if (plan.checkpoint !== null) planUndo(plan.next, plan.checkpoint)
      }
      expect(canonicalJson([current, file])).toBe(before)
    }
  })

  test('the summary adds up', () => {
    for (const seed of SEEDS) {
      const { current, file } = pair(seed)
      const merged = planImport(current, file, 'merge', ctx()).summary
      expect(merged.newEvents + merged.sameEvents + merged.clashedEvents).toBe(merged.fileEvents)
      const replaced = planImport(current, file, 'replace', ctx()).summary
      expect(replaced.newEvents + replaced.sameEvents + replaced.clashedEvents).toBe(replaced.fileEvents)
      expect(replaced.removedEvents).toBe(normalizeLedger(current).events.filter((e) => !normalizeLedger(file).events.some((f) => f.id === e.id)).length)
    }
  })
})

describe('the import is one transaction', () => {
  const THROWING: Resolvers = {
    event: () => {
      throw new Error('boom')
    },
    receipt: () => {
      throw new Error('boom')
    },
    working: () => {
      throw new Error('boom')
    },
  }

  test('a rule that fails halfway leaves no half-imported ledger and no checkpoint', async () => {
    const stored = ack('a', { at: LATE })
    const store = fresh({ events: [stored], receipts: [] })
    const plan = planImport({ events: [stored], receipts: [] }, { events: [ack('new'), ack('a', { at: EARLY })], receipts: [receipt('1')] }, 'merge', ctx())
    expect(plan.tx.putCheckpoint).toBeDefined()
    await expect(store.commit(plan.tx, THROWING)).rejects.toThrow('boom')
    expect((await snapshot(store)).events).toEqual([stored])
    expect(await store.listCheckpoints()).toEqual([])
  })

  test('the checkpoint is written with the import, and it counts what the import changed', async () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { current, file } = pair(seed)
      const store = fresh(current)
      const plan = await importInto(store, file, 'replace', 'cp-1')
      const listed = await store.listCheckpoints()
      if (plan.checkpoint === null) {
        expect(listed).toEqual([])
        continue
      }
      expect(listed).toEqual([checkpointMeta(plan.checkpoint)])
      expect(listed[0].addedEvents).toBe(plan.summary.newEvents)
      expect(listed[0].restoredEvents).toBe(plan.summary.removedEvents + plan.summary.clashedEvents)
    }
  })

  test('only the newest checkpoints are kept, and each can be undone in turn, newest first', async () => {
    const store = fresh()
    const files = Array.from({ length: 5 }, (_, n) => ({ events: [ack(`file-${n}`)], receipts: [] as ReceiptRecord[] }))
    for (const [n, file] of files.entries()) {
      const plan = planImport(await snapshot(store), file, 'merge', { checkpointId: `cp-${n}`, at: `2026-11-1${n}T08:00:00.000Z` })
      await store.commit(plan.tx, RESOLVERS)
    }
    expect((await store.listCheckpoints()).map((c) => c.id)).toEqual(['cp-4', 'cp-3', 'cp-2'])
    await undoIn(store, 'cp-4')
    await undoIn(store, 'cp-3')
    await undoIn(store, 'cp-2')
    expect((await snapshot(store)).events.map((event) => event.id)).toEqual(['file-0', 'file-1'])
    expect(await store.listCheckpoints()).toEqual([])
  })
})

/** Every order of the items. */
function orders<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, index) => orders([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]))
}

test('sameLedger and the text of a ledger agree', () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const { current, file } = pair(seed)
    expect(sameLedger(current, file)).toBe(text(current) === text(file))
  }
})
