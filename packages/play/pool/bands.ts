/**
 * The band of each level (GAMES.md §2.1, §8 "Band"): which seeds make a fair question.
 *
 * A seed is fair when the house serves every ticket within the step cap, the night has the structure the level teaches, and none of the
 * plain plays (below) comes within a tenth of the house's price. "Within a tenth" is the test GAMES.md sets for the same thing ("LRU
 * without tail-first freeing loses >= 10% more recomputed tokens") and is [estimated]: the plain play of every in-band seed scores
 * `NAIVE_AT_MOST` or less, and fails the pass mark. The engine's pool is among the plain plays, and on a level with recipe kits the
 * engine that loads a kit only when nothing else can run (`lazy`) is too: that is the naive play of the level (`naiveOf`).
 *
 * The structure is per level. Every level needs five or more dumps, so that eviction is part of the night. The evict level also needs two
 * or more returning tickets whose hit a station other than full attention cut short, as the design says ("≥ 2 sessions have a hit
 * bounded by a sliding window"), and the levels with kits need tickets of both kits.
 */
import type { Seed } from '@es/sim/core'
import { freshWork, playPolicy } from './engine'
import type { AdmitNote, Policy, PoolWork } from './engine'
import { buildLevel, isLevelId } from './levels'
import { blindLast, engine, headFirst, house, lazy, newest } from './policy'
import { costOf, ratio, unservedOf } from './score'
import type { PoolLevel, PoolLevelId } from './types'

/** What the naive play may score on an in-band seed, at most: a tenth under the house's price. */
export const NAIVE_AT_MOST = 0.9

/** Dumps the house's night needs, at least. */
export const DUMPS_AT_LEAST = 5

/** Returning tickets whose hit a window cut short, at least, on the evict level. */
export const BOUND_AT_LEAST = 2

/** The naive play of a level: the pool as an engine keeps it. */
export const naiveOf = (level: PoolLevel): Policy => (level.kits.length > 0 ? lazy : engine)

/** A night played under a policy, in bulk (no events), with every hanging noted when `trace` is set. */
export function play(level: PoolLevel, policy: Policy, trace = false): PoolWork {
  const w = freshWork(level, true)
  if (trace) w.trace = []
  return playPolicy(w, policy)
}

/** Hangings of a returning ticket whose hit a station other than full attention bound: the hit a sliding window cut short. */
export const boundHangings = (notes: readonly AdmitNote[]): number => notes.filter((note) => note.turn > 0 && note.full > note.hit).length

/** How many different kits tickets of the night use. */
export function kitsUsed(level: PoolLevel): number {
  const used: number[] = []
  for (const req of level.reqs) if (req.adapter !== null && !used.includes(req.adapter)) used.push(req.adapter)
  return used.length
}

/** The structure a level needs of the house's night. */
function structured(id: PoolLevelId, level: PoolLevel, home: PoolWork): boolean {
  if (home.mgr.removed < DUMPS_AT_LEAST) return false
  if (id === 'evict' && boundHangings(home.trace ?? []) < BOUND_AT_LEAST) return false
  if ((id === 'adapters' || id === 'manager') && kitsUsed(level) < 2) return false
  return true
}

/**
 * The plain plays of a level: the strategies that need no understanding of the rule, each of which must lose on a fair seed. They are the
 * engine's pool (on a level with kits, the engine that loads a kit only when nothing else can run: `naiveOf`), and three strategies that
 * choose by position in the list and look at nothing else: the newest ticket first with the rotation as it comes, the last option of every
 * list, and the house's hanging with the pans dumped by rack order. A scene-blind strategy passes a single seed at most 15% of the time
 * [estimated] (ASSESSMENT §4.1), and a seed on which any of these passed would count against that bound: the family of strategies that
 * pick the first, the last or none on each list is measured in tests/play/pool-levels.test.ts, against these seeds.
 */
export const plainOf = (level: PoolLevel): readonly Policy[] => [newest, blindLast, naiveOf(level), headFirst]

/** Answers already worked out. A seed's answer never changes, and the gate asks for the same few hundred seeds again and again. */
const known = new Map<string, boolean>()

/** Most answers kept: far more than the gate asks for, so that a long session that draws fresh seeds does not grow the table without end. */
const KEPT = 4096

/** Whether `seed` makes `id` a fair question. */
export function inLevelBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`The Reach-In has no level "${id}"`)
  const key = `${id}/${seed}`
  let answer = known.get(key)
  if (answer === undefined) {
    answer = fairSeed(id, seed)
    if (known.size >= KEPT) known.clear()
    known.set(key, answer)
  }
  return answer
}

function fairSeed(id: PoolLevelId, seed: Seed): boolean {
  const level = buildLevel(id, seed)
  const home = play(level, house, id === 'evict')
  if (unservedOf(home) > 0 || !structured(id, level, home)) return false
  const price = costOf(home.counts, level)
  // A plain play is stopped as soon as its price has crossed the line: the price only grows, so the rest of the night cannot bring it back.
  const over = (w: PoolWork): boolean => ratio(price, costOf(w.counts, level)) <= NAIVE_AT_MOST
  for (const policy of plainOf(level)) {
    const plain = playPolicy(freshWork(level, true), policy, over)
    if (unservedOf(plain) === 0 && !over(plain)) return false
  }
  return true
}
