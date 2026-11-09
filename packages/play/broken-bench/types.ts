/**
 * The Inspection's vocabulary (`broken-bench`, GAMES.md §11 "Simulation API", §2.6 "The Inspection"): the levels, the actions a
 * learner takes, the state that follows from them, and the view that the 2D board and the mirror both draw.
 *
 * Everything here is data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed, copied across a worker and replayed. Times are integer µs, as
 * packages/sim/bench keeps them, and the screens print them in milliseconds.
 *
 * Names. The kitchen names the objects (a request is an order, the client's log is the stopwatch's log, a client is a table) and the
 * engine's term names the concept; ids stay the engine's (D-049): levels, actions and flaws speak of `flaw`, `predict` and `submit`.
 *
 * What a case is. The corpus (`brokenBenchCase`, W1-T32) draws the flaw, then the answer, then a scene that gives it. The state holds
 * each case's seed and flaw and nothing more: the rows are a pure function of them (cases.ts), so a state stays small to hash and to
 * copy, and a replay builds the same rows again.
 */
import type { Seed, Us } from '@es/sim/core'
import type { BenchFlaw, BenchClaim, BrokenCorrection, CorrectionKind } from '@es/sim/bench/broken-types'
import type { ColdStart, Stall } from '@es/sim/bench/server'
import type { BenchRow, BenchSpec } from '@es/sim/bench/types'

export type Flaw = BenchFlaw

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * GAMES.md §11's levels: `due` re-times a log from its due times, `warm` finds the warm-up cut by the course's rule, `sure` puts an
 * interval on a p99 and asks how many orders it needs, and `court` is five mixed cases. `rain-and-relay`, the 3D opener, is a stretch
 * built after `court` ships (GAMES.md §11), so it is not a level of this build.
 */
export const LEVEL_IDS = ['due', 'warm', 'sure', 'court'] as const
export type BenchLevelId = (typeof LEVEL_IDS)[number]

/**
 * The three sheets of the board (GAMES.md §11, "Controls": view tabs). `[` and `]` move between them. The board opens on the histogram, the
 * whole log in one picture: a learner reads the shape first (a slope at the start, a spike in the middle) and goes to the rows and the
 * timeline to see which orders made it.
 */
export const TABS = ['rows', 'timeline', 'histogram'] as const
export type BenchTab = (typeof TABS)[number]

/** One case of a level: the seed its benchmark is drawn from and the flaw it is drawn for. */
export interface CaseSlot {
  readonly seed: Seed
  readonly flaw: Flaw
}

export interface BenchLevel {
  readonly id: BenchLevelId
  readonly seed: Seed
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside it (GAMES.md §2.6, rule 2). */
  readonly prompt: string
  readonly slots: readonly CaseSlot[]
  /** Cases that must stand, with the flaw and the number right, for the level to pass (ASSESSMENT §4.3) [estimated]. */
  readonly needed: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a learner does (GAMES.md §11, "Simulation API"):
 *   flaw     name the one flaw of the case on the board, and change the name until it is filed;
 *   predict  write down the corrected p99 and the range the learner stands behind, in integer µs;
 *   view     turn to another sheet of the board (rows, timeline or histogram);
 *   submit   file the ruling: the case is judged and the next one comes up.
 */
export type BenchAction =
  | { readonly t: 'flaw'; readonly flaw: Flaw }
  | { readonly t: 'predict'; readonly p99Us: Us; readonly loUs: Us; readonly hiUs: Us }
  | { readonly t: 'view'; readonly v: BenchTab }
  | { readonly t: 'submit' }

/** The pending decision: which case is on the board and what it still needs. */
export interface BenchAsk {
  readonly caseNo: number
  readonly cases: number
  readonly needs: 'flaw' | 'prediction' | 'filing'
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Prediction {
  readonly p99Us: Us
  readonly loUs: Us
  readonly hiUs: Us
}

/** What the court made of a filed case: the three counts of GAMES.md §11, and the interval's log score. */
export interface Ruling {
  readonly named: Flaw
  readonly flawOk: boolean
  /** The p99 is within the tolerance of the recomputed one. */
  readonly numberOk: boolean
  /** The interval holds the recomputed p99 and is no wider than twice the court's bootstrap interval. */
  readonly intervalOk: boolean
  /** The interval score in thousandths of a decade, lower is better (logscore.ts). */
  readonly scoreMilli: number
}

export interface BenchState {
  readonly level: BenchLevel
  /** The case on the board; the number of cases once the court has risen. */
  readonly at: number
  readonly picks: readonly (Flaw | null)[]
  readonly predictions: readonly (Prediction | null)[]
  readonly rulings: readonly (Ruling | null)[]
  readonly tab: BenchTab
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* View                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Facts about the log that anyone can count off it. They are evidence, not answers: none of them is the corrected number. */
export interface Facts {
  readonly orders: number
  /** Orders sent more than ASSESSMENT B4's tolerance after they were due. */
  readonly lateSends: number
  readonly maxLateUs: Us
  /** The most orders sent and not yet done at once. */
  readonly inFlightPeak: number
  /** Clients of a closed loop, or null for an open one. */
  readonly clients: number | null
  /** Orders finished a second over the log, ×1,000: from the first send to the last reply. */
  readonly finishedPerSMilli: number
  readonly meanPromptTokens: number
  readonly meanOutputTokens: number
  readonly longestOutputTokens: number
  readonly lastDueUs: Us
}

/** Everything a learner may see of a case. The flaw is not here, and neither is the stall or the cold start: a debrief shows those. */
export interface SceneView {
  /** The seed the case rests on. */
  readonly seed: Seed
  readonly claim: BenchClaim
  /** What the harness was told to do. */
  readonly setup: BenchSpec
  readonly server: { readonly label: string; readonly maxNumSeqs: number; readonly maxBatchedTokens: number }
  readonly rows: readonly BenchRow[]
  /** Rows the harness left out of its measured sample: those due before its declared warm-up ended. */
  readonly harnessCut: number
  /** What the server can finish a second on this traffic, ×1,000: the engine card's number. */
  readonly capacityPerSMilli: number
  readonly facts: Facts
}

/** What the court found, shown once the run is over: the true flaw, the recomputed number and the arithmetic. */
export interface RulingView extends Ruling {
  readonly caseNo: number
  readonly trueFlaw: Flaw
  readonly right: boolean
  readonly prediction: Prediction
  /** The recomputed p99 and the rows it rests on. */
  readonly truth: {
    readonly p99Us: Us
    readonly n: number
    readonly how: CorrectionKind
    /** The court's 95% bootstrap interval on the corrected p99 (A§5.6). */
    readonly ciLoUs: Us
    readonly ciHiUs: Us
    /** The interval score of the court's own interval against the same number, in thousandths of a decade. */
    readonly courtScoreMilli: number
  }
  /** The corrected benchmark's sample, in row order: the debrief draws it and counts the rank off it. */
  readonly correction: BrokenCorrection
  readonly scene: SceneView
  /** What the server did that the log hid: a freeze or a cold start. */
  readonly reveal: { readonly stalls: readonly Stall[]; readonly cold: ColdStart | null }
}

export interface BenchView {
  readonly level: BenchLevelId
  readonly title: string
  readonly prompt: string
  /** Every log of this game is synthetic, and every screen says so (PRODUCT.md, "Evidence on Hand"). */
  readonly synthetic: true
  /** The case on the board, from 1; the last case's number once the court has risen. */
  readonly caseNo: number
  readonly cases: number
  /** Cases that must stand for the level to pass. */
  readonly needed: number
  readonly tab: BenchTab
  readonly done: boolean
  /** The case on the board, or null once the court has risen. */
  readonly scene: SceneView | null
  readonly pick: Flaw | null
  readonly prediction: Prediction | null
  /** A flaw is named and a prediction written, so the ruling can be filed. */
  readonly ready: boolean
  /** Cases filed so far. */
  readonly filed: number
  /** The rulings, once the run is over (a reference run's too): never before, since they hold the answers. */
  readonly rulings: readonly RulingView[] | null
}

/** The counts of a run (GAMES.md §1, rule 3: counts, never speed). */
export interface BenchCounts {
  readonly cases: number
  readonly filed: number
  readonly flawsRight: number
  readonly numbersRight: number
  readonly intervalsRight: number
  /** Cases ruled right: the flaw, the number and the interval. */
  readonly casesRight: number
  /** The interval scores of the filed cases, added, in thousandths of a decade. */
  readonly scoreMilli: number
}
