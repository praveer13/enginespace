import type { FrameRun, RunOutcome } from '@/games/kit/Frame'
import type { PoolAction, PoolAsk, PoolScore, PoolView } from '@es/play/pool/types'

/** What every part of KV page pool's page gets: the run, with the view it draws and the actions it can take (the frame's `FrameRun`). */
export type PoolRun = FrameRun<PoolAction, PoolView, PoolScore, PoolAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type PoolOutcome = RunOutcome<PoolView>

/** How the page is being played: a practice level shows the cost of each eviction and has undo, a graded one has neither (ASSESSMENT §4.3). */
export type PoolMode = 'practice' | 'graded'
