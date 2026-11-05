/*
 * `graphs` · `sizes` (GAMES.md §3.2; §3, "Invariants the tests check": "The DP ghost is optimal against brute force on every histogram of
 * ≤ 12 candidate sizes"): the capture cost of a night of decode fires under a list of molds, the exact optimum the house serves with, and
 * the night's histogram.
 */
import { describe, expect, test } from 'bun:test'
import { hostPreset } from '@es/sim/host'
import { paddedSize, SMALL_CARD } from '@es/sim/steploop'
import { captureCost, decodeUs, eagerExtraUs, histogramNight, optimalSizes, priceOf, priceTable } from '@es/play/loop/full/sizes'
import { seeds } from '../seeds'

const SEEDS = seeds(0)
const host = hostPreset('mrv2').card
const table = priceTable(SMALL_CARD, host, 12, 256)
const LADDER = Array.from({ length: 12 }, (_, i) => i + 1)

/** Every set of at most `molds` sizes from the ladder, and its cost: the brute force the DP is held to. */
function bruteForce(batches: readonly number[], molds: number): number {
  let least = captureCost(table, [], batches)
  const walk = (from: number, chosen: number[]) => {
    least = Math.min(least, captureCost(table, chosen, batches))
    if (chosen.length === molds) return
    for (let i = from; i < LADDER.length; i++) walk(i + 1, [...chosen, LADDER[i]])
  }
  walk(0, [])
  return least
}

describe('the price of a fire', () => {
  test('a fire drops into the smallest mold that holds it and pays for its padding on the line; bigger than every mold, it is called dish by dish', () => {
    expect(priceOf(table, [4, 8], 3)).toEqual({ batch: 3, mold: 4, paddedUs: decodeUs(SMALL_CARD, 4, 256) - decodeUs(SMALL_CARD, 3, 256), eagerUs: 0 })
    expect(priceOf(table, [4, 8], 8).paddedUs).toBe(0)
    expect(priceOf(table, [4, 8], 9)).toEqual({ batch: 9, mold: null, paddedUs: 0, eagerUs: eagerExtraUs(SMALL_CARD, host) })
    // Calling every kernel of the small model's 28 layers, 12 to a layer at 6 µs, beyond the one replay of 30 µs.
    expect(eagerExtraUs(SMALL_CARD, host)).toBe(6 * 12 * 28 - 30)
    for (let n = 1; n <= 12; n++) expect(priceOf(table, [2, 5, 12], n).mold).toBe(paddedSize([2, 5, 12], n))
  })
})

describe('the optimum (the house)', () => {
  test(`is the brute force's least cost on the nights of ${SEEDS.length} seeds, with one to three molds`, () => {
    for (const seed of SEEDS) {
      const batches = histogramNight(seed, 12, 40)
      for (const molds of [1, 2, 3]) {
        const best = optimalSizes(table, LADDER, batches, molds)
        expect(best.length).toBeLessThanOrEqual(molds)
        expect([seed, molds, captureCost(table, best, batches)]).toEqual([seed, molds, bruteForce(batches, molds)])
      }
    }
  })

  test('ascending and on the ladder', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const best = optimalSizes(table, LADDER, histogramNight(seed, 12, 40), 3)
      expect([...best].sort((a, b) => a - b)).toEqual(best)
      for (const size of best) expect(LADDER).toContain(size)
    }
  })
})

describe('the night', () => {
  test('40 fires, every batch on the rail, a function of the seed', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const night = histogramNight(seed, 12, 40)
      expect(night).toHaveLength(40)
      for (const batch of night) expect(batch >= 1 && batch <= 12).toBe(true)
      expect(histogramNight(seed, 12, 40)).toEqual(night)
    }
  })
})
