/**
 * Blind strategies of the games' graded levels (ASSESSMENT §4.1 and §13, ARCHITECTURE §10.2): what a learner who reads nothing of the
 * scene could pass, measured the same way by `verify:games` and by the tests.
 *
 * A level's probe plays strategies that need no understanding of the rule against the level's own session: always the same
 * configuration, the same recipe, the same draft length, one engine's path, the first or the last option of every list, a number chosen
 * once for each kind of case. It plays them on seeds that the level's band accepts, grades each run with the session's own `grade`
 * where a strategy can pass it, and says what each strategy passed. The best of them must pass a single seed at most `BLIND_BOUND` of
 * the time, so that three fresh seeds in a row are out of reach by guessing (ASSESSMENT §4.1). `verify:games` holds every graded level
 * to that, and each game's folder has the probes of its own graded levels (`<game>/blind.ts`).
 *
 * A probe is told what a learner is told: a level's public face, such as the length of a run, the engine on the card or the kind of
 * case, and never the scene. Where a strategy has to choose a constant (the number of courses a round serves, the p99 of a kind of case),
 * the constant is chosen on the seeds it is judged on, so the rate is an upper bound on what a constant fixed in advance would pass, and
 * it falls toward the truth as the sample grows. A strategy's description says when it did.
 *
 * Everything here is pure and works on the session it is given, so a test can hand it a session with a level made guessable and see
 * the gate fail.
 */
import type { Seed } from '@es/sim/core'
import type { AnySession, GameAction, Session } from './types'

/** The most that the best scene-blind strategy may pass of single seeds (ASSESSMENT §4.1) [estimated]: the bound `verify:items` holds too. */
export { BLIND_BOUND } from './items/blind'

/** One strategy's result on one graded level. */
export interface BlindRow {
  /** A short id: `always-3`, `per-engine`. */
  readonly strategy: string
  /** What it does and what it is told, in a sentence, for the gate's report. */
  readonly describe: string
  /** The share of its seeds that it passes, from 0 to 1. */
  readonly rate: number
  /** How many seeds, or cases, the rate is read on. A strategy keyed by a public cue, such as the length of a run, is read on its own seeds. */
  readonly of: number
}

/**
 * Measures one graded level: it plays its strategies on the session and returns a row for each. `seeds` overrides how many banded seeds
 * the probe reads (a probe has a default of its own, sized for the margin its level has under the bound); a test gives a smaller sample
 * to a session that it has made easy on purpose.
 */
export type BlindProbe = (session: AnySession, seeds?: number) => BlindRow[]

/** The probes of one game, by the id of the graded level they measure. */
export type BlindProbes = Readonly<Record<string, BlindProbe>>

/** A session as one game's probe knows it. The registry hands a game's session over with its types erased (`AnySession`), and the probe of that game puts them back. */
export function typed<Level, State, Action extends GameAction>(session: AnySession): Session<Level, State, Action, unknown, unknown, unknown> {
  return session as Session<Level, State, Action, unknown, unknown, unknown>
}

/** A strategy's row from its pass count. */
export function rowOf(strategy: string, describe: string, passed: number, of: number): BlindRow {
  return { strategy, describe, rate: of === 0 ? 0 : passed / of, of }
}

/**
 * `count` seeds that the band of level `id` accepts, counting up from `from`: the sample a level is measured on, the same on every run so
 * that a result can be reproduced. It gives fewer when the band accepts under a fiftieth of the seeds it scans, which the gate reports.
 */
export function bandedSeeds(session: Pick<AnySession, 'inBand'>, id: string, count: number, from = 0): Seed[] {
  const found: Seed[] = []
  const last = from + count * 50
  for (let seed = from; seed < last && found.length < count; seed++) if (session.inBand(id, seed)) found.push(seed)
  return found
}

/** The state after `actions`, played through the session's own reducer from the level's first state. */
export function playActions<Level, State, Action extends GameAction>(session: Session<Level, State, Action, unknown, unknown, unknown>, level: Level, actions: readonly Action[]): State {
  let state = session.init(level)
  for (const action of actions) state = session.reduce(state, action)
  return state
}
