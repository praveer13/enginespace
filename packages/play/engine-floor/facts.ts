/**
 * What a house's path says about itself (GAMES.md §5, "Core loop" steps 2 and 6): the prediction's answer, and the facts the debrief
 * sets side by side when it lays two houses' floor plans next to each other: where detokenizing runs, how many ZMQ hops the path has,
 * and how the ranks get the batch.
 *
 * Every fact is counted from the lifecycle data of one path, so each is [derived] from the pinned stages and is only as good as the
 * stages are. They are counts and names of the model's stages, and nothing here is a measurement of an engine.
 */
import { boundaryOf, pathFacts } from '@es/sim/lifecycle'
import type { Mechanism, Place, StageDef } from '@es/sim/lifecycle'
import { FLOOR_KINDS, floorKindOf, placeName } from './words'
import type { FloorKind } from './words'

export interface HouseFacts {
  /** Stages in the path. */
  readonly stages: number
  /** The hand-offs of the path, by mechanism. */
  readonly byMechanism: Readonly<Record<Mechanism, number>>
  /** Processes the path visits, the client's included. */
  readonly processes: number
  /** The prediction's answer: process boundaries a sampled token crosses on its way to the client. */
  readonly boundariesOut: number
  /** Hops over ZMQ: the stages whose label says so. */
  readonly zmqHops: number
  /** Where detokenizing runs, as a place; null when the path does not detokenize. */
  readonly detokenizesAt: string | null
  /** How the ranks after the first get the batch: the stage that reaches them; null with one rank. */
  readonly ranksVia: { readonly mechanism: Mechanism; readonly label: string } | null
  /** The floors the path visits, from the dining room down. */
  readonly floors: readonly FloorKind[]
}

/** The stage that samples: its id ends in `.sample` in every engine of the model. */
const isSample = (stage: StageDef): boolean => stage.id.endsWith('.sample')
/** The stage that turns tokens back into text. */
const isDetokenize = (stage: StageDef): boolean => /\.(?:detokenize|process-outputs)$/.test(stage.id)

/**
 * The process boundaries a sampled token crosses on its way to the client (GAMES.md §5, "Predict"): the stages after the sampler, up to
 * the first that reaches where the request began, that change process. The first token's way out ends there, so an abort that
 * follows it is not counted. For an offline library, where the request begins in the process that samples, there are none.
 */
export function boundariesOut(path: readonly StageDef[], entry: Place): number {
  const sampler = path.findIndex(isSample)
  if (sampler < 0) return 0
  let crossed = 0
  for (const stage of path.slice(sampler + 1)) {
    if (boundaryOf(stage.from, stage.to) === 'process') crossed += 1
    if (stage.to.process === entry.process && stage.to.thread === entry.thread) break
  }
  return crossed
}

export function factsOf(path: readonly StageDef[], entry: Place): HouseFacts {
  const base = pathFacts(path)
  const detokenizer = path.find(isDetokenize)
  const toRank = path.find((stage) => stage.to.device === 'host' && stage.to.rank > 0 && stage.from.rank !== stage.to.rank)
  const processes = new Set<string>([entry.process])
  const floors: FloorKind[] = []
  for (const stage of path) {
    for (const place of [stage.from, stage.to]) {
      processes.add(place.process)
      const kind = floorKindOf(place)
      if (!floors.includes(kind)) floors.push(kind)
    }
  }
  return {
    stages: base.stages,
    byMechanism: base.byMechanism,
    processes: processes.size,
    boundariesOut: boundariesOut(path, entry),
    zmqHops: path.filter((stage) => /\bZMQ\b/.test(stage.label)).length,
    detokenizesAt: detokenizer === undefined ? null : placeName(detokenizer.to),
    ranksVia: toRank === undefined ? null : { mechanism: toRank.mechanism, label: toRank.label },
    floors: FLOOR_KINDS.filter((kind) => floors.includes(kind)),
  }
}

/** The highest answer the prediction offers [estimated]: the model's longest way out is under it (tests/play/engine-floor-facts.test.ts holds the model to it). */
export const MAX_PREDICTION = 5
