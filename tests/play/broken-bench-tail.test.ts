/*
 * The Inspection's tail gives nothing away (W1b-T11; W1-report §12; GAMES.md §11, "Core loop", step 2).
 *
 * A graded attempt does not say where the p99 sits. The summary says how many orders the desk measured, and the rule, `n − ⌈0.99 n⌉ + 1`
 * from the slowest, is the learner's to apply to the tail (src/games/broken-bench/Mirror.tsx). The tail used to list `max(12, place + 6)`
 * orders, "place" being where the p99 sits, so every tail of more than twelve lines ended six lines under the p99, and the seventh line from
 * the bottom was the answer to a learner who had not applied the rule: the count of lines was a function of the place.
 *
 * These tests hold the count to what a learner may see. Over the corpus's cases on a thousand seeds, at every desk a learner can set:
 *   - the tail has `min(n, TAIL_ROWS)` lines, `n` being the orders measured, which the summary prints. It does not depend on the stopwatch, on
 *     the times, or on where the p99 sits (the function is also handed a reading that puts the p99 elsewhere, and does not notice);
 *   - so every desk that measures as many orders as the tail holds has a tail of the same length, while its p99 sits in many places;
 *   - and the p99 is among the lines, with lines under it, so that counting down the tail still reads it.
 * A rule whose length did vary with the place fails the same checks: the old rule and two others are run through them at the end.
 *
 * What a learner may see of a case is its `SceneView` (cases.ts), which the page draws. The desks are the report's own, the same cut under the
 * other stopwatch, the course's cut at the due time, nothing cut, and a cut of the learner's own that the seed picks.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { BENCH_WARMUP_ROWS, benchWarmupRows } from '@es/sim/bench/broken-model'
import { caseOf } from '@es/play/broken-bench/cases'
import { TAIL_ROWS, harnessDesk, readingOf, tailOf } from '@es/play/broken-bench/desk'
import type { Desk } from '@es/play/broken-bench/desk'
import type { SceneView } from '@es/play/broken-bench/types'
import { SEED_COUNT, seeds } from '../seeds'

/** The fewest seeds the property runs, whatever the knob says (W1b-T11 asks for a thousand): a pull request's 200 draw few of the long logs [estimated]. The knob raises it. */
const LEAST_SEEDS = 1000
const SEEDS = seeds(0, Math.max(LEAST_SEEDS, SEED_COUNT))
/** The thousand seeds take 25 to 30 s on the dev host [measured 2026-11-09 at 397331b with this task's files], and the nightly run has ten times as many. */
const MINUTES = 30 * 60_000

const report: string[] = []
afterAll(() => {
  console.log(['', "The Inspection's tail:", ...report].join('\n'))
})

/** Where the p99 sits counting down from the slowest, for `n` orders measured: `n − ⌈0.99 n⌉ + 1`, written in integers. */
const placeOf = (n: number): number => n - Math.ceil((990 * n) / 1000) + 1

/** The desks a learner can set on a case: what the page opens on, then the stopwatch, the cut and a cut of the learner's own moved from it. */
function desksOf(scene: SceneView, seed: number): Desk[] {
  const opens = harnessDesk(scene.claim.timerStartsAt, scene.harnessCut)
  const own = (Math.imul(seed + 1, 0x9e3779b1) >>> 0) % scene.rows.length
  return [
    opens,
    // The same cut under the other stopwatch: only the clock has moved, and with it the times and the p99.
    { clock: opens.clock === 'due' ? 'sent' : 'due', cut: opens.cut },
    // The court's number for a counted warm-up: the due time, and the course's cut.
    { clock: 'due', cut: benchWarmupRows(scene.server.maxNumSeqs) },
    // The widest desk: nothing is cut, so the orders measured are the whole log, and the p99 sits deepest.
    { clock: 'sent', cut: 0 },
    { clock: 'due', cut: own },
  ]
}

interface Sample {
  readonly seed: number
  /** The orders measured: what the summary prints. */
  readonly n: number
  /** Where the p99 sits counting down from the slowest: what the rule gives, and what a graded attempt never says. */
  readonly place: number
  /** The lines of the tail. */
  readonly lines: number
}

interface Survey {
  readonly samples: readonly Sample[]
  /** Every desk that broke a check of the first test, in words. */
  readonly problems: readonly string[]
  /** The longest log among the cases, in orders. */
  readonly longest: number
}

let surveyed: Survey | undefined

/** Every case of the seeds at every desk, worked once. Only the few numbers a check reads are kept: a case holds its whole log. */
function survey(): Survey {
  if (surveyed !== undefined) return surveyed
  const samples: Sample[] = []
  const problems: string[] = []
  let longest = 0
  for (const seed of SEEDS) {
    const flaw = BENCH_FLAWS[seed % BENCH_FLAWS.length]
    // What the learner may see: the case as a level deals it, with the corpus's band kept.
    const { scene } = caseOf({ seed, flaw })
    longest = Math.max(longest, scene.rows.length)
    const lines: number[] = []
    for (const desk of desksOf(scene, seed)) {
      const reading = readingOf(scene.rows, desk)
      const tail = tailOf(scene.rows, desk, reading)
      const at = `seed ${seed} (${flaw}), ${desk.clock} clock, cut ${desk.cut}`
      samples.push({ seed, n: reading.n, place: reading.fromTop, lines: tail.length })
      lines.push(tail.length)
      const listed = tail.filter((line) => line.p99)
      if (tail.length !== Math.min(reading.n, TAIL_ROWS)) problems.push(`${at}: ${tail.length} lines for ${reading.n} orders`)
      if (listed.length !== 1 || listed[0].latencyUs !== reading.p99Us) problems.push(`${at}: the p99 is not listed once, at its time`)
      // Where the log fills the tail there are lines under the p99. A cut that leaves a few orders leaves a tail of a few, and may leave none.
      if (reading.n >= TAIL_ROWS && tail.length <= reading.fromTop) problems.push(`${at}: no line under the p99, which sits at place ${reading.fromTop}`)
    }
    // The stopwatch alone moves the times and the p99, and leaves the lines as they were.
    if (lines[0] !== lines[1]) problems.push(`seed ${seed} (${flaw}): moving the stopwatch changed the length of the tail`)
  }
  surveyed = { samples, problems, longest }
  return surveyed
}

describe(`over ${SEEDS.length} seeds`, () => {
  test('the tail has min(n, TAIL_ROWS) lines at every desk, lists the p99 with lines under it, and ignores the stopwatch', () => {
    const { samples, problems } = survey()
    expect(problems).toEqual([])
    report.push(`  ${SEEDS.length} seeds, ${samples.length} desks: every tail had min(n, ${TAIL_ROWS}) lines and listed its p99`)
  }, MINUTES)

  test('so every desk that measures as many orders as the tail holds has a tail of the same length, wherever its p99 sits', () => {
    const { samples } = survey()
    const filled = samples.filter((sample) => sample.n >= TAIL_ROWS)
    const places = new Set(filled.map((sample) => sample.place))
    const lengths = new Set(filled.map((sample) => sample.lines))
    report.push(
      `  ${filled.length} of the ${samples.length} desks measured ${TAIL_ROWS} orders or more: their p99 sat at ${places.size} different places, from ${Math.min(...places)} to ${Math.max(...places)} counting down, and their tail had ${[...lengths].join(', ')} lines`,
    )
    expect(places.size).toBeGreaterThanOrEqual(20)
    expect([...lengths]).toEqual([TAIL_ROWS])
  }, MINUTES)

  test('is a function of the orders measured: one length for each count of them, across every case and desk', () => {
    const { samples } = survey()
    const byOrders = new Map<number, Set<number>>()
    for (const sample of samples) byOrders.set(sample.n, (byOrders.get(sample.n) ?? new Set<number>()).add(sample.lines))
    for (const [n, lengths] of byOrders) expect([n, [...lengths]]).toEqual([n, [Math.min(n, TAIL_ROWS)]])
  }, MINUTES)

  test('is blind to the place and to the times: handed a reading that puts the p99 elsewhere, or a log with other times, it lists the same number of lines', () => {
    const { scene } = caseOf({ seed: 1000, flaw: BENCH_FLAWS[1000 % BENCH_FLAWS.length] })
    // The same orders with other times to first token, so that the p99 is another order, at another time, in another place in the tail.
    const other = scene.rows.map((row, i) => ({ ...row, firstUs: row.dueUs + 1 + ((i * 7919) % 100_000) }))
    for (const desk of desksOf(scene, 1000)) {
      const reading = readingOf(scene.rows, desk)
      const lines = tailOf(scene.rows, desk, reading).length
      for (const place of [1, 2, 7, 13, 40, 67, 120, 1000]) {
        const moved = { ...reading, fromTop: place, beyond: place - 1, p99Us: reading.p99Us * 3, meanUs: reading.meanUs * 2 }
        expect([desk, place, tailOf(scene.rows, desk, moved).length]).toEqual([desk, place, lines])
      }
      expect([desk, tailOf(other, desk).length]).toEqual([desk, lines])
    }
  })

  test('reaches the p99 of the longest log the corpus can deal, and of the longest dealt on these seeds, with lines under it', () => {
    const { longest } = survey()
    // The corpus's longest log: the warm-up rows and the most a heavy kit measures, 6,000 rows and two steps of 250 more (broken-kits.ts) [derived].
    const corpus = BENCH_WARMUP_ROWS + 6000 + 2 * 250
    const UNDER = 6
    expect(corpus).toBe(6628)
    expect(placeOf(corpus)).toBe(67)
    expect(TAIL_ROWS).toBeGreaterThanOrEqual(placeOf(corpus) + UNDER)
    expect(TAIL_ROWS).toBeGreaterThanOrEqual(placeOf(longest) + UNDER)
    report.push(
      `  the longest log on these seeds has ${longest} orders, with its p99 at place ${placeOf(longest)}; the corpus's longest has ${corpus} orders, with its p99 at place ${placeOf(corpus)} [derived]; the tail has ${TAIL_ROWS} lines`,
    )
  }, MINUTES)
})

describe('a length that varied with the place would be caught', () => {
  /** Whether a rule's lengths tell the place: desks that fill the tail, whose p99 sits at different places, are given different lengths. */
  function tellsThePlace(lines: (sample: Sample) => number): boolean {
    const filled = survey().samples.filter((sample) => sample.n >= TAIL_ROWS)
    return new Set(filled.map(lines)).size > 1 && new Set(filled.map((sample) => sample.place)).size > 1
  }

  test('lets the tail as it is through', () => {
    expect(tellsThePlace((sample) => sample.lines)).toBe(false)
    expect(tellsThePlace((sample) => Math.min(sample.n, TAIL_ROWS))).toBe(false)
  }, MINUTES)

  test.each([
    ['the old rule: a dozen lines, or the place and six more', (s: Sample) => Math.min(s.n, Math.max(12, s.place + 6))],
    ['the place and a fixed number more, with no least', (s: Sample) => Math.min(s.n, s.place + 20)],
    ['a share of the orders measured, which the place is a share of', (s: Sample) => Math.min(s.n, Math.ceil(s.n / 20))],
  ] as const)('stops %s', (_, lines) => {
    expect(tellsThePlace(lines)).toBe(true)
  }, MINUTES)
})
