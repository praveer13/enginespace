/**
 * Service's layout (A§6.3, GAMES.md §3 "2D path", §2.6 "Service"): a view of the night turned into positioned marks. The 2D view
 * and the poster draw the marks as SVG (`frameSvg`), and W0-T17's 3D scene reads the same view for its own primitives.
 *
 * A mark is a rect, a line, a circle or a piece of text, painted with a token role of src/design/tokens.ts and never a colour
 * (rule 9, D-047). A role becomes `var(--es-<role>)` in the SVG, so the drawing changes with the design system and carries no
 * literal colour or face. tests/play/loop-layout.test.ts checks that every role used exists.
 *
 * The drawing, in the kitchen's objects (GAMES.md §2.6):
 *   - the printer, at the left, with the waiting tickets curling out of it;
 *   - the rail, with a clip for each slot and a ticket hung on every taken clip; and, when a fire is on the line, the fired rail
 *     beneath it, which holds that fire while the expo fills the rail for the next one;
 *   - the heat lamp, pooled over the rail while the night is open: the rail is the present;
 *   - the expo's lane (CPU): a slab for each plan and for each read;
 *   - the line (GPU): a lit slab for each fire, with a place for every clip, a plate (solid, with the ticket's number), an empty
 *     place (an open groove, dark) or a binned plate (hollow, struck through); dark stretches between fires are the bubbles.
 * The state of a place is its shape before its colour (WCAG 1.4.1).
 *
 * Time runs along the lanes: left to right in landscape, and top to bottom in portrait, where a phone's height shows history
 * (GAMES.md §2.3, "Portrait framing"). The lanes show a window of the night's last ticks, and it moves by whole fires, so under
 * reduced motion history steps and does not scroll. Fires older than the last 48 [estimated] lose their places and stay as slabs, and
 * a hard cap of 2,000 marks backs that up (A§6.4): a window too long for it loses its numbers, then its places, then its oldest fires.
 *
 * Every number the drawing writes is a ticket's number or an axis label. The counters are DOM, in the printer tape and the mirror.
 */
import type { Us } from '@es/sim/core'
import type { Span } from '@es/sim/steploop'
import { countMarks, num } from './svg'
import type { SvgNode } from './svg'
import type { ClipView, FireView, LoopView, PlaceView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Marks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The token roles the drawing paints with (src/design/tokens.ts). `none` is no paint. */
export type Paint =
  | 'none'
  | 'surface-1'
  | 'surface-2'
  | 'surface-3'
  | 'edge'
  | 'paper'
  | 'paper-ink'
  | 'paper-ink-2'
  | 'paper-rule'
  | 'lamp'
  | 'lamp-ring'
  | 'text-1'
  | 'text-2'
  | 'lane-cpu'
  | 'lane-gpu'
  | 'lane-sync'
  | 'cat-blue-edge'
  | 'cat-green-edge'
  | 'cat-yellow-edge'

/** The roles above, as a list, for the test that checks them against the design system. */
export const PAINTS: readonly Paint[] = [
  'surface-1',
  'surface-2',
  'surface-3',
  'edge',
  'paper',
  'paper-ink',
  'paper-ink-2',
  'paper-rule',
  'lamp',
  'lamp-ring',
  'text-1',
  'text-2',
  'lane-cpu',
  'lane-gpu',
  'lane-sync',
  'cat-blue-edge',
  'cat-green-edge',
  'cat-yellow-edge',
]

/** The faces the drawing sets text in: the printer's dots for numbers, and the reading face for words. */
export type Face = 'numeric' | 'body'

interface Style {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
  readonly opacity?: number
}

export type Mark =
  | ({ readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number } & Style)
  | ({ readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } & Style)
  | ({ readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number } & Style)
  | {
      readonly kind: 'text'
      readonly x: number
      readonly y: number
      readonly text: string
      readonly size: number
      readonly anchor: 'start' | 'middle' | 'end'
      readonly fill: Paint
      readonly face: Face
      readonly middle?: boolean
    }

/** Marks that belong together, drawn as one group: `part` names the object (`rail`, `printer`, `gpu`, `cpu`, `axis`, `labels`). */
export interface Layer {
  readonly part: string
  readonly marks: readonly Mark[]
}

export type Orientation = 'landscape' | 'portrait'

export interface Frame {
  readonly orientation: Orientation
  readonly width: number
  readonly height: number
  /** The accessible name of the drawing: its state in a sentence. */
  readonly label: string
  readonly layers: readonly Layer[]
}

export interface FrameOptions {
  readonly orientation?: Orientation
  /** How many ticks the lanes show. Default: 76 in landscape and 40 in portrait [estimated]. */
  readonly windowTicks?: number
}

/** The most marks the 2D view draws (A§6.4, W0-T16). */
export const MARK_CAP = 2000
/** Fires keep their places for this many fires [estimated]; older ones are slabs (GAMES.md §3, "3D scene"). */
export const DETAIL_FIRES = 48

/** A ticket's number as the printer prints it: the id plus one, two digits. */
export const ticketNo = (id: number): string => String(id + 1).padStart(2, '0')

/* ------------------------------------------------------------------------------------------------------------------ */
/* The window                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ticks the lanes show by default, for each orientation [estimated]. */
export const WINDOW_TICKS: Readonly<Record<Orientation, number>> = { landscape: 76, portrait: 40 }

/** The ticks the mirror lists: the larger window, so it names every fire either orientation draws. */
export const MIRROR_TICKS: number = Math.max(WINDOW_TICKS.landscape, WINDOW_TICKS.portrait)

export interface Window {
  /** The tick at the lanes' origin. */
  readonly startUs: Us
  readonly windowTicks: number
  /** The fires with any part inside the window, oldest first. */
  readonly fires: readonly FireView[]
  /** The expo's spans inside the window. */
  readonly cpu: readonly Span[]
  /** Fires older than the window: not drawn, and summarised in the mirror. */
  readonly hidden: number
}

/**
 * The part of the night the lanes show. While the night fits it starts at 0. After that it starts at the plan of the oldest
 * fire that still lets the night end inside the window, so it moves by whole fires and never cuts one in half at its start; a fire
 * on the line whose cooking runs into the window from before it is kept, and the lanes cut its left edge.
 */
export function windowOf(view: LoopView, windowTicks: number): Window {
  const end = view.clockUs
  let startUs: Us = 0
  if (end > windowTicks) {
    const planStart = (fire: FireView): Us => view.cpu.find((span) => span.step === fire.index && span.kind === 'schedule')?.startUs ?? fire.startUs
    const first = view.fires.find((fire) => planStart(fire) >= end - windowTicks)
    startUs = first === undefined ? end - windowTicks : planStart(first)
  }
  const fires = view.fires.filter((fire) => fire.endUs > startUs)
  return { startUs, windowTicks, fires, cpu: view.cpu.filter((span) => span.endUs > startUs), hidden: view.fires.length - fires.length }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Geometry                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Geometry {
  readonly width: number
  readonly height: number
  readonly windowTicks: number
  /** How long the lanes are, in the frame's units: a window of any number of ticks is drawn to fit it. */
  readonly laneLen: number
  /** The rail, from its first clip's left edge, and the distance between clips. */
  readonly railX: number
  readonly pitch: number
  /** The top of the rail's bar and of the fired rail's. */
  readonly railY: number
  readonly firedY: number
  readonly ticket: { readonly w: number; readonly h: number }
  /** The queue: where the first waiting ticket stands, the distance between them, and how many fit. */
  readonly queue: { readonly x: number; readonly y: number; readonly pitch: number; readonly slots: number }
  readonly printer: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  /** The start of time along the lanes, and the span across the CPU lane and the GPU lane's slot rows. */
  readonly origin: number
  readonly cpu: { readonly a: number; readonly b: number; readonly pad: number }
  readonly gpu: { readonly a: number; readonly b: number; readonly row: number; readonly pitch: number; readonly first: number }
  readonly numberSize: number
  readonly textSize: number
}

const LANDSCAPE: Geometry = {
  width: 720,
  height: 348,
  windowTicks: WINDOW_TICKS.landscape,
  laneLen: 608,
  railX: 372,
  pitch: 84,
  railY: 10,
  firedY: 76,
  ticket: { w: 28, h: 40 },
  queue: { x: 48, y: 22, pitch: 31, slots: 8 },
  printer: { x: 0, y: 18, w: 40, h: 60 },
  origin: 96,
  cpu: { a: 160, b: 200, pad: 6 },
  gpu: { a: 208, b: 342, row: 26, pitch: 31, first: 214 },
  numberSize: 12,
  textSize: 12,
}

const PORTRAIT: Geometry = {
  width: 360,
  height: 424,
  windowTicks: WINDOW_TICKS.portrait,
  laneLen: 200,
  railX: 60,
  pitch: 72,
  railY: 60,
  firedY: 120,
  ticket: { w: 26, h: 36 },
  queue: { x: 34, y: 10, pitch: 30, slots: 9 },
  printer: { x: 0, y: 8, w: 28, h: 44 },
  origin: 216,
  cpu: { a: 46, b: 94, pad: 4 },
  gpu: { a: 98, b: 346, row: 56, pitch: 62, first: 100 },
  numberSize: 11,
  textSize: 11,
}

const geometryOf = (orientation: Orientation): Geometry => (orientation === 'portrait' ? PORTRAIT : LANDSCAPE)

/** Ticks between marks on the axis: 5 for the default windows, and wider for a longer one, so the axis never has more than 16 marks. */
const axisStep = (windowTicks: number): number => [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((step) => windowTicks / step <= 16) ?? 10000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drawing                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

type Detail = 'full' | 'cells' | 'slabs'

/** What the layout tries, in order, until the marks fit the cap: all the detail; places without numbers; slabs without places; then fewer fires. */
const FALLBACKS: readonly (readonly [Detail, number])[] = [
  ['full', Number.POSITIVE_INFINITY],
  ['cells', Number.POSITIVE_INFINITY],
  ['slabs', Number.POSITIVE_INFINITY],
  ['slabs', 300],
  ['slabs', 60],
]

/**
 * The marks of one layer under construction. The helpers take the lanes' own coordinates (a position in ticks along the lane,
 * and a position across it) and turn them into the frame's (x, y) by the orientation.
 */
function painter(g: Geometry, orientation: Orientation) {
  const landscape = orientation === 'landscape'
  /** Logical units a tick takes along the lanes: 8 in landscape and 5 in portrait for the default windows, less for a longer one. */
  const px = g.laneLen / g.windowTicks
  const layers: { part: string; marks: Mark[] }[] = []
  let marks: Mark[] = []
  const layer = (part: string) => {
    marks = []
    layers.push({ part, marks })
  }
  const add = (mark: Mark) => {
    marks.push(mark)
  }
  const rect = (x: number, y: number, w: number, h: number, style: Style & { rx?: number } = {}) => add({ kind: 'rect', x: num(x), y: num(y), w: num(w), h: num(h), ...style })
  const line = (x1: number, y1: number, x2: number, y2: number, style: Style) => add({ kind: 'line', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), ...style })
  const circle = (cx: number, cy: number, r: number, style: Style) => add({ kind: 'circle', cx: num(cx), cy: num(cy), r, ...style })
  const text = (x: number, y: number, label: string, o: { size: number; anchor?: 'start' | 'middle' | 'end'; fill: Paint; face?: Face; middle?: boolean }) =>
    add({ kind: 'text', x: num(x), y: num(y), text: label, size: o.size, anchor: o.anchor ?? 'middle', fill: o.fill, face: o.face ?? 'body', ...(o.middle ? { middle: true } : {}) })

  /** A rectangle in lane coordinates: ticks `t0` to `t1` from the window's start, and `a` to `b` across. */
  const lane = (t0: number, t1: number, a: number, b: number) =>
    landscape
      ? { x: g.origin + t0 * px, y: a, w: (t1 - t0) * px, h: b - a }
      : { x: a, y: g.origin + t0 * px, w: b - a, h: (t1 - t0) * px }
  return { layers, layer, rect, line, circle, text, lane, landscape, px }
}

type Painter = ReturnType<typeof painter>

/** A paper ticket with its punched hole and its number, hanging with its top at (cx − w/2, y). */
function ticketAt(p: Painter, g: Geometry, cx: number, y: number, id: number) {
  const { w, h } = g.ticket
  p.rect(cx - w / 2, y, w, h, { fill: 'paper', stroke: 'paper-rule', width: 1 })
  p.circle(cx, y + 6, 2.5, { fill: 'surface-3' })
  p.text(cx, y + h * 0.62, ticketNo(id), { size: g.numberSize, fill: 'paper-ink', face: 'numeric', middle: true })
}

/** A clip with nothing hung: paid for, and empty. */
function emptyClipAt(p: Painter, g: Geometry, cx: number, y: number) {
  const { w, h } = g.ticket
  p.rect(cx - w / 2, y, w, h, { fill: 'none', stroke: 'edge', width: 1.5, dash: '3 3' })
  p.text(cx, y + h * 0.62, 'empty', { size: g.textSize - 2, fill: 'text-2', middle: true })
}

/** The rail: a bar with a clip for each slot, and a ticket on every taken clip. */
function railAt(p: Painter, g: Geometry, y: number, clips: readonly ClipView[], caption: string) {
  const width = clips.length * g.pitch
  p.rect(g.railX, y, width, 8, { fill: 'surface-3', rx: 2 })
  clips.forEach((clip, j) => {
    const cx = g.railX + g.pitch / 2 + j * g.pitch
    p.rect(cx - 5, y - 4, 10, 16, { fill: 'surface-2', stroke: 'surface-3', width: 1.5, rx: 2 })
    if (clip.req === null) emptyClipAt(p, g, cx, y + 16)
    else ticketAt(p, g, cx, y + 16, clip.req)
  })
  p.text(g.railX - 8, y + 32, caption, { size: g.textSize, anchor: 'end', fill: 'text-1' })
}

function binnedAt(p: Painter, x: number, y: number, w: number, h: number, req: number | null, g: Geometry, detail: Detail) {
  p.rect(x, y, w, h, { fill: 'none', stroke: 'paper', width: 2, dash: '4 3' })
  p.line(x + 3, y + 3, x + w - 3, y + h - 3, { stroke: 'paper', width: 2 })
  p.line(x + w - 3, y + 3, x + 3, y + h - 3, { stroke: 'paper', width: 2 })
  if (detail === 'full' && req !== null && w >= 26) p.text(x + w / 2, y + h / 2, ticketNo(req), { size: g.numberSize - 1, fill: 'paper', face: 'numeric', middle: true })
}

function placeAt(p: Painter, x: number, y: number, w: number, h: number, place: PlaceView, g: Geometry, detail: Detail) {
  if (place.state === 'empty') p.rect(x, y, w, h, { fill: 'surface-3', rx: 2 })
  else if (place.state === 'binned') binnedAt(p, x, y, w, h, place.req, g, detail)
  else {
    p.rect(x, y, w, h, { fill: 'paper', stroke: 'cat-green-edge', width: 1.5, rx: 2 })
    if (detail === 'full' && place.req !== null && w >= 22 && h >= 14) p.text(x + w / 2, y + h / 2, ticketNo(place.req), { size: g.numberSize, fill: 'paper-ink', face: 'numeric', middle: true })
  }
}

/** The window with only its last `limit` fires and their expo spans: the last resort when even slabs would pass the cap. */
function limited(w: Window, limit: number): Window {
  if (w.fires.length <= limit) return w
  const fires = w.fires.slice(-limit)
  const from = fires[0].index
  return { ...w, fires, cpu: w.cpu.filter((span) => span.step >= from), hidden: w.hidden + (w.fires.length - limit) }
}

/** The drawing of a night: its layers, with the places of the last fires at `detail` and the older fires as slabs. */
function build(view: LoopView, orientation: Orientation, windowTicks: number, detail: Detail, limit: number): Layer[] {
  const g = { ...geometryOf(orientation), windowTicks }
  const p = painter(g, orientation)
  const w = limited(windowOf(view, windowTicks), limit)
  const t = (us: Us) => Math.max(0, Math.min(windowTicks, us - w.startUs))

  // The lamp pools over the rail while the night is open: the rail is the present, and the fired rail is part of the pass.
  p.layer('lamp')
  if (!view.done) {
    const height = (p.landscape ? 70 : 62) + (view.firedRail === null ? 0 : g.firedY - g.railY)
    p.rect(g.railX - 6, g.railY - 8, view.slots * g.pitch + 12, height, { fill: 'lamp', stroke: 'lamp-ring', width: 1.5, opacity: 0.55, rx: 6 })
  }

  // The printer, and the waiting tickets curling out of it.
  p.layer('printer')
  p.rect(g.printer.x, g.printer.y, g.printer.w, g.printer.h, { fill: 'surface-3', rx: 3 })
  p.rect(g.printer.x + g.printer.w - 5, g.printer.y + 8, 4, g.printer.h - 16, { fill: 'surface-1', rx: 1 })
  const shown = view.waiting.length > g.queue.slots ? g.queue.slots - 1 : view.waiting.length
  view.waiting.slice(0, shown).forEach((id, i) => ticketAt(p, g, g.queue.x + g.ticket.w / 2 + i * g.queue.pitch, g.queue.y, id))
  if (view.waiting.length > shown) {
    p.text(g.queue.x + g.ticket.w / 2 + shown * g.queue.pitch, g.queue.y + g.ticket.h * 0.62, `+${view.waiting.length - shown}`, { size: g.numberSize, fill: 'text-1', face: 'numeric', middle: true })
  }

  // The rail, and the fired rail while a fire is on the line.
  p.layer('rail')
  railAt(p, g, g.railY, view.rail, 'the rail')
  if (view.firedRail !== null) railAt(p, g, g.firedY, view.firedRail, 'fired rail')

  // The time axis: a tick every 5 ticks and a label every 10 for the default windows, and what the ticks are.
  p.layer('axis')
  const every = axisStep(windowTicks)
  for (let at = Math.ceil(w.startUs / every) * every; at <= w.startUs + windowTicks; at += every) {
    const along = at - w.startUs
    const major = (at / every) % 2 === 0
    if (p.landscape) {
      const x = g.origin + along * p.px
      p.line(x, 150, x, 156, { stroke: 'edge', width: major ? 1.5 : 1 })
      if (major) p.text(x, 146, String(at), { size: g.numberSize - 2, fill: 'text-2', face: 'numeric' })
    } else {
      const y = g.origin + along * p.px
      p.line(36, y, 42, y, { stroke: 'edge', width: major ? 1.5 : 1 })
      if (major) p.text(32, y, String(at), { size: g.numberSize - 1, anchor: 'end', fill: 'text-2', face: 'numeric', middle: true })
    }
  }

  // The expo's lane: a slab for each plan and each read.
  p.layer('cpu')
  const cpuLane = p.lane(0, windowTicks, g.cpu.a, g.cpu.b)
  p.rect(cpuLane.x, cpuLane.y, cpuLane.w, cpuLane.h, { fill: 'surface-2' })
  for (const span of w.cpu) {
    if (span.kind !== 'schedule' && span.kind !== 'sync') continue
    const r = p.lane(t(span.startUs), t(span.endUs), g.cpu.a + g.cpu.pad, g.cpu.b - g.cpu.pad)
    if (r.w <= 0 || r.h <= 0) continue
    p.rect(r.x, r.y, r.w, r.h, span.kind === 'schedule' ? { fill: 'lane-cpu', stroke: 'cat-blue-edge', width: 1 } : { fill: 'lane-sync', stroke: 'cat-yellow-edge', width: 1 })
  }

  // The line: dark between fires, a lit slab for each fire with a place for every clip, and a lamp ring on the fires on the line.
  p.layer('gpu')
  const gpuLane = p.lane(0, windowTicks, g.gpu.a, g.gpu.b)
  p.rect(gpuLane.x, gpuLane.y, gpuLane.w, gpuLane.h, { fill: 'surface-3' })
  const rowsEnd = g.gpu.first + (view.slots - 1) * g.gpu.pitch + g.gpu.row
  const detailFrom = w.fires.length - DETAIL_FIRES
  w.fires.forEach((fire, i) => {
    const t0 = t(fire.startUs)
    const t1 = t(fire.endUs)
    if (t1 <= t0) return
    const slab = p.lane(t0, t1, g.gpu.first - 3, rowsEnd + 3)
    p.rect(slab.x, slab.y, slab.w, slab.h, { fill: 'lane-gpu', stroke: 'cat-green-edge', width: 1 })
    if (detail !== 'slabs' && i >= detailFrom) {
      fire.places.forEach((place, j) => {
        const cell = p.lane(t0, t1, g.gpu.first + j * g.gpu.pitch, g.gpu.first + j * g.gpu.pitch + g.gpu.row)
        placeAt(p, cell.x + 2, cell.y, cell.w - 4, cell.h, place, g, detail)
      })
    }
    if (fire.onLine) p.rect(slab.x - 1.5, slab.y - 1.5, slab.w + 3, slab.h + 3, { fill: 'none', stroke: 'lamp-ring', width: 2.5, rx: 2 })
    // The dark stretch before this fire is labelled with its length when it is wide enough to hold the label.
    const before = w.fires[i - 1]
    if (before !== undefined && fire.bubbleUs > 0 && detail === 'full') {
      const mid = p.lane(t(before.endUs), t0, g.gpu.a, g.gpu.b)
      if (mid.w * mid.h > 0 && (p.landscape ? mid.w : mid.h) >= 14) {
        p.text(mid.x + mid.w / 2, mid.y + mid.h / 2, String(fire.bubbleUs), { size: g.numberSize - 1, fill: 'paper', face: 'numeric', middle: true })
      }
    }
  })

  // The names of the lanes, and what the marks are: a slab of the expo's lane, and the three states of a place.
  p.layer('labels')
  const small = g.textSize - 2
  if (p.landscape) {
    p.text(4, 146, 'ticks · synthetic', { size: small, anchor: 'start', fill: 'text-2' })
    p.text(4, 173, 'the expo', { size: g.textSize, anchor: 'start', fill: 'text-1' })
    p.text(4, 186, 'CPU lane', { size: small, anchor: 'start', fill: 'text-2' })
    p.rect(4, 191, 9, 6, { fill: 'lane-cpu', stroke: 'cat-blue-edge', width: 1 })
    p.text(16, 195, 'plan', { size: small - 1, anchor: 'start', fill: 'text-2', middle: true })
    p.rect(46, 191, 9, 6, { fill: 'lane-sync', stroke: 'cat-yellow-edge', width: 1 })
    p.text(58, 195, 'read', { size: small - 1, anchor: 'start', fill: 'text-2', middle: true })
    p.text(4, 229, 'the line', { size: g.textSize, anchor: 'start', fill: 'text-1' })
    p.text(4, 242, 'GPU lane', { size: small, anchor: 'start', fill: 'text-2' })
    const legend = [
      { place: { state: 'plate', req: null }, word: 'plate' },
      { place: { state: 'empty', req: null }, word: 'empty place' },
      { place: { state: 'binned', req: null }, word: 'binned plate' },
    ] as const
    legend.forEach(({ place, word }, i) => {
      const y = 262 + i * 22
      placeAt(p, 4, y, 20, 14, place, g, 'cells')
      p.text(28, y + 7, word, { size: small - 1, anchor: 'start', fill: 'text-2', middle: true })
    })
  } else {
    p.text(42, 188, 'ticks', { size: small - 1, anchor: 'end', fill: 'text-2' })
    p.text(42, 200, 'synthetic', { size: small - 1, anchor: 'end', fill: 'text-2' })
    p.text(70, 188, 'the expo', { size: small, fill: 'text-1' })
    p.text(70, 200, 'CPU lane', { size: small - 1, fill: 'text-2' })
    p.text(222, 188, 'the line', { size: g.textSize, fill: 'text-1' })
    p.text(222, 200, 'GPU lane', { size: small, fill: 'text-2' })
  }
  return p.layers
}

/** The sentence that names the drawing: the state it shows, for assistive technology and for the poster's alt text. */
function describe(view: LoopView): string {
  const hung = view.rail.filter((clip) => clip.req !== null).length
  const waiting = view.waiting.length
  return `${view.title}. The rail has ${view.slots} clips and ${hung} ${hung === 1 ? 'is' : 'are'} hung. ${waiting} ${waiting === 1 ? 'ticket waits' : 'tickets wait'}. ${view.step} ${view.step === 1 ? 'fire has' : 'fires have'} been rung, and the clock reads ${view.clockUs} ticks, synthetic.`
}

/**
 * The frame of a view: its layers in drawing order. The same view and options always give the same frame. If the marks would
 * pass the cap, the places lose their numbers, and then the fires lose their places, until they fit.
 */
export function layoutFrame(view: LoopView, options: FrameOptions = {}): Frame {
  const orientation = options.orientation ?? 'landscape'
  const g = geometryOf(orientation)
  const windowTicks = options.windowTicks ?? g.windowTicks
  let layers: Layer[] = []
  for (const [detail, limit] of FALLBACKS) {
    layers = build(view, orientation, windowTicks, detail, limit)
    if (layers.reduce((sum, layer) => sum + layer.marks.length, 0) <= MARK_CAP) break
  }
  return { orientation, width: g.width, height: g.height, label: describe(view), layers }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Compare strips                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The size of a strip, in the frame's own units. A strip is the line of one service, drawn small so that three can sit side by side. */
export const STRIP = { width: 720, row: 9, gap: 2, pad: 3, margin: 4 } as const

/**
 * The line of one service as a strip (GAMES.md §3.1, beat 4; §2.6, "Compare"): dark where the stations sat dark, a lit slab for
 * each fire, and a place for every clip in it. Every strip of one comparison takes the same `scaleTicks`, so lengths are comparable:
 * a length comparison must not depend on anything but the length. A strip carries no text, because the captions and the counts
 * beside it are DOM.
 */
export function layoutStrip(fires: readonly FireView[], options: { readonly slots: number; readonly scaleTicks: number; readonly label: string }): Frame {
  const { slots, scaleTicks } = options
  const height = STRIP.pad * 2 + slots * STRIP.row + (slots - 1) * STRIP.gap
  const px = (STRIP.width - 2 * STRIP.margin) / Math.max(scaleTicks, 1)
  const marks: Mark[] = [{ kind: 'rect', x: 0, y: 0, w: STRIP.width, h: height, fill: 'surface-3', rx: 2 }]
  for (const fire of fires) {
    const x = num(STRIP.margin + fire.startUs * px)
    const w = num((fire.endUs - fire.startUs) * px)
    marks.push({ kind: 'rect', x, y: STRIP.pad - 2, w, h: height - 2 * (STRIP.pad - 2), fill: 'lane-gpu' })
    fire.places.forEach((place, j) => {
      const y = STRIP.pad + j * (STRIP.row + STRIP.gap)
      if (place.state === 'plate') marks.push({ kind: 'rect', x: num(x + 0.75), y, w: num(Math.max(w - 1.5, 0.5)), h: STRIP.row, fill: 'paper' })
      else if (place.state === 'binned') marks.push({ kind: 'rect', x: num(x + 0.75), y, w: num(Math.max(w - 1.5, 0.5)), h: STRIP.row, fill: 'none', stroke: 'paper', width: 1, dash: '2 1.5' })
      else marks.push({ kind: 'rect', x: num(x + 0.75), y, w: num(Math.max(w - 1.5, 0.5)), h: STRIP.row, fill: 'surface-3' })
    })
  }
  return { orientation: 'landscape', width: STRIP.width, height, label: options.label, layers: [{ part: 'strip', marks }] }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Frame to SVG                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const FACE: Readonly<Record<Face, string>> = { numeric: 'var(--es-font-numeric)', body: 'var(--es-font-body)' }
const paint = (role: Paint): string => (role === 'none' ? 'none' : `var(--es-${role})`)

function markNode(mark: Mark): SvgNode {
  const style = (s: Style): Record<string, string | number> => ({
    ...(s.fill === undefined ? {} : { fill: paint(s.fill) }),
    ...(s.stroke === undefined ? {} : { stroke: paint(s.stroke) }),
    ...(s.width === undefined ? {} : { strokeWidth: s.width }),
    ...(s.dash === undefined ? {} : { strokeDasharray: s.dash }),
    ...(s.opacity === undefined ? {} : { fillOpacity: s.opacity }),
  })
  switch (mark.kind) {
    case 'rect':
      return { tag: 'rect', attrs: { x: mark.x, y: mark.y, width: mark.w, height: mark.h, ...(mark.rx === undefined ? {} : { rx: mark.rx }), ...style(mark) } }
    case 'line':
      return { tag: 'line', attrs: { x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2, ...style(mark) } }
    case 'circle':
      return { tag: 'circle', attrs: { cx: mark.cx, cy: mark.cy, r: mark.r, ...style(mark) } }
    case 'text':
      return {
        tag: 'text',
        attrs: {
          x: mark.x,
          y: mark.y,
          fill: paint(mark.fill),
          fontFamily: FACE[mark.face],
          fontSize: mark.size,
          textAnchor: mark.anchor,
          ...(mark.middle ? { dominantBaseline: 'central' } : {}),
        },
        children: [mark.text],
      }
  }
}

/**
 * The SVG of a frame. The root is an image with the frame's label, and its box is the frame's own, so the browser reserves the
 * space before any style loads (CLS). A consumer sizes it with CSS (`width: 100%; height: auto`).
 */
export function frameSvg(frame: Frame): SvgNode {
  return {
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${frame.width} ${frame.height}`,
      width: frame.width,
      height: frame.height,
      role: 'img',
      'aria-label': frame.label,
    },
    children: frame.layers.map((layer): SvgNode => ({ tag: 'g', attrs: { 'data-part': layer.part }, children: layer.marks.map(markNode) })),
  }
}

/** Marks in a frame. */
export const markCount = (frame: Frame): number => countMarks(frameSvg(frame))
