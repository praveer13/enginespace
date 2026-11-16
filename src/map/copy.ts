/*
 * The words of Course and of a module's page, in one place so that the pages, their tests and the copy guard read the same copy. Course
 * is one column of modules, and each row says in words what the module needs and where the learner stands. The copy holds no number:
 * every count, hour and total is worked out from the course and the ledger when the page draws.
 */

import { SKILL_WORDS } from '@/progress/words'

export const MAP = {
  title: 'Course',
  modules: 'The modules, in order',
  /** The way on at the top of the page: `nextStep`'s answer, told back as a sentence. */
  way: {
    fresh: 'You have not started.',
    next: 'Next:',
    skipped: (n: number) => `${n} earlier ${n === 1 ? 'lesson' : 'lessons'} not finished`,
    reading: 'Reading your ledger',
    reviews: (n: number, minutes: number) => `${n} ${n === 1 ? 'review' : 'reviews'} due, about ${minutes} min`,
    mark: 'You are here',
  },
  /** The line of hours, and the one sentence under the legends. */
  hours: { all: 'hours in all', browser: 'in the browser', laptop: 'on a laptop', gpu: 'on a GPU', note: { before: 'Module hours are', between: 'and these totals are' }, estimated: 'estimated', derived: 'derived' },
  nothing: 'Nothing is locked. Prerequisites advise.',
  /** What a module needs, in words. */
  needs: { only: { B: 'browser only', L: 'laptop only', F: 'GPU only' }, in: { B: 'in the browser', L: 'on a laptop', F: 'on a GPU' }, then: 'then' },
  /** Where the learner stands in a module, in words. */
  state: {
    unpublished: 'Not published yet',
    reading: 'Reading your ledger',
    lessons: (done: number, total: number) => `${done} of ${total} ${total === 1 ? 'lesson' : 'lessons'} done`,
    lessonsTotal: (total: number) => `${total} ${total === 1 ? 'lesson' : 'lessons'}`,
    skills: (passed: number, total: number) => `${passed} of ${total} ${total === 1 ? 'skill' : 'skills'} passed`,
    skillsTotal: (total: number) => `${total} ${total === 1 ? 'skill' : 'skills'}`,
  },
  outcome: 'You will be able to',
  lessonsOf: (module: string) => `Lessons of ${module}`,
  next: 'Next',
  buildsOn: 'Builds on',
  kernelspace: 'kernelspace',
  notice: {
    loadingTitle: 'Course',
    loadingWhat: 'course',
    failedTitle: 'The course did not load',
    failedMessage: 'The course would not load. Check your connection and reload the page.',
  },
} as const

/** A module page's loop (ARCHITECTURE §3.1: Predict, Play, Build, Prove, Keep) and what the learner holds of it. */
export const LOOP = {
  title: 'How this module runs',
  term: 'the loop',
  lede: 'Every module runs the same five steps. The counts are of the events in this browser, read when the page draws.',
  steps: {
    predict: { name: 'Predict', what: 'Commit your answer before each reveal. A guess counts toward no skill.' },
    play: { name: 'Play', what: 'Play the games on practice seeds, then answer on fresh ones.' },
    build: { name: 'Build', what: 'Write the lab, and run it against checks drawn when you start.' },
    prove: { name: 'Prove', what: 'Do it again on fresh seeds with your agent closed.' },
    /** Follows a link to Review, which is the first word of the sentence. */
    keep: { name: 'Keep', what: 'brings back what you have passed, a few weeks on.' },
  },
  games: 'Games',
  labs: 'Labs',
  noGame: 'No game of its own.',
  noLab: 'No lab to write in this module.',
  arrives: 'arriving with',
  today: 'Review',
  made: 'made',
  credited: 'passed',
  of: 'of',
  tried: 'tried',
  partial: 'passed in practice',
  nothing: 'nothing yet',
  proved: 'proved',
  notYet: 'not yet',
  kept: 'knowledge components kept',
  reading: 'Reading your ledger',
} as const

export const KCS = {
  title: 'Knowledge components',
  term: 'what you can do',
  lede: 'Each one is something you can do once you hold it. A ring is one you have not started, a ringed dot one you have tried, a solid dot one you have passed, and a ticked dot one you have kept.',
  states: SKILL_WORDS,
  /** Printed once, when some of the module's KCs have no graded item behind them yet (ASSESSMENT §3.3: a practice level earns at most part credit). */
  planned: 'Some of these cannot be passed yet: their first graded questions are not published yet.',
  reading: 'Reading your ledger',
  count: { of: 'of', earned: 'passed', kept: 'kept' },
} as const

/** Every string above, for the tests. */
export function mapCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([MAP, LOOP, KCS])
  return out
}
