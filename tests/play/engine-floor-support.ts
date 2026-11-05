/**
 * Shared by Back of House's tests (tests/play/engine-floor*.test.ts): a session walked by actions, the engine's own path laid up to a
 * stage, a run as the pieces of the page receive it, and every scenario of the lifecycle model.
 */
import { applyAction, startRun } from '@es/play'
import type { Run } from '@es/play'
import { buildLevel } from '@es/play/engine-floor/levels'
import { floorAsk, floorInit, floorReduce, floorScore, floorSession, floorView } from '@es/play/engine-floor/session'
import { boundariesOut } from '@es/play/engine-floor/facts'
import { referenceOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel, FloorState } from '@es/play/engine-floor/types'
import { entryOf, scenarios } from '@es/sim/lifecycle'
import type { Scenario } from '@es/sim/lifecycle'
import type { FloorRun } from '@/games/engine-floor/types'

/** The state after the actions, from the level's start. */
export function walk(level: FloorLevel, ...actions: FloorAction[]): FloorState {
  return actions.reduce(floorReduce, floorInit(level))
}

/** The truth the prediction asks for. */
export const truthOf = (sc: Scenario): number => boundariesOut(referenceOf(sc), entryOf(sc.engine))

/** The prediction written down, and the engine's own first `n` stages laid (not run). */
export function laidTo(level: FloorLevel, n: number, prediction = truthOf(level.scenario)): FloorState {
  return walk(level, { t: 'commit', prediction }, ...level.reference.slice(0, n).map((stage): FloorAction => ({ t: 'lay', stage })))
}

/** The engine's own first `n` stages laid and run once. */
export const ranTo = (level: FloorLevel, n: number): FloorState => floorReduce(laidTo(level, n), { t: 'run' })

/** A level on its practice seed. */
export const levelOf = (id: string, seed = 0): FloorLevel => buildLevel(id, seed)

/** A run through the shell's own reducer, so that its log can be replayed and graded. */
export function played(id: string, actions: readonly FloorAction[], seed = 0): Run<FloorState> {
  let run = startRun(floorSession, { game: 'engine-floor', level: id, seed })
  for (const action of actions) run = applyAction(floorSession, run, action)
  return run
}

/** Every action that completes a level by the engine's own path. */
export function houseActions(level: FloorLevel): FloorAction[] {
  return [{ t: 'commit', prediction: truthOf(level.scenario) }, ...level.reference.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }]
}

/** A run as the pieces of the page receive it (GameShell's `RunApi`), for a state, with every action a no-op: for server-rendering the page. */
export function fakeRun(state: FloorState, over: Partial<FloorRun> = {}): FloorRun {
  const view = floorView(state)
  return {
    game: 'engine-floor',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: floorScore(state),
    ask: floorAsk(state),
    done: view.done,
    turns: state.turns,
    canUndo: false,
    dispatch: () => undefined,
    undo: () => undefined,
    announce: () => undefined,
    setAutoplay: () => undefined,
    mirrorId: 'mirror',
    phase: 'play',
    restart: () => undefined,
    goTo: () => undefined,
    ...over,
  }
}

/** Every valid scenario of the lifecycle model: 88 of them. */
export const ALL_SCENARIOS: readonly Scenario[] = scenarios()
