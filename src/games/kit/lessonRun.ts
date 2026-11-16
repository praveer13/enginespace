import { createContext, type ReactNode } from 'react'

/*
 * What a lesson tells a run that sits in it (REDESIGN §2.4 and §2.5), for the run's result. A game page and the front page provide nothing.
 *
 *   - `onward`: the lesson's local way on from this run's result, which the debrief leads with as its one primary control: "Next level:
 *     Full attention and a sliding window" between two opening levels, "Read why" after the last. A run in a lesson never offers to leave
 *     the lesson from its result.
 *   - `reveal`: the lesson's guess that this run's slot asked (a paired guess), revealed: the guess beside the model's answer, in the
 *     lesson's own numbers. The debrief draws it in place of the level's own number line, whose answer is for a different quantity, and
 *     says so to the lesson through `showsReveal`, so the lesson does not draw it a second time under the instrument.
 */

export interface LessonOnward {
  /** The control's words, which name its target: "Next level: <title>", "Read why". */
  readonly label: string
  select(): void
}

export interface LessonRun {
  readonly onward: LessonOnward | null
  /** The lesson's paired guess, as its ticket draws it (null for a run whose slot asked the level's own question). */
  readonly reveal: ReactNode
  /** The debrief is drawing `reveal` (true), or no longer is (false). A stable function. */
  showsReveal(shown: boolean): void
}

export const LessonRunContext = createContext<LessonRun | null>(null)
