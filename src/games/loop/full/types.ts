import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { FullAction, FullAsk, FullCounters, FullView } from '@es/play/loop/full/types'

/** What every part of the full service's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type FullRun = RunApi<FullAction, FullView, FullCounters, FullAsk>

/** A finished run: the grade, the debrief, and the house's view beside the learner's. */
export type FullOutcome = RunOutcome<FullView>
