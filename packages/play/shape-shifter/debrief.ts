/**
 * Tensor views' debrief (GAMES.md §2.1, §4.7): one sentence that says what the run did, and the decision that mattered.
 *
 * The layout levels use kernelspace's R(i) rule over the operations: with R(i) = "the reference, taking over the learner's tensor after i
 * operations, still reaches the target with the copies it has left", the root cause is the latest operation d with R(d) true and
 * R(d + 1) false. `grid` is a configuration, so its debrief swaps one lever (BLOCK on one dimension, or the grid) to the reference's value
 * and names the lever worth the most. The sentences carry no digit: the counts beside them are readouts, and the place in the log is
 * `names`. Rewording one moves no state hash: a debrief is read from a finished run and is never part of a state.
 */
import { gridCoverage } from '@es/sim/tensor'
import type { Debrief } from '../types'
import { fewestMacros, practiceMacros, search, startBuffer, step } from './engine'
import type { Node } from './engine'
import { kindName } from './labels'
import { gradeOf, gridPassed, layoutPassed } from './score'
import type { GridLevel, GridRun, GridTask, LayoutLevel, LayoutRun, LayoutTask, ShiftState } from './types'

const code = (name: string): string => `\`${name}\``

/** Operations the reference may still use when it takes over: more than any target needs. */
const TAKEOVER_OPS = 8

/** Whether the reference, taking over at `node` with `used` copies spent, still reaches the target with the copies it has. */
function recovers(level: LayoutLevel, task: LayoutTask, node: Node, used: number): boolean {
  const left = task.copies - used
  if (left < 0) return false
  const macros = level.id === 'fewest' ? fewestMacros : practiceMacros(task.goal)
  return search(node, task.goal, macros, TAKEOVER_OPS, left) !== null
}

/** The index of the learner's operation after which the reference could no longer pass, or null when there is none. */
export function decisiveOp(level: LayoutLevel, task: LayoutTask, run: LayoutRun): { readonly index: number; readonly copied: boolean } | null {
  let node: Node = { view: task.start, buffer: startBuffer(task.start) }
  let used = 0
  const before: boolean[] = [recovers(level, task, node, used)]
  const copies: boolean[] = []
  for (const op of run.ops) {
    const s = step(node, op)
    if ('error' in s) break
    node = s.node
    copies.push(s.copied > 0)
    if (s.copied > 0) used++
    before.push(recovers(level, task, node, used))
  }
  for (let d = before.length - 2; d >= 0; d--) if (before[d] && !before[d + 1]) return { index: d, copied: copies[d] }
  return null
}

function layoutDebrief(level: LayoutLevel, mine: ShiftState): Debrief {
  const at = level.tasks.findIndex((task, i) => {
    const run = mine.runs[i]
    return run.kind !== 'layout' || !layoutPassed(level, task, run)
  })
  const task = level.tasks[at]
  const run = mine.runs[at] as LayoutRun
  const d = decisiveOp(level, task, run)
  if (d !== null) {
    const op = run.ops[d.index]
    const turn = run.placed[d.index]
    if (d.copied) {
      return {
        sentence: `Your ${code(kindName(op.op))} here spent a copy the target did not need: from the tensor before it, the reference reaches the target with the copies it had left, and from the tensor after it, it cannot.`,
        names: { turn },
      }
    }
    return {
      sentence: `Your ${code(kindName(op.op))} here put the tensor where the reference's copies no longer reach the target. Which operations are views, and which dimensions a view can merge, decide where a copy has to go.`,
      names: { turn },
    }
  }
  if (run.why === 'refused') {
    const refusal = run.refused[run.refused.length - 1]
    return {
      sentence: `A ${code('view')} the strides could not express ended this target: the stride order jumps there, so this ${code('view')} needs a ${code('contiguous()')} before it.`,
      names: { turn: refusal.turn },
    }
  }
  if (run.why === 'attempts') {
    return { sentence: 'The target was not reached within the attempts the level allows. Plan the chain from the target back, and place a copy only where no view gives the layout.', names: null }
  }
  if (run.status === 'reached') {
    return { sentence: 'You reached the target with more copies than the reference. Every copy it makes is one that no view could replace.', names: null }
  }
  return { sentence: 'The run ended before this target was reached.', names: null }
}

const DIMS = ['first', 'second', 'third'] as const

/** What a lever's reference value would leave: the masked lanes of the swapped configuration, or null when it covers less than the whole tensor. */
function swapped(task: GridTask, run: GridRun & { readonly launch: NonNullable<GridRun['launch']> }, lever: string): number | null {
  const block = [...run.launch.block]
  const grid = [...run.launch.grid]
  if (lever === 'grid') grid.splice(0, grid.length, ...task.grid)
  else {
    const d = Number(lever.slice(6))
    block[d] = task.block[d]
    grid[d] = Math.ceil(task.shape[d] / block[d])
  }
  const g = gridCoverage(task.shape, block, grid)
  return 'error' in g || !g.exact ? null : g.masked
}

function gridDebrief(level: GridLevel, mine: ShiftState): Debrief {
  const at = level.tasks.findIndex((task, i) => {
    const run = mine.runs[i]
    return run.kind !== 'grid' || !gridPassed(task, run)
  })
  const task = level.tasks[at]
  const run = mine.runs[at] as GridRun
  if (run.launch === null) {
    const last = run.refusals[run.refusals.length - 1]
    if (last?.kind === 'not-pow2') return { sentence: 'No launch ran: BLOCK has to be a power of two, because a kernel makes its lanes with `tl.arange`, which takes one.', names: { turn: last.turn } }
    if (last?.kind === 'too-many') return { sentence: 'No launch ran: the grid had more programs than the level allows. A larger BLOCK covers the tensor with fewer.', names: { turn: last.turn } }
    return { sentence: 'The run ended before this tensor was launched.', names: null }
  }
  // A lever is a setting that differs from the reference's: swapping one that already agrees changes nothing.
  const launch = run.launch
  const levers = ['block-0', 'block-1', 'grid'].filter((lever) =>
    lever === 'grid' ? launch.grid.join() !== task.grid.join() : launch.block[Number(lever.slice(6))] !== task.block[Number(lever.slice(6))],
  )
  let best: { lever: string; masked: number } | null = null
  for (const lever of levers) {
    const masked = swapped(task, { ...run, launch }, lever)
    if (masked === null) continue
    if (best === null || masked < best.masked) best = { lever, masked }
  }
  if (best === null) return { sentence: 'Neither BLOCK nor the grid, set to the reference value on its own, covers the tensor: both are off.', names: { lever: 'grid' } }
  if (best.lever === 'grid') {
    return {
      sentence: launch.exact
        ? 'Your grid is the lever that cost the most: it launched programs that the tensor does not need, and every lane of them is masked. The reference launches `cdiv(n, BLOCK)` along each dimension.'
        : 'Your grid is the lever that cost the most: it was below `cdiv(n, BLOCK)` along a dimension, so a stripe of the tensor was never covered.',
      names: { lever: 'grid' },
    }
  }
  const d = Number(best.lever.slice(6))
  return {
    sentence: `Your BLOCK along the ${DIMS[d] ?? 'next'} dimension is the lever that cost the most: the reference's BLOCK there fits the size with less left over at the edge, and the edge is where lanes are masked.`,
    names: { lever: best.lever },
  }
}

/** The sentence a run ends on, and the decision that mattered. The reference is read through the level (the targets' plans), so it needs no state of its own. */
export function debriefOf(mine: ShiftState): Debrief {
  const { level } = mine
  if (gradeOf(mine).ok) {
    return {
      sentence:
        level.kind === 'layout'
          ? 'You matched the reference: every copy you made was one that no view could replace, and the views cost nothing.'
          : 'You matched the reference: every element was covered once, and the edge masked no more lanes than it must.',
      names: null,
    }
  }
  return level.kind === 'layout' ? layoutDebrief(level, mine) : gridDebrief(level, mine)
}
