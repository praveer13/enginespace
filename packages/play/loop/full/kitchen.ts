/**
 * Where the full service's objects stand in Service's kitchen (GAMES.md §2.6, "TR2's levels in the kitchen"), in metres with y up and +z
 * toward the expo, on the plan of ../kitchen.ts, so that the 2D view (./layout.ts) and the 3D scene (src/games/loop/scene-full.ts) draw
 * them in one place. Every length is [estimated], on the scene kit's proportions:
 *
 *   - the mold rack: a row of ring molds along the back of the pass, under the rail, one for each captured size, smallest at the left,
 *     each as wide as its size reads against the largest. The mold the latest fire dropped into takes the lamp;
 *   - padding: in each place of the fire's mold that holds nothing, an empty ring mold on the pass where the plate would be;
 *   - the comb: a steel comb lying along the expo's edge of the counter, a tooth for each layer of the model, as tall as the calls that
 *     layer took; folded flat into one word when a drilled routine fired the whole fire;
 *   - the allergy card: a card lying in front of the expo, on the mask level.
 */
import { PASS, PLATE_Z } from '../kitchen'
import type { CombView } from './types'

/** The rack: its row's line along the back of the pass, the gap between two molds, and the ring molds' sizes [estimated]. */
export const RACK = { z: -0.2, gap: 0.014 } as const
export const MOLD = { min: 0.02, max: 0.042, height: 0.036 } as const
/** The most molds the rack draws; a longer list is in the DOM. */
export const RACK_SHOWN = 12

export interface MoldPlace {
  readonly size: number
  readonly x: number
  readonly r: number
}

/** A mold's radius, from its size against the largest on the rack: the smallest is a ring a few fingers across, the largest a dessert ring. */
export function moldRadius(size: number, largest: number): number {
  const t = largest <= 1 ? 1 : Math.sqrt((size - 1) / (largest - 1))
  return MOLD.min + (MOLD.max - MOLD.min) * t
}

/** The rack's molds, left to right, centred behind the clips, and the row's ends. */
export function rackOf(sizes: readonly number[]): { readonly molds: readonly MoldPlace[]; readonly x0: number; readonly x1: number } {
  const shown = sizes.slice(0, RACK_SHOWN)
  const largest = shown.length === 0 ? 1 : shown[shown.length - 1]
  const radii = shown.map((size) => moldRadius(size, largest))
  const span = radii.reduce((sum, r) => sum + 2 * r, 0) + RACK.gap * Math.max(0, shown.length - 1)
  let x = -span / 2
  const molds = shown.map((size, i) => {
    const place = { size, x: x + radii[i], r: radii[i] }
    x += 2 * radii[i] + RACK.gap
    return place
  })
  return { molds, x0: -span / 2 - 0.03, x1: span / 2 + 0.03 }
}

/** The comb along the expo's edge: from x0 to x1, its spine's height, and its tallest tooth: twelve calls a layer [estimated]. */
export const COMB = { x0: -0.66, x1: -0.1, z: 0.236, spine: 0.012, tooth: 0.05, calls: 12, width: 0.008 } as const

/** The comb's teeth: one for each layer, as tall as its calls, or none, with one word standing in the middle, when a graph replayed. */
export function teethOf(comb: CombView): readonly { readonly x: number; readonly h: number }[] {
  if (comb.mode === 'FULL') return [{ x: (COMB.x0 + COMB.x1) / 2, h: COMB.tooth * 0.6 }]
  const h = (COMB.tooth * Math.min(comb.perLayer, COMB.calls)) / COMB.calls
  const n = Math.max(1, comb.layers)
  return Array.from({ length: n }, (_, i) => ({ x: COMB.x0 + ((COMB.x1 - COMB.x0) * (i + 0.5)) / n, h }))
}

/**
 * The allergy card, lying in front of the expo: its middle, and its turn of -0.22 rad as the cosine and sine of it, written out [derived],
 * because a pure package takes no `Math.cos` (D-017).
 */
export const CARD = { x: 0.42, z: 0.18, turn: -0.22, cos: 0.97590, sin: -0.21823, width: 0.08, height: 0.12 } as const

/** Where a padding place's empty mold stands: the plate's place of its clip. */
export const PAD = { z: PLATE_Z, y: PASS.top } as const
