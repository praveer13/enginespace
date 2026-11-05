/*
 * Shared by tests/sim/bench-broken*.test.ts (W1-T32). Not a test: bun test collects only *.test.ts.
 *
 * The cases are expensive (a case is one to four runs of the coarse server, 26 ms on average on the dev host [measured 2026-11-04]), so
 * they are made once per process and shared by every test that wants them.
 */
import { BENCH_FLAWS, brokenBenchCase } from '../../packages/sim/bench'
import type { BenchFlaw, BrokenCase } from '../../packages/sim/bench'

/*
 * The seed knob (ARCHITECTURE §5.10): a property runs 200 seeds on a PR and 10,000 in the nightly run [estimated], and reads the count from
 * the environment variable ES_PROPERTY_SEEDS. This block mirrors the knob that tests/sim/spec-support.ts mirrors, with the same name, default
 * and refusals, so that these suites reach the nightly count whichever of the shared file and this one is in wave-1 first.
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

/** The nightly count, from which the in-sample blind-strategy bound is judged: at fewer cases per flaw the best constant is chosen on too few to be a bound. */
export const NIGHTLY_SEEDS = 10_000

/** How many cases the blind-strategy measure draws: the knob's count at the nightly size, and 1,100 (100 for each flaw) on a PR [estimated]. */
export const BLIND_SEEDS = SEED_COUNT >= NIGHTLY_SEEDS ? SEED_COUNT : 1_100

/** Cases per flaw for the tests that read a case's log: 12 on a PR, 48 at the nightly count [estimated]. */
export const PER_FLAW = SEED_COUNT >= NIGHTLY_SEEDS ? 48 : 12

const made = new Map<number, BrokenCase>()

/** The case seed `seed` draws, made once. */
export function caseOf(seed: number): BrokenCase {
  let c = made.get(seed)
  if (c === undefined) {
    c = brokenBenchCase(seed)
    made.set(seed, c)
  }
  return c
}

/** The index of a flaw in `BENCH_FLAWS`, which is also the residue mod 11 of the seeds that draw it. */
export const flawIndex = (flaw: BenchFlaw): number => BENCH_FLAWS.indexOf(flaw)

/** `count` cases that draw `flaw`, from the seeds `first`, `first + 11`, …, each shifted onto the flaw's residue. */
export function casesOf(flaw: BenchFlaw, count: number = PER_FLAW, first = 0): BrokenCase[] {
  return Array.from({ length: count }, (_, k) => caseOf(first + k * BENCH_FLAWS.length + flawIndex(flaw)))
}

/** Nearest rank at `pPermille`, written out in integers: the ⌈p·n/1000⌉-th smallest. */
export function nearestRankOf(xs: readonly number[], pPermille: number): number {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor((pPermille * sorted.length + 999) / 1000) - 1]
}

/** The share of `part` in `whole`, as a percentage with one decimal. */
export const pct = (part: number, whole: number): string => `${((100 * part) / whole).toFixed(1)}%`
