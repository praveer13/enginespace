/**
 * Shared by the Inspection's tests (tests/play/broken-bench*.test.ts): the right filing of a case, a run played through the session's own
 * reducer, a learner who files whatever a function says, and a run as the pieces of the page receive it. Not a test: bun test collects
 * only *.test.ts.
 *
 * A case costs about 60 ms to build (the corpus's 27 ms, the court's recomputation and its bootstrap), and the session keeps what it built,
 * so the tests that play the same seed again pay for it once.
 */
import { applyAction, finishRun, startRun } from '@es/play'
import type { Run } from '@es/play'
import { caseOf } from '@es/play/broken-bench/cases'
import { benchAsk, benchDone, benchSession, benchView } from '@es/play/broken-bench/session'
import type { BenchAction, BenchLevelId, BenchState, CaseSlot, Flaw } from '@es/play/broken-bench/types'
import type { BenchOutcome, BenchRun } from '@/games/broken-bench/types'

/** What a learner who has done the court's own arithmetic files for a case: the true flaw, the recomputed p99 and the court's interval. */
export function rightAnswer(slot: CaseSlot): { flaw: Flaw; p99Us: number; loUs: number; hiUs: number } {
  const { truth, c } = caseOf(slot)
  return { flaw: c.flaw, p99Us: truth.correction.p99Us, loUs: truth.interval.loUs, hiUs: truth.interval.hiUs }
}

export type Answer = { flaw: Flaw; p99Us: number; loUs: number; hiUs: number }

/** A filing, as the three actions of the page send it. */
export const filing = (a: Answer): BenchAction[] => [
  { t: 'flaw', flaw: a.flaw },
  { t: 'predict', p99Us: a.p99Us, loUs: a.loUs, hiUs: a.hiUs },
  { t: 'submit' },
]

/** A run of a level on a seed, with each case filed as `answerFor` says (given the case's slot and place), played through the reducer. */
export function play(level: BenchLevelId, seed: number, answerFor: (slot: CaseSlot, at: number) => Answer): Run<BenchState> {
  let run = startRun(benchSession, { game: 'broken-bench', level, seed })
  while (!benchDone(run.state)) {
    const at = run.state.at
    for (const action of filing(answerFor(run.state.level.slots[at], at))) run = applyAction(benchSession, run, action)
  }
  return run
}

/** A run as the pieces of the page receive it (GameShell's `RunApi`), for a state, with every action a no-op: for server-rendering the page. */
export function fakeRun(state: BenchState, over: Partial<BenchRun> = {}): BenchRun {
  const view = benchView(state)
  return {
    game: 'broken-bench',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: { cases: view.cases, filed: view.filed, flawsRight: 0, numbersRight: 0, intervalsRight: 0, casesRight: 0, scoreMilli: 0 },
    ask: benchAsk(state),
    done: view.done,
    turns: 0,
    canUndo: false,
    dispatch: () => undefined,
    undo: () => undefined,
    announce: () => undefined,
    setAutoplay: () => undefined,
    mirrorId: 'mirror',
    phase: 'play',
    restart: () => undefined,
    goTo: () => undefined,
    ...over,
  }
}

/** A run of a level on a seed after the given actions. */
export function runAfter(level: BenchLevelId, seed: number, actions: readonly BenchAction[]): Run<BenchState> {
  let run = startRun(benchSession, { game: 'broken-bench', level, seed })
  for (const action of actions) run = applyAction(benchSession, run, action)
  return run
}

/** What the shell hands the debrief once a run is over: the grade, the debrief and the reference's view. */
export function outcomeOf(run: Run<BenchState>): BenchOutcome {
  const finished = finishRun(benchSession, run)
  if (finished === null) throw new Error('the run is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: benchSession.view(finished.ghost) }
}
