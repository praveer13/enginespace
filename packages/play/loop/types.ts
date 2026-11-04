/**
 * Service's vocabulary (`loop`, GAMES.md §3 "Simulation API", §2.6 "Service"): the levels of the front-page run, the actions a
 * visitor takes, the state that follows from them and the view that the 2D view, the DOM mirror and (W0-T17) the 3D scene all draw.
 *
 * Everything here is data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed, copied across a worker and replayed. A tick is one unit of
 * the model's integer clock and the front page's world is synthetic (D-048): the screens label every tick count so.
 *
 * Names. The kitchen names the objects (a ticket is a request, a clip is a batch slot, a fire is a step, a plate is a useful token,
 * a binned plate is a ghost token) and the engine's term names the concept. Ids stay the engine's (D-049): levels, actions and
 * levers speak of `admit`, `run`, `async` and `batching`, never of tickets.
 */
import type { Seed, Us } from '@es/sim/core'
import type { Span } from '@es/sim/steploop'
import type { ReqRecord, StepRecord } from '@es/sim/steploop/metrics'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The front page's four levels, "First service" (GAMES.md §3.1): fill the rail, a clip empties, mind the gap, your turn. TR2's
 * levels (`async`, `graphs`, `keys`, `mrv2`, `close`) and TR6's `mask` join this union with W1-T13, over the same session.
 */
export type LoopLevelId = 'first-1-fill' | 'first-2-slot' | 'first-3-gap' | 'first-4-par'

/**
 * What ends a level. Each one is a beat of GAMES.md §3.1:
 *   first-fire         one fire has been rung and read back (beat 1);
 *   first-stop-handled a ticket has ended, the visitor has dealt with its clip, and the next fire has been read back (beat 2);
 *   first-ghost        a binned plate has appeared: a course fired for a ticket that had already ended (beat 3);
 *   all-served         every ticket has been served and read back (beat 4, "against par").
 * A level also ends when every ticket has been served.
 */
export type LoopGoal = 'first-fire' | 'first-stop-handled' | 'first-ghost' | 'all-served'

/** Whether the overlap switch is on the panel: beats 1 and 2 do not have it yet (GAMES.md §3.1 introduces it in beat 3). */
export type LeverAccess = 'locked' | 'free'

export interface LoopLevel {
  readonly id: LoopLevelId
  readonly seed: Seed
  /** The level's name on screen. */
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside it (GAMES.md §2.6, "First service's copy"). */
  readonly prompt: string
  /** Clips on the rail: the batch slots (D-043: 4 [estimated]). */
  readonly slots: number
  /**
   * How many courses the tables of the tickets will ask for before they ask for the check: the truth about the requests, which the
   * expo cannot see (GAMES.md §3.1: "the scheduler never sees the length"). Nothing reads this to decide what to fire. They are in
   * the order the tickets are hung: the k-th ticket hung is served by `outputs[k]`, whatever its number, so the order the visitor
   * taps in cannot change the night (engine.ts, `hang`).
   */
  readonly outputs: readonly number[]
  /** Fires that the house plays before the visitor takes over (hang the tickets first-come first-served, refill, no overlap), or null for none. */
  readonly opening: number | null
  readonly goal: LoopGoal
  readonly overlap: LeverAccess
  /** The reference run's clock in ticks, shown as the target "par" (GAMES.md §3.1 beat 4), or null when the level has no par. */
  readonly par: Us | null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a visitor does (GAMES.md §3, "Simulation API"). TR2's `capture` and `commit` join with W1-T13.
 *   admit  hang a waiting ticket on the rail: in the clip `slot` when one is named, else the first free clip;
 *   run    ring the bell: fire the next step (`step`), or keep firing until the next decision (`decision`);
 *   lever  flip a switch: `async` (overlap, "write the next call during this fire") or `batching` (`static` fires the rail as a set
 *          and hangs nothing until every clip has cleared; `continuous` refills).
 */
export type LoopAction =
  | { readonly t: 'admit'; readonly req: number; readonly slot?: number }
  | { readonly t: 'run'; readonly until: 'step' | 'decision' }
  | { readonly t: 'lever'; readonly name: 'async' | 'batching'; readonly value: boolean | 'static' | 'continuous' }

/** The pending decision, or none: which clips are free and which tickets wait (`Session.ask`). */
export interface LoopAsk {
  /** Free clips, by position. */
  readonly free: readonly number[]
  /** Waiting tickets, by id, in the order the printer fed them. */
  readonly waiting: readonly number[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What a place in a fire came to once its plates were read back. `pending` is a course on the line that nobody has read yet. */
export type PlaceOutcome = 'empty' | 'pending' | 'plate' | 'binned'

/**
 * One fire, a step that has been rung: who hung in each clip when it was called, which tickets were hung for the first time (an
 * admission, which adds a tick to the fire), and what each place came to. `record` is the sim's own record of the step, so the sim's
 * metrics read it as they read a `runStepLoop` run.
 */
export interface Fire {
  readonly record: StepRecord
  readonly clips: readonly (number | null)[]
  readonly fresh: readonly boolean[]
  readonly outcome: readonly PlaceOutcome[]
  /** Tickets still waiting when the fire was called: an empty place beside a waiting ticket was avoidable. */
  readonly waiting: number
  /** Whether the overlap switch was on when the fire was called. */
  readonly overlap: boolean
}

/**
 * The whole run so far, as plain data. The level is held whole, because a `Session` method gets only the state.
 *
 * It follows `packages/sim/steploop` exactly: the two lanes are the sim's spans, the fires carry the sim's step records, and a
 * ticket is the sim's request record, so `finishRun` of the sim reads the summary off it. What differs is who decides what joins a
 * fire: the visitor does, by hand, and the sim's scheduler does not (engine.ts says where each rule is the sim's).
 */
export interface LoopState {
  readonly level: LoopLevel
  /** Overlap (async scheduling): the next call is written during this fire (GAMES.md §3, "Why the rule is the concept"). */
  readonly overlap: boolean
  readonly batching: 'continuous' | 'static'
  /** The rail: the ticket in each clip as the expo believes it, or null. A ticket that ended stays hung until its plates are read back. */
  readonly tray: readonly (number | null)[]
  /** Tickets not yet hung, in the order the printer fed them. */
  readonly waiting: readonly number[]
  readonly reqs: readonly ReqRecord[]
  /** Which tickets have been in a fire: the first fire of a ticket admits it. */
  readonly prefilled: readonly boolean[]
  /** The expo's clock and the line's clock: when each is next free. */
  readonly cpuT: Us
  readonly gpuT: Us
  /** The sim's lanes: `schedule` and `sync` spans on the expo's lane, `forward` spans on the line. */
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
  readonly fires: readonly Fire[]
  /** Fires read back so far: the oldest `reads` fires are read, and the rest are on the line. */
  readonly reads: number
  /** `reads` at the moment the first ticket ended and its clip opened, or null before that (beat 2's goal). */
  readonly firstStopAt: number | null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* View                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A place, drawn: a plate (solid), an empty place (an open groove) or a binned plate (hollow, struck through). A course on the line shows as a plate. */
export interface PlaceView {
  readonly state: 'plate' | 'empty' | 'binned'
  /** The ticket it belongs to, or null for an empty place. */
  readonly req: number | null
}

/** A fire, drawn. The line's slab runs from `startUs` to `endUs`; the dark stretch before it is `bubbleUs` long. */
export interface FireView {
  readonly index: number
  readonly startUs: Us
  readonly endUs: Us
  /** One place for each clip, in clip order. */
  readonly places: readonly PlaceView[]
  /** Tickets hung for the first time in this fire. */
  readonly admits: number
  /** Dark ticks on the line before this fire, while the expo was busy (the sim's bubble). */
  readonly bubbleUs: Us
  /** Binned plates in this fire, known once it is read back. */
  readonly ghosts: number
  /** Still on the line: its plates have not been read back. */
  readonly onLine: boolean
}

export interface ClipView {
  /** The ticket hung in this clip, or null for a clip that is paid for and empty. */
  readonly req: number | null
  /** Hung since the last fire, so the next one will cook it for the first time. */
  readonly fresh: boolean
}

/**
 * The counters of GAMES.md §3 ("Scoring and pass"), in ticks of the synthetic clock. `paddedTokens`, `launches` and `eagerSteps` are
 * 0 on the front page, which has no graph (TR2's levels use them); `emptyClipSteps` is the front page's own: places the line paid
 * for and nobody ate, summed over the fires ("clip paid for, empty").
 */
export interface LoopCounters {
  readonly usefulTokens: number
  readonly ghostTokens: number
  readonly paddedTokens: number
  readonly gpuBusyUs: Us
  readonly bubbleUs: Us
  readonly bubbles: number
  readonly launches: number
  readonly eagerSteps: number
  readonly clockUs: Us
  readonly emptyClipSteps: number
}

/** What the scene, the 2D view and the mirror all draw (GAMES.md §3: "lanes, slabs, cells, combs, the bay, counters"). */
export interface LoopView {
  readonly level: LoopLevelId
  readonly title: string
  readonly prompt: string
  /** The front page's clock is synthetic ticks, and every screen says so (D-048). */
  readonly synthetic: true
  readonly slots: number
  /** The expo's clock now, and the lanes' extent. */
  readonly clockUs: Us
  /** Fires rung so far: the bell's count. */
  readonly step: number
  readonly overlap: boolean
  /** Whether the overlap switch is on the panel in this level. */
  readonly overlapAvailable: boolean
  readonly batching: 'continuous' | 'static'
  /** A decision is pending: a clip is free and a ticket waits. The heat lamp falls on the rail. */
  readonly deciding: boolean
  /** Hanging a ticket is allowed right now (static batching refuses while a fire's tickets are on the rail). */
  readonly canHang: boolean
  /** The bell can ring: something is hung, or something is on the line to read back. */
  readonly canFire: boolean
  readonly done: boolean
  /** Tickets waiting, by id. */
  readonly waiting: readonly number[]
  /** The rail, one entry for each clip. */
  readonly rail: readonly ClipView[]
  /** The fired rail: the fire on the line, whose plates the expo has not read back. Null when none is on the line. */
  readonly firedRail: readonly ClipView[] | null
  /** The expo's lane and the line's lane, as spans. */
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
  readonly fires: readonly FireView[]
  readonly counters: LoopCounters
  /** The reference's clock, as the target. Null when the level has no par. */
  readonly par: Us | null
  /** Ticks between the latest two fires' starts: the step clock the printer tape prints. Null before a second fire. */
  readonly stepTicks: Us | null
  /** Whether the line is cooking at the expo's clock. */
  readonly lineLit: boolean
}
