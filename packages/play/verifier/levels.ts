/**
 * The Tasting's levels (`verifier`, GAMES.md §10): the world each one draws from a seed, what it asks, and the band that makes a seed a
 * fair question (§2.1).
 *
 * Every level but `gamma` plays on pairs of distributions drawn by the sim (`drawPair` over `SPEC_BAND`: six dishes, a grid of 1/64,
 * α from 0.4 to 0.9, two dishes each way) and cut to counts of plates out of sixty-four. A seed is a function of its level: the same
 * seed gives a different world in each, because each draws from its own sub-stream (A§5.1). The band is a list of clauses about the
 * draw, checked in integers and rationals, and the draw itself never loops on them: a seed that fails the band is simply not offered
 * (`drawInBand` moves to the next), so `buildLevel` is a plain function of its seed.
 */
import { assertSeed, below, rngFor, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { SPEC_BAND, drawPair } from '@es/sim/spec'
import type { Dist } from '@es/sim/spec'
import { alphaExact, caseTv, expectedTokensExact, topOf, wrongRules } from './exact'
import { VERIFIER_COPY } from './copy'
import { gammaCase } from './gamma'
import { absolute, compare, div, ratio, sub, sum } from './ratio'
import type { Ratio } from './ratio'
import { LEVEL_IDS, MUTANT_IDS, PLATES, VOCAB } from './types'
import type { MutantId, Plates, VerifierLevel, VerifierLevelId } from './types'

/** One plate is this much of the sim's total: 65,536 ÷ 64. */
export const GRID = 1024

/** Counts of plates as a sim distribution. */
export const toDist = (plates: readonly number[]): Dist => ({ weights: plates.map((n) => n * GRID), total: PLATES * GRID })

/** A sim distribution on the grid as counts of plates. */
export function toPlates(d: Dist): Plates {
  return d.weights.map((w) => {
    if (w % GRID !== 0) throw new RangeError(`weight ${w} is not a whole number of units of ${GRID}`)
    return w / GRID
  })
}

export const levelTitle = (id: VerifierLevelId): string => VERIFIER_COPY[id].title

const isLevelId = (id: string): id is VerifierLevelId => (LEVEL_IDS as readonly string[]).includes(id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Draws                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The pair of a single-position level, in plates, and its sim distributions. */
export function pairOf(seed: Seed, id: VerifierLevelId): { p: Dist; q: Dist } {
  return drawPair(rngFor(seed, `verifier/${id}/pair`), SPEC_BAND)
}

/** A level that plays on one pair: the chef's tasting and the commis's plates, with the chef's bonus tasting a copy of the first. */
function single(seed: Seed, id: 'overlap' | 'exact' | 'mutants'): { p: Plates[]; q: Plates[]; raw: { p: Dist; q: Dist } } {
  const raw = pairOf(seed, id)
  const p = toPlates(raw.p)
  return { p: [p, p], q: [toPlates(raw.q)], raw }
}

/** The run of a `chain` seed: how many drafts, and a pair at each position. */
export function chainOf(seed: Seed): { gamma: number; pairs: { p: Dist; q: Dist }[] } {
  const rng = rngFor(seed, 'verifier/chain')
  const gamma = 2 + below(rng, 3)
  return { gamma, pairs: Array.from({ length: gamma + 1 }, () => drawPair(rng, SPEC_BAND)) }
}

/**
 * The pair of `greedy-ngram`: p drawn like the others', and the dish the copier copied. Whether the copier copied the favourite is
 * drawn first and the dish second (the answer first, GAMES.md §2.1), so "kept" is right on about half of the seeds. A p with two
 * favourites has no copier: its draft is dish 0, and the band turns the seed away.
 */
function ngramOf(seed: Seed): { p: Dist; draft: number; favourite: number | null } {
  const p = drawPair(rngFor(seed, 'verifier/greedy-ngram/pair'), SPEC_BAND).p
  const best = topOf(p)
  if (best === null) return { p, draft: 0, favourite: null }
  const rng = rngFor(seed, 'verifier/greedy-ngram/draft')
  if (below(rng, 2) === 0) return { p, draft: best, favourite: best }
  const others = Array.from({ length: VOCAB }, (_, x) => x).filter((x) => x !== best)
  return { p, draft: others[below(rng, others.length)], favourite: best }
}

/** The q of the n-gram draft in plates: all sixty-four on the copied dish. */
const ONE_HOT = (x: number): Plates => Array.from({ length: VOCAB }, (_, y) => (y === x ? PLATES : 0))

/** The five cards of `mutants`, in the order they are dealt. */
const dealt = (seed: Seed): MutantId[] => shuffle(rngFor(seed, 'verifier/mutants/deal'), MUTANT_IDS)

/** The level `id` on `seed`. Throws for a level the game does not have. */
export function buildLevel(id: string, seed: Seed): VerifierLevel {
  if (!isLevelId(id)) throw new RangeError(`The rejection sampler has no level "${id}"`)
  assertSeed(seed)
  const base = { seed }
  switch (id) {
    case 'overlap':
    case 'exact': {
      const { p, q } = single(seed, id)
      return { ...base, id, p, q }
    }
    case 'mutants': {
      const { p, q } = single(seed, id)
      return { ...base, id, p, q, cards: dealt(seed) }
    }
    case 'chain': {
      const { pairs } = chainOf(seed)
      return { ...base, id, p: pairs.map((pair) => toPlates(pair.p)), q: pairs.slice(0, -1).map((pair) => toPlates(pair.q)) }
    }
    case 'greedy-ngram': {
      const { p, draft } = ngramOf(seed)
      const soft = toPlates(p)
      return { ...base, id, p: [soft, soft], q: [ONE_HOT(draft)], draft }
    }
    case 'gamma': {
      const c = gammaCase(seed)
      return { ...base, id, p: [], q: [], alphas: c.alphas, cost: c.cost }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Bands                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A wrong rule must land at least this far from p, in total variation, for its bias to be visible: 2% (GAMES.md §10, "Band") [estimated]. */
export const MIN_BIAS = ratio(2, 100)

/** `a` at least `b` of the way. */
const atLeast = (a: Ratio, b: Ratio): boolean => compare(a, b) >= 0

/**
 * The band of `exact` (GAMES.md §10): the pair is the sim's, and every plausible wrong rule leaves a bias of at least 2%. A learner who
 * resamples from p or from q, or from p without the rejected dish, or walks the recipe one dish along, or keeps plates with no coin, or
 * keeps them all, lands visibly off p, so the exact recipe is the only way to win.
 */
export function exactBand(p: Dist, q: Dist): boolean {
  return wrongRules(p, q).every((rule) => atLeast(caseTv(rule, p, q), MIN_BIAS))
}

/** The acceptance of each position of a chain. */
export const chainAlphas = (pairs: readonly { p: Dist; q: Dist }[], gamma: number): Ratio[] => pairs.slice(0, gamma).map((pair) => alphaExact(pair.p, pair.q))

/** The share by which a count of courses is off. */
const offBy = (guess: Ratio, truth: Ratio): Ratio => div(absolute(sub(guess, truth)), truth)

/** The courses per round that two naive readings would give: every position as accepting as the first, and as the mean. */
export function naiveTokens(alphas: readonly Ratio[]): { first: Ratio; mean: Ratio } {
  const first = expectedTokensExact(alphas.map(() => alphas[0]))
  const mean = div(sum(alphas), ratio(alphas.length))
  return { first, mean: expectedTokensExact(alphas.map(() => mean)) }
}

/**
 * The band of `chain` (GAMES.md §10): each position's pair is the sim's, and the acceptances differ enough that reading every position
 * as the first, or as the mean, misses by at least 3% [estimated]. The pass bar is within 1%, so the naive count visibly loses.
 */
export function chainBand(seed: Seed): boolean {
  const { gamma, pairs } = chainOf(seed)
  const alphas = chainAlphas(pairs, gamma)
  const truth = expectedTokensExact(alphas)
  const naive = naiveTokens(alphas)
  const three = ratio(3, 100)
  return atLeast(offBy(naive.first, truth), three) && atLeast(offBy(naive.mean, truth), three)
}

/** The least p the copied dish may have, and the most: its plate is neither always sent back nor always kept [estimated]. */
export const COPIED_RANGE = [4, 56] as const
/** The favourite leads the next dish by at least this many plates, so that the tallest stack is plainly the tallest [estimated]. */
export const FAVOURITE_LEAD = 3

/**
 * The band of `greedy-ngram`: p has one favourite with a clear lead, and the copied dish has between 4 and 56 plates of p, so the
 * n-gram plate is kept with a probability that is neither 0 nor 1. Whether the copier copied the favourite is drawn first, and the
 * dish second, so the constant answer "kept" is right on about half of the seeds.
 */
export function greedyBand(seed: Seed): boolean {
  const { p, draft, favourite: best } = ngramOf(seed)
  if (best === null) return false
  const plates = toPlates(p)
  const sorted = plates.slice().sort((a, b) => b - a)
  if (sorted[0] - sorted[1] < FAVOURITE_LEAD) return false
  return plates[draft] >= COPIED_RANGE[0] && plates[draft] <= COPIED_RANGE[1]
}

/**
 * The band of `mutants`: the four rules wrong in their recipe or their accept rule land at least 2% from p. The fifth, the
 * boundary-inclusive comparison, moves a dish by a coin in 65,536 and is not required to: it is the one a taste test cannot see.
 */
export function mutantsBand(p: Dist, q: Dist): boolean {
  return wrongRules(p, q)
    .filter((rule) => rule.id === 'resample-from-p' || rule.id === 'resample-from-q' || rule.id === 'residual-off-by-one' || rule.id === 'accept-if-p-over-q')
    .every((rule) => atLeast(caseTv(rule, p, q), MIN_BIAS))
}

/** Whether a seed makes level `id` a fair question (GAMES.md §2.1). Throws for a level the game does not have. */
export function inLevelBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`The rejection sampler has no level "${id}"`)
  assertSeed(seed)
  switch (id) {
    case 'overlap':
      return true
    case 'exact': {
      const { p, q } = pairOf(seed, 'exact')
      return exactBand(p, q)
    }
    case 'chain':
      return chainBand(seed)
    case 'greedy-ngram':
      return greedyBand(seed)
    case 'mutants': {
      const { p, q } = pairOf(seed, 'mutants')
      return mutantsBand(p, q)
    }
    case 'gamma':
      return true
  }
}

