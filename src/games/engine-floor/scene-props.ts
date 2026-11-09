/*
 * Back of House's own props (scene kit v1's way, src/scene/props/index.ts): the house's decks and its two walls (the partition with the
 * ticket windows, and the dumbwaiter's shaft), its rooms' furniture the kit has no prop for (the dining room's table with its chairs, a
 * host stand for each pair of hands at the host stand and the night's book on its lectern, the order desk's printer's tape), the line's
 * canopy, the glow of a lit lamp's bulb, what a stage lays in it besides the kit's spike (the "Heard!" gate, the window shelf, the pedestal
 * a spike stands on between two host stands), and the ticket's sheet. Each is built from shape.ts's rounded boxes, rods,
 * lathes and sweeps, in the palette's tones, through the kit's own
 * maker, with a footprint for its contact shadow where it stands; the static set merges them with the kit's props, so they share the
 * kit's draws and its baked occlusion. No unbevelled box and no bare plane. Every size is [estimated], on the kit's proportions.
 *
 * Only the scene imports this (it is in the 3D chunk). It imports no three of its own: the kit's helpers make the geometry.
 */
import type { PropMaker } from '@/scene/props/build'
import { CHANNEL } from '@/scene/props/palette'
import { ticketGeometry } from '@/scene/props/paper'
import { block, boxUv, lathe, place, rod, roundedRectPath, sweep, type Vec2 } from '@/scene/props/shape'
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

/** A host stand's body narrows to this share of its width at its foot, a podium's lean [estimated]. */
const FOOT_SHARE = 0.62

/**
 * A pair of hands' host stand, one each, on its own footprint: a podium of brushed steel, broken at every edge by a wide bevel and
 * narrowing toward its foot, on a plinth set in under it, a fielded panel of shaded steel let into its front inside a bead of bright
 * steel, and a top that overhangs it all round with a rolled front edge, where the hands' spike, gate and chits stand.
 */
function stand(m: PropMaker, { width: w, depth: d, height: h }: Of<'stand'>) {
  const base = 0.055
  const body = h - base - 0.035
  const front = d / 2 - 0.03
  // The podium's lean: across, a part scales from FOOT_SHARE at the body's foot to whole under its top, its normals turned with it (by
  // the lean's inverse transpose), so its bevels still catch the light. A leaned box takes its grain again from where it now stands, so
  // the brush runs one way across each face and no face splits along a diagonal.
  const lean = (part: ReturnType<typeof block>) => {
    const p = part.getAttribute('position')
    const n = part.getAttribute('normal')
    const rise = (1 - FOOT_SHARE) / body
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const s = FOOT_SHARE + rise * Math.min(body, Math.max(0, p.getY(i) - base))
      const nx = n.getX(i) / s
      const ny = n.getY(i) - (x * rise * n.getX(i)) / s
      const length = Math.hypot(nx, ny, n.getZ(i))
      p.setX(i, x * s)
      n.setXYZ(i, nx / length, ny / length, n.getZ(i) / length)
    }
    return part
  }
  m.add(block([(w - 0.06) * FOOT_SHARE - 0.04, 0.06, d - 0.12], 0.015, [0, 0, -0.02]), 'shaded')
  m.add(boxUv(lean(block([w - 0.06, body, d - 0.04], 0.035, [0, base, -0.01]))), 'steel')
  // The panel and its bead, standing a little proud of the podium's face.
  const [pw, ph, py] = [w - 0.22, body - 0.12, base + body / 2]
  m.add(boxUv(lean(block([pw, ph, 0.01], 0.004, [0, py - ph / 2, front + 0.004]))), 'shaded')
  for (const k of [-1, 1]) {
    m.add(lean(rod([-pw / 2, py + (k * ph) / 2, front + 0.009], [pw / 2, py + (k * ph) / 2, front + 0.009], 0.007, 8)), 'steel')
    m.add(lean(rod([(k * pw) / 2, py - ph / 2, front + 0.009], [(k * pw) / 2, py + ph / 2, front + 0.009], 0.007, 8)), 'steel')
  }
  m.add(block([w, 0.035, d], 0.012, [0, h - 0.035, 0]), 'steel')
  m.add(rod([-w / 2 + 0.012, h - 0.018, d / 2 - 0.006], [w / 2 - 0.012, h - 0.018, d / 2 - 0.006], 0.018, 16), 'steel')
  m.shadow([0, 0, -0.01], [(w - 0.06) * FOOT_SHARE, d - 0.04], { radius: 0.04, soft: 0.1, strength: 0.75 })
}

/**
 * The host stand's lectern, past its last pair of hands: a turned foot, a column of brushed steel, and a desk of deep steel tipped toward
 * the room with a ledge along its foot, the book of the night's covers open on it, its pages a little apart at the spine, so they read
 * white from across the house.
 */
function lectern(m: PropMaker, { height: h }: Of<'lectern'>) {
  const desk = (part: ReturnType<typeof block>) => place(part, [0, h + 0.05, 0], [0.6, 0, 0])
  m.add(lathe([[0, 0], [0.11, 0], [0.115, 0.01], [0.09, 0.03], [0, 0.03]], 24), 'shaded')
  m.add(block([0.08, h - 0.04, 0.08], 0.018, [0, 0.03, 0]), 'steel')
  m.add(desk(block([0.26, 0.025, 0.22], 0.008, [0, -0.0125, 0])), 'deep')
  m.add(desk(rod([-0.13, 0.016, 0.104], [0.13, 0.016, 0.104], 0.007, 8)), 'steel')
  for (const k of [-1, 1]) m.add(desk(place(block([0.115, 0.008, 0.19], 0.003, [k * 0.06, 0.0125, -0.006]), [0, 0, 0], [0, 0, k * 0.06])), 'paper')
  m.shadow([0, 0, 0], [0.23, 0.23], { radius: 0.115, soft: 0.05, strength: 0.8 })
}

/** The pedestal a spike stands on between two host stands, its top at theirs: a turned foot, a stem and a round top with a rolled edge. */
function pedestal(m: PropMaker, { height: h }: Of<'pedestal'>) {
  m.add(lathe([[0, 0], [0.1, 0], [0.104, 0.008], [0.03, 0.028], [0, 0.028]], 24), 'shaded')
  m.add(rod([0, 0.02, 0], [0, h - 0.02, 0], 0.015, 12), 'steel')
  m.add(lathe([[0, h - 0.024], [0.085, h - 0.024], [0.095, h - 0.013], [0.09, h], [0, h]], 28), 'steel')
  m.shadow([0, 0, 0], [0.2, 0.2], { radius: 0.1, soft: 0.04, strength: 0.8 })
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

const BUILD: Record<HouseProp['kind'], (m: PropMaker, p: never) => void> = { deck, partition, shaft, post: (m, p: Of<'post'>) => post(m, 0, 0, p.height, 0.022), canopy, table, stand, lectern, pedestal, ring, gate, shelf, tape }

/** The house's own props, by kind: what the scene builds through `customOf` rather than hands to the kit as they are. */
export const OWN = new Set(Object.keys(BUILD))

/** A house prop as the kit's set takes it: a custom spec built through the kit's maker. */
export function customOf(prop: HouseProp): CustomSpec {
  return { kind: 'custom', id: prop.id, at: prop.at, build: (m) => (BUILD[prop.kind] as (m: PropMaker, p: HouseProp) => void)(m, prop) }
}

/**
 * The ticket [estimated]: a kitchen's slip a hand wide and twice as long, the print's own shape, 3 mm thick at the house's scale; rolled,
 * it hangs 200 mm, as the flat slip of 100 by 200 mm it replaces did, so it is as tall in every framing.
 */
export const SLIP = { width: 0.12, height: 0.24, thickness: 0.003 } as const
/** The roll's set in it [estimated]: the sheet cups across toward its foot, and from `from` down its foot rolls forward round `radius`. */
export const ROLL = { from: 0.165, radius: 0.032, cup: 0.008 } as const
/** Where the kit's paper samples its blank for a sheet's back and cut edges (paper.ts), and the shaded corner of the cell they take here. */
const BLANK = [0.04, 0.03]
const SHADE = [0.012, 0.012]

/**
 * The ticket's sheet, which moves and so is not in the set: the kit's slip (paper.ts's `ticketGeometry`, flat), set as a ticket torn off
 * the roll keeps it, at a scale the cutaway reads. It cups across, its corners forward, more toward its foot, and its foot rolls forward
 * round a tight curl and back up toward its face, so where it turns the paper's back and its cut edge show, in the shaded paper of a
 * cell's corner. Its top edge's middle is the origin, as the kit's.
 */
export function ticketSheet() {
  // Rows of 5 mm, so the curl turns in steps of about a tenth of a radian.
  const sheet = ticketGeometry(SLIP.width, SLIP.height, SLIP.thickness, 0, 48)
  const position = sheet.getAttribute('position')
  const uv = sheet.getAttribute('uv')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const down = -position.getY(i)
    let y = -down
    let z = position.getZ(i) + ROLL.cup * ((2 * x) / SLIP.width) ** 2 * Math.min(down, ROLL.from) / ROLL.from
    // Past where the roll starts, the sheet wraps round the curl's axis, in front of its face: its face inside, its back outside.
    const turn = (down - ROLL.from) / ROLL.radius
    if (turn > 0) {
      const r = ROLL.radius - z
      y = -ROLL.from - r * Math.sin(turn)
      z = ROLL.radius - r * Math.cos(turn)
    }
    position.setXYZ(i, x, y, z)
    if (Math.abs(uv.getX(i) - BLANK[0]) < 1e-6 && Math.abs(uv.getY(i) - BLANK[1]) < 1e-6) uv.setXY(i, SHADE[0], SHADE[1])
  }
  sheet.computeVertexNormals()
  return sheet
}

/**
 * The dumbwaiter's car, which moves and so is not in the set: a steel box open at the house's side, where the ticket goes in, and at its
 * front, where it is seen to ride, as geometries in its own space with its floor at y = 0, for the scene to paint and merge.
 */
export function carGeometries() {
  // 0.3 wide, 0.34 deep and 0.27 tall: its floor, its roof, its back and its far side.
  return [block([0.3, 0.014, 0.34], 0.005), block([0.3, 0.014, 0.34], 0.005, [0, 0.256, 0]), block([0.3, 0.27, 0.012], 0.004, [0, 0, -0.164]), block([0.012, 0.27, 0.34], 0.004, [0.144, 0, 0])]
}
