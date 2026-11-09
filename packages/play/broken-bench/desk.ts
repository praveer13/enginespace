/**
 * The inspector's desk (GAMES.md §11, "Core loop", step 2: "Inspect the log"): the two instruments a learner works the log with, and
 * what they read off it. The instruments are the rules of evidence as controls, and they are dumb on purpose: they time and count
 * whatever they are set to, and know nothing of the flaw.
 *
 *   the stopwatch  starts each order's clock at its send, as a harness that times from the request function does, or at the time the
 *                  guest was due, which is the course's rule (ASSESSMENT B5);
 *   the cut        leaves out the first orders by due time, the warm-up (B8). A harness leaves out those due before the warm-up it
 *                  declared, and the desk starts there, so that at its start the desk reads what the report read.
 *
 * What the desk reads is the sample those two settings give: how many orders, their mean, and the tail, the slowest orders ranked.
 * The p99 is the order at nearest rank ⌈0.99 n⌉ from the fastest, which is `n − ⌈0.99 n⌉ + 1` from the slowest, with `n − ⌈0.99 n⌉` orders
 * beyond it (A§5.6, B6, B7): a learner can find it by counting down the tail, which is the point of showing the tail.
 *
 * Everything here is pure and integer. Nothing is stored: the settings are the board's own, and the court never reads them.
 */
import { divCeil, divRound } from '@es/sim/core'
import type { Us } from '@es/sim/core'
import type { BenchRow } from '@es/sim/bench/types'

export type Clock = 'sent' | 'due'

export interface Desk {
  readonly clock: Clock
  /** Orders left out, from the first by due time. */
  readonly cut: number
}

/** The desk as the report read it: the harness's own clock and its own warm-up. */
export const harnessDesk = (timerStartsAt: 'send' | 'due', harnessCut: number): Desk => ({ clock: timerStartsAt === 'send' ? 'sent' : 'due', cut: harnessCut })

/** Time to first token from the stopwatch's start. */
export const latencyUs = (row: BenchRow, clock: Clock): Us => row.firstUs - (clock === 'due' ? row.dueUs : row.sentUs)

/** The cut, held to what the log can bear: whole, from 0, and leaving at least one order. */
export const cutOf = (rows: readonly BenchRow[], cut: number): number => Math.max(0, Math.min(Math.trunc(Number.isFinite(cut) ? cut : 0), rows.length - 1))

export interface Reading {
  /** Orders measured: the log less the cut. */
  readonly n: number
  readonly cut: number
  readonly meanUs: Us
  /** The p99 by nearest rank. */
  readonly p99Us: Us
  /** The p99's place counting down from the slowest, 1 being the slowest order. */
  readonly fromTop: number
  /** Orders slower than the p99. */
  readonly beyond: number
  /** The measured orders' time to first token, in row order: the first of them is the order the cut stopped at. */
  readonly latencies: readonly Us[]
}

/** What the desk reads off the log at these settings. */
export function readingOf(rows: readonly BenchRow[], desk: Desk): Reading {
  const cut = cutOf(rows, desk.cut)
  const latencies = rows.slice(cut).map((row) => latencyUs(row, desk.clock))
  const n = latencies.length
  const sorted = [...latencies].sort((a, b) => a - b)
  const rank = divCeil(990 * n, 1000)
  let total = 0
  for (const value of latencies) total += value
  return { n, cut, meanUs: divRound(total, n), p99Us: sorted[rank - 1], fromTop: n - rank + 1, beyond: n - rank, latencies }
}

export interface TailLine {
  /** 1 is the slowest order. */
  readonly rank: number
  readonly id: number
  readonly latencyUs: Us
  readonly dueUs: Us
  readonly sentUs: Us
  /** The order at the p99's rank. */
  readonly p99: boolean
}

/** The fewest lines the tail shows, when the log has them: a short log's p99 sits at rank 1 or 2, and the tail shows a few below it. */
export const TAIL_MIN = 12

/** How many orders the tail shows below the p99. */
export const TAIL_BELOW = 6

/** The slowest orders, ranked, from the slowest down to a few below the p99. The p99 is always among them, whatever the length of the log. */
export function tailOf(rows: readonly BenchRow[], desk: Desk, reading: Reading = readingOf(rows, desk)): TailLine[] {
  const cut = reading.cut
  const lines = rows.slice(cut).map((row, i) => ({ row, latencyUs: reading.latencies[i] }))
  lines.sort((a, b) => b.latencyUs - a.latencyUs || a.row.id - b.row.id)
  const shown = Math.min(lines.length, Math.max(TAIL_MIN, reading.fromTop + TAIL_BELOW))
  return lines.slice(0, shown).map((line, i) => ({
    rank: i + 1,
    id: line.row.id,
    latencyUs: line.latencyUs,
    dueUs: line.row.dueUs,
    sentUs: line.row.sentUs,
    p99: i + 1 === reading.fromTop,
  }))
}

/**
 * The edges of the histogram's bins, in µs: four to a decade, 1, 1.8, 3.2, 5.6 times a power of ten, from 10 ms to 560 s. They stand in
 * for a logarithmic scale without a logarithm (D-017: Math.log is banned), and a position between two edges is linear, which is a close
 * enough ruler for the eye. The first bin takes everything under its upper edge and the last everything over its lower.
 */
export const BIN_EDGES_US: readonly number[] = [
  10_000, 18_000, 32_000, 56_000, 100_000, 180_000, 320_000, 560_000, 1_000_000, 1_800_000, 3_200_000, 5_600_000, 10_000_000, 18_000_000, 32_000_000, 56_000_000, 100_000_000,
  180_000_000, 320_000_000, 560_000_000,
]

/** The edges that stand at a power of ten: the labelled ones. */
export const DECADE_EDGES_US: readonly number[] = BIN_EDGES_US.filter((edge) => /^10*$/.test(String(edge)) && String(edge).length > 1)

export interface Bin {
  readonly loUs: Us
  readonly hiUs: Us
  readonly count: number
}

/** The latencies counted into the bins. */
export function binsOf(latencies: readonly Us[]): Bin[] {
  const bins: Bin[] = []
  for (let i = 0; i + 1 < BIN_EDGES_US.length; i++) bins.push({ loUs: BIN_EDGES_US[i], hiUs: BIN_EDGES_US[i + 1], count: 0 })
  const counts = bins.map(() => 0)
  for (const value of latencies) {
    let at = 0
    while (at + 1 < bins.length && value >= bins[at].hiUs) at += 1
    counts[at] += 1
  }
  return bins.map((bin, i) => ({ ...bin, count: counts[i] }))
}

/**
 * A latency's place on the log scale, in bins from the bottom: the bin it falls in plus how far across that bin it is. A value under the
 * first edge sits at 0 and a value over the last at the number of bins.
 */
export function placeOf(us: Us): number {
  const last = BIN_EDGES_US.length - 1
  if (us <= BIN_EDGES_US[0]) return 0
  if (us >= BIN_EDGES_US[last]) return last
  let at = 0
  while (us >= BIN_EDGES_US[at + 1]) at += 1
  return at + (us - BIN_EDGES_US[at]) / (BIN_EDGES_US[at + 1] - BIN_EDGES_US[at])
}
