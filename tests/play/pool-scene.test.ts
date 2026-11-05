/*
 * The Reach-In's 3D layout (src/games/pool/scene-layout.ts) and its own prop (src/games/pool/cabinet.ts), which the scene draws with
 * scene kit v1 and nothing else decides (W1-T24). The reach-in is held to its shape: a hotel pan in every slot, sixteen to a row, each in
 * its place for its whole life whatever the night does; the room, the pass and its lamps, the line's rail. The night is held to the
 * session's view: a pan's mise and its glyph follow its state, the One station filter keeps one station's tapes and twine, the focus's
 * twine runs through its pans in the order of its blocks, the fan has a slice for each layer of its station, the lamp falls on the open
 * ask's candidates and on nothing else, and the moment plays again only when the focus or its pans change. Then the presets, projected
 * at every pool size the levels have, at 1440 and at 390 px, and the acceptance checks on text and colour.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PoolLevelId, PoolState, PoolView } from '@es/play/pool/types'
import { poolSession } from '@es/play/pool/session'
import { house } from '@es/play/pool/policy'
import { staticSceneTokens } from '@/design/scene-tokens'
import { framingFor, type CameraPreset } from '@/scene/camera-rig'
import { buildProp } from '@/scene/props/build'
import { paletteFrom } from '@/scene/props/palette'
import type { Vec3 } from '@/scene/props/specs'
import { cabinet } from '@/games/pool/cabinet'
import { CELL, COLS, CROWN, nightOf, PAN, PASS, PITCH, RAIL, reachInOf, SHOTS, TICKET, TOP, type Night } from '@/games/pool/scene-layout'
import { POOL_CAMERAS } from '@/games/pool/scene-presets'
import { playThrough, practiceOf } from './pool-support'

const root = path.resolve(import.meta.dirname, '../..')
const view = (state: PoolState): PoolView => poolSession.view(state)
const nightAt = (state: PoolState, options: { station?: number | null; chosen?: readonly number[] } = {}): Night => {
  const v = view(state)
  return nightOf(v, reachInOf(v.pans.length, v.cap), { station: options.station ?? null, chosen: options.chosen ?? [] })
}
/** Every state of the house's night on a level's practice seed. */
const night = (id: PoolLevelId): PoolState[] => playThrough(practiceOf(id), house).states
const same = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)

/** The pool sizes the levels have: their practice seeds, and the whole manager's three models. */
const POOLS = [44, 64, 96, 104, 112, 160, 208, 288]

describe('the reach-in: a pan in every slot, each in its place for its whole life', () => {
  test('sixteen to a row, pan 1 at the back on the left, every pan on the top at its pitch, and none of two in one slot', () => {
    for (const pages of POOLS) {
      const r = reachInOf(pages, 4)
      expect(r.pans).toHaveLength(pages)
      expect(r.rows).toBe(Math.ceil(pages / COLS))
      const keys = new Set(r.pans.map((p) => p.map((v) => v.toFixed(4)).join(',')))
      expect(keys.size).toBe(pages)
      for (const [i, [x, y, z]] of r.pans.entries()) {
        expect(y).toBe(TOP)
        expect(Math.abs(x)).toBeLessThan(r.width / 2 - PAN.w / 2)
        expect(z).toBeLessThan(0)
        expect(z).toBeGreaterThan(-r.depth)
        if (i % COLS > 0) expect(x - r.pans[i - 1][0]).toBeCloseTo(PITCH.x)
        if (i >= COLS) expect(z - r.pans[i - COLS][2]).toBeCloseTo(PITCH.z)
      }
      // Pan 1 is the back row's first, as the 2D view draws it at the top on the left.
      expect(r.pans[0][0]).toBeLessThan(0)
      expect(r.pans[0][2]).toBe(Math.min(...r.pans.map((p) => p[2])))
    }
  })

  test("a pan never moves: through a whole night, everything drawn on a pan stands at that pan's own place", () => {
    for (const id of ['two-kinds', 'adapters', 'state'] as const) {
      const states = night(id)
      const r = reachInOf(view(states[0]).pans.length, view(states[0]).cap)
      for (const state of states) {
        const v = view(state)
        const drawn = nightOf(v, r, { station: null, chosen: [] })
        const held = v.pans.filter((pan) => pan.state !== 'free')
        expect(drawn.fills).toHaveLength(held.length)
        held.forEach((pan, i) => expect(same(drawn.fills[i].at, [r.pans[pan.id][0], TOP - 0.015, r.pans[pan.id][2]])).toBe(true))
        for (const tape of drawn.tapes) expect(r.pans.some((p) => same([p[0], CROWN, p[2]], tape.at))).toBe(true)
      }
    }
  })

  test("the room: tile, the line's burners under their hood, the pass with two heat lamps over it, the line's rail; every prop builds with the kit", () => {
    const r = reachInOf(104, 4)
    const kinds = r.items.map((item) => item.kind)
    for (const kind of ['floor', 'tile-wall', 'burners', 'hood', 'pass', 'rail']) expect(kinds).toContain(kind)
    expect(kinds.filter((kind) => kind === 'heat-lamp')).toHaveLength(2)
    expect(r.lamps).toHaveLength(2)
    for (const lamp of r.lamps) expect(lamp.target[1]).toBe(PASS.top)
    expect(r.clips).toHaveLength(4)
    const palette = paletteFrom(staticSceneTokens())
    for (const item of r.items) {
      const built = buildProp(item, palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      // Nothing floats: what stands on the floor or the counter casts a contact shadow.
      if (!['floor', 'tile-wall', 'hood', 'heat-lamp', 'rail'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test('the reach-in itself is a prop made the kit\'s way: built by the kit\'s maker in its tones, grounded by its footprint', () => {
    const palette = paletteFrom(staticSceneTokens())
    for (const pages of [44, 112, 288]) {
      const r = reachInOf(pages, 4)
      const built = buildProp({ kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, r) }, palette)
      expect(built.parts.length).toBeGreaterThan(COLS + r.rows)
      expect(new Set(built.parts.map((part) => part.surface))).toEqual(new Set(['metal']))
      expect(built.footprints).toHaveLength(1)
      // Its footprint lies under the whole cabinet, front at z = 0 and back at the wall.
      expect(built.footprints[0].center[2]).toBeCloseTo(-r.depth / 2)
      for (const part of built.parts) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox
        if (!box) throw new Error('a part without a box')
        expect(box.max.z).toBeLessThanOrEqual(0.1)
        expect(box.min.z).toBeGreaterThanOrEqual(-r.depth - 0.01)
      }
    }
  })
})

describe('the night on the pans', () => {
  test("a pan's mise takes its memory role, and its tape its glyph: its station's kind where a ticket holds it, the hash where it is cached, the pin where it is a kit's", () => {
    let seen = 0
    for (const id of ['two-kinds', 'adapters', 'state', 'same-size'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const drawn = nightAt(state)
        const held = v.pans.filter((pan) => pan.state !== 'free')
        expect(drawn.tapes).toHaveLength(held.length)
        held.forEach((pan, i) => {
          expect(drawn.fills[i].role).toBe(`memory-${pan.state}`)
          const cell = drawn.tapes[i].cell
          if (pan.state === 'adapter') expect(cell).toBe(CELL.pin)
          else if (pan.refs === 0) expect(cell).toBe(CELL.hash)
          else expect(cell).toBe(CELL[v.stations[pan.station as number].kind])
          seen += 1
        })
      }
    }
    expect(seen).toBeGreaterThan(1000)
  })

  test('One station keeps that station\'s tapes and twine and no other\'s, and every pan\'s mise', () => {
    const states = night('two-kinds')
    const state = states[Math.floor(states.length / 2)]
    const v = view(state)
    for (let g = 0; g < v.stations.length; g++) {
      const drawn = nightAt(state, { station: g })
      const mine = v.pans.filter((pan) => pan.state !== 'free' && pan.station === g)
      expect(drawn.tapes).toHaveLength(mine.length)
      expect(drawn.fills).toHaveLength(v.pans.filter((pan) => pan.state !== 'free').length)
      expect(drawn.twine.length).toBeLessThanOrEqual(1)
    }
  })

  test("the focus is the ticket hung last: one string per station runs from its clip through the pans it holds, in the order of their blocks", () => {
    let strung = 0
    for (const id of ['two-kinds', 'same-size', 'state'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const drawn = nightAt(state)
        const ticket = v.running[v.running.length - 1]
        if (ticket === undefined) {
          expect(drawn.twine).toEqual([])
          expect(drawn.fan).toBeNull()
          continue
        }
        const r = reachInOf(v.pans.length, v.cap)
        const tables = v.stations.map((_, g) => v.pans.filter((pan) => pan.station === g && pan.holders.includes(ticket)).sort((a, b) => (a.block ?? 0) - (b.block ?? 0)))
        expect(drawn.twine).toHaveLength(tables.filter((list) => list.length > 0).length)
        tables
          .filter((list) => list.length > 0)
          .forEach((list, k) => {
            const string = drawn.twine[k]
            // It leaves from the ticket's foot on the rail, then touches each pan's tape in turn, a sag between each two.
            expect(string[0][1]).toBeCloseTo(RAIL.y - RAIL.grip - 0.12 + 0.006)
            list.forEach((pan, j) => expect(same(string[2 + 2 * j], [r.pans[pan.id][0], CROWN + 0.004, r.pans[pan.id][2]])).toBe(true))
            strung += 1
          })
        // A sliding station holds only its window's blocks: no more than the window covers, plus the block being filled.
        for (const [g, station] of v.stations.entries()) {
          if (station.kind !== 'sliding' || station.window === null) continue
          expect(tables[g].length).toBeLessThanOrEqual(Math.ceil(station.window / station.blockTokens) + 1)
        }
      }
    }
    expect(strung).toBeGreaterThan(50)
  })

  test('the head pan fans into the layers of its station, one slice for each, with its padding layers, and says so in the DOM', () => {
    let fanned = 0
    for (const id of ['two-kinds', 'same-size'] as const) {
      for (const state of night(id)) {
        const drawn = nightAt(state)
        if (drawn.fan === null) continue
        const v = view(state)
        const ticket = v.running[v.running.length - 1]
        const head = v.pans.find((pan) => pan.holders.includes(ticket) && pan.station === 0 && pan.block === 0) ?? null
        const station = v.stations.find((s) => s.layers === drawn.fan?.layers && s.padLayers === drawn.fan?.pads)
        expect(station).toBeDefined()
        if (head !== null) expect(drawn.fan.layers).toBe(v.stations[0].layers)
        const label = drawn.labels.find((l) => l.id === 'fan')
        expect(label?.content).toMatch(/^\w+: \d+ layers( and \d+ padding)?, one pan$/)
        fanned += 1
      }
    }
    expect(fanned).toBeGreaterThan(20)
  })

  test("the lamp falls on the open ask's candidates and on nothing else: the dump's chosen pans ring, the tickets that can hang or be pulled glow, the pass burns while it holds the present", () => {
    for (const id of ['evict', 'adapters'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const ask = v.ask
        const chosen = ask?.kind === 'evict' ? ask.candidates.slice(0, ask.need) : []
        const drawn = nightAt(state, { chosen })
        expect(drawn.rings).toHaveLength(ask?.kind === 'evict' ? ask.need : 0)
        const lit = drawn.labels.filter((label) => label.className?.includes('es-pool-label--lamp')).map((label) => Number(String(label.id).slice(2)))
        expect(lit.sort((a, b) => a - b)).toEqual(ask?.kind === 'admit' || ask?.kind === 'preempt' ? [...ask.candidates].sort((a, b) => a - b) : [])
        expect(drawn.lit).toBe(ask?.kind === 'admit' || ask?.kind === 'prefetch')
      }
    }
  })

  test("a landed kit's pans are joined by their own string, through its pins, and never side by side", () => {
    let joined = 0
    for (const state of night('adapters')) {
      const v = view(state)
      const drawn = nightAt(state)
      const kits = v.kits.filter((kit) => kit.pageIds.length > 1)
      expect(drawn.kits).toHaveLength(kits.length)
      joined += kits.length
    }
    expect(joined).toBeGreaterThan(0)
  })

  test("the moment plays again when the focus or its pans change, and not when a pan is chosen to be dumped", () => {
    const states = night('evict')
    const evicting = states.find((state) => view(state).ask?.kind === 'evict')
    if (!evicting) throw new Error('no eviction on the night')
    const ask = view(evicting).ask
    if (ask?.kind !== 'evict') throw new Error('not an eviction')
    expect(nightAt(evicting, { chosen: ask.candidates.slice(0, ask.need) }).moment).toBe(nightAt(evicting, { chosen: ask.candidates.slice(-ask.need) }).moment)
    const moments = new Set(states.map((state) => nightAt(state).moment))
    expect(moments.size).toBeGreaterThan(5)
  })

  test('every ticket on the pass or the rail has its number as a DOM label riding on it, and the reach-in\'s tape lists the next pans to go', () => {
    for (const state of night('two-kinds')) {
      const v = view(state)
      const drawn = nightAt(state)
      for (const id of [...v.waiting, ...v.running]) {
        const label = drawn.labels.find((l) => l.id === `no${id}`)
        expect(label?.content).toBe(v.tickets[id].no)
        expect(label?.frame).toBe(`ticket:t${id}`)
      }
      const tape = drawn.labels.find((l) => l.id === 'reach-in')
      const next = v.rotation.flatMap((id) => v.pans[id].tape ?? []).slice(0, 5)
      expect(tape?.content).toBe(`the reach-in · KV page pool · next to go: ${next.join(' ') || 'nothing cached'}`)
    }
  })
})

/** The scene's canvas at 1440 by 900 and on a 390 by 844 phone, in CSS px. */
const CANVASES = [
  [870, 557],
  [356, 464],
] as const

/** Where a point lands in a canvas of `width` by `height` through a preset: the rig's own framing for that width, perspective. */
function projectIn(preset: CameraPreset, point: Vec3, width: number, height: number): { x: number; y: number } {
  const framing = framingFor(preset, width)
  const [px, py, pz] = framing.position
  const [tx, ty, tz] = framing.target
  const length = Math.hypot(tx - px, ty - py, tz - pz)
  const f = [(tx - px) / length, (ty - py) / length, (tz - pz) / length]
  const across = Math.hypot(f[0], f[2])
  const r = [-f[2] / across, 0, f[0] / across]
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const v = [point[0] - px, point[1] - py, point[2] - pz]
  const dot = (a: number[]) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]
  const k = Math.tan((framing.fov * Math.PI) / 360) * dot(f)
  return { x: width / 2 + (dot(r) / k) * (height / 2), y: height / 2 - (dot(u) / k) * (height / 2) }
}

describe('the presets (A§6.1: front, per-group filter, top)', () => {
  test('the page\'s plates and the scene\'s presets are the same three, in the same order', () => {
    expect(reachInOf(104, 4).presets.map((preset) => preset.id)).toEqual(POOL_CAMERAS.map((camera) => camera.id))
    expect([...SHOTS]).toEqual(POOL_CAMERAS.map((camera) => camera.id))
  })

  // The scene's canvas (src/games/pool/Game.tsx's box, inside its border): 870 by 557 px beside the controls at 1440 by 900, and 356 by
  // 464 on a 390 by 844 phone [measured 2026-11-05 by e2e/pool-scene.spec.ts].
  const inside = (p: { x: number; y: number }, width: number, height: number) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height
  for (const [width, height] of CANVASES) {
    test(`at ${width} by ${height} px, every preset holds the rack whole at every pool size, and the front one the rail's tickets and the pass's`, () => {
      for (const pages of POOLS) {
        const r = reachInOf(pages, 4)
        const half = r.width / 2
        const corners: Vec3[] = [-half, half].flatMap((x) => [[x, TOP, -r.depth] as Vec3, [x, TOP, 0] as Vec3])
        for (const preset of r.presets) {
          for (const corner of corners) expect(inside(projectIn(preset, corner, width, height), width, height), `${preset.id} ${pages} ${corner}`).toBe(true)
        }
        const front = r.presets[0]
        for (const point of [[-0.3, RAIL.y + 0.02, r.rail[2]], [0.3, RAIL.y + 0.02, r.rail[2]], [0, PASS.top, PASS.z]] as Vec3[]) {
          expect(inside(projectIn(front, point, width, height), width, height), `front ${pages} ${point}`).toBe(true)
        }
      }
    })
  }

  // A heat lamp's spun shade (the kit's heat-lamp prop, build.ts): its lip round the mouth, its flare up to the neck, and the bulb's dome
  // under the mouth. Where its outline lands, nothing behind it is seen.
  const shade = (x: number, mouth: number, z: number): Vec3[] =>
    Array.from({ length: 24 }, (_, a) => [Math.cos((a * Math.PI) / 12), Math.sin((a * Math.PI) / 12)]).flatMap(([c, s]) =>
      [[0.1185, 0], [0.026, 0.16], [0.022, 0.2], [0.054, -0.0185]].map(([radius, up]): Vec3 => [x + radius * c, mouth + up, z + radius * s]),
    )
  /** Which way `o` to `a` to `b` turns on the canvas; the convex outline of points, counter-clockwise; and whether a point lies in it. */
  type Point = { x: number; y: number }
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const chain = (points: Point[]) =>
    points.reduce<Point[]>((hull, p) => {
      while (hull.length >= 2 && turn(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
      return [...hull, p]
    }, [])
  const outline = (points: Point[]) => {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    return [...chain(sorted).slice(0, -1), ...chain(sorted.reverse()).slice(0, -1)]
  }
  const within = (hull: Point[], p: Point) => hull.every((a, i) => turn(a, hull[(i + 1) % hull.length], p) >= 0)

  for (const [width, height] of CANVASES) {
    test(`at ${width} by ${height} px, no heat lamp hangs over a pan, a ticket on the rail or one waiting on the pass, in any preset`, () => {
      for (const pages of POOLS) {
        const r = reachInOf(pages, 4)
        for (const preset of r.presets) {
          const hulls = r.lamps.map((lamp) => outline(shade(lamp.at[0], lamp.at[1] + 0.02, lamp.at[2]).map((p) => projectIn(preset, p, width, height))))
          const hidden = (p: Vec3) => hulls.some((hull) => within(hull, projectIn(preset, p, width, height)))
          for (const [id, pan] of r.pans.entries()) {
            const corners: Vec3[] = [[0, 0], [-0.045, -0.08], [0.045, -0.08], [-0.045, 0.08], [0.045, 0.08]].map(([dx, dz]) => [pan[0] + dx, TOP, pan[2] + dz])
            expect(corners.some(hidden), `${preset.id} ${pages}: pan ${id + 1}`).toBe(false)
          }
          for (let k = 0; k < 4; k++) {
            const x = (k - 1.5) * RAIL.pitch
            expect([-0.01, -0.06, -0.11].some((dy) => hidden([x, RAIL.y - RAIL.grip + dy, r.rail[2] + 0.012])), `${preset.id} ${pages}: clip ${k}`).toBe(false)
          }
          for (let i = 0; i < 8; i++) expect([0.44, 0.5, 0.56].some((z) => hidden([(i - 3.5) * TICKET.gap, PASS.top, z])), `${preset.id} ${pages}: waiting ${i}`).toBe(false)
        }
      }
    })
  }

  test('on a phone the pans of the front row are about 20 px across, so a glyph on its tape can be read (GAMES.md §8)', () => {
    for (const pages of [44, 104, 112, 160]) {
      const r = reachInOf(pages, 4)
      const front = r.pans[r.pans.length - 1]
      const a = projectIn(r.presets[0], [front[0] - PAN.w / 2, TOP, front[2]], 356, 464)
      const b = projectIn(r.presets[0], [front[0] + PAN.w / 2, TOP, front[2]], 356, 464)
      expect(b.x - a.x).toBeGreaterThan(17)
      const top = projectIn(r.presets[2], [front[0] + PAN.w / 2, TOP, front[2]], 356, 464).x - projectIn(r.presets[2], [front[0] - PAN.w / 2, TOP, front[2]], 356, 464).x
      expect(top).toBeGreaterThan(17)
    }
  })
})

describe('the acceptance checks on text, colour and size', () => {
  const sources = ['src/games/pool/Scene3D.tsx', 'src/games/pool/scene-layout.ts', 'src/games/pool/cabinet.ts'].map((file) => readFileSync(path.join(root, file), 'utf8'))

  test('all text is DOM: the canvas prints nothing, the glyphs are shapes', () => {
    for (const source of sources) expect(source).not.toMatch(/fillText|strokeText|TextGeometry|FontLoader/)
  })

  test('the scene reaches three only through the kit and its own lazy chunk, and the page holds it behind React.lazy', () => {
    const game = readFileSync(path.join(root, 'src/games/pool/Game.tsx'), 'utf8')
    expect(game).toMatch(/lazy\(\(\) => import\('\.\/Scene3D'\)\)/)
    // A type is erased; a value imported from the scene's modules would pull them into the page's chunk.
    expect(game).not.toMatch(/^import (?!type )[^\n]*from '\.\/(Scene3D|scene-layout|cabinet)'/m)
    expect(sources[1]).not.toMatch(/from 'three'/)
  })

  test('the instances of the largest pool stay far under the tier caps (A§6.6: 10k at T1)', () => {
    const states = night('same-size')
    let most = 0
    for (const state of states) {
      const drawn = nightAt(state)
      const v = view(state)
      most = Math.max(most, v.pans.length + drawn.fills.length + drawn.tapes.length + drawn.rings.length + 16 + drawn.tickets.length + v.cap)
    }
    expect(most).toBeLessThan(1500)
  })
})
