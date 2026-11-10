/*
 * The Reach-In's 3D layout (src/games/pool/scene-layout.ts) and its own prop (src/games/pool/cabinet.ts), which the scene draws with
 * scene kit v1 and nothing else decides (W1-T24, and two rounds of finish fixes). The reach-in is held to its shape: a hotel pan in every
 * slot, sixteen to a row, each in its place for its whole life whatever the night does, and one cover with a rolled lip over the slots a
 * short last row leaves; the room, the line under its hood, the pass with its two lamps hung low over it and under the line's rail, the
 * line's rail along the overshelf's front edge. The night is held to the session's view: a pan's mise is the food of its state, tape lies
 * only on a kit's pans (with its pin) and on the fan of the focus's head pan (with its station's glyph), the One station filter keeps one
 * station's twine and fan, the focus's twine runs from its ticket's foot through its pans in the order of its blocks, the fan has a tray
 * for each layer of its station and the page's words for it (focus.ts) agree with it, the lamp falls on the open ask's candidates and on
 * nothing else, the scene carries no word and no number, and the moment plays again only when the focus or its pans change. Then the
 * presets, projected at every pool size the levels have, at 1440 and at 390 px, and the acceptance checks on text and colour.
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
import { TICKET as KIT_TICKET, type Vec3 } from '@/scene/props/specs'
import { cabinet, lampBar } from '@/games/pool/cabinet'
import { focusOf } from '@/games/pool/focus'
import { CELL, COLS, CROWN, FOOD, FOOT, FRAME, LAMP, MISE, nightOf, PAN, PASS, PITCH, RAIL, reachInOf, SHOTS, TICKET, TOP, type Night } from '@/games/pool/scene-layout'
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
        // The mise lies below the rim, so the pan's wall and rim stand round it.
        held.forEach((pan, i) => expect(same(drawn.fills[i].at, [r.pans[pan.id][0], TOP - MISE.drop, r.pans[pan.id][2]])).toBe(true))
        expect(MISE.drop).toBeGreaterThan(MISE.heap)
        // Each kit pan's strip of tape lies on its mise, and the marker on it just over the tape; the last marker is the reach-in's own strip.
        for (const sheet of drawn.sheets) expect(r.pans.some((p) => same([p[0], CROWN, p[2]], sheet.center))).toBe(true)
        for (const tape of drawn.tapes.slice(0, -1)) expect(r.pans.some((p) => same([p[0], CROWN + 0.0004, p[2]], tape.at))).toBe(true)
        expect(drawn.tapes[drawn.tapes.length - 1]).toBe(r.tape)
        // The fan rises out of its head pan's own place.
        if (drawn.fan) expect(r.pans.some((p) => same([p[0], TOP - MISE.drop, p[2]], drawn.fan?.at ?? [0, 0, 0]))).toBe(true)
      }
    }
  })

  test("the room: tile, the line's burners under their hood, the pass with two heat lamps over it and under the rail, the line's rail at the overshelf's front edge; every prop builds with the kit", () => {
    const r = reachInOf(104, 4)
    const kinds = r.items.map((item) => item.kind)
    for (const kind of ['floor', 'tile-wall', 'burners', 'hood', 'pass', 'rail']) expect(kinds).toContain(kind)
    expect(kinds.filter((kind) => kind === 'heat-lamp')).toHaveLength(2)
    expect(r.lamps).toHaveLength(2)
    // Each lamp hangs over the pass's back half, inside its top, under the line's rail and clear over the waiting tickets, and throws its
    // light forward and down on the line the tickets lie along, in the pass's front half.
    for (const lamp of r.lamps) {
      expect(lamp.target[1]).toBe(PASS.top)
      expect(lamp.target[0]).toBe(lamp.at[0])
      expect(Math.abs(lamp.at[0])).toBeLessThan(PASS.width / 2 - 0.12)
      expect(lamp.at[2]).toBeGreaterThan(PASS.z - PASS.depth / 2 + 0.12)
      expect(lamp.at[2]).toBeLessThan(PASS.z)
      expect(lamp.target[2]).toBe(PASS.line)
      expect(PASS.line).toBeGreaterThan(PASS.z)
      expect(PASS.line + TICKET.height / 2).toBeLessThan(PASS.z + PASS.depth / 2)
      expect(lamp.at[1]).toBeLessThan(RAIL.y)
      expect(lamp.at[1] - PASS.top).toBeGreaterThan(0.2)
    }
    // The rail runs along the overshelf's front edge (the overshelf is 0.25 deep), where nothing over it hides the tickets it holds.
    expect(r.rail[2] + r.depth).toBeCloseTo(RAIL.out, 9)
    expect(RAIL.out).toBeGreaterThan(0.2)
    expect(RAIL.out).toBeLessThan(0.25)
    // The hood hangs over the burners, to the reach-in's left.
    const burners = r.items.find((item) => item.kind === 'burners')
    const hood = r.items.find((item) => item.kind === 'hood')
    if (!burners || !hood || hood.kind !== 'hood') throw new Error('no line under a hood')
    expect(Math.abs(hood.at[0] - burners.at[0])).toBeLessThan(0.1)
    expect(hood.at[1] - hood.height).toBeGreaterThan(1.6)
    expect(hood.at[0] + hood.width / 2).toBeLessThan(-r.width / 2 + 0.1)
    expect(r.clips).toHaveLength(4)
    // The room's light falls away to the right of the rack, and up the wall over the overshelf, into the haze.
    expect(r.light.x + r.light.half + r.light.reach[0]).toBeLessThan(r.width / 2 + 0.5)
    expect(r.light.above).toBeLessThan(RAIL.y + 0.1)
    expect(r.light.dim).toBeLessThan(0.4)
    expect(r.light.veil).toBeGreaterThan(0.5)
    const palette = paletteFrom(staticSceneTokens())
    for (const item of r.items) {
      const built = buildProp(item, palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      // Nothing floats: what stands on the floor or the counter casts a contact shadow.
      if (!['floor', 'tile-wall', 'hood', 'heat-lamp', 'rail'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test("the reach-in itself is a prop made the kit's way: built by the kit's maker in its tones, grounded by its footprint, its open slots under one cover with a lip", () => {
    const palette = paletteFrom(staticSceneTokens())
    for (const pages of [44, 112, 288, 100]) {
      const r = reachInOf(pages, 4)
      const built = buildProp({ kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, r) }, palette)
      expect(built.parts.length).toBeGreaterThan(COLS + r.rows)
      expect(new Set(built.parts.map((part) => part.surface))).toEqual(new Set(['metal']))
      expect(built.footprints).toHaveLength(1)
      // Its footprint lies under the whole cabinet, front at z = 0 and back at the wall.
      expect(built.footprints[0].center[2]).toBeCloseTo(-r.depth / 2)
      // A short last row leaves slots open, and they take one cover and its rolled lip: two parts more than a full row's cabinet.
      const open = r.rows * COLS - pages
      const full = buildProp({ kind: 'custom', id: 'reach-in', at: [0, 0, -r.depth / 2], build: (m) => cabinet(m, reachInOf(r.rows * COLS, 4)) }, palette)
      expect(built.parts.length - full.parts.length).toBe(open > 0 ? 2 : 0)
      for (const part of built.parts) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox
        if (!box) throw new Error('a part without a box')
        expect(box.max.z).toBeLessThanOrEqual(0.1)
        expect(box.min.z).toBeGreaterThanOrEqual(-r.depth - 0.01)
      }
      if (open === 0) continue
      // The cover spans the open slots of the front row, from the last pan's slot to the frame, and stands proud of the bars, its lip on top
      // (the overshelf is the cabinet's last part).
      const [cover, lip] = built.parts.slice(-3, -1).map((part) => part.geometry.boundingBox)
      if (!cover || !lip) throw new Error('no cover')
      const right = r.width / 2 - FRAME.side
      expect(cover.max.x).toBeCloseTo(right, 1)
      expect(cover.min.x).toBeCloseTo(right - open * PITCH.x, 1)
      expect(cover.min.z).toBeGreaterThan(-FRAME.front - PITCH.z - 0.01)
      expect(cover.max.y).toBeGreaterThan(TOP)
      expect(lip.max.y).toBeGreaterThan(cover.max.y)
    }
  })

  test("the heat lamps hang from a bar across the pass, a prop made the kit's way: two posts standing on its top, each grounded, and nothing over the pass higher than the bar (finish review, W1b round 2)", () => {
    const palette = paletteFrom(staticSceneTokens())
    const built = buildProp({ kind: 'custom', id: 'lamp-bar', at: [0, PASS.top, LAMP.z], build: lampBar }, palette)
    expect(new Set(built.parts.map((part) => part.surface))).toEqual(new Set(['metal']))
    // Nothing floats: each post's foot stands on the pass's top on its own contact shadow, inside the pass.
    expect(built.footprints).toHaveLength(2)
    for (const footprint of built.footprints) {
      expect(footprint.center[1]).toBeCloseTo(PASS.top, 9)
      expect(Math.abs(footprint.center[0])).toBeLessThan(PASS.width / 2 - 0.02)
      expect(Math.abs(footprint.center[2] - PASS.z)).toBeLessThan(PASS.depth / 2)
    }
    // The bar runs across the pass under the lamps' line, within its width, at the bar's height; no part of it rises past the bar or sinks
    // into the pass.
    let top = -Infinity
    for (const part of built.parts) {
      part.geometry.computeBoundingBox()
      const box = part.geometry.boundingBox
      if (!box) throw new Error('a part without a box')
      expect(box.min.y).toBeGreaterThanOrEqual(PASS.top - 1e-6)
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(PASS.width / 2)
      top = Math.max(top, box.max.y)
    }
    expect(top).toBeGreaterThan(LAMP.bar + 0.01)
    expect(top).toBeLessThanOrEqual(LAMP.bar + 0.013 + 1e-6)
    // Each lamp hangs from the bar by its canopy, its shade's mouth where the layout's light is, and no part of it reaches above the bar.
    const r = reachInOf(104, 4)
    const lamps = r.items.filter((item) => item.kind === 'heat-lamp')
    expect(lamps).toHaveLength(2)
    for (const lamp of lamps) {
      if (lamp.kind !== 'heat-lamp') continue
      expect(lamp.at[1]).toBe(LAMP.bar)
      expect(lamp.at[2]).toBe(LAMP.z)
      expect(Math.abs(lamp.at[0])).toBeLessThan(LAMP.span / 2)
      expect(lamp.at[1] - lamp.drop - 0.2015).toBeCloseTo(LAMP.mouth, 9)
      for (const part of buildProp(lamp, palette).parts) {
        part.geometry.computeBoundingBox()
        expect(part.geometry.boundingBox?.max.y ?? Infinity).toBeLessThanOrEqual(LAMP.bar + 1e-6)
      }
    }
    for (const light of r.lamps) expect(light.at[1]).toBeCloseTo(LAMP.mouth - 0.02, 9)
  })
})

describe('the night on the pans', () => {
  test("a pan's mise is the food of its memory role, and tape lies only on a kit's pans, with the kit's pin, and the reach-in's own strip", () => {
    let seen = 0
    let pinned = 0
    for (const id of ['two-kinds', 'adapters', 'state', 'same-size'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const drawn = nightAt(state)
        const held = v.pans.filter((pan) => pan.state !== 'free')
        const kits = held.filter((pan) => pan.kit !== null)
        held.forEach((pan, i) => {
          expect(drawn.fills[i].cell).toBe(FOOD[pan.state])
          seen += 1
        })
        expect(drawn.sheets).toHaveLength(kits.length)
        expect(drawn.tapes).toHaveLength(kits.length + 1)
        expect(drawn.sheets.map((sheet) => sheet.id)).toEqual(kits.map((pan) => `${pan.id}`))
        for (const tape of drawn.tapes.slice(0, -1)) expect(tape.cell).toBe(CELL.pin)
        expect(drawn.tapes[kits.length].cell).toBe(CELL.scrawl)
        pinned += kits.length
      }
    }
    expect(seen).toBeGreaterThan(1000)
    // The kits' level pins its pans.
    expect(pinned).toBeGreaterThan(0)
  })

  test("a pan's mise lies along its pan or end for end, by the pan's number, so it stays square in its pan and the rack is not stamped out alike (finish review, W1b round 1)", () => {
    const turns = new Set<number>()
    for (const state of night('two-kinds')) {
      const v = view(state)
      const drawn = nightAt(state)
      const held = v.pans.filter((pan) => pan.state !== 'free')
      drawn.fills.forEach((fill, i) => {
        const [x, y, z] = fill.rotation ?? [0, 0, 0]
        expect([x, z]).toEqual([0, 0])
        expect([0, Math.PI]).toContain(y)
        // The turn is the pan's own, whatever the night does to it.
        expect(y).toBe((held[i].id * 5) % 3 ? 0 : Math.PI)
        turns.add(y)
      })
    }
    expect([...turns].sort()).toEqual([0, Math.PI])
  })

  test("each pan's mise is heaped a little higher or lower than its neighbours', the highest still under the rim, and a kit's pan as drawn, its tape on its crown (finish review, W1b round 2)", () => {
    const heaps = new Set<number>()
    for (const id of ['two-kinds', 'adapters'] as const) {
      for (const state of night(id)) {
        const held = view(state).pans.filter((pan) => pan.state !== 'free')
        nightAt(state).fills.forEach((fill, i) => {
          const [across, up, along] = fill.scale ?? [1, 1, 1]
          // Only its height changes, so it stays square in its pan.
          expect([across, along]).toEqual([1, 1])
          if (held[i].kit !== null) expect(up).toBe(1)
          expect(up).toBeGreaterThanOrEqual(0.75)
          expect(MISE.heap * up).toBeLessThan(MISE.drop)
          heaps.add(up)
        })
      }
    }
    expect(heaps.size).toBeGreaterThanOrEqual(4)
  })

  test('a ticket on the line hangs turned on its clip, so its cut edge stands to the room, and one waiting on the pass lies square (finish review, W1b round 2)', () => {
    let hung = 0
    for (const state of night('two-kinds')) {
      const v = view(state)
      for (const ticket of nightAt(state).tickets) {
        const [tilt, turn] = ticket.rotation ?? [0, 0, 0]
        if (v.running.includes(Number(ticket.id.slice(1)))) {
          expect(tilt).toBe(-TICKET.tilt)
          expect(Math.abs(turn - TICKET.turn)).toBeLessThan(0.081)
          hung += 1
        } else expect(turn).toBe(0)
      }
    }
    expect(TICKET.turn).toBeGreaterThan(0.3)
    expect(hung).toBeGreaterThan(10)
  })

  test("each memory role has its own food, and a dumped pan's well is the hollow tray", () => {
    const held = (['used', 'cached', 'shared', 'adapter'] as const).map((state) => FOOD[state])
    expect(new Set(held).size).toBe(4)
    for (const cell of held) expect(cell).toBeGreaterThanOrEqual(8)
    expect(FOOD.evicted).toBe(CELL.hollow)
  })

  test("One station keeps that station's twine and fan, no kit's tape, and every pan's mise", () => {
    for (const id of ['two-kinds', 'adapters'] as const) {
      const states = night(id)
      const state = states[Math.floor(states.length / 2)]
      const v = view(state)
      for (let g = 0; g < v.stations.length; g++) {
        const drawn = nightAt(state, { station: g })
        expect(drawn.sheets).toHaveLength(0)
        expect(drawn.tapes).toHaveLength(1)
        expect(drawn.kits).toHaveLength(0)
        expect(drawn.fills).toHaveLength(v.pans.filter((pan) => pan.state !== 'free').length)
        expect(drawn.twine.length).toBeLessThanOrEqual(1)
        if (drawn.fan) expect(drawn.fan.glyph).toBe(CELL[v.stations[g].kind])
      }
    }
  })

  test("the focus is the ticket hung last: one string per station runs from its foot on the rail through the pans it holds, in the order of their blocks", () => {
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
            // It leaves from the ticket's foot on the rail, tipped and curled toward the expo, then touches each pan's mise in turn, a sag
            // between each two.
            expect(string[0][1]).toBeCloseTo(RAIL.y - RAIL.grip + FOOT[0] + 0.006)
            expect(string[0][2]).toBeCloseTo(r.rail[2] + 0.012 + FOOT[1])
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
    // The foot is below the clip and toward the expo, about a ticket's length from it.
    expect(FOOT[0]).toBeLessThan(-TICKET.height * 0.8)
    expect(FOOT[1]).toBeGreaterThan(0)
    expect(Math.hypot(FOOT[0], FOOT[1])).toBeCloseTo(TICKET.height, 1)
  })

  test("the head pan fans into the layers of its station, a tray for each, with its padding layers, its station's glyph on the top tray's tape, and the page says the same", () => {
    let fanned = 0
    let padded = 0
    for (const id of ['two-kinds', 'same-size'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        for (const station of [null, ...v.stations.map((s) => s.index)]) {
          const drawn = nightAt(state, { station })
          // The page's words (Game.tsx's FanNote) come from focus.ts: the same ticket, the same station, the same layers.
          const focus = focusOf(v, station)
          expect(focus.ticket).toBe(v.running[v.running.length - 1])
          if (drawn.fan === null) {
            expect(focus.group === null || focus.head === undefined).toBe(true)
            continue
          }
          expect(focus.group?.layers).toBe(drawn.fan.layers)
          expect(focus.group?.padLayers).toBe(drawn.fan.pads)
          expect(drawn.fan.cell).toBe(FOOD[focus.head?.state ?? 'free'])
          expect(drawn.fan.glyph).toBe(CELL[focus.group?.kind ?? 'full'])
          fanned += 1
          if (drawn.fan.pads > 0) padded += 1
        }
      }
    }
    expect(fanned).toBeGreaterThan(20)
    // Some fan shows padding layers: a station of `same-size`, shown on its own.
    expect(padded).toBeGreaterThan(0)
  })

  test("the lamp falls on the open ask's candidates and on nothing else: the dump's chosen pans ring, the tickets that can be pulled ring where they hang, the pass burns while it holds the present", () => {
    let pulls = 0
    for (const id of ['one-group', 'evict', 'adapters'] as const) {
      for (const state of night(id)) {
        const v = view(state)
        const ask = v.ask
        const chosen = ask?.kind === 'evict' ? ask.candidates.slice(0, ask.need) : []
        const drawn = nightAt(state, { chosen })
        const rack = drawn.rings.filter((ring) => ring.rotation === undefined)
        const rail = drawn.rings.filter((ring) => ring.rotation !== undefined)
        expect(rack).toHaveLength(ask?.kind === 'evict' ? ask.need : 0)
        expect(rail).toHaveLength(ask?.kind === 'preempt' ? ask.candidates.length : 0)
        // A pulled ticket's ring stands round it on the rail, where it hangs, half way down it.
        for (const ring of rail) expect(ring.at[1]).toBeCloseTo(RAIL.y - RAIL.grip + FOOT[0] / 2)
        pulls += rail.length
        expect(drawn.lit).toBe(ask?.kind === 'admit' || ask?.kind === 'prefetch')
      }
    }
    // The house's night on `one-group` pulls a ticket once.
    expect(pulls).toBeGreaterThan(0)
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

  test('the moment plays again when the focus or its pans change, and not when a pan is chosen to be dumped', () => {
    const states = night('evict')
    const evicting = states.find((state) => view(state).ask?.kind === 'evict')
    if (!evicting) throw new Error('no eviction on the night')
    const ask = view(evicting).ask
    if (ask?.kind !== 'evict') throw new Error('not an eviction')
    expect(nightAt(evicting, { chosen: ask.candidates.slice(0, ask.need) }).moment).toBe(nightAt(evicting, { chosen: ask.candidates.slice(-ask.need) }).moment)
    const moments = new Set(states.map((state) => nightAt(state).moment))
    expect(moments.size).toBeGreaterThan(5)
  })

  test('the scene carries no word and no number: no label rides on its canvas, and a ticket is paper and print, its number the page\'s', () => {
    for (const state of night('two-kinds')) {
      const drawn = nightAt(state)
      expect('labels' in drawn).toBe(false)
      expect(drawn.tickets).toHaveLength(view(state).waiting.length + view(state).running.length)
    }
    const scene = readFileSync(path.join(root, 'src/games/pool/Scene3D.tsx'), 'utf8')
    expect(scene).not.toMatch(/labels=/)
    expect(scene).not.toMatch(/LabelSpec|registerFrame/)
  })

  test("the tickets are the kit's, drawn larger by one scale, and lie on the pass far enough apart not to overlap", () => {
    expect(TICKET.height).toBeCloseTo(KIT_TICKET.height * TICKET.scale)
    expect(TICKET.gap).toBeGreaterThan(KIT_TICKET.width * TICKET.scale)
    expect(RAIL.pitch).toBeGreaterThan(KIT_TICKET.width * TICKET.scale)
    // Eight waiting tickets, the most a level holds, lie inside the pass's width.
    expect(7 * TICKET.gap + KIT_TICKET.width * TICKET.scale).toBeLessThan(PASS.width)
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

/** A hung ticket on clip `k` of four, from its clip to its foot: `t` of the way down it, in the scene. */
const hung = (r: ReturnType<typeof reachInOf>, k: number, t: number): Vec3 => [(k - 1.5) * RAIL.pitch, RAIL.y - RAIL.grip + FOOT[0] * t, r.rail[2] + 0.012 + FOOT[1] * t]

/** Whether the segment from `a` to `b` passes through the box from `lo` to `hi`. */
function through(a: Vec3, b: Vec3, lo: Vec3, hi: Vec3): boolean {
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i]
    if (Math.abs(d) < 1e-12) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false
      continue
    }
    const [u, w] = [(lo[i] - a[i]) / d, (hi[i] - a[i]) / d].sort((p, q) => p - q)
    t0 = Math.max(t0, u)
    t1 = Math.min(t1, w)
    if (t0 > t1) return false
  }
  return t1 > 1e-6 && t0 < 1 - 1e-6
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
    test(`at ${width} by ${height} px, every preset holds the rack whole at every pool size, and the front one the rail and its hung tickets, the pass's tickets and its front lip, its lamps, and the line's hood`, () => {
      for (const pages of POOLS) {
        const r = reachInOf(pages, 4)
        const half = r.width / 2
        const corners: Vec3[] = [-half, half].flatMap((x) => [[x, TOP, -r.depth] as Vec3, [x, TOP, 0] as Vec3])
        for (const preset of r.presets) {
          for (const corner of corners) expect(inside(projectIn(preset, corner, width, height), width, height), `${preset.id} ${pages} ${corner}`).toBe(true)
        }
        const front = r.presets[0]
        const landmarks: Vec3[] = [
          [-0.3, RAIL.y + 0.02, r.rail[2]],
          [0.3, RAIL.y + 0.02, r.rail[2]],
          // Each hung ticket's foot.
          ...[0, 3].map((k) => hung(r, k, 1)),
          // The eighth waiting ticket at either end of the pass, and its far edge.
          [-3.5 * TICKET.gap, PASS.top, PASS.line + TICKET.height / 2],
          [3.5 * TICKET.gap, PASS.top, PASS.line + TICKET.height / 2],
          // The pass's rolled front lip, near either end.
          [-PASS.width / 2 + 0.05, PASS.top - 0.04, PASS.z + PASS.depth / 2 + 0.012],
          [PASS.width / 2 - 0.05, PASS.top - 0.04, PASS.z + PASS.depth / 2 + 0.012],
          // Each lamp's mouth, over the pass.
          ...r.lamps.map((lamp) => lamp.at),
        ]
        for (const point of landmarks) expect(inside(projectIn(front, point, width, height), width, height), `front ${pages} ${point}`).toBe(true)
        // At 1440 px the line stands at the side under its hood: the hood's lip, at its corner nearest the rack, is in the picture.
        const hood = r.items.find((item) => item.kind === 'hood')
        if (width > 480 && hood?.kind === 'hood') {
          const lip: Vec3 = [hood.at[0] + hood.width / 2 - 0.02, hood.at[1] - hood.height, hood.at[2] + hood.depth]
          expect(inside(projectIn(front, lip, width, height), width, height), `front ${pages} hood`).toBe(true)
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
          // A point is hidden when it is in the picture and inside a shade's outline: From above on a phone leaves the pass out of it.
          const hidden = (p: Vec3) => {
            const at = projectIn(preset, p, width, height)
            return inside(at, width, height) && hulls.some((hull) => within(hull, at))
          }
          for (const [id, pan] of r.pans.entries()) {
            const corners: Vec3[] = [[0, 0], [-0.045, -0.08], [0.045, -0.08], [-0.045, 0.08], [0.045, 0.08]].map(([dx, dz]) => [pan[0] + dx, TOP, pan[2] + dz])
            expect(corners.some(hidden), `${preset.id} ${pages}: pan ${id + 1}`).toBe(false)
          }
          for (let k = 0; k < 4; k++) expect([0.05, 0.5, 0.95].some((t) => hidden(hung(r, k, t))), `${preset.id} ${pages}: clip ${k}`).toBe(false)
          for (let i = 0; i < 8; i++) expect([-1, 0, 1].some((k) => hidden([(i - 3.5) * TICKET.gap, PASS.top, PASS.line + (k * TICKET.height) / 2])), `${preset.id} ${pages}: waiting ${i}`).toBe(false)
        }
      }
    })

    test(`at ${width} by ${height} px, nothing that holds the lamps crosses a pan in any preset: the lamp bar and its posts stand under the rack in the picture (finish review, W1b round 2)`, () => {
      // A rod's outline in the picture, from points round its two ends: the bar across the pass and each post under it (cabinet.ts's lampBar).
      const around = ([x, y, z]: Vec3, d: number): Vec3[] => [
        [x - d, y, z],
        [x + d, y, z],
        [x, y - d, z],
        [x, y + d, z],
        [x, y, z - d],
        [x, y, z + d],
      ]
      const rod = (preset: CameraPreset, a: Vec3, b: Vec3, radius: number) => outline([...around(a, radius), ...around(b, radius)].map((p) => projectIn(preset, p, width, height)))
      const half = LAMP.span / 2
      for (const pages of POOLS) {
        const r = reachInOf(pages, 4)
        for (const preset of r.presets) {
          const hulls = [rod(preset, [-half - 0.02, LAMP.bar, LAMP.z], [half + 0.02, LAMP.bar, LAMP.z], 0.013), ...[-half, half].map((x) => rod(preset, [x, PASS.top, LAMP.z], [x, LAMP.bar, LAMP.z], 0.024))]
          for (const [id, pan] of r.pans.entries()) {
            const corners: Vec3[] = [[0, 0], [-0.045, -0.08], [0.045, -0.08], [-0.045, 0.08], [0.045, 0.08]].map(([dx, dz]) => [pan[0] + dx, TOP, pan[2] + dz])
            const crossed = corners.some((p) => {
              const at = projectIn(preset, p, width, height)
              return inside(at, width, height) && hulls.some((hull) => within(hull, at))
            })
            expect(crossed, `${preset.id} ${pages}: pan ${id + 1}`).toBe(false)
          }
        }
      }
    })

    test(`at ${width} by ${height} px, the front shot sees each lamp's shade over the pass, and every hung ticket whole, under the overshelf's front edge and not behind it`, () => {
      for (const pages of POOLS) {
        const r = reachInOf(pages, 4)
        const front = r.presets[0]
        const camera = framingFor(front, width).position
        const P = (p: Vec3) => projectIn(front, p, width, height)
        // The pass's top in the picture, and each shade's mouth, its sides and its front over it.
        const pass = outline(
          [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sz]) => P([(sx * PASS.width) / 2, PASS.top, PASS.z + (sz * PASS.depth) / 2])),
        )
        for (const lamp of r.lamps)
          for (const [dx, dz] of [
            [0, 0],
            [0.1185, 0],
            [-0.1185, 0],
            [0, 0.1185],
          ])
            expect(within(pass, P([lamp.at[0] + dx, lamp.at[1] + 0.02, lamp.at[2] + dz])), `${pages}: lamp ${lamp.id} over the pass`).toBe(true)
        // The overshelf: a slab 32 mm thick over the rail, from the wall 0.25 deep.
        const lo: Vec3 = [-r.width / 2, RAIL.y, -r.depth]
        const hi: Vec3 = [r.width / 2, RAIL.y + 0.032, -r.depth + 0.25]
        for (let k = 0; k < 4; k++) for (const t of [0.05, 0.5, 1]) expect(through(hung(r, k, t), camera, lo, hi), `${pages}: hung ticket ${k} at ${t}`).toBe(false)
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

  test('at 1440 px a hung ticket stands about 50 px tall in the front shot on the levels the reach-in is played most in, so its paper reads (finish review, round 2)', () => {
    for (const pages of [104, 112, 160]) {
      const r = reachInOf(pages, 4)
      const ys = [0, 0.5, 1].map((t) => projectIn(r.presets[0], hung(r, 1, t), 870, 557).y)
      const tall = Math.max(...ys) - Math.min(...ys)
      expect(tall, `${pages}`).toBeGreaterThan(40)
      expect(tall, `${pages}`).toBeLessThan(60)
    }
  })
})

describe('the acceptance checks on text, colour and size', () => {
  const sources = ['src/games/pool/Scene3D.tsx', 'src/games/pool/scene-layout.ts', 'src/games/pool/cabinet.ts'].map((file) => readFileSync(path.join(root, file), 'utf8'))

  test('all text is DOM: the canvas prints nothing, the glyphs are shapes', () => {
    for (const source of sources) expect(source).not.toMatch(/fillText|strokeText|TextGeometry|FontLoader/)
  })

  test("the steel reflects the kitchen's tubes and not the heat lamps' glow, so it warms only under a lit lamp (One Lamp)", () => {
    expect(sources[0]).toMatch(/<SceneCanvas [^>]*environment="tubes"/)
  })

  test('the room falls into a haze of shaded steel with distance and height, and the paper, the mise, the twine, the tape and the rings on the reach-in take none (finish review, W1b round 1)', () => {
    const scene = sources[0]
    // The haze is a role's colour, paler than the floor it lifts, beginning a little in front of the camera's focus.
    expect(scene).toMatch(/<SceneCanvas fog=\{\{ near: HAZE\.near, far: HAZE\.far, color: 'surface-2' \}\}/)
    const haze = /const HAZE = \{ near: (-?[\d.]+), far: ([\d.]+), high: ([\d.]+) \} as const/.exec(scene)
    expect(haze).not.toBeNull()
    const [near, far, high] = (haze ?? []).slice(1).map(Number)
    expect(near).toBeLessThan(0)
    expect(far).toBeGreaterThan(near)
    expect(high).toBeLessThan(1)
    // The steel takes it past the reach-in's sides and over the overshelf, the tile everywhere; both through the scene's own patches.
    expect(scene).toMatch(/<Kitchen [^>]*metal=\{METAL_HAZE\}/)
    expect(scene).toMatch(/patch\(materials\.tile, '[\w-]+', TILE_HAZE\)/)
    const steel = /const METAL_HAZE = haze\('([\d.]+)', '([\d.]+)', '([\d.]+)'\)/.exec(scene)
    expect(Number(steel?.[1])).toBeGreaterThan(RAIL.y + 0.05)
    expect(Number(steel?.[3])).toBeGreaterThanOrEqual(reachInOf(104, 4).width / 2)
    // What lies on the reach-in and the pass opts out of the fog.
    for (const material of ['food', 'marks', 'cord']) expect(scene).toMatch(new RegExp(`const ${material} = new MeshStandardMaterial\\(\\{[^}]*fog: false`))
    expect(scene).toMatch(/for \(const material of \[materials\.ticket, kit\.materials\.tape, kit\.materials\.lamp\]\) \{\s*material\.fog = false/)
  })

  test("at T1 the heat lamps take more of the kit's light than from T2, where the kit draws it three times over (finish review, W1b round 1)", () => {
    const power = /const LAMP_POWER = \[([\d.]+), ([\d.]+)\] as const/.exec(sources[0])
    expect(power).not.toBeNull()
    expect(Number(power?.[1])).toBeGreaterThan(Number(power?.[2]))
    expect(sources[0]).toMatch(/const power = LAMP_POWER\[kit\.tier < 2 \? 0 : 1\]/)
  })

  test('the scene reaches three only through the kit and its own lazy chunk, and the page holds it behind React.lazy', () => {
    const game = readFileSync(path.join(root, 'src/games/pool/Game.tsx'), 'utf8')
    expect(game).toMatch(/lazy\(\(\) => import\('\.\/Scene3D'\)\)/)
    // A type is erased; a value imported from the scene's modules would pull them into the page's chunk.
    expect(game).not.toMatch(/^import (?!type )[^\n]*from '\.\/(Scene3D|scene-layout|cabinet)'/m)
    expect(sources[1]).not.toMatch(/from 'three'/)
  })

  test("the corn is cooked toward the kit's brown, each kernel its own share of it, and no other food is; each food keeps its role's colour (finish review, W1b round 2)", () => {
    const scene = sources[0]
    const toast = Object.fromEntries([...scene.matchAll(/\['(used|cached|shared|adapter)', [^\]]*, ([\d.]+)\],/g)].map(([, state, share]) => [state, Number(share)]))
    expect(Object.keys(toast).sort()).toEqual(['adapter', 'cached', 'shared', 'used'])
    expect(toast.cached).toBeGreaterThan(0.5)
    expect(toast.cached).toBeLessThanOrEqual(1)
    for (const state of ['used', 'shared', 'adapter']) expect(toast[state]).toBe(0)
    // Each piece is its own role's colour, toward the kit's brown by its own share of the food's toast; nothing else is mixed in.
    expect(scene).toMatch(/const base = role\(`memory-\$\{state\}`\)/)
    expect(scene).toMatch(/const brown = role\('memory-adapter'\)/)
    expect(scene).toMatch(/const tone = base\.clone\(\)\.lerp\(brown, toast \* \(\(i \* 0\.618\) % 1\)\)/)
  })

  test("a hung ticket is a thick slip with lit edges, and no outline is drawn round the paper: the patch finds the sheet's back from the kit's ticket and this scene's curl (finish review, W1b round 2)", () => {
    const scene = sources[0]
    // The back lies 1 mm behind the face, which ticketGeometry curls by `curl` of the kit's ticket's length and cups across its width.
    const back = /float pinch=0\.,t=-position\.y\/([\d.]+),back=step\(position\.z,([\d.]+)\*t\*t\+([\d.]+)\*t\*position\.x\*position\.x-5e-4\);/.exec(scene)
    expect(back).not.toBeNull()
    const [length, curl, cup] = (back ?? []).slice(1).map((v) => Number(v.startsWith('.') ? `0${v}` : v))
    expect(length).toBeCloseTo(KIT_TICKET.height, 9)
    expect(curl).toBeCloseTo(TICKET.curl * KIT_TICKET.height, 9)
    expect(cup).toBeCloseTo((TICKET.curl * KIT_TICKET.height * 0.625) / (KIT_TICKET.width / 2) ** 2, 6)
    expect(KIT_TICKET.thickness).toBeGreaterThan(0.0005 * 1.5)
    // A hung one's back is pushed behind its face (a lying one's is not: its pinch is 0), and its cut edges are lit.
    expect(scene).toMatch(/transformed\.z-=back\*pinch\*\.\d+;/)
    expect(scene).toMatch(/\(1\.\+\.\d+\*vPaper\.w\)/)
    expect(scene).not.toMatch(/fwidth/)
  })

  test('the instances of the largest pool stay far under the tier caps (A§6.6: 10k at T1)', () => {
    const states = night('same-size')
    let most = 0
    for (const state of states) {
      const drawn = nightAt(state)
      const v = view(state)
      most = Math.max(most, v.pans.length + drawn.fills.length + drawn.sheets.length + drawn.tapes.length + drawn.rings.length + 2 * 32 + drawn.tickets.length + v.cap)
    }
    expect(most).toBeLessThan(1500)
  })
})
