/*
 * The hybrid KV manager's goldens (ARCHITECTURE §5.10; TRACKER W1-T21, check 4: "the events match their goldens"):
 * tests/fixtures/sim/kv.json maps each input, a preset with its pool and options and either the operations a manager is given or a
 * seeded stream of them, to the replies, the events and the final state, with the SHA-256 of that output's canonical JSON. It is written
 * only by `bun scripts/vectors.ts --write`, and a diff is reviewed like code.
 *
 * The test re-runs every vector from the input the fixture itself records, without going through the script's registry, so the fixture
 * is shown to be self-contained, and then compares the registry with the file. `bun scripts/vectors.ts --check` is the gate.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson } from '../../packages/sim/core/json'
import { kvAdapterCatalog, kvAdapterName, kvChain, kvInvariants, kvOps, kvPreset, kvReference } from '../../packages/sim/kv'
import type { KvEvent, KvEventBatch, KvOp, KvPresetId, KvResult, KvState } from '../../packages/sim/kv'
import { MODELS, renderFixture } from '../../scripts/vectors'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

type Ranges = number[] | { from: number; to: number }[]
type CaseOp = { op: string; req?: number; prompt?: Ranges; tokens?: Ranges; adapter?: number; pages?: number }
interface Vector {
  name: string
  input: {
    preset: KvPresetId
    pool: number
    options?: { prefixCaching?: boolean; adapterSlots?: number }
    ops?: CaseOp[]
    stream?: { seed: number; ops: number; ranks: number[]; sessions: number; maxRunning: number }
    output: 'full' | 'digest'
  }
  sha256: string
  output: { results: KvResult[]; events: KvEventBatch[]; state: KvState } & Record<string, unknown>
}
const fixturePath = path.join(root, 'tests/fixtures/sim/kv.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { header: string; model: string; vectors: Vector[] }

const expand = (t: Ranges): number[] => (t as (number | { from: number; to: number })[]).flatMap((x) => (typeof x === 'number' ? [x] : Array.from({ length: x.to - x.from + 1 }, (_, i) => x.from + i)))

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function fromInput(input: Vector['input']): { ops: KvOp[]; results: KvResult[]; events: KvEventBatch[]; state: KvState } {
  const spec = kvPreset(input.preset, input.pool, input.options ?? {})
  const ops: KvOp[] =
    input.ops !== undefined
      ? input.ops.map((o): KvOp => {
          if (o.op === 'admit') return o.adapter === undefined ? { op: 'admit', req: o.req as number, prompt: expand(o.prompt as Ranges) } : { op: 'admit', req: o.req as number, prompt: expand(o.prompt as Ranges), adapter: o.adapter }
          if (o.op === 'append') return { op: 'append', req: o.req as number, tokens: expand(o.tokens as Ranges) }
          return o as unknown as KvOp
        })
      : [
          ...kvOps((input.stream as NonNullable<Vector['input']['stream']>).seed, spec, (input.stream as NonNullable<Vector['input']['stream']>).ops, {
            adapters: kvAdapterCatalog(spec, (input.stream as NonNullable<Vector['input']['stream']>).ranks).map((a) => ({ id: a.id, pages: a.pages })),
            sessions: (input.stream as NonNullable<Vector['input']['stream']>).sessions,
            maxRunning: (input.stream as NonNullable<Vector['input']['stream']>).maxRunning,
          }),
        ]
  const m = kvReference(spec)
  const results = ops.map((op) => m.apply(op))
  return { ops, results, events: [...m.events()], state: m.state() }
}

describe('the kv goldens (tests/fixtures/sim/kv.json)', () => {
  test('hold fifteen vectors, each named once, that between them cover every preset, a decode, an eviction, an adapter, a slot, a reset and a state group', () => {
    expect(fixture.model).toBe('kv')
    expect(fixture.vectors).toHaveLength(15)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(15)
    expect(new Set(fixture.vectors.map((v) => v.input.preset))).toEqual(new Set(['one-group', 'two-kinds', 'same-size', 'state']))
    expect(fixture.vectors.some((v) => v.input.options?.adapterSlots !== undefined)).toBe(true)
    expect(fixture.vectors.some((v) => v.input.options?.prefixCaching === false)).toBe(true)
    expect(fixture.vectors.filter((v) => v.input.output === 'full')).toHaveLength(9)
    expect(fixture.vectors.filter((v) => v.input.output === 'digest')).toHaveLength(6)
  })

  test('reproduce byte for byte: each vector\'s input gives an output whose canonical JSON is the recorded one\'s, and has the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = fromInput(vector.input)
      if (vector.input.output === 'full') {
        const text = canonicalJson({ results: made.results, events: made.events, state: made.state })
        expect(text, vector.name).toBe(canonicalJson(vector.output))
        expect(sha256(text), vector.name).toBe(vector.sha256)
      } else {
        const o = vector.output as unknown as { ops: { sha256: string }; results: { count: number; sha256: string }; events: { batches: number; sha256: string }; state: { sha256: string } }
        expect(sha256(canonicalJson(made.ops)), vector.name).toBe(o.ops.sha256)
        expect({ count: made.results.length, sha256: sha256(canonicalJson(made.results)) }, vector.name).toEqual(o.results)
        expect({ batches: made.events.length, sha256: sha256(canonicalJson(made.events)) }, vector.name).toEqual(o.events)
        expect(sha256(canonicalJson(made.state)), vector.name).toBe(o.state.sha256)
        expect(sha256(canonicalJson(vector.output)), vector.name).toBe(vector.sha256)
      }
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'kv')
    expect(model).toBeDefined()
    expect(model?.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    expect(readFileSync(fixturePath, 'utf8')).toBe(renderFixture(model as NonNullable<typeof model>, root))
  })

  test('would catch a changed event: one hash moved by 1 gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors[0]
    const moved = structuredClone(vector.output)
    const first = moved.events[0][1][0]
    if (first.type !== 'BlockStored') throw new Error('the first event of the first vector is a store')
    ;(first.block_hashes as number[])[0] += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
  })
})

describe('the whole vectors tell the stories that their names promise', () => {
  const by = (start: string): Vector => fixture.vectors.find((v) => v.name.startsWith(start)) as Vector
  const storedBy = (events: KvEventBatch[]): KvEvent[] => events.flatMap(([, batch]) => [...batch]).filter((e) => e.type === 'BlockStored')

  test('the design document\'s request: 11 pages, a store for the full group\'s 7 blocks and for each sliding group\'s 2, and every page back', () => {
    const v = by("two-kinds: the design document's request")
    expect(v.output.results).toEqual([
      { ok: true, free: 13, hit: 0 },
      { ok: true, free: 24 },
    ])
    const stored = storedBy(v.output.events)
    expect(stored.map((e) => (e.type === 'BlockStored' ? [e.group_idx, e.block_hashes.length] : null))).toEqual([
      [0, 7],
      [1, 2],
      [2, 2],
    ])
    // The tokens of a run are its blocks' tokens: the full group's 7 blocks are the first 112 tokens, and a sliding group's last 2 are tokens 81 to 112.
    expect(stored[0].type === 'BlockStored' && stored[0].token_ids.length).toBe(112)
    expect(stored[1].type === 'BlockStored' && stored[1].token_ids[0]).toBe(81)
    expect(stored[1].type === 'BlockStored' && stored[1].parent_block_hash).toBe(kvChain(Array.from({ length: 112 }, (_, i) => i + 1), 7, 16, 0)[4])
    expect(kvInvariants(kvPreset('two-kinds', 24), v.output.state)).toEqual([])
  })

  test('the second request hits 112 tokens and takes 3 new pages', () => {
    const v = by('two-kinds: the same 112 tokens and one more')
    expect(v.output.results[2]).toEqual({ ok: true, free: 10, hit: 112 })
    expect(v.output.state.requests[0].tables).toEqual([
      [expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)],
      [null, null, null, null, null, expect.any(Number), expect.any(Number), expect.any(Number)],
      [null, null, null, null, null, expect.any(Number), expect.any(Number), expect.any(Number)],
    ])
  })

  test('the small pool evicts tail first: the third request removes the first one\'s blocks 2, 1 and 0', () => {
    const v = by('one-group: in a pool of 6 pages')
    const chain = kvChain(Array.from({ length: 48 }, (_, i) => i + 1), 3, 16, 0)
    const removed = v.output.events.flatMap(([, batch]) => [...batch]).filter((e) => e.type === 'BlockRemoved')
    expect(removed.map((e) => (e.type === 'BlockRemoved' ? e.block_hashes[0] : null))).toEqual([chain[2], chain[1], chain[0]])
  })

  test('the decode takes a page when a block opens, lets go of one when the window leaves it, and caches each block it fills', () => {
    const v = by('two-kinds: a decode of 40 tokens')
    expect(v.output.results.every((r) => r.ok)).toBe(true)
    // 20 tokens hold 2 pages in each of the 3 groups: 18 of the 24 are free. The 33rd token opens block 2 in each group (3 pages), the 47th lets
    // both sliding groups let go of block 0 (2 pages back, cached), and the 49th opens block 3 in each group (3 more).
    const free = v.output.results.map((r) => r.free)
    expect([free[0], free[13], free[27], free[29], free[41]]).toEqual([18, 15, 17, 14, 24])
    // Blocks fill at tokens 16, 32 and 48: block 0 at the prompt, block 1 at the 12th append, block 2 at the 28th. Each fill is one store for each group.
    expect(v.output.events.map(([ts]) => ts)).toEqual([0, 12, 28])
    for (const [, batch] of v.output.events) expect(batch.map((e) => (e.type === 'BlockStored' ? [e.group_idx, e.block_hashes.length] : null))).toEqual([[0, 1], [1, 1], [2, 1]])
    expect(v.output.state.requests).toEqual([])
  })

  test('a reset publishes one event and leaves nothing to hit, adapters are named in the stores, and slots take no page', () => {
    const adapters = by('two-kinds with adapters')
    const cleared = adapters.output.events.flatMap(([, batch]) => [...batch]).filter((e) => e.type === 'AllBlocksCleared')
    expect(cleared).toHaveLength(1)
    expect(adapters.output.results[5]).toEqual({ ok: false, reason: 'in-use', free: 2 })
    expect(adapters.output.results.at(-1)).toMatchObject({ ok: true, hit: 0 })
    const named = storedBy(adapters.output.events).find((e) => e.type === 'BlockStored' && e.lora_name === kvAdapterName(0))
    expect(named).toBeDefined()
    const slots = by('two-kinds with 2 adapter slots: a third')
    expect(slots.output.results[2]).toEqual({ ok: false, reason: 'no-slot', free: 40 })
    expect(slots.output.results.slice(0, 2)).toEqual([
      { ok: true, free: 40 },
      { ok: true, free: 40 },
    ])
  })

  test('a state group hits at its last edge, 96, and a pool that does not cache publishes nothing', () => {
    expect(by('state: a request of 100 tokens').output.results[2]).toMatchObject({ ok: true, hit: 96 })
    const off = by('one-group without prefix caching')
    expect(off.output.events).toEqual([])
    expect(off.output.results[2]).toMatchObject({ ok: true, hit: 0 })
  })
})
