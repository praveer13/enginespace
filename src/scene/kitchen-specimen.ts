/*
 * The kitchen on /design (scene kit v1): each piece of the line's equipment alone, and the whole pass assembled, as data that the 3D
 * scene (KitchenScene3D.tsx) and the 2D notes (KitchenNote2D.tsx) both draw. No three in it, so it is tested under Bun and the page
 * holds it in its own chunk.
 *
 * Every bell runs one fire of a small, fixed service, the same on every visit: the oldest ticket on the rail is spiked, the others
 * slide along the rail toward the spike, the printer feeds the next ticket and it is hung on the clip nearest the printer, a plate
 * slides onto the pass under every ticket on the rail while the last fire's plates go out, and the line's stations burn where a
 * ticket is cooking and stand dark where none is. It is a picture of Service's rule, not a run of the model: nothing here is a
 * number a learner reads, and the scene's words are DOM.
 *
 * Every length is metres [estimated]; the props' own sizes are src/scene/props/specs.ts's.
 */
import { PAN_SIZES, PLATE, PRINTER, TICKET, type PropSpec, type Vec3 } from './props/specs'

export const SUBJECTS = ['assembled', 'pass', 'lamp', 'rail', 'printer', 'bell', 'plates', 'pans', 'spike', 'griddle', 'burners', 'fryer', 'room'] as const
export type Subject = (typeof SUBJECTS)[number]

/** A size the 2D note prints, in millimetres [estimated]. */
export interface NoteSize {
  readonly label: string
  readonly mm: number
}

export interface SubjectInfo {
  readonly id: Subject
  /** The kitchen word: what the piece is. */
  readonly name: string
  /** Where the course meets it: the engine term or the game it serves. */
  readonly term: string
  /** One sentence on what it is made of and how it moves. */
  readonly made: string
  readonly sizes: readonly NoteSize[]
  /** What the bell does to it, in words. */
  readonly bell: string
}

const mm = (metres: number) => Math.round(metres * 1000)

export const SUBJECT_INFO: Readonly<Record<Subject, SubjectInfo>> = {
  assembled: {
    id: 'assembled',
    name: 'The pass, assembled',
    term: "Service's kitchen: every piece together",
    made: 'The counter under three heat lamps, the rail across the top, the printer at its left, the line beyond, tile and hood behind.',
    sizes: [
      { label: 'counter', mm: 2400 },
      { label: 'counter top', mm: 920 },
      { label: 'line', mm: 1950 },
    ],
    bell: 'One fire: a ticket is spiked, the rest slide along, the next is printed and hung, a plate comes for each, the stations burn or stand dark.',
  },
  pass: {
    id: 'pass',
    name: 'The pass',
    term: 'the present: where a step is decided',
    made: 'A brushed shelf with a rolled front edge, a heated lower shelf under it, and the heat-lamp strip over it on two posts.',
    sizes: [
      { label: 'width', mm: 1600 },
      { label: 'depth', mm: 600 },
      { label: 'shelf', mm: 920 },
    ],
    bell: 'Plates slide in under the strip and come to rest.',
  },
  lamp: {
    id: 'lamp',
    name: 'The heat lamp',
    term: 'the active state, and only that',
    made: 'A spun-aluminium shade with a rolled lip, on its cord from a ceiling cup, round a glowing bulb.',
    sizes: [
      { label: 'shade', mm: 237 },
      { label: 'drop', mm: 560 },
    ],
    bell: 'The lamp comes on or goes out.',
  },
  rail: {
    id: 'rail',
    name: 'The ticket rail',
    term: 'the batch: one clip per slot',
    made: 'A brushed channel with a slot, and a chrome ball in it for each clip that rolls along to grip a ticket.',
    sizes: [
      { label: 'length', mm: 1200 },
      { label: 'ticket', mm: mm(TICKET.width) },
      { label: 'ticket long', mm: mm(TICKET.height) },
    ],
    bell: 'The oldest ticket is spiked, the others roll along, and an empty clip waits.',
  },
  printer: {
    id: 'printer',
    name: 'The ticket printer',
    term: 'the waiting queue',
    made: 'A deep-steel housing, a paper roll in its cradle, a chrome tear bar, and the paper curling out in front.',
    sizes: [
      { label: 'width', mm: mm(PRINTER.width) },
      { label: 'height', mm: mm(PRINTER.height) },
      { label: 'depth', mm: mm(PRINTER.depth) },
    ],
    bell: 'It feeds one ticket in line steps and tears it at the bar.',
  },
  bell: {
    id: 'bell',
    name: 'The service bell',
    term: 'the step: everything moves on it',
    made: 'A chrome dome and plunger turned on a lathe, over a deep-steel base.',
    sizes: [
      { label: 'across', mm: 90 },
      { label: 'height', mm: 79 },
    ],
    bell: 'The plunger drops, the dome rings and flashes once, and then it is still.',
  },
  plates: {
    id: 'plates',
    name: 'Plates',
    term: 'a token out: one course per live clip',
    made: 'Glazed ceramic turned with a foot ring, a well and a rim, and a stack warming on the shelf.',
    sizes: [
      { label: 'across', mm: mm(PLATE.radius * 2) },
      { label: 'height', mm: mm(PLATE.height) },
    ],
    bell: 'New plates slide in and settle; the last ones go out.',
  },
  pans: {
    id: 'pans',
    name: 'Hotel pans',
    term: 'a KV page in The Reach-In',
    made: 'Deep-drawn stainless with a rolled rim and drawn corners, full, half and third size, each with its tape slot on the rim.',
    sizes: [
      { label: 'full', mm: mm(PAN_SIZES['1/1'][0]) },
      { label: 'half', mm: mm(PAN_SIZES['1/2'][0]) },
      { label: 'third', mm: mm(PAN_SIZES['1/3'][1]) },
    ],
    bell: 'Nothing: a pan never moves, because a moving pan would teach a copy.',
  },
  spike: {
    id: 'spike',
    name: 'The ticket spike',
    term: 'a request finished',
    made: 'A chrome spindle on a weighted deep-steel base, with the finished tickets pressed down on it.',
    sizes: [
      { label: 'base', mm: 88 },
      { label: 'height', mm: 166 },
    ],
    bell: 'A finished ticket is carried over and spiked.',
  },
  griddle: {
    id: 'griddle',
    name: 'The flat-top griddle',
    term: 'a station of the line: the GPU, busy or idle',
    made: 'A seasoned steel plate with splashes and a front trough, on a brushed cabinet with bakelite knobs.',
    sizes: [
      { label: 'width', mm: 900 },
      { label: 'depth', mm: 800 },
    ],
    bell: 'Lit: its edge burns in the lamp’s amber and steam lifts off it. Dark: cold steel.',
  },
  burners: {
    id: 'burners',
    name: 'The burner station',
    term: 'a station of the line: the GPU, busy or idle',
    made: 'Four iron burner heads under cast-iron grates, each ring burning in the lamp’s amber when lit.',
    sizes: [
      { label: 'width', mm: 600 },
      { label: 'depth', mm: 800 },
    ],
    bell: 'Its rings light or go out, and steam lifts when they burn.',
  },
  fryer: {
    id: 'fryer',
    name: 'The fryer',
    term: 'a station of the line: the GPU, busy or idle',
    made: 'Two drawn wells of dark oil, a basket hung in each, and the element’s loops at the surface.',
    sizes: [
      { label: 'width', mm: 450 },
      { label: 'depth', mm: 800 },
    ],
    bell: 'Its elements burn or go cold, and steam lifts when they burn.',
  },
  room: {
    id: 'room',
    name: 'The room',
    term: 'where every game stands',
    made: 'Subway tile in running bond with its grout, a sealed quarry floor, the hood with its baffle filters and tube lights, a speed rack of pans.',
    sizes: [
      { label: 'tile', mm: 150 },
      { label: 'floor tile', mm: 300 },
      { label: 'rack', mm: 1700 },
    ],
    bell: 'Nothing moves: the room is the still ground everything else moves on.',
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The service the bell runs                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The rail's clips, from the spike's end (0) to the printer's (3). */
export const CLIPS = 4
/** Tickets that arrive with each fire, a fixed pattern so the rail fills and empties and the line goes dark and lights. */
const ARRIVALS = [1, 1, 0, 2, 1, 0, 1, 1] as const
/** The first ticket's number, and the tickets on the rail before the first bell. */
const FIRST_TICKET = 101
const OPENING = 3
/** The most finished tickets the spike shows. */
export const SPIKED = 6

export interface ServiceState {
  readonly step: number
  /** The tickets on the rail, oldest first, each with its clip (0 nearest the spike). */
  readonly rail: readonly { readonly no: number; readonly clip: number }[]
  /** Each ball's clip: the balls keep their identity as they roll. */
  readonly balls: readonly number[]
  /** Which ball grips each ticket on the rail. */
  readonly grips: Readonly<Record<number, number>>
  /** The finished tickets on the spike, the latest last. */
  readonly spiked: readonly number[]
  /** The tickets this fire printed and hung. */
  readonly printed: readonly number[]
  /** The last ticket the printer has printed: it changes only when the printer feeds. */
  readonly lastPrinted: number
  /** The fire's plates, one per ticket on the rail, each under its ticket's clip. */
  readonly plates: readonly { readonly id: string; readonly clip: number }[]
}

/** The service after `step` bells, replayed from the opening: the same on every visit. */
export function serviceAt(step: number): ServiceState {
  let rail = Array.from({ length: OPENING }, (_, i) => ({ no: FIRST_TICKET + i, clip: i }))
  const balls = Array.from({ length: CLIPS }, (_, b) => b)
  let grips: Record<number, number> = Object.fromEntries(rail.map((ticket) => [ticket.no, ticket.clip]))
  let spiked: number[] = []
  let printed: number[] = []
  let next = FIRST_TICKET + OPENING
  for (let s = 1; s <= step; s++) {
    // The oldest ticket is spiked; its ball is freed.
    const [done, ...rest] = rail
    const freed = done ? grips[done.no] : -1
    if (done) spiked = [...spiked, done.no].slice(-SPIKED)
    // Every ticket left rolls one clip toward the spike, its ball with it.
    rail = rest.map((ticket) => ({ no: ticket.no, clip: ticket.clip - 1 }))
    for (const ticket of rail) balls[grips[ticket.no]] = ticket.clip
    // The free balls stand at the printer's end in their old order, the freed one farthest out.
    const held = new Set(rail.map((ticket) => grips[ticket.no]))
    const free = balls.map((_, b) => b).filter((b) => !held.has(b))
    free.sort((a, b) => (a === freed ? 1 : b === freed ? -1 : balls[a] - balls[b]))
    free.forEach((b, k) => (balls[b] = rail.length + k))
    grips = Object.fromEntries(rail.map((ticket) => [ticket.no, grips[ticket.no]]))
    // The printer's tickets for this fire hang on the next clips along.
    printed = []
    const arriving = Math.min(ARRIVALS[(s - 1) % ARRIVALS.length], CLIPS - rail.length)
    for (let k = 0; k < arriving; k++) {
      const clip = rail.length
      rail = [...rail, { no: next, clip }]
      grips = { ...grips, [next]: balls.indexOf(clip) }
      printed = [...printed, next]
      next += 1
    }
  }
  const plates = rail.map((ticket) => ({ id: `plate-${step}-${ticket.no}`, clip: ticket.clip }))
  return { step, rail, balls: [...balls], grips, spiked, printed, lastPrinted: next - 1, plates }
}

/** Which of the line's stations burn: one for each ticket on the rail, the griddle first. */
export function stationsLit(state: ServiceState, stations = 3): boolean[] {
  return Array.from({ length: stations }, (_, i) => i < state.rail.length)
}

/** A ticket's print: its cell of the atlas, from its number. */
export const cellOf = (no: number): number => (no * 5) % 8

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where everything stands                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The assembled pass's measures, in metres [estimated]. */
export const PASS_AT = { width: 2.4, depth: 0.6, height: 0.92, gantry: 0.62 } as const
/** The rail under the gantry's bar: its top, its length, and how far apart its clips sit. */
export const RAIL_AT = { y: PASS_AT.height + PASS_AT.gantry - 0.008, z: -PASS_AT.depth / 2 + 0.06, length: 1.6, pitch: 0.36 } as const
/** The heat lamps over the pass: their ceiling, their cords, and where they hang across it. */
export const LAMPS_AT = { ceiling: 2.95, drop: 0.8, xs: [-0.62, 0, 0.62], z: 0.04 } as const
const LINE_Z = -2.62
const WALL_Z = -3.02

/** A clip's place along the rail, in metres from the rail's middle: clip 0 at the spike's end, on the right. */
export const clipX = (clip: number): number => ((CLIPS - 1) / 2 - clip) * RAIL_AT.pitch

/** Where a hung lamp's bulb face is, from its ceiling cup and its drop (build.ts's heat lamp): just below the shade's lip. */
export const bulbOf = (at: Vec3, drop: number): Vec3 => [at[0], at[1] - drop - 0.035 - 0.186, at[2]]
/** Where a lamp's ceiling cup goes for its shade's mouth to hang at `mouth`. */
export const ceilingFor = (mouth: number, drop: number): number => mouth + drop + 0.035 + 0.1665

/** A heat lamp's light: the bulb's face, and where it falls. */
export interface LightAt {
  readonly id: string
  readonly at: Vec3
  readonly target: Vec3
}

export interface KitchenLayout {
  readonly items: readonly PropSpec[]
  /** The heat lamps' warm light: from each hung lamp's bulb, or from along the pass's strip. */
  readonly lights: readonly LightAt[]
  /** Where the line's stations are, for the steam and their lit state, in channel order. */
  readonly stations: readonly { readonly channel: number; readonly top: Vec3 }[]
  readonly rail: { readonly at: Vec3; readonly length: number } | null
  readonly printer: { readonly at: Vec3; readonly yaw: number } | null
  readonly bell: Vec3 | null
  readonly spike: Vec3 | null
  /**
   * Where the fire's plates rest, by clip; where they come in from (the line's side); and how they go out: lifted off the pass and
   * carried toward the expo, past the camera, so a plate never vanishes where anyone can see it.
   */
  readonly plates: { readonly z: number; readonly y: number; readonly x: (clip: number) => number; readonly enterZ: number; readonly leave: Vec3 } | null
  /** Pans' tape labels: where the strip of tape goes and what the marker says. */
  readonly tapes: readonly { readonly id: string; readonly center: Vec3; readonly size: readonly [number, number]; readonly rotation: Vec3; readonly text: string }[]
}

const floorAt = (z: number, depth = 7): PropSpec => ({ kind: 'floor', id: 'floor', at: [0, 0, z], width: 8, depth })
const wallAt = (z: number, width = 7): PropSpec => ({ kind: 'tile-wall', id: 'wall', at: [0, 0, z], width, height: 3.1 })

/** The bench a counter-top piece stands on alone, against the tile. */
const BENCH = { width: 1.3, depth: 0.62, height: 0.9 } as const
const benchItems = (): PropSpec[] => [floorAt(-1.5), wallAt(-0.42), { kind: 'worktop', id: 'bench', at: [0, 0, 0], ...BENCH }]

export function kitchenLayout(subject: Subject): KitchenLayout {
  const empty: KitchenLayout = { items: [], lights: [], stations: [], rail: null, printer: null, bell: null, spike: null, plates: null, tapes: [] }
  const top = BENCH.height
  switch (subject) {
    case 'assembled': {
      const h = PASS_AT.height
      const stations = [
        { kind: 'griddle', x: -0.6, width: 0.9 },
        { kind: 'burners', x: 0.17, width: 0.6 },
        { kind: 'fryer', x: 0.71, width: 0.45 },
      ] as const
      const lamps = LAMPS_AT.xs.map((x, i) => ({ id: `lamp-${i}`, at: [x, LAMPS_AT.ceiling, LAMPS_AT.z] as Vec3 }))
      return {
        ...empty,
        items: [
          floorAt(-1.4, 8),
          wallAt(WALL_Z, 8),
          // The room's corner on the left, so the kitchen never ends in the haze beside the line.
          { kind: 'tile-wall', id: 'side', at: [-2.45, 0, -0.9], yaw: Math.PI / 2, width: 4.4, height: 3.1 },
          { kind: 'hood', id: 'hood', at: [0.05, 2.52, WALL_Z], width: 2.3, depth: 1.05, height: 0.46 },
          ...stations.map((station, channel) => ({ kind: station.kind, id: station.kind, at: [station.x, 0, LINE_Z] as Vec3, width: station.width, depth: 0.8, height: 0.9, channel })),
          { kind: 'speed-rack', id: 'rack', at: [1.85, 0, -1.55], yaw: -0.5, height: 1.72, shelves: 9, pans: [0, 1, 2, 4, 5, 7] },
          { kind: 'pass', id: 'pass', at: [0, 0, 0], width: PASS_AT.width, depth: PASS_AT.depth, height: h, strip: 0, gantry: PASS_AT.gantry },
          { kind: 'rail', id: 'rail', at: [0, RAIL_AT.y, RAIL_AT.z], length: RAIL_AT.length },
          { kind: 'printer', id: 'printer', at: [-0.98, h, -0.12], yaw: 0.18 },
          { kind: 'bell-base', id: 'bell', at: [0.66, h, 0.17] },
          { kind: 'spike', id: 'spike', at: [1.02, h, 0.02] },
          { kind: 'plate-stack', id: 'stack-l', at: [-0.62, h - 0.4 + 0.03, 0], count: 6 },
          { kind: 'plate-stack', id: 'stack-r', at: [0.62, h - 0.4 + 0.03, 0], count: 5 },
          ...lamps.map((lamp) => ({ kind: 'heat-lamp' as const, id: lamp.id, at: lamp.at, drop: LAMPS_AT.drop, hang: 'cord' as const })),
        ],
        lights: lamps.map((lamp) => ({ id: lamp.id, at: bulbOf(lamp.at, LAMPS_AT.drop), target: [lamp.at[0], h, lamp.at[2] - 0.02] as Vec3 })),
        stations: stations.map((station, channel) => ({ channel, top: [station.x, 0.94, LINE_Z - 0.02] as Vec3 })),
        rail: { at: [0, RAIL_AT.y, RAIL_AT.z], length: RAIL_AT.length },
        printer: { at: [-0.98, h, -0.12], yaw: 0.18 },
        bell: [0.66, h, 0.17],
        spike: [1.02, h, 0.02],
        plates: { z: 0.05, y: h, x: clipX, enterZ: -0.24, leave: [0.3, 0.45, 1.5] },
      }
    }
    case 'pass': {
      return {
        ...empty,
        items: [floorAt(-1.5), wallAt(-0.6), { kind: 'pass', id: 'pass', at: [0, 0, 0], width: 1.6, depth: 0.6, height: 0.92, strip: 0.5 }],
        // The strip's own light: three spots along its underside, over the plates.
        lights: [-0.45, 0, 0.45].map((x, i) => ({ id: `strip-${i}`, at: [x, 0.92 + 0.48, -0.05] as Vec3, target: [x, 0.92, -0.02] as Vec3 })),
        plates: { z: -0.03, y: 0.92, x: (clip) => (1.5 - clip) * 0.36, enterZ: -0.26, leave: [0.25, 0.4, 1.4] },
      }
    }
    case 'lamp': {
      const drop = 0.56
      const at: Vec3 = [0, ceilingFor(top + 0.55, drop), 0.02]
      return { ...empty, items: [...benchItems(), { kind: 'heat-lamp', id: 'lamp', at, drop, hang: 'cord' }], lights: [{ id: 'lamp', at: bulbOf(at, drop), target: [0, top, 0.02] }] }
    }
    case 'rail': {
      const at: Vec3 = [0, top + 0.42, -0.2]
      return {
        ...empty,
        items: [...benchItems(), { kind: 'pass', id: 'gantry', at: [0, 0, 0], width: BENCH.width, depth: BENCH.depth, height: top, strip: 0, gantry: 0.44 }, { kind: 'rail', id: 'rail', at, length: 1.2 }, { kind: 'spike', id: 'spike', at: [0.5, top, 0.1] }],
        rail: { at, length: 1.2 },
        spike: [0.5, top, 0.1],
      }
    }
    case 'printer': {
      const at: Vec3 = [0, top, -0.05]
      return { ...empty, items: [...benchItems(), { kind: 'printer', id: 'printer', at }], printer: { at, yaw: 0 } }
    }
    case 'bell': {
      const at: Vec3 = [0, top, 0.02]
      return { ...empty, items: [...benchItems(), { kind: 'bell-base', id: 'bell', at }], bell: at }
    }
    case 'plates': {
      return {
        ...empty,
        items: [...benchItems(), { kind: 'plate-stack', id: 'stack', at: [-0.45, top, -0.08], count: 7 }],
        plates: { z: 0.04, y: top, x: (clip) => 0.4 - clip * 0.29, enterZ: -0.22, leave: [0.2, 0.3, 0.9] },
      }
    }
    case 'pans': {
      const pans = [
        { id: 'full', size: '1/1', x: -0.33, depth: 0.065, text: 'grp 1' },
        { id: 'half', size: '1/2', x: 0.15, depth: 0.1, text: 'grp 2' },
        { id: 'third', size: '1/3', x: 0.48, depth: 0.065, text: 'kit' },
      ] as const
      return {
        ...empty,
        items: [...benchItems(), ...pans.map((pan) => ({ kind: 'pan' as const, id: pan.id, at: [pan.x, top, 0.02] as Vec3, size: pan.size, depth: pan.depth }))],
        tapes: pans.map((pan) => {
          const [, d] = PAN_SIZES[pan.size]
          return { id: pan.id, center: [pan.x, top + pan.depth - 0.006, 0.02 + d / 2 + 0.0035] as Vec3, size: [0.1, 0.022] as const, rotation: [-0.12, 0, pan.x > 0 ? 0.03 : -0.025] as Vec3, text: pan.text }
        }),
      }
    }
    case 'spike': {
      const at: Vec3 = [0, top, 0.02]
      return { ...empty, items: [...benchItems(), { kind: 'spike', id: 'spike', at }], spike: at }
    }
    case 'griddle':
    case 'burners':
    case 'fryer': {
      const width = subject === 'griddle' ? 0.9 : subject === 'burners' ? 0.6 : 0.45
      return {
        ...empty,
        items: [floorAt(-1), wallAt(-0.85), { kind: subject, id: subject, at: [0, 0, -0.44], width, depth: 0.8, height: 0.9, channel: 0 }],
        stations: [{ channel: 0, top: [0, 0.94, -0.46] }],
      }
    }
    case 'room': {
      return {
        ...empty,
        items: [
          floorAt(-1.2),
          wallAt(-2.2),
          { kind: 'hood', id: 'hood', at: [-0.3, 2.45, -2.2], width: 1.8, depth: 1.0, height: 0.46 },
          { kind: 'speed-rack', id: 'rack', at: [1.15, 0, -1.6], yaw: -0.35, height: 1.72, shelves: 9, pans: [0, 1, 3, 4, 6, 8] },
        ],
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cameras                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A camera for a subject: where it stands and looks, its field of view, and its framing on a phone. */
export interface KitchenCamera {
  readonly position: Vec3
  readonly target: Vec3
  readonly fov: number
  readonly portrait: { readonly position: Vec3; readonly target: Vec3; readonly fov: number }
}

/** Each subject's shot [estimated, framed on the specimens at 1440 and 390 px]. */
export const CAMERAS: Readonly<Record<Subject, KitchenCamera>> = {
  assembled: { position: [0.62, 2.08, 2.3], target: [-0.08, 1.02, -1.05], fov: 42, portrait: { position: [0.42, 2.35, 3.55], target: [0, 1.08, -0.85], fov: 54 } },
  pass: { position: [0.55, 1.62, 1.6], target: [0, 1.02, -0.05], fov: 36, portrait: { position: [0.4, 1.9, 2.6], target: [0, 1.05, -0.05], fov: 48 } },
  lamp: { position: [0.42, 1.22, 1.02], target: [0, 1.28, -0.02], fov: 44, portrait: { position: [0.32, 1.2, 1.45], target: [0, 1.25, -0.02], fov: 56 } },
  rail: { position: [0.35, 1.45, 0.95], target: [0, 1.18, -0.12], fov: 38, portrait: { position: [0.3, 1.5, 1.6], target: [0, 1.16, -0.12], fov: 52 } },
  printer: { position: [0.42, 1.22, 0.62], target: [0, 1.0, -0.04], fov: 34, portrait: { position: [0.36, 1.27, 0.86], target: [0, 1.0, -0.04], fov: 46 } },
  bell: { position: [0.24, 1.07, 0.36], target: [0, 0.94, 0.02], fov: 30, portrait: { position: [0.22, 1.09, 0.48], target: [0, 0.94, 0.02], fov: 42 } },
  plates: { position: [0.3, 1.4, 0.95], target: [0, 0.93, -0.02], fov: 36, portrait: { position: [0.25, 1.55, 1.35], target: [0, 0.93, -0.02], fov: 48 } },
  pans: { position: [0.3, 1.38, 0.95], target: [0.05, 0.93, 0.0], fov: 36, portrait: { position: [0.25, 1.55, 1.4], target: [0.05, 0.93, 0.0], fov: 50 } },
  spike: { position: [0.22, 1.1, 0.42], target: [0, 0.98, 0.02], fov: 32, portrait: { position: [0.2, 1.12, 0.56], target: [0, 0.98, 0.02], fov: 44 } },
  griddle: { position: [0.55, 1.45, 1.25], target: [0, 0.85, -0.45], fov: 38, portrait: { position: [0.45, 1.6, 1.85], target: [0, 0.85, -0.45], fov: 50 } },
  burners: { position: [0.42, 1.42, 1.0], target: [0, 0.85, -0.45], fov: 38, portrait: { position: [0.35, 1.58, 1.55], target: [0, 0.85, -0.45], fov: 50 } },
  fryer: { position: [0.36, 1.4, 0.95], target: [0, 0.88, -0.45], fov: 38, portrait: { position: [0.3, 1.55, 1.45], target: [0, 0.88, -0.45], fov: 50 } },
  room: { position: [-0.3, 1.6, 2.2], target: [0.2, 1.25, -1.6], fov: 42, portrait: { position: [-0.2, 1.7, 3.4], target: [0.2, 1.25, -1.4], fov: 54 } },
}

/** The distance from a subject's camera to what it looks at: the haze begins beyond it. */
export function focusOf(subject: Subject): number {
  const { position: p, target: t } = CAMERAS[subject]
  return Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2])
}

/** The ticket print's size, for the notes' drawing of a ticket: its width over its height. */
export const TICKET_ASPECT = TICKET.width / TICKET.height
