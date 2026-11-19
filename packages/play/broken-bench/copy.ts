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
import { INTERVAL_WIDTH_FACTOR, NUMBER_TOLERANCE_PERMILLE } from './judge'
import type { BenchLevelId } from './types'

export interface BenchCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  /** The pass rule, stated before the report is filed (REDESIGN §2.6), with the level's bars in it. */
  readonly passRule: string
  /** What the goal line's target says in practice, where nothing is graded: the pass rule of the graded attempt, before the learner chooses it. */
  readonly practiceBeat: string
}

/** What makes one case stand (judge.ts): `NUMBER_TOLERANCE_PERMILLE` and `INTERVAL_WIDTH_FACTOR`, ASSESSMENT §4.3's. */
const STANDS = 'the flaw named right, a p99 within 15% of the recomputed value, and a range that holds it and is at most 2 times as wide as the bootstrap interval'
const ONE_PASS = `Passes when the 1 case stands: ${STANDS}.`
const COURT_PASS = `Passes when at least 4 of the 5 reports stand, each with ${STANDS}.`
/** In practice the goal line names the pass rule and the dock prints its numbers (the range rule, over the fields), so the goal stays short. */
const KEPT = 'the flaw named right, and the range rule kept'
const ONE_PRACTICE = `Practice is not graded. A graded attempt passes when the 1 case stands: ${KEPT}.`
const COURT_PRACTICE = `Practice is not graded. A graded attempt passes when at least 4 of the 5 reports stand: ${KEPT}.`

const CONTROLS = 'You name the flaw, or say the benchmark is fair, and write down a p99 with a range.'
const ENDS = 'Ends when you file the report.'

export const BENCH_COPY: Readonly<Record<BenchLevelId, BenchCopy>> = {
  due: {
    title: 'From due time',
    goal: { aim: 'Find what a benchmark timed from the send has hidden.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      'A benchmark report quotes a p99 timed from each request\'s send. Its log also keeps when each request was due. Name the flaw, time the log again from the due times, and write down the p99 the report should have had, with the range you stand behind.',
    passRule: ONE_PASS,
    practiceBeat: ONE_PRACTICE,
  },
  warm: {
    title: 'Warm-up cut',
    goal: { aim: 'Decide whether a report counted its warm-up.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      'A report may have timed its first requests while caches and kernels were still cold. The course fixes the warm-up cut before the run and checks after it that the log had settled. Apply the rule: name the flaw, or say that the benchmark is fair, and write down the p99 that stands, with a range.',
    passRule: ONE_PASS,
    practiceBeat: ONE_PRACTICE,
  },
  sure: {
    title: 'p99 interval',
    goal: { aim: 'Decide whether a report measured enough requests for its p99.', controls: CONTROLS, beat: ONE_PASS, ends: ENDS },
    prompt:
      "A p99 needs requests beyond it, and an interval says how far to trust it. Count what lies beyond this report's p99, name the flaw or say that the benchmark is fair, and write down the p99 a long enough run would show, with the range you stand behind.",
    passRule: ONE_PASS,
    practiceBeat: ONE_PRACTICE,
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
    practiceBeat: COURT_PRACTICE,
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The frame's words (REDESIGN §2.6, §3.5, R-T31)                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The range rule, printed above the report form before anything is filed (REDESIGN §2.6: "Broken benchmark shows its range rule before
 * filing"). The bars are the judge's own constants, so the sentence cannot say a number the judge does not use: the p99's tolerance, and
 * the multiple of the reference's bootstrap interval a range may span. One line of two clauses, so it takes two lines at a desk's dock.
 */
export const RANGE_RULE = `p99 within ${NUMBER_TOLERANCE_PERMILLE / 10}% of the recomputed p99; range holds it, at most ${INTERVAL_WIDTH_FACTOR} times as wide as its bootstrap interval.`

/** A part of the diagram, as the parts list names it (REDESIGN §2.6): an id, the engine's name and one sentence. All of them are the course's model. */
export interface BenchPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The levels that draw it, or every level. */
  readonly levels: readonly BenchLevelId[] | 'all'
  /** The claim (content/claims) that holds its value. A part with none is a model object. */
  readonly claim?: string
}

/** The parts, in the order the list shows them: the five every level draws. */
export const BENCH_PARTS: readonly BenchPart[] = [
  { id: 'claim', name: 'Claim', sentence: 'The p99 time to first token the report quotes, with how many requests it rests on and where its timer started.', levels: 'all' },
  { id: 'histogram', name: 'Histogram', sentence: 'Every request of the log, higher for a longer time to first token on a logarithmic axis, with the claim flagged across it.', levels: 'all' },
  { id: 'timeline', name: 'Timeline', sentence: 'A stretch of the log, one row for each request: when it was due, when it was sent, and when it was done.', levels: 'all' },
  { id: 'switch', name: 'Latency switch', sentence: 'Where latency counts from: the send time, or the due time. It changes what the chart shows and files nothing.', levels: 'all' },
  { id: 'form', name: 'Report form', sentence: 'Name the flaw, then write the corrected p99 and a range that holds it. The range rule is printed above it.', levels: 'all' },
]

/** The parts a level draws, in the list's order: every level draws all five. */
export const partsOf = (level: BenchLevelId): readonly BenchPart[] => BENCH_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/** The first run's look: the switch, and what flipping it does. It names no flaw and gives no number. */
export const LOOK = {
  label: 'Latency switch',
  title: 'Latency switch',
  detail: 'It counts each request from its send time, as a timer inside the request function does, or from the time it was due. The log is the same either way; only the clock starts somewhere else.',
  lead: 'Flip the Latency from switch above the chart and watch the histogram move. It changes the view and files nothing. The popover says what it holds.',
  ask: 'The report form opens next: name the flaw, then write the corrected p99 and a range. Nothing is filed until you file it.',
} as const

/**
 * The one named moment of the game (REDESIGN §3.5): the first time latency is counted from the due time and the p99 moves. `before` and
 * `after` are the desk's own p99s in milliseconds, which only a practice run shows.
 */
export const COORDINATED_OMISSION = {
  id: 'coordinated-omission',
  line: (beforeMs: string, afterMs: string): string =>
    `Coordinated omission: counted from the due time, the p99 moved from ${beforeMs} ms to ${afterMs} ms. The worst waits, between a request being due and being sent, never reached a log timed from the send.`,
} as const

/** How to play, in the engine's words. */
export const HOW_TO = [
  'Read the claim and the setup beside the chart.',
  'Look at the log: the histogram shows every request, the timeline shows a stretch of it, and the log lists each request with its times. Select a request in any of them and the others follow.',
  'Flip the Latency from switch, and leave out the first requests with the warm-up cut, to see what the report did not. Neither files anything.',
  'Name the flaw, or find none. Then write the corrected p99 and a range that holds it, and file the report.',
] as const
