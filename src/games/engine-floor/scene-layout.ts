/*
 * Back of House's house in 3D (GAMES.md §5 "3D scene", §2.6 "Back of House"; scene kit v1): the session's view turned into what the scene
 * draws. A pure function of `FloorView` and the house's floors, which the page reads from the view with the same `mapOfView` and
 * `housePlan` the 2D view draws from (scene-stops.ts), so the 3D house has the 2D house's floors and lanes in the 2D house's order, keeps
 * the graded `map`'s path to itself the same way (a sealed view builds only the floors the route has reached), and decides nothing. No three
 * here: it is tested under Bun. The page lays the house out (scene-presets.ts's `sceneModelOf`) and the scene draws it; the route through
 * it, which moves with every stage laid, is scene-route.ts, in the 3D chunk.
 *
 * The house, in metres with y up and +z toward the viewer, every length [estimated] on the kit's own proportions:
 *   - The kitchen it stands in, whatever the prediction: the line at its foot (the GPU, which says nothing of how many floors a token
 *     crosses), the kit's burners, griddle and fryer under a canopy with its baffles and its white tubes, a speed rack and a bench of pans
 *     beside it, on the quarry floor against the subway tile. The room's light is baked into the tile and the floor, full over the line
 *     and dimming toward the far corners and up over the hood, and past the house the room falls into a haze of deep steel.
 *   - A storey for each process over the line, a room on a brushed-stainless deck with a rolled front edge, furnished by its floor's
 *     kind: the dining room's tables under their cloths with their chairs, the host stand's closed counter with the book on it, the order
 *     desk with its printer, the pass with its warm plates, the cooks' bench with its pans, and the whole kitchen's pass and printer. Its
 *     hands work at that surface: a pair of hands is a short ticket rail on the tile over it, with a heat lamp hung from the deck above.
 *   - The house's two walls: at its left a steel partition, with a ticket window into every storey where there are two or more (IPC and
 *     shared memory cross between floors through the chute hidden behind it), and at its right the dumbwaiter's open shaft, a landing at
 *     every storey's work surface and one at the line's counter, whose car the copies ride. They are the house's furniture, and say
 *     nothing of the path.
 *   - What a stage lays: a spike for a queue, the "Heard!" gate for a sync, a shelf under a window for shared memory, on the surface the
 *     hands work at. Each laid hand-off carries a chit with its stage numbers, DOM over the canvas.
 *   - The one lamp: of all the lamps, only the one over the present is lit, its bulb's glow round its shade's lip; when the present is
 *     on the line, its station burns instead.
 */
import type { Floor } from '@es/play/engine-floor/layout'
import type { FloorView } from '@es/play/engine-floor/types'
import { FLOOR_NAMES, placeKey, type FloorKind } from '@es/play/engine-floor/words'
import type { RoomLight } from '@/scene/props/set'
import type { CustomSpec, PropSpec, Vec3 } from '@/scene/props/specs'

/** The house's measures, in metres [estimated]: a storey a low room, the line a real one. */
export const HOUSE = {
  /** Across, from one pair of hands to the next. */
  lane: 1,
  /** A storey, deck top to deck top, and its deck's thickness. */
  pitch: 1.3,
  deck: 0.05,
  /** The tile wall, and the decks' rolled front edge. */
  back: -0.46,
  front: 0.3,
  /** The line's storey: the kitchen's floor to the first deck's top, tall enough for the hood. */
  line: 2,
  /** A storey's work surface over its deck: the table, the counter or the desk its hands work at, and its window's sill. */
  surface: 0.56,
  /** A pair of hands' rail: its top over their work surface, on the tile. */
  rail: 0.18,
  /** The partition stands this far left of the first lane, and the shaft this far right of the last. */
  partition: 0.66,
  shaft: 0.72,
  /** A window in the partition, its sill at the work surface: its height, and its opening across the deck's depth. */
  window: { height: 0.34, from: -0.38, to: 0.04 },
  /** The line's stations: their depth and the counter's height, the kit's. */
  station: 0.72,
  counter: 0.9,
} as const

/** The kit's rail: a ticket hangs from the ball under its slot this far below its top (scene kit v1's CLIP_DROP). */
const CLIP = 0.0385
/**
 * A pair of hands' heat lamp: its shade's lip this far over their work surface and this far out from the tile, and its light falling
 * nearer the tile, where the ticket hangs, so the lamp lights the ticket and the steel at its foot.
 */
const LAMP = { lip: 0.44, z: -0.3, target: -0.4 }
/** The canopy over the line: its top under the first deck, how far it reaches out from the tile, and how far down to its lip. */
const HOOD = { depth: 0.8, height: 0.42 }
const STATIONS = ['burners', 'griddle', 'fryer'] as const
/** The line's ticket rail, on the tile over the stations' splash, under the hood: a ticket hangs there while the line cooks it. */
const LINE_RAIL = HOUSE.counter + 0.3
/** A storey's counters, desks and tables reach this far out from the tile. */
const COUNTER = 0.42
/** The pass's heated shelf, where its warm plates stand, is this far under its counter (the kit's SHELF_DROP). */
const SHELF = 0.37

/** A game prop of the house, as data: the scene builds each the kit's way (scene-props.ts). `at` is its base's centre, as a kit prop's. */
export type HouseProp =
  | { readonly kind: 'deck'; readonly id: string; readonly at: Vec3; readonly width: number; readonly depth: number; readonly thick: number }
  /**
   * The partition: a steel wall `depth` deep from the floor to `height`, its face toward the house, with a window whose sill is at each
   * height in `sills`: `window` = [its height, and its opening's ends across the depth].
   */
  | {
      readonly kind: 'partition'
      readonly id: string
      readonly at: Vec3
      readonly height: number
      readonly depth: number
      readonly sills: readonly number[]
      readonly window: readonly [number, number, number]
    }
  | { readonly kind: 'shaft'; readonly id: string; readonly at: Vec3; readonly height: number; readonly landings: readonly number[] }
  /** A post at the deck's front corner, where a house of one storey has no partition. */
  | { readonly kind: 'post'; readonly id: string; readonly at: Vec3; readonly height: number }
  /** The line's canopy, the back edge of its top at `at`, on the tile under the deck. */
  | { readonly kind: 'canopy'; readonly id: string; readonly at: Vec3; readonly width: number; readonly depth: number; readonly height: number }
  /** The dining room's table and the host stand's counter, their tops `height` over `at`. */
  | { readonly kind: 'table'; readonly id: string; readonly at: Vec3; readonly height: number }
  | { readonly kind: 'stand'; readonly id: string; readonly at: Vec3; readonly width: number; readonly depth: number; readonly height: number }
  /** A heat lamp's bulb, glowing round its shade's lip at `at`, on the lamp's channel. */
  | { readonly kind: 'ring'; readonly id: string; readonly at: Vec3; readonly channel: number }
  | { readonly kind: 'gate' | 'shelf'; readonly id: string; readonly at: Vec3 }

/** What the static sets list: the kit's props, and the house's own. */
export type HouseItem = Exclude<PropSpec, CustomSpec> | HouseProp

export interface Storey {
  /** The process, or null for the line. The storey's tape is its title, the kitchen's name with the engine's beside it. */
  readonly process: string | null
  readonly title: string
  /** The deck's top, or the kitchen's floor for the line. */
  readonly y: number
  /** The surface its hands work at (its tables, counter or desk, or the line's counter): its window's sill and its landing. */
  readonly top: number
  readonly line: boolean
}

/** A pair of hands, or a stream of the line: where its place is in the house. */
export interface Spot {
  readonly key: string
  readonly thread: string
  readonly storey: number
  readonly x: number
  /** The surface it works on: its storey's top, or the counter on the line. */
  readonly y: number
  readonly gpu: boolean
  /** The glow its present lights: its lamp's bulb, or its station's heat. */
  readonly channel: number
  /** Where the ticket rests at this spot. */
  readonly stand: Pose
  /** A thread's lamp: where its light leaves the shade and where it falls. Null on the line. */
  readonly lamp: { readonly at: Vec3; readonly target: Vec3 } | null
}

/** A ticket's pose: the middle of its top edge, and its turn (radians about x, y and z), as the kit's tickets are held. */
export interface Pose {
  readonly at: Vec3
  readonly rot: Vec3
}

export interface House {
  /** Changes whenever the static house does: the scene rebuilds its set on it. */
  readonly key: string
  readonly storeys: readonly Storey[]
  readonly spots: ReadonlyMap<string, Spot>
  readonly items: readonly HouseItem[]
  readonly room: RoomLight
  /** The partition's windows, at its x, or null for a house of one storey, whose partition has none. */
  readonly windows: number | null
  /** The dumbwaiter's shaft, at its x, with a landing at each storey's top (the line's is its counter). */
  readonly shaft: { readonly x: number; readonly landings: readonly number[] }
  /** Everything a camera frames: the house's box. */
  readonly box: { readonly min: Vec3; readonly max: Vec3 }
  /** Where the dumbwaiter's car waits before any copy: the line's counter. */
  readonly carRest: number
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000
const v3 = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)]
/** A small, fixed lean for a ticket, from a number, so a rail never looks stamped out. */
const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/**
 * What a storey's hands work at, by its floor's kind (GAMES.md §2.6), and what stands on it, against the tile: a counter over its lanes
 * (`span` across them) that reaches a little past the first on the left and further past the last on the right, where its own things
 * stand clear of the spikes and gates a stage lays beside a ticket. The dining room has a table for each pair of hands (each set with
 * its plate, scene-props.ts), and one more.
 */
function furnish(kind: FloorKind, j: number, y: number, span: number): HouseItem[] {
  const z = HOUSE.back + COUNTER / 2
  const top = y + HOUSE.surface
  const end = span + 0.62
  const counter = { id: `counter-${j}`, at: v3((span + 0.37) / 2, y, z), width: span + 1.25, depth: COUNTER, height: HOUSE.surface }
  if (kind === 'dining') return [0, span + 1.45].map((x, i) => ({ kind: 'table', id: `table-${j}-${i}`, at: v3(x, y, -0.21), height: HOUSE.surface }))
  if (kind === 'host') return [{ kind: 'stand', ...counter }]
  const printer: HouseItem = { kind: 'printer', id: `printer-${j}`, at: v3(end, top, z - 0.04), yaw: -0.3 }
  if (kind === 'desk') return [{ kind: 'worktop', ...counter }, printer]
  if (kind === 'cooks') return [{ kind: 'worktop', ...counter }, { kind: 'pan', id: `pan-${j}`, at: v3(end, top, z), size: '1/2', depth: 0.1 }]
  // The pass, and the whole kitchen's with its printer: warm plates stacked on its heated shelf.
  const pass: HouseItem[] = [{ kind: 'pass', ...counter, strip: 0 }, { kind: 'plate-stack', id: `plates-${j}`, at: v3(end, top - SHELF, z), count: 6 }]
  return kind === 'kitchen' ? [...pass, printer] : pass
}

/** The house its floors make (scene-stops.ts's `floorsOf`): the 2D house's plan, built in steel, with the line at its foot. */
export function houseOf(floors: readonly Floor[]): House {
  const hosts = floors.filter((floor) => floor.kind !== 'line')
  const line = floors.find((floor) => floor.kind === 'line')
  const streams = line?.lanes ?? []
  const stations = Math.max(STATIONS.length, streams.length)
  const right = (Math.max(stations, ...floors.map((floor) => floor.lanes.length)) - 1) * HOUSE.lane
  const wall = -HOUSE.partition
  const windows = hosts.length > 1 ? wall : null
  const shaft = r3(right + HOUSE.shaft)
  const deckRight = shaft - 0.19
  const width = deckRight - wall
  const middle = (wall + deckRight) / 2
  const roof = HOUSE.line + hosts.length * HOUSE.pitch
  const depth = HOUSE.front - HOUSE.back
  const mid = (HOUSE.back + HOUSE.front) / 2
  const deck = (id: string, y: number): HouseProp => ({ kind: 'deck', id, at: v3(middle, y, mid), width, depth, thick: HOUSE.deck })

  const storeys: Storey[] = []
  const spots = new Map<string, Spot>()
  const items: HouseItem[] = []
  const add = (lane: Floor['lanes'][number], spot: Omit<Spot, 'key' | 'thread' | 'storey'>) => spots.set(lane.key, { key: lane.key, thread: lane.place.thread, storey: storeys.length - 1, ...spot })
  // A station's glow is its own index on the line; the hands' lamps take the channels after the line's.
  let channel = stations

  hosts.forEach((floor, j) => {
    const y = HOUSE.line + (hosts.length - 1 - j) * HOUSE.pitch
    const top = y + HOUSE.surface
    const lip = top + LAMP.lip
    const ceiling = y + HOUSE.pitch - HOUSE.deck
    storeys.push({ process: floor.process, title: floor.title, y, top, line: false })
    items.push(deck(`deck-${j}`, y), ...furnish(floor.kind, j, y, (floor.lanes.length - 1) * HOUSE.lane))
    floor.lanes.forEach((lane, i) => {
      const x = i * HOUSE.lane
      items.push(
        { kind: 'rail', id: `rail-${j}-${i}`, at: v3(x, top + HOUSE.rail, HOUSE.back + 0.015), length: 0.5 },
        { kind: 'heat-lamp', id: `lamp-${j}-${i}`, at: v3(x, ceiling, LAMP.z), drop: r3(ceiling - lip - 0.2015), hang: 'rod', channel },
        { kind: 'ring', id: `ring-${j}-${i}`, at: v3(x, lip, LAMP.z), channel },
      )
      add(lane, {
        x,
        y: top,
        gpu: false,
        channel: channel++,
        stand: { at: v3(x, top + HOUSE.rail - CLIP, HOUSE.back + 0.027), rot: [-0.06, 0, r3(lean(i + j, 0.08))] },
        lamp: { at: v3(x, lip - 0.02, LAMP.z), target: v3(x, top, LAMP.target) },
      })
    })
  })
  items.push(deck('roof', roof))

  // The line: a station for each stream and the kitchen's own after them, under the canopy, with the line's rail on the tile.
  storeys.push({ process: null, title: line?.title ?? FLOOR_NAMES.line, y: 0, top: HOUSE.counter, line: true })
  const z = HOUSE.back + HOUSE.station / 2
  for (let i = 0; i < stations; i++) items.push({ kind: STATIONS[i % 3], id: `station-${i}`, at: v3(i, 0, z), width: HOUSE.lane - 0.02, depth: HOUSE.station, height: HOUSE.counter, channel: i })
  streams.forEach((lane, i) => add(lane, { x: i, y: HOUSE.counter, gpu: true, channel: i, stand: { at: v3(i, LINE_RAIL - CLIP, HOUSE.back + 0.027), rot: [-0.06, 0, r3(lean(i + 5, 0.08))] }, lamp: null }))
  const centre = (stations - 1) / 2
  items.push(
    { kind: 'canopy', id: 'hood', at: v3(centre, HOUSE.line - HOUSE.deck, HOUSE.back), width: stations + 0.04, depth: HOOD.depth, height: HOOD.height },
    { kind: 'rail', id: 'line-rail', at: v3(centre, LINE_RAIL, HOUSE.back + 0.015), length: stations - 0.3 },
    // The kitchen round the house: the speed rack past the shaft, and a bench of pans and plates against the tile left of the partition.
    { kind: 'speed-rack', id: 'rack', at: v3(shaft + 0.95, 0, -0.2), yaw: -0.35, height: 1.72, shelves: 9, pans: [0, 1, 3, 4, 6] },
    { kind: 'worktop', id: 'bench', at: v3(wall - 0.95, 0, HOUSE.back + 0.33), width: 1.3, depth: 0.66, height: HOUSE.counter },
    { kind: 'pan', id: 'bench-pan', at: v3(wall - 1.2, HOUSE.counter, HOUSE.back + 0.33), size: '1/2', depth: 0.1 },
    { kind: 'plate-stack', id: 'bench-plates', at: v3(wall - 0.62, HOUSE.counter, HOUSE.back + 0.36), count: 8 },
  )

  // The partition at the left with a window into each storey, or a post where there is one storey; the dumbwaiter's shaft at the right.
  const height = roof + 0.04
  const landings = storeys.map((s) => s.top)
  items.push(
    windows === null
      ? { kind: 'post', id: 'post', at: v3(wall + 0.03, 0, HOUSE.front - 0.04), height }
      : { kind: 'partition', id: 'windows', at: v3(wall, 0, mid), height, depth, sills: landings.slice(0, -1), window: [HOUSE.window.height, HOUSE.window.from - mid, HOUSE.window.to - mid] },
    { kind: 'shaft', id: 'shaft', at: v3(shaft, 0, HOUSE.back + 0.23), height, landings },
  )

  // The room the house stands in: the kitchen's floor and its tile wall, wide enough that no framing sees past their ends.
  const wide = Math.max(22, width + 18)
  items.unshift({ kind: 'floor', id: 'floor', at: v3(middle, 0, 4), width: wide, depth: 9 }, { kind: 'tile-wall', id: 'wall', at: v3(middle, 0, HOUSE.back - 0.002), width: wide, height: height + 2.5 })

  return {
    key: `${storeys.map((s) => `${s.process}:${s.y}`).join('/')}|${[...spots.keys()].join(',')}`,
    storeys,
    spots,
    items,
    // The room's light, baked into its tile and floor: full over the middle of the house and up to the hood's top, easing down to under
    // half of it toward the far corners and up the tile over the hood behind the storeys, so the night falls away from the line [estimated].
    room: { x: middle, half: width * 0.3, above: HOUSE.line, beyond: HOUSE.back - 0.1, reach: [2.6, Math.max(2.4, roof - HOUSE.line), 2], dim: 0.42 },
    windows,
    shaft: { x: shaft, landings },
    box: { min: v3(wall - 0.1, 0, HOUSE.back), max: v3(shaft + 0.25, roof + 0.1, HOUSE.front + 0.05) },
    carRest: HOUSE.counter,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Light and labels                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The present (GAMES.md §2.6): its spot, which takes the one lamp, or none once the night is over. */
export const presentOf = (view: FloorView, house: House): Spot | null => (view.done ? null : (house.spots.get(placeKey(view.present)) ?? null))

/** A word for the scene to print, as DOM over the canvas: a storey's tape, a pair of hands' tape. */
export interface Tape {
  readonly id: string
  readonly at: Vec3
  readonly text: string
  /** A lane's kind beside its name: the CPU's code for a thread, the GPU's for a stream (DESIGN.md, Only Code: with its glyph). */
  readonly slot?: 'blue' | 'green'
  /** Hidden in a canvas narrower than this, in CSS px: the mirror and the 2D view carry it. */
  readonly minWidth?: number
  /** A storey's tape starts at its anchor and runs right; a pair of hands' is centred on its rail and wraps to the rail's width. */
  readonly hands?: boolean
  /** A strip of masking tape stuck in the scene, its words over it: the line's name on the canopy's lip, as Service's is on its tile. */
  readonly strip?: { readonly center: Vec3; readonly size: readonly [number, number]; readonly rotation: Vec3 }
}

/**
 * The house's tapes: each storey's name on its rolled front edge, starting just right of the partition (the line's on the canopy's lip),
 * and each pair of hands' over its rail.
 */
export function tapesOf(house: House): Tape[] {
  const left = -HOUSE.partition + 0.08
  return [
    ...house.storeys.map((s, i) => {
      const id = `storey-${i}`
      const text = s.title.toUpperCase()
      if (!s.line) return { id, at: v3(left, s.y - 0.028, HOUSE.front + 0.028), text }
      // On the canopy's lip, over the line's left station and its tube.
      const at = v3(0, HOUSE.line - HOUSE.deck - HOOD.height + 0.072, HOUSE.back + HOOD.depth + 0.004)
      return { id, at, text, strip: { center: at, size: [0.72, 0.075] as const, rotation: [0, 0, -0.012] as Vec3 } }
    }),
    ...[...house.spots.values()].map((spot) => ({
      hands: true,
      id: `hands-${spot.key}`,
      at: spot.gpu ? v3(spot.x, 0.5, HOUSE.back + HOUSE.station + 0.004) : v3(spot.x, spot.y + HOUSE.rail + 0.075, HOUSE.back + 0.01),
      text: spot.gpu ? 'stream' : spot.thread,
      slot: spot.gpu ? ('green' as const) : ('blue' as const),
      minWidth: 460,
    })),
  ]
}
