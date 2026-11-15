/**
 * TR1's predictions, read from Back of House's runs (W1b-T02; plan.ts says which run answers which).
 *
 * The world of a run is the lifecycle model's path for the scenario its level lays: the engine and the request, as `packages/sim/lifecycle`
 * cites them at the pins. A question about that engine is answered by counting that path, and a question that moves one lever of the request
 * (a second rank, two samples) by counting the path of the same request with the lever moved. The levels of Back of House lay the same
 * scenario whatever the seed, so the seed picks only the tray and the reading does not depend on it.
 */
import { boundaryOf, entryOf } from '@es/sim/lifecycle'
import type { Scenario, StageDef } from '@es/sim/lifecycle'
import { boundariesOut } from '../engine-floor/facts'
import { buildLevel } from '../engine-floor/levels'
import { referenceOf } from '../engine-floor/stages'
import type { RunRecord } from '../types'
import { requireRun } from './types'
import type { Reference } from './types'

const GAME = 'engine-floor'

/** The scenario that a run's level laid. */
function scenarioOf(run: RunRecord, level: string): Scenario {
  requireRun(run, GAME, level)
  return buildLevel(run.level, run.seed).scenario
}

/** The process boundaries a sampled token crosses on its way to the client, for a scenario (the level's own prediction, GAMES.md §5). */
const boundaries = (sc: Scenario): number => boundariesOut(referenceOf(sc), entryOf(sc.engine))

/** The stages of a path that cite the one line of source that samples the token. */
function stagesOnTheSamplingLine(sc: Scenario): number {
  const path = referenceOf(sc)
  const sampler = path.find((stage) => stage.id.endsWith('.sample'))
  if (sampler === undefined) throw new RangeError(`the path of ${sc.engine} has no stage that samples`)
  return path.filter((stage) => stage.source.path === sampler.source.path && stage.source.line === sampler.source.line).length
}

/** The stages from the client's disconnect to the end of the path: where the news of an abort goes. */
function abortStages(sc: Scenario): readonly StageDef[] {
  const path = referenceOf(sc)
  const from = path.findIndex((stage) => stage.id.endsWith('.disconnect'))
  return from < 0 ? [] : path.slice(from)
}

const PROCESS_BOUNDARIES = "Counted from the lifecycle model's path for the engine this level lays: the process boundaries between the stage that samples the token and the client."

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr1.l1.p1': {
    says: ['sampled token'],
    reads: PROCESS_BOUNDARIES,
    truth: (run) => boundaries(scenarioOf(run, 'nano')),
  },
  'tr1.l1.p2': {
    says: ['samples a token'],
    reads: "Counted from the same path: the stages that cite the one line of source where the token is sampled.",
    truth: (run) => stagesOnTheSamplingLine(scenarioOf(run, 'nano')),
  },
  'tr1.l3.p1': {
    says: ['sampled token'],
    reads: PROCESS_BOUNDARIES,
    truth: (run) => boundaries(scenarioOf(run, 'mini')),
  },
  'tr1.l3.p2': {
    says: ['two GPUs instead of one'],
    reads: "Counted from the lifecycle model: the same request laid on two ranks, with the stages of one rank taken from it.",
    truth: (run) => {
      const sc = scenarioOf(run, 'mini')
      return referenceOf({ ...sc, tp: 2 }).length - referenceOf({ ...sc, tp: 1 }).length
    },
  },
  'tr1.l4.p1': {
    says: ['sampled token'],
    reads: PROCESS_BOUNDARIES,
    truth: (run) => boundaries(scenarioOf(run, 'inside')),
  },
  'tr1.l5.p1': {
    says: ['two GPUs'],
    reads: "Counted from the lifecycle model's path for this engine with the request laid on two ranks: the process boundaries between the stage that samples the token and the client.",
    truth: (run) => boundaries({ ...scenarioOf(run, 'vllm'), tp: 2 }),
  },
  'tr1.l6.p1': {
    says: ['sampled token'],
    reads: PROCESS_BOUNDARIES,
    truth: (run) => boundaries(scenarioOf(run, 'sglang')),
  },
  'tr1.l6.p2': {
    says: ['two samples'],
    reads: "Read from the lifecycle model's path for a request that asks for two samples: the samples, and the warm-up request that SGLang sends first when there are two.",
    truth: (run) => {
      const sc = { ...scenarioOf(run, 'sglang'), n: 2 as const }
      return sc.n + (referenceOf(sc).some((stage) => stage.id.endsWith('.n-warmup')) ? 1 : 0)
    },
  },
  'tr1.l7.p1': {
    says: ['client disconnects'],
    reads: "Counted from the lifecycle model's path for this request when the client leaves: the process boundaries the news crosses before it reaches the process that frees the request.",
    truth: (run) => abortStages(scenarioOf(run, 'abort')).filter((stage) => boundaryOf(stage.from, stage.to) === 'process').length,
  },
}
