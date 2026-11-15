/*
 * packages/sim/tensor (W2-T13): the lesson's worked examples, GAMES.md §4's invariants over seeded random chains, the fewest-copies
 * search against an independent brute force, grid coverage by enumeration, and the goldens (tests/fixtures/sim/tensor.json), which
 * reproduce. That the view rules are PyTorch's is tests/sim/tensor-torch.test.ts's.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson, below, between, pick, rngFor } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import { MAX_PLAN_NUMEL, addresses, applyOp, applyOps, contiguousView, fewestCopies, fewestPlan, goalAfter, gridCoverage, hasInternalOverlap, isContiguous, naivePlan, numel, programCells } from '../../packages/sim/tensor'
import type { Goal, ShiftOp, TView } from '../../packages/sim/tensor'
import { MODELS, renderFixture } from '../../scripts/vectors'
import { seeds } from '../seeds'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const ok = (v: TView, o: ShiftOp) => {
  const r = applyOp(v, o)
  if ('error' in r) throw new Error(`${JSON.stringify(o)}: ${r.error}`)
  return r
}

describe('the lesson\'s examples', () => {
  test('a transpose is free, and view on it fails where reshape copies every element', () => {
    const x = contiguousView([4, 6])
    const t = ok(x, { op: 'transpose', a: 0, b: 1 })
    expect(t).toEqual({ view: { offset: 0, shape: [6, 4], strides: [1, 6] }, copied: 0 })
    expect(isContiguous(t.view)).toBe(false)
    expect(applyOp(t.view, { op: 'view', shape: [24] })).toEqual({ error: 'not-viewable' })
    expect(ok(t.view, { op: 'reshape', shape: [24] })).toEqual({ view: contiguousView([24]), copied: 24 })
    expect(applyOp(x, { op: 'view', shape: [5, 5] })).toEqual({ error: 'bad-shape' })
  })

  test('expand gives stride 0, writing to it is flagged, and contiguous() on it moves every element of the result', () => {
    const e = ok(contiguousView([1, 4]), { op: 'expand', shape: [3, 4] })
    expect(e.view.strides).toEqual([0, 1])
    expect(hasInternalOverlap(e.view)).toBe(true)
    expect(ok(e.view, { op: 'contiguous' }).copied).toBe(12)
    expect(applyOp(contiguousView([2, 4]), { op: 'expand', shape: [3, 4] })).toEqual({ error: 'bad-shape' })
  })

  test('[tokens, heads, head_dim]: split, permute, then contiguous() moves the whole tensor, and contiguous() on a contiguous tensor moves nothing', () => {
    const split = ok(contiguousView([12, 8]), { op: 'view', shape: [2, 6, 2, 4] })
    const p = ok(split.view, { op: 'permute', order: [0, 2, 1, 3] })
    expect(p.copied).toBe(0)
    expect(ok(p.view, { op: 'contiguous' }).copied).toBe(96)
    expect(ok(contiguousView([3, 3]), { op: 'contiguous' }).copied).toBe(0)
  })

  test('the ghost beats the contiguous-first shortcut where a reshape can read the strides', () => {
    const start = contiguousView([2, 3, 4])
    const ops: ShiftOp[] = [{ op: 'permute', order: [2, 0, 1] }, { op: 'reshape', shape: [8, 3] }, { op: 'permute', order: [1, 0] }, { op: 'reshape', shape: [2, 12] }]
    const goal = goalAfter(start, ops, false)!
    expect(naivePlan(start, ops, false)!.copies).toBe(2)
    expect(fewestPlan(start, goal)!.copies).toBe(1)
  })
})

describe('invariants over random chains', () => {
  const SEEDS = seeds(1)
  const randomShape = (rng: Rng) => Array.from({ length: between(rng, 1, 3) }, () => between(rng, 1, 5))
  const randomOp = (rng: Rng, v: TView): ShiftOp => {
    const rank = v.shape.length
    switch (below(rng, 6)) {
      case 0: return { op: 'permute', order: Array.from({ length: rank }, (_, i) => i).sort(() => below(rng, 3) - 1) }
      case 1: return { op: 'transpose', a: below(rng, rank), b: below(rng, rank) }
      case 2: return { op: 'reshape', shape: pick(rng, [[numel(v.shape)], [1, numel(v.shape)], v.shape, [...v.shape].reverse()]) }
      case 3: return { op: 'slice', dim: below(rng, rank), start: between(rng, 0, 2), stop: between(rng, 1, 5), step: between(rng, 1, 2) }
      case 4: return { op: 'expand', shape: [2, ...v.shape.map((d) => (d === 1 ? 3 : d))] }
      default: return { op: 'contiguous' }
    }
  }

  test(`views never move the buffer, contiguous() on a contiguous tensor copies 0, and a copy is contiguous and in logical order (${SEEDS.length} seeds)`, () => {
    for (const seed of SEEDS) {
      const rng = rngFor(seed, 'tensor-chain')
      let v = contiguousView(randomShape(rng))
      for (let i = 0; i < 6; i++) {
        const o = randomOp(rng, v)
        const r = applyOp(v, o)
        if ('error' in r) continue
        const before = addresses(v)
        if (r.copied === 0) {
          // Metadata only: every address is one the tensor already read, and a copy-free op that keeps the count keeps the elements.
          const have = new Set(before)
          for (const a of addresses(r.view)) expect(have.has(a), `${seed} ${JSON.stringify(o)}`).toBe(true)
        } else {
          expect(['reshape', 'contiguous']).toContain(o.op)
          expect(r.copied).toBe(numel(r.view.shape))
          expect(isContiguous(r.view)).toBe(true)
          expect(addresses(r.view)).toEqual(addresses(r.view).map((_, k) => k))
          expect(r.view.offset).toBe(0)
        }
        if (isContiguous(v) && o.op === 'contiguous') expect(r.copied).toBe(0)
        // `view` succeeds exactly where reshape copies nothing.
        if (o.op === 'reshape') expect('error' in applyOp(v, { op: 'view', shape: o.shape })).toBe(r.copied > 0)
        v = r.view
      }
    }
  })

  test('permute and its inverse are the identity, and a slice shows the elements a loop over it would', () => {
    for (const seed of SEEDS) {
      const rng = rngFor(seed, 'tensor-perm')
      const x = contiguousView(randomShape(rng).concat([2]))
      const order = Array.from({ length: x.shape.length }, (_, i) => i).sort(() => below(rng, 3) - 1)
      const inverse = order.map((_, i) => order.indexOf(i))
      const there = ok(x, { op: 'permute', order })
      expect(ok(there.view, { op: 'permute', order: inverse }).view).toEqual(x)
      const dim = below(rng, x.shape.length)
      const step = between(rng, 1, 3)
      const s = ok(x, { op: 'slice', dim, start: 0, stop: x.shape[dim] ?? 1, step }).view
      expect(numel(s.shape)).toBe((numel(x.shape) / (x.shape[dim] ?? 1)) * Math.ceil((x.shape[dim] ?? 1) / step))
    }
  })
})

/** An independent search: every reshape (every ordered factorization), every permutation, contiguous; by element identity; to depth `maxOps`. */
function bruteCopies(start: TView, goal: Goal, maxOps: number): number | null {
  const n = numel(start.shape)
  const shapes: number[][] = []
  const rec = (rest: number, acc: number[]) => {
    if (rest === 1) return void shapes.push([...acc])
    for (let d = 2; d <= rest; d++) if (rest % d === 0) rec(rest / d, [...acc, d])
  }
  rec(n, [])
  const perms = (k: number): number[][] => (k === 1 ? [[0]] : perms(k - 1).flatMap((p) => Array.from({ length: k }, (_, at) => [...p.slice(0, at), k - 1, ...p.slice(at)])))
  interface S { v: TView; buf: number[]; copies: number }
  let best: number | null = null
  const seen = new Map<string, number>()
  const walk = (s: S, depth: number) => {
    const logical = addresses(s.v).map((a) => s.buf[a])
    if (s.v.shape.join() === goal.shape.join() && logical.join() === goal.elements.join() && (!goal.contiguous || isContiguous(s.v))) best = best === null ? s.copies : Math.min(best, s.copies)
    if (depth === maxOps) return
    const k = `${depth}|${s.copies}|${JSON.stringify(s.v)}|${logical.join()}`
    if (seen.has(k)) return
    seen.set(k, 1)
    const ops: ShiftOp[] = [{ op: 'contiguous' }, ...shapes.map((shape): ShiftOp => ({ op: 'reshape', shape })), ...perms(s.v.shape.length).map((order): ShiftOp => ({ op: 'permute', order }))]
    for (const o of ops) {
      const r = applyOp(s.v, o)
      if ('error' in r) continue
      walk({ v: r.view, buf: r.copied > 0 ? logical : s.buf, copies: s.copies + (r.copied > 0 ? 1 : 0) }, depth + 1)
    }
  }
  walk({ v: start, buf: Array.from({ length: n }, (_, i) => i), copies: 0 }, 0)
  return best
}

describe('fewestPlan', () => {
  const SEEDS = seeds(1).slice(0, 60)
  test(`replays to its goal, never costs more than the shortcut, and matches an independent search on small tensors (${SEEDS.length} seeds)`, () => {
    for (const seed of SEEDS) {
      const rng = rngFor(seed, 'tensor-plan')
      const shape = pick(rng, [[2, 6], [3, 4], [2, 3, 2], [4, 2], [2, 2, 3], [12], [6, 2]])
      const start = contiguousView(shape)
      let ops: ShiftOp[] = []
      for (let i = 0, cur = start; i < between(rng, 1, 3); i++) {
        const choices: ShiftOp[] = [{ op: 'permute', order: Array.from({ length: cur.shape.length }, (_, k) => k).reverse() }, { op: 'reshape', shape: pick(rng, [[numel(cur.shape)], [numel(cur.shape) / 2, 2], [2, numel(cur.shape) / 2]]) }]
        const o = pick(rng, choices)
        const r = applyOp(cur, o)
        if ('error' in r) continue
        ops = [...ops, o]
        cur = r.view
      }
      const contiguous = below(rng, 2) === 0
      const goal = goalAfter(start, ops, contiguous)!
      const plan = fewestPlan(start, goal, 4)!
      expect(plan, `${seed}`).not.toBeNull()
      // Replay: the plan's operations reach the goal's shape, and its copies are the ones it says.
      const replay = applyOps(start, plan.ops)
      expect('error' in replay).toBe(false)
      if (!('error' in replay)) {
        expect(replay.view.shape).toEqual(goal.shape)
        expect(replay.copied).toBe(plan.moved)
        if (contiguous) expect(isContiguous(replay.view)).toBe(true)
      }
      const naive = naivePlan(start, ops, contiguous)!
      expect(plan.copies).toBeLessThanOrEqual(naive.copies)
      expect(plan.copies, `${seed} ${JSON.stringify({ shape, ops, contiguous })}`).toBe(bruteCopies(start, goal, 4)!)
      expect(fewestCopies(start, goal, 4)).toBe(plan.copies)
    }
  })

  test('is null when the goal is out of reach, and refuses a tensor beyond MAX_PLAN_NUMEL', () => {
    const start = contiguousView([2, 3])
    expect(fewestPlan(start, { shape: [7], elements: [0, 1, 2, 3, 4, 5, 6], contiguous: true })).toBeNull()
    expect(() => fewestPlan(contiguousView([MAX_PLAN_NUMEL + 1]), { shape: [1], elements: [0], contiguous: false })).toThrow(RangeError)
  })
})

describe('gridCoverage', () => {
  const SEEDS = seeds(1)
  test(`counts each element once, and agrees with the cells of every program (${SEEDS.length} seeds)`, () => {
    for (const seed of SEEDS) {
      const rng = rngFor(seed, 'tensor-grid')
      const rank = between(rng, 1, 3)
      const shape = Array.from({ length: rank }, () => between(rng, 1, 9))
      const block = Array.from({ length: rank }, () => pick(rng, [1, 2, 3, 4, 8]))
      const g = gridCoverage(shape, block)
      if ('error' in g) throw new Error('valid grid refused')
      expect(g.exact).toBe(true)
      expect(g.covered).toBe(numel(shape))
      expect(g.masked).toBe(g.lanes - numel(shape))
      const hits = new Map<string, number>()
      let masked = 0
      const index = new Array<number>(rank).fill(0)
      for (let p = 0; p < g.programs; p++) {
        let rest = p
        for (let d = rank - 1; d >= 0; d--) {
          index[d] = rest % (g.grid[d] ?? 1)
          rest = Math.floor(rest / (g.grid[d] ?? 1))
        }
        const c = programCells(shape, block, index)
        if ('error' in c) throw new Error('valid program refused')
        masked += c.masked
        for (const cell of c.cells) hits.set(cell.join(','), (hits.get(cell.join(',')) ?? 0) + 1)
      }
      expect(masked).toBe(g.masked)
      expect(hits.size).toBe(numel(shape))
      for (const n of hits.values()) expect(n).toBe(1)
    }
  })

  test('a grid that is too small leaves elements uncovered, and a block that is not a power of two cannot be a Triton BLOCK', () => {
    expect(gridCoverage([10, 7], [4, 4], [2, 2])).toMatchObject({ programs: 4, covered: 56, masked: 8, exact: false })
    expect(gridCoverage([10, 7], [4, 4])).toMatchObject({ programs: 6, lanes: 96, masked: 26, exact: true, pow2: true })
    expect(gridCoverage([9], [3])).toMatchObject({ exact: true, pow2: false })
    expect(gridCoverage([8, 8], [4])).toEqual({ error: 'bad-shape' })
    expect(gridCoverage([8], [0])).toEqual({ error: 'bad-shape' })
  })
})

describe('the goldens (tests/fixtures/sim/tensor.json)', () => {
  const text = readFileSync(path.join(root, 'tests/fixtures/sim/tensor.json'), 'utf8')
  const fixture = JSON.parse(text) as { model: string; vectors: { name: string; input: unknown; sha256: string; output: unknown }[] }
  const model = MODELS.find((m) => m.model === 'tensor')!

  test('hold one vector for each level of GAMES.md §4, named once', () => {
    expect(fixture.model).toBe('tensor')
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(fixture.vectors.length)
    for (const prefix of ['views', 'stride-zero', 'three-d', 'fewest', 'grid']) expect(fixture.vectors.some((v) => v.name.startsWith(prefix)), prefix).toBe(true)
  })

  test('reproduce byte for byte from their recorded inputs, with the recorded SHA-256, and are what the script writes', () => {
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    for (const [i, c] of model.cases(root).entries()) {
      const want = fixture.vectors[i]!
      expect(canonicalJson(c.input), c.name).toBe(canonicalJson(want.input))
      const made = canonicalJson(c.run())
      expect(made, c.name).toBe(canonicalJson(want.output))
      expect(sha256(made), c.name).toBe(want.sha256)
    }
    expect(text).toBe(renderFixture(model, root))
  })

  test('would catch a changed output: one stride moved gives a different hash', () => {
    const v = fixture.vectors.find((x) => x.name === 'views-transpose-is-free')!
    const moved = structuredClone(v.output) as { steps: { view: { strides: number[] } }[] }
    moved.steps[0]!.view.strides[0]! += 1
    expect(sha256(canonicalJson(moved))).not.toBe(v.sha256)
  })
})
