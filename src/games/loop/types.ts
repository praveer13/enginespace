import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { LoopAction, LoopAsk, LoopCounters, LoopView } from '@es/play/loop/types'

/** What every part of Service's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type LoopRun = RunApi<LoopAction, LoopView, LoopCounters, LoopAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type LoopOutcome = RunOutcome<LoopView>
