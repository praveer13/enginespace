/**
 * Shared by tests/play/state-copy.test.ts and scripts/state-copy-equivalence.ts: every built game's levels on their practice seeds,
 * and the states of each along its reference run (the start, and the state after each action the house takes). Not a test: bun test
 * collects only *.test.ts.
 */
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'
import { benchAsk, benchDone, benchInit, benchReduce } from '@es/play/broken-bench/session'
import { buildLevel as benchLevel } from '@es/play/broken-bench/levels'
import type { BenchAction, BenchLevelId, BenchState } from '@es/play/broken-bench/types'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { buildLevel as floorLevel } from '@es/play/engine-floor/levels'
import { floorInit, floorReduce } from '@es/play/engine-floor/session'
import { FULL_SERVICE, FIRST_SERVICE } from '@es/play/loop/entry'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { fullInit, fullReduce } from '@es/play/loop/full/session'
import type { FullState } from '@es/play/loop/full/types'
import { POOL } from '@es/play/pool/entry'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { ghostActions, shiftInit, shiftLevel, shiftReduce } from '@es/play/shape-shifter/session'
import { buildLevel as poolLevel } from '@es/play/pool/levels'
import { house } from '@es/play/pool/policy'
import { VERIFIER } from '@es/play/verifier/entry'
import { buildLevel as verifierLevel } from '@es/play/verifier/levels'
import { verifierInit, verifierReduce } from '@es/play/verifier/session'
import { loopLevel } from '@es/play/loop/session'
import { houseActions as floorHouse } from './engine-floor-support'
import { statesOfHouseNight } from './loop-support'
import { playThrough } from './pool-support'
import { filing, rightAnswer } from './broken-bench-support'
import { houseActions as verifierHouse } from './verifier-support'

export interface Walk {
  readonly game: string
  readonly level: string
  readonly seed: number
  /** The start state first, then the state after each action of the reference run. */
  readonly states: readonly unknown[]
  /** The actions of the reference run that led there, in order: one fewer than the states, or none where the walk is not made of actions. */
  readonly actions: readonly unknown[]
}

function fullWalk(id: string, seed: number): { states: unknown[]; actions: unknown[] } {
  const level = buildFullLevel(id, seed)
  let state: FullState = fullInit(level)
  const states: unknown[] = [state]
  const actions: unknown[] = []
  for (let at = 0; at < level.stages.length; at++) {
    const world = level.stages[at]
    state = { ...state, at }
    actions.push({ t: 'commit', prediction: world.answer })
    state = fullReduce(state, { t: 'commit', prediction: world.answer })
    states.push(state)
    state = { ...state, stages: state.stages.map((stage, i) => (i === at ? { ...stage, levers: world.house } : stage)) }
    actions.push({ t: 'run', until: 'decision' })
    state = fullReduce(state, { t: 'run', until: 'decision' })
    states.push(state)
  }
  return { states, actions }
}

function benchWalk(id: string, seed: number): { states: unknown[]; actions: unknown[] } {
  const level = benchLevel(id, seed)
  let state: BenchState = benchInit(level)
  const states: unknown[] = [state]
  const actions: unknown[] = []
  while (!benchDone(state) && benchAsk(state) !== null) {
    const answer: BenchAction[] = filing(rightAnswer(state.level.slots[state.at]))
    for (const action of answer) {
      actions.push(action)
      state = benchReduce(state, action)
      states.push(state)
    }
  }
  return { states, actions }
}

export function referenceWalks(): Walk[] {
  const walks: Walk[] = []
  const push = (game: string, level: string, seed: number, states: readonly unknown[], actions: readonly unknown[] = []) => walks.push({ game, level, seed, states, actions })
  for (const entry of FIRST_SERVICE) {
    const level = loopLevel(entry.id, entry.practiceSeed)
    push('loop', entry.id, entry.practiceSeed, [...statesOfHouseNight(level, { overlap: level.overlap === 'free' })])
  }
  for (const entry of FULL_SERVICE) {
    const walk = fullWalk(entry.id, entry.practiceSeed)
    push('loop', entry.id, entry.practiceSeed, walk.states, walk.actions)
  }
  for (const entry of POOL.levels) {
    const played = playThrough(poolLevel(entry.id, entry.practiceSeed), house)
    push('pool', entry.id, entry.practiceSeed, played.states, played.actions)
  }
  for (const entry of VERIFIER.levels) {
    const level = verifierLevel(entry.id, entry.practiceSeed)
    const actions = verifierHouse(level)
    const states: unknown[] = [verifierInit(level)]
    for (const action of actions) states.push(verifierReduce(states[states.length - 1] as never, action))
    push('verifier', entry.id, entry.practiceSeed, states, actions)
  }
  for (const entry of ENGINE_FLOOR.levels) {
    const level = floorLevel(entry.id, entry.practiceSeed)
    const actions = floorHouse(level)
    const states: unknown[] = [floorInit(level)]
    for (const action of actions) states.push(floorReduce(states[states.length - 1] as never, action))
    push('engine-floor', entry.id, entry.practiceSeed, states, actions)
  }
  for (const entry of BROKEN_BENCH.levels) {
    const walk = benchWalk(entry.id as BenchLevelId, entry.practiceSeed)
    push('broken-bench', entry.id, entry.practiceSeed, walk.states, walk.actions)
  }
  for (const entry of SHAPE_SHIFTER.levels) {
    // The reference's operations, after a committed guess: the ghost's plan of each target, or each tensor's BLOCK and its launch.
    const level = shiftLevel(entry.id, entry.practiceSeed)
    const actions = [{ t: 'commit' as const, prediction: level.tasks[0].answer }, ...ghostActions(level)]
    const states: unknown[] = [shiftInit(level)]
    for (const action of actions) states.push(shiftReduce(states[states.length - 1] as never, action))
    push('shape-shifter', entry.id, entry.practiceSeed, states, actions)
  }
  return walks
}
