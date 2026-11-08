/*
 * Back of House's own props (scene kit v1's way, src/scene/props/index.ts): the house's decks and its two walls (the partition with the
 * ticket windows, and the dumbwaiter's shaft), its rooms' furniture the kit has no prop for (the dining room's table with its chairs, the
 * host stand with its book on its lectern, the order desk's printer's tape), the line's canopy, the glow of a lit lamp's bulb, and what a
 * stage lays in it besides the kit's spike (the "Heard!" gate, the window shelf). Each is built from shape.ts's rounded boxes, rods,
 * lathes and sweeps, in the palette's tones, through the kit's own
 * maker, with a footprint for its contact shadow where it stands; the static set merges them with the kit's props, so they share the
 * kit's draws and its baked occlusion. No unbevelled box and no bare plane. Every size is [estimated], on the kit's proportions.
 *
 * Only the scene imports this (it is in the 3D chunk). It imports no three of its own: the kit's helpers make the geometry.
 */
import type { PropMaker } from '@/scene/props/build'
import { CHANNEL } from '@/scene/props/palette'
import { block, lathe, place, rod, roundedRectPath, sweep, type Vec2 } from '@/scene/props/shape'
import type { CustomSpec } from '@/scene/props/specs'
import type { HouseProp } from './scene-layout'

type Of<K extends HouseProp['kind']> = Extract<HouseProp, { kind: K }>

/** A square bar's section, swept round a path: a frame's steel, 24 mm across and 30 mm deep. */
const BAR: readonly Vec2[] = [
  [-0.012, 0],
  [0.012, 0],
  [0.012, 0.03],
  [-0.012, 0.03],
  [-0.012, 0],
]
/** A post's foot: a turned pad on the floor. */
const FOOT: readonly Vec2[] = [
  [0, 0],
  [0.034, 0],
  [0.036, 0.008],
  [0.022, 0.016],
  [0, 0.016],
]
const QUARTER = Math.PI / 2

/** A frame standing in the y-z plane (its opening facing x), `h` tall and `d` deep about `z`, its foot at `y`, `x` out. */
function frame(m: PropMaker, x: number, y: number, h: number, d: number, z = 0) {
  m.add(place(sweep(roundedRectPath(h, d, 0.03, 4), BAR), [x, y + h / 2, z], [0, 0, QUARTER]), 'steel')
}

/** A post from the floor to `top`, on its foot. */
function post(m: PropMaker, x: number, z: number, top: number, radius = 0.018) {
  m.add(rod([x, 0.01, z], [x, top, z], radius, 14), 'steel')
  m.add(place(lathe(FOOT, 16), [x, 0, z]), 'shaded')
  m.shadow([x, 0, z], [0.07, 0.07], { radius: 0.035, soft: 0.04, strength: 0.8 })
}

/** A storey's deck, `at` its top's centre: the slab and its rolled front edge. */
function deck(m: PropMaker, { width: w, depth: d, thick }: Of<'deck'>) {
  m.add(block([w, thick, d], 0.012, [0, -thick, 0]), 'steel')
  m.add(rod([-w / 2 + 0.014, -0.022, d / 2 - 0.006], [w / 2 - 0.014, -0.022, d / 2 - 0.006], 0.024, 16), 'steel')
}

/**
 * The partition: a steel wall, its face toward the house at x = 0, cut by a framed window at each sill with the sill's shelf in front of
 * it, so a ticket goes through the window into the chute behind and comes out through another storey's.
 */
function partition(m: PropMaker, p: Of<'partition'>) {
  const half = p.depth / 2
  const [high, from, to] = p.window
  const wall = (y0: number, y1: number, z0: number, z1: number) => m.add(block([0.04, y1 - y0, z1 - z0], 0.006, [-0.02, y0, (z0 + z1) / 2]), 'steel')
  let y = 0
  for (const sill of [...p.sills].sort((a, b) => a - b)) {
    wall(y, sill, -half, half)
    wall(sill, sill + high, -half, from)
    wall(sill, sill + high, to, half)
    frame(m, 0.03, sill, high, to - from, (from + to) / 2)
    m.add(block([0.14, 0.014, to - from + 0.04], 0.004, [0.07, sill - 0.014, (from + to) / 2]), 'shaded')
    y = sill + high
  }
  wall(y, p.height, -half, half)
  m.shadow([-0.02, 0, 0], [0.06, p.depth], { radius: 0.02, soft: 0.08, strength: 0.7 })
}

/** The dumbwaiter's open shaft: four corner posts, a landing at each floor where the car stops, and the winding box on top. */
function shaft(m: PropMaker, p: Of<'shaft'>) {
  for (const x of [-0.17, 0.17]) for (const z of [-0.2, 0.2]) post(m, x, z, p.height, 0.017)
  m.add(block([0.42, 0.12, 0.48], 0.016, [0, p.height, 0]), 'shaded')
  for (const y of p.landings) {
    m.add(block([0.34, 0.012, 0.4], 0.004, [0, y - 0.012, 0]), 'shaded')
    m.add(rod([0.17, y + 0.3, -0.2], [0.17, y + 0.3, 0.2], 0.008, 8), 'steel')
  }
}

/**
 * The line's canopy, in its own space with the tile at z = 0 and its top at y = 0: its sheet folded along the line (out under the deck,
 * sloping down and out to a band at the lip, open beneath), its baffle filters inclined at the back under the top, and its white tubes
 * lit along the lip's foot, where they are seen from the room.
 */
function canopy(m: PropMaker, { width: w, depth: d, height: h }: Of<'canopy'>) {
  const lip = 0.12 - h
  m.add(block([w, 0.012, 0.24], 0.005, [0, -0.012, 0.12]), 'steel')
  m.add(place(block([w, 0.012, Math.hypot(d - 0.23, lip)], 0.005), [0, lip / 2 - 0.012, (d + 0.23) / 2], [Math.atan2(-lip, d - 0.23), 0, 0]), 'steel')
  m.add(block([w, h - 0.29, 0.012], 0.005, [0, -h, d - 0.006]), 'steel')
  for (let x = -w / 2 + 0.28; x < w / 2 - 0.2; x += 0.5) {
    m.add(place(block([0.46, 0.012, 0.34], 0.005), [x, -0.16, 0.17], [0.8, 0, 0]), 'deep')
    for (let s = -0.2; s < 0.21; s += 0.05) m.add(place(block([0.03, 0.004, 0.32], 0.0015), [x + s, -0.15, 0.18], [0.8, 0, Math.round(s * 20) % 2 ? 0.6 : -0.6]), 'steel')
  }
  for (const x of [-w / 4, w / 4]) m.glow(rod([x - w / 4 + 0.08, -h + 0.016, d + 0.018], [x + w / 4 - 0.08, -h + 0.016, d + 0.018], 0.012, 10), CHANNEL.tube)
}

/** The dining room's table under its cloth, its pedestal on a turned foot, a plate set on it, and a chair at each end facing it. */
function table(m: PropMaker, { height: h }: Of<'table'>) {
  m.add(block([0.74, 0.14, 0.5], 0.014, [0, h - 0.14, 0]), 'paper')
  m.add(rod([0, 0.02, 0], [0, h - 0.13, 0], 0.026, 12), 'deep')
  m.add(lathe([[0, 0], [0.19, 0], [0.2, 0.012], [0.05, 0.03], [0, 0.03]], 24), 'deep')
  // The plate: a foot, the well, and the rim rising to its bead, glazed, in a ring of shade on the cloth.
  m.add(place(lathe([[0, 0.004], [0.066, 0.004], [0.07, 0], [0.078, 0], [0.124, 0.016], [0.136, 0.023], [0.128, 0.026], [0.09, 0.009], [0, 0.008]], 28), [0, h, 0.09]), 'ceramic')
  m.shadow([0, h, 0.09], [0.28, 0.28], { radius: 0.14, soft: 0.02, strength: 0.6 })
  for (const k of [-1, 1]) {
    const x = k * 0.53
    m.add(block([0.3, 0.03, 0.3], 0.01, [x, 0.33, 0]), 'deep')
    m.add(block([0.03, 0.34, 0.27], 0.01, [x + k * 0.135, 0.36, 0]), 'deep')
    for (const dx of [-0.12, 0.12]) for (const dz of [-0.12, 0.12]) m.add(rod([x + dx, 0, dz], [x + dx, 0.34, dz], 0.01, 8), 'steel')
    m.shadow([x, 0, 0], [0.3, 0.3], { radius: 0.03, soft: 0.06, strength: 0.6 })
  }
  m.shadow([0, 0, 0], [0.74, 0.5], { radius: 0.05, soft: 0.1, strength: 0.7 })
}

/**
 * The host stand: a closed counter of brushed steel with two shaded panels let into its front, its kick set back, and at its right end
 * the book of the night's covers, open on a lectern tipped toward the room, so its white pages read from across the house.
 */
function stand(m: PropMaker, { width: w, depth: d, height: h }: Of<'stand'>) {
  m.add(block([w, h - 0.1, d - 0.04], 0.012, [0, 0.07, -0.02]), 'steel')
  for (const k of [-1, 1]) m.add(block([w / 2 - 0.1, h - 0.24, 0.012], 0.004, [(k * w) / 4, 0.14, d / 2 - 0.034]), 'shaded')
  m.add(block([w - 0.06, 0.07, d - 0.1], 0.006, [0, 0, -0.04]), 'deep')
  m.add(block([w + 0.02, 0.03, d + 0.01], 0.008, [0, h - 0.03, 0]), 'steel')
  // The lectern, a wedge of deep steel tipped toward the room, and the open book on it, its spine sunk between its pages.
  const x = w / 2 - 0.24
  m.add(place(block([0.38, 0.12, 0.26], 0.01), [x, h, -0.08], [0.7, 0, 0]), 'deep')
  for (const k of [-1, 1]) m.add(place(block([0.17, 0.012, 0.24], 0.003), [x + k * 0.088, h + 0.091, -0.004], [0.7, 0, k * 0.06]), 'paper')
  m.shadow([0, 0, 0], [w, d], { radius: 0.03, soft: 0.1, strength: 0.75 })
}

/** The order desk's printer's tape, `at` the desk's front edge: out of the printer's mouth just over it, and hanging over the edge. */
function tape(m: PropMaker) {
  m.add(block([0.076, 0.37, 0.002], 0.001, [0, -0.248, 0]), 'paper')
  m.shadow([0, 0, 0], [0.08, 0.02], { strength: 0.4 })
}

/** A heat lamp's bulb glowing round its shade's lip, a turned ring: lit on the present's channel, and cold steel on every other lamp. */
function ring(m: PropMaker, { channel }: Of<'ring'>) {
  m.glow(lathe([[0.114, 0], [0.121, -0.007], [0.128, 0], [0.121, 0.007], [0.114, 0]], 32), channel)
}

/** "Heard!": a boom gate on its foot, its arm across the hands' way in bands of bright and deep steel. */
function gate(m: PropMaker) {
  post(m, 0, 0, 0.2, 0.008)
  for (let k = 0; k < 4; k++) m.add(rod([0.012 + k * 0.05, 0.19, 0], [0.058 + k * 0.05, 0.19, 0], 0.007, 10), k % 2 === 0 ? 'steel' : 'deep')
}

/** The window shelf: a shelf under the window a ticket leaves by, which both floors reach, on its two arms to the partition. */
function shelf(m: PropMaker) {
  m.add(block([0.1, 0.014, 0.3], 0.005, [0, 0, 0]), 'steel')
  for (const z of [-0.14, 0.14]) m.add(rod([0, 0.004, z], [0, -0.08, z + Math.sign(z) * 0.03], 0.006, 8), 'shaded')
}

const BUILD: Record<HouseProp['kind'], (m: PropMaker, p: never) => void> = { deck, partition, shaft, post: (m, p: Of<'post'>) => post(m, 0, 0, p.height, 0.022), canopy, table, stand, ring, gate, shelf, tape }

/** The house's own props, by kind: what the scene builds through `customOf` rather than hands to the kit as they are. */
export const OWN = new Set(Object.keys(BUILD))

/** A house prop as the kit's set takes it: a custom spec built through the kit's maker. */
export function customOf(prop: HouseProp): CustomSpec {
  return { kind: 'custom', id: prop.id, at: prop.at, build: (m) => (BUILD[prop.kind] as (m: PropMaker, p: HouseProp) => void)(m, prop) }
}

/**
 * The dumbwaiter's car, which moves and so is not in the set: a steel box open at the house's side, where the ticket goes in, and at its
 * front, where it is seen to ride, as geometries in its own space with its floor at y = 0, for the scene to paint and merge.
 */
export function carGeometries() {
  // 0.3 wide, 0.34 deep and 0.27 tall: its floor, its roof, its back and its far side.
  return [block([0.3, 0.014, 0.34], 0.005), block([0.3, 0.014, 0.34], 0.005, [0, 0.256, 0]), block([0.3, 0.27, 0.012], 0.004, [0, 0, -0.164]), block([0.012, 0.27, 0.34], 0.004, [0.144, 0, 0])]
}
