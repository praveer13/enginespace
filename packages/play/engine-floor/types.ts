/**
 * Back of House's vocabulary (`engine-floor`, GAMES.md §5 "Simulation API", §2.6 "Back of House"): the levels of the practice run, the
 * actions a learner takes, the state that follows from them and the view that the 2D view, the DOM mirror and (W1-T18) the 3D scene all
 * draw.
 *
 * Everything here is data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed, copied across a worker and replayed.
 *
 * Names. The kitchen names the objects (a request is a ticket, a process is a floor, a queue is a spike, a copy is the dumbwaiter, a
 * sync is "Heard!") and the engine's term names the concept. Ids stay the engine's (D-049): levels, actions and stages speak of
 * `lay`, `run`, `queue` and `ipc`, never of tickets.
 */
import type { Seed } from '@es/sim/core'
import type { EngineId, Mechanism, Place, Scenario, SourceRef } from '@es/sim/lifecycle'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The practice levels of GAMES.md §5, in the order of its difficulty line ("one process, then four, then threads and queues, then
 * async planning, then failure paths"). The graded `map` joins them with W1-T19.
 */
export type FloorLevelId = 'nano' | 'nano-tp' | 'mini' | 'inside' | 'vllm' | 'sglang' | 'abort'

export interface FloorLevel {
  readonly id: FloorLevelId
  readonly seed: Seed
  /** The level's name on screen. */
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside them. */
  readonly prompt: string
  readonly scenario: Scenario
  /** The engine's path for the scenario, as stage ids in order: the house run. Nothing on screen reads it before a run has been judged. */
  readonly reference: readonly string[]
  /** The tray: the stage ids of the path and the distractors, in the seeded order. */
  readonly tray: readonly string[]
  /** How many runs the level allows, or null for as many as the learner likes. A practice level never ends a run on a failure. */
  readonly attempts: number | null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a learner does (GAMES.md §5, `FloorAction`).
 *   commit  write the prediction down, before any stage is laid and before anything is revealed;
 *   lay     append a stage of the tray to the path;
 *   unlay   take the path back: by one stage, or back to `to` stages (what the first stage that failed asks for);
 *   move    swap a laid stage with its neighbour, up (-1) or down (+1) the path;
 *   run     send the ticket along the path as far as it holds.
 */
export type FloorAction =
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'lay'; readonly stage: string }
  | { readonly t: 'unlay'; readonly to?: number }
  | { readonly t: 'move'; readonly from: number; readonly by: -1 | 1 }
  | { readonly t: 'run' }

/** The pending decision (`Session.ask`): the prediction, then the next stage from where the ticket stands, then nothing. */
export type FloorAsk =
  | { readonly kind: 'predict'; readonly choices: readonly number[] }
  | { readonly kind: 'lay'; readonly at: Place; readonly canRun: boolean }

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a run finds                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Why a stage did not hold. The first five are the rules of GAMES.md §5, which the lifecycle model keeps as functions; `path` is a
 * stage that is legal where the ticket stands and is still not the one the engine makes next.
 */
export type Failure = 'start' | 'process' | 'thread' | 'device' | 'async' | 'path'

/** A stage of the model with whose it is and where it is cited: what an explanation points at. */
export interface StageNote {
  readonly id: string
  /** The engine the stage belongs to. A distractor belongs to another engine than the level's. */
  readonly engine: EngineId
  readonly engineTitle: string
  readonly mechanism: Mechanism
  readonly label: string
  readonly from: Place
  readonly to: Place
  readonly source: SourceRef
}

/** Where the ticket stopped, and why. */
export interface Stop {
  /** The place in the path of the stage that did not hold. */
  readonly at: number
  readonly failure: Failure
  /** One sentence that names the rule, or says the stage is not the engine's next. Engine identifiers are in backticks. */
  readonly sentence: string
  /** The stage that was laid. */
  readonly laid: StageNote
  /** The stage the engine has in that place, or null when the request is already back and there is nothing more to lay. */
  readonly expected: StageNote | null
}

/** What one run found. */
export interface FloorRun {
  /** How many stages held, from the start of the path. */
  readonly reached: number
  /** The first stage that did not hold, or null. */
  readonly stop: Stop | null
  /** The whole path held and is the engine's whole path: the request is back where it began. */
  readonly complete: boolean
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The first stage that did not hold in any run: where it was in the path, which stage it was, and the action that laid it. */
export interface Mistake {
  readonly index: number
  readonly stage: string
  /** The place in the action log of the `lay` that put the stage there (the debrief names it). */
  readonly turn: number
}

/**
 * The whole run so far, as plain data. The level is held whole, because a `Session` method gets only the state.
 *
 * `ran` is how many of the laid stages the last run covered. It is what keeps the path honest: a stage laid after the run has had no
 * verdict, and taking the path back below `ran` takes the verdict with it. The verdict itself is not stored, because it is a function
 * of the scenario and the stages (`runPath`), and a state that stored it could contradict its own path.
 */
export interface FloorState {
  readonly level: FloorLevel
  readonly prediction: number | null
  readonly laid: readonly string[]
  /** The turn of the `lay` that put each laid stage there, in step with `laid`. */
  readonly laidAt: readonly number[]
  readonly ran: number
  readonly runs: number
  readonly mistake: Mistake | null
  /** A run found the whole path, and it held: the request is back. */
  readonly served: boolean
  /** Actions taken so far: the place in the log of the next one. */
  readonly turns: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* View                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A stage as the tray shows it. Nothing here says whose it is: that is for a run to find out. */
export interface TileView {
  readonly id: string
  readonly mechanism: Mechanism
  readonly label: string
  readonly from: Place
  readonly to: Place
}

/**
 * A stage on the path. Until a run has judged it, a stage shows only what its tile did: its source and whose it is are what a run
 * reveals, because the repository named in a citation would tell a distractor from the engine's own stage.
 */
export interface LaidView extends TileView {
  readonly index: number
  /** `ran`: the ticket got through it. `struck`: the first that did not hold. `pending`: laid, and nobody has asked yet. */
  readonly state: 'ran' | 'struck' | 'pending'
  readonly source: SourceRef | null
  readonly owner: EngineId | null
}

/** The pin the level reads, for the scenario card: the engine, the commit or tag the course pins, and the day the stages were read there. */
export interface PinView {
  readonly engine: EngineId
  readonly title: string
  readonly repo: string
  readonly ref: string
  readonly readOn: string
}

/** What the scene, the 2D view and the mirror all draw. */
export interface FloorView {
  readonly level: FloorLevelId
  readonly title: string
  readonly prompt: string
  readonly scenario: Scenario
  readonly pin: PinView
  /** Where the request begins, and where it ends again unless it is aborted. */
  readonly entry: Place
  /** The prediction, or null while it is still to be written. */
  readonly prediction: number | null
  /** `predict`, then `lay`; `over` once the run is. */
  readonly step: 'predict' | 'lay' | 'over'
  /** The tray: the stages not yet laid, in the order the tray was drawn. */
  readonly tray: readonly TileView[]
  readonly laid: readonly LaidView[]
  /** How many laid stages the last run covers, and how many of them held. */
  readonly ran: number
  readonly reached: number
  /** Where the ticket stands: at the end of the stages that held in the last run, or at the entry before any run. */
  readonly capsule: Place
  /** The present (GAMES.md §2.6): where the next hand-off starts, at the end of the laid path. The lamp falls here and nowhere else. */
  readonly present: Place
  /** Why the last run stopped, or null while it has not or the path held. */
  readonly stop: Stop | null
  /** The first stage that did not hold in any run, found again from the engine's own path: what the debrief names. Null while none has. */
  readonly mistake: Stop | null
  readonly canRun: boolean
  readonly canUnlay: boolean
  readonly runs: number
  readonly done: boolean
  /** How many stages the engine's path has [derived from the pinned lifecycle data]. */
  readonly stages: number
}

/** The counts of a run, which are counts of stages and nothing about time (GAMES.md §1, rule 3). */
export interface FloorCounters {
  readonly laid: number
  /** Stages that held in the last run. */
  readonly held: number
  readonly runs: number
  /** Stages that held before the first that did not, in any run: the whole path when none ever failed. */
  readonly survived: number
  /** Stages in the engine's path. */
  readonly stages: number
}
