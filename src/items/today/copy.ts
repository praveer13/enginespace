/*
 * Everything Today says, in one place, so that the rule it keeps can be held to the words (tests/today/copy.test.ts): the page never says
 * how much is overdue, never scolds, never counts what was left, and names a number only through the readout. ASSESSMENT §8: "a
 * welcome-back set after 7 idle days and never an overdue count" (kernelspace K2).
 *
 * The voice is the course's (REDESIGN §2.7): the product's own words (review, question, Check answer), and no kitchen word. A line says
 * what the learner will do or what happened, and an error says the problem and the way back. An item is a question everywhere.
 */
import type { LocalDay } from '@es/ledger'
import { formatDay } from './days'
import type { SessionMode } from './session'

export const PAGE_LEAD = 'What you have passed, brought back before it fades. New numbers every time. Nothing is timed.'

export const WELCOME_BACK = 'Welcome back. This is a short list of the ideas most worth keeping, and the rest will come back gradually.'

export const AHEAD_NOTE = 'None of these is due yet. The ones closest to fading come first.'

/** The note a review set carries under its title, by the kind of session. Nothing for an ordinary one. */
export const modeNote = (mode: SessionMode): string | null => (mode === 'welcome-back' ? WELCOME_BACK : mode === 'ahead' ? AHEAD_NOTE : null)

/** The title of a review set. */
export const listTitle = (mode: SessionMode): string => (mode === 'ahead' ? 'Review ahead' : 'Review set')

export const START_PREP = 'Start review'
export const START_AHEAD = 'Review ahead'
export const CHECK_TICKET = 'Check answer'
export const NEXT_TICKET = 'Next question'
export const FINISH_PREP = 'Finish the review'
export const MORE_PREP = 'Review another set'

export const EMPTY_TITLE = 'Nothing to review yet'
export const EMPTY_BODY = "Review brings back what you have passed: answer a lesson's questions or pass a graded level."
export const EMPTY_UNSERVED_TITLE = 'No review questions yet for what you have passed'
export const EMPTY_UNSERVED_BODY = 'The ideas you have passed so far have no review questions yet. This page picks them up on its own once their modules publish them.'

export const REST_TITLE = 'Nothing is due today.'

/** "Your next review is Fri 6 Nov." */
export const nextPrep = (day: LocalDay): string => `Your next review is ${formatDay(day)}.`

export const REST_AHEAD = 'You can review ahead. The ideas closest to fading come first.'

export const DONE_TITLE = 'Review done'

/** "Next review: Fri 20 Nov.", the line that closes a set. */
export const nextReview = (day: LocalDay): string => `Next review: ${formatDay(day)}.`

/** "Next after this: Fri 20 Nov", in the quiet column beside a set that is waiting. */
export const nextAfter = (day: LocalDay): string => `Next after this: ${formatDay(day)}`

/** "last seen Mon 9 Nov", under an idea on the list. */
export const lastSeen = (day: LocalDay): string => `last seen ${formatDay(day)}`

/** The word that says where a question of a set stands, as a reader sees it. */
export const stateWord = (state: 'waiting' | 'now' | 'done', ok?: boolean): string => (state === 'done' ? (ok === true ? 'right' : 'missed') : state === 'now' ? 'now' : 'next')

// Not "Kept": Course and Progress keep that word for an idea passed again 30 days or more later, which no first day has.
export const KEPT_LABEL = 'Ideas passed'
export const KEPT_LEGEND = 'Ideas you have passed, which this page brings back before they fade.'
export const SET_LABEL = 'The questions in this review'

/** A question's line on the list, once it is checked: the day it comes back. */
export const backLine = (day: LocalDay): string => `back ${formatDay(day)}`

/** "3 of 8", the place in the list. */
export const placeLine = (index: number, total: number): string => `Question ${index + 1} of ${total}`

/** "5 of 8 right", the tally's headline. */
export const tallyLine = (right: number, total: number): string => `${right} of ${total} right`

export const SAVE_FAILED = 'This answer was not saved.'

export const LOAD_LABEL = 'Reading your ledger'
/** What the question frame says while the code of the family that serves it loads (src/items/families.ts). */
export const PRINT_LABEL = 'Setting up the question'

export const LINK_MAP = 'Open the course'
export const LINK_EVIDENCE = 'See your progress'

/** The status each line of the list has for assistive technology, which the box alone does not say. */
export const lineStatus = (state: 'waiting' | 'now' | 'done', ok?: boolean): string => (state === 'done' ? (ok === true ? 'done, right' : 'done, missed') : state === 'now' ? 'now' : 'next')
