/**
 * Tensor views' vocabulary (`shape-shifter`, GAMES.md §4): the levels, the actions a learner takes, the state that follows and the view
 * that the 2D diagram and the DOM mirror both draw.
 *
 * Everything here is data. The session is pure (D-017): the same seed and the same actions give the same state in Bun and in every
 * browser, and a state has a canonical JSON form, so it can be hashed and replayed. The state holds no display string: a moment is its id
 * and the figures its line is made from, and `copy.ts` makes the line. Every operation is `applyOp` of `packages/sim/tensor`, and every
 * element is named by the address it had in the start's buffer.
 */
import type { Seed } from '@es/sim/core'
import type { Goal, ShiftOp, TView } from '@es/sim/tensor'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** GAMES.md §4.3, in the order they teach. `fewest` and `grid` are graded; `fewest` is the Prove level. */
export const SHIFT_LEVEL_IDS = ['views', 'stride-zero', 'three-d', 'fewest', 'grid'] as const
export type ShiftLevelId = (typeof SHIFT_LEVEL_IDS)[number]

/** An operation's name, as a level's list of offered operations and an action spell it. */
export type OpKind = ShiftOp['op']

/**
 * What a target is for. `script` is a practice level's own target. The two kinds of `fewest` are the two ideas the level tests (GAMES.md
 * §4.4): a copy that must come before a `view`, and a layout that views alone reach.
 */
export type TargetKind = 'script' | 'copy-before-view' | 'no-copy'

/** One target of a layout level: where it starts, what it must reach, and the reference's plan. */
export interface LayoutTask {
  readonly kind: TargetKind
  readonly start: TView
  readonly goal: Goal
  /** The reference's plan, in the operations the level offers. */
  readonly ghost: readonly ShiftOp[]
  /** Copies the reference makes: the number a learner's copies must equal. */
  readonly copies: number
  /** Elements the reference's copies move. */
  readonly moved: number
  /** The opening guess's answer, in the unit the level's copy names. */
  readonly answer: number
}

/** One tensor of the `grid` level and what the reference does on it. */
export interface GridTask {
  readonly shape: readonly number[]
  /** The reference's launch: its BLOCK and its grid. */
  readonly block: readonly number[]
  readonly grid: readonly number[]
  readonly programs: number
  readonly lanes: number
  /** The least masked count within the cap: the number the learner's masked lanes must equal. */
  readonly least: number
  /** What one program masks (BLOCK the size, rounded up to a power of two), and what the squarest tile masks. */
  readonly onePass: number
  readonly square: number
  readonly answer: number
}

interface LevelBase {
  readonly id: ShiftLevelId
  readonly seed: Seed
  /** Graded: drawn fresh at the start, no undo. The practice seed of `grid` is the one level that is not. */
  readonly graded: boolean
  /** Targets that must pass for the level to pass: every one. */
  readonly needed: number
}

export interface LayoutLevel extends LevelBase {
  readonly kind: 'layout'
  readonly offered: readonly OpKind[]
  readonly tasks: readonly LayoutTask[]
  /** A `view` the strides cannot express fails the target (`fewest`), or is only refused (practice). */
  readonly failOnRefusal: boolean
  /** Attempts a target allows, refused ones included; null for no limit. A target out of attempts has failed. */
  readonly attemptCap: number | null
}

export interface GridLevel extends LevelBase {
  readonly kind: 'grid'
  readonly tasks: readonly GridTask[]
  /** Programs a launch may have at most [estimated]. */
  readonly cap: number
}

export type ShiftLevel = LayoutLevel | GridLevel

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actions                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What a learner does (GAMES.md §4.8): commit the opening guess before the first move of a target, apply one operation, set BLOCK or the
 * grid on one dimension, and launch.
 */
export type ShiftAction =
  | { readonly t: 'commit'; readonly prediction: number }
  | { readonly t: 'op'; readonly op: ShiftOp }
  | { readonly t: 'block'; readonly dim: number; readonly value: number }
  | { readonly t: 'grid'; readonly dim: number; readonly value: number }
  | { readonly t: 'launch' }

/** What the next action is for. */
export type ShiftAsk = { readonly kind: 'commit'; readonly task: number } | { readonly kind: 'op'; readonly task: number } | { readonly kind: 'launch'; readonly task: number }

/* ------------------------------------------------------------------------------------------------------------------ */
/* State                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Refusal {
  /** The place in the log of the action that was refused. */
  readonly turn: number
  readonly op: ShiftOp
}

/** One target as it is played: the tensor now, and what each address of its buffer holds. */
export interface LayoutRun {
  readonly kind: 'layout'
  readonly view: TView
  /** What each address of the buffer holds: the address the element had in the start's buffer. */
  readonly buffer: readonly number[]
  /** The tensor and buffer before the last operation, when that operation copied: the old buffer stays one turn. */
  readonly old: { readonly view: TView; readonly buffer: readonly number[] } | null
  readonly ops: readonly ShiftOp[]
  /** The place in the log of each operation that was applied, one for each of `ops`. */
  readonly placed: readonly number[]
  /** Operations tried, refused ones included. */
  readonly turns: number
  readonly copies: number
  readonly moved: number
  readonly refused: readonly Refusal[]
  readonly status: 'open' | 'reached' | 'failed'
  readonly why: 'refused' | 'attempts' | null
  readonly guess: number | null
}

export type GridRefusal = { readonly turn: number; readonly kind: 'not-pow2'; readonly x: number } | { readonly turn: number; readonly kind: 'too-many'; readonly n: number }

export interface GridLaunch {
  readonly block: readonly number[]
  readonly grid: readonly number[]
  readonly programs: number
  readonly lanes: number
  readonly masked: number
  readonly covered: number
  readonly exact: boolean
}

export interface GridRun {
  readonly kind: 'grid'
  readonly block: readonly number[]
  readonly grid: readonly number[]
  /** Settings changed and launches tried. */
  readonly turns: number
  readonly refusals: readonly GridRefusal[]
  readonly launch: GridLaunch | null
  readonly guess: number | null
}

export type ShiftRun = LayoutRun | GridRun

/** A named moment (GAMES.md §4.6): its id, where it happened, and the figures its line is made from. The line is `copy.ts`'s. */
export type Moment = { readonly task: number; readonly turn: number } & (
  | { readonly id: 'view-free'; readonly op: OpKind; readonly before: readonly number[]; readonly after: readonly number[] }
  | { readonly id: 'view-refused'; readonly shape: readonly number[] }
  | { readonly id: 'copy'; readonly op: OpKind; readonly n: number }
  | { readonly id: 'stride-zero'; readonly rows: number; readonly m: number }
  | { readonly id: 'wrong-order'; readonly k: number; readonly n: number }
  | { readonly id: 'masked'; readonly index: readonly number[]; readonly lanes: number; readonly masked: number }
  | { readonly id: 'uncovered'; readonly n: number; readonly dim: number; readonly size: number; readonly block: number; readonly g: number }
  | { readonly id: 'not-pow2'; readonly x: number }
  | { readonly id: 'too-many'; readonly cap: number; readonly n: number }
)
export type MomentId = Moment['id']

export interface ShiftState {
  readonly level: ShiftLevel
  /** The target in play: the first that is not yet over. */
  readonly at: number
  readonly runs: readonly ShiftRun[]
  /** The first time each moment happened in the level. */
  readonly moments: readonly Moment[]
  readonly history: readonly ShiftAction[]
  readonly done: boolean
}

/** The counts of a run, on the model's clock, summed over the targets (GAMES.md §4.7). */
export interface ShiftScore {
  readonly copies: number
  readonly moved: number
  readonly operations: number
  readonly refused: number
  readonly programs: number
  readonly lanes: number
  readonly masked: number
  readonly covered: number
  /** Targets passed, of `of`. */
  readonly passed: number
  readonly of: number
}
