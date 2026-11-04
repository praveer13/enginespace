// Distributions over a small vocabulary, as integer weights (ARCHITECTURE §5.5).
//
// A distribution is a list of non-negative integer weights and their total. The course's worlds give p and q a total of 2^16, so
// every probability is a whole number of 1/65,536 and the accept step needs no floating point. `verifyChain` asks only that p and
// q share one total at each position, so a world with a coarser total (64, say) is a valid world too.

import { isUint } from '../core/int'
import { below } from '../core/rng'
import type { Rng } from '../core/rng'

export interface Dist {
  /** One weight per token, from token 0: a non-negative integer. A weight of 0 is a token that is never drawn. */
  readonly weights: readonly number[]
  /** The sum of the weights. 2^16 for p and q in the course's worlds. */
  readonly total: number
}

/** The total of every p and q in the course's worlds (ARCHITECTURE §5.5): 2^16. */
export const DIST_TOTAL = 65_536

const TWO_32 = 4_294_967_296

/** A distribution from its weights, whose `total` is their sum. Throws unless the weights are non-negative integers that add up to 1 to 2^32. */
export function dist(weights: readonly number[]): Dist {
  let total = 0
  for (const w of weights) {
    if (!isUint(w)) throw new RangeError(`a weight is a non-negative integer, got ${w}`)
    total += w
  }
  const d: Dist = { weights: [...weights], total }
  assertDist(d)
  return d
}

/** Throws unless `d` has at least one token, non-negative integer weights, and a total that is their sum, from 1 to 2^32. */
export function assertDist(d: Dist, what = 'a distribution'): void {
  if (d.weights.length === 0) throw new RangeError(`${what} needs at least one token`)
  let sum = 0
  for (const w of d.weights) {
    if (!isUint(w)) throw new RangeError(`${what}: a weight is a non-negative integer, got ${w}`)
    sum += w
  }
  if (sum !== d.total) throw new RangeError(`${what}: the weights add up to ${sum}, not to its total ${d.total}`)
  if (sum < 1 || sum > TWO_32) throw new RangeError(`${what}: the total must be from 1 to 2^32, got ${sum}`)
}

/**
 * The first token whose running total passes `draw`: token i for draw in [Σ weights before i, Σ weights up to i). A token of weight 0
 * has an empty interval and is never returned. With `inclusive`, the comparison is `draw <= running total` instead: each boundary
 * value goes to the token on its left, so the first token gains a value, a zero-weight first token is returned for draw 0, and the
 * last token loses one. That is the boundary bug of SGLang PR #35798 (bestiary.ts).
 */
export function walkCdf(weights: readonly number[], draw: number, inclusive = false): number {
  let running = 0
  for (let i = 0; i < weights.length; i++) {
    running += weights[i]
    if (inclusive ? draw <= running : draw < running) return i
  }
  throw new RangeError(`the draw ${draw} is not below the weights' total ${running}`)
}

/**
 * A token with probability weight / total: one draw `below(total)`, then `walkCdf`. It is `weighted(rng, d.weights)` of `core`
 * without the validation, for the loops that draw a draft token for every round.
 */
export function drawToken(d: Dist, rng: Rng): number {
  return walkCdf(d.weights, below(rng, d.total))
}

/** Σ min(p, q): the weight of the overlap, which is the weight of the draft tokens the verifier accepts (α = this ÷ total). */
export function overlapWeight(p: Dist, q: Dist): number {
  let sum = 0
  for (let i = 0; i < p.weights.length; i++) sum += Math.min(p.weights[i], q.weights[i])
  return sum
}

/**
 * The residual (p − q)⁺: the weight max(0, p − q) of every token, and its total, which is the weight of rejection (the total minus
 * the overlap). The total is 0 when p equals q, and then nothing can be drawn from it.
 */
export function residualDist(p: Dist, q: Dist): Dist {
  let total = 0
  const weights = p.weights.map((w, i) => {
    const excess = Math.max(0, w - q.weights[i])
    total += excess
    return excess
  })
  return { weights, total }
}
