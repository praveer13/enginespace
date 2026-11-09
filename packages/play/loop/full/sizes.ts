/**
 * `graphs` · `sizes` (GAMES.md §3.2): which routines the line drills before service, within the time it has to drill them. A night of
 * decode fires whose batches follow the seed's histogram; the molds on the rack are the captured sizes; each fire drops into the
 * smallest mold that holds it and its empty places are padding, and a fire bigger than every mold is called dish by dish.
 *
 * The capture cost of a night (GAMES.md §3.2's pass bar): the GPU µs its padding cost, plus the CPU µs its eager fires spent calling
 * each kernel beyond the one replay a captured graph takes. Both are priced by the stage's cost cards: the GPU card for the padded
 * rows, the host card for the launches. `optimalSizes` is the stage's ghost, an exact dynamic programme over the ladder (GAMES.md
 * §3, `optimalCaptureSizes`), which tests/play/loop-full-sizes.test.ts holds to brute force on every ladder it draws.
 *
 * Everything is an integer, and nothing draws a number but `histogramNight`, from its seed.
 */
import { below, rngFor } from '@es/sim/core'
import type { Seed, Us } from '@es/sim/core'
import type { HostCard } from '@es/sim/host'
import { stepLoad } from '@es/sim/physics'
import { gpuCost, gpuLayers, paddedSize } from '@es/sim/steploop'
import type { GpuCard } from '@es/sim/steploop'

/** What one fire of `rows` decode rows over `context` tokens costs the line, in µs. */
export function decodeUs(card: GpuCard, rows: number, context: number): Us {
  if (rows <= 0) return 0
  const load = stepLoad(Array.from({ length: rows }, () => ({ kind: 'decode' as const, context })))
  return gpuCost(card, { seqs: rows, prefillSeqs: 0, tokens: load.tokens, kvTokens: load.kvTokens, attnPairs: load.attnPairs }).gpuUs
}

/** What a fire's eager launch costs beyond one replay: every kernel of every layer called one by one. */
export function eagerExtraUs(card: GpuCard, host: HostCard): Us {
  return Math.max(0, host.launchPerKernelUs * host.kernelsPerLayer * gpuLayers(card) - host.graphReplayUs)
}

/** The price of one batch under a list of molds: its padding on the line, or its eager calls. */
export interface FirePrice {
  readonly batch: number
  /** The mold it drops into, or null: no mold holds it. */
  readonly mold: number | null
  readonly paddedUs: Us
  readonly eagerUs: Us
}

/** A table of what each batch from 1 to `max` costs in each mold at or above it, and eagerly: the DP and the night both read it. */
export interface PriceTable {
  readonly max: number
  /** `line[n]`: the line's µs for a fire of n real rows; n up to `max`. */
  readonly line: readonly Us[]
  readonly eager: Us
}

export function priceTable(card: GpuCard, host: HostCard, max: number, context: number): PriceTable {
  const line: Us[] = [0]
  for (let n = 1; n <= max; n++) line.push(decodeUs(card, n, context))
  return { max, line, eager: eagerExtraUs(card, host) }
}

/** What one batch costs under `sizes` (ascending): padded to the smallest mold that holds it, or eager above them all. */
export function priceOf(table: PriceTable, sizes: readonly number[], batch: number): FirePrice {
  const mold = paddedSize(sizes, batch)
  if (mold === null) return { batch, mold: null, paddedUs: 0, eagerUs: table.eager }
  return { batch, mold, paddedUs: table.line[mold] - table.line[batch], eagerUs: 0 }
}

/** The capture cost of a night: the padded µs and the eager µs of every fire. */
export function captureCost(table: PriceTable, sizes: readonly number[], batches: readonly number[]): Us {
  let total = 0
  for (const batch of batches) {
    const price = priceOf(table, sizes, batch)
    total += price.paddedUs + price.eagerUs
  }
  return total
}

/**
 * The best `molds` sizes from `ladder` for a night of `batches` (GAMES.md §3, `optimalCaptureSizes`): an exact dynamic programme.
 * Sort the ladder; `best[k][j]` is the least cost of the batches up to `ladder[j]` with `k` molds, the largest of them `ladder[j]`;
 * the batches above the largest mold run eagerly. Ties go to the smaller sizes, so the answer is one list. Fewer molds than the
 * budget are allowed (a mold that saves nothing is not drilled).
 */
export function optimalSizes(table: PriceTable, ladder: readonly number[], batches: readonly number[], molds: number): number[] {
  const sizes = [...new Set(ladder)].filter((size) => size >= 1 && size <= table.max).sort((a, b) => a - b)
  const count = new Array<number>(table.max + 1).fill(0)
  for (const batch of batches) count[batch] += 1
  /** The cost of the batches in (lo, hi] padded to hi. */
  const span = (lo: number, hi: number): Us => {
    let total = 0
    for (let n = lo + 1; n <= hi; n++) total += count[n] * (table.line[hi] - table.line[n])
    return total
  }
  const eagerAbove = (size: number): Us => {
    let fires = 0
    for (let n = size + 1; n <= table.max; n++) fires += count[n]
    return fires * table.eager
  }
  const m = sizes.length
  // best[k][j]: least cost of batches ≤ sizes[j] using k molds, the largest sizes[j]; from[k][j]: the mold before it, or -1.
  const best: number[][] = []
  const from: number[][] = []
  for (let k = 1; k <= molds; k++) {
    best.push(new Array<number>(m).fill(Number.POSITIVE_INFINITY))
    from.push(new Array<number>(m).fill(-1))
    for (let j = 0; j < m; j++) {
      if (k === 1) {
        best[0][j] = span(0, sizes[j])
        continue
      }
      for (let i = 0; i < j; i++) {
        const cost = best[k - 2][i] + span(sizes[i], sizes[j])
        if (cost < best[k - 1][j]) {
          best[k - 1][j] = cost
          from[k - 1][j] = i
        }
      }
    }
  }
  let bestCost = eagerAbove(0)
  let pick: { k: number; j: number } | null = null
  for (let k = 1; k <= molds; k++) {
    for (let j = 0; j < m; j++) {
      const cost = best[k - 1][j] + eagerAbove(sizes[j])
      if (cost < bestCost) {
        bestCost = cost
        pick = { k, j }
      }
    }
  }
  const out: number[] = []
  for (let at = pick; at !== null; ) {
    out.unshift(sizes[at.j])
    const before = from[at.k - 1][at.j]
    at = before < 0 ? null : { k: at.k - 1, j: before }
  }
  return out
}

/**
 * The night's batches: `fires` decode fires whose batch sizes follow the seed's histogram over 1 to `max` [estimated]. Two humps, a
 * light trade and a rush, each a few sizes wide, drawn per seed, so some nights pile up at one size and others spread over two.
 */
export function histogramNight(seed: Seed, max: number, fires: number): number[] {
  const rng = rngFor(seed, 'loop/full/sizes')
  const humps = [1 + below(rng, max), 1 + below(rng, max)]
  const widths = [below(rng, 3), below(rng, 3)]
  const lean = 1 + below(rng, 3)
  const out: number[] = []
  for (let i = 0; i < fires; i++) {
    const hump = below(rng, lean + 1) === 0 ? 1 : 0
    const offset = below(rng, 2 * widths[hump] + 1) - widths[hump]
    out.push(Math.min(max, Math.max(1, humps[hump] + offset)))
  }
  return out
}
