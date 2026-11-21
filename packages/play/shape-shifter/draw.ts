/**
 * How the graded levels' targets are drawn, and what makes one fair (GAMES.md §4.4, §2.1 "answer first"). A candidate is drawn from a
 * seeded stream, and a target is kept only when every check of its band holds. `levels.ts` draws until it has kept the targets it needs,
 * `bands.ts` and the tests measure how many candidates a band keeps (§2.1's floor is 20%).
 *
 * `fewest` has two kinds of target. A copy-before-a-view target needs one `contiguous()` placed before a `view`, and defeats the habit
 * "views only, then at most one `contiguous()` last". A no-copy target is a layout that views alone reach, from a start that is not
 * contiguous, and defeats the habits that call `contiguous()` first, before every `view` or before every operation. A target is kept
 * only when the habit it is there for cannot reach it with the reference's copies.
 */
import { below, between, chance } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { applyOp, contiguousView, fewestPlan, gridCoverage, goalAfter, naivePlan, numel } from '@es/sim/tensor'
import type { ShiftOp, TView } from '@es/sim/tensor'
import { copyBeforeViewMacros, fewestMacros, nodeOf, ordersOf, search, spell, viewsThenCopy } from './engine'
import type { GridTask, LayoutTask } from './types'

/** Operations the reference may use on a graded target, and the operations the habits' searches may use. */
export const PLAN_OPS = 6
export const HABIT_OPS = 8

export type FewestKind = 'copy-before-view' | 'no-copy'

/** What a candidate is made of: a start, the chain that makes its target, and whether the target must be contiguous. */
export interface Drawn {
  readonly start: TView
  readonly chain: readonly ShiftOp[]
  readonly contiguous: boolean
}

const proper = (n: number): number[] => Array.from({ length: Math.max(n - 2, 0) }, (_, i) => i + 2).filter((f) => n % f === 0)

/** A shape of `rank` dimensions of 2 to 8 elements each, with from `lo` to `hi` elements in all, or null after a few tries. */
function shapeDraw(rng: Rng, rank: number, lo: number, hi: number): number[] | null {
  for (let tries = 0; tries < 24; tries++) {
    const shape = Array.from({ length: rank }, () => between(rng, 2, 8))
    const n = numel(shape)
    if (n >= lo && n <= hi) return shape
  }
  return null
}

function orderDraw(rng: Rng, rank: number): number[] {
  const orders = ordersOf(rank)
  return orders[below(rng, orders.length)]
}

/**
 * A start that is contiguous, transposed or sliced, of 12 to 64 elements. A sliced start is a step-2 slice of a contiguous tensor along
 * its last dimension, so the buffer it reads spans at most 64 addresses and the strip fits beside the cells.
 */
export function startDraw(rng: Rng, rank: number, how: 'contiguous' | 'transposed' | 'sliced'): TView | null {
  if (how === 'sliced') {
    const shape = shapeDraw(rng, rank, 12, 32)
    if (shape === null) return null
    const base = [...shape.slice(0, -1), (shape[rank - 1] ?? 1) * 2]
    const r = applyOp(contiguousView(base), { op: 'slice', dim: rank - 1, start: 0, stop: base[rank - 1] ?? 0, step: 2 })
    return 'error' in r ? null : r.view
  }
  const base = shapeDraw(rng, rank, 12, 64)
  if (base === null) return null
  if (how === 'contiguous') return contiguousView(base)
  const r = applyOp(contiguousView(base), { op: 'permute', order: orderDraw(rng, rank) })
  return 'error' in r ? null : r.view
}

/** The chain's operations, tracked by shape alone: each is a `reshape` or a `permute` of the shape it follows. */
interface Chain {
  shape: number[]
  ops: ShiftOp[]
}

function split(rng: Rng, c: Chain): boolean {
  if (c.shape.length >= 3) return false
  const dims = c.shape.map((n, d) => [n, d] as const).filter(([n]) => proper(n).length > 0)
  if (dims.length === 0) return false
  const [n, d] = dims[below(rng, dims.length)]
  const fs = proper(n)
  const f = fs[below(rng, fs.length)]
  c.shape = [...c.shape.slice(0, d), f, n / f, ...c.shape.slice(d + 1)]
  c.ops.push({ op: 'reshape', shape: c.shape })
  return true
}

function merge(rng: Rng, c: Chain): boolean {
  if (c.shape.length < 2) return false
  const i = below(rng, c.shape.length - 1)
  c.shape = [...c.shape.slice(0, i), (c.shape[i] ?? 1) * (c.shape[i + 1] ?? 1), ...c.shape.slice(i + 2)]
  c.ops.push({ op: 'reshape', shape: c.shape })
  return true
}

function reorder(rng: Rng, c: Chain): boolean {
  if (c.shape.length < 2) return false
  const order = orderDraw(rng, c.shape.length)
  c.shape = order.map((d) => c.shape[d] ?? 1)
  c.ops.push({ op: 'permute', order })
  return true
}

/**
 * One candidate of a kind. Copy before a view: a start of rank 2 or 3, a split (rank 2 only), a `permute`, a merge of two adjacent
 * dimensions, and at half the draws a split or a `permute` after it; contiguous at half the draws. No copy: a rank-2 start that is not
 * contiguous, a split, and at half the draws a `permute`; not contiguous. Null where a draw has no room (a prime size to split).
 */
export function drawCandidate(kind: FewestKind, rng: Rng): Drawn | null {
  const rank = kind === 'no-copy' ? 2 : between(rng, 2, 3)
  const how = kind === 'no-copy' ? (chance(rng, 500) ? 'transposed' : 'sliced') : (['contiguous', 'transposed', 'sliced'] as const)[below(rng, 3)]
  const start = startDraw(rng, rank, how)
  if (start === null) return null
  const c: Chain = { shape: [...start.shape], ops: [] }
  if (kind === 'no-copy') {
    if (!split(rng, c)) return null
    if (chance(rng, 500)) reorder(rng, c)
    return { start, chain: c.ops, contiguous: false }
  }
  if (rank === 2 && !split(rng, c)) return null
  reorder(rng, c)
  merge(rng, c)
  if (chance(rng, 500) && !split(rng, c)) reorder(rng, c)
  return { start, chain: c.ops, contiguous: chance(rng, 500) }
}

/** The reference's plan on a target, spelled in the buttons the level offers. */
const spelled = (ops: readonly ShiftOp[]): ShiftOp[] => ops.map(spell)

/**
 * The target a candidate makes, or null when it is not fair. Fair means: reached by the sim's own search in at most `PLAN_OPS` operations
 * with the copies the kind is for; `naivePlan` costs at least one copy more; the level's operations (`view`, `permute`, `contiguous()`)
 * reach it with the same copies in at most `PLAN_OPS` operations; and the habit the kind is for cannot reach it with those copies.
 */
export function acceptCandidate(kind: FewestKind, d: Drawn): LayoutTask | null {
  const goal = goalAfter(d.start, d.chain, d.contiguous)
  if (goal === null || goal.elements.length < 12 || goal.elements.length > 64) return null
  const want = kind === 'no-copy' ? 0 : 1
  // The cheap checks come first: the sim's own search is the dearest, and runs on the targets that pass the rest.
  const naive = naivePlan(d.start, d.chain, goal.contiguous)
  if (naive === null || naive.copies < want + 1) return null
  const start = nodeOf(d.start)
  const mine = search(start, goal, fewestMacros, PLAN_OPS, want)
  if (mine === null || mine.copies !== want || mine.ops.length === 0) return null
  if (kind === 'copy-before-view') {
    if (viewsThenCopy(start, goal, HABIT_OPS)) return null
  } else if (search(start, goal, copyBeforeViewMacros, HABIT_OPS, 0) !== null) return null
  const plan = fewestPlan(d.start, goal, PLAN_OPS)
  if (plan === null || plan.copies !== want) return null
  return { kind, start: d.start, goal, ghost: spelled(mine.ops), copies: mine.copies, moved: mine.moved, answer: mine.copies }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The grid                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Programs a launch may have at most [estimated]: GAMES.md §4.3. */
export const PROGRAM_CAP = 6

/** BLOCK steps from 1 to this, in whole numbers (GAMES.md §4.1). */
export const BLOCK_MAX = 32

const POW2 = [1, 2, 4, 8, 16, 32] as const

const nextPow2 = (n: number): number => POW2.find((p) => p >= n) ?? BLOCK_MAX

/**
 * The reference's launch on a tensor and what the plain launches cost, or null where the tensor is not a fair question: the least masked
 * count within the cap is above 0 and below both the one-program launch's and the squarest tile's (GAMES.md §4.4). The reference takes
 * the fewest programs among the launches that tie, then the earlier BLOCK.
 */
export function gridTask(shape: readonly number[], cap = PROGRAM_CAP): GridTask | null {
  let best: { block: number[]; masked: number; programs: number; lanes: number } | null = null
  for (const b0 of POW2) {
    for (const b1 of POW2) {
      const g = gridCoverage(shape, [b0, b1])
      if ('error' in g || g.programs > cap || !g.exact) continue
      if (best === null || g.masked < best.masked || (g.masked === best.masked && g.programs < best.programs)) best = { block: [b0, b1], masked: g.masked, programs: g.programs, lanes: g.lanes }
    }
  }
  if (best === null) return null
  const one = gridCoverage(shape, shape.map(nextPow2))
  const square = POW2.find((p) => {
    const g = gridCoverage(shape, [p, p])
    return !('error' in g) && g.programs <= cap
  })
  if ('error' in one || square === undefined) return null
  const sq = gridCoverage(shape, [square, square])
  if ('error' in sq || best.masked <= 0 || best.masked >= one.masked || best.masked >= sq.masked) return null
  const grid = shape.map((n, d) => Math.ceil(n / (best?.block[d] ?? 1)))
  return { shape: [...shape], block: best.block, grid, programs: best.programs, lanes: best.lanes, least: best.masked, onePass: one.masked, square: sq.masked, answer: best.masked }
}

/** A tensor for a graded `grid`: 5 to 20 along each dimension, at most 256 elements (GAMES.md §4.4). */
export function drawGridShape(rng: Rng): number[] {
  for (;;) {
    const shape = [between(rng, 5, 20), between(rng, 5, 20)]
    if (numel(shape) <= 256) return shape
  }
}
