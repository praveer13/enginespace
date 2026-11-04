/**
 * Service's layout (A§6.3, GAMES.md §3 "2D path", §2.6 "Service"): a view of the night turned into positioned marks. The 2D view
 * and the poster draw the marks as SVG (`frameSvg`), and W0-T17's 3D scene reads the same view for its own primitives.
 *
 * A mark is a rect, a line, a circle or a piece of text, painted with a token role of src/design/tokens.ts and never a colour
 * (rule 9, D-047). A role becomes `var(--es-<role>)` in the SVG, so the drawing changes with the design system and carries no
 * literal colour or face. tests/play/loop-layout.test.ts checks that every role used exists.
 *
 * The drawing is the kitchen itself, seen from above (GAMES.md §2.6), built from the world's own surfaces and nothing a chart has:
 *   - the printer, at the left, with the waiting tickets curling out of it;
 *   - the rail, a steel bar with a clip for each slot, a paper ticket hung on every taken clip and a red-printed stub on every
 *     empty one; and, when a fire is on the line, the fired rail beneath it, which holds that fire while the expo fills the rail for
 *     the next one;
 *   - the heat lamp's amber, pooled over the pass (the rail, the fired rail and the fire being called) while the night is open, as
 *     light with no edge and nowhere else: the drawing's only amber;
 *   - the night's tape, a strip of the printer's paper laid along the lanes, where the printer stamped the clock at each fire in its
 *     dots, under its red stamp saying the ticks are synthetic;
 *   - the expo's lane (CPU), a steel shelf with a rolled lip, where the expo's boards lie: a plan for each fire and a read;
 *   - the line (GPU), a steel counter with a recessed well for each clip's station. A ticket on the rail holds a hotel pan in its
 *     clip's well, its KV block, from the fire that first cooks it to the fire that serves its last course, with its number in
 *     marker on a strip of masking tape across the pan's lip. Every fire puts one place in every well: a plate on the ticket's pan
 *     (solid paper), an empty place where the clip rode empty (an open groove, dark) or a binned plate (hollow, struck through in
 *     the ribbon's red). A fire's length along the line is its cook time; a dark stretch between fires, the bubble, shades the whole
 *     line, its length printed on it;
 *   - the line's stations, a mark at the head of each well in the printer tape's shapes: solid where the latest fire cooked a course,
 *     an open ring where its clip rode empty.
 * Masking tape and marker name the lanes and the pans, and every number is in the printer's dots. A state is a shape before it is a
 * colour (WCAG 1.4.1), and no code colour marks a state: the code colours mark only what a board is.
 *
 * Time runs along the lanes: left to right in landscape, and top to bottom in portrait, where a phone's height shows history
 * (GAMES.md §2.3, "Portrait framing"). The lanes show a window of the night's last ticks, and it moves by whole fires, so under
 * reduced motion history steps and does not scroll. Fires older than the last 48 [estimated] lose their places and keep their pans,
 * and a hard cap of 2,000 marks backs that up (A§6.4): a window too long for it loses its numbers, then its places, then its oldest
 * fires.
 *
 * Every number the drawing writes is a ticket's number, a stamp of the clock or a dark stretch's length. The counters are DOM, in
 * the printer tape and the mirror.
 */
import type { Us } from '@es/sim/core'
import type { Span } from '@es/sim/steploop'
import { countMarks, num } from './svg'
import type { SvgNode } from './svg'
import type { ClipView, FireView, LoopView } from './types'

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
  | 'text-1'
  | 'lane-cpu'
  | 'lane-gpu'
  | 'lane-sync'
  | 'cat-blue-edge'
  | 'cat-yellow-edge'
  | 'tape'
  | 'tape-ink'

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
  'text-1',
  'lane-cpu',
  'lane-gpu',
  'lane-sync',
  'cat-blue-edge',
  'cat-yellow-edge',
  'tape',
  'tape-ink',
]

/**
 * The faces the drawing sets text in: the printer's dots for numbers and for the words printed on tickets and the clock, marker on
 * masking tape for the lanes' names, and the reading face for nothing the world prints (kept for the strips' captions' twins).
 */
export type Face = 'numeric' | 'ticket' | 'label' | 'body'

interface Style {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
  readonly opacity?: number
  readonly strokeOpacity?: number
}

export type Mark =
  | ({
      readonly kind: 'rect'
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
      readonly rx?: number
      /** Light, not a surface: the frame blurs it, so it has no edge (the heat lamp's pool). */
      readonly soft?: boolean
    } & Style)
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

/**
 * The line's stations (GAMES.md §2.6, "the line's stations"): one for each clip, lit where the latest fire cooked a course (a plate,
 * or a binned plate), and dark where its clip rode empty or before any fire. A fire costs the line the same with one ticket as with
 * four, so a fire rung with two of four clips hung leaves half the line dark, and a full rail lights it end to end.
 */
export function stationsOf(view: LoopView): boolean[] {
  const last = view.fires[view.fires.length - 1]
  return Array.from({ length: view.slots }, (_, slot) => last !== undefined && last.places[slot] !== undefined && last.places[slot].state !== 'empty')
}

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
  /** The pass: the counter under the rail, where the lamps' amber pools. */
  readonly pass: { readonly y: number; readonly h: number }
  /**
   * The night's tape: across the lanes from `a` to `b`, beginning `head` (along time, in the frame's units) where its red stamp is
   * printed, and running to the lanes' end.
   */
  readonly clock: { readonly a: number; readonly b: number; readonly head: number }
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
  pass: { y: 92, h: 46 },
  clock: { a: 142, b: 156, head: 4 },
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
  pass: { y: 116, h: 56 },
  clock: { a: 4, b: 42, head: 176 },
}

const geometryOf = (orientation: Orientation): Geometry => (orientation === 'portrait' ? PORTRAIT : LANDSCAPE)

/** How wide the printer's dots set a number on the night's tape, in the frame's units [estimated]: Doto's figures at its size. */
const stampWidth = (text: string, size: number): number => text.length * size * 0.62

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
  const rect = (x: number, y: number, w: number, h: number, style: Style & { rx?: number; soft?: boolean } = {}) => add({ kind: 'rect', x: num(x), y: num(y), w: num(w), h: num(h), ...style })
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

/** A clip with nothing hung: paid for, and empty. A stub of paper on the clip, printed "empty" in the ribbon's red. */
function emptyClipAt(p: Painter, g: Geometry, cx: number, y: number) {
  const w = g.ticket.w + 10
  const h = g.ticket.h * 0.5
  p.rect(cx - w / 2, y, w, h, { fill: 'paper', stroke: 'paper-rule', width: 1, dash: '2 2' })
  p.text(cx, y + h / 2, 'empty', { size: g.textSize - 1, fill: 'paper-ink-2', face: 'ticket', middle: true })
}

/** The rail: a stainless bar lit along its top, with a clip for each slot, and a ticket on every taken clip. */
function railAt(p: Painter, g: Geometry, y: number, clips: readonly ClipView[]) {
  const width = clips.length * g.pitch
  p.rect(g.railX, y, width, 8, { fill: 'surface-3', rx: 2 })
  p.line(g.railX + 2, y + 1.5, g.railX + width - 2, y + 1.5, { stroke: 'paper', width: 1, strokeOpacity: 0.55 })
  clips.forEach((clip, j) => {
    const cx = g.railX + g.pitch / 2 + j * g.pitch
    p.rect(cx - 5, y - 4, 10, 16, { fill: 'surface-2', stroke: 'surface-3', width: 1.5, rx: 2 })
    if (clip.req === null) emptyClipAt(p, g, cx, y + 16)
    else ticketAt(p, g, cx, y + 16, clip.req)
  })
}

/** A strip of masking tape with its words in marker: how the kitchen names a lane. */
function tapeAt(p: Painter, x: number, y: number, w: number, h: number, words: string, size: number) {
  p.rect(x, y, w, h, { fill: 'tape' })
  p.text(x + w / 2, y + h / 2 + 0.5, words, { size, fill: 'tape-ink', face: 'label', middle: true })
}

/** A rectangle in the frame's units. */
interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** A box shrunk by `along` at both of its ends along the lanes and by `across` at both of its sides. */
function inset(p: Painter, r: Box, along: number, across: number): Box {
  return p.landscape ? { x: r.x + along, y: r.y + across, w: r.w - 2 * along, h: r.h - 2 * across } : { x: r.x + across, y: r.y + along, w: r.w - 2 * across, h: r.h - 2 * along }
}

/** The shorter side of a box: a platter's ends are round to it. */
const narrow = (r: Box): number => Math.min(r.w, r.h)

/**
 * The expo's shelf: brushed steel lit along its back edge by the tubes, with its rolled lip along the front (the bottom in landscape,
 * the right in portrait), where the expo's boards lie.
 */
function shelfAt(p: Painter, r: Box) {
  const lip = 4
  p.rect(r.x, r.y, r.w, r.h, { fill: 'surface-1', opacity: 0.62 })
  if (p.landscape) {
    p.rect(r.x, r.y + r.h - lip, r.w, lip, { fill: 'surface-2', opacity: 0.95 })
    p.line(r.x, r.y + 0.5, r.x + r.w, r.y + 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
    p.line(r.x, r.y + r.h - 0.5, r.x + r.w, r.y + r.h - 0.5, { stroke: 'surface-3', width: 1 })
  } else {
    p.rect(r.x + r.w - lip, r.y, lip, r.h, { fill: 'surface-2', opacity: 0.95 })
    p.line(r.x + 0.5, r.y, r.x + 0.5, r.y + r.h, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
    p.line(r.x + r.w - 0.5, r.y, r.x + r.w - 0.5, r.y + r.h, { stroke: 'surface-3', width: 1 })
  }
}

/**
 * A station's well in the line's counter: a recessed channel of deep steel, its far edge in shadow and its near lip catching the
 * tubes, so it reads as a cut in the counter and not a bar laid on it.
 */
function wellAt(p: Painter, r: Box) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'surface-3', opacity: 0.36, rx: 5 })
  if (p.landscape) {
    p.line(r.x + 4, r.y + 1, r.x + r.w - 4, r.y + 1, { stroke: 'paper-ink', width: 2, strokeOpacity: 0.4 })
    p.line(r.x + 4, r.y + r.h - 0.5, r.x + r.w - 4, r.y + r.h - 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
  } else {
    p.line(r.x + 1, r.y + 4, r.x + 1, r.y + r.h - 4, { stroke: 'paper-ink', width: 2, strokeOpacity: 0.4 })
    p.line(r.x + r.w - 0.5, r.y + 4, r.x + r.w - 0.5, r.y + r.h - 4, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
  }
}

/** A hotel pan in a well: its drawn steel rim with the edge's line, and its floor a shade lower. */
function panAt(p: Painter, r: Box) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'surface-1', stroke: 'edge', width: 1, rx: 3.5 })
  const floor = inset(p, r, 2.5, 2.5)
  if (floor.w > 0 && floor.h > 0) p.rect(floor.x, floor.y, floor.w, floor.h, { fill: 'surface-2', rx: 2 })
}

/**
 * The strip of masking tape across a pan's lip at its start, with the ticket's number in marker: the kitchen's own label on the
 * kitchen's own container. In landscape it sits across the pan's near lip; in portrait across its top end.
 */
function panTapeAt(p: Painter, g: Geometry, r: Box, req: number) {
  const size = g.numberSize - 1.5
  const w = 21
  const h = 12.5
  const x = p.landscape ? r.x + 3 : r.x + (r.w - w) / 2
  const y = p.landscape ? r.y + r.h - h + 2 : r.y - 2
  p.rect(x, y, w, h, { fill: 'tape' })
  p.text(x + w / 2, y + h / 2 + 0.5, ticketNo(req), { size, fill: 'tape-ink', face: 'label', middle: true })
}

/** A plate on its ticket's pan: a white platter as long as the fire cooked, with the ring of its well inside the rim. */
function plateAt(p: Painter, r: Box, detail: Detail) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'paper', stroke: 'paper-rule', width: 0.75, rx: narrow(r) / 2 })
  const ring = inset(p, r, 2.5, 2.5)
  if (detail === 'full' && narrow(ring) >= 4) p.rect(ring.x, ring.y, ring.w, ring.h, { fill: 'none', stroke: 'paper-rule', width: 0.6, rx: narrow(ring) / 2 })
}

/** A binned plate: the platter's outline only, broken, and struck through in the ribbon's red, the colour of what must not be missed. */
function binnedAt(p: Painter, r: Box) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'none', stroke: 'paper-ink-2', width: 1.5, dash: '3 2', rx: narrow(r) / 2 })
  p.line(r.x + 3, r.y + r.h - 3, r.x + r.w - 3, r.y + 3, { stroke: 'paper-ink-2', width: 1.5 })
}

/** An empty place: a clip that rode empty, its course paid for and nobody's. An open groove in the bare well, darker than the well. */
function grooveAt(p: Painter, r: Box) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'surface-3', opacity: 0.85, stroke: 'surface-2', width: 1, rx: Math.min(2.5, narrow(r) / 2) })
}

/**
 * A station's mark at the head of its well, in the printer tape's own shapes: struck solid where the latest fire cooked a course, an
 * open ring where its clip rode empty. The drawing has no lamp off the pass, so the state is a shape and never a colour.
 */
function stationAt(p: Painter, cx: number, cy: number, lit: boolean) {
  if (lit) p.circle(cx, cy, 4.5, { fill: 'text-1' })
  else p.circle(cx, cy, 4, { fill: 'none', stroke: 'text-1', width: 1.5 })
}

/** A ticket's run in one clip: the fires, oldest first, from its first in the window to its last. */
interface Run {
  readonly req: number
  readonly from: FireView
  readonly to: FireView
}

/** The runs in clip `slot` over the window's fires: a ticket's pan stays in its clip's well from its first course to its last. */
function runsIn(fires: readonly FireView[], slot: number): Run[] {
  const runs: Run[] = []
  let open: { req: number; from: FireView; to: FireView } | null = null
  for (const fire of fires) {
    const req = fire.places[slot]?.req ?? null
    if (open !== null && open.req === req) {
      open.to = fire
      continue
    }
    if (open !== null) runs.push(open)
    open = req === null ? null : { req, from: fire, to: fire }
  }
  if (open !== null) runs.push(open)
  return runs
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
  const railRight = g.railX + view.slots * g.pitch

  // The pass: the counter of brushed steel under the rail, lit along its back edge by the tubes and shaded along its front.
  p.layer('pass')
  p.rect(0, g.pass.y, g.width, g.pass.h, { fill: 'surface-1', opacity: 0.6 })
  p.line(0, g.pass.y + 0.5, g.width, g.pass.y + 0.5, { stroke: 'paper', width: 1.5, strokeOpacity: 0.85 })
  p.line(0, g.pass.y + g.pass.h - 0.5, g.width, g.pass.y + g.pass.h - 0.5, { stroke: 'surface-3', width: 1 })

  // The heat lamp's amber pools on the pass under the rail while the night is open: the rail, the fired rail and the fire being
  // called are the present (GAMES.md §2.6). It is light, not a box: one soft pool with no edge, which the frame blurs, and nowhere else.
  p.layer('lamp')
  if (!view.done) {
    const left = g.railX - 20
    p.rect(left, g.pass.y + 2, Math.min(g.width - 2, railRight + 12) - left, g.pass.h - 4, { fill: 'lamp', opacity: 0.5, rx: g.pass.h / 2, soft: true })
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

  // The rail, and the fired rail while a fire is on the line, named on its tape.
  p.layer('rail')
  railAt(p, g, g.railY, view.rail)
  if (view.firedRail !== null) {
    railAt(p, g, g.firedY, view.firedRail)
    if (p.landscape) tapeAt(p, g.railX - 76, g.firedY + 18, 68, 14, 'FIRED RAIL', 8)
    else tapeAt(p, 2, g.firedY + 14, 54, 13, 'FIRED', 7.5)
  }

  // The night's tape along the lanes: the printer's paper, perforated along its edge, with its red stamp at the head, and the clock
  // stamped in the printer's dots where the window begins and where each fire began, wherever the last stamp leaves room.
  p.layer('clock')
  const tape = { ...p.lane(0, windowTicks, g.clock.a, g.clock.b) }
  const strip: Box = p.landscape ? { x: g.clock.head, y: tape.y, w: tape.x + tape.w - g.clock.head, h: tape.h } : { x: tape.x, y: g.clock.head, w: tape.w, h: tape.y + tape.h - g.clock.head }
  p.rect(strip.x, strip.y, strip.w, strip.h, { fill: 'paper', stroke: 'paper-rule', width: 0.75 })
  const stampSize = g.numberSize - 3
  if (p.landscape) {
    p.line(strip.x + 2, strip.y + 2, strip.x + strip.w - 2, strip.y + 2, { stroke: 'paper-rule', width: 1, dash: '1 3' })
    p.text(strip.x + 4, strip.y + strip.h / 2 + 1, 'TICKS · SYNTHETIC', { size: stampSize - 1.5, anchor: 'start', fill: 'paper-ink-2', face: 'ticket', middle: true })
  } else {
    p.line(strip.x + 2, strip.y + 2, strip.x + 2, strip.y + strip.h - 2, { stroke: 'paper-rule', width: 1, dash: '1 3' })
    p.text(strip.x + strip.w / 2 + 1, strip.y + 10, 'TICKS', { size: 8, fill: 'paper-ink-2', face: 'ticket', middle: true })
    p.text(strip.x + strip.w / 2 + 1, strip.y + 21, 'SYNTHETIC', { size: 6.2, fill: 'paper-ink-2', face: 'ticket', middle: true })
  }
  const stamps = [w.startUs, ...w.fires.map((fire) => fire.startUs).filter((at) => at >= w.startUs)]
  let free = Number.NEGATIVE_INFINITY
  for (const at of stamps) {
    const text = String(at)
    const along = g.origin + t(at) * p.px
    if (along < free) continue
    if (p.landscape) {
      p.text(along + 1.5, strip.y + strip.h / 2 + 1, text, { size: stampSize, anchor: 'start', fill: 'paper-ink', face: 'numeric', middle: true })
      free = along + 1.5 + stampWidth(text, stampSize) + 4
    } else {
      p.text(strip.x + 6, along + 4, text, { size: stampSize, anchor: 'start', fill: 'paper-ink', face: 'numeric', middle: true })
      free = along + stampSize + 3
    }
  }

  // The expo's lane: its shelf, and a board on it for each plan and each read.
  p.layer('cpu')
  shelfAt(p, p.lane(0, windowTicks, g.cpu.a, g.cpu.b))
  for (const span of w.cpu) {
    if (span.kind !== 'schedule' && span.kind !== 'sync') continue
    const r = p.lane(t(span.startUs), t(span.endUs), g.cpu.a + g.cpu.pad, g.cpu.b - g.cpu.pad - 4)
    if (r.w <= 0 || r.h <= 0) continue
    p.rect(r.x, r.y, r.w, r.h, span.kind === 'schedule' ? { fill: 'lane-cpu', stroke: 'cat-blue-edge', width: 1, rx: 1.5 } : { fill: 'lane-sync', stroke: 'cat-yellow-edge', width: 1, rx: 1.5 })
  }

  // The line: its counter, a well for each clip's station, a pan in a well for each ticket's stay, a place in every well for every
  // fire, and the dark stretches shading the whole line where it waited.
  p.layer('gpu')
  const counter = p.lane(0, windowTicks, g.gpu.a, g.gpu.b)
  p.rect(counter.x, counter.y, counter.w, counter.h, { fill: 'surface-1', opacity: 0.62 })
  if (p.landscape) {
    p.line(counter.x, counter.y + 0.5, counter.x + counter.w, counter.y + 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
    p.line(counter.x, counter.y + counter.h - 0.5, counter.x + counter.w, counter.y + counter.h - 0.5, { stroke: 'surface-3', width: 1 })
  } else {
    p.line(counter.x + 0.5, counter.y, counter.x + 0.5, counter.y + counter.h, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
    p.line(counter.x + counter.w - 0.5, counter.y, counter.x + counter.w - 0.5, counter.y + counter.h, { stroke: 'surface-3', width: 1 })
  }
  const rowOf = (slot: number) => g.gpu.first + slot * g.gpu.pitch
  for (let slot = 0; slot < view.slots; slot++) wellAt(p, p.lane(0, windowTicks, rowOf(slot) - 1, rowOf(slot) + g.gpu.row + 1))
  const detailFrom = w.fires.length - DETAIL_FIRES
  const labels: { box: Box; req: number }[] = []
  for (let slot = 0; slot < view.slots; slot++) {
    for (const run of runsIn(w.fires, slot)) {
      const pan = inset(p, p.lane(t(run.from.startUs), t(run.to.endUs), rowOf(slot) + 1, rowOf(slot) + g.gpu.row - 1), 0.75, 0)
      if (pan.w <= 0 || pan.h <= 0) continue
      panAt(p, pan)
      if (detail === 'full' && (p.landscape ? pan.w : pan.h) >= 22) labels.push({ box: pan, req: run.req })
    }
  }
  if (detail !== 'slabs') {
    w.fires.forEach((fire, i) => {
      if (i < detailFrom) return
      const t0 = t(fire.startUs)
      const t1 = t(fire.endUs)
      if (t1 <= t0) return
      fire.places.forEach((place, slot) => {
        const cell = inset(p, p.lane(t0, t1, rowOf(slot), rowOf(slot) + g.gpu.row), 2, place.state === 'empty' ? 4 : 5)
        if (cell.w <= 0 || cell.h <= 0) return
        if (place.state === 'plate') plateAt(p, cell, detail)
        else if (place.state === 'binned') binnedAt(p, cell)
        else grooveAt(p, cell)
      })
    })
  }
  for (const label of labels) panTapeAt(p, g, label.box, label.req)
  w.fires.forEach((fire, i) => {
    const before = w.fires[i - 1]
    if (before === undefined || fire.startUs <= before.endUs) return
    const dark = p.lane(t(before.endUs), t(fire.startUs), g.gpu.a + 1, g.gpu.b - 1)
    if (dark.w <= 0 || dark.h <= 0) return
    p.rect(dark.x, dark.y, dark.w, dark.h, { fill: 'surface-3', opacity: 0.55 })
    if (detail === 'full' && fire.bubbleUs > 0 && (p.landscape ? dark.w : dark.h) >= 14) {
      p.text(dark.x + dark.w / 2, dark.y + dark.h / 2, String(fire.bubbleUs), { size: g.numberSize, fill: 'paper', face: 'numeric', middle: true })
    }
  })

  // The line's stations: a mark at the head of each well, solid where the latest fire cooked a course.
  p.layer('stations')
  stationsOf(view).forEach((lit, j) => {
    const across = rowOf(j) + g.gpu.row / 2
    if (p.landscape) stationAt(p, g.origin - 8, across, lit)
    else stationAt(p, across, g.origin - 10, lit)
  })

  // The lanes' names, on masking tape in marker.
  p.layer('labels')
  if (p.landscape) {
    tapeAt(p, 2, g.cpu.a + 2, 86, 16, 'THE EXPO · CPU', 9)
    tapeAt(p, 2, g.gpu.a + 4, 80, 16, 'THE LINE · GPU', 9)
  } else {
    tapeAt(p, g.cpu.a, g.origin - 36, g.cpu.b - g.cpu.a, 13, 'EXPO · CPU', 7)
    tapeAt(p, g.gpu.a + 40, g.origin - 36, g.gpu.b - g.gpu.a - 80, 13, 'THE LINE · GPU', 8)
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

const FACE: Readonly<Record<Face, string>> = {
  numeric: 'var(--es-font-numeric)',
  ticket: 'var(--es-font-ticket)',
  label: 'var(--es-font-label)',
  body: 'var(--es-font-body)',
}
const paint = (role: Paint): string => (role === 'none' ? 'none' : `var(--es-${role})`)

/** The blur a soft mark takes, in the frame's units [estimated]: the heat lamp's pool has no edge. */
const SOFT_BLUR = 9
/** The id of a frame's blur. The two orientations can share a page (the static HTML holds both), so each has its own. */
const softId = (orientation: Orientation): string => `es-lamp-pool-${orientation}`

function markNode(mark: Mark, orientation: Orientation): SvgNode {
  const style = (s: Style): Record<string, string | number> => ({
    ...(s.fill === undefined ? {} : { fill: paint(s.fill) }),
    ...(s.stroke === undefined ? {} : { stroke: paint(s.stroke) }),
    ...(s.width === undefined ? {} : { strokeWidth: s.width }),
    ...(s.dash === undefined ? {} : { strokeDasharray: s.dash }),
    ...(s.opacity === undefined ? {} : { fillOpacity: s.opacity }),
    ...(s.strokeOpacity === undefined ? {} : { strokeOpacity: s.strokeOpacity }),
  })
  switch (mark.kind) {
    case 'rect':
      return {
        tag: 'rect',
        attrs: {
          x: mark.x,
          y: mark.y,
          width: mark.w,
          height: mark.h,
          ...(mark.rx === undefined ? {} : { rx: mark.rx }),
          ...style(mark),
          ...(mark.soft ? { filter: `url(#${softId(orientation)})` } : {}),
        },
      }
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
  const soft = frame.layers.some((layer) => layer.marks.some((mark) => mark.kind === 'rect' && mark.soft === true))
  const blur: SvgNode = {
    tag: 'defs',
    attrs: {},
    children: [
      {
        tag: 'filter',
        attrs: { id: softId(frame.orientation), x: '-20%', y: '-60%', width: '140%', height: '220%' },
        children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: SOFT_BLUR } }],
      },
    ],
  }
  const layers = frame.layers.map((layer): SvgNode => ({ tag: 'g', attrs: { 'data-part': layer.part }, children: layer.marks.map((mark) => markNode(mark, frame.orientation)) }))
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
    children: soft ? [blur, ...layers] : layers,
  }
}

/** Marks in a frame. */
export const markCount = (frame: Frame): number => countMarks(frameSvg(frame))
