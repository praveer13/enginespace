/*
 * The one knob that every seeded property reads: how many seeds it runs (ARCHITECTURE §5.10). A pull request runs 200 of them and
 * the nightly run 10,000 [estimated]. A property that loops over seeds takes its seeds from here, and never from a number of its own:
 *
 *   const SEEDS = seeds(1)                 // 1 … SEED_COUNT
 *   for (const seed of SEEDS) { … }
 *   test(`holds over ${SEEDS.length} seeds`, …)
 *
 * The variable is ES_PROPERTY_SEEDS. It is unset on a pull request, so a property runs its 200. nightly.yml's `properties` job sets it
 * to 10000 and runs the suite, with a longer time for each test, because one property over that many seeds is one test that runs for a
 * while (Bun's five seconds a test are for a pull request). The knob only raises the count: a lower one would let a property that
 * asserts what its 200 seeds cover (every world, both graph modes) pass without that coverage. It has a ceiling too, a typo's.
 *
 * A property that is too slow to run over every seed, such as one on a store, may take a prefix of them (`SEEDS.slice(0, 40)`), which
 * the nightly count leaves as it is. tests/ci/seeds.test.ts holds the suites to all of this, and reads nightly.yml and A§5.10.
 */

/** What a pull request runs [estimated, A§5.10]. */
export const PR_SEEDS = 200

/** What the nightly run asks for [estimated, A§5.10]. */
export const NIGHTLY_SEEDS = 10_000

/** The most a run may ask for, a hundred nightly runs: a typo of a digit or two would otherwise be a run that never ends. */
export const MAX_SEEDS = 1_000_000

/** The seed count that a value of ES_PROPERTY_SEEDS asks for. Anything but a whole number from `PR_SEEDS` to `MAX_SEEDS` is an error. */
export function seedCountFrom(value: string | undefined): number {
  if (value === undefined || value === '') return PR_SEEDS
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`ES_PROPERTY_SEEDS must be a whole number of seeds, and it is "${value}"`)
  const count = Number(value)
  if (count < PR_SEEDS) {
    throw new Error(`ES_PROPERTY_SEEDS is ${value}, and a run has at least the ${PR_SEEDS} seeds of a pull request: the knob only raises the count`)
  }
  if (count > MAX_SEEDS) throw new Error(`ES_PROPERTY_SEEDS is ${value}, and a run has at most ${MAX_SEEDS.toLocaleString('en-US')} seeds: is a digit too many?`)
  return count
}

/** The number of seeds this run gives every property. */
export const SEED_COUNT = seedCountFrom(process.env.ES_PROPERTY_SEEDS)

/** `count` consecutive seeds from `first`: `seeds(1)` is 1 … SEED_COUNT, and `seeds(0)` is 0 … SEED_COUNT - 1. */
export const seeds = (first = 0, count = SEED_COUNT): number[] => Array.from({ length: count }, (_, index) => first + index)
