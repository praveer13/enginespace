import type { FrameRun, RunOutcome } from '@/games/kit/Frame'
import type { FloorAction, FloorAsk, FloorCounters, FloorView } from '@es/play/engine-floor/types'

/** What every part of Request path's page gets: the run, with the view it draws and the actions it can take (the frame's `FrameRun`). */
export type FloorRun = FrameRun<FloorAction, FloorView, FloorCounters, FloorAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type FloorOutcome = RunOutcome<FloorView>
