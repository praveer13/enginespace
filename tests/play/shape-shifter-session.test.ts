/*
 * W2b-T28: the session of Tensor views keeps the contract of GAMES.md §2.5 and plays the model of `packages/sim/tensor`: a view never moves the
 * buffer, a copy writes every element, a refused `view` changes nothing, and the state is plain data that holds no display string.
 */
import { describe, expect, test } from 'bun:test'
import { stateHash, finishRun, startRun } from '@es/play'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { buildLevel } from '@es/play/shape-shifter/levels'
import { ghostActions, shiftAsk, shiftInit, shiftReduce, shiftSession } from '@es/play/shape-shifter/session'
import type { LayoutRun, ShiftState } from '@es/play/shape-shifter/types'
import { addresses } from '@es/sim/tensor'
import { op, practiceOf, S, stateAfter, stringsOf } from './shape-shifter-support'

const layoutRun = (s: ShiftState, i = s.at): LayoutRun => {
  const run = s.runs[i]
  if (run.kind !== 'layout') throw new Error('a layout run was expected')
  return run
}

describe('the contract of a session (GAMES.md §2.5)', () => {
  test('every level on its practice seed: starts unfinished, is deterministic, and the reference finishes and passes its own grade', () => {
    for (const entry of SHAPE_SHIFTER.levels) {
      const level = S.level(entry.id, entry.practiceSeed)
      const start = S.init(level)
      expect([entry.id, S.done(start)]).toEqual([entry.id, false])
      expect(stateHash(start)).toBe(stateHash(S.init(S.level(entry.id, entry.practiceSeed))))
      const ghost = S.ghost(level)
      expect([entry.id, S.done(ghost), S.grade(ghost, ghost)]).toEqual([entry.id, true, { score: 1, ok: true }])
      expect(stateHash(ghost)).toBe(stateHash(S.ghost(S.level(entry.id, entry.practiceSeed))))
      expect(S.debrief(ghost, ghost).sentence.length).toBeGreaterThan(20)
      expect(S.ask(ghost)).toBeNull()
    }
  })

  test("the reference's first move is legal, and is the move GAMES.md §4.3 points at", () => {
    const first = (id: string) => ghostActions(practiceOf(id as 'views'))[0]
    expect(first('views')).toEqual({ t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
    expect(first('stride-zero')).toEqual({ t: 'op', op: { op: 'expand', shape: [4, 6] } })
    expect(first('three-d')).toEqual({ t: 'op', op: { op: 'reshape', shape: [4, 2, 4] } })
    expect(first('grid')).toEqual({ t: 'block', dim: 0, value: 16 })
    for (const entry of SHAPE_SHIFTER.levels) {
      const level = S.level(entry.id, entry.practiceSeed)
      expect(() => shiftReduce(shiftInit(level), ghostActions(level)[0])).not.toThrow()
    }
  })

  test('a finished run replays to the same hash through the framework, and grades the same', () => {
    const level = practiceOf('three-d')
    let run = startRun(shiftSession, { game: 'shape-shifter', level: 'three-d', seed: SHAPE_SHIFTER.levels[2].practiceSeed })
    for (const action of ghostActions(level)) run = { ...run, state: shiftSession.reduce(run.state, action) }
    const done = finishRun(shiftSession, run)
    expect(done?.grade).toEqual({ score: 1, ok: true })
    expect(done?.hash).toBe(stateHash(S.ghost(level)))
  })

  test('the state holds no display string: every string in it is an id', () => {
    const ids = /^[a-z][a-z0-9-]*$/
    for (const entry of SHAPE_SHIFTER.levels) {
      const level = S.level(entry.id, entry.practiceSeed)
      const states = [S.init(level), S.ghost(level)]
      for (const state of states) for (const text of stringsOf(state)) expect([entry.id, text, ids.test(text)]).toEqual([entry.id, text, true])
    }
    // After a refusal, a copy, a commit and a launch too.
    const flipped = stateAfter(practiceOf('views'), { t: 'commit', prediction: 22 }, op({ op: 'transpose', a: 0, b: 1 }), op({ op: 'view', shape: [24] }), op({ op: 'reshape', shape: [24] }))
    for (const text of stringsOf(flipped)) expect([text, /^[a-z][a-z0-9-]*$/.test(text)]).toEqual([text, true])
    const refused = stateAfter(practiceOf('grid'), { t: 'block', dim: 0, value: 12 }, { t: 'launch' })
    for (const text of stringsOf(refused)) expect([text, /^[a-z][a-z0-9-]*$/.test(text)]).toEqual([text, true])
  })

  test('the state has a canonical JSON form, so a log can store and hash it', () => {
    const state = S.ghost(S.level('fewest', 1000))
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('what a view and a copy do', () => {
  test('a view never changes the buffer, and moves nothing: transpose leaves strides (1, 6), 0 moved, 0 copies', () => {
    const level = practiceOf('views')
    const start = layoutRun(S.init(level))
    const flipped = layoutRun(stateAfter(level, op({ op: 'transpose', a: 0, b: 1 })))
    expect(flipped.buffer).toEqual(start.buffer)
    expect([flipped.view.shape, flipped.view.strides, flipped.copies, flipped.moved]).toEqual([[6, 4], [1, 6], 0, 0])
  })

  test('a copy writes every element into a new buffer in logical order, and `copied` counts them all, those that land where they were too', () => {
    const level = practiceOf('views')
    const after = layoutRun(stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }), op({ op: 'reshape', shape: [24] })))
    expect([after.copies, after.moved, after.status]).toEqual([1, 24, 'reached'])
    expect(after.buffer).toEqual(addresses({ offset: 0, shape: [6, 4], strides: [1, 6] }))
    // Two of the 24 elements, the first and the last, are at the address the copy writes them to.
    expect(after.buffer.filter((x, i) => x === i)).toHaveLength(2)
    expect(after.old?.buffer).toEqual(layoutRun(S.init(level)).buffer)
  })

  test('contiguous() on a contiguous tensor copies nothing, so "contiguous() first, to be safe" is free on the practice start', () => {
    const level = practiceOf('views')
    const run = layoutRun(stateAfter(level, op({ op: 'contiguous' })))
    expect([run.copies, run.moved, run.ops.length]).toEqual([0, 0, 1])
  })

  test('expand gives stride 0, moves nothing, and the target stays unmet until contiguous() writes 24 elements', () => {
    const level = practiceOf('stride-zero')
    const widened = layoutRun(stateAfter(level, op({ op: 'expand', shape: [4, 6] })))
    expect([widened.view.strides, widened.copies, widened.moved, widened.status]).toEqual([[0, 1], 0, 0, 'open'])
    const written = layoutRun(stateAfter(level, op({ op: 'expand', shape: [4, 6] }), op({ op: 'contiguous' })))
    expect([written.copies, written.moved, written.status]).toEqual([1, 24, 'reached'])
  })

  test('a reshape straight to the target\'s shape on three-d leaves 8 of 32 elements in place, and is a view', () => {
    const level = practiceOf('three-d')
    const state = stateAfter(level, op({ op: 'reshape', shape: [2, 4, 4] }))
    const run = layoutRun(state)
    expect([run.copies, run.status]).toEqual([0, 'open'])
    expect(state.moments.find((m) => m.id === 'wrong-order')).toMatchObject({ k: 8, n: 32 })
  })
})

describe('refusals, offers and the guess', () => {
  test('a view the strides cannot express changes nothing in practice, and says so as a moment', () => {
    const level = practiceOf('views')
    const flipped = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }))
    const refused = shiftReduce(flipped, op({ op: 'view', shape: [24] }))
    const run = layoutRun(refused)
    expect([run.view, run.buffer, run.status, run.refused.length, run.turns]).toEqual([layoutRun(flipped).view, layoutRun(flipped).buffer, 'open', 1, 2])
    expect(refused.moments.find((m) => m.id === 'view-refused')).toMatchObject({ shape: [24] })
    // The moment is said once, the first time.
    const again = shiftReduce(refused, op({ op: 'view', shape: [24] }))
    expect(again.moments.filter((m) => m.id === 'view-refused')).toHaveLength(1)
  })

  test('on fewest a refused view fails the target for good, and the run moves to the next', () => {
    const level = S.level('fewest', 1000)
    if (level.kind !== 'layout') throw new Error('layout')
    // A view to a shape the strides refuse: find one by trying the target's own shape on a start that cannot express it.
    let found: { shape: number[]; at: number } | null = null
    level.tasks.forEach((task, i) => {
      if (found !== null || task.kind !== 'copy-before-view') return
      found = { shape: [...task.goal.shape], at: i }
    })
    expect(found).not.toBeNull()
    // Play the reference up to that target, then permute and merge without the copy: refused.
    const target = (found as unknown as { at: number }).at
    let state = ghostActions(level).slice(0, level.tasks.slice(0, target).reduce((n, t) => n + t.ghost.length, 0)).reduce(shiftReduce, shiftInit(level))
    const task = level.tasks[target]
    for (const o of task.ghost) {
      if (o.op === 'contiguous') break
      state = shiftReduce(state, op(o))
    }
    const before = state.at
    // The ghost's next op after the permute is the contiguous it needed; skip it and merge the dimensions with a view.
    const refused = shiftReduce(state, op({ op: 'view', shape: [numelOf(task.goal.shape)] }))
    expect(layoutRun(refused, before).status).toBe('failed')
    expect(layoutRun(refused, before).why).toBe('refused')
    expect(refused.done || refused.at !== before).toBe(true)
  })

  test('an operation the level does not offer is illegal, and so is a shape that is not the same elements', () => {
    expect(() => stateAfter(practiceOf('views'), op({ op: 'expand', shape: [2, 4, 6] }))).toThrow(RangeError)
    expect(() => stateAfter(S.level('fewest', 1000), op({ op: 'reshape', shape: [2, 6] }))).toThrow(RangeError)
    expect(() => stateAfter(S.level('fewest', 1000), op({ op: 'slice', dim: 0, start: 0, stop: 1, step: 1 }))).toThrow(RangeError)
    expect(() => stateAfter(practiceOf('views'), op({ op: 'view', shape: [5, 5] }))).toThrow(RangeError)
    expect(() => stateAfter(practiceOf('views'), { t: 'block', dim: 0, value: 4 })).toThrow(RangeError)
    expect(() => stateAfter(practiceOf('grid'), op({ op: 'contiguous' }))).toThrow(RangeError)
  })

  test('the opening guess comes once, before the first move, and is a whole number', () => {
    const level = practiceOf('views')
    expect(shiftAsk(S.init(level))).toEqual({ kind: 'commit', task: 0 })
    const guessed = stateAfter(level, { t: 'commit', prediction: 24 })
    expect(layoutRun(guessed).guess).toBe(24)
    expect(shiftAsk(guessed)).toEqual({ kind: 'op', task: 0 })
    expect(() => shiftReduce(guessed, { t: 'commit', prediction: 22 })).toThrow(RangeError)
    expect(() => stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }), { t: 'commit', prediction: 24 })).toThrow(RangeError)
    expect(() => stateAfter(level, { t: 'commit', prediction: 1.5 })).toThrow(RangeError)
    expect(() => stateAfter(level, { t: 'commit', prediction: -1 })).toThrow(RangeError)
    // The guess changes no count.
    expect(S.score(guessed)).toEqual(S.score(S.init(level)))
  })

  test('a run that is over takes no more actions', () => {
    const level = practiceOf('views')
    const done = S.ghost(level)
    expect(() => shiftReduce(done, op({ op: 'contiguous' }))).toThrow(RangeError)
  })

  test('a target ends after the attempts that fewest allows, and the next one begins', () => {
    const level = S.level('fewest', 1000)
    if (level.kind !== 'layout') throw new Error('layout')
    let state = shiftInit(level)
    // A tensor that is turned over and over: legal, and it reaches a target that needs a copy only by luck, so the attempts run out.
    let turns = 0
    while (state.at === 0 && !state.done && turns < 40) {
      const run = layoutRun(state, 0)
      state = shiftReduce(state, op(run.view.shape.length === 2 ? { op: 'transpose', a: 0, b: 1 } : { op: 'permute', order: [0, 2, 1] }))
      turns++
    }
    const first = layoutRun(state, 0)
    // Either the target was reached on the way (legal) or the attempts ran out.
    expect(['reached', 'failed']).toContain(first.status)
    if (first.status === 'failed') expect([first.why, first.turns]).toEqual(['attempts', level.attemptCap])
  })
})

describe('the moments, the counts and the grade', () => {
  test('the keep-list run: the first move of `views` is a view-free moment, then a copy', () => {
    const level = practiceOf('views')
    const first = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }))
    expect(first.moments).toEqual([{ id: 'view-free', task: 0, turn: 0, op: 'transpose', before: [6, 1], after: [1, 6] }])
    const second = shiftReduce(first, op({ op: 'reshape', shape: [24] }))
    expect(second.moments[1]).toMatchObject({ id: 'copy', op: 'reshape', n: 24, turn: 1 })
  })

  test('expand over more than one element is the stride-zero moment, in place of view-free', () => {
    const state = stateAfter(practiceOf('stride-zero'), op({ op: 'expand', shape: [4, 6] }))
    expect(state.moments).toEqual([{ id: 'stride-zero', task: 0, turn: 0, rows: 4, m: 6 }])
  })

  test('the score counts copies, elements moved, operations and refusals, and grade passes exactly the reference\'s copies', () => {
    const level = practiceOf('views')
    const over = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }), op({ op: 'view', shape: [24] }), op({ op: 'contiguous' }), op({ op: 'view', shape: [24] }))
    expect(S.score(over)).toMatchObject({ copies: 1, moved: 24, operations: 3, refused: 1, passed: 1, of: 1 })
    expect(S.grade(over, S.ghost(level))).toEqual({ score: 1, ok: true })
    // A copy before the transpose is free on a contiguous start, so one copy still equals the reference's; a second makes two.
    const wasteful = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }), op({ op: 'contiguous' }), op({ op: 'transpose', a: 0, b: 1 }), op({ op: 'contiguous' }), op({ op: 'view', shape: [24] }))
    expect(S.score(wasteful).copies).toBe(2)
    expect(S.grade(wasteful, S.ghost(level)).ok).toBe(false)
  })

  test('a fewest run passes only when all three targets do, and its score is the share that did', () => {
    const level = S.level('fewest', 1000)
    const ghost = S.ghost(level)
    expect(S.grade(ghost, ghost)).toEqual({ score: 1, ok: true })
    const partial = ghostActions(level).slice(0, level.kind === 'layout' ? level.tasks[0].ghost.length : 0).reduce(shiftReduce, shiftInit(level))
    expect(S.grade(partial, ghost)).toEqual({ score: 1 / 3, ok: false })
  })

  test('graded `grid` ends after a launch on each of three tensors, and a refused launch ends nothing', () => {
    const level = buildLevel('grid', 1000)
    let state = shiftInit(level)
    state = shiftReduce(state, { t: 'launch' })
    expect(state.done).toBe(false)
    expect(state.moments.find((m) => m.id === 'too-many')).toBeDefined()
    const ghost = S.ghost(level)
    expect(S.done(ghost)).toBe(true)
    expect(ghostActions(level).filter((a) => a.t === 'launch')).toHaveLength(3)
  })

  test('grid: BLOCK sets the grid stepper to cdiv, and a grid below cdiv leaves elements uncovered', () => {
    const level = practiceOf('grid')
    const set = stateAfter(level, { t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 4 })
    const run = set.runs[0]
    expect(run.kind === 'grid' ? [run.block, run.grid] : null).toEqual([[16, 4], [1, 5]])
    expect(() => stateAfter(level, { t: 'block', dim: 0, value: 33 })).toThrow(RangeError)
    expect(() => stateAfter(level, { t: 'block', dim: 2, value: 4 })).toThrow(RangeError)
    expect(() => stateAfter(level, { t: 'grid', dim: 0, value: 0 })).toThrow(RangeError)
  })

  test("the first masked moment names the first program, in index order, that has a masked lane", () => {
    const launched = stateAfter(practiceOf('grid'), { t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 4 }, { t: 'launch' })
    expect(launched.moments.find((m) => m.id === 'masked')).toMatchObject({ index: [0, 0], lanes: 64, masked: 16 })
    expect(launched.done).toBe(true)
  })
})

function numelOf(shape: readonly number[]): number {
  return shape.reduce((p, d) => p * d, 1)
}

void shiftSession
