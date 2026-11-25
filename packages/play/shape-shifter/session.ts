/**
 * Tensor views' session (`shape-shifter`): the pure rules of the game, in the shape every game follows (GAMES.md §2.5, §4.8).
 *
 * The learner plans a layout: on the view levels, which operations in which order and where the copy goes; on `grid`, which BLOCK and which
 * grid. Every operation is `applyOp` of `packages/sim/tensor` (engine.ts), and the model's grid is `gridCoverage`. This file is the
 * contract around them: level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief.
 *
 * The reference ("the ghost") plays the same level in lockstep and is read only by the debrief and the grade. A state holds no display
 * string: a refusal and a moment are data (types.ts), and copy.ts says them.
 */
import type { Seed } from '@es/sim/core'
import { gridCoverage, hasInternalOverlap, numel, programCells } from '@es/sim/tensor'
import type { ShiftOp } from '@es/sim/tensor'
import type { Session } from '../types'
import { inLevelBand } from './bands'
import { debriefOf } from './debrief'
import { BLOCK_MAX } from './draw'
import { inPlace, reaches, startBuffer, step } from './engine'
import { buildLevel } from './levels'
import { gradeOf, scoreOf } from './score'
import type { GridLevel, GridRun, GridTask, LayoutLevel, LayoutRun, LayoutTask, Moment, ShiftAction, ShiftAsk, ShiftLevel, ShiftRun, ShiftScore, ShiftState } from './types'
import { shiftView } from './view'
import type { ShiftView } from './view'

/** Programs along a dimension that a grid stepper takes at most: far above any cap, so a launch of too many is refused with its count. */
export const GRID_MAX = 256

/** The level `id` on `seed`. Throws for a level that Tensor views does not have. */
export const shiftLevel = (id: string, seed: Seed): ShiftLevel => buildLevel(id, seed)

const cdiv = (n: number, b: number): number => Math.ceil(n / b)

function startRun(level: ShiftLevel, i: number): ShiftRun {
  if (level.kind === 'layout') {
    const task = level.tasks[i]
    return { kind: 'layout', view: task.start, buffer: startBuffer(task.start), old: null, ops: [], placed: [], turns: 0, copies: 0, moved: 0, refused: [], status: 'open', why: null, guess: null }
  }
  const shape = level.tasks[i].shape
  return { kind: 'grid', block: shape.map(() => 1), grid: shape.map((n) => n), turns: 0, refusals: [], launch: null, guess: null }
}

const isOver = (run: ShiftRun): boolean => (run.kind === 'layout' ? run.status !== 'open' : run.launch !== null)

/** The state with `runs` in place, `at` on the first target that is not over, and `done` when every one is. */
function settle(state: ShiftState, runs: readonly ShiftRun[], moments: readonly Moment[], action: ShiftAction): ShiftState {
  const open = runs.findIndex((run) => !isOver(run))
  return { level: state.level, at: open === -1 ? runs.length - 1 : open, runs, moments, history: [...state.history, action], done: open === -1 }
}

export function shiftInit(level: ShiftLevel): ShiftState {
  return { level, at: 0, runs: level.tasks.map((_, i) => startRun(level, i)), moments: [], history: [], done: false }
}

/** What the next action is for, or null when the run is over. */
export function shiftAsk(s: ShiftState): ShiftAsk | null {
  if (s.done) return null
  const run = s.runs[s.at]
  if (run.guess === null && run.turns === 0) return { kind: 'commit', task: s.at }
  return { kind: run.kind === 'layout' ? 'op' : 'launch', task: s.at }
}

const withMoment = (moments: readonly Moment[], m: Moment): readonly Moment[] => (moments.some((x) => x.id === m.id) ? moments : [...moments, m])

function commit(s: ShiftState, run: ShiftRun, prediction: number, action: ShiftAction): ShiftState {
  if (!Number.isInteger(prediction) || prediction < 0) throw new RangeError('a prediction is a whole number of at least 0')
  if (run.guess !== null || run.turns !== 0) throw new RangeError('the opening guess comes once, before the first move of a target')
  const runs = s.runs.map((r, i) => (i === s.at ? { ...r, guess: prediction } : r))
  return settle(s, runs, s.moments, action)
}

function layoutOp(s: ShiftState, level: LayoutLevel, run: LayoutRun, op: ShiftOp, action: ShiftAction): ShiftState {
  if (!level.offered.includes(op.op)) throw new RangeError(`level ${level.id} does not offer ${op.op}`)
  const task = level.tasks[s.at]
  const turn = s.history.length
  const result = step({ view: run.view, buffer: run.buffer }, op)
  if ('error' in result) {
    if (result.error === 'bad-shape') throw new RangeError(`${op.op} is not a legal move on this tensor`)
    // The strides cannot express the shape: nothing changes but the refusal, and on `fewest` the target has failed (GAMES.md §4.3).
    const shape = op.op === 'view' ? op.shape : []
    const turns = run.turns + 1
    const failed = level.failOnRefusal
    const next: LayoutRun = {
      ...run,
      turns,
      refused: [...run.refused, { turn, op }],
      status: failed ? 'failed' : level.attemptCap !== null && turns >= level.attemptCap ? 'failed' : 'open',
      why: failed ? 'refused' : level.attemptCap !== null && turns >= level.attemptCap ? 'attempts' : null,
    }
    return settle(s, s.runs.map((r, i) => (i === s.at ? next : r)), withMoment(s.moments, { id: 'view-refused', task: s.at, turn, shape }), action)
  }
  const copied = result.copied
  const turns = run.turns + 1
  const node = result.node
  let moments = s.moments
  if (copied > 0) moments = withMoment(moments, { id: 'copy', task: s.at, turn, op: op.op, n: copied })
  else if (op.op === 'expand' && hasInternalOverlap(node.view)) {
    const rows = node.view.shape.reduce((p, d, i) => (node.view.strides[i] === 0 ? p * d : p), 1)
    moments = withMoment(moments, { id: 'stride-zero', task: s.at, turn, rows, m: numel(run.view.shape), rank: node.view.shape.length })
  } else if (node.view.strides.join() !== run.view.strides.join()) {
    moments = withMoment(moments, { id: 'view-free', task: s.at, turn, op: op.op, before: run.view.strides, after: node.view.strides })
  }
  const arrived = reaches(node, task.goal)
  if (!arrived && node.view.shape.join() === task.goal.shape.join()) {
    // The shape matches and some element is not in the order the target puts it. A tensor with every element in the target's order that only lacks contiguity is another thing.
    const { k, of } = inPlace(node, task.goal)
    if (k < of) moments = withMoment(moments, { id: 'wrong-order', task: s.at, turn, k, n: of })
  }
  const out = !arrived && level.attemptCap !== null && turns >= level.attemptCap
  const next: LayoutRun = {
    ...run,
    view: node.view,
    buffer: node.buffer,
    old: copied > 0 ? { view: run.view, buffer: run.buffer } : null,
    ops: [...run.ops, op],
    placed: [...run.placed, turn],
    turns,
    copies: run.copies + (copied > 0 ? 1 : 0),
    moved: run.moved + copied,
    status: arrived ? 'reached' : out ? 'failed' : 'open',
    why: out ? 'attempts' : null,
  }
  return settle(s, s.runs.map((r, i) => (i === s.at ? next : r)), moments, action)
}

function setting(s: ShiftState, level: GridLevel, run: GridRun, action: Extract<ShiftAction, { t: 'block' | 'grid' }>): ShiftState {
  const shape = level.tasks[s.at].shape
  const { dim, value } = action
  if (!Number.isInteger(dim) || dim < 0 || dim >= shape.length) throw new RangeError(`the tensor has no dimension ${dim}`)
  const max = action.t === 'block' ? BLOCK_MAX : GRID_MAX
  if (!Number.isInteger(value) || value < 1 || value > max) throw new RangeError(`a ${action.t} setting is a whole number from 1 to ${max}`)
  const block = [...run.block]
  const grid = [...run.grid]
  if (action.t === 'block') {
    block[dim] = value
    // The grid stepper starts at `cdiv` of the BLOCK just set (GAMES.md §4.1).
    grid[dim] = cdiv(shape[dim], value)
  } else grid[dim] = value
  return settle(s, s.runs.map((r, i) => (i === s.at ? { ...run, block, grid, turns: run.turns + 1 } : r)), s.moments, action)
}

function launch(s: ShiftState, level: GridLevel, run: GridRun, action: ShiftAction): ShiftState {
  const task: GridTask = level.tasks[s.at]
  const turn = s.history.length
  const turns = run.turns + 1
  const refuse = (refusal: GridRun['refusals'][number], moment: Moment): ShiftState =>
    settle(s, s.runs.map((r, i) => (i === s.at ? { ...run, turns, refusals: [...run.refusals, refusal] } : r)), withMoment(s.moments, moment), action)
  const bad = run.block.find((b) => (b & (b - 1)) !== 0)
  if (bad !== undefined) return refuse({ turn, kind: 'not-pow2', x: bad }, { id: 'not-pow2', task: s.at, turn, x: bad })
  const g = gridCoverage(task.shape, run.block, run.grid)
  if ('error' in g) throw new RangeError('the tensor and the settings do not agree on a rank')
  if (g.programs > level.cap) return refuse({ turn, kind: 'too-many', n: g.programs }, { id: 'too-many', task: s.at, turn, cap: level.cap, n: g.programs })
  let moments = s.moments
  const lanes = run.block.reduce((p, b) => p * b, 1)
  if (g.masked > 0) {
    // The first program, in index order, with a masked lane.
    const total = g.programs
    for (let k = 0; k < total; k++) {
      const index: number[] = []
      let rest = k
      for (let d = g.grid.length - 1; d >= 0; d--) {
        index[d] = rest % (g.grid[d] ?? 1)
        rest = Math.floor(rest / (g.grid[d] ?? 1))
      }
      const cells = programCells(task.shape, run.block, index)
      if (!('error' in cells) && cells.masked > 0) {
        moments = withMoment(moments, { id: 'masked', task: s.at, turn, index, lanes, masked: cells.masked })
        break
      }
    }
  }
  if (!g.exact) {
    const dim = task.shape.findIndex((n, d) => (g.grid[d] ?? 1) < cdiv(n, run.block[d] ?? 1))
    moments = withMoment(moments, { id: 'uncovered', task: s.at, turn, n: numel(task.shape) - g.covered, dim, size: task.shape[dim], block: run.block[dim], g: cdiv(task.shape[dim], run.block[dim]) })
  }
  const next: GridRun = { ...run, turns, launch: { block: run.block, grid: g.grid, programs: g.programs, lanes: g.lanes, masked: g.masked, covered: g.covered, exact: g.exact } }
  return settle(s, s.runs.map((r, i) => (i === s.at ? next : r)), moments, action)
}

/** Applies one action. Throws on an illegal one: an operation the level does not offer or the tensor cannot take, a value out of range, a second guess. */
export function shiftReduce(s: ShiftState, a: ShiftAction): ShiftState {
  if (s.done) throw new RangeError('the run is over')
  const run = s.runs[s.at]
  const { level } = s
  switch (a.t) {
    case 'commit':
      return commit(s, run, a.prediction, a)
    case 'op':
      if (level.kind !== 'layout' || run.kind !== 'layout') throw new RangeError('this level takes BLOCK and a grid, not operations')
      return layoutOp(s, level, run, a.op, a)
    case 'block':
    case 'grid':
      if (level.kind !== 'grid' || run.kind !== 'grid') throw new RangeError('this level takes operations, not BLOCK and a grid')
      return setting(s, level, run, a)
    case 'launch':
      if (level.kind !== 'grid' || run.kind !== 'grid') throw new RangeError('this level takes operations, not a launch')
      return launch(s, level, run, a)
  }
}

/** The actions of the reference on a level, in order: the plan of each layout target, or each grid tensor's BLOCK and a launch. */
export function ghostActions(level: ShiftLevel): ShiftAction[] {
  if (level.kind === 'layout') return level.tasks.flatMap((task: LayoutTask) => task.ghost.map((op): ShiftAction => ({ t: 'op', op })))
  return level.tasks.flatMap((task) => [...task.block.map((value, dim): ShiftAction => ({ t: 'block', dim, value })), { t: 'launch' } as const])
}

/** The reference run to the end, from the level's start. */
export function shiftGhost(level: ShiftLevel): ShiftState {
  return ghostActions(level).reduce(shiftReduce, shiftInit(level))
}

export const shiftSession: Session<ShiftLevel, ShiftState, ShiftAction, ShiftView, ShiftScore, ShiftAsk> = {
  level: shiftLevel,
  inBand: inLevelBand,
  init: shiftInit,
  ask: shiftAsk,
  reduce: shiftReduce,
  view: shiftView,
  done: (s) => s.done,
  score: scoreOf,
  ghost: shiftGhost,
  grade: (mine) => gradeOf(mine),
  debrief: debriefOf,
}
