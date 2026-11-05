/*
 * `kvInvariants` and `kvJudge`, one check at a time (ARCHITECTURE §5.4, §8.3). A right snapshot of a busy manager is damaged in one way
 * and the check that owns the damage must name it; and the judge must say which operation went wrong and which of the checks failed.
 * tests/sim/kv-bestiary.test.ts runs whole wrong managers through the judge, and tests/sim/kv-properties.test.ts the invariants over
 * seeded streams; this is the direct test that each check can fail, and fails with its own name.
 */
import { describe, expect, test } from 'bun:test'
import { KV_CHECKS, KV_JUDGE_CHECKS, buildKvSpec, kvConsume, kvConsumerView, kvInvariants, kvJudge, kvReference, kvRemoved, kvStored } from '../../packages/sim/kv'
import type { KvConsumerCounts, KvModel, KvOp, KvSpec, KvState } from '../../packages/sim/kv'

const seq = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** One full group and one sliding group of window 8, a page of 4 tokens, and a pool of 40 pages. */
const spec: KvSpec = buildKvSpec(
  {
    tokenBytes: 1,
    baseBlockTokens: 4,
    kinds: [
      { kind: 'full', layers: 1 },
      { kind: 'sliding', layers: 1, window: 8 },
    ],
  },
  40,
)

/** A manager with a cached prefix, two running requests (one on an adapter), an adapter's pages and a window that has let go of blocks. */
function busy(): { model: KvModel; state: KvState } {
  const m = kvReference(spec)
  m.apply({ op: 'load-adapter', adapter: 3, pages: 2 })
  m.apply({ op: 'admit', req: 1, prompt: seq(1, 30) })
  m.apply({ op: 'finish', req: 1 })
  m.apply({ op: 'admit', req: 4, prompt: seq(200, 215) })
  m.apply({ op: 'finish', req: 4 })
  m.apply({ op: 'admit', req: 2, prompt: seq(1, 30) })
  m.apply({ op: 'admit', req: 3, prompt: seq(50, 66), adapter: 3 })
  return { model: m, state: m.state() }
}

/** The state with some of its parts replaced. */
const damaged = (s: KvState, parts: Partial<{ -readonly [K in keyof KvState]: KvState[K] }>): KvState => ({ ...s, ...parts })

describe('a right snapshot', () => {
  test('of the busy manager breaks no invariant', () => {
    const { state } = busy()
    expect(kvInvariants(spec, state)).toEqual([])
    expect(state.requests).toHaveLength(2)
    expect(state.pages.some((p) => p.st === 'cached')).toBe(true)
    expect(state.pages.some((p) => p.st === 'adapter')).toBe(true)
    expect(state.requests.some((r) => r.tables[1].some((p) => p === null))).toBe(true)
  })

  test('is read in any order: a dump that lists its cache and its consumer backwards passes too', () => {
    const { state } = busy()
    expect(kvInvariants(spec, damaged(state, { cache: [...state.cache].reverse(), consumer: [...state.consumer].reverse() }))).toEqual([])
  })
})

describe('each check can fail, and names the damage', () => {
  const first = (problems: readonly string[]): string => problems[0] ?? ''

  test('conservation: a page that no queue, table or adapter accounts for', () => {
    const { state } = busy()
    const gone = state.queue[state.queue.length - 1]
    const problems = kvInvariants(spec, damaged(state, { queue: state.queue.slice(0, -1) }))
    expect(first(problems)).toMatch(/^conservation: page \d+ is (free|cached) and is not in the queue$/)
    expect(problems.join(' ')).toContain(`page ${gone}`)
    // A used page that no table holds is a leak too.
    const used = state.pages.findIndex((p) => p.st === 'used')
    const lone = state.requests.map((r) => ({ ...r, tables: r.tables.map((t) => t.map((p) => (p === used ? null : p))) }))
    expect(kvInvariants(spec, damaged(state, { requests: lone })).join(' ')).toMatch(/conservation: page \d+ has \d+ references, and no table holds it/)
    expect(kvInvariants(spec, damaged(state, { pages: state.pages.slice(1) }))).toEqual(['conservation: the state lists 39 pages, and the pool has 40'])
  })

  test('refcounts: a count that is not the number of tables that hold the page', () => {
    const { state } = busy()
    const at = state.pages.findIndex((p) => p.st === 'used')
    const rec = state.pages[at]
    if (rec.st !== 'used') throw new Error('a used page')
    const pages = state.pages.map((p, i) => (i === at ? { ...rec, refs: rec.refs + 1 } : p))
    expect(first(kvInvariants(spec, damaged(state, { pages })))).toBe(`refcounts: page ${at} has ${rec.refs + 1} references, and ${rec.refs} table entries hold it`)
    const negative = state.pages.map((p, i) => (i === at ? { ...rec, refs: -1 } : p))
    expect(kvInvariants(spec, damaged(state, { pages: negative })).join(' ')).toContain(`refcounts: page ${at} is used and has a reference count of -1`)
  })

  test('tables: a table of the wrong length, a hole where the group keeps the block, or a block in the wrong group', () => {
    const { state } = busy()
    const r = state.requests[0]
    const shorter = [{ ...r, tables: [r.tables[0].slice(0, -1), r.tables[1]] }, ...state.requests.slice(1)]
    expect(first(kvInvariants(spec, damaged(state, { requests: shorter })))).toBe(`tables: request ${r.id}, group full0: the table has ${r.tables[0].length - 1} entries, and ${r.length} tokens need ${r.tables[0].length}`)
    const holed = [{ ...r, tables: [r.tables[0].map((p, i) => (i === 2 ? null : p)), r.tables[1]] }, ...state.requests.slice(1)]
    expect(kvInvariants(spec, damaged(state, { requests: holed })).join(' ')).toMatch(/tables: request \d+, group full0: block 2 is let go, and the group still keeps it/)
    const moved = [{ ...r, tables: [r.tables[0], r.tables[1].map((p, i) => (i === r.tables[1].length - 1 ? r.tables[0][0] : p))] }, ...state.requests.slice(1)]
    expect(kvInvariants(spec, damaged(state, { requests: moved })).join(' ')).toMatch(/tables: request \d+, group sw0: block \d+ is page \d+, which belongs to group 0/)
  })

  test('window: a sliding group that holds a block the window has left, or has let go of one it still reads', () => {
    const { state } = busy()
    const r = state.requests[0]
    const swTable = r.tables[1]
    const firstHeld = swTable.findIndex((p) => p !== null)
    const kept = [{ ...r, tables: [r.tables[0], swTable.map((p, i) => (i === firstHeld - 1 ? r.tables[1][firstHeld] : p))] }, ...state.requests.slice(1)]
    expect(kvInvariants(spec, damaged(state, { requests: kept })).join(' ')).toMatch(/window: request \d+, group sw0: block \d+ is held though the window has left it/)
    const lost = [{ ...r, tables: [r.tables[0], swTable.map((p, i) => (i === firstHeld ? null : p))] }, ...state.requests.slice(1)]
    expect(kvInvariants(spec, damaged(state, { requests: lost })).join(' ')).toMatch(/window: request \d+, group sw0: block \d+ is let go, and the group still keeps it/)
  })

  test('cache: a key twice, an entry whose page does not hold it, and a hashed page with no entry', () => {
    const { state } = busy()
    expect(first(kvInvariants(spec, damaged(state, { cache: [state.cache[0], ...state.cache] })))).toMatch(/^cache: the cache holds \d+:\d+ twice$/)
    const entry = state.cache[0]
    const wrong = state.cache.map((e, i) => (i === 0 ? { ...e, hash: e.hash + 1 } : e))
    expect(kvInvariants(spec, damaged(state, { cache: wrong })).join(' ')).toMatch(/cache: cache entry \d+:\d+ is page \d+, which is/)
    expect(kvInvariants(spec, damaged(state, { cache: state.cache.slice(1) })).join(' ')).toContain(`cache: page ${entry.page} has hash ${entry.hash} and 0 cache entries`)
  })

  test('queue: a page twice, and a page that is held', () => {
    const { state } = busy()
    expect(first(kvInvariants(spec, damaged(state, { queue: [state.queue[0], ...state.queue] })))).toBe(`queue: page ${state.queue[0]} is in the queue twice`)
    const used = state.pages.findIndex((p) => p.st === 'used')
    expect(kvInvariants(spec, damaged(state, { queue: [...state.queue, used] })).join(' ')).toContain(`queue: page ${used} is held and is in the queue`)
    expect(kvInvariants(spec, damaged(state, { queue: [...state.queue, 99] })).join(' ')).toContain('queue: queue entry')
  })

  test('adapters: a user count that is not the running requests, a page another adapter holds, and an adapter that is not there', () => {
    const { state } = busy()
    const wrongUsers = state.adapters.map((a) => ({ ...a, users: a.users + 2 }))
    expect(first(kvInvariants(spec, damaged(state, { adapters: wrongUsers })))).toBe('adapters: adapter 3 has 3 users, and 1 running requests use it')
    expect(kvInvariants(spec, damaged(state, { adapters: [] })).join(' ')).toMatch(/adapters: page \d+ holds adapter 3 and 0 adapters list it/)
    expect(kvInvariants(spec, damaged(state, { adapters: [] })).join(' ')).toContain('adapters: 1 running requests use adapter 3, which is not resident')
    const stolen = state.adapters.map((a) => ({ ...a, pages: [state.queue[0]] }))
    expect(kvInvariants(spec, damaged(state, { adapters: stolen })).join(' ')).toMatch(/adapters: adapter 3 lists page \d+, which is (free|cached)/)
  })

  test('adapters, in slots: no pages, and no more adapters than slots', () => {
    const slots: KvSpec = { ...spec, adapterSlots: 1 }
    const m = kvReference(slots)
    m.apply({ op: 'load-adapter', adapter: 1, pages: 3 })
    const s = m.state()
    expect(kvInvariants(slots, s)).toEqual([])
    expect(kvInvariants(slots, damaged(s, { adapters: [{ id: 1, pages: [0], users: 0 }] })).join(' ')).toContain('adapter 1 holds 1 pages, and the adapters are in slots')
    expect(kvInvariants(slots, damaged(s, { adapters: [...s.adapters, { id: 2, pages: [], users: 0 }] })).join(' ')).toContain('2 adapters are resident, and there are 1 slots')
  })

  test('events: a block published twice, a block published and gone, a block cached and never published, and a stream out of order', () => {
    const { state } = busy()
    const e = state.consumer[0]
    const twice = state.consumer.map((c, i) => (i === 0 ? { ...c, count: 2 } : c))
    expect(first(kvInvariants(spec, damaged(state, { consumer: twice })))).toBe(`events: block ${e.group}:${e.hash} was published 2 times without a removal`)
    expect(first(kvInvariants(spec, damaged(state, { consumer: state.consumer.slice(1) })))).toBe(`events: block ${e.group}:${e.hash} is cached and was never published`)
    const phantom = [...state.consumer, { group: 1, hash: 12345, count: 1 }].sort((a, b) => a.group - b.group || a.hash - b.hash)
    expect(first(kvInvariants(spec, damaged(state, { consumer: phantom })))).toBe('events: block 1:12345 was published and is not in the cache')
    const removedTwice = state.consumer.map((c, i) => (i === 0 ? { ...c, count: -1 } : c))
    expect(first(kvInvariants(spec, damaged(state, { consumer: removedTwice })))).toBe(`events: block ${e.group}:${e.hash} was removed 1 more times than it was stored`)
  })

  test('caching off: nothing cached or published', () => {
    const off: KvSpec = { ...spec, prefixCaching: false }
    const m = kvReference(off)
    m.apply({ op: 'admit', req: 1, prompt: seq(1, 9) })
    expect(kvInvariants(off, m.state())).toEqual([])
    const { state } = busy()
    expect(kvInvariants(off, state).join(' ')).toContain('caching is off')
  })

  test('every check is listed, with a title, and the checks of the judge are the three more', () => {
    expect(KV_CHECKS.map((c) => c.id)).toEqual(['conservation', 'refcounts', 'tables', 'window', 'cache', 'queue', 'adapters', 'events'])
    for (const c of KV_CHECKS) {
      expect(c.title.length).toBeGreaterThan(10)
      expect(c.catches.length).toBeGreaterThan(10)
    }
    expect([...KV_JUDGE_CHECKS]).toEqual(['reply', 'hit', 'atomic'])
  })
})

describe('the consumer of the events', () => {
  test('adds a store, takes off a removal, forgets at a clear, and keeps a count that is not 0 or 1 so that it can be seen', () => {
    const group = spec.groups[0]
    const counts: KvConsumerCounts = new Map()
    const store = kvStored(group, 0, [7, 8], null, seq(1, 8), null)
    kvConsume(counts, store)
    kvConsume(counts, store)
    kvConsume(counts, kvRemoved(0, 8))
    kvConsume(counts, kvRemoved(0, 9))
    expect(
      kvConsumerView([
        [0, [store]],
        [1, [store, kvRemoved(0, 8), kvRemoved(0, 9)]],
      ]),
    ).toEqual([
      { group: 0, hash: 7, count: 2 },
      { group: 0, hash: 8, count: 1 },
      { group: 0, hash: 9, count: -1 },
    ])
    expect(kvConsumerView([[0, [store]], [1, [{ type: 'AllBlocksCleared' }]]])).toEqual([])
  })
})

describe('the judge', () => {
  const ops: KvOp[] = [
    { op: 'admit', req: 1, prompt: seq(1, 20) },
    { op: 'finish', req: 1 },
    { op: 'admit', req: 2, prompt: [...seq(1, 20), 99] },
  ]

  test('passes a right manager on right operations, and a manager that is the reference itself', () => {
    expect(kvJudge(spec, ops, kvReference(spec))).toBeNull()
    expect(kvJudge(spec, [], kvReference(spec))).toBeNull()
  })

  test('names the operation, and says in words which reply was different', () => {
    // A manager of a smaller pool answers the same, up to the pages that are free.
    const smaller = kvReference({ ...spec, poolPages: 19 })
    const judgement = kvJudge(spec, ops, smaller)
    expect(judgement?.at).toBe(0)
    expect(judgement?.op.op).toBe('admit')
    expect(judgement?.failures.map((f) => f.check)).toContain('reply')
    expect(judgement?.failures[0].message).toBe('admit answered ok with 12 pages free and a hit of 0, and the reference answers ok with 33 pages free and a hit of 0')
  })

  test('says how an admit\'s hit differs from the intersection, group by group', () => {
    const real = kvReference(spec)
    // A manager that answers the hit of the full group alone.
    const liar: KvModel = {
      apply: (op) => {
        const r = real.apply(op)
        return op.op === 'admit' && r.ok && r.hit === 20 ? { ...r, hit: 24 } : r
      },
      state: () => real.state(),
      events: () => real.events(),
    }
    const judgement = kvJudge(spec, ops, liar)
    expect(judgement?.at).toBe(2)
    expect(judgement?.failures[0]).toEqual({
      check: 'hit',
      message: 'admit 2 reported a hit of 24 tokens, and the longest prefix every group holds is 20 (alone, the groups would hit full0 20, sw0 20)',
    })
  })
})
