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
  /** What a count counted, by name, in order (the stages, for Request path): the reveal names them beside the number. */
  readonly counted?: (run: RunRecord) => readonly string[]
}

/** Checks that a run is of the game block a reference answers, so that a run of any other level cannot answer it by accident. */
export function requireRun(run: RunRecord, game: string, level: string): void {
  if (run.game !== game || run.level !== level) {
    throw new RangeError(`this prediction is answered by a run of ${game}/${level}, and the run is of ${run.game}/${run.level}`)
  }
}

/**
 * Where a revealed answer's working comes from, when it is more than the question's own numbers: a claim of the course (the id, and the
 * title of its source as the claim gives it), or a count the lesson makes in a table of its own, with no claim.
 */
export interface Source {
  /** The claim's id, or undefined for a count of the lesson's own. */
  readonly claim?: string
  /** The source as a reader sees it: the engine, its version, the file and the symbol. */
  readonly text: string
}

/**
 * A prediction revealed at commit (`reveal: at-commit`, D-067): the answer is computed from the question's own numbers by the course's pure
 * model, or read from the claim the question is about, and no run is read. It lives in the lazy part of the module it belongs to, because the
 * model it computes with is loaded when the learner commits, and a lesson page loads none of it before.
 */
export interface Commit {
  /** The phrases of the prompt that the working takes its numbers from, and tests/play/predictions.test.ts fails when the prompt no longer says them. */
  readonly says: readonly string[]
  /** The working, a line each: the arithmetic on the question's own numbers, or the claim in words. The last line ends in the answer. */
  readonly working: readonly string[]
  /** Where the answer is read from when it is read from a claim, or a count; none for an answer that is arithmetic on the question's numbers alone. */
  readonly sources: readonly Source[]
  /** The tag of the answer: `derived` when it is worked out from numbers, `measured` when it is a figure that the cited source holds. */
  readonly tag: 'derived' | 'measured'
  /** The model's answer. It takes no run: the question carries what it needs. */
  readonly truth: () => Truth
}

