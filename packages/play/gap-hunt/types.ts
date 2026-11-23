/**
 * Trace attribution's vocabulary (`gap-hunt`, GAMES.md §6): the levels, the actions a learner takes, and the state that follows.
 *
 * Everything here is plain data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed and replayed. A trace is typed arrays, which have no such form, so
 * the level holds only what draws its traces (a seed, a trace and a step for each case) and `engine.ts` makes the trace from it. The
 * state holds no display string: `copy.ts` makes every line from the figures here.
 */
import type { Seed } from '@es/sim/core'
import type { Category, Mark } from '@es/sim/trace'

/** The levels built in wave 2, in the order they teach (TR3's design, "Before you write", item 5). `pinned` and `yours` are not built. */
export const HUNT_LEVEL_IDS = ['read', 'graphs', 'gap', 'attribute'] as const
export type HuntLevelId = (typeof HUNT_LEVEL_IDS)[number]

/** The levels that are graded: `gap` and `attribute`. `attribute` is the Prove level. */
export const HUNT_GRADED: readonly HuntLevelId[] = ['gap', 'attribute']

/** The categories, in the order the guess's number counts them: 0 kernel, 1 copy-only, 2 CPU gap, 3 both idle. */
export const HUNT_CATEGORY_ORDER: readonly Category[] = ['kernel', 'copy', 'cpu-gap', 'both-idle']

/** What a case is drawn from: the seed of its two traces, which trace, and which step of it. The reference reads the rest from the trace. */
export interface CaseRef {
  readonly seed: Seed
  readonly trace: number
  readonly step: number
}

export interface HuntLevel {
  readonly id: HuntLevelId
  readonly seed: Seed
  /** Graded: drawn fresh at the start, no undo. The practice seed of `gap` and `attribute` is the one that is not. */
  readonly graded: boolean
  /** Cases that must pass for the level to pass: every one. */
  readonly needed: number
  readonly cases: readonly CaseRef[]
}

/**
 * What a learner does (GAMES.md §6): commit the opening guess before the first mark of a case, mark a stretch from one event edge to
 * another with a category, take a mark back, name the cause, and submit. `from` and `to` are the ns of two event edges of the step. A level
 * that asks for one count (`graphs`) ends on the commit of it.
 */
export type HuntAction =
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'mark'; readonly from: number; readonly to: number; readonly category: Category }
  | { readonly t: 'unmark'; readonly index: number }
  | { readonly t: 'cause'; readonly event: number | null }
  | { readonly t: 'submit' }

/** What the next action is for. */
export type HuntAsk = { readonly kind: 'commit'; readonly case: number } | { readonly kind: 'mark'; readonly case: number }

/** How a case ended: the numbers the grade and the debrief read, in integer ns. */
export interface CaseResult {
  readonly passed: boolean
  /** The ns of the scored stretch in the reference's category and in no other. */
  readonly rightNs: number
  /** The ns of the scored stretch that no mark covers. */
  readonly unaccountedNs: number
  /** The scored stretch: the window, or the largest gap for `gap`. */
  readonly scoredNs: number
  readonly causeOk: boolean
  /** How many things are wrong with the marks as a set (an overlap of categories, a mark outside the step, the gap's edges). */
  readonly problems: number
}

/** One case as it is played. */
export interface CaseRun {
  /** The opening guess, a number the level's `predict` copy says the unit of; null before it. */
  readonly guess: number | null
  /** Marks the case starts with (`locked` of them, which a learner cannot take back), then the learner's own. */
  readonly marks: readonly Mark[]
  readonly locked: number
  readonly cause: number | null
  /** Actions taken in this case, the guess and the submit included. */
  readonly turns: number
  readonly result: CaseResult | null
}

export interface HuntState {
  readonly level: HuntLevel
  /** The case in play: the first that is not yet over. */
  readonly at: number
  readonly runs: readonly CaseRun[]
  readonly history: readonly HuntAction[]
  readonly done: boolean
}

/** The counts of a run, on the model's clock, summed over the cases. */
export interface HuntScore {
  readonly marks: number
  readonly rightNs: number
  readonly scoredNs: number
  readonly unaccountedNs: number
  /** Cases passed, of `of`. */
  readonly passed: number
  readonly of: number
}
