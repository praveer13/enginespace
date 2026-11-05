/**
 * The Tasting's layout (A§6.3, GAMES.md §10 "2D path", §2.6 "The Tasting"): a view of the pass turned into positioned marks. The 2D
 * view draws the marks as SVG (`frameSvg`), and W1-T29's 3D scene reads the same view for its own primitives.
 *
 * It is the kitchen, drawn flat, and not a chart (GAMES.md §2.6 rule 1: a name, never a prop):
 *   - the pass, a counter of brushed steel that every stack stands on, lit along its back edge and shaded along its front, with the
 *     heat lamp's amber pooled over the row being tasted: the drawing's only amber;
 *   - for each dish, two stacks of plates side by side, each standing in its contact shadow on the pass. The commis's stack on the
 *     left is q, and the chef's on the right is p, in her wire dispenser: two posts and a bar over her stack, its foot in the target
 *     blue. Each plate is drawn as a plate seen edge on, with rounded ends and the glaze of its rim catching the light, and a gap
 *     under it. In a practice level the plates the stacks share are the agreed board green, the commis's extra plates on its stack are
 *     hatched in the draft yellow, and the extra plates on the chef's stack, which she would re-plate, are the residual red. Where a
 *     level does not show the decomposition, the commis's plates are all hatched and the chef's all blue, and the learner has to find
 *     the overlap and the excess themselves;
 *   - a drafted plate set down on a commis stack at a seeded height: a solid dot where it lands in the plates the chef keeps, and a
 *     struck-through ring in the ribbon's red where it lands in the extra, the Service drawing's binned plate;
 *   - what went out of the kitchen, per dish: a hollow ring and a dashed hairline at the height served, over the chef's stack, so that
 *     it settles onto the top of her stack as the recipe becomes exact;
 *   - masking tape in marker for the dishes' names and for the rows, and the printer's dots on a paper tag for each dish's counts.
 * A state is a shape and a pattern before it is a colour (WCAG 1.4.1): a plate is solid, hatched or outlined, a dropped plate is a dot
 * or a struck ring, and what went out is a ring. The code colours mark only what a stack is.
 *
 * Every number the drawing writes is a dish's plates on its tag or a row's name on its tape. The counters are DOM, in the printer's tape
 * and the mirror, and the mirror lists every count the picture draws.
 */
import type { SvgNode } from '../loop/svg'
import { countMarks, num } from '../loop/svg'
import { PLATES } from './types'
import type { RowView, VerifierView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Marks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The token roles the drawing paints with (src/design/tokens.ts). `none` is no paint, and `hatch-draft` is the draft yellow's hatching. */
export type Paint =
  | 'none'
  | 'hatch-draft'
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
  | 'probability-target'
  | 'probability-draft'
  | 'probability-overlap'
  | 'probability-residual'
  | 'cat-blue-edge'
  | 'cat-yellow-edge'
  | 'cat-green-edge'
  | 'cat-red-edge'
  | 'cat-white-edge'
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
  'probability-target',
  'probability-draft',
  'probability-overlap',
  'probability-residual',
  'cat-blue-edge',
  'cat-yellow-edge',
  'cat-green-edge',
  'cat-red-edge',
  'cat-white-edge',
  'tape',
  'tape-ink',
]

/** The faces the drawing sets text in: the printer's dots for numbers, and marker on masking tape for names. */
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
    }

/** Marks that belong together, drawn as one group: `part` names the object (`lamp`, `pass`, `stacks`, `wire`, `plates`, `out`, `names`). */
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
  /** Where each dish's cell sits across the frame, in the frame's units: the page puts a tap target over each (GAMES.md §10, "Controls"). */
  readonly columns?: readonly { readonly x: number; readonly w: number }[]
}

export interface FrameOptions {
  readonly orientation?: Orientation
  /** Draw the decomposition: the plates both stacks share, the commis's extra and the chef's extra. A graded level leaves it out. */
  readonly scaffold?: boolean
  /** Draw what went out. A graded level hides it while the run is on: it is the live meter. */
  readonly outcome?: boolean
}

/** The most marks the 2D view draws (A§6.4). */
export const MARK_CAP = 2000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Geometry                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Geometry {
  readonly width: number
  readonly margin: number
  /** Space at the left for the rows' names on their tape. */
  readonly gutter: number
  readonly cellW: number
  readonly stackW: number
  readonly stackGap: number
  readonly plotH: number
  /** The band above the first row that names the two stacks. */
  readonly header: number
  readonly top: number
  /** Between rows: the pass strip and what hangs under it. */
  readonly pitch: number
  readonly numberSize: number
  readonly tapeSize: number
  readonly rows: number
  readonly single: boolean
}

/** The plot height of a row for each number of rows [estimated]: the frame stays about as tall whether it holds one row or five. */
const PLOT_HEIGHT: Readonly<Record<number, number>> = { 1: 220, 2: 118, 3: 90, 4: 72, 5: 62 }
/**
 * The least a plate is given, in frame units [estimated]: room for the plate seen edge on, the glaze of its rim and the gap under it.
 * Thinner than this a stack reads as a bar and not as plates, so a run of courses takes a taller row rather than thinner plates.
 */
const MIN_UNIT = 3.4

const PASS = 7

function geometryOf(orientation: Orientation, rows: number, maxPlates: number): Geometry {
  const landscape = orientation === 'landscape'
  const single = rows === 1
  const width = landscape ? 720 : 360
  const margin = landscape ? 6 : 4
  const gutter = landscape && !single ? 92 : 0
  const cellW = (width - 2 * margin - gutter) / 6
  const stackW = landscape ? (single ? 40 : 32) : single ? 22 : 18
  const stackGap = landscape ? 8 : 4
  const plotH = Math.max(PLOT_HEIGHT[Math.min(rows, 5)] ?? 60, Math.ceil(Math.max(maxPlates, 24) * MIN_UNIT + 4))
  // In portrait a row's name goes above it, in a band of its own.
  const named = !landscape && !single ? 14 : 0
  return {
    width,
    margin,
    gutter,
    cellW,
    stackW,
    stackGap,
    plotH,
    header: 18,
    top: 6,
    pitch: named + plotH + PASS + (single ? 0 : 6),
    numberSize: landscape ? 11 : 9.5,
    tapeSize: landscape ? 9.5 : 8,
    rows,
    single,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The painter                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

function painter() {
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
  const text = (x: number, y: number, label: string, o: { size: number; anchor?: 'start' | 'middle' | 'end'; fill: Paint; face?: Face }) =>
    add({ kind: 'text', x: num(x), y: num(y), text: label, size: o.size, anchor: o.anchor ?? 'middle', fill: o.fill, face: o.face ?? 'body' })
  return { layers, layer, rect, line, circle, text, count: () => layers.reduce((sum, l) => sum + l.marks.length, 0) }
}

type Painter = ReturnType<typeof painter>

/** A strip of masking tape with its words in marker. */
function tapeAt(p: Painter, x: number, y: number, w: number, h: number, words: string, size: number) {
  p.rect(x, y, w, h, { fill: 'tape' })
  p.text(x + w / 2, y + h / 2 + size * 0.35, words, { size, fill: 'tape-ink', face: 'label' })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* One row                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How much detail the stacks get: a mark for each plate, or one for each run of plates when the cap would pass. */
type Detail = 'plates' | 'runs'

interface Scale {
  /** Frame units for one plate. */
  readonly unit: number
  /** The gap between two plates of a stack. */
  readonly gap: number
}

function scaleOf(g: Geometry, maxPlates: number): Scale {
  const unit = (g.plotH - 4) / Math.max(maxPlates, 24)
  return { unit, gap: Math.min(1.4, unit * 0.3) }
}

/**
 * A run of `count` plates standing on `base`, as plates or as one slab. A plate is seen edge on: its rounded ends, its part on its edge,
 * the glaze of its rim catching the tubes' light along its top, and a gap of shade under it, where the plate below shows.
 */
function plateRun(p: Painter, s: Scale, detail: Detail, x: number, base: number, w: number, from: number, count: number, style: Style) {
  if (count <= 0) return
  if (detail === 'runs') {
    p.rect(x, base - (from + count) * s.unit, w, count * s.unit - s.gap * 0.5, { ...style, rx: 1 })
    return
  }
  const h = Math.max(s.unit - s.gap, 0.8)
  const rx = Math.min(h / 2, 2.6)
  for (let k = 0; k < count; k++) {
    const y = base - (from + k + 1) * s.unit + s.gap * 0.5
    p.rect(x, y, w, h, { ...style, rx })
    p.line(x + rx, y + 0.5, x + w - rx, y + 0.5, { stroke: 'paper', width: Math.min(1, h * 0.32), strokeOpacity: 0.9 })
  }
}

interface RowGeometry {
  /** The y of the pass strip's top: the line the stacks stand on. */
  readonly base: number
  /** The x of the left edge of dish `x`'s cell. */
  readonly cellX: (dish: number) => number
  readonly qX: (dish: number) => number
  readonly pX: (dish: number) => number
}

function rowGeometry(g: Geometry, rowTop: number): RowGeometry {
  const used = 2 * g.stackW + g.stackGap
  const pad = (g.cellW - used) / 2
  const cellX = (dish: number) => g.margin + g.gutter + dish * g.cellW
  return { base: rowTop + g.plotH, cellX, qX: (dish) => cellX(dish) + pad, pX: (dish) => cellX(dish) + pad + g.stackW + g.stackGap }
}

/**
 * The stacks of one row: the commis's and the chef's for each dish, the agreed plates the two share, and the plain look where the
 * decomposition is not shown. A bonus row has the chef's stack alone.
 */
function stacksAt(p: Painter, g: Geometry, s: Scale, detail: Detail, row: RowView, r: RowGeometry, scaffold: boolean) {
  row.p.forEach((pPlates, dish) => {
    const qPlates = row.q === null ? 0 : row.q[dish]
    const agreed = Math.min(pPlates, qPlates)
    const qx = r.qX(dish)
    const px = r.pX(dish)
    if (row.q !== null && qPlates > 0) {
      if (scaffold) {
        plateRun(p, s, detail, qx, r.base, g.stackW, 0, agreed, { fill: 'probability-overlap', stroke: 'cat-green-edge', width: 0.6 })
        plateRun(p, s, detail, qx, r.base, g.stackW, agreed, qPlates - agreed, { fill: 'hatch-draft', stroke: 'cat-yellow-edge', width: 0.6 })
      } else {
        plateRun(p, s, detail, qx, r.base, g.stackW, 0, qPlates, { fill: 'hatch-draft', stroke: 'cat-yellow-edge', width: 0.6 })
      }
    }
    if (pPlates > 0) {
      if (scaffold && row.q !== null) {
        plateRun(p, s, detail, px, r.base, g.stackW, 0, agreed, { fill: 'probability-overlap', stroke: 'cat-green-edge', width: 0.6 })
        plateRun(p, s, detail, px, r.base, g.stackW, agreed, pPlates - agreed, { fill: 'probability-residual', stroke: 'cat-red-edge', width: 0.6 })
      } else {
        plateRun(p, s, detail, px, r.base, g.stackW, 0, pPlates, { fill: 'probability-target', stroke: 'cat-blue-edge', width: 0.6 })
      }
    }
  })
}

/**
 * The chef's wire dispensers, one round each of her stacks whatever its plates are, for it is her tasting: two posts of steel wire hugging
 * the stack and the bar over them, a few plates taller than what she holds, and the dispenser's foot on the pass in the target blue.
 */
function wireAt(p: Painter, g: Geometry, s: Scale, row: RowView, r: RowGeometry) {
  row.p.forEach((pPlates, dish) => {
    const top = r.base - Math.min(g.plotH - 1, (pPlates + 3) * s.unit)
    const left = r.pX(dish) - 2.4
    const right = r.pX(dish) + g.stackW + 2.4
    for (const x of [left, right]) p.line(x, r.base, x, top + 1.2, { stroke: 'surface-3', width: 0.9 })
    p.rect(left, top, right - left, 1.4, { fill: 'surface-3', rx: 0.7 })
    p.rect(left - 1.4, r.base - 1.6, right - left + 2.8, 3, { fill: 'probability-target', stroke: 'cat-blue-edge', width: 0.6, rx: 1.5 })
  })
}

/** Each stack's contact shadow on the pass: a soft dark bed under its foot, a little wider than the stack, so no stack floats. */
function shadowsAt(p: Painter, g: Geometry, row: RowView, r: RowGeometry) {
  row.p.forEach((pPlates, dish) => {
    const qPlates = row.q === null ? 0 : row.q[dish]
    for (const [x, plates] of [
      [r.qX(dish), qPlates],
      [r.pX(dish), pPlates],
    ] as const) {
      if (plates > 0) p.rect(x - 2.5, r.base - 1, g.stackW + 5, 3.2, { fill: 'surface-3', opacity: 0.32, rx: 1.6 })
    }
  })
}

/** The plates a round set down on the commis's stacks: a solid dot where the chef kept one, a struck ring where she sent it back. */
function markersAt(p: Painter, g: Geometry, s: Scale, row: RowView, r: RowGeometry) {
  for (const m of row.markers) {
    const cx = r.qX(m.token) + g.stackW / 2
    const cy = r.base - Math.min(m.height + 0.5, (row.q?.[m.token] ?? 0)) * s.unit
    const radius = g.single ? 3.2 : 2.4
    if (m.kept) {
      p.circle(cx, cy, radius, { fill: 'paper-ink', stroke: 'paper', width: 1 })
    } else {
      p.circle(cx, cy, radius + 0.4, { fill: 'paper', stroke: 'paper-ink-2', width: 1.2 })
      p.line(cx - radius * 0.7, cy - radius * 0.7, cx + radius * 0.7, cy + radius * 0.7, { stroke: 'paper-ink-2', width: 1.2 })
    }
  }
}

/**
 * What went out: a hollow ring and a dashed hairline at the height served, over the chef's stack. A paper halo under each lets it read on
 * any plate, and the ring sits on the top edge of her stack when what went out is her tasting.
 */
function outAt(p: Painter, g: Geometry, s: Scale, row: RowView, r: RowGeometry) {
  const out = row.out
  if (out === null) return
  out.forEach((plates, dish) => {
    const y = r.base - plates * s.unit
    const left = r.pX(dish) - 3
    const right = r.pX(dish) + g.stackW + 3
    p.line(left, y, right, y, { stroke: 'paper', width: 3 })
    p.line(left, y, right, y, { stroke: 'cat-white-edge', width: 1.2, dash: '3 2' })
    p.circle(r.pX(dish) + g.stackW / 2, y, 3.4, { fill: 'none', stroke: 'paper', width: 3.2 })
    p.circle(r.pX(dish) + g.stackW / 2, y, 3.4, { fill: 'none', stroke: 'cat-white-edge', width: 1.5 })
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The frame                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function describe(view: VerifierView): string {
  const rows = view.rows.length
  return `${view.title}. ${rows === 1 ? 'One tasting' : `${rows} tastings`}, with the commis's stack of plates beside the chef's for each of ${view.dishes.length} dishes: ${view.dishes.join(', ')}. The table below lists every count the drawing shows.`
}

/** The most plates any stack of a view holds. */
const mostPlates = (view: VerifierView): number => Math.max(...view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])]))

function build(view: VerifierView, g: Geometry, detail: Detail, options: Required<Pick<FrameOptions, 'scaffold' | 'outcome'>>): { layers: Layer[]; height: number } {
  const p = painter()
  const rows = view.rows
  const maxPlates = mostPlates(view)
  const s = scaleOf(g, maxPlates)
  const named = g.width < 480 && !g.single ? 14 : 0
  const rowTop = (i: number) => g.top + g.header + i * g.pitch + named
  const last = rows.length - 1
  const footTop = rowTop(last) + g.plotH + PASS
  const height = footTop + (g.single ? 52 : 28)

  // The pass: a counter of brushed steel under each row, lit along its back edge by the tubes and shaded along its front.
  p.layer('pass')
  rows.forEach((_, i) => {
    const y = rowTop(i) + g.plotH
    p.rect(0, y, g.width, PASS, { fill: 'surface-1', opacity: 0.85 })
    p.line(0, y + 0.5, g.width, y + 0.5, { stroke: 'paper', width: 1.5, strokeOpacity: 0.85 })
    p.line(0, y + PASS - 0.5, g.width, y + PASS - 0.5, { stroke: 'surface-3', width: 1 })
  })
  rows.forEach((row, i) => shadowsAt(p, g, row, rowGeometry(g, rowTop(i))))

  // The heat lamp's amber pools over the row being tasted, and nowhere else: light with no edge.
  p.layer('lamp')
  if (view.present !== null) {
    const top = rowTop(view.present.from) + 4
    const bottom = rowTop(view.present.to) + g.plotH + PASS + 2
    p.rect(g.margin + g.gutter, top, g.width - 2 * g.margin - g.gutter, bottom - top, { fill: 'lamp', opacity: 0.26, rx: 16, soft: true })
  }

  p.layer('stacks')
  rows.forEach((row, i) => stacksAt(p, g, s, detail, row, rowGeometry(g, rowTop(i)), options.scaffold))

  p.layer('wire')
  rows.forEach((row, i) => wireAt(p, g, s, row, rowGeometry(g, rowTop(i))))

  p.layer('plates')
  rows.forEach((row, i) => markersAt(p, g, s, row, rowGeometry(g, rowTop(i))))

  p.layer('out')
  if (options.outcome) rows.forEach((row, i) => outAt(p, g, s, row, rowGeometry(g, rowTop(i))))

  // Names on masking tape: which stack is whose above the first dish, the dishes at the foot, and the rows at the side or above.
  p.layer('names')
  const first = rowGeometry(g, rowTop(0))
  // The two tapes sit either side of the first pair's centre line, the commis's reaching left of it and the chef's right.
  const centre = first.qX(0) + g.stackW + g.stackGap / 2
  const wide = g.width >= 480
  tapeAt(p, centre - (wide ? 62 : 24), g.top - 1, wide ? 60 : 22, 15, wide ? 'COMMIS · q' : 'q', wide ? 10 : 9)
  tapeAt(p, centre + 2, g.top - 1, wide ? 52 : 22, 15, wide ? 'CHEF · p' : 'p', wide ? 10 : 9)
  view.dishes.forEach((name, dish) => {
    const cx = first.cellX(dish) + g.cellW / 2
    const w = Math.min(g.cellW - 6, g.single ? 60 : 54)
    tapeAt(p, cx - w / 2, footTop + (g.single ? 26 : 6), w, 15, name.toUpperCase(), g.tapeSize)
  })
  rows.forEach((row, i) => {
    if (rows.length === 1) return
    const name = row.kind === 'bonus' ? "CHEF'S EXTRA" : row.label.toUpperCase()
    if (g.width >= 480) tapeAt(p, 4, rowTop(i) + g.plotH - 26, g.gutter - 10, 17, name, 9.5)
    else tapeAt(p, g.margin, rowTop(i) - 14, 84, 13, name, 8.5)
  })

  // A paper tag under each dish of a single tasting, with its plates in the printer's dots: the commis's under its stack, the chef's under hers.
  p.layer('counts')
  if (g.single) {
    const row = rows[0]
    row.p.forEach((pPlates, dish) => {
      const qPlates = row.q?.[dish] ?? 0
      const cx = first.cellX(dish) + g.cellW / 2
      const w = g.stackW * 2 + g.stackGap
      p.rect(cx - w / 2, footTop + 3, w, 19, { fill: 'paper', stroke: 'paper-rule', width: 0.75 })
      p.line(cx, footTop + 6, cx, footTop + 19, { stroke: 'paper-rule', width: 1, dash: '1 2' })
      p.text(first.qX(dish) + g.stackW / 2, footTop + 16.5, String(qPlates), { size: g.numberSize, fill: 'paper-ink', face: 'numeric' })
      p.text(first.pX(dish) + g.stackW / 2, footTop + 16.5, String(pPlates), { size: g.numberSize, fill: 'paper-ink', face: 'numeric' })
    })
  }
  return { layers: p.layers, height }
}

/**
 * The frame of a view of one or more tastings: its layers in drawing order. The same view and options always give the same frame. If the
 * marks would pass the cap, the plates lose their edges and become one slab for each run, until they fit.
 */
export function layoutFrame(view: VerifierView, options: FrameOptions = {}): Frame {
  const orientation = options.orientation ?? 'landscape'
  const g = geometryOf(orientation, Math.max(view.rows.length, 1), mostPlates(view))
  const settings = { scaffold: options.scaffold ?? true, outcome: options.outcome ?? true }
  let result = build(view, g, 'plates', settings)
  if (result.layers.reduce((n, l) => n + l.marks.length, 0) > MARK_CAP) result = build(view, g, 'runs', settings)
  const columns = Array.from({ length: 6 }, (_, dish) => ({ x: num(g.margin + g.gutter + dish * g.cellW), w: num(g.cellW) }))
  return { orientation, width: g.width, height: result.height, label: describe(view), layers: result.layers, columns }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The draft length                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The frame of the `gamma` level: a stack of sixty-four commis plates for each position of a run, and how many of them the chef keeps if
 * the walk gets that far. The run the commis plates, positions 1 to γ, is under the lamp and solid; the positions beyond it are open
 * outlines, because no plate is set down there. Under the stacks, one round on a ribbon of paper: the chef's tasting, and a hatched slab
 * for each drafted plate, each a fraction of a tasting long.
 */
export function layoutGamma(view: VerifierView, options: FrameOptions = {}): Frame {
  const gamma = view.gamma
  if (gamma === null) throw new RangeError('layoutGamma draws the draft-length level')
  const orientation = options.orientation ?? 'landscape'
  const landscape = orientation === 'landscape'
  const p = painter()
  const width = landscape ? 720 : 360
  const margin = landscape ? 6 : 4
  const cell = (width - 2 * margin) / gamma.max
  const stackW = landscape ? 40 : 24
  // Room for each of sixty-four plates edge on, its rim and the gap under it, as on the pass of the other levels.
  const plotH = Math.ceil(PLATES * MIN_UNIT + 4)
  const top = 22
  const base = top + plotH
  const unit = (plotH - 4) / PLATES
  const gap = Math.min(1.2, unit * 0.3)
  const tasting = landscape ? 96 : 56
  const ribbonTop = base + PASS + 46
  const height = ribbonTop + 58

  const stackX = (j: number) => margin + j * cell + (cell - stackW) / 2
  p.layer('pass')
  p.rect(0, base, width, PASS, { fill: 'surface-1', opacity: 0.85 })
  p.line(0, base + 0.5, width, base + 0.5, { stroke: 'paper', width: 1.5, strokeOpacity: 0.85 })
  p.line(0, base + PASS - 0.5, width, base + PASS - 0.5, { stroke: 'surface-3', width: 1 })
  // Each plated stack stands in its contact shadow on the pass.
  for (let j = 0; j < Math.min(gamma.pick, gamma.max); j++) p.rect(stackX(j) - 2.5, base - 1, stackW + 5, 3.2, { fill: 'surface-3', opacity: 0.32, rx: 1.6 })

  p.layer('lamp')
  if (gamma.pick >= 1 && !view.done) {
    const right = margin + gamma.pick * cell
    p.rect(margin - 2, top, right - margin + 4, plotH + PASS + 6, { fill: 'lamp', opacity: 0.26, rx: 16, soft: true })
  }

  p.layer('stacks')
  gamma.alphas.slice(0, gamma.max).forEach((alpha, j) => {
    const x = stackX(j)
    const kept = Math.round((alpha * PLATES) / 1000)
    const plated = j + 1 <= gamma.pick
    const h = Math.max(unit - gap, 0.8)
    const rx = Math.min(h / 2, 2.6)
    for (let k = 0; k < PLATES; k++) {
      const y = base - (k + 1) * unit + gap * 0.5
      if (plated) {
        // A plate edge on, with its rim's glaze along its top, as on the pass of the other levels.
        if (k < kept) p.rect(x, y, stackW, h, { fill: 'probability-overlap', stroke: 'cat-green-edge', width: 0.6, rx })
        else p.rect(x, y, stackW, h, { fill: 'hatch-draft', stroke: 'cat-yellow-edge', width: 0.6, rx })
        p.line(x + rx, y + 0.5, x + stackW - rx, y + 0.5, { stroke: 'paper', width: Math.min(1, h * 0.32), strokeOpacity: 0.9 })
      } else if (k < kept) {
        // No plate is set down beyond the run: the place is an outline, and the split of kept and sent back stays readable in it.
        p.rect(x, y, stackW, h, { fill: 'none', stroke: 'cat-green-edge', width: 0.8, rx })
      } else {
        p.rect(x, y, stackW, h, { fill: 'none', stroke: 'cat-yellow-edge', width: 0.6, dash: '2 1.5', rx })
      }
    }
  })

  // Each position is named on its tape, and its acceptance is printed on a paper tag in the printer's dots, in permille.
  p.layer('names')
  gamma.alphas.slice(0, gamma.max).forEach((alpha, j) => {
    const cx = margin + j * cell + cell / 2
    tapeAt(p, cx - 11, base + PASS + 5, 22, 14, String(j + 1), landscape ? 9.5 : 8.5)
    const w = Math.min(cell - 4, 44)
    p.rect(cx - w / 2, base + PASS + 22, w, 17, { fill: 'paper', stroke: 'paper-rule', width: 0.75 })
    p.text(cx, base + PASS + 34.5, String(alpha), { size: landscape ? 11 : 9.5, fill: 'paper-ink', face: 'numeric' })
  })

  // One round on a ribbon of paper: the chef's tasting is one long, and each drafted plate is `cost` of a tasting.
  p.layer('round')
  const w = tasting
  p.rect(margin, ribbonTop, width - 2 * margin, 26, { fill: 'paper', stroke: 'paper-rule', width: 0.75 })
  p.rect(margin + 4, ribbonTop + 4, w, 18, { fill: 'probability-target', stroke: 'cat-blue-edge', width: 1, rx: 1 })
  for (let k = 0; k < Math.max(gamma.pick, 0); k++) {
    const slab = (gamma.cost / 1000) * w
    p.rect(margin + 4 + w + 3 + k * (slab + 1.5), ribbonTop + 4, Math.max(slab, 1.6), 18, { fill: 'hatch-draft', stroke: 'cat-yellow-edge', width: 0.8 })
  }
  tapeAt(p, margin + 4, ribbonTop + 30, landscape ? 84 : 52, 13, landscape ? 'ONE TASTING' : 'TASTING', landscape ? 8.5 : 7.5)
  tapeAt(p, margin + 4 + w + 3, ribbonTop + 30, landscape ? 120 : 72, 13, landscape ? 'THE COMMIS\'S PLATES' : 'COMMIS', landscape ? 8.5 : 7.5)

  return {
    orientation,
    width,
    height,
    label: `${view.title}. A stack of sixty-four commis plates for each of ${gamma.max} positions down a run, with the plates the chef keeps if the walk gets that far, and one round on a ribbon below.`,
    layers: p.layers,
  }
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

/** The id of the draft yellow's hatching. The two orientations can share a page (the static HTML may hold both), so each has its own. */
const hatchId = (orientation: Orientation): string => `es-hatch-draft-${orientation}`
const softId = (orientation: Orientation): string => `es-lamp-pool-${orientation}`

function paint(role: Paint, orientation: Orientation): string {
  if (role === 'none') return 'none'
  if (role === 'hatch-draft') return `url(#${hatchId(orientation)})`
  return `var(--es-${role})`
}

/** The blur a soft mark takes, in the frame's units [estimated]: the heat lamp's pool has no edge. */
const SOFT_BLUR = 10

function markNode(mark: Mark, orientation: Orientation): SvgNode {
  const style = (s: Style): Record<string, string | number> => ({
    ...(s.fill === undefined ? {} : { fill: paint(s.fill, orientation) }),
    ...(s.stroke === undefined ? {} : { stroke: paint(s.stroke, orientation) }),
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
        attrs: { x: mark.x, y: mark.y, fill: paint(mark.fill, orientation), fontFamily: FACE[mark.face], fontSize: mark.size, textAnchor: mark.anchor },
        children: [mark.text],
      }
  }
}

/**
 * The SVG of a frame. The root is an image with the frame's label, and its box is the frame's own, so the browser reserves the space before
 * any style loads. The draft yellow's hatching is a pattern in `defs`, built from the same two roles as a hatched plate everywhere
 * (the yellow board and its edge), and the lamp's pool is blurred.
 */
export function frameSvg(frame: Frame): SvgNode {
  const marks = frame.layers.flatMap((layer) => layer.marks)
  const soft = marks.some((mark) => mark.kind === 'rect' && mark.soft === true)
  const hatched = marks.some((mark) => mark.kind === 'rect' && (mark.fill === 'hatch-draft' || mark.stroke === 'hatch-draft'))
  const defs: SvgNode[] = []
  if (soft) {
    defs.push({
      tag: 'filter',
      attrs: { id: softId(frame.orientation), x: '-20%', y: '-60%', width: '140%', height: '220%' },
      children: [{ tag: 'feGaussianBlur', attrs: { stdDeviation: SOFT_BLUR } }],
    })
  }
  if (hatched) {
    defs.push({
      tag: 'pattern',
      attrs: { id: hatchId(frame.orientation), width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      children: [
        { tag: 'rect', attrs: { x: 0, y: 0, width: 5, height: 5, fill: 'var(--es-probability-draft)' } },
        { tag: 'line', attrs: { x1: 0, y1: 0, x2: 0, y2: 5, stroke: 'var(--es-cat-yellow-edge)', strokeWidth: 1.4 } },
      ],
    })
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
    children: defs.length > 0 ? [{ tag: 'defs', attrs: {}, children: defs }, ...layers] : layers,
  }
}

/** Marks in a frame. */
export const markCount = (frame: Frame): number => countMarks(frameSvg(frame))
