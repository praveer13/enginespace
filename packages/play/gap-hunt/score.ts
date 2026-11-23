/**
 * The score of a run (GAMES.md §6, "Scoring and pass"): counted from the trace's own timestamps, in integer ns, and never from wall time.
 *
 * `gap` passes a case when the gap's two edges and its cause are both the reference's (the place and the cause together, TR3's design, item
 * 7). `attribute` passes a case when at least 95% of the window's ns are in the right category, nothing is wrong with the marks as a set and
 * the cause is right. A level passes when every case does: 3 new steps. `read` passes when the kernel marked carries the correlation id of
 * the launch call named, and `graphs` when the count equals the kernels the node-level trace shows; both are practice and earn nothing.
 * The bar of a lesson's `trace` block, which divides by the learner's own marks, is another rule (`src/trace/grade.ts`) and is never printed
 * as this one.
 */
import { checkHunt, huntPass, spanCount, spanView } from '@es/sim/trace'
import type { HuntCase } from '@es/sim/trace'
import type { Grade } from '../types'
import { caseOf } from './engine'
import type { CaseData } from './engine'
import type { CaseResult, CaseRun, HuntLevel, HuntScore, HuntState } from './types'

/** The share of the scored ns that must be in the right category to pass: `huntPass` of the model holds the same bar (tests/play/gap-hunt-score.test.ts reads them against each other). */
export const PASS_PERCENT = 95

const NOT_SCORED: CaseResult = { passed: false, rightNs: 0, unaccountedNs: 0, scoredNs: 0, causeOk: false, problems: 0 }

/** `read`: the cause names a launch call and one mark is exactly a kernel that carries that call's correlation id. */
function readPassed(c: CaseData, run: CaseRun): boolean {
  if (run.cause === null) return false
  const call = spanView(c.hunt.trace, run.cause)
  if (call.kind !== 'cuda-api' || call.corr < 0) return false
  return run.marks.some((m) => m.category === 'kernel' && kernelWith(c.hunt, call.corr, m.fromNs, m.toNs))
}

function kernelWith(hunt: HuntCase, corr: number, fromNs: number, toNs: number): boolean {
  const t = hunt.trace
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind === 'gpu-stream' && v.cat === 'kernel' && v.corr === corr && v.startNs === fromNs && v.endNs === toNs) return true
  }
  return false
}

/** A finished case, judged against the reference. */
export function judge(level: HuntLevel, i: number, run: CaseRun): CaseResult {
  const c = caseOf(level, i)
  if (level.id === 'read') return { ...NOT_SCORED, passed: readPassed(c, run) }
  if (level.id === 'graphs') return { ...NOT_SCORED, passed: run.guess === c.kernels }
  const check = checkHunt(c.hunt, run.marks, run.cause)
  // `gap` grades the place and the cause together (TR3's design, item 7): the gap's two edges and its cause are the reference's. The categories
  // inside the gap are not counted, so a learner who calls part of it both idle and not CPU gap still has the gap.
  return {
    passed: level.id === 'gap' ? check.causeOk && check.problems.length === 0 : huntPass(check),
    rightNs: check.rightNs,
    unaccountedNs: check.unaccountedNs,
    scoredNs: check.windowNs,
    causeOk: check.causeOk,
    problems: check.problems.length,
  }
}

/** Cases of a state that passed so far. */
export const passedOf = (state: Pick<HuntState, 'runs'>): number => state.runs.filter((run) => run.result?.passed === true).length

export function scoreOf(state: HuntState): HuntScore {
  let marks = 0
  let rightNs = 0
  let scoredNs = 0
  let unaccountedNs = 0
  state.runs.forEach((run) => {
    marks += run.marks.length - run.locked
    if (run.result !== null) {
      rightNs += run.result.rightNs
      scoredNs += run.result.scoredNs
      unaccountedNs += run.result.unaccountedNs
    }
  })
  return { marks, rightNs, scoredNs, unaccountedNs, passed: passedOf(state), of: state.level.cases.length }
}

/** The graded result: the share of cases that passed, and whether all of them did. */
export function gradeOf(mine: HuntState): Grade {
  const passed = passedOf(mine)
  const of = mine.level.cases.length
  return { score: of === 0 ? 0 : passed / of, ok: passed === mine.level.needed }
}
