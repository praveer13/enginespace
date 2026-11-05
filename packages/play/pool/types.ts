/**
 * The Reach-In's vocabulary (`pool`, GAMES.md §8 "Simulation API", §2.6 "The Reach-In"): the levels, the actions a learner takes, the asks
 * that call for them, the state that follows and the view that the 2D view, the DOM mirror and (W1-T24) the 3D scene all draw.
 *
 * Everything here is data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed, copied across a worker and replayed. Time is a count of steps of
 * the engine, one chunk of decode for every ticket on the line, and every screen says the world is synthetic.
 *
 * Names. The kitchen names the objects (a page is a pan, a request a ticket, a session a table, a group a station, an adapter a recipe
 * kit) and the engine's term names the concept. Ids stay the engine's (D-049): levels, actions and kinds speak of `admit`, `evict`,
 * `preempt` and `prefetch`, never of tickets.
 */
import type { Seed } from '@es/sim/core'
import type { KvAdapterSpec, KvPresetId, KvSpec, KvState } from '@es/sim/kv'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The levels of GAMES.md §8, in the order they teach: full attention only, then a sliding window beside it, then eviction under
 * pressure, a model whose layers need padding to one page size, a recurrent state, adapters in the same pool, and everything on a fresh
 * seed. `evict`, `adapters` and `manager` are the graded ones (ASSESSMENT §4.3).
 */
export const POOL_LEVEL_IDS = ['one-group', 'two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager'] as const
export type PoolLevelId = (typeof POOL_LEVEL_IDS)[number]

/** A table: one conversation, whose next ticket opens with the whole of its last. */
export interface PoolTable {
  readonly id: number
  /** The letter on its pans' tape: A, B, C. */
  readonly letter: string
  /** The standing order its tickets open with (a shared system prompt), or null when the table has its own. */
  readonly standing: number | null
  /** Tokens of that standing order, 0 when the table has none: blocks that lie wholly inside it are the standing order's, not the table's. */
  readonly standingLen: number
  /** The recipe kit its tickets need, or null for the base model. */
  readonly adapter: number | null
  readonly tickets: number
}

/**
 * A ticket's script: the tokens of its prompt, the tokens it will decode, and which ticket follows it at its table. The k-th ticket of a
 * table opens with the whole of the (k-1)-th, prompt and reply, so the cache has something to hit (GAMES.md §8, "Core loop"). Tickets are
 * numbered turn by turn: every table's first, then every table's second.
 */
export interface PoolReq {
  readonly id: number
  readonly table: number
  readonly turn: number
  readonly prompt: readonly number[]
  readonly out: readonly number[]
  readonly adapter: number | null
  /** The ticket that follows at this table, or null. */
  readonly next: number | null
  /** A first ticket: the step it arrives. Any other: the steps its table thinks after the ticket before it is served. */
  readonly delay: number
}

/** What a level asks the learner to predict before the first decision (GAMES.md §8: "Predict the pages a request will hold"). */
export interface PoolPredict {
  readonly ask: string
  readonly unit: 'pages' | 'stations'
  readonly answer: number
}

export interface PoolLevel {
  readonly id: PoolLevelId
  readonly seed: Seed
  readonly title: string
  /** The line the level opens on, in the kitchen's words with the engine's term beside them. */
  readonly prompt: string
  /** Graded levels are drawn on a fresh seed, show the learner no price for a dump, and have no undo. */
  readonly graded: boolean
  readonly preset: KvPresetId
  readonly spec: KvSpec
  /** The recipe kits on offer, by id: `[]` for a level without adapters. */
  readonly kits: readonly KvAdapterSpec[]
  readonly tables: readonly PoolTable[]
  readonly reqs: readonly PoolReq[]
  /** Tickets on the line at most: the batch slots. */
  readonly cap: number
  /** Tokens a ticket on the line decodes in one step. */
  readonly chunk: number
  /** Steps a kit of `pages` pages takes to land: `1 + ⌊pages ÷ loadRate⌋`. */
  readonly loadRate: number
  /** The night ends here, whatever is unserved, and an unserved ticket scores 0. */
  readonly stepCap: number
  /** Tokens one stalled step costs, where the weight is the prefill a step forgoes (GAMES.md §8, "Scoring and pass") [estimated]. */
  readonly stallWeight: number
  /** The pass mark of the level [estimated]: ASSESSMENT.md §4.3 owns the real bar. */
  readonly bar: number
  readonly predict: PoolPredict
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions and asks                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a learner does (GAMES.md §8). Each answers the open ask, one kind at a time:
 *   commit    the prediction, before the first decision (optional, and only as the first action);
 *   admit     hang a waiting ticket, or `null` to hang none this step;
 *   evict     dump these cached pans, exactly as many as the ask needs, so that a ticket or a kit has room;
 *   preempt   pull a ticket from the line, so that the line can grow;
 *   prefetch  bring a recipe kit in before its ticket hangs, or `null` for none yet.
 * GAMES.md's sketch dumps one pan to an action. A dump here is the whole set that one ticket needs, so a level is a few dozen
 * decisions and not a few hundred; the rest of the contract is the sketch's.
 */
export type PoolAction =
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'admit'; readonly req: number | null }
  | { readonly t: 'evict'; readonly pages: readonly number[] }
  | { readonly t: 'preempt'; readonly req: number }
  | { readonly t: 'prefetch'; readonly adapter: number | null }

/** The pending decision (`Session.ask`): what the lamp falls on. */
export type PoolAsk =
  /** Waiting tickets that could hang now: their kit has landed and their pans fit. */
  | { readonly kind: 'admit'; readonly candidates: readonly number[] }
  /** `need` cached pans must go so that the target has room. `candidates` are the cached pans, in the rotation's order. */
  | { readonly kind: 'evict'; readonly need: number; readonly candidates: readonly number[]; readonly for: 'admit' | 'prefetch'; readonly target: number }
  /** The ticket `stalled` cannot grow, and a ticket must be pulled. */
  | { readonly kind: 'preempt'; readonly candidates: readonly number[]; readonly stalled: number }
  /** Kits that waiting tickets need and that could land now. */
  | { readonly kind: 'prefetch'; readonly candidates: readonly number[] }

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type PoolStatus = 'future' | 'waiting' | 'running' | 'done'

/** One ticket's night so far. */
export interface PoolReqState {
  readonly status: PoolStatus
  /** The step the ticket joins the waiting line, or joined it. */
  readonly at: number
  /** Output tokens decoded so far. A pulled ticket keeps them, and opens with them when it hangs again. */
  readonly progress: number
  /** Tokens the cache served at the ticket's last hanging. */
  readonly hit: number
  /** Tokens the ticket has had to prep again, over every hanging. */
  readonly recomputed: number
  readonly admits: number
  readonly pulls: number
  /** The step the ticket was served. */
  readonly doneAt: number | null
}

/** A recipe kit that is in the pool: landing until `readyAt`, and ready from then. */
export interface PoolKitState {
  readonly adapter: number
  readonly readyAt: number
}

/** The counts of GAMES.md §8 ("Scoring and pass"): all of them tokens, tickets, steps or pans. */
export interface PoolCounts {
  /** Prompt tokens that the cache did not serve at a hanging, so that the line prepped them again. */
  readonly recomputedTokens: number
  /** Prompt tokens that the cache served: shared mise. */
  readonly hitTokens: number
  readonly completed: number
  readonly preemptions: number
  /** Steps in which a ticket waited for a slot-free line only because its kit had not landed. */
  readonly adapterStallSteps: number
  /** Cached pans that left the cache, dumped by the learner or taken by an allocation. */
  readonly evictions: number
}

/** What the score counts: the counts, and the price they add up to (GAMES.md §8: recomputed tokens + a stall weight × stall steps). */
export interface PoolScore extends PoolCounts {
  readonly cost: number
  /** Tickets not served when the night ended. */
  readonly unserved: number
  /** The learner's decisions: every action but the prediction. */
  readonly turns: number
}

/** An eviction in the middle of a hanging or a kit's landing. */
export type PoolPending = { readonly kind: 'admit'; readonly req: number } | { readonly kind: 'load'; readonly adapter: number }

/** Where in a step the engine is. A step is: tickets arrive, the line decodes, the served ones go, then hanging and kits. */
export type PoolPhase = 'arrive' | 'decode' | 'settle' | 'admit' | 'prefetch' | 'tick'

/**
 * The whole night so far, as plain data. The level is held whole, because a `Session` method gets only the state. `kv` is the sim's
 * snapshot of the pool after the last operation, so the view and the mirror read the manager's own pages.
 */
export interface PoolState {
  readonly level: PoolLevel
  /** The actions that led here: the log, which also rebuilds the manager of a state that was not made by this session. */
  readonly history: readonly PoolAction[]
  readonly step: number
  readonly phase: PoolPhase
  readonly reqs: readonly PoolReqState[]
  /** Waiting tickets, in the order they will be offered: a pulled ticket goes to the front. */
  readonly waiting: readonly number[]
  /** Tickets on the line, in the order they were hung. */
  readonly running: readonly number[]
  /** Tickets that have decoded in this step already. */
  readonly fed: readonly number[]
  readonly kits: readonly PoolKitState[]
  readonly pending: PoolPending | null
  readonly counts: PoolCounts
  readonly turns: number
  readonly ask: PoolAsk | null
  readonly predicted: number | null
  /** The pans that the last action dumped, shown struck for a moment. */
  readonly dumped: readonly number[]
  /** A ticket was pulled in this step, so nothing hangs until the next. */
  readonly pulledNow: boolean
  readonly done: boolean
  readonly kv: KvState
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* View                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A pan's form (src/design `MemoryState`): free, held by one ticket, cached, shared mise, a recipe kit's, or just dumped. */
export type PanState = 'free' | 'used' | 'cached' | 'shared' | 'adapter' | 'evicted'

export interface PanView {
  readonly id: number
  readonly state: PanState
  /** The station that keeps it: the index into `stations`. Null for a bare pan and for a kit's. */
  readonly station: number | null
  readonly kit: number | null
  readonly refs: number
  readonly hash: number | null
  /** What is written on its tape: `C·5` is table C's block 5, `S1·2` the standing order's, `kit 1` a kit's. Null for a bare pan. */
  readonly tape: string | null
  /** Tickets that hold it, and waiting tickets whose hit starts from it. */
  readonly holders: readonly number[]
  readonly spokenFor: readonly number[]
  /** Its place in the rotation, 0 for the next to go, or null when it is held. */
  readonly rank: number | null
  /** The block of its order that it holds (the number on its tape), counted from the head, 0; null for a bare pan and a kit's. */
  readonly block: number | null
}

export interface StationView {
  readonly index: number
  readonly id: string
  readonly kind: 'full' | 'sliding' | 'state'
  readonly layers: number
  readonly padLayers: number
  readonly blockTokens: number
  /** A sliding station's hold window, in tokens. */
  readonly window: number | null
  /** A state station's pans for each ticket. */
  readonly statePages: number | null
}

/** A segment of a ticket's ruler: a block of tokens at one station. */
export type SegState = 'held' | 'let-go' | 'hit' | 'fresh'

export interface TicketView {
  readonly id: number
  /** The number the printer prints, two digits: ticket 0 is No. 01. */
  readonly no: string
  readonly table: number
  readonly letter: string
  readonly turn: number
  readonly turns: number
  readonly status: PoolStatus
  /** Tokens of the ticket's prompt now, and of everything it holds once it has decoded. */
  readonly tokens: number
  readonly out: number
  readonly progress: number
  readonly adapter: number | null
  /** A waiting ticket: the tokens the cache would serve if it hung now. A hung or served one: the tokens it was served. */
  readonly hit: number
  /** A waiting ticket: the pans it would need that nothing supplies. */
  readonly fresh: number | null
  /** A waiting ticket: whether it fits, and whether its kit has landed. */
  readonly fits: boolean | null
  readonly kitReady: boolean | null
  /** One row for each station: the ruler. Empty for a served or a future ticket. */
  readonly ruler: readonly (readonly SegState[])[]
  readonly admits: number
  readonly pulls: number
  readonly recomputed: number
  /** A future ticket: the step it arrives, when it is known. */
  readonly arrives: number | null
}

export interface KitView {
  readonly id: number
  readonly rank: number
  readonly pages: number
  readonly state: 'absent' | 'loading' | 'ready'
  readonly readyAt: number | null
  /** Pans the kit holds. */
  readonly pageIds: readonly number[]
  /** Hung tickets that run on it, and waiting tickets that need it. */
  readonly users: readonly number[]
  readonly wanted: readonly number[]
  /** Steps a landing takes. */
  readonly loadSteps: number
}

/** What the open ask shows beside each of its candidates. */
export type AskView =
  | {
      readonly kind: 'admit'
      readonly candidates: readonly number[]
    }
  | {
      readonly kind: 'evict'
      readonly need: number
      readonly for: 'admit' | 'prefetch'
      readonly target: number
      readonly candidates: readonly number[]
      /** Per candidate, in order: the tokens that waiting tickets would lose from their hits if the pan went, and which tickets those are. */
      readonly price: readonly number[]
      readonly spoken: readonly (readonly number[])[]
      /** The same for the next ticket of a table that is still seated, which has not arrived yet. */
      readonly soon: readonly number[]
      readonly seated: readonly (readonly number[])[]
    }
  | { readonly kind: 'preempt'; readonly candidates: readonly number[]; readonly stalled: number }
  | { readonly kind: 'prefetch'; readonly candidates: readonly number[] }

export interface PoolView {
  readonly level: PoolLevelId
  readonly title: string
  readonly prompt: string
  readonly graded: boolean
  /** The world is synthetic, and every screen says so (D-048). */
  readonly synthetic: true
  readonly step: number
  readonly cols: number
  readonly pans: readonly PanView[]
  readonly stations: readonly StationView[]
  /** The rotation: page ids in dumping order, the next on the left. Bare pans lead, cached pans follow. */
  readonly rotation: readonly number[]
  readonly tickets: readonly TicketView[]
  readonly waiting: readonly number[]
  readonly running: readonly number[]
  readonly kits: readonly KitView[]
  readonly ask: AskView | null
  readonly counts: PoolScore
  /** The prediction asked, and the learner's answer once committed. */
  readonly predict: PoolPredict & { readonly committed: number | null; readonly open: boolean }
  /** Pans in each drawn form. A pan that a waiting ticket starts from is drawn as shared mise whether a ticket holds it or not. */
  readonly tally: Readonly<Record<PanState, number>>
  /** Pans by what is in them, from the sim's own pages, so the four add up to the pool: bare, held by a ticket, cached (nobody holds it), and a kit's. */
  readonly stock: { readonly bare: number; readonly held: number; readonly cached: number; readonly kits: number }
  readonly cap: number
  readonly chunk: number
  readonly blockTokens: number
  /** The pass mark [estimated]: the score the graded levels need. */
  readonly bar: number
  /** The pans the last action dumped. */
  readonly dumped: readonly number[]
  readonly done: boolean
  /** The night ended with tickets unserved. */
  readonly incomplete: boolean
}

