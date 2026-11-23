/**
 * Trace attribution's levels (GAMES.md §6; TR3's design, "Before you write", items 5 and 6): which cases a level and a seed draw. The
 * model (`packages/sim/trace`) draws every trace and keeps each case to its band; a level here is the list of cases, a practice level holding
 * one and a graded one three new steps.
 *
 * `pinned` and `yours` are neither built nor registered: `verify:games` builds every registered level at its practice seed, and neither has
 * a trace to build from. A learner is shown a plain waiting line in their place (copy of the game's page).
 */
import { assertSeed } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { drawCases, isGraded } from './engine'
import { HUNT_GRADED, HUNT_LEVEL_IDS } from './types'
import type { HuntLevel, HuntLevelId } from './types'

export const isLevelId = (id: string): id is HuntLevelId => (HUNT_LEVEL_IDS as readonly string[]).includes(id)

/** The levels that are graded (GAMES.md §6). `attribute` is the Prove level. */
export const GRADED: readonly HuntLevelId[] = HUNT_GRADED

const built = new Map<string, HuntLevel>()

/** Most levels kept: a level is plain data that nothing changes, and the gate and the probes ask for the same ones again and again. */
const KEPT = 512

/** The level `id` on `seed`. Throws for a level that Trace attribution does not have, and for a seed that draws no case in the model's band. */
export function buildLevel(id: string, seed: Seed): HuntLevel {
  if (!isLevelId(id)) throw new RangeError(`Trace attribution has no level "${id}"`)
  assertSeed(seed)
  const key = `${id}/${seed}`
  let level = built.get(key)
  if (level === undefined) {
    const cases = drawCases(id, seed)
    level = { id, seed, graded: isGraded(id, seed), needed: cases.length, cases }
    if (built.size >= KEPT) built.clear()
    built.set(key, level)
  }
  return level
}
