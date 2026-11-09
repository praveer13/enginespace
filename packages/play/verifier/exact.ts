/**
 * The Tasting's exact arithmetic (`verifier`, GAMES.md §10, "Simulation API"): what a speculative round puts out, as a fraction and
 * not as a sample. A sampler here is two rules, over distributions p (the chef's tasting) and q (the commis's plates) with one
 * integer total, 2^16 in the course's worlds (A§5.5):
 *
 *   accept    a drafted token x is kept for some of the coins u in [0, q_x). The exact rule keeps u < p_x, which is min(p_x, q_x) of
 *             them, so a draft is kept with probability min(1, p_x / q_x) and no float is read.
 *   recover   a rejected draft is replaced by a token drawn from a recipe of integer weights. The exact recipe is the residual,
 *             (p − q)⁺: the weight of x is max(0, p_x − q_x).
 *
 * The output distribution is then a sum of fractions: out(y) = kept(y) + P(rejected) × recipe(y), where kept(y) is the share of drafts
 * that are y and are kept. `outputExact` computes it, `tvExact` measures its distance from p, and TV is 0 exactly when out equals p.
 *
 * Which pairs of rules reach TV 0 is a fact about arithmetic, and the tests prove it. With the exact accept rule, the recipe must be
 * proportional to the residual, and no other recipe does (the Verifier's `exact` level is that statement). Change the accept rule and
 * a different recipe can still land on p: accepting exactly when p ≥ q, with no coin, is exact when the recipe is p − q where p ≥ q
 * and p where p < q. It keeps fewer plates, so it wastes more of the commis's work, but it is not biased. That is why the level fixes
 * the accept rule and asks for the recipe, and why the bestiary's wrong samplers are wrong in the pair and not in one half.
 *
 * BigInt appears here and nowhere else in the game, and no `**` (GAMES.md §10, "Invariants").
 */
import { overlapWeight } from '@es/sim/spec'
import type { Dist } from '@es/sim/spec'
import { ONE, ZERO, absolute, add, mul, ratio, sub, sum } from './ratio'
import type { Ratio } from './ratio'

/**
 * How a drafted token is kept or sent back, for the coins u in [0, q_x):
 *   min-ratio       keep when u < p_x: the exact rule, probability min(1, p_x / q_x).
 *   p-at-least-q    keep when p_x ≥ q_x and send back otherwise, with no coin.
 *   p-over-q        the same with p_x > q_x: the bestiary's "accept when p > q".
 *   always          keep every draft: there is no verifier, and the output is q.
 *   coin-at-most-p  keep when u ≤ p_x: the boundary-inclusive comparison of SGLang PR #35798, which keeps one coin too many.
 */
export type AcceptRule = 'min-ratio' | 'p-at-least-q' | 'p-over-q' | 'always' | 'coin-at-most-p'

/**
 * Where a rejected draft's replacement comes from:
 *   excess          the residual (p − q)⁺, the exact recipe;
 *   weights         a recipe of the learner's own, one integer weight for each token;
 *   p-without-x     p with the rejected token taken out and the rest renormalised: the replacement depends on what was rejected.
 * `inclusive` walks the recipe's cumulative weights with `draw ≤ running total`, the other half of the boundary-inclusive bug.
 */
export type Recovery =
  | { readonly kind: 'excess'; readonly inclusive?: boolean }
  | { readonly kind: 'weights'; readonly w: readonly number[]; readonly inclusive?: boolean }
  | { readonly kind: 'p-without-x' }

/** The coins u in [0, q_x) that `rule` keeps, as a count. A token the commis never plates (q_x = 0) has no coins. */
export function acceptedCoins(rule: AcceptRule, px: number, qx: number): number {
  if (qx === 0) return 0
  switch (rule) {
    case 'min-ratio':
      return Math.min(px, qx)
    case 'p-at-least-q':
      return px >= qx ? qx : 0
    case 'p-over-q':
      return px > qx ? qx : 0
    case 'always':
      return qx
    case 'coin-at-most-p':
      return Math.min(qx, px + 1)
  }
}

/** Throws unless p and q are distributions over one vocabulary with one total, which the accept step compares weights of. */
export function assertPair(p: Dist, q: Dist): void {
  if (p.weights.length !== q.weights.length) throw new RangeError(`p has ${p.weights.length} tokens and q has ${q.weights.length}`)
  if (p.total !== q.total) throw new RangeError(`p adds up to ${p.total} and q to ${q.total}: the accept step compares weights, so they share one total`)
  const sums = [p, q].map((d) => d.weights.reduce((a, b) => a + b, 0))
  if (sums[0] !== p.total || sums[1] !== q.total) throw new RangeError('a distribution\'s weights must add up to its total')
}

/** The residual (p − q)⁺ as integer weights. */
export const excessWeights = (p: Dist, q: Dist): number[] => p.weights.map((px, x) => Math.max(0, px - q.weights[x]))

/** The recipe as integer weights, and the weights' total: the number of draws the recipe's walk takes. */
function recipe(p: Dist, q: Dist, r: Exclude<Recovery, { kind: 'p-without-x' }>): { counts: number[]; total: number } {
  const weights = r.kind === 'excess' ? excessWeights(p, q) : [...r.w]
  if (weights.length !== p.weights.length) throw new RangeError(`a recipe has one weight for each of ${p.weights.length} tokens, got ${weights.length}`)
  let total = 0
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`a recipe weight is a non-negative integer, got ${w}`)
    total += w
  }
  if (r.inclusive !== true || total === 0) return { counts: weights, total }
  // `draw ≤ running total` gives token i the draws in (run_(i−1), run_i], and token 0 the draws in [0, run_0]: one more than it owns.
  // The draws stop at total − 1, so the last token with weight owns one fewer.
  const counts: number[] = []
  let before = -1
  let run = 0
  for (const w of weights) {
    run += w
    counts.push(Math.max(0, Math.min(run, total - 1) - before))
    before = run
  }
  return { counts, total }
}

/**
 * What a round puts out, token by token, as exact fractions: the share of rounds whose emitted first token is y. It sums to 1.
 * Throws if a draft can be rejected and the recipe has no weight to re-plate from.
 */
export function outputExact(p: Dist, q: Dist, accept: AcceptRule, r: Recovery): Ratio[] {
  assertPair(p, q)
  const n = p.weights.length
  const total = BigInt(p.total)
  const keptCoins = p.weights.map((px, x) => acceptedCoins(accept, px, q.weights[x]))
  const kept = keptCoins.map((coins) => ratio(BigInt(coins), total))
  const rejected = sub(ONE, sum(kept))

  if (r.kind === 'p-without-x') {
    return Array.from({ length: n }, (_, y) => {
      let replaced = ZERO
      for (let x = 0; x < n; x++) {
        const lost = q.weights[x] - keptCoins[x]
        if (x === y || lost === 0) continue
        if (p.weights[x] === p.total) throw new RangeError('p has all its weight on the rejected token, so there is nothing to re-plate from')
        replaced = add(replaced, ratio(BigInt(lost) * BigInt(p.weights[y]), total * BigInt(p.total - p.weights[x])))
      }
      return add(kept[y], replaced)
    })
  }

  if (rejected.num === 0n) return kept
  const { counts, total: draws } = recipe(p, q, r)
  if (draws === 0) throw new RangeError('the recipe has no weight, so a plate that is sent back has nowhere to be re-plated from')
  return kept.map((k, y) => add(k, mul(rejected, ratio(BigInt(counts[y]), BigInt(draws)))))
}

/** The distance of an output from p, in total variation: half the sum of |out(y) − p(y)|. Exactly 0 when the output is p. */
export function tvExact(out: readonly Ratio[], p: Dist): Ratio {
  if (out.length !== p.weights.length) throw new RangeError(`the output has ${out.length} tokens and p has ${p.weights.length}`)
  const total = BigInt(p.total)
  let distance = ZERO
  out.forEach((o, y) => {
    distance = add(distance, absolute(sub(o, ratio(BigInt(p.weights[y]), total))))
  })
  return mul(distance, ratio(1n, 2n))
}

/** α = Σ min(p, q) ÷ total: the share of the commis's plates that the chef keeps. */
export const alphaExact = (p: Dist, q: Dist): Ratio => (assertPair(p, q), ratio(BigInt(overlapWeight(p, q)), BigInt(p.total)))

/**
 * Courses a round yields on average, Σ over j from 0 to γ of the product of the first j acceptances: 1 + α₁ + α₁α₂ + …, with one
 * acceptance for each draft position (the empty product is 1, the course the chef always plates). With one α throughout it is
 * 1 + α + … + α^γ = (1 − α^(γ+1)) ÷ (1 − α), the paper's equation 1 (claim spec.paper.expected-tokens).
 */
export function expectedTokensExact(alphas: readonly Ratio[]): Ratio {
  let reaching = ONE
  let total = ONE
  for (const alpha of alphas) {
    reaching = mul(reaching, alpha)
    total = add(total, reaching)
  }
  return total
}

/**
 * An n-gram draft names no probabilities, so its q is one-hot on the token x it copied: all of the total on x. Applying the exact rule
 * to that q, a draft is kept with probability p_x ÷ total and a rejected one is replaced from p with x taken out (the residual of a
 * one-hot q is p with x zeroed). The tests hold this to `outputExact` with a one-hot q.
 */
export function ngramCase(p: Dist, x: number): { accept: Ratio; recovery: Ratio[] } {
  if (!Number.isInteger(x) || x < 0 || x >= p.weights.length) throw new RangeError(`the copied token ${x} is not one of the ${p.weights.length}`)
  if (p.weights[x] === p.total) throw new RangeError('p has all its weight on the copied token: it is always kept, and there is no recovery')
  const rest = BigInt(p.total - p.weights[x])
  return {
    accept: ratio(BigInt(p.weights[x]), BigInt(p.total)),
    recovery: p.weights.map((w, y) => (y === x ? ZERO : ratio(BigInt(w), rest))),
  }
}

/** The token with the most weight, or null when two share it: ties have no favourite, and the bands turn them away. */
export function topOf(p: Dist): number | null {
  let best = 0
  let ties = 0
  p.weights.forEach((w, y) => {
    if (w > p.weights[best]) {
      best = y
      ties = 0
    } else if (w === p.weights[best] && y !== best) ties += 1
  })
  return ties > 0 ? null : best
}

/** The token with the most weight. Throws on a tie, which the bands exclude: a favourite is one dish. */
export function favourite(p: Dist): number {
  const best = topOf(p)
  if (best === null) throw new RangeError('p has two favourites')
  return best
}

/** At temperature 0 a draft is kept exactly when it is p's arg max (GAMES.md §10: bands exclude ties). */
export const greedyAccept = (p: Dist, x: number): boolean => favourite(p) === x

/** A distribution with all of its total on one token: the n-gram draft's q. */
export const oneHot = (size: number, x: number, total: number): Dist => ({ weights: Array.from({ length: size }, (_, y) => (y === x ? total : 0)), total })

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rules that look right and are not                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A sampler as the pair of rules it is: what `outputExact` takes. */
export interface RuleCase {
  readonly id: string
  readonly accept: AcceptRule
  readonly recovery: Recovery
}

/** The residual walked one token along: a 1-based position taken for a 0-based one, so token j is re-plated as j + 1. */
export const shiftedExcess = (p: Dist, q: Dist): number[] => {
  const excess = excessWeights(p, q)
  return excess.map((_, y) => excess[(y + excess.length - 1) % excess.length])
}

/**
 * The plausible wrong rules on one pair, each one rule off the exact sampler: resample from p, from q, from p without the rejected
 * token; the residual one token along; accept when p > q with no coin; accept everything. `exact` bands require each to land at
 * least 2% from p, so every one of them leaves a visible bias (GAMES.md §10, "Band").
 */
export function wrongRules(p: Dist, q: Dist): RuleCase[] {
  return [
    { id: 'resample-from-p', accept: 'min-ratio', recovery: { kind: 'weights', w: p.weights } },
    { id: 'resample-from-q', accept: 'min-ratio', recovery: { kind: 'weights', w: q.weights } },
    { id: 'p-without-draft', accept: 'min-ratio', recovery: { kind: 'p-without-x' } },
    { id: 'residual-off-by-one', accept: 'min-ratio', recovery: { kind: 'weights', w: shiftedExcess(p, q) } },
    { id: 'accept-if-p-over-q', accept: 'p-over-q', recovery: { kind: 'excess' } },
    { id: 'accept-everything', accept: 'always', recovery: { kind: 'excess' } },
  ]
}

/** The exact output of a rule case on a pair. */
export const caseOutput = (rule: RuleCase, p: Dist, q: Dist): Ratio[] => outputExact(p, q, rule.accept, rule.recovery)

/** The distance of a rule case from p. */
export const caseTv = (rule: RuleCase, p: Dist, q: Dist): Ratio => tvExact(caseOutput(rule, p, q), p)

