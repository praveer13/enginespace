/**
 * Rounds drawn on The Tasting's pass (`verifier`, GAMES.md §10: "Watch seeded drafts drop"). A round is one speculative step: the
 * commis plates γ courses ahead from q, the chef tastes them in order against p, stops at the first plate she sends back, re-plates
 * there, and plates one extra course herself when she kept them all (sim/spec verify.ts).
 *
 * Round r of a run draws from its own stream, `splitmix32u(seed ^ hash32('verifier/round') ^ (r + 1) × φ)`, so a round is a pure
 * function of the seed and its number: drawing 20 rounds and then 80 gives the same 100 as drawing 100 at once, the markers of the
 * latest rounds can be drawn again from the seed alone, and a state needs no generator inside it (a closure has no canonical JSON).
 *
 * A `Tally` is what has gone out: courses served by position and dish, and how many drafts were kept or sent back.
 */
import { below, hash32, splitmix32u } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { EXACT_RULES, draftChain, runChain, walkCdf } from '@es/sim/spec'
import type { ChainResult, ChainVerifier, Dist, VerifyRules } from '@es/sim/spec'
import type { MarkerView, Tally } from './types'

/** What a round runs on: the distributions of each position and the sampler that judges the drafts. */
export interface SamplerModel {
  readonly p: readonly Dist[]
  readonly q: readonly Dist[]
  readonly verify: ChainVerifier
}

const ROUND_SALT = hash32('verifier/round')
/** The golden-ratio multiplier of splitmix32 (kernelspace's rng.ts): spreads the round numbers across the seed space. */
const SPREAD = 0x9e3779b1

/** The seed of round `r` of a run on `seed`. */
export const roundSeed = (seed: Seed, r: number): Seed => (seed ^ ROUND_SALT ^ Math.imul(r + 1, SPREAD)) >>> 0

/**
 * The exact accept rule with a recipe of the learner's own: a rejected plate is replaced from `weights` by one draw of their integer
 * total. The recipe must have weight (the session asks for it before it draws).
 */
export function recipeRules(weights: readonly number[]): VerifyRules {
  const total = weights.reduce((a, b) => a + b, 0)
  return {
    accept: EXACT_RULES.accept,
    recover: (_p, _q, rng) => {
      const draw = below(rng, total)
      return { kind: 'recovered', draw, total, token: walkCdf(weights, draw) }
    },
  }
}

/** The sampler of a recipe: the exact accept rule and the recipe's re-plating. */
export const recipeVerifier =
  (weights: readonly number[]): ChainVerifier =>
  (p, q, draft, rng) =>
    runChain(recipeRules(weights), p, q, draft, rng)

/** Round `r` of a run: the drafts, the walk and what the walk served. */
export function playRound(model: SamplerModel, seed: Seed, r: number): ChainResult {
  const rng = splitmix32u(roundSeed(seed, r))
  const draft = draftChain(model.q, rng)
  return model.verify(model.p, model.q, draft, rng)
}

/** Nothing has gone out: `positions` positions (the draft positions and the bonus one) over `vocab` dishes. */
export function emptyTally(positions: number, vocab: number): Tally {
  const zeros = (n: number) => Array.from({ length: n }, () => 0)
  return {
    rounds: 0,
    tokens: 0,
    reached: zeros(positions),
    kept: zeros(positions - 1),
    sentBack: zeros(positions - 1),
    emitted: Array.from({ length: positions }, () => zeros(vocab)),
  }
}

/** The tally after `n` more rounds. */
export function advance(tally: Tally, model: SamplerModel, seed: Seed, n: number): Tally {
  const reached = [...tally.reached]
  const kept = [...tally.kept]
  const sentBack = [...tally.sentBack]
  const emitted = tally.emitted.map((row) => [...row])
  let tokens = tally.tokens
  for (let r = tally.rounds; r < tally.rounds + n; r++) {
    const round = playRound(model, seed, r)
    round.steps.forEach((step, i) => {
      if (step.accepted) kept[i] += 1
      else sentBack[i] += 1
    })
    for (let i = 0; i <= round.accepted; i++) {
      reached[i] += 1
      emitted[i][round.tokens[i]] += 1
    }
    tokens += round.accepted + 1
  }
  return { rounds: tally.rounds + n, tokens, reached, kept, sentBack, emitted }
}

/**
 * The drafted plates of the latest `count` rounds before round `upTo`, oldest first: each is the dish drafted, the coin's height on
 * the dish's commis stack in plates, and whether the walk kept it. `plate` is how many units of a coin make one plate.
 */
export function markersOf(model: SamplerModel, seed: Seed, upTo: number, count: number, plate: number): MarkerView[] {
  const markers: MarkerView[] = []
  for (let r = Math.max(0, upTo - count); r < upTo; r++) {
    playRound(model, seed, r).steps.forEach((step, row) => {
      markers.push({ row, token: step.token, height: step.u / plate, kept: step.accepted, round: r })
    })
  }
  return markers
}
