/*
 * The vendored RNG (vendor/kernelspace/src/lib/rng.ts, unchanged) does what ARCHITECTURE section 5.1 builds on:
 * the same seed gives the same bytes in every runtime, and `rngFor` sub-streams can be made from `splitmix32u` and `hash32`.
 *
 * Three checks that share no code with each other:
 *   - `hash32` against the published FNV-1a 32-bit test vectors;
 *   - `splitmix32u` against a BigInt re-implementation of the same algorithm, over many seeds, so a change to the
 *     operation order or to a constant fails here whatever the pinned draws say;
 *   - the first draws of a few seeds, pinned below [measured 2026-11-03 with bun 1.3.14 on kernelspace's d478f91].
 */
import { describe, expect, test } from 'bun:test'
import { exportOrder, freshSeed, hash32, shuffledOrder, splitmix32, splitmix32u } from '../../vendor/kernelspace/src/lib/rng'

const MASK = 0xffffffffn

/** splitmix32 with arbitrary-precision integers: an unsigned 32-bit state, and no Math.imul and no `| 0` anywhere. */
function reference(seed: number): () => number {
  let state = BigInt.asUintN(32, BigInt(seed))
  return () => {
    state = (state + 0x9e3779b9n) & MASK
    let t = state ^ (state >> 16n)
    t = (t * 0x21f0aaadn) & MASK
    t = t ^ (t >> 15n)
    t = (t * 0x735a2d97n) & MASK
    t = t ^ (t >> 15n)
    return Number(t)
  }
}

const draws = (next: () => number, n: number) => Array.from({ length: n }, next)
const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`

describe('hash32 is FNV-1a, 32 bit', () => {
  // The test vectors of the FNV reference suite (Noll), for FNV-1a with a 32-bit hash.
  test.each<[string, number]>([
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['b', 0xe70c2de5],
    ['foobar', 0xbf9cf968],
  ])('hash32(%j) is %p', (text, expected) => {
    expect(hash32(text)).toBe(expected)
  })

  test('is an unsigned 32-bit integer, and depends on every character', () => {
    for (const text of ['t5.l4:2', 'kernelspace', 'a'.repeat(1000)]) {
      const h = hash32(text)
      expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true)
    }
    expect(hash32('t5.l4:2')).not.toBe(hash32('t5.l4:3'))
  })
})

describe('splitmix32u', () => {
  test('equals the BigInt reference over 128 seeds of 64 draws, signed, unsigned and out-of-range seeds included', () => {
    const seeds = [0, 1, 2, 42, 0x7fffffff, 0x80000000, 0xdeadbeef, 0xffffffff, 2 ** 32 + 5, -1, -(2 ** 31), ...Array.from({ length: 117 }, (_, i) => i * 2654435761)]
    expect(seeds).toHaveLength(128)
    for (const seed of seeds) expect(draws(splitmix32u(seed), 64)).toEqual(draws(reference(seed), 64))
  })

  test('first draws of seeds 0, 1 and 42 are pinned', () => {
    expect(draws(splitmix32u(0), 4).map(hex)).toEqual(['0x64625032', '0xd9c0799c', '0xaf362e10', '0x7fa88912'])
    expect(draws(splitmix32u(1), 4).map(hex)).toEqual(['0x5e2d1772', '0x14e498f0', '0xd20ea1fd', '0xb382f339'])
    expect(draws(splitmix32u(42), 4).map(hex)).toEqual(['0x20e44818', '0x0895a923', '0x1339a01f', '0xb4e3841a'])
  })

  test('is a pure function of the seed: equal seeds replay, nearby seeds do not collide, and streams are independent', () => {
    expect(draws(splitmix32u(7), 100)).toEqual(draws(splitmix32u(7), 100))
    expect(draws(splitmix32u(7), 100)).not.toEqual(draws(splitmix32u(8), 100))
    const a = splitmix32u(5)
    const b = splitmix32u(5)
    a()
    expect(b()).not.toBe(a())
  })

  test('draws are unsigned 32-bit integers', () => {
    for (const x of draws(splitmix32u(99), 1000)) expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true)
  })
})

describe('splitmix32 is the same stream as a fraction in [0, 1)', () => {
  test('each draw is the uint32 divided by 2^32', () => {
    for (const seed of [0, 1, 42, 0xdeadbeef]) expect(draws(splitmix32(seed), 100)).toEqual(draws(splitmix32u(seed), 100).map((x) => x / 4294967296))
  })

  test('stays below 1, and moves across the range', () => {
    const xs = draws(splitmix32(123), 10_000)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(Math.min(...xs)).toBeLessThan(0.01)
    expect(Math.max(...xs)).toBeGreaterThan(0.99)
  })
})

describe('shuffledOrder and exportOrder', () => {
  test('give a permutation of [0, n) for every n up to 64, the same one for the same seed', () => {
    for (let n = 0; n <= 64; n++) {
      const order = shuffledOrder(n, 1000 + n)
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i))
      expect(shuffledOrder(n, 1000 + n)).toEqual(order)
    }
  })

  test('a shuffle of 10 under seed 42 is pinned', () => {
    expect(shuffledOrder(10, 42)).toEqual([6, 2, 5, 7, 3, 9, 4, 8, 0, 1])
  })

  test('the export order is the shuffle seeded by the hash of "<lesson>:<question>"', () => {
    expect(exportOrder('t5.l4', 2, 4)).toEqual(shuffledOrder(4, hash32('t5.l4:2')))
    expect(exportOrder('t5.l4', 2, 4)).toEqual([1, 0, 3, 2])
  })
})

describe('freshSeed', () => {
  test('is an unsigned 32-bit integer, and not one constant', () => {
    const seeds = Array.from({ length: 16 }, freshSeed)
    expect(seeds.every((s) => Number.isInteger(s) && s >= 0 && s <= 0xffffffff)).toBe(true)
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })
})
