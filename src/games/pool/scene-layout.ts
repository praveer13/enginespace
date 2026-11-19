/*
 * The KV page pool's 3D rack (REDESIGN §2.8, §2.9, §3.5): the session's view turned into what the scene draws. A pure function of
 * `PoolView`, the view that the 2D diagram and the mirror draw too, so the scene adds nothing the session did not compute and decides
 * nothing. No three here: it is tested under Bun, and only the scene's lazy chunk holds it.
 *
 * It is the 2D diagram laid on a base plate, in the diagram's own pixels (flat-track.ts: x across, z down the diagram, y up):
 *
 *   - The running batch, at the back: a slot for each batch slot, a paper tile for a running request, a dashed wire for an empty slot.
 *   - The rack, in the middle: a well holding every page in its cell, in rows of `view.cols`, each cell engraved in the sheet. A page
 *     never moves: it stands in its cell for its whole life and only changes state where it stands. A state is a form as well as a
 *     colour (WCAG 1.4.1): free is hollow, in use is solid, cached is hatched, shared by a prefix hit is dotted, an adapter's is a groove.
 *   - The waiting queue, in front, as dashed wires: requests that are not in the pool yet.
 *   - The threads: a request's block table, drawn as one thread from its slot to each page it holds, in the arch depth gives them. A page
 *     two requests share has two threads end on it, which no flat drawing shows.
 *   - The fan: a page opens into the layers it serves, one thin slab for each layer of its KV group, the padding layers last and hollow,
 *     stacked above it. The page itself does not move; its layers rise out of it and spread toward the middle of the rack. The page that
 *     opens is the one selected, or while a request shows, the page of its block table nearest the front, so the scene opens on both things depth
 *     shows (a request's threads, and one of its pages standing up into its layers) without a click.
 *   - The glyphs: each page carries its state's glyph on its top, the 2D diagram's circle, diamond, hexagon, square, triangle and ring, so
 *     the legend under the scene is the 2D view's own.
 *
 * Every word and number is DOM: the labels are the label layer's, and the page says what is selected (Stage3D.tsx).
 */
import type { CameraPreset } from '@/scene/camera-rig'
import type { FlatBox, FlatLabel, FlatModel, FlatSegment } from '@/scene/flat-track'
import { PX } from '@/scene/flat-track'
import type { MarkForm } from '@/scene/marks'
import { SLOT_MARKS, type GlyphShape } from '@/design/code'
import type { ColorRoleName } from '@/design/tokens'
import type { PanState, PanView, PoolView } from '@es/play/pool/types'
import type { PoolPick } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The measures, in the diagram's px [estimated, set by eye in the front shot at 1440 and 390]                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A page's cell: the page's footprint, the pitch of a row and a column, and the page's height over the well's floor. */
export const PAGE = { size: 24, pitch: 30, height: 10 } as const
/** The well the pages stand in: its height, and how far it reaches past the cells. */
export const WELL = { height: 4, margin: 5 } as const
/** The sheet's margin round the drawing, and how far the paper reaches past it on every side. */
export const MARGIN = 44
const BLEED = 900
/** A batch slot's tile, the widest it grows, and the gap between slots; the room under it for the threads' arch to start. */
export const SLOT = { depth: 26, height: 14, widest: 92, gap: 8 } as const
export const THREAD_ROOM = 110
/** A waiting request's wire, and the room between the rack and the queue. Eight show, so the queue and its "and N more" stay under the rack. */
export const WAIT = { width: 46, depth: 20, height: 8, gap: 6, shown: 8, room: 36 } as const
/** The room the region names take at the rack's left, in the diagram's px, which the cameras keep in the frame [estimated]. */
export const NAME_ROOM = 92
/** The room a request's name takes over its tile, in the diagram's px, which the cameras keep in the frame [estimated]. */
const NAME_HEIGHT = 34
/** How far behind the batch a request's name reaches on the sheet, seen from above [estimated: a line of the label face at the top shot's scale]. */
const NAME_BACK = 22
/** A page's glyph, as a share of the page (the 2D cell's 55%, a free page's ring 40%), and how far it lies over the page's top [estimated]. */
export const GLYPH = { size: 0.55, free: 0.4, lift: 0.5 } as const
/**
 * The fan: the layers' height, how far the lowest rises over the page, the step between layers and the most they climb, how far they
 * spread toward the middle of the rack, and how far they lean toward the front, so the stack stands clear of the batch behind the rack
 * from every row [estimated, set by eye in the front shot at 1440].
 */
export const FAN = { thick: 3, rise: 8, step: 9, tallest: 76, low: 46, perRow: 15, spread: 9, widest: 90, lean: 12, leanMost: 28, size: 0.86 } as const
/** How far toward the front a fan's top stands from the rack's back edge at the least, so a page's layers stand over the rack, not over the batch. */
const FAN_FRONT = 2.5 * PAGE.pitch
/**
 * A thread: how many straight pieces it is drawn in, and how high it arches over the straight line, by how far it runs toward the front
 * [estimated]. The arch grows with the run from the batch to the page's row, not with the run across, so a thread never climbs over the
 * batch's tiles and their names on its way to a page at the far side of the rack.
 */
export const THREAD = { pieces: 8, arch: 12, perPx: 0.12 } as const
/** The rings round a page or a tile: how far they stand off it, and their height. */
export const RING = { off: 1.5, edge: 1.4, height: 2.2 } as const

/** The presets' ids, as scene-presets.ts names them for the page's plates (a test holds the two lists equal). */
export const SHOTS = ['front', 'station', 'top'] as const

/** The form a page's state is drawn in: the shape that carries it besides its colour. */
export const pageForm: Readonly<Record<PanState, MarkForm>> = { free: 'hollow', used: 'solid', cached: 'marked', shared: 'dotted', adapter: 'groove', evicted: 'marked' }
/** The colour role of a page's state: the design system's memory roles (free is drawn in its edge, since white would not show on paper). */
export const pageRole: Readonly<Record<PanState, ColorRoleName>> = {
  free: 'cat-white-edge',
  used: 'memory-used',
  cached: 'memory-cached',
  shared: 'memory-shared',
  adapter: 'memory-adapter',
  evicted: 'memory-evicted',
}

/** A page's glyph and the role it is drawn in: the 2D cell's, a white glyph on a dark fill and an ink one on a pale fill. */
const GLYPHS: Readonly<Record<PanState, readonly [GlyphShape, ColorRoleName]>> = {
  free: [SLOT_MARKS.white.glyph, 'paper-rule'],
  used: [SLOT_MARKS.blue.glyph, 'cat-blue-ink'],
  cached: [SLOT_MARKS.yellow.glyph, 'cat-yellow-ink'],
  shared: [SLOT_MARKS.green.glyph, 'cat-green-ink'],
  adapter: [SLOT_MARKS.brown.glyph, 'cat-brown-ink'],
  evicted: [SLOT_MARKS.red.glyph, 'cat-red-ink'],
}

/** A glyph on a page's top: its centre, its height over the sheet, its width across, its shape and its role. */
export interface PageGlyph {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly z: number
  readonly size: number
  readonly shape: GlyphShape
  readonly role: ColorRoleName
}

/** A request's short name on the drawing and in the lists: request 0 is R1 (words.ts says it too, but the scene may not import the page). */
const reqName = (id: number): string => `R${id + 1}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where things stand                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Geometry {
  readonly cols: number
  readonly rows: number
  /** The sheet's width and depth. */
  readonly width: number
  readonly depth: number
  readonly slots: { readonly z0: number; readonly z1: number; readonly width: number; readonly x0: number }
  readonly rack: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
  readonly queue: { readonly z0: number; readonly z1: number }
}

/** The drawing's shape for a pool of `pages` pages in rows of `cols`, and a batch of `cap` slots: a function of the level, so no decision moves it. */
export function geometryOf(pages: number, cols: number, cap: number): Geometry {
  const rows = Math.ceil(pages / cols)
  const rackWidth = cols * PAGE.pitch
  const width = rackWidth + 2 * MARGIN
  const slotZ0 = MARGIN
  const slotZ1 = slotZ0 + SLOT.depth
  const rackZ0 = slotZ1 + THREAD_ROOM
  const rackZ1 = rackZ0 + rows * PAGE.pitch
  const queueZ0 = rackZ1 + WAIT.room
  const queueZ1 = queueZ0 + WAIT.depth
  const slotWidth = Math.min(SLOT.widest, (rackWidth - (cap - 1) * SLOT.gap) / cap)
  return {
    cols,
    rows,
    width,
    depth: queueZ1 + MARGIN,
    slots: { z0: slotZ0, z1: slotZ1, width: slotWidth, x0: MARGIN },
    rack: { x0: MARGIN, x1: MARGIN + rackWidth, z0: rackZ0, z1: rackZ1 },
    queue: { z0: queueZ0, z1: queueZ1 },
  }
}

/** A page's footprint on the sheet. */
export function pageBox(g: Geometry, id: number): { x0: number; x1: number; z0: number; z1: number } {
  const x = g.rack.x0 + (id % g.cols) * PAGE.pitch + (PAGE.pitch - PAGE.size) / 2
  const z = g.rack.z0 + Math.floor(id / g.cols) * PAGE.pitch + (PAGE.pitch - PAGE.size) / 2
  return { x0: x, x1: x + PAGE.size, z0: z, z1: z + PAGE.size }
}

/** A running request's slot tile: its footprint, by the slot it hangs in. */
export function slotBox(g: Geometry, at: number): { x0: number; x1: number; z0: number; z1: number } {
  const x0 = g.slots.x0 + at * (g.slots.width + SLOT.gap)
  return { x0, x1: x0 + g.slots.width, z0: g.slots.z0, z1: g.slots.z1 }
}

/** The height of a page's top over the sheet. */
export const PAGE_TOP = WELL.height + PAGE.height

/* ------------------------------------------------------------------------------------------------------------------ */
/* Threads and the fan                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A thread from one point to another, drawn in `THREAD.pieces` straight pieces that arch between them. */
export function thread(from: readonly [number, number, number], to: readonly [number, number, number]): FlatSegment[] {
  const lift = THREAD.arch + THREAD.perPx * Math.abs(to[2] - from[2])
  const at = (t: number): [number, number, number] => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + lift * Math.sin(Math.PI * t), from[2] + (to[2] - from[2]) * t]
  return Array.from({ length: THREAD.pieces }, (_, i) => {
    const a = at(i / THREAD.pieces)
    const b = at((i + 1) / THREAD.pieces)
    return { x0: a[0], z0: a[2], y: a[1], x1: b[0], z1: b[2], y1: b[1] }
  })
}

export interface Fan {
  /** The page that opens. */
  readonly page: number
  readonly layers: number
  readonly pads: number
  /** The layer's state, which the real layers are drawn in. */
  readonly state: PanState
}

/** The layers' step for a stack of `n`, so the tallest fan stays under `FAN.tallest`. */
const stepFor = (n: number, tallest: number = FAN.tallest): number => Math.min(FAN.step, (tallest - FAN.rise) / Math.max(1, n))
/** The most a fan on page `page` climbs: less in the back rows, where the batch stands behind it on the screen [estimated]. */
const tallestFor = (g: Geometry, page: number): number => Math.min(FAN.tallest, FAN.low + Math.floor(page / g.cols) * FAN.perRow)
/** How far each layer of a stack of `n` on page `page` leans toward the front of the one under it: further for a page in the back rows. */
const leanFor = (g: Geometry, page: number, n: number): number =>
  Math.min(FAN.lean, Math.max(FAN.leanMost, FAN_FRONT - Math.floor(page / g.cols) * PAGE.pitch) / Math.max(1, n))

/** Where the fan's layer `k` of `n` stands across: the first over its page, the rest stepping toward the middle of the rack, so a fan at the
 * rack's edge never leans over the region names. */
function fanX(g: Geometry, fan: Fan, k: number, n: number): number {
  const at = pageBox(g, fan.page)
  const toward = fan.page % g.cols < g.cols / 2 ? 1 : -1
  return (at.x0 + at.x1) / 2 + toward * k * Math.min(FAN.spread, FAN.widest / Math.max(1, n))
}

function fanBoxes(g: Geometry, fan: Fan, open: boolean): FlatBox[] {
  const n = fan.layers + fan.pads
  const at = pageBox(g, fan.page)
  const cx = (at.x0 + at.x1) / 2
  const cz = (at.z0 + at.z1) / 2
  const half = (PAGE.size * FAN.size) / 2
  return Array.from({ length: n }, (_, k) => {
    const x = open ? fanX(g, fan, k, n) : cx
    const z = open ? cz + k * leanFor(g, fan.page, n) : cz
    const padding = k >= fan.layers
    return {
      id: `fan/${k}`,
      x0: x - half,
      x1: x + half,
      z0: z - half,
      z1: z + half,
      y0: open ? PAGE_TOP + FAN.rise + k * stepFor(n, tallestFor(g, fan.page)) : PAGE_TOP,
      height: FAN.thick,
      role: padding ? 'cat-white-edge' : pageRole[fan.state],
      form: padding ? 'hollow' : pageForm[fan.state],
      // A pick on a layer is a pick on its page: the same pick again closes the fan.
      pick: `page:${fan.page}`,
      // The layers stand in the air over their page, one sheet: a contact shadow under each would lay a blurred smear over the cells
      // beneath (the Flat Paper Rule). The first layer rises out of the page itself, so the fan needs no stem to say whose it is.
      shadow: false,
    } satisfies FlatBox
  })
}

/** How tall the fan stands over the sheet, for the cameras. */
export const fanTop = (n: number, tallest: number = FAN.tallest): number => PAGE_TOP + FAN.rise + n * stepFor(n, tallest) + FAN.thick

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rack                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface RackOptions {
  /** The KV group that One KV group shows, by index, or null for every group's threads. */
  readonly station: number | null
  /** The pages chosen to be evicted, while an eviction is open. */
  readonly chosen: readonly number[]
  /** The pages a dock row points at. */
  readonly pointed: readonly number[]
  readonly pick: PoolPick | null
}

export interface Rack {
  readonly model: FlatModel
  /** The same drawing with the fan closed onto its page: where the move that opens it starts. */
  readonly closed: FlatModel
  /** Each page's glyph, which the scene draws flat on its top. */
  readonly glyphs: readonly PageGlyph[]
  readonly geometry: Geometry
  readonly fan: Fan | null
  /** The request whose threads are drawn: the one selected, else the one hung last. Null when none is on the line. */
  readonly request: number | null
  /** The pages that threads end on. */
  readonly threaded: readonly number[]
  /** Changes whenever the fan does: the move that opens it plays again. */
  readonly moment: string
}

/** The pages a request holds in each group, in the order of its blocks. */
function tableOf(view: PoolView, req: number, station: number | null): PanView[][] {
  return view.stations.map((_, g) => (station !== null && g !== station ? [] : view.pans.filter((pan) => pan.station === g && pan.holders.includes(req)).sort((a, b) => (a.block ?? 0) - (b.block ?? 0))))
}

/** The request whose threads show: the one the learner selected, or while nothing is selected, the one hung last (none while a page is selected). */
export function threadedRequest(view: PoolView, pick: PoolPick | null): number | null {
  if (pick?.kind === 'request') return view.running.includes(pick.id) ? pick.id : null
  return pick === null ? (view.running[view.running.length - 1] ?? null) : null
}

/** The fan of the selected page, when it is a page of a group (a bare page and an adapter's have no layers). */
export function fanOf(view: PoolView, pick: PoolPick | null): Fan | null {
  if (pick?.kind !== 'page') return null
  const page = view.pans[pick.id] as PanView | undefined
  if (page === undefined || page.station === null) return null
  const group = view.stations[page.station]
  return { page: page.id, layers: group.layers, pads: group.padLayers, state: page.state }
}

/**
 * The page that opens while a request shows: of its block table's pages, the one nearest the front of the rack (the first in the table's
 * order among those), so its layers stand over the rack and not between the threads (Select3D.tsx says it in words).
 */
export function headPage(view: PoolView, req: number | null, station: number | null): number | null {
  if (req === null) return null
  let head: PanView | null = null
  for (const page of tableOf(view, req, station).flat()) if (head === null || Math.floor(page.id / view.cols) > Math.floor(head.id / view.cols)) head = page
  return head?.id ?? null
}

/** How tall the tallest fan of a level stands, with its words over it: the room the cameras keep over the back row. */
export const fanRoom = (view: PoolView): number => fanTop(Math.max(1, ...view.stations.map((group) => group.layers + group.padLayers))) + 22

export function rackOf(view: PoolView, { station, chosen, pointed, pick }: RackOptions): Rack {
  const g = geometryOf(view.pans.length, view.cols, view.cap)
  const open = view.ask?.kind === 'evict' ? view.ask.candidates : []
  const shownPick = pick !== null && (pick.kind === 'page' ? view.pans[pick.id] !== undefined : view.running.includes(pick.id)) ? pick : null
  const request = threadedRequest(view, shownPick)
  // The page selected fans; while a request shows, the first page of its block table does.
  const head = headPage(view, request, station)
  const fan = fanOf(view, shownPick) ?? fanOf(view, head === null ? null : { kind: 'page', id: head })

  // The sheet reaches past the frame on every side, so the cameras, which frame the rack, show paper to the box's edges.
  const plates: FlatBox[] = [
    { id: 'plate/base', x0: -BLEED - 14, x1: g.width + BLEED + 14, z0: -BLEED - 14, z1: g.depth + BLEED + 14, y0: -10, height: 9.4, role: 'surface-2', form: 'solid', shadow: false },
    { id: 'plate/sheet', x0: -BLEED, x1: g.width + BLEED, z0: -BLEED, z1: g.depth + BLEED, y0: -0.6, height: 0.6, role: 'paper', form: 'solid', shadow: false },
    { id: 'plate/well', x0: g.rack.x0 - WELL.margin, x1: g.rack.x1 + WELL.margin, z0: g.rack.z0 - WELL.margin, z1: g.rack.z1 + WELL.margin, y0: 0, height: WELL.height, role: 'surface-2', form: 'solid', shadow: false },
  ]

  const boxes: FlatBox[] = []
  const rings: FlatBox[] = []
  const ring = (id: string, box: { x0: number; x1: number; z0: number; z1: number }, role: ColorRoleName, off: number, y0: number, height: number) =>
    rings.push({ id, x0: box.x0 - off, x1: box.x1 + off, z0: box.z0 - off, z1: box.z1 + off, y0, height, role, form: 'hollow', shadow: false })
  const chosenSet = new Set(chosen)
  // A free page is empty: a dashed wire outline in its cell, as every empty thing is in 3D (REDESIGN §2.8), lighter than any page in use.
  // Each page carries its state's glyph, as the 2D cell does: on its top, or a free page's ring on the floor of its cell.
  const wires: FlatBox[] = []
  const glyphs: PageGlyph[] = []
  for (const page of view.pans) {
    const at = pageBox(g, page.id)
    const state: PanState = chosenSet.has(page.id) ? 'evicted' : page.state
    if (state === 'free') wires.push({ id: `page/${page.id}`, ...at, y0: WELL.height, height: PAGE.height, role: 'edge', form: 'hollow' })
    else boxes.push({ id: `page/${page.id}`, ...at, y0: WELL.height, height: PAGE.height, role: pageRole[state], form: pageForm[state], pick: `page:${page.id}` })
    const [shape, role] = GLYPHS[state]
    const free = state === 'free'
    glyphs.push({ id: page.id, x: (at.x0 + at.x1) / 2, z: (at.z0 + at.z1) / 2, y: (free ? WELL.height : PAGE_TOP) + GLYPH.lift, size: PAGE.size * (free ? GLYPH.free : GLYPH.size), shape, role })
  }
  const lamp = (id: number, key: string) => {
    ring(`${key}/${id}/lamp`, pageBox(g, id), 'marker', RING.off, WELL.height, RING.height)
    ring(`${key}/${id}/edge`, pageBox(g, id), 'marker-edge', RING.off + 1.1, WELL.height, RING.edge)
  }
  for (const id of open) lamp(id, 'candidate')
  for (const id of pointed) if (!open.includes(id)) lamp(id, 'pointed')

  // The running batch: a tile for each request on the line, a dashed wire for each empty slot.
  const labels: FlatLabel[] = []
  const inks: FlatSegment[] = []
  for (let at = 0; at < view.cap; at++) {
    const box = slotBox(g, at)
    const id = view.running[at]
    if (id === undefined) {
      wires.push({ id: `slot/${at}`, ...box, height: SLOT.height, role: 'edge', form: 'hollow' })
      continue
    }
    boxes.push({ id: `slot/${at}`, ...box, height: SLOT.height, role: 'paper', form: 'solid', pick: `req:${id}` })
    // Its name stands over its far edge, as a tab: its threads leave from the near edge and arch toward the front, so none crosses it.
    labels.push({ id: `chip/${id}`, at: [(box.x0 + box.x1) / 2, SLOT.height, box.z0], text: reqName(id), kind: 'chip', place: 'above' })
    if (id === request) ring(`ring/slot/${at}`, box, 'marker-edge', RING.off, 0, RING.edge + 0.6)
  }

  // The threads of the request shown: one from its tile to each page of its block table, a page two requests hold with a thread from each.
  const threaded: number[] = []
  const throughSlot = (req: number, pages: readonly PanView[], spreadOver: number, offset: number) => {
    const at = view.running.indexOf(req)
    if (at < 0) return
    const box = slotBox(g, at)
    pages.forEach((page, i) => {
      const n = spreadOver
      const along = Math.min(5, (g.slots.width - 12) / Math.max(1, n))
      const start: [number, number, number] = [(box.x0 + box.x1) / 2 + (offset + i - (n - 1) / 2) * along, SLOT.height, box.z1]
      const to = pageBox(g, page.id)
      inks.push(...thread(start, [(to.x0 + to.x1) / 2, PAGE_TOP, (to.z0 + to.z1) / 2]))
      threaded.push(page.id)
    })
  }
  if (request !== null) {
    const table = tableOf(view, request, station)
    const total = table.reduce((sum, list) => sum + list.length, 0)
    let offset = 0
    for (const list of table) {
      throughSlot(request, list, total, offset)
      offset += list.length
    }
  } else if (fan !== null) {
    // A page selected: a thread from each request that holds it.
    const page = view.pans[fan.page]
    page.holders.forEach((req, i) => throughSlot(req, [page], page.holders.length, i))
  }
  for (const id of new Set(threaded)) ring(`held/${id}`, pageBox(g, id), 'marker-edge', RING.off, WELL.height, RING.edge)
  if (pick?.kind === 'page' && view.pans[pick.id] !== undefined) lamp(pick.id, 'selected')

  // The waiting queue: requests not in the pool yet, as dashed wires.
  const shown = view.waiting.slice(0, WAIT.shown)
  shown.forEach((id, i) => {
    const x0 = g.rack.x0 + i * (WAIT.width + WAIT.gap)
    wires.push({ id: `wait/${id}`, x0, x1: x0 + WAIT.width, z0: g.queue.z0, z1: g.queue.z1, height: WAIT.height, role: 'edge', form: 'hollow' })
    labels.push({ id: `wait-label/${id}`, at: [x0 + WAIT.width / 2, WAIT.height, (g.queue.z0 + g.queue.z1) / 2], text: reqName(id), kind: 'chip', place: 'center' })
  })
  if (view.waiting.length > shown.length) {
    const x = g.rack.x0 + shown.length * (WAIT.width + WAIT.gap)
    labels.push({ id: 'wait-more', at: [x, 0, (g.queue.z0 + g.queue.z1) / 2], text: `and ${view.waiting.length - shown.length} more`, kind: 'idle', place: 'right' })
  }

  // The cells, engraved in the sheet: a rule on each side of a cell.
  const rules: FlatSegment[] = []
  for (let c = 0; c <= g.cols; c++) rules.push({ x0: g.rack.x0 + c * PAGE.pitch, x1: g.rack.x0 + c * PAGE.pitch, z0: g.rack.z0, z1: g.rack.z1, y: WELL.height })
  for (let r = 0; r <= g.rows; r++) rules.push({ x0: g.rack.x0, x1: g.rack.x1, z0: g.rack.z0 + r * PAGE.pitch, z1: g.rack.z0 + r * PAGE.pitch, y: WELL.height })

  // The words: each region's name where no thread runs: the batch's and the queue's level with them at the left of the sheet (every thread
  // goes from a slot to a page right of the rack's left edge), and the pool's under its front row; and the fan's.
  const left = g.rack.x0 - 8
  labels.push(
    { id: 'name/batch', at: [left, 0, (g.slots.z0 + g.slots.z1) / 2], text: 'Running batch', kind: 'band', place: 'left' },
    { id: 'name/pool', at: [g.rack.x0, WELL.height, g.rack.z1 + 14], text: `KV page pool, ${view.pans.length} pages`, kind: 'band', place: 'right' },
    { id: 'name/queue', at: [left, 0, (g.queue.z0 + g.queue.z1) / 2], text: 'Waiting queue', kind: 'band', place: 'left' },
  )
  // The fan's words stand over its top layer, clear of the pages, the threads and the region names.
  const fanLabel = (n: number, f: Fan): FlatLabel => {
    const at = pageBox(g, f.page)
    return { id: 'fan/words', at: [fanX(g, f, n - 1, n), fanTop(n, tallestFor(g, f.page)), (at.z0 + at.z1) / 2 + (n - 1) * leanFor(g, f.page, n)], text: `${f.layers} layers${f.pads > 0 ? ` + ${f.pads} padding` : ''}`, kind: 'dim', place: 'above' }
  }

  const base: Omit<FlatModel, 'boxes' | 'inks' | 'labels'> = {
    plates,
    wires,
    rules,
    cursors: [],
    bounds: { x0: 0, x1: g.width, z0: 0, z1: g.depth },
  }
  const fanOpen = fan === null ? [] : fanBoxes(g, fan, true)
  const fanShut = fan === null ? [] : fanBoxes(g, fan, false)
  const common = { ...base, boxes: [...boxes, ...rings], inks, labels }
  const model: FlatModel = fan === null ? common : { ...common, boxes: [...common.boxes, ...fanOpen], inks, labels: [...labels, fanLabel(fan.layers + fan.pads, fan)] }
  const closed: FlatModel = fan === null ? common : { ...common, boxes: [...common.boxes, ...fanShut] }
  return { model, closed, glyphs, geometry: g, fan, request, threaded, moment: JSON.stringify([fan?.page ?? null, fan?.layers ?? null, fan?.pads ?? null, station, shownPick?.kind ?? null]) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The camera                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Canvas {
  readonly width: number
  readonly height: number
}

const FOV = 30
/**
 * How far each shot looks back from straight down, in degrees, and the share of the box the drawing leaves free round it [estimated, set by
 * eye at 1440]. The front shot takes the tilt in its range that fills the box best: a wide box and a shallow pool look further across, a
 * deep pool or a tall box further down.
 */
const TILT = { front: [52, 48, 44, 40], top: 8 } as const
const MARGIN_SHARE = 1.06

type Point = readonly [number, number, number]

/**
 * A shot from `deg` back from straight down that holds every point, in world units, centred in a canvas of this aspect and filling it
 * but for the margin: the camera's distance and aim are found by a few rounds of projecting the points and correcting both.
 */
export function fit(points: readonly Point[], canvas: Canvas, deg: number, margin = MARGIN_SHARE): Pick<CameraPreset, 'position' | 'target' | 'fov'> & { fill: number } {
  const aspect = canvas.width / Math.max(1, canvas.height)
  const v = Math.tan((FOV * Math.PI) / 360)
  const c = Math.cos((deg * Math.PI) / 180)
  const s = Math.sin((deg * Math.PI) / 180)
  // The view looks along (0, -c, -s); right is +x and up on the screen is (0, s, -c).
  const n = points.length
  let target: [number, number, number] = [points.reduce((a, p) => a + p[0], 0) / n, 0, points.reduce((a, p) => a + p[2], 0) / n]
  let dist = 10
  let fill = 0
  for (let round = 0; round < 24; round++) {
    const eye = [target[0], target[1] + c * dist, target[2] + s * dist]
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const p of points) {
      const dx = p[0] - eye[0]
      const dy = p[1] - eye[1]
      const dz = p[2] - eye[2]
      const depth = -c * dy - s * dz
      const sx = dx / (depth * v * aspect)
      const sy = (s * dy - c * dz) / (depth * v)
      x0 = Math.min(x0, sx)
      x1 = Math.max(x1, sx)
      y0 = Math.min(y0, sy)
      y1 = Math.max(y1, sy)
    }
    const across = ((x0 + x1) / 2) * dist * v * aspect
    const up = ((y0 + y1) / 2) * dist * v
    target = [target[0] + across, target[1] + s * up, target[2] - c * up]
    fill = ((x1 - x0) / 2) * ((y1 - y0) / 2)
    dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) * margin
  }
  return { position: [target[0], target[1] + c * dist, target[2] + s * dist], target, fov: FOV, fill }
}

/** What the cameras hold, in world units: the batch, the rack with the region names at its left, the queue, and the tallest fan over the back row. */
export function framePoints(g: Geometry, fanHeight: number): Point[] {
  const x0 = (g.rack.x0 - NAME_ROOM) / PX
  const x1 = g.rack.x1 / PX
  // Behind the batch, the requests' names over their tiles: from above they stand on the sheet behind the tiles, not over them.
  const back = (g.slots.z0 - NAME_BACK) / PX
  const front = (g.queue.z1 + 4) / PX
  const row = (g.rack.z0 + PAGE.pitch / 2 + FAN.leanMost) / PX
  const up = fanHeight / PX
  return [
    [x0, 0, back],
    [x1, 0, back],
    // The requests' names stand over the tiles' far edge, a line of type high [estimated].
    [x0, (SLOT.height + NAME_HEIGHT) / PX, back],
    [x1, (SLOT.height + NAME_HEIGHT) / PX, back],
    [x0, 0, front],
    [x1, 0, front],
    [g.rack.x0 / PX, up, row],
    [x1, up, row],
  ]
}

/**
 * The three cameras for a drawing in a canvas this size: Front of the page pool, One KV group (the same shot, with its group), From above.
 * Each frames the rack, not the sheet, with room over the back row for the tallest fan the level has, so a fan opens inside the frame and
 * the camera never moves while the learner plays.
 */
export function presetsFor(g: Geometry, canvas: Canvas, fanHeight: number): CameraPreset[] {
  const points = framePoints(g, fanHeight)
  // The most tilted shot that fills the box within a few hundredths of the best one does: depth reads more the further across it looks.
  const shots = TILT.front.map((deg) => fit(points, canvas, deg))
  const best = Math.max(...shots.map((candidate) => candidate.fill))
  const shotOf = ({ position, target, fov }: ReturnType<typeof fit>) => ({ position, target, fov })
  const front = shotOf(shots.find((candidate) => candidate.fill >= best - 0.04) as (typeof shots)[number])
  const above = shotOf(fit(points, canvas, TILT.top))
  return [
    { id: 'front', label: 'front', shot: 'establish', projection: 'perspective', ...front },
    { id: 'station', label: 'station', shot: 'establish', projection: 'perspective', ...front },
    { id: 'top', label: 'top', shot: 'top', projection: 'perspective', ...above },
  ]
}
