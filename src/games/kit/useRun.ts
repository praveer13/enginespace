import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { applyAction, finishRun, startRun, undoAction } from '@es/play'
import type { GameAction, GameMode, Run, RunResult, Session } from '@es/play'
import type { Seed } from '@es/sim/core'
import { useAnnouncer } from './announcer'
import type { Announcement } from './announcer'

/*
 * A run of one game (ARCHITECTURE §6.3, D-018): the session, started on a level and a seed, with every action applied through
 * the pure reducer and kept in the action log. GameShell is built on it, and a page that wants a different frame around the
 * views (the front page) builds on it too, so each game records its run one way and a replay of the log is the grade.
 *
 * The state lives in the component that calls this hook, above the views. A 2D view, a 3D scene and a mirror all draw
 * `view`, so a swap between them, or a lost WebGL context, cannot lose a lever. A new level or seed is a new run: give the
 * component a new `key`. The reference runs once, when the run is over, and nothing reads it before then.
 */

/** A finished run: the grade and the debrief, and the reference's view beside the learner's. */
export interface RunOutcome<View> extends RunResult {
  readonly ghostView: View
}

export interface UseRunOptions<Level, State, Action extends GameAction, View, Score, Ask> {
  /** The game's rules. Keep it one object (a module's export): the hook memoizes the run's view and result on it. */
  session: Session<Level, State, Action, View, Score, Ask>
  game: string
  level: string
  /** The practice seed, or a seed drawn at the start of a graded run. */
  seed: Seed
  mode: GameMode
  /** The content revision, which the run record carries (A§4.2). */
  rev?: string
  /**
   * Called when a run ends, with the record, grade and hash, for the ledger: once for each run, so a practice run that is undone
   * and finished again reports again. A front-page run passes nothing, because it records nothing (D-038).
   */
  onFinish?: (result: RunResult) => void
}

/** What a view, a control or a page gets from a run. */
export interface RunCore<Action extends GameAction, View, Score, Ask> {
  readonly game: string
  readonly level: string
  readonly mode: GameMode
  readonly seed: Seed
  /** `session.view(state)`: what the scene, the 2D view and the mirror all draw. */
  readonly view: View
  /** The counts so far. A graded level may choose not to show them. */
  readonly score: Score
  /** The pending decision, or null when the next step applies by itself. */
  readonly ask: Ask | null
  readonly done: boolean
  /** How many actions are in the log. */
  readonly turns: number
  /** Practice levels can undo; graded ones cannot (GAMES.md §2.3). */
  readonly canUndo: boolean
  /** Applies an action. One the session refuses leaves the run as it was and is announced. */
  dispatch(action: Action): void
  /** Takes the last action back, in a practice level. */
  undo(): void
  /** Queues a line for the live region. */
  announce(message: string): void
  /** Tells the announcer that auto-play is running, so it speaks at most once a second. */
  setAutoplay(on: boolean): void
}

export interface RunHandle<Action extends GameAction, View, Score, Ask> extends RunCore<Action, View, Score, Ask> {
  /** Null while the run is on, and the grade, debrief and reference once it is over. */
  readonly outcome: RunOutcome<View> | null
  /** The turn's line, for `LiveRegion`. */
  readonly announcement: Announcement | null
}

interface RunState<State> {
  run: Run<State>
  /** How many moves the session has refused, so that the hook can say so once for each. */
  rejected: number
}
type Move<Action> = { kind: 'apply'; action: Action } | { kind: 'undo' }

export function useRun<Level, State, Action extends GameAction, View, Score, Ask>(
  options: UseRunOptions<Level, State, Action, View, Score, Ask>,
): RunHandle<Action, View, Score, Ask> {
  const { session, game, level, seed, mode, rev } = options
  const { announcement, announcer } = useAnnouncer()

  // The run is a reducer over moves, so two actions in one event both land. A move the session refuses leaves the run as it was.
  const [{ run, rejected }, step] = useReducer(
    (state: RunState<State>, move: Move<Action>): RunState<State> => {
      try {
        return { ...state, run: move.kind === 'undo' ? undoAction(session, state.run) : applyAction(session, state.run, move.action) }
      } catch {
        return { ...state, rejected: state.rejected + 1 }
      }
    },
    null,
    (): RunState<State> => ({ run: startRun(session, { game, level, seed, rev }), rejected: 0 }),
  )

  const finished = useMemo(() => finishRun(session, run), [session, run])
  const outcome: RunOutcome<View> | null = useMemo(
    () => (finished === null ? null : { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: session.view(finished.ghost) }),
    [session, finished],
  )
  const view = useMemo(() => session.view(run.state), [session, run.state])
  const score = useMemo(() => session.score(run.state), [session, run.state])
  const ask = useMemo(() => session.ask(run.state), [session, run.state])
  const turns = run.record.actions.length

  const dispatch = useCallback((action: Action) => step({ kind: 'apply', action }), [])
  const undo = useCallback(() => {
    if (mode !== 'practice') return
    step({ kind: 'undo' })
    announcer.say('Undid the last move.')
  }, [mode, announcer])

  const refused = useRef(0)
  useEffect(() => {
    if (rejected <= refused.current) return
    refused.current = rejected
    announcer.say('That move is not allowed here.')
  }, [rejected, announcer])

  // The result goes to the ledger once for each run that ends.
  const onFinish = useRef(options.onFinish)
  useEffect(() => {
    onFinish.current = options.onFinish
  })
  const reported = useRef<RunResult['record'] | null>(null)
  useEffect(() => {
    if (outcome === null || reported.current === outcome.record) return
    reported.current = outcome.record
    onFinish.current?.({ record: outcome.record, grade: outcome.grade, debrief: outcome.debrief, hash: outcome.hash })
  }, [outcome])

  return {
    game,
    level,
    mode,
    seed,
    view,
    score,
    ask,
    done: outcome !== null,
    turns,
    canUndo: mode === 'practice' && turns > 0,
    dispatch,
    undo,
    announce: announcer.say,
    setAutoplay: announcer.setAutoplay,
    outcome,
    announcement,
  }
}
