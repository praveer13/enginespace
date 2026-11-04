/*
 * Shared by tests/sim/spec*.test.ts (W1-T26). Not a test: bun test collects only *.test.ts.
 */
import { rngFor } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'

/*
 * The seed knob (ARCHITECTURE §5.10): a property runs 200 seeds on a PR and 10,000 in the nightly run [estimated], and reads the count
 * from the environment variable ES_PROPERTY_SEEDS. This block mirrors the knob that the W1 carry-over builds as tests/seeds.ts, with
 * the same name, default and refusals, so that these suites reach the nightly count whichever of the two merges first. Once that file is
 * in wave-1, replace the block with `import { SEED_COUNT, seeds } from '../seeds'`.
 */
export const PR_SEEDS = 200

/** The seed count that a value of ES_PROPERTY_SEEDS asks for. Anything but a whole number of at least PR_SEEDS is an error. */
export function seedCountFrom(value: string | undefined): number {
  if (value === undefined || value === '') return PR_SEEDS
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`ES_PROPERTY_SEEDS must be a whole number of seeds, and it is "${value}"`)
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < PR_SEEDS) throw new Error(`ES_PROPERTY_SEEDS is ${value}, and a run has at least the ${PR_SEEDS} seeds of a pull request: the knob only raises the count`)
  return count
}

/** The number of seeds this run gives every property. */
export const SEED_COUNT = seedCountFrom(process.env['ES_PROPERTY_SEEDS'])

/** `count` consecutive seeds from `first`: `seeds(1)` is 1 … SEED_COUNT, and `seeds(0)` is 0 … SEED_COUNT - 1. */
export const seeds = (first = 0, count = SEED_COUNT): number[] => Array.from({ length: count }, (_, index) => first + index)

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
