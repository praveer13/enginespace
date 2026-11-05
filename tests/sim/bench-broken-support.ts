/*
 * Shared by tests/sim/bench-broken*.test.ts (W1-T32). Not a test: bun test collects only *.test.ts.
 *
 * The cases are expensive (a case is one to four runs of the coarse server, 26 ms on average on the dev host [measured 2026-11-04]), so
 * they are made once per process and shared by every test that wants them.
 */
import { BENCH_FLAWS, brokenBenchCase } from '../../packages/sim/bench'
import type { BenchFlaw, BrokenCase } from '../../packages/sim/bench'
import { NIGHTLY_SEEDS, SEED_COUNT } from '../seeds'

// The seed knob (ARCHITECTURE §5.10) is tests/seeds.ts: 200 seeds on a PR and 10,000 in the nightly run [estimated]. The in-sample
// blind-strategy bound is judged from the nightly size, because at fewer cases per flaw the best constant is chosen on too few to be a bound.
export { NIGHTLY_SEEDS, SEED_COUNT }

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
