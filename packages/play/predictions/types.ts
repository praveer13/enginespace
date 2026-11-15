/**
 * The vocabulary of the lesson prediction box's references (ARCHITECTURE §4.3, §7.2; ASSESSMENT §4.7; W1b-T02): what the pure model says a
 * prediction's answer is, and what it reads that from.
 *
 * A prediction is graded at the reveal against what the pure model computes from the run of the game block that follows it, and against no
 * key that anything stores (A§1, I3). So a reference here is a function of a run's record (the game, the level and the seed it was played
 * on), and the answer it gives is the model's: it reads the world the run was played in and asks the course's own functions about it.
 *
 * This file is types and one guard, so importing it costs a bundle nothing.
 */
import type { RunRecord } from '../types'

/** The model's answer to a prediction: a number, or the id of the option that is right. */
export type Truth = number | string

/**
 * A prediction whose answer the model reads from a run (`plan.ts` lists the ones that have such a run, and the rest wait for a task). It
 * lives in the part of the package that is loaded when a prediction is revealed, because it brings the games' worlds with it.
 */
export interface Reference {
  /**
   * The phrases of the prediction's prompt that state what the reading answers about: a lever the question moves ("two GPUs"), a size it
   * names ("4,096 tokens"), or the numbers of the world the run was played in ("12 kernels", "28 layers"). The reading takes the world from
   * the run and the lever or the size from the prompt, and tests/play/predictions.test.ts fails when the prompt no longer says them, so a
   * prompt that is edited cannot leave a reference answering another question.
   */
  readonly says: readonly string[]
  /** What the model read, for the reveal: one sentence, with no digit in it (the figures beside it are readouts that tag themselves). */
  readonly reads: string
  /** The model's answer for this run. Throws for a run of another game or another level than the one the reference answers. */
  readonly truth: (run: RunRecord) => Truth
}

/** Checks that a run is of the game block a reference answers, so that a run of any other level cannot answer it by accident. */
export function requireRun(run: RunRecord, game: string, level: string): void {
  if (run.game !== game || run.level !== level) {
    throw new RangeError(`this prediction is answered by a run of ${game}/${level}, and the run is of ${run.game}/${run.level}`)
  }
}
