/**
 * What the step loop's four demo levels say, by level id (R-T02, R-T04): the title in the level menu, the goal line and the line a level
 * opens on. The words are display copy and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and
 * no golden. A view reads them here by id (`loopView`), and `levelTitle` serves the registry's record.
 *
 * The words are the engine's (REDESIGN §2.7, D-063): request, batch slot, step, async scheduling, bubble, ghost token. Step is the Step
 * button's word too. The copy carries no digit, so no number goes untagged: the counters are Readouts, and the mirror holds every figure.
 * None of the four is graded, so none has a pass rule.
 */
import type { GoalLine } from '../types'
import type { LoopLevelId } from './types'

export interface LoopCopy {
  /** The level's name on screen. */
  readonly title: string
  readonly goal: GoalLine
  /** The line the level opens on. */
  readonly prompt: string
}

export const LOOP_COPY: Readonly<Record<LoopLevelId, LoopCopy>> = {
  'first-1-fill': {
    title: 'Fill the batch',
    goal: {
      aim: 'Fill the running batch before the first step.',
      controls: 'You choose which waiting requests to admit into the empty batch slots.',
      beat: "The number to beat is the reference run's: every slot live in the first step.",
      ends: "Ends when the first step's tokens are read back.",
    },
    prompt: 'Tap a waiting request to admit it into the running batch. Fill every slot, then press Step.',
  },
  'first-2-slot': {
    title: 'Refill a slot',
    goal: {
      aim: 'Keep every batch slot live when a request finishes.',
      controls: 'You choose whether to admit a waiting request into the freed slot or leave it empty.',
      beat: "The number to beat is the reference run's: every slot live in the step after.",
      ends: 'Ends when the step after the first finished request is read back.',
    },
    prompt:
      'Press Step until a request finishes. Its slot frees and the loop waits for you: admit the next request into it (continuous batching), or press Step to leave it empty.',
  },
  'first-3-gap': {
    title: 'Close a bubble',
    goal: {
      aim: 'Close the bubbles, where the GPU idles while the CPU prepares the next step.',
      controls: 'You switch async scheduling on, so the CPU prepares the next step while this one runs.',
      beat: "The number to beat is the reference run's idle GPU time.",
      ends: 'Ends when the first ghost token is read back.',
    },
    prompt:
      'Between steps the GPU idles while the CPU prepares the next one: a bubble. Turn on async scheduling, then press Step until a ghost token appears: a token computed for a request that had already stopped.',
  },
  'first-4-par': {
    title: 'Both levers',
    goal: {
      aim: 'Serve every request in as few ticks as you can.',
      controls: 'You admit requests into freed slots, and switch async scheduling on or off.',
      beat: "The reference run's clock is the number to beat.",
      ends: 'Ends when every request is served.',
    },
    prompt:
      'A burst of requests, and both levers: refill every slot the moment it frees, and plan the next step while this one runs. Serve every request in no more ticks than the reference run.',
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The words printed over the drawing, and the words the pages say about it (R-T14)                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A request's name on screen: R1 for the first. The chips, the buttons, the table and the live region all say it, so a request has one name.
 */
export const requestName = (id: number): string => `R${id + 1}`
