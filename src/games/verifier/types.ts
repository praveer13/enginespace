import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { VerifierAction, VerifierAsk, VerifierCounters, VerifierView } from '@es/play/verifier/types'

/** What every part of The Tasting's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type VerifierRun = RunApi<VerifierAction, VerifierView, VerifierCounters, VerifierAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type VerifierOutcome = RunOutcome<VerifierView>
