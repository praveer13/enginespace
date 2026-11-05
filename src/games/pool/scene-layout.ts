/*
 * The Reach-In's kitchen (GAMES.md §2.6 "The Reach-In", §8 "3D scene"; scene kit v1): the session's view turned into what the scene
 * draws. A pure function of `PoolView`, the view that the 2D view and the mirror draw too, so the scene adds nothing the session did not
 * compute and decides nothing. No three here: it is tested under Bun, and only the scene's lazy chunk holds it.
 *
 * The room, in metres with y up and +z toward the expo, every length [estimated] on the kit's proportions:
 *
 *   - The reach-in: a prep cabinet with reach-in doors, whose top is a cold rail of 1/9 hotel pans on adapter bars, sixteen to a row,
 *     each pan in its slot for its whole life (the scene's own prop, cabinet.ts). Pan 1 is at the back on the left, as in the 2D view.
 *     A pan holds mise, the food of its memory role, and a strip of torn masking tape with a marker glyph: its station's shape where a
 *     ticket holds it, the hash where it is cached, the pin where it is a recipe kit's; a bare pan holds neither. The slots a short last
 *     row leaves are covered. The reach-in's own strip of tape, scrawled in marker, lies along its front edge.
 *   - The line's rail: under the reach-in's overshelf at the back, a clip for each batch slot, and the tickets on the line hung on them.
 *   - The pass, across an aisle in front: the waiting tickets lie along it under two heat lamps hung low over it, which burn only while
 *     the present lies there (an admit, or the tickets a kit is wanted for), and pool their amber on its steel under the tickets.
 *   - The room: tile, the line's burners under their hood to the left, the floor, and the haze the room falls into.
 *
 * The present (GAMES.md §2.6 rule 5) is the open ask's candidates: the pans a dump would take ring in the lamp's amber, and so do the
 * tickets on the line that can be pulled; while a ticket can hang or a kit can be brought in, the pass burns under its lamps, where the
 * tickets wait. The focus is the ticket hung last: its twine, one string per station, runs from it to the pans it holds in the order of
 * its blocks, and the pan at the head of its order fans into the layers of its station.
 *
 * Every number is a DOM label anchored here (D-021, GAMES.md §2.6 rule 7): the tickets' numbers. The scene carries no other words; the
 * fan's meaning is the page's (Game.tsx), and the tickets' print, the glyphs and the tape's scrawl are texture.
 */
import type { ColorRoleName } from '@/design/tokens'
import type { CameraPreset } from '@/scene/camera-rig'
import type { LabelSpec } from '@/scene/labels'
import type { RoomLight } from '@/scene/props/set'
import type { LampLight } from '@/scene/props/Service'
import type { PropSpec, Vec3 } from '@/scene/props/specs'
import type { ClipPlace, TicketPose } from '@/scene/props/Tickets'
import type { Sheet } from '@/scene/SheetInstances'
import type { PanState, PoolView } from '@es/play/pool/types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The measures                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Pans in a row of the rack (GAMES.md §8: "in rows of 16"). */
export const COLS = 16
/** The reach-in's work top: its adapter bars and the pans' rims. */
export const TOP = 0.88
/** A 1/9 hotel pan, 65 mm deep [estimated: GN 1/9 is 176 × 108 mm, unverified as the kit's sizes are], and its slot on the bars. */
export const PAN = { w: 0.108, d: 0.176, h: 0.065 } as const
export const PITCH = { x: 0.114, z: 0.182 } as const
/** The top's frame round the cold rail: in front, at the sides, and behind, where the overshelf's posts stand. */
export const FRAME = { front: 0.07, side: 0.07, back: 0.17 } as const
/** The mise in a pan: how far below the rim its edge lies, and how high it heaps in the middle; its crown, where a pan's tape lies. */
export const MISE = { drop: 0.015, heap: 0.007 } as const
export const CROWN = TOP - MISE.drop + MISE.heap
/** A pan's tape: masking tape across the mise. */
export const TAPE = { w: 0.074, d: 0.044 } as const
/** The pass across the aisle: its top, its width, its depth and its middle. */
export const PASS = { top: 0.94, width: 1.5, depth: 0.44, z: 0.72 } as const
/** The line's rail under the overshelf: its top, the distance between clips, and how far under the top a clip grips a ticket. */
export const RAIL = { y: 1.3, pitch: 0.15, grip: 0.045 } as const
/**
 * The tickets: the kit's, drawn `scale` times its size, so that a hung ticket's paper, its curl and its print read across the reach-in
 * at 1440 px; the clips grow with them. A ticket's length at that size, and the distance between two lying on the pass.
 */
export const TICKET = { scale: 1.6, height: 0.192, gap: 0.14 } as const
/**
 * The heat lamps over the pass: their x, the mouth of each shade, and the line under them, each on a rod from a ceiling out of every
 * shot (5 m up). They hang low over the pass's back half, so that from every preset their shades stand between the reach-in's front and
 * the waiting tickets (the tests project their shades), and each throws its light straight down on the tickets in front of it.
 */
const LAMP = { x: 0.2, mouth: 1.48, z: PASS.z - 0.14 } as const

/**
 * The presets' ids, as scene-presets.ts names them for the page's plates (a test holds the two lists equal). The scene does not import
 * that module: the page does, and a module both import would be bundled into the page's chunk, which the scene would then pull in.
 */
export const SHOTS = ['front', 'station', 'top'] as const

/**
 * The atlas cells (Scene3D.tsx draws them): on the tapes, a station's kind, the hash of a cached pan, a kit's pin and the reach-in's
 * scrawl; the hollow tray of a padding layer; and the mise of each memory role, as food.
 */
export const CELL = { full: 0, sliding: 1, state: 2, hash: 3, pin: 4, scrawl: 5, hollow: 6 } as const
export const FOOD: Readonly<Record<PanState, number>> = { free: CELL.hollow, used: 8, cached: 9, shared: 10, adapter: 11, evicted: CELL.hollow }

/** A ticket's print: its cell of the kit's atlas, from its number. */
export const cellOf = (req: number): number => (req * 5) % 8
/** A small, fixed lean, from a number, so a row never looks stamped out. */
export const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/* ------------------------------------------------------------------------------------------------------------------ */
/* The camera                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A shot that looks down at `elevation` radians with up kept up, from `d` back from its target at (x, TOP, z), under a field of `fov`°. */
const shot = (elevation: number, fov: number, d: number, z: number, x = 0) => ({
  position: [x, TOP + d * Math.sin(elevation), z + d * Math.cos(elevation)] as Vec3,
  target: [x, TOP, z] as Vec3,
  fov,
})

/**
 * The presets' framings for a reach-in `depth` deep [estimated], front then top, each wide then on a phone: each distance and target
 * follows the depth along a straight line or two, fitted to the nearest camera that holds, for every pool size of the levels, the rack's
 * corners, the rail's tickets, the waiting tickets and the heat lamps' mouths in its frame, and hides no pan, clip or waiting ticket behind
 * a shade; the tests project those landmarks through every preset at every pool size. Front of the reach-in looks down 53° at 1440 px,
 * stood to the left so that the line and its hood come into the frame beside the rack, and 52° on a phone, the rack across the width: the
 * lamps hang over the pass, and a lower shot would put their shades over the rack. From above looks down 76° (82°, stood back from the
 * pass, which leaves it out of a phone's frame).
 */
export const framings = (depth: number) => [
  // 53° and 52°
  [shot(0.925, 30, Math.max(3.3, 1.95 + 1.45 * depth), 0.32 - 0.42 * depth, Math.max(-0.6, -0.04 - 0.36 * depth)), shot(0.9076, 40, Math.max(3.62, 1.4 + 1.17 * depth), Math.min(0.02, 0.85 - 0.57 * depth))],
  // 76° and 82°
  [shot(1.3265, 32, Math.max(2.5 + 0.1 * depth, 1.84 * depth), -0.47 * depth), shot(1.4312, 44, Math.max(3.28 + 0.06 * depth, 1.263 * depth), -0.4 - 0.34 * depth)],
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The reach-in: what stands still for a level                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A strip of tape, or a pan's mise, as an instance: where it lies, how it is turned and sized, its atlas cell, and its role's colour. */
export interface Tape {
  readonly at: Vec3
  readonly rotation?: Vec3
  readonly scale?: Vec3
  readonly cell: number
  readonly role?: ColorRoleName
}

export interface ReachIn {
  readonly rows: number
  readonly width: number
  readonly depth: number
  /** Each pan's middle at its rim, in the order of its id: where it stands for its whole life. */
  readonly pans: readonly Vec3[]
  /** The room, the pass and its lamps, and the line's rail: the static set, without the reach-in itself (Scene3D.tsx's own prop). */
  readonly items: readonly PropSpec[]
  readonly lamps: readonly LampLight[]
  readonly rail: Vec3
  readonly clips: readonly ClipPlace[]
  /** The reach-in's own strip of masking tape along its front edge, torn off the roll and scrawled in marker. */
  readonly tape: Tape
  readonly light: RoomLight
  readonly presets: readonly CameraPreset[]
}

/** The x of clip `k` of `cap` on the line's rail. */
const clipX = (k: number, cap: number): number => (k - (cap - 1) / 2) * RAIL.pitch

/** The reach-in for a pool of `pages` pans and a line of `cap` slots: a function of the level's shape alone, so no decision rebuilds it. */
export function reachInOf(pages: number, cap: number): ReachIn {
  const rows = Math.ceil(pages / COLS)
  const width = COLS * PITCH.x + 2 * FRAME.side
  const depth = rows * PITCH.z + FRAME.front + FRAME.back
  const back = -depth
  const rail: Vec3 = [0, RAIL.y, back + 0.07]
  const lamps = [-LAMP.x, LAMP.x]
  const shots = framings(depth)
  return {
    rows,
    width,
    depth,
    pans: Array.from({ length: pages }, (_, i) => [((i % COLS) - (COLS - 1) / 2) * PITCH.x, TOP, back + FRAME.back + (Math.floor(i / COLS) + 0.5) * PITCH.z]),
    items: [
      { kind: 'floor', id: 'floor', at: [0, 0, back + 2], width: 14, depth: 9 },
      { kind: 'tile-wall', id: 'wall', at: [0, 0, back - 0.012], width: 14, height: 3.1 },
      // The line beside the reach-in's left side, under its hood: its stations stand cold, because nothing the learner decides is cooking.
      // The hood hangs low enough for the front shot to hold its lip and its lights over the burners.
      { kind: 'burners', id: 'burners', at: [-1.45, 0, back + 0.42], width: 0.8, depth: 0.8, height: 0.9, channel: 0 },
      { kind: 'hood', id: 'hood', at: [-1.48, 2.25, back], width: 1.1, depth: 1, height: 0.46 },
      { kind: 'pass', id: 'pass', at: [0, 0, PASS.z], width: PASS.width, depth: PASS.depth, height: PASS.top, strip: 0 },
      { kind: 'rail', id: 'rail', at: rail, length: cap * RAIL.pitch + 0.12 },
      ...lamps.map((x): PropSpec => ({ kind: 'heat-lamp', id: `lamp${x}`, at: [x, 5, LAMP.z], drop: 5 - LAMP.mouth - 0.2015, hang: 'rod' })),
    ],
    lamps: lamps.map((x) => ({ id: `lamp${x}`, at: [x, LAMP.mouth - 0.02, LAMP.z], target: [x, PASS.top, PASS.z] })),
    rail,
    clips: Array.from({ length: cap }, (_, k) => ({ id: `clip${k}`, x: clipX(k, cap) })),
    tape: { at: [-0.52, TOP + 0.0006, -FRAME.front / 2], rotation: [-Math.PI / 2, 0, 0.02], scale: [0.4, 0.05, 1], cell: CELL.scrawl },
    // The room's light, baked into its tile and its floor: full over the line and the reach-in, and falling away to either side, up the
    // wall over the overshelf and back toward the far corner, into the haze.
    light: { x: -0.45, half: 0.75, above: 1.35, beyond: back, reach: [1.4, 0.9, 1.6], dim: 0.38 },
    presets: SHOTS.map((id) => {
      const [wide, portrait] = shots[id === 'top' ? 1 : 0]
      return { id, label: id, shot: id === 'top' ? id : 'establish', projection: 'perspective', ...wide, portrait }
    }),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The night: what a decision changes                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A ring of the lamp: round a pan a dump would take, flat on its rim, or round a ticket that can be pulled, upright on the rail. */
export interface Ring {
  readonly at: Vec3
  readonly rotation?: Vec3
  readonly scale?: Vec3
}

/** The fan over the focus's head pan: one slice for each layer of its station, its mise's cell and role, and its padding layers hollow. */
export interface Fan {
  readonly at: Vec3
  readonly layers: number
  readonly pads: number
  readonly role: ColorRoleName
  readonly cell: number
}

export interface Night {
  /** Each held pan's mise: its food's cell and its role. */
  readonly fills: readonly Tape[]
  /** The pans' strips of masking tape (the kit's), and the marker on each, then the reach-in's own torn strip. */
  readonly sheets: readonly Sheet[]
  readonly tapes: readonly Tape[]
  /** The lamp's rings: round the pans a dump would take, and round the tickets on the line that can be pulled. */
  readonly rings: readonly Ring[]
  readonly tickets: readonly TicketPose[]
  /** The focus's twine, one string per station; and each landed kit's, through its pans. */
  readonly twine: readonly (readonly Vec3[])[]
  readonly kits: readonly (readonly Vec3[])[]
  readonly fan: Fan | null
  /** The pass's heat lamps burn: the present lies on the pass, the tickets that can hang or that want the kit to bring in. */
  readonly lit: boolean
  /**
   * The tickets' numbers (LabelLayer's specs): DOM over the canvas, never print in it, each riding on its ticket as it moves (its frame is
   * `ticket:t<id>`), in the printer's face at the smallest step of the ramp.
   */
  readonly labels: readonly LabelSpec[]
  /** Changes whenever the focus's twine or its fan does: the moment plays again. */
  readonly moment: string
}

/** A string from `from` through each point in turn, draped: it sags between the pans it touches and rises off them over a long span. */
function strand(from: Vec3, points: readonly Vec3[]): Vec3[] {
  const out: Vec3[] = [from]
  let last = from
  for (const p of points) {
    out.push([(p[0] + last[0]) / 2, Math.max(p[1], last[1] - 0.12) + 0.02 + Math.min(0.12, 0.12 * Math.hypot(p[0] - last[0], p[2] - last[2])), (p[2] + last[2]) / 2], p)
    last = p
  }
  return out
}

export interface NightOptions {
  /** One station's tapes and twine only (the One station preset), by index, or every station's. */
  readonly station: number | null
  /** The pans chosen to be dumped, while an eviction is open. */
  readonly chosen: readonly number[]
}

export function nightOf(view: PoolView, r: ReachIn, { station, chosen }: NightOptions): Night {
  const { ask, stations, cap, pans } = view
  const top = (id: number, lift: number): Vec3 => [r.pans[id][0], CROWN + lift, r.pans[id][2]]
  const fills: Tape[] = []
  const sheets: Sheet[] = []
  const tapes: Tape[] = []
  for (const pan of pans) {
    if (pan.state === 'free') continue
    fills.push({ at: top(pan.id, -MISE.heap), cell: FOOD[pan.state], role: `memory-${pan.state}` })
    // A kit's pan belongs to no station, so One station hides its tape with every other station's.
    const own = pan.station === null ? null : stations[pan.station]
    if (station !== null && pan.station !== station) continue
    const rotation: Vec3 = [-Math.PI / 2, 0, lean(pan.id, 0.06)]
    sheets.push({ id: `${pan.id}`, center: top(pan.id, 0), size: [TAPE.w, TAPE.d], rotation })
    tapes.push({ at: top(pan.id, 0.0004), rotation, scale: [TAPE.w, TAPE.d, 1], cell: own === null ? CELL.pin : pan.refs === 0 ? CELL.hash : CELL[own.kind] })
  }
  tapes.push(r.tape)

  // The present: the pans a dump would take, ringed by the lamp on their rims, and the tickets on the line that can be pulled, ringed
  // where they hang. The tickets that can hang wait on the pass, under its lamps.
  const rings: Ring[] = ask?.kind === 'evict' ? chosen.filter((id) => ask.candidates.includes(id)).map((id) => ({ at: [r.pans[id][0], TOP + 0.004, r.pans[id][2]] })) : []
  // The tickets: waiting along the pass, the line's hung on the rail.
  const poses = new Map<number, TicketPose>()
  const reach = TICKET.height / 2
  view.waiting.forEach((id, i) => {
    const turn = lean(id, 0.36)
    const x = (i - (view.waiting.length - 1) / 2) * TICKET.gap
    // A ticket hangs from the middle of its top edge, so one lying flat reaches half its length toward the expo from there.
    poses.set(id, { id: `t${id}`, at: [x - reach * Math.sin(turn), PASS.top + 0.0007 + i * 0.0002, PASS.z - reach * Math.cos(turn)], rotation: [-Math.PI / 2, 0, turn], cell: cellOf(id), arc: 0.08 })
  })
  view.running.forEach((id, k) => {
    poses.set(id, { id: `t${id}`, at: [clipX(k, cap), RAIL.y - RAIL.grip, r.rail[2] + 0.012], rotation: [-0.05, 0, lean(id, 0.07)], cell: cellOf(id), arc: 0.16 })
    if (ask?.kind === 'preempt' && ask.candidates.includes(id)) rings.push({ at: [clipX(k, cap), RAIL.y - RAIL.grip - reach, r.rail[2] + 0.03], rotation: [Math.PI / 2, 0, 0], scale: [1.2, 1, 1.1] })
  })

  // The focus, the ticket hung last: its pans at each station in the order of its blocks, its twine through them, its head pan's fan. The
  // page says what the fan shows from focus.ts's `focusOf`, which works it out the same way (a test holds the two equal); the scene
  // works it out here, since a module that both import would fold the page into a chunk the scene loads.
  const ticket = view.running[view.running.length - 1] as number | undefined
  const pose = ticket === undefined ? undefined : poses.get(ticket)
  const tables = stations.map((_, g) =>
    pose === undefined || (station !== null && g !== station) ? [] : pans.filter((pan) => pan.station === g && pan.holders.includes(ticket as number)).sort((a, b) => (a.block ?? 0) - (b.block ?? 0)),
  )
  const head = tables.find((list) => list.length > 0)?.[0]
  const group = head?.station == null ? null : stations[head.station]
  const twine = pose === undefined ? [] : tables.flatMap((list, g) => (list.length === 0 ? [] : [strand([pose.at[0] + (g - stations.length / 2) * 0.012, RAIL.y - RAIL.grip - TICKET.height + 0.006, pose.at[2] + 0.01], list.map((pan) => top(pan.id, 0.004)))]))
  const fan: Fan | null =
    head === undefined || group === null ? null : { at: top(head.id, -MISE.heap), layers: group.layers, pads: group.padLayers, role: `memory-${head.state}`, cell: FOOD[head.state] }

  return {
    fills,
    sheets,
    tapes,
    rings,
    tickets: [...poses.values()],
    twine,
    // A landed kit's pans, pinned and joined by their own string, never side by side (S-LoRA's unified paging).
    kits: station !== null ? [] : view.kits.flatMap((kit) => (kit.pageIds.length < 2 ? [] : [strand(top(kit.pageIds[0], 0.008), kit.pageIds.slice(1).map((id) => top(id, 0.008)))])),
    fan,
    lit: ask?.kind === 'admit' || ask?.kind === 'prefetch',
    labels: [...poses.keys()].map((id) => ({ id: `no${id}`, at: [0, -0.024, 0.0012], frame: `ticket:t${id}`, className: 'es-type-ticket text-size-micro', content: view.tickets[id].no })),
    moment: JSON.stringify([ticket, tables.map((list) => list.map((pan) => pan.id)), fan?.role]),
  }
}
