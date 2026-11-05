/**
 * Service's 2D view (A§6.3, GAMES.md §3 "2D path", §2.6 "Service"): a view of the night turned into positioned marks, which the 2D
 * view and the poster draw as SVG (`frameSvg`). It is the same kitchen the 3D scene draws (src/games/loop/scene-layout.ts), the pass
 * seen from above, in the world's own materials and nothing a chart has:
 *   - the line, at the top: a station for each clip, a steel top with a well cut in it and a burner. While a ticket holds the clip, a
 *     hotel pan stands in the well, its KV block, with a drawn rim and a recessed floor and the ticket's number in marker on a strip of
 *     masking tape across its rim; an empty clip leaves the well bare and dark. The burner is struck solid where the latest fire
 *     cooked a course and an open ring where its clip rode empty: the drawing has no lamp off the pass, so the state is a shape;
 *   - the fired rail, while a fire is on the line: a copy of each of that fire's tickets, which holds it while the expo writes the
 *     next call on the rail;
 *   - the rail, a steel bar with a clip for each slot, a paper ticket hung on every taken clip and a red-printed stub on every empty
 *     one;
 *   - the pass, under the heat lamp's amber pooled over the clips while the night is open, as light with no edge, the drawing's only
 *     amber; on it, the plates of the last fire read back, one under every clip that cooked a course, a binned plate hollow and
 *     struck through in the ribbon's red, and an empty place a dark ring;
 *   - the printer at the pass's left end and the tickets it has fed, the next in line first.
 * Masking tape and marker name the line and the expo. A state is a shape before it is a colour (WCAG 1.4.1), and no code colour marks
 * a state. Every number the drawing writes is a ticket's number; the counters are DOM, in the printer's tape and the mirror.
 *
 * The frame has two orientations of the same plan: landscape, with the printer at the left of the rail, and portrait, for a phone,
 * with the printer on the pass's near side under it. A frame's size never changes with the night, so nothing moves when it is drawn.
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
export type Paint = 'none' | 'surface-1' | 'surface-2' | 'surface-3' | 'edge' | 'paper' | 'paper-ink' | 'paper-ink-2' | 'paper-rule' | 'lamp' | 'text-1' | 'lane-gpu' | 'tape' | 'tape-ink'

/** The roles above, as a list, for the test that checks them against the design system. */
export const PAINTS: readonly Paint[] = ['surface-1', 'surface-2', 'surface-3', 'edge', 'paper', 'paper-ink', 'paper-ink-2', 'paper-rule', 'lamp', 'text-1', 'lane-gpu', 'tape', 'tape-ink']

/** The faces the drawing sets text in: the printer's dots for numbers and print, and marker on masking tape. */
export type Face = 'numeric' | 'ticket' | 'label'

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
    }

/** Marks that belong together, drawn as one group: `part` names the object (`line`, `fired`, `rail`, `pass`, `printer`, `labels`). */
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
}

/** The most marks the 2D view draws (A§6.4, W0-T16). The plan draws a fixed set of marks per clip, far under it. */
export const MARK_CAP = 2000

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
/* The mirror's window                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ticks of the night the mirror lists, by the width it is read at [estimated]: the mirror names the fires of the larger. */
export const WINDOW_TICKS: Readonly<Record<Orientation, number>> = { landscape: 76, portrait: 40 }
export const MIRROR_TICKS: number = Math.max(WINDOW_TICKS.landscape, WINDOW_TICKS.portrait)

export interface Window {
  /** The tick the window starts at. */
  readonly startUs: Us
  readonly windowTicks: number
  /** The fires with any part inside the window, oldest first. */
  readonly fires: readonly FireView[]
  /** The expo's spans inside the window. */
  readonly cpu: readonly Span[]
  /** Fires older than the window: summed in one row of the mirror. */
  readonly hidden: number
}

/**
 * The last part of the night, which the mirror lists fire by fire. While the night fits it starts at 0. After that it starts at the
 * plan of the oldest fire that still lets the night end inside the window, so it moves by whole fires and never cuts one in half; a
 * fire on the line whose cooking runs into the window from before it is kept.
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

/** A rectangle in the frame's units. */
interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

interface Geometry {
  readonly width: number
  readonly height: number
  /** The first clip's left edge, and the most room a clip takes along the rail. */
  readonly railX: number
  readonly pitch: number
  /** The rows, from the line down to the expo: the line's top and depth, the two rails' bars, the pass and its rolled lip. */
  readonly line: { readonly y: number; readonly h: number }
  readonly firedY: number
  readonly railY: number
  readonly pass: { readonly y: number; readonly h: number }
  readonly lip: number
  readonly ticket: { readonly w: number; readonly h: number }
  readonly copy: { readonly w: number; readonly h: number }
  readonly plate: number
  readonly printer: Box
  /** The counter's tickets beside the printer: where the first lies, the distance between them, and how many show. */
  readonly queue: { readonly x: number; readonly y: number; readonly pitch: number; readonly slots: number }
  /** Where the masking tape goes: the line's name, the expo's, and the fired rail's. */
  readonly tapes: { readonly line: Box; readonly expo: Box; readonly fired: Box }
  readonly numberSize: number
  readonly textSize: number
}

const LANDSCAPE: Geometry = {
  width: 720,
  height: 300,
  railX: 214,
  pitch: 124,
  line: { y: 6, h: 78 },
  firedY: 100,
  railY: 150,
  pass: { y: 214, h: 60 },
  lip: 277,
  ticket: { w: 30, h: 44 },
  copy: { w: 22, h: 32 },
  plate: 19,
  printer: { x: 4, y: 134, w: 40, h: 58 },
  queue: { x: 52, y: 144, pitch: 36, slots: 4 },
  tapes: { line: { x: 78, y: 36, w: 128, h: 17 }, expo: { x: 78, y: 279, w: 128, h: 17 }, fired: { x: 118, y: 94, w: 88, h: 14 } },
  numberSize: 12,
  textSize: 11,
}

const PORTRAIT: Geometry = {
  width: 360,
  height: 360,
  railX: 6,
  pitch: 87,
  line: { y: 4, h: 70 },
  firedY: 104,
  railY: 152,
  pass: { y: 212, h: 58 },
  lip: 272,
  ticket: { w: 28, h: 40 },
  copy: { w: 20, h: 28 },
  plate: 17,
  printer: { x: 6, y: 298, w: 34, h: 52 },
  queue: { x: 48, y: 306, pitch: 34, slots: 8 },
  tapes: { line: { x: 6, y: 80, w: 118, h: 15 }, expo: { x: 6, y: 278, w: 118, h: 15 }, fired: { x: 248, y: 80, w: 106, h: 15 } },
  numberSize: 11,
  textSize: 10,
}

const geometryOf = (orientation: Orientation): Geometry => (orientation === 'portrait' ? PORTRAIT : LANDSCAPE)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drawing                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The marks of the layers under construction. */
function painter() {
  const layers: { part: string; marks: Mark[] }[] = []
  let marks: Mark[] = []
  const layer = (part: string) => {
    marks = []
    layers.push({ part, marks })
  }
  const rect = (x: number, y: number, w: number, h: number, style: Style & { rx?: number; soft?: boolean } = {}) => void marks.push({ kind: 'rect', x: num(x), y: num(y), w: num(w), h: num(h), ...style })
  const line = (x1: number, y1: number, x2: number, y2: number, style: Style) => void marks.push({ kind: 'line', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), ...style })
  const circle = (cx: number, cy: number, r: number, style: Style) => void marks.push({ kind: 'circle', cx: num(cx), cy: num(cy), r, ...style })
  const text = (x: number, y: number, label: string, size: number, fill: Paint, face: Face, anchor: 'start' | 'middle' = 'middle') =>
    void marks.push({ kind: 'text', x: num(x), y: num(y), text: label, size, anchor, fill, face })
  return { layers, layer, rect, line, circle, text }
}

type Painter = ReturnType<typeof painter>

/** Brushed steel lit along its far edge by the tubes and shaded along its near one: a counter, a station's top, a rail's bar. */
function steel(p: Painter, r: Box, rx = 0, opacity = 0.62) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'surface-1', opacity, rx })
  p.line(r.x + rx, r.y + 0.5, r.x + r.w - rx, r.y + 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
  p.line(r.x + rx, r.y + r.h - 0.5, r.x + r.w - rx, r.y + r.h - 0.5, { stroke: 'surface-3', width: 1 })
}

/** A strip of masking tape with its words in marker: how the kitchen names a thing. */
function tapeAt(p: Painter, r: Box, words: string, size: number) {
  p.rect(r.x, r.y, r.w, r.h, { fill: 'tape' })
  p.text(r.x + r.w / 2, r.y + r.h / 2 + 0.5, words, size, 'tape-ink', 'label')
}

/** A paper ticket with its punched hole and its number, hanging with its top middle at (cx, y). */
function ticketAt(p: Painter, cx: number, y: number, size: { w: number; h: number }, id: number, numberSize: number) {
  p.rect(cx - size.w / 2, y, size.w, size.h, { fill: 'paper', stroke: 'paper-rule', width: 1 })
  p.circle(cx, y + 5, 2.25, { fill: 'surface-3' })
  p.text(cx, y + size.h * 0.6, ticketNo(id), numberSize, 'paper-ink', 'numeric')
}

/** A rail: a bar of polished steel with a clip for each slot, and what each clip holds. */
function railAt(p: Painter, g: Geometry, y: number, clips: readonly ClipView[], pitch: number, size: { w: number; h: number }, numberSize: number, stubs: boolean) {
  const width = clips.length * pitch
  p.rect(g.railX, y, width, 7, { fill: 'surface-3', rx: 2 })
  p.line(g.railX + 2, y + 1.5, g.railX + width - 2, y + 1.5, { stroke: 'paper', width: 1, strokeOpacity: 0.55 })
  clips.forEach((clip, j) => {
    const cx = g.railX + pitch / 2 + j * pitch
    p.rect(cx - 5, y - 4, 10, 15, { fill: 'surface-2', stroke: 'surface-3', width: 1.5, rx: 2 })
    if (clip.req !== null) ticketAt(p, cx, y + 12, size, clip.req, numberSize)
    else if (stubs) {
      // Paid for, and empty: a stub of paper on the clip, printed in the ribbon's red.
      const w = size.w + 12
      p.rect(cx - w / 2, y + 12, w, size.h / 2, { fill: 'paper', stroke: 'paper-rule', width: 1, dash: '2 2' })
      p.text(cx, y + 12 + size.h / 4 + 0.5, 'empty', g.textSize - 1, 'paper-ink-2', 'ticket')
    }
  })
}

/**
 * A station of the line from above, over its clip: a steel top, a well cut in it and a burner. A ticket's hotel pan stands in the
 * well, a raised rim round a recessed floor, the far wall's shadow inside and the near rim catching the tubes, with the ticket's number
 * on tape across the rim; with the clip empty the well is a bare dark hole. The burner is solid while the station burns.
 */
function stationAt(p: Painter, g: Geometry, cx: number, req: number | null, lit: boolean, pitch: number) {
  const top: Box = { x: cx - (pitch - 12) / 2, y: g.line.y, w: pitch - 12, h: g.line.h }
  steel(p, top, 3, 0.85)
  p.rect(top.x, top.y, top.w, top.h, { fill: 'none', stroke: 'edge', width: 1, rx: 3 })
  const well: Box = { x: top.x + 6, y: top.y + 8, w: top.w * 0.56, h: top.h - 16 }
  if (req === null) {
    p.rect(well.x, well.y, well.w, well.h, { fill: 'surface-3', opacity: 0.88, rx: 5 })
  } else {
    p.rect(well.x, well.y, well.w, well.h, { fill: 'surface-1', stroke: 'edge', width: 1, rx: 6 })
    p.rect(well.x + 4, well.y + 4, well.w - 8, well.h - 8, { fill: 'surface-2', rx: 3 })
    p.line(well.x + 7, well.y + 5, well.x + well.w - 7, well.y + 5, { stroke: 'paper-ink', width: 2, strokeOpacity: 0.32 })
    p.line(well.x + 7, well.y + well.h - 4.5, well.x + well.w - 7, well.y + well.h - 4.5, { stroke: 'paper', width: 1, strokeOpacity: 0.9 })
    const tape: Box = { x: well.x + well.w / 2 - 12, y: well.y + well.h - 10, w: 24, h: 12 }
    tapeAt(p, tape, ticketNo(req), g.numberSize - 1.5)
  }
  // The burner: its ring always, and its core struck solid while it burns.
  const bx = top.x + top.w * 0.8
  const by = top.y + top.h / 2
  const r = Math.min(11, top.h * 0.16, top.w * 0.12)
  p.circle(bx, by, r + 3, { fill: 'surface-2', stroke: 'surface-3', width: 1 })
  p.circle(bx, by, r, { fill: 'none', stroke: 'text-1', width: 1.5 })
  if (lit) p.circle(bx, by, r - 3.5, { fill: 'text-1' })
}

/** The last fire read back: the place under clip `slot`, on the pass. */
function plateAt(p: Painter, cx: number, cy: number, r: number, state: 'plate' | 'empty' | 'binned') {
  if (state === 'plate') {
    p.circle(cx, cy, r, { fill: 'paper', stroke: 'paper-rule', width: 0.75 })
    p.circle(cx, cy, r * 0.62, { fill: 'none', stroke: 'paper-rule', width: 0.6 })
  } else if (state === 'binned') {
    p.circle(cx, cy, r, { fill: 'none', stroke: 'paper-ink-2', width: 1.5, dash: '3 2' })
    p.line(cx - r * 0.7, cy + r * 0.7, cx + r * 0.7, cy - r * 0.7, { stroke: 'paper-ink-2', width: 1.5 })
  } else p.circle(cx, cy, r - 2, { fill: 'none', stroke: 'surface-3', width: 1.25, dash: '2 3' })
}

/** The drawing of a night. */
function build(view: LoopView, orientation: Orientation): Layer[] {
  const g = geometryOf(orientation)
  const p = painter()
  const pitch = Math.min(g.pitch, (g.width - 4 - g.railX) / view.slots)
  const clipX = (slot: number) => g.railX + pitch / 2 + slot * pitch
  const railRight = g.railX + view.slots * pitch
  const lit = stationsOf(view)

  // The line: a station over each clip, its well holding the ticket's pan, its burner solid where the latest fire cooked.
  p.layer('line')
  view.rail.forEach((clip, slot) => stationAt(p, g, clipX(slot), clip.req, lit[slot], pitch))

  // The pass: the counter, the heat lamp's amber pooled over the clips while the night is open (light, not a box: one soft pool
  // with no edge, which the frame blurs, and nowhere else), and on it the plates of the last fire read back.
  p.layer('pass')
  steel(p, { x: 0, y: g.pass.y, w: g.width, h: g.pass.h })
  p.layer('lamp')
  const poolLeft = Math.max(0, g.railX - 14)
  if (!view.done) p.rect(poolLeft, g.pass.y + 3, Math.min(g.width, railRight + 8) - poolLeft, g.pass.h - 6, { fill: 'lamp', opacity: 0.5, rx: g.pass.h / 2, soft: true })
  p.layer('plates')
  const served = [...view.fires].reverse().find((fire) => !fire.onLine)
  served?.places.forEach((place, slot) => plateAt(p, clipX(slot), g.pass.y + g.pass.h / 2, g.plate, place.state))
  p.rect(0, g.lip, g.width, 3, { fill: 'surface-2' })
  p.line(0, g.lip + 0.5, g.width, g.lip + 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.8 })

  // The fired rail, while a fire is on the line, and the rail.
  if (view.firedRail !== null) {
    p.layer('fired')
    railAt(p, g, g.firedY, view.firedRail, pitch, g.copy, g.numberSize - 1, false)
    tapeAt(p, g.tapes.fired, 'FIRED RAIL', g.textSize - 2.5)
  }
  p.layer('rail')
  railAt(p, g, g.railY, view.rail, pitch, g.ticket, g.numberSize, true)

  // The printer, and the tickets it has fed beside it, the next in line first; what it still holds is counted on the strip's end.
  p.layer('printer')
  const { printer, queue } = g
  p.rect(printer.x, printer.y, printer.w, printer.h, { fill: 'surface-3', rx: 3 })
  p.rect(printer.x + printer.w - 6, printer.y + 8, 4, printer.h - 16, { fill: 'surface-1', rx: 1 })
  const shown = view.waiting.length > queue.slots ? queue.slots - 1 : view.waiting.length
  const size = { w: g.ticket.w - 4, h: g.ticket.h - 8 }
  view.waiting.slice(0, shown).forEach((id, i) => ticketAt(p, queue.x + size.w / 2 + i * queue.pitch, queue.y, size, id, g.numberSize - 1))
  if (view.waiting.length > shown) p.text(queue.x + size.w / 2 + shown * queue.pitch, queue.y + size.h * 0.6, `+${view.waiting.length - shown}`, g.numberSize, 'text-1', 'numeric')

  // The line's name and the expo's, on masking tape in marker.
  p.layer('labels')
  tapeAt(p, g.tapes.line, 'THE LINE · GPU', g.textSize - 2)
  tapeAt(p, g.tapes.expo, 'THE EXPO · CPU', g.textSize - 2)
  return p.layers
}

/** The sentence that names the drawing: the state it shows, for assistive technology and for the poster's alt text. */
function describe(view: LoopView): string {
  const hung = view.rail.filter((clip) => clip.req !== null).length
  const waiting = view.waiting.length
  return `${view.title}. The rail has ${view.slots} clips and ${hung} ${hung === 1 ? 'is' : 'are'} hung. ${waiting} ${waiting === 1 ? 'ticket waits' : 'tickets wait'}. ${view.step} ${view.step === 1 ? 'fire has' : 'fires have'} been rung, and the clock reads ${view.clockUs} ticks, synthetic.`
}

/** The frame of a view: its layers in drawing order. The same view and options always give the same frame. */
export function layoutFrame(view: LoopView, options: FrameOptions = {}): Frame {
  const orientation = options.orientation ?? 'landscape'
  const g = geometryOf(orientation)
  return { orientation, width: g.width, height: g.height, label: describe(view), layers: build(view, orientation) }
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
        attrs: { x: mark.x, y: mark.y, fill: paint(mark.fill), fontFamily: FACE[mark.face], fontSize: mark.size, textAnchor: mark.anchor, dominantBaseline: 'central' },
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
