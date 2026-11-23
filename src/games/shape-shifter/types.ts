import type { FrameRun, RunOutcome } from '@/games/kit/Frame'
import type { ShiftAction, ShiftAsk, ShiftScore } from '@es/play/shape-shifter/types'
import type { ShiftView } from '@es/play/shape-shifter/view'

/** What every part of Tensor views' page gets: the run, with the view it draws and the actions it can take (the frame's `FrameRun`). */
export type ShiftRun = FrameRun<ShiftAction, ShiftView, ShiftScore, ShiftAsk>

/** A finished run: the grade, the debrief, and the reference's view beside the learner's. */
export type ShiftOutcome = RunOutcome<ShiftView>

/** How the page is being played: practice has undo and its pinned numbers; a graded run draws fresh numbers when it starts and has no undo. */
export type ShiftMode = 'practice' | 'graded'

/** What the learner selected on the drawing: an element (by its place in logical order), or a program of the grid (by its place in the list). */
export type ShiftPick = { readonly kind: 'element'; readonly flat: number } | { readonly kind: 'program'; readonly at: number }
