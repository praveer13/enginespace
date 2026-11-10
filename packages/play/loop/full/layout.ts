/**
 * The full service's 2D view (GAMES.md §3 "2D path", §2.6): Service's kitchen frame (../layout.ts), with the full service's objects drawn
 * into it through the same lens after the pass, so the 2D view and the 3D scene stay one kitchen at one scale:
 *   - the mold rack along the back of the pass, a spun-steel ring for each captured size, the one the latest fire dropped into under the
 *     lamp (its glow and its filament rim);
 *   - an empty ring mold in each padded place of the latest fire's mold, where a plate would stand;
 *   - the comb along the expo's edge, its teeth as tall as the calls each layer took, or folded flat into one word;
 *   - on the mask level, the allergy card in front of the expo, struck in the ribbon's red.
 * The drawing writes no count: every count is DOM, on the tape and in the mirror (GAMES.md §2.6, rule 7). The numbers it writes are names,
 * as a ticket's is: each mold's size, stamped on the steel in front of it, as the 3D scene labels it. Its words are marker on masking tape
 * stuck on the tool each names, as the kitchen's other names are, which the page prints in the DOM over the drawing (`FrameTape`).
 */
import { clipX, PASS, plateRadius } from '../kitchen'
import { layoutFrame } from '../layout'
import type { Frame, FrameDraw, FrameOptions } from '../layout'
import { CARD, COMB, MOLD, PAD, RACK, rackOf, teethOf } from './kitchen'
import type { FullView } from './types'

type Pt = readonly [number, number]

/**
 * A mold's stamped size: how far in front of the ring's edge it sits, clear of the ring's shadow and short of the plates, and how tall
 * its figures stand, as tall as the fired rail's ticket numbers, in metres [estimated].
 */
const STAMP = { gap: 0.046, size: 0.032 } as const

/** The rack, its molds, and the mold the latest fire dropped into, under the lamp. */
function rack(draw: FrameDraw, view: FullView) {
  const { p, lens } = draw
  if (view.rack === null || view.rack.sizes.length === 0) return
  const top = PASS.top
  const { molds, x1 } = rackOf(view.rack.sizes)
  p.layer('rack')
  molds.forEach((mold, i) => {
    const base = lens.disc(mold.x, top, RACK.z, mold.r)
    const rim = lens.disc(mold.x, top + MOLD.height, RACK.z, mold.r)
    const picked = view.rack!.picked === i
    // Its contact shadow on the steel, and, for the mold the fire dropped into, the lamp's light pooled round it.
    p.ellipse(lens.disc(mold.x, top, RACK.z + 0.005, mold.r * 1.12), { fill: 'text-1', opacity: 0.2 })
    if (picked) p.ellipse(lens.disc(mold.x, top, RACK.z, mold.r * 1.9), { fill: 'lamp', opacity: 0.42, soft: true })
    // The ring's wall, its two ends joined by its sides: steel, lit along its top.
    p.poly(
      [
        [base.cx - base.rx, base.cy],
        [rim.cx - rim.rx, rim.cy],
        [rim.cx + rim.rx, rim.cy],
        [base.cx + base.rx, base.cy],
      ],
      { fill: 'surface-1', stroke: 'surface-3', width: 0.4 },
    )
    p.ellipse(base, { fill: 'surface-1', stroke: 'surface-3', width: 0.5 })
    p.ellipse(rim, { fill: 'surface-2', stroke: picked ? 'lamp-ring' : 'paper', width: picked ? 1.2 : 0.7 })
  })
  // Each mold's size, stamped on the steel in front of it; the mold the fire dropped into has its size on a chip in the lamp's light.
  molds.forEach((mold, i) => {
    const z = RACK.z + mold.r + STAMP.gap
    const [x, y] = lens.at(mold.x, top, z)
    const size = STAMP.size * lens.per(mold.x, top, z)
    const picked = view.rack!.picked === i
    if (picked) p.rect(x - size * 0.95, y - size * 0.62, size * 1.9, size * 1.24, { fill: 'lamp', stroke: 'lamp-ring', width: 0.6, rx: size * 0.62 })
    p.text(x, y, String(mold.size), size, picked ? 'paper-ink' : 'text-1', 'numeric')
  })
  // Its name on masking tape at its row's right end, as the 3D scene sticks it (src/games/loop/full/scene.ts), toward the row's front
  // [estimated]: on a phone's drawing the counter's back holds the strip between the line's tape and the plates' far rims only there.
  draw.tape(p, lens, 'molds', x1, top + 0.004, RACK.z + 0.02, 'molds · sizes', 'right')
}

/** The padded places of the latest fire read back: an empty ring mold where each plate would stand. */
function padding(draw: FrameDraw, view: FullView) {
  const { p, lens } = draw
  const served = [...view.fires].reverse().find((fire) => !fire.onLine)
  if (served === undefined || served.padded <= 0) return
  p.layer('padding')
  const r = plateRadius(view.slots) * 0.8
  let left = served.padded
  served.places.forEach((place, slot) => {
    if (left <= 0 || place.state !== 'empty') return
    left -= 1
    const x = clipX(slot, view.slots)
    const base = lens.disc(x, PAD.y, PAD.z, r)
    const rim = lens.disc(x, PAD.y + MOLD.height * 0.8, PAD.z, r)
    p.ellipse(lens.disc(x, PAD.y, PAD.z + 0.006, r * 1.08), { fill: 'text-1', opacity: 0.16 })
    p.poly(
      [
        [base.cx - base.rx, base.cy],
        [rim.cx - rim.rx, rim.cy],
        [rim.cx + rim.rx, rim.cy],
        [base.cx + base.rx, base.cy],
      ],
      { fill: 'surface-1', stroke: 'surface-3', width: 0.4 },
    )
    p.ellipse(rim, { fill: 'surface-2', stroke: 'paper', width: 0.7 })
  })
}

/** The comb along the expo's edge: a steel spine and its teeth, or one word. */
function comb(draw: FrameDraw, view: FullView) {
  const { p, lens, level, upright } = draw
  if (view.comb === null) return
  const top = PASS.top
  p.layer('comb')
  const z = COMB.z
  const d = 0.018
  p.poly(level(lens, COMB.x0 - 0.01, COMB.x1 + 0.01, top + 0.001, z - d, z + d + 0.012), { fill: 'text-1', opacity: 0.18 })
  p.poly(upright(lens, COMB.x0, COMB.x1, top, top + COMB.spine, z + d / 2), { fill: 'surface-2', stroke: 'surface-3', width: 0.4 })
  p.poly(level(lens, COMB.x0, COMB.x1, top + COMB.spine, z - d / 2, z + d / 2), { fill: 'surface-1' })
  for (const tooth of teethOf(view.comb)) {
    const w = view.comb.mode === 'FULL' ? COMB.width * 10 : COMB.width
    p.poly(upright(lens, tooth.x - w / 2, tooth.x + w / 2, top + COMB.spine, top + COMB.spine + tooth.h, z), { fill: 'surface-1', stroke: 'surface-3', width: 0.4 })
  }
  // Its name on masking tape on the counter's front edge under its left end, clear of the expo's tape on the same edge on a phone's
  // drawing, where the strips are wider than the steel between their middles [estimated].
  draw.tape(p, lens, 'comb', COMB.x0, top - 0.03, PASS.depth / 2 + 0.006, 'comb · launches')
}

/** The allergy card in front of the expo: a card cut square, ruled, with the dishes struck through in the ribbon's red. */
function allergy(draw: FrameDraw, view: FullView) {
  const { p, lens } = draw
  if (view.allergy === null) return
  const top = PASS.top + 0.002
  const c = CARD.cos
  const s = CARD.sin
  const at = (u: number, v: number): Pt => lens.at(CARD.x + u * c - v * s, top, CARD.z + u * s + v * c)
  const hw = CARD.width / 2
  const hh = CARD.height / 2
  p.layer('allergy')
  p.poly([at(-hw - 0.004, -hh + 0.006), at(hw + 0.006, -hh + 0.006), at(hw + 0.006, hh + 0.008), at(-hw - 0.004, hh + 0.008)], { fill: 'text-1', opacity: 0.2 })
  p.poly([at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)], { fill: 'paper', stroke: 'paper-rule', width: 0.5 })
  // Its head band in the ribbon's red: an allergy card is never mistaken for an order.
  p.poly([at(-hw, -hh), at(hw, -hh), at(hw, -hh + 0.018), at(-hw, -hh + 0.018)], { fill: 'paper-ink-2' })
  const strokes: [Pt, Pt][] = []
  for (let k = 0; k < 5; k++) {
    const v = -hh + 0.032 + k * 0.016
    strokes.push([at(-hw + 0.01, v), at(hw - 0.012 - (k % 2) * 0.012, v)])
  }
  p.path(strokes, { stroke: 'paper-ink', width: 0.6 })
  // The struck dishes: on a card written in time every line is struck; on a late one the last two are still to strike.
  const struck = view.allergy.late ? 3 : 5
  const strikes: [Pt, Pt][] = []
  for (let k = 0; k < struck; k++) {
    const v = -hh + 0.032 + k * 0.016
    strikes.push([at(-hw + 0.008, v + 0.003), at(hw - 0.016, v - 0.003)])
  }
  p.path(strikes, { stroke: 'paper-ink-2', width: 0.9 })
}

/** The full service's frame: the kitchen through its shot, and its objects drawn into it. */
export function fullFrame(view: FullView, options: Omit<FrameOptions, 'extra' | 'clock'> = {}): Frame {
  return layoutFrame(view, {
    ...options,
    clock: 'µs on the model\'s clock',
    extra: (draw) => {
      padding(draw, view)
      rack(draw, view)
      comb(draw, view)
      allergy(draw, view)
    },
  })
}
