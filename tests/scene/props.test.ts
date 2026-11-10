/*
 * Scene kit v1's props, with no WebGL: every builder makes real geometry in metres (finite, with unit normals, the size of the
 * equipment it is), nothing is an unbevelled box, a static set merges into one mesh per surface, the baked occlusion darkens a pan's
 * inside and the floor under a counter and leaves open floor alone, the glow channels light by a mask, the print atlas's cells
 * tile it, and the props import nothing that would drag them into a page's first paint. Service's finish review, round 2: the heat
 * lamps light the steel and never paint it, a plate on the pass sits on the steel in its own contact shadow, and a room that lights
 * itself falls away from its line.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Box3, BufferGeometry, ShaderChunk, Vector3 } from 'three'
import { staticSceneTokens } from '@/design/scene-tokens'
import { buildProp, panGeometries, PLATE_SHADOWS, plateFootprints, plateProfile } from '@/scene/props/build'
import { bakeOcclusion } from '@/scene/props/occlusion'
import { CHANNEL, paletteFrom } from '@/scene/props/palette'
import { cellOffset, feedPath, ticketGeometry } from '@/scene/props/paper'
import { ALWAYS_LIT, buildSet, litMask, roomShade, type RoomLight } from '@/scene/props/set'
import { lathe, roundedBox, roundedRectPath, sweep } from '@/scene/props/shape'
import { PAN_SIZES, PLATE, TICKET, type PropSpec } from '@/scene/props/specs'
import { drawPrint, PRINT_CELLS, PRINT_SIZE, tileMaps, floorMaps } from '@/scene/props/surfaces'
import { countSpotSpecular, POOL_FRAGMENT } from '@/scene/spot-pools'

const root = path.resolve(import.meta.dirname, '../..')
const palette = paletteFrom(staticSceneTokens())

/** Every finite, every normal of unit length. */
function sound(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < position.count; i++) {
    for (let a = 0; a < 3; a++) expect(Number.isFinite(position.getComponent(i, a))).toBe(true)
    expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 2)
  }
}

const boundsOf = (geometry: BufferGeometry) => new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never)

const SPECS: PropSpec[] = [
  { kind: 'worktop', id: 'w', at: [0, 0, 0], width: 1.2, depth: 0.6, height: 0.9 },
  { kind: 'pass', id: 'p', at: [0, 0, 0], width: 1.8, depth: 0.6, height: 0.92, strip: 0.5, gantry: 0.5 },
  { kind: 'heat-lamp', id: 'l', at: [0, 2.2, 0], drop: 0.6, hang: 'cord' },
  { kind: 'heat-lamp', id: 'r', at: [0, 2.2, 0], drop: 0.6, hang: 'rod' },
  { kind: 'rail', id: 'r', at: [0, 1.4, 0], length: 1.2 },
  { kind: 'printer', id: 'pr', at: [0, 0.9, 0] },
  { kind: 'bell-base', id: 'b', at: [0, 0.9, 0] },
  { kind: 'spike', id: 's', at: [0, 0.9, 0] },
  { kind: 'pan', id: 'f', at: [0, 0, 0], size: '1/1', depth: 0.065 },
  { kind: 'pan', id: 'h', at: [0, 0, 0], size: '1/2', depth: 0.1 },
  { kind: 'pan', id: 't', at: [0, 0, 0], size: '1/3', depth: 0.065 },
  { kind: 'plate-stack', id: 'ps', at: [0, 0, 0], count: 4 },
  { kind: 'griddle', id: 'g', at: [0, 0, 0], width: 0.9, depth: 0.8, height: 0.9, channel: 0 },
  { kind: 'burners', id: 'bu', at: [0, 0, 0], width: 0.6, depth: 0.8, height: 0.9, channel: 1 },
  { kind: 'fryer', id: 'fr', at: [0, 0, 0], width: 0.45, depth: 0.8, height: 0.9, channel: 2 },
  { kind: 'tile-wall', id: 'tw', at: [0, 0, 0], width: 3, height: 2.5 },
  { kind: 'floor', id: 'fl', at: [0, 0, 0], width: 3, depth: 3 },
  { kind: 'hood', id: 'ho', at: [0, 2.5, 0], width: 2, depth: 1, height: 0.45 },
  { kind: 'speed-rack', id: 'sr', at: [0, 0, 0], height: 1.7, shelves: 8, pans: [0, 2, 4] },
]

describe('the shapes', () => {
  test('a rounded box is its size, rounded at every edge, with flat faces cut for occlusion', () => {
    const box = roundedBox([0.6, 0.04, 0.3], 0.01)
    sound(box)
    const bounds = boundsOf(box)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.6, 5)
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(0.04, 5)
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.3, 5)
    // Rounded: some normals point between the axes, which an unbevelled box never has.
    const normal = box.getAttribute('normal')
    let diagonal = 0
    for (let i = 0; i < normal.count; i++) if (Math.max(Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))) < 0.99) diagonal += 1
    expect(diagonal).toBeGreaterThan(normal.count / 4)
    // The 60 cm top is cut into flat segments, so a corner can shade it.
    const top = new Set<number>()
    const position = box.getAttribute('position')
    for (let i = 0; i < position.count; i++) if (normal.getY(i) > 0.999) top.add(Math.round(position.getX(i) * 1000))
    expect(top.size).toBeGreaterThanOrEqual(3)
  })

  test('a lathe turns its profile, a sweep follows its path, and their normals face out', () => {
    const plate = lathe(plateProfile(), 32)
    sound(plate)
    const bounds = boundsOf(plate)
    // A dinner plate: its rim's bead about 137 mm out and 26 mm up, a rim that stands well above its well.
    expect(bounds.max.x).toBeCloseTo(0.1366, 3)
    expect(bounds.max.y).toBeCloseTo(0.0263, 3)
    const ring = sweep(roundedRectPath(0.4, 0.2, 0.03), [
      [0, 0],
      [0, 0.1],
    ])
    sound(ring)
    // On the ring's long side the wall faces out along z.
    const position = ring.getAttribute('position')
    const normal = ring.getAttribute('normal')
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) < 0.05 && position.getZ(i) > 0.09) expect(normal.getZ(i)).toBeGreaterThan(0.9)
    }
  })
})

describe('the props', () => {
  test.each(SPECS.map((spec) => [spec.kind, spec] as const))('%s builds sound geometry in metres, with a contact shadow where it stands', (_, spec) => {
    const built = buildProp(spec, palette)
    expect(built.parts.length).toBeGreaterThan(0)
    const bounds = new Box3()
    for (const part of built.parts) {
      sound(part.geometry)
      bounds.union(boundsOf(part.geometry))
    }
    const size = bounds.getSize(new Vector3())
    // Real equipment: nothing bigger than a room, nothing smaller than a bell.
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(7.5)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.05)
    const grounded = !['heat-lamp', 'rail', 'tile-wall', 'floor', 'hood'].includes(spec.kind)
    if (grounded) expect(built.footprints.length).toBeGreaterThan(0)
  })

  test('the hotel pans are their Gastronorm footprints, with a rim and a floor', () => {
    for (const size of ['1/1', '1/2', '1/3'] as const) {
      const bounds = new Box3()
      for (const geometry of panGeometries(size, 0.065)) bounds.union(boundsOf(geometry))
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(PAN_SIZES[size][0], 2)
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(PAN_SIZES[size][1], 2)
      expect(bounds.max.y).toBeCloseTo(0.065, 2)
    }
  })

  test('a station glows on its own channel, and the lamps, the strip and the tubes on theirs', () => {
    const channels = (spec: PropSpec) => new Set(buildProp(spec, palette).parts.filter((part) => part.surface === 'glow').map((part) => part.finish[0]))
    expect(channels(SPECS[12])).toEqual(new Set([0]))
    expect(channels(SPECS[13])).toEqual(new Set([1]))
    expect(channels(SPECS[14])).toEqual(new Set([2]))
    expect(channels(SPECS[2])).toEqual(new Set([CHANNEL.lamp]))
    expect(channels(SPECS[1])).toEqual(new Set([CHANNEL.strip]))
    expect(channels(SPECS[17])).toEqual(new Set([CHANNEL.tube]))
  })

  test('a lit mask lights its stations and always the lamps, the strip and the tubes', () => {
    const mask = litMask([true, false, true])
    expect(mask & 1).toBe(1)
    expect(mask & 2).toBe(0)
    expect(mask & 4).toBe(4)
    expect(mask & ALWAYS_LIT).toBe(ALWAYS_LIT)
  })
})

describe('a static set', () => {
  test('merges every prop into one mesh per surface, at most five draws', () => {
    const set = buildSet(SPECS, palette, false)
    expect(set.meshes.map((mesh) => mesh.surface)).toEqual(['metal', 'ceramic', 'tile', 'floor', 'glow'])
    for (const mesh of set.meshes) {
      expect(mesh.geometry.getAttribute('color').itemSize).toBe(3)
      expect(mesh.geometry.getAttribute('aFinish').itemSize).toBe(3)
    }
    console.log(`the whole catalogue as one set: ${set.vertices} vertices in ${set.meshes.length} meshes`)
    set.dispose()
  })

  test("the baked occlusion darkens a pan's floor and the floor under a counter, and leaves open floor alone", () => {
    const items: PropSpec[] = [
      { kind: 'floor', id: 'floor', at: [0, 0, 0], width: 4, depth: 4 },
      { kind: 'worktop', id: 'w', at: [-1, 0, 0], width: 1.2, depth: 0.6, height: 0.9 },
      { kind: 'pan', id: 'p', at: [1, 0, 0], size: '1/2', depth: 0.1 },
    ]
    const set = buildSet(items, palette, false)
    const geometries = set.meshes.map((mesh) => mesh.geometry)
    const shades = bakeOcclusion(geometries)
    const sample = (surface: string, near: (p: Vector3, n: Vector3) => boolean) => {
      const index = set.meshes.findIndex((mesh) => mesh.surface === surface)
      const geometry = geometries[index]
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      const values: number[] = []
      const p = new Vector3()
      const n = new Vector3()
      for (let i = 0; i < position.count; i++) {
        p.set(position.getX(i), position.getY(i), position.getZ(i))
        n.set(normal.getX(i), normal.getY(i), normal.getZ(i))
        if (near(p, n)) values.push(shades[index][i])
      }
      return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
    }
    const panFloor = sample('metal', (p, n) => Math.abs(p.x - 1) < 0.1 && Math.abs(p.z) < 0.08 && p.y < 0.01 && n.y > 0.9)
    const panRim = sample('metal', (p, n) => p.x > 1 && Math.abs(p.z) < 0.05 && p.y > 0.098 && n.y > 0.9)
    const underCounter = sample('floor', (p) => Math.abs(p.x + 1) < 0.35 && Math.abs(p.z) < 0.2)
    const open = sample('floor', (p) => Math.abs(p.x) > 1.7 || Math.abs(p.z) > 1.7)
    expect(panFloor).toBeLessThan(panRim - 0.05)
    expect(underCounter).toBeLessThan(open - 0.05)
    expect(open).toBeGreaterThan(0.95)
    set.dispose()
  })
})

describe("the heat lamps light the steel, and never paint it (Service's finish review, round 2)", () => {
  test("the counter's pool takes the lamps' own reflection off and brightens the steel's own sheen and streak in its place", () => {
    // Only the steel's own specular, the lamps' reflection off it and the streak's lobe carry it: no colour of the steel's own is laid
    // on as a decal, and no lines are hashed across it.
    expect(POOL_FRAGMENT).toContain('vec3 esOwn = totalSpecular - esSpot;')
    expect(POOL_FRAGMENT).toMatch(/uPoolColor \* esOwn \* \(esSheen \* [\d.]+ \+ esStreak \* esGrain \* [\d.]+\) - esSpot/)
    expect(POOL_FRAGMENT).not.toMatch(/diffuseColor|fract\(sin/)
    // The sheen follows the lamps' reflection, which saturates rather than clips.
    expect(POOL_FRAGMENT).toContain('1.0 - exp(-')
  })

  test("the lamps' reflection is counted inside three's spot-light loop, once a light, and nowhere else", () => {
    const chunk = countSpotSpecular(ShaderChunk.lights_fragment_begin)
    const spot = chunk.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )')
    const directional = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 )')
    const before = chunk.indexOf('esBefore = reflectedLight.directSpecular;')
    const counted = chunk.indexOf('esSpot += reflectedLight.directSpecular - esBefore;')
    expect(chunk.startsWith('vec3 esSpot = vec3(0.0);')).toBe(true)
    expect(spot).toBeGreaterThan(0)
    expect(before).toBeGreaterThan(spot)
    expect(counted).toBeGreaterThan(before)
    expect(counted).toBeLessThan(directional)
    expect(chunk.split('esSpot +=').length).toBe(2)
    expect(() => countSpotSpecular('no lights here')).toThrow(/spot lights' loop/)
  })
})

describe("a plate on the pass sits on the steel (Service's finish review, round 2)", () => {
  test('its contact shadow is a dark ring tight about its rim, and its shade a softer one past it', () => {
    const [contact, shade] = plateFootprints([0.2, 0.92, 0.02])
    expect(PLATE_SHADOWS).toHaveLength(2)
    expect(contact.center).toEqual([0.2, 0.92, 0.02])
    // The contact starts under the rim and is gone within a couple of centimetres past it, at full strength.
    expect(contact.radius).toBeGreaterThan(PLATE.radius)
    expect(contact.radius + contact.soft).toBeLessThan(PLATE.radius + 0.025)
    expect(contact.strength).toBe(1)
    // The shade reaches further and is lighter.
    expect(shade.radius + shade.soft).toBeGreaterThan(contact.radius + contact.soft + 0.03)
    expect(shade.strength).toBeLessThan(contact.strength)
    for (const footprint of [contact, shade]) expect(footprint.size).toEqual([footprint.radius * 2, footprint.radius * 2])
  })

  test("a plate's underside darkens where the counter hides it from the room, and its well's floor stays open", () => {
    const plate = lathe(plateProfile(), 40)
    const counter = new BufferGeometry().copy(roundedBox([0.4, 0.002, 0.4], 0.0005, 1)).translate(0, -0.001, 0)
    const [shade] = bakeOcclusion([plate, counter], { radius: 0.026, voxel: 0.004, strength: 0.55 }, [true, false])
    const position = plate.getAttribute('position')
    const normal = plate.getAttribute('normal')
    let under = 0
    let underN = 0
    let well = 0
    let wellN = 0
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getZ(i))
      if (normal.getY(i) < -0.5 && r > 0.08 && r < 0.12) {
        under += shade[i]
        underN += 1
      } else if (normal.getY(i) > 0.9 && r < 0.05) {
        well += shade[i]
        wellN += 1
      }
    }
    expect(underN).toBeGreaterThan(0)
    expect(wellN).toBeGreaterThan(0)
    expect(under / underN).toBeLessThan(0.8)
    expect(well / wellN).toBeGreaterThan(0.95)
  })
})

describe("a room that lights itself falls away from its line (Service's finish review, round 2)", () => {
  const room: RoomLight = { x: 0, half: 0.6, above: 1.5, beyond: -1.95, reach: [2, 1.4, 2], dim: 0.55 }

  test('its light is full over the line and eases down to its dim toward the far corner, up the wall and back into it', () => {
    expect(roomShade(room, 0, 1, -1.5)).toBe(1)
    expect(roomShade(room, 0.5, 1.2, -1.9)).toBe(1)
    const behind = roomShade(room, 0, 1, -2.36)
    const corner = roomShade(room, -2.62, 1, -2.36)
    const high = roomShade(room, 0, 2.6, -2.36)
    expect(behind).toBeGreaterThan(0.95)
    expect(corner).toBeLessThan(behind - 0.3)
    expect(high).toBeLessThan(behind - 0.15)
    expect(roomShade(room, -9, 9, -9)).toBeCloseTo(room.dim, 6)
    // Monotone: further from the line is never lighter.
    for (let x = 0; x < 3; x += 0.25) expect(roomShade(room, x + 0.25, 1, -2.36)).toBeLessThanOrEqual(roomShade(room, x, 1, -2.36))
  })

  test("a set baked with it darkens its tile toward the corner and leaves the tile behind the line lit; its steel is untouched", () => {
    const items: PropSpec[] = [
      { kind: 'tile-wall', id: 'wall', at: [0, 0, -2.36], width: 6, height: 3 },
      { kind: 'pass', id: 'pass', at: [0, 0, 0], width: 2, depth: 0.6, height: 0.92, strip: 0 },
    ]
    const flat = buildSet(items, palette, false)
    const lit = buildSet(items, palette, false, room)
    const colourAt = (set: ReturnType<typeof buildSet>, surface: string, near: (p: Vector3) => boolean): number => {
      const geometry = set.meshes.find((mesh) => mesh.surface === surface)?.geometry
      if (!geometry) throw new Error(`no ${surface}`)
      const position = geometry.getAttribute('position')
      const color = geometry.getAttribute('color')
      const p = new Vector3()
      let sum = 0
      let n = 0
      for (let i = 0; i < position.count; i++) {
        p.set(position.getX(i), position.getY(i), position.getZ(i))
        if (near(p)) {
          sum += color.getX(i)
          n += 1
        }
      }
      return sum / Math.max(1, n)
    }
    const behindLine = (p: Vector3) => Math.abs(p.x) < 0.3 && p.y > 0.6 && p.y < 1.3
    const nearCorner = (p: Vector3) => p.x < -2.5 && p.y > 0.6 && p.y < 1.3
    expect(colourAt(lit, 'tile', behindLine)).toBeGreaterThan(colourAt(flat, 'tile', behindLine) * 0.95)
    expect(colourAt(lit, 'tile', nearCorner)).toBeLessThan(colourAt(flat, 'tile', nearCorner) * 0.7)
    expect(colourAt(lit, 'metal', () => true)).toBeCloseTo(colourAt(flat, 'metal', () => true), 6)
    // With a veil, what the light no longer reaches falls toward the haze's deep steel: the pale tile in the corner darkens less far than
    // the light alone takes it, and stays darker than where the line is lit; the tile behind the line keeps its light.
    const veiled = buildSet(items, palette, false, { ...room, veil: 1 })
    const haze = palette.part(new BufferGeometry(), 'deep').color.r
    expect(colourAt(veiled, 'tile', nearCorner)).toBeGreaterThan(colourAt(lit, 'tile', nearCorner))
    expect(colourAt(veiled, 'tile', nearCorner)).toBeLessThan(colourAt(veiled, 'tile', behindLine) * 0.85)
    expect(colourAt(veiled, 'tile', nearCorner)).toBeCloseTo(colourAt(lit, 'tile', nearCorner) + haze * (1 - roomShade(room, -2.9, 1, -2.36)), 1)
    expect(colourAt(veiled, 'tile', behindLine)).toBeCloseTo(colourAt(lit, 'tile', behindLine), 2)
    flat.dispose()
    lit.dispose()
    veiled.dispose()
  })
})

describe("the service bell is polished chrome on deep steel (W1b's finish review of the lesson blocks, round 2)", () => {
  test("its base is turned steel in deep steel's tone: lighter than the spike's base beside it, which is brushed deep steel, and darker than shaded steel", () => {
    const bell = buildProp({ kind: 'bell-base', id: 'b', at: [0, 0, 0] }, palette)
    const spike = buildProp({ kind: 'spike', id: 's', at: [0, 0, 0] }, palette)
    const [base] = bell.parts
    const [spikeBase] = spike.parts
    expect(base.surface).toBe('metal')
    expect(base.color).toBe(palette.colorOf('turned'))
    expect(spikeBase.color).toBe(palette.colorOf('deep'))
    for (const channel of ['r', 'g', 'b'] as const) {
      // A metal's colour is its reflectance: the base mirrors the room at well over half again the spike's, and short of shaded steel.
      expect(base.color[channel]).toBeGreaterThan(spikeBase.color[channel] * 1.5)
      expect(base.color[channel]).toBeLessThan(palette.colorOf('shaded')[channel])
    }
    // Turned on the lathe: the spun finish, its grain running round the base.
    expect(base.finish).toEqual(palette.finishes.spun)
  })

  test("its dome and plunger are polished evenly, with no grain, and soft enough that the room's tubes merge into one highlight over the crown", () => {
    const polished = palette.part(new BufferGeometry(), 'polished')
    const [roughness, grain, metalness] = polished.finish
    expect([polished.surface, grain, metalness]).toEqual(['metal', 0, 1])
    // A roughness of its own (the bell's material has no roughness map): rougher than chrome's on brushed steel's map, which mirrored the
    // tubes as stripes, and smoother than brushed steel's own (MATERIAL_PARAMS.stainless, 0.36).
    expect(roughness).toBeGreaterThan(palette.finishes.chrome[0] * 0.36)
    expect(roughness).toBeGreaterThanOrEqual(0.25)
    expect(roughness).toBeLessThan(0.36)
    expect(polished.color.equals(palette.colorOf('steel'))).toBe(true)
  })
})

describe('paper', () => {
  test('a ticket hangs from its top edge with thickness and a curl toward its face', () => {
    const ticket = ticketGeometry(TICKET.width, TICKET.height, TICKET.thickness)
    sound(ticket)
    const bounds = boundsOf(ticket)
    expect(bounds.max.y).toBeCloseTo(0, 5)
    expect(bounds.min.y).toBeCloseTo(-TICKET.height, 5)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(TICKET.width, 5)
    // Thick, and curled forward at the foot; a scene may curl it further, as paper off a roll.
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(TICKET.thickness * 4)
    const curled = boundsOf(ticketGeometry(TICKET.width, TICKET.height, TICKET.thickness, 0.3))
    expect(curled.max.z - curled.min.z).toBeGreaterThan(bounds.max.z - bounds.min.z + TICKET.height * 0.1)
  })

  test("the printer's paper leaves its mouth forward and curls down", () => {
    const points = feedPath(TICKET.height)
    const end = points.at(-1)
    expect(end?.[1]).toBeLessThan(-0.04)
    expect(end?.[2]).toBeGreaterThan(0)
  })

  test("the print atlas's cells tile it, and every ticket's cell is one of them", () => {
    const seen = new Set<string>()
    for (let cell = 0; cell < PRINT_CELLS.across * PRINT_CELLS.down; cell++) {
      const [u, v] = cellOffset(cell)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(u + 1 / PRINT_CELLS.across).toBeLessThanOrEqual(1 + 1e-9)
      expect(v + 1 / PRINT_CELLS.down).toBeLessThanOrEqual(1 + 1e-9)
      seen.add(`${u},${v}`)
    }
    expect(seen.size).toBe(PRINT_CELLS.across * PRINT_CELLS.down)
    expect(cellOffset(9)).toEqual(cellOffset(1))
  })

  test("the atlas prints in the impact printer's dots and only in its two inks, on a canvas it is handed, with no letter and no number", () => {
    const calls: string[] = []
    const edges: string[] = []
    const dots: { x: number; y: number; radius: number }[] = []
    const context = {
      fillStyle: '',
      strokeStyle: '',
      fillRect: () => calls.push('rect'),
      strokeRect: () => edges.push(`edge:${context.strokeStyle}`),
      beginPath: () => undefined,
      arc: (x: number, y: number, radius: number) => dots.push({ x, y, radius }),
      fill: () => calls.push(`dot:${context.fillStyle}`),
    }
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
    // A context with no fillText or strokeText: printing a letter would throw.
    drawPrint(canvas, { paper: 'paper', ink: 'ink', rule: 'rule' })
    expect(calls[0]).toBe('rect')
    const inks = new Set(calls.slice(1))
    expect(inks).toEqual(new Set(['dot:ink', 'dot:rule']))
    // Every cell of the atlas carries its print, inside the cell.
    const cell = { w: PRINT_SIZE.width / PRINT_CELLS.across, h: PRINT_SIZE.height / PRINT_CELLS.down }
    const cells = new Set(dots.map((dot) => `${Math.floor(dot.x / cell.w)},${Math.floor(dot.y / cell.h)}`))
    expect(cells.size).toBe(PRINT_CELLS.across * PRINT_CELLS.down)
    for (const dot of dots) {
      expect(dot.x % cell.w - dot.radius).toBeGreaterThan(0)
      expect(dot.x % cell.w + dot.radius).toBeLessThan(cell.w)
      expect(dot.y % cell.h + dot.radius).toBeLessThan(cell.h)
    }
    // The print's dots are large enough to read as dots at a ticket's size in a scene: about a 25th of a cell's width across.
    expect(Math.max(...dots.map((dot) => dot.radius)) * 2).toBeGreaterThan(cell.w / 25)
    // W1b-T10: each sheet has its tooth (soft dots of the rule's ink inside it, counted above) and is a shade darker toward its cut
    // edges, in the rule's ink, twice over: the ticket's back and edges sample that shade, so its thickness reads.
    expect(edges).toEqual(Array.from({ length: PRINT_CELLS.across * PRINT_CELLS.down * 2 }, () => 'edge:rule'))
  })
})

describe('the room', () => {
  test('the tile has its glaze and its grout, and the floor its joints', () => {
    const tile = tileMaps(64, [0.7, 0.7, 0.7], { glaze: 0.14, grout: 0.92 })
    const greens = new Set<number>()
    for (let i = 1; i < tile.roughness.length; i += 4) greens.add(tile.roughness[i])
    expect(Math.min(...greens)).toBeLessThan(60)
    expect(Math.max(...greens)).toBeGreaterThan(220)
    const floor = floorMaps(64, 0.55, 0.42)
    expect(floor.albedo.length).toBe(64 * 64 * 4)
  })
})

describe('the chunk the props ship in (vite.config.ts, scene-kit)', () => {
  test('the props import only three, R3F, React, three addons, the kit context and each other', () => {
    const dir = path.join(root, 'src/scene/props')
    for (const file of readdirSync(dir)) {
      const text = readFileSync(path.join(dir, file), 'utf8')
      for (const match of text.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)) {
        const [, typeOnly, source] = match
        if (typeOnly) continue
        const allowed = source === 'three' || source === 'react' || source === '@react-three/fiber' || source.startsWith('three/addons/') || source === '../kit' || source.startsWith('./')
        expect(allowed, `${file} imports ${source}`).toBe(true)
      }
    }
  })
})
