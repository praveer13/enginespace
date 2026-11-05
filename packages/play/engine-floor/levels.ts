/**
 * Back of House's practice levels (`nano` to `abort`, GAMES.md §5 "Levels", "Band"): the scenario each one lays, the tray that the seed
 * draws for it, and the band that makes a seed a fair question.
 *
 * The scenario of a practice level is fixed by the level, because each level is one engine's one idea ("one process, then four, then
 * threads and queues, then async planning, then failure paths"). What the seed draws is the tray: the stages of the engine's path and
 * a few real stages of other engines, in a seeded order, so that two trays of one level are two questions and the learner who
 * knows one engine's names cannot lay another's. The graded `map` level, with its fresh scenarios, joins with W1-T19.
 *
 * Copy follows GAMES.md §2.6: the kitchen's word names the object and the engine's term rides beside it. It carries no digit, so no
 * number goes untagged. The facts in it are the lifecycle model's (content/cards/lifecycle.md), which cites the pinned source.
 *
 * A level's title names the engine and nothing of its architecture, and its prompt, which says what the level is about, is shown once the
 * prediction is written down: "one process" or "four processes" before it would answer it.
 */
import { assertSeed, rngFor, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { ENGINES, ENGINE_IDS, entryOf, invalidReason, scenarios } from '@es/sim/lifecycle'
import type { EngineId, Scenario, StageDef } from '@es/sim/lifecycle'
import { runPath } from './engine'
import { referenceOf, stageIn, stagesOf } from './stages'
import type { FloorLevel, FloorLevelId } from './types'
import { placeKey } from './words'

export const LEVEL_IDS: readonly FloorLevelId[] = ['nano', 'nano-tp', 'mini', 'inside', 'vllm', 'sglang', 'abort']

/** Real stages of other engines in a tray [estimated]: GAMES.md §5 asks for at least 3, so that pattern-matching one engine fails. */
export const DISTRACTORS = 4

const scenario = (engine: EngineId, over: Partial<Scenario> = {}): Scenario => ({ engine, streaming: false, tp: 1, abort: false, prefixHit: false, n: 1, ...over })

interface LevelDef {
  readonly title: string
  readonly prompt: string
  readonly scenario: Scenario
}

const DEFS: Readonly<Record<FloorLevelId, LevelDef>> = {
  nano: {
    title: 'nano-vllm',
    prompt:
      'An offline library: the caller, the scheduler and the model runner share one process and one thread, so the ticket crosses no window. It goes down to the line by the dumbwaiter and comes back up, and the hands wait for it ("Heard!") before they read what it brought.',
    scenario: scenario('nano-vllm'),
  },
  'nano-tp': {
    title: 'nano-vllm on two GPUs',
    prompt:
      'A second rank is a second process. nano-vllm starts a worker for it and passes each call through shared memory (the window shelf), and the halves of every layer pass across between the two GPUs.',
    scenario: scenario('nano-vllm', { tp: 2 }),
  },
  mini: {
    title: 'Mini-SGLang',
    prompt:
      'Four processes joined by ZMQ, each a window: the API server, a tokenizer, a scheduler for the rank, and a detokenizer. The scheduler overlaps, so the sync on a copy comes in the next turn of its loop.',
    scenario: scenario('mini-sglang', { streaming: true }),
  },
  inside: {
    title: 'Inside vLLM',
    prompt:
      'vLLM at the commit the post "Inside vLLM" reads. The API server and the engine core are two processes, and inside the engine core an input thread, the busy loop and an output thread pass the ticket to one another on spikes (queues).',
    scenario: scenario('inside-vllm', { streaming: true }),
  },
  vllm: {
    title: 'vLLM at the pin',
    prompt:
      'vLLM at the pin plans the next step before the last one is read back: async scheduling is on by default, so the busy loop launches a batch, keeps its future in `batch_queue`, and waits on the oldest only when the queue is full.',
    scenario: scenario('vllm', { streaming: true }),
  },
  sglang: {
    title: 'SGLang at the pin',
    prompt:
      'SGLang at the pin: the scheduler launches one batch and reads the result of the one before it in the next turn of its loop. A prefix hit is found in the radix tree before the batch is built.',
    scenario: scenario('sglang', { streaming: true, prefixHit: true }),
  },
  abort: {
    title: 'vLLM, the client leaves',
    prompt:
      'The client goes away in the middle of the stream. In vLLM at the pin the abort rides a queue of its own and is drained before `update_from_output`. Lay the way the first token took, and then the abort.',
    scenario: scenario('vllm', { streaming: true, abort: true }),
  },
}

const isLevelId = (id: string): id is FloorLevelId => Object.hasOwn(DEFS, id)

/** The scenario a practice level lays. */
export function scenarioOf(id: FloorLevelId): Scenario {
  return DEFS[id].scenario
}

/** The titles of the levels, for the registry's record and its test. */
export const levelTitle = (id: FloorLevelId): string => DEFS[id].title

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tray                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What makes two stages the same to a reader: their mechanism, label and places. A distractor that matched a stage of the path in all
 * four could not be told from it, and laying it would be called wrong with no way to know, so one that does is left out of the pool.
 */
const looksLike = (stage: StageDef): string => [stage.mechanism, stage.label, placeKey(stage.from), placeKey(stage.to)].join('~')

/**
 * The stages the tray holds besides the path's own: real stages of the other engines, each legal somewhere in its own engine
 * (GAMES.md §5, "Invariants"), drawn by the seed and left out when they would look like a stage of the path.
 */
export function distractorsFor(sc: Scenario, seed: Seed): readonly StageDef[] {
  const seen = new Set(referenceOf(sc).map(looksLike))
  const pool: StageDef[] = []
  for (const engine of ENGINE_IDS) {
    if (engine === sc.engine) continue
    for (const stage of stagesOf(engine)) {
      const look = looksLike(stage)
      if (seen.has(look)) continue
      seen.add(look)
      pool.push(stage)
    }
  }
  return shuffle(rngFor(seed, 'engine-floor/distractors'), pool).slice(0, DISTRACTORS)
}

/** The tray for a scenario on a seed: the path's stages and the distractors, in a seeded order. */
export function trayFor(sc: Scenario, seed: Seed): readonly StageDef[] {
  assertSeed(seed)
  return shuffle(rngFor(seed, 'engine-floor/tray'), [...referenceOf(sc), ...distractorsFor(sc, seed)])
}

/** The level `id` on `seed`. Throws for a level that Back of House does not have. */
export function buildLevel(id: string, seed: Seed): FloorLevel {
  if (!isLevelId(id)) throw new RangeError(`Back of House has no level "${id}"`)
  assertSeed(seed)
  const def = DEFS[id]
  return {
    id,
    seed,
    title: def.title,
    prompt: def.prompt,
    scenario: def.scenario,
    reference: referenceOf(def.scenario).map((stage) => stage.id),
    tray: trayFor(def.scenario, seed).map((stage) => stage.id),
    attempts: null,
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
 * first run. The house run passes by construction: the path is in the tray, in an order the seed chose.
 */
export function inLevelBand(id: FloorLevelId, seed: Seed): boolean {
  const level = buildLevel(id, seed)
  if (level.tray.length - level.reference.length < 3) return false
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
