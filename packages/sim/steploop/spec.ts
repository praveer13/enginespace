// The speculative step's arithmetic (WORLD §2.7; A§5.5; TR6): how many drafts a round accepts, and how many tokens a round emits on
// average. The shape of the step, 1 + k tokens for every decode row, is the loop's (./run, claims vllm.scheduler.spec-drafts, vllm.cudagraph.mrv1-query-len).
//
// The model of acceptance is Leviathan, Kalman and Matias's (claim spec.paper.expected-tokens): each of the k drafts of a round is accepted
// with probability α, independently, until the first that is not; the round then emits the accepted drafts and one more token of the
// target's own (the bonus after k accepts, the recovered token after a rejection; claims spec.paper.bonus-token, vllm.spec.bonus-token). So a round emits
// 1 + A tokens, where A is the length of the accepted prefix, and on average
//
//     E = 1 + α + α² + … + α^k = (1 − α^(k+1)) ÷ (1 − α)
//
// The exact accept-and-recover rule, and the test that its output has the target's distribution, are `packages/sim/spec`'s (W1-T26).
// This file only draws the length of the accepted prefix, from the chance α, and it adds the powers by repeated products and never by
// Math.pow, which can differ in the last bit between engines (D-017).

import { chance, divRound } from '../core'
import type { Rng } from '../core'
import type { Permille } from '../core/types'

/**
 * The accepted prefix of a round of `k` drafts: draws `k` chances of `alphaPermille`, one for each draft whatever the others gave, so
 * that a request's later rounds do not move when an earlier one accepts more or fewer, and counts the accepts before the first miss.
 */
export function acceptedDrafts(rng: Rng, k: number, alphaPermille: Permille): number {
  let accepted = 0
  let still = true
  for (let j = 0; j < k; j++) {
    const hit = chance(rng, alphaPermille)
    if (still && hit) accepted++
    else still = false
  }
  return accepted
}

/** Digits kept by the repeated products: powers of α are held as integers out of 10^9. */
const SCALE = 1_000_000_000

/**
 * The tokens a round emits on average, 1 + α + … + α^k, as an integer out of 1,000 (claim spec.paper.expected-tokens). The powers are
 * repeated products on integers out of 10^9, each rounded to nearest, and the sum is rounded once at the end, so the result is within
 * 1/1,000 of a token of the real value for k up to 64.
 */
export function expectedTokensPerRoundMilli(alphaPermille: Permille, k: number): number {
  if (!Number.isInteger(alphaPermille) || alphaPermille < 0 || alphaPermille > 1000) throw new RangeError(`alphaPermille is an integer from 0 to 1000, got ${alphaPermille}`)
  if (!Number.isInteger(k) || k < 0 || k > 64) throw new RangeError(`k is an integer from 0 to 64, got ${k}`)
  let term = SCALE
  let sum = 0
  for (let j = 0; j <= k; j++) {
    sum += term
    term = divRound(term * alphaPermille, 1000)
  }
  return divRound(sum, SCALE / 1000)
}
