// The engines' paths, one reference path per valid scenario (GAMES.md §5: `referencePath(sc)`), and the scenarios themselves.
//
// A path is written once per engine (engines/*.ts) as the calls of a builder, and a scenario picks its variant by an `if`: tensor parallelism
// puts the middle of the path on rank 1, `n` and a prefix hit add a stage, `streaming` picks the last stage, and `abort` adds the abort's
// own stages after the first streamed token. The same stage id keeps the same mechanism and the same citation in every scenario that has it;
// only its places can differ, and tests/sim/lifecycle.test.ts holds the engines to that.

import { INSIDE } from './engines/inside'
import { MINI } from './engines/mini'
import { NANO } from './engines/nano'
import { SGLANG } from './engines/sglang'
import { VLLM } from './engines/vllm'
import type { EngineDef, EngineId, Place, Scenario, StageDef } from './types'
import { ENGINE_IDS } from './types'

/** Every engine, by id. `ref` is the commit its stages are cited at: the lock's commit for the engine's pin. */
export const ENGINES: Readonly<Record<EngineId, EngineDef>> = {
  'nano-vllm': NANO,
  'mini-sglang': MINI,
  'inside-vllm': INSIDE,
  vllm: VLLM,
  sglang: SGLANG,
}

/** Why a scenario is not one the model can draw, or null when it is. */
export function invalidReason(sc: Scenario): string | null {
  const engine: EngineDef | undefined = (ENGINES as Partial<Record<string, EngineDef>>)[sc.engine]
  if (engine === undefined) return `there is no engine "${String(sc.engine)}"`
  const { supports } = engine
  if (!supports.streaming.includes(sc.streaming)) return `${engine.title} has no ${sc.streaming ? 'streaming' : 'non-streaming'} mode`
  if (!supports.tp.includes(sc.tp)) return `${engine.title} is not drawn at tensor-parallel degree ${String(sc.tp)}`
  if (!supports.abort.includes(sc.abort)) return `${engine.title} has no abort path`
  if (sc.abort && !sc.streaming) return 'a client leaves mid-stream, so an abort needs streaming'
  if (!supports.prefixHit.includes(sc.prefixHit)) return `${engine.title} has no prefix hit`
  if (!supports.n.includes(sc.n)) return `${engine.title} supports n = ${supports.n.join(' or ')}`
  return null
}

/** The reference path of a scenario: the stages of the engine's data, in order, from where the request begins. Throws a RangeError for an invalid scenario. */
export function referencePath(sc: Scenario): readonly StageDef[] {
  const reason = invalidReason(sc)
  if (reason !== null) throw new RangeError(`not a scenario of the lifecycle model: ${reason}`)
  return ENGINES[sc.engine].path(sc)
}

/** Where a request begins in an engine, and where it ends again unless it is aborted. */
export const entryOf = (engine: EngineId): Place => ENGINES[engine].entry

/**
 * Every valid scenario, in a fixed order: by engine in the order of GAMES.md's levels, then streaming, tensor-parallel degree, abort, prefix
 * hit and `n`, each from false to true or from 1 to 2.
 */
export function scenarios(engine?: EngineId): readonly Scenario[] {
  const out: Scenario[] = []
  for (const id of engine === undefined ? ENGINE_IDS : [engine]) {
    const { supports } = ENGINES[id]
    for (const streaming of supports.streaming)
      for (const tp of supports.tp)
        for (const abort of supports.abort)
          for (const prefixHit of supports.prefixHit)
            for (const n of supports.n) {
              const sc: Scenario = { engine: id, streaming, tp, abort, prefixHit, n }
              if (invalidReason(sc) === null) out.push(sc)
            }
  }
  return out
}

/**
 * Every stage of an engine, once: the stages of all its scenarios' paths, each id at its first appearance, in the order of the paths. This is
 * the tray's pool (GAMES.md §5: a distractor is a real stage of the other engine). A stage whose places move with the rank, such as the first
 * stage after a broadcast, is the variant of the first scenario that has it.
 */
export function engineStages(engine: EngineId): readonly StageDef[] {
  const seen = new Set<string>()
  const out: StageDef[] = []
  for (const sc of scenarios(engine)) {
    for (const stage of ENGINES[engine].path(sc)) {
      if (seen.has(stage.id)) continue
      seen.add(stage.id)
      out.push(stage)
    }
  }
  return out
}

/** A scenario in words, for a test name or a screen: `vllm, streaming, tp 2, abort, prefix hit, n 2`. */
export function describeScenario(sc: Scenario): string {
  return [sc.engine, sc.streaming ? 'streaming' : 'not streaming', `tp ${sc.tp}`, sc.abort ? 'abort' : 'no abort', sc.prefixHit ? 'prefix hit' : 'no prefix hit', `n ${sc.n}`].join(', ')
}
