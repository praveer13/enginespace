/*
 * The merge rules (ARCHITECTURE §7.5): of two events with one id the earlier `at` stays, receipts join their reports, and the
 * join of ledgers does not depend on the order they arrive in. That last property is the first half of W0-T10's acceptance
 * check 2 ("merging in any order gives identical ledgers"); import.test.ts has the rest, with import and undo.
 *
 * The seeds draw ledgers from a small pool of ids, so two ledgers share some ids with the same content and some with other
 * content. A test that counts those first proves that the laws below are not vacuous. How many seeds there are is the knob of
 * tests/seeds.ts: 200 on a pull request, 10,000 in the nightly run.
 */
import { describe, expect, test } from 'bun:test'
import {
  canonicalEvent,
  canonicalJson,
  compareEvents,
  lwwWorking,
  mergeEvents,
  mergeLedgers,
  mergeReceiptRecord,
  mergeReceipts,
  normalizeLedger,
  RESOLVERS,
  sameJson,
  sameLedger,
} from '@es/ledger'
import type { Ledger, LedgerEvent, ReceiptRecord, WorkingRecord } from '@es/ledger'
import { seeds } from '../seeds'
import { copy, EXAMPLES, randomLedger } from './support'

const SEEDS = seeds(1)
const text = (ledger: Ledger) => canonicalJson(normalizeLedger(ledger))
const ack = (id: string, over: Partial<LedgerEvent> = {}): LedgerEvent => ({ ...copy(EXAMPLES.ack), id, tz: 0, day: '2026-11-04', at: '2026-11-04T08:00:00.000Z', ...over }) as LedgerEvent

describe('canonical text', () => {
  test('sorts the keys of every object, keeps the order of a list, and leaves out what is undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null, z: undefined } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}')
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]')
    expect(canonicalJson('x')).toBe('"x"')
    expect(canonicalJson(null)).toBe('null')
  })

  test('equal values are one text whatever the order of their keys, and different values are two', () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalJson({ b: { d: 3, c: 2 }, a: 1 }))
    expect(sameJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson({ a: undefined }, {})).toBe(true)
  })

  test('a member named __proto__ is a member', () => {
    const hostile = JSON.parse('{"b":1,"__proto__":{"x":1},"a":2}') as object
    expect(canonicalJson(hostile)).toBe('{"__proto__":{"x":1},"a":2,"b":1}')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe('which of two events with one id stays', () => {
  const early = ack('x', { at: '2026-11-04T07:00:00.000Z' })
  const late = ack('x', { at: '2026-11-04T09:00:00.000Z' })

  test('the earlier at', () => {
    expect(canonicalEvent(early, late)).toBe(early)
    expect(canonicalEvent(late, early)).toBe(early)
  })

  test('the very same event is itself', () => {
    expect(canonicalEvent(early, early)).toBe(early)
  })

  test('at the same instant, the smaller canonical JSON, whichever way round', () => {
    const a = { ...copy(EXAMPLES.item), id: 'x', score: 0.25 } as LedgerEvent
    const b = { ...copy(EXAMPLES.item), id: 'x', score: 0.75 } as LedgerEvent
    expect(canonicalJson(a) < canonicalJson(b)).toBe(true)
    expect(canonicalEvent(a, b)).toBe(a)
    expect(canonicalEvent(b, a)).toBe(a)
  })

  test('over many pairs it returns one of the two, it does not depend on the order, and it has the earlier at', () => {
    let clashes = 0
    for (const seed of SEEDS) {
      const [a] = randomLedger(seed, 12).events
      const [b] = randomLedger(seed + 1000, 12).events
      if (a === undefined || b === undefined) continue
      const x: LedgerEvent = { ...a, id: 'shared' }
      const y: LedgerEvent = { ...b, id: 'shared' }
      const winner = canonicalEvent(x, y)
      expect(winner === x || winner === y).toBe(true)
      expect(sameJson(winner, canonicalEvent(y, x))).toBe(true)
      expect(winner.at <= (winner === x ? y.at : x.at)).toBe(true)
      if (!sameJson(x, y)) clashes += 1
    }
    expect(clashes).toBeGreaterThan(100)
  })
})

describe('working records are last-writer-wins', () => {
  const record = (over: Partial<WorkingRecord>): WorkingRecord => ({ key: 'draft:tr2.l3', value: 'a', at: '2026-11-04T08:00:00.000Z', dev: 'dev-a', ...over })

  test('the later at, then the larger device, then the larger canonical JSON', () => {
    const older = record({ at: '2026-11-04T08:00:00.000Z' })
    const newer = record({ at: '2026-11-04T08:00:01.000Z', value: 'b' })
    expect(lwwWorking(older, newer)).toBe(newer)
    expect(lwwWorking(newer, older)).toBe(newer)
    const a = record({ dev: 'dev-a' })
    const b = record({ dev: 'dev-b', value: 'b' })
    expect(lwwWorking(a, b)).toBe(b)
    expect(lwwWorking(b, a)).toBe(b)
    const small = record({ value: 'a' })
    const large = record({ value: 'b' })
    expect(lwwWorking(small, large)).toBe(large)
    expect(lwwWorking(large, small)).toBe(large)
    expect(lwwWorking(small, small)).toBe(small)
  })
})

describe('receipts join their reports', () => {
  const report = (at: string, finding: string) => ({ at, report: { finding } })
  const record = (reports: ReturnType<typeof report>[], receipt: object = { n: 1 }): ReceiptRecord => ({ sha256: 'e'.repeat(64), receipt: receipt as never, reports })

  test('the reports of both, once each and oldest first', () => {
    const one = report('2026-11-06T08:00:00.000Z', 'one')
    const two = report('2026-11-05T08:00:00.000Z', 'two')
    const joined = mergeReceiptRecord(record([one, two]), record([two, report('2026-11-07T08:00:00.000Z', 'three')]))
    expect(joined.reports.map((r) => (r.report as { finding: string }).finding)).toEqual(['two', 'one', 'three'])
    expect(sameJson(mergeReceiptRecord(record([one]), record([two])), mergeReceiptRecord(record([two]), record([one])))).toBe(true)
    expect(sameJson(mergeReceiptRecord(record([one]), record([one])), record([one]))).toBe(true)
  })

  test('two reports of one instant are two reports, in a fixed order', () => {
    const a = report('2026-11-05T08:00:00.000Z', 'a')
    const b = report('2026-11-05T08:00:00.000Z', 'b')
    expect(mergeReceiptRecord(record([b]), record([a])).reports).toEqual([a, b])
    expect(mergeReceiptRecord(record([a]), record([b])).reports).toEqual([a, b])
  })

  test('the receipt itself is the smaller canonical JSON if a damaged file disagrees', () => {
    const joined = mergeReceiptRecord(record([], { n: 2 }), record([], { n: 1 }))
    expect(joined.receipt).toEqual({ n: 1 })
  })

  test('two receipts with different hashes cannot be joined', () => {
    expect(() => mergeReceiptRecord(record([]), { ...record([]), sha256: 'f'.repeat(64) })).toThrow(/cannot join/)
  })

  test('the resolvers a store is given are these rules', () => {
    expect(RESOLVERS.event).toBe(canonicalEvent)
    expect(RESOLVERS.receipt).toBe(mergeReceiptRecord)
    expect(RESOLVERS.working).toBe(lwwWorking)
  })
})

describe('the join of ledgers', () => {
  test('the seeds overlap, so the laws below are not vacuous', () => {
    let shared = 0
    let same = 0
    let clashing = 0
    let receiptsShared = 0
    for (const seed of SEEDS) {
      const a = new Map(randomLedger(seed * 3, 10).events.map((event) => [event.id, event]))
      for (const event of randomLedger(seed * 3 + 1, 10).events) {
        const other = a.get(event.id)
        if (other === undefined) continue
        shared += 1
        if (sameJson(other, event)) same += 1
        else clashing += 1
      }
      const shas = new Set(randomLedger(seed * 3, 10).receipts.map((record) => record.sha256))
      receiptsShared += randomLedger(seed * 3 + 1, 10).receipts.filter((record) => shas.has(record.sha256)).length
    }
    expect(shared).toBeGreaterThan(300)
    expect(same).toBeGreaterThan(50)
    expect(clashing).toBeGreaterThan(100)
    expect(receiptsShared).toBeGreaterThan(50)
  })

  test(`over ${SEEDS.length} seeds it is commutative, associative and idempotent`, () => {
    for (const seed of SEEDS) {
      const a = randomLedger(seed * 3, 10)
      const b = randomLedger(seed * 3 + 1, 10)
      const c = randomLedger(seed * 3 + 2, 10)
      expect(text(mergeLedgers(a, b))).toBe(text(mergeLedgers(b, a)))
      expect(text(mergeLedgers(mergeLedgers(a, b), c))).toBe(text(mergeLedgers(a, mergeLedgers(b, c))))
      expect(text(mergeLedgers(a, a))).toBe(text(a))
      expect(text(mergeLedgers(a, mergeLedgers(a, b)))).toBe(text(mergeLedgers(a, b)))
      expect(text(mergeLedgers(mergeLedgers(a, b), b))).toBe(text(mergeLedgers(a, b)))
    }
  })

  test(`over ${SEEDS.length} seeds, four ledgers merged in any of the 24 orders are one ledger`, () => {
    const orders = permutations([0, 1, 2, 3])
    expect(orders).toHaveLength(24)
    for (const seed of SEEDS) {
      const ledgers = [0, 1, 2, 3].map((n) => randomLedger(seed * 4 + n, 10))
      const texts = new Set(orders.map((order) => text(order.map((n) => ledgers[n]).reduce((joined, next) => mergeLedgers(joined, next), { events: [], receipts: [] }))))
      expect(texts.size).toBe(1)
      // One pass over all the lists gives the same ledger as joining them one by one.
      const bulk = { events: mergeEvents(...ledgers.map((l) => l.events)), receipts: mergeReceipts(...ledgers.map((l) => l.receipts)) }
      expect([...texts][0]).toBe(canonicalJson(bulk))
    }
  })

  test('the result is in normal form: one event per id, in export order', () => {
    for (const seed of SEEDS) {
      const merged = mergeLedgers(randomLedger(seed * 2, 12), randomLedger(seed * 2 + 1, 12))
      expect(new Set(merged.events.map((e) => e.id)).size).toBe(merged.events.length)
      expect([...merged.events].sort(compareEvents)).toEqual(merged.events)
      expect(new Set(merged.receipts.map((r) => r.sha256)).size).toBe(merged.receipts.length)
      expect(text(normalizeLedger(merged))).toBe(canonicalJson(merged))
    }
  })

  test('every id of either ledger survives, and a clash keeps the earlier instant', () => {
    for (const seed of SEEDS) {
      const a = randomLedger(seed * 2, 12)
      const b = randomLedger(seed * 2 + 1, 12)
      const merged = new Map(mergeLedgers(a, b).events.map((event) => [event.id, event]))
      expect(new Set(merged.keys())).toEqual(new Set([...a.events, ...b.events].map((event) => event.id)))
      for (const event of [...a.events, ...b.events]) expect((merged.get(event.id) as LedgerEvent).at <= event.at).toBe(true)
    }
  })

  test('sameLedger ignores the order of the lists and nothing else', () => {
    const ledger = randomLedger(9, 12)
    expect(sameLedger(ledger, { events: [...ledger.events].reverse(), receipts: [...ledger.receipts].reverse() })).toBe(true)
    expect(sameLedger(ledger, { events: ledger.events.slice(1), receipts: ledger.receipts })).toBe(ledger.events.length === 0)
    expect(sameLedger({ events: [ack('a')], receipts: [] }, { events: [ack('a', { at: '2026-11-04T08:00:00.001Z' })], receipts: [] })).toBe(false)
  })

  test('the lists it was given are not changed', () => {
    const a = randomLedger(3, 12)
    const b = randomLedger(4, 12)
    const before = canonicalJson([a, b])
    mergeLedgers(a, b)
    normalizeLedger(a)
    expect(canonicalJson([a, b])).toBe(before)
  })
})

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]))
}
