/**
 * TR2's predictions, read from the Step loop's runs (W1b-T02, R-T09; plan.ts says which run answers which).
 *
 * The world of a run of a full level is the level's stages on its seed: the cost card each stage names, the host presets of the runners it
 * serves with, the batch slots it serves on and the sizes it drills. A question that the lesson asks about those is answered by the course's
 * own functions on that world, and the level builds the same stage whatever the learner does, so the reading is of the stage and not of the
 * learner's nights. The first lesson's question is asked in the ticks of the front page's level `first-3-gap`, and its reading is a step of
 * that level's own night, played with async scheduling off.
 */
import { hostOf, CARDS } from '../loop/full/night'
import { buildFullLevel } from '../loop/full/levels'
import type { StageId, StageWorld } from '../loop/full/types'
import { capturedGraphs, gpuLayers, makeGraphConfig } from '@es/sim/steploop'
import { frontPageWorkload, simNight } from '../loop/levels'
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

/** The share of the clock that the GPU is busy in a steady step of `first-3-gap`'s night with nothing overlapped, in per cent: a step that admits no request, and the idle time before it. */
function steadyBusyPercent(run: RunRecord): number {
  requireRun(run, GAME, 'first-3-gap')
  const workload = frontPageWorkload(run.seed)
  const night = simNight({ ...workload, reqs: workload.reqs.slice(0, 6) }, 'continuous', false)
  const step = night.steps.find((candidate) => candidate.index > 0 && candidate.prefillSeqs === 0 && candidate.bubbleUs > 0)
  if (step === undefined) throw new RangeError('the night of first-3-gap has no steady step')
  return (100 * step.gpuUs) / (step.gpuUs + step.bubbleUs)
}

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr2.l1.p1': {
    says: ['2 ticks', '4 ticks', '1 tick', 'Nothing overlaps'],
    reads: "Read from a steady step of this level's own night with async scheduling off: the forward, over the forward and the idle time before it.",
    truth: steadyBusyPercent,
  },
  'tr2.l4.p1': {
    says: ['12 rows', '8 µs', '60 µs', '31 µs', '2 µs, 20 µs and 15 µs'],
    reads: "Read from the V2 level's host cards, the legacy runner's and MRV2's: the CPU's work in a decode step with every batch slot full, the phases that differ, less MRV2's.",
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
    reads: "Read from the eager-launch stage's host card and its small model: a step launched kernel by kernel, less one replay of the captured graph.",
    truth: (run) => {
      const stage = stageOf(run, 'graphs', 'comb')
      const host = hostOf(stage, 'mrv2')
      return host.kernelsPerLayer * gpuLayers(CARDS[stage.card]) * host.launchPerKernelUs - host.graphReplayUs
    },
  },
  'tr2.l6.p1': {
    says: ['12 requests', '1, 2, 4, 8, 12, 16 and 24', 'FULL_AND_PIECEWISE'],
    reads: "Counted from the eager-launch stage's batch slots and the sizes vLLM captures for them: the graphs MRV2 captures in the mode that mixes full and piecewise graphs.",
    truth: (run) => {
      const stage = stageOf(run, 'graphs', 'comb')
      const graphs = capturedGraphs(makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: stage.house.captureSizes, maxNumSeqs: stage.slots }), 'mrv2')
      return graphs.length
    },
  },
}
