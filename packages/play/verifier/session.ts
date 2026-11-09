/**
 * The Tasting's session (`verifier`): the pure rules of speculative decoding's verifier, in the shape every game follows (GAMES.md
 * §2.5, §10 "Simulation API").
 *
 * The learner is the verifier. The commis (the draft) plates a stack of courses for each dish and the chef (the target) tastes them:
 * she keeps a plate with probability min(1, p ÷ q), sends the first plate she does not keep back, and re-plates it from the dishes the
 * commis under-plated, (p − q)⁺. What goes out is her tasting exactly. The six levels each hold the learner to one part of that:
 *
 *   overlap        predict α, the plates both stacks share;                                  practice
 *   exact          sculpt the re-plating recipe until the output is p, total variation 0;    practice, and graded
 *   chain          predict the courses a round of γ drafts serves;                           practice, and graded
 *   greedy-ngram   temperature 0 and an n-gram draft: q is a single dish;                    practice
 *   mutants        name the bug in five tasting rules;                                       practice
 *   gamma          choose the draft length with the best speedup;                            graded
 *
 * Every grade is computed in rationals, so a pass is a fact and not a sample's luck. The reference ("the house") plays each level by the
 * book, through this same reducer, so its run is a state like the learner's; only the debrief and the grade read it.
 */
import { assertSeed } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import type { Debrief, Grade, Session } from '../types'
import { coinCard, tasteCard } from './cards'
import { advance, emptyTally } from './draws'
import { finalFacts } from './facts'
import { buildLevel, inLevelBand } from './levels'
import { ONE, absolute, compare, div, isZero, ratio, sub, toNumber } from './ratio'
import { CARDS, askOf, canDraw, countersOf, excessPlates, initState, keptPlates, modelOf, positionsOf, recipeOpen, recipeTv, sweepOfLevel, thousandths, tokensOf, weightTotal } from './state'
import { DISHES, DRAW_CAP, GAMMA_MAX, MUTANT_IDS, PLATES, VOCAB } from './types'
import type { VerifierAction, VerifierAsk, VerifierCounters, VerifierLevel, VerifierState, VerifierView } from './types'
import { viewOf } from './view'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The contract                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The level `id` on `seed`. Throws for a level The Tasting does not have. */
export const verifierLevel = (id: string, seed: Seed): VerifierLevel => buildLevel(id, seed)

export const verifierInit = (level: VerifierLevel): VerifierState => initState(level)

/** Whether a seed makes level `id` a fair question (GAMES.md §10, "Band"). */
export function verifierInBand(id: string, seed: Seed): boolean {
  assertSeed(seed)
  return inLevelBand(id, seed)
}

function need(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RangeError(message)
}

const whole = (value: unknown, what: string): number => {
  need(typeof value === 'number' && Number.isInteger(value), `${what} must be a whole number`)
  return value
}

/** The pending decision, or null when the run is over. */
export const verifierAsk = askOf

/** Applies one action. Throws on an illegal one: a recipe that is not open, a weight out of range, a prediction made twice. */
export function verifierReduce(s: VerifierState, a: VerifierAction): VerifierState {
  need(!s.submitted, 'the run is over, so no action can follow')
  const level = s.level
  switch (a.t) {
    case 'sculpt': {
      need(recipeOpen(s), 'there is no recipe to sculpt now')
      const token = whole(a.token, 'the dish')
      need(token >= 0 && token < VOCAB, `there is no dish ${token}`)
      const next = s.weights[token] + whole(a.delta, 'the change')
      need(next >= 0 && next <= PLATES, `the weight of ${DISHES[token]} stays within 0 to ${PLATES}`)
      return withRecipe(s, s.weights.map((w, x) => (x === token ? next : w)))
    }
    case 'preset': {
      need(recipeOpen(s), 'there is no recipe to start now')
      need(a.from === 'p' || a.from === 'q', 'a recipe starts from p or from q')
      return withRecipe(s, [...level[a.from === 'p' ? 'p' : 'q'][0]])
    }
    case 'draw': {
      const n = whole(a.n, 'the number of rounds')
      need(canDraw(s), 'there is nothing to draw rounds from yet')
      need(n >= 1 && n <= DRAW_CAP - s.tally.rounds, `draw from 1 to ${DRAW_CAP - s.tally.rounds} rounds`)
      const model = modelOf(s)
      need(model !== null, 'there is nothing to draw rounds from yet')
      return { ...s, tally: advance(s.tally, model, level.seed, n) }
    }
    case 'commit': {
      need(level.id === 'overlap' || level.id === 'chain', 'this level asks for no prediction')
      need(!s.committed, 'the prediction is already committed')
      const prediction = whole(a.prediction, 'the prediction')
      need(prediction >= 0 && prediction <= (level.id === 'overlap' ? PLATES : 99_999), 'the prediction is out of range')
      return { ...s, committed: true, prediction }
    }
    case 'judge': {
      need(level.id === 'greedy-ngram' && s.judged === null, 'there is no temperature-0 question to answer')
      need(typeof a.kept === 'boolean', 'the plate is kept or sent back')
      return { ...s, judged: a.kept }
    }
    case 'gamma': {
      need(level.id === 'gamma', 'this level has no draft length to choose')
      const k = whole(a.k, 'the draft length')
      need(k >= 1 && k <= GAMMA_MAX, `the draft length is from 1 to ${GAMMA_MAX}`)
      return { ...s, gamma: k }
    }
    case 'taste':
    case 'coins':
    case 'label': {
      need(level.id === 'mutants', 'this level has no cards')
      const card = whole(a.card, 'the card')
      need(card >= 0 && card < CARDS, `there is no card ${card}`)
      if (a.t === 'taste') return { ...s, focus: card, tasted: s.tasted.map((t, i) => (i === card ? tasteCard(level, card) : t)) }
      if (a.t === 'coins') return { ...s, focus: card, coined: s.coined.map((c, i) => (i === card ? coinCard(level, card) : c)) }
      need(a.bug === null || (MUTANT_IDS as readonly string[]).includes(a.bug), 'that is not a bug a card can have')
      return { ...s, focus: card, labels: s.labels.map((l, i) => (i === card ? a.bug : l)) }
    }
    case 'submit': {
      switch (level.id) {
        case 'overlap':
        case 'chain':
          need(s.committed, 'commit a prediction first')
          break
        case 'exact':
          need(weightTotal(s) > 0, 'the recipe is empty: give a dish some weight')
          break
        case 'greedy-ngram':
          need(s.judged !== null, 'answer the temperature-0 question first')
          need(weightTotal(s) > 0, 'the recipe is empty: give a dish some weight')
          break
        case 'mutants':
          need(s.labels.every((label) => label !== null), 'name the bug in every card first')
          break
        case 'gamma':
          need(s.gamma >= 1, 'pick a draft length first')
          break
      }
      return { ...s, submitted: true }
    }
    default:
      throw new RangeError(`The Tasting has no action "${String((a as { t?: unknown }).t)}"`)
  }
}

/** A new recipe is a new rule, so the rounds drawn under the old one are forgotten. */
function withRecipe(s: VerifierState, weights: readonly number[]): VerifierState {
  return { ...s, weights, tally: emptyTally(positionsOf(s.level), VOCAB) }
}

export const verifierDone = (s: VerifierState): boolean => s.submitted

export const verifierScore = countersOf

/* ------------------------------------------------------------------------------------------------------------------ */
/* The reference                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const play = (s: VerifierState, ...actions: VerifierAction[]): VerifierState => actions.reduce(verifierReduce, s)

/** Sculpts the recipe to `target`, a change at a time. */
function sculptTo(s: VerifierState, target: readonly number[]): VerifierState {
  return target.reduce<VerifierState>((state, want, token) => (want === state.weights[token] ? state : verifierReduce(state, { t: 'sculpt', token, delta: want - state.weights[token] })), s)
}

/**
 * The reference run to the end: the house plays each level by the book. It is a run through this reducer, from the level's first
 * state, so it can only do what a learner can.
 */
export function verifierGhost(level: VerifierLevel): VerifierState {
  const start = initState(level)
  switch (level.id) {
    case 'overlap':
      return play(start, { t: 'commit', prediction: keptPlates(level) }, { t: 'submit' })
    case 'exact':
      return play(sculptTo(start, excessPlates(level)), { t: 'submit' })
    case 'chain':
      return play(start, { t: 'commit', prediction: thousandths(tokensOf(level)) }, { t: 'submit' })
    case 'greedy-ngram': {
      // At temperature 0 the plate is kept exactly when the copier copied the favourite. At full temperature q is one-hot, so the
      // residual is p with the copied dish taken out.
      const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
      const judged = play(start, { t: 'judge', kept: level.draft === favourite })
      return play(
        sculptTo(
          judged,
          level.p[0].map((w, x) => (x === level.draft ? 0 : w)),
        ),
        { t: 'submit' },
      )
    }
    case 'mutants':
      return play(
        start,
        ...level.cards.map((bug, card): VerifierAction => ({ t: 'label', card, bug })),
        { t: 'submit' },
      )
    case 'gamma':
      return play(start, { t: 'gamma', k: sweepOfLevel(level).best }, { t: 'submit' })
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grade and debrief                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/** How many cards the learner named right. */
const rightCards = (s: VerifierState): number => (s.level.id === 'mutants' ? s.level.cards.filter((bug, card) => s.labels[card] === bug).length : 0)

/** Whether the learner's answer to the temperature-0 question is right. */
const judgedRight = (s: VerifierState): boolean => {
  if (s.level.id !== 'greedy-ngram' || s.judged === null) return false
  return s.judged === (s.level.draft === s.level.p[0].indexOf(Math.max(...s.level.p[0])))
}

/** The relative error of a prediction of courses per round, exactly. */
function tokensOff(s: VerifierState) {
  const truth = tokensOf(s.level)
  return div(absolute(sub(ratio(s.prediction ?? 0, 1000), truth)), truth)
}

/**
 * The learner's run against the house's (GAMES.md §10, "Scoring and pass"). Each level scores what its beat is about, and its pass bar is
 * the one ASSESSMENT.md §4.3 gives the graded levels: `exact` passes at total variation exactly 0, `chain` within 1% of the exact courses
 * per round, `gamma` on the exact draft length. The practice levels' bars are the game's [estimated]. A score is in [0, 1].
 */
export function verifierGrade(mine: VerifierState): Grade {
  const level = mine.level
  switch (level.id) {
    case 'overlap': {
      const off = Math.abs((mine.prediction ?? 0) - keptPlates(level))
      return { score: clamp01(1 - off / 16), ok: off <= 1 }
    }
    case 'exact': {
      const tv = recipeTv(mine)
      const ok = tv !== null && isZero(tv)
      return { score: ok ? 1 : clamp01(Math.min(0.99, 1 - 4 * toNumber(tv ?? ONE))), ok }
    }
    case 'chain': {
      const off = tokensOff(mine)
      const ok = compare(off, ratio(1, 100)) <= 0
      // Within 1% is the pass bar; beyond it the score falls from 0.8 to nothing at 5% off.
      return { score: ok ? 1 : clamp01(1 - 20 * toNumber(off)), ok }
    }
    case 'greedy-ngram': {
      const tv = recipeTv(mine)
      const exact = tv !== null && isZero(tv)
      const parts = (judgedRight(mine) ? 1 : 0) + (exact ? 1 : 0)
      return { score: parts / 2, ok: parts === 2 }
    }
    case 'mutants': {
      const right = rightCards(mine)
      return { score: right / CARDS, ok: right === CARDS }
    }
    case 'gamma': {
      const { rows, best } = sweepOfLevel(level)
      const picked = rows[mine.gamma - 1]
      const top = rows[best - 1]
      return { score: mine.gamma === best ? 1 : clamp01(Math.min(0.99, toNumber(div(picked.speedup, top.speedup)))), ok: mine.gamma === best }
    }
  }
}

/**
 * The debrief: one sentence that says what the run did, and what it names (GAMES.md §10: "the token with the largest output error").
 * The sentences carry no digit, because the counters beside them are tagged and these are not.
 */
export function verifierDebrief(mine: VerifierState): Debrief {
  const level = mine.level
  const grade = verifierGrade(mine)
  switch (level.id) {
    case 'overlap':
      return {
        sentence: grade.ok
          ? 'You counted the plates both stacks share. That overlap, min(p, q), is the share of the commis\'s plates the chef keeps, and it is α: she keeps what she and the commis agree on and sends back only the commis\'s extra.'
          : 'The chef keeps the plates both stacks share and sends back only the commis\'s extra. Count what the two stacks have in common dish by dish: that overlap, min(p, q), is α.',
        names: null,
      }
    case 'exact': {
      const facts = finalFacts(mine)
      if (grade.ok) {
        return {
          sentence:
            'What goes out is the chef\'s tasting exactly. She keeps every plate she and the commis agree on, and she re-plates from what the commis under-plated, (p − q)⁺, dish by dish. Any other recipe, even one that looks fair, leaves a bias.',
          names: null,
        }
      }
      return {
        sentence: `The distance from her tasting is not zero. A plate that is sent back must be re-plated from exactly what the commis under-plated, (p − q)⁺, dish by dish, and not from p, from q, or from anything renormalised. The dish furthest out is the ${facts.worst === null ? 'one you left empty' : DISHES[facts.worst]}.`,
        names: facts.worst === null ? null : { lever: `dish:${facts.worst}` },
      }
    }
    case 'chain': {
      const facts = finalFacts(mine)
      const guess = (mine.prediction ?? 0) / 1000
      const near = (reading: number | undefined) => reading !== undefined && Math.abs(guess - reading) <= 0.01 * reading
      if (grade.ok) {
        return {
          sentence:
            'Each round serves the course the chef always plates, plus every draft the walk reaches and keeps, so each position adds the product of the acceptances up to it. You summed them within one part in a hundred.',
          names: null,
        }
      }
      if (near(facts.naive?.first)) {
        return { sentence: 'That is the count you get by reading every position as accepting like the first. The acceptances differ down the run, and the walk only gets as far as the plates it keeps, so each position adds the product of its own and every one before it.', names: { lever: 'alpha-of-the-first' } }
      }
      if (near(facts.naive?.mean)) {
        return { sentence: 'That is the count you get by averaging the acceptances and using the average at every position. A product of different acceptances is not the product of their average, so work each position out and multiply along the run.', names: { lever: 'alpha-mean' } }
      }
      return { sentence: 'Each round serves the course the chef always plates, plus every draft the walk reaches and keeps. Work out each position\'s acceptance, multiply along the run, and add up the running products.', names: null }
    }
    case 'greedy-ngram': {
      const facts = finalFacts(mine)
      const right = judgedRight(mine)
      const tv = recipeTv(mine)
      const exact = tv !== null && isZero(tv)
      if (right && exact) {
        return {
          sentence:
            'At temperature zero the chef sends her favourite and nothing else, so the copier\'s plate is kept exactly when it is the favourite. At full temperature its q is a single dish, so the plate is kept as often as p likes that dish, and a plate sent back is re-plated from p with the copied dish taken out.',
          names: null,
        }
      }
      if (!right) {
        return { sentence: 'At temperature zero the chef sends her favourite every time, the tallest stack of her tasting, so the copier\'s plate is kept exactly when it copied that dish and sent back otherwise.', names: { lever: 'temperature-zero' } }
      }
      return {
        sentence: `The copier names one dish, so the commis under-plated every other dish by exactly what the chef would send: the residual is p with the copied dish taken out. The dish furthest out is the ${facts.worst === null ? 'one you left empty' : DISHES[facts.worst]}.`,
        names: facts.worst === null ? null : { lever: `dish:${facts.worst}` },
      }
    }
    case 'mutants':
      return {
        sentence: grade.ok
          ? 'Every rule named. The rules that are wrong in their recipe or their accept step show in a taste of twenty thousand rounds, and the boundary-inclusive comparison hides from it: it moves a dish by a single coin, and only a look at every coin of the accept step finds it.'
          : 'Some rules went unnamed. A taste shows a bias of a few parts in a hundred and cannot see a single coin, and a look at every coin of the accept step sees the accept rule and cannot see a wrong recipe: use both on each card.',
        names: null,
      }
    case 'gamma': {
      const { best } = sweepOfLevel(level)
      if (grade.ok) {
        return {
          sentence:
            'A longer draft adds the product of the acceptances up to it, and only if the walk gets that far, while it adds its cost to every round. The best length is where the next plate stops paying for itself.',
          names: null,
        }
      }
      return {
        sentence: mine.gamma < best
          ? 'The next plate still paid for itself: the courses it adds, weighted by the chance the walk reaches it, outweighed what it costs every round. Plate further ahead.'
          : 'That plate no longer paid for itself: the chance the walk reaches it was too small to outweigh its cost, which every round pays. Plate fewer ahead.',
        names: { lever: mine.gamma < best ? 'too-short' : 'too-long' },
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const verifierSession: Session<VerifierLevel, VerifierState, VerifierAction, VerifierView, VerifierCounters, VerifierAsk> = {
  level: verifierLevel,
  inBand: verifierInBand,
  init: verifierInit,
  ask: verifierAsk,
  reduce: verifierReduce,
  view: viewOf,
  done: verifierDone,
  score: verifierScore,
  ghost: verifierGhost,
  grade: verifierGrade,
  debrief: verifierDebrief,
}

