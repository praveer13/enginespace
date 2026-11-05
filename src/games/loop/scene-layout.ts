/*
 * Service's kitchen (GAMES.md §2.6 "Service", §3 "3D scene"; scene kit v1): the view of the night turned into the props the scene
 * draws. A pure function of `LoopView`, the same view the 2D view, the poster and the mirror draw, so the scene adds nothing the
 * session did not compute and decides nothing. No three here: it is tested under Bun, and only the scene's lazy chunk holds it.
 *
 * The room, in metres with y up and +z toward the expo, every length [estimated] on the kit's own proportions:
 *
 *   - The pass: a counter with a gantry over its back edge, and the rail hung under the gantry's bar, one clip per slot. Every
 *     taken clip holds its ticket, printed from the atlas, with its number in the DOM.
 *   - The fired rail, on levels that have the overlap switch: a second rail hung lower under the same bar, which holds the fire on
 *     the line while the expo writes the next call on the rail. Each of its tickets is a copy that came down from the rail.
 *   - The printer at the pass's left end (on Service's own page; the front page holds a printer of its own), and the tickets it has
 *     fed lying on the counter in front of it, the next in line first. Hanging one carries it to its clip.
 *   - Plates: the last fire that has been read back, one plate under every clip that cooked a course. A binned plate goes into the
 *     bin, a full hotel pan at the pass's right end, and the bin keeps the last few. A finished ticket is spiked.
 *   - The line behind the pass: a station for each clip, burning in the lamp's amber where the latest fire cooked a course and
 *     cold where its clip rode empty (`stationsOf`). Tile, hood, floor and a speed rack make the room.
 *   - Three heat lamps over the pass, the bell at its front right.
 *
 * Every word and number is a DOM label anchored here (D-021, GAMES.md §2.6 rule 7); the tickets' print is texture.
 */
import { stationsOf, ticketNo } from '@es/play/loop/layout'
import type { LoopView } from '@es/play/loop/types'
import type { PropSpec, StationSpec, Vec3 } from '@/scene/props/specs'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The measures                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The pass: its counter's top, its depth, and how high the gantry's bar stands over it. */
export const PASS = { top: 0.92, depth: 0.6, gantry: 0.62 } as const
/** The rail's top (it hangs under the gantry's bar) and how far back over the counter it runs. */
export const RAIL = { y: PASS.top + PASS.gantry - 0.008, z: -PASS.depth / 2 + 0.06 } as const
/** The gantry's bar, which the fired rail hangs from, and how far below the rail the fired rail runs. */
const BAR = { y: PASS.top + PASS.gantry + 0.012, z: -PASS.depth / 2 + 0.035 }
export const FIRED = { y: RAIL.y - 0.24, z: BAR.z } as const
/** A ticket off the printer (the kit's TICKET), and how far below the rail's top its clip grips it (the kit's CLIP_DROP). */
export const TICKET = { width: 0.08, height: 0.12 } as const
const GRIP = 0.035 + 0.0035 + 0.004
/** Where a plate rests on the counter, and the line's side of the counter it slides in from. */
const PLATE_Z = 0.02
const ENTER_Z = -PASS.depth / 2 - 0.02
/** The line: its stations' centre line, depth and height; the wall behind it; the heat lamps' ceiling and the mouth of their shades. */
const LINE = { z: -1.95, depth: 0.8, height: 0.9 }
const WALL_Z = -2.36
const CEILING = 2.95
const MOUTH = 1.86
/** Tickets the counter shows in front of the printer, finished tickets the spike shows, and binned plates the bin shows. */
export const COUNTER_TICKETS = 5
const SPIKED = 6
const BINNED = 5
const STATION_KINDS = ['griddle', 'burners', 'fryer', 'burners', 'griddle', 'fryer'] as const

/** The distance between two clips: a ticket's width and a plate's apart, for a front-page rail; closer on a longer rail. */
export const pitchOf = (slots: number): number => Math.max(0.12, Math.min(0.36, 1.44 / slots))
/** The middle of clip `slot`, across the pass. Clip 0 is nearest the printer, at the left. */
export const clipX = (slot: number, slots: number): number => (slot + 0.5 - slots / 2) * pitchOf(slots)
/** The pass's width: room for the printer and its tickets at the left, the clips, and the bin, the bell and the spike at the right. */
export const passWidth = (slots: number): number => Math.max(2.6, slots * pitchOf(slots) + 1.2)
/** A ticket's print: its cell of the atlas, from its number. */
export const cellOf = (req: number): number => (req * 5) % 8
/** A small, fixed lean for a ticket or a plate, from its number, so a row never looks stamped out. */
const lean = (n: number, amount: number): number => (((n * 37) % 11) / 11 - 0.5) * amount

/* ------------------------------------------------------------------------------------------------------------------ */
/* The kitchen: what stands still                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Tape {
  readonly id: string
  readonly center: Vec3
  readonly size: readonly [number, number]
  readonly rotation: Vec3
  readonly text: string
}

export interface ServiceKitchen {
  readonly slots: number
  /** The static set: every prop that never moves. */
  readonly items: readonly PropSpec[]
  readonly rail: { readonly at: Vec3; readonly length: number }
  readonly fired: { readonly at: Vec3; readonly length: number } | null
  readonly printer: { readonly at: Vec3; readonly yaw: number } | null
  readonly bell: Vec3
  readonly spike: Vec3
  readonly bin: Vec3 | null
  /** The heat lamps' light: from each bulb to the counter under it. */
  readonly lights: readonly { readonly id: string; readonly at: Vec3; readonly target: Vec3 }[]
  /** The line's stations, in order: the clips each one cooks for, where its steam rises, and where its warm light hangs. */
  readonly stations: readonly { readonly clips: readonly number[]; readonly top: Vec3; readonly glow: Vec3 }[]
  readonly tapes: readonly Tape[]
}

export interface KitchenOptions {
  /** Draw the printer and the tickets it has fed: a page that holds the printer itself (the front page) leaves them out. */
  readonly printer: boolean
  /** The level has the overlap switch: hang the fired rail and set the bin on the pass. */
  readonly overlap: boolean
}

/** The kitchen for a rail of `slots` clips: a function of the level's shape alone, so a fire never rebuilds it. */
export function serviceKitchen(slots: number, { printer, overlap }: KitchenOptions): ServiceKitchen {
  const width = passWidth(slots)
  const railLength = slots * pitchOf(slots) + 0.16
  const top = PASS.top
  const count = Math.min(slots, STATION_KINDS.length)
  const stationWidth = Math.min(0.58, 2.4 / count)
  const lineWidth = count * stationWidth
  const stationX = (s: number) => (s + 0.5 - count / 2) * stationWidth
  const stations: StationSpec[] = Array.from({ length: count }, (_, s) => ({
    kind: STATION_KINDS[s],
    id: `station-${s}`,
    at: [stationX(s), 0, LINE.z],
    width: stationWidth - 0.01,
    depth: LINE.depth,
    height: LINE.height,
    channel: s,
  }))
  const spread = Math.min(0.55, (slots * pitchOf(slots)) / 3)
  const drop = CEILING - MOUTH - 0.2015
  const lamps = [-spread, 0, spread].map((x, i) => ({ id: `lamp-${i}`, x }))
  const printerAt: Vec3 = [-width / 2 + 0.26, top, -0.12]
  const bell: Vec3 = [width / 2 - 0.46, top, 0.21]
  const spike: Vec3 = [width / 2 - 0.22, top, 0.17]
  const bin: Vec3 | null = overlap ? [width / 2 - 0.325, top, -0.1] : null
  const rail = { at: [0, RAIL.y, RAIL.z] as Vec3, length: railLength }
  const fired = overlap ? { at: [0, FIRED.y, FIRED.z] as Vec3, length: railLength } : null
  const items: PropSpec[] = [
    { kind: 'floor', id: 'floor', at: [0, 0, -0.6], width: 14, depth: 8 },
    { kind: 'tile-wall', id: 'wall', at: [0, 0, WALL_Z], width: 14, height: 3.1 },
    // The room's corner on the left, so the kitchen never ends in the haze beside the line.
    { kind: 'tile-wall', id: 'side', at: [-width / 2 - 1.3, 0, -0.5], yaw: Math.PI / 2, width: 3.8, height: 3.1 },
    { kind: 'hood', id: 'hood', at: [0, 2.5, WALL_Z], width: lineWidth + 0.4, depth: 1, height: 0.46 },
    ...stations,
    { kind: 'speed-rack', id: 'rack', at: [width / 2 + 0.75, 0, -1.35], yaw: -0.5, height: 1.72, shelves: 9, pans: [0, 1, 2, 4, 5, 7] },
    { kind: 'pass', id: 'pass', at: [0, 0, 0], width, depth: PASS.depth, height: top, strip: 0, gantry: PASS.gantry },
    { kind: 'rail', id: 'rail', at: rail.at, length: railLength },
    { kind: 'bell-base', id: 'bell', at: bell },
    { kind: 'spike', id: 'spike', at: spike },
    { kind: 'plate-stack', id: 'stack-l', at: [-width / 2 + 0.75, top - 0.37, 0], count: 6 },
    { kind: 'plate-stack', id: 'stack-r', at: [width / 2 - 0.75, top - 0.37, 0], count: 5 },
    ...lamps.map((lamp) => ({ kind: 'heat-lamp' as const, id: lamp.id, at: [lamp.x, CEILING, 0.04] as Vec3, drop, hang: 'cord' as const })),
  ]
  if (printer) items.push({ kind: 'printer', id: 'printer', at: printerAt, yaw: 0.18 })
  if (fired) items.push({ kind: 'rail', id: 'fired', at: fired.at, length: railLength, hang: BAR.y - FIRED.y })
  if (bin) items.push({ kind: 'pan', id: 'bin', at: bin, size: '1/1', depth: 0.1 })

  const tapes: Tape[] = [
    // The line's name on the tile over its last station, and the expo's on the pass's rolled front edge, where each one stands: one
    // high and far, one low and near, so the two never meet on any screen.
    { id: 'line', center: [stationX(count - 1), 1.24, WALL_Z + 0.004], size: [0.6, 0.07], rotation: [0, 0, 0.02], text: 'the line · gpu' },
    { id: 'expo', center: [0.15, top - 0.03, PASS.depth / 2 + 0.016], size: [0.42, 0.05], rotation: [-0.45, 0, -0.015], text: 'the expo · cpu' },
  ]
  if (bin) tapes.push({ id: 'bin', center: [bin[0], top + 0.094, bin[2] + 0.1625 + 0.0035], size: [0.12, 0.024], rotation: [-0.12, 0, 0.03], text: 'binned · ghost' })
  return {
    slots,
    items,
    rail,
    fired,
    printer: printer ? { at: printerAt, yaw: 0.18 } : null,
    bell,
    spike,
    bin,
    lights: lamps.map((lamp) => ({ id: lamp.id, at: [lamp.x, MOUTH - 0.02, 0.04] as Vec3, target: [lamp.x, top, PLATE_Z] as Vec3 })),
    stations: stations.map((station, s) => ({
      clips: Array.from({ length: slots }, (_, k) => k).filter((k) => Math.floor((k * count) / slots) === s),
      top: [station.at[0], LINE.height + 0.04, LINE.z - 0.02] as Vec3,
      glow: [station.at[0], 1.3, LINE.z + 0.55] as Vec3,
    })),
    tapes,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The night: what moves                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A ticket's place: hung by the middle of its top edge, turned, its print's cell, and where a new one comes from. */
export interface TicketPlace {
  readonly id: string
  readonly at: Vec3
  readonly rotation: Vec3
  readonly cell: number
  readonly from?: { readonly at: Vec3; readonly rotation?: Vec3; readonly delay?: number }
  readonly arc?: number
}

export interface PlateSpot {
  readonly id: string
  readonly at: Vec3
  readonly enter?: Vec3
  readonly leave?: Vec3
}

export type AnchorKind = 'ticket' | 'fired' | 'waiting' | 'empty' | 'more' | 'tape'

/** A label's anchor and its words: DOM over the canvas, never print in it. */
export interface Anchor {
  readonly id: string
  readonly kind: AnchorKind
  readonly at: Vec3
  /** `ticket:<id>` for print that rides on a ticket as it moves, or none for the world. */
  readonly frame?: string
  readonly text: string
  /** A fresh ticket's "new". */
  readonly sub?: string
  readonly place?: 'center' | 'above' | 'below' | 'left' | 'right'
  /** Hidden in a canvas narrower than this, in CSS px. */
  readonly minWidth?: number
}

export interface ServiceScene {
  readonly tickets: readonly TicketPlace[]
  /** The chrome balls in the rail's slot, and in the fired rail's: one per clip, at its x from the rail's middle. */
  readonly clips: readonly { readonly id: string; readonly x: number }[]
  /** Which stations burn, in order: a station burns where the latest fire cooked a course in one of its clips. */
  readonly lit: readonly boolean[]
  /** The plates of the last fire read back, on the pass, and the bin's. */
  readonly plates: readonly PlateSpot[]
  /** Whether the latest fire waited on the expo before it cooked: the line sat dark (the bubble). */
  readonly bubble: boolean
  readonly anchors: readonly Anchor[]
  /** The tickets on the counter, as boxes a pick can hit: a pick hangs the ticket. */
  readonly picks: readonly { readonly req: number; readonly center: Vec3 }[]
  /** Bumped each time the printer feeds a ticket onto the counter, and the print of the one it feeds. */
  readonly feed: number
  readonly feedCell: number
}

/** Where a ticket held by clip `slot` of a rail at `at` hangs from. */
const onClip = (at: Vec3, slot: number, slots: number): Vec3 => [at[0] + clipX(slot, slots), at[1] - GRIP, at[2] + 0.012]
const hungFrom = (req: number): Vec3 => [-0.05, 0, lean(req, 0.07)]

/**
 * Where a ticket lying flat must be held for its middle to land on (x, z) when it is turned `turn` in its own plane: a ticket hangs
 * from the middle of its top edge, so a flat one reaches half its length toward the expo from there.
 */
function lying(x: number, y: number, z: number, turn: number): Vec3 {
  const half = TICKET.height / 2
  return [x - half * Math.sin(turn), y, z - half * Math.cos(turn)]
}

export function serviceScene(view: LoopView, kitchen: ServiceKitchen): ServiceScene {
  const { slots, rail, fired, printer } = kitchen
  const top = PASS.top
  const tickets: TicketPlace[] = []
  const anchors: Anchor[] = []
  const label = (id: string, req: number, kind: AnchorKind, sub?: string): Anchor => ({ id: `no-${id}`, kind, at: [0, -0.026, 0.003], frame: `ticket:${id}`, text: ticketNo(req), sub, minWidth: kind === 'fired' ? 520 : undefined })

  // The tickets the printer has fed, on the counter in front of it; the rest are still inside it.
  const shown = printer ? view.waiting.slice(0, COUNTER_TICKETS) : []
  const tear = printer ? tearPose(printer.at, printer.yaw) : null
  const counter = (i: number, req: number): Vec3 => lying(-passWidth(slots) / 2 + 0.11 + i * 0.096, top + 0.0007 + i * 0.0003, 0.1, lean(req, 0.5))
  shown.forEach((req, i) => {
    const turn = lean(req, 0.5)
    tickets.push({ id: `t${req}`, at: counter(i, req), rotation: [-Math.PI / 2, 0, turn], cell: cellOf(req), from: tear ? { ...tear, delay: 420 } : undefined, arc: 0.05 })
    anchors.push(label(`t${req}`, req, 'waiting'))
  })
  const inPrinter = view.waiting.length - shown.length
  if (printer && inPrinter > 0) anchors.push({ id: 'more', kind: 'more', at: [printer.at[0], top + 0.17, printer.at[2]], text: `+${inPrinter}`, place: 'above' })

  // The rail: a ticket in every taken clip, its number in the DOM; an empty clip shows its stub.
  const enterLeft: Vec3 = [rail.at[0] - rail.length / 2 - 0.12, rail.at[1] - 0.05, rail.at[2] + 0.2]
  view.rail.forEach((clip, slot) => {
    if (clip.req === null) {
      anchors.push({ id: `empty-${slot}`, kind: 'empty', at: [rail.at[0] + clipX(slot, slots), rail.at[1] - GRIP - 0.05, rail.at[2] + 0.012], text: 'empty' })
      return
    }
    const id = `t${clip.req}`
    tickets.push({ id, at: onClip(rail.at, slot, slots), rotation: hungFrom(clip.req), cell: cellOf(clip.req), from: tear ?? { at: enterLeft, rotation: [-0.6, 0, 0.3] }, arc: 0.06 })
    anchors.push(label(id, clip.req, 'ticket', clip.fresh ? 'new' : undefined))
  })

  // The fired rail: a copy of each ticket of the fire on the line, come down from its clip on the rail.
  if (fired && view.firedRail) {
    view.firedRail.forEach((clip, slot) => {
      if (clip.req === null) return
      const id = `f${clip.req}`
      tickets.push({ id, at: onClip(fired.at, slot, slots), rotation: hungFrom(clip.req + 3), cell: cellOf(clip.req + 1), from: { at: onClip(rail.at, slot, slots), rotation: hungFrom(clip.req) } })
      anchors.push(label(id, clip.req, 'fired'))
    })
  }

  // Finished tickets, spiked: every ticket that has been in a fire and is on neither rail nor waiting, the latest on top.
  const last = new Map<number, number>()
  for (const fire of view.fires) for (const place of fire.places) if (place.req !== null) last.set(place.req, fire.index)
  const live = new Set([...view.rail, ...(view.firedRail ?? [])].flatMap((clip) => (clip.req === null ? [] : [clip.req])))
  const done = [...last].filter(([req]) => !live.has(req) && !view.waiting.includes(req)).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  done.slice(-SPIKED).forEach(([req], k) => {
    const turn = ((req * 53) % 17) / 17 - 0.5
    tickets.push({ id: `t${req}`, at: lying(kitchen.spike[0], kitchen.spike[1] + 0.026 + k * 0.0022, kitchen.spike[2], turn), rotation: [-Math.PI / 2, 0, turn], cell: cellOf(req), arc: 0.14 })
  })

  // The plates of the last fire read back: one under every clip that cooked a course; a binned plate goes into the bin.
  const served = [...view.fires].reverse().find((fire) => !fire.onLine)
  const plates: PlateSpot[] = []
  served?.places.forEach((place, slot) => {
    if (place.state !== 'plate') return
    const x = clipX(slot, slots)
    plates.push({ id: `p${served.index}-${slot}`, at: [x, top, PLATE_Z], enter: [x, top, ENTER_Z], leave: [x + 0.25, top + 0.45, 1.6] })
  })
  if (kitchen.bin) {
    const [bx, , bz] = kitchen.bin
    const binned = view.fires.filter((fire) => !fire.onLine).flatMap((fire) => fire.places.flatMap((place, slot) => (place.state === 'binned' ? [{ fire: fire.index, slot }] : [])))
    binned.slice(-BINNED).forEach(({ fire, slot }, j) => {
      plates.push({ id: `b${fire}-${slot}`, at: [bx + lean(fire + slot, 0.08), top + 0.002 + j * 0.0105, bz + lean(fire * 3 + slot, 0.05)], enter: [clipX(slot, slots), top, ENTER_Z] })
    })
  }

  const lit = stationsOf(view)
  const latest = view.fires[view.fires.length - 1]
  const balls = Array.from({ length: slots }, (_, slot) => ({ id: `clip-${slot}`, x: clipX(slot, slots) }))
  const feedReq = shown.length > 0 ? Math.max(...shown) : -1
  return {
    tickets,
    clips: balls,
    lit: kitchen.stations.map((station) => station.clips.some((slot) => lit[slot])),
    plates,
    bubble: latest !== undefined && latest.bubbleUs > 0,
    anchors: [...anchors, ...kitchen.tapes.map((tape): Anchor => ({ id: `tape-${tape.id}`, kind: 'tape', at: tape.center, text: tape.text, minWidth: tape.id === 'bin' ? 520 : undefined }))],
    picks: shown.map((req, i) => {
      const at = counter(i, req)
      const turn = lean(req, 0.5)
      return { req, center: [at[0] + (TICKET.height / 2) * Math.sin(turn), top + 0.004, at[2] + (TICKET.height / 2) * Math.cos(turn)] as Vec3 }
    }),
    feed: feedReq + 1,
    feedCell: cellOf(Math.max(0, feedReq)),
  }
}

/** Where a ticket just torn off the printer at `at`, turned `yaw`, starts from: hanging from its mouth (the kit's `tearPose`). */
function tearPose(at: Vec3, yaw: number): { at: Vec3; rotation: Vec3 } {
  // The kit's PRINTER_MOUTH: just behind the tear bar, from the printer's base.
  const [mx, my, mz] = [0, 0.15 * 0.72 + 0.014, 0.22 * 0.4]
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { at: [at[0] + mx * c + mz * s, at[1] + my, at[2] - mx * s + mz * c], rotation: [-0.5, yaw, 0] }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What moved                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How the latest change moves: on the bell, as the printer's feed, or as a cut (a new level, an undo, the first frame). */
export type Change = 'bell' | 'feed' | 'cut'

/** Reads what a new view changed from the one before: a fire rung is the bell, a ticket hung between bells is the printer. */
export function changeOf(before: LoopView | null, after: LoopView): Change {
  if (before === null || before.level !== after.level) return 'cut'
  if (after.step > before.step) return 'bell'
  if (after.step < before.step || after.waiting.length > before.waiting.length) return 'cut'
  if (after.waiting.length < before.waiting.length) return 'feed'
  return 'cut'
}
