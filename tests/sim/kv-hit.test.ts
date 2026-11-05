/*
 * The hash of a block and the prefix hit (ARCHITECTURE §5.4; WORLD §2.4), at the level of functions, before any manager uses them.
 *
 *   - the hash is the documented one: pinned vectors that a Rust or Python port must reproduce, and the properties a prefix cache needs
 *     (any token, the parent, the extra key and the length change it);
 *   - the hit search equals vLLM's own search, ported line for line (tests/sim/kv-support.ts, `vllmHit`), and equals a brute-force
 *     statement of the rule, on thousands of random specs, prompts and caches;
 *   - the hit is the intersection of the groups' hits, and the hand-built cases show where a union or one group alone would differ.
 */
import { describe, expect, test } from 'bun:test'
import { below, between, chance, rngFor } from '../../packages/sim/core/rng'
import { kvAlignment, kvBlockHash, kvChain, kvExtraKey, kvFindHit } from '../../packages/sim/kv'
import type { KvGroupSpec } from '../../packages/sim/kv'
import { bruteHit, randomCache, randomGroups, specOf, vllmHit } from './kv-support'
import type { Chains } from './kv-support'

const T = [1, 2, 3, 4, 5, 6, 7, 8]

describe('the block hash', () => {
  test('has the documented values, which a port to Rust or Python must reproduce', () => {
    // Computed from the words in packages/sim/kv/hash.ts by an independent Python port, and by the TypeScript.
    expect(kvBlockHash(0, T, 0, 4, 0)).toBe(6114037948352278)
    expect(kvBlockHash(0, T, 4, 8, 0)).toBe(5521158368287210)
    expect(kvBlockHash(6114037948352278, T, 4, 8, 0)).toBe(725312391975601)
    expect(kvBlockHash(0, T, 0, 4, 1)).toBe(5098950871497889)
    expect(kvBlockHash(0, T, 0, 4, 7)).toBe(4678761080469942)
    expect(kvBlockHash(0, [4294967295, 2147483648, 0, 1], 0, 4, 0)).toBe(8566613748152389)
    expect(kvBlockHash(9007199254740991, T, 0, 2, 0)).toBe(4955319056772685)
    expect(kvBlockHash(0, [], 0, 0, 0)).toBe(2949765250491212)
    expect(kvChain([...T, 9, 10, 11, 12], 3, 4, 0)).toEqual([6114037948352278, 725312391975601, 8380519700406978])
  })

  test('chains the parent: the same tokens after another history are another block', () => {
    const first = kvBlockHash(0, T, 0, 4, 0)
    const other = kvBlockHash(0, [9, 9, 9, 9], 0, 4, 0)
    expect(kvBlockHash(first, T, 4, 8, 0)).not.toBe(kvBlockHash(other, T, 4, 8, 0))
    expect(kvBlockHash(first, T, 4, 8, 0)).not.toBe(kvBlockHash(0, T, 4, 8, 0))
  })

  test('changes with any token, the extra key and the length, and stays within 53 bits, over thousands of draws', () => {
    const rng = rngFor(5, 'tests/kv/hash')
    const seen = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      const size = between(rng, 1, 40)
      const tokens = Array.from({ length: size }, () => below(rng, 4294967296))
      const parent = chance(rng, 500) ? 0 : below(rng, 9007199254740991)
      const extra = below(rng, 10)
      const h = kvBlockHash(parent, tokens, 0, size, extra)
      expect(Number.isSafeInteger(h) && h >= 0).toBe(true)
      expect(seen.has(h)).toBe(false)
      seen.add(h)
      const k = below(rng, size)
      const edited = tokens.slice()
      edited[k] = (edited[k] + 1) % 4294967296
      expect(kvBlockHash(parent, edited, 0, size, extra)).not.toBe(h)
      expect(kvBlockHash(parent, tokens, 0, size, extra + 1)).not.toBe(h)
      expect(kvBlockHash(parent, tokens.concat([0]), 0, size + 1, extra)).not.toBe(h)
    }
  })

  test('reads a window of a longer array: the hash of tokens[a..b) is the hash of that slice', () => {
    const rng = rngFor(6, 'tests/kv/hash')
    const tokens = Array.from({ length: 60 }, () => below(rng, 100000))
    for (let a = 0; a < 40; a += 7) expect(kvBlockHash(11, tokens, a, a + 16, 3)).toBe(kvBlockHash(11, tokens.slice(a, a + 16), 0, 16, 3))
  })

  test('chains whole blocks, and a chain is a prefix of a longer one', () => {
    const rng = rngFor(7, 'tests/kv/hash')
    const tokens = Array.from({ length: 100 }, () => below(rng, 100000))
    const long = kvChain(tokens, 6, 16, 0)
    expect(kvChain(tokens, 4, 16, 0)).toEqual(long.slice(0, 4))
    expect(kvChain(tokens.slice(0, 64), 4, 16, 0)).toEqual(long.slice(0, 4))
    expect(kvChain(tokens, 6, 16, 1)).not.toEqual(long)
    expect(kvChain(tokens, 6, 16, 1).some((h, j) => h === long[j])).toBe(false)
    expect(kvChain(tokens, 0, 16, 0)).toEqual([])
  })

  test('reads an adapter as its id plus 1, and the base model as 0', () => {
    expect([kvExtraKey(null), kvExtraKey(undefined), kvExtraKey(0), kvExtraKey(5)]).toEqual([0, 0, 1, 6])
  })
})

describe('the prefix hit', () => {
  /** Prompts, caches and specs of every shape: the hit must be the one vLLM finds and the one the rule defines. */
  test('equals vLLM\'s own search and the brute-force rule on 4,000 random specs, prompts and caches', () => {
    const rng = rngFor(11, 'tests/kv/hit')
    let positive = 0
    let shortened = 0
    for (let i = 0; i < 4000; i++) {
      const groups = randomGroups(rng)
      const spec = specOf(groups)
      const align = kvAlignment(spec)
      const length = between(rng, 1, 40 * align)
      const tokens = Array.from({ length }, () => below(rng, 50000))
      const chains: Chains = groups.map((g) => kvChain(tokens, Math.floor(length / g.blockTokens), g.blockTokens, 0))
      const cached = randomCache(rng, groups, chains)
      const has = (g: number, h: number) => cached.has(`${g}:${h}`)
      const found = kvFindHit(spec, has, chains, length - 1)
      const expected = vllmHit(spec, has, chains, length - 1)
      expect([i, found.hit]).toEqual([i, expected])
      expect([i, found.hit]).toEqual([i, bruteHit(spec, has, chains, length - 1)])
      // The hit is within every group's own hit, is a multiple of the alignment, and never reaches the last token.
      expect(found.hit % align).toBe(0)
      expect(found.hit).toBeLessThanOrEqual(Math.max(0, length - 1))
      found.perGroup.forEach((own) => expect(found.hit).toBeLessThanOrEqual(own))
      if (found.hit > 0) positive++
      if (found.perGroup.some((own) => own > found.hit)) shortened++
    }
    // The cases reach a hit, and a hit that the intersection shortened: the test is not vacuous.
    expect(positive).toBeGreaterThan(500)
    expect(shortened).toBeGreaterThan(300)
  })

  test('is 0 when the first block of a full group is missing, and when the prompt is one token', () => {
    const groups: KvGroupSpec[] = [
      { id: 'f', kind: 'full', layers: 1, blockTokens: 4 },
      { id: 's', kind: 'sliding', layers: 1, blockTokens: 4, window: 8 },
    ]
    const spec = specOf(groups)
    const tokens = Array.from({ length: 24 }, (_, i) => i + 1)
    const chains: Chains = groups.map((g) => kvChain(tokens, 6, g.blockTokens, 0))
    // The sliding group holds everything; the full group lacks block 0.
    const cached = new Set<string>()
    for (let j = 0; j < 6; j++) cached.add(`1:${chains[1][j]}`)
    for (let j = 1; j < 6; j++) cached.add(`0:${chains[0][j]}`)
    const has = (g: number, h: number) => cached.has(`${g}:${h}`)
    expect(kvFindHit(spec, has, chains, 23).hit).toBe(0)
    expect(kvFindHit(spec, has, chains, 0).hit).toBe(0)
  })

  test('is the intersection: a union of the groups, or the full group alone, would give a longer hit than the groups can serve', () => {
    // 4-token blocks. The full group holds blocks 0 to 5 (24 tokens). The sliding group, with a window of 8, needs the 2 blocks before the
    // edge, and holds only blocks 2 and 3: it can serve a hit of 16 tokens (blocks 2 and 3 end at 16) and no longer one.
    const groups: KvGroupSpec[] = [
      { id: 'f', kind: 'full', layers: 1, blockTokens: 4 },
      { id: 's', kind: 'sliding', layers: 1, blockTokens: 4, window: 8 },
    ]
    const spec = specOf(groups)
    const tokens = Array.from({ length: 29 }, (_, i) => i + 1)
    const chains: Chains = groups.map((g) => kvChain(tokens, 7, g.blockTokens, 0))
    const cached = new Set<string>()
    for (let j = 0; j < 6; j++) cached.add(`0:${chains[0][j]}`)
    cached.add(`1:${chains[1][2]}`)
    cached.add(`1:${chains[1][3]}`)
    const has = (g: number, h: number) => cached.has(`${g}:${h}`)
    const found = kvFindHit(spec, has, chains, 28)
    expect(found.perGroup).toEqual([24, 16])
    expect(found.hit).toBe(16)
  })

  test('takes a pass for each group that shortens it: three kinds settle by a fixed point, not in one pass', () => {
    // Full holds 0 to 7 (32 tokens). The state group holds the edges at 24 only. The sliding group (window 8, 2 blocks) holds blocks 4 and 5,
    // which ends at 24. The state group alone would hit 24, the sliding group alone 24, and the full group 32: every group agrees at 24.
    // Then a variant where the sliding group holds 5 and 6 (edge 28) and the state group holds 24 only: sliding says 28, state pulls it to 24
    // and sliding must then accept 24 again, which it does not (blocks 4 and 5 are missing): the answer is 0 or whatever is common.
    const groups: KvGroupSpec[] = [
      { id: 'f', kind: 'full', layers: 1, blockTokens: 4 },
      { id: 's', kind: 'sliding', layers: 1, blockTokens: 4, window: 8 },
      { id: 'm', kind: 'state', layers: 1, blockTokens: 4, statePages: 2 },
    ]
    const spec = specOf(groups)
    const tokens = Array.from({ length: 37 }, (_, i) => i + 1)
    const chains: Chains = groups.map((g) => kvChain(tokens, 9, g.blockTokens, 0))
    const make = (full: number[], sliding: number[], state: number[]) => {
      const cached = new Set<string>()
      full.forEach((j) => cached.add(`0:${chains[0][j]}`))
      sliding.forEach((j) => cached.add(`1:${chains[1][j]}`))
      state.forEach((j) => cached.add(`2:${chains[2][j]}`))
      return (g: number, h: number) => cached.has(`${g}:${h}`)
    }
    const run = (has: (g: number, h: number) => boolean) => ({ ours: kvFindHit(spec, has, chains, 36).hit, theirs: vllmHit(spec, has, chains, 36) })
    expect(run(make([0, 1, 2, 3, 4, 5, 6, 7], [4, 5], [5]))).toEqual({ ours: 24, theirs: 24 })
    expect(run(make([0, 1, 2, 3, 4, 5, 6, 7], [5, 6], [5]))).toEqual({ ours: 0, theirs: 0 })
    expect(run(make([0, 1, 2, 3, 4, 5, 6, 7], [3, 4, 5, 6], [5, 6]))).toEqual({ ours: 28, theirs: 28 })
    expect(run(make([0, 1, 2, 3, 4, 5, 6, 7], [3, 4, 5, 6], [5]))).toEqual({ ours: 24, theirs: 24 })
  })

  test('rounds to the least common multiple of the groups\' block sizes', () => {
    const groups: KvGroupSpec[] = [
      { id: 'f', kind: 'full', layers: 1, blockTokens: 8 },
      { id: 'm', kind: 'state', layers: 1, blockTokens: 24, statePages: 1 },
    ]
    const spec = specOf(groups)
    expect(kvAlignment(spec)).toBe(24)
    const tokens = Array.from({ length: 80 }, (_, i) => i + 1)
    const chains: Chains = groups.map((g) => kvChain(tokens, Math.floor(80 / g.blockTokens), g.blockTokens, 0))
    const cached = new Set<string>()
    for (let j = 0; j < 9; j++) cached.add(`0:${chains[0][j]}`)
    for (let j = 0; j < 3; j++) cached.add(`1:${chains[1][j]}`)
    const has = (g: number, h: number) => cached.has(`${g}:${h}`)
    // The full group holds 72 tokens and the state group the edges at 24, 48 and 72: all three land on the alignment.
    expect(kvFindHit(spec, has, chains, 79).hit).toBe(72)
    // Without the state group's last two edges the hit falls back to 24, a multiple of 8 and of 24.
    cached.delete(`1:${chains[1][1]}`)
    cached.delete(`1:${chains[1][2]}`)
    expect(kvFindHit(spec, has, chains, 79).hit).toBe(24)
    expect(vllmHit(spec, has, chains, 79)).toBe(24)
  })
})
