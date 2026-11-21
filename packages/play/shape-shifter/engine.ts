/**
 * The rules Tensor views plays and the searches its bands and debrief ask (GAMES.md §4.8). The operations are `applyOp` of
 * `packages/sim/tensor`; this file adds what that model leaves to a game: the buffer's contents (which element each address holds, so that
 * a target in logical order can be checked after a copy), and a search over the operations a level offers.
 *
 * The sim's `fewestPlan` searches `reshape`, which decides for itself whether to copy. `fewest` offers `view` and not `reshape` (GAMES.md
 * §4.3), so every copy is a `contiguous()` that the learner places, and the reference is searched here over the operations the level
 * offers. `bands.ts` holds the two to each other: the copies found here equal `fewestPlan`'s on every target the level draws.
 */
import { addresses, applyOp, isContiguous, numel } from '@es/sim/tensor'
import type { Goal, ShiftOp, TView } from '@es/sim/tensor'
import type { OpKind } from './types'

/** A tensor and what its buffer holds: each address holds the number it had in the start's buffer. */
export interface Node {
  readonly view: TView
  readonly buffer: readonly number[]
}

/** The buffer of a start: every address, up to the highest one that the tensor reads, holds its own number. */
export function startBuffer(start: TView): number[] {
  let top = 0
  for (const a of addresses(start)) top = Math.max(top, a + 1)
  return Array.from({ length: top }, (_, i) => i)
}

export const nodeOf = (start: TView): Node => ({ view: start, buffer: startBuffer(start) })

/** The elements in logical order, each named by its number. */
export const logicalOf = (n: Node): number[] => addresses(n.view).map((a) => n.buffer[a] ?? -1)

const sameShape = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((d, i) => d === b[i])

/** A target is reached when the shape, the elements in order and, where required, contiguity all match (GAMES.md §4). */
export function reaches(n: Node, goal: Goal): boolean {
  if (!sameShape(n.view.shape, goal.shape)) return false
  if (goal.contiguous && !isContiguous(n.view)) return false
  const l = logicalOf(n)
  return l.length === goal.elements.length && l.every((x, i) => x === goal.elements[i])
}

/** Elements already where the target puts them, by logical position, and the target's element count. Positions are compared when the counts agree. */
export function inPlace(n: Node, goal: Goal): { readonly k: number; readonly of: number } {
  const of = goal.elements.length
  if (numel(n.view.shape) !== of) return { k: 0, of }
  const l = logicalOf(n)
  let k = 0
  for (let i = 0; i < of; i++) if (l[i] === goal.elements[i]) k++
  return { k, of }
}

/** The result of one operation on a node: the next node, and what it copied. `error` as the sim reports it. */
export type Stepped = { readonly node: Node; readonly copied: number } | { readonly error: 'not-viewable' | 'bad-shape' }

/** One operation on a node. A copy lays every element into a new buffer in logical order, and a view leaves the buffer where it is. */
export function step(n: Node, op: ShiftOp): Stepped {
  const r = applyOp(n.view, op)
  if ('error' in r) return r
  return { node: { view: r.view, buffer: r.copied > 0 ? logicalOf(n) : n.buffer }, copied: r.copied }
}

/**
 * Where a `view` to `shape` is refused: the first element, in logical order, whose address does not follow from the one stride that the
 * elements before it walk. A tensor with fewer than three elements has none. This is the "jump" the diagram marks (GAMES.md §4.1).
 */
export function jumpOf(v: TView): number | null {
  const a = addresses(v)
  if (a.length < 3) return null
  const delta = (a[1] ?? 0) - (a[0] ?? 0)
  for (let i = 2; i < a.length; i++) if ((a[i] ?? 0) - (a[i - 1] ?? 0) !== delta) return i
  return null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Spelling                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A `permute` that swaps two dimensions and leaves the rest is a `transpose`, and the level's buttons spell it so. */
export function spell(op: ShiftOp): ShiftOp {
  if (op.op !== 'permute') return op
  const moved = op.order.map((d, i) => [d, i] as const).filter(([d, i]) => d !== i)
  if (moved.length !== 2) return op
  return { op: 'transpose', a: moved[0][1], b: moved[1][1] }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Searches                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A step of a plan, which may be more than one operation (`contiguous()` then `view`). A plan's length counts operations. */
export type Macro = readonly ShiftOp[]

export interface Found {
  readonly ops: readonly ShiftOp[]
  readonly copies: number
  readonly moved: number
}

const SHAPES = new Map<number, number[][]>()

/** Every shape of `n` elements with at most `maxRank` dimensions, none of size 1: the shapes a picker built from the factors offers. */
export function shapesOf(n: number, maxRank = 3): number[][] {
  const key = n * 10 + maxRank
  let out = SHAPES.get(key)
  if (out === undefined) {
    out = []
    const rec = (left: number, acc: number[]) => {
      if (left === 1) {
        if (acc.length > 0) out?.push(acc)
        return
      }
      if (acc.length === maxRank) return
      for (let f = 2; f <= left; f++) if (left % f === 0) rec(left / f, [...acc, f])
    }
    rec(n, [])
    SHAPES.set(key, out)
  }
  return out
}

const ORDERS = new Map<number, number[][]>()

/** Every order of `rank` dimensions but the identity. */
export function ordersOf(rank: number): number[][] {
  let out = ORDERS.get(rank)
  if (out === undefined) {
    out = []
    const rec = (acc: number[], left: number[]) => {
      if (left.length === 0) {
        if (acc.some((d, i) => d !== i)) out?.push(acc)
        return
      }
      for (let i = 0; i < left.length; i++) rec([...acc, left[i] ?? 0], [...left.slice(0, i), ...left.slice(i + 1)])
    }
    rec([], Array.from({ length: rank }, (_, i) => i))
    ORDERS.set(rank, out)
  }
  return out
}

const permutes = (v: TView): Macro[] => (v.shape.length > 1 ? ordersOf(v.shape.length).map((order): Macro => [{ op: 'permute', order }]) : [])
const views = (v: TView): number[][] => shapesOf(numel(v.shape)).filter((s) => !sameShape(s, v.shape))

/** What `fewest` offers: `view` to any shape, `permute` to any order, and `contiguous()` where it would copy. */
export const fewestMacros = (n: Node): Macro[] => [
  ...permutes(n.view),
  ...views(n.view).map((shape): Macro => [{ op: 'view', shape }]),
  ...(isContiguous(n.view) ? [] : [[{ op: 'contiguous' }] as Macro]),
]

/** What a practice level offers beyond that: `reshape`, and `expand` to the target's shape. */
export const practiceMacros =
  (goal: Goal) =>
  (n: Node): Macro[] => [
    ...fewestMacros(n),
    ...views(n.view).map((shape): Macro => [{ op: 'reshape', shape }]),
    ...(goal.elements.length > numel(n.view.shape) ? [[{ op: 'expand', shape: goal.shape }] as Macro] : []),
  ]

/** A learner's habit: `contiguous()` before every `view`, and `permute` as it comes. */
export const copyBeforeViewMacros = (n: Node): Macro[] => [
  ...permutes(n.view),
  ...views(n.view).map((shape): Macro => [{ op: 'contiguous' }, { op: 'view', shape }]),
  ...(isContiguous(n.view) ? [] : [[{ op: 'contiguous' }] as Macro]),
]

interface Rec {
  readonly node: Node
  readonly copies: number
  readonly moved: number
  readonly ops: readonly ShiftOp[]
}

/**
 * The plan from `from` to `goal` with the fewest copies, then the fewest operations, over the macros given: at most `maxOps` operations
 * and `maxCopies` copies. A budget of copies is tried from 0 up, so the first that reaches is the fewest. A state meets itself once: two
 * routes to the same tensor over the same buffer are searched by the cheaper.
 */
export function search(from: Node, goal: Goal, macros: (n: Node) => Macro[], maxOps: number, maxCopies: number): Found | null {
  for (let budget = 0; budget <= maxCopies; budget++) {
    const found = layered(from, goal, macros, maxOps, budget)
    if (found) return { ops: found.ops, copies: found.copies, moved: found.moved }
  }
  return null
}

function layered(from: Node, goal: Goal, macros: (n: Node) => Macro[], maxOps: number, budget: number): Rec | null {
  const interned = new Map<string, number>()
  const idOf = (buffer: readonly number[]): number => {
    const name = buffer.join(',')
    let id = interned.get(name)
    if (id === undefined) {
      id = interned.size
      interned.set(name, id)
    }
    return id
  }
  const keyOf = (r: Rec): string => `${r.node.view.offset}|${r.node.view.shape.join(',')}|${r.node.view.strides.join(',')}|${idOf(r.node.buffer)}`
  const buckets: Rec[][] = Array.from({ length: maxOps + 1 }, () => [])
  buckets[0].push({ node: from, copies: 0, moved: 0, ops: [] })
  const seen = new Map<string, number>()
  for (let depth = 0; depth <= maxOps; depth++) {
    for (const rec of buckets[depth]) {
      const key = keyOf(rec)
      const prior = seen.get(key)
      if (prior !== undefined && prior <= rec.copies) continue
      seen.set(key, rec.copies)
      if (reaches(rec.node, goal)) return rec
      if (depth === maxOps) continue
      for (const macro of macros(rec.node)) {
        if (depth + macro.length > maxOps) continue
        let node = rec.node
        let copies = rec.copies
        let moved = rec.moved
        let ok = true
        for (const op of macro) {
          const s = step(node, op)
          if ('error' in s) {
            ok = false
            break
          }
          node = s.node
          if (s.copied > 0) {
            copies++
            moved += s.copied
          }
        }
        if (!ok || copies > budget) continue
        buckets[depth + macro.length].push({ node, copies, moved, ops: [...rec.ops, ...macro] })
      }
    }
  }
  return null
}

/**
 * The habit "views only, then at most one `contiguous()` as the last operation": whether some chain of at most `maxOps - 1` views and
 * permutes, with or without a `contiguous()` at its end, reaches `goal`.
 */
export function viewsThenCopy(start: Node, goal: Goal, maxOps: number): boolean {
  let frontier: Node[] = [start]
  const seen = new Set<string>()
  const keyOf = (n: Node) => `${n.view.offset}|${n.view.shape.join(',')}|${n.view.strides.join(',')}`
  seen.add(keyOf(start))
  for (let depth = 0; depth < maxOps; depth++) {
    const next: Node[] = []
    for (const n of frontier) {
      if (reaches(n, goal)) return true
      const c = step(n, { op: 'contiguous' })
      if (!('error' in c) && reaches(c.node, goal)) return true
      if (depth === maxOps - 1) continue
      for (const macro of [...permutes(n.view), ...views(n.view).map((shape): Macro => [{ op: 'view', shape }])]) {
        const s = step(n, macro[0])
        if ('error' in s) continue
        const k = keyOf(s.node)
        if (seen.has(k)) continue
        seen.add(k)
        next.push(s.node)
      }
    }
    frontier = next
  }
  return false
}

/** The kinds of operation a macro list holds, for a test. */
export const kindsOf = (macros: readonly Macro[]): OpKind[] => [...new Set(macros.flat().map((o) => o.op))]
