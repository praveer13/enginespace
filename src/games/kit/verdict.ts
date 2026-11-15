import type { Grade } from '@es/play'

/*
 * The verdict word of a finished run (REDESIGN §2.4): "Passed" or "Not yet" where the level has a pass rule, and "Finished (practice)"
 * where it has only a number to beat. It is read from the grade's own data, and nothing else is printed as a verdict.
 */

export type Verdict = 'Passed' | 'Not yet' | 'Finished (practice)'

/** The verdict a finished run gets: a level with a pass rule passes or does not, and a level with only a number to beat is finished. */
export function verdictOf(grade: Grade, hasPassRule: boolean): Verdict {
  if (!hasPassRule) return 'Finished (practice)'
  return grade.ok ? 'Passed' : 'Not yet'
}
