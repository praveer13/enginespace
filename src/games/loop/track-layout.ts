/*
 * The step loop's 3D time track, laid out (REDESIGN §2.8, §2.9): the timing diagram of packages/play/loop/lanes.ts, turned into the flat
 * model that src/scene/FlatTrack.tsx draws. Pure, with no three in it: the scene, the tests and the cameras read it.
 *
 * The diagram is laid flat on a base plate, in its own pixels (flat-track.ts): x is the diagram's x, z its y, so the Side camera, looking
 * straight down on the plate, draws every tick where the 2D diagram draws it (P7). On it:
 *   - no waiting queue: in 3D the dock holds it, so it is drawn once (its row stays, empty, so Side still matches the 2D view);
 *   - on the demo levels, the reference run of the same level and seed, behind the learner's run on the same clock (demoTrack);
 *   - the CPU row's calls, blue slabs (a sync yellow), and one slab per batch slot per step on the GPU rows: green for a token, hatched
 *     green for a ghost token, and a dashed wire outline for a slot the GPU paid for and nothing used;
 *   - idle as dashed wire outlines over the slot rows, each closed one with a dimension line and its value;
 *   - the now cursor, an amber sheet, and the axis in synthetic ticks;
 *   - every word and number as a DOM label.
 *
 * Two more models are not the learner's run but the model's own, on the specimen's short service and long night (synthetic ticks, D-048):
 *   - Compare: static batching, continuous batching and async scheduling stacked on one time axis, with the authored move that closes the
 *     gaps when async scheduling goes on;
 *   - Scale: 64 slots for 160 steps, more than 10,000 slabs.
 */
import type { Us } from '@es/sim/core'
import type { StepLoopRun } from '@es/sim/steploop'
import { requestName } from '@es/play/loop/copy'
import { FRAME_DESK, FRAME_PHONE, fitGeometry, LANE_WORDS, laneLayout, windowStart, type LaneGeometry, type LaneLayout, type LaneSource } from '@es/play/loop/lanes'
import type { FireView, PlaceView } from '@es/play/loop/types'
import { EMPTY_MODEL, type FlatBox, type FlatLabel, type FlatModel, type FlatSegment } from '@/scene/flat-track'
import { LONG_NIGHT_FIRES, specimenRun } from '@/scene/specimen-layout'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Heights and margins                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How far each kind of mark stands off the paper, in the diagram's px [estimated, set by eye in Lifted]. */
export const RISE = { cpu: 18, slot: 13, chip: 6, wire: 13, cursor: 22, plate: 10 } as const

/** The figure's padding round the lanes, in px: the 2D view's (View2D.tsx), so the Side camera puts a tick where the 2D view does. */
export const PAD = { desk: 12, phone: 8 } as const
/** Below this canvas width the track takes the phone's geometry: the 2D view's own breakpoint (View2D.tsx). */
export const NARROW = 560
/** The rise over the lanes that the now cursor's word takes, in px: the 2D view's head room. */
const HEAD = 14
/** How far a dimension's value and an idle box's word stand off the dimension line, in px of the plate [estimated, set by eye in Lifted]. */
const DIM_CLEAR = 4

/** Whether words fit a width: the 2D view's rule [estimated: 6.5 px a character and a margin]. */
const fits = (words: string, width: number): boolean => words.length * 6.5 + 8 <= width

/* ------------------------------------------------------------------------------------------------------------------ */
/* One diagram                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface DiagramOptions {
  /** Where the diagram's origin stands on the plate, in px. */
  readonly x?: number
  readonly z?: number
  /** A prefix for every id, so two diagrams on one plate keep theirs apart. */
  readonly prefix?: string
  /** Name the rows in the label column. */
  readonly rowLabels?: boolean
  /** The short row names, for a narrow label column. */
  readonly narrow?: boolean
  /** Slabs edge to edge, with no gap between steps or slots: at Scale's density a hairline gap only shimmers. */
  readonly tight?: boolean
}

/** One timing diagram's marks, from its lane layout, offset to where it stands on the plate. Its plate is left to the caller. */
export function diagramModel(layout: LaneLayout, options: DiagramOptions = {}): FlatModel {
  const ox = options.x ?? 0
  const oz = options.z ?? 0
  const p = options.prefix ?? ''
  const g = layout.geometry
  const { scale } = layout
  const boxes: FlatBox[] = []
  const wires: FlatBox[] = []
  const rules: FlatSegment[] = []
  const inks: FlatSegment[] = []
  const labels: FlatLabel[] = []
  const lanesTop = g.queueHeight + g.queueGap
  const axisY = layout.axis.y

  // The waiting queue is not drawn: in 3D the dock holds it, as the chips a tap admits, so it is drawn once (the row stays, empty, so the
  // Side camera still puts every row where the 2D view does).

  // The graticule: a line on every tick wide enough to show one, the axis's labelled ticks, and a rule at the top of each row.
  if (scale.pxPerTick >= 6) for (let t = Math.ceil(scale.start); t <= scale.end; t++) rules.push({ x0: ox + scale.x + (t - scale.start) * scale.pxPerTick, z0: oz + lanesTop - HEAD, x1: ox + scale.x + (t - scale.start) * scale.pxPerTick, z1: oz + axisY })
  for (const tick of layout.axis.ticks) rules.push({ x0: ox + tick.x, z0: oz + lanesTop - HEAD, x1: ox + tick.x, z1: oz + axisY })
  for (const row of layout.rows) rules.push({ x0: ox + scale.x, z0: oz + row.y, x1: ox + scale.x + scale.width, z1: oz + row.y })
  rules.push({ x0: ox + scale.x, z0: oz + axisY, x1: ox + scale.x + scale.width, z1: oz + axisY })

  // The rows' names.
  if (options.rowLabels !== false) {
    for (const row of layout.rows) {
      const holds = row.req === null ? LANE_WORDS.empty : requestName(row.req)
      const text = row.lane === 'cpu' ? (options.narrow ? LANE_WORDS.cpuShort : LANE_WORDS.cpu) : row.label === null ? null : options.narrow ? `${(row.slot ?? 0) + 1} · ${holds}` : row.label
      if (text === null) continue
      labels.push({ id: `${p}row/${row.id}`, at: [ox + 4, 0, oz + row.y + row.height / 2], text, kind: 'row', place: 'right' })
    }
  }

  // The slabs: the CPU's calls, and every step on every slot row.
  const gap = options.tight ? 0 : 0.5
  for (const slab of layout.slabs) {
    const x0 = ox + slab.x + gap
    const x1 = ox + slab.x + slab.width - gap
    if (x1 <= x0) continue
    if (slab.row === 'cpu') {
      // A sync stops short of its end by a hair, so its yellow never fuses with now's amber sheet standing at the same tick.
      const end = slab.kind === 'sync' && !options.tight ? x1 - 3 : x1
      boxes.push({ id: `${p}${slab.id}`, x0, x1: end, z0: oz + slab.y + 1, z1: oz + slab.y + slab.height - 1, height: RISE.cpu, role: slab.kind === 'sync' ? 'lane-sync' : 'lane-cpu', form: 'solid' })
      if (fits(slab.kind, slab.width) && slab.height >= 14) labels.push({ id: `${p}${slab.id}`, at: [x0 - 1, RISE.cpu, oz + slab.y + slab.height / 2], text: slab.kind, kind: 'slab', place: 'right' })
      continue
    }
    // Each slot's slab keeps a clear gap from the next slot's, so four slots read as four rows and not one block in the tilt.
    const inset = options.tight ? 0 : Math.min(5, slab.height / 5)
    const footprint = { x0, x1, z0: oz + slab.y + inset, z1: oz + slab.y + slab.height - inset }
    if (slab.use === 'empty') {
      wires.push({ id: `${p}${slab.id}`, ...footprint, height: RISE.slot / 2, role: 'lane-idle', form: 'hollow' })
      continue
    }
    boxes.push({ id: `${p}${slab.id}`, ...footprint, height: RISE.slot, role: 'lane-gpu', form: slab.use === 'ghost' ? 'marked' : 'solid' })
    const words = slab.use === 'ghost' ? LANE_WORDS.ghost : slab.req !== null && slab.req !== undefined ? requestName(slab.req) : null
    if (words !== null && fits(words, slab.width) && slab.height >= 14) labels.push({ id: `${p}${slab.id}`, at: [x0 - 1, RISE.slot, oz + slab.y + slab.height / 2], text: words, kind: 'slab', place: 'right' })
  }

  // Idle: dashed wire outlines over the slot rows, each closed one with its dimension line and its value.
  for (const box of layout.idle) {
    const x0 = ox + box.x + 1
    const x1 = ox + box.x + box.width - 1
    if (x1 <= x0) continue
    wires.push({ id: `${p}${box.id}`, x0, x1, z0: oz + box.y + 1, z1: oz + box.y + box.height - 1, height: RISE.wire, role: 'lane-idle', form: 'hollow' })
    // The word stands in the middle of the gap, under its dimension line where it has one: far from the rows above and below, so no slab
    // of the CPU row, which stands taller and nearer the camera's eye, can cover it.
    if (fits(LANE_WORDS.idle, box.width)) labels.push({ id: `${p}${box.id}`, at: [(x0 + x1) / 2, RISE.wire, oz + box.y + box.height / 2 + DIM_CLEAR], text: LANE_WORDS.idle, kind: 'idle', place: 'below' })
  }
  for (const dim of layout.dims) {
    const z = oz + dim.y
    const x0 = ox + dim.x0
    const x1 = ox + dim.x1
    inks.push({ x0, z0: z, x1, z1: z, y: RISE.wire }, { x0, z0: z - 5, x1: x0, z1: z + 5, y: RISE.wire }, { x0: x1, z0: z - 5, x1, z1: z + 5, y: RISE.wire })
    // The value over the line, clear of it, as an engineering drawing writes it: the line shows whole between its end ticks under the value.
    labels.push({ id: `${p}${dim.id}`, at: [(x0 + x1) / 2, RISE.wire, z - DIM_CLEAR], text: fits(dim.label, x1 - x0 - 8) ? dim.label : LANE_WORDS.ticks(dim.ticks), kind: 'dim', place: 'above' })
  }

  // The axis: its line, a tick and a number at each step, and its unit in the label column.
  inks.push({ x0: ox + scale.x, z0: oz + axisY, x1: ox + scale.x + scale.width, z1: oz + axisY, y: 0 })
  for (const tick of layout.axis.ticks) {
    inks.push({ x0: ox + tick.x, z0: oz + axisY, x1: ox + tick.x, z1: oz + axisY + 6, y: 0 })
    labels.push({ id: `${p}tick/${tick.t}`, at: [ox + tick.x, 0, oz + axisY + 6], text: String(tick.t), kind: 'tick', place: 'below' })
  }
  if (options.rowLabels !== false) labels.push({ id: `${p}axis`, at: [ox + 4, 0, oz + axisY + g.axisHeight / 2], text: LANE_WORDS.axis, kind: 'axis', place: 'right' })

  // Now: the amber sheet across the lanes, and its word under the axis's numbers, at its foot. Over the lanes the tilt would carry the word
  // up into the waiting queue's row, onto a tile or the row's name; under the axis nothing else is drawn, at any tick.
  const cursors = [{ id: `${p}now`, x: ox + layout.now.x, z0: oz + layout.now.y0 - HEAD / 2, z1: oz + layout.now.y1, height: RISE.cursor }]
  // The now word stands to the cursor's right just inside the first lane, where nothing is drawn yet (the lanes right of now are the
  // future): at the cursor's head the tilt set it on the waiting queue's first tile.
  labels.push({ id: `${p}now`, at: [ox + layout.now.x + 3, RISE.cursor, oz + lanesTop + 10], text: LANE_WORDS.now, kind: 'now', place: 'right' })

  return {
    plates: [],
    boxes,
    wires,
    rules,
    inks,
    cursors,
    labels,
    bounds: { x0: ox, x1: ox + g.width, z0: oz, z1: oz + layout.height + g.axisHeight },
  }
}

/** The base plate (the plate's grey) and the paper sheet on it, round a drawing's bounds with a margin, in px. */
export function platesOf(bounds: FlatModel['bounds'], margin: number, id = 'plate'): FlatBox[] {
  const sheet = { x0: bounds.x0, x1: bounds.x1, z0: bounds.z0, z1: bounds.z1 }
  return [
    { id: `${id}/base`, x0: sheet.x0 - margin, x1: sheet.x1 + margin, z0: sheet.z0 - margin, z1: sheet.z1 + margin, y0: -RISE.plate, height: RISE.plate - 0.6, role: 'surface-2', form: 'solid', shadow: false },
    { id: `${id}/sheet`, ...sheet, y0: -0.6, height: 0.6, role: 'paper', form: 'solid', shadow: false },
  ]
}

/** Several models on one plate, as one. */
export function joinModels(models: readonly FlatModel[]): FlatModel {
  if (models.length === 0) return EMPTY_MODEL
  return {
    plates: models.flatMap((m) => m.plates),
    boxes: models.flatMap((m) => m.boxes),
    wires: models.flatMap((m) => m.wires),
    rules: models.flatMap((m) => m.rules),
    inks: models.flatMap((m) => m.inks),
    cursors: models.flatMap((m) => m.cursors),
    labels: models.flatMap((m) => m.labels),
    bounds: {
      x0: Math.min(...models.map((m) => m.bounds.x0)),
      x1: Math.max(...models.map((m) => m.bounds.x1)),
      z0: Math.min(...models.map((m) => m.bounds.z0)),
      z1: Math.max(...models.map((m) => m.bounds.z1)),
    },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The learner's run                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The diagram's geometry for a canvas this wide, as the 2D view picks it, and the padding it stands in. */
export function trackGeometry(canvasWidth: number): { geometry: LaneGeometry; pad: number; narrow: boolean } {
  const narrow = canvasWidth < NARROW
  const pad = narrow ? PAD.phone : PAD.desk
  const base = narrow ? FRAME_PHONE : FRAME_DESK
  return { geometry: fitGeometry(base, Math.max(canvasWidth - pad * 2, base.labelWidth + 1)), pad, narrow }
}

/** What a demo track is laid out for: the canvas's height and the lift it is seen at, and whether the reference is drawn past now. */
export interface DemoFrame {
  /** The canvas's height, in px: the reference band takes the depth the canvas has left over the learner's run. */
  readonly height?: number
  /** The camera's lift, in degrees from straight down: the plate's depth shows foreshortened by its cosine. */
  readonly lift?: number
  /** Draw the reference to the window's end, ahead of now. False while a guess about the run ahead is open. */
  readonly ahead?: boolean
}

/** The band names' row over each run, in px [estimated, set by eye in Lifted]. */
const BAND_HEAD = 30
/** The clear paper between the reference band's foot and the learner's band's name, in px [estimated]. */
const REF_GAP = 10
/** The least depth of either run's band, in px: a CPU row and four slots still read as rows [estimated]. */
const REF_LEAST = 104
/** The row over both runs that holds the now word alone, in px: no run's name stands under it, whatever tick now is at [estimated]. */
const NOW_HEAD = 18
/** The least depth of a band's CPU row, in px: its name's line [estimated]. */
const LEAST_CPU = 24
/** How much deeper than the 2D view's lanes a band may grow in a tall box [estimated]. */
const TALLEST = 1.6
/** The share of the canvas's height the plate's depth is laid out for, seen at the lift: the camera's margins take the rest [estimated, set by eye in Lifted]. */
const FILL = 1.2
/** The least depth on screen of a slot row whose name may take two lines, in px [estimated]. */
const SHORT_ROW = 30
/** The least depth on screen of a reference row that carries its name, in px [estimated: a caption's line]. */
const REF_ROW_LABEL = 17
/** The reference band's axis: a bottom rule only, since the learner's axis below carries the numbers for both. */
const REF_AXIS = 4

/** The names of the two runs on one clock, and the reference's rows in the narrow column's words. */
export const BAND_WORDS = { reference: 'Reference run', yours: 'Your run', referenceShort: 'Reference', yoursShort: 'Yours' } as const

/**
 * The learner's run on the demo levels as the 3D track: the 2D view's diagram, at the 2D view's geometry for a canvas this wide.
 *
 * With `reference`, the reference run of the same level and seed stands on the same plate behind the learner's, on the same clock: the same
 * window and the same x for every tick, so the now sheet runs through both, and a slot the learner left empty is a dashed hole in front of the
 * reference's slab (REDESIGN §1, item 9: "the reference run is drawn under the learner's own"). That is the job depth does here. The band
 * takes the depth the canvas has left, so the two runs fill the box at the Lifted camera. Without it (the Side camera), the track is the 2D
 * diagram alone.
 */
export function demoTrack(source: LaneSource, canvasWidth: number, reference?: LaneSource, frame: DemoFrame = {}): FlatModel {
  const { geometry, pad, narrow } = trackGeometry(canvasWidth)
  if (reference === undefined) {
    const layout = laneLayout(source, geometry)
    const marks = diagramModel(layout, { x: pad, z: pad, narrow })
    const head = pad + geometry.queueHeight + geometry.queueGap - HEAD - BAND_HEAD / 2
    const own = { ...marks, labels: marks.labels.filter((label) => label.kind !== 'now'), plates: platesOf(marks.bounds, pad) }
    return withNow(own, pad + layout.now.x, head, pad + layout.now.y1)
  }

  // The depth the canvas holds at this lift, shared by the two runs: the learner's a little deeper, each between the least that reads and
  // the 2D view's own depth. Each run's rows shrink to fit their band, as the lanes fit any box.
  const cos = Math.cos(((frame.lift ?? 36) * Math.PI) / 180)
  const height = frame.height ?? canvasWidth * 0.62
  const fixed = pad * 2 + NOW_HEAD + BAND_HEAD * 2 + REF_GAP + geometry.axisHeight * 2 + HEAD
  const room = Math.max(0, (height * FILL) / cos - fixed)
  const most = FRAME_DESK.lanesHeight * TALLEST
  const lanes = Math.round(Math.max(REF_LEAST, Math.min(most, room * 0.56)))
  const depth = Math.round(Math.max(REF_LEAST, Math.min(lanes, room - lanes)))
  const band = (lanesHeight: number, axisHeight: number): LaneGeometry => ({ ...geometry, queueHeight: 0, queueGap: 0, lanesHeight, cpuHeight: Math.max(LEAST_CPU, Math.round((lanesHeight * FRAME_DESK.cpuHeight) / FRAME_DESK.lanesHeight)), axisHeight })

  // The reference, on the learner's window: cut at the window's end, or at now while a guess about the run ahead is open.
  const start = windowStart(source.clockUs, geometry.windowTicks)
  const until = frame.ahead === false ? source.clockUs : start + geometry.windowTicks
  const cut = <T extends { readonly startUs: Us; readonly endUs: Us }>(spans: readonly T[]): T[] => spans.filter((span) => span.startUs < until).map((span) => ({ ...span, endUs: Math.min(span.endUs, until) }))
  const refLayout = laneLayout({ ...reference, clockUs: source.clockUs, waiting: [], fires: cut(reference.fires), cpu: cut(reference.cpu) }, band(depth, REF_AXIS))
  const refTop = pad + NOW_HEAD + BAND_HEAD
  const ref = diagramModel(refLayout, { x: pad, z: refTop, prefix: 'ref/', rowLabels: false })
  const yourHead = refTop + refLayout.height + REF_GAP + BAND_HEAD / 2
  const layout = laneLayout(source, band(lanes, geometry.axisHeight))
  // Rows too shallow on screen for a name over two lines take the narrow column's words.
  const marks = diagramModel(layout, { x: pad, z: yourHead + BAND_HEAD / 2, narrow: narrow || (layout.rows[1]?.height ?? 0) * cos < SHORT_ROW })

  const rowWords = (row: (typeof refLayout.rows)[number]) => (row.lane === 'cpu' ? LANE_WORDS.cpuShort : LANE_WORDS.slot(row.slot ?? 0))
  const refLabels: FlatLabel[] = refLayout.rows
    .filter((row) => row.height * cos >= REF_ROW_LABEL)
    .map((row) => ({ id: `ref/row/${row.id}`, at: [pad + 4, 0, refTop + row.y + row.height / 2], text: rowWords(row), kind: 'row', place: 'right' }))
  const names: FlatLabel[] = [
    { id: 'band/reference', at: [pad + 4, 0, pad + NOW_HEAD + BAND_HEAD / 2], text: narrow ? BAND_WORDS.referenceShort : BAND_WORDS.reference, kind: 'band', place: 'right' },
    { id: 'band/yours', at: [pad + 4, 0, yourHead], text: narrow ? BAND_WORDS.yoursShort : BAND_WORDS.yours, kind: 'band', place: 'right' },
  ]
  const joined = joinModels([{ ...marks, cursors: [] }, { ...ref, inks: [], cursors: [], labels: [] }])
  const bounds = { ...joined.bounds, z0: pad }
  const labels = [...names, ...refLabels, ...marks.labels.filter((label) => label.kind !== 'now')]
  return withNow({ ...joined, labels, bounds, plates: platesOf(bounds, pad) }, pad + layout.now.x, pad + NOW_HEAD / 2, yourHead + BAND_HEAD / 2 + layout.now.y1)
}

/**
 * The now sheet, from the head row it stands in down through every lane under it, and its word in that row to its right, where no mark is
 * drawn: no waiting request, no slab and no row's name can stand under the word.
 */
function withNow(model: FlatModel, x: number, head: number, bottom: number): FlatModel {
  return {
    ...model,
    cursors: [{ id: 'now', x, z0: head - 8, z1: bottom, height: RISE.cursor }],
    labels: [...model.labels, { id: 'now', at: [x + 3, RISE.cursor, head], text: LANE_WORDS.now, kind: 'now', place: 'right' }],
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Compare and Scale: the model's own runs                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A finished run of the step loop, read as the lanes read a view: the forwards and the CPU's calls up to `untilUs`. */
export function runSource(run: StepLoopRun, slots: number, untilUs: Us): LaneSource {
  const fires: FireView[] = []
  for (const span of run.lanes['gpu-stream']) {
    if (span.startUs >= untilUs) break
    const step = run.steps[span.step]
    const live = step.seqs - step.ghostSeqs
    const places: PlaceView[] = Array.from({ length: slots }, (_, slot) => ({ state: slot < live ? 'plate' : slot < step.seqs ? 'binned' : 'empty', req: null }))
    fires.push({ index: span.step, startUs: span.startUs, endUs: Math.min(span.endUs, untilUs), places, admits: 0, bubbleUs: step.bubbleUs, ghosts: step.ghostSeqs, onLine: false })
  }
  const cpu = run.lanes['cpu-main'].filter((span) => span.startUs < untilUs).map((span) => ({ ...span, endUs: Math.min(span.endUs, untilUs) }))
  return { slots, clockUs: untilUs, waiting: [], rail: Array.from({ length: slots }, () => ({ req: null })), cpu, fires }
}

/** Compare's three schedulers, top to bottom, each with its name. */
export const COMPARE_BANDS = [
  { id: 'static', name: 'Static batching', batching: 'static', overlap: false },
  { id: 'continuous', name: 'Continuous batching', batching: 'continuous', overlap: false },
  { id: 'async', name: 'Async scheduling', batching: 'continuous', overlap: true },
] as const

/** Compare's window: the short service's first 34 ticks, on one axis of 46, so the window never slides [estimated]. */
export const COMPARE_TICKS = 34
const COMPARE_GEOMETRY: LaneGeometry = { ...FRAME_DESK, width: 180 + 46 * 15, windowTicks: 46, queueHeight: 0, queueGap: 12, lanesHeight: 36 + 4 * 26 + 22, cpuHeight: 36, slotHeight: 26, axisHeight: 22, axisLabelGap: 56 }
const BAND_GAP = 30

/** The runs Compare stacks, on the specimen's short service of 4 slots. */
function compareRun(band: (typeof COMPARE_BANDS)[number]): StepLoopRun {
  return specimenRun({ clips: 4, overlap: band.overlap, batching: band.batching })
}

/**
 * One of Compare's bands: its name in the label column, and its marks with no words of their own, so three bands read at a glance; the
 * last band carries the axis's numbers for all three. The dashed idle boxes are what the eye compares.
 */
function bandModel(run: StepLoopRun, index: number, prefix: string, name: string, axis: boolean): FlatModel {
  const layout = laneLayout(runSource(run, 4, COMPARE_TICKS), COMPARE_GEOMETRY)
  const z = PAD.desk + index * (layout.height + BAND_GAP)
  const marks = diagramModel(layout, { x: PAD.desk, z, prefix, rowLabels: false })
  const kept = marks.labels.filter((label) => label.kind === 'now' || (axis && label.kind === 'tick'))
  return { ...marks, inks: marks.inks.slice(-1 - layout.axis.ticks.length), labels: [{ id: `${prefix}name`, at: [PAD.desk + 4, 0, z + COMPARE_GEOMETRY.queueGap + COMPARE_GEOMETRY.lanesHeight / 2 - 6], text: name, kind: 'band', place: 'right' }, ...kept] }
}

/**
 * Compare: static batching, continuous batching and async scheduling stacked on one axis. `model` is where it ends; `from` is the same with
 * the async band drawn as continuous batching, so the authored move from one to the other closes the gaps as async scheduling goes on.
 */
export function compareTrack(): { model: FlatModel; from: FlatModel } {
  const runs = COMPARE_BANDS.map((band) => compareRun(band))
  const last = COMPARE_BANDS.length - 1
  const bands = COMPARE_BANDS.map((band, i) => bandModel(runs[i], i, `${band.id}/`, band.name, i === last))
  const before = bandModel(runs[1], last, `${COMPARE_BANDS[last].id}/`, COMPARE_BANDS[last].name, true)
  const plate = (models: readonly FlatModel[]): FlatModel => {
    const joined = joinModels(models)
    return { ...joined, plates: platesOf(joined.bounds, PAD.desk), labels: [...joined.labels, caption(joined.bounds, 'Compare: the same requests under three schedulers · synthetic ticks')] }
  }
  return { model: plate(bands), from: plate([...bands.slice(0, last), before]) }
}

/** Scale's run: the specimen's long night, 64 slots for its first 160 steps. */
export const SCALE_SLOTS = 64
export const SCALE_STEPS = LONG_NIGHT_FIRES

/** Scale: 64 slots for 160 steps, the step loop at a size no hand would play, as one diagram. */
export function scaleTrack(): FlatModel {
  const run = specimenRun({ clips: SCALE_SLOTS, overlap: false })
  const last = run.lanes['gpu-stream'][Math.min(SCALE_STEPS, run.lanes['gpu-stream'].length) - 1]
  const until = last?.endUs ?? 1
  // The window is a third longer than the run, so it never slides; the plate stops a little after now.
  const ticks = Math.ceil((until * 4) / 3) + 1
  const pxPerTick = 1.1
  const geometry: LaneGeometry = { ...FRAME_DESK, width: 180 + Math.round(ticks * pxPerTick), windowTicks: ticks, queueHeight: 0, queueGap: 24, lanesHeight: 48 + SCALE_SLOTS * 12 + 24, cpuHeight: 48, slotHeight: 12, axisHeight: 24, axisLabelGap: 80 }
  const layout = laneLayout(runSource(run, SCALE_SLOTS, until), geometry)
  const marks = diagramModel(layout, { x: PAD.desk, z: PAD.desk, prefix: 'scale/', rowLabels: false, tight: true })
  const end = PAD.desk + layout.now.x + 48
  const inside = (x: number) => x <= end
  const slotsBottom = PAD.desk + layout.axis.y
  const bounds = { ...marks.bounds, x1: end }
  return {
    ...marks,
    rules: marks.rules.filter((rule) => inside(rule.x0)).map((rule) => ({ ...rule, x1: Math.min(rule.x1, end) })),
    inks: marks.inks.filter((ink) => inside(ink.x0)).map((ink) => ({ ...ink, x1: Math.min(ink.x1, end) })),
    // At this size a slab's word does not fit: the CPU row and the last slot are named, in the label column's room, and the axis keeps its
    // numbers. The contact shadows would only darken the paper between the slabs: the slabs stand on their baked occlusion alone.
    boxes: marks.boxes.map((box) => ({ ...box, shadow: false })),
    labels: [
      ...marks.labels.filter((label) => (label.kind === 'tick' && inside(label.at[0])) || label.kind === 'now'),
      { id: 'scale/row/cpu', at: [PAD.desk + 4, 0, PAD.desk + (layout.rows[0]?.y ?? 0) + 24], text: LANE_WORDS.cpuShort, kind: 'row', place: 'right' },
      { id: 'scale/row/last', at: [PAD.desk + 4, 0, slotsBottom - 8], text: LANE_WORDS.slot(SCALE_SLOTS - 1), kind: 'row', place: 'right' },
      caption(bounds, `Scale: ${SCALE_SLOTS} slots for ${SCALE_STEPS} steps · synthetic ticks`),
    ],
    bounds,
    plates: platesOf(bounds, PAD.desk),
  }
}

/** The line that says what a camera of the model's own runs shows: under the plate's near edge, at its left. */
function caption(bounds: FlatModel['bounds'], text: string): FlatLabel {
  return { id: 'caption', at: [bounds.x0, 0, bounds.z1 + PAD.desk * 2], text, kind: 'caption', place: 'right' }
}
