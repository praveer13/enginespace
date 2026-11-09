/**
 * Where Back of House finds a stage (GAMES.md §5, `referencePath` and the tray): the pinned lifecycle data of packages/sim/lifecycle,
 * by id. A level's tray holds the stages of the scenario's path, in the variant that scenario has (a stage's places move with the rank),
 * and stages of other engines, which are the same stages in the variant their own first scenario has.
 *
 * The lookups are memoized: the model rebuilds a path's citations on each call, and a run, a view and a band ask for them many times.
 */
import { ENGINE_IDS, ENGINES, describeScenario, engineStages, referencePath } from '@es/sim/lifecycle'
import type { EngineId, Scenario, StageDef } from '@es/sim/lifecycle'
import type { StageNote } from './types'

const paths = new Map<string, readonly StageDef[]>()

/** The engine's path for a scenario (the house run), memoized. Throws a RangeError for a scenario the model cannot draw. */
export function referenceOf(sc: Scenario): readonly StageDef[] {
  const key = describeScenario(sc)
  let path = paths.get(key)
  if (path === undefined) {
    path = referencePath(sc)
    paths.set(key, path)
  }
  return path
}

interface Known {
  readonly def: StageDef
  readonly owner: EngineId
}

const pools = new Map<EngineId, readonly StageDef[]>()

/** Every stage of an engine, once (the model's `engineStages`), memoized: it builds every scenario's path to find them. */
export function stagesOf(engine: EngineId): readonly StageDef[] {
  let pool = pools.get(engine)
  if (pool === undefined) {
    pool = engineStages(engine)
    pools.set(engine, pool)
  }
  return pool
}

let known: ReadonlyMap<string, Known> | null = null

/** Every stage of every engine, once, with the engine that owns it. */
function everyStage(): ReadonlyMap<string, Known> {
  if (known === null) {
    const all = new Map<string, Known>()
    for (const owner of ENGINE_IDS) for (const def of stagesOf(owner)) if (!all.has(def.id)) all.set(def.id, { def, owner })
    known = all
  }
  return known
}

/** The engine a stage id belongs to, or undefined for an id the model does not have. */
export const ownerOf = (id: string): EngineId | undefined => everyStage().get(id)?.owner

/**
 * The stage with this id as `sc` has it: the scenario's own variant when the id is in its path, else the first variant any scenario
 * of the model gives it. Undefined for an id that no engine has.
 */
export function stageIn(sc: Scenario, id: string): StageDef | undefined {
  return referenceOf(sc).find((stage) => stage.id === id) ?? everyStage().get(id)?.def
}

/** A stage as an explanation cites it: whose it is, its mechanism and label, its places and its source. */
export function noteOf(def: StageDef): StageNote {
  const engine = ownerOf(def.id)
  if (engine === undefined) throw new RangeError(`the stage "${def.id}" belongs to no engine of the model`)
  return { id: def.id, engine, engineTitle: ENGINES[engine].title, mechanism: def.mechanism, label: def.label, from: def.from, to: def.to, source: def.source }
}
