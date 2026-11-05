/**
 * The full service's vocabulary (`loop`, TR2's levels and TR6's mask lane; GAMES.md §3.2, §2.6 "TR2's levels in the kitchen"): the
 * levels, their stages, the levers a stage puts on the panel, the actions a learner takes, the state that follows and the view that
 * the 2D view, the 3D scene and the mirror draw.
 *
 * The front page's levels play the step loop by hand on synthetic ticks (../types.ts). These levels are configuration levels over the
 * sim's `runStepLoop` v1 in integer µs on the model's clock (D-048): the learner commits a prediction, sets the levers a real engine
 * has, and rings the bell through a night the sim serves with them, fire by fire. Each stage opens on its naive configuration, and its
 * bar is the house's night, the reference, served with the intended one (GAMES.md §2.1).
 *
 * Everything here is data, so a state has a canonical JSON form and a run is replayed from its action log (A§6.3). Ids stay the
 * engine's (D-049): `async`, `graphs`, `mrv2`, `mask`, and levers named as vLLM names them.
 */
import type { Permille, Seed, Us } from '@es/sim/core'
import type { BackendSupport, GraphModeId, Span } from '@es/sim/steploop'
import type { FireView, KitchenView, LoopCounters } from '../types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels and stages                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * TR2's levels that W1-T13 builds, and TR6's mask lane. `keys` waits for the owner's dispatcher tables (DISPATCH_TABLES, Q-10) and
 * `close` is W1-T14's, so neither is a level of the session yet.
 */
export type FullLevelId = 'async' | 'graphs' | 'mrv2' | 'mask'

/** A level's stages, which `[` and `]` move between: a cost card each for `async` and `mrv2`, and the three of `graphs`. */
export type StageId = '70b' | 'small' | 'comb' | 'sizes' | 'modes' | 'mask'

/** The cost cards (GAMES.md §3.2): "70B on H100", kernelspace's S5 fit, and the synthetic small-model napkin. */
export type CardId = '70b' | 'small'

/** The levers a stage can put on the panel, by vLLM's names for them (GAMES.md §3.2, "Compose and In production"). */
export type LeverName = 'async' | 'graphMode' | 'capture' | 'runner' | 'maskOverlap'

/** What a night is served with. Every stage carries all of them; a stage's panel shows its own. */
export interface Levers {
  /** Async scheduling: the next call is written during this fire (`--no-async-scheduling` turns it off). */
  readonly async: boolean
  /** `compilation_config.cudagraph_mode` as requested. The backend may downgrade it (`resolveGraphMode`). */
  readonly graphMode: GraphModeId
  /** `cudagraph_capture_sizes`, ascending: the molds on the rack. */
  readonly captureSizes: readonly number[]
  /** The model runner: MRV2, the default (`VLLM_USE_V2_MODEL_RUNNER`), or the legacy V1. */
  readonly runner: 'mrv2' | 'v1'
  /** Whether the engine thread writes the structured-output bitmask, the allergy card, during the fire or after it. */
  readonly maskOverlap: boolean
}

/** A prediction to commit before the stage's first night (GAMES.md §3, "Predict"): a number in a unit, or one of a few choices. */
export type Prediction =
  | { readonly kind: 'number'; readonly question: string; readonly unit: 'µs' | 'calls' | 'fires'; readonly tolerancePermille: Permille }
  | { readonly kind: 'choice'; readonly question: string; readonly options: readonly string[] }

/** The histogram world of `graphs` · `sizes`: fires of decode rows, the molds the rack can hold, and the ladder to pick them from. */
export interface SizesWorld {
  /** The batch of each fire of the night, in order, drawn from the seed's histogram. */
  readonly batches: readonly number[]
  /** The candidate sizes, ascending: every size from 1 to the rail's clips. */
  readonly ladder: readonly number[]
  /** vLLM's default list for this engine (`vllmCaptureSizes`), and SGLang's decode buckets, cut to the rail: the two ladders shown. */
  readonly vllmLadder: readonly number[]
  readonly sglangLadder: readonly number[]
  /** How many molds the rack holds: the routines the line has time to drill before service [estimated]. */
  readonly molds: number
  /** Context each row reads, in tokens: the night's decodes are priced at it [estimated]. */
  readonly context: number
}

/** A stage of a level on its seed: its world and its answers. */
export interface StageWorld {
  readonly id: StageId
  readonly title: string
  /** What the stage asks, in the kitchen's words with the engine's term beside them. */
  readonly prompt: string
  readonly card: CardId
  readonly levers: readonly LeverName[]
  /** The configuration the stage opens on: its naive one (the naive configuration fails the bar on every in-band seed). */
  readonly start: Levers
  /** The house's configuration, the reference: the intended one, whose night is the bar. */
  readonly house: Levers
  /** The naive configuration: the one a learner who ignores the stage's lever serves with. The band makes it fail where `naiveFails`. */
  readonly naive: Levers
  /** Whether the stage's band requires the naive night to miss the bar (every stage but `mrv2` · `70b`, where the runners tie). */
  readonly naiveFails: boolean
  /** What a night is judged by: the clock of the whole night, or (sizes) the capture cost of padding and eager calls. */
  readonly metric: 'clock' | 'capture'
  /** The bar: a night passes when its metric is at most the house's times (1000 + slack) / 1000 [estimated]. */
  readonly slackPermille: Permille
  readonly prediction: Prediction
  /** The prediction's answer, from the model on this seed: a number, or the index of the right choice. */
  readonly answer: number
  /** Clips on the rail (`max_num_seqs`). */
  readonly slots: number
  /** `max_num_batched_tokens`: the step's token budget, the card's server default (claims vllm.batch-defaults.*). */
  readonly budget: number
  /** The workload's seed: the tickets of the night. Null for the histogram world. */
  readonly workloadSeed: Seed | null
  /** Tickets in the night, how many courses each table asks for (uniform between the two), and the share that carry a grammar (an allergy card), out of 1,000. */
  readonly requests: number
  readonly outputs: readonly [number, number]
  readonly structuredPermille: Permille
  /**
   * What the reach-in can spare for the drilled routines, in bytes (`graphs` · `modes`), or null for no limit: graph memory is reserved
   * before the KV cache is sized, so routines past it leave tonight's mise no room [estimated]. A mode whose graphs need more does not serve.
   */
  readonly graphBudget: number | null
  /** The attention backend's graph support (`graphs` · `modes`): what a requested mode is downgraded against. */
  readonly support: BackendSupport
  /** What one bitmask row costs the engine thread, in µs (`mask`): the grammar's weight [estimated]. */
  readonly maskRowUs: Us
  readonly sizes: SizesWorld | null
  /** The house's night, measured: its metric, for the bar and the tape. */
  readonly houseMetric: number
}

export interface FullLevel {
  readonly id: FullLevelId
  readonly seed: Seed
  readonly title: string
  readonly prompt: string
  readonly stages: readonly StageWorld[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a learner does (GAMES.md §3, "Simulation API", with `stage` for `[` and `]`):
 *   commit   the current stage's prediction, once, before its first night;
 *   lever    flip or set a lever of the current stage, between fires: a night in progress is put aside, and the next ring serves anew;
 *   capture  set the molds on the rack (`cudagraph_capture_sizes`);
 *   run      ring the bell: the next fire (`step`), or the rest of the night (`decision`); a ring after a night has ended serves the
 *            next one;
 *   stage    go to another stage of the level.
 */
export type FullAction =
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'lever'; readonly name: 'async' | 'graphMode' | 'runner' | 'maskOverlap'; readonly value: boolean | string }
  | { readonly t: 'capture'; readonly sizes: readonly number[] }
  | { readonly t: 'run'; readonly until: 'step' | 'decision' }
  | { readonly t: 'stage'; readonly to: string }

/** The pending decision: the stage's prediction, or the levers before a night. Null while a night is being served. */
export type FullAsk = { readonly kind: 'predict'; readonly stage: StageId } | { readonly kind: 'serve'; readonly stage: StageId }

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A night served to its end: what it was served with, its metric, and whether it met the bar. */
export interface Served {
  readonly levers: Levers
  readonly metric: number
  readonly ok: boolean
}

export interface StageState {
  readonly levers: Levers
  readonly prediction: number | null
  /** The night on the pass: the levers it is served with, and how many of its fires have been rung. Null before the first ring. */
  readonly night: { readonly levers: Levers; readonly fires: number } | null
  readonly served: readonly Served[]
}

export interface FullState {
  readonly level: FullLevel
  /** The stage the panel shows. */
  readonly at: number
  readonly stages: readonly StageState[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* View                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The comb on the expo's side (GAMES.md §2.6): the calls of the latest fire, a tooth for each layer as tall as its calls. */
export interface CombView {
  readonly layers: number
  /** Calls the fire's launch made: one replay for a full graph, the pieces and the attention launches for piecewise, every kernel eagerly. */
  readonly calls: number
  /** Calls per layer, the teeth's height: 0 when one word fires the drilled routine. */
  readonly perLayer: number
  readonly mode: 'FULL' | 'PIECEWISE' | 'NONE'
}

/** The mold rack beside the pass: a mold per captured size, ascending, and the mold the latest fire dropped into (or none). */
export interface RackView {
  readonly sizes: readonly number[]
  /** The index in `sizes` of the dispatcher's pick for the latest fire, or null when it ran eagerly. */
  readonly picked: number | null
}

/** The allergy card (TR6's mask lane): written during the fire or after it, and whether the line waited for it in the latest fire. */
export interface AllergyView {
  readonly overlap: boolean
  /** Bitmask µs the engine thread spent on the latest fire. */
  readonly fillUs: Us
  /** The line waited on the expo before the latest fire. */
  readonly late: boolean
}

/** A fire, as the full service draws it: the kitchen's fire, with the padding of its mold and what its launch cost. */
export interface FullFire extends FireView {
  /** Places of the fire's mold that hold nothing: padded tokens (GAMES.md §3, "an empty mold place, marked as padding"). */
  readonly padded: number
  /** The mold it dropped into, or null: no graph replayed. */
  readonly mold: number | null
  readonly mode: 'FULL' | 'PIECEWISE' | 'NONE'
  readonly calls: number
  /** The sizes stage prices each fire: padded µs and eager µs (GAMES.md §3.2's capture cost). Absent elsewhere. */
  readonly paddedUs?: Us
  readonly eagerUs?: Us
  readonly maskUs?: Us
}

/** The counters of a night so far, on the model's clock (GAMES.md §3, "Scoring and pass"). */
export interface FullCounters extends LoopCounters {
  /** The sizes stage's capture cost so far: padded µs + eager µs. */
  readonly captureUs: Us
  readonly maskUs: Us
  /** TPOT p50 of the tickets served so far, or null before any has two courses. */
  readonly tpotP50Us: Us | null
}

/** A stage as the panel shows it. */
export interface StageView {
  readonly id: StageId
  readonly title: string
  readonly prompt: string
  readonly card: CardId
  readonly levers: readonly LeverName[]
  readonly prediction: Prediction
  /** The learner's prediction, or null before it is committed. */
  readonly predicted: number | null
  /** The model's answer, shown once a night has been served. Null before. */
  readonly answer: number | null
  readonly served: readonly Served[]
  /** A night passed the bar, or three were served: the stage is over. */
  readonly closed: boolean
  readonly passed: boolean
  readonly houseMetric: number
  readonly metric: 'clock' | 'capture'
  readonly slackPermille: Permille
  /** The graph mode that runs for the levers set now, and why it is not the one asked for (the backend's downgrade), or why it does not serve. */
  readonly resolved: { readonly mode: GraphModeId | null; readonly changes: readonly string[] }
  /** The routines' memory for the levers set now against what the reach-in can spare, in bytes; null where the stage sets no limit. */
  readonly memory: { readonly bytes: number; readonly budget: number } | null
  readonly support: BackendSupport
  readonly sizes: SizesWorld | null
  readonly maskRowUs: Us
}

export interface FullView extends KitchenView {
  readonly level: FullLevelId
  readonly title: string
  readonly prompt: string
  /** µs on the model's clock, never ticks (D-048); `synthetic` says whether the stage's cost card is a world of the model's own. */
  readonly unit: 'µs'
  readonly synthetic: boolean
  /** The cost card's tag: `derived` for the S5 fit, `estimated` for the napkin; the host card's µs are always [estimated]. */
  readonly tag: 'derived' | 'estimated'
  readonly cardLabel: string
  readonly at: number
  readonly stage: StageView
  /** Every stage of the level, for the tabs, the debrief and Compose: its nights, its call, and the levers its panel holds. */
  readonly stages: readonly {
    readonly id: StageId
    readonly title: string
    readonly closed: boolean
    readonly passed: boolean
    readonly served: readonly Served[]
    readonly predicted: number | null
    readonly levers: Levers
  }[]
  readonly levers: Levers
  /** The night on the pass is served with these levers, and it has ended. */
  readonly nightLevers: Levers | null
  readonly nightOver: boolean
  /** Fires the night has in all, once it is known (when a night is on the pass). */
  readonly nightFires: number | null
  readonly fires: readonly FullFire[]
  readonly counters: FullCounters
  readonly comb: CombView | null
  readonly rack: RackView | null
  readonly allergy: AllergyView | null
  /** The line is cooking at the expo's clock. */
  readonly lineLit: boolean
  readonly canFire: boolean
  readonly done: boolean
  readonly deciding: boolean
  /** µs between the latest two fires' starts: the step clock the tape prints. */
  readonly stepUs: Us | null
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
}
