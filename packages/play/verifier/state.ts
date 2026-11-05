/**
 * What a run of The Tasting is made of (`verifier`): its first state, the sampler a state draws rounds from, whether the learner may
 * be sculpting or drawing now, and the exact truths each level is graded against. The reducer (session.ts) and the view (view.ts)
 * are built on these, so the two cannot disagree about what a state allows.
 */
import { exactChain } from '@es/sim/spec'
import type { Dist } from '@es/sim/spec'
import { emptyTally, recipeVerifier } from './draws'
import type { SamplerModel } from './draws'
import { alphaExact, excessWeights, expectedTokensExact, outputExact, tvExact } from './exact'
import { bestGamma, sweepOf } from './gamma'
import type { SweepRow } from './gamma'
import { toDist } from './levels'
import { roundedTimes } from './ratio'
import type { Ratio } from './ratio'
import { DRAW_CAP, PLATES, VOCAB } from './types'
import type { VerifierAsk, VerifierCounters, VerifierLevel, VerifierState } from './types'

/** The cards a `mutants` level deals. */
export const CARDS = 5

/** Positions a level tallies: its draft positions and the bonus one. A level with no pairs (`gamma`) tallies none worth the name. */
export const positionsOf = (level: VerifierLevel): number => Math.max(level.p.length, 2)

export function initState(level: VerifierLevel): VerifierState {
  const cards = level.id === 'mutants' ? CARDS : 0
  return {
    level,
    weights: Array.from({ length: VOCAB }, () => 0),
    committed: false,
    prediction: null,
    judged: null,
    gamma: 0,
    labels: Array.from({ length: cards }, () => null),
    tasted: Array.from({ length: cards }, () => null),
    coined: Array.from({ length: cards }, () => null),
    focus: 0,
    tally: emptyTally(positionsOf(level), VOCAB),
    submitted: false,
  }
}

export const weightTotal = (s: VerifierState): number => s.weights.reduce((a, b) => a + b, 0)

/** The learner is sculpting a recipe: always in `exact`, and in `greedy-ngram` once the temperature-0 question is answered. */
export const recipeOpen = (s: VerifierState): boolean => !s.submitted && (s.level.id === 'exact' || (s.level.id === 'greedy-ngram' && s.judged !== null))

/** The sim distributions of a level's positions. */
export const distsOf = (level: VerifierLevel): { p: Dist[]; q: Dist[] } => ({ p: level.p.map(toDist), q: level.q.map(toDist) })

/**
 * What rounds are drawn from: the exact sampler in the predicting levels, and the exact accept rule with the learner's recipe where one
 * is sculpted. Null where no rounds are drawn (`mutants` has its instruments, and `gamma` a formula).
 */
export function modelOf(s: VerifierState): SamplerModel | null {
  const { p, q } = distsOf(s.level)
  switch (s.level.id) {
    case 'overlap':
    case 'chain':
      return { p, q, verify: exactChain }
    case 'exact':
    case 'greedy-ngram':
      return weightTotal(s) > 0 ? { p, q, verify: recipeVerifier(s.weights) } : null
    case 'mutants':
    case 'gamma':
      return null
  }
}

/** Whether `draw` is allowed now. */
export function canDraw(s: VerifierState): boolean {
  if (s.submitted || s.tally.rounds >= DRAW_CAP) return false
  switch (s.level.id) {
    case 'overlap':
    case 'chain':
      return s.committed
    case 'exact':
      return weightTotal(s) > 0
    case 'greedy-ngram':
      return s.judged !== null && weightTotal(s) > 0
    case 'mutants':
    case 'gamma':
      return false
  }
}

/** What the learner's recipe puts out at the first position, exactly, or null while the recipe is empty or the level has none. */
export function recipeOutput(s: VerifierState): Ratio[] | null {
  if ((s.level.id !== 'exact' && s.level.id !== 'greedy-ngram') || weightTotal(s) === 0) return null
  const { p, q } = distsOf(s.level)
  return outputExact(p[0], q[0], 'min-ratio', { kind: 'weights', w: s.weights })
}

/** The distance of that output from the chef's tasting, exactly. */
export function recipeTv(s: VerifierState): Ratio | null {
  const out = recipeOutput(s)
  return out === null ? null : tvExact(out, distsOf(s.level).p[0])
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Truths                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The plates the chef keeps of the commis's sixty-four, at the first position: Σ min(p, q). */
export function keptPlates(level: VerifierLevel): number {
  return level.p[0].reduce((sum, p, x) => sum + Math.min(p, level.q[0][x]), 0)
}

/** The acceptance of each draft position, exactly. */
export function alphasOf(level: VerifierLevel): Ratio[] {
  const { p, q } = distsOf(level)
  return q.map((qi, i) => alphaExact(p[i], qi))
}

/** Courses a round serves on average, exactly. */
export const tokensOf = (level: VerifierLevel): Ratio => expectedTokensExact(alphasOf(level))

/** The recipe that makes the output exact, in plates: the residual at the first position. */
export function excessPlates(level: VerifierLevel): number[] {
  const { p, q } = distsOf(level)
  return excessWeights(p[0], q[0]).map((w) => w / (p[0].total / PLATES))
}

/** The draft-length sweep of a `gamma` level and its best length. */
export function sweepOfLevel(level: VerifierLevel): { rows: SweepRow[]; best: number } {
  if (level.id !== 'gamma') throw new RangeError(`level ${level.id} has no draft length to choose`)
  const rows = sweepOf({ alphas: level.alphas, cost: level.cost })
  return { rows, best: bestGamma(rows) }
}

/** A prediction of courses per round as a count of thousandths, rounded to the nearest. */
export const thousandths = (r: Ratio): number => roundedTimes(r, 1000)

/** The pending decision, or null when the run is over. */
export function askOf(s: VerifierState): VerifierAsk | null {
  if (s.submitted) return null
  switch (s.level.id) {
    case 'overlap':
      return { kind: s.committed ? 'finish' : 'predict-plates' }
    case 'chain':
      return { kind: s.committed ? 'finish' : 'predict-tokens' }
    case 'exact':
      return { kind: 'recipe' }
    case 'greedy-ngram':
      return { kind: s.judged === null ? 'judge' : 'recipe' }
    case 'mutants':
      return { kind: 'audit' }
    case 'gamma':
      return { kind: 'choose-gamma' }
  }
}

/** The counts of the rounds drawn (GAMES.md §1 rule 3: counts, never speed). */
export function countersOf(s: VerifierState): VerifierCounters {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
  return { rounds: s.tally.rounds, kept: sum(s.tally.kept), sentBack: sum(s.tally.sentBack), tokens: s.tally.tokens }
}
