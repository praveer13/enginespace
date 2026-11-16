/**
 * The step loop's lanes on the five full levels (`async`, `graphs`, `mrv2`, `close`, `mask`; docs/REDESIGN.md §3.7): a pure function from
 * the full view to positioned boxes, in microseconds of the model's clock. It is the full levels' timing diagram, as ../lanes.ts is the demo
 * levels', and every later view of these levels (the 2D diagram, the 3D scene's Side camera, a lesson's dock) is drawn from it, so a
 * microsecond has one x in each (P7).
 *
 * Rows, top to bottom:
 *   - the CPU row, the engine core thread: `schedule`, `prepare`, `launch`, `sync` and `sample` as labelled slabs, one per call. A launch is
 *     drawn by what it launched: eager launches as a comb of thin ticks, one per kernel call (at most one per two pixels, with the count
 *     carried whole), and a CUDA graph replay as one slab, "replay, size 8";
 *   - a copy row, only where the source has host and device copies (none of today's levels do: the row waits for a level that draws them);
 *   - one GPU row, "forward", with each step's slab carrying its batch size, and the padded part of a forward that ran at a captured size
 *     larger than its batch hatched and labelled "padding 3 of 8";
 *   - a thin strip under it, the slots live in each step against the batch's slots;
 *   - on `mask`, a grammar-mask row: the bitmask the engine thread fills for structured output, which the other levels never draw.
 * Idle on the GPU row is a dashed box between two forwards, as wide as the CPU's work that kept it waiting, with a dimension line and its
 * value ("bubble 764 µs"), and an open box from the latest forward to now while the GPU still waits.
 *
 * The scale is fixed for a night: the track shows a window of the first step's length times `STEPS_SHOWN`, and slides once now passes four
 * fifths of it, so the last three steps stay in view. `fit` lays the whole run out instead ("Fit run"). Nothing here measures text or reads
 * a screen: the same view gives the same layout in Bun and in every browser.
 */
import type { Us } from '@es/sim/core'
import type { Span, SpanKind } from '@es/sim/steploop'
import { axisStep } from '../lanes'
import type { PlaceView } from '../types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Input and geometry                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A step as the full lanes read it: the full levels' `FullFire` has all of it. */
export interface FullLaneFire {
  readonly index: number
  readonly startUs: Us
  readonly endUs: Us
  readonly places: readonly PlaceView[]
  /** Places of the captured size that hold nothing: padded tokens. */
  readonly padded: number
  /** The captured size the step replayed, or null when no graph replayed. */
  readonly mold: number | null
  readonly mode: 'FULL' | 'PIECEWISE' | 'NONE'
  /** Calls the step's launch made: one replay for a full graph, the pieces and the attention launches for piecewise, every kernel eagerly. */
  readonly calls: number
  readonly onLine: boolean
}

/** What the full lanes read of a view: the full levels' `FullView` has it. */
export interface FullLaneSource {
  readonly slots: number
  readonly clockUs: Us
  /** The engine core thread's spans, the grammar mask's among them. */
  readonly cpu: readonly Span[]
  readonly fires: readonly FullLaneFire[]
  /** Host-to-device and device-to-host copies, where a level draws them. */
  readonly copies?: readonly CopySpan[]
}

export interface CopySpan {
  readonly step: number
  readonly dir: 'h2d' | 'd2h'
  readonly startUs: Us
  readonly endUs: Us
}

export interface FullLaneGeometry {
  readonly width: number
  readonly labelWidth: number
  readonly cpuHeight: number
  readonly copyHeight: number
  readonly forwardHeight: number
  /** The slots-live strip under the forward row. */
  readonly liveHeight: number
  readonly maskHeight: number
  readonly axisHeight: number
  readonly axisLabelGap: number
}

/** The diagram at 1440 x 900 (REDESIGN §3.7: x 48 to 944, a 164 px label column) [estimated: the brief's design parameters]. */
export const FULL_DESK: FullLaneGeometry = {
  width: 896,
  labelWidth: 164,
  cpuHeight: 56,
  copyHeight: 32,
  forwardHeight: 64,
  liveHeight: 16,
  maskHeight: 32,
  axisHeight: 24,
  axisLabelGap: 64,
}

/** The diagram at 390 x 844: a 72 px label column in 358 px [estimated]. */
export const FULL_PHONE: FullLaneGeometry = {
  width: 358,
  labelWidth: 72,
  cpuHeight: 40,
  copyHeight: 24,
  forwardHeight: 44,
  liveHeight: 12,
  maskHeight: 24,
  axisHeight: 20,
  axisLabelGap: 48,
}

/** Steps the window holds at its fixed scale (REDESIGN §3.7: "the last three steps at a fixed scale"), with room after now [estimated]. */
export const STEPS_SHOWN = 4
/** Where now stands before the window slides: four fifths of the way across [estimated]. */
export const NOW_AT = 0.8
/** The least room between two launch ticks in a comb, in px: a denser comb draws every k-th call and carries the count [estimated]. */
export const MIN_TICK_GAP = 2

/** The words on the full lanes, in the engine's terms (§2.7). Identifiers are spelled as the pinned source spells them. */
export const FULL_LANE_WORDS = {
  cpu: 'CPU · engine core thread',
  copy: 'Copies, host and GPU',
  forward: 'GPU · forward',
  live: 'slots live',
  mask: 'Grammar mask',
  idle: 'idle',
  bubble: (us: number) => `bubble ${us} µs`,
  batch: (rows: number) => `batch ${rows}`,
  replay: (size: number) => `replay, size ${size}`,
  launches: (calls: number) => `${calls} ${calls === 1 ? 'launch' : 'launches'}`,
  padding: (padded: number, size: number) => `padding ${padded} of ${size}`,
  liveOf: (live: number, slots: number) => `slots live ${live} of ${slots}`,
  axis: 'µs, model clock',
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* Output                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface FullScale {
  readonly start: Us
  readonly end: Us
  readonly x: number
  readonly width: number
  readonly pxPerUs: number
}

/** The x of microsecond `t` on a scale: affine, one microsecond is one x on every row. */
export const xOfUs = (scale: FullScale, t: number): number => scale.x + (t - scale.start) * scale.pxPerUs

export type FullRowId = 'cpu' | 'copy' | 'forward' | 'live' | 'mask'

export interface FullRow {
  readonly id: FullRowId
  readonly y: number
  readonly height: number
  readonly label: string
}

/** The kinds of mark on the full lanes. Eager launches, a graph replay and padding are three, never one drawn three ways. */
export type FullMarkKind = 'call' | 'eager' | 'replay' | 'mask' | 'copy' | 'forward' | 'padding' | 'live'

interface Placed {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Cut at the track's left edge: it began before the window. */
  readonly clipped: boolean
}

export interface FullMark extends Placed {
  readonly id: string
  readonly row: FullRowId
  readonly kind: FullMarkKind
  readonly step: number
  readonly startUs: Us
  readonly endUs: Us
  /** The words on the mark, or null for a mark that carries none (a call too short to name is still drawn). */
  readonly label: string | null
  /** A CPU call's span kind. */
  readonly call?: SpanKind
  /** `eager`: the calls the launch made, and the x of each tick drawn (every k-th call where they would crowd). */
  readonly calls?: number
  readonly ticks?: readonly number[]
  /** `forward` and `live`: the rows that held a request, and the batch's slots. */
  readonly rows?: number
  readonly slots?: number
  /** `padding`: the padded places, and the captured size they pad up to. */
  readonly padded?: number
  readonly size?: number
  /** `forward`: its tokens are not read back yet. */
  readonly inFlight?: boolean
  readonly dir?: 'h2d' | 'd2h'
}

export interface FullIdle extends Placed {
  readonly id: string
  readonly startUs: Us
  readonly endUs: Us
  readonly us: Us
  /** The step whose forward ends it, or null while the GPU still waits. */
  readonly before: number | null
}

export interface FullDimension {
  readonly id: string
  readonly x0: number
  readonly x1: number
  readonly y: number
  readonly us: Us
  readonly label: string
}

export interface FullLaneLayout {
  readonly geometry: FullLaneGeometry
  readonly scale: FullScale
  readonly height: number
  readonly rows: readonly FullRow[]
  readonly marks: readonly FullMark[]
  readonly idle: readonly FullIdle[]
  readonly dims: readonly FullDimension[]
  readonly now: { readonly t: Us; readonly x: number; readonly y0: number; readonly y1: number }
  readonly axis: { readonly y: number; readonly step: number; readonly ticks: readonly { readonly t: Us; readonly x: number }[] }
}

export interface FullLaneOptions {
  /** Lay the whole run out ("Fit run"), instead of the last steps at the night's fixed scale. */
  readonly fit?: boolean
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The layout                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The first step's length, from its first CPU call to its forward's end: the night's unit, which fixes the scale. Its read-back is left
 * out, because it lands only when the next step is rung, and the unit must not move once the first step has run. Null before then.
 */
export function firstStepUs(source: FullLaneSource): Us | null {
  const fire = source.fires[0]
  if (fire === undefined) return null
  const calls = source.cpu.filter((span) => span.step === fire.index && span.startUs <= fire.startUs)
  const from = Math.min(fire.startUs, ...calls.map((span) => span.startUs))
  return Math.max(1, fire.endUs - from)
}

/** The window's length and its first microsecond for a source. */
export function fullWindow(source: FullLaneSource, options: FullLaneOptions = {}): { start: Us; length: Us } {
  const now = source.clockUs
  if (options.fit === true) return { start: 0, length: Math.max(1, now) }
  const unit = firstStepUs(source)
  const length = unit === null ? Math.max(1, now) : unit * STEPS_SHOWN
  return { start: Math.max(0, now - Math.floor(length * NOW_AT)), length }
}

const rowsOf = (fire: FullLaneFire): number => fire.places.filter((place) => place.state !== 'empty').length

export function fullLaneLayout(source: FullLaneSource, geometry: FullLaneGeometry = FULL_DESK, options: FullLaneOptions = {}): FullLaneLayout {
  const g = geometry
  if (!Number.isInteger(source.slots) || source.slots < 1) throw new RangeError(`a step loop has at least one slot, not ${source.slots}`)

  const now = source.clockUs
  const window = fullWindow(source, options)
  const trackX = g.labelWidth
  const trackWidth = g.width - g.labelWidth
  const scale: FullScale = { start: window.start, end: window.start + window.length, x: trackX, width: trackWidth, pxPerUs: trackWidth / window.length }

  // The rows: the copy row where there are copies, and the mask row where the engine thread fills a grammar mask.
  const hasCopies = (source.copies ?? []).length > 0
  const hasMask = source.cpu.some((span) => span.kind === 'mask')
  const rows: FullRow[] = []
  let y = 0
  const add = (id: FullRowId, height: number, label: string) => {
    rows.push({ id, y, height, label })
    y += height
  }
  add('cpu', g.cpuHeight, FULL_LANE_WORDS.cpu)
  if (hasCopies) add('copy', g.copyHeight, FULL_LANE_WORDS.copy)
  add('forward', g.forwardHeight, FULL_LANE_WORDS.forward)
  add('live', g.liveHeight, FULL_LANE_WORDS.live)
  if (hasMask) add('mask', g.maskHeight, FULL_LANE_WORDS.mask)
  const rowOf = (id: FullRowId): FullRow => rows.find((row) => row.id === id) as FullRow

  // A span on the track, cut at its left edge; null when it ends before the window or starts after it.
  const place = (from: Us, to: Us, row: FullRow): Placed | null => {
    if (to <= scale.start || from >= scale.end) return null
    const a = Math.max(from, scale.start)
    const b = Math.min(to, scale.end)
    return { x: xOfUs(scale, a), width: (b - a) * scale.pxPerUs, y: row.y, height: row.height, clipped: from < scale.start }
  }

  const fireOf = new Map(source.fires.map((fire) => [fire.index, fire]))
  const marks: FullMark[] = []

  // The CPU's calls. A launch is drawn by what it launched; the mask's span goes to its own row.
  for (const span of source.cpu) {
    const row = rowOf(span.kind === 'mask' ? 'mask' : 'cpu')
    const at = place(span.startUs, span.endUs, row)
    if (at === null) continue
    const base = { id: `${row.id}/${span.step}/${span.kind}`, row: row.id, step: span.step, startUs: span.startUs, endUs: span.endUs, call: span.kind, ...at }
    const fire = fireOf.get(span.step)
    if (span.kind === 'mask') {
      marks.push({ ...base, kind: 'mask', label: 'bitmask' })
    } else if (span.kind === 'launch' && fire !== undefined && fire.mode === 'FULL' && fire.mold !== null) {
      marks.push({ ...base, kind: 'replay', label: FULL_LANE_WORDS.replay(fire.mold) })
    } else if (span.kind === 'launch' && fire !== undefined && fire.calls > 1) {
      // A comb: one tick per call, evenly through the launch, thinned to every k-th where two would stand closer than MIN_TICK_GAP.
      const every = Math.max(1, Math.ceil((MIN_TICK_GAP * fire.calls) / Math.max(at.width, Number.EPSILON)))
      const ticks: number[] = []
      for (let call = 0; call < fire.calls; call += every) {
        const t = span.startUs + ((call + 0.5) * (span.endUs - span.startUs)) / fire.calls
        if (t >= scale.start && t <= scale.end) ticks.push(xOfUs(scale, t))
      }
      marks.push({ ...base, kind: 'eager', label: FULL_LANE_WORDS.launches(fire.calls), calls: fire.calls, ticks })
    } else {
      marks.push({ ...base, kind: 'call', label: span.kind })
    }
  }

  // The copies.
  if (hasCopies) {
    const row = rowOf('copy')
    for (const copy of source.copies ?? []) {
      const at = place(copy.startUs, copy.endUs, row)
      if (at === null) continue
      marks.push({ id: `copy/${copy.step}/${copy.dir}/${copy.startUs}`, row: 'copy', kind: 'copy', step: copy.step, startUs: copy.startUs, endUs: copy.endUs, label: copy.dir === 'h2d' ? 'host to GPU' : 'GPU to host', dir: copy.dir, ...at })
    }
  }

  // The forwards, the padding on the padded part of each, and the slots live under them.
  const forward = rowOf('forward')
  const live = rowOf('live')
  for (const fire of source.fires) {
    const at = place(fire.startUs, fire.endUs, forward)
    if (at === null) continue
    const rows = rowsOf(fire)
    marks.push({
      id: `forward/${fire.index}`,
      row: 'forward',
      kind: 'forward',
      step: fire.index,
      startUs: fire.startUs,
      endUs: fire.endUs,
      label: FULL_LANE_WORDS.batch(rows),
      rows,
      slots: source.slots,
      inFlight: fire.onLine,
      ...at,
    })
    if (fire.padded > 0 && fire.mold !== null && fire.mold > 0) {
      // The padded places' share of the forward, at its end: the captured size runs `mold` rows, `padded` of them hold nothing.
      const from = fire.endUs - ((fire.endUs - fire.startUs) * fire.padded) / fire.mold
      const pad = place(from, fire.endUs, forward)
      if (pad !== null) {
        marks.push({
          id: `padding/${fire.index}`,
          row: 'forward',
          kind: 'padding',
          step: fire.index,
          startUs: from,
          endUs: fire.endUs,
          label: FULL_LANE_WORDS.padding(fire.padded, fire.mold),
          padded: fire.padded,
          size: fire.mold,
          ...pad,
        })
      }
    }
    const strip = place(fire.startUs, fire.endUs, live)
    if (strip !== null) marks.push({ id: `live/${fire.index}`, row: 'live', kind: 'live', step: fire.index, startUs: fire.startUs, endUs: fire.endUs, label: FULL_LANE_WORDS.liveOf(rows, source.slots), rows, slots: source.slots, ...strip })
  }

  // Idle on the GPU row: each gap between two forwards, and the wait from the latest forward to now.
  const idle: FullIdle[] = []
  const gap = (from: Us, to: Us, before: number | null) => {
    if (to <= from) return
    const at = place(from, to, forward)
    if (at === null) return
    idle.push({ id: before === null ? 'idle/now' : `idle/${before}`, startUs: from, endUs: to, us: to - from, before, ...at })
  }
  for (let i = 1; i < source.fires.length; i++) gap(source.fires[i - 1].endUs, source.fires[i].startUs, source.fires[i].index)
  const last = source.fires[source.fires.length - 1]
  if (last !== undefined) gap(last.endUs, now, null)
  const dims: FullDimension[] = idle
    .filter((box) => box.before !== null)
    .map((box) => ({ id: `dim/${box.before}`, x0: box.x, x1: box.x + box.width, y: forward.y + forward.height / 2, us: box.us, label: FULL_LANE_WORDS.bubble(box.us) }))

  // The axis, in µs on nice steps.
  const height = y + g.axisHeight
  const step = axisStep(scale.pxPerUs, g.axisLabelGap)
  const ticks: { t: Us; x: number }[] = []
  for (let t = Math.ceil(scale.start / step) * step; t <= scale.end; t += step) ticks.push({ t, x: xOfUs(scale, t) })

  return {
    geometry: g,
    scale,
    height,
    rows,
    marks,
    idle,
    dims,
    now: { t: now, x: xOfUs(scale, Math.min(Math.max(now, scale.start), scale.end)), y0: 0, y1: y },
    axis: { y, step, ticks },
  }
}
