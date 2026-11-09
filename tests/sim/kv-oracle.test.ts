/*
 * The reference manager against a second implementation (tests/sim/kv-oracle.ts), which does the same operations a different way: it
 * tries each step and rolls everything back when the pool runs dry, keeps its queue in an array, finds a hit by trying every length, and
 * never calls the model's own rules for the tables, the windows or the hit. They must agree on every reply, every event and, page for
 * page, every state, over seeded streams of every preset and over specs that the presets do not reach: blocks of unequal sizes, a window
 * shorter than a block, groups that are twins of each other, and a state group that keeps one block.
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '../../packages/sim/core/json'
import { buildKvSpec, kvInvariants, kvOps, kvPreset, kvReference } from '../../packages/sim/kv'
import type { KvLayerKind, KvOp, KvSpec } from '../../packages/sim/kv'
import { Oracle } from './kv-oracle'
import { opsOf, streamFor, wildOps } from './kv-support'

/** The first place the two disagree, as a sentence; null when they agree on every operation. */
function disagreement(spec: KvSpec, ops: readonly KvOp[], every = 2): string | null {
  const a = kvReference(spec)
  const b = new Oracle(spec)
  let seenA = 0
  let seenB = 0
  for (let i = 0; i < ops.length; i++) {
    const ra = a.apply(ops[i])
    const rb = b.apply(ops[i])
    if (canonicalJson(ra) !== canonicalJson(rb)) return `op ${i} (${ops[i].op}): the reference answers ${canonicalJson(ra)}, the oracle ${canonicalJson(rb)}`
    const ea = a.events().slice(seenA)
    const eb = b.events().slice(seenB)
    seenA += ea.length
    seenB += eb.length
    if (canonicalJson(ea) !== canonicalJson(eb)) return `op ${i} (${ops[i].op}): the events differ`
    if (i % every === 0 || i === ops.length - 1) {
      const sa = a.state()
      const sb = b.state()
      for (const key of Object.keys(sa) as (keyof typeof sa)[]) {
        if (canonicalJson(sa[key]) !== canonicalJson(sb[key])) return `op ${i} (${ops[i].op}): the states differ in ${key}`
      }
      const broken = kvInvariants(spec, sa)
      if (broken.length > 0) return `op ${i} (${ops[i].op}): ${broken[0]}`
    }
  }
  return null
}

describe('the reference and the oracle agree', () => {
  test('on 24 seeded streams of the presets: every reply, every event, the whole state, 700 operations each', () => {
    for (let seed = 0; seed < 24; seed++) {
      const stream = streamFor(seed)
      expect([seed, stream.preset, disagreement(stream.spec, opsOf(stream, 700))]).toEqual([seed, stream.preset, null])
    }
  }, 120_000)

  const mixed: KvSpec = {
    poolPages: 20,
    pageBytes: 8,
    tokenBytes: 1,
    paddingLayers: 0,
    prefixCaching: true,
    groups: [
      { id: 'full0', kind: 'full', layers: 2, blockTokens: 4 },
      { id: 'state0', kind: 'state', layers: 1, blockTokens: 8, statePages: 2 },
    ],
  }
  const tiny = (kinds: KvLayerKind[], pool: number): KvSpec => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds }, pool)
  const SPECS: [string, KvSpec][] = [
    ['blocks of 4 and 8 tokens (the alignment is 8)', mixed],
    ['the same with a pool twice the size', { ...mixed, poolPages: 40 }],
    ['a window of 3 tokens, shorter than a block of 4', tiny([{ kind: 'full', layers: 1 }, { kind: 'sliding', layers: 1, window: 3 }], 16)],
    ['a window of 2 tokens', tiny([{ kind: 'full', layers: 1 }, { kind: 'sliding', layers: 1, window: 2 }], 12)],
    ['a window of exactly one block', tiny([{ kind: 'full', layers: 1 }, { kind: 'sliding', layers: 1, window: 4 }], 16)],
    ['twin groups: two full, one sliding, one state that keeps one block', tiny([{ kind: 'full', layers: 2 }, { kind: 'sliding', layers: 1, window: 5 }, { kind: 'state', layers: 1, stateBytes: 4, statePages: 1 }], 30)],
    ['a sliding group alone', tiny([{ kind: 'sliding', layers: 1, window: 8 }], 10)],
    ['a state group alone, keeping 3 blocks', tiny([{ kind: 'state', layers: 1, stateBytes: 4, statePages: 3 }], 12)],
    ['two windows and no full group', tiny([{ kind: 'sliding', layers: 1, window: 5 }, { kind: 'sliding', layers: 1, window: 12 }], 24)],
  ]
  for (const [name, spec] of SPECS) {
    test(`on ${name}`, () => {
      for (let seed = 100; seed < 104; seed++) {
        const ops = kvOps(seed, spec, 500, { sessions: 4 + (seed % 3), maxRunning: 2 + (seed % 3) })
        expect([seed, disagreement(spec, ops)]).toEqual([seed, null])
      }
    }, 60_000)
  }

  for (const [name, spec] of [...SPECS, ['the presets\' two-kinds', kvPreset('two-kinds', 40)], ['the presets\' state', kvPreset('state', 40)]] as [string, KvSpec][]) {
    test(`on wild streams of calls to ${name}: a tiny alphabet repeats blocks between requests, and most calls are refused`, () => {
      let accepted = 0
      for (let seed = 200; seed < 206; seed++) {
        const ops = wildOps(seed, spec, 500)
        expect([seed, disagreement(spec, ops)]).toEqual([seed, null])
        const m = kvReference(spec)
        for (const op of ops) if (m.apply(op).ok) accepted++
        expect(kvInvariants(spec, m.state())).toEqual([])
      }
      expect(accepted).toBeGreaterThan(300)
    }, 60_000)
  }
})
