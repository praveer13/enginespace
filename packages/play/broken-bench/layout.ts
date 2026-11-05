/**
 * The Inspection's sheets (A§6.3, GAMES.md §11 "2D design", §2.6 "The Inspection"): the log drawn as the inspector would pencil it on
 * graph paper pinned to the pass. A view and some settings go in; positioned marks come out, and `sheetSvg` writes them as SVG. The 2D
 * view paints them, and the debrief draws the corrected benchmark on the same sheet with the same function.
 *
 * A mark is a rect, a line, a circle, a path or a piece of text, painted with a token role of src/design/tokens.ts and never a colour
 * (rule 9, D-047). A role becomes `var(--es-<role>)`, so the drawing changes with the design system and carries no literal colour or
 * face. tests/play/broken-bench-layout.test.ts checks that every role used exists.
 *
 * The drawing is the inspector's own work, not a chart (the finish review of W0 turned a chart away): graph paper with a fine grid, two
 * pins in its top corners, orders drawn as the slips they are, and masking-tape labels for what is named on it.
 *   - The `histogram` sheet is the whole log in one picture. Left, a dot for every order in the order it was due, high for slow, on a
 *     logarithmic ruler: a warm-up is a slope at the start, a stall is a spike. Right, the same orders counted into stacks of slips
 *     against the same ruler. Across both, the report's number on a tape flag, and (in practice) the p99 the desk reads. The cut is a
 *     dashed line, and orders the cut leaves out are drawn hollow.
 *   - The `timeline` sheet is a stretch of the log, one slip to an order, in the order they came: a hollow notch where the order was
 *     due, a solid stub where it was sent, the wait between them in the ribbon's red (the wait a stopwatch that starts at the send never
 *     sees), the wait in the server as a hollow bar, and the reply as a solid one. The stretch follows the selected order.
 * A state is a shape before it is a colour (WCAG 1.4.1): hollow against solid, dashed against plain. Ribbon red marks what the report
 * left out, amber marks the selected order and nothing else, and nothing here is coloured for decoration.
 *
 * Every number the drawing writes is a tick of a ruler or an order's number. Counts, times and the report's figures are DOM, in the
 * tail, the mirror and the controls.
 */
import type { Us } from '@es/sim/core'
import type { BenchRow } from '@es/sim/bench/types'
import { BIN_EDGES_US, DECADE_EDGES_US, binsOf, placeOf } from './desk'
import { countMarks, num } from './svg'
import type { SvgNode } from './svg'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Marks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The token roles the drawing paints with (src/design/tokens.ts). `none` is no paint. */
export type Paint =
  | 'none'
  | 'surface-2'
  | 'edge'
  | 'paper'
  | 'paper-ink'
  | 'paper-ink-2'
  | 'paper-rule'
  | 'lamp'
  | 'lamp-ring'
  | 'tape'
  | 'tape-ink'

/** The roles above, as a list, for the test that checks them against the design system. */
export const PAINTS: readonly Paint[] = ['surface-2', 'edge', 'paper', 'paper-ink', 'paper-ink-2', 'paper-rule', 'lamp', 'lamp-ring', 'tape', 'tape-ink']

/** The faces the drawing sets text in: the printer's dots for ticks and numbers, marker on masking tape for names. */
export type Face = 'numeric' | 'label'

interface Style {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly dash?: string
  readonly opacity?: number
}

export type Mark =
  | ({
      readonly kind: 'rect'
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
      /** Light, not a surface: the sheet blurs it, so it has no edge (the heat lamp's pool). */
      readonly soft?: boolean
      /** The order this rect stands for, so that a tap on it selects the order. It is drawn invisible when it has no paint. */
      readonly row?: number
    } & Style)
  | ({ readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } & Style)
  | ({ readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number } & Style)
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

/** Marks that belong together, drawn as one group: `part` names the object (`paper`, `pins`, `dots`, `stacks`, `flags`, `slips`). */
export interface Layer {
  readonly part: string
  readonly marks: readonly Mark[]
}

export type Orientation = 'landscape' | 'portrait'

export interface Sheet {
  readonly orientation: Orientation
  readonly width: number
  readonly height: number
  /** The accessible name of the drawing: what it shows, in a sentence. */
  readonly label: string
  readonly layers: readonly Layer[]
}

/** The most marks a sheet draws (A§6.4). */
export const MARK_CAP = 2000
/** The most dots the histogram sheet draws; the slowest orders are always among them. */
export const MAX_DOTS = 2400

/** An order's number as the printer prints it: the id plus one, four digits. */
export const orderNo = (id: number): string => String(id + 1).padStart(4, '0')

/* ------------------------------------------------------------------------------------------------------------------ */
/* Small helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const rect = (x: number, y: number, w: number, h: number, style: Style = {}, extra: { soft?: boolean; row?: number } = {}): Mark => ({
  kind: 'rect',
  x: num(x),
  y: num(y),
  w: num(w),
  h: num(h),
  ...style,
  ...extra,
})
const line = (x1: number, y1: number, x2: number, y2: number, style: Style): Mark => ({ kind: 'line', x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), ...style })
const circle = (cx: number, cy: number, r: number, style: Style): Mark => ({ kind: 'circle', cx: num(cx), cy: num(cy), r, ...style })
const path = (d: string, style: Style): Mark => ({ kind: 'path', d, ...style })
const text = (x: number, y: number, body: string, size: number, anchor: 'start' | 'middle' | 'end', fill: Paint, face: Face): Mark => ({
  kind: 'text',
  x: num(x),
  y: num(y),
  text: body,
  size,
  anchor,
  fill,
  face,
})

/** A masking-tape label: a strip of tape with its words in marker. The width is a guess at the marker's, so a strip is a little loose. */
function tapeLabel(x: number, y: number, body: string, size: number, anchor: 'start' | 'end' = 'start'): Mark[] {
  const w = body.length * size * 0.62 + 12
  const left = anchor === 'start' ? x : x - w
  return [rect(left, y, w, size + 8, { fill: 'tape' }), text(left + 6, y + size + 1, body, size, 'start', 'tape-ink', 'label')]
}

/** The sheet itself: paper with a hairline edge. */
const paper = (width: number, height: number): Mark => rect(0.5, 0.5, width - 1, height - 1, { fill: 'paper', stroke: 'paper-rule', width: 1 })

/** Two pins in the top corners: a steel head and its glint. */
function pins(width: number): Mark[] {
  return [22, width - 22].flatMap((x) => [circle(x, 15, 6, { fill: 'surface-2', stroke: 'edge', width: 1.25 }), circle(x - 1.8, 13.2, 1.7, { fill: 'paper' })])
}

/** A tick of a ruler is written the way the printer prints a time: seconds, to as many places as the tick's step needs. */
function seconds(us: Us, stepUs: Us): string {
  const places = stepUs >= 1_000_000 ? 0 : stepUs >= 100_000 ? 1 : stepUs >= 10_000 ? 2 : 3
  return (us / 1_000_000).toFixed(places)
}

/** The step of a ruler over `span` µs: 1, 2 or 5 times a power of ten, the least that gives six ticks or fewer. */
function niceStep(span: Us): Us {
  let base = 1000
  for (;;) {
    for (const mult of [1, 2, 5]) if (mult * base * 6 >= span) return mult * base
    base *= 10
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The histogram sheet                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface HistogramOptions {
  readonly orientation?: Orientation
  /**
   * The time to first token of every order in the log, in the order they were due, from whichever clock the desk is set to
   * (`desk.latencyUs`). The cut leaves the first of them out of what is counted, and they are drawn hollow.
   */
  readonly latencies: readonly Us[]
  readonly cut: number
  /** The order the lamp falls on, by its place in the log. */
  readonly selected: number | null
  /** The number on the report, which the flag marks. */
  readonly claimUs: Us
  /** A second flag: the p99 the desk reads. Left out where the level hides its readouts. */
  readonly p99Us?: Us | null
  /** A third and a fourth, in the debrief only: the corrected p99 the court found, and the learner's own. */
  readonly correctedUs?: Us | null
  readonly yoursUs?: Us | null
  /** What the sheet is of, in the label on its tape. */
  readonly caption?: string
}

interface HistogramGeometry {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly bottom: number
  /** The right edge of the ruler's numbers. */
  readonly ruler: number
  readonly sx0: number
  readonly sx1: number
  readonly hx0: number
  readonly hx1: number
  /** Where the tape of the flags begins: the flags' lines run to it and their names are stuck beyond it. */
  readonly gx: number
  readonly dot: number
  readonly textSize: number
}

const HISTOGRAM: Readonly<Record<Orientation, HistogramGeometry>> = {
  landscape: { width: 560, height: 350, top: 52, bottom: 322, ruler: 52, sx0: 60, sx1: 290, hx0: 302, hx1: 470, gx: 478, dot: 2.3, textSize: 11 },
  portrait: { width: 360, height: 560, top: 52, bottom: 524, ruler: 44, sx0: 50, sx1: 168, hx0: 176, hx1: 262, gx: 268, dot: 2.2, textSize: 10 },
}

/** The fewest bins of the ruler a sheet shows, so that a log whose times are close still has a ruler to read. */
const MIN_SPAN = 6
/** The tape of a flag is this tall, in the sheet's units. */
const FLAG_HEIGHT = 19

/** A ruler's number as the printer prints it: milliseconds under a second, seconds above. */
export const edgeLabel = (us: Us): string => (us < 1_000_000 ? `${us / 1000} ms` : `${us / 1_000_000} s`)

/** The orders drawn as dots: all of them when they fit, else every few, and always the slow ones (the top twentieth), which a p99 is about. */
function dotted(latencies: readonly Us[], limit: number): number[] {
  const n = latencies.length
  if (n <= limit) return latencies.map((_, i) => i)
  const stride = Math.ceil(n / limit)
  const floor = [...latencies].sort((a, b) => a - b)[Math.floor(n * 0.95)]
  const kept: number[] = []
  for (let i = 0; i < n; i++) if (i % stride === 0 || latencies[i] >= floor) kept.push(i)
  return kept
}

/**
 * The part of the ruler a log needs: the bins from the one below its quickest order (or flag) to the one above its slowest, at least
 * `MIN_SPAN` of them. A log that lives between 40 and 300 ms is drawn across the sheet and not in its bottom corner, and the ruler
 * grows when the learner moves the stopwatch to the due time and a stall appears.
 */
export function rulerOf(places: readonly number[], bins: number): { lowBin: number; highBin: number } {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const place of places) {
    if (place < lo) lo = place
    if (place > hi) hi = place
  }
  let lowBin = Math.max(0, Math.floor(lo) - 1)
  let highBin = Math.min(bins, Math.ceil(hi) + 1)
  while (highBin - lowBin < MIN_SPAN) {
    if (highBin < bins) highBin += 1
    if (highBin - lowBin < MIN_SPAN && lowBin > 0) lowBin -= 1
    if (highBin >= bins && lowBin <= 0) break
  }
  return { lowBin, highBin }
}

/** The log in one picture: a dot for every order against a logarithmic ruler, and the same orders counted into stacks of slips. */
export function layoutHistogram(o: HistogramOptions): Sheet {
  const orientation = o.orientation ?? 'landscape'
  const g = HISTOGRAM[orientation]
  const latencies = o.latencies
  const n = latencies.length
  const bins = BIN_EDGES_US.length - 1
  const cut = Math.max(0, Math.min(o.cut, n - 1))

  // The flags, and so the ruler: it is cut to the log's own range, with the flags in it.
  const flagged: { us: Us; paint: Paint; dash?: string; name: string }[] = [{ us: o.claimUs, paint: 'paper-ink-2', dash: '6 3', name: 'REPORTED' }]
  if (o.p99Us !== undefined && o.p99Us !== null) flagged.push({ us: o.p99Us, paint: 'paper-ink', name: 'AT DESK' })
  if (o.correctedUs !== undefined && o.correctedUs !== null) flagged.push({ us: o.correctedUs, paint: 'paper-ink', name: 'CORRECTED' })
  if (o.yoursUs !== undefined && o.yoursUs !== null) flagged.push({ us: o.yoursUs, paint: 'edge', dash: '2 3', name: 'YOURS' })
  const { lowBin, highBin } = rulerOf([...latencies.map(placeOf), ...flagged.map((flag) => placeOf(flag.us))], bins)
  const span = highBin - lowBin
  const pitch = (g.bottom - g.top) / span
  const yOfPlace = (place: number): number => g.bottom - (place - lowBin) * pitch
  const yOf = (us: Us): number => yOfPlace(placeOf(us))
  const xOf = (i: number): number => g.sx0 + ((i + 0.5) / n) * (g.sx1 - g.sx0)

  const layers: Layer[] = []
  layers.push({ part: 'paper', marks: [paper(g.width, g.height)] })

  // The grid: a line at every edge of the ruler that is shown, heavier at the powers of ten, and ten verticals across the dots.
  const minor: string[] = []
  const major: string[] = []
  for (let i = lowBin; i <= highBin; i++) {
    const d = `M${g.sx0} ${num(yOfPlace(i))}H${g.hx1}`
    ;(DECADE_EDGES_US.includes(BIN_EDGES_US[i]) ? major : minor).push(d)
  }
  for (let k = 0; k <= 10; k++) minor.push(`M${num(g.sx0 + (k * (g.sx1 - g.sx0)) / 10)} ${g.top}V${g.bottom}`)
  layers.push({ part: 'grid', marks: [path(minor.join(''), { stroke: 'paper-rule', width: 0.5 }), path(major.join(''), { stroke: 'paper-rule', width: 1 })] })

  // The ruler's numbers, in the printer's dots: every edge when few are shown, else the powers of ten.
  const ruler: Mark[] = []
  for (let i = lowBin; i <= highBin; i++) {
    const edge = BIN_EDGES_US[i]
    if (span <= 12 || DECADE_EDGES_US.includes(edge)) ruler.push(text(g.ruler, num(yOfPlace(i) + 3.5), edgeLabel(edge), g.textSize, 'end', 'paper-ink', 'numeric'))
  }
  layers.push({ part: 'ruler', marks: ruler })

  // The dots: solid for the orders the desk measures, hollow for the ones its cut leaves out.
  const half = g.dot / 2
  const square = (i: number): string => `M${num(xOf(i) - half)} ${num(yOf(latencies[i]) - half)}h${g.dot}v${g.dot}h${-g.dot}z`
  const drawn = dotted(latencies, MAX_DOTS)
  const measured = drawn.filter((i) => i >= cut).map(square).join('')
  const left = drawn.filter((i) => i < cut).map(square).join('')
  layers.push({
    part: 'dots',
    marks: [
      ...(left === '' ? [] : [path(left, { fill: 'paper', stroke: 'edge', width: 0.6 })]),
      ...(measured === '' ? [] : [path(measured, { fill: 'paper-ink' })]),
    ],
  })

  // The stacks: each bin's orders as a stack of slips, perforated, against the same ruler. The counts are the printer's.
  const counts = binsOf(latencies.slice(cut)).map((bin) => bin.count)
  const most = Math.max(1, ...counts)
  const room = g.hx1 - g.hx0 - (orientation === 'landscape' ? 34 : 30)
  const perSlip = Math.max(1, Math.ceil(most / 16))
  const stack: Mark[] = []
  const perforations: string[] = []
  const tally: Mark[] = []
  for (let i = lowBin; i < highBin; i++) {
    const count = counts[i]
    if (count === 0) continue
    const y = g.bottom - (i - lowBin + 1) * pitch + 1.5
    const len = Math.max(1.5, (count / most) * room)
    stack.push(rect(g.hx0, y, len, pitch - 3, { fill: 'paper', stroke: 'paper-ink', width: 1 }))
    for (let k = perSlip; k < count; k += perSlip) {
      const x = num(g.hx0 + (k / most) * room)
      perforations.push(`M${x} ${num(y + 0.5)}V${num(y + pitch - 3.5)}`)
    }
    tally.push(text(g.hx0 + len + 4, num(y + (pitch - 3) / 2 + 3.5), String(count), g.textSize - 1, 'start', 'paper-ink', 'numeric'))
  }
  layers.push({ part: 'stacks', marks: [...stack, ...(perforations.length > 0 ? [path(perforations.join(''), { stroke: 'paper-rule', width: 1, dash: '1.5 1.5' })] : []), ...tally] })

  // The cut: a dashed line across the dots, and its tape.
  const flags: Mark[] = []
  if (cut > 0) {
    const x = g.sx0 + (cut / n) * (g.sx1 - g.sx0)
    flags.push(line(x, g.top - 6, x, g.bottom, { stroke: 'edge', width: 1.25, dash: '4 3' }), ...tapeLabel(x + 3, g.top - 24, 'CUT', 11))
  }
  // The flags run across the dots and the stacks to the margin, where their names are stuck on tape, each at its own height and none on another.
  let floor = g.top - 4
  for (const flag of flagged.map((f) => ({ ...f, y: yOf(f.us) })).sort((a, b) => a.y - b.y)) {
    const top = Math.max(flag.y - FLAG_HEIGHT / 2, floor)
    floor = top + FLAG_HEIGHT + 2
    flags.push(line(g.sx0, flag.y, g.gx, flag.y, { stroke: flag.paint, width: 1.75, ...(flag.dash === undefined ? {} : { dash: flag.dash }) }), ...tapeLabel(g.gx + 2, top, flag.name, 11))
  }
  layers.push({ part: 'flags', marks: flags })

  // The present: the order the lamp falls on, with its pool.
  if (o.selected !== null && o.selected >= 0 && o.selected < n) {
    const x = xOf(o.selected)
    const y = yOf(latencies[o.selected])
    layers.push({
      part: 'present',
      marks: [rect(x - 16, y - 10, 32, 20, { fill: 'lamp', opacity: 0.85 }, { soft: true }), circle(x, y, 5, { fill: 'lamp', stroke: 'lamp-ring', width: 1.75 })],
    })
  }

  // The pins and the tape that names the sheet.
  layers.push({ part: 'pins', marks: pins(g.width) })
  layers.push({ part: 'name', marks: tapeLabel(orientation === 'landscape' ? 44 : 38, 5, o.caption ?? 'TIME TO FIRST TOKEN', 11) })

  return {
    orientation,
    width: g.width,
    height: g.height,
    label: `Graph paper. A dot for each of the ${n} orders in the log, in the order they were due, higher for a longer time to first token on a logarithmic ruler, beside stacks of slips that count the orders into the same ruler. The report's number is flagged across both.`,
    layers,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The timeline sheet                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface TimelineOptions {
  readonly orientation?: Orientation
  readonly rows: readonly BenchRow[]
  /** The order the lamp falls on, by its place in the log. */
  readonly selected: number | null
}

interface TimelineGeometry {
  readonly width: number
  readonly height: number
  readonly top: number
  readonly bottom: number
  readonly x0: number
  readonly x1: number
  readonly label: number
  /** Orders in the stretch. */
  readonly slips: number
  readonly textSize: number
}

const TIMELINE: Readonly<Record<Orientation, TimelineGeometry>> = {
  landscape: { width: 560, height: 350, top: 56, bottom: 298, x0: 64, x1: 546, label: 54, slips: 32, textSize: 10 },
  portrait: { width: 360, height: 520, top: 56, bottom: 472, x0: 54, x1: 346, label: 46, slips: 32, textSize: 10 },
}

/** The first order of a stretch of `size` that holds `selected`, held inside the log. */
export function stretchStart(count: number, selected: number | null, size: number): number {
  const at = selected ?? 0
  return Math.max(0, Math.min(at - Math.floor(size / 2), count - size))
}

/** A stretch of the log, one slip to an order, with the waits drawn where they happened. */
export function layoutTimeline(o: TimelineOptions): Sheet {
  const orientation = o.orientation ?? 'landscape'
  const g = TIMELINE[orientation]
  const first = stretchStart(o.rows.length, o.selected, g.slips)
  const shown = o.rows.slice(first, first + g.slips)
  const t0 = Math.min(...shown.map((row) => row.dueUs))
  const t1 = Math.max(...shown.map((row) => row.doneUs))
  const span = Math.max(1, t1 - t0)
  const xOf = (t: Us): number => g.x0 + ((t - t0) / span) * (g.x1 - g.x0)
  const pitch = (g.bottom - g.top) / g.slips
  const bar = Math.min(5, pitch * 0.44)

  const layers: Layer[] = []
  layers.push({ part: 'paper', marks: [paper(g.width, g.height)] })

  // The ruler: a vertical hairline at each tick, and its time in seconds.
  const step = niceStep(span)
  const grid: string[] = []
  const ticks: Mark[] = []
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = num(xOf(t))
    grid.push(`M${x} ${g.top - 4}V${g.bottom}`)
    ticks.push(text(x, g.top - 9, seconds(t, step), g.textSize + 1, 'middle', 'paper-ink', 'numeric'))
  }
  const rules: string[] = []
  for (let k = 0; k <= g.slips; k += 4) rules.push(`M${g.x0} ${num(g.top + k * pitch)}H${g.x1}`)
  layers.push({ part: 'grid', marks: [path(rules.join(''), { stroke: 'paper-rule', width: 0.5 }), path(grid.join(''), { stroke: 'paper-rule', width: 0.75 })] })
  layers.push({ part: 'ruler', marks: [text(g.label, g.top - 9, 'SECONDS', g.textSize - 1, 'end', 'paper-ink', 'numeric'), ...ticks] })

  const present = o.selected === null ? -1 : o.selected - first
  if (present >= 0 && present < shown.length) {
    const y = g.top + present * pitch
    layers.push({
      part: 'present',
      marks: [
        rect(g.x0 - 6, y - 2, g.x1 - g.x0 + 12, pitch + 4, { fill: 'lamp', opacity: 0.9 }, { soft: true }),
        rect(g.label - 38, y, g.x1 - g.label + 42, pitch, { fill: 'none', stroke: 'lamp-ring', width: 1.5 }),
      ],
    })
  }

  // The slips: each order's notch, stub, waits and reply. Paths hold the many small marks of a kind, and a transparent rect over each
  // order takes the tap.
  const notches: string[] = []
  const stubs: string[] = []
  const unseen: string[] = []
  const queue: string[] = []
  const reply: string[] = []
  const numbers: Mark[] = []
  const hits: Mark[] = []
  shown.forEach((row, i) => {
    const y = g.top + i * pitch
    const cy = y + pitch / 2
    const xDue = xOf(row.dueUs)
    const xSent = xOf(row.sentUs)
    const xFirst = xOf(row.firstUs)
    const xDone = xOf(row.doneUs)
    notches.push(`M${num(xDue - 1.5)} ${num(cy - bar)}h3v${num(bar * 2)}h-3z`)
    stubs.push(`M${num(xSent - 1.5)} ${num(cy - bar)}h3v${num(bar * 2)}h-3z`)
    if (xSent - xDue >= 1) unseen.push(`M${num(xDue)} ${num(cy)}H${num(xSent)}`)
    queue.push(`M${num(xSent)} ${num(cy - bar / 2)}h${num(Math.max(0.5, xFirst - xSent))}v${num(bar)}h${num(-Math.max(0.5, xFirst - xSent))}z`)
    reply.push(`M${num(xFirst)} ${num(cy - bar / 2)}h${num(Math.max(0.5, xDone - xFirst))}v${num(bar)}h${num(-Math.max(0.5, xDone - xFirst))}z`)
    if (i % 2 === 0 || i === present) numbers.push(text(g.label, num(cy + 3.5), orderNo(row.id), g.textSize, 'end', 'paper-ink', 'numeric'))
    hits.push(rect(g.label - 38, y, g.x1 - g.label + 42, pitch, {}, { row: row.id }))
  })
  layers.push({
    part: 'slips',
    marks: [
      path(queue.join(''), { fill: 'paper', stroke: 'edge', width: 1 }),
      path(reply.join(''), { fill: 'paper-ink' }),
      ...(unseen.length > 0 ? [path(unseen.join(''), { stroke: 'paper-ink-2', width: 2, dash: '2.5 2' })] : []),
      path(notches.join(''), { fill: 'paper', stroke: 'paper-ink', width: 1 }),
      path(stubs.join(''), { fill: 'paper-ink' }),
    ],
  })
  layers.push({ part: 'orders', marks: numbers })
  layers.push({ part: 'hits', marks: hits })

  // What the marks are, written beside the marks themselves on tape at the sheet's foot.
  const y = g.bottom + 14
  const key: Mark[] = [
    ...tapeLabel(g.x0 - 8, y, 'DUE', 10),
    rect(g.x0 + 28, y + 3, 3, 12, { fill: 'paper', stroke: 'paper-ink', width: 1 }),
    ...tapeLabel(g.x0 + 40, y, 'SENT', 10),
    rect(g.x0 + 82, y + 3, 3, 12, { fill: 'paper-ink' }),
    ...tapeLabel(g.x0 + 96, y, 'WAIT NEVER TIMED', 10),
    line(g.x0 + 210, y + 9, g.x0 + 232, y + 9, { stroke: 'paper-ink-2', width: 2, dash: '2.5 2' }),
  ]
  layers.push({ part: 'key', marks: orientation === 'landscape' ? key : key.slice(0, 5) })

  layers.push({ part: 'pins', marks: pins(g.width) })
  layers.push({ part: 'name', marks: tapeLabel(orientation === 'landscape' ? 44 : 38, 5, 'EACH ORDER, DUE TO DONE', 11) })

  return {
    orientation,
    width: g.width,
    height: g.height,
    label: `Graph paper. ${shown.length} orders of the log, one slip each, in the order they came. A hollow notch marks when an order was due, a solid stub when it was sent, a dashed red line the wait between the two that a stopwatch started at the send never times, a hollow bar its wait in the server and a solid bar the reply.`,
    layers,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Sheet to SVG                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const FACE: Readonly<Record<Face, string>> = {
  numeric: 'var(--es-font-numeric)',
  label: 'var(--es-font-label)',
}
const paint = (role: Paint): string => (role === 'none' ? 'none' : `var(--es-${role})`)

/** The blur a soft mark takes, in the sheet's units [estimated]: the heat lamp's pool has no edge. */
const SOFT_BLUR = 6

function markNode(mark: Mark, soft: string): SvgNode {
  const style = (s: Style): Record<string, string | number> => ({
    ...(s.fill === undefined ? {} : { fill: paint(s.fill) }),
    ...(s.stroke === undefined ? {} : { stroke: paint(s.stroke) }),
    ...(s.width === undefined ? {} : { strokeWidth: s.width }),
    ...(s.dash === undefined ? {} : { strokeDasharray: s.dash }),
    ...(s.opacity === undefined ? {} : { fillOpacity: s.opacity }),
  })
  switch (mark.kind) {
    case 'rect': {
      const painted = mark.fill !== undefined || mark.stroke !== undefined
      return {
        tag: 'rect',
        attrs: {
          x: mark.x,
          y: mark.y,
          width: mark.w,
          height: mark.h,
          ...(painted ? style(mark) : { fill: 'none', pointerEvents: 'all' }),
          ...(mark.soft ? { filter: `url(#${soft})` } : {}),
          ...(mark.row === undefined ? {} : { 'data-row': mark.row }),
        },
      }
    }
    case 'line':
      return { tag: 'line', attrs: { x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2, ...style(mark) } }
    case 'circle':
      return { tag: 'circle', attrs: { cx: mark.cx, cy: mark.cy, r: mark.r, ...style(mark) } }
    case 'path':
      return { tag: 'path', attrs: { d: mark.d, ...style(mark) } }
    case 'text':
      return {
        tag: 'text',
        attrs: { x: mark.x, y: mark.y, fill: paint(mark.fill), fontFamily: FACE[mark.face], fontSize: mark.size, textAnchor: mark.anchor },
        children: [mark.text],
      }
  }
}

/**
 * The SVG of a sheet. The root is an image with the sheet's label, and its box is the sheet's own, so the browser reserves the space
 * before any style loads (CLS). `id` names the lamp's blur, so that several sheets can share a page (the debrief draws one for each case).
 */
export function sheetSvg(sheet: Sheet, id = 'es-bench-pool'): SvgNode {
  const soft = sheet.layers.some((layer) => layer.marks.some((mark) => mark.kind === 'rect' && mark.soft === true))
  const blur: SvgNode = {
    tag: 'defs',
    attrs: {},
    children: [{ tag: 'filter', attrs: { id, x: '-30%', y: '-80%', width: '160%', height: '260%' }, children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: SOFT_BLUR } }] }],
  }
  const layers = sheet.layers.map((layer): SvgNode => ({ tag: 'g', attrs: { 'data-part': layer.part }, children: layer.marks.map((mark) => markNode(mark, id)) }))
  return {
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${sheet.width} ${sheet.height}`,
      width: sheet.width,
      height: sheet.height,
      role: 'img',
      'aria-label': sheet.label,
    },
    children: soft ? [blur, ...layers] : layers,
  }
}

/** Marks in a sheet. */
export const markCount = (sheet: Sheet, id?: string): number => countMarks(sheetSvg(sheet, id))
