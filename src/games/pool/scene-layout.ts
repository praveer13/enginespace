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
 *   - The fan: a selected page opens into the layers it serves, one thin slab for each layer of its KV group, the padding layers last and
 *     hollow, stacked above it. The page itself does not move; its layers rise out of it and spread.
 *
 * Every word and number is DOM: the labels are the label layer's, and the page says what is selected (Stage3D.tsx).
 */
import type { CameraPreset } from '@/scene/camera-rig'
import type { FlatBox, FlatLabel, FlatModel, FlatSegment } from '@/scene/flat-track'
import { PX } from '@/scene/flat-track'
import type { MarkForm } from '@/scene/marks'
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
/** The sheet's margin round the drawing. */
export const MARGIN = 44
/** A batch slot's tile, the widest it grows, and the gap between slots; the room under it for the threads' arch to start. */
export const SLOT = { depth: 26, height: 14, widest: 92, gap: 8 } as const
export const THREAD_ROOM = 58
/** A waiting request's wire, and the room between the rack and the queue. */
export const WAIT = { width: 46, depth: 20, height: 8, gap: 6, shown: 12, room: 26 } as const
/** The fan: the layers' height, how far the lowest rises over the page, the step between layers, and how far it spreads and stands back. */
export const FAN = { thick: 3, rise: 12, step: 9, tallest: 130, spread: 9, widest: 90, back: 4, size: 0.86 } as const
/** A thread: how many straight pieces it is drawn in, and how high it arches over the straight line [estimated]. */
export const THREAD = { pieces: 8, arch: 12, perPx: 0.18 } as const
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
  const reach = Math.hypot(to[0] - from[0], to[2] - from[2])
  const lift = THREAD.arch + THREAD.perPx * reach
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
const stepFor = (n: number): number => Math.min(FAN.step, (FAN.tallest - FAN.rise) / Math.max(1, n))

function fanBoxes(g: Geometry, fan: Fan, open: boolean): FlatBox[] {
  const n = fan.layers + fan.pads
  const at = pageBox(g, fan.page)
  const cx = (at.x0 + at.x1) / 2
  const cz = (at.z0 + at.z1) / 2
  const half = (PAGE.size * FAN.size) / 2
  const spread = Math.min(FAN.spread, FAN.widest / Math.max(1, n))
  return Array.from({ length: n }, (_, k) => {
    const x = open ? cx + (k - (n - 1) / 2) * spread : cx
    const z = open ? cz - k * FAN.back : cz
    const padding = k >= fan.layers
    return {
      id: `fan/${k}`,
      x0: x - half,
      x1: x + half,
      z0: z - half,
      z1: z + half,
      y0: open ? PAGE_TOP + FAN.rise + k * stepFor(n) : PAGE_TOP,
      height: FAN.thick,
      role: padding ? 'cat-white-edge' : pageRole[fan.state],
      form: padding ? 'hollow' : pageForm[fan.state],
      // A pick on a layer is a pick on its page: the same pick again closes the fan.
      pick: `page:${fan.page}`,
    } satisfies FlatBox
  })
}

/** How tall the fan stands over the sheet, for the cameras. */
export const fanTop = (n: number): number => PAGE_TOP + FAN.rise + n * stepFor(n) + FAN.thick

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

export function rackOf(view: PoolView, { station, chosen, pointed, pick }: RackOptions): Rack {
  const g = geometryOf(view.pans.length, view.cols, view.cap)
  const open = view.ask?.kind === 'evict' ? view.ask.candidates : []
  const shownPick = pick !== null && (pick.kind === 'page' ? view.pans[pick.id] !== undefined : view.running.includes(pick.id)) ? pick : null
  const request = threadedRequest(view, shownPick)
  const fan = fanOf(view, shownPick)

  const plates: FlatBox[] = [
    { id: 'plate/base', x0: -14, x1: g.width + 14, z0: -14, z1: g.depth + 14, y0: -10, height: 9.4, role: 'surface-2', form: 'solid', shadow: false },
    { id: 'plate/sheet', x0: 0, x1: g.width, z0: 0, z1: g.depth, y0: -0.6, height: 0.6, role: 'paper', form: 'solid', shadow: false },
    { id: 'plate/well', x0: g.rack.x0 - WELL.margin, x1: g.rack.x1 + WELL.margin, z0: g.rack.z0 - WELL.margin, z1: g.rack.z1 + WELL.margin, y0: 0, height: WELL.height, role: 'surface-2', form: 'solid', shadow: false },
  ]

  const boxes: FlatBox[] = []
  const rings: FlatBox[] = []
  const ring = (id: string, box: { x0: number; x1: number; z0: number; z1: number }, role: ColorRoleName, off: number, y0: number, height: number) =>
    rings.push({ id, x0: box.x0 - off, x1: box.x1 + off, z0: box.z0 - off, z1: box.z1 + off, y0, height, role, form: 'hollow', shadow: false })
  const chosenSet = new Set(chosen)
  for (const page of view.pans) {
    const at = pageBox(g, page.id)
    const state: PanState = chosenSet.has(page.id) ? 'evicted' : page.state
    boxes.push({ id: `page/${page.id}`, ...at, y0: WELL.height, height: PAGE.height, role: pageRole[state], form: pageForm[state], pick: `page:${page.id}` })
  }
  const lamp = (id: number, key: string) => {
    ring(`${key}/${id}/lamp`, pageBox(g, id), 'lamp', RING.off, WELL.height, RING.height)
    ring(`${key}/${id}/edge`, pageBox(g, id), 'lamp-ring', RING.off + 1.1, WELL.height, RING.edge)
  }
  for (const id of open) lamp(id, 'candidate')
  for (const id of pointed) if (!open.includes(id)) lamp(id, 'pointed')

  // The running batch: a tile for each request on the line, a dashed wire for each empty slot.
  const wires: FlatBox[] = []
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
    labels.push({ id: `chip/${id}`, at: [(box.x0 + box.x1) / 2, SLOT.height, (box.z0 + box.z1) / 2], text: reqName(id), kind: 'chip', place: 'center' })
    if (id === request) ring(`ring/slot/${at}`, box, 'lamp-ring', RING.off, 0, RING.edge + 0.6)
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
  for (const id of new Set(threaded)) ring(`held/${id}`, pageBox(g, id), 'lamp-ring', RING.off, WELL.height, RING.edge)
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

  // The words: each region's name, and the fan's.
  const left = g.rack.x0
  labels.push(
    { id: 'name/batch', at: [left, 0, g.slots.z0 - 38], text: 'Running batch', kind: 'band', place: 'right' },
    { id: 'name/pool', at: [left, WELL.height, g.rack.z0 - 22], text: `KV page pool, ${view.pans.length} pages`, kind: 'band', place: 'right' },
    { id: 'name/queue', at: [left, 0, g.queue.z0 - 18], text: 'Waiting queue', kind: 'band', place: 'right' },
  )
  const fanLabel = (n: number, f: Fan): FlatLabel => {
    const at = pageBox(g, f.page)
    return { id: 'fan/words', at: [at.x1 + 10, fanTop(n) * 0.55, (at.z0 + at.z1) / 2], text: `${f.layers} layers${f.pads > 0 ? ` + ${f.pads} padding` : ''}`, kind: 'dim', place: 'right' }
  }
  const stem = (f: Fan): FlatSegment => {
    const at = pageBox(g, f.page)
    const n = f.layers + f.pads
    return { x0: (at.x0 + at.x1) / 2, x1: (at.x0 + at.x1) / 2, z0: (at.z0 + at.z1) / 2, z1: (at.z0 + at.z1) / 2, y: PAGE_TOP, y1: fanTop(n) - FAN.thick }
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
  const model: FlatModel = fan === null ? common : { ...common, boxes: [...common.boxes, ...fanOpen], inks: [...inks, stem(fan)], labels: [...labels, fanLabel(fan.layers + fan.pads, fan)] }
  const closed: FlatModel = fan === null ? common : { ...common, boxes: [...common.boxes, ...fanShut] }
  return { model, closed, geometry: g, fan, request, threaded, moment: JSON.stringify([fan?.page ?? null, fan?.layers ?? null, fan?.pads ?? null, station]) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The camera                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Canvas {
  readonly width: number
  readonly height: number
}

const FOV = 30
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)

/** A shot from `deg` back from straight down, far enough to hold a sheet `w` by `d` and `up` high in a canvas of this aspect. */
function shot(w: number, d: number, up: number, canvas: Canvas, deg: number, margin: number): Pick<CameraPreset, 'position' | 'target' | 'fov'> {
  const aspect = canvas.width / Math.max(1, canvas.height)
  const rad = (deg * Math.PI) / 180
  const v = tan(FOV / 2)
  // Seen tilted, the sheet's depth is foreshortened and what stands on it adds its height.
  const dist = Math.max(w / 2 / (v * aspect), (d * Math.cos(rad) + up * Math.sin(rad)) / 2 / v) * margin
  const target: [number, number, number] = [w / 2, up * 0.12, d / 2]
  return { position: [target[0], dist * Math.cos(rad), target[2] + dist * Math.sin(rad)], target, fov: FOV }
}

/** The three cameras for a drawing in a canvas this size: Front of the page pool, One KV group (the same shot, with its group), From above. */
export function presetsFor(bounds: FlatModel['bounds'], canvas: Canvas, tallest = PAGE_TOP + 60): CameraPreset[] {
  const w = (bounds.x1 - bounds.x0) / PX
  const d = (bounds.z1 - bounds.z0) / PX
  const up = tallest / PX
  const narrow = canvas.width < 560
  const front = shot(w, d, up, canvas, narrow ? 38 : 46, narrow ? 1.2 : 1.3)
  const above = shot(w, d, up * 0.4, canvas, 8, 1.14)
  return [
    { id: 'front', label: 'front', shot: 'establish', projection: 'perspective', ...front },
    { id: 'station', label: 'station', shot: 'establish', projection: 'perspective', ...front },
    { id: 'top', label: 'top', shot: 'top', projection: 'perspective', ...above },
  ]
}
