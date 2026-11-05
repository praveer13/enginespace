/*
 * The inspector's desk (GAMES.md §11 "Core loop", step 2: "Inspect the log"): the stopwatch, the cut and what they read off the log.
 *
 * The desk is dumb on purpose: it times and counts whatever it is set to, and knows nothing of the flaw. The tests hold it to two things.
 * At its start, the report's own settings, it reads the report's own number (B6), which is how an inspector audits a report before
 * doubting it. And at the settings that a flaw's correction names, it reads exactly the number the court recomputes: the due clock for
 * the log re-timed, and the due clock with the course's cut for the counted warm-up. A learner who applies the rule to the log with the
 * desk's two instruments therefore gets the court's number, which is the point of the game (GAMES.md §11: "the only way to rule
 * correctly is to apply the rule to the log").
 */
import { describe, expect, test } from 'bun:test'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { BENCH_WARMUP_ROWS, benchWarmupRows } from '@es/sim/bench/broken-model'
import { caseOf } from '@es/play/broken-bench/cases'
import { BIN_EDGES_US, DECADE_EDGES_US, TAIL_BELOW, TAIL_MIN, binsOf, cutOf, harnessDesk, latencyUs, placeOf, readingOf, tailOf } from '@es/play/broken-bench/desk'
import { rulerOf } from '@es/play/broken-bench/layout'
import type { CaseSlot } from '@es/play/broken-bench/types'

/** One case of each flaw, from seeds that draw it. */
const slots: CaseSlot[] = BENCH_FLAWS.map((flaw, i) => ({ seed: 1000 + i, flaw }))
const scenes = slots.map((slot) => caseOf(slot).scene)

describe('at its start, the desk reads the report\'s own number', () => {
  test.each(slots.map((slot) => [slot.flaw, slot] as const))('%s: the harness\'s clock and cut give the claim, by nearest rank', (flaw, slot) => {
    const { scene } = caseOf(slot)
    const desk = harnessDesk(scene.claim.timerStartsAt, scene.harnessCut)
    const reading = readingOf(scene.rows, desk)
    expect(reading.n).toBe(scene.claim.n)
    if (flaw === 'mean-as-tail') {
      // The report calls the log's mean a p99: the desk's mean is its number, to a whole microsecond, and its p99 is far above it.
      expect(Math.abs(reading.meanUs - scene.claim.valueUs)).toBeLessThanOrEqual(Math.ceil(scene.claim.valueUs / 100))
      expect(reading.p99Us).toBeGreaterThan(scene.claim.valueUs)
    } else {
      expect(reading.p99Us).toBe(scene.claim.valueUs)
    }
  })
})

describe('applying the rule to the log with the two instruments gives the court\'s number', () => {
  test.each(slots.filter((slot) => ['coordinated-omission', 'client-queue-hidden', 'mean-as-tail', 'none'].includes(slot.flaw)).map((slot) => [slot.flaw, slot] as const))(
    '%s: the due clock, with the harness\'s own cut, reads the p99 the court recomputes',
    (_, slot) => {
      const { scene, truth } = caseOf(slot)
      expect(readingOf(scene.rows, { clock: 'due', cut: scene.harnessCut }).p99Us).toBe(truth.correction.p99Us)
    },
  )

  test('warm-up-counted: the due clock with the first max(100, 2 × max_num_seqs) orders cut reads it', () => {
    const slot = slots.find((candidate) => candidate.flaw === 'warm-up-counted') as CaseSlot
    const { scene, truth } = caseOf(slot)
    const cut = benchWarmupRows(scene.server.maxNumSeqs)
    expect(cut).toBe(BENCH_WARMUP_ROWS)
    expect(readingOf(scene.rows, { clock: 'due', cut }).p99Us).toBe(truth.correction.p99Us)
    // And cutting nothing, as the report did, reads the report's number.
    expect(readingOf(scene.rows, { clock: 'due', cut: 0 }).p99Us).toBe(scene.claim.valueUs)
  })

  test('a flaw that the log cannot show is not read off it: a re-run flaw\'s number is not the desk\'s at any setting', () => {
    const rerun = slots.filter((slot) => ['closed-loop', 'capped-output', 'warm-cache', 'too-few-samples', 'client-bottleneck', 'replay-without-timestamps'].includes(slot.flaw))
    for (const slot of rerun) {
      const { scene, truth } = caseOf(slot)
      const seen = [0, scene.harnessCut, BENCH_WARMUP_ROWS].flatMap((cut) => (['sent', 'due'] as const).map((clock) => readingOf(scene.rows, { clock, cut }).p99Us))
      expect([slot.flaw, seen.some((p99) => Math.abs(p99 - truth.correction.p99Us) * 1000 <= 150 * truth.correction.p99Us)]).toEqual([slot.flaw, false])
    }
  })
})

describe('the tail', () => {
  const slot = slots[1]
  const { scene } = caseOf(slot)
  const desk = { clock: 'due', cut: scene.harnessCut } as const
  const reading = readingOf(scene.rows, desk)

  test('is the slowest orders ranked from the slowest, ties broken by order, and the p99 is at n − ⌈0.99 n⌉ + 1', () => {
    const tail = tailOf(scene.rows, desk, reading)
    expect(tail[0].rank).toBe(1)
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].latencyUs).toBeLessThanOrEqual(tail[i - 1].latencyUs)
      if (tail[i].latencyUs === tail[i - 1].latencyUs) expect(tail[i].id).toBeGreaterThan(tail[i - 1].id)
    }
    expect(reading.fromTop).toBe(reading.n - Math.ceil((990 * reading.n) / 1000) + 1)
    expect(reading.beyond).toBe(reading.fromTop - 1)
    const flagged = tail.filter((line) => line.p99)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].rank).toBe(reading.fromTop)
    expect(flagged[0].latencyUs).toBe(reading.p99Us)
  })

  test('shows the p99 and a few orders below it, at least a dozen lines when the log has them', () => {
    const tail = tailOf(scene.rows, desk, reading)
    expect(tail.length).toBe(Math.min(reading.n, Math.max(TAIL_MIN, reading.fromTop + TAIL_BELOW)))
    expect(tail.length).toBeGreaterThan(reading.fromTop)
  })

  test('has the p99 among its lines for every case and both clocks, and for a log far longer than the corpus\'s, where the tail grows to hold it', () => {
    for (const { rows, harnessCut } of scenes) {
      for (const clock of ['sent', 'due'] as const) {
        const set = { clock, cut: clock === 'due' ? 0 : harnessCut }
        const r = readingOf(rows, set)
        const lines = tailOf(rows, set, r)
        expect(lines.filter((line) => line.p99)).toHaveLength(1)
        expect(lines.find((line) => line.p99)?.latencyUs).toBe(r.p99Us)
      }
    }
    const long = Array.from({ length: 12_000 }, (_, i) => ({ ...scene.rows[i % scene.rows.length], id: i }))
    const r = readingOf(long, { clock: 'sent', cut: 0 })
    const lines = tailOf(long, { clock: 'sent', cut: 0 }, r)
    expect(r.fromTop).toBe(12_000 - Math.ceil(0.99 * 12_000) + 1)
    expect(lines).toHaveLength(r.fromTop + TAIL_BELOW)
    expect(lines.filter((line) => line.p99)).toHaveLength(1)
  })

  test('carries each order\'s own times, and counts the clock it is set to', () => {
    const sent = tailOf(scene.rows, { clock: 'sent', cut: 0 })
    for (const line of sent) {
      const row = scene.rows[line.id]
      expect(line.latencyUs).toBe(row.firstUs - row.sentUs)
      expect(line.dueUs).toBe(row.dueUs)
      expect(line.sentUs).toBe(row.sentUs)
    }
  })

  test('a log of a hundred orders or fewer has its p99 at the slowest, and a handful of orders has next to none beyond it', () => {
    for (const seed of [1006, 1007, 2001, 33, 34, 35]) {
      const few = caseOf({ seed, flaw: 'too-few-samples' }).scene
      const r = readingOf(few.rows, { clock: 'sent', cut: 0 })
      expect(r.n).toBe(few.rows.length)
      expect(r.beyond).toBe(r.n - Math.ceil(0.99 * r.n))
      expect(r.beyond).toBeLessThan(3)
      if (r.n <= 100) {
        expect(r.fromTop).toBe(1)
        expect(r.p99Us).toBe(Math.max(...r.latencies))
      }
    }
  })
})

describe('the cut', () => {
  const { scene } = caseOf(slots[3])

  test('leaves out the first orders by due time, and is held to the log: whole, from 0, and leaving one', () => {
    const n = scene.rows.length
    expect(cutOf(scene.rows, 5)).toBe(5)
    expect(cutOf(scene.rows, 5.9)).toBe(5)
    expect(cutOf(scene.rows, -3)).toBe(0)
    expect(cutOf(scene.rows, Number.NaN)).toBe(0)
    expect(cutOf(scene.rows, 1e9)).toBe(n - 1)
    expect(readingOf(scene.rows, { clock: 'due', cut: 1e9 }).n).toBe(1)
  })

  test('moves the first order the desk measures, and the latencies stay in row order', () => {
    const reading = readingOf(scene.rows, { clock: 'due', cut: 10 })
    expect(reading.n).toBe(scene.rows.length - 10)
    expect(reading.latencies[0]).toBe(latencyUs(scene.rows[10], 'due'))
  })
})

describe('the histogram\'s ruler', () => {
  test('is four edges to a decade, 1, 1.8, 3.2 and 5.6 times a power of ten, from 10 ms to 560 s', () => {
    expect(BIN_EDGES_US[0]).toBe(10_000)
    expect(BIN_EDGES_US[BIN_EDGES_US.length - 1]).toBe(560_000_000)
    expect(BIN_EDGES_US).toHaveLength(20)
    const mantissas = BIN_EDGES_US.map((edge) => Number(String(edge).replace(/0+$/, '')))
    expect([...new Set(mantissas)].sort((a, b) => a - b)).toEqual([1, 18, 32, 56])
    expect(DECADE_EDGES_US).toEqual([10_000, 100_000, 1_000_000, 10_000_000, 100_000_000])
  })

  test('counts every order into a bin, the first taking everything under its edge and the last everything over', () => {
    const latencies = [1, 9_999, 10_000, 17_999, 18_000, 500_000_000, 560_000_000, 9_000_000_000]
    const bins = binsOf(latencies)
    expect(bins).toHaveLength(19)
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(latencies.length)
    expect(bins[0].count).toBe(4)
    expect(bins[1].count).toBe(1)
    expect(bins[18].count).toBe(3)
  })

  test('puts a time on it by the bin it falls in and how far across it is, with the ends held', () => {
    expect(placeOf(1)).toBe(0)
    expect(placeOf(10_000)).toBe(0)
    expect(placeOf(14_000)).toBeCloseTo(0.5, 12)
    expect(placeOf(18_000)).toBe(1)
    expect(placeOf(1_000_000)).toBe(8)
    expect(placeOf(560_000_000)).toBe(19)
    expect(placeOf(9_000_000_000)).toBe(19)
    let before = -1
    for (let us = 5000; us < 600_000_000; us = Math.floor(us * 1.37) + 1) {
      expect(placeOf(us)).toBeGreaterThanOrEqual(before)
      before = placeOf(us)
    }
  })

  test('is cut to the log\'s own range, at least six bins and never off the ruler', () => {
    expect(rulerOf([3.2, 3.7, 5.1], 19)).toEqual({ lowBin: 2, highBin: 8 })
    const wide = rulerOf([0, 19], 19)
    expect(wide).toEqual({ lowBin: 0, highBin: 19 })
    const close = rulerOf([8.4, 8.6], 19)
    expect(close.highBin - close.lowBin).toBeGreaterThanOrEqual(6)
    expect(close.lowBin).toBeLessThanOrEqual(7)
    expect(close.highBin).toBeGreaterThanOrEqual(10)
    const top = rulerOf([18.9, 19], 19)
    expect(top.highBin).toBe(19)
    expect(top.highBin - top.lowBin).toBeGreaterThanOrEqual(6)
    const bottom = rulerOf([0, 0.1], 19)
    expect(bottom.lowBin).toBe(0)
    expect(bottom.highBin - bottom.lowBin).toBeGreaterThanOrEqual(6)
  })
})
