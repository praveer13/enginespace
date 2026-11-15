/**
 * What the front page's levels say, by level id (R-T02): the title on the rail and the line a level opens on. The words are display
 * copy and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and no golden. A view reads
 * them here by id (`loopView`), and `levelTitle` serves the registry's record.
 *
 * The copy follows GAMES.md §2.6 ("First service's copy"): the kitchen word names the object and the engine term rides beside it.
 * It carries no digit, so no number goes untagged: the counters are Readouts, and the mirror holds every figure.
 */
import type { LoopLevelId } from './types'

export interface LoopCopy {
  /** The level's name on screen. */
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside it. */
  readonly prompt: string
}

export const LOOP_COPY: Readonly<Record<LoopLevelId, LoopCopy>> = {
  'first-1-fill': {
    title: 'Fill the rail',
    prompt: 'Tap a ticket to hang it on the rail (put a request in the batch). Hang as many as there are clips, then ring the bell.',
  },
  'first-2-slot': {
    title: 'A clip empties',
    prompt:
      'Ring the bell until a ticket ends. Its clip opens and the line waits for you: hang the next ticket (refill the slot), or ring the bell to leave the clip empty.',
  },
  'first-3-gap': {
    title: 'Mind the gap',
    prompt:
      'The stations go dark between fires while the expo writes the next call. Turn on "Write the next call during this fire" (overlap, async scheduling), then keep ringing the bell until a plate is binned.',
  },
  'first-4-par': {
    title: 'Your turn',
    prompt:
      'A burst of tickets and both tools: refill every clip the moment it opens, and write the next call during the fire. Serve every ticket and beat par.',
  },
}
