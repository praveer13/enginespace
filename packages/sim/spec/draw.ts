// Seeded targets and drafters for the verifier (ARCHITECTURE §5.5; GAMES.md §10): p and q with a total of 2^16, drawn on a grid,
// within a band that rejects degenerate pairs and draws again (ARCHITECTURE §8.2, "band(seed) rejects degenerate draws").
//
// A pair is p and q over one vocabulary. Its weights are whole multiples of `grid`, which divides 2^16: the Verifier's `exact` levels
// use a grid of 1,024 (1/64 of the total), so every excess p − q is a whole number of grid units. `drawDist` cuts the total at
// `size − 1` uniform places, so a pair has the skew and the zero-weight tokens that real distributions have. A band can also ask for
// a sparse target, which has few possible tokens: vLLM applies top-k and top-p to the target's logits before it verifies (vllm S3),
// so the target is zero outside its nucleus while the drafter still proposes tokens there.

import { permille } from '../core/int'
import { below, rngFor, shuffle } from '../core/rng'
import type { Rng } from '../core/rng'
import { compareAsc } from '../core/stats'
import type { Seed } from '../core/types'
import { DIST_TOTAL, overlapWeight } from './dist'
import type { Dist } from './dist'

export interface PairBand {
  /** Tokens in the vocabulary. */
  readonly size: number
  /** Every weight is a multiple of this, and it divides 2^16. */
  readonly grid: number
  /** The overlap α = Σ min(p, q) ÷ total, in permille, from the first to the second, both included. */
  readonly alphaPermille: readonly [number, number]
  /** At least this many tokens with p > q: the recovery has somewhere to go. */
  readonly minAbove: number
  /** At least this many tokens with q > p: the draft can be rejected. */
  readonly minBelow: number
  /**
   * With this, p has between the first and the second number of possible tokens (weight above 0), which are chosen at random; without
   * it, p's weights come from `drawDist`'s cuts and some may be 0.
   */
  readonly pSupport?: readonly [number, number]
  /** The same for q. A support of [size, size] makes the drafter propose every token. */
  readonly qSupport?: readonly [number, number]
}

/** The Verifier's band (GAMES.md §10) without its clause on wrong rules: six tokens on a grid of 1/64, α from 0.4 to 0.9, two tokens each way [estimated]. */
export const SPEC_BAND: PairBand = { size: 6, grid: 1024, alphaPermille: [400, 900], minAbove: 2, minBelow: 2 }

/**
 * A band of sparse targets, for the leak that the boundary-inclusive comparison causes: sixteen tokens, p possible on three to six of
 * them and q on all sixteen, so the drafter proposes at least ten tokens that p rules out [derived], and α runs from 0.15 to 0.6
 * [estimated].
 */
export const SPARSE_BAND: PairBand = { size: 16, grid: 1024, alphaPermille: [150, 600], minAbove: 2, minBelow: 2, pSupport: [3, 6], qSupport: [16, 16] }

/**
 * A band with sixty-four tokens and weights down to 1/65,536, so that a token's expected count at 20,000 draws can fall under the
 * pooling threshold of the chi-square test: a weight under 17 has probability about 1.6% when the mean is 1,024 [derived], so a case
 * has about one such token.
 */
export const FINE_BAND: PairBand = { size: 64, grid: 1, alphaPermille: [300, 900], minAbove: 2, minBelow: 2 }

const ATTEMPTS = 10_000

/**
 * A distribution of `size` tokens whose weights are multiples of `grid` and add up to 2^16. By default it cuts the total at `size − 1`
 * places drawn with `below`, so some weights may be 0. With `support` = [lo, hi] it picks k tokens, lo ≤ k ≤ hi, at random (a partial
 * shuffle) and splits the total among them with every weight at least one grid unit.
 */
export function drawDist(rng: Rng, size: number, grid: number, support?: readonly [number, number]): Dist {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`size must be a positive integer, got ${size}`)
  if (!Number.isInteger(grid) || grid < 1 || DIST_TOTAL % grid !== 0) throw new RangeError(`grid must be an integer that divides ${DIST_TOTAL}, got ${grid}`)
  const units = DIST_TOTAL / grid
  if (support === undefined) return { weights: split(rng, size, units).map((w) => w * grid), total: DIST_TOTAL }
  const [lo, hi] = support
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo || hi > size || hi > units) {
    throw new RangeError(`support must be integers with 1 <= lo <= hi <= min(size, ${units}), got [${lo}, ${hi}] for ${size} tokens`)
  }
  const k = lo + below(rng, hi - lo + 1)
  const chosen = shuffle(rng, Array.from({ length: size }, (_, i) => i)).slice(0, k)
  const cuts = shuffle(rng, Array.from({ length: units - 1 }, (_, i) => i + 1)).slice(0, k - 1)
  cuts.sort(compareAsc)
  const weights = new Array<number>(size).fill(0)
  let before = 0
  chosen.forEach((token, i) => {
    const cut = i < k - 1 ? cuts[i] : units
    weights[token] = (cut - before) * grid
    before = cut
  })
  return { weights, total: DIST_TOTAL }
}

/** `size` non-negative integers that add up to `units`: the gaps between `size − 1` cuts drawn with `below`, in order. */
function split(rng: Rng, size: number, units: number): number[] {
  const cuts: number[] = []
  for (let i = 0; i < size - 1; i++) cuts.push(below(rng, units + 1))
  cuts.sort(compareAsc)
  const parts: number[] = []
  let before = 0
  for (const cut of cuts) {
    parts.push(cut - before)
    before = cut
  }
  parts.push(units - before)
  return parts
}

/** The first pair from `rng` that is in `band`: p then q are drawn, and a pair outside the band is dropped and both are drawn again. */
export function drawPair(rng: Rng, band: PairBand): { p: Dist; q: Dist } {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const p = drawDist(rng, band.size, band.grid, band.pSupport)
    const q = drawDist(rng, band.size, band.grid, band.qSupport)
    const alpha = permille(overlapWeight(p, q), DIST_TOTAL)
    let moreP = 0
    let moreQ = 0
    for (let i = 0; i < band.size; i++) {
      if (p.weights[i] > q.weights[i]) moreP++
      else if (q.weights[i] > p.weights[i]) moreQ++
    }
    if (alpha >= band.alphaPermille[0] && alpha <= band.alphaPermille[1] && moreP >= band.minAbove && moreQ >= band.minBelow) return { p, q }
  }
  throw new Error(`no pair in the band after ${ATTEMPTS} attempts`)
}

/**
 * A chain of `gamma` drafts for `seed`: γ + 1 target distributions and γ draft distributions, a pair in the band at each position (the
 * last pair's q is dropped, since the bonus token has no draft). Its draws come from the seed's `spec/case` sub-stream.
 */
export function drawCase(seed: Seed, gamma: number, band: PairBand = SPEC_BAND): { p: Dist[]; q: Dist[] } {
  if (!Number.isInteger(gamma) || gamma < 0) throw new RangeError(`the draft length is a non-negative integer, got ${gamma}`)
  const rng = rngFor(seed, 'spec/case')
  const p: Dist[] = []
  const q: Dist[] = []
  for (let i = 0; i <= gamma; i++) {
    const pair = drawPair(rng, band)
    p.push(pair.p)
    if (i < gamma) q.push(pair.q)
  }
  return { p, q }
}
