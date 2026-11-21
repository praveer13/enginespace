/*
 * W2b-T28: the debrief of Tensor views (GAMES.md §2.1, §4.7). The layout levels use kernelspace's R(i) rule over the operations: the debrief
 * names the latest operation after which the reference could no longer reach the target with its copies. `grid` swaps one lever to the
 * reference's value and names the lever worth the most. The sentences carry no digit, and the place in the log is `names`.
 */
import { describe, expect, test } from 'bun:test'
import { findBanned } from '@/copy/banned'
import { decisiveOp } from '@es/play/shape-shifter/debrief'
import { ghostActions, shiftInit, shiftReduce } from '@es/play/shape-shifter/session'
import type { LayoutLevel, LayoutRun, ShiftAction, ShiftState } from '@es/play/shape-shifter/types'
import { seeds } from '../seeds'
import { op, practiceOf, S, stateAfter } from './shape-shifter-support'

const layout = (level: ReturnType<typeof S.level>): LayoutLevel => {
  if (level.kind !== 'layout') throw new Error('layout')
  return level
}

/** The reference's actions on targets `0 … i - 1`, as a state. */
function playedBefore(level: LayoutLevel, i: number): ShiftState {
  const n = level.tasks.slice(0, i).reduce((sum, task) => sum + task.ghost.length, 0)
  return ghostActions(level).slice(0, n).reduce(shiftReduce, shiftInit(level))
}

const noDigit = (sentence: string) => expect([sentence, /\d/.test(sentence)]).toEqual([sentence, false])

describe('a run that matches the reference', () => {
  test('is told so, names no decision, and carries no digit, on every level', () => {
    for (const [id, seed] of [['views', 30], ['stride-zero', 10], ['three-d', 26], ['fewest', 1000], ['grid', 0], ['grid', 1000]] as const) {
      const ghost = S.ghost(S.level(id, seed))
      const debrief = S.debrief(ghost, ghost)
      expect([id, debrief.names]).toEqual([id, null])
      expect(debrief.sentence).toMatch(/^You matched the reference/)
      noDigit(debrief.sentence)
    }
  })
})

describe('the layout levels: the latest operation after which the reference could no longer pass', () => {
  test('"contiguous() first, to be safe" on a no-copy target names that copy, at its place in the log', () => {
    const level = layout(S.level('fewest', 1000))
    const i = level.tasks.findIndex((task) => task.kind === 'no-copy')
    const before = playedBefore(level, i)
    const task = level.tasks[i]
    let state = shiftReduce(before, op({ op: 'contiguous' }))
    const copiedAt = before.history.length
    for (const o of task.ghost) if (!state.done && state.at === i) state = shiftReduce(state, op(o))
    const mine = state
    const mineRun = mine.runs[i] as LayoutRun
    expect(mineRun.copies).toBeGreaterThanOrEqual(1)
    const debrief = S.debrief(finishAll(mine), S.ghost(level))
    expect(debrief.names).toEqual({ turn: copiedAt })
    expect(debrief.sentence).toMatch(/copy the reference never makes/)
    noDigit(debrief.sentence)
    expect(findBanned(debrief.sentence)).toEqual([])
  })

  test('a view the strides cannot express, with nothing wrong before it, is named by the refusal\'s own place in the log', () => {
    const level = layout(S.level('fewest', 1000))
    const i = level.tasks.findIndex((task) => task.kind === 'copy-before-view')
    let state = playedBefore(level, i)
    const task = level.tasks[i]
    for (const o of task.ghost) {
      if (o.op === 'contiguous') {
        // The reference's copy goes here: the learner skips it and tries the view that follows.
        const next = task.ghost[task.ghost.indexOf(o) + 1]
        const refusedAt = state.history.length
        const refused = shiftReduce(state, op(next))
        const run = refused.runs[i] as LayoutRun
        expect([run.status, run.why]).toEqual(['failed', 'refused'])
        const debrief = S.debrief(finishAll(refused), S.ghost(level))
        expect(debrief.names).toEqual({ turn: refusedAt })
        expect(debrief.sentence).toMatch(/could not express/)
        noDigit(debrief.sentence)
        return
      }
      state = shiftReduce(state, op(o))
    }
    throw new Error('a copy-before-view target has a copy in its plan')
  })

  test('a practice run that copies where the reference does not is told which copy, and a run left unfinished is told so', () => {
    const level = practiceOf('three-d')
    const mine = stateAfter(level, op({ op: 'reshape', shape: [2, 4, 4] }), op({ op: 'contiguous' }))
    expect(decisiveOp(layout(level), layout(level).tasks[0], mine.runs[0] as LayoutRun)).toBeNull()
    const lost = S.debrief(mine, S.ghost(level))
    expect(lost.sentence).toMatch(/not reached|ended before/)
    noDigit(lost.sentence)
    // A copy in the middle, and a second at the end: two copies where the reference makes one. The first is the one that cost the target.
    const wasteful = stateAfter(
      level,
      op({ op: 'reshape', shape: [4, 2, 4] }),
      op({ op: 'permute', order: [0, 2, 1] }),
      op({ op: 'contiguous' }),
      op({ op: 'permute', order: [0, 2, 1] }),
      op({ op: 'permute', order: [1, 0, 2] }),
      op({ op: 'contiguous' }),
    )
    expect(S.score(wasteful).copies).toBe(2)
    const debrief = S.debrief(wasteful, S.ghost(level))
    expect(debrief.sentence).toMatch(/Your `contiguous\(\)` here is a copy the reference never makes/)
    expect(debrief.names).toEqual({ turn: 2 })
    noDigit(debrief.sentence)
  })

  test('over banded seeds a learner who copies first on every target is always told a place that holds a copy or a view the reference did not take', () => {
    for (const seed of seeds(1).slice(0, 40)) {
      const level = layout(S.level('fewest', seed))
      const i = level.tasks.findIndex((task) => task.kind === 'no-copy')
      const before = playedBefore(level, i)
      let state = shiftReduce(before, op({ op: 'contiguous' }))
      for (const o of level.tasks[i].ghost) if (!state.done && state.at === i) state = shiftReduce(state, op(o))
      const debrief = S.debrief(finishAll(state), S.ghost(level))
      expect([seed, debrief.names]).toEqual([seed, { turn: before.history.length }])
    }
  })
})

/** The state with the targets after the one in play finished by the reference, so that the debrief reads a whole run. */
function finishAll(state: ShiftState): ShiftState {
  let s = state
  const level = layout(state.level)
  while (!s.done) {
    const i = s.at
    for (const o of level.tasks[i].ghost) if (!s.done && s.at === i) s = shiftReduce(s, op(o))
    if (!s.done && s.at === i) break
  }
  return s
}

describe('grid: the lever worth the most', () => {
  const launch = (block: [number, number], grid?: [number, number]) => {
    const actions: ShiftAction[] = [{ t: 'block', dim: 0, value: block[0] }, { t: 'block', dim: 1, value: block[1] }]
    if (grid !== undefined) actions.push({ t: 'grid', dim: 0, value: grid[0] }, { t: 'grid', dim: 1, value: grid[1] })
    return stateAfter(practiceOf('grid'), ...actions, { t: 'launch' })
  }
  const ghost = S.ghost(practiceOf('grid'))

  test('one large program: BLOCK along the second dimension is the lever, and the sentence names the dimension, never a number', () => {
    const debrief = S.debrief(launch([16, 32]), ghost)
    expect(debrief.names).toEqual({ lever: 'block-1' })
    expect(debrief.sentence).toMatch(/BLOCK along the second dimension/)
    noDigit(debrief.sentence)
  })

  test('square tiles: 8 by 8 is the first dimension\'s BLOCK, or the second\'s, whichever recovers the most masked lanes', () => {
    const debrief = S.debrief(launch([8, 8]), ghost)
    expect(debrief.names).toMatchObject({ lever: expect.stringMatching(/^block-[01]$/) })
    noDigit(debrief.sentence)
  })

  test('a grid below cdiv leaves a stripe uncovered: the grid is the lever', () => {
    const debrief = S.debrief(launch([16, 4], [1, 4]), ghost)
    expect(debrief.names).toEqual({ lever: 'grid' })
    expect(debrief.sentence).toMatch(/never covered/)
    noDigit(debrief.sentence)
  })

  test('a grid larger than cdiv masks whole programs: the grid is the lever', () => {
    const debrief = S.debrief(launch([16, 4], [1, 6]), ghost)
    expect(debrief.names).toEqual({ lever: 'grid' })
    expect(debrief.sentence).toMatch(/programs that the tensor does not need/)
  })

  test('a run with no launch says why: BLOCK a power of two, or the cap', () => {
    const notPow2 = stateAfter(practiceOf('grid'), { t: 'block', dim: 0, value: 12 }, { t: 'launch' })
    expect(S.debrief(notPow2, ghost)).toMatchObject({ names: { turn: 1 }, sentence: expect.stringMatching(/power of two/) })
    const many = stateAfter(practiceOf('grid'), { t: 'launch' })
    expect(S.debrief(many, ghost)).toMatchObject({ names: { turn: 0 }, sentence: expect.stringMatching(/more programs/) })
    noDigit(S.debrief(many, ghost).sentence)
  })
})
