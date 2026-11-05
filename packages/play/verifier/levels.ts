/**
 * The Tasting's levels (`verifier`, GAMES.md §10): the world each one draws from a seed, what it asks, and the band that makes a seed a
 * fair question (§2.1).
 *
 * Every level but `gamma` plays on pairs of distributions drawn by the sim (`drawPair` over `SPEC_BAND`: six dishes, a grid of 1/64,
 * α from 0.4 to 0.9, two dishes each way) and cut to counts of plates out of sixty-four. A seed is a function of its level: the same
 * seed gives a different world in each, because each draws from its own sub-stream (A§5.1). The band is a list of clauses about the
 * draw, checked in integers and rationals, and the draw itself never loops on them: a seed that fails the band is simply not offered
 * (`drawInBand` moves to the next), so `buildLevel` is a plain function of its seed.
 *
 * Copy. The kitchen's word names the object and the engine's term rides beside it (GAMES.md §2.6, rule 2), and no prompt holds a digit:
 * the figures are in the mirror, the tape and the drawing, each tagged synthetic.
 */
import { assertSeed, below, rngFor, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { SPEC_BAND, drawPair } from '@es/sim/spec'
import type { Dist } from '@es/sim/spec'
import { alphaExact, caseTv, expectedTokensExact, topOf, wrongRules } from './exact'
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
    if (w % GRID !== 0) throw new RangeError(`weight ${w} is not a whole number of plates (a plate is ${GRID})`)
    return w / GRID
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Copy                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface LevelCopy {
  readonly title: string
  readonly prompt: string
}

const COPY: Readonly<Record<VerifierLevelId, LevelCopy>> = {
  overlap: {
    title: 'What the chef keeps',
    prompt:
      'The commis has plated a stack for each dish ahead of the chef. The plates both stacks share are the ones she keeps (the overlap, min(p, q), which is α). Predict how many of the sixty-four plates she keeps, then watch rounds go down the pass.',
  },
  exact: {
    title: 'Make it exact',
    prompt:
      'The chef keeps a commis plate with probability min(1, p ÷ q), the accept rule. When she sends one back she re-plates from a recipe of yours: how heavily she draws from each dish. Sculpt the recipe until what goes out is her tasting exactly (the output is p, total variation distance zero), then submit.',
  },
  chain: {
    title: 'A run of plates',
    prompt:
      'The commis plates a run of courses ahead, and the chef tastes them in order. She stops at the first plate she sends back, and plates one extra course herself when she keeps them all (the bonus token). Predict how many courses a round serves on average.',
  },
  'greedy-ngram': {
    title: 'The favourite and the copier',
    prompt:
      'A copier plates whatever the night served lately and knows nothing of how often, so its q is a single dish (an n-gram draft). First, at temperature zero the chef always sends her favourite: is the copier\'s plate kept? Then, at full temperature, sculpt the re-plating that still sends out her tasting exactly.',
  },
  mutants: {
    title: 'Five rules to audit',
    prompt:
      'Five tasting rules, each a little wrong in a different way. Taste a rule, or check every coin of its accept step, and name the bug in each one.',
  },
  gamma: {
    title: 'How far ahead',
    prompt:
      'The chef tastes a whole run in one go, and each plate the commis sets down costs a fraction of a tasting. The further along the run, the less likely she gets that far. Choose how many plates ahead the commis should plate for the most courses a tasting buys (the draft length γ).',
  },
}

export const levelTitle = (id: VerifierLevelId): string => COPY[id].title

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
  if (!isLevelId(id)) throw new RangeError(`The Tasting has no level "${id}"`)
  assertSeed(seed)
  const { title, prompt } = COPY[id]
  const base = { seed, title, prompt }
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
  if (!isLevelId(id)) throw new RangeError(`The Tasting has no level "${id}"`)
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

