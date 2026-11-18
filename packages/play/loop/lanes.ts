/**
 * The step loop's lanes on the demo levels (docs/REDESIGN.md §2.9, §3.1): a pure function from the loop's view to positioned boxes,
 * the timing diagram an engineer reads in a profiler. It replaced the kitchen drawn through a camera, and the
 * 2D diagram, the poster and the 3D scene's Side camera all draw it, so a tick has the same x in each (§2.1, P7).
 *
 * Its start was the scene kit's specimen (src/scene/specimen-layout.ts): spans on a time track from the model's own run, a slab per
 * forward with a box for each slot on it, and a hollow box where the GPU waits on the CPU. Here it is flat and in CSS pixels:
 *
 *   - the waiting queue, a row of request chips over the lanes;
 *   - a label column, then the time track, on which x is affine in ticks: `xOf(t) = trackX + (t - start) × pxPerTick`;
 *   - one CPU row with the engine core thread's phases (`schedule`, `sync`, and on other cards `prepare`, `launch`, `sample`);
 *   - one GPU row per batch slot. Each forward draws one slab on every slot row: the request it ran for, a ghost token, or a slot the
 *     GPU paid for and nothing used. Each slot's label holds the request in it now, or reads empty;
 *   - an idle box over the GPU rows wherever they wait between two forwards, as wide as the gap, which is the CPU's work in it when
 *     async scheduling is off; and an open one from the latest forward's end to now, while the GPU waits on the CPU;
 *   - a dimension line across every closed idle box, with end ticks and its value ("bubble 3 ticks"), as an engineering drawing marks
 *     an interval;
 *   - the now cursor at the CPU's clock, and the axis in ticks.
 *
 * The scale is fixed: the track shows `windowTicks` ticks, and once now passes three quarters of it the window slides, so now stays in
 * view with room after it. Nothing here measures text or reads a screen, so the same view gives the same layout in Bun and in every
 * browser. Every tick is the synthetic world's (D-048), and the screens say so.
 */
import type { Us } from '@es/sim/core'
import type { Span, SpanKind } from '@es/sim/steploop'
import type { FireView, KitchenView, PlaceView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Input and geometry                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the lanes read of a view: the demo levels' `LoopView` and the full levels' view both have it. */
export interface LaneSource {
  readonly slots: number
  /** The CPU's clock: the now cursor stands here. */
  readonly clockUs: Us
  /** Requests waiting, by id, in arrival order. */
  readonly waiting: readonly number[]
  /** The request in each slot now, or null. */
  readonly rail: readonly { readonly req: number | null }[]
  readonly cpu: readonly Span[]
  readonly fires: readonly FireView[]
}

/** The box the lanes are laid out in, in CSS px. */
export interface LaneGeometry {
  /** The whole width: the label column and the track. */
  readonly width: number
  readonly labelWidth: number
  /** The waiting queue's row, and the gap under it. */
  readonly queueHeight: number
  readonly queueGap: number
  readonly chipWidth: number
  readonly chipGap: number
  /** The lanes' region under the queue, the axis included: the CPU row, the slot rows and the axis share it. */
  readonly lanesHeight: number
  readonly cpuHeight: number
  /** A slot row's height when the slots fit at it; with more slots the rows share what is left. */
  readonly slotHeight: number
  readonly axisHeight: number
  /** Ticks across the track. */
  readonly windowTicks: number
  /** The least room between two axis labels. */
  readonly axisLabelGap: number
}

/**
 * The instrument at 1440 x 900 (§3.1): a 164 px label column and a 660 px track, the queue at 56 px, then the lanes in 336 px with
 * the CPU row at 56 and each slot at 44, and an axis of 28 ticks [estimated: the brief's design parameters].
 */
export const DESK: LaneGeometry = {
  width: 824,
  labelWidth: 164,
  queueHeight: 56,
  queueGap: 16,
  chipWidth: 64,
  chipGap: 8,
  lanesHeight: 336,
  cpuHeight: 56,
  slotHeight: 44,
  axisHeight: 24,
  windowTicks: 28,
  axisLabelGap: 40,
}

/** The instrument at 390 x 844 (§3.1): a 72 px label column in 358 px, the CPU row at 36 and each slot at 32 [estimated]. */
export const PHONE: LaneGeometry = {
  width: 358,
  labelWidth: 72,
  queueHeight: 44,
  queueGap: 12,
  chipWidth: 52,
  chipGap: 6,
  lanesHeight: 192,
  cpuHeight: 36,
  slotHeight: 32,
  axisHeight: 20,
  windowTicks: 16,
  axisLabelGap: 32,
}

/**
 * The diagram inside the instrument frame on `/play/loop` at 1440 x 900 (REDESIGN §3.5: the diagram's box is y 216 to 760): the desk's
 * label column, queue and axis, with the slot rows grown to fill the taller box [estimated: 64 px a slot fills it with the legend under it].
 */
export const FRAME_DESK: LaneGeometry = { ...DESK, slotHeight: 64 }

/**
 * The diagram inside the frame at 390 x 844, where the dock is pinned under it and the diagram's box is about 230 px tall: an 84 px label
 * column, the queue at 40 px, and the lanes in 150 (the CPU row at 28, each slot at 26, the axis at 18), over 28 ticks that scroll
 * sideways [estimated: the brief's phone geometry, compacted to the frame's box].
 */
export const FRAME_PHONE: LaneGeometry = {
  width: 358,
  labelWidth: 84,
  queueHeight: 40,
  queueGap: 6,
  chipWidth: 48,
  chipGap: 6,
  lanesHeight: 150,
  cpuHeight: 28,
  slotHeight: 26,
  axisHeight: 18,
  windowTicks: 28,
  axisLabelGap: 32,
}

/**
 * The compact view a lesson's dock draws (REDESIGN §2.6, §3.4): the same lanes at 464 x 240, the queue at 32 px over a 200 px lane
 * region (the CPU row at 32, each of four slots at 36, the axis at 20) [estimated: the brief's dock size, split by eye].
 */
export const DOCK: LaneGeometry = {
  width: 464,
  labelWidth: 96,
  queueHeight: 32,
  queueGap: 8,
  chipWidth: 40,
  chipGap: 4,
  lanesHeight: 200,
  cpuHeight: 32,
  slotHeight: 36,
  axisHeight: 20,
  windowTicks: 24,
  axisLabelGap: 32,
}

/**
 * The narrowest a tick is drawn [estimated]: a track whose box would draw a tick narrower than this is laid out wider than the box, and
 * the box scrolls sideways (REDESIGN §3.1 at 360: "the track scrolls sideways inside its box and keeps now in view"). 15 px, and not 16, so that a
 * phone 390 px wide, whose room the callout discs' gutter took 24 px of, still draws the whole axis to its last number instead of cutting it.
 */
export const MIN_PX_PER_TICK = 15

/** A geometry fitted to the room a page has: the width it is given, or wider where a tick would fall under `MIN_PX_PER_TICK`. */
export function fitGeometry(base: LaneGeometry, width: number): LaneGeometry {
  const least = base.labelWidth + base.windowTicks * MIN_PX_PER_TICK
  return { ...base, width: Math.max(Math.floor(width), least) }
}

/** A slot row shorter than this carries no label of its own: every k-th row is labelled instead [estimated]. */
export const MIN_LABELLED_ROW = 16

/** The words on the lanes, in the engine's terms (§2.7). */
export const LANE_WORDS = {
  queue: 'Waiting queue',
  cpu: 'CPU · engine core thread',
  /** The CPU row's name where the label column is narrow. */
  cpuShort: 'CPU',
  slot: (slot: number) => `slot ${slot + 1}`,
  empty: 'empty',
  idle: 'idle',
  /** A closed idle box's dimension: "bubble 3 ticks", and shorter where the box is narrow. */
  bubble: (ticks: number) => `bubble ${ticks} ${ticks === 1 ? 'tick' : 'ticks'}`,
  ticks: (ticks: number) => `${ticks} ${ticks === 1 ? 'tick' : 'ticks'}`,
  /** What a slab on a slot row carried, where it was not a request's token. */
  ghost: 'ghost',
  axis: 'synthetic ticks',
  now: 'now',
} as const

/** A request's name on screen: R1 is request 0. */
export const requestName = (req: number): string => `R${req + 1}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Output                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The time track's scale: x is affine in ticks. */
export interface TimeScale {
  /** The first tick on the track, and the last. */
  readonly start: Us
  readonly end: Us
  /** The track's left edge and width, in px. */
  readonly x: number
  readonly width: number
  readonly pxPerTick: number
}

/** The x of tick `t` on a scale. */
export const xOf = (scale: TimeScale, t: number): number => scale.x + (t - scale.start) * scale.pxPerTick

export interface LaneRow {
  /** `cpu`, or `slot-<n>` from 0. */
  readonly id: string
  readonly lane: 'cpu' | 'gpu'
  readonly slot: number | null
  readonly y: number
  readonly height: number
  /** The label cell's text, or null on a row too short to carry one. */
  readonly label: string | null
  /** On a slot row: the request in the slot now, or null for an empty slot. */
  readonly req: number | null
}

export interface QueueChip {
  readonly req: number
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** What a forward's slab on one slot row carried: a useful token, a ghost token (the request had ended), or nothing. */
export type SlabUse = 'token' | 'ghost' | 'empty'

export interface LaneSlab {
  readonly id: string
  readonly row: string
  readonly kind: SpanKind
  readonly step: number
  readonly startUs: Us
  readonly endUs: Us
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Cut at the track's left edge: it began before the window. */
  readonly clipped: boolean
  /** On a slot row. */
  readonly use?: SlabUse
  readonly req?: number | null
  /** A forward whose tokens the CPU has not read back yet. */
  readonly inFlight?: boolean
}

/** A stretch where the GPU rows wait: a dashed box over every slot row. */
export interface IdleBox {
  readonly id: string
  readonly startUs: Us
  readonly endUs: Us
  readonly ticks: Us
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** The step whose forward ends it, or null while the GPU still waits (from the latest forward's end to now). */
  readonly before: number | null
  readonly clipped: boolean
}

/**
 * A dimension line across a closed idle box: end ticks at its two edges and its value on the line, as an engineering drawing marks an
 * interval (REDESIGN §2.8, "Dimension lines"). It stands at the middle of the GPU rows, which the box leaves empty.
 */
export interface Dimension {
  readonly id: string
  readonly x0: number
  readonly x1: number
  readonly y: number
  readonly ticks: Us
  readonly label: string
}

export interface AxisTick {
  readonly t: Us
  readonly x: number
}

export interface LaneLayout {
  readonly geometry: LaneGeometry
  readonly scale: TimeScale
  readonly height: number
  readonly queue: { readonly y: number; readonly height: number; readonly chips: readonly QueueChip[]; readonly more: number }
  readonly rows: readonly LaneRow[]
  readonly slabs: readonly LaneSlab[]
  readonly idle: readonly IdleBox[]
  readonly dims: readonly Dimension[]
  readonly now: { readonly t: Us; readonly x: number; readonly y0: number; readonly y1: number }
  readonly axis: { readonly y: number; readonly step: number; readonly ticks: readonly AxisTick[] }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The layout                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The window's first tick: 0 until now passes three quarters of the window, then sliding with now. */
export function windowStart(now: Us, windowTicks: number): Us {
  return Math.max(0, now - Math.floor((windowTicks * 3) / 4))
}

/** The smallest axis step, from 1, 2, 5, 10, 20, 50 and on, whose labels stand at least `gap` px apart. */
export function axisStep(pxPerTick: number, gap: number): number {
  for (let decade = 1; ; decade *= 10) {
    for (const m of [1, 2, 5]) if (m * decade * pxPerTick >= gap) return m * decade
  }
}

const useOf = (place: PlaceView | undefined): SlabUse => (place === undefined || place.state === 'empty' ? 'empty' : place.state === 'binned' ? 'ghost' : 'token')

export function laneLayout(source: LaneSource, geometry: LaneGeometry = DESK, visibleTrack?: number): LaneLayout {
  const g = geometry
  if (!Number.isInteger(source.slots) || source.slots < 1) throw new RangeError(`a step loop has at least one slot, not ${source.slots}`)

  // The scale.
  const now = source.clockUs
  const start = windowStart(now, g.windowTicks)
  const trackX = g.labelWidth
  const trackWidth = g.width - g.labelWidth
  const scale: TimeScale = { start, end: start + g.windowTicks, x: trackX, width: trackWidth, pxPerTick: trackWidth / g.windowTicks }

  // The queue: as many chips as fit across the track, and a count of the rest. A track that scrolls inside a narrower box (a phone) passes
  // the width that shows (`visibleTrack`): the chips are counted across that, with one place kept for the count, so that no chip stands cut
  // at the box's edge with nothing to say that more are waiting.
  const shows = Math.min(trackWidth, visibleTrack ?? trackWidth)
  let fit = Math.max(0, Math.floor((shows + g.chipGap) / (g.chipWidth + g.chipGap)))
  if (shows < trackWidth && source.waiting.length > fit && fit > 1) fit -= 1
  const shown = source.waiting.slice(0, fit)
  const chips: QueueChip[] = shown.map((req, i) => ({ req, label: requestName(req), x: trackX + i * (g.chipWidth + g.chipGap), y: 0, width: g.chipWidth, height: g.queueHeight }))

  // The rows: the CPU's, then one per slot, sharing what the CPU row and the axis leave when the slots do not fit at full height.
  const lanesY = g.queueHeight + g.queueGap
  const room = g.lanesHeight - g.cpuHeight - g.axisHeight
  const slotHeight = Math.min(g.slotHeight, room / source.slots)
  const every = slotHeight >= MIN_LABELLED_ROW ? 1 : Math.ceil(MIN_LABELLED_ROW / slotHeight)
  const rows: LaneRow[] = [{ id: 'cpu', lane: 'cpu', slot: null, y: lanesY, height: g.cpuHeight, label: LANE_WORDS.cpu, req: null }]
  const gpuY = lanesY + g.cpuHeight
  for (let slot = 0; slot < source.slots; slot++) {
    const req = source.rail[slot]?.req ?? null
    const label = slot % every === 0 ? `${LANE_WORDS.slot(slot)} · ${req === null ? LANE_WORDS.empty : requestName(req)}` : null
    rows.push({ id: `slot-${slot}`, lane: 'gpu', slot, y: gpuY + slot * slotHeight, height: slotHeight, label, req })
  }
  const gpuBottom = gpuY + source.slots * slotHeight

  // A span on the track, cut at its left edge; null when it ends before the window.
  const place = (from: Us, to: Us): { x: number; width: number; clipped: boolean } | null => {
    if (to <= start) return null
    const a = Math.max(from, start)
    return { x: xOf(scale, a), width: (to - a) * scale.pxPerTick, clipped: from < start }
  }

  const slabs: LaneSlab[] = []
  for (const span of source.cpu) {
    const at = place(span.startUs, span.endUs)
    if (at === null) continue
    slabs.push({ id: `cpu/${span.step}/${span.kind}`, row: 'cpu', kind: span.kind, step: span.step, startUs: span.startUs, endUs: span.endUs, y: lanesY, height: g.cpuHeight, ...at })
  }
  for (const fire of source.fires) {
    const at = place(fire.startUs, fire.endUs)
    if (at === null) continue
    for (let slot = 0; slot < source.slots; slot++) {
      const placeView = fire.places[slot]
      slabs.push({
        id: `slot-${slot}/${fire.index}`,
        row: `slot-${slot}`,
        kind: 'forward',
        step: fire.index,
        startUs: fire.startUs,
        endUs: fire.endUs,
        y: gpuY + slot * slotHeight,
        height: slotHeight,
        ...at,
        use: useOf(placeView),
        req: placeView?.req ?? null,
        inFlight: fire.onLine,
      })
    }
  }

  // Idle: every gap between two forwards, and the GPU's wait from the latest forward's end to now.
  const idle: IdleBox[] = []
  const gap = (from: Us, to: Us, before: number | null) => {
    if (to <= from) return
    const at = place(from, to)
    if (at === null) return
    idle.push({ id: before === null ? 'idle/now' : `idle/${before}`, startUs: from, endUs: to, ticks: to - from, y: gpuY, height: gpuBottom - gpuY, before, ...at })
  }
  for (let i = 1; i < source.fires.length; i++) gap(source.fires[i - 1].endUs, source.fires[i].startUs, source.fires[i].index)
  const last = source.fires[source.fires.length - 1]
  if (last !== undefined) gap(last.endUs, now, null)

  // A dimension line across each closed idle box: the bubble's width, in ticks. Its end ticks stand at the box's edges, the left one cut at
  // the track's edge where the box began before the window.
  const midY = gpuY + (gpuBottom - gpuY) / 2
  const dims: Dimension[] = idle
    .filter((box) => box.before !== null)
    .map((box) => ({ id: `dim/${box.before}`, x0: box.x, x1: box.x + box.width, y: midY, ticks: box.ticks, label: LANE_WORDS.bubble(box.ticks) }))

  // The axis.
  const step = axisStep(scale.pxPerTick, g.axisLabelGap)
  const ticks: AxisTick[] = []
  for (let t = Math.ceil(start / step) * step; t <= scale.end; t += step) ticks.push({ t, x: xOf(scale, t) })

  return {
    geometry: g,
    scale,
    height: gpuBottom + g.axisHeight,
    queue: { y: 0, height: g.queueHeight, chips, more: source.waiting.length - shown.length },
    rows,
    slabs,
    idle,
    dims,
    now: { t: now, x: xOf(scale, Math.min(now, scale.end)), y0: lanesY, y1: gpuBottom },
    axis: { y: gpuBottom, step, ticks },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The state table's window                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Ticks the state table lists step by step before it sums the older steps in one row [estimated]: the window the front page's table has always
 * used, so the table reads the same on every page.
 */
export const TABLE_TICKS = 76

/** The steps the state table lists one by one, and how many older ones it sums. */
export interface StepsWindow {
  readonly startUs: Us
  readonly windowTicks: number
  /** The steps with any part inside the window, oldest first. */
  readonly fires: readonly FireView[]
  /** The CPU's spans inside the window. */
  readonly cpu: readonly Span[]
  /** Steps older than the window: summed in one row. */
  readonly hidden: number
}

/**
 * The last part of the run, which the state table lists step by step. While the run fits it starts at 0. After that it starts at the
 * `schedule` of the oldest step that still lets the run end inside the window, so it moves by whole steps and never cuts one in half; a step
 * on the GPU whose forward runs into the window from before it is kept.
 */
export function stepsWindow(view: Pick<KitchenView, 'clockUs' | 'fires' | 'cpu'>, windowTicks: number): StepsWindow {
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
