import type { FrameRun, RunOutcome } from '@/games/kit/Frame'
import type { BenchAction, BenchAsk, BenchCounts, BenchView } from '@es/play/broken-bench/types'

/** What every part of Broken benchmark's page gets: the run, with the view it draws and the actions it can take (the frame's `FrameRun`). */
export type BenchRun = FrameRun<BenchAction, BenchView, BenchCounts, BenchAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type BenchOutcome = RunOutcome<BenchView>
