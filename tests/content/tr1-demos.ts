/*
 * The worked numbers of TR1's lessons (W1-T20), computed from the lifecycle model and from the rules of the engines the lessons read, so that
 * a number a lesson prints is one this file recomputes. `tests/content/tr1-module.test.ts` holds each lesson's text to these functions, and
 * when the model or a pinned rule moves a number, the test names the lesson and the prediction that went stale.
 *
 * Two kinds of number live here. The counts of the lifecycle model (the process boundaries a sampled token crosses, the stages a path gains
 * at a second rank, the process boundaries an abort crosses) are [derived] from the stages of `packages/sim/lifecycle`, each of which cites
 * its file at its commit. The arithmetic of the two schedulers (how many tokens a step runs, how many tokens a prefix hit leaves to
 * compute) follows the pinned code the lessons quote: nano-vllm's `can_allocate` and `Scheduler.schedule`, and vLLM's one token budget.
 */
import { boundariesOut } from '@es/play/engine-floor/facts'
import { scenarioOf } from '@es/play/engine-floor/levels'
import type { PracticeLevelId } from '@es/play/engine-floor/types'
import { boundaryOf, entryOf, referencePath } from '@es/sim/lifecycle'
import type { EngineId, Mechanism, Scenario, StageDef } from '@es/sim/lifecycle'

/** The practice level each lesson plays, in the order of the lessons (GAMES.md §5). */
export const LEVEL_OF_LESSON: Readonly<Record<string, PracticeLevelId>> = {
  'tr1.l1': 'nano',
  'tr1.l2': 'nano-tp',
  'tr1.l3': 'mini',
  'tr1.l4': 'inside',
  'tr1.l5': 'vllm',
  'tr1.l6': 'sglang',
  'tr1.l7': 'abort',
}

/** A scenario, filled in: one rank, no abort, no prefix hit and one sample unless it says otherwise. */
export const scenario = (engine: EngineId, over: Partial<Scenario> = {}): Scenario => ({ engine, streaming: true, tp: 1, abort: false, prefixHit: false, n: 1, ...over })

/** The path of a scenario in the lifecycle model. */
export const pathOf = (sc: Scenario): readonly StageDef[] => referencePath(sc)

/** The path of the practice level that a lesson plays. */
export const levelPath = (lessonId: string): readonly StageDef[] => {
  const level = LEVEL_OF_LESSON[lessonId]
  if (level === undefined) throw new Error(`no practice level for ${lessonId}`)
  return referencePath(scenarioOf(level))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the model counts                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The process boundaries a sampled token crosses on its way to the client: the prediction the game asks (GAMES.md §5). */
export const tokenBoundaries = (sc: Scenario): number => boundariesOut(referencePath(sc), entryOf(sc.engine))

/** How many stages a second rank adds to an engine's path, other things equal. */
export const stagesAtSecondRank = (engine: EngineId): number => referencePath(scenario(engine, { tp: 2 })).length - referencePath(scenario(engine)).length

/** The stages of a path that a single line of a single file holds, as the lifecycle model cites them. */
export const stagesInLine = (path: readonly StageDef[], file: string, line: number): StageDef[] => path.filter((stage) => stage.source.path === file && stage.source.line === line)

/** The stages that the abort adds: from the client's disconnect to the end of the path. Every abort path of the model begins with `<engine>.disconnect`. */
export function abortStages(sc: Scenario): readonly StageDef[] {
  const path = referencePath(sc)
  const from = path.findIndex((stage) => stage.id.endsWith('.disconnect'))
  return from < 0 ? [] : path.slice(from)
}

/** The process boundaries that the news of a disconnect crosses before it reaches the process that frees the request. */
export function abortBoundaries(sc: Scenario): number {
  return abortStages(sc).filter((stage) => boundaryOf(stage.from, stage.to) === 'process').length
}

/** How many requests the front end of an engine sends on for a request that asks for `n` samples. */
export function requestsSent(sc: Scenario): number {
  if (sc.engine === 'sglang') return referencePath(sc).some((stage) => stage.id === 'sglang.n-warmup') ? sc.n + 1 : sc.n
  if (sc.engine === 'vllm' || sc.engine === 'inside-vllm') return sc.n
  return 1
}

/** The five mechanisms of the first lesson, for each of the model's nine (the lesson's table "The mechanism"). */
export const MECHANISM_WORD: Readonly<Record<Mechanism, 'compute' | 'queue' | 'IPC' | 'copy' | 'sync'>> = {
  call: 'compute',
  launch: 'compute',
  collective: 'compute',
  queue: 'queue',
  ipc: 'IPC',
  shm: 'IPC',
  h2d: 'copy',
  d2h: 'copy',
  sync: 'sync',
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The two schedulers' arithmetic                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** nano-vllm's block size [measured]: `Config.kvcache_block_size`'s default, which lesson 2 cites as the pin's. */
export const NANO_BLOCK_TOKENS = 256

/**
 * How many tokens of a prompt nano-vllm's model has to compute when the first `sharedTokens` of the prompt match a sequence that is already
 * in the cache. `can_allocate` walks every block of the sequence but its last (`range(seq.num_blocks - 1)`), and a block hits when its hash
 * and its token ids are the cache's, so a hit is a run of whole blocks from the start: `floor(shared / block)` of them, and never the last.
 */
export function nanoTokensToCompute(promptTokens: number, sharedTokens: number, blockTokens = NANO_BLOCK_TOKENS): number {
  const blocks = Math.ceil(promptTokens / blockTokens)
  const walkable = blocks - 1
  const hits = Math.min(Math.floor(sharedTokens / blockTokens), walkable)
  return promptTokens - hits * blockTokens
}

/**
 * The tokens that the next step runs in nano-vllm when `decoding` sequences are decoding and a prompt of `promptTokens` has joined `waiting`,
 * with a budget big enough for it. `schedule` takes prefill first and returns at once with the flag set when anything was scheduled, so the
 * decoders wait: a step is all prefill or all decode.
 */
export const nanoStepTokens = (decoding: number, promptTokens: number): number => (promptTokens > 0 ? promptTokens : decoding)

/** The same step in vLLM at the pin: one token budget, which every running request takes one token of and the new prompt takes its tokens of. */
export const vllmStepTokens = (decoding: number, promptTokens: number): number => decoding + promptTokens

/** The statuses of vLLM v0.33.0's `RequestStatus` that count as finished: the ones after PREEMPTED (`vllm/v1/request.py`, claim `vllm.request.finished-order`). */
export const FINISHED_STATUSES = [
  'FINISHED_STOPPED',
  'FINISHED_LENGTH_CAPPED',
  'FINISHED_ABORTED',
  'FINISHED_IGNORED',
  'FINISHED_ERROR',
  'FINISHED_REPETITION',
] as const

/** The growth of a file from one commit to the other, as a factor. */
export const growth = (before: number, after: number): number => after / before

/** The line counts of `vllm/v1/core/sched/scheduler.py` at the post's commit and at the pin [measured] (lesson 4's table). */
export const SCHEDULER_LINES = { post: 1163, pin: 3783 } as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions of the lessons                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The reference answer of every prediction block in TR1's lessons, with the unit the block names. Each is recomputed from the model or from
 * the arithmetic above, and `tests/content/tr1-module.test.ts` checks the block's id, unit and tolerance against this table and the
 * lesson's text against the answer.
 * The lesson's prediction box (W1b-T02) reads its answer from the run of the game block that follows the prediction, where
 * packages/play/predictions has a reading, and tests/play/predictions.test.ts holds each reading to the figure here; a prediction with no
 * reading waits for W2-T43, and its figure here is what that task starts from.
 */
export const PREDICTIONS: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = {
  'tr1.l1.p1': { unit: 'boundaries', reference: () => tokenBoundaries(scenarioOf('nano')) },
  'tr1.l1.p2': { unit: 'stages', reference: () => stagesInLine(levelPath('tr1.l1'), 'nanovllm/engine/model_runner.py', 218).length },
  'tr1.l2.p1': { unit: 'tokens', reference: () => nanoTokensToCompute(700, 600) },
  'tr1.l2.p2': { unit: 'tokens', reference: () => nanoStepTokens(2, 300) },
  'tr1.l3.p1': { unit: 'boundaries', reference: () => tokenBoundaries(scenarioOf('mini')) },
  'tr1.l3.p2': { unit: 'stages', reference: () => stagesAtSecondRank('mini-sglang') },
  'tr1.l4.p1': { unit: 'boundaries', reference: () => tokenBoundaries(scenarioOf('inside')) },
  'tr1.l4.p2': { unit: 'x', reference: () => growth(SCHEDULER_LINES.post, SCHEDULER_LINES.pin) },
  'tr1.l5.p1': { unit: 'boundaries', reference: () => tokenBoundaries(scenario('vllm', { tp: 2 })) },
  'tr1.l5.p2': { unit: 'tokens', reference: () => vllmStepTokens(2, 300) },
  'tr1.l5.p3': { unit: 'statuses', reference: () => FINISHED_STATUSES.length },
  'tr1.l6.p1': { unit: 'boundaries', reference: () => tokenBoundaries(scenarioOf('sglang')) },
  'tr1.l6.p2': { unit: 'requests', reference: () => requestsSent(scenario('sglang', { n: 2 })) },
  'tr1.l7.p1': { unit: 'boundaries', reference: () => abortBoundaries(scenarioOf('abort')) },
  // SGLang marks a running request `to_finish` and the request runs one more forward pass (claim `sglang.abort.running-request`).
  'tr1.l7.p2': { unit: 'passes', reference: () => 1 },
}
