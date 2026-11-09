/**
 * The score of a night (GAMES.md §8, "Scoring and pass"): counts of tokens, steps and pans, and the one price they add up to.
 *
 * The price is the tokens that had to be prepped again plus a weight for each step a ticket waited on its kit: `recomputed tokens +
 * stall weight × stall steps`. The weight is the prefill a stall forgoes, a design parameter set per level [estimated]. A night that
 * ended with a ticket unserved scores 0 whatever it cost: the step cap is what makes the line keep moving, since the price counts no
 * time of its own and a policy that hung one ticket at a time would otherwise pay the least. The score of a run is the house's price
 * over its own, at most 1 (§2.1: `min(1, ghost ÷ mine)` for costs), so a learner who beats the house scores 1.
 */
import type { Grade } from '../types'
import type { PoolCounts, PoolLevel, PoolScore, PoolState } from './types'

/** The price of a night: tokens prepped again, and the weighted steps a ticket waited on its kit. */
export const costOf = (counts: PoolCounts, level: PoolLevel): number => counts.recomputedTokens + level.stallWeight * counts.adapterStallSteps

/** Tickets that were not served when the night ended. */
export const unservedOf = (state: Pick<PoolState, 'reqs'>): number => state.reqs.filter((req) => req.status !== 'done').length

export function scoreOf(state: PoolState): PoolScore {
  return { ...state.counts, cost: costOf(state.counts, state.level), unserved: unservedOf(state), turns: state.turns }
}

/** `house ÷ mine`, at most 1, and 1 when neither paid anything. */
export function ratio(house: number, mine: number): number {
  if (mine <= 0) return 1
  return Math.min(1, house / mine)
}

/** The graded result of a finished run: the house's price over the learner's, and 0 for a night that ended with a ticket unserved. */
export function gradeOf(mine: PoolState, ghost: PoolState): Grade {
  if (unservedOf(mine) > 0) return { score: 0, ok: false }
  const score = ratio(costOf(ghost.counts, ghost.level), costOf(mine.counts, mine.level))
  return { score, ok: score >= mine.level.bar }
}
