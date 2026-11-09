// Seeded randomness (ARCHITECTURE §5.1, D-017).
//
// Every draw in packages/sim comes from kernelspace's splitmix32 (vendor/kernelspace/src/lib/rng.ts, unchanged), as raw
// unsigned 32-bit integers. Two things in that file stay out of reach on purpose:
//   - `splitmix32`, `shuffledOrder` and `exportOrder` turn a draw into a float in [0, 1) and scale it to a range, which is
//     biased for most n: §5.1 draws ranges by rejection instead, in `below`;
//   - `freshSeed` reads entropy. Seeds are drawn on the main thread at grade time and enter from outside (invariant I3).
//
// The Python grader ports exactly what is written here (§9.8), so each function says in words what it consumes.

import { hash32, splitmix32u } from '../../../vendor/kernelspace/src/lib/rng'
import type { Permille, Seed } from './types'

export { hash32, splitmix32u }

/** A stream of unsigned 32-bit integers: one call, one draw. `splitmix32u(seed)` is one. */
export type Rng = () => number

const TWO_32 = 4294967296
const TWO_53 = 9007199254740992

/** Throws unless `seed` is an unsigned 32-bit integer: a larger or negative one would silently alias a smaller seed. */
export function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_32) throw new RangeError(`a seed is an unsigned 32-bit integer, got ${seed}`)
}

/**
 * The sub-stream of `seed` named `salt`: `splitmix32u(seed ^ hash32(salt))` (§5.1). Give each purpose its own salt, such as
 * `workload/arrivals`, so adding a draw to one purpose never moves the draws of another. A salt is ASCII, where `hash32`
 * (FNV-1a over UTF-16 code units) is the ordinary byte-wise FNV-1a that any language computes the same way.
 */
export function rngFor(seed: Seed, salt: string): Rng {
  assertSeed(seed)
  for (let i = 0; i < salt.length; i++) {
    if (salt.charCodeAt(i) > 0x7f) throw new RangeError(`a salt is ASCII, got ${JSON.stringify(salt)}`)
  }
  return splitmix32u(seed ^ hash32(salt))
}

/**
 * An integer in [0, n), without bias, for 1 ≤ n < 2^53 (§5.1: "ranges are drawn without bias by rejection").
 *
 * For n ≤ 2^32 it draws one uint32 x at a time and returns x mod n, redrawing while x ≥ 2^32 − (2^32 mod n), the largest
 * multiple of n that fits, so every residue is equally likely. For larger n each attempt is 53 bits, the top 21 bits of one
 * draw (x >>> 11) times 2^32 plus a second draw, rejected the same way against 2^53. Every `n` consumes at least one draw.
 */
export function below(rng: Rng, n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`below(n) needs an integer from 1 to 2^53 - 1, got ${n}`)
  if (n <= TWO_32) {
    const limit = TWO_32 - (TWO_32 % n)
    for (;;) {
      const x = rng()
      if (x < limit) return x % n
    }
  }
  const limit = TWO_53 - (TWO_53 % n)
  for (;;) {
    const high = rng() >>> 11
    const low = rng()
    const x = high * TWO_32 + low
    if (x < limit) return x % n
  }
}

/** An integer in [lo, hi], both ends included: `lo + below(hi - lo + 1)`. */
export function between(rng: Rng, lo: number, hi: number): number {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi) throw new RangeError(`between(lo, hi) needs integers with lo ≤ hi, got ${lo} and ${hi}`)
  return lo + below(rng, hi - lo + 1)
}

/** True with probability `permille` / 1000. It draws `below(1000)` whatever the share is, so a share of 0 or 1,000 leaves later draws where they were. */
export function chance(rng: Rng, permille: Permille): boolean {
  if (!Number.isInteger(permille) || permille < 0 || permille > 1000) throw new RangeError(`a share is an integer from 0 to 1000 permille, got ${permille}`)
  return below(rng, 1000) < permille
}

/** One item of a non-empty list, uniformly: `items[below(items.length)]`. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick from an empty list')
  return items[below(rng, items.length)]
}

/**
 * An index with probability weights[i] / Σ weights, for non-negative integer weights with a positive total: draw
 * r = below(total), then walk the weights, taking the first i whose running total passes r. A weight of 0 is never chosen.
 */
export function weighted(rng: Rng, weights: readonly number[]): number {
  let total = 0
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`a weight is a non-negative integer, got ${w}`)
    total += w
    if (!Number.isSafeInteger(total)) throw new RangeError('the weights add up beyond 2^53')
  }
  if (total === 0) throw new RangeError('the weights add up to 0, so nothing can be chosen')
  let r = below(rng, total)
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i
    r -= weights[i]
  }
  throw new Error('unreachable: r < total')
}

/** A shuffled copy (Fisher–Yates): for i from n − 1 down to 1, swap item i with item `below(i + 1)`. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(rng, i + 1)
    const held = out[i]
    out[i] = out[j]
    out[j] = held
  }
  return out
}
