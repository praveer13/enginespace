/**
 * TR2's predictions, read from Service's runs of the full service (W1b-T02; plan.ts says which run answers which).
 *
 * The world of a run is the level's stages on its seed: the cost card each stage names, the host presets of the runners it serves with,
 * the rail it serves on and the sizes it drills. A question that the lesson asks about those is answered by the course's own functions
 * on that world, and the level builds the same stage whatever the learner does, so the reading is of the stage and not of the learner's
 * nights. The first service's levels run on synthetic ticks and none of TR2's questions about them is read here (plan.ts).
 */
import { hostOf, CARDS } from '../loop/full/night'
import { buildFullLevel } from '../loop/full/levels'
import type { StageId, StageWorld } from '../loop/full/types'
import { capturedGraphs, gpuLayers, makeGraphConfig } from '@es/sim/steploop'
import type { RunRecord } from '../types'
import { requireRun } from './types'
import type { Reference } from './types'

const GAME = 'loop'

/** The stage of the run's level, as the level builds it on the run's seed. */
function stageOf(run: RunRecord, level: string, stage: StageId): StageWorld {
  requireRun(run, GAME, level)
  const found = buildFullLevel(run.level, run.seed).stages.find((candidate) => candidate.id === stage)
  if (found === undefined) throw new RangeError(`the ${level} level has no ${stage} stage`)
  return found
}

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr2.l4.p1': {
    says: ['12 rows', '8 µs', '60 µs', '31 µs', '2 µs, 20 µs and 15 µs'],
    reads: "Read from the V2 level's host cards, the legacy runner's and MRV2's: the CPU's work in a decode step of a full rail, the phases that differ, less MRV2's.",
    truth: (run) => {
      const stage = stageOf(run, 'mrv2', 'small')
      const legacy = hostOf(stage, 'v1')
      const current = hostOf(stage, 'mrv2')
      const rows = stage.slots
      return rows * (legacy.prepPerTokenUs - current.prepPerTokenUs) + (legacy.syncUs - current.syncUs) + rows * (legacy.samplePerSeqUs - current.samplePerSeqUs)
    },
  },
  'tr2.l5.p1': {
    says: ['12 kernels', '28 layers', '6 µs', '30 µs'],
    reads: "Read from the comb stage's host card and its small model: a fire called kernel by kernel, less one replay of the drilled routine.",
    truth: (run) => {
      const stage = stageOf(run, 'graphs', 'comb')
      const host = hostOf(stage, 'mrv2')
      return host.kernelsPerLayer * gpuLayers(CARDS[stage.card]) * host.launchPerKernelUs - host.graphReplayUs
    },
  },
  'tr2.l6.p1': {
    says: ['12 requests', '1, 2, 4, 8, 12, 16 and 24', 'FULL_AND_PIECEWISE'],
    reads: "Counted from the comb stage's rail and the sizes vLLM drills for it: the graphs MRV2 captures in the mode that mixes full and piecewise graphs.",
    truth: (run) => {
      const stage = stageOf(run, 'graphs', 'comb')
      const graphs = capturedGraphs(makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: stage.house.captureSizes, maxNumSeqs: stage.slots }), 'mrv2')
      return graphs.length
    },
  },
}
