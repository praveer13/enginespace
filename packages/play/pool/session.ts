/**
 * The Reach-In's session (`pool`): the pure rules of the game, in the shape every game follows (GAMES.md §2.5, §8 "Simulation API").
 *
 * The learner is the KV manager's policy under memory pressure: hang a ticket or none, dump the pans a ticket needs room from, pull a
 * ticket when the line cannot grow, bring a recipe kit in before its ticket hangs. The pages, the hits and every refusal are the sim's
 * (`packages/sim/kv`, through manager.ts); the order of a step is engine.ts; the levels and their bands are levels.ts and bands.ts; this
 * file is the contract around them:
 *   level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief.
 *
 * The reference ("the house", policy.ts) plays the same seed in lockstep. It is the ghost: only the debrief and the grade read it, and its
 * price is the target. A learner may beat it on some seeds, and the score caps at 1 (§2.1).
 */
import type { Seed } from '@es/sim/core'
import { kvBlocksHeld, kvHitLength } from '@es/sim/kv'
import type { KvSpec } from '@es/sim/kv'
import type { Session } from '../types'
import { inLevelBand } from './bands'
import { debriefOf } from './debrief'
import { advance, applyAction, freeze, freshWork, peek, playPolicy, thaw } from './engine'
import { buildLevel } from './levels'
import { house } from './policy'
import { gradeOf, scoreOf } from './score'
import type { PoolAction, PoolAsk, PoolLevel, PoolScore, PoolState, PoolView } from './types'
import { poolView } from './view'

/** The level `id` on `seed`. Throws for a level The Reach-In does not have. */
export const poolLevel = (id: string, seed: Seed): PoolLevel => buildLevel(id, seed)

/** The level's first state: the night run to the first decision. */
export function poolInit(level: PoolLevel): PoolState {
  const w = freshWork(level)
  advance(w)
  return freeze(w)
}

/** The pending decision, or none: what the lamp falls on. */
export const poolAsk = (s: PoolState): PoolAsk | null => s.ask

/** Applies one action. Throws on an illegal one: a ticket that cannot hang, pans that are not cached, the wrong number of them. */
export function poolReduce(s: PoolState, a: PoolAction): PoolState {
  const w = thaw(s)
  applyAction(w, a)
  advance(w)
  return freeze(w)
}

/** The reference run to the end, from the level's start: the house plays every ask (policy.ts). */
export function poolGhost(level: PoolLevel): PoolState {
  return freeze(playPolicy(freshWork(level), house))
}

/** The action the house takes for the open ask of a state (GAMES.md §8, `poolReference`). */
export function poolReference(s: PoolState, ask: PoolAsk): PoolAction {
  return house(peek(s), ask)
}

/** Pans that group `group` holds for a request of `tokens` tokens (GAMES.md §8, `blocksHeld`), by the sim's rule. */
export const blocksHeld = (spec: KvSpec, group: string, tokens: number): number => kvBlocksHeld(spec, group, tokens)

/** The hit a prompt would get from the pool as it stands, and what each station alone would serve (GAMES.md §8, `hitLength`). */
export const hitLength = (s: PoolState, prompt: readonly number[], adapter: number | null) => kvHitLength(s.level.spec, s.kv, prompt, adapter)

/** Kits an engine keeps on its shelf, as vLLM's `max_loras` does by default (vllm.lora.slot-count, D-042). */
export const SHELF_SLOTS = 1

/**
 * The same night with the kits on a shelf of fixed slots, as the engines do at the pins (D-042): a kit takes a slot and no pans, and at
 * most `SHELF_SLOTS` kits are in at once. The house plays it. The `adapters` debrief puts its counts beside the learner's (GAMES.md §8).
 */
export function slotBaseline(level: PoolLevel): PoolScore {
  const shelf: PoolLevel = { ...level, spec: { ...level.spec, adapterSlots: SHELF_SLOTS } }
  return scoreOf(freeze(playPolicy(freshWork(shelf, true), house)))
}

export const poolSession: Session<PoolLevel, PoolState, PoolAction, PoolView, PoolScore, PoolAsk> = {
  level: poolLevel,
  inBand: inLevelBand,
  init: poolInit,
  ask: poolAsk,
  reduce: poolReduce,
  view: poolView,
  done: (s) => s.done,
  score: scoreOf,
  ghost: poolGhost,
  grade: gradeOf,
  debrief: debriefOf,
}
