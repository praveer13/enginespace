/**
 * The game framework's vocabulary (ARCHITECTURE §6.3 and §6.8, GAMES.md §2.5, D-018): the session contract that every game's
 * rules follow, the action log that records a run, the registry's record of a game, and the keys a game binds.
 *
 * This file is types and a few constants, so importing it costs a bundle nothing. The package is pure (D-017): no DOM, no clock
 * and no entropy, so a session gives the same states in Bun, in every browser and in the grader's replay, and the views only
 * ever read what a session says (I4).
 */
import type { Seed } from '@es/sim/core'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Modes and the play sequence                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A level is played in practice, on its pinned seed with undo and no credit, or graded, on a seed drawn at start with no undo
 * (ARCHITECTURE §6.3). Nothing locks: a learner can always practise. packages/schema's `GAME_MODES` is the same pair, and a test
 * keeps them equal, because this package may import only the types of that one.
 */
export const GAME_MODES = ['practice', 'graded'] as const
export type GameMode = (typeof GAME_MODES)[number]

/** A game's page, in order: kernelspace's play sequence (ARCHITECTURE §6.3). */
export const PHASES = ['play', 'debrief', 'compose', 'production', 'build'] as const
export type Phase = (typeof PHASES)[number]

/** What each stage is called on screen. The engine's term leads (GAMES.md §2.6, rule 2). */
export const PHASE_NAMES: Readonly<Record<Phase, string>> = {
  play: 'Play',
  debrief: 'Debrief',
  compose: 'Compose',
  production: 'In production',
  build: 'Build this',
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Whatever a learner does, as data (GAMES.md §3: `{ t: 'admit', req: 3 }`). `t` names the kind and the other fields are the
 * action's own. An action must have a canonical JSON form, which is what the action log stores and hashes: no `undefined`
 * field (leave it out), no `NaN`, and no class instance.
 */
export interface GameAction {
  readonly t: string
}

/** The result of a finished run: `score` in [0, 1] and whether the level's bar is met. The bars are ASSESSMENT.md's. */
export interface Grade {
  readonly score: number
  readonly ok: boolean
}

/** What a debrief names: the learner's action that mattered most (its place in the log), or the lever worth the most. */
export type DebriefNames = { readonly turn: number } | { readonly lever: string } | null

export interface Debrief {
  /** The sentence the debrief opens with. */
  readonly sentence: string
  readonly names: DebriefNames
}

/**
 * The shape every game follows (GAMES.md §2.5). A session is pure: each method is a function of its arguments, and a state is
 * plain data (it has a canonical JSON form), so it can be hashed, copied across a worker and replayed.
 *
 * The 3D scene, the 2D view and the DOM mirror all render `view(state)` and dispatch the same actions (D-018). The hidden
 * reference, `ghost`, plays the same seed in lockstep with the learner and is read only by the debrief and the grade (A§6.3).
 * Methods are declared as methods so that a session over concrete types is assignable to `AnySession`.
 */
export interface Session<Level, State, Action extends GameAction, View, Score, Ask = unknown> {
  /** The world for `id` on `seed`. Throws for a level the game does not have. */
  level(id: string, seed: Seed): Level
  /** Whether `seed` makes a fair question at this level: the naive strategy loses, the reference passes (GAMES.md §2.1). */
  inBand(id: string, seed: Seed): boolean
  init(level: Level): State
  /** The pending decision, or null when the next step applies by itself. */
  ask(state: State): Ask | null
  /** The next state. Throws on an illegal action, unless the game allows unsafe moves and scores them (ASSESSMENT §4.3). */
  reduce(state: State, action: Action): State
  /** What the scene, the 2D view and the mirror all render. */
  view(state: State): View
  done(state: State): boolean
  /** The counts on the model's clock (GAMES.md §1, rule 3). Never the learner's speed. */
  score(state: State): Score
  /** The reference run to the end, from the level's start. Read only by the debrief and the grade. */
  ghost(level: Level): State
  /** The graded result of a finished run: for counts where more is better, `min(1, mine ÷ ghost)` (GAMES.md §2.1). */
  grade(mine: State, ghost: State): Grade
  debrief(mine: State, ghost: State): Debrief
}

/** A session with its types erased, for code that handles any game: the registry, the replay grader and the shell. */
export type AnySession = Session<unknown, unknown, GameAction, unknown, unknown, unknown>

/* ------------------------------------------------------------------------------------------------------------------ */
/* The action log                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A run, as it is recorded: the seed and level it began from and every action in order (ARCHITECTURE §6.3). The log is the
 * record. A score is a cache of replaying it, so nothing a store holds beside the log can change a grade (ASSESSMENT §4.3).
 */
export interface RunRecord {
  readonly game: string
  readonly level: string
  readonly seed: Seed
  readonly actions: readonly GameAction[]
  /** The content revision the run was played against. An older one shows "re-check" and loses nothing (A§4.2). */
  readonly rev?: string
}

/** A run as the ledger returns it: the log, and the result that was stored beside it, which grading never reads. */
export interface StoredRun extends RunRecord {
  readonly score?: number
  readonly ok?: boolean
}

/** A finished run with what the replay made of it. `hash` is `stateHash` of the final state, for the cross-runtime check. */
export interface RunResult {
  readonly record: RunRecord
  readonly grade: Grade
  readonly debrief: Debrief
  readonly hash: string
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Keys                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A key a game binds (ARCHITECTURE §6.8). Keys are matched by `event.code` and bound on the game's container, and a key is
 * ignored where the focused control uses it natively. Ctrl, Alt and Meta never match, so no browser or system shortcut is taken.
 */
export interface KeyBinding {
  /** The command the key stands for, which the game receives: a slug such as `view`, or a game's own such as `overlap`. */
  readonly id: string
  /** `KeyboardEvent.code`, the physical key, so that a keyboard layout does not move a game's keys. */
  readonly code: string
  /** Shift must be held. By default it must not be. */
  readonly shift?: boolean
  /** The character the key types, as a second way to match where the physical key differs by layout (the help key's `?`). */
  readonly key?: string
  /** The key cap the help dialog prints: `Space`, `.`, `C`. */
  readonly label: string
  /** What the key does, in a few words. */
  readonly description: string
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The registry's record of a game                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One level of a game, as the registry lists it. */
export interface LevelEntry {
  readonly id: string
  /** The level's name on screen. */
  readonly title: string
  /** The level can be graded, on a fresh seed with no undo. Every level can be practised. */
  readonly graded: boolean
  /** The pinned practice seed, which `inBand` accepts (GAMES.md §2.1). */
  readonly practiceSeed: Seed
  /** The stages `[` and `]` move between, such as `comb`, `sizes` and `modes` (GAMES.md §3.2). */
  readonly stages?: readonly string[]
}

/**
 * What the registry records for a game (ARCHITECTURE §6.3), and what `verify:games` checks. The display name leads over the
 * subtitle, the engine concept, wherever the game is named (D-049); the game's id, its levels' ids and its actions stay the
 * engine's, because they sit in routes, refs and action logs.
 */
export interface GameEntry {
  /** The game's id: `loop`. It sits in `/play/<id>`, in `play:<game>/<level>` refs and in the folder names. */
  readonly id: string
  /** The modules that use the game, the first being its home: `['tr2', 'tr6']`. */
  readonly modules: readonly string[]
  /** The display name (D-049): `Service`. */
  readonly title: string
  /** The engine concept the display name stands for (D-049): `the step loop`. */
  readonly subtitle: string
  /** Whether the game has a 3D scene (`Scene3D.tsx`); its 2D view is a first-class path either way (A§6.2). */
  readonly has3d: boolean
  /** The knowledge components the game exercises (A§4.5). */
  readonly kcs: readonly string[]
  /** The game's own keys. The keys common to every game are added by `keymapOf`. */
  readonly keys: readonly KeyBinding[]
  readonly levels: readonly LevelEntry[]
  /** The id of the world's notional-machine card, `content/cards/<card>.md` (A§5.9). */
  readonly card: string
  /** The claims the game shows, as ids in `content/claims/*.yaml` (A§4.4). */
  readonly claims: readonly string[]
  /** Loads the game's session. The pure rules load with the game, never with the registry. */
  readonly session: () => Promise<AnySession>
}

/** What the shell shows of a game and binds for it. */
export type GameFace = Pick<GameEntry, 'id' | 'title' | 'subtitle' | 'has3d' | 'keys'>
