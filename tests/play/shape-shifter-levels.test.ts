/*
 * W2b-T28: the levels of Tensor views, held to the course's model (`packages/sim/tensor`) and not to the torch vectors, which W2-T13's labs run
 * keeps (tests/sim/tensor-torch.test.ts).
 *
 *   - Each practice level is the tensor GAMES.md §4.3 prints, and its reference is the model's optimum on every draw: the copies and the
 *     operations `fewestPlan` finds.
 *   - `fewest`'s reference makes the model's fewest copies on every target of every banded seed, the naive path costs at least one more copy,
 *     the target is reachable in six operations, and the habit each kind of target is drawn against cannot reach it, which an independent
 *     search of the habits checks (shape-shifter-support.ts). Each band's acceptance is measured and printed against §2.1's floor of 20%.
 *   - `grid` passes only on exact coverage with the least waste: every launch of the practice tensor within a few steps of the reference is
 *     graded, and the least masked count is checked against every BLOCK and grid.
 *   - Each graded level's best blind strategy is at or under the gate's bound.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { BLIND_BOUND } from '@es/play/blind'
import { acceptCandidate, drawCandidate, drawGridShape, gridTask, PLAN_OPS, PROGRAM_CAP } from '@es/play/shape-shifter/draw'
import type { FewestKind } from '@es/play/shape-shifter/draw'
import { ghostOf } from '@es/play/shape-shifter/bands'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { buildLevel, FEWEST_ATTEMPT_CAP, GRID_PRACTICE_SHAPE } from '@es/play/shape-shifter/levels'
import { reaches } from '@es/play/shape-shifter/engine'
import { FIRST_SEED, SHIFT_BLIND } from '@es/play/shape-shifter/blind'
import { ghostActions, shiftReduce, shiftInit } from '@es/play/shape-shifter/session'
import type { GridLevel, LayoutLevel, ShiftLevel } from '@es/play/shape-shifter/types'
import { rngFor } from '@es/sim/core'
import { addresses, fewestPlan, gridCoverage, goalAfter, naivePlan, numel } from '@es/sim/tensor'
import { checkBlind } from '../../scripts/verify-games'
import { SEED_COUNT, seeds } from '../seeds'
import { habitReaches, S, practiceOf, stateAfter } from './shape-shifter-support'

setDefaultTimeout(120_000)

const SEEDS = seeds(1)
const layout = (level: ShiftLevel): LayoutLevel => {
  if (level.kind !== 'layout') throw new Error('a layout level was expected')
  return level
}
const gridLevel = (level: ShiftLevel): GridLevel => {
  if (level.kind !== 'grid') throw new Error('a grid level was expected')
  return level
}

describe('the practice levels are the tensors GAMES.md §4.3 prints, and their references are the model\'s optimum', () => {
  test('views: [4, 6] read as one row of 24, with 1 copy of 24 elements in 2 operations, by transpose and reshape', () => {
    const task = layout(practiceOf('views')).tasks[0]
    expect([task.start.shape, task.goal.shape, task.goal.contiguous]).toEqual([[4, 6], [24], true])
    expect([task.copies, task.moved, task.ghost.length, task.answer]).toEqual([1, 24, 2, 24])
    expect(task.ghost[0]).toEqual({ op: 'transpose', a: 0, b: 1 })
    const plan = fewestPlan(task.start, task.goal)
    expect([plan?.copies, plan?.moved, plan?.ops.length]).toEqual([1, 24, 2])
  })

  test('stride-zero: a row of 6 to [4, 6], with 1 copy of 24 elements in 2 operations, and `expand` moves 0', () => {
    const task = layout(practiceOf('stride-zero')).tasks[0]
    expect([task.start.shape, task.goal.shape]).toEqual([[6], [4, 6]])
    expect([task.copies, task.moved, task.ghost.length, task.answer]).toEqual([1, 24, 2, 0])
    expect(task.ghost[0]).toEqual({ op: 'expand', shape: [4, 6] })
    const plan = fewestPlan(task.start, task.goal)
    expect([plan?.copies, plan?.moved, plan?.ops.length]).toEqual([1, 24, 2])
  })

  test('three-d: [4, 8] to [2, 4, 4], with 1 copy of 32 elements in 3 operations; the tokens\' stride after the permute is 8', () => {
    const task = layout(practiceOf('three-d')).tasks[0]
    expect([task.start.shape, task.goal.shape]).toEqual([[4, 8], [2, 4, 4]])
    expect([task.copies, task.moved, task.ghost.length, task.answer]).toEqual([1, 32, 3, 8])
    expect(task.ghost[0]).toEqual({ op: 'reshape', shape: [4, 2, 4] })
    expect(task.ghost[1]).toEqual({ op: 'permute', order: [1, 0, 2] })
    const after = stateAfter(layout(practiceOf('three-d')), ...task.ghost.slice(0, 2).map((o) => ({ t: 'op' as const, op: o })))
    const run = after.runs[0]
    expect(run.kind === 'layout' ? run.view.strides : null).toEqual([4, 8, 1])
    const plan = fewestPlan(task.start, task.goal)
    expect([plan?.copies, plan?.moved, plan?.ops.length]).toEqual([1, 32, 3])
  })

  test(`on every banded seed of the three practice levels (${SEEDS.length}), the reference reaches the target with the model's fewest copies`, () => {
    for (const id of ['views', 'stride-zero', 'three-d'] as const) {
      for (const seed of SEEDS) {
        const level = layout(S.level(id, seed))
        expect([id, seed, S.inBand(id, seed)]).toEqual([id, seed, true])
        for (const task of level.tasks) {
          const ghost = ghostOf(task)
          expect([id, seed, ghost !== null && reaches(ghost.end, task.goal)]).toEqual([id, seed, true])
          const plan = fewestPlan(task.start, task.goal)
          expect([id, seed, plan?.copies, plan?.ops.length]).toEqual([id, seed, task.copies, task.ghost.length])
        }
      }
    }
  })

  test('a `view` of the transposed [4, 6] to one row is refused, and `reshape` copies in its place', () => {
    const level = practiceOf('views')
    const flipped = stateAfter(level, { t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
    const refused = shiftReduce(flipped, { t: 'op', op: { op: 'view', shape: [24] } })
    const run = refused.runs[0]
    expect(run.kind === 'layout' ? [run.refused.length, run.copies, run.ops.length] : null).toEqual([1, 0, 1])
  })
})

describe("`fewest`'s targets: the reference is the model's optimum, and the habits each kind is drawn against cannot reach it", () => {
  const KINDS: readonly FewestKind[] = ['copy-before-view', 'no-copy']
  const WANT: Readonly<Record<FewestKind, number>> = { 'copy-before-view': 1, 'no-copy': 0 }

  test('acceptance of each band is measured, and is over §2.1\'s floor of 20%', () => {
    const lines: string[] = []
    for (const kind of KINDS) {
      const rng = rngFor(7, `shape-shifter-levels/${kind}`)
      let drawn = 0
      let kept = 0
      for (let i = 0; i < SEEDS.length; i++) {
        const candidate = drawCandidate(kind, rng)
        if (candidate === null) continue
        drawn++
        if (acceptCandidate(kind, candidate) !== null) kept++
      }
      lines.push(`${kind}: ${kept} of ${drawn} candidates kept (${((100 * kept) / drawn).toFixed(1)}%)`)
      expect(kept / drawn).toBeGreaterThanOrEqual(0.2)
    }
    console.log(`Tensor views, fewest's band, acceptance over ${SEEDS.length} candidates of each kind [measured]:\n  ${lines.join('\n  ')}`)
  })

  test('every kept candidate: the model\'s fewest copies, a naive path with at least one more, six operations, and no habit reaches it', () => {
    for (const kind of KINDS) {
      const rng = rngFor(11, `shape-shifter-levels/kept/${kind}`)
      let kept = 0
      for (let i = 0; i < SEEDS.length; i++) {
        const d = drawCandidate(kind, rng)
        const task = d === null ? null : acceptCandidate(kind, d)
        if (d === null || task === null) continue
        kept++
        const goal = goalAfter(d.start, d.chain, d.contiguous)
        expect(goal).not.toBeNull()
        if (goal === null) continue
        const plan = fewestPlan(d.start, goal, PLAN_OPS)
        expect([kind, plan?.copies]).toEqual([kind, WANT[kind]])
        expect([kind, task.copies, task.ghost.length <= PLAN_OPS]).toEqual([kind, WANT[kind], true])
        const naive = naivePlan(d.start, d.chain, goal.contiguous)
        expect([kind, (naive?.copies ?? -1) >= (plan?.copies ?? 99) + 1]).toEqual([kind, true])
        const habits = kind === 'copy-before-view' ? (['views-then-copy'] as const) : (['copy-before-view', 'copy-first', 'copy-before-every'] as const)
        for (const habit of habits) expect([kind, habit, habitReaches(habit, d.start, goal, WANT[kind])]).toEqual([kind, habit, false])
        // Every tensor along the chain has rank 3 or less, the chain holds no slice and no expand, and the tensor has 12 to 64 elements.
        expect(goal.shape.length).toBeLessThanOrEqual(3)
        expect(numel(goal.shape)).toBeGreaterThanOrEqual(12)
        expect(numel(goal.shape)).toBeLessThanOrEqual(64)
        expect(d.chain.every((o) => o.op === 'reshape' || o.op === 'permute')).toBe(true)
        // A start's buffer spans at most 64 addresses, so the strip fits beside the cells.
        expect(Math.max(...addresses(d.start)) + 1).toBeLessThanOrEqual(64)
        // The no-copy kind starts from a tensor that is not contiguous, and its target is not.
        if (kind === 'no-copy') expect([task.goal.contiguous, addresses(d.start).join() === Array.from({ length: numel(d.start.shape) }, (_, i) => i).join()]).toEqual([false, false])
      }
      expect(kept).toBeGreaterThan(SEEDS.length / 10)
    }
  })

  test(`on every banded seed (${SEEDS.length}) a run holds three targets, one of each kind and a third of either, each with the model's fewest copies`, () => {
    let both = 0
    for (const seed of SEEDS) {
      expect(S.inBand('fewest', seed)).toBe(true)
      const level = layout(S.level('fewest', seed))
      expect(level.tasks).toHaveLength(3)
      const kinds = level.tasks.map((task) => task.kind)
      expect(kinds.includes('copy-before-view') && kinds.includes('no-copy')).toBe(true)
      if (new Set(kinds).size === 2) both++
      const goals = new Set(level.tasks.map((task) => `${task.goal.shape}|${task.goal.elements}`))
      expect(goals.size).toBe(3)
      for (const task of level.tasks) {
        expect([seed, task.copies]).toEqual([seed, WANT[task.kind as FewestKind]])
        const plan = fewestPlan(task.start, task.goal, PLAN_OPS)
        expect([seed, plan?.copies]).toEqual([seed, task.copies])
        expect(task.ghost.length).toBeLessThanOrEqual(PLAN_OPS)
        expect(task.answer).toBe(task.copies)
        const ghost = ghostOf(task)
        expect([seed, ghost !== null && reaches(ghost.end, task.goal), ghost?.copies]).toEqual([seed, true, task.copies])
        // The reference uses only the buttons the level offers, and never `reshape` or `expand`.
        expect(task.ghost.every((o) => level.offered.includes(o.op))).toBe(true)
      }
      // Played through the session, the reference passes its own level.
      const ghost = S.ghost(level)
      expect([seed, S.done(ghost), S.grade(ghost, ghost).ok]).toEqual([seed, true, true])
    }
    // The third target is of either kind at even odds, so both mixes turn up.
    expect(both).toBeGreaterThan(0)
  })

  test("a learner who calls contiguous() first on a no-copy target makes a copy the reference never makes, played through the session, and fails it", () => {
    const level = layout(S.level('fewest', 1000))
    let checked = 0
    level.tasks.forEach((task, i) => {
      if (task.kind !== 'no-copy') return
      // The reference plays the targets before this one, then the learner copies first and follows the reference's plan.
      let state = ghostActions(level).slice(0, ghostActionsBefore(level, i)).reduce(shiftReduce, shiftInit(level))
      state = shiftReduce(state, { t: 'op', op: { op: 'contiguous' } })
      for (const o of task.ghost) {
        if (state.done || state.at !== i) break
        state = shiftReduce(state, { t: 'op', op: o })
      }
      const run = state.runs[i]
      expect(run.kind === 'layout' && run.copies >= 1 && !(run.status === 'reached' && run.copies === task.copies)).toBe(true)
      checked++
    })
    expect(checked).toBeGreaterThan(0)
  })
})

/** How many of the reference's actions play the targets before target `i`. */
function ghostActionsBefore(level: LayoutLevel, i: number): number {
  return level.tasks.slice(0, i).reduce((n, task) => n + task.ghost.length, 0)
}

describe('`grid` passes only on exact coverage with the least waste', () => {
  test('the practice tensor [12, 20]: the reference launches BLOCK (16, 4) on a grid of (1, 5): 5 programs, 320 lanes, 80 masked; the plain launches mask more', () => {
    const task = gridLevel(practiceOf('grid')).tasks[0]
    expect(task.shape).toEqual([...GRID_PRACTICE_SHAPE])
    expect([task.block, task.grid, task.programs, task.lanes, task.least, task.answer]).toEqual([[16, 4], [1, 5], 5, 320, 80, 80])
    // One program, and the squarest tile within the cap (8 by 8), mask more.
    expect([task.onePass, task.square]).toEqual([272, 144])
  })

  test('the least masked count within the cap is the least over every BLOCK from 1 to 32 that is a power of two, and every grid up to the cap', () => {
    let least = Infinity
    let ways = 0
    for (let b0 = 1; b0 <= 32; b0++) {
      for (let b1 = 1; b1 <= 32; b1++) {
        if ((b0 & (b0 - 1)) !== 0 || (b1 & (b1 - 1)) !== 0) continue
        for (let g0 = 1; g0 <= PROGRAM_CAP; g0++) {
          for (let g1 = 1; g0 * g1 <= PROGRAM_CAP; g1++) {
            const g = gridCoverage([12, 20], [b0, b1], [g0, g1])
            if ('error' in g || !g.exact) continue
            if (g.masked < least) {
              least = g.masked
              ways = 1
            } else if (g.masked === least) ways++
          }
        }
      }
    }
    expect([least, ways]).toEqual([80, 1])
  })

  test('every launch of the practice tensor is graded: ok exactly when every element is covered once and the masked lanes are the least', () => {
    const level = practiceOf('grid')
    let passed = 0
    for (const b0 of [1, 2, 4, 8, 16, 32]) {
      for (const b1 of [1, 2, 4, 8, 16, 32]) {
        for (const delta of [-1, 0, 1]) {
          let state = shiftInit(level)
          state = shiftReduce(state, { t: 'block', dim: 0, value: b0 })
          state = shiftReduce(state, { t: 'block', dim: 1, value: b1 })
          const run = state.runs[0]
          if (run.kind !== 'grid') throw new Error('a grid run was expected')
          const g1 = run.grid[1] + delta
          if (g1 < 1) continue
          state = shiftReduce(state, { t: 'grid', dim: 1, value: g1 })
          const done = shiftReduce(state, { t: 'launch' })
          const after = done.runs[0]
          if (after.kind !== 'grid') throw new Error('a grid run was expected')
          if (after.launch === null) {
            // Refused: more programs than the cap. Nothing launched, and the run is not over.
            expect([b0, b1, delta, done.done]).toEqual([b0, b1, delta, false])
            continue
          }
          const expectOk = after.launch.exact && after.launch.masked === 80
          expect([b0, b1, delta, S.grade(done, done).ok]).toEqual([b0, b1, delta, expectOk])
          if (expectOk) passed++
        }
      }
    }
    // Only the reference's launch passes: BLOCK (16, 4) on a grid of (1, 5).
    expect(passed).toBe(1)
  })

  test('the named wrong launches fail: one program masks 272, 8 by 8 masks 144, a grid of (1, 4) leaves 48 uncovered, BLOCK 12 is refused', () => {
    const level = practiceOf('grid')
    const launch = (b: [number, number], g?: [number, number]) => {
      let state = shiftInit(level)
      state = shiftReduce(state, { t: 'block', dim: 0, value: b[0] })
      state = shiftReduce(state, { t: 'block', dim: 1, value: b[1] })
      if (g !== undefined) {
        state = shiftReduce(state, { t: 'grid', dim: 0, value: g[0] })
        state = shiftReduce(state, { t: 'grid', dim: 1, value: g[1] })
      }
      return shiftReduce(state, { t: 'launch' })
    }
    const masked = (state: ReturnType<typeof launch>) => (state.runs[0].kind === 'grid' ? state.runs[0].launch : null)
    expect(masked(launch([16, 32]))?.masked).toBe(272)
    expect(masked(launch([8, 8]))?.masked).toBe(144)
    const short = masked(launch([16, 4], [1, 4]))
    expect([short?.exact, short?.covered]).toEqual([false, 192])
    expect(launch([16, 4], [1, 4]).moments.find((m) => m.id === 'uncovered')).toMatchObject({ n: 48, dim: 1, size: 20, block: 4, g: 5 })
    expect(S.grade(launch([16, 4], [1, 4]), launch([16, 4])).ok).toBe(false)
    const twelve = launch([12, 4])
    expect([twelve.done, masked(twelve), twelve.moments.find((m) => m.id === 'not-pow2')]).toMatchObject([false, null, { x: 12 }])
    const tooMany = launch([1, 1])
    expect([tooMany.done, tooMany.moments.find((m) => m.id === 'too-many')]).toMatchObject([false, { cap: 6, n: 240 }])
    expect(S.grade(launch([16, 4]), launch([16, 4])).ok).toBe(true)
  })

  test(`on every banded seed (${SEEDS.length}) three distinct fair tensors: the least masked count is above 0 and under one program's and the squarest tile's`, () => {
    for (const seed of SEEDS) {
      expect(S.inBand('grid', seed)).toBe(true)
      const level = gridLevel(S.level('grid', seed))
      expect(level.tasks).toHaveLength(3)
      expect(new Set(level.tasks.map((task) => task.shape.join())).size).toBe(3)
      for (const task of level.tasks) {
        expect(numel(task.shape)).toBeLessThanOrEqual(256)
        expect(task.shape.every((n) => n >= 5 && n <= 20)).toBe(true)
        expect(task.least).toBeGreaterThan(0)
        expect(task.least).toBeLessThan(task.onePass)
        expect(task.least).toBeLessThan(task.square)
        expect(task.programs).toBeLessThanOrEqual(level.cap)
        expect(gridTask(task.shape)).toEqual(task)
      }
      const ghost = S.ghost(level)
      expect([S.done(ghost), S.grade(ghost, ghost).ok]).toEqual([true, true])
    }
  })

  test('acceptance of the grid band over drawn tensors is over §2.1\'s floor of 20%, and is printed', () => {
    const rng = rngFor(5, 'shape-shifter-levels/grid')
    let kept = 0
    let drawn = 0
    for (let i = 0; i < SEEDS.length; i++) {
      const shape = drawGridShape(rng)
      drawn++
      if (gridTask(shape) !== null) kept++
    }
    console.log(`Tensor views, grid's band, acceptance over ${drawn} drawn tensors [measured]: ${kept} kept (${((100 * kept) / drawn).toFixed(1)}%)`)
    expect(kept / drawn).toBeGreaterThanOrEqual(0.2)
  })
})

describe('the levels are fair and finite', () => {
  test('a graded `fewest` target allows a few operations, so that a learner cannot wander for ever', () => {
    const level = layout(S.level('fewest', 1000))
    expect(level.attemptCap).toBe(FEWEST_ATTEMPT_CAP)
    expect(level.failOnRefusal).toBe(true)
    expect(level.offered).toEqual(['view', 'transpose', 'permute', 'contiguous'])
  })

  test('a level that does not exist is refused, and a seed that is not a seed', () => {
    expect(() => buildLevel('nope', 0)).toThrow(RangeError)
    expect(() => buildLevel('views', -1)).toThrow(RangeError)
  })

  test('the same seed draws the same level twice', () => {
    for (const [id] of SHAPE_SHIFTER.levels.map((level) => [level.id])) expect(JSON.stringify(buildLevel(id, 77))).toBe(JSON.stringify(buildLevel(id, 77)))
  })
})

describe("each graded level's best scene-blind strategy is at or under the gate's bound", () => {
  test('the gate reads both graded levels, on at least the samples it needs', () => {
    const session = S
    const report = checkBlind(SHAPE_SHIFTER, session, SHIFT_BLIND)
    expect(report.problems).toEqual([])
    expect(report.lines).toHaveLength(2)
    console.log(`Tensor views, blind strategies [measured]:\n  ${report.lines.join('\n  ')}`)
  })

  test('every strategy of every probe is at or under the bound, level by level', () => {
    for (const id of ['fewest', 'grid'] as const) {
      const rows = SHIFT_BLIND[id](S, 40)
      expect(rows.length).toBeGreaterThan(30)
      expect(Math.max(...rows.map((row) => row.rate))).toBeLessThanOrEqual(BLIND_BOUND)
      expect(rows.every((row) => row.of >= 30)).toBe(true)
    }
  })

  test('the sample starts clear of the band the gate reads, and counts up', () => {
    expect(FIRST_SEED).toBeGreaterThanOrEqual(400)
    expect(SEED_COUNT).toBeGreaterThanOrEqual(200)
  })
})
