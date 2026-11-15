// The fewest-copies ghost (GAMES.md §4, `fewest`): a search over the operations of view.ts for the cheapest way to a target layout.
//
// A target is what a learner can state and a program can check: a shape, the elements in logical order (named by the address they had in
// the start's buffer, so that the same shape with the elements in another order is another target), and whether the tensor must be
// contiguous at the end. The search is breadth-first over the operations, at most `maxOps` deep. It counts a copy as the elements moved,
// and it returns the plan with the fewest copies, and among those the fewest operations. A state is a view plus the elements it shows,
// so two orders of the same operations meet in one state and are searched once.

import { addresses, applyOp, isContiguous, numel } from './view'
import type { ShiftOp, TView } from './view'

export interface Goal {
  readonly shape: readonly number[]
  /** The elements in logical order, each named by its address in the start's buffer. */
  readonly elements: readonly number[]
  readonly contiguous: boolean
}

export interface Plan {
  readonly ops: readonly ShiftOp[]
  /** The number of operations that copied. */
  readonly copies: number
  /** The elements moved by all the copies. */
  readonly moved: number
}

/** The largest tensor `fewestPlan` searches: a state keeps its elements, and the search visits many. */
export const MAX_PLAN_NUMEL = 256
export const DEFAULT_MAX_OPS = 6

/** The goal that a chain of operations reaches from `start`, made contiguous when `contiguous` is set: how a seeded target is made, so that it is reachable. */
export function goalAfter(start: TView, ops: readonly ShiftOp[], contiguous: boolean): Goal | null {
  let cur = start
  let buffer = identity(start)
  for (const o of ops) {
    const r = applyOp(cur, o)
    if ('error' in r) return null
    if (r.copied > 0) buffer = addresses(cur).map((a) => buffer[a] ?? -1)
    cur = r.view
  }
  return { shape: cur.shape, elements: addresses(cur).map((a) => buffer[a] ?? -1), contiguous }
}

/** What the buffer of `start` holds: each address holds its own number. */
function identity(start: TView): number[] {
  let top = 0
  for (const a of addresses(start)) top = Math.max(top, a + 1)
  return Array.from({ length: top }, (_, i) => i)
}

interface State {
  readonly view: TView
  /** What each address of the buffer holds: the address it had in the start's buffer. */
  readonly buffer: readonly number[]
  /** Names what the buffer holds: 0 for the start's, and one number per distinct copy. Two views of one buffer show the same elements. */
  readonly bufferId: number
  readonly parent: State | null
  readonly op: ShiftOp | null
  readonly copies: number
  readonly moved: number
}

function planOf(s: State): ShiftOp[] {
  const out: ShiftOp[] = []
  for (let c: State | null = s; c && c.op; c = c.parent) out.push(c.op)
  return out.reverse()
}

const PERMUTATIONS = new Map<number, number[][]>()
function permutationsOf(rank: number): number[][] {
  let list = PERMUTATIONS.get(rank)
  if (!list) {
    list = permutations(rank).filter((order) => order.some((d, i) => d !== i))
    PERMUTATIONS.set(rank, list)
  }
  return list
}

function logical(s: State): number[] {
  return addresses(s.view).map((a) => s.buffer[a] ?? -1)
}

function key(s: State): string {
  return `${s.view.offset}|${s.view.shape.join(',')}|${s.view.strides.join(',')}|${s.bufferId}`
}

function reached(s: State, g: Goal): boolean {
  if (s.view.shape.length !== g.shape.length || s.view.shape.some((d, i) => d !== g.shape[i])) return false
  if (g.contiguous && !isContiguous(s.view)) return false
  const l = logical(s)
  return l.length === g.elements.length && l.every((x, i) => x === g.elements[i])
}

/** The shapes one step from `shape`: two adjacent dims merged into one, or one dim split into two factors. The search reshapes only to these and to the goal's shape. */
function neighbours(shape: readonly number[]): number[][] {
  const out: number[][] = []
  for (let i = 0; i + 1 < shape.length; i++) out.push([...shape.slice(0, i), (shape[i] ?? 1) * (shape[i + 1] ?? 1), ...shape.slice(i + 2)])
  for (let i = 0; i < shape.length; i++) {
    const n = shape[i] ?? 1
    for (let f = 2; f < n; f++) if (n % f === 0) out.push([...shape.slice(0, i), f, n / f, ...shape.slice(i + 1)])
  }
  return out
}

function permutations(n: number): number[][] {
  const out: number[][] = []
  const rec = (acc: number[], left: number[]) => {
    if (left.length === 0) {
      out.push(acc)
      return
    }
    for (let i = 0; i < left.length; i++) rec([...acc, left[i] ?? 0], [...left.slice(0, i), ...left.slice(i + 1)])
  }
  rec([], Array.from({ length: n }, (_, i) => i))
  return out
}

function candidates(s: State, g: Goal, goalNumel: number): ShiftOp[] {
  const v = s.view
  const n = numel(v.shape)
  const ops: ShiftOp[] = []
  const rank = v.shape.length
  if (rank > 1) {
    for (const order of permutationsOf(rank)) ops.push({ op: 'permute', order })
  }
  if (n === goalNumel) ops.push({ op: 'reshape', shape: g.shape })
  if (n > 0) for (const shape of neighbours(v.shape)) ops.push({ op: 'reshape', shape })
  if (!isContiguous(v)) ops.push({ op: 'contiguous' })
  if (goalNumel < n) {
    for (let dim = 0; dim < rank; dim++) {
      const size = v.shape[dim] ?? 0
      for (let step = 1; step <= 2; step++) for (let start = 0; start < size; start++) for (let stop = start + 1; stop <= size; stop++) ops.push({ op: 'slice', dim, start, stop, step })
    }
  } else if (goalNumel > n) ops.push({ op: 'expand', shape: g.shape })
  return ops
}

/**
 * The cheapest plan from `start` to `goal`, or null when no plan of at most `maxOps` operations reaches it. `view` is not searched: a
 * `reshape` that needs no copy is the same step as the `view`, and the plan names it `reshape`.
 */
export function fewestPlan(start: TView, goal: Goal, maxOps: number = DEFAULT_MAX_OPS): Plan | null {
  const n = numel(start.shape)
  if (n > MAX_PLAN_NUMEL) throw new RangeError(`fewestPlan searches tensors of at most ${MAX_PLAN_NUMEL} elements`)
  // Try 0 copies, then 1, and so on: a budget keeps the search to the states a cheap plan can reach. The first budget that reaches the goal
  // is the fewest, and within it the search keeps the plan with the fewest operations. A plan never needs more copies than operations.
  for (let budget = 0; budget <= maxOps; budget++) {
    const found = search(start, goal, maxOps, budget)
    if (found) return { ops: planOf(found), copies: found.copies, moved: found.moved }
  }
  return null
}

function search(start: TView, goal: Goal, maxOps: number, budget: number): State | null {
  const goalNumel = goal.elements.length
  const interned = new Map<string, number>()
  const first: State = { view: start, buffer: identity(start), bufferId: 0, parent: null, op: null, copies: 0, moved: 0 }
  if (reached(first, goal)) return first
  const best = new Map<string, number>([[key(first), 0]])
  let found: State | null = null
  let frontier = [first]
  for (let depth = 1; depth <= maxOps && frontier.length > 0 && !found; depth++) {
    const next: State[] = []
    for (const s of frontier) {
      for (const o of candidates(s, goal, goalNumel)) {
        const r = applyOp(s.view, o)
        if ('error' in r) continue
        const copies = s.copies + (r.copied > 0 ? 1 : 0)
        if (copies > budget) continue
        let buffer = s.buffer
        let bufferId = s.bufferId
        if (r.copied > 0) {
          // A copy lays the elements in the order it read them; the same elements in the same order are the same buffer.
          buffer = logical(s)
          const name = buffer.join(',')
          bufferId = interned.get(name) ?? interned.size + 1
          interned.set(name, bufferId)
        }
        const t: State = { view: r.view, buffer, bufferId, parent: s, op: o, copies, moved: s.moved + r.copied }
        const k = key(t)
        const seen = best.get(k)
        if (seen !== undefined && seen <= t.copies) continue
        best.set(k, t.copies)
        // The first depth that reaches the goal within the budget has the fewest operations, and the budget has the fewest copies.
        if (reached(t, goal) && found === null) found = t
        next.push(t)
      }
    }
    frontier = next
  }
  return found
}

/** The fewest copies that reach `goal` in at most `maxOps` operations, or null. */
export function fewestCopies(start: TView, goal: Goal, maxOps: number = DEFAULT_MAX_OPS): number | null {
  return fewestPlan(start, goal, maxOps)?.copies ?? null
}

/**
 * The shortcut that a learner takes: `contiguous()` before every operation, and at the end when the goal is contiguous. A contiguous tensor
 * copies nothing, so the shortcut costs more than the fewest only where a view would have done. This is what the band's "at least one extra copy" compares.
 */
export function naivePlan(start: TView, ops: readonly ShiftOp[], contiguousEnd: boolean): Plan | null {
  let cur = start
  let copies = 0
  let moved = 0
  const out: ShiftOp[] = []
  for (const o of ops) {
    const c = applyOp(cur, { op: 'contiguous' })
    if ('error' in c) return null
    if (c.copied > 0) {
      copies++
      moved += c.copied
      out.push({ op: 'contiguous' })
    }
    cur = c.view
    const r = applyOp(cur, o)
    if ('error' in r) return null
    if (r.copied > 0) {
      copies++
      moved += r.copied
    }
    out.push(o)
    cur = r.view
  }
  if (contiguousEnd) {
    const c = applyOp(cur, { op: 'contiguous' })
    if ('error' in c) return null
    if (c.copied > 0) {
      copies++
      moved += c.copied
      out.push({ op: 'contiguous' })
    }
  }
  return { ops: out, copies, moved }
}
