/*
 * schemas/vectors/rng.json and subseed.json (ARCHITECTURE §9.8): the seeded generator that the grader ports, as vectors.
 *
 * rng.json holds the stream itself and the functions drawn from it, and subseed.json the sub-stream of a seed and a salt. Each function
 * of packages/sim/core/rng.ts that a workload generator calls is here, with how many draws of the stream it used, because a port that
 * draws a different number of times gives the right answer for one call and the wrong one for the next. The cases that decide a port are
 * the ones at the edge of a rejection (`below`'s limit is crossed by one draw or not) and the ones past 2^32, which draw twice. A seed
 * for such a case is made by running the generator's mixer backwards, `seedForFirstDraw`, so that the first draw is exactly the value
 * at the edge.
 */
import { createHash } from 'node:crypto'
import { splitmix32 } from '../../vendor/kernelspace/src/lib/rng.ts'
import { below, between, chance, hash32, pick, rngFor, shuffle, splitmix32u, weighted } from '../../packages/sim/core/rng.ts'
import type { Rng } from '../../packages/sim/core/rng.ts'
import type { Vector, VectorFile } from './format.ts'

const TWO_32 = 4294967296

/** A seed as an id spells it: small ones in decimal, the rest as the 8 hex digits of the token that would carry them. */
const seedId = (seed: number): string => (seed < 0x10000 ? String(seed) : `0x${seed.toString(16).padStart(8, '0')}`)

const SOURCE = 'scripts/schemas/rng-vectors.ts; bun scripts/export-schemas.ts writes it'

/** The stream of a seed, and how many draws have been taken from it. */
function counted(seed: number): { rng: Rng; used: () => number } {
  const next = splitmix32u(seed)
  let taken = 0
  return {
    rng: () => {
      taken += 1
      return next()
    },
    used: () => taken,
  }
}

/** Runs `body` and says whether it threw. A vector that expects an error must get one, and one that does not must not. */
function throws(body: () => unknown): boolean {
  try {
    body()
    return false
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) return true
    throw error
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making a seed whose first draw is a given value                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const GOLDEN = 0x9e3779b9n
const MASK = 0xffffffffn
const MUL1 = 0x21f0aaadn
const MUL2 = 0x735a2d97n

/** The inverse of an odd number modulo 2^32, by Newton's iteration. */
function inverse(a: bigint): bigint {
  let x = a
  for (let i = 0; i < 5; i += 1) x = (x * (2n - a * x)) & MASK
  return x
}

/** Undoes `t ^= t >>> shift` on 32 bits. */
function unshift(y: bigint, shift: bigint): bigint {
  let t = y
  for (let done = shift; done < 32n; done += shift) t = y ^ (t >> shift)
  return t & MASK
}

/**
 * The seed whose first draw of `splitmix32u` is `draw`. The generator adds the golden-ratio constant to its state and then mixes the state
 * with two multiplications and three xor-shifts, every step of which can be undone, so a draw can be traced back to the state before it.
 */
export function seedForFirstDraw(draw: number): number {
  let t = BigInt(draw)
  t = unshift(t, 15n)
  t = (t * inverse(MUL2)) & MASK
  t = unshift(t, 15n)
  t = (t * inverse(MUL1)) & MASK
  t = unshift(t, 16n)
  const seed = Number((t - GOLDEN) & MASK)
  if (splitmix32u(seed)() !== draw) throw new Error(`seedForFirstDraw(${draw}) gave ${seed}, whose first draw is ${splitmix32u(seed)()}`)
  return seed
}

/** The IEEE-754 bits of a double as 16 hex digits, most significant first. */
export function doubleBits(value: number): string {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* rng.json                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const STREAM_SEEDS = [0, 1, 2, 42, 0x12345678, 0x7fffffff, 0x80000000, 0x9e3779b9, 0xdeadbeef, 0xfffffffe, 0xffffffff]
const DRAWS = 16

function streamVectors(): Vector[] {
  const out: Vector[] = []
  for (const seed of STREAM_SEEDS) {
    const next = splitmix32u(seed)
    const draws = Array.from({ length: DRAWS }, () => next())
    out.push({ id: `splitmix32u-seed-${seedId(seed)}`, fn: 'splitmix32u', seed, draws })
  }
  for (const seed of [0, 1, 0xffffffff]) {
    const next = splitmix32(seed)
    const values = Array.from({ length: 8 }, () => next())
    out.push({
      id: `splitmix32-seed-${seedId(seed)}`,
      note: 'the float stream: each value is the draw of splitmix32u divided by 2^32, which is exact in a double, with the 16 hex digits of its IEEE-754 bits',
      fn: 'splitmix32',
      seed,
      values,
      bits: values.map(doubleBits),
    })
  }
  for (const [seed, count] of [[0, 100000], [0xffffffff, 100000], [12345, 100000]] as const) {
    const next = splitmix32u(seed)
    const bytes = Buffer.alloc(count * 4)
    for (let i = 0; i < count; i += 1) bytes.writeUInt32LE(next(), i * 4)
    out.push({
      id: `splitmix32u-digest-seed-${seedId(seed)}`,
      note: 'a long run: the SHA-256 of the first draws written as unsigned 32-bit little-endian words, one after another',
      fn: 'splitmix32u-digest',
      seed,
      count,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  return out
}

/** The largest value `below(n)` accepts from one draw plus one, for n up to 2^32: draws at or above it are redrawn. */
const limitOf = (n: number): number => TWO_32 - (TWO_32 % n)

interface Drawn {
  readonly results: unknown[]
  readonly consumed: number
}

/** `count` calls of `call` on the stream of `seed`, and the number of draws they took. */
function drawn(seed: number, count: number, call: (rng: Rng) => unknown): Drawn {
  const { rng, used } = counted(seed)
  const results = Array.from({ length: count }, () => call(rng))
  return { results, consumed: used() }
}

const BELOW_N = [1, 2, 3, 6, 7, 10, 100, 1000, 65535, 65536, 65537, 2 ** 31 - 1, 2 ** 31, 2 ** 31 + 1, 3 * 2 ** 30, 2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1, 3 * 2 ** 51, 2 ** 53 - 1]

function belowVectors(): Vector[] {
  const out: Vector[] = []
  for (const n of BELOW_N) {
    for (const seed of [0, 0xffffffff]) {
      out.push({ id: `below-n-${n}-seed-${seedId(seed)}`, fn: 'below', seed, n, count: 8, ...drawn(seed, 8, (rng) => below(rng, n)) })
    }
  }
  // The edge of a rejection. For n up to 2^32 a draw below the limit is taken, and one at the limit or above is thrown back.
  const edges: [number, string][] = [[3, 'n = 3'], [10, 'n = 10'], [1000, 'n = 1000'], [3 * 2 ** 30, 'n = 3 * 2^30'], [2 ** 32 - 1, 'n = 2^32 - 1']]
  for (const [n, name] of edges) {
    const limit = limitOf(n)
    const taken = seedForFirstDraw(limit - 1)
    const thrown = seedForFirstDraw(limit)
    out.push({
      id: `below-n-${n}-last-draw-taken`,
      note: `${name}: the first draw is ${limit - 1}, the largest that is taken (the limit is ${limit}), so one draw is used`,
      fn: 'below',
      seed: taken,
      n,
      count: 1,
      ...drawn(taken, 1, (rng) => below(rng, n)),
    })
    out.push({
      id: `below-n-${n}-first-draw-thrown-back`,
      note: `${name}: the first draw is ${limit}, the smallest that is thrown back, so the answer comes from a later draw`,
      fn: 'below',
      seed: thrown,
      n,
      count: 1,
      ...drawn(thrown, 1, (rng) => below(rng, n)),
    })
  }
  out.push({
    id: 'below-n-2147483648-largest-draw',
    note: 'n = 2^31 divides 2^32, so nothing is thrown back: the largest draw, 4294967295, is taken and gives 2147483647',
    fn: 'below',
    seed: seedForFirstDraw(0xffffffff),
    n: 2 ** 31,
    count: 1,
    ...drawn(seedForFirstDraw(0xffffffff), 1, (rng) => below(rng, 2 ** 31)),
  })
  // Past 2^32 an attempt takes two draws: the top 21 bits of the first, then all 32 bits of the second, as one 53-bit number x. For
  // n = 3 * 2^51 the limit is 3 * 2^51, so x is taken exactly when the top 21 bits of the first draw are below 3 * 2^19, whatever the second is.
  const bigN = 3 * 2 ** 51
  for (const [id, first, note] of [
    ['taken', 0xbfffffff, 'the first draw is 3221225471 (top 21 bits 1572863, one below 3 * 2^19), so the attempt is taken whatever the second draw is: two draws are used'],
    ['thrown-back', 0xc0000000, 'the first draw is 3221225472 (top 21 bits 1572864 = 3 * 2^19), so the attempt is thrown back whatever the second draw is: the answer comes from the next two draws or later'],
  ] as const) {
    const seed = seedForFirstDraw(first)
    out.push({ id: `below-n-${bigN}-first-attempt-${id}`, note: `n = 3 * 2^51: ${note}`, fn: 'below', seed, n: bigN, count: 1, ...drawn(seed, 1, (rng) => below(rng, bigN)) })
  }
  for (const n of [0, -1, 2 ** 53]) {
    if (!throws(() => below(splitmix32u(0), n))) throw new Error(`below(${n}) did not throw`)
    out.push({ id: `below-n-${n}-is-refused`, note: 'n has to be a whole number from 1 to 2^53 - 1', fn: 'below', seed: 0, n, error: true })
  }
  out.push({ id: 'below-n-1.5-is-refused', note: 'n has to be a whole number', fn: 'below', seed: 0, n: 1.5, error: true })
  if (!throws(() => below(splitmix32u(0), 1.5))) throw new Error('below(1.5) did not throw')
  return out
}

function betweenVectors(): Vector[] {
  const out: Vector[] = []
  const ranges: [number, number][] = [[0, 9], [1, 6], [-5, 5], [-1000000, 1000000], [5, 5], [0, 2 ** 32 - 1], [0, 2 ** 32], [-(2 ** 40), 2 ** 40]]
  for (const [lo, hi] of ranges) {
    for (const seed of [0, 0xffffffff]) {
      out.push({ id: `between-${lo}-${hi}-seed-${seedId(seed)}`, fn: 'between', seed, lo, hi, count: 8, ...drawn(seed, 8, (rng) => between(rng, lo, hi)) })
    }
  }
  const refused: [string, number, number][] = [['lo-above-hi', 3, 2], ['lo-not-whole', 1.5, 3], ['span-beyond-2^53', -(2 ** 53) + 1, 2 ** 53 - 1]]
  for (const [id, lo, hi] of refused) {
    if (!throws(() => between(splitmix32u(0), lo, hi))) throw new Error(`between(${lo}, ${hi}) did not throw`)
    out.push({ id: `between-refused-${id}`, note: 'lo and hi have to be whole numbers with lo at most hi, and the span hi - lo + 1 at most 2^53 - 1', fn: 'between', seed: 0, lo, hi, error: true })
  }
  return out
}

function chanceVectors(): Vector[] {
  const out: Vector[] = []
  for (const permille of [0, 1, 250, 500, 999, 1000]) {
    for (const seed of [0, 0xffffffff]) {
      out.push({
        id: `chance-${permille}-seed-${seedId(seed)}`,
        note: permille === 0 || permille === 1000 ? 'a share of 0 or 1000 is never or always true, and still draws once a call, so later draws stay where they were' : undefined,
        fn: 'chance',
        seed,
        permille,
        count: 12,
        ...drawn(seed, 12, (rng) => chance(rng, permille)),
      })
    }
  }
  for (const permille of [-1, 1001, 1.5]) {
    if (!throws(() => chance(splitmix32u(0), permille))) throw new Error(`chance(${permille}) did not throw`)
    out.push({ id: `chance-refused-${permille}`, note: 'a share is a whole number from 0 to 1000', fn: 'chance', seed: 0, permille, error: true })
  }
  return out.map(dropUndefined)
}

function pickVectors(): Vector[] {
  const out: Vector[] = []
  const lists: [string, unknown[]][] = [['one', ['only']], ['digits', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]], ['words', ['alpha', 'beta', 'gamma', 'delta', 'epsilon']]]
  for (const [name, items] of lists) {
    for (const seed of [0, 0xffffffff]) {
      out.push({ id: `pick-${name}-seed-${seedId(seed)}`, fn: 'pick', seed, items, count: 8, ...drawn(seed, 8, (rng) => pick(rng, items)) })
    }
  }
  if (!throws(() => pick(splitmix32u(0), []))) throw new Error('pick([]) did not throw')
  out.push({ id: 'pick-empty-is-refused', note: 'there is nothing to pick from', fn: 'pick', seed: 0, items: [], error: true })
  return out
}

function weightedVectors(): Vector[] {
  const out: Vector[] = []
  const lists: [string, number[]][] = [
    ['one', [1]],
    ['even', [1, 1]],
    ['with-zeros', [3, 1, 0, 6]],
    ['only-the-last', [0, 0, 5]],
    ['ascending', [1, 2, 3, 4, 5, 6]],
    ['large', [1000000007, 1]],
    ['total-2^53-1', [2 ** 52, 2 ** 52 - 1]],
  ]
  for (const [name, weights] of lists) {
    for (const seed of [0, 0xffffffff]) {
      out.push({ id: `weighted-${name}-seed-${seedId(seed)}`, fn: 'weighted', seed, weights, count: 12, ...drawn(seed, 12, (rng) => weighted(rng, weights)) })
    }
  }
  const refused: [string, number[]][] = [['none', []], ['all-zero', [0, 0]], ['negative', [-1, 2]], ['not-whole', [1.5, 1]], ['total-2^53', [2 ** 53 - 1, 1]]]
  for (const [name, weights] of refused) {
    if (!throws(() => weighted(splitmix32u(0), weights))) throw new Error(`weighted(${name}) did not throw`)
    out.push({
      id: `weighted-refused-${name}`,
      note: 'weights are whole numbers from 0 up with a positive total of at most 2^53 - 1',
      fn: 'weighted',
      seed: 0,
      weights,
      error: true,
    })
  }
  return out
}

function shuffleVectors(): Vector[] {
  const out: Vector[] = []
  const range = (length: number): number[] => Array.from({ length }, (_, i) => i)
  for (const length of [0, 1, 2, 5, 10, 52]) {
    for (const seed of [0, 0xffffffff]) {
      const items = range(length)
      out.push({
        id: `shuffle-${length}-seed-${seedId(seed)}`,
        note: length < 2 ? 'a list of fewer than two items draws nothing' : 'three shuffles in a row on one stream: for i from n - 1 down to 1, swap item i with item below(i + 1)',
        fn: 'shuffle',
        seed,
        items,
        count: 3,
        ...drawn(seed, 3, (rng) => shuffle(rng, items)),
      })
    }
  }
  return out
}

function dropUndefined(vector: Vector): Vector {
  return Object.fromEntries(Object.entries(vector).filter(([, value]) => value !== undefined)) as Vector
}

export function rngFile(): VectorFile {
  return {
    spec: 'enginespace/vectors-rng@1',
    description:
      'The seeded generator of packages/sim/core/rng.ts (kernelspace\'s splitmix32 and the functions drawn from it), which the grader ports: the stream, and below, between, chance, pick, weighted and shuffle with the number of draws each takes (ARCHITECTURE section 5.1 and 9.8).',
    reading: [
      'Every vector has an id, an fn that names the function, and the fields of that function. A vector with "error": true must be refused by the port (a RangeError in TypeScript, an exception in Python); one without it must not be.',
      'A seed is an unsigned 32-bit integer. The stream of a seed is splitmix32u(seed): state = (seed + 0x9e3779b9) mod 2^32 before each draw, then the mixer of kernelspace\'s rng.ts, giving an unsigned 32-bit integer. Python has no int32 to wrap, so take every step modulo 2^32.',
      'splitmix32u: "draws" are the first draws of the stream. splitmix32 is the float stream: a value is the draw divided by 2^32, and "bits" is its IEEE-754 double as 16 hex digits, which the reader compares as well so that the value is known to be read alike. splitmix32u-digest: "sha256" is of the first "count" draws written as unsigned 32-bit little-endian words.',
      'below, between, chance, pick, weighted and shuffle: take "count" calls in a row on the stream of "seed" (shuffle: "count" shuffles of "items"). "results" are the answers in order, and "consumed" is how many draws of the stream all the calls used together, so a port that draws a different number of times is found even where its answers agree.',
      'below(n) for n up to 2^32: draw x, take x mod n when x is below 2^32 - (2^32 mod n), and draw again otherwise. For larger n, up to 2^53 - 1: each attempt draws twice, high = (first draw) >> 11 and low = the second draw, takes x = high * 2^32 + low, and takes x mod n when x is below 2^53 - (2^53 mod n). Every call draws at least once.',
      'between(lo, hi) is lo + below(hi - lo + 1). chance(permille) is below(1000) < permille and always draws. pick is items[below(len)]. weighted draws r = below(total) and walks the weights, taking the first whose running total passes r. shuffle copies the list and, for i from n - 1 down to 1, swaps item i with item below(i + 1).',
      'A number in a vector is a JSON number that both languages read as the same value. A whole number above 2^31 is still a plain integer.',
    ],
    source: SOURCE,
    oracle: 'packages/sim/core/rng.ts over the vendored vendor/kernelspace/src/lib/rng.ts, with seeds at the edges made by running the mixer backwards (seedForFirstDraw, which checks that the first draw is the one asked for)',
    vectors: [...streamVectors(), ...belowVectors(), ...betweenVectors(), ...chanceVectors(), ...pickVectors(), ...weightedVectors(), ...shuffleVectors()],
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* subseed.json                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const SEED_SALTS: string[] = [
  '',
  'a',
  'workload/arrivals',
  'workload/prompt',
  'workload/output',
  'bench/bootstrap/p990',
  'spec/draft',
  'kv/ops',
  'trace/gpu',
  'items/tr2.bubble-width/async-on/1/answer',
  'x'.repeat(300),
]

function hashVectors(): Vector[] {
  const texts: [string, string][] = [
    ['empty', ''],
    ['a', 'a'],
    ['b', 'b'],
    ['ab', 'ab'],
    ['foobar', 'foobar'],
    ['hello', 'hello'],
    ['fox', 'The quick brown fox jumps over the lazy dog'],
    ['salt', 'workload/arrivals'],
    ['token-body', 'es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104'],
    ['printable-ascii', Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join('')],
    ['control-and-delete', '\u0000\u0001\u001f\u007f'],
    ['long', 'x'.repeat(1000)],
  ]
  return texts.map(([id, text]) => {
    const hash = hash32(text)
    return { id: `hash32-${id}`, fn: 'hash32', text, hash, hex: hash.toString(16).padStart(8, '0') }
  })
}

function subseedVectors(): Vector[] {
  const out: Vector[] = []
  const saltId = (salt: string): string => (salt === '' ? 'empty' : salt.length > 40 ? `${salt.length}-chars` : salt.replaceAll('/', '-'))
  // The edges of the seed range take every salt, and three seeds in between take three of them.
  const plan: [number, string[]][] = [
    [0, SEED_SALTS],
    [1, ['', 'workload/arrivals', 'spec/draft']],
    [0x80000000, ['', 'workload/arrivals', 'spec/draft']],
    [0xdeadbeef, ['', 'workload/arrivals', 'spec/draft']],
    [0xffffffff, SEED_SALTS],
  ]
  for (const [seed, salts] of plan) {
    for (const salt of salts) {
      const next = rngFor(seed, salt)
      out.push({
        id: `rngFor-seed-${seedId(seed)}-salt-${saltId(salt)}`,
        fn: 'rngFor',
        seed,
        salt,
        hash: hash32(salt),
        mixed: (seed ^ hash32(salt)) >>> 0,
        draws: Array.from({ length: 8 }, () => next()),
      })
    }
  }
  const refusedSalts: [string, string][] = [
    ['accented', 'é'],
    ['first-non-ascii', '\u0080'],
    ['cjk', '日本'],
    ['astral', '😀'],
    ['mixed', 'workload/é'],
  ]
  for (const [id, salt] of refusedSalts) {
    if (!throws(() => rngFor(7, salt))) throw new Error(`rngFor(7, ${JSON.stringify(salt)}) did not throw`)
    out.push({ id: `rngFor-salt-${id}-is-refused`, note: 'a salt is ASCII: the hash of a salt is over bytes only where the characters are one byte each', fn: 'rngFor', seed: 7, salt, error: true })
  }
  const refusedSeeds: [string, number][] = [['negative', -1], ['2^32', 2 ** 32], ['fraction', 1.5]]
  for (const [id, seed] of refusedSeeds) {
    if (!throws(() => rngFor(seed, 'a'))) throw new Error(`rngFor(${seed}, 'a') did not throw`)
    out.push({ id: `rngFor-seed-${id}-is-refused`, note: 'a seed is an unsigned 32-bit integer', fn: 'rngFor', seed, salt: 'a', error: true })
  }
  return out
}

export function subseedFile(): VectorFile {
  return {
    spec: 'enginespace/vectors-subseed@1',
    description:
      'hash32 (FNV-1a) and the sub-stream rngFor(seed, salt) = splitmix32u(seed xor hash32(salt)), the way a stage gives each purpose a stream of its own (ARCHITECTURE section 5.1 and 9.8). The challenge token\'s checksum is hash32 of the token\'s text up to its last colon.',
    reading: [
      'hash32: "hash" is the 32-bit FNV-1a of "text" (offset basis 0x811c9dc5, then for each character xor it in and multiply by 0x01000193 modulo 2^32), and "hex" is the same number as 8 lower-case hex digits. The texts here are ASCII, where the hash over UTF-16 code units, which JavaScript takes, is the hash over bytes. Hashing text outside ASCII is not part of this contract.',
      'rngFor: "hash" is hash32(salt), "mixed" is (seed xor hash) as an unsigned 32-bit integer, and "draws" are the first draws of splitmix32u(mixed), which is the stream of rng.json. A salt is ASCII (every character at most U+007F), and a seed is an unsigned 32-bit integer; a vector with "error": true must be refused by the port.',
      'A salt is a string in the vector: a character the JSON file writes as an escape is the character, and a salt of 300 characters is spelled out.',
    ],
    source: SOURCE,
    oracle: 'packages/sim/core/rng.ts over the vendored vendor/kernelspace/src/lib/rng.ts; tests/schema/vectors.test.ts holds the stream and the hashes to a second splitmix32 and a second FNV-1a, written in BigInt',
    vectors: [...hashVectors(), ...subseedVectors()],
  }
}
