/*
 * Back of House's house in 3D (GAMES.md §5 "3D scene", §2.6 "Back of House"; scene kit v1): the session's view turned into what the scene
 * draws. A pure function of `FloorView` and the house's floors, which the page reads from the view with the same `mapOfView` and
 * `housePlan` the 2D view draws from (scene-stops.ts), so the 3D house has the 2D house's floors and lanes in the 2D house's order, keeps
 * the graded `map`'s path to itself the same way (a sealed view builds only the floors the route has reached), and decides nothing. No three
 * here: it is tested under Bun. The page lays the house out (scene-presets.ts's `sceneModelOf`) and the scene draws it; the route through
 * it, which moves with every stage laid, is scene-route.ts, in the 3D chunk.
 *
 * The house, in metres with y up and +z toward the viewer, every length [estimated] on the kit's own proportions:
 *   - A storey for each process, its deck of brushed stainless with a rolled front edge, stacked against the tile wall: the floors in the
 *     2D house's order from the top, and the line (the GPU) at the foot, on the kitchen's own floor.
 *   - A thread is a pair of hands: a short ticket rail on the tile, with a heat lamp hung over it from the deck above. A GPU stream is a
 *     station of the line, the kit's burners, griddle or fryer, under the hood, with the line's own ticket rail along the hood's skirt.
 *   - The house's two towers: at its left a steel partition with a ticket window into every storey, the chute between floors hidden
 *     behind it (IPC and shared memory cross between floors there), and at its right the dumbwaiter's open shaft, a landing on every
 *     storey and one on the line's counter, whose car the copies ride. They are the house's furniture, and say nothing of the path.
 *   - What a stage lays: a spike for a queue, the "Heard!" gate for a sync, a shelf under a window for shared memory. Each laid hand-off
 *     carries a chit with its stage numbers, DOM over the canvas.
 *   - The one lamp: of all the lamps, only the one over the present is lit; when the present is on the line, its station burns instead.
 */
import type { Floor } from '@es/play/engine-floor/layout'
import type { FloorView } from '@es/play/engine-floor/types'
import { placeKey } from '@es/play/engine-floor/words'
import type { RoomLight } from '@/scene/props/set'
import type { CustomSpec, PropSpec, Vec3 } from '@/scene/props/specs'

/** The house's measures, in metres [estimated]: a storey a little under a counter and a lamp tall, the line a real one. */
export const HOUSE = {
  /** Across, from one pair of hands to the next. */
  lane: 1,
  /** A storey, deck top to deck top, and its deck's thickness. */
  pitch: 0.86,
  deck: 0.05,
  /** The tile wall, and the decks' rolled front edge. */
  back: -0.46,
  front: 0.26,
  /** The line's storey: the kitchen's floor to the first deck's top, tall enough for the hood. Where a deck stands with no line under it. */
  line: 2,
  stilts: 0.8,
  /** A pair of hands' rail: its top above the deck, on the tile. */
  rail: 0.34,
  /** The windows' partition stands this far left of the first lane, and the shaft this far right of the last. */
  partition: 0.66,
  shaft: 0.72,
  /** A window in the partition: its sill above the deck, its height, and its opening across the deck's depth. */
  sill: 0.1,
  window: { height: 0.32, from: -0.26, to: 0.06 },
  /** The line's stations: their depth and the counter's height, the kit's. */
  station: 0.72,
  counter: 0.9,
} as const

/** The kit's rail: a ticket hangs from the ball under its slot this far below its top (scene kit v1's CLIP_DROP). */
const CLIP = 0.0385
/** The hood over the line. */
const HOOD = { height: 0.36, depth: 0.74 }
/** A thread's lamp hangs this far out from the tile, over its rail, so its pool falls on the deck at the foot of the hanging ticket. */
const LAMP_Z = -0.2
const STATIONS = ['burners', 'griddle', 'fryer'] as const
/** The line's own ticket rail, under the hood's skirt: a ticket hangs there while the line cooks it. */
const LINE_RAIL = { y: HOUSE.line - HOUSE.deck - 0.02 - HOOD.height - 0.005, z: HOUSE.back + HOOD.depth + 0.014 }

/** A game prop of the house, as data: the scene builds each the kit's way (scene-props.ts). `at` is its base's centre, as a kit prop's. */
export type HouseProp =
  | { readonly kind: 'deck'; readonly id: string; readonly at: Vec3; readonly width: number; readonly depth: number; readonly thick: number }
  /**
   * The windows' partition: a steel wall `depth` deep from the floor to `height`, its face toward the house, with a window into each
   * storey whose deck is listed: its sill `sill` above the deck, `window` = [its height, and its opening's ends across the depth].
   */
  | {
      readonly kind: 'partition'
      readonly id: string
      readonly at: Vec3
      readonly height: number
      readonly depth: number
      readonly decks: readonly number[]
      readonly sill: number
      readonly window: readonly [number, number, number]
    }
  | { readonly kind: 'shaft'; readonly id: string; readonly at: Vec3; readonly height: number; readonly landings: readonly number[] }
  | { readonly kind: 'post' | 'gate' | 'shelf'; readonly id: string; readonly at: Vec3; readonly height?: number }

/** What the static sets list: the kit's props, and the house's own. */
export type HouseItem = Exclude<PropSpec, CustomSpec> | HouseProp

export interface Storey {
  /** The process, or null for the line. The storey's tape is its title, the kitchen's name with the engine's beside it. */
  readonly process: string | null
  readonly title: string
  /** The deck's top, or the kitchen's floor for the line. */
  readonly y: number
  readonly line: boolean
}

/** A pair of hands, or a stream of the line: where its place is in the house. */
export interface Spot {
  readonly key: string
  readonly thread: string
  readonly storey: number
  readonly x: number
  /** The surface it works on: its deck's top, or the counter on the line. */
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
  /** The windows' partition, at its x, or null for a house of one storey. */
  readonly windows: number | null
  /** The dumbwaiter's shaft, at its x, with a landing's height for each storey (the line's is its counter), or null with no line. */
  readonly shaft: { readonly x: number; readonly landings: readonly number[] } | null
  /** Everything a camera frames: the house's box. */
  readonly box: { readonly min: Vec3; readonly max: Vec3 }
  /** Where the dumbwaiter's car waits before any copy: the line's counter. */
  readonly carRest: number
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000
const v3 = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)]
/** A small, fixed lean for a ticket, from a number, so a rail never looks stamped out. */
const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/** The house its floors make (scene-stops.ts's `floorsOf`): the 2D house's plan, built in steel. */
export function houseOf(floors: readonly Floor[]): House {
  const hosts = floors.filter((floor) => floor.kind !== 'line')
  const line = floors.find((floor) => floor.kind === 'line')
  const base = line ? HOUSE.line : HOUSE.stilts
  const right = (Math.max(1, ...floors.map((floor) => floor.lanes.length)) - 1) * HOUSE.lane
  const windows = hosts.length > 1 ? -HOUSE.partition : null
  const shaft = line && hosts.length > 0 ? r3(right + HOUSE.shaft) : null
  const deckLeft = windows ?? -0.5
  const deckRight = shaft === null ? right + 0.5 : shaft - 0.19
  const width = deckRight - deckLeft
  const middle = (deckLeft + deckRight) / 2
  const roof = base + hosts.length * HOUSE.pitch
  const depth = HOUSE.front - HOUSE.back
  const deck = (id: string, y: number): HouseProp => ({ kind: 'deck', id, at: v3(middle, y, (HOUSE.back + HOUSE.front) / 2), width, depth, thick: HOUSE.deck })

  const storeys: Storey[] = []
  const spots = new Map<string, Spot>()
  const items: HouseItem[] = []
  const add = (lane: Floor['lanes'][number], spot: Omit<Spot, 'key' | 'thread' | 'storey'>) => spots.set(lane.key, { key: lane.key, thread: lane.place.thread, storey: storeys.length - 1, ...spot })
  let channel = line?.lanes.length ?? 0

  hosts.forEach((floor, j) => {
    const y = base + (hosts.length - 1 - j) * HOUSE.pitch
    const ceiling = y + HOUSE.pitch - HOUSE.deck
    storeys.push({ process: floor.process, title: floor.title, y, line: false })
    items.push(deck(`deck-${j}`, y))
    floor.lanes.forEach((lane, i) => {
      const x = i * HOUSE.lane
      items.push({ kind: 'rail', id: `rail-${j}-${i}`, at: v3(x, y + HOUSE.rail, HOUSE.back + 0.015), length: 0.56 }, { kind: 'heat-lamp', id: `lamp-${j}-${i}`, at: v3(x, ceiling, LAMP_Z), drop: 0.1, hang: 'cord', channel })
      add(lane, {
        x,
        y,
        gpu: false,
        channel: channel++,
        stand: { at: v3(x, y + HOUSE.rail - CLIP, HOUSE.back + 0.027), rot: [-0.06, 0, r3(lean(i + j, 0.08))] },
        lamp: { at: v3(x, ceiling - 0.32, LAMP_Z), target: v3(x, y, LAMP_Z + 0.08) },
      })
    })
  })
  if (hosts.length > 0) items.push(deck('roof', roof))

  if (line) {
    storeys.push({ process: null, title: line.title, y: 0, line: true })
    const z = HOUSE.back + HOUSE.station / 2
    line.lanes.forEach((lane, i) => {
      const x = i * HOUSE.lane
      items.push({ kind: STATIONS[i % 3], id: `station-${i}`, at: v3(x, 0, z), width: HOUSE.lane - 0.02, depth: HOUSE.station, height: HOUSE.counter, channel: i })
      add(lane, { x, y: HOUSE.counter, gpu: true, channel: i, stand: { at: v3(x, LINE_RAIL.y - CLIP, LINE_RAIL.z + 0.012), rot: [-0.08, 0, r3(lean(i + 5, 0.08))] }, lamp: null })
    })
    const end = (line.lanes.length - 0.5) * HOUSE.lane
    const across = end + HOUSE.lane / 2
    items.push(
      { kind: 'hood', id: 'hood', at: v3(end - across / 2, HOUSE.line - HOUSE.deck - 0.02, HOUSE.back), width: across, depth: HOOD.depth, height: HOOD.height },
      { kind: 'rail', id: 'line-rail', at: v3(end - across / 2, LINE_RAIL.y, LINE_RAIL.z), length: across - 0.1 },
    )
    // The counter the dumbwaiter lands on, between the last station and the shaft.
    const span = (shaft ?? 0) - 0.17 - end
    if (shaft !== null && span > 0.2) items.push({ kind: 'worktop', id: 'landing', at: v3(end + span / 2, 0, z), width: span, depth: HOUSE.station, height: HOUSE.counter })
    items.push({ kind: 'speed-rack', id: 'rack', at: v3((shaft ?? right) + 0.95, 0, -0.1), yaw: -0.35, height: 1.72, shelves: 9, pans: [0, 1, 3, 4, 6] })
  }

  // The windows' partition at the left, a window into each storey, or a post; the dumbwaiter's shaft at the right, or a post.
  const height = roof + 0.04
  const landings = storeys.map((s) => (s.line ? HOUSE.counter : s.y))
  items.push(
    windows === null
      ? { kind: 'post', id: 'post-l', at: v3(deckLeft + 0.03, 0, HOUSE.front - 0.04), height }
      : {
          kind: 'partition',
          id: 'windows',
          at: v3(windows, 0, (HOUSE.back + HOUSE.front) / 2),
          height,
          depth,
          decks: landings.slice(0, hosts.length),
          sill: HOUSE.sill,
          window: [HOUSE.window.height, HOUSE.window.from - (HOUSE.back + HOUSE.front) / 2, HOUSE.window.to - (HOUSE.back + HOUSE.front) / 2],
        },
    shaft === null ? { kind: 'post', id: 'post-r', at: v3(deckRight - 0.03, 0, HOUSE.front - 0.04), height } : { kind: 'shaft', id: 'shaft', at: v3(shaft, 0, HOUSE.back + 0.23), height, landings },
  )

  // The room the house stands in: the kitchen's floor, its tile wall, and the tile at its left behind the windows' chute.
  const left = (windows ?? deckLeft) - 0.38
  const wide = Math.max(13, width + 10)
  items.unshift(
    { kind: 'floor', id: 'floor', at: v3(middle, 0, -0.4), width: wide, depth: 9 },
    { kind: 'tile-wall', id: 'wall', at: v3(middle, 0, HOUSE.back - 0.002), width: wide, height: height + 1.2 },
    { kind: 'tile-wall', id: 'side', at: v3(left, 0, HOUSE.back + 1.1), yaw: Math.PI / 2, width: 3.2, height: height + 1.2 },
  )

  return {
    key: `${storeys.map((s) => `${s.process}:${s.y}`).join('/')}|${[...spots.keys()].join(',')}`,
    storeys,
    spots,
    items,
    // The room's light, baked into its tile and floor: full over the house, easing down past its sides and above its roof [estimated].
    room: { x: middle, half: width / 2 + 0.3, above: roof + 0.3, beyond: HOUSE.back - 0.1, reach: [2.4, 1.6, 2], dim: 0.5 },
    windows,
    shaft: shaft === null ? null : { x: shaft, landings },
    box: { min: v3(left, 0, HOUSE.back), max: v3((shaft ?? deckRight) + 0.25, roof + 0.1, HOUSE.front + 0.05) },
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
  /** A strip of masking tape stuck in the scene, its words over it: the line's name on the hood's skirt, as Service's is on its tile. */
  readonly strip?: { readonly center: Vec3; readonly size: readonly [number, number]; readonly rotation: Vec3 }
}

/**
 * The house's tapes: each storey's name on its rolled front edge, starting just right of the partition (the line's at the foot of the
 * hood), and each pair of hands' over its rail.
 */
export function tapesOf(house: House): Tape[] {
  const left = (house.windows ?? -0.5) + 0.08
  return [
    ...house.storeys.map((s, i) => {
      const id = `storey-${i}`
      const text = s.title.toUpperCase()
      if (!s.line) return { id, at: v3(left, s.y - 0.028, HOUSE.front + 0.028), text }
      // On the hood's skirt, over the line's left station, below the deck above's tape.
      const at = v3(0, LINE_RAIL.y + 0.135, HOUSE.back + HOOD.depth + 0.003)
      return { id, at, text, strip: { center: at, size: [0.72, 0.08] as const, rotation: [0, 0, -0.012] as Vec3 } }
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
