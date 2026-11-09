/**
 * What a finished run of The Tasting has to say for itself (`verifier`): the exact truths its debrief prints, computed from the level
 * and the learner's answer in rationals. They exist only once a run is over (`view` hides them before), because several of them are
 * the answer.
 */
import { memberCase, pairOfLevel } from './cards'
import { caseOutput, caseTv, topOf, tvExact, wrongRules } from './exact'
import { naiveTokens } from './levels'
import { ZERO, absolute, compare, isZero, ratio, sub, toFrac, toNumber } from './ratio'
import type { Ratio } from './ratio'
import { alphasOf, distsOf, keptPlates, recipeOutput, sweepOfLevel, tokensOf } from './state'
import type { FinalFacts, SweepRowView, VerifierState } from './types'

/** The dish whose output is furthest from the chef's under the learner's recipe, or null when the recipe is exact or empty. */
export function worstDish(s: VerifierState): number | null {
  const out = recipeOutput(s)
  if (out === null) return null
  const { p } = distsOf(s.level)
  let worst: number | null = null
  let far: Ratio = ZERO
  out.forEach((o, y) => {
    const gap = absolute(sub(o, ratio(p[0].weights[y], p[0].total)))
    if (compare(gap, far) > 0) {
      far = gap
      worst = y
    }
  })
  return worst
}

const EMPTY: FinalFacts = { alphaPlates: null, rules: null, worst: null, tokens: null, naive: null, sweep: null, truth: null, keptAtZero: null, favourite: null }

export function finalFacts(s: VerifierState): FinalFacts {
  const level = s.level
  switch (level.id) {
    case 'overlap':
      return { ...EMPTY, alphaPlates: keptPlates(level) }
    case 'exact':
    case 'greedy-ngram': {
      const { p, q } = distsOf(level)
      const rules = wrongRules(p[0], q[0])
        .map((rule) => ({ id: rule.id, tv: caseTv(rule, p[0], q[0]) }))
        // On a one-hot q the residual is p without the draft, so that rule is exact there and not a wrong one.
        .filter((rule) => !isZero(rule.tv))
        .map((rule) => ({ id: rule.id, tv: toFrac(rule.tv) }))
      const best = topOf(p[0])
      const copier = level.id === 'greedy-ngram'
      return { ...EMPTY, rules, worst: worstDish(s), keptAtZero: copier ? level.draft === best : null, favourite: copier ? best : null }
    }
    case 'chain': {
      const naive = naiveTokens(alphasOf(level))
      return { ...EMPTY, tokens: toFrac(tokensOf(level)), naive: { first: toNumber(naive.first), mean: toNumber(naive.mean) } }
    }
    case 'gamma': {
      const { rows, best } = sweepOfLevel(level)
      const sweep: SweepRowView[] = rows.map((row) => ({ gamma: row.gamma, tokens: toNumber(row.tokens), cost: toNumber(row.cost), speedup: toNumber(row.speedup), best: row.gamma === best }))
      return { ...EMPTY, sweep }
    }
    case 'mutants': {
      const { p, q } = pairOfLevel(level)
      const truth = level.cards.map((bug) => ({ bug, tv: toFrac(tvExact(caseOutput(memberCase(bug, p, q), p, q), p)) }))
      return { ...EMPTY, truth }
    }
  }
}
