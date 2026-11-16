/**
 * Request path's swimlane (REDESIGN §3.6, R-T29): the diagram the learner plays on. One column per process, its threads as thin sub-columns,
 * the GPU's streams in a column of their own at the right, and time running down. Each laid stage is a row: a node in the column of the
 * place it lands in, with the stage's name as code, and an arrow from the node before it, labelled with its mechanism as a glyph and a word.
 * The request itself is the first node, at the top, where it begins.
 *
 * It is pure: positions in CSS pixels from a view and a geometry, so the page, the lesson's dock and the result draw the same thing, and a
 * test can read what the diagram names without a browser. The page sets the words and the marks over these positions (View2D.tsx).
 *
 * What is drawn when follows the session's view and nothing else (it never shows what the old house drawing did not):
 *   - before the prediction, no column: only the request, at the top left, since the columns would answer the prediction;
 *   - in practice, once the prediction is written, the columns of the engine's whole path, so a laid stage never moves a column;
 *   - in a sealed run (the graded map, until its run is judged), a column appears when the route first reaches it, and the height grows with
 *     the stages laid, so the path's length is never shown.
 */
import type { Mechanism, Place, Scenario } from '@es/sim/lifecycle'
import { entryOf } from '@es/sim/lifecycle'
import { referenceOf } from './stages'
import type { FloorView, LaidView } from './types'
import { FLOOR_NAMES, MECHANISM_WORDS, floorKindOf, placeKey, stageName } from './words'
import type { FloorKind } from './words'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Input                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A stage as the swimlane draws it. */
export interface LaneStage {
  readonly id: string
  readonly label: string
  readonly mechanism: Mechanism
  readonly from: Place
  readonly to: Place
  readonly state: LaidView['state']
}

export interface LanesInput {
  /** No column is drawn: the prediction is still to be written. */
  readonly closed: boolean
  readonly entry: Place
  readonly stages: readonly LaneStage[]
  /** The places of the engine's whole path, in the order it visits them; empty while the path is sealed. */
  readonly plan: readonly Place[]
  /** The row the "now" cursor is on: -1 for the request's own row, or null once the run is over. */
  readonly cursor: number | null
}

/** The row the present is on: the last stage laid, or the last that held when a stage stopped the request; -1 is the request's row. */
const cursorOf = (view: FloorView): number | null => (view.done ? null : view.stop === null ? view.laid.length - 1 : view.reached - 1)

const placesOf = (stages: readonly { readonly from: Place; readonly to: Place }[]): Place[] => stages.flatMap((stage) => [stage.from, stage.to])

/** The swimlane of a view. */
export function lanesOfView(view: FloorView): LanesInput {
  return {
    closed: view.prediction === null,
    entry: view.entry,
    stages: view.laid.map((stage) => ({ id: stage.id, label: stage.label, mechanism: stage.mechanism, from: stage.from, to: stage.to, state: stage.state })),
    plan: view.sealed ? [] : placesOf(referenceOf(view.scenario)),
    cursor: cursorOf(view),
  }
}

/** An engine's whole path, every stage held: what the result sets beside another engine's. */
export function lanesOfScenario(sc: Scenario): LanesInput {
  const path = referenceOf(sc)
  return {
    closed: false,
    entry: entryOf(sc.engine),
    stages: path.map((stage) => ({ id: stage.id, label: stage.label, mechanism: stage.mechanism, from: stage.from, to: stage.to, state: 'ran' })),
    plan: placesOf(path),
    cursor: null,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Columns                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LaneThread {
  readonly key: string
  readonly place: Place
  /** The thread's name, or for a GPU the stream of the process that owns it. */
  readonly name: string
  readonly gpu: boolean
  /** The sub-column's left edge, width and centre. */
  readonly x0: number
  readonly w: number
  readonly x: number
}

export interface LaneColumn {
  /** The process, or `gpu` for the column of streams. */
  readonly key: string
  readonly kind: FloorKind
  readonly process: string | null
  /** The column's head: the engine's name for the process, with its id where the two differ ("Engine core · scheduler-0"). */
  readonly title: string
  /** The head in two parts: the name, and the process id where it adds to the name. */
  readonly name: string
  readonly id: string | null
  readonly x0: number
  readonly w: number
  readonly threads: readonly LaneThread[]
}

/** A thread's name: a GPU's stream is named for the process that owns it, since the column is the GPU's and not the process's. */
const threadName = (p: Place): string => (p.device === 'gpu' ? `${p.process} stream${p.rank > 0 ? ` ${p.rank}` : ''}` : p.thread)

const sameName = (name: string, id: string): boolean => name.toLowerCase().replace(/[^a-z0-9]/g, '') === id.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The processes and threads a set of places makes, in the order the places first visit them, with the GPU's streams last. A place the plan
 * does not have (a stage of another engine, laid by mistake) comes after the plan's, so nothing the plan placed moves.
 */
export function columnsOf(places: readonly Place[]): { kind: FloorKind; process: string | null; title: string; name: string; id: string | null; places: Place[] }[] {
  const seen = new Set<string>()
  const order: string[] = []
  const byProcess = new Map<string, Place[]>()
  const gpu: Place[] = []
  for (const place of places) {
    const key = placeKey(place)
    if (seen.has(key)) continue
    seen.add(key)
    if (place.device === 'gpu') {
      gpu.push(place)
      continue
    }
    if (!byProcess.has(place.process)) {
      order.push(place.process)
      byProcess.set(place.process, [])
    }
    byProcess.get(place.process)?.push(place)
  }
  const out = order.map((process) => {
    const here = byProcess.get(process) ?? []
    const kind = floorKindOf(here[0])
    const name = FLOOR_NAMES[kind]
    const id = sameName(name, process) ? null : process
    return { kind, process, title: id === null ? name : `${name} · ${id}`, name, id, places: here }
  })
  return gpu.length === 0 ? out : [...out, { kind: 'line' as const, process: null, title: FLOOR_NAMES.line, name: FLOOR_NAMES.line, id: null, places: gpu }]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Geometry                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LaneGeometry {
  /** The width of the box the diagram sits in: the columns fill it, and a wider diagram scrolls inside it. */
  readonly box: number
  /** The row numbers' column at the left. */
  readonly gutter: number
  /** The column heads: the process, then its threads. */
  readonly head: number
  /** The request's own row, at the top. */
  readonly start: number
  readonly row: number
  /** A thread's sub-column: at least this wide, and no wider than the most. */
  readonly threadMin: number
  readonly threadMax: number
  /** Padding at the right and the foot. */
  readonly pad: number
  /** Room kept at the right of the last column, for an arrow's word beside a node there. */
  readonly tail: number
}

/** At 1440 x 900 the diagram is about 896 px wide (REDESIGN §3.5); the row is fitted to the box's height (`fitRow`). */
export const LANES_DESK: LaneGeometry = { box: 896, gutter: 40, head: 52, start: 30, row: 32, threadMin: 60, threadMax: 150, pad: 12, tail: 96 }

/** At 390 x 844 the box is 358 px wide: a thread is 72 px, so a process of one thread is the brief's 72 px column, and the diagram scrolls sideways. */
export const LANES_PHONE: LaneGeometry = { box: 358, gutter: 28, head: 52, start: 28, row: 30, threadMin: 72, threadMax: 72, pad: 10, tail: 84 }

/** The result's pair of paths, side by side in the dock: small, with no stage names. */
export const LANES_MINI: LaneGeometry = { box: 184, gutter: 0, head: 0, start: 10, row: 11, threadMin: 12, threadMax: 26, pad: 4, tail: 0 }

/** The fewest rows a desk box shows without scrolling (REDESIGN §3.6: fourteen), and the row's bounds [estimated from the type's size]. */
export const ROWS_IN_VIEW = 14
export const ROW_MIN = 26
export const ROW_MAX = 36

/** The row height that fits `rows` stages under the heads in a box `height` px tall, between the bounds. */
export function fitRow(height: number, geometry: LaneGeometry, rows = ROWS_IN_VIEW): number {
  const room = Math.floor((height - geometry.head - geometry.start - geometry.pad) / rows)
  return Math.max(ROW_MIN, Math.min(ROW_MAX, room))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rows                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The words an arrow carries: one of TR1's five mechanisms, or the kind where the five split. */
export const ARROW_WORDS: Readonly<Record<Mechanism, string>> = {
  call: 'call',
  launch: 'launch',
  collective: 'collective',
  queue: 'queue',
  ipc: 'IPC',
  shm: 'shared memory',
  h2d: 'copy',
  d2h: 'copy',
  sync: 'sync',
}

/** How wide words are set, in CSS pixels [estimated from Atkinson Hyperlegible's advance]: the arrow's word at 12 px bold, a name at 13 px mono. */
export const tagWidth = (mechanism: Mechanism): number => Math.ceil(20 + ARROW_WORDS[mechanism].length * 6.9 + 6)
export const nameWidth = (name: string): number => Math.ceil(name.length * 7.9 + 8)

export interface LaneRow {
  readonly index: number
  readonly id: string
  readonly label: string
  /** The stage's name as code: its first identifier, or its label where it has none. */
  readonly name: string
  readonly mechanism: Mechanism
  readonly state: LaneStage['state']
  /** The node's centre. */
  readonly x: number
  readonly y: number
  /** The arrow from the node before: its corners, from the node before to this one. */
  readonly path: readonly (readonly [number, number])[]
  /** The stage starts where the request is: the arrow joins the node before. Not joined is drawn dashed. */
  readonly joined: boolean
  /** The arrow crosses a process boundary. */
  readonly crosses: boolean
  /** Where the arrow's glyph and word sit: its anchor point and the side of the arrow it reads on. */
  readonly tag: { readonly x: number; readonly y: number; readonly side: 'left' | 'right' }
  /** Which side of the node its name reads on, and the most room it has. */
  readonly side: 'left' | 'right'
  readonly room: number
}

export interface Lanes {
  readonly width: number
  readonly height: number
  readonly geometry: LaneGeometry & { readonly row: number }
  readonly columns: readonly LaneColumn[]
  /** The request's node, at the top: where it begins. */
  readonly start: { readonly x: number; readonly y: number }
  readonly rows: readonly LaneRow[]
  /** The "now" cursor: the row it is on (-1 for the request's own) and its y, or null once the run is over. */
  readonly cursor: { readonly row: number; readonly y: number } | null
}

const NODE = 6

/** The swimlane's layout. The same input and geometry always give the same layout. */
export function layoutLanes(input: LanesInput, geometry: LaneGeometry = LANES_DESK): Lanes {
  const g = geometry
  const visited = [input.entry, ...placesOf(input.stages)]
  const groups = input.closed ? [] : columnsOf([...input.plan, ...visited])
  const threadCount = groups.reduce((sum, group) => sum + group.places.length, 0)
  const room = g.box - g.gutter - g.tail
  const threadW = threadCount === 0 ? g.threadMax : Math.max(g.threadMin, Math.min(g.threadMax, Math.floor(room / threadCount)))
  const byKey = new Map<string, LaneThread>()
  let left = g.gutter
  const columns: LaneColumn[] = groups.map((group) => {
    const x0 = left
    const threads = group.places.map((place, at): LaneThread => {
      const t = { key: placeKey(place), place, name: threadName(place), gpu: place.device === 'gpu', x0: x0 + at * threadW, w: threadW, x: Math.round(x0 + at * threadW + threadW / 2) }
      byKey.set(t.key, t)
      return t
    })
    left += threads.length * threadW
    return { key: group.process ?? 'gpu', kind: group.kind, process: group.process, title: group.title, name: group.name, id: group.id, x0, w: threads.length * threadW, threads }
  })
  const width = Math.max(g.box, left + g.tail)
  const xOf = (place: Place): number => byKey.get(placeKey(place))?.x ?? g.gutter + 14
  const top = g.head
  const start = { x: xOf(input.entry), y: top + Math.round(g.start / 2) }
  const yOf = (index: number): number => top + g.start + index * g.row + Math.round(g.row / 2)

  const rows: LaneRow[] = []
  let prev = { x: start.x, y: start.y, place: input.entry }
  input.stages.forEach((stage, index) => {
    const x = xOf(stage.to)
    const y = yOf(index)
    const fromX = prev.x
    const mid = Math.round(prev.y + (y - prev.y) / 2)
    const path: [number, number][] = fromX === x ? [[fromX, prev.y + NODE], [x, y - NODE]] : [[fromX, prev.y + NODE], [fromX, mid], [x, mid], [x, y - NODE]]
    const name = stageName(stage.label)
    // The name reads to the right of its node, unless the node stands so far right that it would run off the diagram.
    const need = nameWidth(name)
    const rightRoom = width - g.pad - (x + NODE + 6)
    const leftRoom = x - NODE - 6 - g.gutter
    const side: 'left' | 'right' = rightRoom >= need || rightRoom >= leftRoom ? 'right' : 'left'
    // The arrow's word reads on the other side of the arrow's last leg, so it never shares a line with the name; on its left by default.
    const tagNeed = tagWidth(stage.mechanism)
    const tagSide: 'left' | 'right' = side === 'left' ? 'right' : x - 6 - tagNeed >= g.gutter ? 'left' : 'right'
    rows.push({
      index,
      id: stage.id,
      label: stage.label,
      name,
      mechanism: stage.mechanism,
      state: stage.state,
      x,
      y,
      path,
      joined: placeKey(stage.from) === placeKey(prev.place),
      crosses: stage.from.process !== stage.to.process,
      tag: { x: tagSide === 'left' ? x - 6 : x + 6, y: Math.round(y - g.row / 4 - 1), side: tagSide },
      side,
      room: Math.max(0, side === 'right' ? rightRoom : leftRoom),
    })
    prev = { x, y, place: stage.to }
  })
  const cursor = input.cursor === null ? null : input.cursor < 0 ? { row: -1, y: start.y } : { row: input.cursor, y: yOf(Math.min(input.cursor, input.stages.length - 1)) }
  const height = top + g.start + input.stages.length * g.row + g.pad
  return { width, height, geometry: g, columns, start, rows, cursor }
}

/** What a swimlane names: the columns' heads, the threads' names and the stages it draws (the test against the old drawing reads it). */
export function namedOn(lanes: Lanes): { readonly processes: readonly string[]; readonly threads: readonly string[]; readonly stages: readonly string[] } {
  return {
    processes: lanes.columns.map((column) => column.title),
    threads: lanes.columns.flatMap((column) => column.threads.map((thread) => thread.name)),
    stages: lanes.rows.map((row) => row.id),
  }
}

/** The mechanism in the engine's words, for a reader not looking at the arrow: "IPC", "host-to-device copy". */
export const arrowTitle = (mechanism: Mechanism): string => MECHANISM_WORDS[mechanism].engine
