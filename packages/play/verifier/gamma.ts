/**
 * How far ahead the commis should plate (`gamma`, GAMES.md §10): kernelspace's push-luck model (`fleet-ex/push-luck.ts` at d478f91;
 * Leviathan, Kalman and Matias 2023, arXiv 2211.17192), deepened with an acceptance that decays down the run.
 *
 * The commis plates γ courses ahead and the chef tastes the whole run in one go. Position j is kept, given that the ones before it
 * were, with probability α_j, so a round serves
 *
 *   E(γ) = 1 + α₁ + α₁α₂ + … + α₁⋯α_γ
 *
 * courses on average: the course the chef always plates, and each draft that the walk reaches and keeps. A round costs one tasting
 * plus γ drafted plates of c of a tasting each, 1 + γc, and plain service serves one course for one tasting, so the speedup is
 * E(γ) ÷ (1 + γc). A longer run adds the product of the first γ + 1 acceptances to the courses, and only if the walk gets that far,
 * while it adds c to the cost of every round: so there is a best γ, and it is not the longest.
 *
 * The case of a seed is an acceptance curve and a cost. The curve starts at α₁ and each position keeps `decay` ÷ 1,000 of the one
 * before, rounded to a whole permille (integer arithmetic, so every engine draws the same curve). The draw first picks which draft
 * length is best (each of 1 to 7 equally often) and then a case that makes it best, so the best constant answer is right on 1/7 of
 * the seeds [derived], under ASSESSMENT §4.1's 15% bound for a blind strategy.
 *
 * The grid search uses doubles (+, −, ×, ÷ only, which IEEE 754 makes identical in every engine); the answer a run is graded on is
 * computed in rationals, and the two agree because a case is banded to lead its runner-up by at least 0.5%.
 */
import { below, divRound, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { ONE, add, compare, div, mul, ratio } from './ratio'
import type { Ratio } from './ratio'
import { GAMMA_MAX } from './types'

export interface GammaCase {
  /** Acceptance at each position 1 to `GAMMA_MAX`, in permille. */
  readonly alphas: readonly number[]
  /** The cost of one drafted plate, as a permille of one tasting. */
  readonly cost: number
}

/** A case is a question when speculation pays this much at the best length (kernelspace's `PL_MIN_SPEEDUP`), and the best leads by this share. */
export const MIN_SPEEDUP_PERMILLE = 1200
export const MARGIN_PERMILLE = 5

/** The grid the draw picks from: α₁, the decay and the cost, each in permille [estimated]. */
const STARTS = range(500, 990, 10)
const DECAYS = range(700, 990, 10)
const COSTS = range(5, 300, 5)

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  return out
}

/** The acceptance curve that starts at `start` and keeps `decay` ÷ 1,000 of the position before it. */
export function curveOf(start: number, decay: number, positions = GAMMA_MAX): number[] {
  const alphas = [start]
  for (let j = 1; j < positions; j++) alphas.push(divRound(alphas[j - 1] * decay, 1000))
  return alphas
}

/** The speedup at every draft length 1 to `GAMMA_MAX`, in doubles: for the band search only. */
export function speedupsFloat(alphas: readonly number[], cost: number): number[] {
  const out: number[] = []
  let reaching = 1
  let tokens = 1
  for (let g = 1; g <= GAMMA_MAX; g++) {
    reaching *= alphas[g - 1] / 1000
    tokens += reaching
    out.push(tokens / (1 + (g * cost) / 1000))
  }
  return out
}

/** The draft length with the largest speedup in a list (the shorter wins a tie), as a length from 1. */
const bestIndex = (speedups: readonly number[]): number => speedups.reduce((best, s, i) => (s > speedups[best] ? i : best), 0) + 1

/** True when the speedups make a fair question: the best is not the longest, pays at least 1.2, and leads every other by 0.5%. */
function fair(speedups: readonly number[]): boolean {
  const best = bestIndex(speedups)
  if (best === speedups.length) return false
  const runnerUp = Math.max(...speedups.filter((_, i) => i !== best - 1))
  return speedups[best - 1] * 1000 >= MIN_SPEEDUP_PERMILLE && speedups[best - 1] * 1000 >= runnerUp * (1000 + MARGIN_PERMILLE)
}

let groups: readonly (readonly GammaCase[])[] | undefined

/** The banded cases of the grid, grouped by the draft length that is best for them: one group for each length 1 to 7. */
export function casesByBest(): readonly (readonly GammaCase[])[] {
  if (groups !== undefined) return groups
  const by: GammaCase[][] = Array.from({ length: GAMMA_MAX - 1 }, () => [])
  for (const start of STARTS) {
    for (const decay of DECAYS) {
      const alphas = curveOf(start, decay)
      for (const cost of COSTS) {
        const speedups = speedupsFloat(alphas, cost)
        if (fair(speedups)) by[bestIndex(speedups) - 1].push({ alphas, cost })
      }
    }
  }
  groups = by
  return groups
}

/** The case of `seed`: first which draft length is best, then a case that makes it so. Every seed is in band. */
export function gammaCase(seed: Seed): GammaCase {
  const rng = rngFor(seed, 'verifier/gamma')
  const all = casesByBest()
  const group = all[below(rng, all.length)]
  return group[below(rng, group.length)]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The exact economics                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** E(γ) in rationals. */
export function tokensPerRound(alphas: readonly number[], gamma: number): Ratio {
  let reaching = ONE
  let total = ONE
  for (let j = 1; j <= gamma; j++) {
    reaching = mul(reaching, ratio(alphas[j - 1], 1000))
    total = add(total, reaching)
  }
  return total
}

/** The cost of a round of γ drafted plates, in tastings: 1 + γc. */
export const roundCost = (cost: number, gamma: number): Ratio => add(ONE, ratio(gamma * cost, 1000))

export const speedupOf = (alphas: readonly number[], cost: number, gamma: number): Ratio => div(tokensPerRound(alphas, gamma), roundCost(cost, gamma))

export interface SweepRow {
  readonly gamma: number
  readonly tokens: Ratio
  readonly cost: Ratio
  readonly speedup: Ratio
}

/** Every draft length 1 to `GAMMA_MAX`. */
export function sweepOf(c: GammaCase): SweepRow[] {
  return Array.from({ length: GAMMA_MAX }, (_, i) => {
    const gamma = i + 1
    const tokens = tokensPerRound(c.alphas, gamma)
    const cost = roundCost(c.cost, gamma)
    return { gamma, tokens, cost, speedup: div(tokens, cost) }
  })
}

/** The draft length with the largest speedup, exactly (the shorter wins a tie). */
export function bestGamma(rows: readonly SweepRow[]): number {
  let best = rows[0]
  for (const row of rows) if (compare(row.speedup, best.speedup) > 0) best = row
  return best.gamma
}
