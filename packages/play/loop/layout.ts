/**
 * Service's 2D view (A§6.3, GAMES.md §3 "2D path", §2.6 "Service"): a view of the night turned into positioned marks, which the 2D
 * view and the poster draw as SVG (`frameSvg`). It is the kitchen the 3D scene draws (src/games/loop/scene-layout.ts), on the same plan
 * and through the same shot (kitchen.ts), drawn flat in the world's own materials and nothing a chart has, so the first paint, the view
 * a phone without 3D keeps and the 3D scene are one picture at one scale:
 *   - the room: subway tile on the back wall and the side wall, each with its grout and its joints, the side wall shading as it
 *     recedes to the far corner, the quarry floor, and the hood over the line, softening into haze;
 *   - the line: a station for each clip, its cabinet, its control panel with its knobs and its pilot, and on its top what it cooks on
 *     (a griddle, four burners under their grates, a fryer's wells). Where the latest fire cooked a course the station burns: its pilot
 *     and its heat glow in the lamp's amber, and its burners' heads struck solid. Where its clip rode empty it stands cold, its pilot an
 *     open ring;
 *   - the gantry over the pass, the rail hung from it with a clip for each slot, a paper ticket hung on every taken clip with its number
 *     printed, and a stub printed "empty" in the ribbon's red on every empty one; while a fire is on the line, the fired rail under it;
 *   - the three heat lamps on their cords, and under each its light on the pass's brushed steel: a gradient from a hot middle out to
 *     nothing, longer across the brush than along it, never a blur;
 *   - the pass: its brushed top with the plates of the last fire read back, one under every clip that cooked a course, each with its
 *     rim and its shadow, a binned plate hollow and struck through in the ribbon's red, an empty place a dashed ring; its rolled front
 *     edge with the expo's name on masking tape, and under it the heated shelf's bars with the plate stacks warming on them;
 *   - on Service's own page, the printer at the pass's left end and the tickets it has fed lying on the counter, the next first. The
 *     front page holds a printer of its own, so its shot draws none.
 * A state is a shape before it is a colour (WCAG 1.4.1), the lamp's amber marks only the pass's pools and a burning station, and no
 * code colour marks a state. Every number the drawing writes is a ticket's number; the counters are DOM, in the printer's tape and the
 * mirror.
 *
 * A frame is the shot's picture at a fixed size: the viewBox is the shot's full height and 2.4 heights wide in landscape (as wide as
 * it is tall in portrait), its centre the camera's. The room is drawn past the viewBox on every side, so a page that shows the frame in a wider box,
 * or with its lens shifted (the front page from 80rem, and its phone layout), lets it overflow into the box and finds the kitchen there.
 * A frame's size never changes with the night, so nothing moves when it is drawn.
 */
import type { Us } from '@es/sim/core'
import type { Span } from '@es/sim/steploop'
import { clipX, FIRED, GRIP, HOOD, lampsOf, LINE, lineOf, MOUTH, PASS, passWidth, PLATE_R, PLATE_Z, RAIL, railLength, SHELF, SHOTS, STATION_KINDS, TICKET, viewOf, WALL_Z, type Shot } from './kitchen'
import { countMarks, num } from './svg'
import type { SvgNode } from './svg'
import type { ClipView, FireView, LoopView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Marks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The token roles the drawing paints with (src/design/tokens.ts). `none` is no paint, and `lamp-pool` and `wall-shade` are the frame's
 * two gradients, each made of these roles (`GRADIENTS`): the lamps' light on the pass, and the side wall's shade.
 */
export type Paint =
  | 'none'
  | 'lamp-pool'
  | 'wall-shade'
  | 'glint'
  | 'surface-0'
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
  | 'lane-gpu'
  | 'tape'
  | 'tape-ink'

/** The roles among those paints, as a list, for the test that checks them against the design system. */
export const PAINTS: readonly Paint[] = ['glint', 'surface-0', 'surface-1', 'surface-2', 'surface-3', 'edge', 'paper', 'paper-ink', 'paper-ink-2', 'paper-rule', 'lamp', 'lamp-ring', 'text-1', 'lane-gpu', 'tape', 'tape-ink']

/** The faces the drawing sets text in: the printer's dots for numbers and print, and marker on masking tape. */
export type Face = 'numeric' | 'ticket' | 'label'

interface Style {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
  readonly opacity?: number
  readonly strokeOpacity?: number
  /** Light, not a surface: the frame blurs it, so it has no edge (a station's heat, a lamp's mouth). */
  readonly soft?: boolean
}

export type Mark =
  | ({ readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number } & Style)
  | ({ readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } & Style)
  | ({ readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number } & Style)
  | ({ readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number } & Style)
  /** A polygon through its points. */
  | ({ readonly kind: 'poly'; readonly points: readonly (readonly [number, number])[] } & Style)
  /** Many straight strokes in one mark: tile joints, grates, bars. */
  | ({ readonly kind: 'path'; readonly d: string } & Style)
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

/** Marks that belong together, drawn as one group: `part` names the object (`room`, `line`, `heat`, `rail`, `clips`, `pass`, ...). */
export interface Layer {
  readonly part: string
  readonly marks: readonly Mark[]
}

export type Orientation = 'landscape' | 'portrait'

/** Whose shot a frame is drawn through: the front page's, or Service's own page's (kitchen.ts, `SHOTS`). */
export type ShotName = keyof typeof SHOTS

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
  /** The front page's shot draws no printer, for the page holds its own; Service's page draws it. Default `loop`. */
  readonly shot?: ShotName
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
/* The frame and its lens                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A frame's size in its own units: the shot's full height is 300 in landscape and 600 in portrait, and the frame 2.4 or 1 heights wide. */
export const FRAMES: Readonly<Record<Orientation, { readonly width: number; readonly height: number }>> = {
  landscape: { width: 720, height: 300 },
  portrait: { width: 600, height: 600 },
}

type Pt = readonly [number, number]

/** A frame coordinate as the drawing writes it: a tenth of a unit, a fraction of a pixel on any screen. */
const tenth = (value: number): number => Math.round(value * 10) / 10

/** A shot's projection into a frame: a point of the kitchen to frame units, and how many frame units a metre is there. */
function lensOf(shot: Shot, width: number, height: number) {
  const see = viewOf(shot)
  const half = height / 2
  const at = (x: number, y: number, z: number): Pt => {
    const s = see([x, y, z])
    return [tenth(width / 2 + s.c * half), tenth(half - s.d * half)]
  }
  const per = (x: number, y: number, z: number): number => half / (see([x, y, z]).depth * shot.k)
  /** A level disc of radius `r` at (x, y, z), seen from the shot: an ellipse. */
  const disc = (x: number, y: number, z: number, r: number) => {
    const [cx] = at(x, y, z)
    const far = at(x, y, z - r)[1]
    const near = at(x, y, z + r)[1]
    return { cx, cy: num((far + near) / 2), rx: num(r * per(x, y, z)), ry: num(Math.max(0.3, (near - far) / 2)) }
  }
  return { at, per, disc }
}

type Lens = ReturnType<typeof lensOf>

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
  const rect = (x: number, y: number, w: number, h: number, style: Style & { rx?: number } = {}) => void marks.push({ kind: 'rect', x: num(x), y: num(y), w: num(w), h: num(h), ...style })
  const line = (a: Pt, b: Pt, style: Style) => void marks.push({ kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], ...style })
  const circle = (cx: number, cy: number, r: number, style: Style) => void marks.push({ kind: 'circle', cx: num(cx), cy: num(cy), r: num(r), ...style })
  const ellipse = (e: { cx: number; cy: number; rx: number; ry: number }, style: Style) => void marks.push({ kind: 'ellipse', ...e, ...style })
  const poly = (points: readonly Pt[], style: Style) => void marks.push({ kind: 'poly', points, ...style })
  // Each stroke a subpath: level strokes as `H`, upright ones as `V`, so a wall of tile joints stays short.
  const path = (strokes: readonly (readonly [Pt, Pt])[], style: Style) => {
    const d = strokes.map(([a, b]) => `M${a[0]} ${a[1]}${a[1] === b[1] ? `H${b[0]}` : a[0] === b[0] ? `V${b[1]}` : `L${b[0]} ${b[1]}`}`).join('')
    if (d.length > 0) marks.push({ kind: 'path', d, ...style })
  }
  const text = (x: number, y: number, label: string, size: number, fill: Paint, face: Face) => void marks.push({ kind: 'text', x: num(x), y: num(y), text: label, size: num(size), anchor: 'middle', fill, face })
  const add = (mark: Mark) => void marks.push(mark)
  return { layers, layer, rect, line, circle, ellipse, poly, path, text, add }
}

type Painter = ReturnType<typeof painter>

/** An upright quad in the plane z = `z`, from x0 to x1 and y0 to y1, seen from the shot. */
const upright = (lens: Lens, x0: number, x1: number, y0: number, y1: number, z: number): Pt[] => [lens.at(x0, y1, z), lens.at(x1, y1, z), lens.at(x1, y0, z), lens.at(x0, y0, z)]
/** A level quad at height y, from x0 to x1 and z0 to z1. */
const level = (lens: Lens, x0: number, x1: number, y: number, z0: number, z1: number): Pt[] => [lens.at(x0, y, z0), lens.at(x1, y, z0), lens.at(x1, y, z1), lens.at(x0, y, z1)]

/** A strip of masking tape across a point, `w` by `h` metres, its words in marker. */
function tape(p: Painter, lens: Lens, x: number, y: number, z: number, w: number, h: number, words: string) {
  p.poly(upright(lens, x - w / 2, x + w / 2, y - h / 2, y + h / 2, z), { fill: 'tape' })
  const [cx, cy] = lens.at(x, y, z)
  p.text(cx, cy + 0.4, words, h * 0.62 * lens.per(x, y, z), 'tape-ink', 'label')
}

/**
 * Where a frame's room is drawn in detail: the part of the frame (and past it) that some page shows. A landscape frame is shown with its
 * lens shifted right from 80rem, which brings a third of its width of room into a 2,560 px box at its left [derived from front.css's
 * shift of 1.15 half heights and its box at most 56rem tall], and the detail runs a little past that; a portrait one is shown cropped to
 * its middle, never past its sides.
 */
const SHOWN: Readonly<Record<Orientation, { readonly left: number; readonly right: number }>> = {
  landscape: { left: -0.42, right: 1.02 },
  portrait: { left: -0.02, right: 1.02 },
}

/** The room: tile on the back wall and the side wall, the floor, and the haze the far wall softens into. */
function room(p: Painter, lens: Lens, side: number, frame: { readonly orientation: Orientation; readonly width: number; readonly height: number }) {
  p.layer('room')
  const course = 0.075
  const tile = 0.15
  // The floor, from the wall to just short of the expo (nothing behind any shot's camera), its joints in rows and in runs to the wall.
  const near = 1.5
  p.poly(level(lens, -9, 9, 0, WALL_Z, near), { fill: 'surface-3' })
  const rows: [Pt, Pt][] = []
  for (let z = WALL_Z + 0.4; z < near; z += 0.4) rows.push([lens.at(-9, 0, z), lens.at(9, 0, z)])
  for (let x = -4.2; x < 4.3; x += 0.6) rows.push([lens.at(x, 0, WALL_Z), lens.at(x, 0, near)])
  p.path(rows, { stroke: 'surface-2', width: 0.5, strokeOpacity: 0.5 })
  // The back wall's tile: a grout line under every course, and the joints as one dashed stroke along each course, half a tile over on
  // every other course, a tile apart at the wall's middle height.
  p.poly(upright(lens, -9, 9, 0, 3.1, WALL_Z), { fill: 'paper' })
  const courses: [Pt, Pt][] = []
  const joints: [Pt, Pt][] = []
  for (let k = 1; k * course < 3.1; k++) {
    const y = k * course
    courses.push([lens.at(-9, y, WALL_Z), lens.at(9, y, WALL_Z)])
    const [x0, ym] = lens.at(-9 + (k % 2) * (tile / 2), y - course / 2, WALL_Z)
    joints.push([[x0, ym], [lens.at(9, y - course / 2, WALL_Z)[0], ym]])
  }
  p.path(courses, { stroke: 'paper-rule', width: 0.55 })
  const period = tenth(tile * lens.per(0, 1.6, WALL_Z))
  const height = tenth(course * lens.per(0, 1.6, WALL_Z))
  p.path(joints, { stroke: 'paper-rule', width: height, dash: `0.5 ${tenth(period - 0.5)}` })
  // The side wall at the left, receding toward the line, tiled as the back wall is: a grout line under every course, and each course's
  // joints a tile apart, half a tile over on every other course, drawn where a page can show them. A joint is too short to need more
  // than whole units, which keeps the many of them small: each moves from where the last one ended. Then the tubes' shadow over the
  // wall, deepening toward the far corner.
  const wall: Pt[] = [lens.at(side, 3.1, WALL_Z), lens.at(side, 3.1, near), lens.at(side, 0, near), lens.at(side, 0, WALL_Z)]
  p.poly(wall, { fill: 'paper' })
  const shown = SHOWN[frame.orientation]
  const seen = ([x, y]: Pt): boolean => x >= shown.left * frame.width && x <= shown.right * frame.width && y >= -0.05 * frame.height && y <= 1.05 * frame.height
  const pair = (x: number, y: number): string => `${x}${y < 0 ? '' : ' '}${y}`
  const sideCourses: [Pt, Pt][] = []
  let sideJoints = ''
  for (let k = 1; k * course < 3.1; k++) {
    const y = k * course
    sideCourses.push([lens.at(side, y, WALL_Z), lens.at(side, y, near)])
    let pen: Pt | null = null
    for (let z = WALL_Z + tile * (1 + (k % 2) / 2); z < near; z += tile) {
      const a = lens.at(side, y - course, z)
      const b = lens.at(side, y, z)
      if (!seen(a) && !seen(b)) continue
      const [ax, ay, bx, by] = [a[0], a[1], b[0], b[1]].map(Math.round)
      sideJoints += `${pen === null ? `M${pair(ax, ay)}` : `m${pair(ax - pen[0], ay - pen[1])}`}l${pair(bx - ax, by - ay)}`
      pen = [bx, by]
    }
  }
  p.path(sideCourses, { stroke: 'paper-rule', width: 0.55 })
  if (sideJoints.length > 0) p.add({ kind: 'path', d: sideJoints, stroke: 'paper-rule', width: 0.55 })
  p.poly(wall, { fill: 'wall-shade' })
  // The cove where the tile meets the floor.
  p.line(lens.at(-9, 0.03, WALL_Z + 0.02), lens.at(9, 0.03, WALL_Z + 0.02), { stroke: 'surface-2', width: 1.2 })
  // Haze: the far wall falls into the room's grey.
  p.poly(upright(lens, -9, 9, 0, 3.1, WALL_Z), { fill: 'surface-0', opacity: 0.32 })
}

/** The hood over the line: its front skirt in brushed steel, panel seams, its rolled lower lip, and the canopy's top edge. */
function hood(p: Painter, lens: Lens, half: number) {
  p.layer('hood')
  const front = WALL_Z + HOOD.depth
  const bottom = HOOD.top - HOOD.height
  p.poly(level(lens, -half, half, HOOD.top, WALL_Z, front), { fill: 'surface-2' })
  p.poly(upright(lens, -half, half, bottom, HOOD.top, front), { fill: 'surface-1' })
  const seams: [Pt, Pt][] = []
  for (let x = -half + 0.6; x < half - 0.1; x += 0.6) seams.push([lens.at(x, bottom + 0.03, front), lens.at(x, HOOD.top, front)])
  p.path(seams, { stroke: 'surface-2', width: 0.6 })
  p.line(lens.at(-half, HOOD.top - 0.005, front), lens.at(half, HOOD.top - 0.005, front), { stroke: 'paper', width: 0.8, strokeOpacity: 0.9 })
  p.poly(upright(lens, -half - 0.01, half + 0.01, bottom - 0.02, bottom + 0.03, front + 0.01), { fill: 'surface-2' })
  p.poly(upright(lens, -half, half, 0, HOOD.top, front), { fill: 'surface-0', opacity: 0.16 })
}

/** One station of the line: its cabinet, panel, knobs and pilot, its top and what it cooks on, burning or cold. */
function station(p: Painter, heat: Mark[], lens: Lens, kind: (typeof STATION_KINDS)[number], cx: number, w: number, lit: boolean) {
  const h = LINE.height
  const x0 = cx - w / 2 + 0.006
  const x1 = cx + w / 2 - 0.006
  const zf = LINE.z + LINE.depth / 2 - 0.015
  const zb = LINE.z - LINE.depth / 2 + 0.03
  p.poly(upright(lens, x0, x1, 0.1, h - 0.14, zf - 0.02), { fill: 'surface-2', stroke: 'surface-3', width: 0.5 })
  p.poly(upright(lens, x0, x1, h - 0.14, h - 0.03, zf + 0.01), { fill: 'surface-3' })
  const knobs = kind === 'burners' ? 4 : 2
  const r = Math.max(0.6, 0.02 * lens.per(cx, h - 0.085, zf))
  for (let k = 0; k < knobs; k++) {
    const [kx, ky] = lens.at(x0 + ((x1 - x0) * (k + 0.5)) / knobs - 0.02, h - 0.085, zf + 0.02)
    p.circle(kx, ky, r, { fill: 'paper-ink' })
  }
  // The pilot: a lens burning in the lamp's amber while the station cooks, an open ring of deep steel while it stands dark.
  const [px, py] = lens.at(x1 - 0.03, h - 0.085, zf + 0.02)
  if (lit) heat.push({ kind: 'circle', cx: px, cy: py, r: num(r * 0.8), fill: 'lamp', stroke: 'lamp-ring', width: 0.5 })
  else p.circle(px, py, r * 0.8, { fill: 'none', stroke: 'surface-3', width: 0.7 })
  const top = level(lens, x0, x1, h, zb, zf)
  p.poly(top, { fill: 'surface-2', stroke: 'surface-3', width: 0.4 })
  p.poly(upright(lens, x0, x1, h, h + 0.12, zb), { fill: 'surface-1' })
  // A burning station's whole top is warm with its heat: the lamp's amber laid over it, under its elements' own glow.
  if (lit) heat.push({ kind: 'poly', points: top, fill: 'lamp', opacity: 0.42 })
  const glow = (x: number, z: number, radius: number, strength: number) =>
    heat.push({ kind: 'ellipse', ...lens.disc(x, h + 0.005, z, radius), fill: 'lamp', opacity: strength, soft: true })
  const mid = LINE.z - 0.03
  if (kind === 'griddle') {
    p.poly(level(lens, x0 + 0.015, x1 - 0.015, h + 0.004, zb + 0.02, zf - 0.06), { fill: 'paper-ink', opacity: 0.86 })
    // Its front edge: a bar burning in the lamp's amber while it cooks, a cold one while it stands dark.
    const [e0, e1] = [lens.at(x0 + 0.02, h + 0.006, zf - 0.07), lens.at(x1 - 0.02, h + 0.006, zf - 0.07)]
    if (lit) {
      glow(cx, mid, w * 0.32, 0.7)
      heat.push({ kind: 'line', x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1], stroke: 'lamp', width: 1.4 })
    } else p.line(e0, e1, { stroke: 'surface-3', width: 1.4 })
  } else if (kind === 'burners') {
    const grates: [Pt, Pt][] = []
    for (const [dx, dz] of [
      [-w / 4, -LINE.depth / 4 + 0.02],
      [w / 4, -LINE.depth / 4 + 0.02],
      [-w / 4, LINE.depth / 4 - 0.06],
      [w / 4, LINE.depth / 4 - 0.06],
    ] as const) {
      const bx = cx + dx
      const bz = LINE.z + dz
      p.ellipse(lens.disc(bx, h, bz, 0.105), { fill: 'surface-3' })
      if (lit) glow(bx, bz, 0.095, 0.85)
      // The burner's head: struck solid while it burns, an open ring while it is cold.
      p.ellipse(lens.disc(bx, h + 0.02, bz, 0.036), lit ? { fill: 'paper-ink' } : { fill: 'none', stroke: 'paper-ink', width: 0.8 })
      grates.push([lens.at(bx - 0.125, h + 0.036, bz), lens.at(bx + 0.125, h + 0.036, bz)], [lens.at(bx, h + 0.036, bz - 0.125), lens.at(bx, h + 0.036, bz + 0.125)])
    }
    p.path(grates, { stroke: 'paper-ink', width: 1 })
  } else {
    const ww = (x1 - x0 - 0.06) / 2
    for (const k of [0, 1]) {
      const wx = x0 + 0.03 + ww * (k + 0.5)
      p.poly(level(lens, wx - ww / 2 + 0.012, wx + ww / 2 - 0.012, h, zb + 0.1, zf - 0.13), { fill: 'paper-ink', opacity: 0.9, stroke: 'surface-3', width: 0.6 })
      if (lit) glow(wx, mid - 0.02, ww * 0.42, 0.75)
      p.line(lens.at(wx, h + 0.04, zf - 0.14), lens.at(wx, h + 0.1, zf - 0.02), { stroke: 'surface-3', width: 0.9 })
    }
  }
}

/** The line: a station for each clip, burning where the latest fire cooked a course; its heat in a layer of its own, the lamp's amber. */
function theLine(p: Painter, lens: Lens, view: LoopView) {
  const line = lineOf(view.slots)
  const clips = stationsOf(view)
  const heat: Mark[] = []
  p.layer('line')
  for (let s = 0; s < line.count; s++) {
    const lit = clips.some((on, slot) => on && Math.floor((slot * line.count) / view.slots) === s)
    station(p, heat, lens, STATION_KINDS[s], line.x(s), line.width, lit)
  }
  p.layer('heat')
  for (const mark of heat) p.add(mark)
  // The line's name, on tape on the tile over its last station.
  p.layer('labels-line')
  tape(p, lens, line.x(line.count - 1), 1.24, WALL_Z + 0.01, 0.6, 0.07, 'THE LINE · GPU')
}

/** A ticket hung from its clip: paper with its punched hole, its number printed large, and two lines of dots under it. */
function ticketAt(p: Painter, lens: Lens, x: number, y: number, z: number, id: number, scale = 1) {
  const w = TICKET.width * scale
  const h = TICKET.height * scale
  p.poly(upright(lens, x - w / 2, x + w / 2, y - h, y, z), { fill: 'paper', stroke: 'paper-rule', width: 0.5 })
  const per = lens.per(x, y, z)
  const [hx, hy] = lens.at(x, y - 0.012 * scale, z)
  p.circle(hx, hy, Math.max(0.5, 0.005 * scale * per), { fill: 'surface-3' })
  const [nx, ny] = lens.at(x, y - h * 0.42, z)
  p.text(nx, ny, ticketNo(id), w * 0.5 * per, 'paper-ink', 'numeric')
  p.path(
    [0.68, 0.8].map((t): [Pt, Pt] => [lens.at(x - w * 0.34, y - h * t, z), lens.at(x + w * (t > 0.7 ? 0.1 : 0.34), y - h * t, z)]),
    { stroke: 'paper-rule', width: Math.max(0.6, 0.006 * scale * per), dash: '0.8 1.2' },
  )
}

/** A rail's channel at (y, z), `length` long, and what each clip holds: a ticket, or (on the rail) a stub printed "empty". */
function railAt(p: Painter, lens: Lens, y: number, z: number, length: number, clips: readonly ClipView[], slots: number, copies: boolean) {
  p.poly(upright(lens, -length / 2, length / 2, y - 0.035, y, z + 0.013), { fill: 'surface-3' })
  p.line(lens.at(-length / 2 + 0.01, y - 0.004, z + 0.014), lens.at(length / 2 - 0.01, y - 0.004, z + 0.014), { stroke: 'paper', width: 0.8, strokeOpacity: 0.6 })
  p.line(lens.at(-length / 2 + 0.01, y - 0.033, z + 0.014), lens.at(length / 2 - 0.01, y - 0.033, z + 0.014), { stroke: 'paper-ink', width: 0.6 })
  clips.forEach((clip, slot) => {
    const x = clipX(slot, slots)
    if (clip.req !== null) ticketAt(p, lens, x, y - GRIP, z + 0.012, clip.req, copies ? 0.85 : 1)
    else if (!copies) {
      // Paid for, and empty: a stub of paper on the clip, printed in the ribbon's red.
      const per = lens.per(x, y, z)
      p.poly(upright(lens, x - 0.045, x + 0.045, y - GRIP - 0.055, y - GRIP, z + 0.012), { fill: 'paper', stroke: 'paper-rule', width: 0.5, dash: '1.5 1.2' })
      const [ex, ey] = lens.at(x, y - GRIP - 0.0275, z + 0.012)
      p.text(ex, ey, 'empty', 0.022 * per, 'paper-ink-2', 'ticket')
    }
  })
}

/** The rail's clips, one mark each, in a layer of their own: the page finds where to hang a dragged ticket by them. */
function clipsAt(p: Painter, lens: Lens, y: number, z: number, slots: number) {
  p.layer('clips')
  for (let slot = 0; slot < slots; slot++) {
    const x = clipX(slot, slots)
    const [x0, y0] = lens.at(x - 0.015, y - 0.006, z + 0.016)
    const [x1, y1] = lens.at(x + 0.015, y - GRIP - 0.006, z + 0.016)
    p.rect(x0, y0, x1 - x0, y1 - y0, { fill: 'surface-2', stroke: 'surface-3', width: 0.6, rx: 0.6 })
  }
}

/** The gantry over the pass, its rail and clips, and the fired rail under it while a fire is on the line. */
function rails(p: Painter, lens: Lens, view: LoopView, width: number) {
  const slots = view.slots
  const length = railLength(slots)
  p.layer('gantry')
  const bar = PASS.top + PASS.gantry + 0.012
  const bz = -PASS.depth / 2 + 0.035
  for (const x of [-width / 2 + 0.035, width / 2 - 0.035]) p.line(lens.at(x, PASS.top, bz), lens.at(x, bar + 0.03, bz), { stroke: 'surface-2', width: Math.max(1, 0.03 * lens.per(x, 1.2, bz)) })
  p.line(lens.at(-width / 2 + 0.02, bar, bz), lens.at(width / 2 - 0.02, bar, bz), { stroke: 'surface-1', width: Math.max(1.2, 0.034 * lens.per(0, bar, bz)) })
  p.line(lens.at(-width / 2 + 0.02, bar + 0.012, bz), lens.at(width / 2 - 0.02, bar + 0.012, bz), { stroke: 'paper', width: 0.6, strokeOpacity: 0.7 })
  if (view.firedRail !== null) {
    p.layer('fired')
    for (const x of [-length / 2 + 0.03, length / 2 - 0.03]) p.line(lens.at(x, FIRED.y, FIRED.z), lens.at(x, bar, bz), { stroke: 'surface-2', width: 0.8 })
    railAt(p, lens, FIRED.y, FIRED.z, length, view.firedRail, slots, true)
    // Its name on tape stuck on the channel, between its first two clips, where every shot sees it.
    const pitch = slots > 1 ? clipX(1, slots) - clipX(0, slots) : 0.3
    tape(p, lens, clipX(0, slots) + pitch / 2, FIRED.y - 0.0175, FIRED.z + 0.016, Math.min(0.2, pitch - 0.06), 0.032, 'FIRED RAIL')
  }
  p.layer('rail')
  railAt(p, lens, RAIL.y, RAIL.z, length, view.rail, slots, false)
  clipsAt(p, lens, RAIL.y, RAIL.z, slots)
}

/** The three heat lamps on their cords: spun shades with a rolled lip, a little of their light under the mouth. */
function lamps(p: Painter, lens: Lens, slots: number, ceiling: number) {
  p.layer('lamps')
  const z = 0.04
  const glow: Mark[] = []
  for (const x of lampsOf(slots)) {
    const top = MOUTH + 0.2
    p.line(lens.at(x, ceiling, z), lens.at(x, top, z), { stroke: 'paper-ink', width: 0.7 })
    const per = lens.per(x, MOUTH + 0.1, z)
    const profile: [number, number][] = [
      [0.022, top],
      [0.034, top - 0.035],
      [0.055, top - 0.075],
      [0.083, top - 0.11],
      [0.112, MOUTH + 0.012],
      [0.118, MOUTH],
    ]
    const left = profile.map(([r, y]) => lens.at(x - r, y, z))
    const right = profile.map(([r, y]) => lens.at(x + r, y, z)).reverse()
    p.poly([...left, ...right], { fill: 'surface-1', stroke: 'surface-3', width: 0.5 })
    // The spun shade catches the tubes along one flank.
    p.line(lens.at(x - 0.012, top - 0.01, z + 0.02), lens.at(x - 0.07, MOUTH + 0.02, z + 0.08), { stroke: 'paper', width: Math.max(0.8, 0.012 * per), strokeOpacity: 0.85 })
    p.ellipse(lens.disc(x, MOUTH, z, 0.118), { fill: 'surface-2', stroke: 'surface-3', width: 0.6 })
    glow.push({ kind: 'ellipse', ...lens.disc(x, MOUTH - 0.03, z, 0.09), fill: 'lamp', opacity: 0.5, soft: true })
  }
  p.layer('bulbs')
  for (const mark of glow) p.add(mark)
}

/** A plate on the pass, as the last fire left it: a plate with its rim and its shadow, a binned plate, or an empty place. */
function plateAt(p: Painter, lens: Lens, x: number, state: 'plate' | 'empty' | 'binned') {
  const y = PASS.top
  if (state === 'plate') {
    const shadow = lens.disc(x, y, PLATE_Z + 0.012, PLATE_R * 1.1)
    p.ellipse(shadow, { fill: 'text-1', opacity: 0.24 })
    p.ellipse(lens.disc(x, y + 0.022, PLATE_Z, PLATE_R), { fill: 'paper', stroke: 'paper-rule', width: 0.7 })
    p.ellipse(lens.disc(x, y + 0.009, PLATE_Z, 0.09), { fill: 'paper', stroke: 'paper-rule', width: 0.55 })
  } else if (state === 'binned') {
    const plate = lens.disc(x, y + 0.012, PLATE_Z, PLATE_R)
    p.ellipse(plate, { fill: 'none', stroke: 'paper-ink-2', width: 1.2, dash: '3 2' })
    p.line([plate.cx - plate.rx * 0.7, plate.cy + plate.ry * 0.7], [plate.cx + plate.rx * 0.7, plate.cy - plate.ry * 0.7], { stroke: 'paper-ink-2', width: 1.2 })
  } else p.ellipse(lens.disc(x, y + 0.002, PLATE_Z, PLATE_R - 0.02), { fill: 'none', stroke: 'surface-3', width: 0.9, dash: '2 2.5' })
}

/** The pass: its top under the lamps' pools, the plates, its rolled front edge and apron, its legs, and the heated shelf under it. */
function thePass(p: Painter, lens: Lens, view: LoopView, width: number) {
  const top = PASS.top
  const d = PASS.depth
  const half = width / 2
  const shelf = top - SHELF.drop
  // Under the counter first: the heated shelf's tray and bars, the stacks of warm plates on them.
  p.layer('shelf')
  p.poly(level(lens, -half + 0.03, half - 0.03, shelf - 0.015, -d / 2 + 0.03, d / 2 - 0.03), { fill: 'surface-1' })
  const bars: [Pt, Pt][] = []
  const bars2: [Pt, Pt][] = []
  for (let i = 0; i < 11; i++) {
    const z = -d / 2 + 0.06 + ((d - 0.12) * i) / 10
    bars.push([lens.at(-half + 0.05, shelf - 0.004, z), lens.at(half - 0.05, shelf - 0.004, z)])
    bars2.push([lens.at(-half + 0.05, shelf, z - 0.004), lens.at(half - 0.05, shelf, z - 0.004)])
  }
  p.path(bars, { stroke: 'surface-3', width: 1.1, strokeOpacity: 0.7 })
  p.path(bars2, { stroke: 'paper', width: 0.6, strokeOpacity: 0.85 })
  for (const [x, count] of [
    [-half + 0.75, 6],
    [half - 0.75, 5],
  ] as const) {
    p.ellipse(lens.disc(x, shelf, 0.012, 0.15), { fill: 'text-1', opacity: 0.28 })
    const stackTop = shelf + count * 0.0105 + 0.016
    const base = lens.disc(x, shelf + 0.004, 0, PLATE_R)
    const crown = lens.disc(x, stackTop, 0, PLATE_R)
    p.poly([[base.cx - base.rx, base.cy], [crown.cx - crown.rx, crown.cy], [crown.cx + crown.rx, crown.cy], [base.cx + base.rx, base.cy]], { fill: 'paper' })
    const rims: [Pt, Pt][] = []
    for (let k = 1; k < count; k++) {
      const ring = lens.disc(x, shelf + k * 0.0105 + 0.012, 0, PLATE_R)
      rims.push([[ring.cx - ring.rx, ring.cy + ring.ry * 0.9], [ring.cx + ring.rx, ring.cy + ring.ry * 0.9]])
    }
    p.path(rims, { stroke: 'paper-rule', width: 0.5 })
    p.ellipse(crown, { fill: 'paper', stroke: 'paper-rule', width: 0.6 })
    p.ellipse(lens.disc(x, stackTop - 0.01, 0, 0.09), { fill: 'none', stroke: 'paper-rule', width: 0.5 })
  }
  p.line(lens.at(-half + 0.035, shelf - 0.01, d / 2 - 0.032), lens.at(half - 0.035, shelf - 0.01, d / 2 - 0.032), { stroke: 'surface-1', width: Math.max(1.4, 0.022 * lens.per(0, shelf, d / 2)) })
  p.line(lens.at(-half + 0.035, shelf - 0.003, d / 2 - 0.022), lens.at(half - 0.035, shelf - 0.003, d / 2 - 0.022), { stroke: 'paper', width: 0.6, strokeOpacity: 0.8 })
  // The front legs.
  for (const x of [-half + 0.04, half - 0.04]) p.line(lens.at(x, 0.02, d / 2 - 0.04), lens.at(x, top - 0.04, d / 2 - 0.04), { stroke: 'surface-2', width: Math.max(1.2, 0.038 * lens.per(x, 0.5, d / 2)) })
  // The counter: its brushed top lit along its back edge, its grain streaked along the pass, the lamps' light on it, and the plates.
  p.layer('pass')
  p.poly(level(lens, -half, half, top, -d / 2, d / 2), { fill: 'surface-1', stroke: 'surface-2', width: 0.5 })
  p.line(lens.at(-half + 0.02, top, -d / 2 + 0.01), lens.at(half - 0.02, top, -d / 2 + 0.01), { stroke: 'paper', width: 0.9, strokeOpacity: 0.9 })
  const grain: [Pt, Pt][] = []
  for (let i = 1; i < 12; i++) {
    const z = -d / 2 + (d * i) / 12
    const short = ((i * 7) % 5) * 0.09
    grain.push([lens.at(-half + 0.04 + short, top, z), lens.at(half - 0.04 - short * 0.7, top, z)])
  }
  p.path(grain, { stroke: 'paper', width: 0.5, strokeOpacity: 0.5 })
  // Under each lamp, its light on the brushed steel: hot in the middle and gone by the edge, longer across the brush (toward the expo)
  // than along it, as the steel scatters it. A gradient laid on as light, never a blur.
  p.layer('pools')
  for (const x of lampsOf(view.slots)) {
    const z = PLATE_Z + 0.02
    const [cx] = lens.at(x, top, z)
    const back = lens.at(x, top, z - 0.29)[1]
    const front = lens.at(x, top, z + 0.29)[1]
    p.ellipse({ cx, cy: num((back + front) / 2), rx: num(0.22 * lens.per(x, top, z)), ry: num((front - back) / 2) }, { fill: 'lamp-pool' })
  }
  p.layer('plates')
  const served = [...view.fires].reverse().find((fire) => !fire.onLine)
  served?.places.forEach((place, slot) => plateAt(p, lens, clipX(slot, view.slots), place.state))
  // The rolled front edge, the apron under it, and the expo's name on tape on the edge.
  p.layer('edge')
  p.poly(upright(lens, -half, half, top - 0.04, top, d / 2), { fill: 'surface-2' })
  p.line(lens.at(-half, top - 0.004, d / 2), lens.at(half, top - 0.004, d / 2), { stroke: 'paper', width: 1, strokeOpacity: 0.9 })
  p.poly(upright(lens, -half + 0.02, half - 0.02, top - 0.1, top - 0.04, d / 2 - 0.025), { fill: 'surface-1', stroke: 'surface-2', width: 0.5 })
  tape(p, lens, 0.15, top - 0.03, d / 2 + 0.006, 0.42, 0.05, 'THE EXPO · CPU')
}

/** The bell and the spike at the pass's right end. */
function bellAndSpike(p: Painter, lens: Lens, width: number) {
  p.layer('bell')
  const top = PASS.top
  const [bx, bz] = [width / 2 - 0.46, 0.21]
  p.ellipse(lens.disc(bx, top, bz + 0.01, 0.055), { fill: 'text-1', opacity: 0.25 })
  p.ellipse(lens.disc(bx, top + 0.012, bz, 0.045), { fill: 'surface-3' })
  const dome = lens.disc(bx, top + 0.026, bz, 0.042)
  const [, crown] = lens.at(bx, top + 0.063, bz)
  p.poly([[dome.cx - dome.rx, dome.cy], [dome.cx - dome.rx * 0.6, crown + (dome.cy - crown) * 0.35], [dome.cx, crown], [dome.cx + dome.rx * 0.6, crown + (dome.cy - crown) * 0.35], [dome.cx + dome.rx, dome.cy]], { fill: 'surface-1', stroke: 'surface-3', width: 0.5 })
  const [sx, sz] = [width / 2 - 0.22, 0.17]
  p.ellipse(lens.disc(sx, top + 0.01, sz, 0.042), { fill: 'surface-3' })
  p.line(lens.at(sx, top + 0.02, sz), lens.at(sx, top + 0.165, sz), { stroke: 'surface-2', width: 0.7 })
}

/** The printer at the pass's left end, and the tickets it has fed lying on the counter in front of it, the next first. */
function printerAt(p: Painter, lens: Lens, view: LoopView, width: number) {
  p.layer('printer')
  const top = PASS.top
  const [x, z] = [-width / 2 + 0.26, -0.12]
  const [w, h, d] = [0.16, 0.15, 0.22]
  p.ellipse(lens.disc(x, top, z + 0.01, 0.15), { fill: 'text-1', opacity: 0.22 })
  p.poly(level(lens, x - w / 2, x + w / 2, top + h, z - d / 2, z + d / 2), { fill: 'surface-3' })
  p.poly(upright(lens, x - w / 2, x + w / 2, top, top + h, z + d / 2), { fill: 'paper-ink', opacity: 0.85 })
  p.ellipse(lens.disc(x, top + h + 0.002, z - 0.01, 0.038), { fill: 'paper', stroke: 'paper-rule', width: 0.5 })
  p.line(lens.at(x - w / 2 + 0.01, top + h * 0.75, z + d / 2 + 0.002), lens.at(x + w / 2 - 0.01, top + h * 0.75, z + d / 2 + 0.002), { stroke: 'surface-1', width: 0.9 })
  const shown = view.waiting.slice(0, 5)
  shown.forEach((id, i) => {
    const tx = -width / 2 + 0.11 + i * 0.096
    p.poly(level(lens, tx - TICKET.width / 2, tx + TICKET.width / 2, top + 0.002, 0.04, 0.04 + TICKET.height), { fill: 'paper', stroke: 'paper-rule', width: 0.5 })
    const [nx, ny] = lens.at(tx, top + 0.003, 0.075)
    p.text(nx, ny, ticketNo(id), TICKET.width * 0.42 * lens.per(tx, top, 0.08), 'paper-ink', 'numeric')
  })
  if (view.waiting.length > shown.length) {
    const [mx, my] = lens.at(x, top + h + 0.06, z)
    p.text(mx, my, `+${view.waiting.length - shown.length}`, 0.05 * lens.per(x, top + h, z), 'text-1', 'numeric')
  }
}

/** The drawing of a night through a shot. */
function build(view: LoopView, shot: Shot, shotName: ShotName, orientation: Orientation): Layer[] {
  const size = FRAMES[orientation]
  const lens = lensOf(shot, size.width, size.height)
  const p = painter()
  const width = passWidth(view.slots)
  const line = lineOf(view.slots)
  room(p, lens, -width / 2 - 1.3, { orientation, ...size })
  hood(p, lens, (line.count * line.width + 0.4) / 2)
  theLine(p, lens, view)
  rails(p, lens, view, width)
  lamps(p, lens, view.slots, 3.2)
  thePass(p, lens, view, width)
  bellAndSpike(p, lens, width)
  if (shotName === 'loop') printerAt(p, lens, view, width)
  return p.layers.filter((layer) => layer.marks.length > 0)
}

/** The sentence that names the drawing: the state it shows, for assistive technology and for the poster's alt text. */
function describe(view: LoopView): string {
  const hung = view.rail.filter((clip) => clip.req !== null).length
  const waiting = view.waiting.length
  const lit = stationsOf(view).filter(Boolean).length
  return `${view.title}. The rail has ${view.slots} clips and ${hung} ${hung === 1 ? 'is' : 'are'} hung. ${waiting} ${waiting === 1 ? 'ticket waits' : 'tickets wait'}. ${view.step} ${view.step === 1 ? 'fire has' : 'fires have'} been rung, ${lit} of the line's stations burn, and the clock reads ${view.clockUs} ticks, synthetic.`
}

/** The frame of a view: its layers in drawing order. The same view and options always give the same frame. */
export function layoutFrame(view: LoopView, options: FrameOptions = {}): Frame {
  const orientation = options.orientation ?? 'landscape'
  const shotName = options.shot ?? 'loop'
  const shots = SHOTS[shotName]
  const size = FRAMES[orientation]
  // The frame is the shot's picture with its lens centred: a page that shifts the lens moves the frame instead (front.css).
  const chosen: Shot = orientation === 'portrait' ? shots.portrait : shots.base
  const shot: Shot = { position: chosen.position, target: chosen.target, k: chosen.k }
  return { orientation, width: size.width, height: size.height, label: describe(view), layers: build(view, shot, shotName, orientation) }
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
/**
 * The frame's two gradients, each made of token roles [estimated stops]: the lamps' light on the pass, white-hot at its middle and the
 * lamp's amber out to nothing at its edge, so the steel under it reads lit and no edge shows; and the side wall's shade, deepening from
 * its near end at the frame's left to the far corner.
 */
const GRADIENTS = {
  'lamp-pool': {
    tag: 'radialGradient',
    stops: [
      [0, 'glint', 0.5],
      [0.3, 'lamp', 0.46],
      [0.62, 'lamp', 0.2],
      [1, 'lamp', 0],
    ],
  },
  'wall-shade': {
    tag: 'linearGradient',
    stops: [
      [0, 'surface-2', 0.3],
      [1, 'surface-3', 0.42],
    ],
  },
} as const satisfies Readonly<Record<string, { readonly tag: string; readonly stops: readonly (readonly [number, Paint, number])[] }>>

/** The id of a frame's blur or gradient. Two frames can share a page (the static HTML holds both), so each orientation has its own. */
const idOf = (name: string, orientation: Orientation): string => `es-loop-${name}-${orientation}`
const paint = (role: Paint, orientation: Orientation): string => (role === 'none' ? 'none' : role in GRADIENTS ? `url(#${idOf(role, orientation)})` : `var(--es-${role})`)

/** The blur a soft mark takes, as a share of the frame's half height [estimated]: a station's heat and a lamp's mouth have no edge. */
const SOFT_BLUR = 0.045

function markNode(mark: Mark, orientation: Orientation): SvgNode {
  const style = (s: Style): Record<string, string | number> => ({
    ...(s.fill === undefined ? {} : { fill: paint(s.fill, orientation) }),
    ...(s.stroke === undefined ? {} : { stroke: paint(s.stroke, orientation) }),
    ...(s.width === undefined ? {} : { strokeWidth: num(s.width) }),
    ...(s.dash === undefined ? {} : { strokeDasharray: s.dash }),
    ...(s.opacity === undefined ? {} : { fillOpacity: s.opacity }),
    ...(s.strokeOpacity === undefined ? {} : { strokeOpacity: s.strokeOpacity }),
    ...(s.soft ? { filter: `url(#${idOf('soft', orientation)})` } : {}),
  })
  switch (mark.kind) {
    case 'rect':
      return { tag: 'rect', attrs: { x: mark.x, y: mark.y, width: mark.w, height: mark.h, ...(mark.rx === undefined ? {} : { rx: mark.rx }), ...style(mark) } }
    case 'line':
      return { tag: 'line', attrs: { x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2, ...style(mark) } }
    case 'circle':
      return { tag: 'circle', attrs: { cx: mark.cx, cy: mark.cy, r: mark.r, ...style(mark) } }
    case 'ellipse':
      return { tag: 'ellipse', attrs: { cx: mark.cx, cy: mark.cy, rx: mark.rx, ry: mark.ry, ...style(mark) } }
    case 'poly':
      return { tag: 'polygon', attrs: { points: mark.points.map(([x, y]) => `${x},${y}`).join(' '), ...style(mark) } }
    case 'path':
      return { tag: 'path', attrs: { d: mark.d, ...style(mark) } }
    case 'text':
      return {
        tag: 'text',
        attrs: { x: mark.x, y: mark.y, fill: paint(mark.fill, orientation), fontFamily: FACE[mark.face], fontSize: mark.size, textAnchor: mark.anchor, dominantBaseline: 'central' },
        children: [mark.text],
      }
  }
}

/**
 * The SVG of a frame. The root is an image with the frame's label, and its box is the frame's own, so the browser reserves the
 * space before any style loads (CLS). A consumer sizes it with CSS, and may let the room drawn past the viewBox show (`overflow`).
 * `cover` fills whatever box holds it, at the frame's full height, cutting its sides (or its top and foot) to the box.
 */
export function frameSvg(frame: Frame, options: { readonly cover?: boolean } = {}): SvgNode {
  const { orientation } = frame
  // What the marks ask of the defs: the blur, and each gradient they paint with.
  const used = new Set<string>(frame.layers.flatMap((layer) => layer.marks.flatMap((mark) => (mark.kind === 'text' ? [] : [mark.fill, mark.stroke, mark.soft ? 'soft' : undefined])).filter((name) => name !== undefined)))
  const defs: SvgNode[] = []
  if (used.has('soft')) {
    defs.push({
      tag: 'filter',
      attrs: { id: idOf('soft', orientation), x: '-50%', y: '-80%', width: '200%', height: '260%' },
      children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: num((frame.height / 2) * SOFT_BLUR) } }],
    })
  }
  for (const [name, gradient] of Object.entries(GRADIENTS)) {
    if (!used.has(name)) continue
    defs.push({ tag: gradient.tag, attrs: { id: idOf(name, orientation) }, children: gradient.stops.map(([offset, role, opacity]) => ({ tag: 'stop', attrs: { offset, stopColor: `var(--es-${role})`, stopOpacity: opacity } })) })
  }
  const layers = frame.layers.map((layer): SvgNode => ({ tag: 'g', attrs: { 'data-part': layer.part }, children: layer.marks.map((mark) => markNode(mark, orientation)) }))
  return {
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${frame.width} ${frame.height}`,
      width: frame.width,
      height: frame.height,
      ...(options.cover ? { preserveAspectRatio: 'xMidYMid slice' } : {}),
      role: 'img',
      'aria-label': frame.label,
    },
    children: defs.length > 0 ? [{ tag: 'defs', attrs: {}, children: defs }, ...layers] : layers,
  }
}

/** Marks in a frame. */
export const markCount = (frame: Frame): number => countMarks(frameSvg(frame))
