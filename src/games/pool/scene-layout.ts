/*
 * The Reach-In's kitchen (GAMES.md §2.6 "The Reach-In", §8 "3D scene"; scene kit v1): the session's view turned into what the scene
 * draws. A pure function of `PoolView`, the view that the 2D view and the mirror draw too, so the scene adds nothing the session did not
 * compute and decides nothing. No three here: it is tested under Bun, and only the scene's lazy chunk holds it.
 *
 * The room, in metres with y up and +z toward the expo, every length [estimated] on the kit's proportions:
 *
 *   - The reach-in: a prep cabinet with reach-in doors, whose top is a cold rail of 1/9 hotel pans on adapter bars, sixteen to a row,
 *     each pan in its slot for its whole life (the scene's own prop, Scene3D.tsx). Pan 1 is at the back on the left, as in the 2D view.
 *     A pan holds mise in its memory role and a strip of masking tape with a marker glyph: its station's shape where a ticket holds it,
 *     the hash where it is cached, the pin where it is a recipe kit's, and a bare pan holds neither.
 *   - The line's rail: under the reach-in's overshelf at the back, a clip for each batch slot, and the tickets on the line hung on them.
 *   - The pass, across an aisle in front: the waiting tickets lie along it under two heat lamps, which burn only while the present lies
 *     there (an admit, or the tickets a kit is wanted for).
 *   - The room: tile, the line's burners under their hood to the left, the floor, and the haze.
 *
 * The present (GAMES.md §2.6 rule 5) is the open ask's candidates: the pans a dump would take ring in the lamp's amber, the numbers of
 * the tickets that can be hung or pulled print under the lamp's glow, and while a kit can be brought in the pass burns, where the
 * tickets that want it wait. The focus is the ticket hung last: its twine, one string per station, runs from it to the pans it holds in
 * the order of its blocks, and the pan at the head of its order fans into the layers of its station.
 *
 * Every word and number is a DOM label anchored here (D-021, GAMES.md §2.6 rule 7); the tickets' print and the glyphs are texture.
 */
import type { ColorRoleName } from '@/design/tokens'
import type { CameraPreset } from '@/scene/camera-rig'
import type { LabelSpec } from '@/scene/labels'
import type { RoomLight } from '@/scene/props/set'
import type { LampLight } from '@/scene/props/Service'
import type { PropSpec, Vec3 } from '@/scene/props/specs'
import type { ClipPlace, TicketPose } from '@/scene/props/Tickets'
import type { PoolView } from '@es/play/pool/types'

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
export const PASS = { top: 0.94, width: 1.5, depth: 0.44, z: 0.5 } as const
/** The line's rail under the overshelf: its top, the distance between clips, and how far under the top a clip grips a ticket. */
export const RAIL = { y: 1.3, pitch: 0.15, grip: 0.0425 } as const
/** A ticket off the printer (the kit's), and the distance between two tickets lying on the pass. */
export const TICKET = { width: 0.08, height: 0.12, gap: 0.104 } as const
/**
 * The heat lamps over the pass: their x, the mouth of each shade, the ceiling they hang from, and the line under them. They hang toward
 * the pass's ends, where no preset sees them over a pan (the tests project their shades), and lean their light in over its middle.
 */
const LAMP = { x: 0.6, mouth: 1.98, ceiling: 3, z: PASS.z - 0.04 } as const

/**
 * The presets' ids, as scene-presets.ts names them for the page's plates (a test holds the two lists equal). The scene does not import
 * that module: the page does, and a module both import would be bundled into the page's chunk, which the scene would then pull in.
 */
export const SHOTS = ['front', 'station', 'top'] as const

/** The atlas cells of the tapes' marker glyphs (Scene3D.tsx draws them): a station's kind, the hash of a cached pan, a kit's pin. */
export const CELL = { full: 0, sliding: 1, state: 2, hash: 3, pin: 4 } as const

/** A ticket's print: its cell of the kit's atlas, from its number. */
export const cellOf = (req: number): number => (req * 5) % 8
/** A small, fixed lean, from a number, so a row never looks stamped out. */
export const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/* ------------------------------------------------------------------------------------------------------------------ */
/* The camera                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A shot that looks down at `elevation` degrees with up kept up, from `d` back from its target at (0, ty, tz), under a field of `fov`. */
const shot = (elevation: number, fov: number, d: number, ty: number, tz: number) => ({
  position: [0, ty + d * Math.sin((elevation * Math.PI) / 180), tz + d * Math.cos((elevation * Math.PI) / 180)] as Vec3,
  target: [0, ty, tz] as Vec3,
  fov,
})

/**
 * The presets' framings for a reach-in `depth` deep [estimated]: each distance and target follows the depth along one or two straight
 * lines, fitted to the nearest camera that holds, for every pool size of the levels, the rack's corners, the rail's tickets, the lamps'
 * shades and the waiting tickets' part of the pass inside 0.94 of a 3:2 frame (a phone's 3:4 holds the rack's corners inside 0.97, so
 * its pans are about 19 px, and lets the lamps' shades run off its sides), solved once and checked by the tests, which project those
 * landmarks through every preset at every pool size. Front of the reach-in looks down 30° (68° on a phone): between the two, the lamps'
 * shades would hang over the back of the rack. From above looks down 76° (82°).
 */
export const framings = (depth: number) => ({
  front: [
    shot(30, 30, Math.max(2.55 + 0.346 * depth, 1.235 + 0.907 * depth), Math.max(1.094 - 0.052 * depth, 1.361 - 0.174 * depth), Math.min(0.141 - 0.3 * depth, 0.299 - 0.371 * depth)),
    shot(68, 40, Math.max(3.495 + 0.188 * depth, 1.112 + 1.313 * depth), 0.933 - 0.026 * depth, 0.19 - 0.436 * depth),
  ],
  top: [shot(76, 32, Math.max(2.5 + 0.1 * depth, 1.84 * depth), TOP, -0.47 * depth), shot(82, 44, Math.max(3.28 + 0.06 * depth, 1.263 * depth), TOP, -0.47 * depth)],
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The reach-in: what stands still for a level                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The reach-in's name on a strip of masking tape across its front (the kit's SheetInstances), with its rotation, the free line, in
 * eviction order: the words are DOM.
 */
export interface WordTape {
  readonly id: string
  readonly center: Vec3
  readonly size: readonly [number, number]
  readonly rotation: Vec3
  readonly text: string
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
  const half = width / 2
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
      // The line beside the reach-in, under its hood: its stations stand cold, because nothing the learner decides is cooking.
      { kind: 'burners', id: 'burners', at: [-half - 0.47, 0, back + 0.42], width: 0.8, depth: 0.8, height: 0.9, channel: 0 },
      { kind: 'hood', id: 'hood', at: [-half - 0.5, 2.4, back], width: 1.1, depth: 1, height: 0.46 },
      { kind: 'pass', id: 'pass', at: [0, 0, PASS.z], width: PASS.width, depth: PASS.depth, height: PASS.top, strip: 0 },
      { kind: 'rail', id: 'rail', at: rail, length: cap * RAIL.pitch + 0.12 },
      ...lamps.map((x): PropSpec => ({ kind: 'heat-lamp', id: `lamp${x}`, at: [x, LAMP.ceiling, LAMP.z], drop: LAMP.ceiling - LAMP.mouth - 0.2015, hang: 'cord' })),
    ],
    lamps: lamps.map((x) => ({ id: `lamp${x}`, at: [x, LAMP.mouth - 0.02, LAMP.z], target: [x / 2, PASS.top, LAMP.z] })),
    rail,
    clips: Array.from({ length: cap }, (_, k) => ({ id: `clip${k}`, x: clipX(k, cap) })),
    // The room's light, baked into its tile and its floor: full round the reach-in, and dimming toward the far corner and the ceiling.
    light: { x: 0, half: half * 0.7, above: 1.8, beyond: back, reach: [2.2, 1.4, 2], dim: 0.52 },
    presets: SHOTS.map((id) => {
      const [wide, portrait] = shots[id === 'top' ? 'top' : 'front']
      return { id, label: id, shot: id === 'top' ? 'top' : 'establish', projection: 'perspective', ...wide, portrait }
    }),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The night: what a decision changes                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A pan's mise, in its memory role; a strip of tape on it with its glyph's cell; a ring of the lamp round a pan. */
export interface Fill {
  readonly at: Vec3
  readonly role: ColorRoleName
}
export interface Tape {
  readonly at: Vec3
  readonly rotation: Vec3
  readonly scale: Vec3
  readonly cell: number
}
export interface Ring {
  readonly at: Vec3
}

/** The fan over the focus's head pan: one slice for each layer of its station, and its padding layers hollow. */
export interface Fan {
  readonly at: Vec3
  readonly layers: number
  readonly pads: number
  readonly role: ColorRoleName
}

/**
 * A label's spec (LabelLayer's): DOM over the canvas, never print in it. Its class names its kind: `ticket` for a ticket's number, which
 * rides on the ticket as it moves (its frame is `ticket:t<id>`), `word` for an object's name on its tape, and `fan` for what a fan shows.
 */
const label = (id: string, kind: 'ticket' | 'lamp' | 'word' | 'fan', at: Vec3, text: string, frame?: string): LabelSpec => ({
  id,
  at,
  frame,
  place: kind === 'fan' ? 'above' : undefined,
  className: `es-pool-label es-pool-label--${kind} es-type-${kind === 'word' ? 'label' : 'ticket'}`,
  content: text,
})

export interface Night {
  readonly fills: readonly Fill[]
  readonly tapes: readonly Tape[]
  /** The reach-in's tape, with its name and its rotation. */
  readonly words: readonly WordTape[]
  /** The lamp's rings round the pans a dump would take. */
  readonly rings: readonly Ring[]
  readonly tickets: readonly TicketPose[]
  /** The focus's twine, one string per station; and each landed kit's, through its pans. */
  readonly twine: readonly (readonly Vec3[])[]
  readonly kits: readonly (readonly Vec3[])[]
  readonly fan: Fan | null
  /** The pass's heat lamps burn: the present lies on the pass. */
  readonly lit: boolean
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
  const { ask, stations, tickets: all, cap, pans } = view
  const top = (id: number, lift: number): Vec3 => [r.pans[id][0], CROWN + lift, r.pans[id][2]]
  const fills: Fill[] = []
  const tapes: Tape[] = []
  for (const pan of pans) {
    if (pan.state === 'free') continue
    fills.push({ at: top(pan.id, -MISE.heap), role: `memory-${pan.state}` })
    // A kit's pan belongs to no station, so One station hides its tape with every other station's.
    const own = pan.station === null ? null : stations[pan.station]
    if (station === null || pan.station === station) tapes.push({ at: top(pan.id, 0), rotation: [-Math.PI / 2, 0, lean(pan.id, 0.06)], scale: [TAPE.w, TAPE.d, 1], cell: own === null ? CELL.pin : pan.refs === 0 ? CELL.hash : CELL[own.kind] })
  }

  // The tickets: waiting along the pass, the line's hung on the rail.
  const poses = new Map<number, TicketPose>()
  view.waiting.forEach((id, i) => {
    const turn = lean(id, 0.36)
    const x = (i - (view.waiting.length - 1) / 2) * TICKET.gap
    // A ticket hangs from the middle of its top edge, so one lying flat reaches half its length toward the expo from there.
    poses.set(id, { id: `t${id}`, at: [x - 0.06 * Math.sin(turn), PASS.top + 0.0007 + i * 0.0002, PASS.z - 0.06 * Math.cos(turn)], rotation: [-Math.PI / 2, 0, turn], cell: cellOf(id), arc: 0.08 })
  })
  view.running.forEach((id, k) => poses.set(id, { id: `t${id}`, at: [clipX(k, cap), RAIL.y - RAIL.grip, r.rail[2] + 0.012], rotation: [-0.05, 0, lean(id, 0.07)], cell: cellOf(id), arc: 0.16 }))
  // The present among the tickets: those that can be hung or pulled. Each one's number prints under the lamp's glow, as a ticket under
  // the lamp does on the page.
  const lamp: readonly number[] = ask?.kind === 'admit' || ask?.kind === 'preempt' ? ask.candidates : []
  const labels = [...poses.keys()].map((id) => label(`no${id}`, lamp.includes(id) ? 'lamp' : 'ticket', [0, -0.024, 0.0012], all[id].no, `ticket:t${id}`))

  // The focus, the ticket hung last: its pans at each station in the order of its blocks, its twine through them, its head pan's fan.
  const ticket = view.running[view.running.length - 1] as number | undefined
  const pose = ticket === undefined ? undefined : poses.get(ticket)
  const tables = stations.map((_, g) =>
    pose === undefined || (station !== null && g !== station) ? [] : pans.filter((pan) => pan.station === g && pan.holders.includes(ticket as number)).sort((a, b) => (a.block ?? 0) - (b.block ?? 0)),
  )
  const twine = pose === undefined ? [] : tables.flatMap((list, g) => (list.length === 0 ? [] : [strand([pose.at[0] + (g - stations.length / 2) * 0.012, RAIL.y - RAIL.grip - TICKET.height + 0.006, pose.at[2] + 0.01], list.map((pan) => top(pan.id, 0.004)))]))
  const head = tables.find((list) => list.length > 0)?.[0]
  const group = head?.station == null ? null : stations[head.station]
  let fan: Fan | null = null
  if (head !== undefined && group !== null) {
    fan = { at: top(head.id, 0), layers: group.layers, pads: group.padLayers, role: `memory-${head.state}` }
    labels.push(label('fan', 'fan', top(head.id, 0.24), `${group.id}: ${group.layers} layers${group.padLayers > 0 ? ` and ${group.padLayers} padding` : ''}, one pan`))
  }

  // The reach-in's tape names it and lists the head of its rotation: the cached pans in the order they go, the next on the left (bare
  // pans, which hold nothing, go before them, to any allocation).
  const word: WordTape = {
    id: 'reach-in',
    center: [0, TOP - 0.07, 0.003],
    size: [1.5, 0.05],
    rotation: [0, 0, 0.006],
    text: `the reach-in · KV page pool · next to go: ${view.rotation.flatMap((id) => pans[id].tape ?? []).slice(0, 5).join(' ') || 'nothing cached'}`,
  }
  labels.push(label(word.id, 'word', word.center, word.text))

  return {
    fills,
    tapes,
    words: [word],
    rings: ask?.kind === 'evict' ? chosen.filter((id) => ask.candidates.includes(id)).map((id) => ({ at: [r.pans[id][0], TOP + 0.004, r.pans[id][2]] })) : [],
    tickets: [...poses.values()],
    twine,
    // A landed kit's pans, pinned and joined by their own string, never side by side (S-LoRA's unified paging).
    kits: station !== null ? [] : view.kits.flatMap((kit) => (kit.pageIds.length < 2 ? [] : [strand(top(kit.pageIds[0], 0.008), kit.pageIds.slice(1).map((id) => top(id, 0.008)))])),
    fan,
    lit: ask?.kind === 'admit' || ask?.kind === 'prefetch',
    labels,
    moment: `${ticket}:${tables.map((list) => list.map((pan) => pan.id).join('.')).join('|')}:${fan?.role}`,
  }
}
