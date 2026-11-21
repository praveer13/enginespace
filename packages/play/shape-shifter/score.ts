/**
 * The score of a run (GAMES.md §4.7): counts on the model's clock, and which targets passed.
 *
 * A layout target passes when it is reached with the reference's copies, and on `fewest` with no `view` refused (a refused `view` ends the
 * target). A grid tensor passes when every element is covered exactly once and its masked lanes equal the least within the cap. A level
 * passes when every target does. The score of a run is the share of targets that passed, so a learner who has passed two of three scores
 * two thirds, and the level's bar is all of them (ASSESSMENT §7.2).
 */
import type { Grade } from '../types'
import type { GridRun, GridTask, LayoutRun, LayoutTask, ShiftLevel, ShiftScore, ShiftState } from './types'

export function layoutPassed(level: Extract<ShiftLevel, { kind: 'layout' }>, task: LayoutTask, run: LayoutRun): boolean {
  if (run.status !== 'reached' || run.copies !== task.copies) return false
  return !level.failOnRefusal || run.refused.length === 0
}

export const gridPassed = (task: GridTask, run: GridRun): boolean => run.launch !== null && run.launch.exact && run.launch.masked === task.least

/** Targets of a state that passed so far. */
export function passedOf(state: Pick<ShiftState, 'level' | 'runs'>): number {
  const { level, runs } = state
  let n = 0
  level.tasks.forEach((task, i) => {
    const run = runs[i]
    if (run === undefined) return
    if (level.kind === 'layout' && run.kind === 'layout' && layoutPassed(level, task as LayoutTask, run)) n++
    if (level.kind === 'grid' && run.kind === 'grid' && gridPassed(task as GridTask, run)) n++
  })
  return n
}

export function scoreOf(state: ShiftState): ShiftScore {
  let copies = 0
  let moved = 0
  let operations = 0
  let refused = 0
  let programs = 0
  let lanes = 0
  let masked = 0
  let covered = 0
  for (const run of state.runs) {
    if (run.kind === 'layout') {
      copies += run.copies
      moved += run.moved
      operations += run.ops.length
      refused += run.refused.length
    } else if (run.launch !== null) {
      programs += run.launch.programs
      lanes += run.launch.lanes
      masked += run.launch.masked
      covered += run.launch.covered
    }
  }
  return { copies, moved, operations, refused, programs, lanes, masked, covered, passed: passedOf(state), of: state.level.tasks.length }
}

/** The graded result: the share of targets that passed, and whether all of them did. */
export function gradeOf(mine: ShiftState): Grade {
  const passed = passedOf(mine)
  const of = mine.level.tasks.length
  return { score: of === 0 ? 0 : passed / of, ok: passed === mine.level.needed }
}
