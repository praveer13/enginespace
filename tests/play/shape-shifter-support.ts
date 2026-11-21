/**
 * Shared by Tensor views' tests (tests/play/shape-shifter*.test.ts): levels on their practice seeds, runs built from a list of actions,
 * and an independent search of the habits that `fewest` is drawn against, written against `packages/sim/tensor` alone. Not a test: bun
 * test collects only *.test.ts.
 */
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { shiftInit, shiftReduce, shiftSession } from '@es/play/shape-shifter/session'
import type { ShiftAction, ShiftLevel, ShiftLevelId, ShiftState } from '@es/play/shape-shifter/types'
import type { Seed } from '@es/sim/core'
import { addresses, applyOp, isContiguous, numel } from '@es/sim/tensor'
import type { Goal, ShiftOp, TView } from '@es/sim/tensor'

export const S = shiftSession

/** The levels a test walks, each on its practice seed. */
export const PRACTICE: readonly (readonly [ShiftLevelId, Seed])[] = SHAPE_SHIFTER.levels.map((level) => [level.id as ShiftLevelId, level.practiceSeed])

export const practiceOf = (id: ShiftLevelId): ShiftLevel => S.level(id, SHAPE_SHIFTER.levels.find((level) => level.id === id)?.practiceSeed ?? 0)

export const op = (o: ShiftOp): ShiftAction => ({ t: 'op', op: o })

/** The state after `actions`, from a level's first state. */
export const stateAfter = (level: ShiftLevel, ...actions: ShiftAction[]): ShiftState => actions.reduce(shiftReduce, shiftInit(level))

/** Every string a state holds, at any depth. */
export function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf)
  return []
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The habits, searched independently of the game's own engine                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Held {
  readonly view: TView
  readonly buffer: readonly number[]
}

const logical = (h: Held): number[] => addresses(h.view).map((a) => h.buffer[a] ?? -1)

const reachesGoal = (h: Held, goal: Goal): boolean => {
  if (h.view.shape.join() !== goal.shape.join() || (goal.contiguous && !isContiguous(h.view))) return false
  const l = logical(h)
  return l.every((x, i) => x === goal.elements[i])
}

/** Every shape of `n` with at most three dimensions, none of size 1. */
function shapes(n: number): number[][] {
  const out: number[][] = []
  const rec = (left: number, acc: number[]) => {
    if (left === 1) {
      if (acc.length > 0) out.push(acc)
      return
    }
    if (acc.length === 3) return
    for (let f = 2; f <= left; f++) if (left % f === 0) rec(left / f, [...acc, f])
  }
  rec(n, [])
  return out
}

function orders(rank: number): number[][] {
  const out: number[][] = []
  const rec = (acc: number[], left: number[]) => {
    if (left.length === 0) {
      if (acc.some((d, i) => d !== i)) out.push(acc)
      return
    }
    for (const d of left) rec([...acc, d], left.filter((x) => x !== d))
  }
  rec([], Array.from({ length: rank }, (_, i) => i))
  return out
}

export type Habit = 'views-then-copy' | 'copy-before-view' | 'copy-first' | 'copy-before-every'

const startOf = (start: TView): Held => {
  let top = 0
  for (const a of addresses(start)) top = Math.max(top, a + 1)
  return { view: start, buffer: Array.from({ length: top }, (_, i) => i) }
}

/**
 * Whether a learner who keeps to `habit` can reach `goal` in at most `maxOps` operations with as many copies as `copies`. The habits:
 * views then at most one `contiguous()` last (it makes one copy); `contiguous()` before every `view`; `contiguous()` first; `contiguous()`
 * before every operation. A `contiguous()` on a tensor that is contiguous already is free, and every other copies.
 */
export function habitReaches(habit: Habit, start: TView, goal: Goal, copies: number, maxOps = 8): boolean {
  const seen = new Map<string, number>()
  const key = (h: Held, used: number, depth: number) => `${h.view.offset}|${h.view.shape}|${h.view.strides}|${h.buffer.length}|${used}|${depth}`
  const go = (h: Held, used: number, depth: number, first: boolean): boolean => {
    if (used > copies) return false
    const k = key(h, used, depth)
    if (seen.has(k)) return false
    seen.set(k, 1)
    if (used === copies && reachesGoal(h, goal)) return true
    if (habit === 'views-then-copy') {
      const c = applyOp(h.view, { op: 'contiguous' })
      if (!('error' in c) && used + (c.copied > 0 ? 1 : 0) === copies && reachesGoal({ view: c.view, buffer: c.copied > 0 ? logical(h) : h.buffer }, goal)) return true
    }
    if (depth >= maxOps) return false
    const next: { op: ShiftOp; via: boolean }[] = []
    for (const order of orders(h.view.shape.length)) next.push({ op: { op: 'permute', order }, via: habit === 'copy-before-every' })
    for (const shape of shapes(numel(h.view.shape))) if (shape.join() !== h.view.shape.join()) next.push({ op: { op: 'view', shape }, via: habit === 'copy-before-view' || habit === 'copy-before-every' })
    for (const { op: o, via } of next) {
      let cur = h
      let u = used
      let d = depth
      if (via || (habit === 'copy-first' && first)) {
        const c = applyOp(cur.view, { op: 'contiguous' })
        if ('error' in c) continue
        if (c.copied > 0) u++
        cur = { view: c.view, buffer: c.copied > 0 ? logical(cur) : cur.buffer }
        d++
      }
      const r = applyOp(cur.view, o)
      if ('error' in r) continue
      if (go({ view: r.view, buffer: cur.buffer }, u, d + 1, false)) return true
    }
    return false
  }
  return go(startOf(start), 0, 0, true)
}
