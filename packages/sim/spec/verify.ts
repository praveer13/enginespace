// The verifier of speculative decoding, exact in integers (ARCHITECTURE §5.5; Leviathan, Kalman and Matias 2023, arXiv 2211.17192).
//
// A round drafts γ tokens, token i from q[i], and the target checks them in order against p[i], with p[γ] kept for the bonus token:
//   - accept: draw a coin u uniformly from [0, q_x) and accept the draft x when u < p_x. That accepts with probability min(1, p_x / q_x)
//     with no floating point, because p and q share one total;
//   - on the first rejection, draw from the residual (p − q)⁺ by its integer total, and stop. The token replaces the draft;
//   - when all γ drafts are accepted, draw the bonus token from p[γ].
// The round emits the accepted drafts and then that one token, so it emits between 1 and γ + 1 tokens, and every emitted token is
// distributed exactly as p at its position (the chi-square test of `check.ts` and the exhaustive enumeration in tests/sim/spec.test.ts
// both check it). The draws, in order: `below(rng, q_x)` per visited position, then `below(rng, R)` for the residual of total R, or
// `below(rng, total)` for the bonus. A draw is one `below`, which consumes at least one uint32 of the stream (core/rng.ts).
//
// The same loop runs the bestiary (bestiary.ts): a rule set says how a coin is judged and how a rejection recovers, and the
// reference rules are the exact ones.

import { below } from '../core/rng'
import type { Rng } from '../core/rng'
import { assertDist, drawToken, residualDist, walkCdf } from './dist'
import type { Dist } from './dist'

/** One draft position the walk reached. */
export interface ChainStep {
  /** The drafted token x. */
  readonly token: number
  /** The coin, uniform in [0, q_x): the draft lands in the accepted base when it is below p_x, and in the reject cap otherwise. */
  readonly u: number
  readonly accepted: boolean
}

/** How a round ended: with the token that replaced the first rejected draft, or with the bonus token after the last accepted one. */
export interface ChainEnd {
  readonly kind: 'recovered' | 'bonus'
  /** The draw, uniform in [0, total). */
  readonly draw: number
  /** The range of the draw: the residual's total for a recovery, p[γ]'s total for the bonus. */
  readonly total: number
  readonly token: number
}

export interface ChainResult {
  /** The positions the walk visited, in order. It ends at the first rejection, and the positions after that are unused. */
  readonly steps: readonly ChainStep[]
  /** How many drafts were accepted: 0 to γ. */
  readonly accepted: number
  readonly end: ChainEnd
  /** What the round emits: the accepted drafts, then `end.token`. Its length is `accepted + 1`. */
  readonly tokens: readonly number[]
}

/** Anything that verifies a chain: the reference and each member of the bestiary have this shape. */
export type ChainVerifier = (p: readonly Dist[], q: readonly Dist[], draft: readonly number[], rng: Rng) => ChainResult

/** What a rule set decides. The exact rules are `EXACT_RULES`; a wrong sampler changes one of the two. */
export interface VerifyRules {
  /** Whether the draft x, whose weights are p_x and q_x, is accepted for the coin u in [0, q_x). */
  accept(px: number, qx: number, u: number): boolean
  /** The token that replaces a rejected draft at a position with distributions p and q: its draw, the range of the draw and the token. */
  recover(p: Dist, q: Dist, rng: Rng): ChainEnd
}

/** The draw from the residual (p − q)⁺, and the token it picks. It throws when p equals q: no draft is rejected there, so there is nothing to recover. */
export function recoverFromResidual(p: Dist, q: Dist, rng: Rng, inclusive = false): ChainEnd {
  const residual = residualDist(p, q)
  if (residual.total === 0) throw new RangeError('p equals q here, so there is no residual to recover from')
  const draw = below(rng, residual.total)
  return { kind: 'recovered', draw, total: residual.total, token: walkCdf(residual.weights, draw, inclusive) }
}

/** The exact rules: accept when u < p_x, and recover from the residual. */
export const EXACT_RULES: VerifyRules = {
  accept: (px, _qx, u) => u < px,
  recover: (p, q, rng) => recoverFromResidual(p, q, rng),
}

/** The token after the last draft, drawn from p[γ] by its integer weights. */
export function bonusEnd(last: Dist, rng: Rng): ChainEnd {
  const draw = below(rng, last.total)
  return { kind: 'bonus', draw, total: last.total, token: walkCdf(last.weights, draw) }
}

/**
 * Runs one round under `rules` with no validation (`assertChain` does that). Each draft must have a positive q, since a coin
 * is drawn from [0, q_x).
 */
export function runChain(rules: VerifyRules, p: readonly Dist[], q: readonly Dist[], draft: readonly number[], rng: Rng): ChainResult {
  const steps: ChainStep[] = []
  const tokens: number[] = []
  for (let i = 0; i < draft.length; i++) {
    const x = draft[i]
    const qx = q[i].weights[x]
    const u = below(rng, qx)
    const accepted = rules.accept(p[i].weights[x], qx, u)
    steps.push({ token: x, u, accepted })
    if (!accepted) {
      const end = rules.recover(p[i], q[i], rng)
      tokens.push(end.token)
      return { steps, accepted: i, end, tokens }
    }
    tokens.push(x)
  }
  const end = bonusEnd(p[draft.length], rng)
  tokens.push(end.token)
  return { steps, accepted: draft.length, end, tokens }
}

/**
 * Throws unless p and q describe a chain: γ draft distributions q[0..γ), γ + 1 target distributions p[0..γ] (the last is the bonus
 * token's), one vocabulary and one total at every position, and, with `draft`, γ drafted tokens that are in the vocabulary and that
 * the drafter could have proposed (q_x > 0).
 */
export function assertChain(p: readonly Dist[], q: readonly Dist[], draft?: readonly number[]): void {
  if (p.length !== q.length + 1) {
    throw new RangeError(`${q.length} drafts need ${q.length + 1} target distributions, one for each position and one for the bonus token, got ${p.length}`)
  }
  const size = p[0].weights.length
  p.forEach((d, i) => {
    assertDist(d, `p[${i}]`)
    if (d.weights.length !== size) throw new RangeError(`p[${i}] has ${d.weights.length} tokens, and p[0] has ${size}: a chain has one vocabulary`)
  })
  q.forEach((d, i) => {
    assertDist(d, `q[${i}]`)
    if (d.weights.length !== size) throw new RangeError(`q[${i}] has ${d.weights.length} tokens, and p[0] has ${size}: a chain has one vocabulary`)
    if (d.total !== p[i].total) throw new RangeError(`q[${i}] adds up to ${d.total} and p[${i}] to ${p[i].total}: the accept step compares weights, so they share one total`)
  })
  if (draft === undefined) return
  if (draft.length !== q.length) throw new RangeError(`${q.length} draft distributions need ${q.length} drafted tokens, got ${draft.length}`)
  draft.forEach((x, i) => {
    if (!Number.isInteger(x) || x < 0 || x >= size) throw new RangeError(`draft[${i}] = ${x} is not a token from 0 to ${size - 1}`)
    if (q[i].weights[x] === 0) throw new RangeError(`draft[${i}] = ${x} has weight 0 in q[${i}], so the drafter could not have proposed it`)
  })
}

/**
 * One exact round: the drafts `draft` (token i drawn from q[i]) checked against p, with the draws of `rng` (see the file's header
 * for their order). It validates its arguments, which costs a pass over the distributions: a loop of many rounds on one p and q
 * calls `assertChain` once and `runChain(EXACT_RULES, …)` for each round.
 */
export function verifyChain(p: readonly Dist[], q: readonly Dist[], draft: readonly number[], rng: Rng): ChainResult {
  assertChain(p, q, draft)
  return runChain(EXACT_RULES, p, q, draft, rng)
}

/** The exact rules as a `ChainVerifier` without validation, for the check harness and the bestiary. */
export const exactChain: ChainVerifier = (p, q, draft, rng) => runChain(EXACT_RULES, p, q, draft, rng)

/** The draft chain of a round: token i drawn from q[i] by `drawToken`, in order. */
export function draftChain(q: readonly Dist[], rng: Rng): number[] {
  return q.map((d) => drawToken(d, rng))
}
