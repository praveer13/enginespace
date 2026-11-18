/*
 * The words for where a learner stands (REDESIGN §2.4), one small vocabulary each for a skill, an attempt and a lesson, with the one
 * legend line that goes wherever its words appear. They are the words of src/copy/terms.ts's STATE_WORDS, which
 * tests/progress/words.test.ts holds them to. "Practised", "earned", "credited" and "part credit" are the ledger's and the code's
 * words, and never the learner's.
 */

/** A skill (a knowledge component), by its state in `KC_STATES` (derive.ts). */
export const SKILL_WORDS = { none: 'not started', practised: 'tried', earned: 'passed', kept: 'kept' } as const

/** One attempt: a run or an answer. A pass at part weight (practice, assisted) is a pass in practice, and counts toward no skill. */
export const ATTEMPT_WORDS = { no: 'not yet', practice: 'passed in practice', yes: 'passed' } as const

/** A lesson: done is its Test passed. */
export const LESSON_WORDS = { 'not-started': 'not started', started: 'started', done: 'done' } as const

/** The legend lines, one per vocabulary. */
export const LEGENDS = {
  skill: 'Skills: tried is answered or played and not yet passed on new numbers; passed is a question set on new numbers or a graded level passed; kept is passed again in Review 30 days or more later.',
  attempt: 'An attempt is not yet, passed in practice (a practice pass, which counts toward no skill) or passed.',
  lesson: 'A lesson is not started, started or done, and done is its Test passed.',
} as const

/** A module's id as the course prints it: `tr5a` is TR5a. */
export const moduleCode = (id: string): string => (/^tr\d/.test(id) ? `TR${id.slice(2)}` : id.charAt(0).toUpperCase() + id.slice(1))
