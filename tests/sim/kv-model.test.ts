/*
 * The hybrid KV manager's rules, one at a time, on cases small enough to work out by hand (ARCHITECTURE §5.4, WORLD §2.4). The pool is
 * a handful of pages and a block is 4 tokens, so that the page a block lands in, the order the queue is in and the events that go out can be
 * written down before the model is asked. tests/sim/kv-properties.test.ts holds the invariants over seeded streams, and
 * tests/sim/kv-oracle.test.ts the model against a second implementation.
 */
import { describe, expect, test } from 'bun:test'
import {
  KV_PRESET_IDS,
  buildKvSpec,
  kvAdapterCatalog,
  kvAdapterName,
  kvChain,
  kvCleared,
  kvConsumerView,
  kvHitLength,
  kvInvariants,
  kvPreset,
  kvReference,
  kvRemoved,
  kvStored,
} from '../../packages/sim/kv'
import type { KvEvent, KvLayerKind, KvModel, KvOp, KvSpec, KvState } from '../../packages/sim/kv'
import { canonicalJson } from '../../packages/sim/core/json'

/** Tokens `from` to `to`, both included. */
const seq = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** A model whose layers weigh 1 byte a token, with blocks of 4 tokens, so that a page is 4 bytes. */
const tiny = (kinds: KvLayerKind[], pool: number, options: { prefixCaching?: boolean; adapterSlots?: number } = {}): KvSpec =>
  buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds }, pool, options)

/** One full group and one sliding group of window 8: a request of L tokens holds ⌈L/4⌉ full blocks and the blocks that the window reads. */
const FULL_SLIDING: KvLayerKind[] = [
  { kind: 'full', layers: 1 },
  { kind: 'sliding', layers: 1, window: 8 },
]
const FULL_ONLY: KvLayerKind[] = [{ kind: 'full', layers: 1 }]

const admit = (req: number, prompt: number[], adapter?: number): KvOp => (adapter === undefined ? { op: 'admit', req, prompt } : { op: 'admit', req, prompt, adapter })

/** The state without its clock, which a refused call still advances. */
const still = (s: KvState): string => canonicalJson({ ...s, step: 0 })

const eventsOf = (m: KvModel, from = 0): KvEvent[] => m.events().slice(from).flatMap(([, events]) => [...events])

describe('admit, append and finish on a full group and a sliding group', () => {
  const spec = tiny(FULL_SLIDING, 16)
  const t20 = seq(1, 20)
  const chain20 = kvChain(t20, 5, 4, 0)

  test('a request of 20 tokens holds 5 full blocks and the 2 the window reads, and publishes what it cached', () => {
    const m = kvReference(spec)
    expect(m.apply(admit(1, t20))).toEqual({ ok: true, free: 9, hit: 0 })
    const s = m.state()
    expect(s.requests).toEqual([{ id: 1, adapter: null, length: 20, tables: [[0, 1, 2, 3, 4], [null, null, null, 5, 6]] }])
    expect(s.queue).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(m.events()).toEqual([
      [0, [kvStored(spec.groups[0], 0, chain20, null, t20, null), kvStored(spec.groups[1], 1, chain20.slice(3), chain20[2], seq(13, 20), null)]],
    ])
    expect(kvInvariants(spec, s)).toEqual([])
  })

  test('a token that opens a new block takes a page for it in each group, and the window lets go of a block once it has left', () => {
    const m = kvReference(spec)
    m.apply(admit(1, t20))
    // The 21st token starts block 5. The window now reads tokens 14 to 20, which are in blocks 3 to 5.
    expect(m.apply({ op: 'append', req: 1, tokens: [21] })).toEqual({ ok: true, free: 7 })
    expect(m.state().requests[0].tables).toEqual([[0, 1, 2, 3, 4, 7], [null, null, null, 5, 6, 8]])
    expect(m.events()).toHaveLength(1)
    // Tokens 22 to 24 fill block 5, which is cached in both groups, and the window leaves block 3: its page is cached and goes to the back.
    const t24 = seq(1, 24)
    const chain24 = kvChain(t24, 6, 4, 0)
    expect(m.apply({ op: 'append', req: 1, tokens: [22, 23, 24] })).toEqual({ ok: true, free: 8 })
    const s = m.state()
    expect(s.requests[0].tables).toEqual([[0, 1, 2, 3, 4, 7], [null, null, null, null, 6, 8]])
    expect(s.queue).toEqual([9, 10, 11, 12, 13, 14, 15, 5])
    expect(s.pages[5]).toEqual({ st: 'cached', group: 1, hash: chain24[3] })
    expect(m.events()[1]).toEqual([
      2,
      [kvStored(spec.groups[0], 0, [chain24[5]], chain24[4], seq(21, 24), null), kvStored(spec.groups[1], 1, [chain24[5]], chain24[4], seq(21, 24), null)],
    ])
    expect(kvInvariants(spec, s)).toEqual([])
  })

  test('finishing gives the pages back last block first, with the cached ones at the back of the queue', () => {
    const m = kvReference(spec)
    m.apply(admit(1, t20))
    m.apply({ op: 'append', req: 1, tokens: [21] })
    m.apply({ op: 'append', req: 1, tokens: [22, 23, 24] })
    expect(m.apply({ op: 'finish', req: 1 })).toEqual({ ok: true, free: 16 })
    const s = m.state()
    // The full group's pages go back highest block first (7, 4, 3, 2, 1, 0), then the sliding group's (8, 6), after page 5, which the
    // window had let go of before. They are all cached, so they join at the back, and the free pages 9 to 15 come first.
    expect(s.queue).toEqual([9, 10, 11, 12, 13, 14, 15, 5, 7, 4, 3, 2, 1, 0, 8, 6])
    expect(s.requests).toEqual([])
    expect(s.pages.filter((p) => p.st === 'cached')).toHaveLength(9)
    expect(s.pages.filter((p) => p.st === 'free')).toHaveLength(7)
    expect(kvInvariants(spec, s)).toEqual([])
  })

  test('a page with no hash goes to the front when it is let go, and a page with one goes to the back', () => {
    const m = kvReference(spec)
    // 6 tokens: block 0 is full and cached, block 1 is partial. Full pages are 0 (block 0) and 1 (block 1); the sliding group's are 2 and 3.
    m.apply(admit(1, seq(1, 6)))
    expect(m.state().requests[0].tables).toEqual([[0, 1], [2, 3]])
    m.apply({ op: 'finish', req: 1 })
    // The full group lets go of page 1 (no hash: front) and page 0 (hash: back); then the sliding group of page 3 (front) and page 2 (back).
    expect(m.state().queue).toEqual([3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 2])
  })

  test('an eviction takes the front page, and a cached page that is taken is published as removed, in the order the pages are taken', () => {
    const m = kvReference(spec)
    m.apply(admit(1, t20))
    m.apply({ op: 'append', req: 1, tokens: [21] })
    m.apply({ op: 'append', req: 1, tokens: [22, 23, 24] })
    m.apply({ op: 'finish', req: 1 })
    // A new request of 20 tokens takes 5 + 2 pages from the front: the free pages 9 to 15, so nothing is evicted.
    const before = m.events().length
    expect(m.apply(admit(2, seq(101, 120)))).toEqual({ ok: true, free: 9, hit: 0 })
    expect(eventsOf(m, before).filter((e) => e.type === 'BlockRemoved')).toEqual([])
    // Another takes 7 more: page 5 and then 7, 4, 3, 2, 1 and 0 are the next in line, which evicts the full group's blocks highest first.
    const t = m.state()
    expect(t.queue).toEqual([5, 7, 4, 3, 2, 1, 0, 8, 6])
    const second = m.events().length
    expect(m.apply(admit(3, seq(201, 220)))).toEqual({ ok: true, free: 2, hit: 0 })
    const chain24 = kvChain(seq(1, 24), 6, 4, 0)
    const removed = eventsOf(m, second).filter((e) => e.type === 'BlockRemoved')
    // The full group takes 5 pages from the front: 5, 7, 4, 3 and 2. Page 5 held block 3 of the old sliding group, and the others blocks
    // 5, 4, 3 and 2 of the old full group. The sliding group then takes 1 and 0, which held blocks 1 and 0 of the full group.
    expect(removed).toEqual([
      kvRemoved(1, chain24[3]),
      kvRemoved(0, chain24[5]),
      kvRemoved(0, chain24[4]),
      kvRemoved(0, chain24[3]),
      kvRemoved(0, chain24[2]),
      kvRemoved(0, chain24[1]),
      kvRemoved(0, chain24[0]),
    ])
    // Every removal is of a hash that was stored, and the consumer ends up believing exactly what the cache holds.
    expect(m.state().consumer).toEqual(kvConsumerView(m.events()))
    expect(kvInvariants(spec, m.state())).toEqual([])
  })

  test('a hit takes the pages it uses out of the queue, and the new tokens take pages from the front', () => {
    const m = kvReference(spec)
    m.apply(admit(1, t20))
    m.apply({ op: 'append', req: 1, tokens: [21] })
    m.apply({ op: 'append', req: 1, tokens: [22, 23, 24] })
    m.apply({ op: 'finish', req: 1 })
    const before = m.events().length
    // The same 20 tokens and one more: every group holds the 20, so the hit is 20 (not 21: the last token is always computed).
    expect(kvHitLength(spec, m.state(), [...t20, 99], null)).toEqual({ perGroup: { full0: 20, sw0: 20 }, hit: 20 })
    expect(m.apply(admit(2, [...t20, 99]))).toEqual({ ok: true, free: 7, hit: 20 })
    const s = m.state()
    // Full group: pages 0 to 4 from the cache and page 9 for block 5. Sliding group: pages 5 and 6 are blocks 3 and 4 of the old request.
    expect(s.requests[0].tables).toEqual([[0, 1, 2, 3, 4, 9], [null, null, null, 5, 6, 10]])
    expect(s.queue).toEqual([11, 12, 13, 14, 15, 7, 8])
    expect(s.pages[0]).toMatchObject({ st: 'used', refs: 1 })
    expect(eventsOf(m, before)).toEqual([])
  })

  test('a hit outside the window is read and let go: its pages go to the back of the queue, in the order they were read', () => {
    const big = tiny(FULL_SLIDING, 24)
    const m = kvReference(big)
    m.apply(admit(1, t20))
    m.apply({ op: 'finish', req: 1 })
    // The same 20 tokens and 30 more. The hit is 20, and the window of the 50-token request has long left blocks 3 and 4 of the sliding group.
    expect(m.apply(admit(2, [...t20, ...seq(61, 90)]))).toMatchObject({ ok: true, hit: 20 })
    const s = m.state()
    expect(s.requests[0].tables[1].slice(0, 10).every((p) => p === null)).toBe(true)
    // After finishing, pages 5 and 6 were cached at the back of the queue in the order 6, 5 (blocks 4 then 3), and the hit read them: touched,
    // then let go in the same order (highest block first), so they are the last two again.
    expect(s.queue.slice(-2)).toEqual([6, 5])
    expect(kvInvariants(big, s)).toEqual([])
  })

  test('two requests share the pages of a prefix, and a page is let go only when its last holder has', () => {
    const one = tiny(FULL_ONLY, 10)
    const m = kvReference(one)
    m.apply(admit(1, seq(1, 12)))
    expect(m.apply(admit(2, [...seq(1, 12), 50]))).toEqual({ ok: true, free: 6, hit: 12 })
    const s = m.state()
    expect(s.pages.slice(0, 3)).toEqual([
      { st: 'used', group: 0, refs: 2, hash: expect.any(Number) },
      { st: 'used', group: 0, refs: 2, hash: expect.any(Number) },
      { st: 'used', group: 0, refs: 2, hash: expect.any(Number) },
    ])
    m.apply({ op: 'finish', req: 1 })
    expect(m.state().pages[0]).toMatchObject({ st: 'used', refs: 1 })
    expect(m.state().queue).toHaveLength(6)
    m.apply({ op: 'finish', req: 2 })
    expect(m.state().queue).toHaveLength(10)
    expect(kvInvariants(one, m.state())).toEqual([])
  })
})

describe('a hit is what every group holds', () => {
  test('is 0 when the sliding group lacks the blocks before the edge, though the full group holds 16 tokens, and the recomputed blocks stay uncached', () => {
    const spec = tiny(FULL_SLIDING, 24)
    const m = kvReference(spec)
    const x = seq(1, 20)
    m.apply(admit(1, x))
    // The sliding group cached blocks 3 and 4 only. Block 2 is not there, so a hit at 16 would need a block it does not have.
    const y = [...seq(1, 16), 200, 201, 202, 203, 204]
    expect(kvHitLength(spec, m.state(), y, null)).toEqual({ perGroup: { full0: 16, sw0: 0 }, hit: 0 })
    const before = m.events().length
    const cacheBefore = m.state().cache.length
    expect(m.apply(admit(2, y))).toMatchObject({ ok: true, hit: 0 })
    // Request 2 recomputes the full group's blocks 0 to 3, whose keys are cached already. They stay uncached, and nothing is published for
    // them; the only new keys are block 4 of the full group and of the sliding group.
    expect(m.state().cache.length).toBe(cacheBefore + 2)
    const stored = eventsOf(m, before).filter((e) => e.type === 'BlockStored')
    expect(stored.map((e) => (e.type === 'BlockStored' ? [e.group_idx, e.block_hashes.length] : null))).toEqual([
      [0, 1],
      [1, 1],
    ])
    expect(m.state().cache.find((e) => e.group === 0 && e.hash === kvChain(x, 5, 4, 0)[0])?.page).toBe(0)
    expect(kvInvariants(spec, m.state())).toEqual([])
  })

  test('is rounded to the least common multiple of the groups\' blocks: full blocks of 4 beside a state group whose blocks are 8', () => {
    const spec: KvSpec = {
      poolPages: 24,
      pageBytes: 8,
      tokenBytes: 1,
      paddingLayers: 0,
      prefixCaching: true,
      groups: [
        { id: 'full0', kind: 'full', layers: 2, blockTokens: 4 },
        { id: 'state0', kind: 'state', layers: 1, blockTokens: 8, statePages: 2 },
      ],
    }
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 30)))
    m.apply({ op: 'finish', req: 1 })
    // The full group holds blocks 0 to 6 (28 tokens), the state group the state at the edge of 24. The longest hit is 24, not 28.
    expect(kvHitLength(spec, m.state(), [...seq(1, 30), 77, 78], null)).toEqual({ perGroup: { full0: 24, state0: 24 }, hit: 24 })
    expect(m.apply(admit(2, [...seq(1, 30), 77, 78]))).toMatchObject({ ok: true, hit: 24 })
    expect(kvInvariants(spec, m.state())).toEqual([])
  })

  test('a state group keeps its newest statePages blocks, caches the state at each edge, and is read back from there', () => {
    const spec = tiny([{ kind: 'full', layers: 1 }, { kind: 'state', layers: 1, stateBytes: 4 }], 16)
    const m = kvReference(spec)
    expect(spec.groups[1]).toMatchObject({ kind: 'state', blockTokens: 4, statePages: 2 })
    // 10 tokens: 3 blocks. The state group keeps blocks 1 and 2, and block 1 is full: it holds the state at the edge of 8.
    m.apply(admit(1, seq(1, 10)))
    expect(m.state().requests[0].tables).toEqual([[0, 1, 2], [null, 3, 4]])
    m.apply({ op: 'finish', req: 1 })
    const state = m.state()
    expect(state.pages[3]).toMatchObject({ st: 'cached', group: 1 })
    expect(state.pages[4]).toEqual({ st: 'free' })
    // 14 tokens: the same 10 and 4 more. The hit is 8: the full group holds blocks 0 and 1 (block 2 was partial), the state group the state at 8.
    expect(kvHitLength(spec, state, [...seq(1, 10), 11, 12, 13, 14], null)).toEqual({ perGroup: { full0: 8, state0: 8 }, hit: 8 })
    expect(m.apply(admit(2, [...seq(1, 10), 11, 12, 13, 14]))).toMatchObject({ ok: true, hit: 8 })
    // The longer request keeps the state group's blocks 2 and 3; the state at the edge of 8 (block 1) was read and let go.
    expect(m.state().requests[0].tables[1]).toEqual([null, null, expect.any(Number), expect.any(Number)])
    expect(kvInvariants(spec, m.state())).toEqual([])
  })
})

describe('all or nothing', () => {
  test('an admit that does not fit changes nothing, and a request counts the cached pages it would take out of the queue', () => {
    const spec = tiny(FULL_ONLY, 4)
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 8)))
    m.apply({ op: 'finish', req: 1 })
    // All 4 pages are free or cached, and 2 of them are the blocks that the next request would hit. It then needs 3 more pages and has only
    // the 2 that remain after the hit takes its pages: it does not fit, though 3 is fewer than the 4 pages in the queue.
    const before = m.state()
    expect(m.apply(admit(2, [...seq(1, 8), ...seq(9, 20)]))).toEqual({ ok: false, reason: 'no-pages', free: 4 })
    expect(still(m.state())).toBe(still(before))
    expect(m.events().flatMap(([, events]) => events).filter((e) => e.type === 'BlockRemoved')).toEqual([])
    // A request of 16 tokens needs 2 new pages and fits exactly.
    expect(m.apply(admit(2, [...seq(1, 8), ...seq(9, 16)]))).toEqual({ ok: true, free: 0, hit: 8 })
  })

  test('an append that does not fit changes nothing, and the pool is still usable', () => {
    const spec = tiny(FULL_ONLY, 3)
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 8)))
    expect(m.apply({ op: 'append', req: 1, tokens: seq(9, 12) })).toEqual({ ok: true, free: 0 })
    const before = m.state()
    expect(m.apply({ op: 'append', req: 1, tokens: [13] })).toEqual({ ok: false, reason: 'no-pages', free: 0 })
    expect(still(m.state())).toBe(still(before))
    expect(m.apply({ op: 'finish', req: 1 })).toEqual({ ok: true, free: 3 })
  })

  test('a sliding group runs on a pool shorter than its request, because every block it lets go is a block it can take', () => {
    const spec = tiny([{ kind: 'sliding', layers: 1, window: 8 }], 3)
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 8)))
    for (let step = 0; step < 20; step++) {
      const result = m.apply({ op: 'append', req: 1, tokens: seq(100 + 4 * step, 103 + 4 * step) })
      expect([step, result.ok]).toEqual([step, true])
      expect(kvInvariants(spec, m.state())).toEqual([])
    }
    // 88 tokens, a window of 8: the request holds the 2 blocks that the window reads, and the pool holds 3.
    expect(m.state().requests[0].length).toBe(88)
    expect(m.state().requests[0].tables[0].filter((p) => p !== null)).toHaveLength(2)
  })

  test('refuses what cannot be done, and says why: exists, unknown, no-adapter, in-use, busy, no-slot, no-pages', () => {
    const spec = tiny(FULL_ONLY, 8)
    const m = kvReference(spec)
    m.apply({ op: 'load-adapter', adapter: 3, pages: 2 })
    m.apply(admit(1, seq(1, 4), 3))
    const refusals: [KvOp, string][] = [
      [admit(1, seq(1, 4)), 'exists'],
      [{ op: 'append', req: 9, tokens: [1] }, 'unknown'],
      [{ op: 'finish', req: 9 }, 'unknown'],
      [admit(2, seq(1, 4), 4), 'no-adapter'],
      [{ op: 'load-adapter', adapter: 3, pages: 1 }, 'exists'],
      [{ op: 'unload-adapter', adapter: 3 }, 'in-use'],
      [{ op: 'unload-adapter', adapter: 8 }, 'unknown'],
      [{ op: 'reset' }, 'busy'],
      [{ op: 'load-adapter', adapter: 5, pages: 99 }, 'no-pages'],
      [admit(2, seq(1, 99)), 'no-pages'],
    ]
    for (const [op, reason] of refusals) {
      const before = m.state()
      const got = m.apply(op)
      expect([op.op, got]).toEqual([op.op, { ok: false, reason, free: 5 }])
      expect(still(m.state())).toBe(still(before))
    }
    expect(kvInvariants(spec, m.state())).toEqual([])
  })

  test('throws on a call that is not a call, rather than refusing it', () => {
    const m = kvReference(tiny(FULL_ONLY, 4))
    expect(() => m.apply({ op: 'admit', req: -1, prompt: [1] })).toThrow(RangeError)
    expect(() => m.apply({ op: 'admit', req: 1.5, prompt: [1] })).toThrow(RangeError)
    expect(() => m.apply({ op: 'admit', req: 1, prompt: [] })).toThrow(/at least one token/)
    expect(() => m.apply({ op: 'admit', req: 1, prompt: [1, -2] })).toThrow(/a token is an integer/)
    expect(() => m.apply({ op: 'admit', req: 1, prompt: [4294967296] })).toThrow(/a token is an integer/)
    expect(() => m.apply({ op: 'append', req: 1, tokens: [] })).toThrow(/at least one token/)
    expect(() => m.apply({ op: 'load-adapter', adapter: 1, pages: 0 })).toThrow(/at least one page/)
    expect(() => m.apply({ op: 'nope' } as unknown as KvOp)).toThrow(/not an operation/)
    expect(() => kvReference({ ...tiny(FULL_ONLY, 4), poolPages: 0 })).toThrow(/not a KV spec/)
  })
})

describe('adapters', () => {
  const spec = tiny(FULL_ONLY, 12)

  test('take their pages from the front of the queue, evicting what is cached there, and give them back to the front', () => {
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 8)))
    m.apply({ op: 'finish', req: 1 })
    // Pages 0 and 1 are cached at the back; 2 to 11 are free. An adapter of 11 pages takes 2 to 11 and then 1: the cached block 1 is evicted.
    const before = m.events().length
    expect(m.apply({ op: 'load-adapter', adapter: 7, pages: 11 })).toEqual({ ok: true, free: 1 })
    expect(m.state().adapters).toEqual([{ id: 7, pages: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1], users: 0 }])
    expect(eventsOf(m, before)).toEqual([kvRemoved(0, kvChain(seq(1, 8), 2, 4, 0)[1])])
    expect(m.state().pages[1]).toEqual({ st: 'adapter', adapter: 7 })
    expect(kvInvariants(spec, m.state())).toEqual([])
    // Unloading gives the pages back in reverse, to the front, so the page loaded last is the first one taken again.
    expect(m.apply({ op: 'unload-adapter', adapter: 7 })).toEqual({ ok: true, free: 12 })
    expect(m.state().queue).toEqual([1, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 0])
    expect(kvInvariants(spec, m.state())).toEqual([])
  })

  test('take exactly ⌈adapter bytes ÷ page bytes⌉ pages of the pool, for the adapters of every preset', () => {
    for (const id of KV_PRESET_IDS) {
      const preset = kvPreset(id)
      for (const a of kvAdapterCatalog(preset)) {
        const m = kvReference(preset)
        const pages = Math.ceil(a.bytes / preset.pageBytes)
        expect([id, a.rank, m.apply({ op: 'load-adapter', adapter: a.id, pages: a.pages })]).toEqual([id, a.rank, { ok: true, free: preset.poolPages - pages }])
        expect(m.state().adapters[0].pages).toHaveLength(pages)
        // One page fewer would not hold the weights, and the last page is the only one that is not full.
        expect((pages - 1) * preset.pageBytes).toBeLessThan(a.bytes)
        expect(pages * preset.pageBytes).toBeGreaterThanOrEqual(a.bytes)
        expect(m.apply({ op: 'unload-adapter', adapter: a.id })).toEqual({ ok: true, free: preset.poolPages })
      }
    }
  })

  test('are shared by every request that uses them, and stay while one runs', () => {
    const m = kvReference(spec)
    m.apply({ op: 'load-adapter', adapter: 0, pages: 3 })
    m.apply(admit(1, seq(1, 4), 0))
    m.apply(admit(2, seq(5, 8), 0))
    expect(m.state().adapters[0].users).toBe(2)
    m.apply({ op: 'finish', req: 1 })
    expect(m.apply({ op: 'unload-adapter', adapter: 0 })).toMatchObject({ ok: false, reason: 'in-use' })
    m.apply({ op: 'finish', req: 2 })
    expect(m.apply({ op: 'unload-adapter', adapter: 0 })).toMatchObject({ ok: true })
  })

  test('split the cache: the same tokens under two adapters, or under none, are different blocks', () => {
    // Six requests of 4 pages each are never held at once, but their cached blocks must all stay: a pool of 16.
    const m = kvReference(tiny(FULL_ONLY, 16))
    m.apply({ op: 'load-adapter', adapter: 0, pages: 1 })
    m.apply({ op: 'load-adapter', adapter: 1, pages: 1 })
    const prompt = [...seq(1, 12), 99]
    m.apply(admit(1, prompt, 0))
    m.apply({ op: 'finish', req: 1 })
    expect(m.apply(admit(2, prompt, 1))).toMatchObject({ hit: 0 })
    m.apply({ op: 'finish', req: 2 })
    expect(m.apply(admit(3, prompt))).toMatchObject({ hit: 0 })
    m.apply({ op: 'finish', req: 3 })
    expect(m.apply(admit(4, prompt, 0))).toMatchObject({ hit: 12 })
    expect(m.apply(admit(5, prompt, 1))).toMatchObject({ hit: 12 })
    expect(m.apply(admit(6, prompt))).toMatchObject({ hit: 12 })
  })

  test('are published with their blocks: lora_id, lora_name and an extra key for each block', () => {
    const m = kvReference(spec)
    m.apply({ op: 'load-adapter', adapter: 4, pages: 1 })
    const tokens = seq(1, 9)
    m.apply(admit(1, tokens, 4))
    const stored = eventsOf(m)[0]
    const chain = kvChain(tokens, 2, 4, 5)
    expect(stored).toEqual(kvStored(spec.groups[0], 0, chain, null, seq(1, 8), 4))
    expect(stored).toMatchObject({ lora_id: 4, lora_name: kvAdapterName(4), extra_keys: [['adapter-4'], ['adapter-4']] })
  })

  test('sit in slots in place of pages when the spec says so, and the slots are a limit', () => {
    const slots = tiny(FULL_ONLY, 12, { adapterSlots: 2 })
    const m = kvReference(slots)
    expect(m.apply({ op: 'load-adapter', adapter: 0, pages: 50 })).toEqual({ ok: true, free: 12 })
    expect(m.apply({ op: 'load-adapter', adapter: 1, pages: 50 })).toEqual({ ok: true, free: 12 })
    expect(m.apply({ op: 'load-adapter', adapter: 2, pages: 1 })).toEqual({ ok: false, reason: 'no-slot', free: 12 })
    expect(m.state().adapters).toEqual([
      { id: 0, pages: [], users: 0 },
      { id: 1, pages: [], users: 0 },
    ])
    expect(m.apply({ op: 'unload-adapter', adapter: 0 })).toEqual({ ok: true, free: 12 })
    expect(m.apply({ op: 'load-adapter', adapter: 2, pages: 1 })).toEqual({ ok: true, free: 12 })
    expect(kvInvariants(slots, m.state())).toEqual([])
  })
})

describe('reset', () => {
  test('forgets every cached block with one event and no removals, refuses while a request runs, and leaves the queue as it was', () => {
    const spec = tiny(FULL_SLIDING, 16)
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 20)))
    expect(m.apply({ op: 'reset' })).toEqual({ ok: false, reason: 'busy', free: 9 })
    m.apply({ op: 'finish', req: 1 })
    const queue = m.state().queue
    const before = m.events().length
    expect(m.apply({ op: 'reset' })).toEqual({ ok: true, free: 16 })
    const s = m.state()
    expect(s.queue).toEqual(queue)
    expect(s.cache).toEqual([])
    expect(s.consumer).toEqual([])
    expect(s.pages.every((p) => p.st === 'free')).toBe(true)
    expect(eventsOf(m, before)).toEqual([kvCleared()])
    expect(kvHitLength(spec, s, [...seq(1, 20), 21], null).hit).toBe(0)
  })

  test('does nothing, and publishes nothing, when the pool does not cache', () => {
    const m = kvReference(tiny(FULL_ONLY, 4, { prefixCaching: false }))
    expect(m.apply({ op: 'reset' })).toEqual({ ok: true, free: 4 })
    expect(m.events()).toEqual([])
  })
})

describe('without prefix caching', () => {
  test('nothing is hashed, hit or published, and a page that is let go is reused first', () => {
    const spec = tiny(FULL_SLIDING, 16, { prefixCaching: false })
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 20)))
    m.apply({ op: 'finish', req: 1 })
    expect(m.events()).toEqual([])
    const s = m.state()
    expect(s.cache).toEqual([])
    expect(s.pages.every((p) => p.st === 'free')).toBe(true)
    // The full group's pages go back highest block first to the front (4, 3, 2, 1, 0), then the sliding group's (6, 5) in front of them.
    expect(s.queue.slice(0, 7)).toEqual([6, 5, 4, 3, 2, 1, 0])
    expect(m.apply(admit(2, seq(1, 20)))).toMatchObject({ hit: 0 })
    expect(kvInvariants(spec, m.state())).toEqual([])
  })
})

describe('the events, in the shape of vLLM v0.33.0\'s (vllm.kv-events.*)', () => {
  /** The 7 fields of BlockStored that have no default, and its 8 optional ones, as the pin lists them (vllm.kv-events.block-stored). */
  const REQUIRED = ['block_hashes', 'parent_block_hash', 'token_ids', 'block_size', 'lora_id', 'medium', 'lora_name']
  const OPTIONAL = ['extra_keys', 'group_idx', 'kv_cache_spec_kind', 'kv_cache_spec_sliding_window', 'locality', 'ownership', 'session_id', 'lookahead_token_ids']

  test('a BlockStored has the seven fields without a default, and only optional fields of the eight that the pin has', () => {
    const spec = kvPreset('two-kinds', 32)
    const m = kvReference(spec)
    m.apply({ op: 'load-adapter', adapter: 2, pages: 1 })
    m.apply(admit(1, seq(1, 70), 2))
    const stored = eventsOf(m).filter((e) => e.type === 'BlockStored')
    expect(stored).toHaveLength(3)
    for (const e of stored) {
      const keys = Object.keys(e).filter((k) => k !== 'type')
      for (const k of REQUIRED) expect([k, keys.includes(k)]).toEqual([k, true])
      for (const k of keys) expect([k, REQUIRED.includes(k) || OPTIONAL.includes(k)]).toEqual([k, true])
      expect(e).toMatchObject({ type: 'BlockStored', medium: 'GPU', lora_id: 2, lora_name: 'adapter-2' })
    }
    // The full group says full_attention and no window; a sliding group says sliding_window and its window.
    const [full, sw0] = stored
    expect(full).toMatchObject({ group_idx: 0, kv_cache_spec_kind: 'full_attention', block_size: 16 })
    expect('kv_cache_spec_sliding_window' in full).toBe(false)
    expect(sw0).toMatchObject({ group_idx: 1, kv_cache_spec_kind: 'sliding_window', kv_cache_spec_sliding_window: 32 })
    expect(Object.keys(full).sort()).toEqual(['block_hashes', 'block_size', 'extra_keys', 'group_idx', 'kv_cache_spec_kind', 'lora_id', 'lora_name', 'medium', 'parent_block_hash', 'token_ids', 'type'])
    // One hash per block, 16 token ids per hash, and one extra key per hash.
    if (full.type !== 'BlockStored') throw new Error('not a store')
    expect([full.block_hashes.length, full.token_ids.length, full.extra_keys?.length]).toEqual([4, 64, 4])
  })

  test('a state group says mamba', () => {
    const spec = kvPreset('state', 16)
    const m = kvReference(spec)
    m.apply(admit(1, seq(1, 100)))
    const kinds = eventsOf(m).map((e) => (e.type === 'BlockStored' ? e.kv_cache_spec_kind : e.type))
    expect(kinds).toContain('mamba')
    expect(kinds).toContain('full_attention')
  })

  test('a BlockRemoved has its hash, its medium and its group, and an AllBlocksCleared has nothing', () => {
    expect(Object.keys(kvRemoved(1, 5)).sort()).toEqual(['block_hashes', 'group_idx', 'medium', 'type'])
    expect(kvRemoved(1, 5)).toEqual({ type: 'BlockRemoved', block_hashes: [5], medium: 'GPU', group_idx: 1 })
    expect(kvCleared()).toEqual({ type: 'AllBlocksCleared' })
  })

  test('go in batches [ts, events] with ts the index of the call, nothing for a call that publishes nothing, and no batch is empty', () => {
    const m = kvReference(tiny(FULL_ONLY, 8))
    m.apply(admit(1, seq(1, 8)))
    m.apply({ op: 'append', req: 1, tokens: [9] })
    m.apply({ op: 'finish', req: 1 })
    m.apply(admit(9, [1]))
    m.apply({ op: 'append', req: 7, tokens: [1] })
    const batches = m.events()
    expect(batches.map((b) => b[0])).toEqual([0])
    for (const batch of batches) {
      expect(Array.isArray(batch) && batch.length === 2).toBe(true)
      expect(batch[1].length).toBeGreaterThan(0)
    }
    expect(m.state().step).toBe(5)
  })

  test('are a function of the call: a snapshot does not change when the model goes on, and the caller\'s arrays are not kept', () => {
    const m = kvReference(tiny(FULL_ONLY, 8))
    const prompt = seq(1, 8)
    m.apply(admit(1, prompt))
    const snapshot = m.state()
    const frozen = canonicalJson(snapshot)
    prompt[0] = 999
    m.apply({ op: 'append', req: 1, tokens: [9, 10, 11, 12] })
    m.apply({ op: 'finish', req: 1 })
    expect(canonicalJson(snapshot)).toBe(frozen)
    // Block 0 was hashed from the tokens as they were when the request came in.
    expect(m.state().cache.map((e) => e.hash)).toContain(kvChain(seq(1, 8), 2, 4, 0)[0])
  })
})
