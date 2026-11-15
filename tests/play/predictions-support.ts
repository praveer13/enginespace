/**
 * Shared by the prediction tests (tests/play/predictions.test.ts): a game block's level played on a seed to its end, as the house plays
 * it, and the finished run's record. Not a test: bun test collects only *.test.ts.
 *
 * The house's own play is the one that each game's tests use (engine-floor-support.ts, pool-support.ts) or, for the full service, a
 * learner who commits a prediction in every stage and rings each night out until the stage closes: the run ends the way a learner's does
 * and the reading of the run is the same whatever was played in it.
 */
import { applyAction, drawInBand, finishRun, GAMES, levelOf, startRun } from '@es/play'
import type { AnySession, GameAction, GameMode, RunRecord } from '@es/play'
import { buildLevel as floorLevel } from '@es/play/engine-floor/levels'
import { stageClosed } from '@es/play/loop/full/session'
import type { FullAction, FullState } from '@es/play/loop/full/types'
import { buildLevel as poolLevel } from '@es/play/pool/levels'
import { houseActions as floorHouse } from './engine-floor-support'
import { houseActions as poolHouse } from './pool-support'

/** The entropy that a graded block's seed is drawn from, fixed so that a failure repeats. */
export const ENTROPY = 0x5eed_0b02

/** The actions that play a full-service level to its end: each stage's prediction, then its nights, then the next stage. */
function fullActions(session: AnySession, record: Pick<RunRecord, 'game' | 'level' | 'seed'>): GameAction[] {
  let run = startRun(session, record)
  const actions: GameAction[] = []
  const push = (action: FullAction) => {
    actions.push(action)
    run = applyAction(session, run, action)
  }
  for (let guard = 0; guard < 200 && !session.done(run.state); guard++) {
    const state = run.state as FullState
    const world = state.level.stages[state.at]
    if (stageClosed(world, state.stages[state.at])) {
      const next = state.level.stages.findIndex((candidate, i) => !stageClosed(candidate, state.stages[i]))
      push({ t: 'stage', to: state.level.stages[next].id })
    } else if (state.stages[state.at].prediction === null) {
      push({ t: 'commit', prediction: 0 })
    } else {
      push({ t: 'run', until: 'decision' })
    }
  }
  return actions
}

/** The actions that play a level of a game to its end on a seed. */
function actionsFor(session: AnySession, game: string, level: string, seed: number): GameAction[] {
  switch (game) {
    case 'engine-floor':
      return floorHouse(floorLevel(level, seed))
    case 'pool':
      return poolHouse(poolLevel(level, seed))
    case 'loop':
      return fullActions(session, { game, level, seed })
    default:
      throw new Error(`no player for ${game}: only the games with a prediction that a run answers are played here`)
  }
}

/** The seed a game block runs on: the level's pinned practice seed, or one drawn in band from fixed entropy for a graded block. */
export async function seedOf(game: string, level: string, mode: GameMode): Promise<number> {
  const entry = GAMES.get(game)
  if (entry === undefined) throw new Error(`no game ${game}`)
  if (mode === 'practice') return levelOf(entry, level)?.practiceSeed ?? 0
  return drawInBand(await entry.session(), level, ENTROPY)
}

/** A game block's level played to its end, as a lesson plays it: the record of the finished run, with the lesson's revision when one is given. */
export async function finishedRun(game: string, level: string, mode: GameMode, rev?: string): Promise<RunRecord> {
  const session = await GAMES.get(game)!.session()
  const seed = await seedOf(game, level, mode)
  let run = startRun(session, { game, level, seed, ...(rev === undefined ? {} : { rev }) })
  for (const action of actionsFor(session, game, level, seed)) run = applyAction(session, run, action)
  const finished = finishRun(session, run)
  if (finished === null) throw new Error(`${game}/${level} did not end on seed ${seed}`)
  return finished.record
}
