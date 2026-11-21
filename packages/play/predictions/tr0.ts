/**
 * TR0's predictions, read from Tensor views' runs (plan.ts says which run answers which).
 *
 * The world of a run is the tensor its level plays: the start, the target and the reference's plan, which `../shape-shifter/levels` builds
 * from the run's seed with `packages/sim/tensor`. A question about the copy the reference makes is answered by that plan on the run's own
 * level, so a lesson's guess and the level's opening guess read the same figure.
 */
import { buildLevel } from '../shape-shifter/levels'
import type { LayoutLevel } from '../shape-shifter/types'
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

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr0.l1.p1': {
    says: ['`(4, 6)`', 'column by column', 'one copy'],
    reads: "Counted from the reference's plan on the run's tensor: the elements its one copy writes into a new buffer.",
    truth: (run) => levelOf(run, 'views').tasks[0].moved,
  },
}
