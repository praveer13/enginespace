import type { FrameRun, RunOutcome } from '@/games/kit/Frame'
import type { VerifierAction, VerifierAsk, VerifierCounters, VerifierView } from '@es/play/verifier/types'

/** What every part of the rejection sampler's page gets: the run, with the view it draws and the actions it can take (the frame's `FrameRun`). */
export type VerifierRun = FrameRun<VerifierAction, VerifierView, VerifierCounters, VerifierAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type VerifierOutcome = RunOutcome<VerifierView>
