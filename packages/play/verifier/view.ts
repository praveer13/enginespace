/**
 * What every rendering of The Tasting draws (`verifier`, GAMES.md §2.5 `view`): the 2D view, the mirror, the tape, the controls and,
 * in W1-T29, the 3D scene all read the object this builds, and none of them keeps a fact the session does not.
 *
 * The numbers that give an answer away (the overlap `min(p, q)`, the residual, α itself) are left out of `rows` until the level lets
 * them be printed: in `overlap` and `chain` after the prediction is committed. A drawing computes its own stacks from p and q, so
 * what it shows is its renderer's call; what the page *prints* is this view's.
 */
import { LAB_DRAWS } from '@es/sim/spec'
import { CARD_COPY } from './cards'
import { markersOf } from './draws'
import { finalFacts } from './facts'
import { GRID } from './levels'
import { isZero, ratio, toFrac, toNumber } from './ratio'
import { askOf, canDraw, countersOf, modelOf, recipeOutput, recipeTv, weightTotal } from './state'
import { roundCost, speedupOf, tokensPerRound } from './gamma'
import { DISHES, DRAW_CAP, GAMMA_MAX, PLATES } from './types'
import type { CardView, GammaView, Meter, RowView, VerifierState, VerifierView } from './types'

/** How many of the latest rounds show their drafted plates on the pass [estimated]. */
export const MARKER_ROUNDS = 12

function rowsOf(s: VerifierState, reveal: boolean): RowView[] {
  const level = s.level
  if (level.id === 'gamma') return []
  const chain = level.id === 'chain'
  const model = modelOf(s)
  const markers = model === null || s.tally.rounds === 0 ? [] : markersOf(model, level.seed, s.tally.rounds, MARKER_ROUNDS, GRID)
  const exact = recipeOutput(s)
  const tasted = level.id === 'mutants' ? s.tasted[s.focus] : null
  const drafts = level.q.length
  return Array.from({ length: drafts + (chain ? 1 : 0) }, (_, i): RowView => {
    const bonus = i >= drafts
    const p = level.p[i]
    const q = bonus ? null : level.q[i]
    const agreed = q === null ? null : p.map((px, x) => Math.min(px, q[x]))
    const reached = s.tally.reached[i] ?? 0
    let out: readonly number[] | null = null
    let outKind: RowView['outKind'] = null
    if (i === 0 && exact !== null) {
      out = exact.map((r) => toNumber(r) * PLATES)
      outKind = 'exact'
    } else if (i === 0 && tasted !== null && tasted !== undefined) {
      out = tasted.counts.map((c) => (c / LAB_DRAWS) * PLATES)
      outKind = 'sampled'
    } else if (level.id !== 'mutants' && reached > 0) {
      out = s.tally.emitted[i].map((c) => (c / reached) * PLATES)
      outKind = 'sampled'
    }
    return {
      index: i,
      kind: bonus ? 'bonus' : 'draft',
      label: bonus ? "the chef's extra course" : chain ? `plate ${i + 1}` : 'the tasting',
      p,
      q,
      agreed: reveal ? agreed : null,
      over: reveal && q !== null ? p.map((px, x) => Math.max(0, q[x] - px)) : null,
      under: reveal && q !== null ? p.map((px, x) => Math.max(0, px - q[x])) : null,
      alpha: reveal && agreed !== null ? toFrac(ratio(agreed.reduce((a, b) => a + b, 0), PLATES)) : null,
      reached,
      kept: s.tally.kept[i] ?? 0,
      sentBack: s.tally.sentBack[i] ?? 0,
      emitted: s.tally.emitted[i],
      out,
      outKind,
      markers: markers.filter((m) => m.row === i),
    }
  })
}

function gammaOf(s: VerifierState): GammaView | null {
  const level = s.level
  if (level.id !== 'gamma') return null
  const pick = s.gamma
  return {
    pick,
    max: GAMMA_MAX,
    alphas: level.alphas,
    cost: level.cost,
    round:
      pick >= 1
        ? {
            tokens: toNumber(tokensPerRound(level.alphas, pick)),
            cost: toNumber(roundCost(level.cost, pick)),
            speedup: toNumber(speedupOf(level.alphas, level.cost, pick)),
          }
        : null,
  }
}

function cardsOf(s: VerifierState): CardView[] | null {
  const level = s.level
  if (level.id !== 'mutants') return null
  return level.cards.map((bug, index) => ({
    index,
    accept: CARD_COPY[bug].accept,
    recover: CARD_COPY[bug].recover,
    label: s.labels[index],
    taste: s.tasted[index],
    coins: s.coined[index],
  }))
}

export function viewOf(s: VerifierState): VerifierView {
  const level = s.level
  // Overlap and chain print what gives the answer away once the prediction is in; the n-gram level once the temperature-0 question is answered.
  const reveal = level.id === 'overlap' || level.id === 'chain' ? s.committed || s.submitted : level.id === 'greedy-ngram' ? s.judged !== null : level.id !== 'gamma'
  const rows = rowsOf(s, reveal)
  const tv = recipeTv(s)
  const meter: Meter | null = tv === null ? null : { tv: toFrac(tv), exact: isZero(tv) }
  return {
    level: level.id,
    title: level.title,
    prompt: level.prompt,
    synthetic: true,
    dishes: DISHES,
    rows,
    present: s.submitted || rows.length === 0 ? null : { from: 0, to: level.id === 'chain' ? level.q.length - 1 : 0 },
    ask: askOf(s),
    done: s.submitted,
    reveal,
    committed: s.committed,
    prediction: s.prediction,
    judged: s.judged,
    weights: s.weights,
    weightTotal: weightTotal(s),
    meter,
    counters: countersOf(s),
    canDraw: canDraw(s),
    drawsLeft: DRAW_CAP - s.tally.rounds,
    gamma: gammaOf(s),
    cards: cardsOf(s),
    focus: s.focus,
    final: s.submitted ? finalFacts(s) : null,
  }
}
