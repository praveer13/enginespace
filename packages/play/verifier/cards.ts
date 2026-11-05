/**
 * The five cards of `mutants` (`verifier`, GAMES.md §10): five tasting rules to audit, each one of the sim's bestiary members that a
 * single position can show (sim/spec bestiary.ts; the sixth, FLy, needs a run of two to defer a rejection). A card carries its rule in two
 * lines, and the learner has two instruments to look at it with, the two the `rejection-sampler` forge lab's host runs on a learner's
 * code (A§8.3):
 *
 *   taste   20,000 rounds of the rule on this seed's pair, and the chi-square of the first course served against p at the lab's level.
 *           It sees a bias of a few percent, and it cannot see a bias of one coin in 65,536.
 *   coins   every coin of the accept step, 2^16 of them: for each dish, exactly min(p, q) of the q coins must keep the plate. It sees the
 *           boundary-inclusive comparison on every pair, and the rules that are wrong only in their recipe pass it.
 *
 * The cards are dealt in an order of the seed's. The names the learner chooses from are the bugs, in a few words each.
 */
import { rngFor } from '@es/sim/core'
import { BESTIARY, LAB_LEVEL, acceptStepViolations, seedTest } from '@es/sim/spec'
import type { Dist, Member } from '@es/sim/spec'
import type { Seed } from '@es/sim/core'
import { shiftedExcess } from './exact'
import type { RuleCase } from './exact'
import { toDist } from './levels'
import { MUTANT_IDS } from './types'
import type { Coin, MutantId, Taste, VerifierLevel } from './types'

export interface CardCopy {
  /** The accept step, in the words of its code. */
  readonly accept: string
  /** The recovery, in the words of its code. */
  readonly recover: string
  /** The bug, named as the learner chooses it. */
  readonly bug: string
}

export const CARD_COPY: Readonly<Record<MutantId, CardCopy>> = {
  'accept-if-p-over-q': {
    accept: 'Keep the plate when p(x) > q(x) and send it back otherwise, with no coin.',
    recover: 'Re-plate from (p − q)⁺.',
    bug: 'Keeps a plate by comparing p and q, with no coin',
  },
  'resample-from-p': {
    accept: 'Draw a coin u below q(x), and keep the plate when u < p(x).',
    recover: 'Re-plate from p.',
    bug: 'Re-plates from p instead of the residual',
  },
  'resample-from-q': {
    accept: 'Draw a coin u below q(x), and keep the plate when u < p(x).',
    recover: 'Re-plate from q.',
    bug: 'Re-plates from q',
  },
  'residual-off-by-one': {
    accept: 'Draw a coin u below q(x), and keep the plate when u < p(x).',
    recover: 'Re-plate from (p − q)⁺, then serve the dish one along from the one drawn.',
    bug: 'Serves the dish one along from the residual draw',
  },
  'boundary-inclusive': {
    accept: 'Draw a coin u below q(x), and keep the plate when u ≤ p(x).',
    recover: 'Re-plate from (p − q)⁺, walking its running total with ≤.',
    bug: 'Compares with ≤ where < is right (SGLang PR #35798)',
  },
}

/** The sim's bestiary member behind a card. */
export function memberOf(id: MutantId): Member {
  const member = BESTIARY.find((candidate) => candidate.id === id)
  if (member === undefined) throw new Error(`the bestiary has no member "${id}"`)
  return member
}

/** A card as the pair of exact rules it is: what `outputExact` takes, for the card's distance from p. */
export function memberCase(id: MutantId, p: Dist, q: Dist): RuleCase {
  switch (id) {
    case 'accept-if-p-over-q':
      return { id, accept: 'p-over-q', recovery: { kind: 'excess' } }
    case 'resample-from-p':
      return { id, accept: 'min-ratio', recovery: { kind: 'weights', w: p.weights } }
    case 'resample-from-q':
      return { id, accept: 'min-ratio', recovery: { kind: 'weights', w: q.weights } }
    case 'residual-off-by-one':
      return { id, accept: 'min-ratio', recovery: { kind: 'weights', w: shiftedExcess(p, q) } }
    case 'boundary-inclusive':
      return { id, accept: 'coin-at-most-p', recovery: { kind: 'excess', inclusive: true } }
  }
}

const mutantsOf = (level: VerifierLevel): readonly MutantId[] => {
  if (level.id !== 'mutants') throw new RangeError(`level ${level.id} has no cards`)
  return level.cards
}

/** The pair a `mutants` level audits. */
export const pairOfLevel = (level: VerifierLevel): { p: Dist; q: Dist } => ({ p: toDist(level.p[0]), q: toDist(level.q[0]) })

/** The seed of card `card`'s taste: its own stream, so tasting a card twice gives the same 20,000 rounds. */
export const tasteSeed = (level: VerifierLevel, card: number): Seed => rngFor(level.seed, `verifier/taste/${card}`)()

/** Taste a card: the lab's chi-square on 20,000 rounds of its rule. */
export function tasteCard(level: VerifierLevel, card: number): Taste {
  const id = mutantsOf(level)[card]
  if (id === undefined) throw new RangeError(`there is no card ${card}`)
  const { p, q } = pairOfLevel(level)
  const test = seedTest(tasteSeed(level, card), [p, p], [q], memberOf(id).verify, LAB_LEVEL)
  return { stat: test.stat, df: test.df, critical: test.critical, rejected: test.rejected, counts: test.counts }
}

/** Check every coin of a card's accept step: the dishes that keep some other number of coins than min(p, q). */
export function coinCard(level: VerifierLevel, card: number): Coin[] {
  const id = mutantsOf(level)[card]
  if (id === undefined) throw new RangeError(`there is no card ${card}`)
  const { p, q } = pairOfLevel(level)
  return acceptStepViolations(memberOf(id).accept, p, q).map((v) => ({ token: v.token, kept: v.accepted, should: v.expected, of: v.qx }))
}

/** The card order a `mutants` level deals, as ids. */
export const cardsOf = mutantsOf

/** Every bug a card can be. */
export const BUGS: readonly MutantId[] = MUTANT_IDS
