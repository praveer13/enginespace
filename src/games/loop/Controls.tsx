import { LoopAuto, LoopBell, LoopPrompt, LoopTickets } from './ControlPieces'
import { LoopOverlap } from './LoopOverlap'
import type { LoopRun } from './types'
import { useLoopControls, type AutoToggleRef } from './useLoopControls'

export type { AutoToggleRef, LoopControls } from './useLoopControls'

/*
 * Service's controls (GAMES.md §3 "Controls", §2.6 "First service's copy"): HTML for every action, so a pointer, a keyboard and a
 * screen reader all reach the same things. The waiting tickets are buttons ("Tap a ticket to hang it on the rail"), the bell fires
 * the next step, Auto rings it until the loop needs a decision, and, from the third level on, one switch writes the next call
 * during this fire (overlap, async scheduling).
 *
 * The tickets are one tab stop and the arrows move along them (roving tabindex). When a ticket is hung, focus goes to the next
 * ticket in line, or to the bell when none is left, so a keyboard never loses its place. Auto pauses when a clip opens with a ticket
 * waiting, because the loop then waits for a decision (GAMES.md §3.1, beat 2), and it is never on to begin with (reduced motion,
 * WCAG 2.2.2).
 *
 * `useLoopControls` (useLoopControls.ts) holds all of that, and the pieces draw it: the prompt, the waiting tickets, the bell and Auto
 * (ControlPieces.tsx), and the overlap switch (LoopOverlap.tsx). `Controls` lays them out in one column, as the game's own page does;
 * the front page puts the same pieces where its pass puts them (the tickets on the printer's strip, the bell beside it), and they
 * keep one tab order and one focus rule.
 */

export function Controls({ run, toggleAutoRef }: { run: LoopRun; toggleAutoRef?: AutoToggleRef }) {
  const controls = useLoopControls(run, toggleAutoRef)
  return (
    <div className="flex flex-col gap-4" data-loop-controls="">
      <LoopPrompt controls={controls} />
      <LoopTickets controls={controls} />
      <div className="flex flex-wrap items-center gap-6">
        <LoopBell controls={controls} />
        <LoopAuto controls={controls} />
        <LoopOverlap controls={controls} />
      </div>
    </div>
  )
}
