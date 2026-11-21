/*
 * The words of Course and of a module's page, in one place so that the pages, their tests and the copy guard read the same copy. Course
 * is one column of modules, and each row says in words what the module needs and where the learner stands. The copy holds no number:
 * every count, hour and total is worked out from the course and the ledger when the page draws.
 */

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
  hours: { published: 'hours published', planned: 'hours planned in all', browser: 'in the browser', laptop: 'on a laptop', gpu: 'on a GPU', note: { before: 'Module hours are', between: 'and these totals are' }, estimated: 'estimated', derived: 'derived' },
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

/** A module page's own words (REDESIGN section 3.3). */
export const MODULE = {
  can: 'You can',
  will: 'You will be able to',
  waiting: 'not published yet',
  rows: { game: 'Game', build: 'Build', prove: 'Prove', keep: 'Keep' },
  review: 'Review',
  keepWhat: 'Review brings back what you have passed, a few weeks on.',
  proved: 'proved',
  notYet: 'not yet',
  lessons: 'Lessons',
  reading: 'Reading your ledger',
} as const

/** Every string above, for the tests. */
export function mapCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([MAP, MODULE])
  return out
}
