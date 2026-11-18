import { createContext, type ReactNode } from 'react'

/*
 * A lesson's guess in a level's guess slot (REDESIGN §2.5). Where a lesson's guess and the level's opening guess ask for the same quantity
 * (packages/play/predictions/same.ts), the lesson asks it once, in the instrument's slot: the slot shows the lesson's words, and its Commit
 * hands the value to the lesson, which keeps the prediction, before the session's own commit is dispatched with the same value. A game page
 * and the front page provide nothing, and the slot asks the level's own question.
 */
export interface LessonGuess {
  /** The lesson's question, which stands in for the level's own. */
  readonly ask: ReactNode
  /** "Guess 2 of 2": where the run asks more than one guess, which one this is, so two boxes never read as the same question. */
  readonly label?: string
  /** What the slot shows under the field: how sure the learner is. */
  readonly sure?: ReactNode
  /** Takes the committed value, before the level's own commit is dispatched. */
  commit(value: number): void
}

export const LessonGuessContext = createContext<LessonGuess | null>(null)
