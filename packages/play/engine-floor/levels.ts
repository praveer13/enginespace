/**
 * Back of House's levels (GAMES.md §5 "Levels", "Band"): the scenario each one lays, the tray that the seed draws for it, and the band
 * that makes a seed a fair question.
 *
 * The scenario of a practice level (`nano` to `abort`) is fixed by the level, because each level is one engine's one idea ("one process,
 * then four, then threads and queues, then async planning, then failure paths"). What the seed draws is the tray: the stages of the
 * engine's path and a few real stages of other engines, in a seeded order, so that two trays of one level are two questions and the
 * learner who knows one engine's names cannot lay another's.
 *
 * The graded `map` (W1-T19) draws the scenario too: "a fresh scenario (engine × streaming × TP × abort × prefix hit × n = 2)". The seed
 * picks the engine first, one in five, and then one of the scenarios that engine can be asked, so that no engine is rarer than a fifth of
 * the seeds (GAMES.md §5, "Band": each engine family on at least 15% of graded seeds), and a learner who knows one engine's most common
 * path is right on few of them. The band then asks of the scenario what GAMES.md §5 asks: at least one queue, one copy, one sync and one
 * process boundary on its path. nano-vllm crosses no process at one rank, so its graded scenarios are its two-rank ones.
 */
import { assertSeed, below, rngFor, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { ENGINES, ENGINE_IDS, entryOf, invalidReason, pathFacts, scenarios } from '@es/sim/lifecycle'
import type { EngineId, Scenario, StageDef } from '@es/sim/lifecycle'
import { FLOOR_COPY } from './copy'
import { runPath } from './engine'
import { ownerOf, referenceOf, stageIn, stagesOf } from './stages'
import type { FloorLevel, FloorLevelId, GradedLevelId, PracticeLevelId } from './types'
import { placeKey } from './words'

/** The practice levels, in the order of GAMES.md §5's difficulty line. Each lays one scenario of its own (`scenarioOf`). */
export const LEVEL_IDS: readonly PracticeLevelId[] = ['nano', 'nano-tp', 'mini', 'inside', 'vllm', 'sglang', 'abort']

/** The graded level (GAMES.md §5, `map`): its scenario is drawn from the seed (`scenarioFor`). */
export const MAP_LEVEL: GradedLevelId = 'map'

/** Every level of the game, in the order the registry lists them: the practice levels, then the graded one. */
export const ALL_LEVEL_IDS: readonly FloorLevelId[] = [...LEVEL_IDS, MAP_LEVEL]

/** Real stages of other engines in a tray [estimated]: GAMES.md §5 asks for at least 3, so that pattern-matching one engine fails. */
export const DISTRACTORS = 4

const scenario = (engine: EngineId, over: Partial<Scenario> = {}): Scenario => ({ engine, streaming: false, tp: 1, abort: false, prefixHit: false, n: 1, ...over })

interface LevelDef {
  readonly scenario: Scenario
}

const DEFS: Readonly<Record<PracticeLevelId, LevelDef>> = {
  nano: {
    scenario: scenario('nano-vllm'),
  },
  'nano-tp': {
    scenario: scenario('nano-vllm', { tp: 2 }),
  },
  mini: {
    scenario: scenario('mini-sglang', { streaming: true }),
  },
  inside: {
    scenario: scenario('inside-vllm', { streaming: true }),
  },
  vllm: {
    scenario: scenario('vllm', { streaming: true }),
  },
  sglang: {
    scenario: scenario('sglang', { streaming: true, prefixHit: true }),
  },
  abort: {
    scenario: scenario('vllm', { streaming: true, abort: true }),
  },
}

const isPracticeId = (id: string): id is PracticeLevelId => Object.hasOwn(DEFS, id)

/** The scenario a practice level lays. */
export function scenarioOf(id: PracticeLevelId): Scenario {
  return DEFS[id].scenario
}

/** The titles of the levels, for the registry's record and its test. */
export const levelTitle = (id: FloorLevelId): string => FLOOR_COPY[id].title

/* ------------------------------------------------------------------------------------------------------------------ */
/* The graded scenario                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Whether a scenario's path has what GAMES.md §5's band asks of a graded question: at least one queue, one copy, one sync and one process
 * boundary, so that the question tests every one of the five rules (start, process, thread, device and async). The counts are the
 * lifecycle model's, taken from the pinned stages.
 */
export function hasEveryHandoff(sc: Scenario): boolean {
  const facts = pathFacts(referenceOf(sc))
  return facts.byMechanism.queue >= 1 && facts.byMechanism.h2d + facts.byMechanism.d2h >= 1 && facts.byMechanism.sync >= 1 && facts.processHops >= 1
}

const askable = new Map<EngineId, readonly Scenario[]>()

/** The scenarios of an engine that the graded level can ask (`hasEveryHandoff`), in the model's order. */
export function gradedScenarios(engine: EngineId): readonly Scenario[] {
  let list = askable.get(engine)
  if (list === undefined) {
    list = scenarios(engine).filter(hasEveryHandoff)
    askable.set(engine, list)
  }
  return list
}

/**
 * The scenario a level lays on a seed (GAMES.md §5, `scenarioFor`). A practice level lays its own. The graded `map` draws one: the engine
 * first, uniformly (so each is a fifth of the seeds, whatever the engine has to ask), then one of the scenarios that engine can be asked,
 * uniformly. The two draws come from a stream of their own, so nothing else that a seed decides moves them.
 */
export function scenarioFor(seed: Seed, level: string): Scenario {
  assertSeed(seed)
  if (isPracticeId(level)) return DEFS[level].scenario
  if (level !== MAP_LEVEL) throw new RangeError(`Back of House has no level "${level}"`)
  const rng = rngFor(seed, 'engine-floor/scenario')
  const engine = ENGINE_IDS[below(rng, ENGINE_IDS.length)]
  const asked = gradedScenarios(engine)
  return asked[below(rng, asked.length)]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tray                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What makes two stages the same to a reader: their mechanism, label and places. A distractor that matched a stage of the path in all
 * four could not be told from it, and laying it would be called wrong with no way to know, so one that does is left out of the pool.
 */
const looksLike = (stage: StageDef): string => [stage.mechanism, stage.label, placeKey(stage.from), placeKey(stage.to)].join('~')

const looks = new Map<EngineId, readonly { readonly stage: StageDef; readonly look: string }[]>()

/** An engine's stages with the look of each, once: a tray asks for the other four engines' every time. */
function looksOf(engine: EngineId): readonly { readonly stage: StageDef; readonly look: string }[] {
  let list = looks.get(engine)
  if (list === undefined) {
    list = stagesOf(engine).map((stage) => ({ stage, look: looksLike(stage) }))
    looks.set(engine, list)
  }
  return list
}

/**
 * The engine's own stages that a tray holds. A practice tray holds the path's. The graded tray holds every stage the engine has for any
 * request (`stagesOf`), each as this scenario has it where the scenario's path has it: a tray that held only the path's stages would
 * show, by which optional stages it lacks, whether the request has a prefix hit or two samples or two ranks or a client that leaves, and
 * the card would not be needed. With all of them in, the learner reads the card and decides which to lay (GAMES.md §2.1, "answer first":
 * the scene must not carry the answer).
 */
export function ownStages(sc: Scenario, whole: boolean): readonly StageDef[] {
  return whole ? stagesOf(sc.engine).map((stage) => stageIn(sc, stage.id) ?? stage) : referenceOf(sc)
}

/**
 * The stages the tray holds besides the engine's own: real stages of the other engines, each legal somewhere in its own engine
 * (GAMES.md §5, "Invariants"), drawn by the seed and left out when they would look like a stage of the engine's.
 */
export function distractorsFor(sc: Scenario, seed: Seed, whole = false): readonly StageDef[] {
  const seen = new Set(ownStages(sc, whole).map(looksLike))
  const pool: StageDef[] = []
  for (const engine of ENGINE_IDS) {
    if (engine === sc.engine) continue
    for (const { stage, look } of looksOf(engine)) {
      if (seen.has(look)) continue
      seen.add(look)
      pool.push(stage)
    }
  }
  return shuffle(rngFor(seed, 'engine-floor/distractors'), pool).slice(0, DISTRACTORS)
}

/** The tray for a scenario on a seed: the engine's stages (the path's, or all of them when `whole`) and the distractors, in a seeded order. */
export function trayFor(sc: Scenario, seed: Seed, whole = false): readonly StageDef[] {
  assertSeed(seed)
  return shuffle(rngFor(seed, 'engine-floor/tray'), [...ownStages(sc, whole), ...distractorsFor(sc, seed, whole)])
}

/** The level `id` on `seed`. Throws for a level that Back of House does not have. */
export function buildLevel(id: string, seed: Seed): FloorLevel {
  if (id !== MAP_LEVEL && !isPracticeId(id)) throw new RangeError(`Back of House has no level "${id}"`)
  assertSeed(seed)
  const graded = id === MAP_LEVEL
  const scenario = scenarioFor(seed, id)
  return {
    id: id as FloorLevelId,
    seed,
    scenario,
    reference: referenceOf(scenario).map((stage) => stage.id),
    tray: trayFor(scenario, seed, graded).map((stage) => stage.id),
    // The graded level allows one run: its bar is the whole path right on its first (ASSESSMENT §4.3). A practice run can be taken back.
    attempts: graded ? 1 : null,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The band                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Every tile of the tray, laid in the order it is drawn. */
const inOrder = (level: FloorLevel): string[] => [...level.tray]

/**
 * A strategy that knows only the first rule: from where the ticket stands, lay the first tile in the tray that starts there. It reads
 * the places and never the engine, so it is the naive strategy of a learner who has not read the source.
 */
function byPlace(level: FloorLevel): string[] {
  const sc = level.scenario
  const laid: string[] = []
  let at = entryOf(sc.engine)
  for (let guard = 0; guard < level.tray.length; guard++) {
    const next = level.tray.find((id) => {
      const stage = stageIn(sc, id)
      return stage !== undefined && !laid.includes(id) && placeKey(stage.from) === placeKey(at)
    })
    const stage = next === undefined ? undefined : stageIn(sc, next)
    if (next === undefined || stage === undefined) break
    laid.push(next)
    at = stage.to
  }
  return laid
}

/**
 * Whether a seed makes the level a fair question (GAMES.md §2.1, §5 "Band"): the tray holds at least three real stages of other engines,
 * and neither naive strategy, the tray laid as it stands or the first tile that starts where the ticket is, gets the ticket home on its
 * first run. On the graded level the scenario also has every hand-off (`hasEveryHandoff`: a queue, a copy, a sync and a process
 * boundary). The house run passes by construction: the path is in the tray, in an order the seed chose.
 */
export function inLevelBand(id: FloorLevelId, seed: Seed): boolean {
  const level = buildLevel(id, seed)
  // At least three real stages of other engines, so that pattern-matching one engine fails.
  if (level.tray.filter((stage) => ownerOf(stage) !== level.scenario.engine).length < 3) return false
  if (id === MAP_LEVEL && !hasEveryHandoff(level.scenario)) return false
  return [inOrder(level), byPlace(level)].every((laid) => !runPath(level.scenario, laid).complete)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The other house                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The engine each one is set beside in the debrief (GAMES.md §5, step 6): the small engines against each other, vLLM then and now, and vLLM against SGLang. */
export const RIVAL: Readonly<Record<EngineId, EngineId>> = {
  'nano-vllm': 'mini-sglang',
  'mini-sglang': 'nano-vllm',
  'inside-vllm': 'vllm',
  vllm: 'sglang',
  sglang: 'vllm',
}

/** `wanted` where the engine supports it, else the first value it does. */
function take<T>(wanted: T, allowed: readonly T[]): T {
  return allowed.includes(wanted) ? wanted : allowed[0]
}

/** The scenario of the other house: the same request as far as the other engine can take it (streaming, ranks, abort, prefix hit and samples). */
export function rivalScenario(sc: Scenario): Scenario {
  const engine = RIVAL[sc.engine]
  const { supports } = ENGINES[engine]
  const streaming = take(sc.streaming, supports.streaming)
  const rival: Scenario = {
    engine,
    streaming,
    tp: take(sc.tp, supports.tp),
    abort: streaming ? take(sc.abort, supports.abort) : false,
    prefixHit: take(sc.prefixHit, supports.prefixHit),
    n: take(sc.n, supports.n),
  }
  return invalidReason(rival) === null ? rival : scenarios(engine)[0]
}
