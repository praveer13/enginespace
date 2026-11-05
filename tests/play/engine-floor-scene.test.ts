/*
 * Back of House's 3D scene (W1-T18; GAMES.md §5 "3D scene", §2.6 "Back of House"), with no WebGL: the house the page lays out of the view
 * (src/games/engine-floor/scene-layout.ts), the route the laid stages make through it and the run the scene plays (scene-route.ts), the
 * camera's stops (scene-stops.ts, scene-presets.ts), and the house's own props made the kit's way (scene-props.ts).
 *
 *   - The 3D house is the 2D house's plan in steel: the same floors in the same order, a storey each from the top and the line at the foot,
 *     and a spot for every place a laid stage names. Before the prediction it is the floor the request begins on and nothing else, and a
 *     sealed graded run builds only the floors its route has reached, as the 2D house does.
 *   - The route is a chain of hops, each from the last stand through the hand-off that crosses it: a window and the chute behind the
 *     partition for IPC and shared memory, the dumbwaiter's car for a copy, the line's rail for a launch, a spike for a queue and the gate for
 *     a sync. Every laid stage has its number on one chit.
 *   - One lamp: every pair of hands has a lamp on a channel of its own, and the present lights its own and no other.
 *   - The run plays the hops a run added, one stage to the bell, and a balk where it stopped; nothing else moves, and under reduced motion
 *     nothing at all.
 *   - The scene's own modules take only types from the page's, so the 3D chunk imports nothing the game's chunk holds (verify:bundle finds a
 *     game by its chunk's source).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Box3, Vector3 } from 'three'
import { MAP_LEVEL, trayFor } from '@es/play/engine-floor/levels'
import { floorView } from '@es/play/engine-floor/session'
import { referenceOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel } from '@es/play/engine-floor/types'
import { placeKey } from '@es/play/engine-floor/words'
import { describeScenario } from '@es/sim/lifecycle'
import type { Scenario } from '@es/sim/lifecycle'
import { staticSceneTokens } from '@/design/scene-tokens'
import { framingFor, nextPreset } from '@/scene/camera-rig'
import { buildProp } from '@/scene/props/build'
import { CHANNEL, paletteFrom } from '@/scene/props/palette'
import type { PropSpec } from '@/scene/props/specs'
import { HOUSE, houseOf, presentOf, tapesOf, type HouseItem, type HouseProp } from '@/games/engine-floor/scene-layout'
import { presetsOf, sceneModelOf } from '@/games/engine-floor/scene-presets'
import { customOf } from '@/games/engine-floor/scene-props'
import { BALK, balkOf, hopMs, playOf, presetFor, routeOf } from '@/games/engine-floor/scene-route'
import { floorsOf, nextStop, stopsOf } from '@/games/engine-floor/scene-stops'
import { ALL_SCENARIOS, laidTo, levelOf, ranTo, truthOf, walk } from './engine-floor-support'

const root = path.resolve(import.meta.dirname, '../..')
const palette = paletteFrom(staticSceneTokens())
const OWN = new Set(['deck', 'partition', 'shaft', 'post', 'gate', 'shelf'])
const asSpec = (item: HouseItem): PropSpec => (OWN.has(item.kind) ? customOf(item as HouseProp) : (item as PropSpec))

/** A level on a scenario of the model: its own path, and a tray of every stage it has and four of other engines. */
function levelFor(sc: Scenario, id: FloorLevel['id'] = 'inside'): FloorLevel {
  return { id, seed: 0, title: describeScenario(sc), prompt: '', scenario: sc, reference: referenceOf(sc).map((stage) => stage.id), tray: trayFor(sc, 0, true).map((stage) => stage.id), attempts: null }
}

/** The view with the engine's whole path laid, written down first: the house as the learner sees it before the run. */
const laidView = (level: FloorLevel) => floorView(laidTo(level, level.reference.length))
const houseOfView = (view: ReturnType<typeof floorView>) => houseOf(floorsOf(view))

describe('the house: the 2D house\'s plan, in steel', () => {
  test.each(ALL_SCENARIOS.map((sc) => [describeScenario(sc), sc] as const))('%s: a storey for each floor in the 2D order, the line at the foot, and a spot for every place laid', (_, sc) => {
    const view = laidView(levelFor(sc))
    const floors = floorsOf(view)
    const house = houseOf(floors)
    expect(house.storeys.map((storey) => storey.title)).toEqual(floors.map((floor) => floor.title))
    const hosts = house.storeys.filter((storey) => !storey.line)
    for (let i = 1; i < hosts.length; i++) expect(hosts[i].y).toBeCloseTo(hosts[i - 1].y - HOUSE.pitch, 6)
    const line = house.storeys.at(-1)
    expect(line?.line).toBe(true)
    expect(line?.y).toBe(0)
    expect(hosts.at(-1)?.y).toBe(HOUSE.line)
    for (const stage of view.laid) for (const place of [stage.from, stage.to]) expect(house.spots.has(placeKey(place))).toBe(true)
    // The towers: a partition with a window into each storey when there are two or more, and the dumbwaiter's shaft down to the line.
    expect(house.windows !== null).toBe(hosts.length > 1)
    expect(house.shaft?.landings).toEqual(house.storeys.map((storey) => (storey.line ? HOUSE.counter : storey.y)))
  })

  test('pairs of hands stand a lane apart on their storey, inside the house\'s box, and each storey\'s stands under its own deck', () => {
    for (const sc of ALL_SCENARIOS) {
      const house = houseOfView(laidView(levelFor(sc)))
      const { min, max } = house.box
      for (const spot of house.spots.values()) {
        expect(spot.x).toBeGreaterThan(min[0])
        expect(spot.x).toBeLessThan(max[0])
        expect(spot.x / HOUSE.lane).toBeCloseTo(Math.round(spot.x / HOUSE.lane), 6)
        const storey = house.storeys[spot.storey]
        const top = storey.line ? HOUSE.line : storey.y + HOUSE.pitch
        expect(spot.stand.at[1]).toBeGreaterThan(spot.y)
        expect(spot.stand.at[1]).toBeLessThan(top - HOUSE.deck)
      }
      const xs = new Set([...house.spots.values()].map((spot) => `${spot.storey}:${spot.x}`))
      expect(xs.size).toBe(house.spots.size)
    }
  })

  test('before the prediction the house is the floor the request begins on and nothing else: it must not answer how many floors there are', () => {
    for (const id of ['nano', 'mini', 'vllm', 'sglang'] as const) {
      const level = levelOf(id)
      const house = houseOfView(floorView(walk(level)))
      expect(house.storeys).toHaveLength(1)
      expect(house.windows).toBeNull()
      expect(house.shaft).toBeNull()
      expect(house.items.some((item) => ['hood', 'burners', 'griddle', 'fryer', 'speed-rack'].includes(item.kind))).toBe(false)
      // Written down, the house is built whole.
      expect(houseOfView(floorView(walk(level, { t: 'commit', prediction: truthOf(level.scenario) }))).storeys.length).toBeGreaterThan(1)
    }
  })

  test('a sealed graded run builds only the floors its route has reached, as the 2D house does, and the whole house once it is judged', () => {
    const level = levelOf(MAP_LEVEL, 11)
    const committed = walk(level, { t: 'commit', prediction: 2 })
    expect(floorView(committed).sealed).toBe(true)
    expect(houseOfView(floorView(committed)).storeys).toHaveLength(1)
    const first = walk(level, { t: 'commit', prediction: 2 }, { t: 'lay', stage: level.reference[0] })
    const reached = houseOfView(floorView(first))
    expect(reached.storeys.length).toBeLessThan(houseOfView(laidView(levelFor(level.scenario))).storeys.length)
    const judged = floorView(walk(level, ...[{ t: 'commit', prediction: 2 } as FloorAction, ...level.reference.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }]))
    expect(judged.sealed).toBe(false)
    expect(houseOfView(judged).storeys.map((storey) => storey.title)).toEqual(floorsOf(judged).map((floor) => floor.title))
  })

  test('every prop builds the kit\'s way: real geometry in metres, and what stands on a floor or a deck casts a contact shadow', () => {
    // The largest house of the model, with every hand-off a stage can lay in it.
    const sc = ALL_SCENARIOS.reduce((best, candidate) => (referenceOf(candidate).length > referenceOf(best).length ? candidate : best))
    const view = laidView(levelFor(sc))
    const house = houseOfView(view)
    const items = [...house.items, ...routeOf(view, house).props, { kind: 'shelf', id: 'shelf', at: [0, 1, 0] } as HouseProp]
    for (const item of items) {
      const built = buildProp(asSpec(item), palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      const bounds = new Box3()
      for (const part of built.parts) {
        const position = part.geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) expect(Number.isFinite(position.getY(i))).toBe(true)
        bounds.union(new Box3().setFromBufferAttribute(position as never))
      }
      expect(bounds.getSize(new Vector3()).length(), item.id).toBeGreaterThan(0.02)
      // Nothing floats: the room bounds the house, decks hang on the towers, lamps and rails hang from the decks and the tile; all else stands.
      if (!['floor', 'tile-wall', 'hood', 'heat-lamp', 'rail', 'deck', 'shelf'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test('one lamp: every pair of hands has a lamp on its own channel and every stream a station on its own, and the present lights only its own', () => {
    for (const sc of ALL_SCENARIOS) {
      const level = levelFor(sc)
      const view = laidView(level)
      const house = houseOfView(view)
      const channels = [...house.spots.values()].map((spot) => spot.channel)
      expect(new Set(channels).size).toBe(channels.length)
      expect(Math.max(...channels)).toBeLessThan(CHANNEL.lamp)
      const lamps = house.items.filter((item) => item.kind === 'heat-lamp')
      expect(lamps.map((lamp) => ('channel' in lamp ? lamp.channel : -1)).sort((a, b) => a - b)).toEqual([...house.spots.values()].filter((spot) => !spot.gpu).map((spot) => spot.channel).sort((a, b) => a - b))
      const present = presentOf(view, house)
      expect(present?.key).toBe(placeKey(view.present))
      expect(present?.lamp === null).toBe(present?.gpu)
    }
    // Once the ticket is home, nothing is the present, and no lamp is lit.
    const done = floorView(ranTo(levelOf('nano'), levelOf('nano').reference.length))
    expect(done.done).toBe(true)
    expect(presentOf(done, houseOfView(done))).toBeNull()
  })

  test('its tapes name every storey in the kitchen\'s words with the engine\'s, and every pair of hands by its thread with the lane\'s code', () => {
    const view = laidView(levelOf('vllm'))
    const tapes = tapesOf(houseOfView(view))
    expect(tapes.filter((tape) => tape.id.startsWith('storey-')).map((tape) => tape.text)).toEqual(['THE DINING ROOM · CLIENT', 'THE HOST STAND · API-SERVER', 'THE PASS · ENGINE-CORE', 'THE LINE'])
    // The line's name is masking tape stuck on the hood's skirt, as Service's is on its tile; the floors' tapes and the hands' are DOM tape.
    const line = tapes.find((tape) => tape.text === 'THE LINE')
    expect(line?.strip?.center).toEqual(line?.at)
    expect(tapes.filter((tape) => tape.strip)).toHaveLength(1)
    const hands = tapes.filter((tape) => tape.hands)
    expect(hands.map((tape) => tape.text)).toContain('input-thread')
    expect(hands.find((tape) => tape.text === 'stream')?.slot).toBe('green')
    expect(hands.find((tape) => tape.text === 'main')?.slot).toBe('blue')
  })
})

describe('the route: the ticket\'s way through the house', () => {
  test.each(ALL_SCENARIOS.map((sc) => [describeScenario(sc), sc] as const))('%s: a hop for each stage, each from the last stand through the hand-off that crosses it', (_, sc) => {
    const view = laidView(levelFor(sc))
    const house = houseOfView(view)
    const route = routeOf(view, house)
    expect(route.hops).toHaveLength(view.laid.length)
    expect(route.stands).toHaveLength(view.laid.length + 1)
    route.hops.forEach((hop, i) => {
      const stage = view.laid[i]
      expect(hop.poses[0]).toBe(route.stands[i])
      expect(hop.poses.at(-1)).toBe(route.stands[i + 1])
      expect(hop.storey).toBe(house.spots.get(placeKey(stage.to))?.storey)
      expect(hop.length).toBeGreaterThanOrEqual(0)
      const xs = hop.poses.map((pose) => pose.at[0])
      if (stage.mechanism === 'ipc' || stage.mechanism === 'shm') expect(Math.min(...xs)).toBeLessThan(house.windows ?? Number.NaN)
      if (stage.mechanism === 'h2d' || stage.mechanism === 'd2h') {
        expect(hop.car).toHaveLength(hop.poses.length)
        expect(xs.filter((x) => x === house.shaft?.x)).toHaveLength(2)
      } else expect(hop.car).toBeNull()
      expect(hop.cook).toBe(stage.mechanism === 'launch' ? house.spots.get(placeKey(stage.to))?.channel : null)
      if (stage.mechanism === 'queue') expect(route.props.some((prop) => prop.kind === 'spike' && Math.abs(prop.at[0] - hop.poses.at(-1)!.at[0]) < 0.07)).toBe(true)
      if (stage.mechanism === 'sync') expect(route.props.some((prop) => prop.kind === 'gate')).toBe(true)
    })
    // Every stage's number on exactly one chit, in order there; each laid prop once.
    expect(route.chits.flatMap((chit) => chit.stages.map((s) => s.n)).sort((a, b) => a - b)).toEqual(view.laid.map((stage) => stage.index + 1))
    expect(new Set(route.props.map((prop) => prop.id)).size).toBe(route.props.length)
  })

  test('the dumbwaiter\'s car goes where the ticket leaves it, and waits at the line\'s counter before any copy', () => {
    const view = laidView(levelOf('vllm'))
    const house = houseOfView(view)
    const route = routeOf(view, house)
    expect(route.cars[0]).toBe(HOUSE.counter)
    const down = route.hops.find((hop, i) => view.laid[i].mechanism === 'h2d')
    const up = route.hops.find((hop, i) => view.laid[i].mechanism === 'd2h')
    expect(down?.car?.at(-1)).toBe(HOUSE.counter)
    expect(up?.car?.[1]).toBe(HOUSE.counter)
    expect(up?.car?.at(-1)).toBe(house.storeys[up?.storey ?? 0].y)
  })
})

describe('the run, one stage to the bell', () => {
  const level = levelOf('vllm')
  const before = laidTo(level, 13)
  const route = (view: ReturnType<typeof floorView>) => routeOf(view, houseOfView(view))

  test('a run plays the hops it added from where the ticket stood, and a balk where it stopped', () => {
    const wrong = walk(level, { t: 'commit', prediction: 2 }, ...[...level.reference.slice(0, 13), level.reference[14]].map((stage): FloorAction => ({ t: 'lay', stage })))
    const after = floorView(walk(level, { t: 'commit', prediction: 2 }, ...[...level.reference.slice(0, 13), level.reference[14]].map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }))
    expect(after.reached).toBe(13)
    expect(after.stop?.at).toBe(13)
    const play = playOf(floorView(wrong), after, route(after), 240)
    expect(play?.base).toBe(0)
    expect(play?.held).toBe(13)
    expect(play?.hops).toHaveLength(14)
    const balk = play?.hops.at(-1)
    expect(balk?.storey).toBe(-1)
    expect(balk?.poses[0]).toEqual(balk?.poses[2])
    // A run after a fix plays only the hops beyond where the ticket stood.
    const fixed = floorView(walk(level, { t: 'commit', prediction: 2 }, ...[...level.reference.slice(0, 13), level.reference[14]].map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }, { t: 'unlay', to: 13 }, ...level.reference.slice(13, 16).map((stage): FloorAction => ({ t: 'lay', stage }))))
    const again = floorView(walk(level, { t: 'commit', prediction: 2 }, ...[...level.reference.slice(0, 13), level.reference[14]].map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }, { t: 'unlay', to: 13 }, ...level.reference.slice(13, 16).map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }))
    const next = playOf(fixed, again, route(again), 240)
    expect(next?.base).toBe(13)
    expect(next?.hops).toHaveLength(3)
  })

  test('every other change cuts: laying, taking back, a new level, and every run under reduced motion', () => {
    const view = floorView(before)
    const ran = floorView(ranTo(level, 13))
    expect(playOf(view, ran, route(ran), 240)?.hops).toHaveLength(13)
    expect(playOf(view, ran, route(ran), 0)).toBeNull()
    expect(playOf(view, floorView(laidTo(level, 14)), route(ran), 240)).toBeNull()
    expect(playOf(ran, floorView(walk(level, { t: 'commit', prediction: 2 })), route(ran), 240)).toBeNull()
    expect(playOf(floorView(laidTo(levelOf('inside'), 13)), ran, route(ran), 240)).toBeNull()
  })

  test('a hop takes a beat of the bell and more for the way it travels, at most three beats; a balk goes a short way toward the hand-off', () => {
    expect(hopMs(240, 0)).toBe(240)
    expect(hopMs(240, 1)).toBe(460)
    expect(hopMs(240, 10)).toBe(720)
    const ran = floorView(ranTo(level, 13))
    const hop = route(ran).hops[3]
    const balk = balkOf(hop)
    const [x0, , z0] = hop.poses[0].at
    const [x1, , z1] = hop.poses[1].at
    expect(balk.poses[1].at[0]).toBeCloseTo(x0 + (x1 - x0) * BALK, 2)
    expect(balk.poses[1].at[2]).toBeCloseTo(z0 + (z1 - z0) * BALK, 2)
  })
})

describe('the camera\'s stops (GAMES.md §2.6, Cameras)', () => {
  test('the cutaway, one stop for each storey named by its tape, and the follow; `C` cycles them, and each is a preset of the rig', () => {
    const view = laidView(levelOf('mini'))
    const floors = floorsOf(view)
    const stops = stopsOf(floors)
    expect(stops.map((stop) => stop.id)).toEqual(['cutaway', ...floors.map((_, i) => `floor:${i}`), 'follow'])
    expect(stops[1].label).toBe('The dining room · client')
    expect(nextStop(stops, 'follow')).toBe('cutaway')
    expect(nextStop(stops, 'cutaway')).toBe('floor:0')
    const house = houseOf(floors)
    const presets = presetsOf(house)
    for (const stop of stops) expect(presets.map((preset) => preset.id)).toContain(presetFor({ house, presets }, stop.id, 2))
    expect(presetFor({ house, presets }, 'follow', 2)).toBe('follow:2')
    expect(presetFor({ house, presets }, 'follow', 40)).toBe(`follow:${house.storeys.length - 1}`)
    expect(presetFor({ house, presets }, 'floor:40', 0)).toBe('cutaway')
    expect(nextPreset(presets, 'cutaway')).toBe('floor:0')
  })

  test('every framing looks at the house from in front of it and above, at about 30°, landscape and portrait', () => {
    for (const sc of ALL_SCENARIOS.filter((_, i) => i % 7 === 0)) {
      const house = houseOfView(laidView(levelFor(sc)))
      for (const preset of presetsOf(house)) {
        for (const width of [1440, 390]) {
          const framing = framingFor(preset, width)
          expect(framing.fov).toBe(30)
          expect(framing.position[2]).toBeGreaterThan(house.box.max[2])
          expect(framing.position[1]).toBeGreaterThan(framing.target[1])
          expect(framing.target[1]).toBeGreaterThanOrEqual(house.box.min[1])
          expect(framing.target[1]).toBeLessThanOrEqual(house.box.max[1])
        }
      }
    }
  })

  test('before the prediction the cutaway frames the one storey there is, close, as its own stop does', () => {
    const house = houseOfView(floorView(walk(levelOf('vllm'))))
    const [cutaway, floor] = presetsOf(house)
    expect(cutaway.position).toEqual(floor.position)
    expect(cutaway.target).toEqual(floor.target)
  })

  test('the page keeps the house while its plan is the same, and builds a new one when a floor joins it', () => {
    const level = levelOf('vllm')
    const one = sceneModelOf(floorView(laidTo(level, 3)))
    const two = sceneModelOf(floorView(laidTo(level, 4)), one)
    expect(two.house).toBe(one.house)
    expect(two.presets).toBe(one.presets)
    const first = sceneModelOf(floorView(walk(level)))
    expect(sceneModelOf(floorView(laidTo(level, 1)), first).house).not.toBe(first.house)
  })
})

describe('the 3D chunk', () => {
  test('the scene\'s own modules take only types from the page\'s, so the 3D chunk imports nothing the game\'s chunk holds', () => {
    for (const file of ['Scene3D.tsx', 'scene-route.ts', 'scene-props.ts']) {
      const source = readFileSync(path.join(root, 'src/games/engine-floor', file), 'utf8')
      const fromPage = [...source.matchAll(/^import (type )?[^\n]*from '\.\/(scene-layout|scene-presets|scene-stops|View2D|Controls|Mirror|Game)'/gm)]
      for (const match of fromPage) expect([file, match[0], match[1]]).toEqual([file, match[0], 'type '])
    }
  })

  test('the game loads its scene lazily, and the page computes the house the scene draws', () => {
    const game = readFileSync(path.join(root, 'src/games/engine-floor/Game.tsx'), 'utf8')
    expect(game).toContain("lazy(() => import('./Scene3D'))")
    expect(game).toContain('sceneModelOf(')
  })
})
