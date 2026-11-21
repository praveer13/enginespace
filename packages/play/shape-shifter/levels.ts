/**
 * Tensor views' levels (GAMES.md §4.3, §4.4): the tensors each one plays, the target it asks for, and the reference's plan.
 *
 * The three practice levels draw one target from their seed, in the ranges of §4.4, and the reference is the level's own script, which a test
 * holds to the sim's `fewestPlan` on every draw. `fewest` draws three targets, one of each kind and a third of either, in an order the seed
 * shuffles (§4.3). `grid` is one tensor, [12, 20], on its practice seed and three drawn tensors on any other: a graded seed is drawn at
 * the start, and the one practice seed is pinned (entry.ts).
 */
import { assertSeed, between, chance, rngFor, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { contiguousView, goalAfter } from '@es/sim/tensor'
import type { Goal, ShiftOp, TView } from '@es/sim/tensor'
import { acceptCandidate, drawCandidate, drawGridShape, gridTask, PROGRAM_CAP } from './draw'
import type { FewestKind } from './draw'
import { SHIFT_LEVEL_IDS } from './types'
import type { GridLevel, GridTask, LayoutLevel, LayoutTask, OpKind, ShiftLevel, ShiftLevelId } from './types'

export const isLevelId = (id: string): id is ShiftLevelId => (SHIFT_LEVEL_IDS as readonly string[]).includes(id)

/** The levels that are graded (GAMES.md §4.3). `fewest` is the Prove level. */
export const GRADED: readonly ShiftLevelId[] = ['fewest', 'grid']

/** The seed on which `grid` is the practice tensor, [12, 20]: any other seed draws three tensors. */
export const GRID_PRACTICE_SEED = 0

/** The practice tensor of `grid` (GAMES.md §4.3). */
export const GRID_PRACTICE_SHAPE: readonly number[] = [12, 20]

/** Targets a `fewest` run holds, and the operations a target allows at most before it has failed [estimated]. */
export const FEWEST_TARGETS = 3
export const FEWEST_ATTEMPT_CAP = 12

/** Candidates drawn for one target before the draw gives up. A band that keeps a fifth needs about five; this is far more. */
export const DRAW_ATTEMPTS = 400

const OFFERED: Readonly<Record<Exclude<ShiftLevelId, 'grid'>, readonly OpKind[]>> = {
  views: ['transpose', 'view', 'reshape', 'contiguous'],
  'stride-zero': ['expand', 'view', 'reshape', 'contiguous'],
  'three-d': ['view', 'reshape', 'transpose', 'permute', 'contiguous'],
  fewest: ['view', 'transpose', 'permute', 'contiguous'],
}

function script(kind: 'script', start: TView, ops: readonly ShiftOp[], moved: number, answer: number): LayoutTask {
  const goal = goalAfter(start, ops, true)
  if (goal === null) throw new RangeError('a practice level\'s script does not reach its own target')
  return { kind, start, goal, ghost: ops, copies: 1, moved, answer }
}

function layout(id: Exclude<ShiftLevelId, 'grid'>, seed: Seed, tasks: readonly LayoutTask[], graded: boolean): LayoutLevel {
  return { id, seed, graded, kind: 'layout', needed: tasks.length, offered: OFFERED[id], tasks, failOnRefusal: id === 'fewest', attemptCap: id === 'fewest' ? FEWEST_ATTEMPT_CAP : null }
}

/** `views`: [a, b] with a and b from 3 to 8 and a ≠ b; the target is the transpose read as one row, contiguous. */
export function viewsShape(seed: Seed): [number, number] {
  const rng = rngFor(seed, 'shape-shifter/views')
  for (;;) {
    const a = between(rng, 3, 8)
    const b = between(rng, 3, 8)
    if (a !== b) return [a, b]
  }
}

/** `stride-zero`: a row of 3 to 8 elements, expanded to 2 to 8 rows. */
export function strideZeroShape(seed: Seed): { readonly row: number; readonly rows: number } {
  const rng = rngFor(seed, 'shape-shifter/stride-zero')
  return { row: between(rng, 3, 8), rows: between(rng, 2, 8) }
}

/** `three-d`: tokens 2 to 6, heads 2 to 4, head size 2 to 8, at most 64 elements. */
export function threeDShape(seed: Seed): { readonly tokens: number; readonly heads: number; readonly size: number } {
  const rng = rngFor(seed, 'shape-shifter/three-d')
  for (;;) {
    const tokens = between(rng, 2, 6)
    const heads = between(rng, 2, 4)
    const size = between(rng, 2, 8)
    if (tokens * heads * size <= 64) return { tokens, heads, size }
  }
}

function viewsLevel(seed: Seed): LayoutLevel {
  const [a, b] = viewsShape(seed)
  const ops: ShiftOp[] = [
    { op: 'transpose', a: 0, b: 1 },
    { op: 'reshape', shape: [a * b] },
  ]
  return layout('views', seed, [script('script', contiguousView([a, b]), ops, a * b, a * b)], false)
}

function strideZeroLevel(seed: Seed): LayoutLevel {
  const { row, rows } = strideZeroShape(seed)
  const ops: ShiftOp[] = [{ op: 'expand', shape: [rows, row] }, { op: 'contiguous' }]
  return layout('stride-zero', seed, [script('script', contiguousView([row]), ops, rows * row, 0)], false)
}

function threeDLevel(seed: Seed): LayoutLevel {
  const { tokens, heads, size } = threeDShape(seed)
  const ops: ShiftOp[] = [{ op: 'reshape', shape: [tokens, heads, size] }, { op: 'permute', order: [1, 0, 2] }, { op: 'contiguous' }]
  // After the permute the tokens' dimension is the second, and its stride is the width of one token's row.
  return layout('three-d', seed, [script('script', contiguousView([tokens, heads * size]), ops, tokens * heads * size, heads * size)], false)
}

/** The three targets of a `fewest` run: one of each kind and a third of either, drawn in an order that the seed shuffles. */
export function fewestTasks(seed: Seed): LayoutTask[] {
  const rng: Rng = rngFor(seed, 'shape-shifter/fewest')
  const third: FewestKind = chance(rng, 500) ? 'copy-before-view' : 'no-copy'
  const kinds = shuffle(rng, ['copy-before-view', 'no-copy', third] as const)
  const tasks: LayoutTask[] = []
  for (const kind of kinds) {
    let kept: LayoutTask | null = null
    for (let attempt = 0; attempt < DRAW_ATTEMPTS && kept === null; attempt++) {
      const drawn = drawCandidate(kind, rng)
      const task = drawn === null ? null : acceptCandidate(kind, drawn)
      if (task !== null && !tasks.some((t) => t.goal.shape.join() === task.goal.shape.join() && t.goal.elements.join() === task.goal.elements.join())) kept = task
    }
    if (kept === null) throw new RangeError(`no fair ${kind} target was drawn for seed ${seed}`)
    tasks.push(kept)
  }
  return tasks
}

/** The tensors of a `grid` run: the practice tensor on its seed, otherwise three drawn ones that make a fair question and differ. */
export function gridTasks(seed: Seed): GridTask[] {
  if (seed === GRID_PRACTICE_SEED) {
    const task = gridTask(GRID_PRACTICE_SHAPE)
    if (task === null) throw new RangeError('the practice tensor of `grid` is not a fair question')
    return [task]
  }
  const rng = rngFor(seed, 'shape-shifter/grid')
  const tasks: GridTask[] = []
  for (let attempt = 0; attempt < DRAW_ATTEMPTS && tasks.length < 3; attempt++) {
    const shape = drawGridShape(rng)
    const task = gridTask(shape)
    if (task !== null && !tasks.some((t) => t.shape.join() === shape.join())) tasks.push(task)
  }
  if (tasks.length < 3) throw new RangeError(`no fair tensors were drawn for seed ${seed}`)
  return tasks
}

const built = new Map<string, ShiftLevel>()

/** Most levels kept: a level is plain data that nothing changes, and the gate and the probes ask for the same ones again and again. */
const KEPT = 512

/** The level `id` on `seed`. Throws for a level that Tensor views does not have. */
export function buildLevel(id: string, seed: Seed): ShiftLevel {
  if (!isLevelId(id)) throw new RangeError(`Tensor views has no level "${id}"`)
  assertSeed(seed)
  const key = `${id}/${seed}`
  let level = built.get(key)
  if (level === undefined) {
    level = drawLevel(id, seed)
    if (built.size >= KEPT) built.clear()
    built.set(key, level)
  }
  return level
}

function drawLevel(id: ShiftLevelId, seed: Seed): ShiftLevel {
  switch (id) {
    case 'views':
      return viewsLevel(seed)
    case 'stride-zero':
      return strideZeroLevel(seed)
    case 'three-d':
      return threeDLevel(seed)
    case 'fewest':
      return layout('fewest', seed, fewestTasks(seed), true)
    case 'grid': {
      const tasks = gridTasks(seed)
      const level: GridLevel = { id, seed, graded: seed !== GRID_PRACTICE_SEED, kind: 'grid', needed: tasks.length, tasks, cap: PROGRAM_CAP }
      return level
    }
  }
}

/** The goal that a practice level's script reaches, for the tests. */
export const goalOf = (level: LayoutLevel, task = 0): Goal => level.tasks[task].goal
