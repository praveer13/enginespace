/**
 * Back of House's layout (A§6.3, GAMES.md §5 "2D path", §2.6 "Back of House"): the house in section, turned into positioned marks. The
 * 2D view draws them as SVG (`frameSvg`), and W1-T18's 3D scene reads the same input for its own primitives.
 *
 * A mark is a rect, a line, a circle, a polygon, a hand-off glyph or a piece of text, painted with a token role of src/design/tokens.ts
 * and never a colour (rule 9, D-047). A role becomes `var(--es-<role>)` in the SVG, so the drawing changes with the design system and
 * carries no literal colour or face.
 *
 * What it draws, in the objects of GAMES.md §2.6 "Back of House":
 *   - a process is a floor and a thread on it is a lane; the line (the GPU) sits below the floors with a lane for each stream. A lane's
 *     mark says its kind and nothing else: a circle for a CPU thread, a square for a GPU stream;
 *   - the ticket stands on the lane where the last hand-off that held left it;
 *   - the route has one stop for each stage laid: a run between lanes, an arrowhead where it lands, a tile carrying the hand-off's drawn
 *     mark (a spike, a ticket window, a shelf, the dumbwaiter, a call, a gate, two halves) and a numbered chit. A stop the ticket got
 *     through is solid, a stop laid and not yet run is dashed, and the first stop that did not hold is struck in the second ink
 *     (`paper-ink-2`);
 *   - the lamp, the design system's one accent, lights the present and nothing else.
 * The order of the stages runs along the lanes: left to right in landscape, and top to bottom in portrait, where a phone's height shows
 * the route (GAMES.md §2.3, "Portrait framing"). The ticket stands in a column of its own after the stops it got through, so the stage
 * that stopped it stands ahead of it, and the stages laid after that are pencilled beyond.
 *
 * The house is built when the prediction is written down. Until then only the floor the request begins on is drawn, because the
 * prediction asks how many floors a sampled token crosses and the drawing must not answer it. Once it is built, nothing in the
 * drawing moves when a stage is added: the house plan has a lane for every place of the engine's path, and the columns are sized for
 * the engine's whole path, so the map builds as the request moves and the page below it holds still.
 *
 * The graded level never builds the house ahead of the route (its view is `sealed`, because the plan of the whole path would sort the
 * tray): it draws the floors the route has reached, and the drawing grows with the route until the run is judged.
 *
 * Every number the drawing writes is a stage's number. The counts are DOM, in the mirror and the controls.
 */
import type { Mechanism, Place, Scenario } from '@es/sim/lifecycle'
import { entryOf } from '@es/sim/lifecycle'
import { countMarks, num } from '../loop/svg'
import type { SvgNode } from '../loop/svg'
import { referenceOf } from './stages'
import type { FloorView } from './types'
import { FLOOR_NAMES, GLYPHS, floorKindOf, placeKey, placeName } from './words'
import type { FloorKind } from './words'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Marks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The token roles the drawing paints with (src/design/tokens.ts). `none` is no paint. */
export type Paint =
  | 'none'
  | 'surface-1'
  | 'surface-2'
  | 'surface-3'
  | 'paper'
  | 'paper-ink'
  | 'paper-ink-2'
  | 'paper-rule'
  | 'lamp'
  | 'text-2'
  | 'lane-cpu'
  | 'lane-gpu'
  | 'cat-blue-edge'
  | 'cat-green-edge'
  | 'tape'
  | 'tape-ink'

/** The roles above, as a list, for the test that checks them against the design system. */
export const PAINTS: readonly Paint[] = [
  'surface-1',
  'surface-2',
  'surface-3',
  'paper',
  'paper-ink',
  'paper-ink-2',
  'paper-rule',
  'lamp',
  'text-2',
  'lane-cpu',
  'lane-gpu',
  'cat-blue-edge',
  'cat-green-edge',
  'tape',
  'tape-ink',
]

/** The faces the drawing sets text in: the printer's dots for the stage numbers, marker on masking tape for names. */
export type Face = 'numeric' | 'label'

interface Style {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
  readonly opacity?: number
  readonly strokeOpacity?: number
}

/** What every mark may carry: the place in the path of the stage it belongs to, which `frameSvg` groups the stage's marks by. */
interface Belongs {
  readonly stage?: number
}

export type Mark = Belongs &
  (
    | ({ readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number; readonly soft?: boolean } & Style)
    | ({ readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } & Style)
    | ({ readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number } & Style)
    | ({ readonly kind: 'polygon'; readonly points: readonly (readonly [number, number])[] } & Style)
    /** A hand-off's drawn mark, centred on (x, y) in a square of `size`. */
    | { readonly kind: 'glyph'; readonly mechanism: Mechanism; readonly x: number; readonly y: number; readonly size: number; readonly stroke: Paint }
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
        /** A quarter turn anticlockwise about (x, y): the text reads upward. */
        readonly up?: boolean
        /** Fit the text to this length: marker is a wide face and a name must stay on its tape. */
        readonly fit?: number
      }
  )

/** Marks that belong together, drawn as one group: `part` names the object (`floors`, `lamp`, `lanes`, `route`, `stops`, `ticket`). */
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

/** The most marks the 2D view draws (A§6.4). */
export const MARK_CAP = 2000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Input                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A stage of the path as the map draws it. */
export interface MapStage {
  readonly mechanism: Mechanism
  readonly from: Place
  readonly to: Place
  /** `ran`: the ticket got through. `pending`: laid, not run. `struck`: the first that did not hold. */
  readonly state: 'ran' | 'pending' | 'struck'
}

export interface MapInput {
  readonly entry: Place
  readonly stages: readonly MapStage[]
  /** How many stages the ticket got through: it stands after them. */
  readonly reached: number
  /** Where the ticket stands. */
  readonly capsule: Place
  /**
   * Where the lamp falls: a place, and the column of the stops it falls at (`stages.length` for the end of the laid path, `reached` for
   * the ticket). Null when the night is over.
   */
  readonly lamp: { readonly place: Place; readonly column: number } | null
  /** The places of the engine's whole path, in the order it visits them: the house plan, which keeps every lane where it is. */
  readonly plan: readonly Place[]
  /** Whether the house is built: its floors and lanes are all drawn, and the columns are those of the whole path. Before, only the floors the route has reached. */
  readonly revealed: boolean
  /** How many stages the engine's path has, which sizes the columns. */
  readonly stagesInPath: number
  /** The drawing's name, which says what it shows. */
  readonly label: string
}

/** The places a path visits, in order, each stage's `from` before its `to`. */
const placesOf = (stages: readonly { readonly from: Place; readonly to: Place }[]): Place[] => stages.flatMap((stage) => [stage.from, stage.to])

/** The map of a view: the stages laid so far, where the ticket stands, and the lamp at the present. */
export function mapOfView(view: FloorView): MapInput {
  const laid = view.laid.length
  return {
    entry: view.entry,
    stages: view.laid.map((stage) => ({ mechanism: stage.mechanism, from: stage.from, to: stage.to, state: stage.state })),
    reached: view.reached,
    capsule: view.capsule,
    // The lamp falls where the next hand-off starts: at the end of the laid path, or at the ticket when a stage stopped it.
    lamp: view.done ? null : { place: view.present, column: view.stop === null ? laid : view.reached },
    // A sealed path (the graded level, until its run is judged) gives the house no plan and the columns no length: the drawing grows with the
    // route, because the floors and lanes of the whole path would sort the tray before a single stage is laid.
    plan: view.sealed ? [] : placesOf(referenceOf(view.scenario)),
    revealed: view.prediction !== null && !view.sealed,
    stagesInPath: view.sealed ? laid : view.stages,
    label: `${view.title}. ${laid === 0 ? 'No stage is laid.' : `${laid} ${laid === 1 ? 'stage is' : 'stages are'} laid, and ${view.reached} held in the last run.`} The ticket stands at ${placeName(view.capsule)}.`,
  }
}

/** The map of an engine's whole path, every stop inked and the ticket home: a house as the debrief lays it beside another. */
export function mapOfScenario(sc: Scenario, label: string): MapInput {
  const path = referenceOf(sc)
  const entry = entryOf(sc.engine)
  return {
    entry,
    stages: path.map((stage) => ({ mechanism: stage.mechanism, from: stage.from, to: stage.to, state: 'ran' })),
    reached: path.length,
    capsule: path.length === 0 ? entry : path[path.length - 1].to,
    lamp: null,
    plan: placesOf(path),
    revealed: true,
    stagesInPath: path.length,
    label,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The house plan                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Lane {
  readonly key: string
  readonly place: Place
  /** The name on the lane's tape: the thread, or for a GPU the stream of its process. */
  readonly name: string
}

export interface Floor {
  readonly kind: FloorKind
  /** The process, or null for the line, which holds the streams of every process. */
  readonly process: string | null
  /** The floor's tape: the kitchen's name, and the engine's beside it. */
  readonly title: string
  readonly lanes: readonly Lane[]
}

/** The lane's name for the tape. A GPU's stream is named for the process that owns it, because the floor is the line and not the process. */
const laneName = (p: Place): string => (p.device === 'gpu' ? `${p.process} stream${p.rank > 0 ? ` ${p.rank}` : ''}` : p.thread)

/**
 * The floors and lanes of a house. Floors are the processes in the order `places` first visits them, with the line last, and the lanes of
 * a floor are its threads in the order `places` first visits them. A place that the plan does not have (a stage of another engine, laid by
 * mistake) comes after the plan's, so that nothing the plan placed ever moves.
 */
export function housePlan(places: readonly Place[]): Floor[] {
  const seen = new Set<string>()
  const processes: string[] = []
  const byProcess = new Map<string, Place[]>()
  const line: Place[] = []
  for (const place of places) {
    const key = placeKey(place)
    if (seen.has(key)) continue
    seen.add(key)
    if (place.device === 'gpu') {
      line.push(place)
      continue
    }
    if (!byProcess.has(place.process)) {
      processes.push(place.process)
      byProcess.set(place.process, [])
    }
    byProcess.get(place.process)?.push(place)
  }
  const floorOf = (kind: FloorKind, process: string | null, here: readonly Place[]): Floor => ({
    kind,
    process,
    title: process === null ? FLOOR_NAMES[kind] : `${FLOOR_NAMES[kind]} · ${process}`,
    lanes: here.map((place): Lane => ({ key: placeKey(place), place, name: laneName(place) })),
  })
  const floors = processes.map((process) => {
    const here = byProcess.get(process) ?? []
    return floorOf(floorKindOf(here[0]), process, here)
  })
  return line.length === 0 ? floors : [...floors, floorOf('line', null, line)]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Geometry                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The size of a stop in the frame's units: the tile that carries the hand-off's mark, the mark in it, and the chit that carries the number. */
const TILE = 16
const GLYPH = 12
const CHIT = { w: 17, h: 12.5 }
const NUMBER_SIZE = 10
/** The ticket: a sheet with a punched hole and three printed lines. */
const SHEET = { w: 14, h: 19 }
/** How far a stop's tile and chit stand from the lane's line, along the way across the lanes. */
const IN_PLACE_LIFT = -5
const CHIT_OFFSET = { landscape: 10, portrait: 12 }

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** Landscape: the lanes run from `start` to `end` along the frame, and a stop takes `min` to `max` units of it. */
const LANDSCAPE = { width: 720, start: 176, end: 712, stop: { min: 18, max: 32 }, minHeight: 176, row: { min: 25, max: 46 }, label: { floor: 9.5, lane: 10 } }
const FLOOR = { head: 17, foot: 4, gap: 8, top: 8, bottom: 8 }

/** Portrait: the names run upward in a header across the top, then the lanes run down the page, a stop to a row. */
const PORTRAIT = { width: 360, lead: 14, stop: 21, lane: { min: 28, max: 44 }, margin: 8, gap: 4, header: { min: 56, max: 168 } }

/** How wide marker sets a word on tape, in the frame's units [estimated]: Permanent Marker is a wide face, so the tape is sized for it and the text fitted to the tape. */
const markerWidth = (text: string, size: number): number => text.length * size * 0.56

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drawing                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A lane placed across the lanes (y in landscape, x in portrait). */
interface Placed {
  readonly lane: Lane
  /** The lane's centre across the lanes. */
  readonly across: number
  /** The first lane of its floor: it carries the floor's tape beside its own in portrait. */
  readonly first: boolean
}

interface Across {
  readonly floors: readonly { readonly floor: Floor; readonly from: number; readonly size: number }[]
  readonly lanes: ReadonlyMap<string, Placed>
  /** The extent across the lanes: the frame's height in landscape and its width in portrait. */
  readonly extent: number
  /** How wide one lane's band is: portrait's tapes are sized to it. */
  readonly band: number
}

/** The positions of every floor and lane across the lanes. `top` is where portrait's lanes begin down the page. */
function planAcross(floors: readonly Floor[], orientation: Orientation): Across {
  const lanes = floors.reduce((sum, floor) => sum + floor.lanes.length, 0)
  const placed = new Map<string, Placed>()
  const out: { floor: Floor; from: number; size: number }[] = []
  if (orientation === 'landscape') {
    const fixed = FLOOR.top + FLOOR.bottom + floors.length * (FLOOR.head + FLOOR.foot) + Math.max(floors.length - 1, 0) * FLOOR.gap
    const row = clamp((LANDSCAPE.minHeight - fixed) / Math.max(lanes, 1), LANDSCAPE.row.min, LANDSCAPE.row.max)
    let top: number = FLOOR.top
    for (const floor of floors) {
      const size = FLOOR.head + floor.lanes.length * row + FLOOR.foot
      out.push({ floor, from: top, size })
      floor.lanes.forEach((lane, i) => placed.set(lane.key, { lane, across: num(top + FLOOR.head + i * row + row / 2), first: i === 0 }))
      top += size + FLOOR.gap
    }
    return { floors: out, lanes: placed, extent: num(top - FLOOR.gap + FLOOR.bottom), band: row }
  }
  const room = PORTRAIT.width - 2 * PORTRAIT.margin - Math.max(floors.length - 1, 0) * PORTRAIT.gap
  const band = clamp(room / Math.max(lanes, 1), PORTRAIT.lane.min, PORTRAIT.lane.max)
  let left: number = PORTRAIT.margin
  for (const floor of floors) {
    const size = floor.lanes.length * band
    out.push({ floor, from: left, size })
    floor.lanes.forEach((lane, i) => placed.set(lane.key, { lane, across: num(left + i * band + band / 2), first: i === 0 }))
    left += size + PORTRAIT.gap
  }
  return { floors: out, lanes: placed, extent: num(left - PORTRAIT.gap + PORTRAIT.margin), band }
}

/** The marks of one frame under construction, with the helper that turns (along, across) into (x, y) by the orientation. */
function painter(orientation: Orientation) {
  const landscape = orientation === 'landscape'
  const layers: { part: string; marks: Mark[] }[] = []
  let marks: Mark[] = []
  let stage: number | undefined
  const layer = (part: string) => {
    marks = []
    layers.push({ part, marks })
  }
  /** The marks added while `index` is set belong to that stage. */
  const belong = (index: number | undefined) => {
    stage = index
  }
  const add = (mark: Mark) => {
    marks.push(stage === undefined ? mark : { ...mark, stage })
  }
  /** A point from its place along the lanes and its place across them. */
  const at = (along: number, across: number): { x: number; y: number } => (landscape ? { x: along, y: across } : { x: across, y: along })
  const rect = (x: number, y: number, w: number, h: number, style: Style & { rx?: number; soft?: boolean } = {}) => add({ kind: 'rect', x: num(x), y: num(y), w: num(w), h: num(h), ...style })
  const line = (x1: number, y1: number, x2: number, y2: number, style: Style) => add({ kind: 'line', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), ...style })
  const circle = (cx: number, cy: number, r: number, style: Style) => add({ kind: 'circle', cx: num(cx), cy: num(cy), r, ...style })
  const polygon = (points: readonly (readonly [number, number])[], style: Style) => add({ kind: 'polygon', points: points.map(([x, y]) => [num(x), num(y)] as const), ...style })
  const glyph = (mechanism: Mechanism, x: number, y: number, size: number, stroke: Paint) => add({ kind: 'glyph', mechanism, x: num(x), y: num(y), size, stroke })
  const text = (x: number, y: number, label: string, o: { size: number; anchor?: 'start' | 'middle' | 'end'; fill: Paint; face: Face; middle?: boolean; up?: boolean; fit?: number }) =>
    add({
      kind: 'text',
      x: num(x),
      y: num(y),
      text: label,
      size: o.size,
      anchor: o.anchor ?? 'middle',
      fill: o.fill,
      face: o.face,
      ...(o.middle ? { middle: true } : {}),
      ...(o.up ? { up: true } : {}),
      ...(o.fit === undefined ? {} : { fit: num(o.fit) }),
    })
  return { layers, layer, belong, rect, line, circle, polygon, glyph, text, at, landscape }
}

type Painter = ReturnType<typeof painter>

/** A strip of masking tape lying along the frame, its words in marker. `x` is its left edge, or its right edge when it is anchored there. Returns its left edge and its length. */
function tapeFlat(p: Painter, x: number, y: number, words: string, size: number, longest: number, anchor: 'start' | 'end'): { left: number; length: number } {
  const length = Math.min(markerWidth(words, size) + 8, longest)
  const h = size + 4
  const left = anchor === 'start' ? x : x - length
  p.rect(left, y, length, h, { fill: 'tape' })
  p.text(left + length / 2, y + h / 2 + 0.5, words, { size, fill: 'tape-ink', face: 'label', middle: true, fit: length - 6 })
  return { left, length }
}

/** The same strip standing upright with its words reading upward, its foot at `bottom`: a name in the header of portrait. */
function tapeUpright(p: Painter, x: number, bottom: number, words: string, size: number, longest: number) {
  const length = Math.min(markerWidth(words, size) + 8, longest)
  const w = size + 4
  p.rect(x, bottom - length, w, length, { fill: 'tape' })
  p.text(x + w / 2 + 0.5, bottom - length / 2, words, { size, fill: 'tape-ink', face: 'label', middle: true, up: true, fit: length - 6 })
}

/** A lane's kind beside its name: a blue circle for hands on a CPU thread, a green square for a stream of the GPU. It is always beside the name in words. */
function laneMark(p: Painter, x: number, y: number, gpu: boolean) {
  if (gpu) p.rect(x - 3.5, y - 3.5, 7, 7, { fill: 'lane-gpu', stroke: 'cat-green-edge', width: 1, rx: 1 })
  else p.circle(x, y, 3.8, { fill: 'lane-cpu', stroke: 'cat-blue-edge', width: 1 })
}

/** The head of a run, its tip at (x, y), pointing the way the ticket goes. */
function arrowHead(p: Painter, x: number, y: number, dir: 'down' | 'up' | 'left' | 'right', fill: Paint) {
  const b = 5.5
  const w = 3.4
  const points: Record<typeof dir, readonly (readonly [number, number])[]> = {
    down: [[x, y], [x - w, y - b], [x + w, y - b]],
    up: [[x, y], [x - w, y + b], [x + w, y + b]],
    right: [[x, y], [x - b, y - w], [x - b, y + w]],
    left: [[x, y], [x + b, y - w], [x + b, y + w]],
  }
  p.polygon(points[dir], { fill })
}

/** How a stop is drawn by its state: ink for one the ticket got through, pencil for one not yet run, and the ribbon's red for the one that failed. */
const LOOK: Record<MapStage['state'], { ink: Paint; dash: string | undefined; width: number }> = {
  ran: { ink: 'paper-ink', dash: undefined, width: 1.7 },
  pending: { ink: 'text-2', dash: '3 2.5', width: 1.3 },
  struck: { ink: 'paper-ink-2', dash: undefined, width: 1.9 },
}

/** The size marker is set in on a lane's tape and on a floor's: landscape's are fixed, and portrait's follow the width of a lane. */
const labelSizes = (orientation: Orientation, band: number): { floor: number; lane: number } =>
  orientation === 'landscape' ? LANDSCAPE.label : band >= 40 ? { floor: 10, lane: 10 } : band >= 34 ? { floor: 9.5, lane: 9.5 } : { floor: 9, lane: 9 }

/** The marks of a map (see the top of this file). */
function build(input: MapInput, orientation: Orientation): { layers: Layer[]; width: number; height: number } {
  const p = painter(orientation)
  const landscape = orientation === 'landscape'
  const visited = [input.entry, input.capsule, ...placesOf(input.stages), ...(input.lamp === null ? [] : [input.lamp.place])]
  const floors = housePlan(input.revealed ? [...input.plan, ...visited] : visited)
  const across = planAcross(floors, orientation)
  const sizes = labelSizes(orientation, across.band)
  const columns = (input.revealed ? Math.max(input.stagesInPath, input.stages.length) : input.stages.length) + 1

  // Along the lanes: where each column is. Portrait's header holds the names, as long as the longest of them needs.
  const longest = Math.max(
    ...floors.flatMap((floor) => [markerWidth(floor.title.toUpperCase(), sizes.floor) + 8, ...floor.lanes.map((lane) => markerWidth(lane.name, sizes.lane) + 8)]),
  )
  const header = clamp(num(longest + 16), PORTRAIT.header.min, PORTRAIT.header.max)
  const origin = landscape ? LANDSCAPE.start : header + PORTRAIT.lead
  const step = landscape ? clamp((LANDSCAPE.end - LANDSCAPE.start) / columns, LANDSCAPE.stop.min, LANDSCAPE.stop.max) : PORTRAIT.stop
  const alongOf = (column: number): number => origin + step * (column + 0.5)
  const width = landscape ? Math.max(LANDSCAPE.width, num(origin + step * columns + 8)) : Math.max(PORTRAIT.width, across.extent)
  const height = landscape ? across.extent : num(origin + step * columns + 10)

  const laneOf = (place: Place): Placed => {
    const found = across.lanes.get(placeKey(place))
    if (found === undefined) throw new Error(`internal: the house plan has no lane for ${placeName(place)}`)
    return found
  }
  /** The column a stage stands in: the ticket takes the column after the stops it got through. */
  const columnOf = (index: number): number => (index < input.reached ? index : index + 1)
  const tapeHeight = sizes.lane + 4

  /* Floors: a shelf for each floor, with its tape. */
  p.layer('floors')
  for (const { floor, from, size } of across.floors) {
    const line = floor.kind === 'line'
    const fill = { fill: line ? 'surface-3' : 'surface-1', opacity: line ? 0.34 : 0.7, rx: 2 } as const
    if (landscape) {
      p.rect(6, from, width - 12, size, fill)
      p.rect(6, from + size - 3, width - 12, 3, { fill: 'surface-2', opacity: 0.95 })
      p.line(6, from + 0.5, width - 6, from + 0.5, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
      p.line(6, from + size - 0.5, width - 6, from + size - 0.5, { stroke: 'surface-3', width: 1 })
      tapeFlat(p, 10, from + (FLOOR.head - sizes.floor - 4) / 2 + 1, floor.title.toUpperCase(), sizes.floor, LANDSCAPE.start - 20, 'start')
    } else {
      p.rect(from - 1, header - 4, size + 2, height - header - 4, fill)
      p.line(from - 0.5, header - 4, from - 0.5, height - 8, { stroke: 'paper', width: 1, strokeOpacity: 0.85 })
      p.line(from + size + 0.5, header - 4, from + size + 0.5, height - 8, { stroke: 'surface-3', width: 1 })
    }
  }

  /* The lamp: light with no edge, at the present, behind the route. */
  p.layer('lamp')
  if (input.lamp !== null) {
    const centre = p.at(alongOf(input.lamp.column), laneOf(input.lamp.place).across)
    const long = 72
    const short = 52
    p.rect(centre.x - (landscape ? long : short) / 2, centre.y - (landscape ? short : long) / 2, landscape ? long : short, landscape ? short : long, { fill: 'lamp', opacity: 0.8, rx: 22, soft: true })
  }

  /* Lanes: a rail for each lane, with its name on tape and its kind beside it. */
  p.layer('lanes')
  for (const { floor } of across.floors) {
    for (const lane of floor.lanes) {
      const placed = laneOf(lane.place)
      const gpu = lane.place.device === 'gpu'
      const rail = { stroke: gpu ? 'paper' : 'paper-rule', width: 1, dash: '1 3', strokeOpacity: gpu ? 0.7 : 1 } as const
      if (landscape) {
        p.line(LANDSCAPE.start - 6, placed.across, width - 8, placed.across, rail)
        const tape = tapeFlat(p, LANDSCAPE.start - 8, placed.across - tapeHeight / 2, lane.name, sizes.lane, LANDSCAPE.start - 42, 'end')
        laneMark(p, tape.left - 9, placed.across, gpu)
      } else {
        p.line(placed.across, header + 2, placed.across, height - 8, rail)
        laneMark(p, placed.across, header + 9, gpu)
        // The first lane of a floor carries the floor's tape beside its own, one each side of the rail.
        const w = tapeHeight
        if (placed.first) {
          tapeUpright(p, placed.across - w - 1, header - 6, floor.title.toUpperCase(), sizes.floor, header - 12)
          tapeUpright(p, placed.across + 1, header - 6, lane.name, sizes.lane, header - 12)
        } else {
          tapeUpright(p, placed.across - w / 2, header - 6, lane.name, sizes.lane, header - 12)
        }
      }
    }
  }

  /* The route: the ticket's way through the house, stop by stop. */
  p.layer('route')
  const stops: (() => void)[] = []
  const ticketAlong = alongOf(input.reached)
  let cursor = { along: origin + step * 0.15, lane: laneOf(input.entry) }
  /** A run along the lane the ticket rests on, to a place along the lanes. */
  const rest = (to: number, style: Style) => {
    const a = p.at(cursor.along, cursor.lane.across)
    const b = p.at(to, cursor.lane.across)
    p.line(a.x, a.y, b.x, b.y, style)
    cursor = { ...cursor, along: to }
  }
  const ink: Style = { stroke: 'paper-ink', width: 1.7 }
  input.stages.forEach((stage, index) => {
    // The inked route runs on to the ticket's column, and the pencilled stops begin beyond it.
    p.belong(undefined)
    if (index === input.reached) rest(ticketAlong, ink)
    p.belong(index)
    const x = alongOf(columnOf(index))
    const from = laneOf(stage.from)
    const to = laneOf(stage.to)
    const look = LOOK[stage.state]
    const stroke: Style = { stroke: look.ink, width: look.width, ...(look.dash === undefined ? {} : { dash: look.dash }) }
    const joined = cursor.lane.lane.key === from.lane.key
    rest(x, joined ? stroke : { stroke: 'text-2', width: 1, dash: '1.5 2.5' })
    // A stage that starts somewhere other than where the ticket stands is joined to it by a thin dashed run: the gap is the mistake.
    if (!joined) {
      const a = p.at(x, cursor.lane.across)
      const b = p.at(x, from.across)
      p.line(a.x, a.y, b.x, b.y, { stroke: 'text-2', width: 1, dash: '1.5 2.5' })
    }
    const crossing = from.lane.key !== to.lane.key
    const sign = to.across >= from.across ? 1 : -1
    if (crossing) {
      const a = p.at(x, from.across)
      const b = p.at(x, to.across)
      p.line(a.x, a.y, b.x, b.y, stroke)
      arrowHead(p, b.x, b.y, landscape ? (sign > 0 ? 'down' : 'up') : sign > 0 ? 'right' : 'left', look.ink)
    }
    // The stop: the hand-off's tile near where it leaves, and the stage's chit beyond where it lands.
    const lift = crossing ? sign * Math.min(TILE / 2 + 2, Math.abs(to.across - from.across) / 2) : IN_PLACE_LIFT
    const tile = p.at(x, from.across + lift)
    const chit = p.at(x, to.across + (crossing ? sign : 1) * CHIT_OFFSET[orientation])
    stops.push(() => {
      p.belong(index)
      p.rect(tile.x - TILE / 2, tile.y - TILE / 2, TILE, TILE, { fill: 'paper', stroke: look.ink, width: 1.2, rx: 2, ...(look.dash === undefined ? {} : { dash: '2.6 2' }) })
      p.glyph(stage.mechanism, tile.x, tile.y, GLYPH, look.ink)
      if (stage.state === 'struck') {
        const r = TILE / 2 + 1.5
        p.line(tile.x - r, tile.y - r, tile.x + r, tile.y + r, { stroke: 'paper-ink-2', width: 1.8 })
        p.line(tile.x + r, tile.y - r, tile.x - r, tile.y + r, { stroke: 'paper-ink-2', width: 1.8 })
      }
      p.rect(chit.x - CHIT.w / 2, chit.y - CHIT.h / 2, CHIT.w, CHIT.h, {
        fill: 'paper',
        stroke: stage.state === 'struck' ? 'paper-ink-2' : 'paper-rule',
        width: stage.state === 'struck' ? 1.2 : 0.9,
        ...(stage.state === 'pending' ? { dash: '2 1.5' } : {}),
      })
      p.text(chit.x, chit.y + 0.5, String(index + 1), { size: NUMBER_SIZE, fill: look.ink, face: 'numeric', middle: true })
    })
    cursor = { along: x, lane: to }
  })
  p.belong(undefined)
  // With every stage held, the inked route ends at the ticket.
  if (input.reached >= input.stages.length) rest(ticketAlong, ink)

  p.layer('stops')
  for (const draw of stops) draw()
  p.belong(undefined)

  /* The ticket: a sheet of bond paper with its punched hole, standing where the last stop that held left it. */
  p.layer('ticket')
  const stand = p.at(ticketAlong, laneOf(input.capsule).across)
  const sheet = landscape ? { x: stand.x - SHEET.w / 2, y: stand.y - SHEET.h + 4 } : { x: stand.x - SHEET.w / 2, y: stand.y - SHEET.h / 2 }
  p.rect(sheet.x, sheet.y, SHEET.w, SHEET.h, { fill: 'paper', stroke: 'paper-ink', width: 1.2 })
  p.circle(sheet.x + SHEET.w / 2, sheet.y + 4, 1.9, { fill: 'surface-3' })
  for (const [i, inset] of [3, 3, 6].entries()) p.line(sheet.x + 3, sheet.y + 9 + i * 3.4, sheet.x + SHEET.w - inset, sheet.y + 9 + i * 3.4, { stroke: 'paper-ink', width: 1 })

  return { layers: p.layers, width: num(width), height: num(height) }
}

/** The frame of a map: its layers in drawing order. The same input and options always give the same frame. */
export function layoutMap(input: MapInput, options: { readonly orientation?: Orientation } = {}): Frame {
  const orientation = options.orientation ?? 'landscape'
  const { layers, width, height } = build(input, orientation)
  return { orientation, width, height, label: input.label, layers }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Frame to SVG                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const FACE: Readonly<Record<Face, string>> = { numeric: 'var(--es-font-numeric)', label: 'var(--es-font-label)' }
const paint = (role: Paint): string => (role === 'none' ? 'none' : `var(--es-${role})`)

/** The weight of a hand-off's mark in its own 24-unit grid; scaled onto a tile it is a hairline of about a unit. */
const GLYPH_STROKE = 2.6
/** The blur a soft mark takes, in the frame's units [estimated]: the heat lamp's pool has no edge. */
const SOFT_BLUR = 9

function markNode(mark: Mark, lampId: string): SvgNode {
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
        attrs: { x: mark.x, y: mark.y, width: mark.w, height: mark.h, ...(mark.rx === undefined ? {} : { rx: mark.rx }), ...style(mark), ...(mark.soft ? { filter: `url(#${lampId})` } : {}) },
      }
    case 'line':
      return { tag: 'line', attrs: { x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2, ...style(mark) } }
    case 'circle':
      return { tag: 'circle', attrs: { cx: mark.cx, cy: mark.cy, r: mark.r, ...style(mark) } }
    case 'polygon':
      return { tag: 'polygon', attrs: { points: mark.points.map(([x, y]) => `${x},${y}`).join(' '), ...style(mark) } }
    case 'glyph':
      return {
        tag: 'g',
        attrs: {
          transform: `translate(${num(mark.x - mark.size / 2)} ${num(mark.y - mark.size / 2)}) scale(${num((mark.size / 24) * 1000) / 1000})`,
          fill: 'none',
          stroke: paint(mark.stroke),
          strokeWidth: GLYPH_STROKE,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'data-glyph': mark.mechanism,
        },
        children: GLYPHS[mark.mechanism].map((d): SvgNode => ({ tag: 'path', attrs: { d } })),
      }
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
          ...(mark.up ? { transform: `rotate(-90 ${mark.x} ${mark.y})` } : {}),
          ...(mark.fit === undefined ? {} : { textLength: mark.fit, lengthAdjust: 'spacingAndGlyphs' }),
        },
        children: [mark.text],
      }
  }
}

/** A layer's nodes, with each run of marks that belong to one stage gathered in a group of its own: the page inks a run's new stops one by one. */
function layerNodes(marks: readonly Mark[], lampId: string): SvgNode[] {
  const out: SvgNode[] = []
  let open: { stage: number; nodes: SvgNode[] } | null = null
  for (const mark of marks) {
    const node = markNode(mark, lampId)
    if (mark.stage === undefined) {
      open = null
      out.push(node)
    } else if (open !== null && open.stage === mark.stage) {
      open.nodes.push(node)
    } else {
      const nodes: SvgNode[] = [node]
      open = { stage: mark.stage, nodes }
      out.push({ tag: 'g', attrs: { 'data-stage': mark.stage }, children: nodes })
    }
  }
  return out
}

/**
 * The SVG of a frame. The root is an image with the frame's label, and its box is the frame's own, so the browser reserves the space
 * before any style loads. A consumer sizes it with CSS (`width: 100%; height: auto`). `id` keeps the blur of two frames on one page apart.
 */
export function frameSvg(frame: Frame, id = 'floor'): SvgNode {
  const lampId = `es-lamp-pool-${id}`
  const soft = frame.layers.some((layer) => layer.marks.some((mark) => mark.kind === 'rect' && mark.soft === true))
  const defs: SvgNode = {
    tag: 'defs',
    attrs: {},
    children: [{ tag: 'filter', attrs: { id: lampId, x: '-40%', y: '-60%', width: '180%', height: '220%' }, children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: SOFT_BLUR } }] }],
  }
  const layers = frame.layers.map((layer): SvgNode => ({ tag: 'g', attrs: { 'data-part': layer.part }, children: layerNodes(layer.marks, lampId) }))
  return {
    tag: 'svg',
    attrs: { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${frame.width} ${frame.height}`, width: frame.width, height: frame.height, role: 'img', 'aria-label': frame.label },
    children: soft ? [defs, ...layers] : layers,
  }
}

/** Marks in a frame. */
export const markCount = (frame: Frame, id = 'floor'): number => countMarks(frameSvg(frame, id))
