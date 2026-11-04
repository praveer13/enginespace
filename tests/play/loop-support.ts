/**
 * Shared by Service's tests (tests/play/loop*.test.ts): small hand-built levels and nights, the house's policy at the level of the
 * engine, a visitor who hangs in a seeded order, and the sim's own run of the same night to compare against.
 */
import { below, rngFor } from '@es/sim/core'
import type { Seed, Us } from '@es/sim/core'
import { TICK_CARD, runStepLoop } from '@es/sim/steploop'
import type { StepLoopConfig, StepLoopRun } from '@es/sim/steploop'
import type { ReqSpec, Workload } from '@es/sim/workload'
import { askOf, freshState, hang, levelDone, setBatching, setOverlap, step } from '@es/play/loop/engine'
import { frontConfig } from '@es/play/loop/levels'
import { loopView } from '@es/play/loop/session'
import type { LoopLevel, LoopState } from '@es/play/loop/types'
import type { LoopRun } from '@/games/loop/types'

/** A level of the last kind (every ticket served), with the tables' appetites given by hand. */
export function handLevel(outputs: readonly number[], over: Partial<LoopLevel> = {}): LoopLevel {
  return {
    id: 'first-4-par',
    seed: 0,
    title: 'Hand level',
    prompt: 'A level made by hand.',
    slots: 4,
    outputs,
    opening: null,
    goal: 'all-served',
    overlap: 'free',
    par: null,
    ...over,
  }
}

/** The tickets of such a level, as the sim's workload: all due at once, one token of prompt each. */
export function workloadOf(outputs: readonly number[], seed: Seed = 0): Workload {
  const reqs: ReqSpec[] = outputs.map((outputTokens, id) => ({ id, dueUs: 0, promptTokens: 1, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false }))
  return { seed, origin: { kind: 'synthetic' }, reqs }
}

export const FOREVER: Us = 1_000_000

/** The sim's night for the same tickets, on `slots` clips, under the same switches. */
export function simOf(outputs: readonly number[], o: { slots?: number; overlap: boolean; batching?: 'continuous' | 'static' }): StepLoopRun {
  const cfg: StepLoopConfig = { ...frontConfig(o.batching ?? 'continuous', o.overlap), maxNumSeqs: o.slots ?? 4 }
  return runStepLoop(workloadOf(outputs), cfg, TICK_CARD, TICK_CARD, { horizonUs: FOREVER })
}

/** The state after the house hangs every free clip first come first served and rings the bell until the level is over. */
export function houseNight(level: LoopLevel, o: { overlap: boolean; batching?: 'continuous' | 'static' }): LoopState {
  let state = freshState(level)
  state = setBatching(state, o.batching ?? 'continuous')
  state = setOverlap(state, o.overlap)
  while (!levelDone(state)) {
    for (let a = askOf(state); a !== null; a = askOf(state)) state = hang(state, a.waiting[0])
    state = step(state)
  }
  return state
}

/** The same night with the visitor hanging whichever waiting ticket a seeded stream names: the order of the tickets is theirs to choose. */
export function shuffledNight(level: LoopLevel, seed: Seed, o: { overlap: boolean }): LoopState {
  const pick = rngFor(seed, 'test/loop/order')
  let state = setOverlap(freshState(level), o.overlap)
  while (!levelDone(state)) {
    for (let a = askOf(state); a !== null; a = askOf(state)) state = hang(state, a.waiting[below(pick, a.waiting.length)])
    state = step(state)
  }
  return state
}

/**
 * A visitor with a strategy, as the front page's challenge poses them (GAMES.md §3.1, beat 4). `refill` hangs a ticket in every clip
 * the moment it opens; without it they wait until the whole rail has cleared, which is firing the rail as a set. `overlap` turns the
 * switch on from the start. With `order` they tap the waiting tickets in a seeded order, and without it first come first served.
 */
export function visitorNight(level: LoopLevel, o: { refill: boolean; overlap: boolean; order?: Seed }): LoopState {
  const pick = o.order === undefined ? null : rngFor(o.order, 'test/loop/visitor')
  let state = setOverlap(freshState(level), o.overlap)
  while (!levelDone(state)) {
    if (o.refill || state.tray.every((req) => req === null)) {
      for (let a = askOf(state); a !== null; a = askOf(state)) state = hang(state, a.waiting[pick === null ? 0 : below(pick, a.waiting.length)])
    }
    state = step(state)
  }
  return state
}

/** A run as the pieces of Service's page receive it (GameShell's `RunApi`), for a state, with every action a no-op: for server-rendering the page. */
export function fakeRun(state: LoopState, over: Partial<LoopRun> = {}): LoopRun {
  const view = loopView(state)
  return {
    game: 'loop',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view,
    score: view.counters,
    ask: askOf(state),
    done: view.done,
    turns: 0,
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

/** Every state a night passes through under the house's policy: after each hang and each bell. */
export function* statesOfHouseNight(level: LoopLevel, o: { overlap: boolean }): Generator<LoopState> {
  let state = setOverlap(freshState(level), o.overlap)
  yield state
  while (!levelDone(state)) {
    for (let a = askOf(state); a !== null; a = askOf(state)) {
      state = hang(state, a.waiting[0])
      yield state
    }
    state = step(state)
    yield state
  }
}
