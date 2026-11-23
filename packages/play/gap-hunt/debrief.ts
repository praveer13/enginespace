/**
 * Trace attribution's debrief (GAMES.md §6, "Core loop", step 5): one sentence that says what the run got wrong, and the decision that
 * mattered. "The debrief overlays the reference and names the largest misattributed span."
 *
 * The largest misattributed span is a maximal stretch of the step in which the reference has one category and the learner's marks have
 * another, or none, or several. The sentence is made from the state and the trace, never from a fixed text, and tests/play/gap-hunt-copy.test.ts
 * recomputes the span ns by ns. The categories are named by what they are (kernel time; idle time while the main thread was busy), so
 * the word of the form is not repeated here: goal lines and stems read it from `GAP_WORD` of src/copy/terms.ts, and a debrief
 * restates no word.
 */
import { spanView } from '@es/sim/trace'
import type { Category, Mark } from '@es/sim/trace'
import type { Debrief } from '../types'
import { caseOf } from './engine'
import type { CaseData } from './engine'
import { gradeOf, PASS_PERCENT } from './score'
import type { HuntAction, HuntState } from './types'

/** What a category is, as a debrief says it. */
export const CATEGORY_PHRASES: Readonly<Record<Category, string>> = {
  kernel: 'kernel time',
  copy: 'copy-only time',
  'cpu-gap': 'idle time while the main thread was busy',
  'both-idle': 'idle time while the main thread was idle',
}

/** What the learner's marks say of a stretch: one category, none, or more than one. */
export type Got = Category | 'none' | 'many'

export interface Wrong {
  readonly fromNs: number
  readonly toNs: number
  readonly truth: Category
  readonly got: Got
}

/**
 * The largest misattributed span of a case: the longest maximal stretch with one reference category and one thing the marks say that is
 * not that category. The earliest wins a tie. Null when every ns is right.
 */
export function largestWrong(c: CaseData, marks: readonly Mark[]): Wrong | null {
  const points = new Set<number>([c.fromNs, c.toNs])
  const inside = (p: number): boolean => p > c.fromNs && p < c.toNs
  for (const m of marks) for (const p of [m.fromNs, m.toNs]) if (inside(p)) points.add(p)
  for (const s of c.split.marks) for (const p of [s.fromNs, s.toNs]) if (inside(p)) points.add(p)
  const cuts = [...points].sort((x, y) => x - y)
  let best: Wrong | null = null
  let run: Wrong | null = null
  const close = (): void => {
    if (run !== null && (best === null || run.toNs - run.fromNs > best.toNs - best.fromNs)) best = run
    run = null
  }
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i]
    const truth = c.split.marks.find((s) => s.fromNs <= from && from < s.toNs)?.category as Category
    const here = new Set<Category>()
    for (const m of marks) if (m.fromNs <= from && from < m.toNs) here.add(m.category)
    const got: Got = here.size === 0 ? 'none' : here.size > 1 ? 'many' : [...here][0]
    if (got === truth) {
      close()
      continue
    }
    if (run !== null && (run as Wrong).truth === truth && (run as Wrong).got === got) run = { ...(run as Wrong), toNs: cuts[i + 1] }
    else {
      close()
      run = { fromNs: from, toNs: cuts[i + 1], truth, got }
    }
  }
  close()
  return best
}

/** Where each action of the log sits in its case: a case ends on its submit, or on the count that `graphs` commits. */
function caseOfAction(state: HuntState): number[] {
  const out: number[] = []
  let at = 0
  for (const a of state.history) {
    out.push(at)
    if (a.t === 'submit' || (a.t === 'commit' && state.level.id === 'graphs')) at++
  }
  return out
}

/** The place in the log of the last action of `kind` in case `i`, or null. */
function lastPlace(state: HuntState, i: number, kind: HuntAction['t']): number | null {
  const owner = caseOfAction(state)
  for (let k = state.history.length - 1; k >= 0; k--) if (owner[k] === i && state.history[k].t === kind) return k
  return null
}

/** The place in the log of the mark, still standing, that covers `ns` (the last made), or null: marks the case started with are in no log. */
function markCovering(state: HuntState, i: number, ns: number): number | null {
  const owner = caseOfAction(state)
  const stack: { mark: Mark; place: number | null }[] = state.runs[i].marks.slice(0, state.runs[i].locked).map((mark) => ({ mark, place: null }))
  state.history.forEach((a, k) => {
    if (owner[k] !== i) return
    if (a.t === 'mark') stack.push({ mark: { fromNs: a.from, toNs: a.to, category: a.category }, place: k })
    else if (a.t === 'unmark') stack.splice(a.index, 1)
  })
  for (let k = stack.length - 1; k >= 0; k--) if (stack[k].mark.fromNs <= ns && ns < stack[k].mark.toNs) return stack[k].place
  return null
}

const gotPhrase = (got: Got): string => (got === 'none' ? 'left without a mark' : got === 'many' ? 'marked as more than one category' : `marked as ${CATEGORY_PHRASES[got]}`)

const code = (name: string): string => `\`${name}\``

/** The sentence a run ends on, and the decision that mattered. */
export function debriefOf(mine: HuntState): Debrief {
  const { level } = mine
  if (gradeOf(mine).ok) {
    return {
      sentence:
        level.id === 'attribute'
          ? 'You matched the reference: every stretch of the step is in its category, and the cause is the call that held the launch queue empty.'
          : level.id === 'gap'
            ? 'You matched the reference: the gap is the largest one of the step, edge to edge, and the cause is the call that held the launch queue empty.'
            : level.id === 'graphs'
              ? 'Your count is the kernels the node-level trace shows: a replay runs one launch and every kernel of its graph.'
              : 'The kernel you marked carries the correlation id of the launch call you named.',
      names: null,
    }
  }
  const at = mine.runs.findIndex((run) => run.result?.passed !== true)
  if (at < 0) return { sentence: 'The run ended before this case was finished.', names: null }
  const run = mine.runs[at]
  const c = caseOf(level, at)
  if (level.id === 'read') return { sentence: 'The kernel you marked does not carry the correlation id of the launch call you named: a launch call and the kernel it started share one id.', names: { turn: lastPlace(mine, at, 'mark') ?? 0 } }
  if (level.id === 'graphs') {
    return {
      sentence: `Your count was ${run.guess ?? 0}; the node-level trace shows ${c.kernels} kernels for this replay, one for each node that ran.`,
      names: { turn: lastPlace(mine, at, 'commit') ?? 0 },
    }
  }
  const gap = c.split.largestGap
  const result = run.result
  const marksShort = result !== null && (result.rightNs * 100 < result.scoredNs * PASS_PERCENT || result.problems > 0)
  if (level.id === 'gap' && gap !== null && result !== null && result.problems > 0) {
    return {
      sentence: `The largest gap of this step runs from ${gap.fromNs - c.fromNs} ns to ${gap.toNs - c.fromNs} ns into it, ${gap.toNs - gap.fromNs} ns long, and your marks did not run from one of its edges to the other.`,
      names: { turn: lastPlace(mine, at, 'mark') ?? 0 },
    }
  }
  if (level.id === 'attribute' && marksShort) {
    const w = largestWrong(c, run.marks)
    if (w !== null) {
      return {
        sentence: `The largest stretch you got wrong is ${w.toNs - w.fromNs} ns of ${CATEGORY_PHRASES[w.truth]}, ${gotPhrase(w.got)}, ${w.fromNs - c.fromNs} ns into the step.`,
        names: w.got === 'none' ? null : { turn: markCovering(mine, at, w.fromNs) ?? lastPlace(mine, at, 'mark') ?? 0 },
      }
    }
    return { sentence: 'Some of your marks overlap or reach outside the step, so the stretches they cover are not counted.', names: { turn: lastPlace(mine, at, 'mark') ?? 0 } }
  }
  const cause = gap === null || gap.cause < 0 ? null : spanView(c.hunt.trace, gap.cause).name
  return {
    sentence:
      cause === null
        ? 'This step has no cause to name.'
        : `The cause is ${code(cause)}: the span of the main thread that covers most of the time from the gap's start to the launch of the work that ended it, and where two spans cover the same time, the inner one.`,
    names: { turn: lastPlace(mine, at, 'cause') ?? 0 },
  }
}
