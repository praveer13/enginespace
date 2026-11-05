/**
 * The Inspection's levels (GAMES.md §11 "Levels"): `due`, `warm`, `sure` and `court`, what each asks, and the cases a seed deals to it.
 *
 * Every case is a seed and a flaw, and the corpus builds the scene from them (cases.ts). A level decides only which flaws it deals:
 *   - `due` deals a harness whose timer starts at the send (coordinated omission, or a client queue hidden by the timer): the lesson is
 *     to time the log again from the due times;
 *   - `warm` deals the counted warm-up, or a fair inspection: the lesson is the course's rule for the cut, and that a settled log needs none;
 *   - `sure` deals a p99 from a handful of orders, or a fair inspection: the lesson is how many orders a p99 needs, and the interval;
 *   - `court` deals five cases that mix every flaw, with at least one latency-from-due case and one small-sample case (GAMES.md §11).
 * A single-case level takes its flaw from the seed, `seed mod` the number of flaws it deals, so any run of consecutive seeds holds each
 * once. The court draws its five seeds and its three free flaws from the seed's own streams, and shuffles the five so that a case's place
 * in the court says nothing about its flaw.
 *
 * The pass is ASSESSMENT §4.3's: right on the one case of `due`, `warm` and `sure`, and four of five at the court [estimated].
 */
import { assertSeed, below, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import type { BenchLevel, BenchLevelId, CaseSlot, Flaw } from './types'
import { LEVEL_IDS } from './types'

export { LEVEL_IDS }

interface LevelDef {
  readonly title: string
  readonly prompt: string
  readonly cases: number
  readonly needed: number
  /** The flaws a single-case level deals, in the order that `seed mod` their number picks them. */
  readonly flaws?: readonly Flaw[]
}

/*
 * The copy carries no digit: a figure on screen is a Readout that tags it. The kitchen's word names the object and the engine's term
 * rides beside it (GAMES.md §2.6, rule 2).
 */
const DEFS: Readonly<Record<BenchLevelId, LevelDef>> = {
  due: {
    title: 'From the due time',
    prompt:
      'A kitchen quotes a p99 off its stopwatch log. The log keeps when each guest was due as well as when their order was taken. Name the flaw, time the log again from the due times, and write down the p99 the report should have had, with the range you stand behind.',
    cases: 1,
    needed: 1,
    flaws: ['coordinated-omission', 'client-queue-hidden'],
  },
  warm: {
    title: 'The warm-up cut',
    prompt:
      "A report may have timed the first tables while the ovens heat. The course fixes the cut before the run and checks after it that the log had settled. Apply the rule: name the flaw, or say that the inspection is fair, and write down the p99 that stands, with a range.",
    cases: 1,
    needed: 1,
    flaws: ['warm-up-counted', 'none'],
  },
  sure: {
    title: 'How sure',
    prompt:
      'A p99 needs orders beyond it, and an interval says how far to trust it. Count what lies beyond this report\'s p99, name the flaw or say that the inspection is fair, and write down the p99 a long enough run would show, with the range you stand behind.',
    cases: 1,
    needed: 1,
    flaws: ['too-few-samples', 'none'],
  },
  court: {
    title: 'The court',
    prompt:
      'Five reports come before the court, each with its setup and its log. In each, name the flaw (or find none), write down the p99 the report should have had, and give a range. Four of the five must stand, with the flaw and the number right.',
    cases: 5,
    needed: 4,
  },
}

export const isLevelId = (id: string): id is BenchLevelId => (LEVEL_IDS as readonly string[]).includes(id)

/** The flaws of a latency-from-due case in the court: the timer starts at the send (GAMES.md §11). */
const FROM_DUE: readonly Flaw[] = ['coordinated-omission', 'client-queue-hidden']

/** The five cases of a court: one from the due time, one of too few samples, three drawn from all eleven, in an order the seed shuffles. */
function courtSlots(seed: Seed): CaseSlot[] {
  const seeds = rngFor(seed, 'broken-bench/court/seeds')
  const flaws = rngFor(seed, 'broken-bench/court/flaws')
  const slots: CaseSlot[] = [
    { seed: seeds(), flaw: FROM_DUE[below(flaws, FROM_DUE.length)] },
    { seed: seeds(), flaw: 'too-few-samples' },
    { seed: seeds(), flaw: BENCH_FLAWS[below(flaws, BENCH_FLAWS.length)] },
    { seed: seeds(), flaw: BENCH_FLAWS[below(flaws, BENCH_FLAWS.length)] },
    { seed: seeds(), flaw: BENCH_FLAWS[below(flaws, BENCH_FLAWS.length)] },
  ]
  // Fisher-Yates from the end, with unbiased draws.
  const order = rngFor(seed, 'broken-bench/court/order')
  for (let i = slots.length - 1; i > 0; i--) {
    const j = below(order, i + 1)
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots
}

/** The cases a level deals on a seed. */
export function slotsOf(id: BenchLevelId, seed: Seed): CaseSlot[] {
  assertSeed(seed)
  const def = DEFS[id]
  if (def.flaws !== undefined) return [{ seed, flaw: def.flaws[seed % def.flaws.length] }]
  return courtSlots(seed)
}

/** The level `id` on `seed`. Throws for a level the Inspection does not have. */
export function buildLevel(id: string, seed: Seed): BenchLevel {
  if (!isLevelId(id)) throw new RangeError(`the Inspection has no level "${id}"`)
  assertSeed(seed)
  const def = DEFS[id]
  return { id, seed, title: def.title, prompt: def.prompt, slots: slotsOf(id, seed), needed: def.needed }
}

/** The titles of the levels, for the registry's record and its test. */
export const levelTitle = (id: BenchLevelId): string => DEFS[id].title

/** How many cases a level holds. */
export const casesOf = (id: BenchLevelId): number => DEFS[id].cases
