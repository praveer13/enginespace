/*
 * Service's 3D layout (src/games/loop/scene-layout.ts), which the scene draws with scene kit v1's props and nothing else decides. The
 * kitchen is held to its shape (the room, the pass and its gantry, the rail, the line's stations, the lamps, the printer only where the
 * page asks, the fired rail and the bin only where the level has overlap), and the night to the session's view: the tickets on their
 * clips, the copies on the fired rail, the counter's tickets and the printer's feed, the plates of the last fire read back, the bin,
 * the spike, the stations' heat and the bubble. Then the presets, the tapes that must never meet, the motion grammar's reading of a
 * change, the instance budget, and the acceptance checks on colour and text.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { askOf, hang, initState, setOverlap, step } from '@es/play/loop/engine'
import { buildLevel, LEVEL_IDS } from '@es/play/loop/levels'
import { stationsOf, ticketNo } from '@es/play/loop/layout'
import { loopView } from '@es/play/loop/session'
import type { LoopState, LoopView } from '@es/play/loop/types'
import { HOOD, SHELF, WALL_Z } from '@es/play/loop/kitchen'
import { staticSceneTokens } from '@/design/scene-tokens'
import { framingFor, type CameraPreset, type Vec3 } from '@/scene/camera-rig'
import { buildProp, SHELF_DROP } from '@/scene/props/build'
import { paletteFrom } from '@/scene/props/palette'
import { PLATE, TICKET as KIT_TICKET } from '@/scene/props/specs'
import { changeOf, clipX, COUNTER_TICKETS, FIRED, PASS, passWidth, pitchOf, RAIL, serviceKitchen, serviceScene, TICKET, type ServiceKitchen } from '@/games/loop/scene-layout'
import { DEFAULT_PRESET, FRONT_PRESET, FRONT_PRESETS, LOOP_PRESETS } from '@/games/loop/scene-presets'
import { statesOfHouseNight } from './loop-support'

const root = path.resolve(import.meta.dirname, '../..')
const level = (id: (typeof LEVEL_IDS)[number], seed = 1) => buildLevel(id, seed)
const fill = (s: LoopState, n = Number.POSITIVE_INFINITY): LoopState => {
  let state = s
  for (let i = 0; i < n && askOf(state) !== null; i++) state = hang(state, state.waiting[0])
  return state
}
const kitchenOf = (view: LoopView, printer = true): ServiceKitchen => serviceKitchen(view.slots, { printer, overlap: view.overlapAvailable })
const sceneOf = (view: LoopView, printer = true) => serviceScene(view, kitchenOf(view, printer))

describe('the kitchen: the room the night is served in', () => {
  const view = loopView(initState(level('first-1-fill')))
  const kitchen = kitchenOf(view)
  const kinds = kitchen.items.map((item) => item.kind)

  test('a whole room: floor, tile on two walls, the hood over the line, a speed rack, and the pass with its gantry, rail, bell and spike', () => {
    for (const kind of ['floor', 'hood', 'speed-rack', 'pass', 'rail', 'bell-base', 'spike', 'plate-stack']) expect(kinds).toContain(kind)
    expect(kinds.filter((kind) => kind === 'tile-wall')).toHaveLength(2)
    const pass = kitchen.items.find((item) => item.kind === 'pass')
    expect(pass).toMatchObject({ width: passWidth(4), depth: PASS.depth, height: PASS.top, gantry: PASS.gantry })
    // The rail hangs under the gantry's bar, over the pass's back edge.
    expect(kitchen.rail.at).toEqual([0, RAIL.y, RAIL.z])
    expect(RAIL.y).toBeCloseTo(PASS.top + PASS.gantry - 0.008)
    expect(RAIL.z).toBeLessThan(0)
  })

  test('three heat lamps hang over the clips from the ceiling, each lighting the counter under it', () => {
    expect(kitchen.items.filter((item) => item.kind === 'heat-lamp')).toHaveLength(3)
    expect(kitchen.lights).toHaveLength(3)
    for (const light of kitchen.lights) {
      expect(light.at[1]).toBeGreaterThan(RAIL.y)
      expect(light.target[1]).toBe(PASS.top)
      expect(Math.abs(light.at[0])).toBeLessThanOrEqual(clipX(3, 4))
    }
  })

  test('the line has a station for each clip, each glowing on its own channel, in clip order; a long rail shares six stations', () => {
    const stations = kitchen.items.filter((item) => item.kind === 'griddle' || item.kind === 'burners' || item.kind === 'fryer')
    expect(stations.map((station) => ('channel' in station ? station.channel : -1))).toEqual([0, 1, 2, 3])
    expect(kitchen.stations.map((station) => station.clips)).toEqual([[0], [1], [2], [3]])
    for (let s = 1; s < stations.length; s++) expect(stations[s].at[0]).toBeGreaterThan(stations[s - 1].at[0])
    // The line stands beyond the pass, against the back wall.
    for (const station of stations) expect(station.at[2]).toBeLessThan(-PASS.depth)
    const long = serviceKitchen(9, { printer: true, overlap: false })
    expect(long.stations).toHaveLength(6)
    expect(long.stations.flatMap((station) => station.clips)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  test('the printer stands at the pass\'s left end only where the page asks for it; the front page holds its own', () => {
    expect(kinds).toContain('printer')
    expect(kitchen.printer?.at[0]).toBeLessThan(clipX(0, 4) - 0.3)
    const front = kitchenOf(view, false)
    expect(front.items.some((item) => item.kind === 'printer')).toBe(false)
    expect(front.printer).toBeNull()
  })

  test('the fired rail and the bin are there on a level with the overlap switch, and on no other', () => {
    expect(kitchen.fired).toBeNull()
    expect(kitchen.bin).toBeNull()
    const gap = kitchenOf(loopView(initState(level('first-3-gap'))))
    expect(gap.fired?.at).toEqual([0, FIRED.y, FIRED.z])
    expect(gap.items.find((item) => item.id === 'fired')).toMatchObject({ kind: 'rail', hang: expect.any(Number) })
    // It hangs on two rods from the gantry's bar, below the rail and its tickets.
    expect(FIRED.y).toBeLessThan(RAIL.y - TICKET.height)
    expect(gap.items.find((item) => item.id === 'bin')).toMatchObject({ kind: 'pan', size: '1/1' })
  })

  test('the plate stacks stand on the heated shelf\'s bars under the counter, and the hood hangs low enough over the line to be seen', () => {
    expect(SHELF.drop).toBe(SHELF_DROP)
    for (const stack of kitchen.items.filter((item) => item.kind === 'plate-stack')) expect(stack.at[1]).toBeCloseTo(PASS.top - SHELF_DROP)
    const hood = kitchen.items.find((item) => item.kind === 'hood')
    expect(hood).toMatchObject({ at: [0, HOOD.top, WALL_Z], height: HOOD.height, depth: HOOD.depth })
    // The front page's wide shot sees the hood's front edge over the lamps, and the line beyond the pass, at 1440 by 684.
    const [front] = FRONT_PRESETS
    const edge = projectIn(front, [0, HOOD.top - HOOD.height, WALL_Z + HOOD.depth], 1440, 684)
    expect(edge.y).toBeGreaterThan(20)
  })

  test('every prop builds with the kit, and what stands on the floor or the counter has a footprint for its contact shadow', () => {
    const palette = paletteFrom(staticSceneTokens())
    for (const item of kitchenOf(loopView(initState(level('first-3-gap')))).items) {
      const built = buildProp(item, palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      // Nothing floats: the room, the hood, the lamps and the rails hang from it or bound it; everything else casts a contact shadow.
      if (!['floor', 'tile-wall', 'hood', 'heat-lamp', 'rail'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test('the clips are a ticket and a plate apart on the front page\'s rail, and the rail runs past them all', () => {
    expect(pitchOf(4)).toBe(0.36)
    expect(pitchOf(4)).toBeGreaterThan(PLATE.radius * 2)
    expect(clipX(0, 4)).toBeCloseTo(-0.54)
    expect(clipX(3, 4)).toBeCloseTo(0.54)
    expect(kitchen.rail.length).toBeGreaterThan(clipX(3, 4) - clipX(0, 4) + KIT_TICKET.width)
    // The ticket here is the kit's own.
    expect([TICKET.width, TICKET.height]).toEqual([KIT_TICKET.width, KIT_TICKET.height])
  })
})

describe('the night on the pass', () => {
  test('first service opens on an empty rail: every clip shows its empty stub, and the counter holds the tickets in line, the next first', () => {
    const view = loopView(initState(level('first-1-fill')))
    const scene = sceneOf(view)
    expect(scene.anchors.filter((anchor) => anchor.kind === 'empty')).toHaveLength(4)
    expect(scene.anchors.filter((anchor) => anchor.kind === 'waiting').map((anchor) => anchor.text)).toEqual(view.waiting.slice(0, COUNTER_TICKETS).map(ticketNo))
    const more = view.waiting.length - Math.min(COUNTER_TICKETS, view.waiting.length)
    if (more > 0) expect(scene.anchors.find((anchor) => anchor.kind === 'more')?.text).toBe(`+${more}`)
    // The tickets on the counter lie flat, face up, and a pick finds each one.
    expect(scene.picks.map((pick) => pick.req)).toEqual(view.waiting.slice(0, COUNTER_TICKETS))
    for (const ticket of scene.tickets) expect(ticket.rotation[0]).toBeCloseTo(-Math.PI / 2)
    for (const pick of scene.picks) expect(pick.center[1]).toBeGreaterThan(PASS.top)
  })

  test('a hung ticket keeps its paper: the ticket that left the counter is the ticket on the clip, and it says new until it is fired', () => {
    const before = initState(level('first-1-fill'))
    const req = before.waiting[0]
    const after = hang(before, req)
    const id = `t${req}`
    const was = sceneOf(loopView(before)).tickets.find((ticket) => ticket.id === id)
    const scene = sceneOf(loopView(after))
    const now = scene.tickets.find((ticket) => ticket.id === id)
    expect(was?.at[1]).toBeLessThan(PASS.top + 0.01)
    expect(now?.at[0]).toBeCloseTo(clipX(0, 4))
    expect(now?.at[1]).toBeGreaterThan(RAIL.y - 0.05)
    expect(scene.anchors.find((anchor) => anchor.id === `no-${id}`)).toMatchObject({ kind: 'ticket', text: ticketNo(req), sub: 'new', frame: `ticket:${id}` })
    const fired = sceneOf(loopView(step(fill(after))))
    expect(fired.anchors.filter((anchor) => anchor.kind === 'ticket').every((anchor) => anchor.sub === undefined)).toBe(true)
  })

  test('the printer feeds when the counter takes a ticket out of it; a front page\'s scene has no counter', () => {
    const state = initState(level('first-4-par'))
    expect(state.waiting.length).toBeGreaterThan(COUNTER_TICKETS)
    const before = sceneOf(loopView(state))
    const after = sceneOf(loopView(hang(state, state.waiting[0])))
    expect(after.feed).not.toBe(before.feed)
    expect(sceneOf(loopView(state), false).tickets).toEqual([])
  })

  test('the fired rail holds a copy of each ticket of the fire on the line, come down from its clip on the rail', () => {
    const off = loopView(step(fill(initState(level('first-3-gap')))))
    expect(off.firedRail).toBeNull()
    expect(sceneOf(off).tickets.some((ticket) => ticket.id.startsWith('f'))).toBe(false)
    const view = loopView(step(fill(setOverlap(initState(level('first-3-gap')), true))))
    expect(view.firedRail).not.toBeNull()
    const copies = sceneOf(view).tickets.filter((ticket) => ticket.id.startsWith('f'))
    expect(copies.map((ticket) => Number(ticket.id.slice(1)))).toEqual((view.firedRail ?? []).flatMap((clip) => (clip.req === null ? [] : [clip.req])))
    for (const copy of copies) {
      expect(copy.at[1]).toBeLessThan(FIRED.y)
      expect(copy.from?.at[1]).toBeGreaterThan(RAIL.y - 0.05)
    }
  })

  test('the plates are the last fire read back: one under each clip that cooked, sliding in from the line and carried out to the expo', () => {
    const half = loopView(step(fill(initState(level('first-1-fill')), 2)))
    const plates = sceneOf(half).plates
    expect(plates.map((plate) => plate.at[0])).toEqual([clipX(0, 4), clipX(1, 4)])
    for (const plate of plates) {
      expect(plate.at[1]).toBe(PASS.top)
      expect(plate.enter?.[2]).toBeLessThan(plate.at[2])
      expect(plate.leave?.[2]).toBeGreaterThan(1)
    }
    // With overlap the fire on the line has not been read back: its courses are not on the pass yet.
    const first = loopView(step(setOverlap(fill(initState(level('first-3-gap'))), true)))
    const served = [...first.fires].reverse().find((fire) => !fire.onLine)
    for (const plate of sceneOf(first).plates) expect(plate.id.startsWith(`p${served?.index}-`) || plate.id.startsWith('b')).toBe(true)
  })

  test('a binned plate goes into the bin and stays there, the last few of the night', () => {
    let night: LoopView | null = null
    for (const state of statesOfHouseNight(level('first-4-par'), { overlap: true })) {
      const view = loopView(state)
      if (view.counters.ghostTokens >= 2) {
        night = view
        break
      }
    }
    if (night === null) throw new Error('no binned plates in the house\'s night')
    const kitchen = kitchenOf(night)
    const binned = serviceScene(night, kitchen).plates.filter((plate) => plate.id.startsWith('b'))
    expect(binned.length).toBeGreaterThanOrEqual(1)
    for (const plate of binned) {
      expect(Math.abs(plate.at[0] - (kitchen.bin?.[0] ?? 0))).toBeLessThan(0.1)
      expect(plate.leave).toBeUndefined()
    }
  })

  test('a finished ticket is spiked, the latest on top', () => {
    let state = initState(level('first-2-slot'))
    for (let bells = 0; bells < 6; bells++) state = step(fill(state))
    const view = loopView(state)
    const kitchen = kitchenOf(view)
    const spiked = sceneOf(view).tickets.filter((ticket) => Math.hypot(ticket.at[0] - kitchen.spike[0], ticket.at[2] - kitchen.spike[2]) < TICKET.height)
    expect(spiked.length).toBeGreaterThan(0)
    const live = new Set(view.rail.flatMap((clip) => (clip.req === null ? [] : [`t${clip.req}`])))
    for (const ticket of spiked) expect(live.has(ticket.id)).toBe(false)
    for (let k = 1; k < spiked.length; k++) expect(spiked[k].at[1]).toBeGreaterThan(spiked[k - 1].at[1])
  })

  test('the stations burn where the latest fire cooked a course: half a rail fired leaves half the line dark, a full rail lights it end to end', () => {
    expect(sceneOf(loopView(fill(initState(level('first-1-fill')), 2))).lit).toEqual([false, false, false, false])
    const half = loopView(step(fill(initState(level('first-1-fill')), 2)))
    expect(sceneOf(half).lit).toEqual(stationsOf(half))
    expect(sceneOf(half).lit).toEqual([true, true, false, false])
    expect(sceneOf(loopView(step(fill(initState(level('first-1-fill')))))).lit).toEqual([true, true, true, true])
  })

  test('a fire that waited on the expo is the bubble, and with overlap the line stops waiting', () => {
    const plain = loopView(step(fill(step(fill(initState(level('first-3-gap')))))))
    expect(plain.fires[plain.fires.length - 1].bubbleUs).toBeGreaterThan(0)
    expect(sceneOf(plain).bubble).toBe(true)
    let state = setOverlap(fill(initState(level('first-4-par'))), true)
    for (let bells = 0; bells < 3; bells++) state = step(fill(state))
    const overlapped = loopView(state)
    expect(overlapped.fires[overlapped.fires.length - 1].bubbleUs).toBe(0)
    expect(sceneOf(overlapped).bubble).toBe(false)
  })
})

/** Where a point lands in a canvas `width` × `height` for a preset's framing at that width, in CSS px: three's projection, by hand, its lens shifted as the framing says. */
function projectIn(preset: CameraPreset, point: Vec3, width: number, height: number): { x: number; y: number } {
  const framing = framingFor(preset, width)
  const [sx, sy] = framing.shift
  const [px, py, pz] = framing.position
  const [tx, ty, tz] = framing.target
  const length = Math.hypot(tx - px, ty - py, tz - pz)
  const f = [(tx - px) / length, (ty - py) / length, (tz - pz) / length]
  const across = Math.hypot(f[0], f[2])
  const r = [-f[2] / across, 0, f[0] / across]
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const v = [point[0] - px, point[1] - py, point[2] - pz]
  const dot = (a: number[]) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2]
  if (preset.projection === 'orthographic') {
    const scale = height / framing.viewHeight
    return { x: width / 2 + dot(r) * scale, y: height / 2 - dot(u) * scale }
  }
  const k = Math.tan((framing.fov * Math.PI) / 360) * dot(f)
  return { x: width / 2 + (dot(r) / k + sx) * (height / 2), y: height / 2 - (dot(u) / k - sy) * (height / 2) }
}

describe('the camera presets (GAMES.md §2.6, Service, Cameras)', () => {
  test('three shots, a button each: over the shoulder (the default), the side of the pass in orthographic, and under the lamps', () => {
    expect(LOOP_PRESETS.map((preset) => [preset.id, preset.label, preset.shot, preset.projection])).toEqual([
      ['shoulder', 'Over the shoulder', 'establish', 'perspective'],
      ['side', 'Side of the pass', 'compare', 'orthographic'],
      ['lamps', 'Under the lamps', 'top', 'perspective'],
    ])
    expect(DEFAULT_PRESET).toBe('shoulder')
    for (const preset of [...LOOP_PRESETS, ...FRONT_PRESETS]) expect(preset.portrait).toBeDefined()
  })

  test('over the shoulder looks through the pass to the line from behind the expo, about 20 to 35 degrees down', () => {
    for (const preset of [LOOP_PRESETS[0], FRONT_PRESETS[0]]) {
      const [px, py, pz] = preset.position
      const [tx, ty, tz] = preset.target
      const degrees = (Math.atan2(py - ty, Math.hypot(px - tx, pz - tz)) * 180) / Math.PI
      expect(degrees).toBeGreaterThan(18)
      expect(degrees).toBeLessThan(36)
      expect(pz).toBeGreaterThan(tz)
    }
  })

  test('the front page\'s shot looks straight down the pass, so the rail runs level across the page, and it sees every clip', () => {
    const [front] = FRONT_PRESETS
    expect(FRONT_PRESET).toBe('front')
    expect(front.position[0]).toBe(front.target[0])
    for (const [width, height] of [
      [1440, 716],
      [1280, 616],
      [1024, 640],
      [390, 652],
    ] as const) {
      const ends = [clipX(0, 4), clipX(3, 4)].map((x) => projectIn(front, [x, RAIL.y, RAIL.z], width, height))
      expect(Math.abs(ends[0].y - ends[1].y)).toBeLessThan(0.5)
      for (const end of ends) expect(end.x).toBeGreaterThan(0)
      expect(ends[1].x + 10).toBeLessThan(width)
    }
  })

  test('every shot keeps the four clips in the canvas, on a laptop and on a phone', () => {
    for (const preset of LOOP_PRESETS) {
      for (const [width, height] of [
        [1216, 540],
        [390, 464],
      ] as const) {
        for (const slot of [0, 3]) {
          const at = projectIn(preset, [clipX(slot, 4), RAIL.y - 0.06, RAIL.z], width, height)
          expect([preset.id, width, at.x > 0 && at.x < width && at.y > 0 && at.y < height]).toEqual([preset.id, width, true])
        }
      }
    }
  })
})

describe('the tapes that name the line and the expo never meet (W0 finding F5)', () => {
  const kitchen = kitchenOf(loopView(initState(level('first-3-gap'))))
  /** The box a tape's words can take on screen: the tape itself, and never less than a phone's smallest print of them. */
  const box = (preset: CameraPreset, id: string, width: number, height: number) => {
    const tape = kitchen.tapes.find((candidate) => candidate.id === id)
    if (!tape) throw new Error(`no tape ${id}`)
    const [cx, cy, cz] = tape.center
    const [w, h] = tape.size
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => projectIn(preset, [cx + (sx * w) / 2, cy + (sy * h) / 2, cz], width, height)))
    const x0 = Math.min(...corners.map((c) => c.x))
    const x1 = Math.max(...corners.map((c) => c.x))
    const y0 = Math.min(...corners.map((c) => c.y))
    const y1 = Math.max(...corners.map((c) => c.y))
    const half = { x: Math.max((x1 - x0) / 2, 45), y: Math.max((y1 - y0) / 2, 9) }
    return { x0: (x0 + x1) / 2 - half.x, x1: (x0 + x1) / 2 + half.x, y0: (y0 + y1) / 2 - half.y, y1: (y0 + y1) / 2 + half.y }
  }
  for (const [preset, width, height] of [
    [LOOP_PRESETS[0], 390, 464],
    [LOOP_PRESETS[0], 1216, 540],
    [FRONT_PRESETS[0], 390, 652],
    [FRONT_PRESETS[0], 1024, 640],
    [FRONT_PRESETS[0], 1440, 716],
  ] as const) {
    test(`${preset.id} at ${width} × ${height}`, () => {
      const line = box(preset, 'line', width, height)
      const expo = box(preset, 'expo', width, height)
      expect(line.y1 < expo.y0 || expo.y1 < line.y0 || line.x1 < expo.x0 || expo.x1 < line.x0).toBe(true)
      // The line's name is high, on the tile over the line; the expo's is low, on the pass's front edge.
      expect(line.y1).toBeLessThan(expo.y0)
    })
  }
})

describe('the motion grammar: everything moves on the bell, and between bells only the printer feeds', () => {
  const start = loopView(initState(level('first-1-fill')))
  const hung = loopView(hang(initState(level('first-1-fill')), 0))

  test('a fire rung is the bell, a ticket hung is the printer, and anything else cuts', () => {
    expect(changeOf(null, start)).toBe('cut')
    expect(changeOf(start, hung)).toBe('feed')
    const rung = loopView(step(fill(initState(level('first-1-fill')))))
    expect(changeOf(loopView(fill(initState(level('first-1-fill')))), rung)).toBe('bell')
    // An undo takes the night back, and a new level starts another one: both cut.
    expect(changeOf(hung, start)).toBe('cut')
    expect(changeOf(rung, loopView(initState(level('first-2-slot'))))).toBe('cut')
  })
})

describe('the budget (GAMES.md §3, Budget)', () => {
  test('over every state of every level\'s night, the moving props stay far under the instance budget', () => {
    let most = 0
    let states = 0
    for (const id of LEVEL_IDS) {
      for (const state of statesOfHouseNight(level(id), { overlap: id === 'first-3-gap' || id === 'first-4-par' })) {
        const scene = sceneOf(loopView(state))
        most = Math.max(most, scene.tickets.length + scene.plates.length + scene.clips.length * 2 + scene.picks.length)
        states += 1
      }
    }
    console.log(`3D instances: at most ${most} tickets, plates, clips and picks in ${states} states of the four levels`)
    // GAMES.md §3's T1 budget is 2,500 instances [estimated]; each kind is one instanced draw, whatever its count.
    expect(most).toBeLessThan(2500)
  })
})

describe('the acceptance check on colour and text', () => {
  const sources = ['src/games/loop/Scene3D.tsx', 'src/games/loop/scene-layout.ts', 'src/games/loop/scene-presets.ts'].map((file) => [file, readFileSync(path.join(root, file), 'utf8')] as const)

  test('no material in the scene takes a literal colour: every colour is read from a token role', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, file).not.toMatch(/\b(?:rgba?|hsla?|oklch)\(/)
      expect(text, file).not.toMatch(/new Color\(|\.setHex\(|\.setRGB\(|\.setHSL\(/)
    }
    // The amber is the kit's: the lamps' light and the glow of the stations' own heat elements; the scene adds no light of the line's
    // own that could wash the tile or a cold station beside a burning one.
    expect(sources[0][1]).not.toMatch(/PointLight|SpotLight|roleColor/)
  })

  test('no state takes a code colour: the stations burn in the heat lamp\'s amber through the kit\'s glow, never a lane\'s colour', () => {
    for (const [file, text] of sources) expect(text, file).not.toMatch(/'lane-gpu'|cat-green/)
    expect(sources[0][1]).toMatch(/litMask\(lit\)/)
    for (const css of ['src/games/loop/scene3d.css', 'src/front/front.css']) expect(readFileSync(path.join(root, css), 'utf8'), css).not.toMatch(/lane-gpu|cat-green/)
  })

  test('the scene is the kit\'s: no primitive of the W0 kit, nothing written in the canvas, and every word through the label layer', () => {
    const scene = sources[0][1]
    expect(scene).not.toMatch(/BlockGrid|SpanInstances|TimeAxis|Fixtures|HeatElements|HeatLamps/)
    expect(scene).toMatch(/<StaticSet items=\{kitchen\.items\}/)
    expect(scene).not.toMatch(/TextGeometry|CanvasTexture|getContext\(|fillText|from '@react-three\/drei'/)
    expect(scene).toMatch(/<SceneCanvas labels=\{labels\}/)
  })
})
