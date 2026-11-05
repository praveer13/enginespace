/*
 * The invariants of the hybrid KV manager over seeded streams (ARCHITECTURE §5.10; TRACKER W1-T21, check 1: "the invariants hold over
 * 200 seeds × 2,000 ops"). After every one of the 400,000 operations the test takes a snapshot and asks `kvInvariants` about it, checks that
 * a refused call left the state as it was, and checks that an admit's hit is the one `kvHitLength` reads off the snapshot before it.
 *
 * The streams are not tuned to pass. They run the four presets on pools from half to one and a half times their default, with and
 * without adapters, with engine-style slots for adapters, and without prefix caching, under heavy pressure: a third of the admits are
 * refused in the tightest of them. Each block of seeds then asserts that it reached what the invariants guard (hits that the intersection
 * shortened, evictions, windows that let go of blocks, pages shared by two requests, adapters evicting cached pages, resets, and every kind
 * of refusal), so that a pass cannot be a stream that did nothing.
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '../../packages/sim/core/json'
import { kvConsumerView, kvHitLength, kvInvariants, kvReference } from '../../packages/sim/kv'
import type { KvOp, KvState } from '../../packages/sim/kv'
import { OPS, SEEDS, opsOf, streamFor } from './kv-support'

/** The state without its clock. Two snapshots of one manager list their keys in one order, so the plain JSON text will do for comparing them. */
const still = (s: KvState): string => JSON.stringify({ ...s, step: 0 })

interface Counters {
  ops: number
  admits: number
  hits: number
  /** Hits that were shorter than what one of the groups would have served alone: the intersection at work. */
  shortened: number
  hitTokens: number
  windowed: number
  shared: number
  evictions: number
  adapterEvictions: number
  clears: number
  stores: number
  refused: Record<string, number>
  presets: Record<string, number>
}

const fresh = (): Counters => ({ ops: 0, admits: 0, hits: 0, shortened: 0, hitTokens: 0, windowed: 0, shared: 0, evictions: 0, adapterEvictions: 0, clears: 0, stores: 0, refused: {}, presets: {} })

/** Runs seeds [from, to), checks everything after every operation, and returns what the streams did. */
function run(from: number, to: number): Counters {
  const c = fresh()
  for (let seed = from; seed < to; seed++) {
    const stream = streamFor(seed)
    const { spec } = stream
    const ops = opsOf(stream)
    expect(ops).toHaveLength(OPS)
    c.presets[stream.preset] = (c.presets[stream.preset] ?? 0) + 1
    const m = kvReference(spec)
    let before = m.state()
    for (let i = 0; i < ops.length; i++) {
      const op: KvOp = ops[i]
      const result = m.apply(op)
      const after = m.state()
      const problems = kvInvariants(spec, after)
      if (problems.length > 0) throw new Error(`seed ${seed} (${stream.preset}), op ${i} ${op.op}: ${problems.join('; ')}`)
      c.ops++
      if (!result.ok) {
        c.refused[`${op.op}:${result.reason}`] = (c.refused[`${op.op}:${result.reason}`] ?? 0) + 1
        if (still(after) !== still(before)) throw new Error(`seed ${seed} (${stream.preset}), op ${i}: ${op.op} was refused (${result.reason}) and changed the state`)
      }
      if (op.op === 'admit' && result.ok) {
        c.admits++
        const read = kvHitLength(spec, before, op.prompt, op.adapter ?? null)
        if (read.hit !== result.hit) throw new Error(`seed ${seed}, op ${i}: admit hit ${result.hit}, and the snapshot before it reads ${read.hit}`)
        if ((result.hit ?? 0) > 0) {
          c.hits++
          c.hitTokens += result.hit ?? 0
        }
        if (Object.values(read.perGroup).some((own) => own > read.hit)) c.shortened++
      }
      // What the streams reached: a window that has let go of a block, a page two requests hold.
      if (i % 4 === 0) {
        if (after.requests.some((r) => spec.groups.some((g, k) => g.kind === 'sliding' && r.tables[k].some((p) => p === null)))) c.windowed++
        if (after.pages.some((p) => p.st === 'used' && p.refs >= 2)) c.shared++
      }
      before = after
    }
    // Everything published adds up to the cache: a consumer that read the stream believes what the pool holds.
    const last = m.state()
    const batches = m.events()
    expect(kvConsumerView(batches)).toEqual(last.consumer)
    expect(last.cache.map((e) => ({ group: e.group, hash: e.hash, count: 1 }))).toEqual(last.consumer)
    // A batch is stamped with the index of the operation that published it.
    for (const [ts, events] of batches) {
      let removed = 0
      for (const e of events) {
        if (e.type === 'BlockRemoved') {
          c.evictions++
          removed++
        } else if (e.type === 'AllBlocksCleared') c.clears++
        else c.stores++
      }
      if (ops[ts].op === 'load-adapter' && removed > 0) c.adapterEvictions++
    }
  }
  return c
}

function expectReached(c: Counters): void {
  expect(c.ops).toBeGreaterThan(0)
  expect(c.hits).toBeGreaterThan(c.admits / 10)
  expect(c.shortened).toBeGreaterThan(5)
  expect(c.windowed).toBeGreaterThan(250)
  expect(c.shared).toBeGreaterThan(25)
  expect(c.evictions).toBeGreaterThan(5000)
  expect(c.stores).toBeGreaterThan(2000)
  expect(c.adapterEvictions).toBeGreaterThan(0)
  expect(c.clears).toBeGreaterThan(5)
  for (const kind of ['admit:no-pages', 'admit:exists', 'admit:no-adapter', 'append:unknown', 'finish:unknown', 'unload-adapter:unknown', 'unload-adapter:in-use', 'load-adapter:exists', 'load-adapter:no-pages', 'reset:busy']) {
    expect([kind, (c.refused[kind] ?? 0) > 0]).toEqual([kind, true])
  }
}

describe('check 1: the invariants hold over 200 seeds × 2,000 operations', () => {
  const CHUNK = 50
  for (let from = 0; from < SEEDS; from += CHUNK) {
    const to = Math.min(from + CHUNK, SEEDS)
    test(`seeds ${from} to ${to - 1}: after every operation, and the streams reach what the invariants guard`, () => {
      const c = run(from, to)
      expect(c.ops).toBe((to - from) * OPS)
      // A block of fewer than a full chunk of seeds (a nightly count that is not a multiple of it) may miss a rare thing.
      if (to - from === CHUNK) {
        expect(Object.keys(c.presets).sort()).toEqual(['one-group', 'same-size', 'state', 'two-kinds'])
        expectReached(c)
      }
    }, 180_000)
  }

  test('the streams are a function of the seed alone, differ between seeds, and hold the operations they claim to', () => {
    const a = streamFor(11)
    const first = opsOf(a, 300)
    expect(canonicalJson(opsOf(a, 300))).toBe(canonicalJson(first))
    expect(canonicalJson(opsOf(streamFor(12), 300))).not.toBe(canonicalJson(first))
    // A longer stream begins with the shorter one.
    expect(canonicalJson(opsOf(a, 500).slice(0, 300))).toBe(canonicalJson(first))
    const kinds = new Set(opsOf(streamFor(3), 2000).map((op) => op.op))
    expect([...kinds].sort()).toEqual(['admit', 'append', 'finish', 'load-adapter', 'reset', 'unload-adapter'])
  })
})
