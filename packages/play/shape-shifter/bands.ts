/**
 * The band of each level (GAMES.md §2.1, §4.4): which seeds make a fair question.
 *
 * A seed is fair when its targets are fair. The draws of `fewest` and `grid` keep a candidate only when every check of its band holds
 * (draw.ts), so a seed is fair when the draw found its targets, and the band's acceptance is the share of candidates kept, which
 * tests/play/shape-shifter-levels.test.ts measures and prints against §2.1's floor of 20%. A practice level is fair when the level's own
 * script reaches its target with the copies that the sim's `fewestPlan` finds: the reference is the model's optimum.
 */
import type { Seed } from '@es/sim/core'
import { fewestPlan, gridCoverage } from '@es/sim/tensor'
import { nodeOf, reaches, step } from './engine'
import type { Node } from './engine'
import { buildLevel, isLevelId } from './levels'
import type { GridTask, LayoutTask, ShiftLevel, ShiftLevelId } from './types'

/** The reference's plan played on a target with the engine's step: where it ends and the copies it made. */
export function ghostOf(task: LayoutTask): { readonly end: Node; readonly copies: number; readonly moved: number } | null {
  let node = nodeOf(task.start)
  let copies = 0
  let moved = 0
  for (const op of task.ghost) {
    const s = step(node, op)
    if ('error' in s) return null
    node = s.node
    if (s.copied > 0) copies++
    moved += s.copied
  }
  return { end: node, copies, moved }
}

/** A layout target is fair when the reference reaches it with the copies the target says, and, unless `modelAgrees` is false, the sim's search finds the same copies. */
export function layoutFair(task: LayoutTask, modelAgrees = true): boolean {
  const ghost = ghostOf(task)
  if (ghost === null || !reaches(ghost.end, task.goal) || ghost.copies !== task.copies || ghost.moved !== task.moved) return false
  if (!modelAgrees) return true
  const model = fewestPlan(task.start, task.goal)
  return model !== null && model.copies === task.copies
}

/** A grid tensor is fair when the reference's launch covers it exactly with the least masked count, under the cap. */
export function gridFair(task: GridTask, cap: number): boolean {
  const g = gridCoverage(task.shape, task.block, task.grid)
  return !('error' in g) && g.exact && g.programs <= cap && g.masked === task.least && task.least > 0 && task.least < task.onePass && task.least < task.square
}

/** Answers already worked out. A seed's answer never changes, and the gate asks for the same few hundred seeds again and again. */
const known = new Map<string, boolean>()

/** Most answers kept: far more than the gate asks for. */
const KEPT = 4096

/** Whether `seed` makes `id` a fair question. */
export function inLevelBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`Tensor views has no level "${id}"`)
  const key = `${id}/${seed}`
  let answer = known.get(key)
  if (answer === undefined) {
    answer = fairSeed(id, seed)
    if (known.size >= KEPT) known.clear()
    known.set(key, answer)
  }
  return answer
}

function fairSeed(id: ShiftLevelId, seed: Seed): boolean {
  let level: ShiftLevel
  try {
    level = buildLevel(id, seed)
  } catch {
    // A draw that found no fair target is a seed that is not fair.
    return false
  }
  // The sim's own search is the dearest step of the band, and the gate asks the band of hundreds of seeds. A `fewest` target was kept only
  // after the search agreed (draw.ts), and a practice level's script is the model's optimum on every draw: tests/play/shape-shifter-levels.test.ts
  // holds both to `fewestPlan` on every seed it draws, so the band reads the reference's own play.
  if (level.kind === 'layout') return level.tasks.every((task) => layoutFair(task, false))
  return level.tasks.every((task) => gridFair(task, level.cap))
}
