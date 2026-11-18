import type { FullAction, FullAsk, FullCounters, FullView } from '@es/play/loop/full/types'
import type { FrameRun, RunOutcome } from '@/games/kit/Frame'

/** What every part of the full levels' page gets: the frame's run, with the view it draws and the actions it can take. */
export type FullRun = FrameRun<FullAction, FullView, FullCounters, FullAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type FullOutcome = RunOutcome<FullView>
