/*
 * The memory model, as Today uses it (D-037; ARCHITECTURE §13). The model is kernelspace's FSRS-6, vendored unchanged
 * (vendor/kernelspace/src/lib/learner/fsrs.ts): a transcription of ts-fsrs 5.4.2's memory model, with whole local days, no learning
 * steps and no fuzz. This file is the wrapper VENDOR.md asks for. It supplies what the model leaves to its caller, which is the
 * retention that a review is scheduled for, and it names the four things Today asks of the model: the memory after a first review,
 * the memory after a later one, the days until the next, and the recall predicted on a given day.
 *
 * tests/today/fsrs.test.ts replays ts-fsrs's 2,000 recorded sequences through these four functions, so that a wrapper that dropped
 * or reordered an argument fails the same vectors the model does.
 */
import { DEFAULT_RETENTION, MAX_INTERVAL, W, intervalDays, nextMemory, retrievability } from '../../../vendor/kernelspace/src/lib/learner/fsrs'
import type { MemoryState, Rating } from '../../../vendor/kernelspace/shims/src/lib/learner/types'
import type { Confidence } from '@es/ledger'

export type { MemoryState, Rating }
export { MAX_INTERVAL, W }

/**
 * The recall that a review is scheduled for: the model is asked for the day on which predicted recall falls to this much. kernelspace's
 * default, and its recall SLO [estimated]. It is the caller's choice, as VENDOR.md says, and Today makes it here.
 */
export const TARGET_RETENTION: number = DEFAULT_RETENTION

/** FSRS's four grades. */
export const RATINGS: readonly Rating[] = [1, 2, 3, 4]

/** What each grade is called. */
export const RATING_NAMES: Readonly<Record<Rating, string>> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

export const isRating = (value: unknown): value is Rating => value === 1 || value === 2 || value === 3 || value === 4

/**
 * The grade that an answer earns. Wrong is Again. Right is Good, unless the learner said it was a guess (Hard) or that they were
 * sure (Easy). kernelspace's rule (`ratingOf`, d478f91) also asks for a quick answer before it grades Easy; this course times nothing
 * (ASSESSMENT rule 2), so a right answer that the learner was sure of is Easy without it [estimated].
 */
export function gradeOf(answer: { ok: boolean; conf?: Confidence }): Rating {
  if (!answer.ok) return 1
  if (answer.conf === 'guess') return 2
  if (answer.conf === 'sure') return 4
  return 3
}

/** The memory after a card's first review. */
export const firstMemory = (grade: Rating): MemoryState => nextMemory(null, 0, grade)

/** The memory after a review `daysSince` whole local days after the last one (0 is the same day, which the model treats as short-term). */
export const afterReview = (memory: MemoryState, daysSince: number, grade: Rating): MemoryState => nextMemory(memory, daysSince, grade)

/** Whole days from a review until predicted recall falls to `retention`, at least 1. */
export const intervalOf = (memory: MemoryState, retention: number = TARGET_RETENTION): number => intervalDays(memory.stability, retention)

/** The probability of recall `days` whole days after the last review. */
export const recallAfter = (memory: MemoryState, days: number): number => retrievability(days, memory.stability)
