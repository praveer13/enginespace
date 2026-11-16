/*
 * The step loop's 3D time track, laid out (REDESIGN §2.8, §2.9): the timing diagram of packages/play/loop/lanes.ts, turned into the flat
 * model that src/scene/FlatTrack.tsx draws. Pure, with no three in it: the scene, the tests and the cameras read it.
 *
 * The diagram is laid flat on a base plate, in its own pixels (flat-track.ts): x is the diagram's x, z its y, so the Side camera, looking
 * straight down on the plate, draws every tick where the 2D diagram draws it (P7). On it:
 *   - the waiting queue's chips, paper tiles a pick admits;
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
import { FRAME_DESK, FRAME_PHONE, fitGeometry, LANE_WORDS, laneLayout, type LaneGeometry, type LaneLayout, type LaneSource } from '@es/play/loop/lanes'
import type { FireView, PlaceView } from '@es/play/loop/types'
import { EMPTY_MODEL, type FlatBox, type FlatLabel, type FlatModel, type FlatSegment } from '@/scene/flat-track'
import { LONG_NIGHT_FIRES, specimenRun } from '@/scene/specimen-layout'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Heights and margins                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How far each kind of mark stands off the paper, in the diagram's px [estimated, set by eye in Lifted]. */
export const RISE = { cpu: 18, slot: 13, chip: 6, wire: 13, cursor: 26, plate: 10 } as const

/** The figure's padding round the lanes, in px: the 2D view's (View2D.tsx), so the Side camera puts a tick where the 2D view does. */
export const PAD = { desk: 12, phone: 8 } as const
/** Below this canvas width the track takes the phone's geometry: the 2D view's own breakpoint (View2D.tsx). */
export const NARROW = 560
/** The rise over the lanes that the now cursor's word takes, in px: the 2D view's head room. */
const HEAD = 14

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
  /** Draw the waiting queue's chips. */
  readonly queue?: boolean
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

  // The waiting queue: a paper tile per chip, which a pick admits, and the row's name.
  if (options.queue !== false) {
    if (options.rowLabels !== false) labels.push({ id: `${p}row/queue`, at: [ox + 4, 0, oz + g.queueHeight / 2], text: LANE_WORDS.queue, kind: 'row', place: 'right' })
    for (const chip of layout.queue.chips) {
      const h = Math.min(chip.height, 48)
      boxes.push({ id: `${p}chip/${chip.req}`, x0: ox + chip.x, x1: ox + chip.x + chip.width, z0: oz + chip.y + (chip.height - h) / 2, z1: oz + chip.y + (chip.height + h) / 2, height: RISE.chip, role: 'paper', form: 'solid', pick: `req:${chip.req}` })
      labels.push({ id: `${p}chip/${chip.req}`, at: [ox + chip.x + chip.width / 2, RISE.chip, oz + chip.y + chip.height / 2], text: chip.label, kind: 'chip' })
    }
  }

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
      boxes.push({ id: `${p}${slab.id}`, x0, x1, z0: oz + slab.y + 1, z1: oz + slab.y + slab.height - 1, height: RISE.cpu, role: slab.kind === 'sync' ? 'lane-sync' : 'lane-cpu', form: 'solid' })
      if (fits(slab.kind, slab.width) && slab.height >= 14) labels.push({ id: `${p}${slab.id}`, at: [x0 - 1, RISE.cpu, oz + slab.y + slab.height / 2], text: slab.kind, kind: 'slab', place: 'right' })
      continue
    }
    const inset = options.tight ? 0 : Math.min(2, slab.height / 6)
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
    if (fits(LANE_WORDS.idle, box.width)) labels.push({ id: `${p}${box.id}`, at: [x0 - 1, RISE.wire, oz + box.y + 10], text: LANE_WORDS.idle, kind: 'idle', place: 'right' })
  }
  for (const dim of layout.dims) {
    const z = oz + dim.y
    const x0 = ox + dim.x0
    const x1 = ox + dim.x1
    inks.push({ x0, z0: z, x1, z1: z, y: RISE.wire }, { x0, z0: z - 5, x1: x0, z1: z + 5, y: RISE.wire }, { x0: x1, z0: z - 5, x1, z1: z + 5, y: RISE.wire })
    labels.push({ id: `${p}${dim.id}`, at: [(x0 + x1) / 2, RISE.wire, z - 3], text: fits(dim.label, x1 - x0) ? dim.label : LANE_WORDS.ticks(dim.ticks), kind: 'dim', place: 'above' })
  }

  // The axis: its line, a tick and a number at each step, and its unit in the label column.
  inks.push({ x0: ox + scale.x, z0: oz + axisY, x1: ox + scale.x + scale.width, z1: oz + axisY, y: 0 })
  for (const tick of layout.axis.ticks) {
    inks.push({ x0: ox + tick.x, z0: oz + axisY, x1: ox + tick.x, z1: oz + axisY + 6, y: 0 })
    labels.push({ id: `${p}tick/${tick.t}`, at: [ox + tick.x, 0, oz + axisY + 6], text: String(tick.t), kind: 'tick', place: 'below' })
  }
  if (options.rowLabels !== false) labels.push({ id: `${p}axis`, at: [ox + 4, 0, oz + axisY + g.axisHeight / 2], text: LANE_WORDS.axis, kind: 'axis', place: 'right' })

  // Now: the amber sheet across the lanes, and its word over it.
  const cursors = [{ id: `${p}now`, x: ox + layout.now.x, z0: oz + layout.now.y0 - HEAD / 2, z1: oz + layout.now.y1, height: RISE.cursor }]
  labels.push({ id: `${p}now`, at: [ox + layout.now.x, RISE.cursor, oz + layout.now.y0 - HEAD / 2], text: LANE_WORDS.now, kind: 'now', place: 'above' })

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

/**
 * The learner's run on the demo levels as the 3D track: the 2D view's diagram, at the 2D view's geometry for a canvas this wide.
 *
 * With `reference`, the reference run's tokens up to the learner's now stand on the same plate as ink outlines at a token's height (REDESIGN
 * §2.6, "you against the reference, drawn"): where the learner's slab fills one, the outline is inside the solid and does not show; where
 * the learner left a slot empty or a step late, the hollow box stands in the gap. That is the job depth does here.
 */
export function demoTrack(source: LaneSource, canvasWidth: number, reference?: LaneSource): FlatModel {
  const { geometry, pad, narrow } = trackGeometry(canvasWidth)
  const layout = laneLayout(source, geometry)
  const marks = diagramModel(layout, { x: pad, z: pad, narrow })
  const outlines = reference === undefined ? [] : referenceOutlines(laneLayout(referenceUntil(reference, source.clockUs), geometry), pad)
  return {
    ...marks,
    inks: [...marks.inks, ...outlines],
    labels: outlines.length === 0 ? marks.labels : [...marks.labels, { id: 'reference', at: [marks.bounds.x0, 0, marks.bounds.z1 + pad * 2], text: REFERENCE_WORDS, kind: 'caption', place: 'right', minWidth: NARROW }],
    plates: platesOf(marks.bounds, pad),
  }
}

/** What the outlines are, in the caption under the plate. */
export const REFERENCE_WORDS = 'Outlines: the reference run’s tokens by now'

/** The reference run as far as the learner's now: its forwards and calls cut at that clock, with nothing waiting and nothing to admit. */
export function referenceUntil(reference: LaneSource, untilUs: Us): LaneSource {
  return {
    ...reference,
    clockUs: untilUs,
    waiting: [],
    cpu: [],
    fires: reference.fires.filter((fire) => fire.startUs < untilUs).map((fire) => ({ ...fire, endUs: Math.min(fire.endUs, untilUs) })),
  }
}

/** A token slab's outline at a slab's height: the four edges of its top and its four uprights, in the ink's solid line. */
function referenceOutlines(layout: LaneLayout, pad: number): FlatSegment[] {
  const out: FlatSegment[] = []
  const y = RISE.slot
  for (const slab of layout.slabs) {
    if (slab.row === 'cpu' || slab.use !== 'token') continue
    const x0 = pad + slab.x + 1.5
    const x1 = pad + slab.x + slab.width - 1.5
    const inset = Math.min(2, slab.height / 6) + 1
    const z0 = pad + slab.y + inset
    const z1 = pad + slab.y + slab.height - inset
    if (x1 <= x0 || z1 <= z0) continue
    out.push({ x0, z0, x1, z1: z0, y }, { x0: x1, z0, x1, z1, y }, { x0: x1, z0: z1, x1: x0, z1, y }, { x0, z0: z1, x1: x0, z1: z0, y })
    out.push({ x0, z0: z1, x1, z1, y: 0.5 })
  }
  return out
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
  const marks = diagramModel(layout, { x: PAD.desk, z, prefix, queue: false, rowLabels: false })
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
  const marks = diagramModel(layout, { x: PAD.desk, z: PAD.desk, prefix: 'scale/', queue: false, rowLabels: false, tight: true })
  const end = PAD.desk + layout.now.x + 48
  const inside = (x: number) => x <= end
  const slotsBottom = PAD.desk + layout.axis.y
  const bounds = { ...marks.bounds, x1: end }
  return {
    ...marks,
    rules: marks.rules.filter((rule) => inside(rule.x0)).map((rule) => ({ ...rule, x1: Math.min(rule.x1, end) })),
    inks: marks.inks.filter((ink) => inside(ink.x0)).map((ink) => ({ ...ink, x1: Math.min(ink.x1, end) })),
    // At this size a slab's word does not fit: the CPU row and the last slot are named, and the axis keeps its numbers.
    // At this size the contact shadows would only darken the paper between the slabs: the slabs stand on their baked occlusion alone.
    boxes: marks.boxes.map((box) => ({ ...box, shadow: false })),
    labels: [
      ...marks.labels.filter((label) => (label.kind === 'tick' && inside(label.at[0])) || label.kind === 'now'),
      { id: 'scale/row/cpu', at: [PAD.desk + 4, 0, PAD.desk + (layout.rows[0]?.y ?? 0) + 24], text: LANE_WORDS.cpu, kind: 'row', place: 'right' },
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
