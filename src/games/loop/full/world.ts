import { closeCards } from '@es/play/loop/full/close'
import type { FullLaneSource } from '@es/play/loop/full/lanes'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { nightAt, nightOf } from '@es/play/loop/full/night'
import type { CloseCards, FullLevel, StageWorld } from '@es/play/loop/full/types'
import type { Seed } from '@es/sim/core'

/*
 * What the full levels' views read of a stage's world beyond the run's view (REDESIGN §3.7): the stage's own world on its seed, the cost
 * card's prices for its strip, and the reference run's lanes. All of it is the model's pure output, computed once for a level and a seed
 * and kept for the page: the view holds none of it, and no learner's action changes it.
 */

const levels = new Map<string, FullLevel>()

/** The level `id` on `seed`, built once. */
export function levelOn(id: string, seed: Seed): FullLevel {
  const key = `${id}|${seed}`
  const hit = levels.get(key)
  if (hit !== undefined) return hit
  const level = buildFullLevel(id, seed)
  if (levels.size > 16) levels.clear()
  levels.set(key, level)
  return level
}

/** The stage `at` of a level on a seed. */
export const worldOf = (id: string, seed: Seed, at: number): StageWorld => levelOn(id, seed).stages[at]

const cards = new Map<string, CloseCards>()

/** The cost card's prices for a stage: a decode forward at a few batch sizes, and each runner's host calls. */
export function pricesOf(id: string, seed: Seed, at: number): CloseCards {
  const key = `${id}|${seed}|${at}`
  const hit = cards.get(key)
  if (hit !== undefined) return hit
  const prices = closeCards(worldOf(id, seed, at))
  if (cards.size > 32) cards.clear()
  cards.set(key, prices)
  return prices
}

const references = new Map<string, FullLaneSource | null>()

/** The reference run's lanes on a stage: the house's configuration, served to its end. Null where the engine refuses it. */
export function referenceOf(id: string, seed: Seed, at: number): FullLaneSource | null {
  const key = `${id}|${seed}|${at}`
  const cached = references.get(key)
  if (cached !== undefined) return cached
  const world = worldOf(id, seed, at)
  const night = nightOf(world, world.house)
  let source: FullLaneSource | null = null
  if (night !== null && night.fires.length > 0) {
    const end = nightAt(night, night.fires.length, world.house, world.slots)
    source = { slots: world.slots, clockUs: end.kitchen.clockUs, cpu: end.kitchen.cpu, fires: end.fires }
  }
  if (references.size > 32) references.clear()
  references.set(key, source)
  return source
}
