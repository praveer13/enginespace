/*
 * Shared by tests/sim/spec*.test.ts (W1-T26). Not a test: bun test collects only *.test.ts.
 */
import { rngFor } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'

/** The two fresh seeds of trial `trial`'s lab attempt: uint32s from a sub-stream of the trial. */
export function labSeeds(trial: number): [number, number] {
  const rng = rngFor(trial, 'test/spec/lab-seeds')
  return [rng(), rng()]
}

export type Scripted = Rng & { used(): number }

/** A stream that returns `values` in order, counts the draws taken, and throws if it is asked for more. */
export function scripted(values: readonly number[]): Scripted {
  let used = 0
  const rng = (() => {
    if (used >= values.length) throw new Error(`the script has ${values.length} draws and a ${used + 1}th was asked for`)
    return values[used++]
  }) as Scripted
  rng.used = () => used
  return rng
}
