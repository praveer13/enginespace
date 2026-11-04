/**
 * The action log and the replay grader (ARCHITECTURE §6.3, ASSESSMENT §4.3, D-018).
 *
 * A run is its seed, its level and its actions in order. Playing one applies each action through the session's pure reducer and
 * appends it to the log, and grading one replays the log from the level's start, so the grade is a function of the log and of
 * nothing stored beside it. An edited score in IndexedDB changes nothing: `regrade` reads a stored run's `score` and `ok` only to
 * say whether they still match.
 *
 * Everything here is pure. The functions take the session as an argument and never look one up, so the registry (which can
 * load a session by game id) and the shell (which already holds it) share them.
 */
import { assertSeed, canonicalJson, hash32, splitmix32u } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import type { AnySession, Debrief, GameAction, Grade, RunRecord, RunResult, Session, StoredRun } from './types'

/** A session as these functions need it: the state and action types matter, and the rest is opaque. */
type Rules<State, Action extends GameAction> = Session<unknown, State, Action, unknown, unknown, unknown>

/** A run in progress: its record so far, the level it plays and the state the record leads to. */
export interface Run<State> {
  readonly record: RunRecord
  /** The level's world. Held so that the reference can be run from the same start. */
  readonly level: unknown
  readonly state: State
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Whether a value has the shape of an action: an object with a text `t`. The reducer judges the rest. */
function isAction(value: unknown): value is GameAction {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { t?: unknown }).t === 'string'
}

/** Begins a run: the level's world on the seed, and its first state with an empty log. Throws for a level or seed that does not exist. */
export function startRun<State, Action extends GameAction>(
  session: Rules<State, Action>,
  begin: { readonly game: string; readonly level: string; readonly seed: Seed; readonly rev?: string },
): Run<State> {
  assertSeed(begin.seed)
  const level = session.level(begin.level, begin.seed)
  const record: RunRecord = { game: begin.game, level: begin.level, seed: begin.seed, actions: [], ...(begin.rev === undefined ? {} : { rev: begin.rev }) }
  return { record, level, state: session.init(level) }
}

/**
 * Applies one action and appends it to the log. Throws when the run is over, when the action has no canonical JSON form (the log
 * stores and hashes it, so a `NaN` or an `undefined` field must never get in), and whenever the reducer throws. What the
 * reducer receives is the logged copy, so a replay sees exactly what the live run saw.
 */
export function applyAction<State, Action extends GameAction>(session: Rules<State, Action>, run: Run<State>, action: Action): Run<State> {
  if (session.done(run.state)) throw new RangeError('the run is over, so no action can follow')
  const logged = JSON.parse(canonicalJson(action)) as Action
  const state = session.reduce(run.state, logged)
  return { record: { ...run.record, actions: [...run.record.actions, logged] }, level: run.level, state }
}

/** The run without its last action: the log is replayed from the start, so an undone run is exactly a run that never made the move. */
export function undoAction<State, Action extends GameAction>(session: Rules<State, Action>, run: Run<State>): Run<State> {
  const { actions } = run.record
  if (actions.length === 0) return run
  const played = replay(session, { ...run.record, actions: actions.slice(0, -1) })
  if (!played.ok) throw new Error(`the log no longer replays (action ${played.at ?? 0}): ${played.reason}`)
  return { record: { ...run.record, actions: actions.slice(0, -1) }, level: played.level, state: played.state }
}

export type Replayed<State> =
  | { readonly ok: true; readonly level: unknown; readonly state: State; readonly finished: boolean }
  /** `at` is the place in the log of the action that failed, or null when the level itself could not be built. */
  | { readonly ok: false; readonly at: number | null; readonly reason: string }

/**
 * Replays a log from the level's start. It fails, naming the action, on one that is malformed, that comes after the run was
 * over, or that the reducer refuses: a log that edits itself into a different run is a log that does not replay. It never throws.
 */
export function replay<State, Action extends GameAction>(session: Rules<State, Action>, record: RunRecord): Replayed<State> {
  let level: unknown
  let state: State
  try {
    assertSeed(record.seed)
    level = session.level(record.level, record.seed)
    state = session.init(level)
  } catch (error) {
    return { ok: false, at: null, reason: `the level cannot be built: ${messageOf(error)}` }
  }
  for (let at = 0; at < record.actions.length; at++) {
    const action = record.actions[at]
    if (!isAction(action)) return { ok: false, at, reason: `action ${at} is not an action: it has no text \`t\`` }
    if (session.done(state)) return { ok: false, at, reason: `action ${at} comes after the run was over` }
    try {
      state = session.reduce(state, action as Action)
    } catch (error) {
      return { ok: false, at, reason: `action ${at} (${action.t}) is illegal: ${messageOf(error)}` }
    }
  }
  return { ok: true, level, state, finished: session.done(state) }
}

/** A grade that can go in the ledger: a score in [0, 1] and a yes or no. A session that grades anything else has a bug. */
function checked(grade: Grade): Grade {
  const { score, ok } = grade
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) throw new RangeError(`the grade's score must be in [0, 1], got ${String(score)}`)
  if (typeof ok !== 'boolean') throw new TypeError(`the grade's ok must be a boolean, got ${String(ok)}`)
  return { score, ok }
}

/** A finished run with the reference's final state beside it, which the debrief draws and nothing else reads. */
export interface Finished<State> extends RunResult {
  readonly ghost: State
}

/**
 * Runs the reference against a finished run and says what happened: the grade, the debrief, and `stateHash` of the final state.
 * Returns null while the run is not over. The shell calls it once, when the run ends, and the ghost is never read before then.
 */
export function finishRun<State, Action extends GameAction>(session: Rules<State, Action>, run: Run<State>): Finished<State> | null {
  if (!session.done(run.state)) return null
  const ghost = session.ghost(run.level)
  return { record: run.record, grade: checked(session.grade(run.state, ghost)), debrief: session.debrief(run.state, ghost), hash: stateHash(run.state), ghost }
}

export type Regrade =
  | {
      readonly valid: true
      readonly grade: Grade
      readonly debrief: Debrief
      readonly hash: string
      /** Whether the `score` and `ok` stored beside the log equal the replayed grade, or null when none were stored. */
      readonly storedMatches: boolean | null
    }
  | { readonly valid: false; readonly at: number | null; readonly reason: string }

/**
 * Grades a stored run by replaying its log. The grade is the replay's: the `score` and `ok` that come with the log are read only
 * for `storedMatches`, so a learner who edits them in IndexedDB changes what the page can flag and nothing it credits (A§6.3).
 * A log that does not replay, that stops before the run is over, or that a broken session cannot grade earns nothing and says why.
 */
export function regrade<State, Action extends GameAction>(session: Rules<State, Action>, stored: StoredRun): Regrade {
  const played = replay(session, stored)
  if (!played.ok) return { valid: false, at: played.at, reason: played.reason }
  if (!played.finished) return { valid: false, at: null, reason: 'the log stops before the run is over, so it has no grade' }
  try {
    const result = finishRun(session, { record: stored, level: played.level, state: played.state })
    if (result === null) return { valid: false, at: null, reason: 'the run is not over' }
    const hasStored = stored.score !== undefined || stored.ok !== undefined
    const storedMatches = hasStored ? stored.score === result.grade.score && stored.ok === result.grade.ok : null
    return { valid: true, grade: result.grade, debrief: result.debrief, hash: result.hash, storedMatches }
  } catch (error) {
    return { valid: false, at: null, reason: `the run could not be graded: ${messageOf(error)}` }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Seeds                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The most candidates `drawInBand` tries [estimated, kernelspace's figure]. A band must accept at least 20% of seeds
 * (`verify:games`), so 256 rejections in a row have a chance of 0.8^256, about 2e-25 [derived], and reaching the cap means the
 * band no longer fits the level.
 */
export const MAX_DRAWS = 256

/**
 * A seed in band for a level, from fresh entropy (GAMES.md §2.1, kernelspace's rule): the first candidate is the entropy itself,
 * and each rejection moves to the next output of its splitmix32 stream, so one entropy value always lands on the same seed. The
 * entropy is drawn outside this package, at grade time (I3), because this package reads none. Throws when `MAX_DRAWS` candidates
 * are all out of band.
 */
export function drawInBand(session: Pick<AnySession, 'inBand'>, levelId: string, entropy: Seed): Seed {
  assertSeed(entropy)
  const more = splitmix32u(entropy)
  let candidate = entropy
  for (let draws = 1; draws <= MAX_DRAWS; draws++) {
    if (session.inBand(levelId, candidate)) return candidate
    candidate = more()
  }
  throw new RangeError(`no in-band seed for level "${levelId}" in ${MAX_DRAWS} draws: the band no longer fits the level`)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The log as text, and a state as a hash                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The log as canonical JSON: the bytes a play event stores (compressed, if its writer wants) and hashes as `actionsSha256`
 * (ASSESSMENT §5.5). The same actions are always the same text.
 */
export function encodeActions(actions: readonly GameAction[]): string {
  return canonicalJson(actions)
}

/** The actions in a log's text, or null when it is not JSON, not a list of actions, or has no canonical form. Formatting is free. */
export function decodeActions(text: string): GameAction[] | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed) || !parsed.every(isAction)) return null
    canonicalJson(parsed)
    return parsed
  } catch {
    return null
  }
}

/** The ledger ref of a run's results, `play:<game>/<level>` (A§4.5). Ids are slugs, which the registry checks. */
export const playRef = (game: string, level: string): string => `play:${game}/${level}`

/** What a ledger `play` event carries that a replay needs, described without importing the ledger (A§2.3): a `PlayEvent` has all of it. */
export interface PlayEventLike {
  readonly ref: string
  readonly seed?: number
  readonly rev?: string
  /** The result stored beside the log. A replay never reads it for the grade. */
  readonly score?: number
  readonly ok?: boolean
  readonly data: { readonly actions: string }
}

/** `play:<game>/<level>`, each a slug: the form packages/schema's `refSchema` accepts for a play ref. */
const PLAY_REF = /^play:([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/

/**
 * The run a stored `play` event records, ready for `regrade`: its game and level from the ref, its seed and `rev` from the
 * envelope, its log from `data.actions`, and the stored `score` and `ok`, which `regrade` ignores. Null when the event cannot be
 * replayed: a ref that is not a play ref, a log that is not a list of actions, or no seed.
 */
export function storedRunOf(event: PlayEventLike): StoredRun | null {
  const ref = PLAY_REF.exec(event.ref)
  const actions = decodeActions(event.data.actions)
  if (ref === null || actions === null || event.seed === undefined) return null
  return {
    game: ref[1],
    level: ref[2],
    seed: event.seed,
    actions,
    ...(event.rev === undefined ? {} : { rev: event.rev }),
    ...(event.score === undefined ? {} : { score: event.score }),
    ...(event.ok === undefined ? {} : { ok: event.ok }),
  }
}

/**
 * A short digest of a state, for equality across runtimes: FNV-1a over its canonical JSON, as 8 hex digits. A state must have a
 * canonical form, which throws otherwise (a `Map`, a `NaN`), so a session cannot keep state that a worker or a hash cannot carry.
 * The nightly cross-browser check hashes the same text with SHA-256 for the strong version (A§5.10).
 */
export const stateHash = (state: unknown): string => hash32(canonicalJson(state)).toString(16).padStart(8, '0')
