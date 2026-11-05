/**
 * The Tasting's vocabulary (`verifier`, GAMES.md §10, §2.6): levels, states, actions, asks and the view that every rendering draws.
 *
 * The world. Six dishes (tokens) and a number of draft positions. At each position the chef's tasting p and the commis's plates q are
 * counts of plates out of sixty-four: GAMES.md §10 draws the exact levels' distributions on a grid of 1/64, which divides the sim's
 * total of 2^16, so every figure is a whole number of plates and every excess p − q is a whole number of grid units. The sim's own
 * `Dist` (weights out of 65,536) is these counts times 1,024, and `toDist` is the one way across.
 *
 * Everything in a state is plain data with a canonical JSON form (no bigint, no `undefined`), so a run can be hashed, copied across a
 * worker and replayed. Fractions that are exact reach a view as `Frac`, plain numbers in lowest terms.
 */
import type { Seed } from '@es/sim/core'
import type { Frac } from './ratio'

/** The six levels of GAMES.md §10, in the order a learner meets them. */
export const LEVEL_IDS = ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma'] as const
export type VerifierLevelId = (typeof LEVEL_IDS)[number]

/** The six dishes of the vocabulary (GAMES.md §10: "the six dishes"): their names are the game's, and a token's number rides beside the name. */
export const DISHES = ['soup', 'salad', 'fish', 'steak', 'pasta', 'tart'] as const
/** The vocabulary's size. */
export const VOCAB = DISHES.length

/** Plates in a full tasting: a probability of 1. Every p and q is a count of plates out of this many. */
export const PLATES = 64

/** The five known-wrong rules that a card in `mutants` can be (the single-position members of the sim's bestiary; the sixth, FLy, needs a run of two). */
export const MUTANT_IDS = ['accept-if-p-over-q', 'resample-from-p', 'resample-from-q', 'residual-off-by-one', 'boundary-inclusive'] as const
export type MutantId = (typeof MUTANT_IDS)[number]

/** The most rounds a run can draw: GAMES.md §10 runs 20,000 seeded draws [estimated]. */
export const DRAW_CAP = 20_000

/** The draft lengths on the `gamma` sweep, 1 to this many [estimated; kernelspace's push-luck sweeps eight]. */
export const GAMMA_MAX = 8

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Counts of plates, one for each dish, adding up to `PLATES`. */
export type Plates = readonly number[]

interface LevelBase {
  readonly seed: Seed
  readonly title: string
  readonly prompt: string
  /** The chef's tasting at each draft position, and the bonus position after the last (a run of γ drafts has γ + 1 of these). */
  readonly p: readonly Plates[]
  /** The commis's plates at each draft position (γ of them). Empty in `gamma`, whose positions are acceptance rates and not distributions. */
  readonly q: readonly Plates[]
}

export type VerifierLevel =
  | (LevelBase & { readonly id: 'overlap' })
  | (LevelBase & { readonly id: 'exact' })
  | (LevelBase & { readonly id: 'chain' })
  /** The copier names one dish `draft` and nothing else: its q is one-hot there. */
  | (LevelBase & { readonly id: 'greedy-ngram'; readonly draft: number })
  /** The five cards, in the order they are dealt. */
  | (LevelBase & { readonly id: 'mutants'; readonly cards: readonly MutantId[] })
  /** Acceptance at each position 1 to `GAMMA_MAX` in permille, and the cost of one drafted plate as a permille of one tasting. */
  | (LevelBase & { readonly id: 'gamma'; readonly alphas: readonly number[]; readonly cost: number })

/* ------------------------------------------------------------------------------------------------------------------ */
/* State and actions                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What has gone out of the kitchen over the rounds drawn so far (draws.ts). */
export interface Tally {
  readonly rounds: number
  /** Courses served in all: each round serves its accepted drafts and one more. */
  readonly tokens: number
  /** How many rounds got as far as each position (the last is the bonus position). */
  readonly reached: readonly number[]
  /** Drafts kept and sent back at each draft position. */
  readonly kept: readonly number[]
  readonly sentBack: readonly number[]
  /** For each position and dish, how many courses of that dish were served there. */
  readonly emitted: readonly (readonly number[])[]
}

/** The chi-square taste of one card on 20,000 rounds, as the lab's host runs it (sim/spec check.ts). */
export interface Taste {
  readonly stat: number
  readonly df: number
  readonly critical: number
  readonly rejected: boolean
  /** The first course of each round, by dish. */
  readonly counts: readonly number[]
}

/** A dish whose accept step keeps some other number of coins than min(p, q), as `acceptStepViolations` finds it. */
export interface Coin {
  readonly token: number
  readonly kept: number
  readonly should: number
  readonly of: number
}

export interface VerifierState {
  readonly level: VerifierLevel
  /** The learner's recipe: how heavily the chef re-plates from each dish, 0 to `PLATES`. */
  readonly weights: readonly number[]
  readonly committed: boolean
  /** `overlap`: plates kept out of sixty-four. `chain`: courses per round times 1,000, rounded. */
  readonly prediction: number | null
  /** `greedy-ngram`: whether the learner called the copier's plate kept at temperature 0. */
  readonly judged: boolean | null
  /** `gamma`: the draft length picked, or 0 before one is. */
  readonly gamma: number
  /** `mutants`: the bug the learner named for each card. */
  readonly labels: readonly (MutantId | null)[]
  readonly tasted: readonly (Taste | null)[]
  readonly coined: readonly (readonly Coin[] | null)[]
  /** `mutants`: the card under the lamp, which the picture shows. */
  readonly focus: number
  readonly tally: Tally
  readonly submitted: boolean
}

export type VerifierAction =
  /** Moves one dish's recipe weight by `delta`, staying within 0 to `PLATES`. */
  | { readonly t: 'sculpt'; readonly token: number; readonly delta: number }
  /** Starts the recipe from p or from q: the two wrong rules a learner can try on. */
  | { readonly t: 'preset'; readonly from: 'p' | 'q' }
  /** Draws `n` more rounds. */
  | { readonly t: 'draw'; readonly n: number }
  | { readonly t: 'gamma'; readonly k: number }
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'judge'; readonly kept: boolean }
  | { readonly t: 'taste'; readonly card: number }
  | { readonly t: 'coins'; readonly card: number }
  | { readonly t: 'label'; readonly card: number; readonly bug: MutantId | null }
  | { readonly t: 'submit' }

/** The pending decision (GAMES.md §2.5 `ask`), or null when the run is over. */
export type VerifierAsk =
  | { readonly kind: 'predict-plates' }
  | { readonly kind: 'predict-tokens' }
  | { readonly kind: 'judge' }
  | { readonly kind: 'recipe' }
  | { readonly kind: 'audit' }
  | { readonly kind: 'choose-gamma' }
  /** A prediction is committed: the learner may draw rounds to watch it, and then finishes. */
  | { readonly kind: 'finish' }

/** The counts of the rounds drawn (GAMES.md §1 rule 3: counts, never speed). */
export interface VerifierCounters {
  readonly rounds: number
  readonly kept: number
  readonly sentBack: number
  readonly tokens: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The view                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A drafted plate set down on a dish's commis stack at a seeded height: kept when it lands in the agreed plates, sent back in the extra. */
export interface MarkerView {
  readonly row: number
  readonly token: number
  /** The coin's height in plates, in [0, q): fractional. */
  readonly height: number
  readonly kept: boolean
  readonly round: number
}

export interface RowView {
  readonly index: number
  readonly kind: 'draft' | 'bonus'
  /** The row's name on its tape: "plate 1", "the chef's extra course". */
  readonly label: string
  readonly p: Plates
  /** The commis's plates, or null on the bonus row, where the chef plates alone. */
  readonly q: Plates | null
  /** min(p, q), (q − p)⁺ and (p − q)⁺: the agreed plates, the extra the commis plated, and the extra the chef would have. Null until the level lets them be printed. */
  readonly agreed: Plates | null
  readonly over: Plates | null
  readonly under: Plates | null
  /** Σ agreed ÷ 64: the share of the commis's plates the chef keeps. Null until the level lets it be printed. */
  readonly alpha: Frac | null
  readonly reached: number
  readonly kept: number
  readonly sentBack: number
  /** Courses served here by dish, over the rounds drawn. */
  readonly emitted: readonly number[]
  /** What goes out at this row in plates: exact (the learner's recipe, judged in rationals) or sampled (courses served ÷ rounds that got here). Null when nothing has. */
  readonly out: readonly number[] | null
  readonly outKind: 'exact' | 'sampled' | null
  readonly markers: readonly MarkerView[]
}

/** The distance of what the learner's recipe puts out from the chef's tasting, as an exact fraction. */
export interface Meter {
  readonly tv: Frac
  readonly exact: boolean
}

/** One card of `mutants`. */
export interface CardView {
  readonly index: number
  /** The rule in two lines, in the words of its code. */
  readonly accept: string
  readonly recover: string
  readonly label: MutantId | null
  readonly taste: Taste | null
  readonly coins: readonly Coin[] | null
}

/**
 * One draft length of the `gamma` sweep. The figures are decimals: their exact fractions have denominators like 1,000 to the eighth,
 * and the best length is decided in rationals before they are rounded for a page (gamma.ts).
 */
export interface SweepRowView {
  readonly gamma: number
  /** Courses a round serves on average. */
  readonly tokens: number
  /** The round's cost in tastings. */
  readonly cost: number
  readonly speedup: number
  readonly best: boolean
}

export interface GammaView {
  readonly pick: number
  readonly max: number
  /** Acceptance at each position, in permille. */
  readonly alphas: readonly number[]
  /** The cost of one drafted plate as a permille of a tasting. */
  readonly cost: number
  /** The pick's own round: courses, cost and speedup, as decimals. Null before one is picked. */
  readonly round: { readonly tokens: number; readonly cost: number; readonly speedup: number } | null
}

/** What the debrief prints, once a run is over. */
export interface FinalFacts {
  /** `overlap`: the exact count of plates kept. */
  readonly alphaPlates: number | null
  /** `exact` and `greedy-ngram`: each wrong rule's distance from the chef's tasting on this pair, and the dish furthest out under the learner's recipe. */
  readonly rules: readonly { readonly id: string; readonly tv: Frac }[] | null
  readonly worst: number | null
  /** `chain`: the exact courses per round, and what each naive count would have said. */
  readonly tokens: Frac | null
  readonly naive: { readonly first: number; readonly mean: number } | null
  /** `gamma`: the whole sweep. */
  readonly sweep: readonly SweepRowView[] | null
  /** `mutants`: the true bug of each card, and its distance from p. */
  readonly truth: readonly { readonly bug: MutantId; readonly tv: Frac }[] | null
  /** `greedy-ngram`: whether the copier's plate is kept at temperature 0, and the favourite. */
  readonly keptAtZero: boolean | null
  readonly favourite: number | null
}

export interface VerifierView {
  readonly level: VerifierLevelId
  readonly title: string
  readonly prompt: string
  readonly synthetic: true
  readonly dishes: readonly string[]
  readonly rows: readonly RowView[]
  /** The rows under the lamp: the present, where the next decision acts. */
  readonly present: { readonly from: number; readonly to: number } | null
  readonly ask: VerifierAsk | null
  readonly done: boolean
  /** The numbers that give an answer away (min, excess, alpha) may be printed. */
  readonly reveal: boolean
  readonly committed: boolean
  readonly prediction: number | null
  readonly judged: boolean | null
  readonly weights: readonly number[]
  readonly weightTotal: number
  readonly meter: Meter | null
  readonly counters: VerifierCounters
  readonly canDraw: boolean
  readonly drawsLeft: number
  readonly gamma: GammaView | null
  readonly cards: readonly CardView[] | null
  readonly focus: number
  readonly final: FinalFacts | null
}
