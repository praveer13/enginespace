/**
 * What Broken benchmark's levels say, by level id (R-T02, R-T04): the title in the level menu, the goal line, the line a level opens on,
 * and the pass rule, since every level is graded. The words are display copy and no rule reads them, so they are not in a level or a state:
 * rewording one moves no state hash and no golden. The view reads them here by id (`benchView`), and `levelTitle` serves the registry's
 * record.
 *
 * The words are the engine's and the benchmarking literature's (REDESIGN §2.7, D-063): request, due time, coordinated omission, warm-up,
 * open and closed loop, p99, interval. A prompt carries no digit but the p99's own; a pass rule carries the level's bars, and
 * tests/copy/game-copy.test.ts reads each from the level and the judge and finds it there.
 */
import type { GoalLine } from '../types'
import type { BenchLevelId } from './types'

export interface BenchCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  /** The pass rule, stated before the report is filed (REDESIGN §2.6), with the level's bars in it. */
  readonly passRule: string
}

/** What makes one case stand (judge.ts): `NUMBER_TOLERANCE_PERMILLE` and `INTERVAL_WIDTH_FACTOR`, ASSESSMENT §4.3's. */
const STANDS = 'the flaw named right, a p99 within 15% of the recomputed value, and a range that holds it and is at most 2 times as wide as the bootstrap interval'
const ONE_PASS = `Passes when the 1 case stands: ${STANDS}.`
const COURT_PASS = `Passes when at least 4 of the 5 reports stand, each with ${STANDS}.`

const CONTROLS = 'You name the flaw, or say the benchmark is fair, and write down a p99 with a range.'
const ENDS = 'Ends when you file the report.'

export const BENCH_COPY: Readonly<Record<BenchLevelId, BenchCopy>> = {
  due: {
    title: 'From due time',
    goal: { aim: 'Find what a benchmark timed from the send has hidden.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      'A benchmark report quotes a p99 timed from each request\'s send. Its log also keeps when each request was due. Name the flaw, time the log again from the due times, and write down the p99 the report should have had, with the range you stand behind.',
    passRule: ONE_PASS,
  },
  warm: {
    title: 'Warm-up cut',
    goal: { aim: 'Decide whether a report counted its warm-up.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      'A report may have timed its first requests while caches and kernels were still cold. The course fixes the warm-up cut before the run and checks after it that the log had settled. Apply the rule: name the flaw, or say that the benchmark is fair, and write down the p99 that stands, with a range.',
    passRule: ONE_PASS,
  },
  sure: {
    title: 'p99 interval',
    goal: { aim: 'Decide whether a report measured enough requests for its p99.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      "A p99 needs requests beyond it, and an interval says how far to trust it. Count what lies beyond this report's p99, name the flaw or say that the benchmark is fair, and write down the p99 a long enough run would show, with the range you stand behind.",
    passRule: ONE_PASS,
  },
  court: {
    title: 'Five reports',
    goal: {
      aim: 'Audit five benchmark reports, each with its own flaw or none.',
      controls: 'You name the flaw in each report, or say it is fair, and write down a p99 with a range.',
      beat: COURT_PASS,
      ends: 'Ends when you have filed all five.',
    },
    prompt:
      'Five reports, each with its setup and its log. In each, name the flaw (or find none), write down the p99 the report should have had, and give a range. Four of the five must stand, with the flaw and the number right.',
    passRule: COURT_PASS,
  },
}
