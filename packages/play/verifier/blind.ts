/**
 * The Tasting's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/verifier-levels.test.ts): what a learner who reads nothing of
 * the scene passes of its three graded levels, `exact`, `chain` and `gamma`. Each strategy is played through the session and graded by the
 * session's own grade, which is computed in rationals, so a pass is a fact and not a sample's luck.
 *
 *   exact   a recipe that ignores the pair (the same weight everywhere, p, q, one dish, a fixed pattern), and the recipe that most seeds'
 *           exact recipes are a multiple of, chosen on the seeds it is played on;
 *   chain   told how many drafts the run has, which the page shows, the one count of courses a round that passes the most runs of that
 *           length within 1% (ASSESSMENT §4.3), chosen on the seeds it is played on;
 *   gamma   the same draft length every time.
 */
import { bandedSeeds, playActions, rowOf, typed } from '../blind'
import type { BlindProbe, BlindProbes, BlindRow } from '../blind'
import { GAMMA_MAX, VOCAB } from './types'
import type { VerifierAction, VerifierLevel, VerifierState } from './types'

/** Banded seeds of `exact` [estimated]: the best strategy passes 0.4% of 1,000 of them [measured 2026-11-09 at 6a791ac, with this task's files], far under the bound. */
export const EXACT_SEEDS = 1000

/**
 * Banded seeds of `chain`, over its three lengths of run [estimated]: 380, 379 and 441 of them, on which the best constant passes 10.3%,
 * 8.2% and 7.5% of the runs of each length [measured 2026-11-09 at 6a791ac, with this task's files].
 */
export const CHAIN_SEEDS = 1200

/**
 * Seeds of `gamma` [estimated]. The draw makes each of the seven best lengths equally likely, so the best constant is right on 1 seed in 7
 * (14.3%) by construction [derived], 0.7 points under the bound. The best of seven samples of that rate is above it by 1.35 standard errors
 * on average [derived: the mean of the largest of seven normal draws], so a sample must be large to stay under 15%: 20,000 puts the standard
 * error at 0.25 points [derived], and the best constant reads 14.5% [measured 2026-11-09 at 6a791ac, with this task's files]. A smaller
 * sample reads this level above the bound on some runs.
 */
export const GAMMA_SEEDS = 20_000

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** The actions that sculpt a recipe from nothing: one move for each dish with weight. */
const recipe = (weights: readonly number[]): VerifierAction[] => weights.flatMap((want, token): VerifierAction[] => (want > 0 ? [{ t: 'sculpt', token, delta: want }] : []))

interface Fixed {
  readonly id: string
  readonly describe: string
  readonly actions: (level: VerifierLevel) => VerifierAction[]
}

/** The recipes that ignore the pair, as tests/play/verifier-levels.test.ts has them. */
const FIXED: readonly Fixed[] = [
  { id: 'even-weights', describe: 'the same weight on every dish', actions: () => recipe(Array.from({ length: VOCAB }, () => 1)) },
  { id: 'from-p', describe: 'the recipe that starts from p', actions: () => [{ t: 'preset', from: 'p' }] },
  { id: 'from-q', describe: 'the recipe that starts from q', actions: () => [{ t: 'preset', from: 'q' }] },
  { id: 'one-dish', describe: 'all the weight on one dish', actions: () => recipe(Array.from({ length: VOCAB }, (_, token) => (token === 2 ? 1 : 0))) },
  { id: 'half-and-half', describe: 'the weights 2, 1, 2, 1, 2, 1', actions: () => recipe(Array.from({ length: VOCAB }, (_, token) => (token % 2 === 0 ? 2 : 1))) },
]

/** `exact`: the fixed recipes, and the recipe that most seeds' exact recipes are a multiple of. */
export const exactProbe: BlindProbe = (session, seeds = EXACT_SEEDS) => {
  const play = typed<VerifierLevel, VerifierState, VerifierAction>(session)
  const banded = bandedSeeds(session, 'exact', seeds)
  const levels = banded.map((seed) => play.level('exact', seed))
  const ghosts = levels.map((level) => play.ghost(level))

  // The direction of a seed's exact recipe: the recipe over the greatest common divisor of its weights, which passes the same seeds.
  const directions = new Map<string, { weights: number[]; seeds: number }>()
  for (const ghost of ghosts) {
    const divisor = ghost.weights.reduce(gcd, 0)
    const weights = divisor === 0 ? [...ghost.weights] : ghost.weights.map((weight) => weight / divisor)
    const key = weights.join(',')
    const known = directions.get(key)
    if (known === undefined) directions.set(key, { weights, seeds: 1 })
    else known.seeds += 1
  }
  let modal: number[] = []
  let most = 0
  for (const direction of directions.values()) {
    if (direction.seeds > most) {
      most = direction.seeds
      modal = direction.weights
    }
  }

  const passes = (actions: (level: VerifierLevel) => VerifierAction[]): number => {
    let passed = 0
    levels.forEach((level, at) => {
      if (play.grade(playActions(play, level, [...actions(level), { t: 'submit' }]), ghosts[at]).ok) passed += 1
    })
    return passed
  }
  const rows: BlindRow[] = FIXED.map((fixed) => rowOf(fixed.id, fixed.describe, passes(fixed.actions), levels.length))
  if (modal.length > 0) rows.push(rowOf('modal-recipe', 'the recipe that most seeds\' exact recipes are a multiple of, chosen on the seeds it is played on', passes(() => recipe(modal)), levels.length))
  return rows
}

/** `chain`: for each length of run, the one count of courses a round that passes the most runs of that length, chosen on those runs. */
export const chainProbe: BlindProbe = (session, seeds = CHAIN_SEEDS) => {
  const play = typed<VerifierLevel, VerifierState, VerifierAction>(session)
  const banded = bandedSeeds(session, 'chain', seeds)
  // The page shows the run, so a learner knows its length: the commis plates as many drafts as there are positions of q.
  const byLength = new Map<number, { level: VerifierLevel; ghost: VerifierState }[]>()
  for (const seed of banded) {
    const level = play.level('chain', seed)
    const group = byLength.get(level.q.length) ?? []
    group.push({ level, ghost: play.ghost(level) })
    byLength.set(level.q.length, group)
  }
  const rows: BlindRow[] = []
  for (const length of [...byLength.keys()].sort((a, b) => a - b)) {
    const group = byLength.get(length) ?? []
    // A count passes a run when it is within 1% of the run's exact count, so the best count is one of the exact counts.
    const candidates = [...new Set(group.map(({ ghost }) => ghost.prediction ?? 0))].sort((a, b) => a - b)
    let best = 0
    for (const count of candidates) {
      let passed = 0
      for (const { level, ghost } of group) {
        if (play.grade(playActions(play, level, [{ t: 'commit', prediction: count }, { t: 'submit' }]), ghost).ok) passed += 1
      }
      best = Math.max(best, passed)
    }
    rows.push(rowOf(`drafts-${length}`, `told that the run has ${length} drafts, the one count of courses a round that passes the most of them, chosen on the runs it is played on`, best, group.length))
  }
  return rows
}

/** `gamma`: each draft length, always. */
export const gammaProbe: BlindProbe = (session, seeds = GAMMA_SEEDS) => {
  const play = typed<VerifierLevel, VerifierState, VerifierAction>(session)
  const banded = bandedSeeds(session, 'gamma', seeds)
  const passes = new Array<number>(GAMMA_MAX + 1).fill(0)
  for (const seed of banded) {
    const level = play.level('gamma', seed)
    const ghost = play.ghost(level)
    for (let k = 1; k <= GAMMA_MAX; k++) {
      if (play.grade(playActions(play, level, [{ t: 'gamma', k }, { t: 'submit' }]), ghost).ok) passes[k] += 1
    }
  }
  return Array.from({ length: GAMMA_MAX }, (_, at) => rowOf(`always-${at + 1}`, `always plate ${at + 1} ahead`, passes[at + 1], banded.length))
}

/** The probes of The Tasting's graded levels. */
export const VERIFIER_BLIND: BlindProbes = { exact: exactProbe, chain: chainProbe, gamma: gammaProbe }
