/**
 * Back of House's session (`engine-floor`): the pure rules of the practice run, in the shape every game follows (GAMES.md §2.5, §5
 * "Simulation API").
 *
 * The learner writes a prediction, lays stages from the tray into a path, and runs it. The ticket moves along the path only as far as
 * each stage holds: it starts where the last stage ended, it crosses its boundary by the mechanism that crosses it, it reads nothing
 * a copy brought before a sync, and it is the engine's own next stage (engine.ts). The levels and their bands are levels.ts; this
 * file is the contract around them: level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief.
 *
 * The reference ("the house run") predicts the true count, lays the engine's own path and runs it once. It is the ghost: only the
 * debrief and the grade read it.
 *
 * Scoring (GAMES.md §5, "Scoring and pass"): the stages that held before the first that did not, over the engine's stage count. The
 * first such stage found in any run is the one that counts, so a learner who runs a short path often and gets it right loses nothing,
 * and one who is told a stage did not hold keeps the score of that run however many times they fix it. A level is passed when no run
 * ever found a stage that did not hold.
 */
import type { Seed } from '@es/sim/core'
import { ENGINES, entryOf } from '@es/sim/lifecycle'
import type { Place, StageDef } from '@es/sim/lifecycle'
import type { Debrief, Grade, Session } from '../types'
import { runPath, stopOfMistake } from './engine'
import { MAX_PREDICTION, boundariesOut } from './facts'
import { buildLevel, inLevelBand, LEVEL_IDS } from './levels'
import { referenceOf, stageIn } from './stages'
import type { FloorAction, FloorAsk, FloorCounters, FloorLevel, FloorLevelId, FloorRun, FloorState, FloorView, LaidView, TileView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The contract                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The level `id` on `seed`. Throws for a level Back of House does not have. */
export const floorLevel = (id: string, seed: Seed): FloorLevel => buildLevel(id, seed)

const isLevelId = (id: string): id is FloorLevelId => (LEVEL_IDS as readonly string[]).includes(id)

/** Whether a seed makes the level a fair question (levels.ts, "The band"). */
export function floorInBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`Back of House has no level "${id}"`)
  return inLevelBand(id, seed)
}

/** The level's first state. */
export const floorInit = (level: FloorLevel): FloorState => ({ level, prediction: null, laid: [], laidAt: [], ran: 0, runs: 0, mistake: null, served: false, turns: 0 })

/** The run is over when the ticket has come home, or when a level that allows a few runs has had them. */
export const floorDone = (s: FloorState): boolean => s.served || (s.level.attempts !== null && s.runs >= s.level.attempts)

const stageOf = (s: FloorState, id: string): StageDef => {
  const stage = stageIn(s.level.scenario, id)
  if (stage === undefined) throw new RangeError(`there is no stage "${id}" in the lifecycle model`)
  return stage
}

/** The last run's findings while they still describe the path: the stages it covered are the first `ran` of the path. */
const currentRun = (s: FloorState): FloorRun | null => (s.ran > 0 ? runPath(s.level.scenario, s.laid.slice(0, s.ran)) : null)

/** Where the ticket stands: where the last stage that held in the last run ends, or the entry before any. */
function capsuleOf(s: FloorState, run: FloorRun | null): Place {
  const reached = run?.reached ?? 0
  return reached === 0 ? entryOf(s.level.scenario.engine) : stageOf(s, s.laid[reached - 1]).to
}

/**
 * Where the next hand-off starts (GAMES.md §2.6: "the end of the laid path"). When the last run stopped, the stages laid after the one
 * that failed have no standing, and the next hand-off starts where the ticket was stopped.
 */
function presentOf(s: FloorState, run: FloorRun | null = currentRun(s)): Place {
  if (run !== null && run.stop !== null) return capsuleOf(s, run)
  const last = s.laid[s.laid.length - 1]
  return last === undefined ? entryOf(s.level.scenario.engine) : stageOf(s, last).to
}

/** The list with the items at two places swapped. */
function swapped<T>(items: readonly T[], a: number, b: number): T[] {
  const out = [...items]
  out[a] = items[b]
  out[b] = items[a]
  return out
}

const needPrediction = (s: FloorState): void => {
  if (s.prediction === null) throw new RangeError('write the prediction first: it is committed before anything is laid')
}

/** Applies one action. Throws on an illegal one: a stage not in the tray or already laid, a place that is not on the path, a second prediction. */
export function floorReduce(s: FloorState, a: FloorAction): FloorState {
  if (floorDone(s)) throw new RangeError('the run is over, so no action can follow')
  const next = s.turns + 1
  switch (a.t) {
    case 'commit': {
      if (s.prediction !== null) throw new RangeError('the prediction is written once')
      if (!Number.isInteger(a.prediction) || a.prediction < 0 || a.prediction > MAX_PREDICTION) {
        throw new RangeError(`the prediction is a whole number from 0 to ${MAX_PREDICTION}, not ${JSON.stringify(a.prediction)}`)
      }
      return { ...s, prediction: a.prediction, turns: next }
    }
    case 'lay': {
      needPrediction(s)
      if (!s.level.tray.includes(a.stage)) throw new RangeError(`the stage "${String(a.stage)}" is not in the tray`)
      if (s.laid.includes(a.stage)) throw new RangeError(`the stage "${a.stage}" is already on the path`)
      return { ...s, laid: [...s.laid, a.stage], laidAt: [...s.laidAt, s.turns], turns: next }
    }
    case 'unlay': {
      needPrediction(s)
      const to = a.to ?? s.laid.length - 1
      if (!Number.isInteger(to) || to < 0 || to >= s.laid.length) throw new RangeError(`the path has ${s.laid.length} stages: it cannot be taken back to ${JSON.stringify(to)}`)
      return { ...s, laid: s.laid.slice(0, to), laidAt: s.laidAt.slice(0, to), ran: Math.min(s.ran, to), turns: next }
    }
    case 'move': {
      needPrediction(s)
      const from = a.from
      const to = from + a.by
      if (!Number.isInteger(from) || (a.by !== -1 && a.by !== 1) || from < 0 || from >= s.laid.length || to < 0 || to >= s.laid.length) {
        throw new RangeError('a stage moves one place up or down the path, and stays on it')
      }
      return { ...s, laid: swapped(s.laid, from, to), laidAt: swapped(s.laidAt, from, to), ran: Math.min(s.ran, from, to), turns: next }
    }
    case 'run': {
      needPrediction(s)
      if (s.laid.length <= s.ran) throw new RangeError('there is nothing new to run: lay another stage, or take the path back')
      const found = runPath(s.level.scenario, s.laid)
      const stop = found.stop
      const mistake = s.mistake ?? (stop === null ? null : { index: stop.at, stage: s.laid[stop.at], turn: s.laidAt[stop.at] })
      return { ...s, ran: s.laid.length, runs: s.runs + 1, mistake, served: found.complete, turns: next }
    }
    default:
      throw new RangeError(`Back of House has no action "${String((a as { t?: unknown }).t)}"`)
  }
}

/** The pending decision: the prediction, then the next stage from where the ticket stands. */
export function floorAsk(s: FloorState): FloorAsk | null {
  if (s.prediction === null) return { kind: 'predict', choices: Array.from({ length: MAX_PREDICTION + 1 }, (_, i) => i) }
  if (floorDone(s)) return null
  return { kind: 'lay', at: presentOf(s), canRun: s.laid.length > s.ran }
}

/**
 * The reference run to the end: the true count as the prediction, the engine's own path laid stage by stage, and one run
 * (GAMES.md §5, `referencePath`). Only the debrief and the grade read it.
 */
export function floorGhost(level: FloorLevel): FloorState {
  let state = floorInit(level)
  const entry = entryOf(level.scenario.engine)
  state = floorReduce(state, { t: 'commit', prediction: boundariesOut(referenceOf(level.scenario), entry) })
  for (const stage of level.reference) state = floorReduce(state, { t: 'lay', stage })
  return floorReduce(state, { t: 'run' })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The view                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const tileOf = (stage: StageDef): TileView => ({ id: stage.id, mechanism: stage.mechanism, label: stage.label, from: stage.from, to: stage.to })

/**
 * What the 2D view, the mirror and the scene draw. A stage shows its source and whose it is only once a run has judged it: a
 * citation names a repository, and the repository tells a stage of this engine from one of another.
 */
export function floorView(s: FloorState): FloorView {
  const sc = s.level.scenario
  const engine = ENGINES[sc.engine]
  const run = currentRun(s)
  const reached = run?.reached ?? 0
  const stop = run?.stop ?? null
  const done = floorDone(s)
  const laid: LaidView[] = s.laid.map((id, index) => {
    const stage = stageOf(s, id)
    const state: LaidView['state'] = index < reached ? 'ran' : stop !== null && index === stop.at ? 'struck' : 'pending'
    const judged = state !== 'pending'
    return { ...tileOf(stage), index, state, source: judged ? stage.source : null, owner: judged ? (stop !== null && index === stop.at ? stop.laid.engine : sc.engine) : null }
  })
  return {
    level: s.level.id,
    title: s.level.title,
    prompt: s.level.prompt,
    scenario: sc,
    pin: { engine: engine.id, title: engine.title, repo: engine.repo, ref: engine.ref, readOn: engine.readOn },
    entry: entryOf(sc.engine),
    prediction: s.prediction,
    step: s.prediction === null ? 'predict' : done ? 'over' : 'lay',
    tray: s.level.tray.filter((id) => !s.laid.includes(id)).map((id) => tileOf(stageOf(s, id))),
    laid,
    ran: s.ran,
    reached,
    capsule: capsuleOf(s, run),
    present: presentOf(s, run),
    stop,
    mistake: s.mistake === null ? null : stopOfMistake(sc, s.mistake),
    canRun: s.prediction !== null && !done && s.laid.length > s.ran,
    canUnlay: s.prediction !== null && !done && s.laid.length > 0,
    runs: s.runs,
    done,
    stages: s.level.reference.length,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grade and debrief                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Stages that held before the first that did not in any run; the whole path once served; else how far the last run got. */
function survivedOf(s: FloorState): number {
  if (s.mistake !== null) return s.mistake.index
  if (s.served) return s.level.reference.length
  return currentRun(s)?.reached ?? 0
}

/** The counts of the run so far. */
export function floorScore(s: FloorState): FloorCounters {
  return { laid: s.laid.length, held: currentRun(s)?.reached ?? 0, runs: s.runs, survived: survivedOf(s), stages: s.level.reference.length }
}

/**
 * The learner's run against the house's (GAMES.md §2.1, §5): the stages that held before the first that did not, over the engine's
 * stage count, capped at 1. The level is passed when the ticket came home and no run ever found a stage that did not hold. The bars of
 * credit are ASSESSMENT.md's (§4.3: for `map`, the whole path right on its first run); a practice level earns none.
 */
export function floorGrade(mine: FloorState, ghost: FloorState): Grade {
  const stages = Math.max(ghost.level.reference.length, 1)
  return { score: Math.min(1, survivedOf(mine) / stages), ok: mine.served && mine.mistake === null }
}

/**
 * The debrief: one sentence that says what the run did, and the stage worth the most (GAMES.md §2.1, §5: the first wrong stage). The
 * sentence carries no digit: the counters beside it are Readouts that tag every number.
 */
export function floorDebrief(mine: FloorState): Debrief {
  if (mine.mistake === null) {
    return mine.served
      ? { sentence: 'Every hand-off held on the first run: the ticket crossed each boundary through the mechanism the engine uses there, and in the order the engine uses them.', names: null }
      : { sentence: 'The ticket stopped short: the stages laid all held, and the path ends before the request is back where it began.', names: null }
  }
  return { sentence: `The first stage that did not hold. ${stopOfMistake(mine.level.scenario, mine.mistake).sentence}`, names: { turn: mine.mistake.turn } }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const floorSession: Session<FloorLevel, FloorState, FloorAction, FloorView, FloorCounters, FloorAsk> = {
  level: floorLevel,
  inBand: floorInBand,
  init: floorInit,
  ask: floorAsk,
  reduce: floorReduce,
  view: floorView,
  done: floorDone,
  score: floorScore,
  ghost: floorGhost,
  grade: floorGrade,
  debrief: floorDebrief,
}
