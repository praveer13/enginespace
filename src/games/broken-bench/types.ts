import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { BenchAction, BenchAsk, BenchCounts, BenchView } from '@es/play/broken-bench/types'

/** What every part of the Inspection's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type BenchRun = RunApi<BenchAction, BenchView, BenchCounts, BenchAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type BenchOutcome = RunOutcome<BenchView>
