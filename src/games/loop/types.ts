import type { Seed } from '@es/sim/core'
import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { RunCore } from '@/games/kit/useRun'
import type { LoopAction, LoopAsk, LoopCounters, LoopView } from '@es/play/loop/types'

/** What every part of Service's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type LoopRun = RunApi<LoopAction, LoopView, LoopCounters, LoopAsk>

/**
 * What the step loop's parts read of a run, whichever holds it: the instrument frame's run on `/play/loop` and in a lesson, and the front
 * page's own. Both have the run's core, the mirror's id and a restart.
 */
export type LoopRunCore = RunCore<LoopAction, LoopView, LoopCounters, LoopAsk> & {
  readonly mirrorId: string
  restart(seed?: Seed): void
}

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type LoopOutcome = RunOutcome<LoopView>
