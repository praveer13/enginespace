/*
 * Everything Today says, in one place, so that the rule it keeps can be held to the words (tests/today/copy.test.ts): the page never says
 * how much is overdue, never scolds, never counts what was left, and names a number only through the readout. ASSESSMENT §8: "a
 * welcome-back set after 7 idle days and never an overdue count" (kernelspace K2).
 *
 * The voice is the course's: the engine's term leads and the kitchen's word rides beside it (GAMES.md §2.6, rule 2). A line says what the
 * learner will do or what happened, and an error says the problem and the way back.
 */
import type { LocalDay } from '@es/ledger'
import { formatDay } from './days'
import type { SessionMode } from './session'

export const PAGE_LEAD = 'The ideas you have earned, brought back just before they fade. Every ticket is on new numbers, and nothing is timed.'

export const WELCOME_BACK = 'Welcome back. This is a short list of the ideas most worth keeping, and the rest will come back gradually.'

export const AHEAD_NOTE = 'None of these is due yet. The ones closest to fading come first.'

/** The note a prep list carries under its title, by the kind of session. Nothing for an ordinary one. */
export const modeNote = (mode: SessionMode): string | null => (mode === 'welcome-back' ? WELCOME_BACK : mode === 'ahead' ? AHEAD_NOTE : null)

/** The title of a prep list. */
export const listTitle = (mode: SessionMode): string => (mode === 'ahead' ? 'Review ahead' : 'Prep list')

export const START_PREP = 'Start the prep'
export const START_AHEAD = 'Review ahead'
export const CHECK_TICKET = 'Check the ticket'
export const NEXT_TICKET = 'Next ticket'
export const FINISH_PREP = 'Finish the prep'
export const MORE_PREP = 'Prep another list'

export const EMPTY_TITLE = 'Nothing to prep yet'
export const EMPTY_BODY =
  "Today keeps what you have already earned. Answer a lesson's items or play a graded level, and the ideas you get right come back here just before they fade."
export const EMPTY_UNSERVED_TITLE = 'No tickets yet for what you have earned'
export const EMPTY_UNSERVED_BODY = 'The ideas you have earned so far have no review tickets built. They arrive with their modules, and this page picks them up on its own.'

export const REST_TITLE = 'Nothing is due today'

/** "Your next prep is Fri 6 Nov." */
export const nextPrep = (day: LocalDay): string => `Your next prep is ${formatDay(day)}.`

export const REST_AHEAD = 'You can review ahead. The ideas closest to fading come first.'

export const DONE_TITLE = 'Prep done'

/** A ticket's line on the list, once it is checked: the day it comes back. */
export const backLine = (day: LocalDay): string => `back ${formatDay(day)}`

/** "3 of 8", the place in the list. */
export const placeLine = (index: number, total: number): string => `Item ${index + 1} of ${total}`

/** "5 of 8 right", the tally's headline. */
export const tallyLine = (right: number, total: number): string => `${right} of ${total} right`

export const SAVE_FAILED = 'This answer was not saved.'

export const LOAD_LABEL = 'Reading your ledger'
/** What the ticket says while the code of the family that serves it loads (src/items/families.ts). */
export const PRINT_LABEL = 'Printing the ticket'

export const LINK_MAP = 'Open the course map'
export const LINK_TR2 = 'Start with TR2'
export const LINK_EVIDENCE = 'See your evidence'

/** The status each line of the list has for assistive technology, which the box alone does not say. */
export const lineStatus = (state: 'waiting' | 'now' | 'done', ok?: boolean): string => (state === 'done' ? (ok === true ? 'done, right' : 'done, missed') : state === 'now' ? 'now' : 'next')
