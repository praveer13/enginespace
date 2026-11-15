/**
 * What the Inspection's levels say, by level id (R-T02): the title on the rail and the line a level opens on. The words are display copy
 * and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and no golden. The view reads them
 * here by id (`benchView`), and `levelTitle` serves the registry's record.
 *
 * The copy carries no digit: a figure on screen is a Readout that tags it. The kitchen's word names the object and the engine's term
 * rides beside it (GAMES.md §2.6, rule 2).
 */
import type { BenchLevelId } from './types'

export interface BenchCopy {
  readonly title: string
  readonly prompt: string
}

export const BENCH_COPY: Readonly<Record<BenchLevelId, BenchCopy>> = {
  due: {
    title: 'From the due time',
    prompt:
      'A kitchen quotes a p99 off its stopwatch log. The log keeps when each guest was due as well as when their order was taken. Name the flaw, time the log again from the due times, and write down the p99 the report should have had, with the range you stand behind.',
  },
  warm: {
    title: 'The warm-up cut',
    prompt:
      "A report may have timed the first tables while the ovens heat. The course fixes the cut before the run and checks after it that the log had settled. Apply the rule: name the flaw, or say that the inspection is fair, and write down the p99 that stands, with a range.",
  },
  sure: {
    title: 'How sure',
    prompt:
      'A p99 needs orders beyond it, and an interval says how far to trust it. Count what lies beyond this report\'s p99, name the flaw or say that the inspection is fair, and write down the p99 a long enough run would show, with the range you stand behind.',
  },
  court: {
    title: 'The court',
    prompt:
      'Five reports come before the court, each with its setup and its log. In each, name the flaw (or find none), write down the p99 the report should have had, and give a range. Four of the five must stand, with the flaw and the number right.',
  },
}
