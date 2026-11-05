import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { FloorAction, FloorAsk, FloorCounters, FloorView } from '@es/play/engine-floor/types'

/** What every part of Back of House's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type FloorRun = RunApi<FloorAction, FloorView, FloorCounters, FloorAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type FloorOutcome = RunOutcome<FloorView>
