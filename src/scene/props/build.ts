/*
 * The static props as parts (scene kit v1): each builder takes a spec from specs.ts and makes the prop's pieces in the prop's own
 * space (metres, base at y = 0, front toward +z), each in a tone, and the footprints its contact shadows fall in. `buildProp` places
 * them at the spec's position and turn. Every edge is rounded or turned; nothing is an unbevelled box or a bare plane.
 *
 * The shapes follow the equipment of a real line [estimated, by eye from catalogue proportions]: a 2½ inch hotel pan's rolled rim
 * and drawn corners, a spun shade's rolled lip, a cast-iron grate's bars, a fryer's wells and baskets, a hood's baffle filters.
 */
import { Matrix4, PlaneGeometry, type BufferGeometry } from 'three'
import { CHANNEL, type Palette, type Tone } from './palette'
import { bent, block, cap, lathe, matrixOf, place, rod, roundedBox, roundedRectPath, straightPath, sweep, tube, uSection, type Part, type Path2, type Vec2, type Vec3 } from './shape'
import {
  BELL,
  PAN_SIZES,
  PRINTER,
  RAIL,
  type FloorSpec,
  type HeatLampSpec,
  type HoodSpec,
  type PanSpec,
  type PassSpec,
  type PlateStackSpec,
  type PropSpec,
  type SpeedRackSpec,
  type StationSpec,
  type WallSpec,
  type WorktopSpec,
} from './specs'

/** Where a prop's contact shadow falls: a soft rounded rectangle on the surface under it. */
export interface Footprint {
  readonly center: Vec3
  /** Its extent along x and z, before `yaw`. */
  readonly size: readonly [number, number]
  readonly radius: number
  /** How far past its edge the shadow fades, in metres. */
  readonly soft: number
  /** 0 to 1: how dark, as a share of the material's opacity. */
  readonly strength: number
  readonly yaw: number
}

export interface Built {
  readonly parts: Part[]
  readonly footprints: Footprint[]
}

interface Maker {
  readonly palette: Palette
  readonly parts: Part[]
  readonly footprints: Footprint[]
  add(geometry: BufferGeometry, tone: Tone): void
  glow(geometry: BufferGeometry, channel: number, strength?: number): void
  shadow(center: Vec3, size: readonly [number, number], options?: { radius?: number; soft?: number; strength?: number }): void
}

function maker(palette: Palette): Maker {
  const parts: Part[] = []
  const footprints: Footprint[] = []
  return {
    palette,
    parts,
    footprints,
    add: (geometry, tone) => void parts.push(palette.part(geometry, tone)),
    glow: (geometry, channel, strength = 1) => void parts.push(palette.glow(geometry, channel, strength)),
    shadow: (center, size, options = {}) =>
      void footprints.push({ center, size, radius: options.radius ?? 0.02, soft: options.soft ?? 0.05, strength: options.strength ?? 1, yaw: 0 }),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Shared pieces                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A path pushed in (or out, for a negative `by`) along its own normals. */
export function insetPath(path: Path2, by: number): Path2 {
  return { ...path, points: path.points.map(([x, z], i) => [x - path.normals[i][0] * by, z - path.normals[i][1] * by] as const) }
}

/** A round leg with a bullet foot, from the floor to `top`. */
function leg(m: Maker, x: number, z: number, top: number, radius = 0.019) {
  m.add(rod([x, 0.035, z], [x, top, z], radius, 14), 'steel')
  m.add(
    place(
      lathe(
        [
          [0, 0],
          [radius * 0.55, 0],
          [radius * 1.05, 0.012],
          [radius * 1.15, 0.03],
          [radius * 1.05, 0.04],
          [0, 0.04],
        ],
        16,
      ),
      [x, 0, z],
    ),
    'shaded',
  )
}

/** A bakelite knob on a front panel facing +z, its face at `z`. */
function knob(m: Maker, x: number, y: number, z: number, radius = 0.022) {
  const k = lathe(
    [
      [0, 0],
      [radius * 0.92, 0],
      [radius, radius * 0.25],
      [radius * 0.96, radius * 0.75],
      [radius * 0.7, radius * 0.95],
      [0, radius],
    ],
    20,
  )
  m.add(place(k, [x, y, z], [Math.PI / 2, 0, 0]), 'knob')
  // The pointer on its face: a small ridge.
  m.add(block([radius * 0.18, radius * 0.06, radius * 1.1], radius * 0.03, [x, y + radius * 0.3, z + radius * 0.98]), 'shaded')
}

/** A rounded-rectangle shell: walls swept round `path` with `profile`, as for a pan, a well or a hood's gutter. */
function shell(path: Path2, profile: readonly Vec2[]): BufferGeometry {
  return sweep(path, profile)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The props                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function worktop(m: Maker, spec: WorktopSpec) {
  const { width: w, depth: d, height: h } = spec
  m.add(block([w, 0.04, d], 0.012, [0, h - 0.04, 0]), 'steel')
  // The rolled front edge, a rod half sunk into the top.
  m.add(rod([-w / 2 + 0.012, h - 0.018, d / 2 - 0.006], [w / 2 - 0.012, h - 0.018, d / 2 - 0.006], 0.018, 16), 'steel')
  m.add(block([w, 0.11, 0.014], 0.006, [0, h, -d / 2 + 0.007]), 'steel')
  m.add(block([w - 0.06, 0.07, 0.02], 0.008, [0, h - 0.11, d / 2 - 0.03]), 'shaded')
  m.add(block([w - 0.09, 0.024, d - 0.09], 0.008, [0, 0.18, 0]), 'shaded')
  for (const [x, z] of [
    [-w / 2 + 0.05, -d / 2 + 0.05],
    [w / 2 - 0.05, -d / 2 + 0.05],
    [-w / 2 + 0.05, d / 2 - 0.05],
    [w / 2 - 0.05, d / 2 - 0.05],
  ] as const)
    leg(m, x, z, h - 0.04)
  m.shadow([0, 0, 0], [w, d], { radius: 0.05, soft: 0.16, strength: 0.75 })
}

function pass(m: Maker, spec: PassSpec) {
  const { width: w, depth: d, height: h, strip } = spec
  // The counter shelf, its front edge rolled down round a rod, and the heated lower shelf with its warm plate inset.
  m.add(block([w, 0.035, d], 0.01, [0, h - 0.035, 0]), 'steel')
  m.add(rod([-w / 2 + 0.014, h - 0.02, d / 2 - 0.008], [w / 2 - 0.014, h - 0.02, d / 2 - 0.008], 0.02, 18), 'steel')
  const lower = h - 0.4
  m.add(block([w - 0.06, 0.03, d - 0.06], 0.01, [0, lower, 0]), 'shaded')
  m.add(block([w - 0.22, 0.006, d - 0.2], 0.003, [0, lower + 0.03, 0]), 'deep')
  // The heated shelf's element, showing as a warm line along its front lip.
  m.glow(block([w - 0.24, 0.006, 0.008], 0.003, [0, lower + 0.031, (d - 0.2) / 2 + 0.008]), CHANNEL.strip, 0.5)
  m.add(block([w - 0.04, 0.06, 0.02], 0.008, [0, h - 0.1, d / 2 - 0.035]), 'shaded')
  for (const [x, z] of [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, d / 2 - 0.04],
    [w / 2 - 0.04, d / 2 - 0.04],
  ] as const)
    leg(m, x, z, h - 0.035)
  m.shadow([0, 0, 0], [w, d], { radius: 0.05, soft: 0.18, strength: 0.8 })
  const gantry = spec.gantry ?? 0
  if (gantry > 0) {
    // The rail's bar on two posts from the back corners, the rail hung under its front.
    const top = h + gantry
    for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) m.add(rod([x, h - 0.01, -d / 2 + 0.035], [x, top + 0.03, -d / 2 + 0.035], 0.016, 14), 'steel')
    m.add(rod([-w / 2 + 0.02, top + 0.012, -d / 2 + 0.035], [w / 2 - 0.02, top + 0.012, -d / 2 + 0.035], 0.017, 16), 'steel')
  }
  if (strip > 0) {
    // The heat-lamp strip over the counter, on two posts from the back corners, glowing along its underside.
    const top = h + strip
    const sz = -d / 2 + d * 0.42
    const sw = w - 0.12
    m.add(block([sw, 0.055, 0.15], 0.012, [0, top, sz]), 'steel')
    m.add(block([sw - 0.04, 0.012, 0.11], 0.004, [0, top - 0.008, sz]), 'shaded')
    m.glow(block([sw - 0.1, 0.014, 0.03], 0.006, [0, top - 0.016, sz]), CHANNEL.strip, 1)
    // Its lens along the front edge: the strip seen burning from the expo's side.
    m.glow(block([sw - 0.1, 0.006, 0.006], 0.003, [0, top - 0.002, sz + 0.074]), CHANNEL.strip, 0.6)
    for (const x of [-sw / 2 + 0.03, sw / 2 - 0.03]) m.add(rod([x, h - 0.01, -d / 2 + 0.035], [x, top + 0.02, -d / 2 + 0.035], 0.014, 14), 'steel')
    for (const x of [-sw / 2 + 0.03, sw / 2 - 0.03]) m.add(block([0.03, 0.03, sz + d / 2 - 0.02], 0.008, [x, top + 0.012, (sz - d / 2 + 0.035) / 2]), 'shaded')
  }
}

function heatLamp(m: Maker, spec: HeatLampSpec) {
  const drop = spec.drop
  // The canopy cup at the ceiling, the cord or rod, then the spun shade with its rolled lip and its bulb.
  m.add(
    lathe(
      [
        [0, -0.028],
        [0.012, -0.028],
        [0.036, -0.022],
        [0.044, -0.008],
        [0.045, 0],
        [0, 0],
      ],
      24,
    ),
    'steel',
  )
  const shadeTop = -drop
  if (spec.hang === 'cord') {
    m.add(tube(bent([[0, -0.02, 0], [0.006, -drop * 0.5, 0.004], [0, shadeTop + 0.02, 0]], 0), 0.0042, 8), 'knob')
  } else {
    m.add(rod([0, -0.02, 0], [0, shadeTop + 0.02, 0], 0.006, 10), 'chrome')
  }
  const neck: Vec2[] = [
    [0, 0.035],
    [0.016, 0.035],
    [0.02, 0.03],
    [0.022, 0],
  ]
  const outer: Vec2[] = [
    [0.026, -0.006],
    [0.034, -0.03],
    [0.055, -0.07],
    [0.083, -0.105],
    [0.103, -0.135],
    [0.112, -0.152],
    [0.1165, -0.158],
    [0.1185, -0.162],
    [0.1175, -0.1665],
    [0.1135, -0.1665],
    [0.1105, -0.161],
  ]
  const inner: Vec2[] = outer
    .slice(0, 6)
    .reverse()
    .map(([r, y]) => [Math.max(0, r - 0.0025), y + 0.002] as const)
  // Round the shell's section counter-clockwise: down the inside, round the rolled lip, up the outside to the neck.
  const section: Vec2[] = [...neck, ...outer, ...inner, [0.018, -0.004], [0, -0.004]]
  m.add(place(lathe(section.reverse(), 32), [0, shadeTop - 0.035, 0]), 'alu')
  // The bulb: a reflector lamp's dome face, glowing, in a dark socket.
  m.add(place(lathe([[0, -0.1], [0.017, -0.1], [0.017, -0.004], [0, -0.004]], 16), [0, shadeTop - 0.035, 0]), 'knob')
  m.glow(
    place(
      lathe(
        [
          [0, -0.185],
          [0.027, -0.184],
          [0.047, -0.177],
          [0.054, -0.163],
          [0.05, -0.147],
          [0.032, -0.122],
          [0.016, -0.1],
          [0, -0.1],
        ],
        28,
      ),
      [0, shadeTop - 0.035, 0],
    ),
    CHANNEL.lamp,
    1,
  )
}

function rail(m: Maker, length: number) {
  // An extruded channel with a slot below for the tickets, and rounded end caps.
  m.add(block([length, RAIL.height, RAIL.depth], 0.006, [0, -RAIL.height, 0]), 'steel')
  m.add(block([length - 0.012, 0.004, 0.007], 0.002, [0, -RAIL.height - 0.0015, 0.003]), 'deep')
  for (const x of [-length / 2 - 0.004, length / 2 + 0.004]) m.add(block([0.012, RAIL.height + 0.006, RAIL.depth + 0.004], 0.005, [x, -RAIL.height - 0.003, 0]), 'deep')
}

function printer(m: Maker) {
  const { width: w, height: h, depth: d } = PRINTER
  // Housing and lid in deep steel, the paper roll in its cradle under the lid's front, the tear bar over the paper's exit.
  m.add(block([w, h * 0.72, d], 0.018, [0, 0.006, 0]), 'deep')
  m.add(block([w - 0.006, h * 0.3, d * 0.55], 0.016, [0, h * 0.7, -d * 0.2]), 'deep')
  m.add(block([w - 0.03, 0.01, d * 0.32], 0.004, [0, h * 0.72, d * 0.2]), 'shaded')
  const roll = lathe(
    [
      [0.012, -0.04],
      [0.037, -0.04],
      [0.0385, -0.038],
      [0.0385, 0.038],
      [0.037, 0.04],
      [0.012, 0.04],
      [0.012, -0.04],
    ],
    28,
  )
  m.add(place(roll, [0, h * 0.72 + 0.028, d * 0.12], [0, 0, Math.PI / 2]), 'paper')
  m.add(block([w - 0.02, 0.008, 0.012], 0.003, [0, h * 0.72 + 0.008, d * 0.42]), 'chrome')
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [-d / 2 + 0.025, d / 2 - 0.025]) m.add(block([0.018, 0.006, 0.018], 0.003, [x, 0, z]), 'knob')
  m.shadow([0, 0, 0], [w, d], { radius: 0.02, soft: 0.035, strength: 0.9 })
}

function bellBase(m: Maker) {
  m.add(
    lathe(
      [
        [0, 0],
        [BELL.radius - 0.002, 0],
        [BELL.radius, 0.002],
        [BELL.radius, 0.009],
        [BELL.radius - 0.004, 0.014],
        [0.014, 0.017],
        [0.006, 0.019],
        [0.006, 0.026],
        [0, 0.026],
      ],
      36,
    ),
    'deep',
  )
  m.shadow([0, 0, 0], [BELL.radius * 2, BELL.radius * 2], { radius: BELL.radius, soft: 0.02, strength: 0.9 })
}

function spike(m: Maker) {
  m.add(
    lathe(
      [
        [0, 0],
        [0.042, 0],
        [0.044, 0.004],
        [0.04, 0.014],
        [0.012, 0.018],
        [0.004, 0.022],
        [0, 0.022],
      ],
      32,
    ),
    'deep',
  )
  m.add(
    lathe(
      [
        [0, 0.02],
        [0.0026, 0.02],
        [0.0026, 0.15],
        [0.0012, 0.162],
        [0, 0.166],
      ],
      10,
    ),
    'chrome',
  )
  m.shadow([0, 0, 0], [0.088, 0.088], { radius: 0.044, soft: 0.02, strength: 0.9 })
}

/** A hotel pan's sheet, swept round its drawn corners: inner wall, rolled rim, outer wall, then its floor inside and out. */
export function panGeometries(size: PanSpec['size'], depth: number): BufferGeometry[] {
  const [w, d] = PAN_SIZES[size]
  const flange = 0.012
  const taper = Math.min(0.012, depth * 0.1)
  const path = roundedRectPath(w - 2 * flange, d - 2 * flange, 0.03, 5, 0.12)
  const profile: Vec2[] = [
    [-taper - 0.011, 0.0016],
    [-taper - 0.004, 0.0035],
    [-taper - 0.0008, 0.009],
    [-0.0008, depth - 0.005],
    [0.0015, depth - 0.0004],
    [0.006, depth],
    [0.0105, depth - 0.0006],
    [0.0128, depth - 0.003],
    [0.0124, depth - 0.0058],
    [0.009, depth - 0.0066],
    [0.0006, depth - 0.0068],
    [-taper + 0.0008, 0.009],
    [-taper - 0.003, 0.0018],
    [-taper - 0.011, 0],
  ]
  return [shell(path, [...profile].reverse()), cap(insetPath(path, taper + 0.011), 0.0016, true, 3), cap(insetPath(path, taper + 0.011), 0, false, 1)]
}

function pan(m: Maker, spec: PanSpec) {
  for (const geometry of panGeometries(spec.size, spec.depth)) m.add(geometry, 'steel')
  const [w, d] = PAN_SIZES[spec.size]
  m.shadow([0, 0, 0], [w - 0.03, d - 0.03], { radius: 0.03, soft: 0.025, strength: 0.85 })
}

/** A dinner plate's turned profile, glazed: well, rim and lip on top, the foot ring under it. */
export function plateProfile(): Vec2[] {
  // Counter-clockwise round the section: out under the foot, up and over the rim, back in across the well.
  return [
    [0, 0.003],
    [0.066, 0.0034],
    [0.068, 0],
    [0.0735, 0],
    [0.076, 0.0036],
    [0.098, 0.0048],
    [0.123, 0.0142],
    [0.1338, 0.0184],
    [0.1356, 0.0205],
    [0.1345, 0.0222],
    [0.131, 0.021],
    [0.122, 0.0175],
    [0.099, 0.009],
    [0.088, 0.0065],
    [0, 0.0065],
  ]
}

/**
 * A stack of plates as one turned silhouette: the bottom plate's foot, a rim for every plate up the side, and the top plate's well,
 * which is all of a stack anyone sees.
 */
export function stackProfile(count: number): Vec2[] {
  const pitch = 0.0105
  const out: Vec2[] = [
    [0, 0.003],
    [0.066, 0.0034],
    [0.068, 0],
    [0.0735, 0],
    [0.076, 0.0036],
    [0.098, 0.0048],
  ]
  for (let i = 0; i < count; i++) {
    const y = i * pitch
    out.push([0.123, y + 0.0142], [0.1338, y + 0.0184], [0.1356, y + 0.0205], [0.1345, y + 0.0222])
    if (i < count - 1) out.push([0.124, y + 0.0225])
  }
  const top = (count - 1) * pitch
  out.push([0.131, top + 0.021], [0.122, top + 0.0175], [0.099, top + 0.009], [0.088, top + 0.0065], [0, top + 0.0065])
  return out
}

function plateStack(m: Maker, spec: PlateStackSpec) {
  m.add(lathe(stackProfile(spec.count), 32), 'ceramic')
  m.shadow([0, 0, 0], [0.24, 0.24], { radius: 0.12, soft: 0.03, strength: 0.8 })
}

/** The cabinet every station stands in: its body on short legs, its control panel, its knobs and its pilot. */
function stationBody(m: Maker, spec: StationSpec, knobs: number, cabinetTop = spec.height - 0.02) {
  const { width: w, depth: d, height: h, channel } = spec
  m.add(block([w - 0.004, cabinetTop - 0.11, d - 0.03], 0.012, [0, 0.11, -0.015]), 'steel')
  m.add(block([w, 0.11, 0.05], 0.012, [0, h - 0.14, d / 2 - 0.035]), 'shaded')
  for (let k = 0; k < knobs; k++) knob(m, -w / 2 + (w * (k + 0.5)) / knobs, h - 0.085, d / 2 - 0.01)
  m.glow(place(lathe([[0, 0], [0.006, 0], [0.006, 0.004], [0.004, 0.006], [0, 0.006]], 12), [w / 2 - 0.03, h - 0.115, d / 2 - 0.01], [Math.PI / 2, 0, 0]), channel, 1)
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) for (const z of [-d / 2 + 0.05, d / 2 - 0.06]) leg(m, x, z, 0.12, 0.022)
  m.shadow([0, 0, -0.015], [w, d - 0.03], { radius: 0.03, soft: 0.14, strength: 0.85 })
}

function griddle(m: Maker, spec: StationSpec) {
  const { width: w, depth: d, height: h, channel } = spec
  stationBody(m, spec, Math.max(2, Math.round(w / 0.3)))
  // The plate, its splashes, and the trough at its front; the plate's edge burns when the station is lit.
  m.add(block([w - 0.03, 0.022, d - 0.12], 0.004, [0, h - 0.03, -0.03]), 'griddle')
  m.glow(block([w - 0.06, 0.004, 0.006], 0.002, [0, h - 0.012, d / 2 - 0.085]), channel, 0.9)
  m.add(block([w, 0.13, 0.016], 0.006, [0, h - 0.01, -d / 2 + 0.03]), 'steel')
  for (const x of [-w / 2 + 0.008, w / 2 - 0.008]) m.add(block([0.016, 0.07, d - 0.12], 0.006, [x, h - 0.01, -0.03]), 'steel')
  const trough = sweep(straightPath(w - 0.04, 1), uSection(0.028, 0.018, 0.0015, -0.004))
  m.add(place(trough, [0, h - 0.014, d / 2 - 0.09]), 'steel')
}

function burners(m: Maker, spec: StationSpec) {
  const { width: w, depth: d, height: h, channel } = spec
  stationBody(m, spec, 4)
  m.add(block([w, 0.03, d - 0.1], 0.008, [0, h - 0.04, -0.02]), 'steel')
  const cells = [
    [-w / 4, -d / 4 + 0.02],
    [w / 4, -d / 4 + 0.02],
    [-w / 4, d / 4 - 0.06],
    [w / 4, d / 4 - 0.06],
  ] as const
  for (const [x, z] of cells) {
    // A bowl, the burner's head and cap in iron, the ring of flame between them glowing when lit, and the grate over it.
    m.add(place(lathe([[0.106, 0.014], [0.11, 0.012], [0.105, 0.004], [0.09, 0], [0, 0]], 28), [x, h - 0.012, z]), 'shaded')
    m.add(place(lathe([[0, 0.012], [0.034, 0.012], [0.036, 0.024], [0.032, 0.03], [0, 0.03]], 24), [x, h - 0.012, z]), 'iron')
    m.glow(place(lathe([[0.031, 0.024], [0.041, 0.022], [0.042, 0.026], [0.033, 0.03]], 28), [x, h - 0.012, z]), channel, 1)
    m.add(place(lathe([[0, 0.033], [0.026, 0.033], [0.027, 0.038], [0.02, 0.041], [0, 0.041]], 20), [x, h - 0.012, z]), 'iron')
    const g = 0.125
    const top = h + 0.036
    for (const k of [-1, 1]) {
      m.add(tube(bent([[x - g, h - 0.01, z + k * 0.035], [x - g, top, z + k * 0.035], [x + g, top, z + k * 0.035], [x + g, h - 0.01, z + k * 0.035]], 0.012, 3), 0.0055, 6), 'iron')
      m.add(tube(bent([[x + k * 0.035, h - 0.01, z - g], [x + k * 0.035, top + 0.004, z - g], [x + k * 0.035, top + 0.004, z + g], [x + k * 0.035, h - 0.01, z + g]], 0.012, 3), 0.0055, 6), 'iron')
    }
  }
  m.add(block([w, 0.09, 0.016], 0.006, [0, h - 0.01, -d / 2 + 0.03]), 'steel')
}

function fryer(m: Maker, spec: StationSpec) {
  const { width: w, depth: d, height: h, channel } = spec
  // The cabinet stops under the wells; the top is a frame round their openings, closed at the sides by the skin.
  const depth = 0.16
  stationBody(m, spec, 2, h - depth - 0.012)
  const wells = 2
  const ww = (w - 0.06) / wells
  const wellD = d - 0.24
  const wz = -0.03
  const frontEdge = wz + wellD / 2
  const backEdge = wz - wellD / 2
  m.add(block([w, 0.024, d / 2 - 0.015 - frontEdge], 0.008, [0, h - 0.03, (frontEdge + d / 2 - 0.015) / 2]), 'steel')
  m.add(block([w, 0.024, backEdge + d / 2 - 0.015], 0.008, [0, h - 0.03, (backEdge - d / 2 + 0.015) / 2]), 'steel')
  for (const x of [-w / 2 + 0.015, w / 2 - 0.015, 0]) m.add(block([0.03, 0.024, wellD + 0.01], 0.006, [x, h - 0.03, wz]), 'steel')
  for (const x of [-w / 2 + 0.006, w / 2 - 0.006]) m.add(block([0.012, depth + 0.02, d - 0.03], 0.004, [x, h - depth - 0.03, -0.015]), 'steel')
  for (let k = 0; k < wells; k++) {
    const x = -w / 2 + 0.03 + ww * (k + 0.5)
    const path = roundedRectPath(ww - 0.03, wellD, 0.025, 6)
    const well = shell(path, [
      [0.012, 0.0],
      [0.002, -0.004],
      [0, -0.012],
      [0, -depth],
    ])
    m.add(place(well, [x, h - 0.006, wz]), 'steel')
    m.add(place(cap(insetPath(path, 0.001), 0, true, 3), [x, h - 0.075, wz]), 'oil')
    // The element's loops lie at the oil's surface and burn when the station is lit.
    const reach = (d - 0.3) / 2
    for (const dx of [-0.035, 0.035]) {
      m.glow(tube(bent([[x + dx, h - 0.07, wz + reach], [x + dx, h - 0.066, wz - reach], [x + dx + 0.022, h - 0.066, wz - reach], [x + dx + 0.022, h - 0.07, wz + reach]], 0.01), 0.0055, 6), channel, 1)
    }
    // A basket, hung on the well's back, its handle up toward the cook.
    const basket = roundedRectPath(ww - 0.07, d - 0.32, 0.015, 4)
    m.add(place(tube([...basket.points.map(([bx, bz]) => [bx, 0, bz] as const)], 0.0025, 6, undefined, true), [x, h + 0.035, -0.04]), 'steel')
    m.add(place(tube([...basket.points.map(([bx, bz]) => [bx, 0, bz] as const)], 0.0018, 5, undefined, true), [x, h - 0.04, -0.04]), 'steel')
    for (const [bx, bz] of basket.points.filter((_, i) => i % 3 === 0)) m.add(rod([x + bx, h - 0.04, -0.04 + bz], [x + bx, h + 0.035, -0.04 + bz], 0.0012, 4), 'steel')
    m.add(tube(bent([[x, h + 0.035, -0.04 + (d - 0.32) / 2], [x, h + 0.09, -0.04 + (d - 0.32) / 2 + 0.06], [x, h + 0.1, -0.04 + (d - 0.32) / 2 + 0.16]], 0.03), 0.004, 8), 'steel')
    m.add(rod([x, h + 0.1, -0.04 + (d - 0.32) / 2 + 0.12], [x, h + 0.106, -0.04 + (d - 0.32) / 2 + 0.2], 0.011, 12), 'knob')
  }
  m.add(block([w, 0.14, 0.016], 0.006, [0, h - 0.01, -d / 2 + 0.03]), 'steel')
}

/** A flat grid facing +z (or up, turned by the caller), with UVs in metres, cut every `cell` so occlusion can shade it. */
function grid(width: number, height: number, cell: number): BufferGeometry {
  const geometry = new PlaneGeometry(width, height, Math.max(1, Math.ceil(width / cell)), Math.max(1, Math.ceil(height / cell)))
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) + width / 2, position.getY(i) + height / 2)
  return geometry
}

function tileWall(m: Maker, spec: WallSpec) {
  const { width: w, height: h } = spec
  m.add(place(grid(w, h, 0.2), [0, h / 2, 0]), 'tile')
  // A coved base where the tile meets the floor.
  const cove = sweep(straightPath(w, 1), [
    [0.06, 0],
    [0.03, 0.01],
    [0.012, 0.03],
    [0, 0.06],
  ])
  m.add(cove, 'tile')
}

function floor(m: Maker, spec: FloorSpec) {
  m.add(place(grid(spec.width, spec.depth, 0.3), [0, 0, 0], [-Math.PI / 2, 0, 0]), 'floor')
}

function hood(m: Maker, spec: HoodSpec) {
  const { width: w, depth: d, height: h } = spec
  // Its top on the wall, its front skirt, its sides, and the gutter round its lower edge.
  m.add(block([w, 0.02, d], 0.008, [0, -0.02, d / 2]), 'steel')
  m.add(block([w, h, 0.02], 0.008, [0, -h, d - 0.01]), 'steel')
  for (const x of [-w / 2 + 0.01, w / 2 - 0.01]) m.add(block([0.02, h, d], 0.008, [x, -h, d / 2]), 'steel')
  const gutter = sweep(straightPath(w - 0.02, 1), uSection(0.036, 0.026, 0.0015, -0.026))
  m.add(place(gutter, [0, -h, d - 0.05]), 'shaded')
  // The filter bank, tilted down toward the front, a frame and its baffles to each filter.
  const filters = Math.max(1, Math.floor((w - 0.1) / 0.42))
  const fw = (w - 0.1) / filters
  const tilt = 0.55
  const bank = new Matrix4().multiplyMatrices(matrixOf([0, -h * 0.45, d * 0.4]), matrixOf([0, 0, 0], [tilt, 0, 0]))
  for (let f = 0; f < filters; f++) {
    const x = -w / 2 + 0.05 + fw * (f + 0.5)
    const frame = shell(roundedRectPath(fw - 0.02, 0.4, 0.02, 3), [
      [-0.012, -0.012],
      [0, -0.012],
      [0, 0.012],
      [-0.012, 0.012],
      [-0.012, -0.012],
    ])
    m.add(place(frame, [x, 0, 0]).applyMatrix4(bank), 'shaded')
    const slats = 5
    for (let s = 0; s < slats; s++) {
      const sx = x - fw / 2 + 0.02 + ((fw - 0.04) * (s + 0.5)) / slats
      m.add(place(roundedBox([0.04, 0.003, 0.38], 0.0012, 1), [sx, 0, 0], [0, 0, s % 2 === 0 ? 0.65 : -0.65]).applyMatrix4(bank), 'steel')
    }
  }
  // Two lights under the front edge, their tubes glowing in the tubes' white.
  for (const x of [-w / 4, w / 4]) {
    m.add(block([0.3, 0.035, 0.12], 0.008, [x, -h - 0.032, d - 0.12]), 'shaded')
    m.glow(block([0.27, 0.006, 0.09], 0.003, [x, -h - 0.038, d - 0.12]), CHANNEL.tube, 1)
  }
}

function speedRack(m: Maker, spec: SpeedRackSpec) {
  const w = 0.58
  const d = 0.36
  const h = spec.height
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) m.add(block([0.026, h - 0.1, 0.026], 0.005, [x, 0.09, z]), 'steel')
  for (const y of [0.1, h - 0.03]) {
    for (const z of [-d / 2, d / 2]) m.add(block([w + 0.026, 0.026, 0.026], 0.005, [0, y, z]), 'steel')
    for (const x of [-w / 2, w / 2]) m.add(block([0.026, 0.026, d], 0.005, [x, y, 0]), 'steel')
  }
  const pitch = (h - 0.3) / Math.max(1, spec.shelves - 1)
  for (let s = 0; s < spec.shelves; s++) {
    const y = 0.2 + s * pitch
    for (const k of [-1, 1]) {
      const runner = sweep(straightPath(d - 0.01, 1), [
        [0, 0],
        [0.016, 0],
        [0.016, 0.002],
        [0.002, 0.002],
        [0.002, 0.012],
        [0, 0.012],
        [0, 0],
      ])
      m.add(place(runner, [k * (w / 2 - 0.013), y, 0], [0, k > 0 ? -Math.PI / 2 : Math.PI / 2, 0]), 'shaded')
    }
    if (spec.pans.includes(s)) for (const geometry of panGeometries('1/1', 0.065)) m.add(place(geometry, [0, y - 0.064, 0]), 'steel')
  }
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      m.add(block([0.03, 0.03, 0.04], 0.006, [x, 0.06, z]), 'shaded')
      m.add(place(lathe([[0, -0.015], [0.03, -0.015], [0.032, -0.012], [0.032, 0.012], [0.03, 0.015], [0, 0.015]], 18), [x, 0.032, z], [0, 0, Math.PI / 2]), 'knob')
    }
  }
  m.shadow([0, 0, 0], [w + 0.04, d + 0.04], { radius: 0.03, soft: 0.12, strength: 0.7 })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Placing a spec                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const BUILDERS: { [K in PropSpec['kind']]: (m: Maker, spec: Extract<PropSpec, { kind: K }>) => void } = {
  worktop,
  pass,
  'heat-lamp': heatLamp,
  rail: (m, spec) => rail(m, spec.length),
  printer: (m) => printer(m),
  'bell-base': (m) => bellBase(m),
  spike: (m) => spike(m),
  pan,
  'plate-stack': plateStack,
  griddle,
  burners,
  fryer,
  'tile-wall': tileWall,
  floor,
  hood,
  'speed-rack': speedRack,
}

/** One prop's parts and footprints, placed in the world. */
export function buildProp(spec: PropSpec, palette: Palette): Built {
  const m = maker(palette)
  ;(BUILDERS[spec.kind] as (m: Maker, spec: PropSpec) => void)(m, spec)
  const yaw = spec.yaw ?? 0
  const matrix = matrixOf(spec.at, [0, yaw, 0])
  for (const part of m.parts) part.geometry.applyMatrix4(matrix)
  const footprints = m.footprints
    .filter((footprint) => footprint.strength > 0)
    .map((footprint) => {
      const [x, y, z] = footprint.center
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      return { ...footprint, center: [spec.at[0] + x * c + z * s, spec.at[1] + y, spec.at[2] - x * s + z * c] as const, yaw: footprint.yaw + yaw }
    })
  return { parts: m.parts, footprints }
}
