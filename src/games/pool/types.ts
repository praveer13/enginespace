import type { RunApi, RunOutcome } from '@/games/kit/GameShell'
import type { PoolAction, PoolAsk, PoolScore, PoolView } from '@es/play/pool/types'

/** What every part of The Reach-In's page gets: the run, with the view it draws and the actions it can take (GameShell's `RunApi`). */
export type PoolRun = RunApi<PoolAction, PoolView, PoolScore, PoolAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type PoolOutcome = RunOutcome<PoolView>

/** How the page is being played: a practice level has its prices and its undo, a graded one has neither (ASSESSMENT §4.3). */
export type PoolMode = 'practice' | 'graded'
