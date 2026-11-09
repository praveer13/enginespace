/*
 * The Inspection's levels (GAMES.md §11 "Levels", "Band"; ASSESSMENT §4.1, §4.3): what each level deals, how the court is composed, how a
 * seed the corpus flags is repaired, and the blind-strategy bound of every graded level, which `verify:games` does not measure yet
 * ("Not checked yet ... ASSESSMENT §4.1's blind-strategy bound for graded levels, which needs each graded level's blind strategies").
 *
 *   - A single-case level takes its flaw from the seed, `seed mod` the flaws it deals, so any two consecutive seeds hold each once.
 *   - A court has five cases with at least one latency-from-due case and one small-sample case, whatever the seed, in an order that says
 *     nothing about the flaw.
 *   - A seed whose first draw the corpus flags is redrawn from another seed of its own stream, and the case keeps the band.
 *   - The best scene-blind strategy, a constant for the number handed the flaw's label (more than a blind strategy is told), passes a single
 *     case of a graded level at most 15% of the time [estimated bound, ASSESSMENT §4.1], so a court passes four of five at most 0.22% of
 *     the time [derived: 5 q⁴ (1 − q) + q⁵ at q = 0.15, under the 0.34% of three fresh seeds in a row]. The rates are printed.
 *
 * The cases are the corpus's and cost about 26 ms each [measured 2026-11-04], so the blind measure judges the constants chosen on half of
 * 1,100 cases against the other half on a pull request, and the cases of 10,000 seeds in-sample in the nightly run (ARCHITECTURE §5.10):
 * the knob and the cases of tests/sim/bench-broken.test.ts, which this file shares with it when both run in one process.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bestConstantPerLabel, brokenBenchCase } from '@es/sim/bench'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { REDRAWS, caseOf } from '@es/play/broken-bench/cases'
import { LEVEL_IDS, buildLevel, casesOf, isLevelId, levelTitle, slotsOf } from '@es/play/broken-bench/levels'
import type { Flaw } from '@es/play/broken-bench/types'
import { BLIND_SEEDS, NIGHTLY_SEEDS, casesOf as corpusCases, drawnCases, pct } from '../sim/bench-broken-support'

const root = path.resolve(import.meta.dirname, '../..')
const report: string[] = []
const say = (line: string) => report.push(line)
afterAll(() => {
  console.log(['', 'The Inspection:', ...report].join('\n'))
})

const MINUTES = 30 * 60_000

describe('what each single-case level deals', () => {
  const EXPECTED: Record<string, readonly Flaw[]> = {
    due: ['coordinated-omission', 'client-queue-hidden'],
    warm: ['warm-up-counted', 'none'],
    sure: ['too-few-samples', 'none'],
  }

  test.each(Object.entries(EXPECTED))('%s deals %j, one in two seeds each, and any two consecutive seeds hold both', (id, flaws) => {
    for (let seed = 0; seed < 40; seed++) {
      const slots = slotsOf(id as 'due', seed)
      expect(slots).toEqual([{ seed, flaw: flaws[seed % 2] }])
      expect(new Set([slotsOf(id as 'due', seed)[0].flaw, slotsOf(id as 'due', seed + 1)[0].flaw]).size).toBe(2)
    }
    expect(casesOf(id as 'due')).toBe(1)
  })

  test('the practice seed of each level deals the flaw the level teaches', () => {
    expect(slotsOf('due', 0)[0].flaw).toBe('coordinated-omission')
    expect(slotsOf('warm', 0)[0].flaw).toBe('warm-up-counted')
    expect(slotsOf('sure', 0)[0].flaw).toBe('too-few-samples')
  })

  test('a level has a title, a prompt without a figure in it (the name p99 apart), and a pass', () => {
    for (const id of LEVEL_IDS) {
      const level = buildLevel(id, 0)
      expect(level.title).toBe(levelTitle(id))
      expect(level.prompt.length).toBeGreaterThan(80)
      expect(level.prompt.replaceAll('p99', '')).not.toMatch(/\d/)
      expect(level.needed).toBe(id === 'court' ? 4 : 1)
      expect(level.slots).toHaveLength(casesOf(id))
    }
    expect(isLevelId('court')).toBe(true)
    expect(isLevelId('rain-and-relay')).toBe(false)
  })
})

const COURTS = 2000
const courts = Array.from({ length: COURTS }, (_, seed) => slotsOf('court', seed))

describe('the court', () => {
  test('has five cases whose seeds are 32-bit integers, one of them a latency-from-due case and one of too few samples, whatever the seed', () => {
    for (const slots of courts) {
      expect(slots).toHaveLength(5)
      for (const slot of slots) {
        expect(Number.isInteger(slot.seed) && slot.seed >= 0 && slot.seed < 2 ** 32).toBe(true)
        expect(BENCH_FLAWS).toContain(slot.flaw)
      }
      expect(slots.some((slot) => slot.flaw === 'coordinated-omission' || slot.flaw === 'client-queue-hidden')).toBe(true)
      expect(slots.some((slot) => slot.flaw === 'too-few-samples')).toBe(true)
      expect(new Set(slots.map((slot) => slot.seed)).size).toBe(5)
    }
  })

  test('puts each kind of flaw in each place about as often, so that a place says nothing about a flaw', () => {
    const kinds = {
      'from the due time': (flaw: Flaw) => flaw === 'coordinated-omission' || flaw === 'client-queue-hidden',
      'too few samples': (flaw: Flaw) => flaw === 'too-few-samples',
      'a fair inspection': (flaw: Flaw) => flaw === 'none',
    }
    for (const [kind, is] of Object.entries(kinds)) {
      const inPlace = [0, 0, 0, 0, 0]
      for (const slots of courts) slots.forEach((slot, place) => (inPlace[place] += is(slot.flaw) ? 1 : 0))
      const overall = inPlace.reduce((a, b) => a + b, 0) / (COURTS * 5)
      say(`  ${kind}: place 1 to 5 holds one in ${inPlace.map((count) => pct(count, COURTS)).join(', ')} of ${COURTS} courts (the five places together, ${(100 * overall).toFixed(1)}%)`)
      // Sampling error of a share near a third over 2,000 courts is about 1 point, and a place that said something would be 10 points out.
      for (const count of inPlace) expect(Math.abs(count / COURTS - overall)).toBeLessThan(0.05)
    }
  })

  test('draws every flaw, the control included, so that rejecting everything fails', () => {
    const seen = new Map<Flaw, number>()
    for (const slots of courts) for (const slot of slots) seen.set(slot.flaw, (seen.get(slot.flaw) ?? 0) + 1)
    say(`  the flaws of ${COURTS * 5} court cases: ${BENCH_FLAWS.map((flaw) => `${flaw} ${pct(seen.get(flaw) ?? 0, COURTS * 5)}`).join(', ')}`)
    for (const flaw of BENCH_FLAWS) expect((seen.get(flaw) ?? 0) / (COURTS * 5)).toBeGreaterThan(0.02)
  })

  test('is a function of its seed', () => {
    expect(slotsOf('court', 77)).toEqual(slotsOf('court', 77))
    expect(slotsOf('court', 77)).not.toEqual(slotsOf('court', 78))
  })
})

describe('a seed the corpus flags is repaired, and the case keeps the band', () => {
  /** The seeds of 0 to 9,999 whose first draw the corpus flags, found by one scan on 2026-11-04 (133 s, 11,076 draws for 10,000 seeds) [measured at the W1-T33 build]. */
  const file = path.join(root, 'tests/fixtures/play/broken-bench-flagged.json')
  const flagged: { seed: number; flaw: Flaw }[] = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { flagged: { seed: number; flaw: Flaw }[] }).flagged : []

  test('the scan found them, and the corpus still flags each', () => {
    expect(flagged.length).toBeGreaterThan(0)
    for (const { seed, flaw } of flagged) expect([seed, flaw, brokenBenchCase(seed, { flaw }).band.ok]).toEqual([seed, flaw, false])
  }, MINUTES)

  test('the level redraws from a stream of the case\'s own seed, to a case that is in band, the same one every time', () => {
    for (const { seed, flaw } of flagged) {
      const built = caseOf({ seed, flaw })
      expect(built.c.band.ok).toBe(true)
      expect(built.seed).not.toBe(seed)
      expect(built.c.flaw).toBe(flaw)
      expect(built.c.seed).toBe(built.seed)
      expect(caseOf({ seed, flaw })).toBe(built)
    }
    say(`  the corpus flags ${flagged.length} of 10,000 seeds at the flaw their own seed picks, and the level redraws each within ${REDRAWS + 1} tries [measured 2026-11-04 by tests/fixtures/play/broken-bench-flagged.json]`)
  }, MINUTES)
})

describe('the blind-strategy bound (ASSESSMENT §4.1)', () => {
  const BOUND = 0.15
  const TOLERANCE = 150

  /** The answers of the corpus's cases of one flaw, in seed order: the first PER_LABEL of seeds that draw it. */
  const PER_LABEL = 100
  const answers = (flaw: Flaw): number[] => corpusCases(flaw, PER_LABEL).map((c) => c.answer.p99Us)

  /** The share of `truths` that a constant passes: within ±15% of each. */
  const passes = (constant: number, truths: readonly number[]): number => truths.filter((t) => Math.abs(constant - t) * 1000 <= TOLERANCE * t).length

  /** The constant that passes the most of `truths`: of the 1.15 times each, which is where a window of answers starts. */
  function bestConstant(truths: readonly number[]): number {
    let best = truths[0]
    let most = -1
    for (const t of truths) {
      const candidate = (t * (1000 + TOLERANCE)) / 1000
      const count = passes(candidate, truths)
      if (count > most) {
        most = count
        best = candidate
      }
    }
    return best
  }

  /**
   * What a constant per flaw label passes of a level's cases when it is handed the label, which a blind strategy is not, so the rate is an
   * upper bound on one. Each flaw counts by the share of the level's cases that deal it. On a pull request the constant is chosen on the
   * even-numbered cases of a flaw and judged on the odd-numbered; in the nightly run it is chosen on the cases it is judged on.
   */
  function handedTheLabel(weights: ReadonlyMap<Flaw, number>): { rate: number; byFlaw: Map<Flaw, number> } {
    const byFlaw = new Map<Flaw, number>()
    if (BLIND_SEEDS >= NIGHTLY_SEEDS) {
      // Five fields of each case, and not the cases: 10,000 of them with their logs were 6.7 GB (tests/seeds.ts).
      const all = bestConstantPerLabel(drawnCases())
      for (const flaw of all.perFlaw) byFlaw.set(flaw.flaw, flaw.passedPermille / 1000)
    } else {
      for (const flaw of weights.keys()) {
        const truths = answers(flaw)
        const train = truths.filter((_, i) => i % 2 === 0)
        const test = truths.filter((_, i) => i % 2 === 1)
        byFlaw.set(flaw, passes(bestConstant(train), test) / test.length)
      }
    }
    let rate = 0
    for (const [flaw, weight] of weights) rate += weight * (byFlaw.get(flaw) ?? 0)
    return { rate, byFlaw }
  }

  const sizeNote = BLIND_SEEDS >= NIGHTLY_SEEDS ? `chosen on the ${BLIND_SEEDS} cases it is judged on (an upper bound)` : `chosen on half of ${PER_LABEL} cases of each flaw, judged on the other half`

  test.each(['due', 'warm', 'sure'] as const)(
    '%s: a constant for the number, handed the flaw, passes at most 15% of the seeds',
    (id) => {
      const weights = new Map<Flaw, number>()
      for (let seed = 0; seed < 1000; seed++) weights.set(slotsOf(id, seed)[0].flaw, (weights.get(slotsOf(id, seed)[0].flaw) ?? 0) + 1 / 1000)
      const { rate, byFlaw } = handedTheLabel(weights)
      // The strategy that names one flaw, always, passes only where that flaw is the true one: the share of that flaw times its rate.
      const naming = Math.max(...[...weights].map(([flaw, weight]) => weight * (byFlaw.get(flaw) ?? 0)))
      say(
        `  ${id}: handed the flaw, the best constant per flaw passes ${(100 * rate).toFixed(1)}% (${[...weights].map(([flaw]) => `${flaw} ${(100 * (byFlaw.get(flaw) ?? 0)).toFixed(1)}%`).join(', ')}); naming one flaw always, ${(100 * naming).toFixed(1)}%; ${sizeNote}`,
      )
      expect(rate).toBeLessThanOrEqual(BOUND)
      expect(naming).toBeLessThanOrEqual(rate)
    },
    MINUTES,
  )

  test('the court: handed each case\'s flaw, a constant passes at most 15% of the cases, so four of five pass at most 0.22% of the courts', () => {
    const weights = new Map<Flaw, number>()
    for (const slots of courts) for (const slot of slots) weights.set(slot.flaw, (weights.get(slot.flaw) ?? 0) + 1 / (courts.length * 5))
    const { rate: q, byFlaw } = handedTheLabel(weights)
    const four = 5 * q ** 4 * (1 - q) + q ** 5
    say(
      `  court: handed each case's flaw, the best constant per flaw passes ${(100 * q).toFixed(1)}% of the cases (${[...weights].map(([flaw]) => `${flaw} ${(100 * (byFlaw.get(flaw) ?? 0)).toFixed(1)}%`).join(', ')}), so four of five pass ${(100 * four).toFixed(3)}% of courts; ${sizeNote}`,
    )
    expect(q).toBeLessThanOrEqual(BOUND)
    expect(four).toBeLessThan(BOUND ** 3)
    expect(5 * BOUND ** 4 * (1 - BOUND) + BOUND ** 5).toBeLessThan(0.0023)
  }, MINUTES)
})
