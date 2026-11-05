/**
 * Shared by The Reach-In's tests (tests/play/pool*.test.ts): runs of the session built from a policy or a list of actions, the
 * house's run on a level, and a run as the pieces of the page receive it. Not a test: bun test collects only *.test.ts.
 */
import { finishRun, startRun } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { advance, applyAction, freshWork, peek } from '@es/play/pool/engine'
import type { Policy } from '@es/play/pool/engine'
import { buildLevel } from '@es/play/pool/levels'
import { house } from '@es/play/pool/policy'
import { poolAsk, poolGhost, poolInit, poolReduce, poolSession } from '@es/play/pool/session'
import type { PoolAction, PoolLevel, PoolLevelId, PoolState } from '@es/play/pool/types'
import type { Seed } from '@es/sim/core'
import type { PoolOutcome, PoolRun } from '@/games/pool/types'

/** The levels a test walks, each on its practice seed. */
export const PRACTICE: readonly (readonly [PoolLevelId, Seed])[] = POOL.levels.map((level) => [level.id as PoolLevelId, level.practiceSeed])

/** The practice seed of a level. */
export const practiceOf = (id: PoolLevelId): PoolLevel => buildLevel(id, POOL.levels.find((level) => level.id === id)?.practiceSeed ?? 0)

/** The state after `actions`, from a level's first state. */
export const stateAfter = (level: PoolLevel, ...actions: PoolAction[]): PoolState => actions.reduce(poolReduce, poolInit(level))

/** A policy's answer to the open ask of a state, as the session sees it: the policy reads the state through `peek`. */
export const answerOf = (policy: Policy) => (state: PoolState): PoolAction => {
  const ask = poolAsk(state)
  if (ask === null) throw new Error('the night is not over, and nothing is asked')
  return policy(peek(state), ask)
}

/** A night played through the session's own reducer, one action at a time: every state on the way, and the actions that made them. */
export function playThrough(level: PoolLevel, policy: Policy): { readonly states: PoolState[]; readonly actions: PoolAction[] } {
  const choose = answerOf(policy)
  const states: PoolState[] = [poolInit(level)]
  const actions: PoolAction[] = []
  while (!poolSession.done(states[states.length - 1])) {
    const action = choose(states[states.length - 1])
    actions.push(action)
    states.push(poolReduce(states[states.length - 1], action))
  }
  return { states, actions }
}

/** The house's actions on a level, through the session. */
export const houseActions = (level: PoolLevel): PoolAction[] => playThrough(level, house).actions

/** The house's finished run on a level. */
export const houseRun = (id: PoolLevelId, seed: Seed): PoolState => poolGhost(buildLevel(id, seed))

/** A night played in bulk by the engine's own loop, which is what the bands and the house's ghost use. */
export function bulk(level: PoolLevel, policy: Policy, quiet: boolean) {
  const w = freshWork(level, quiet)
  advance(w)
  while (!w.done) {
    if (w.ask === null) throw new Error('the night is not over, and nothing is asked')
    applyAction(w, policy(w, w.ask))
    advance(w)
  }
  return w
}

/** A run as the pieces of The Reach-In's page receive it (GameShell's `RunApi`), for a state, with every action a no-op: for server-rendering the page. */
export function fakeRun(state: PoolState, over: Partial<PoolRun> = {}): PoolRun {
  const view = poolSession.view(state)
  return {
    game: 'pool',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: view.counts,
    ask: poolAsk(state),
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

/** A finished run as the shell hands it to the debrief: the grade, the debrief and the reference's view. */
export function outcomeOf(state: PoolState): PoolOutcome {
  const level = state.level
  const start = startRun(poolSession, { game: 'pool', level: level.id, seed: level.seed })
  // The state is reached by hand, so the record is made from the state's own log.
  const finished = finishRun(poolSession, { ...start, record: { ...start.record, actions: [...state.history] }, state })
  if (finished === null) throw new Error('the state is not finished')
  return { record: finished.record, grade: finished.grade, debrief: finished.debrief, hash: finished.hash, ghostView: poolSession.view(finished.ghost) }
}
