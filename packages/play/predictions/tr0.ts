/**
 * TR0's predictions, read from Tensor views' runs (plan.ts says which run answers which).
 *
 * The world of a run is the tensor its level plays: the start, the target and the reference's plan, which `../shape-shifter/levels` builds
 * from the run's seed with `packages/sim/tensor`. A question about the copy the reference makes is answered by that plan on the run's own
 * level, so a lesson's guess and the level's opening guess read the same figure. On `grid` the world is the tensor to cover and the
 * reference's launch over it, and a question about masked lanes is answered by that launch.
 */
import { buildLevel } from '../shape-shifter/levels'
import type { GridLevel, LayoutLevel } from '../shape-shifter/types'
import type { RunRecord } from '../types'
import { requireRun } from './types'
import type { Reference } from './types'

const GAME = 'shape-shifter'

/** The layout level that a run played, as the game builds it on the run's seed. */
function levelOf(run: RunRecord, level: string): LayoutLevel {
  requireRun(run, GAME, level)
  const built = buildLevel(run.level, run.seed)
  if (built.kind !== 'layout') throw new RangeError(`${run.level} is not a layout level`)
  return built
}

/** The grid level that a run played, as the game builds it on the run's seed: the practice tensor on its pinned seed. */
function gridOf(run: RunRecord): GridLevel {
  requireRun(run, GAME, 'grid')
  const built = buildLevel(run.level, run.seed)
  if (built.kind !== 'grid') throw new RangeError(`${run.level} is not the grid level`)
  return built
}

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr0.l1.p1': {
    says: ['`(4, 6)`', 'column by column', 'one copy'],
    reads: "Counted from the reference's plan on the run's tensor: the elements its one copy writes into a new buffer.",
    truth: (run) => levelOf(run, 'views').tasks[0].moved,
  },
  'tr0.l4.p1': {
    says: ['`(12, 20)`', 'exactly once', 'six programs'],
    reads: "Counted from the reference's launch on the run's tensor: the lanes of its programs that fall past the tensor's edge, the fewest of any launch that covers it in the level's programs.",
    truth: (run) => gridOf(run).tasks[0].least,
  },
}
