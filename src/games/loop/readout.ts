/*
 * What the printer's tape prints about the step clock (GAMES.md §2.6, "the printer tape"; D-048), read off the session's view so the
 * front page's tape, the mirror's tape and a fire's preview all print the same number for the same night.
 *
 * Ticks per step is the view's `stepTicks`, the ticks between the latest two fires' starts. With one fire rung there is no second
 * start yet, so the tape prints the ticks that fire has taken so far, from its plan to the clock: for a fire rung without overlap that
 * is its whole step (plan, cook and read), the same number the next fire's start will confirm.
 */
import type { Us } from '@es/sim/core'
import type { LoopView } from '@es/play/loop/types'

/** The step clock, in ticks of the synthetic clock: null before the first fire. */
export function stepClockOf(view: LoopView): Us | null {
  if (view.stepTicks !== null) return view.stepTicks
  const first = view.fires[0]
  if (first === undefined) return null
  const plan = view.cpu.find((span) => span.step === first.index && span.kind === 'schedule')?.startUs ?? first.startUs
  return view.clockUs - plan
}
