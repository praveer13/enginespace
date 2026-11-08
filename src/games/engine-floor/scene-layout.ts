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
 *     and dimming toward the far corners and up the tile over the hood, and past the house the room falls into a haze of deep steel.
 *   - A storey for each process over the line, a room on a brushed-stainless deck with a rolled front edge, furnished by its floor's
 *     kind so that it reads as its place at the cutaway's scale: the dining room's tables under their cloths with their chairs, the host
 *     stand's panelled counter with the night's book open on its lectern, the order desk with its printer and the printer's tape over its
 *     edge, the pass with its warm plates along its heated shelf, the cooks' bench with its pans, and the whole kitchen's pass and
 *     printer. Its hands work at that surface: a pair of hands is a short ticket rail on the tile over it, high enough that their ticket
 *     hangs clear of the surface, with a heat lamp hung from the deck above.
 *   - The house's two walls: at its left a steel partition, with a ticket window into every storey where there are two or more (IPC and
 *     shared memory cross between floors through the chute hidden behind it), and at its right the dumbwaiter's open shaft, a landing at
 *     every storey's work surface and one at the line's counter, whose car the copies ride. They are the house's furniture, and say
 *     nothing of the path.
 *   - What a stage lays: a spike for a queue, the "Heard!" gate for a sync, a shelf under a window for shared memory, on the surface the
 *     hands work at. Each laid hand-off carries a chit with its stage numbers, DOM over the canvas, at or over the surface it stands on;
 *     the names keep to their own bands, a storey's on its deck's edge and a pair of hands' on the front of their furniture.
 *   - The one lamp: of all the lamps, only the one over the present is lit, its bulb's glow round its shade's lip and its light falling
 *     straight down onto the surface its hands work at, in front of their ticket (Scene3D.tsx draws it); when the present is on the line,
 *     its station burns instead.
 */
import type { Floor } from '@es/play/engine-floor/layout'
import type { FloorView } from '@es/play/engine-floor/types'
import { FLOOR_NAMES, placeKey, type FloorKind } from '@es/play/engine-floor/words'
import type { RoomLight } from '@/scene/props/set'
import type { CustomSpec, PropSpec, Vec3 } from '@/scene/props/specs'

/** The house's measures, in metres [estimated]: a storey a low room, the line a real one. */
export const HOUSE = {
  /**
   * Across, from one pair of hands to the next: room at the cutaway's scale for the chit of a hand-off on each side of a pair's lamp, and
   * for their names on the furniture's front. The line's stations stand a metre apart whatever it is.
   */
  lane: 1.7,
  /** A storey, deck top to deck top, and its deck's thickness: tall enough at the cutaway's scale for its names and the chits over its furniture. */
  pitch: 1.4,
  deck: 0.05,
  /** The tile wall, and the decks' rolled front edge. */
  back: -0.46,
  front: 0.3,
  /** The line's storey: the kitchen's floor to the first deck's top, tall enough for the hood. */
  line: 2,
  /** A storey's work surface over its deck: the table, the counter or the desk its hands work at, and its window's sill. */
  surface: 0.56,
  /** A pair of hands' rail: its top over their work surface, on the tile, high enough that their ticket hangs clear of it. */
  rail: 0.27,
  /** The partition stands this far left of the first lane, and the shaft this far right of the last: a hand-off's chit clear of either. */
  partition: 0.9,
  shaft: 0.9,
  /** A window in the partition, its sill at the work surface: its height, and its opening across the deck's depth. */
  window: { height: 0.34, from: -0.38, to: 0.04 },
  /** The line's stations: their depth and the counter's height, the kit's. */
  station: 0.72,
  counter: 0.9,
} as const

/** The kit's rail: a ticket hangs from the ball under its slot this far below its top (scene kit v1's CLIP_DROP). */
const CLIP = 0.0385
/**
 * A pair of hands' heat lamp: its shade's lip this far over their work surface and this far out from the tile, its light falling straight
 * down onto that surface, in front of the ticket that hangs on the tile.
 */
const LAMP = { lip: 0.44, z: -0.3 }
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
  /** What a stage lays (the "Heard!" gate, a window's shelf), and the order desk's printer's tape, out over the desk's front edge. */
  | { readonly kind: 'gate' | 'shelf' | 'tape'; readonly id: string; readonly at: Vec3 }

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

/** A small, fixed lean for a ticket, from a number, so a rail never looks stamped out. */
const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/**
 * What a storey's hands work at, by its floor's kind (GAMES.md §2.6), and what stands on it, against the tile: a counter over its lanes
 * (`span` across them) that reaches a little past the first on the left and further past the last on the right, where its own things
 * stand clear of the spikes and gates a stage lays beside a ticket. Each reads as its place at the cutaway's scale: the dining room's
 * table for each pair of hands (each set with its plate, scene-props.ts) and one more, the host stand's book open on its lectern
 * (scene-props.ts), the order desk's printer with its tape run out over the desk's front edge, and the pass's warm plates, a stack every
 * half metre along its heated shelf.
 */
function furnish(kind: FloorKind, j: number, y: number, span: number): HouseItem[] {
  const z = HOUSE.back + COUNTER / 2
  const top = y + HOUSE.surface
  const end = span + 0.62
  const counter = { id: `counter-${j}`, at: [(span + 0.37) / 2, y, z] as Vec3, width: span + 1.25, depth: COUNTER, height: HOUSE.surface }
  if (kind === 'dining') return [0, span + 1.45].map((x, i) => ({ kind: 'table', id: `table-${j}-${i}`, at: [x, y, -0.21], height: HOUSE.surface }))
  if (kind === 'host') return [{ kind: 'stand', ...counter }]
  const printer: HouseItem = { kind: 'printer', id: `printer-${j}`, at: [end, top, z + 0.12] }
  if (kind === 'desk') return [{ kind: 'worktop', ...counter }, printer, { kind: 'tape', id: `tape-${j}`, at: [end, top, z + 0.21] }]
  if (kind === 'cooks') return [{ kind: 'worktop', ...counter }, { kind: 'pan', id: `pan-${j}`, at: [end, top, z], size: '1/2', depth: 0.1 }]
  // The pass, and the whole kitchen's with its printer.
  const pass: HouseItem[] = [{ kind: 'pass', ...counter, strip: 0 }]
  for (let x = -0.25; x < end; x += 0.5) pass.push({ kind: 'plate-stack', id: `plates-${j}-${pass.length}`, at: [x, top - SHELF, z], count: 5 + (pass.length % 3) })
  return kind === 'kitchen' ? [...pass, printer] : pass
}

/** The house its floors make (scene-stops.ts's `floorsOf`): the 2D house's plan, built in steel, with the line at its foot. */
export function houseOf(floors: readonly Floor[]): House {
  const hosts = floors.filter((floor) => floor.kind !== 'line')
  const line = floors.find((floor) => floor.kind === 'line')
  const streams = line?.lanes ?? []
  const stations = Math.max(STATIONS.length, streams.length)
  const right = Math.max(stations - 1, ...floors.map((floor) => (floor.lanes.length - 1) * HOUSE.lane))
  const wall = -HOUSE.partition
  const windows = hosts.length > 1 ? wall : null
  const shaft = right + HOUSE.shaft
  const deckRight = shaft - 0.19
  const width = deckRight - wall
  const middle = (wall + deckRight) / 2
  const roof = HOUSE.line + hosts.length * HOUSE.pitch
  const depth = HOUSE.front - HOUSE.back
  const mid = (HOUSE.back + HOUSE.front) / 2
  const deck = (id: string, y: number): HouseProp => ({ kind: 'deck', id, at: [middle, y, mid], width, depth, thick: HOUSE.deck })

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
        { kind: 'rail', id: `rail-${j}-${i}`, at: [x, top + HOUSE.rail, HOUSE.back + 0.015], length: 0.5 },
        { kind: 'heat-lamp', id: `lamp-${j}-${i}`, at: [x, ceiling, LAMP.z], drop: ceiling - lip - 0.2015, hang: 'rod', channel },
        { kind: 'ring', id: `ring-${j}-${i}`, at: [x, lip, LAMP.z], channel },
      )
      add(lane, {
        x,
        y: top,
        gpu: false,
        channel: channel++,
        stand: { at: [x, top + HOUSE.rail - CLIP, HOUSE.back + 0.027], rot: [-0.06, 0, lean(i + j, 0.08)] },
        lamp: { at: [x, lip - 0.02, LAMP.z], target: [x, top, LAMP.z] },
      })
    })
  })
  items.push(deck('roof', roof))

  // The line: a station for each stream and the kitchen's own after them, under the canopy, with the line's rail on the tile.
  storeys.push({ process: null, title: line?.title ?? FLOOR_NAMES.line, y: 0, top: HOUSE.counter, line: true })
  const z = HOUSE.back + HOUSE.station / 2
  for (let i = 0; i < stations; i++) items.push({ kind: STATIONS[i % 3], id: `station-${i}`, at: [i, 0, z], width: 0.98, depth: HOUSE.station, height: HOUSE.counter, channel: i })
  streams.forEach((lane, i) => add(lane, { x: i, y: HOUSE.counter, gpu: true, channel: i, stand: { at: [i, LINE_RAIL - CLIP, HOUSE.back + 0.027], rot: [-0.06, 0, lean(i + 5, 0.08)] }, lamp: null }))
  const centre = (stations - 1) / 2
  items.push(
    { kind: 'canopy', id: 'hood', at: [centre, HOUSE.line - HOUSE.deck, HOUSE.back], width: stations + 0.04, depth: HOOD.depth, height: HOOD.height },
    { kind: 'rail', id: 'line-rail', at: [centre, LINE_RAIL, HOUSE.back + 0.015], length: stations - 0.3 },
    // The kitchen round the house: the speed rack past the shaft, and a bench of pans and plates against the tile left of the partition.
    { kind: 'speed-rack', id: 'rack', at: [shaft + 0.95, 0, -0.2], yaw: -0.35, height: 1.72, shelves: 9, pans: [0, 1, 3, 4, 6] },
    { kind: 'worktop', id: 'bench', at: [wall - 0.95, 0, HOUSE.back + 0.33], width: 1.3, depth: 0.66, height: HOUSE.counter },
    { kind: 'pan', id: 'bench-pan', at: [wall - 1.2, HOUSE.counter, HOUSE.back + 0.33], size: '1/2', depth: 0.1 },
    { kind: 'plate-stack', id: 'bench-plates', at: [wall - 0.62, HOUSE.counter, HOUSE.back + 0.36], count: 8 },
  )

  // The partition at the left with a window into each storey, or a post where there is one storey; the dumbwaiter's shaft at the right.
  const height = roof + 0.04
  const landings = storeys.map((s) => s.top)
  items.push(
    windows === null
      ? { kind: 'post', id: 'post', at: [wall + 0.03, 0, HOUSE.front - 0.04], height }
      : { kind: 'partition', id: 'windows', at: [wall, 0, mid], height, depth, sills: landings.slice(0, -1), window: [HOUSE.window.height, HOUSE.window.from - mid, HOUSE.window.to - mid] },
    { kind: 'shaft', id: 'shaft', at: [shaft, 0, HOUSE.back + 0.23], height, landings },
  )

  // The room the house stands in: the kitchen's floor and its tile wall, wide enough that no framing sees past their ends.
  const wide = Math.max(22, width + 18)
  items.unshift({ kind: 'floor', id: 'floor', at: [middle, 0, 4], width: wide, depth: 9 }, { kind: 'tile-wall', id: 'wall', at: [middle, 0, HOUSE.back - 0.002], width: wide, height: height + 2.5 })

  return {
    key: `${storeys.map((s) => `${s.process}:${s.y}`).join('/')}|${[...spots.keys()].join(',')}`,
    storeys,
    spots,
    items,
    // The room's light, baked into its tile and floor: full over the middle of the line and up to its canopy, easing down to a third of it
    // toward the far corners and up the tile over the hood, behind the storeys, so the night falls away from the line and the lit lamp
    // and its ticket stand out against the tile behind them [estimated].
    room: { x: middle, half: width * 0.2, above: HOUSE.line - HOOD.height, beyond: HOUSE.back - 0.1, reach: [2.2, Math.max(1.6, roof - HOUSE.line), 2], dim: 0.34 },
    windows,
    shaft: { x: shaft, landings },
    box: { min: [wall - 0.1, 0, HOUSE.back], max: [shaft + 0.25, roof + 0.1, HOUSE.front + 0.05] },
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
  /**
   * A storey's tape starts at its anchor and runs right; a pair of hands' is centred on the front of the furniture they work at, under
   * their ticket, their lamp and the chits of their hand-offs, and wraps at its hyphens to about a lane's width.
   */
  readonly hands?: boolean
  /** A strip of masking tape stuck in the scene, its words over it: the line's name on the canopy's lip, as Service's is on its tile. */
  readonly strip?: { readonly center: Vec3; readonly size: readonly [number, number]; readonly rotation: Vec3 }
}

/**
 * The house's tapes: each storey's name on its rolled front edge, starting just right of the partition (the line's on the canopy's lip),
 * and each pair of hands' on the front of the furniture they work at (a stream's on its station).
 */
export function tapesOf(house: House): Tape[] {
  // Just right of the partition, which stands HOUSE.partition left of the first lane.
  const left = -0.82
  return [
    ...house.storeys.map((s, i): Tape => {
      const id = `storey-${i}`
      const text = s.title.toUpperCase()
      if (!s.line) return { id, at: [left, s.y - 0.028, HOUSE.front + 0.028], text }
      // On the canopy's lip, over the line's left station and its tube.
      const at: Vec3 = [0, HOUSE.line - HOUSE.deck - HOOD.height + 0.072, HOUSE.back + HOOD.depth + 0.004]
      return { id, at, text, strip: { center: at, size: [0.72, 0.075], rotation: [0, 0, -0.012] } }
    }),
    ...[...house.spots.values()].map((spot): Tape => ({
      hands: true,
      id: `hands-${spot.key}`,
      at: spot.gpu ? [spot.x, 0.5, HOUSE.back + HOUSE.station + 0.004] : [spot.x, spot.y - 0.26, HOUSE.back + COUNTER + 0.01],
      text: spot.gpu ? 'stream' : spot.thread,
      slot: spot.gpu ? 'green' : 'blue',
      minWidth: 460,
    })),
  ]
}
