/*
 * W0-T17: Service's 3D layout (src/games/loop/scene-layout.ts), which the scene draws and nothing else decides. Every mark is held to the
 * session's view of the night: one place per clip per fire in the form the view says, the dark stretches where the line waited, the
 * rail's tickets on their clips, the fired rail only while a fire is on the line, the printer's strip, the comb that collapses on a
 * graph hit, and the stations' heat and the light they throw. Then the presets, the motion grammar's reading of a change, the
 * instance budget over whole nights, and the acceptance check that no material takes a literal colour, no state takes a code colour,
 * and no word is printed in the canvas.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { askOf, hang, initState, setOverlap, step } from '@es/play/loop/engine'
import { buildLevel, LEVEL_IDS } from '@es/play/loop/levels'
import { stationsOf, ticketNo } from '@es/play/loop/layout'
import { loopView } from '@es/play/loop/session'
import type { LoopState, LoopView } from '@es/play/loop/types'
import { COLOR_ROLE_NAMES } from '@/design/tokens'
import {
  changeOf,
  clipX,
  COMB_TEETH,
  GLOW,
  HISTORY_TICKS,
  lanesFor,
  MAX_GLOWS,
  PASS,
  RAIL,
  SLAB_ROLE,
  sceneLayout,
  SLOT_PITCH,
  STATION_BAR,
  stationGlows,
  STRIP_TICKETS,
  stripSheets,
  TICKET,
  TRACK_Y,
  UNITS_PER_TICK,
  type LoopSceneLayout,
} from '@/games/loop/scene-layout'
import { DEFAULT_PRESET, LOOP_PRESETS } from '@/games/loop/scene-presets'
import { handLevel, houseNight, statesOfHouseNight } from './loop-support'

const root = path.resolve(import.meta.dirname, '../..')
const level = (id: (typeof LEVEL_IDS)[number], seed = 1) => buildLevel(id, seed)
const fill = (s: LoopState, n = Number.POSITIVE_INFINITY): LoopState => {
  let state = s
  for (let i = 0; i < n && askOf(state) !== null; i++) state = hang(state, state.waiting[0])
  return state
}
const placesOf = (layout: LoopSceneLayout, fire: number) => layout.places.filter((place) => place.id.startsWith(`fire-${fire}/`))

describe('the line draws the view', () => {
  const night = houseNight(handLevel([3, 1, 5, 2, 7, 4, 2, 6]), { overlap: true })
  const view = loopView(night)
  const layout = sceneLayout(view)

  test('every fire in the window is a slab of the line\'s steel as wide as the rail, with one place per clip in the form the view says', () => {
    const shown = view.fires.filter((fire) => fire.endUs > layout.window.start)
    expect(shown.length).toBeGreaterThan(0)
    const form = { plate: 'solid', empty: 'groove', binned: 'hollow' } as const
    for (const fire of shown) {
      const slab = layout.slabs.find((span) => span.id === `fire-${fire.index}`)
      expect(slab).toMatchObject({ start: fire.startUs, end: fire.endUs, width: view.slots * SLOT_PITCH, role: SLAB_ROLE })
      expect(layout.spans.some((span) => span.id === `fire-${fire.index}`)).toBe(false)
      const places = placesOf(layout, fire.index)
      expect(places.map((place) => place.form)).toEqual(fire.places.map((place) => form[place.state]))
      // A clip's places line up along the night, behind its clip on the rail.
      places.forEach((place, slot) => expect(place.x).toBeCloseTo(clipX(slot)))
    }
  })

  test('a dark stretch lies exactly where the line waited between two fires, and nowhere else', () => {
    for (const fire of view.fires.slice(1)) {
      const before = view.fires[fire.index - 1]
      const dark = layout.spans.find((span) => span.id === `dark-${fire.index}`)
      if (fire.startUs > before.endUs && before.endUs >= layout.window.start) expect(dark).toMatchObject({ start: before.endUs, end: fire.startUs, role: 'lane-idle', form: 'hollow' })
      else expect(dark).toBeUndefined()
    }
  })

  test('the expo lane has a plan and a read for each fire, in their lane roles', () => {
    const plans = layout.spans.filter((span) => span.id.endsWith('-schedule'))
    const reads = layout.spans.filter((span) => span.id.endsWith('-sync'))
    expect(plans.length).toBe(view.cpu.filter((span) => span.kind === 'schedule' && span.endUs > layout.window.start).length)
    expect(reads.length).toBe(view.cpu.filter((span) => span.kind === 'sync' && span.endUs > layout.window.start).length)
    for (const plan of plans) expect(plan.role).toBe('lane-cpu')
    for (const read of reads) expect(read.role).toBe('lane-sync')
    for (const span of [...plans, ...reads]) expect(span.lane).toBe(lanesFor(view.slots).cpuX)
  })

  test('the window holds the last ticks of the night, and the clock is the present', () => {
    expect(layout.window.now).toBe(view.clockUs)
    expect(layout.window.start).toBe(Math.max(0, view.clockUs - HISTORY_TICKS))
    expect(layout.unitsPerTime).toBe(UNITS_PER_TICK)
  })

  test('every colour a mark takes is a token role, and the steel takes only its three tones', () => {
    const roles = new Set<string>(COLOR_ROLE_NAMES)
    for (const mark of [...layout.slabs, ...layout.spans, ...layout.places]) expect(roles.has(mark.role)).toBe(true)
    // A fire's slab is a sheet of the line's steel, one of the steel's tones: its state is carried by the stations' heat, never by a code colour.
    expect(['surface-1', 'surface-2', 'surface-3']).toContain(SLAB_ROLE)
    expect(roles.has(layout.onLine?.role ?? 'lamp-ring')).toBe(true)
    for (const part of [...layout.fixtures, ...layout.overhead]) expect(['bright', 'shaded', 'deep']).toContain(part.tone)
  })

  test('three heat lamps hang over the present, their shades apart from the rest of the steel so a shot from above can leave them out', () => {
    expect(layout.lamps).toHaveLength(3)
    for (const lamp of layout.lamps) {
      expect(lamp.at[1]).toBeGreaterThan(lamp.target[1])
      expect(lamp.target[2]).toBeLessThan(lamp.at[2] + 0.5)
    }
    expect(layout.overhead.filter((part) => part.kind === 'shade')).toHaveLength(3)
    expect(layout.fixtures.some((part) => part.kind === 'shade')).toBe(false)
  })

  test('the clock says what it counts twice, at the present for the shots down the night and at its far end for the side shot', () => {
    expect(layout.anchors.filter((anchor) => anchor.text === 'ticks · synthetic').map((anchor) => anchor.kind).sort()).toEqual(['axis', 'axis-far'])
    for (const tick of layout.anchors.filter((anchor) => anchor.kind === 'tick')) expect(Number(tick.text)).toBeLessThanOrEqual(view.clockUs)
  })
})

describe('the rail, the fired rail and the printer', () => {
  test('first service opens on an empty rail: every clip says empty, and the printer strip shows the tickets in line, the next at its end', () => {
    const view = loopView(initState(level('first-1-fill')))
    const layout = sceneLayout(view)
    expect(layout.tickets.filter((sheet) => sheet.kind === 'rail')).toEqual([])
    expect(layout.anchors.filter((anchor) => anchor.kind === 'empty').map((anchor) => anchor.text)).toEqual(['empty', 'empty', 'empty', 'empty'])
    const strip = layout.tickets.filter((sheet) => sheet.kind === 'waiting')
    expect(strip).toHaveLength(Math.min(STRIP_TICKETS, view.waiting.length))
    // The strip hangs and curls toward the expo: the lowest, nearest sheet is the next ticket in line.
    const lowest = [...strip].sort((a, b) => a.center[1] - b.center[1])[0]
    expect(lowest.req).toBe(view.waiting[0])
    expect(layout.inPrinter).toBe(view.waiting.length - strip.length)
    expect(layout.anchors.find((anchor) => anchor.kind === 'more')?.text).toBe(`+${layout.inPrinter}`)
  })

  test('a hung ticket keeps its sheet: the paper that left the strip is the paper on the clip, and it says new until it is fired', () => {
    const before = initState(level('first-1-fill'))
    const after = hang(before, before.waiting[0])
    const id = `t${before.waiting[0]}`
    expect(sceneLayout(loopView(before)).tickets.find((sheet) => sheet.id === id)?.kind).toBe('waiting')
    const layout = sceneLayout(loopView(after))
    const sheet = layout.tickets.find((candidate) => candidate.id === id)
    expect(sheet?.kind).toBe('rail')
    expect(sheet?.center[0]).toBeCloseTo(clipX(0))
    const label = layout.anchors.find((anchor) => anchor.id === `ticket-${before.waiting[0]}`)
    expect(label).toMatchObject({ text: ticketNo(before.waiting[0]), sub: 'new', frame: `sheet:${id}` })
    const fired = sceneLayout(loopView(step(fill(after))))
    expect(fired.anchors.filter((anchor) => anchor.kind === 'ticket').every((anchor) => anchor.sub === undefined)).toBe(true)
  })

  test('the printer feeds the strip out by one ticket when one is hung and more wait inside it', () => {
    const state = initState(level('first-4-par'))
    expect(state.waiting.length).toBeGreaterThan(STRIP_TICKETS)
    const before = stripSheets(4, state.waiting)
    const after = stripSheets(4, hang(state, state.waiting[0]).waiting)
    // Every ticket still in the strip moved one segment out: it now sits where the ticket ahead of it sat.
    for (const sheet of after.slice(1)) {
      const ahead = before.find((candidate) => candidate.req === sheet.req - 1)
      expect(sheet.center[1]).toBeCloseTo(ahead?.center[1] ?? Number.NaN)
    }
  })

  test('the fired rail is there only while a fire is on the line, holding that fire\'s tickets', () => {
    const off = step(fill(initState(level('first-3-gap'))))
    expect(loopView(off).firedRail).toBeNull()
    expect(sceneLayout(loopView(off)).tickets.some((sheet) => sheet.kind === 'fired')).toBe(false)
    const on = step(fill(setOverlap(initState(level('first-3-gap')), true)))
    const view = loopView(on)
    expect(view.firedRail).not.toBeNull()
    const layout = sceneLayout(view)
    const fired = layout.tickets.filter((sheet) => sheet.kind === 'fired')
    expect(fired.map((sheet) => sheet.req)).toEqual((view.firedRail ?? []).flatMap((clip) => (clip.req === null ? [] : [clip.req])))
    expect(layout.onLine).not.toBeNull()
    expect(layout.stations.lit).toEqual(stationsOf(view))
    expect(view.lineLit).toBe(true)
  })

  test('the stations light where the latest fire cooked a course and sit dark where its clip rode empty: half a rail fired leaves half the line dark, a full rail lights it end to end', () => {
    const before = loopView(fill(initState(level('first-1-fill')), 2))
    expect(sceneLayout(before).stations.lit).toEqual([false, false, false, false])
    const half = loopView(step(fill(initState(level('first-1-fill')), 2)))
    const halfLayout = sceneLayout(half)
    expect(halfLayout.stations.lit).toEqual([true, true, false, false])
    expect(halfLayout.stations.elements.map((element) => element.lit)).toEqual([true, true, false, false])
    expect(halfLayout.stations.elements.map((element) => element.at[0])).toEqual([0, 1, 2, 3].map(clipX))
    // On a laptop each burning station throws its light down its own row: the half that burns is lit, the half that rode empty
    // stays dark. On a phone the line's one light, over the line's middle, burns half as bright as a full fire's.
    expect(stationGlows(halfLayout.stations.lit, MAX_GLOWS.laptop).map((glow) => glow.share)).toEqual([1, 1, 0, 0])
    expect(stationGlows(halfLayout.stations.lit, MAX_GLOWS.laptop).map((glow) => glow.at[0])).toEqual([0, 1, 2, 3].map(clipX))
    const [phone] = stationGlows(halfLayout.stations.lit, MAX_GLOWS.phone)
    expect(phone.share).toBe(0.5)
    expect(phone.at[0]).toBeCloseTo((clipX(0) + clipX(3)) / 2)
    expect(halfLayout.anchors.find((anchor) => anchor.kind === 'station')?.text).toBe('2 of 4 lit')
    // An empty place is a dark station's well, in the deep steel's role; a plate is the paper's white.
    const roles = placesOf(halfLayout, 0).map((place) => place.role)
    expect(roles).toEqual(['cat-white', 'cat-white', 'surface-3', 'surface-3'])
    const full = sceneLayout(loopView(step(fill(initState(level('first-1-fill'))))))
    expect(full.stations.lit).toEqual([true, true, true, true])
    expect(stationGlows(full.stations.lit, MAX_GLOWS.laptop).map((glow) => glow.share)).toEqual([1, 1, 1, 1])
    const [line] = stationGlows(full.stations.lit, MAX_GLOWS.phone)
    expect(line.share).toBe(1)
    expect(line.at[0]).toBeCloseTo((clipX(0) + clipX(3)) / 2)
    expect(full.anchors.find((anchor) => anchor.kind === 'station')?.text).toBe('4 of 4 lit')
  })

  test('the stations\' lights hang beyond the bar, down the line; their number is the rail\'s and the tier\'s, never what burns', () => {
    for (const glow of stationGlows([true, false, true, false], MAX_GLOWS.laptop)) {
      expect(glow.at[2]).toBeLessThan(STATION_BAR.z)
      expect(glow.at).toEqual([glow.at[0], GLOW.y, GLOW.z])
    }
    for (const max of [MAX_GLOWS.phone, MAX_GLOWS.laptop]) {
      expect(stationGlows([false, false, false, false], max)).toHaveLength(max)
      expect(stationGlows([true, true, true, true], max)).toHaveLength(max)
    }
    // Eight clips share a laptop's lights, neighbours together: each over its pair's middle, as bright as the share of the pair that burns.
    const eight = stationGlows([true, true, false, true, false, false, false, false], MAX_GLOWS.laptop)
    expect(eight.map((glow) => glow.share)).toEqual([1, 0.5, 0, 0])
    expect(eight[0].at[0]).toBeCloseTo((clipX(0) + clipX(1)) / 2)
    expect(eight[1].at[0]).toBeCloseTo((clipX(2) + clipX(3)) / 2)
    // What burns never moves a light: the places are the rail's.
    expect(stationGlows([false, true, true, true, true, true, true, false], MAX_GLOWS.laptop).map((glow) => glow.at)).toEqual(eight.map((glow) => glow.at))
  })

  test('the stations\' bar stands beyond the pass, over the line\'s head, above every slab and below every hung ticket', () => {
    const layout = sceneLayout(loopView(step(fill(initState(level('first-1-fill'))))))
    for (const element of layout.stations.elements) {
      expect(element.at[2]).toBeLessThan(PASS.back)
      expect(element.at[1] - element.diameter / 2).toBeGreaterThan(Math.max(...layout.places.map((place) => (place.y ?? 0) + place.height)) + TRACK_Y)
      expect(element.at[1] + element.diameter / 2).toBeLessThan(RAIL.y - TICKET.h)
    }
  })

  test('a page that holds the printer itself leaves the scene\'s printer and its strip out', () => {
    const view = loopView(initState(level('first-1-fill')))
    const kept = sceneLayout(view)
    const left = sceneLayout(view, { printer: false })
    expect(kept.tickets.some((sheet) => sheet.kind === 'waiting')).toBe(true)
    expect(left.tickets.some((sheet) => sheet.kind === 'waiting')).toBe(false)
    expect(left.anchors.some((anchor) => anchor.kind === 'waiting' || anchor.kind === 'more')).toBe(false)
    expect(left.fixtures.length).toBeLessThan(kept.fixtures.length)
  })
})

describe('the comb (GAMES.md §2.6: calling each dish against one word)', () => {
  /** The view of a night with a launch phase on every fire, as TR2's levels will give it (W1-T13). */
  function withLaunches(view: LoopView, launches: number, graph: 'off' | 'hit' | 'miss'): LoopView {
    const cpu = view.cpu.flatMap((span) => (span.kind === 'schedule' ? [span, { step: span.step, kind: 'launch' as const, startUs: span.endUs - 1, endUs: span.endUs }] : [span]))
    return { ...view, cpu, fires: view.fires.map((fire) => ({ ...fire, launches, graph })) }
  }
  const base = loopView(houseNight(handLevel([2, 3, 2, 4]), { overlap: false }))

  test('the front page launches nothing, so it draws no comb', () => {
    expect(base.fires.every((fire) => fire.launches === 0 && fire.graph === 'off')).toBe(true)
    expect(sceneLayout(base).spans.some((span) => span.id.includes('-launch'))).toBe(false)
  })

  test('an eager fire calls each dish: one tooth per launch, inside its launch phase, up to the cap and a label beyond it', () => {
    const view = withLaunches(base, 12, 'off')
    const layout = sceneLayout(view)
    const teeth = layout.spans.filter((span) => span.id.startsWith('cpu-0-launch-tooth-'))
    expect(teeth).toHaveLength(12)
    const phase = view.cpu.find((span) => span.step === 0 && span.kind === 'launch')
    for (const tooth of teeth) {
      expect(tooth.start).toBeGreaterThanOrEqual(phase?.startUs ?? Number.NaN)
      expect(tooth.end).toBeLessThanOrEqual(phase?.endUs ?? Number.NaN)
    }
    const many = sceneLayout(withLaunches(base, 300, 'miss'))
    expect(many.spans.filter((span) => span.id.startsWith('cpu-0-launch-tooth-'))).toHaveLength(COMB_TEETH)
    expect(many.anchors.find((anchor) => anchor.id === 'calls-0')?.text).toBe('300 calls')
  })

  test('a graph hit collapses the comb into one short replay slab', () => {
    const layout = sceneLayout(withLaunches(base, 1, 'hit'))
    expect(layout.spans.filter((span) => span.id.startsWith('cpu-0-launch'))).toEqual([expect.objectContaining({ id: 'cpu-0-launch-replay', form: 'marked', role: 'lane-cpu' })])
  })
})

describe('the camera presets (GAMES.md §2.6, Service, Cameras)', () => {
  test('three shots, a button each: over the shoulder (the default), the side of the pass in orthographic, and under the lamps', () => {
    expect(LOOP_PRESETS.map((preset) => [preset.id, preset.label, preset.shot, preset.projection])).toEqual([
      ['shoulder', 'Over the shoulder', 'establish', 'perspective'],
      ['side', 'Side of the pass', 'compare', 'orthographic'],
      ['lamps', 'Under the lamps', 'top', 'perspective'],
    ])
    expect(DEFAULT_PRESET).toBe('shoulder')
    for (const preset of LOOP_PRESETS) expect(preset.portrait).toBeDefined()
  })

  test('over the shoulder looks down the night at about 25 degrees, from behind the expo', () => {
    const [shoulder] = LOOP_PRESETS
    const [px, py, pz] = shoulder.position
    const [tx, ty, tz] = shoulder.target
    const degrees = (Math.atan2(py - ty, Math.hypot(px - tx, pz - tz)) * 180) / Math.PI
    expect(degrees).toBeGreaterThan(22)
    expect(degrees).toBeLessThan(30)
    expect(pz).toBeGreaterThan(tz)
  })
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

describe('the budget (TRACKER W0-T17, accept 2; GAMES.md §3, Budget)', () => {
  test('over every state of every level\'s night, the scene stays far under its instance budget', () => {
    let most = 0
    let states = 0
    for (const id of LEVEL_IDS) {
      for (const state of statesOfHouseNight(level(id), { overlap: id === 'first-3-gap' || id === 'first-4-par' })) {
        const layout = sceneLayout(loopView(state))
        most = Math.max(most, layout.slabs.length + layout.spans.length + layout.places.length + layout.tickets.length + layout.tapes.length + layout.lamps.length)
        states += 1
      }
    }
    console.log(`3D marks: at most ${most} instances in ${states} states of the four levels`)
    // GAMES.md §3's T1 budget is 2,500 instances [estimated]; the scene's draw calls are one per primitive, whatever the count.
    expect(most).toBeLessThan(2500)
  })
})

describe('the acceptance check on colour and text (TRACKER W0-T17, accept 5)', () => {
  const sources = ['src/games/loop/Scene3D.tsx', 'src/games/loop/scene-layout.ts', 'src/games/loop/scene-presets.ts'].map((file) => [file, readFileSync(path.join(root, file), 'utf8')] as const)

  test('no material in the scene takes a literal colour: every colour is read from a token role', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, file).not.toMatch(/\b(?:rgba?|hsla?|oklch)\(/)
      expect(text, file).not.toMatch(/new Color\(|\.setHex\(|\.setRGB\(|\.setHSL\(/)
    }
    expect(sources[0][1]).toMatch(/roleColor\(kit\.tokens, 'lamp'\)/)
  })

  test('no state takes a code colour: the stations burn in the heat lamp\'s amber, and the line\'s slabs are its steel', () => {
    // The HACCP colours are the categorical code and only that (GAMES.md §2.6, rule 6): the line's lane colour, or any green, never
    // marks a station lit or a fire cooked.
    for (const [file, text] of sources) expect(text, file).not.toMatch(/'lane-gpu'|cat-green/)
    const lights = readFileSync(path.join(root, 'src/scene/Lights.tsx'), 'utf8')
    expect(lights).toMatch(/kit\.materials\.lamp/)
    for (const css of ['src/games/loop/scene3d.css', 'src/front/front.css']) expect(readFileSync(path.join(root, css), 'utf8'), css).not.toMatch(/lane-gpu|cat-green/)
  })

  test('nothing is written in the canvas: no text geometry, no canvas texture, and every word goes through the label layer', () => {
    const scene = sources[0][1]
    expect(scene).not.toMatch(/TextGeometry|CanvasTexture|getContext\(|fillText|from '@react-three\/drei'/)
    expect(scene).toMatch(/<SceneCanvas labels=\{labels\}/)
  })
})
