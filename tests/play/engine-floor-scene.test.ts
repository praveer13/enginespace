/*
 * Back of House's 3D scene (W1-T18, the finish review's rounds 1 and 2, and W1b's round 1; GAMES.md §5 "3D scene", §2.6 "Back of House"),
 * with no WebGL: the house the page lays out of the view (src/games/engine-floor/scene-layout.ts), the route the laid stages make through it and the run the
 * scene plays (scene-route.ts), the camera's stops (scene-stops.ts, scene-presets.ts), and the house's own props made the kit's way
 * (scene-props.ts).
 *
 *   - The 3D house is the 2D house's plan in steel: the same floors in the same order, a storey each from the top and the line at the foot,
 *     and a spot for every place a laid stage names. It stands in a kitchen: the line, under its canopy, is there before the prediction,
 *     because it says nothing of how many floors a token crosses; the floors are not, and a sealed graded run builds only the floors its
 *     route has reached, as the 2D house does.
 *   - Each storey is a room, furnished by its floor's kind so it reads at the cutaway's scale (a host stand of its own for each pair of hands
 *     at the host stand and the book on its lectern, the order desk's printer and its tape, the pass's warm plates along its shelf), and
 *     its hands work at that furniture's surface; a spike between two host stands stands on a pedestal of its own.
 *   - The ticket is paper: a slip with its thickness, cupped across and its foot rolled forward round a curl, so its back and its cut edge
 *     show where it turns, and it stands on that curl where it stands.
 *   - The route is a chain of hops, each from the last stand through the hand-off that crosses it: a window and the chute behind the
 *     partition for IPC and shared memory, the dumbwaiter's car for a copy, the line's rail for a launch, a spike for a queue and the gate for
 *     a sync. Every laid stage has its number on one chit, and each chit is pinned where its hand-off is.
 *   - One lamp: every pair of hands has a lamp on a channel of its own, its bulb's glow round its lip on the same, and the present lights
 *     its own and no other. Its light falls straight down onto the surface the hands work at, in front of their ticket, which hangs clear
 *     of that surface and keeps its paper white.
 *   - The names and the numbers keep to their own bands: a storey's tape on its deck's edge, a pair of hands' on the front of their
 *     furniture, and every chit at or over the surface a hand-off stands on. A pair of hands' tape shows on a phone where the camera is
 *     close on hands, and the line's strip of tape stays in the canopy lip's band, clear of its tubes.
 *   - The run plays the hops a run added, one stage to the bell, and a balk where it stopped; nothing else moves, and under reduced motion
 *     nothing at all. The follow is close on the hands the ticket is at, and a low house's cutaway is framed on its hands, so the ticket
 *     under the lit lamp is tens of pixels tall on a laptop and on a phone.
 *   - The scene's own modules take only types from the page's, so the 3D chunk imports nothing the game's chunk holds (verify:bundle finds a
 *     game by its chunk's source).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { MAP_LEVEL, trayFor } from '@es/play/engine-floor/levels'
import { floorView } from '@es/play/engine-floor/session'
import { referenceOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel } from '@es/play/engine-floor/types'
import { floorKindOfProcess, placeKey } from '@es/play/engine-floor/words'
import { describeScenario } from '@es/sim/lifecycle'
import type { Scenario } from '@es/sim/lifecycle'
import { staticSceneTokens } from '@/design/scene-tokens'
import { framingFor, nextPreset } from '@/scene/camera-rig'
import { buildProp } from '@/scene/props/build'
import { CHANNEL, paletteFrom } from '@/scene/props/palette'
import { roomShade } from '@/scene/props/set'
import type { PropSpec } from '@/scene/props/specs'
import { HOUSE, houseOf, presentOf, tapesOf, type House, type HouseItem, type HouseProp } from '@/games/engine-floor/scene-layout'
import { presetsOf, sceneModelOf } from '@/games/engine-floor/scene-presets'
import { customOf, OWN, ROLL, SLIP, ticketSheet } from '@/games/engine-floor/scene-props'
import { BALK, balkOf, handsInView, hopMs, playOf, presetFor, routeOf } from '@/games/engine-floor/scene-route'
import { floorsOf, nextStop, stopsOf } from '@/games/engine-floor/scene-stops'
import { ALL_SCENARIOS, laidTo, levelOf, ranTo, truthOf, walk } from './engine-floor-support'

const root = path.resolve(import.meta.dirname, '../..')
const palette = paletteFrom(staticSceneTokens())
const asSpec = (item: HouseItem): PropSpec => (OWN.has(item.kind) ? customOf(item as HouseProp) : (item as PropSpec))

/** A level on a scenario of the model: its own path, and a tray of every stage it has and four of other engines. */
function levelFor(sc: Scenario, id: FloorLevel['id'] = 'inside'): FloorLevel {
  return { id, seed: 0, title: describeScenario(sc), prompt: '', scenario: sc, reference: referenceOf(sc).map((stage) => stage.id), tray: trayFor(sc, 0, true).map((stage) => stage.id), attempts: null }
}

/** The view with the engine's whole path laid, written down first: the house as the learner sees it before the run. */
const laidView = (level: FloorLevel) => floorView(laidTo(level, level.reference.length))
const houseOfView = (view: ReturnType<typeof floorView>) => houseOf(floorsOf(view))
const kinds = (house: House) => house.items.map((item) => item.kind)

/** The ticket's sheet as the scene hangs it (scene-props.ts): its height from the middle of its top edge to the bottom of its rolled foot. */
const SHEET_BOX = new Box3().setFromBufferAttribute(ticketSheet().getAttribute('position') as never)
const SHEET_HEIGHT = -SHEET_BOX.min.y

/** What a prop's parts span in the world, on each axis. */
function boundsOf(item: HouseItem): Box3 {
  const bounds = new Box3()
  for (const part of buildProp(asSpec(item), palette).parts) bounds.union(new Box3().setFromBufferAttribute(part.geometry.getAttribute('position') as never))
  return bounds
}

describe('the house: the 2D house\'s plan, in steel, in a kitchen', () => {
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
    // Each storey's hands work at its furniture's surface, which is its window's sill and its landing; the line's is its counter.
    for (const storey of hosts) expect(storey.top).toBeCloseTo(storey.y + HOUSE.surface, 6)
    expect(line?.top).toBe(HOUSE.counter)
    // The walls: a partition with a window into each storey when there are two or more, else a post; the dumbwaiter's shaft down to the line.
    expect(house.windows !== null).toBe(hosts.length > 1)
    expect(kinds(house).includes('partition')).toBe(hosts.length > 1)
    expect(house.shaft.landings).toEqual(house.storeys.map((storey) => storey.top))
  })

  test('pairs of hands stand a lane apart on their storey (streams a station apart), inside the house\'s box, and each storey\'s stands under its own deck', () => {
    for (const sc of ALL_SCENARIOS) {
      const house = houseOfView(laidView(levelFor(sc)))
      const { min, max } = house.box
      for (const spot of house.spots.values()) {
        expect(spot.x).toBeGreaterThan(min[0])
        expect(spot.x).toBeLessThan(max[0])
        const pitch = spot.gpu ? 1 : HOUSE.lane
        expect(spot.x / pitch).toBeCloseTo(Math.round(spot.x / pitch), 6)
        const storey = house.storeys[spot.storey]
        const top = storey.line ? HOUSE.line : storey.y + HOUSE.pitch
        expect(spot.stand.at[1]).toBeGreaterThan(spot.y)
        expect(spot.stand.at[1]).toBeLessThan(top - HOUSE.deck)
      }
      const xs = new Set([...house.spots.values()].map((spot) => `${spot.storey}:${spot.x}`))
      expect(xs.size).toBe(house.spots.size)
    }
  })

  test('before the prediction the house is the floor the request begins on, over the line under its canopy: it must not answer how many floors there are', () => {
    for (const id of ['nano', 'mini', 'vllm', 'sglang'] as const) {
      const level = levelOf(id)
      const house = houseOfView(floorView(walk(level)))
      // One floor of the engine's, and the line: the kitchen the house stands in, which every engine has.
      expect(house.storeys.filter((storey) => !storey.line)).toHaveLength(1)
      expect(house.storeys.at(-1)?.line).toBe(true)
      expect(house.windows).toBeNull()
      expect(kinds(house)).toContain('post')
      expect(kinds(house)).not.toContain('partition')
      for (const kind of ['canopy', 'burners', 'griddle', 'fryer', 'speed-rack'] as const) expect(kinds(house)).toContain(kind)
      // No stream is named until a stage reaches the line: its stations are the kitchen's.
      expect([...house.spots.values()].some((spot) => spot.gpu)).toBe(false)
      // The camera's stops are the floor's and the line's.
      expect(stopsOf(floorsOf(floorView(walk(level)))).map((stop) => stop.id)).toEqual(['cutaway', 'floor:0', 'floor:1', 'follow'])
      // Written down, the house is built whole: every floor of the engine's path.
      const whole = houseOfView(floorView(walk(level, { t: 'commit', prediction: truthOf(level.scenario) })))
      expect(whole.storeys.map((storey) => storey.title)).toEqual(houseOfView(laidView(level)).storeys.map((storey) => storey.title))
    }
  })

  test('a sealed graded run builds only the floors its route has reached, as the 2D house does, and the whole house once it is judged', () => {
    const level = levelOf(MAP_LEVEL, 11)
    const committed = walk(level, { t: 'commit', prediction: 2 })
    expect(floorView(committed).sealed).toBe(true)
    expect(houseOfView(floorView(committed)).storeys.filter((storey) => !storey.line)).toHaveLength(1)
    const first = walk(level, { t: 'commit', prediction: 2 }, { t: 'lay', stage: level.reference[0] })
    const reached = houseOfView(floorView(first))
    expect(reached.storeys.length).toBeLessThan(houseOfView(laidView(levelFor(level.scenario))).storeys.length)
    const finish: FloorAction[] = [{ t: 'commit', prediction: 2 }, ...level.reference.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' }]
    const judged = floorView(walk(level, ...finish))
    expect(judged.sealed).toBe(false)
    expect(houseOfView(judged).storeys.map((storey) => storey.title)).toEqual(floorsOf(judged).map((floor) => floor.title))
  })

  test('each storey is a room furnished by its floor\'s kind: set tables in the dining room, the host stand, the order desk with its printer and its tape, the pass and its plates, the cooks\' bench and its pan', () => {
    const want = { dining: ['table'], host: ['stand', 'lectern'], desk: ['worktop', 'printer', 'tape'], pass: ['pass', 'plate-stack'], cooks: ['worktop', 'pan'], kitchen: ['pass', 'plate-stack', 'printer'] }
    const seen = new Set<string>()
    for (const sc of ALL_SCENARIOS) {
      const house = houseOfView(laidView(levelFor(sc)))
      house.storeys.forEach((storey, j) => {
        if (storey.line || storey.process === null) return
        const kind = floorKindOfProcess(storey.process) as keyof typeof want
        seen.add(kind)
        // A storey's furniture stands on its deck, and what stands on the furniture stands on its top; the line's own ids say which storey.
        const own = house.items.filter((item) => new RegExp(`^(?:counter|stand|lectern|table|plate|plates|printer|pan|tape)-${j}(?:-|$)`).test(item.id))
        for (const piece of want[kind]) expect(own.map((item) => item.kind), `${storey.title}`).toContain(piece)
        for (const item of own) expect([storey.y, storey.top, storey.top - 0.37].map((y) => Math.abs(y - item.at[1]) < 1e-6).some(Boolean), item.id).toBe(true)
        // The pass's plates read at the cutaway's scale: a stack every half metre along its heated shelf, from end to end.
        const stacks = own.filter((item) => item.kind === 'plate-stack').map((item) => item.at[0])
        if (kind === 'pass' || kind === 'kitchen') {
          const counter = own.find((item) => item.kind === 'pass')
          const width = counter && 'width' in counter ? counter.width : 0
          expect(stacks.length, storey.title).toBeGreaterThanOrEqual(Math.floor(width / 0.5) - 1)
          stacks.slice(1).forEach((x, k) => expect(x - stacks[k]).toBeCloseTo(0.5, 6))
        }
      })
    }
    expect([...seen].sort()).toEqual(Object.keys(want).sort())
  })

  test('each storey\'s place reads at the cutaway\'s scale: the host stand\'s book open on its lectern, and the order desk\'s tape hanging over its front edge', () => {
    const vllm = houseOfView(laidView(levelOf('vllm')))
    const lectern = vllm.items.find((item) => item.kind === 'lectern') as HouseItem
    // The host stands' top, which the lectern's desk stands over.
    const top = lectern.at[1] + ('height' in lectern ? lectern.height : 0)
    // White pages over the stands' top, tipped toward the room, on a desk of deep steel; the lectern's column is brushed steel.
    const parts = buildProp(asSpec(lectern), palette).parts
    // The lectern's steel is metal, and its only glazed parts (the palette's paper) are the book's pages.
    const pages = parts.filter((part) => part.surface === 'ceramic')
    expect(pages.length).toBeGreaterThanOrEqual(2)
    for (const page of pages) {
      const box = new Box3().setFromBufferAttribute(page.geometry.getAttribute('position') as never)
      expect(box.min.y).toBeGreaterThan(top)
      expect(box.max.y - box.min.y).toBeGreaterThan(0.1)
    }
    const mini = houseOfView(laidView(levelOf('mini')))
    for (const tape of mini.items.filter((item) => item.kind === 'tape')) {
      const box = boundsOf(tape)
      const printer = mini.items.find((item) => item.kind === 'printer' && item.id === tape.id.replace('tape', 'printer')) as HouseItem
      // From the printer's mouth over the desk, down over its front edge: a strip of paper longer than the printer is tall.
      expect(box.max.y).toBeGreaterThan(printer.at[1] + 0.1)
      expect(box.min.y).toBeLessThan(printer.at[1] - 0.2)
      expect(Math.abs(box.getCenter(new Vector3()).x - printer.at[0])).toBeLessThan(0.01)
    }
  })

  test('the host stand is a stand of its own under each pair of hands, not one box the floor\'s width: each on its own footprint, bevelled and panelled in two steels, clear of the next, with the book\'s lectern past the last (the finish review\'s W1b round 1)', () => {
    let floors = 0
    for (const sc of ALL_SCENARIOS) {
      const house = houseOfView(laidView(levelFor(sc)))
      house.storeys.forEach((storey, j) => {
        if (storey.process === null || floorKindOfProcess(storey.process) !== 'host') {
          expect(storey.stand).toBe(0)
          return
        }
        floors += 1
        expect(house.items.some((item) => item.id === `counter-${j}`)).toBe(false)
        const hands = [...house.spots.values()].filter((spot) => spot.storey === j)
        const stands = house.items.filter((item) => item.kind === 'stand' && item.id.startsWith(`stand-${j}-`))
        expect(stands).toHaveLength(hands.length)
        for (const spot of hands) {
          const stand = stands.find((item) => Math.abs(item.at[0] - spot.x) < 1e-6) as HouseItem
          expect(stand, spot.key).toBeDefined()
          // Its own footprint: under its hands, as wide as their gate and their spike either side need, and short of the next pair's.
          const box = boundsOf(stand)
          expect(box.max.x - box.min.x).toBeLessThanOrEqual(2 * storey.stand + 1e-6)
          expect(box.max.x - box.min.x).toBeLessThan(HOUSE.lane / 2)
          expect(box.max.y).toBeCloseTo(storey.top, 6)
          const built = buildProp(asSpec(stand), palette)
          expect(built.footprints).toHaveLength(1)
          expect(built.footprints[0].size[0]).toBeLessThan(HOUSE.lane / 2)
          // More than a box: a plinth, a bevelled cabinet, a panel in its bead, a top and its rolled edge, in bright and shaded steel.
          expect(built.parts.length).toBeGreaterThanOrEqual(8)
          expect(new Set(built.parts.map((part) => part.color.getHexString())).size).toBeGreaterThanOrEqual(2)
        }
        // The lectern stands past the last pair's stand, on the deck and clear of the dumbwaiter's shaft beside it.
        const lectern = boundsOf(house.items.find((item) => item.id === `lectern-${j}`) as HouseItem)
        expect(lectern.min.x).toBeGreaterThan(Math.max(...stands.map((item) => boundsOf(item).max.x)))
        expect(lectern.max.x).toBeLessThan(house.shaft.x - 0.17)
      })
    }
    expect(floors).toBeGreaterThan(0)
  })

  test('a host stand\'s leaned faces keep one grain: across the flat of each part\'s front every triangle runs its brush the same way, so no face splits along a diagonal', () => {
    const house = houseOfView(laidView(levelOf('vllm')))
    const stand = house.items.find((item) => item.kind === 'stand') as HouseItem
    let faces = 0
    for (const part of buildProp(asSpec(stand), palette).parts.filter((candidate) => candidate.surface === 'metal')) {
      const { geometry } = part
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      const uv = geometry.getAttribute('uv')
      const index = geometry.index
      // The gradient of u and v over x and y on each triangle of the flat front (its three normals straight out of it).
      const grains = new Set<string>()
      for (let t = 0; index !== null && t < index.count; t += 3) {
        const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
        if (![a, b, c].every((i) => normal.getZ(i) > 0.9999)) continue
        const [dx1, dy1, dx2, dy2] = [position.getX(b) - position.getX(a), position.getY(b) - position.getY(a), position.getX(c) - position.getX(a), position.getY(c) - position.getY(a)]
        const det = dx1 * dy2 - dx2 * dy1
        if (Math.abs(det) < 1e-9) continue
        const gradient = (get: (i: number) => number) => [((get(b) - get(a)) * dy2 - (get(c) - get(a)) * dy1) / det, ((get(c) - get(a)) * dx1 - (get(b) - get(a)) * dx2) / det]
        grains.add([...gradient((i) => uv.getX(i)), ...gradient((i) => uv.getY(i))].map((value) => Math.round(value * 1000) / 1000 || 0).join())
      }
      // A part with a flat front (the body, the panel, the top) has one grain over it; a rod has none.
      if (grains.size > 0) faces += 1
      expect(grains.size, `a ${part.color.getHexString()} part`).toBeLessThanOrEqual(1)
    }
    // The podium's body and its panel, which both lean, and the top, which does not.
    expect(faces).toBeGreaterThanOrEqual(3)
  })

  test('every prop builds the kit\'s way: real geometry in metres, and what stands on a floor, a deck or a counter casts a contact shadow', () => {
    // The largest house of the model, with every hand-off a stage can lay in it, a shelf, and a house of one storey's post.
    const sc = ALL_SCENARIOS.reduce((best, candidate) => (referenceOf(candidate).length > referenceOf(best).length ? candidate : best))
    const view = laidView(levelFor(sc))
    const house = houseOfView(view)
    const single = houseOfView(floorView(walk(levelOf('vllm'))))
    const items = [...house.items, ...routeOf(view, house).props, ...single.items.filter((item) => item.kind === 'post'), { kind: 'shelf', id: 'shelf', at: [0, 1, 0] } as HouseProp]
    expect(new Set(items.map((item) => item.kind))).toContain('table')
    for (const item of items) {
      const built = buildProp(asSpec(item), palette)
      expect(built.parts.length, item.id).toBeGreaterThan(0)
      for (const part of built.parts) {
        const position = part.geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) expect(Number.isFinite(position.getY(i))).toBe(true)
      }
      expect(boundsOf(item).getSize(new Vector3()).length(), item.id).toBeGreaterThan(0.02)
      // Nothing floats: the room bounds the house, decks hang on the walls, lamps, their glow, rails and the canopy hang from the decks and
      // the tile; all else stands.
      if (!['floor', 'tile-wall', 'canopy', 'heat-lamp', 'ring', 'rail', 'deck', 'shelf'].includes(item.kind)) expect(built.footprints.length, item.id).toBeGreaterThan(0)
    }
  })

  test('the line stands under its canopy: the canopy spans its stations under the first deck, open beneath, its white tubes lit on the tubes\' own channel', () => {
    const house = houseOfView(laidView(levelOf('vllm')))
    const canopy = house.items.find((item) => item.kind === 'canopy')
    expect(canopy).toBeDefined()
    const hood = boundsOf(canopy as HouseItem)
    const stations = house.items.filter((item) => ['burners', 'griddle', 'fryer'].includes(item.kind)).map(boundsOf)
    expect(stations.length).toBeGreaterThanOrEqual(3)
    for (const station of stations) {
      expect(hood.min.x).toBeLessThanOrEqual(station.min.x + 1e-6)
      expect(hood.max.x).toBeGreaterThanOrEqual(station.max.x - 1e-6)
      // Above the burners, with room to cook, and under the deck over the line.
      expect(hood.min.y).toBeGreaterThan(station.max.y + 0.3)
    }
    expect(hood.max.y).toBeLessThanOrEqual(HOUSE.line - HOUSE.deck + 1e-6)
    const parts = buildProp(asSpec(canopy as HouseItem), palette).parts
    expect(parts.some((part) => part.surface === 'glow' && part.finish[0] === CHANNEL.tube)).toBe(true)
  })

  test('one lamp: every pair of hands has a lamp and its bulb\'s glow on its own channel, every stream a station on its own, and the present lights only its own', () => {
    for (const sc of ALL_SCENARIOS) {
      const level = levelFor(sc)
      const view = laidView(level)
      const house = houseOfView(view)
      const channels = [...house.spots.values()].map((spot) => spot.channel)
      expect(new Set(channels).size).toBe(channels.length)
      expect(Math.max(...channels)).toBeLessThan(CHANNEL.lamp)
      const hands = [...house.spots.values()].filter((spot) => !spot.gpu).map((spot) => spot.channel).sort((a, b) => a - b)
      for (const kind of ['heat-lamp', 'ring'] as const) {
        const lamps = house.items.filter((item) => item.kind === kind)
        expect(lamps.map((lamp) => ('channel' in lamp ? (lamp.channel ?? -1) : -1)).sort((a, b) => a - b)).toEqual(hands)
      }
      // A station's channel is its place on the line, and no pair of hands shares one with a station.
      const stations = house.items.flatMap((item) => (['burners', 'griddle', 'fryer'].includes(item.kind) && 'channel' in item ? [item.channel] : []))
      for (const channel of hands) expect(stations).not.toContain(channel)
      const present = presentOf(view, house)
      expect(present?.key).toBe(placeKey(view.present))
      expect(present?.lamp === null).toBe(present?.gpu)
    }
    // A lamp's glow is lit by its channel and is cold steel otherwise: one glowing part, on the lamp's channel.
    const ring = houseOfView(laidView(levelOf('vllm'))).items.find((item) => item.kind === 'ring') as HouseItem
    const parts = buildProp(asSpec(ring), palette).parts
    expect(parts.map((part) => [part.surface, part.finish[0]])).toEqual([['glow', 'channel' in ring ? ring.channel : -1]])
    // Once the ticket is home, nothing is the present, and no lamp is lit.
    const done = floorView(ranTo(levelOf('nano'), levelOf('nano').reference.length))
    expect(done.done).toBe(true)
    expect(presentOf(done, houseOfView(done))).toBeNull()
  })

  test('the room falls away from the house: its light is full over the line and dims toward its far corners and up the tile over the hood', () => {
    const house = houseOfView(laidView(levelOf('mini')))
    const { room, box } = house
    const middle = (box.min[0] + box.max[0]) / 2
    expect(roomShade(room, middle, 1, HOUSE.back)).toBe(1)
    expect(roomShade(room, middle - 8, 0.5, HOUSE.back)).toBeLessThan(0.5)
    expect(roomShade(room, middle, box.max[1], HOUSE.back)).toBeLessThan(0.6)
    // Before the prediction, behind the floor the request begins on, the tile over the hood is darker than the tile behind the line, so the
    // lit lamp and its white ticket stand out against it, and its top corners darker still.
    const first = houseOfView(floorView(walk(levelOf('nano'))))
    const spot = [...first.spots.values()][0]
    const ticket = roomShade(first.room, spot.x, spot.y + 0.13, HOUSE.back)
    expect(roomShade(first.room, first.room.x, 1.2, HOUSE.back)).toBe(1)
    expect(ticket).toBeLessThan(0.75 * roomShade(first.room, spot.x, 1.2, HOUSE.back))
    expect(roomShade(first.room, first.box.max[0], first.box.max[1], HOUSE.back)).toBeLessThan(ticket)
    // The floor and the wall reach past any framing: the room never ends in the void beside the house.
    const wall = house.items.find((item) => item.kind === 'tile-wall')
    expect(wall && 'width' in wall ? wall.width : 0).toBeGreaterThanOrEqual(20)
  })

  test('the one lamp\'s light falls straight down onto the surface its hands work at, in front of their ticket, which hangs clear of that surface', () => {
    for (const sc of ALL_SCENARIOS) {
      const house = houseOfView(laidView(levelFor(sc)))
      for (const spot of house.spots.values()) {
        if (spot.gpu || spot.lamp === null) continue
        const { at, target } = spot.lamp
        expect([target[0], target[2]]).toEqual([at[0], at[2]])
        expect(target[1]).toBe(spot.y)
        // The ticket hangs on the tile behind the light, its rolled foot (scene-props.ts's sheet) behind the light's middle and clear of the
        // surface under it.
        expect(spot.stand.at[2]).toBeLessThan(at[2] - 0.1)
        expect(spot.stand.at[2] + SHEET_BOX.max.z).toBeLessThan(at[2])
        expect(spot.stand.at[1] - SHEET_HEIGHT).toBeGreaterThan(spot.y)
        expect(spot.stand.at[1]).toBeLessThan(at[1])
      }
    }
  })

  test('the names and the numbers keep to their own bands: a pair of hands\' tape on the front of their furniture, under its top and over the deck, and every chit at or over the surface its hand-off stands on', () => {
    for (const sc of ALL_SCENARIOS) {
      const view = laidView(levelFor(sc))
      const house = houseOfView(view)
      const tapes = tapesOf(house)
      for (const spot of house.spots.values()) {
        const tape = tapes.find((candidate) => candidate.id === `hands-${spot.key}`)
        const storey = house.storeys[spot.storey]
        expect(tape?.at[1]).toBeLessThan(spot.y)
        expect(tape?.at[1]).toBeGreaterThan(storey.line ? 0 : storey.y)
      }
      const tops = house.storeys.map((storey) => storey.top)
      for (const chit of routeOf(view, house).chits) {
        expect(tops.some((top) => chit.at[1] >= top && chit.at[1] < top + 0.25), chit.id).toBe(true)
        // A chit on a spike or the gate sits over its pin, a chit of hands at work beside their ticket, and the rest on their sill, landing or counter.
        if (/^(?:spike|gate)-/.test(chit.id)) expect(chit.place).toBe('above')
      }
    }
  })

  test('its tapes name every storey in the kitchen\'s words with the engine\'s, and every pair of hands by its thread with the lane\'s code', () => {
    const view = laidView(levelOf('vllm'))
    const house = houseOfView(view)
    const tapes = tapesOf(house)
    expect(tapes.filter((tape) => tape.id.startsWith('storey-')).map((tape) => tape.text)).toEqual(['THE DINING ROOM · CLIENT', 'THE HOST STAND · API-SERVER', 'THE PASS · ENGINE-CORE', 'THE LINE'])
    // The line's name is masking tape stuck on the canopy's lip, as Service's is on its tile; the floors' tapes and the hands' are DOM tape.
    const line = tapes.find((tape) => tape.text === 'THE LINE')
    expect(line?.strip?.center).toEqual(line?.at)
    expect(tapes.filter((tape) => tape.strip)).toHaveLength(1)
    // Cut to its words, the strip is at most what the lip's band leaves it over the white tubes lit along the lip's foot, clear of their
    // light (the finish review's W1b round 1 found the tape's backing over it), and no longer than the lip runs from its centre.
    const canopy = house.items.find((item) => item.kind === 'canopy') as HouseItem
    const tubes = new Box3()
    for (const part of buildProp(asSpec(canopy), palette).parts) if (part.surface === 'glow') tubes.union(new Box3().setFromBufferAttribute(part.geometry.getAttribute('position') as never))
    const strip = line?.strip
    expect((strip?.center[1] ?? 0) - (strip?.size[1] ?? 1) / 2).toBeGreaterThan(tubes.max.y + 0.01)
    expect((strip?.center[0] ?? 0) - (strip?.size[0] ?? 9) / 2).toBeGreaterThanOrEqual(boundsOf(canopy).min.x)
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
    expect(route.spots).toHaveLength(view.laid.length + 1)
    route.hops.forEach((hop, i) => {
      const stage = view.laid[i]
      expect(hop.poses[0]).toBe(route.stands[i])
      expect(hop.poses.at(-1)).toBe(route.stands[i + 1])
      expect(hop.spot).toBe(placeKey(stage.to))
      expect(route.spots[i + 1]).toBe(hop.spot)
      expect(hop.length).toBeGreaterThanOrEqual(0)
      const xs = hop.poses.map((pose) => pose.at[0])
      if (stage.mechanism === 'ipc' || stage.mechanism === 'shm') expect(Math.min(...xs)).toBeLessThan(house.windows ?? Number.NaN)
      if (stage.mechanism === 'h2d' || stage.mechanism === 'd2h') {
        expect(hop.car).toHaveLength(hop.poses.length)
        expect(xs.filter((x) => x === house.shaft.x)).toHaveLength(2)
      } else expect(hop.car).toBeNull()
      expect(hop.cook).toBe(stage.mechanism === 'launch' ? house.spots.get(placeKey(stage.to))?.channel : null)
      if (stage.mechanism === 'queue') expect(route.props.some((prop) => prop.kind === 'spike' && Math.abs(prop.at[0] - hop.poses.at(-1)!.at[0]) < 0.07)).toBe(true)
      if (stage.mechanism === 'sync') expect(route.props.some((prop) => prop.kind === 'gate')).toBe(true)
    })
    // Every stage's number on exactly one chit, in order there; each laid prop once.
    expect(route.chits.flatMap((chit) => chit.stages.map((s) => s.n)).sort((a, b) => a - b)).toEqual(view.laid.map((stage) => stage.index + 1))
    expect(new Set(route.props.map((prop) => prop.id)).size).toBe(route.props.length)
  })

  test('spikes and gates stand on the surface the hands work at, on its furniture, never on the bare deck or in the air', () => {
    for (const sc of ALL_SCENARIOS) {
      const view = laidView(levelFor(sc))
      const house = houseOfView(view)
      const route = routeOf(view, house)
      // A table, a stand, a desk, a pass or a pedestal between two stands: its top is `height` over its base on the deck, and its parts
      // span where things stand on it.
      const furniture = [...house.items, ...route.props].flatMap((item) => (['table', 'stand', 'worktop', 'pass', 'pedestal'].includes(item.kind) && 'height' in item ? [{ top: item.at[1] + item.height, box: boundsOf(item) }] : []))
      for (const prop of route.props) {
        if (prop.kind !== 'spike' && prop.kind !== 'gate') continue
        const [x, y, z] = prop.at
        const under = furniture.filter(({ top, box }) => Math.abs(top - y) < 1e-6 && box.min.x <= x && x <= box.max.x && box.min.z <= z && z <= box.max.z)
        expect(under.length, `${describeScenario(sc)}: ${prop.id}`).toBeGreaterThan(0)
      }
    }
  })

  test('each chit is pinned where its hand-off is: on the spike, over the gate, on the sill of a window, on a landing of the shaft', () => {
    for (const sc of ALL_SCENARIOS) {
      const view = laidView(levelFor(sc))
      const house = houseOfView(view)
      const route = routeOf(view, house)
      const tops = house.storeys.map((storey) => storey.top)
      for (const chit of route.chits) {
        const [x, y] = chit.at
        if (chit.id.startsWith('spike-') || chit.id.startsWith('gate-')) {
          const prop = route.props.find((candidate) => candidate.id === chit.id)
          expect(prop?.at[0]).toBe(x)
          expect(y - (prop?.at[1] ?? 0)).toBeGreaterThan(0.1)
          expect(y - (prop?.at[1] ?? 0)).toBeLessThan(0.25)
        } else if (/^(?:ipc|shm)-/.test(chit.id)) {
          // On a sill in the house, right of the partition, never outside it.
          expect(x).toBeGreaterThan(house.windows ?? Number.NaN)
          expect(tops.some((top) => Math.abs(y - top) < 0.03)).toBe(true)
        } else if (chit.id.startsWith('copy-')) {
          expect(x).toBe(house.shaft.x)
          expect(house.shaft.landings.some((landing) => Math.abs(y - landing) < 0.03)).toBe(true)
        }
        expect(chit.place).not.toBe('left')
      }
    }
  })

  test('the dumbwaiter\'s car goes where the ticket leaves it, and waits at the line\'s counter before any copy', () => {
    const view = laidView(levelOf('vllm'))
    const house = houseOfView(view)
    const route = routeOf(view, house)
    expect(route.cars[0]).toBe(HOUSE.counter)
    const down = route.hops.find((_hop, i) => view.laid[i].mechanism === 'h2d')
    const up = route.hops.find((_hop, i) => view.laid[i].mechanism === 'd2h')
    expect(down?.car?.at(-1)).toBe(HOUSE.counter)
    expect(up?.car?.[1]).toBe(HOUSE.counter)
    expect(up?.car?.at(-1)).toBe(house.storeys[house.spots.get(up?.spot ?? '')?.storey ?? 0].top)
  })

  test('a spike laid between two host stands stands on a pedestal of its own, its top at theirs, clear of every stand, and nowhere else', () => {
    let pedestals = 0
    for (const sc of ALL_SCENARIOS) {
      const view = laidView(levelFor(sc))
      const house = houseOfView(view)
      const { props } = routeOf(view, house)
      const stands = house.items.filter((item) => item.kind === 'stand').map(boundsOf)
      for (const spike of props.filter((prop) => prop.kind === 'spike')) {
        const pedestal = props.find((prop) => prop.kind === 'pedestal' && prop.at[0] === spike.at[0] && prop.at[2] === spike.at[2] && prop.at[1] < spike.at[1])
        const onStand = stands.some((box) => Math.abs(box.max.y - spike.at[1]) < 1e-6 && box.min.x <= spike.at[0] && spike.at[0] <= box.max.x)
        // A pedestal exactly where a spike would stand in the air between two stands, and none under a spike that a stand or a counter holds.
        expect(pedestal !== undefined, `${describeScenario(sc)}: ${spike.id}`).toBe(house.storeys.some((storey) => storey.stand > 0 && Math.abs(storey.top - spike.at[1]) < 1e-6) && !onStand)
        if (!pedestal) continue
        pedestals += 1
        expect(pedestal.at[1] + ('height' in pedestal ? pedestal.height : 0)).toBeCloseTo(spike.at[1], 6)
        for (const box of stands) expect(box.intersectsBox(boundsOf(pedestal)), pedestal.id).toBe(false)
      }
      expect(props.filter((prop) => prop.kind === 'pedestal').length).toBeLessThanOrEqual(props.filter((prop) => prop.kind === 'spike').length)
    }
    // Mini-SGLang's, vLLM's and SGLang's host stands each pass the ticket from one pair of hands to the next on a spike between them.
    expect(pedestals).toBeGreaterThan(0)
  })

  test('a ticket standing on a sill, at the gate or in the dumbwaiter\'s car stands on its rolled foot: its top edge its rolled height over the surface', () => {
    const height = -new Box3().setFromBufferAttribute(ticketSheet().getAttribute('position') as never).min.y
    for (const sc of ALL_SCENARIOS) {
      const view = laidView(levelFor(sc))
      const house = houseOfView(view)
      routeOf(view, house).hops.forEach((hop, i) => {
        const stage = view.laid[i]
        if (stage.mechanism !== 'ipc' && stage.mechanism !== 'shm') return
        // Onto the sill of its storey's window: the sill is the storey's work surface.
        const top = house.storeys[house.spots.get(placeKey(stage.from))?.storey ?? -1].top
        const gap = hop.poses[1].at[1] - height - top
        expect(gap, describeScenario(sc)).toBeGreaterThanOrEqual(0)
        expect(gap, describeScenario(sc)).toBeLessThan(0.01)
      })
    }
  })
})

describe('the ticket: paper with its thickness, its curl and its print (the finish review\'s W1b round 1)', () => {
  const sheet = ticketSheet()
  const position = sheet.getAttribute('position')
  const normal = sheet.getAttribute('normal')
  const uv = sheet.getAttribute('uv')
  const box = new Box3().setFromBufferAttribute(position as never)

  test('it is the slip it was, a hand wide, hung from the middle of its top edge, its print on its face and its back and edges in the paper\'s shade', () => {
    expect(box.max.x - box.min.x).toBeCloseTo(SLIP.width, 6)
    expect(box.max.y).toBeCloseTo(0, 6)
    // The face takes its cell of the print atlas whole; the back and the cut edges sample one point of a cell's shaded corner.
    let face = 0
    let shade = 0
    for (let i = 0; i < uv.count; i++) {
      const [u, v] = [uv.getX(i), uv.getY(i)]
      if (u < 0.02 && v < 0.02 && u > 0 && v > 0) shade += 1
      else face += 1
    }
    expect(face).toBeGreaterThan(0)
    expect(shade).toBeGreaterThan(0)
  })

  test('its foot rolls forward past the horizontal and back up toward its face, the curl as deep as the roll\'s radius and its thickness, its back turned up to the room where it turns', () => {
    // The curl's bottom is the lowest of the sheet, the roll's radius and the paper's thickness under where it starts.
    expect(-box.min.y).toBeCloseTo(ROLL.from + ROLL.radius + SLIP.thickness, 3)
    // Past the horizontal: some of the sheet stands in front of the curl's axis, its foot turning back up toward its face.
    expect(box.max.z).toBeGreaterThan(ROLL.radius + 0.01)
    // Where it turns back up, the paper's back faces up and out to the room, so a camera over the counter sees the back and its cut edge.
    let backUp = 0
    for (let i = 0; i < position.count; i++) {
      if (position.getZ(i) > ROLL.radius && uv.getX(i) < 0.02 && normal.getY(i) > 0.3 && normal.getZ(i) > 0) backUp += 1
    }
    expect(backUp).toBeGreaterThan(0)
  })

  test('its paper has a thickness: over the flat of the sheet its back is the thickness behind its face', () => {
    // Down the sheet's middle, above the roll: a vertex of the face at z 0 and one of the back the thickness behind it, at each row.
    const middle = new Map<string, number[]>()
    for (let i = 0; i < position.count; i++) {
      const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)]
      if (Math.abs(x) > 1e-6 || -y > ROLL.from - 0.01) continue
      const row = y.toFixed(4)
      middle.set(row, [...(middle.get(row) ?? []), z])
    }
    expect(middle.size).toBeGreaterThan(3)
    for (const zs of middle.values()) {
      if (zs.length < 2) continue
      expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(SLIP.thickness, 6)
    }
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
    expect(balk?.spot).toBe('')
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
    const spot = [...house.spots.keys()][2]
    for (const stop of stops) expect(presets.map((preset) => preset.id)).toContain(presetFor({ presets }, stop.id, spot))
    expect(presetFor({ presets }, 'follow', spot)).toBe(`follow:${spot}`)
    // A balk names no hands: a follow that cannot find its hands falls back to the cutaway, and so does a floor the house no longer has.
    expect(presetFor({ presets }, 'follow', '')).toBe('cutaway')
    expect(presetFor({ presets }, 'floor:40', spot)).toBe('cutaway')
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

  test('the ticket under the lit lamp is the first thing found: a low house\'s cutaway and the follow show it tens of pixels tall and whole, on a laptop and on a phone', () => {
    // The stage's canvas: about 872 by 630 px at 1440 px, and 358 by 489 px on a phone of 390 by 844 (Game.tsx's STAGE_BOX) [derived].
    const boxes = [[1440, 872, 630], [390, 358, 489]] as const
    for (const id of ['nano', 'vllm'] as const) {
      const view = floorView(walk(levelOf(id)))
      const house = houseOfView(view)
      const spot = presentOf(view, house) as NonNullable<ReturnType<typeof presentOf>>
      for (const stop of ['cutaway', `follow:${spot.key}`]) {
        const preset = presetsOf(house).find((candidate) => candidate.id === stop) as never
        for (const [width, w, h] of boxes) {
          const framing = framingFor(preset, width)
          const camera = new PerspectiveCamera(framing.fov, w / h, 0.05, 200)
          camera.position.set(...(framing.position as [number, number, number]))
          camera.lookAt(...(framing.target as [number, number, number]))
          camera.updateMatrixWorld()
          const px = (x: number, y: number, z: number) => {
            const v = new Vector3(x, y, z).project(camera)
            return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
          }
          // The sheet as it hangs, rolled at its foot (scene-props.ts).
          const [, head] = px(spot.x, spot.stand.at[1], spot.stand.at[2])
          const [left, foot] = px(spot.x - SLIP.width / 2, spot.stand.at[1] - SHEET_HEIGHT, spot.stand.at[2])
          expect(foot - head, `${id} ${stop} at ${width}`).toBeGreaterThan(40)
          for (const [x, y] of [px(spot.x, spot.lamp?.at[1] ?? 0, spot.lamp?.at[2] ?? 0), [left, foot]]) {
            expect(x).toBeGreaterThan(0)
            expect(x).toBeLessThan(w)
            expect(y).toBeGreaterThan(0)
            expect(y).toBeLessThan(h)
          }
        }
      }
    }
  })

  test('the follow is close on the hands the ticket is at, with its lamp in frame: far closer than the cutaway, at the hands\' own place', () => {
    const house = houseOfView(laidView(levelOf('mini')))
    const presets = presetsOf(house)
    const cutaway = presets.find((preset) => preset.id === 'cutaway')
    for (const spot of house.spots.values()) {
      const follow = presets.find((preset) => preset.id === `follow:${spot.key}`)
      expect(follow).toBeDefined()
      for (const width of [1440, 390]) {
        const framing = framingFor(follow as never, width)
        const wide = framingFor(cutaway as never, width)
        expect(framing.target[0]).toBe(spot.x)
        expect(framing.target[1]).toBeGreaterThan(spot.y)
        const distance = (f: typeof framing) => Math.hypot(...f.position.map((v, k) => v - f.target[k]))
        expect(distance(framing)).toBeLessThan(distance(wide) / 2)
      }
    }
  })

  test('a pair of hands\' tape shows on a phone where the camera is close on those hands: in the follow the followed hands\', and in a low house\'s cutaway, framed on its hands, theirs; elsewhere it waits for the room three need (the finish review\'s W1b round 1)', () => {
    const first = houseOfView(floorView(walk(levelOf('nano'))))
    const nano = houseOfView(laidView(levelOf('nano')))
    const tall = houseOfView(laidView(levelOf('vllm')))
    // A low house is the one its cutaway frames on its hands, as the ticket's test above measures; a tall one's cutaway is the whole house.
    expect([first.low, nano.low, tall.low]).toEqual([true, true, false])
    for (const house of [first, nano, tall]) {
      const hands = tapesOf(house).filter((tape) => tape.hands)
      // Where the camera is not close on hands, every pair's tape waits for a canvas of 460 px.
      for (const tape of hands) expect(tape.minWidth).toBe(460)
      for (const spot of house.spots.values()) {
        for (const tape of hands) {
          expect(handsInView(house, 'follow', spot.key, tape.id)).toBe(tape.id === `hands-${spot.key}`)
          expect(handsInView(house, 'cutaway', spot.key, tape.id)).toBe(house.low)
          house.storeys.forEach((_, i) => expect(handsInView(house, `floor:${i}`, spot.key, tape.id)).toBe(false))
        }
      }
    }
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

describe('the 3D chunk and the page', () => {
  test('the scene\'s own modules take only types from the page\'s, so the 3D chunk imports nothing the game\'s chunk holds', () => {
    for (const file of ['Scene3D.tsx', 'scene-route.ts', 'scene-props.ts']) {
      const source = readFileSync(path.join(root, 'src/games/engine-floor', file), 'utf8')
      const fromPage = [...source.matchAll(/^import (type )?[^\n]*from '\.\/(scene-layout|scene-presets|scene-stops|View2D|Controls|Mirror|Game)'/gm)]
      for (const match of fromPage) expect([file, match[0], match[1]]).toEqual([file, match[0], 'type '])
    }
  })

  test('the game loads its scene lazily, the page computes the house the scene draws, keeps the scene in sight, and a run from the cutaway follows the ticket', () => {
    const game = readFileSync(path.join(root, 'src/games/engine-floor/Game.tsx'), 'utf8')
    expect(game).toContain("lazy(() => import('./Scene3D'))")
    expect(game).toContain('sceneModelOf(')
    expect(game).toContain('stage="sticky"')
    expect(game).toMatch(/runs > ran\.current && stop === 'cutaway'\) onStop\('follow'\)/)
  })
})
