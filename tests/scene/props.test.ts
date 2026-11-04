/*
 * Scene kit v1's props, with no WebGL: every builder makes real geometry in metres (finite, with unit normals, the size of the
 * equipment it is), nothing is an unbevelled box, a static set merges into one mesh per surface, the baked occlusion darkens a pan's
 * inside and the floor under a counter and leaves open floor alone, the glow channels light by a mask, the print atlas's cells
 * tile it, and the props import nothing that would drag them into a page's first paint.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Box3, BufferGeometry, Vector3 } from 'three'
import { staticSceneTokens } from '@/design/scene-tokens'
import { buildProp, panGeometries, plateProfile } from '@/scene/props/build'
import { bakeOcclusion } from '@/scene/props/occlusion'
import { CHANNEL, paletteFrom } from '@/scene/props/palette'
import { cellOffset, feedPath, ticketGeometry } from '@/scene/props/paper'
import { ALWAYS_LIT, buildSet, litMask } from '@/scene/props/set'
import { lathe, roundedBox, roundedRectPath, sweep } from '@/scene/props/shape'
import { PAN_SIZES, TICKET, type PropSpec } from '@/scene/props/specs'
import { drawPrint, PRINT_CELLS, tileMaps, floorMaps } from '@/scene/props/surfaces'

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
    expect(bounds.max.x).toBeCloseTo(0.1356, 3)
    expect(bounds.max.y).toBeCloseTo(0.0222, 3)
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

describe('paper', () => {
  test('a ticket hangs from its top edge with thickness and a curl toward its face', () => {
    const ticket = ticketGeometry(TICKET.width, TICKET.height, TICKET.thickness)
    sound(ticket)
    const bounds = boundsOf(ticket)
    expect(bounds.max.y).toBeCloseTo(0, 5)
    expect(bounds.min.y).toBeCloseTo(-TICKET.height, 5)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(TICKET.width, 5)
    // Thick, and curled forward at the foot.
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(TICKET.thickness * 4)
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

  test('the atlas prints in the face it is given, and only in its two inks, on a canvas it is handed', () => {
    const calls: string[] = []
    const context = {
      fillStyle: '',
      font: '',
      textBaseline: '',
      fillRect: () => calls.push('rect'),
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => calls.push('dot'),
      fillText: (text: string) => calls.push(`text:${text}`),
    }
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement
    drawPrint(canvas, { paper: 'paper', ink: 'ink', rule: 'rule', family: 'the-face' }, true)
    expect(calls[0]).toBe('rect')
    expect(calls.some((call) => call.startsWith('text:'))).toBe(true)
    expect(context.font).toContain('the-face')
    // No number a learner reads: the print is words of the kitchen.
    expect(calls.filter((call) => call.startsWith('text:')).some((call) => /\d/.test(call))).toBe(false)
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
