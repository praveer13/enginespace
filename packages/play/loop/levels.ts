/**
 * Service's front-page levels (`first-1-fill` to `first-4-par`, GAMES.md §3.1, D-043): the world they share, what each level
 * asks, and the band that makes a seed a fair question.
 *
 * The world is the step-loop model on its synthetic tick card (`TICK_CARD`, packages/sim/steploop): a rail of 4 clips [estimated],
 * tickets that all wait at once, and a table for each ticket that asks for the check after 1 to 16 courses, drawn from a
 * heavy-tailed menu. The workload is the one W0-T13 measured the spike on (tests/fixtures/sim/steploop.json, seed 1), so the numbers
 * the spike recorded are the numbers this front page plays.
 *
 * Levels 1 to 3 are beats of one service on six tickets: fill the rail, a clip empties, mind the gap. Each opens where the
 * visitor would plausibly be after the beat before it, so a level can be played on its own. Level 4 is the burst of twelve against
 * par, a night in which refilling alone and overlap alone each leave the clock well above the reference's.
 */
import { assertSeed } from '@es/sim/core'
import type { Seed, Us } from '@es/sim/core'
import { TICK_CARD, runStepLoop } from '@es/sim/steploop'
import type { StepLoopConfig, StepLoopRun } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import type { Workload, WorkloadSpec } from '@es/sim/workload'
import type { LeverAccess, LoopGoal, LoopLevel, LoopLevelId } from './types'

/** Clips on the rail (D-043) [estimated]. */
export const SLOTS = 4

/**
 * Twelve tickets due at once. A ticket's prompt is one token, so admitting it is the one tick more that a fire costs; its table asks
 * for 1 to 16 courses, from a menu with a long tail [estimated]. Seed 1 is the practice seed of `first-4-par` (the spike's goldens).
 */
export const FRONT_PAGE_SPEC: WorkloadSpec = {
  requests: 12,
  arrivals: { kind: 'burst' },
  lengths: {
    kind: 'dists',
    prompt: { kind: 'const', value: 1 },
    output: { kind: 'menu', values: [1, 2, 3, 4, 6, 8, 12, 16], weights: [24, 20, 16, 12, 10, 8, 6, 4] },
  },
}

/** A time no run of this world reaches (the world takes a few hundred ticks), so no horizon cuts a run. */
export const HORIZON_US: Us = 1_000_000

/** The pass mark of the front page [estimated]: a score of at least 0.9 is within a tenth of the reference (`grade`, ASSESSMENT.md owns real bars). */
export const PASS_SCORE = 0.9

export const LEVEL_IDS: readonly LoopLevelId[] = ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par']

interface LevelDef {
  readonly title: string
  readonly prompt: string
  readonly requests: number
  readonly opening: number | null
  readonly goal: LoopGoal
  readonly overlap: LeverAccess
}

/*
 * The copy follows GAMES.md §2.6 ("First service's copy"): the kitchen word names the object and the engine term rides beside it.
 * It carries no digit, so no number goes untagged: the counters are Readouts, and the mirror holds every figure.
 */
const DEFS: Readonly<Record<LoopLevelId, LevelDef>> = {
  'first-1-fill': {
    title: 'Fill the rail',
    prompt: 'Tap a ticket to hang it on the rail (put a request in the batch). Hang as many as there are clips, then ring the bell.',
    requests: 6,
    opening: null,
    goal: 'first-fire',
    overlap: 'locked',
  },
  'first-2-slot': {
    title: 'A clip empties',
    prompt:
      'Ring the bell until a ticket ends. Its clip opens and the line waits for you: hang the next ticket (refill the slot), or ring the bell to leave the clip empty.',
    requests: 6,
    opening: 1,
    goal: 'first-stop-handled',
    overlap: 'locked',
  },
  'first-3-gap': {
    title: 'Mind the gap',
    prompt:
      'The stations go dark between fires while the expo writes the next call. Turn on "Write the next call during this fire" (overlap, async scheduling), then keep ringing the bell until a plate is binned.',
    requests: 6,
    opening: 2,
    goal: 'first-ghost',
    overlap: 'free',
  },
  'first-4-par': {
    title: 'Your turn',
    prompt:
      'A burst of tickets and both tools: refill every clip the moment it opens, and write the next call during the fire. Serve every ticket and beat par.',
    requests: 12,
    opening: null,
    goal: 'all-served',
    overlap: 'free',
  },
}

const isLevelId = (id: string): id is LoopLevelId => Object.hasOwn(DEFS, id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The world on the sim                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The twelve tickets of a seed. */
export const frontPageWorkload = (seed: Seed): Workload => genWorkload(seed, FRONT_PAGE_SPEC)

/**
 * The sim's configuration for this world: the rail's clips, a token budget that never binds, and the two switches the front page
 * has. `batching: 'static'` fires the rail as a set, and `asyncScheduling` is overlap.
 */
export function frontConfig(batching: 'continuous' | 'static', asyncScheduling: boolean): StepLoopConfig {
  return {
    maxNumSeqs: SLOTS,
    maxBatchedTokens: 2048,
    chunkedPrefill: true,
    asyncScheduling,
    batching,
    inputIds: 'device',
    graphs: { mode: 'NONE', captureSizes: [] },
  }
}

/** One night of the burst on the sim, under the given switches. The tick card is both the host card and the GPU card. */
export function simNight(workload: Workload, batching: 'continuous' | 'static', asyncScheduling: boolean): StepLoopRun {
  return runStepLoop(workload, frontConfig(batching, asyncScheduling), TICK_CARD, TICK_CARD, { horizonUs: HORIZON_US })
}

/** The four services of one night that the band and the compare view speak of (GAMES.md §3.1, beat 4). */
export interface Services {
  /** Firing the rail as a set: static batching, no overlap. */
  readonly firedAsSet: StepLoopRun
  /** Refilling alone: continuous batching, no overlap. */
  readonly refillAlone: StepLoopRun
  /** Overlap alone: static batching with overlap. */
  readonly overlapAlone: StepLoopRun
  /** Both tools: continuous batching with overlap. The house run, whose clock is par. */
  readonly par: StepLoopRun
}

export function services(seed: Seed): Services {
  const workload = frontPageWorkload(seed)
  return {
    firedAsSet: simNight(workload, 'static', false),
    refillAlone: simNight(workload, 'continuous', false),
    overlapAlone: simNight(workload, 'static', true),
    par: simNight(workload, 'continuous', true),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Bands                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The band of `first-4-par` (GAMES.md §3.1): firing the rail as a set takes at least 1.25 times the ticks of refilling alone, which
 * takes at least 1.4 times par; overlap alone takes at least 1.15 times par; and par has at least 3 binned plates. Both tools are then
 * needed to reach par. The arithmetic is in integers (ticks times the ratio's numerator, against ticks times its denominator).
 */
export function inParBand(s: Services): boolean {
  const par = s.par.summary.clockUs
  return (
    s.firedAsSet.summary.clockUs * 4 >= s.refillAlone.summary.clockUs * 5 && // 1.25
    s.refillAlone.summary.clockUs * 5 >= par * 7 && // 1.4
    s.overlapAlone.summary.clockUs * 20 >= par * 23 && // 1.15
    s.par.summary.ghostTokens >= 3
  )
}

/**
 * The band of beats 1 to 3 (GAMES.md §3.2: "≥ 1 EOS within 3 steps"). The first ticket to end ends within 3 fires, whichever order the
 * visitor hangs the first four in, and not in the first: the shortest of the first four tables asks for 2 or 3 courses. A ticket
 * that ended in the first fire would leave beat 2 nothing to wait for ("the loop runs until the first request stops"), and one that
 * ran past 3 would leave the visitor ringing the bell with nothing to decide. The session adds that the house's opening must leave
 * the level open.
 */
export function inFirstBand(outputs: readonly number[]): boolean {
  const shortest = Math.min(...outputs.slice(0, SLOTS))
  return shortest >= 2 && shortest <= 3
}

/** Whether a seed makes `id` a fair question, by the sim alone. */
export function inLevelBand(id: LoopLevelId, seed: Seed): boolean {
  if (id === 'first-4-par') return inParBand(services(seed))
  return inFirstBand(outputsOf(seed, DEFS[id].requests))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Building a level                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How many courses each of the first `requests` tickets' tables will ask for, in ticket order. */
export const outputsOf = (seed: Seed, requests: number): number[] => frontPageWorkload(seed).reqs.slice(0, requests).map((req) => req.outputTokens)

/** The level `id` on `seed`. Throws for a level that Service does not have. */
export function buildLevel(id: string, seed: Seed): LoopLevel {
  if (!isLevelId(id)) throw new RangeError(`Service has no level "${id}"`)
  assertSeed(seed)
  const def = DEFS[id]
  return {
    id,
    seed,
    title: def.title,
    prompt: def.prompt,
    slots: SLOTS,
    outputs: outputsOf(seed, def.requests),
    opening: def.opening,
    goal: def.goal,
    overlap: def.overlap,
    par: id === 'first-4-par' ? services(seed).par.summary.clockUs : null,
  }
}

/** The titles of the levels, for the registry's record and its test. */
export const levelTitle = (id: LoopLevelId): string => DEFS[id].title
