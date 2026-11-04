/*
 * W0-T12 acceptance check 1, and the rest of packages/sim/core: the seeded generator, exact integer arithmetic, integer
 * statistics, canonical JSON and the exponential-delay table.
 *
 *   - rngFor is the definition of ARCHITECTURE §5.1, and it equals a BigInt re-implementation of splitmix32 and FNV-1a that shares
 *     no code with the vendored file.
 *   - below(n) passes a chi-square uniformity test over 1e5 draws for n in {3, 7, 1000}, in both tails, and its rejection rule is
 *     tested exactly: the chi-square test cannot see a modulo bias of n / 2^32, so scripted streams put draws on each side of the
 *     limit. Its arithmetic is compared with exact BigInt arithmetic up to 2^53 - 1.
 *   - No `Math.floor(… * n)` appears in packages/sim (an AST scan, itself tested on code that does and does not), and nothing there
 *     reaches the float generator of the vendored file.
 *
 * The chi-square critical values are [derived]: a bisection on the regularized incomplete gamma function written for this file
 * with Python 3.13's standard library, checked against the closed form for 2 degrees of freedom (-2 ln α) and the standard
 * tables for 6 and 15 [measured 2026-11-03]. Both tails are tested at α = 1e-3, so a stream that is too regular fails too.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import {
  EXP_BINS,
  EXP_QUANTILES,
  EXP_SCALE,
  assertSeed,
  below,
  between,
  canonicalJson,
  chance,
  compareAsc,
  divCeil,
  divFloor,
  divRound,
  expDelayUs,
  hash32,
  mean,
  nearestRank,
  percentile,
  permille,
  pick,
  rngFor,
  shuffle,
  sortedAsc,
  splitmix32u,
  sum,
  weighted,
} from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import { hash32 as vendoredHash32, splitmix32u as vendoredSplitmix32u } from '../../vendor/kernelspace/src/lib/rng'

const root = path.resolve(import.meta.dirname, '../..')
const MASK = 0xffffffffn

const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng())
const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`

/** splitmix32 over BigInt, seeded the way rngFor is: state = seed XOR FNV-1a(salt), mod 2^32. Shares nothing with the vendored file. */
function reference(seed: number, salt: string): Rng {
  let h = 0x811c9dc5n
  for (let i = 0; i < salt.length; i++) {
    h ^= BigInt(salt.charCodeAt(i))
    h = (h * 0x01000193n) & MASK
  }
  let state = (BigInt(seed) ^ h) & MASK
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

/** A stream that replays `values` and records how many it gave. */
function scripted(values: readonly number[]): Rng & { used(): number } {
  let i = 0
  const next = (() => {
    if (i >= values.length) throw new Error('the script ran out')
    return values[i++]
  }) as Rng & { used(): number }
  next.used = () => i
  return next
}

describe('rngFor', () => {
  const seeds = [0, 1, 2, 42, 0x7fffffff, 0x80000000, 0xdeadbeef, 0xffffffff]
  const salts = ['', 'a', 'workload/arrivals', 'workload/prompt', 'kv', 'trace/jitter', 'x'.repeat(200)]

  test('equals the BigInt reference over 8 seeds and 7 salts, 64 draws each', () => {
    for (const seed of seeds) for (const salt of salts) expect(draws(rngFor(seed, salt), 64)).toEqual(draws(reference(seed, salt), 64))
  })

  test('is splitmix32u(seed ^ hash32(salt)), the definition in ARCHITECTURE §5.1, on the vendored functions', () => {
    for (const seed of seeds) {
      for (const salt of salts) expect(draws(rngFor(seed, salt), 32)).toEqual(draws(vendoredSplitmix32u(seed ^ vendoredHash32(salt)), 32))
    }
    // The re-exports are the vendored functions themselves, not copies.
    expect(splitmix32u).toBe(vendoredSplitmix32u)
    expect(hash32).toBe(vendoredHash32)
  })

  test('the first draws of four streams are pinned [measured 2026-11-04 from the BigInt reference, bun 1.3.14]', () => {
    const pinned: [number, string, string[]][] = [
      [0, '', ['0xe8835c7d', '0x7c4c2f21', '0x6e1e4461']],
      [1, 'workload/arrivals', ['0xc082448d', '0x495209cc', '0xab69b45b']],
      [0xffffffff, 'kv', ['0xa177624a', '0xf7658507', '0xd441ff89']],
      [42, 'workload/prompt', ['0xa9a7bbce', '0x0799f799', '0x4eb70b71']],
    ]
    for (const [seed, salt, expected] of pinned) expect(draws(rngFor(seed, salt), 3).map(hex)).toEqual(expected)
  })

  test('replays for the same seed and salt, and differs for another seed or salt', () => {
    expect(draws(rngFor(7, 'a'), 50)).toEqual(draws(rngFor(7, 'a'), 50))
    expect(draws(rngFor(7, 'a'), 50)).not.toEqual(draws(rngFor(8, 'a'), 50))
    expect(draws(rngFor(7, 'a'), 50)).not.toEqual(draws(rngFor(7, 'b'), 50))
  })

  test('rejects a seed that is not an unsigned 32-bit integer, since it would alias another seed', () => {
    for (const bad of [-1, 2 ** 32, 2 ** 32 + 5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => rngFor(bad, 'a')).toThrow(RangeError)
      expect(() => assertSeed(bad)).toThrow(RangeError)
    }
    expect(() => assertSeed(0)).not.toThrow()
    expect(() => assertSeed(0xffffffff)).not.toThrow()
  })

  test('rejects a salt that is not ASCII, where FNV-1a over UTF-16 code units would stop being the byte-wise hash', () => {
    expect(() => rngFor(1, 'é')).toThrow(RangeError)
    expect(() => rngFor(1, 'a→b')).toThrow(RangeError)
    expect(() => rngFor(1, '\u0080')).toThrow(RangeError)
    expect(() => rngFor(1, '\u007f')).not.toThrow()
  })
})

describe('below(n): unbiased by rejection', () => {
  // Upper and lower critical values of chi-square at alpha = 1e-3 in each tail, by degrees of freedom [derived, see the header].
  const CRITICAL: Record<number, { low: number; high: number }> = {
    2: { low: 0.002, high: 13.8155 },
    6: { low: 0.3811, high: 22.4577 },
    999: { low: 866.5482, high: 1142.848 },
  }

  function chiSquare(n: number, count: number, rng: Rng): number {
    const seen = new Array<number>(n).fill(0)
    for (let i = 0; i < count; i++) seen[below(rng, n)]++
    const expected = count / n
    return seen.reduce((total, c) => total + ((c - expected) * (c - expected)) / expected, 0)
  }

  for (const n of [3, 7, 1000]) {
    test(`n = ${n}: chi-square over 1e5 draws is inside both tails at 1e-3, for four seeds`, () => {
      const { low, high } = CRITICAL[n - 1]
      for (const seed of [1, 2, 3, 0xdeadbeef]) {
        const statistic = chiSquare(n, 100_000, rngFor(seed, `below/${n}`))
        expect(statistic).toBeGreaterThan(low)
        expect(statistic).toBeLessThan(high)
      }
    })
  }

  test('the chi-square test can fail: a stream that always draws the same residue is far outside the upper tail', () => {
    const stuck = (() => 5) as Rng
    // below(7) against an all-5 stream: 5 mod 7, every time.
    expect(chiSquare(7, 7_000, stuck)).toBeGreaterThan(CRITICAL[6].high)
  })

  test('a draw at the limit is rejected and the next one used: n = 3 has limit 2^32 - 1', () => {
    const rng = scripted([0xffffffff, 0xfffffffe])
    expect(below(rng, 3)).toBe(0xfffffffe % 3)
    expect(rng.used()).toBe(2)
    const accepted = scripted([0xfffffffe])
    expect(below(accepted, 3)).toBe(2)
    expect(accepted.used()).toBe(1)
  })

  test('n = 1000 has limit 4,294,967,000: 4,294,966,999 is taken (residue 999), 4,294,967,000 and above are redrawn', () => {
    expect(2 ** 32 % 1000).toBe(296)
    const taken = scripted([4294966999])
    expect(below(taken, 1000)).toBe(999)
    expect(taken.used()).toBe(1)
    const redrawn = scripted([4294967000, 0xffffffff, 4294967295, 7])
    expect(below(redrawn, 1000)).toBe(7)
    expect(redrawn.used()).toBe(4)
  })

  test('a power of two up to 2^32 never rejects, so it consumes one draw and returns the low bits', () => {
    for (const n of [1, 2, 4, 1024, 2 ** 31, 2 ** 32]) {
      const rng = scripted([0xffffffff])
      expect(below(rng, n)).toBe(0xffffffff % n)
      expect(rng.used()).toBe(1)
    }
  })

  test('above 2^32 each attempt is 53 bits (the top 21 bits of one draw, then a whole draw), rejected against 2^53', () => {
    const n = Number.MAX_SAFE_INTEGER // 2^53 - 1: limit 2^53 - 1, so only the all-ones attempt is redrawn
    const all = scripted([0xffffffff, 0xffffffff, 0, 5])
    expect(below(all, n)).toBe(5)
    expect(all.used()).toBe(4)
    // high = 0xffffffff >>> 11 = 0x1fffff and low = 0xfffffffe make 2^53 - 2, which is below the limit and taken.
    const last = scripted([0xffffffff, 0xfffffffe])
    expect(below(last, n)).toBe(2 ** 53 - 2)
    expect(last.used()).toBe(2)
    // The low 11 bits of the first draw do not matter.
    expect(below(scripted([0x000007ff, 9]), 2 ** 33)).toBe(9)
    expect(below(scripted([0x00000800, 9]), 2 ** 33)).toBe(2 ** 32 + 9)
  })

  test('agrees with an exact BigInt computation of the same rule, for n across every magnitude up to 2^53 - 1', () => {
    const sizes = [1, 2, 3, 5, 7, 10, 100, 1000, 65537, 2 ** 24 + 1, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1, 2 ** 40 + 12345, 3 * 2 ** 51 + 7, 2 ** 52, 2 ** 53 - 2, 2 ** 53 - 1]
    const exact = (raw: Rng, n: number): number => {
      const big = BigInt(n)
      const two32 = 2n ** 32n
      if (big <= two32) {
        const limit = two32 - (two32 % big)
        for (;;) {
          const x = BigInt(raw())
          if (x < limit) return Number(x % big)
        }
      }
      const two53 = 2n ** 53n
      const limit = two53 - (two53 % big)
      for (;;) {
        const high = BigInt(raw()) >> 11n
        const low = BigInt(raw())
        const x = high * two32 + low
        if (x < limit) return Number(x % big)
      }
    }
    for (const n of sizes) {
      const ours = rngFor(11, `exact/${n}`)
      const theirs = rngFor(11, `exact/${n}`)
      for (let i = 0; i < 300; i++) {
        const got = below(ours, n)
        expect(got).toBe(exact(theirs, n))
        expect(got).toBeGreaterThanOrEqual(0)
        expect(got).toBeLessThan(n)
      }
    }
  })

  test('is exact above 2^32 in the sense that matters: the top residues are reachable and stay below n', () => {
    const rng = rngFor(5, 'big')
    const n = 2 ** 40 + 3
    let high = 0
    for (let i = 0; i < 2000; i++) {
      const x = below(rng, n)
      expect(Number.isSafeInteger(x) && x >= 0 && x < n).toBe(true)
      if (x >= n / 2) high++
    }
    expect(high).toBeGreaterThan(900)
    expect(high).toBeLessThan(1100)
  })

  test('throws on n that is not an integer from 1 to 2^53 - 1', () => {
    const rng = rngFor(1, 'x')
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) expect(() => below(rng, bad)).toThrow(RangeError)
  })
})

/** Finds the calls of `Math.floor` or `Math.trunc` whose argument contains a multiplication: the biased range draw. */
function floorOfProduct(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const hasProduct = (node: ts.Node): boolean => (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) || ts.forEachChild(node, hasProduct) === true
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression
      if (ts.isIdentifier(expression) && expression.text === 'Math' && (name.text === 'floor' || name.text === 'trunc') && node.arguments.some(hasProduct)) {
        found.push(`${fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function simSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.ts')) out.push(full)
    }
  }
  walk(path.join(root, 'packages/sim'))
  return out.sort()
}

describe('what packages/sim must not do to a range', () => {
  test('the scan finds Math.floor and Math.trunc of a product, and nothing else', () => {
    expect(floorOfProduct('a.ts', 'const i = Math.floor(rand() * n)')).toHaveLength(1)
    expect(floorOfProduct('a.ts', 'const i = Math.trunc(n * (rand() + 1) / 2)')).toHaveLength(1)
    expect(floorOfProduct('a.ts', 'const i = Math.floor(0.5 + x * 3)')).toHaveLength(1)
    expect(floorOfProduct('a.ts', 'const q = Math.floor(a / b)')).toEqual([])
    expect(floorOfProduct('a.ts', 'const q = Math.round(x * y)')).toEqual([])
    expect(floorOfProduct('a.ts', '// Math.floor(x * n) in a comment\nconst s = "Math.floor(x * n)"')).toEqual([])
  })

  test('no Math.floor(… * n) appears in packages/sim, and the glob finds the sources', () => {
    const files = simSources()
    expect(files.length).toBeGreaterThan(15)
    const found = files.flatMap((file) => floorOfProduct(path.relative(root, file), readFileSync(file, 'utf8')))
    expect(found).toEqual([])
  })

  test('nothing in packages/sim names the float generator or the entropy source of the vendored rng', () => {
    const banned = new Set(['splitmix32', 'shuffledOrder', 'exportOrder', 'freshSeed'])
    const found: string[] = []
    for (const file of simSources()) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && banned.has(node.text)) found.push(`${path.relative(root, file)}: ${node.text}`)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(found).toEqual([])
  })
})

describe('between, chance, pick, weighted and shuffle', () => {
  test('between draws both ends, nothing outside, and a degenerate range', () => {
    const rng = rngFor(3, 'between')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(between(rng, -3, 4))
    expect([...seen].sort(compareAsc)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4])
    expect(between(rng, 9, 9)).toBe(9)
    expect(() => between(rng, 5, 4)).toThrow(RangeError)
    expect(() => between(rng, 0.5, 4)).toThrow(RangeError)
  })

  test('chance is exact at both ends, draws below(1000) whatever the share, and tracks its share in between', () => {
    const rng = scripted([0, 999])
    expect(chance(rng, 0)).toBe(false)
    expect(chance(rng, 1000)).toBe(true)
    expect(rng.used()).toBe(2)
    const stream = rngFor(4, 'chance')
    let hits = 0
    for (let i = 0; i < 20_000; i++) if (chance(stream, 250)) hits++
    expect(Math.abs(hits - 5000)).toBeLessThan(4 * Math.sqrt(20_000 * 0.25 * 0.75))
    expect(() => chance(stream, 1001)).toThrow(RangeError)
    expect(() => chance(stream, -1)).toThrow(RangeError)
    expect(() => chance(stream, 0.5)).toThrow(RangeError)
  })

  test('pick takes every item of a list, and throws on an empty one', () => {
    const rng = rngFor(5, 'pick')
    const items = ['a', 'b', 'c', 'd']
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pick(rng, items))
    expect([...seen].sort()).toEqual(items)
    expect(() => pick(rng, [])).toThrow(RangeError)
  })

  test('weighted follows its weights, never takes a weight of 0, and checks its domain', () => {
    const rng = rngFor(6, 'weighted')
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < 40_000; i++) counts[weighted(rng, [1, 0, 3, 6])]++
    expect(counts[1]).toBe(0)
    for (const [i, w] of [[0, 1], [2, 3], [3, 6]]) expect(Math.abs(counts[i] - (4000 * w))).toBeLessThan(4 * Math.sqrt(40_000 * (w / 10) * (1 - w / 10)))
    // The walk: r = 0 takes the first non-zero weight, r = total - 1 the last.
    expect(weighted(scripted([0]), [0, 2, 3])).toBe(1)
    expect(weighted(scripted([1]), [0, 2, 3])).toBe(1)
    expect(weighted(scripted([2]), [0, 2, 3])).toBe(2)
    expect(weighted(scripted([4]), [0, 2, 3])).toBe(2)
    for (const bad of [[], [0, 0], [-1, 2], [1.5], [2 ** 53, 1]]) expect(() => weighted(rng, bad)).toThrow(RangeError)
  })

  test('shuffle is a permutation, leaves its input alone, replays, and reaches every order of 3 items', () => {
    const rng = rngFor(7, 'shuffle')
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const once = shuffle(rng, input)
    expect([...once].sort(compareAsc)).toEqual(input)
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(shuffle(rngFor(7, 'shuffle'), input)).toEqual(once)
    const orders = new Set<string>()
    for (let i = 0; i < 500; i++) orders.add(shuffle(rng, ['x', 'y', 'z']).join(''))
    expect(orders.size).toBe(6)
    expect(shuffle(rng, [])).toEqual([])
  })
})

describe('exact integer division', () => {
  const MAX = Number.MAX_SAFE_INTEGER

  test('floor, ceiling and round agree with BigInt over many pairs, including the largest', () => {
    const rng = rngFor(8, 'div')
    const operands = [0, 1, 2, 3, 7, 999, 1000, 65536, 2 ** 31, 2 ** 32 - 1, 2 ** 40 + 1, 2 ** 52 + 1, MAX - 1, MAX]
    const pairs: [number, number][] = []
    for (const a of operands) for (const b of operands) if (b >= 1) pairs.push([a, b])
    for (let i = 0; i < 2000; i++) pairs.push([below(rng, MAX), 1 + below(rng, i % 2 === 0 ? 1000 : MAX - 1)])
    for (const [a, b] of pairs) {
      const bigA = BigInt(a)
      const bigB = BigInt(b)
      const floor = bigA / bigB
      const remainder = bigA % bigB
      expect(divFloor(a, b)).toBe(Number(floor))
      expect(divCeil(a, b)).toBe(Number(remainder === 0n ? floor : floor + 1n))
      expect(divRound(a, b)).toBe(Number(2n * remainder >= bigB ? floor + 1n : floor))
    }
  })

  test('rounds halves up, and is the identity on multiples', () => {
    expect([divRound(1, 2), divRound(3, 2), divRound(5, 2), divRound(0, 7), divRound(7, 7), divRound(1, 3), divRound(2, 3)]).toEqual([1, 2, 3, 0, 1, 0, 1])
    expect(divRound(MAX, 2)).toBe(4503599627370496)
    expect([divCeil(6, 3), divCeil(7, 3), divFloor(7, 3), divFloor(0, 5)]).toEqual([2, 3, 2, 0])
    expect(permille(1, 3)).toBe(333)
    expect(permille(2, 3)).toBe(667)
    expect(permille(1, 2000)).toBe(1) // a half rounds up
  })

  test('throws outside its domain: a negative or fractional dividend, a divisor below 1, an operand beyond 2^53', () => {
    for (const [a, b] of [[-1, 2], [1.5, 2], [1, 0], [1, -2], [1, 0.5], [2 ** 53, 1], [1, 2 ** 53], [Number.NaN, 1]]) {
      expect(() => divFloor(a, b)).toThrow(RangeError)
      expect(() => divCeil(a, b)).toThrow(RangeError)
      expect(() => divRound(a, b)).toThrow(RangeError)
    }
  })
})

describe('integer statistics', () => {
  test('nearest rank: the textbook examples (rank = ceil(p · n / 100))', () => {
    const five = [15, 20, 35, 40, 50]
    expect([50, 300, 400, 500, 1000].map((p) => nearestRank(five, p))).toEqual([15, 20, 20, 35, 50])
    const eleven = [3, 6, 7, 8, 8, 9, 10, 13, 15, 16, 20]
    expect([250, 500, 750].map((p) => nearestRank(eleven, p))).toEqual([7, 9, 15])
  })

  test('p = 0 is the smallest value, p = 1000 the largest, and the 99th percentile of 50 values is the largest', () => {
    const xs = Array.from({ length: 50 }, (_, i) => i + 1)
    expect([nearestRank(xs, 0), nearestRank(xs, 1000), nearestRank(xs, 990)]).toEqual([1, 50, 50])
    expect(nearestRank(Array.from({ length: 100 }, (_, i) => i + 1), 990)).toBe(99)
  })

  test('percentile sorts a copy: the caller\'s list is left alone, and ties and negatives are fine', () => {
    const xs = [5, -1, 4, 4, 2, 9]
    expect(percentile(xs, 500)).toBe(4)
    expect(xs).toEqual([5, -1, 4, 4, 2, 9])
    expect(sortedAsc([10, 9, 100, 1])).toEqual([1, 9, 10, 100])
  })

  test('rejects an empty sample and a percentile outside 0 to 1000', () => {
    expect(() => nearestRank([], 500)).toThrow(RangeError)
    expect(() => percentile([], 500)).toThrow(RangeError)
    for (const bad of [-1, 1001, 0.5, Number.NaN]) expect(() => nearestRank([1, 2], bad)).toThrow(RangeError)
  })

  test('sum is exact and stops at 2^53; mean rounds halves up', () => {
    expect(sum([])).toBe(0)
    expect(sum([1, 2, 3, -4])).toBe(2)
    expect(sum([Number.MAX_SAFE_INTEGER, 0])).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError)
    expect(() => sum([-Number.MAX_SAFE_INTEGER, -1])).toThrow(RangeError)
    expect(() => sum([1.5])).toThrow(RangeError)
    expect(mean([1, 2])).toBe(2)
    expect(mean([1, 1, 2])).toBe(1)
    expect(mean([7])).toBe(7)
    expect(() => mean([])).toThrow(RangeError)
  })
})

describe('canonicalJson', () => {
  test('sorts keys at every depth, keeps array order, and writes no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 2, 1], c: null }, 10: 'x', 2: 'y' })).toBe('{"10":"x","2":"y","a":{"c":null,"d":[3,2,1]},"b":1}')
    expect(canonicalJson({ z: [{ y: 1, x: 2 }] })).toBe('{"z":[{"x":2,"y":1}]}')
    expect(canonicalJson({})).toBe('{}')
    expect(canonicalJson([])).toBe('[]')
  })

  test('does not depend on the order the keys were inserted in', () => {
    const forward = { a: 1, b: 2, c: { d: 4, e: 5 } }
    const backward = { c: { e: 5, d: 4 }, b: 2, a: 1 }
    expect(canonicalJson(forward)).toBe(canonicalJson(backward))
  })

  test('orders keys by UTF-16 code unit, as RFC 8785 does: U+1F600 (a surrogate pair) sorts before U+FFFF', () => {
    expect(canonicalJson({ '￿': 1, '😀': 2, a: 3 })).toBe('{"a":3,"😀":2,"￿":1}')
    expect(canonicalJson({ b: 1, B: 2, '': 3 })).toBe('{"":3,"B":2,"b":1}')
  })

  test('writes integers as integers and floats as ECMAScript prints them', () => {
    expect(canonicalJson([0, -0, 1, -1, 1.5, 0.1, 1e-7, 123456789012, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])).toBe(
      '[0,0,1,-1,1.5,0.1,1e-7,123456789012,9007199254740991,-9007199254740991]',
    )
    expect(canonicalJson(0.1 + 0.2)).toBe('0.30000000000000004')
    expect(canonicalJson(5e-324)).toBe('5e-324')
    expect(canonicalJson(1 / 3)).toBe('0.3333333333333333')
    expect(canonicalJson(4294967295)).toBe('4294967295')
  })

  test('escapes strings as JSON.stringify does: the short forms, u+00xx in lower case for other controls, and the rest as it is', () => {
    expect(canonicalJson('a"b\\c\n\t\u0001é😀')).toBe('"a\\"b\\\\c\\n\\t\\u0001é😀"')
    expect(canonicalJson('\b\f\r\u001f\u007f')).toBe('"\\b\\f\\r\\u001f\u007f"')
    expect(canonicalJson('  ')).toBe('"  "')
    expect(canonicalJson({ 'k"ey': 1 })).toBe('{"k\\"ey":1}')
    expect(canonicalJson('😀')).toBe('"😀"')
  })

  test('refuses a lone surrogate in a string or a key, where it would have no UTF-8 form, and accepts a pair', () => {
    for (const lone of ['\ud800', '\udc00', 'a\ud83d', '\ude00b', '\ud83d\ud83d', '\ude00\ud83d']) {
      expect(() => canonicalJson(lone), JSON.stringify(lone)).toThrow(/lone surrogate/)
      expect(() => canonicalJson({ [lone]: 1 })).toThrow(/lone surrogate/)
      expect(() => canonicalJson([{ k: lone }])).toThrow(/\$\[0\]\.k/)
    }
    expect(canonicalJson('😀😀')).toBe('"😀😀"')
  })

  test('accepts null-prototype objects, true and false', () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { b: true, a: false })
    expect(canonicalJson(bare)).toBe('{"a":false,"b":true}')
  })

  test('equals JSON.stringify on data whose keys are already sorted', () => {
    const rng = rngFor(9, 'json')
    for (let i = 0; i < 100; i++) {
      const value = { a: below(rng, 1000), b: [below(rng, 5), 'x'.repeat(below(rng, 4)), null], c: { d: below(rng, 2) === 0, e: below(rng, 1_000_000) / 1000 } }
      expect(canonicalJson(value)).toBe(JSON.stringify(value))
    }
  })

  test('throws, naming the path, on everything that has no JSON form', () => {
    const holey: unknown[] = [1, 2, 3]
    delete holey[1]
    const cycle: Record<string, unknown> = { a: 1 }
    cycle.self = { back: cycle }
    const cases: [string, unknown, RegExp][] = [
      ['NaN', { a: [Number.NaN] }, /\$\.a\[0\]/],
      ['Infinity', { a: Number.POSITIVE_INFINITY }, /\$\.a/],
      ['an integer beyond 2^53', 2 ** 53, /beyond 2\^53/],
      ['a large float that is an integer', 1e21, /beyond 2\^53/],
      ['undefined as a member', { a: 1, b: undefined }, /\$\.b/],
      ['undefined in an array', [1, undefined], /\$\[1\]/],
      ['a function', { f: () => 1 }, /\$\.f/],
      ['a symbol', Symbol('s'), /symbol/],
      ['a bigint', 10n, /bigint/],
      ['a Map', new Map(), /plain objects/],
      ['a Set', { s: new Set() }, /\$\.s/],
      ['a Date', new Date(0), /plain objects/],
      ['a typed array', new Uint8Array(2), /plain objects/],
      ['a class instance', new (class Point { x = 1 })(), /plain objects/],
      ['a hole in an array', holey, /hole/],
      ['a cycle', cycle, /cyclic/],
    ]
    for (const [name, value, message] of cases) {
      expect(() => canonicalJson(value), name).toThrow(message)
    }
  })

  test('a shared object that is not a cycle is fine', () => {
    const shared = { x: 1 }
    expect(canonicalJson({ a: shared, b: [shared, shared] })).toBe('{"a":{"x":1},"b":[{"x":1},{"x":1}]}')
  })
})

describe('the exponential-delay table', () => {
  test('is 1,024 entries of scale 65,536, strictly increasing, and adds up to exactly 1,024 · 65,536: its mean is exactly 1', () => {
    expect([EXP_BINS, EXP_SCALE, EXP_QUANTILES.length]).toEqual([1024, 65536, 1024])
    expect(sum(EXP_QUANTILES)).toBe(EXP_BINS * EXP_SCALE)
    for (let k = 1; k < EXP_BINS; k++) expect(EXP_QUANTILES[k]).toBeGreaterThan(EXP_QUANTILES[k - 1])
    expect(EXP_QUANTILES.every((x) => Number.isInteger(x) && x > 0)).toBe(true)
  })

  test('its ends are the bin means of the first and last intervals: about 1/2048 and 1 + ln 1024 (this test may use Math.log)', () => {
    expect(Math.abs(EXP_QUANTILES[0] / EXP_SCALE - 1 / 2048)).toBeLessThan(2 / EXP_SCALE)
    expect(Math.abs(EXP_QUANTILES[EXP_BINS - 1] / EXP_SCALE - (1 + Math.log(EXP_BINS)))).toBeLessThan(1 / EXP_SCALE)
  })

  test('follows the exponential: tail fractions within one bin of e^-t, and a second moment just under 2', () => {
    for (const t of [0.25, 0.5, 1, 2, 3, 5]) {
      const tail = EXP_QUANTILES.filter((x) => x / EXP_SCALE > t).length / EXP_BINS
      expect(Math.abs(tail - Math.exp(-t))).toBeLessThan(1.5 / EXP_BINS)
    }
    const second = EXP_QUANTILES.reduce((total, x) => total + (x / EXP_SCALE) ** 2, 0) / EXP_BINS
    // 2 minus the variance inside the bins: 1/1024 of it is the last bin's tail, which is all of the unit variance.
    expect(second).toBeGreaterThan(1.99)
    expect(second).toBeLessThan(2)
  })

  test('expDelayUs with a mean of 65,536 returns the table entry itself: a bin drawn by below(1024)', () => {
    const a = rngFor(1, 'exp')
    const b = rngFor(1, 'exp')
    for (let i = 0; i < 200; i++) expect(expDelayUs(a, EXP_SCALE)).toBe(EXP_QUANTILES[below(b, EXP_BINS)])
  })

  test('rounds a half up, and scales exactly by a fraction: bin 0 is 32 units, so 32 · 196,608 / (65,536 · 64) = 1.5 rounds to 2', () => {
    expect(expDelayUs(scripted([0]), 196608, 64)).toBe(2)
    expect(expDelayUs(scripted([0]), 196607, 64)).toBe(1)
    expect(expDelayUs(scripted([1023]), 0)).toBe(0)
    expect(() => expDelayUs(scripted([0]), 1, 0)).toThrow(RangeError)
    expect(() => expDelayUs(scripted([0]), -1)).toThrow(RangeError)
  })

  test('has the requested mean: 1e5 delays of mean 1,000,000 µs and of rate 8 a second are within four standard errors', () => {
    const n = 100_000
    const slack = (mean: number) => (4 * mean) / Math.sqrt(n)
    const rng = rngFor(2, 'exp/mean')
    let total = 0
    for (let i = 0; i < n; i++) total += expDelayUs(rng, 1_000_000)
    expect(Math.abs(total / n - 1_000_000)).toBeLessThan(slack(1_000_000))
    let gaps = 0
    for (let i = 0; i < n; i++) gaps += expDelayUs(rng, 1_000_000_000, 8000)
    expect(Math.abs(gaps / n - 125_000)).toBeLessThan(slack(125_000))
  })

  test('is memoryless in the large: the share of delays above the mean is within 1.5 bins of e^-1', () => {
    const rng = rngFor(3, 'exp/tail')
    let above = 0
    const n = 100_000
    for (let i = 0; i < n; i++) if (expDelayUs(rng, 1_000_000) > 1_000_000) above++
    expect(Math.abs(above / n - Math.exp(-1))).toBeLessThan(4 * Math.sqrt((Math.exp(-1) * (1 - Math.exp(-1))) / n) + 1 / EXP_BINS)
  })
})
