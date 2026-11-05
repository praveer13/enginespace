/*
 * The operation streams of the hybrid KV model (`kvOps`, ARCHITECTURE §5.4): what a stream is made of, that it is valid at every step for
 * a manager that answers as the reference does, and that its knobs do what they say. The property tests run the streams; this says what
 * is in them.
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '../../packages/sim/core/json'
import { KV_PRESET_IDS, kvAdapterCatalog, kvFindHit, kvHitLength, kvOps, kvPreset, kvReference } from '../../packages/sim/kv'
import type { KvOp, KvSpec } from '../../packages/sim/kv'
import { specOf } from './kv-support'

const spec = kvPreset('two-kinds', 96)
const adapters = kvAdapterCatalog(spec).map((a) => ({ id: a.id, pages: a.pages }))

describe('kvOps', () => {
  test('is a function of the seed, the spec and the count, and a longer stream begins with a shorter one', () => {
    const a = kvOps(5, spec, 400, { adapters })
    expect(canonicalJson(kvOps(5, spec, 400, { adapters }))).toBe(canonicalJson(a))
    expect(canonicalJson(kvOps(6, spec, 400, { adapters }))).not.toBe(canonicalJson(a))
    expect(canonicalJson(kvOps(5, spec, 700, { adapters }).slice(0, 400))).toBe(canonicalJson(a))
    expect(kvOps(5, spec, 0)).toEqual([])
    expect(a).toHaveLength(400)
  })

  test('refuses a count or a profile that cannot make a stream', () => {
    expect(() => kvOps(1, spec, -1)).toThrow(/non-negative number of operations/)
    expect(() => kvOps(1, spec, 1.5)).toThrow(RangeError)
    expect(() => kvOps(1, spec, 10, { sessions: 0 })).toThrow(/a conversation to take turns/)
    expect(() => kvOps(1, spec, 10, { maxRunning: 0 })).toThrow(/a request to run/)
  })

  test('is valid at every step: the reference never throws on it, for every preset, and every call is well formed', () => {
    for (const id of KV_PRESET_IDS) {
      const s = kvPreset(id)
      const m = kvReference(s)
      for (const op of kvOps(9, s, 800, { adapters: kvAdapterCatalog(s).map((a) => ({ id: a.id, pages: a.pages })) })) {
        expect(() => m.apply(op)).not.toThrow()
        if (op.op === 'admit') expect(op.prompt.length).toBeGreaterThan(0)
        if (op.op === 'append') expect(op.tokens.length).toBeGreaterThan(0)
      }
    }
  })

  test('plays conversations: a later turn\'s prompt begins with the whole sequence of an earlier request, reply included', () => {
    const ops = kvOps(3, spec, 1500)
    const finished: number[][] = []
    const running = new Map<number, number[]>()
    let extending = 0
    for (const op of ops) {
      if (op.op === 'admit') {
        if (finished.some((f) => f.length > 8 && op.prompt.length > f.length && f.every((t, i) => op.prompt[i] === t))) extending++
        running.set(op.req, op.prompt.slice())
      } else if (op.op === 'append') running.get(op.req)?.push(...op.tokens)
      else if (op.op === 'finish') {
        const seq = running.get(op.req)
        if (seq !== undefined) finished.push(seq)
        running.delete(op.req)
      }
    }
    expect(extending).toBeGreaterThan(20)
  })

  test('shares system prompts: some prompts of different conversations begin with the same tokens', () => {
    const ops = kvOps(4, spec, 1200, { sharedPrompts: 2 })
    const heads = new Map<string, number>()
    for (const op of ops) if (op.op === 'admit' && op.prompt.length >= 16) heads.set(op.prompt.slice(0, 16).join(','), (heads.get(op.prompt.slice(0, 16).join(',')) ?? 0) + 1)
    expect(Math.max(...heads.values())).toBeGreaterThan(5)
    // With no shared prompt, a request's head is its own conversation's, and only its later turns repeat it.
    const alone = kvOps(4, spec, 1200, { sharedPrompts: 0 })
    expect(alone.some((op) => op.op === 'admit')).toBe(true)
  })

  test('loads and unloads the adapters it is given, with the pages it is given, and runs requests on them', () => {
    const ops = kvOps(8, spec, 1200, { adapters })
    const loads = ops.filter((op): op is Extract<KvOp, { op: 'load-adapter' }> => op.op === 'load-adapter')
    expect(loads.length).toBeGreaterThan(3)
    // A load of 1 page is a call to be refused: it names an adapter that is resident.
    for (const op of loads) if (op.pages !== 1) expect([op.adapter, op.pages]).toEqual([op.adapter, adapters[op.adapter].pages])
    expect(ops.some((op) => op.op === 'unload-adapter')).toBe(true)
    expect(ops.some((op) => op.op === 'admit' && op.adapter !== undefined && op.adapter < 3)).toBe(true)
    // None given, none used.
    const none = kvOps(8, spec, 1200)
    expect(none.some((op) => op.op === 'load-adapter' || (op.op === 'admit' && op.adapter !== undefined && op.adapter < 3))).toBe(false)
  })

  test('resets only when it says so: with a weight of 0, a reset is a call to be refused', () => {
    const m = kvReference(spec)
    let accepted = 0
    for (const op of kvOps(2, spec, 1500, { resetWeight: 0 })) if (m.apply(op).ok && op.op === 'reset') accepted++
    expect(accepted).toBe(0)
    const m2 = kvReference(spec)
    let some = 0
    for (const op of kvOps(2, spec, 1500, { resetWeight: 30 })) if (m2.apply(op).ok && op.op === 'reset') some++
    expect(some).toBeGreaterThan(10)
  })

  test('keeps a conversation within its cap before it starts over', () => {
    const ops = kvOps(2, spec, 1500, { sequenceCap: 64 })
    const longest = Math.max(...ops.filter((op): op is Extract<KvOp, { op: 'admit' }> => op.op === 'admit').map((op) => op.prompt.length))
    // A prompt is the sequence so far, which the cap bounds, plus one new message of up to 10 blocks of 16 tokens.
    expect(longest).toBeLessThanOrEqual(64 + 160 + 80)
  })

  test('asks for the calls that must be refused, and each is refused for the reason that it names', () => {
    const m = kvReference(spec)
    const reasons = new Set<string>()
    for (const op of kvOps(1, spec, 3000, { adapters })) {
      const r = m.apply(op)
      if (!r.ok) reasons.add(`${op.op}:${r.reason}`)
    }
    for (const want of ['finish:unknown', 'append:unknown', 'admit:exists', 'admit:no-adapter', 'unload-adapter:unknown', 'reset:busy', 'admit:no-pages']) {
      expect([want, reasons.has(want)]).toEqual([want, true])
    }
  })
})

describe('the prefix hit search at its edges', () => {
  test('answers 0 for a prompt of one token or none, and for a negative bound', () => {
    const groups = specOf([{ id: 'f', kind: 'full', layers: 1, blockTokens: 4 }])
    expect(kvFindHit(groups, () => true, [[]], -1)).toEqual({ hit: 0, perGroup: [0] })
    expect(kvFindHit(groups, () => true, [[]], 0)).toEqual({ hit: 0, perGroup: [0] })
    const m = kvReference(kvPreset('one-group', 8))
    expect(kvHitLength(kvPreset('one-group', 8), m.state(), [], null)).toEqual({ perGroup: { full0: 0 }, hit: 0 })
    expect(kvHitLength(kvPreset('one-group', 8), m.state(), [5], null).hit).toBe(0)
  })

  test('is never more than the prompt less one token, though every block is cached', () => {
    const one: KvSpec = kvPreset('one-group', 8)
    const m = kvReference(one)
    const prompt = Array.from({ length: 32 }, (_, i) => i + 1)
    m.apply({ op: 'admit', req: 0, prompt })
    m.apply({ op: 'finish', req: 0 })
    // 32 tokens are 2 whole blocks, and all of it is cached; the hit stops a block short because the last token is computed.
    expect(kvHitLength(one, m.state(), prompt, null).hit).toBe(16)
    expect(kvHitLength(one, m.state(), [...prompt, 77], null).hit).toBe(32)
  })
})
