// The exactness check on a sampler (ARCHITECTURE §8.3): what the forge lab's host runs on a learner's verify step, in the model's own
// terms, so that the host, the game and the tests judge a sampler the same way.
//
// A seed's test draws `draws` rounds. Each round drafts a chain from q, hands it to the verifier, and counts the first token it
// emits; an exact verifier emits it with probability p[0] whatever the chain, so the counts are a multinomial sample of p[0] and
// Pearson's statistic (chisquare.ts) follows chi-square with df degrees of freedom, to a good approximation. The lab runs two seeds at
// α = 1e-4, and a sampler passes when neither exceeds the critical value, so an exact one fails falsely with probability about
// 1 − (1 − 1e-4)² ≈ 2e-4 [derived], if the statistic's tail is the chi-square's. tests/sim/spec-rates.test.ts measures that rate. One
// test per seed is what it counts: the test of later positions is for the model's own tests.
//
// The chi-square test cannot see a bug that moves the distribution by 1/65,536 of its total. The accept step is small enough to
// look at exhaustively instead: for each token, the number of coins u in [0, q_x) that the accept rule takes must be exactly
// min(p_x, q_x), which makes the accept probability min(1, p_x / q_x) with no statistics at all and no false fail.

import { rngFor } from '../core/rng'
import type { Seed } from '../core/types'
import { chiSquare, criticalValue } from './chisquare'
import type { CriticalLevel } from './chisquare'
import type { Dist } from './dist'
import { assertChain, draftChain } from './verify'
import type { ChainVerifier, VerifyRules } from './verify'

/** Draws per seed in the lab's check (ARCHITECTURE §8.3) [estimated]. */
export const LAB_DRAWS = 20_000
/** Fresh seeds per attempt: the sampler must pass them all [estimated]. */
export const LAB_SEEDS = 2
/** The level of each seed's test [estimated]. */
export const LAB_LEVEL: CriticalLevel = '1e-4'

export interface SeedTest {
  readonly seed: Seed
  /** The first emitted token of each round, counted by token. */
  readonly counts: readonly number[]
  readonly stat: number
  readonly df: number
  /** The critical value at the level the test ran at. */
  readonly critical: number
  readonly rejected: boolean
}

export interface LabTest {
  /** The seeds that ran. A lab stops at the first rejection, so a rejected sampler may show fewer than it was given. */
  readonly tests: readonly SeedTest[]
  /** Whether any seed rejected: the sampler fails the check. */
  readonly rejected: boolean
}

/**
 * The counts of the first token emitted over `draws` rounds on `seed`. The drafts come from the sub-stream `spec/draft` and the
 * verifier's coins from `spec/verify`, so a verifier that draws more or fewer coins never moves a draft.
 */
export function firstTokenCounts(seed: Seed, p: readonly Dist[], q: readonly Dist[], verify: ChainVerifier, draws: number = LAB_DRAWS): number[] {
  assertChain(p, q)
  const drafts = rngFor(seed, 'spec/draft')
  const coins = rngFor(seed, 'spec/verify')
  const counts = new Array<number>(p[0].weights.length).fill(0)
  for (let i = 0; i < draws; i++) counts[verify(p, q, draftChain(q, drafts), coins).tokens[0]]++
  return counts
}

/** One seed's test of `verify` against p[0] at `level`. */
export function seedTest(seed: Seed, p: readonly Dist[], q: readonly Dist[], verify: ChainVerifier, level: CriticalLevel = LAB_LEVEL, draws: number = LAB_DRAWS): SeedTest {
  const counts = firstTokenCounts(seed, p, q, verify, draws)
  const { stat, df } = chiSquare(counts, p[0])
  const critical = criticalValue(level, df)
  return { seed, counts, stat, df, critical, rejected: stat > critical }
}

/** The lab's check: `seeds` one after another, each a `seedTest`, stopping at the first that rejects. */
export function labTest(seeds: readonly Seed[], p: readonly Dist[], q: readonly Dist[], verify: ChainVerifier, level: CriticalLevel = LAB_LEVEL, draws: number = LAB_DRAWS): LabTest {
  const tests: SeedTest[] = []
  for (const seed of seeds) {
    const test = seedTest(seed, p, q, verify, level, draws)
    tests.push(test)
    if (test.rejected) return { tests, rejected: true }
  }
  return { tests, rejected: false }
}

export interface AcceptViolation {
  readonly token: number
  readonly px: number
  readonly qx: number
  /** How many coins of [0, qx) the rule accepted. */
  readonly accepted: number
  /** How many it should have: min(px, qx). */
  readonly expected: number
}

/** The tokens whose accept rule takes some other number of the coins [0, q_x) than min(p_x, q_x). It tries every coin of every token: 2^16 in all. */
export function acceptStepViolations(accept: VerifyRules['accept'], p: Dist, q: Dist): AcceptViolation[] {
  const found: AcceptViolation[] = []
  for (let token = 0; token < p.weights.length; token++) {
    const px = p.weights[token]
    const qx = q.weights[token]
    let accepted = 0
    for (let u = 0; u < qx; u++) if (accept(px, qx, u)) accepted++
    const expected = Math.min(px, qx)
    if (accepted !== expected) found.push({ token, px, qx, accepted, expected })
  }
  return found
}
