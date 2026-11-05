/*
 * Back of House's own props (scene kit v1's way, src/scene/props/index.ts): the house's decks and posts, its two towers (the partition with
 * the ticket windows, and the dumbwaiter's shaft), and what a stage lays in it besides the kit's spike (the "Heard!" gate, the window shelf). Each is
 * built from shape.ts's rounded boxes, rods, lathes and sweeps, in the palette's tones, through the kit's own maker, with a footprint for
 * its contact shadow where it stands; the static set merges them with the kit's props, so they share the kit's draws and its baked
 * occlusion. No unbevelled box and no bare plane. Every size is [estimated], on the kit's proportions.
 *
 * Only the scene imports this (it is in the 3D chunk). It imports no three of its own: the kit's helpers make the geometry.
 */
import type { PropMaker } from '@/scene/props/build'
import { block, lathe, place, rod, roundedRectPath, sweep, type Vec2 } from '@/scene/props/shape'
import type { CustomSpec } from '@/scene/props/specs'
import type { HouseProp } from './scene-layout'

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

/** A storey's deck, `at` its top's centre: the slab, its rolled front edge, and the stiffener under it that the storey below sees. */
function deck(m: PropMaker, p: Extract<HouseProp, { kind: 'deck' }>) {
  const { width: w, depth: d, thick } = p
  m.add(block([w, thick, d], 0.012, [0, -thick, 0]), 'steel')
  m.add(rod([-w / 2 + 0.014, -0.022, d / 2 - 0.006], [w / 2 - 0.014, -0.022, d / 2 - 0.006], 0.024, 16), 'steel')
  m.add(block([w - 0.08, 0.03, 0.03], 0.008, [0, -thick - 0.03, d / 2 - 0.06]), 'shaded')
}

/**
 * The ticket windows' partition: a steel wall, its face toward the house at x = 0, cut by a framed window into each storey with a sill
 * in front of it, so a ticket goes through the window into the chute behind and comes out through another storey's.
 */
function partition(m: PropMaker, p: Extract<HouseProp, { kind: 'partition' }>) {
  const half = p.depth / 2
  const [high, from, to] = p.window
  const wall = (y0: number, y1: number, z0: number, z1: number) => m.add(block([0.04, y1 - y0, z1 - z0], 0.006, [-0.02, y0, (z0 + z1) / 2]), 'steel')
  let y = 0
  for (const deckTop of [...p.decks].sort((a, b) => a - b)) {
    const sill = deckTop + p.sill
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
function shaft(m: PropMaker, p: Extract<HouseProp, { kind: 'shaft' }>) {
  for (const x of [-0.17, 0.17]) for (const z of [-0.2, 0.2]) post(m, x, z, p.height, 0.017)
  m.add(block([0.42, 0.12, 0.48], 0.016, [0, p.height, 0]), 'shaded')
  for (const y of p.landings) {
    m.add(block([0.34, 0.012, 0.4], 0.004, [0, y - 0.012, 0]), 'shaded')
    m.add(rod([0.17, y + 0.3, -0.2], [0.17, y + 0.3, 0.2], 0.008, 8), 'steel')
  }
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

const BUILD: Record<HouseProp['kind'], (m: PropMaker, p: never) => void> = {
  deck,
  partition,
  shaft,
  post: (m, p: { height?: number }) => post(m, 0, 0, p.height ?? 1, 0.022),
  gate,
  shelf,
}

/** A house prop as the kit's set takes it: a custom spec built through the kit's maker. */
export function customOf(prop: HouseProp): CustomSpec {
  return { kind: 'custom', id: prop.id, at: prop.at, build: (m) => (BUILD[prop.kind] as (m: PropMaker, p: HouseProp) => void)(m, prop) }
}

/**
 * The dumbwaiter's car, which moves and so is not in the set: a steel box open at the house's side, where the ticket goes in, and at its
 * front, where it is seen to ride, as geometries in its own space with its floor at y = 0, for the scene to paint and merge.
 */
export function carGeometries() {
  const w = 0.3
  const d = 0.34
  const h = 0.27
  return [
    block([w, 0.014, d], 0.005, [0, 0, 0]),
    block([w, 0.014, d], 0.005, [0, h - 0.014, 0]),
    block([w, h, 0.012], 0.004, [0, 0, -d / 2 + 0.006]),
    block([0.012, h, d], 0.004, [w / 2 - 0.006, 0, 0]),
  ]
}
