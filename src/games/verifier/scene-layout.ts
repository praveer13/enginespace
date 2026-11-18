/*
 * The rejection sampler's skylines (REDESIGN §2.8, §2.9; scene kit's flat track): the chain's view turned into the model the scene draws,
 * so the scene adds nothing the session did not compute and decides nothing. No three here: it is tested under Bun, and only the scene's
 * lazy chunk holds it.
 *
 *   - One row of bars for each draft position, the first nearest and the rest behind it, so that the rows' skylines line up into depth on
 *     one height scale. Over a run the bonus token's row is the last.
 *   - In a row, each token has two bars side by side, as tall as their counts out of the axis the rows share: the draft's q, then the
 *     target's p. Where a level lets the decomposition print, each bar is cut where the rule cuts it: the accepted part min(p, q), which
 *     both bars share, in the overlap's green; then the draft's excess in the draft's yellow and the residual (p - q)+ in the residual's
 *     red. Uncut, q is the draft's yellow and p the target's blue. The forms carry the part besides its colour: the draft is hatched, the
 *     residual is a groove, the accepted part and the target are solid.
 *   - What the sampler put out is a collar round the target bar, as high as the output: it settles onto p as the rule is exact, and the
 *     scene's one authored move is that settling (FlatTrack's `from`). A collar stands on its bar: where the output stands over p, a dashed
 *     outline carries the bar up to it, and where a token has no p and nothing went out, there is no collar.
 *   - A drawn round is a dot on its q bar's front, at its coin's height: solid where it landed in the accepted part, hollow above it.
 *   - The value scale stands at the front row's right end: a post as tall as the axis, a tick every eight sixty-fourths, its numbers DOM.
 *
 * Every word and number is a label for the DOM layer (D-021): a row's name, a token's number under its pair, a bar's count over it, and
 * the scale's numbers.
 */
import type { RowView, VerifierView } from '@es/play/verifier/types'
import type { ColorRoleName } from '@/design/tokens'
import type { FlatBox, FlatLabel, FlatModel, FlatSegment } from '@/scene/flat-track'
import type { MarkForm } from '@/scene/marks'
import { GEO, type Bounds, type Canvas, type Projector } from './scene-plan'

export interface SceneFlags {
  /** Draw each bar's cut (the accepted part and each side's excess). A graded run leaves it out. */
  readonly scaffold: boolean
  /** Draw what went out: the live meter. A graded run that hides it leaves it out. */
  readonly outcome: boolean
}

/**
 * The axis every row shares: axis.ts's `axisOf`, which the diagram holds. It is written out here because a module that the page and the
 * scene both imported would join the page's chunk, and the scene would reach the whole game through it (tests/play/verifier-scene.test.ts
 * holds the two to the same figure).
 */
const axisOf = (view: VerifierView): number => Math.max(8, Math.ceil(Math.max(...view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])])) / 8) * 8)

/** The parts of a bar, with the role and form each is drawn in (the 2D diagram's colours, hatching and glyphs). */
export const PART: Record<'draft' | 'target' | 'accepted' | 'residual', { role: ColorRoleName; form: MarkForm }> = {
  draft: { role: 'probability-draft', form: 'marked' },
  target: { role: 'probability-target', form: 'solid' },
  accepted: { role: 'probability-overlap', form: 'solid' },
  residual: { role: 'probability-residual', form: 'groove' },
}

/** How far the output's collar stands out from the bar and how tall it is, and how big a drawn round's dot is and how far it stands off the bar, in px. */
export const RING = { out: 2.5, height: 3 } as const
const DOT = { size: 7, off: 2.5 } as const
/** The value scale: where its post stands past the last token, how long a tick is, and how far its ticks stand apart, in sixty-fourths. */
export const SCALE = { off: 14, tick: 6, step: 8 } as const

export interface Skyline {
  readonly model: FlatModel
  /** The rows drawn (the cameras frame them). */
  readonly rows: number
}

interface Column {
  readonly x0: number
  readonly x1: number
}

/** The base plate and the paper on it, round a drawing's bounds. */
function platesOf(bounds: Bounds, pad: number): FlatBox[] {
  return [
    { id: 'plate/base', x0: bounds.x0 - pad, x1: bounds.x1 + pad, z0: bounds.z0 - pad, z1: bounds.z1 + pad, y0: -8, height: 7.4, role: 'surface-2', form: 'solid', shadow: false },
    { id: 'plate/sheet', ...bounds, y0: -0.6, height: 0.6, role: 'paper', form: 'solid', shadow: false },
  ]
}

/** A bar of one or two parts, from its foot: the part's id, how tall (in px) and what it is. */
function stack(id: string, x: Column, z0: number, z1: number, parts: readonly { part: keyof typeof PART; height: number }[]): FlatBox[] {
  let y = 0
  const out: FlatBox[] = []
  for (const { part, height } of parts) {
    if (height <= 0) continue
    out.push({ id: `${id}/${part}`, x0: x.x0, x1: x.x1, z0, z1, y0: y, height, role: PART[part].role, form: PART[part].form })
    y += height
  }
  return out
}

/** The collar that is the sampler's output round a bar: a thin hollow band at the output's height. */
function collar(id: string, x: Column, z0: number, z1: number, out: number): FlatBox {
  return { id, x0: x.x0 - RING.out, x1: x.x1 + RING.out, z0: z0 - RING.out, z1: z1 + RING.out, y0: Math.max(0, out), height: RING.height, role: 'text-1', form: 'hollow', shadow: false }
}

/**
 * The value scale at the front row's right end, as inks: the post, a tick every eight sixty-fourths, and the numbers of the ticks it has
 * room to print (every sixteenth).
 */
function scaleOf(axis: number, scale: number, x: number, z: number): { inks: FlatSegment[]; labels: FlatLabel[] } {
  const inks: FlatSegment[] = [{ x0: x, z0: z, x1: x, z1: z, y: 0, y1: axis * scale }]
  const labels: FlatLabel[] = []
  for (let v = 0; v <= axis; v += SCALE.step) {
    inks.push({ x0: x - SCALE.tick, z0: z, x1: x, z1: z, y: v * scale })
    if (v % 16 === 0) labels.push({ id: `scale-${v}`, at: [x, v * scale, z], text: String(v), kind: 'axis', place: 'right' })
  }
  return { inks, labels }
}

/**
 * The skylines of a view. `settled` says where the collar of a view that has put nothing out stands: at the foot (true, for the view an
 * authored move starts from, so that the first rounds' collars rise out of the paper) or not drawn (false).
 */
export function skylineOf(view: VerifierView, flags: SceneFlags, settled = false): Skyline {
  const n = Math.max(1, view.rows.length)
  const axis = view.rows.length === 0 ? 8 : axisOf(view)
  const scale = GEO.height / axis
  const ox = GEO.names
  const tokensX1 = ox + view.dishes.length * GEO.col
  const bounds: Bounds = { x0: 0, x1: tokensX1 + GEO.scale, z0: 0, z1: (n - 1) * GEO.row + GEO.depth + GEO.tags }
  const boxes: FlatBox[] = []
  const wires: FlatBox[] = []
  const labels: FlatLabel[] = []
  const rules: FlatSegment[] = []
  const bars = (t: number): { q: Column; p: Column } => {
    const x = ox + t * GEO.col + (GEO.col - 2 * GEO.bar - GEO.gap) / 2
    return { q: { x0: x, x1: x + GEO.bar }, p: { x0: x + GEO.bar + GEO.gap, x1: x + 2 * GEO.bar + GEO.gap } }
  }
  view.rows.forEach((row: RowView, r) => {
    // The first row stands nearest the viewer, so the later rows stand behind it.
    const z0 = (n - 1 - r) * GEO.row
    const z1 = z0 + GEO.depth
    const mid = (z0 + z1) / 2
    const split = flags.scaffold && row.agreed !== null
    // The row's name on the left, in the label column, and its footing rule.
    labels.push({ id: `row-${r}`, at: [ox - 24, 0, z1], text: row.label, kind: 'row', place: 'left' })
    rules.push({ x0: ox, z0: z1 + 4, x1: tokensX1, z1: z1 + 4 })
    row.p.forEach((p, t) => {
      const { q: qc, p: pc } = bars(t)
      const q = row.q?.[t] ?? null
      const agreed = split ? (row.agreed?.[t] ?? null) : null
      if (q !== null) {
        const parts = agreed === null ? [{ part: 'draft' as const, height: q * scale }] : [{ part: 'accepted' as const, height: agreed * scale }, { part: 'draft' as const, height: (q - agreed) * scale }]
        boxes.push(...stack(`r${r}/q${t}`, qc, z0, z1, parts))
        if (q > 0) labels.push({ id: `q-${r}-${t}`, at: [(qc.x0 + qc.x1) / 2, q * scale, mid], text: String(q), kind: 'slab', place: 'above' })
      }
      const parts = agreed === null ? [{ part: 'target' as const, height: p * scale }] : [{ part: 'accepted' as const, height: agreed * scale }, { part: 'residual' as const, height: (p - agreed) * scale }]
      boxes.push(...stack(`r${r}/p${t}`, pc, z0, z1, parts))
      // What went out: a collar on the target bar, as high as the output (or at the foot, in the view a move starts from). A token with no
      // p and nothing out has no collar; an output over p stands on a dashed outline of the bar carried up to it.
      const raw = flags.outcome ? (row.out?.[t] ?? (settled ? 0 : null)) : null
      const out = raw === null || (p === 0 && raw === 0) ? null : raw
      let top = p * scale
      if (out !== null) {
        boxes.push(collar(`r${r}/out${t}`, pc, z0, z1, out * scale))
        if (out > p) wires.push({ id: `r${r}/over${t}`, x0: pc.x0, x1: pc.x1, z0, z1, y0: p * scale, height: (out - p) * scale, role: 'text-2', form: 'hollow', shadow: false })
        top = Math.max(top, out * scale + RING.height)
      }
      // The count stands over the bar, or over its collar where the output stands higher.
      if (p > 0) labels.push({ id: `p-${r}-${t}`, at: [(pc.x0 + pc.x1) / 2, top, mid], text: String(p), kind: 'slab', place: 'above' })
      // The rounds drawn: dots on the draft bar's front, at their coins' heights.
      for (const m of row.markers) {
        if (m.token !== t || q === null) continue
        const cx = (qc.x0 + qc.x1) / 2
        boxes.push({ id: `r${r}/dot${t}/${m.round}`, x0: cx - DOT.size / 2, x1: cx + DOT.size / 2, z0: z1, z1: z1 + DOT.off, y0: m.height * scale - DOT.size / 2 + 0.5, height: DOT.size, role: 'text-1', form: m.kept ? 'solid' : 'hollow', shadow: false })
      }
    })
  })
  // A token's number under its pair, on the front row's apron.
  const frontZ = bounds.z1 - GEO.tags / 2 + 2
  view.dishes.forEach((_, t) => {
    const { q, p } = bars(t)
    labels.push({ id: `token-${t}`, at: [(q.x0 + p.x1) / 2, 0, frontZ], text: String(t), kind: 'tick', place: 'center' })
  })
  // The value scale, at the front row's right end, on the row's front face.
  const front = scaleOf(axis, scale, tokensX1 + SCALE.off, (n - 1) * GEO.row + GEO.depth)
  labels.push(...front.labels)
  const model: FlatModel = { plates: platesOf(bounds, GEO.pad), boxes, wires, rules, inks: front.inks, cursors: [], labels, bounds }
  return { model, rows: n }
}

/**
 * A label's box in the canvas, in CSS px, from its kind and its text [estimated from verifier.css's faces and sizes, a little generous]:
 * a count is micro numerals on a slip, a row's name the caption face, wrapping at its column's width, and a number the caption numerals.
 */
export function labelBox(label: FlatLabel, at: { x: number; y: number }): { x0: number; x1: number; y0: number; y1: number } {
  const chars = label.text.length
  const [w, h] = label.kind === 'slab' ? [chars * 7 + 9, 15] : label.kind === 'row' ? [chars * 7, 16] : [chars * 8.2 + 2, 16]
  const place = label.place ?? 'center'
  const x0 = place === 'right' ? at.x + 6 : place === 'left' ? at.x - 6 - w : at.x - w / 2
  const y0 = place === 'above' ? at.y - 6 - h : place === 'below' ? at.y + 6 : at.y - h / 2
  return { x0, x1: x0 + w, y0, y1: y0 + h }
}

type Rect = ReturnType<typeof labelBox>
const meets = (a: Rect, b: Rect, pad = 1): boolean => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad

/** Each bar's outline in the canvas, as the box round its eight corners' pictures, with its row. */
function barsOf(model: FlatModel, project: Projector): { row: number; rect: Rect }[] {
  const out: { row: number; rect: Rect }[] = []
  const columns = new Map<string, FlatBox[]>()
  for (const box of model.boxes) {
    const m = /^r(\d+)\/([pq]\d+)\//.exec(box.id)
    if (m === null) continue
    const key = `${m[1]}/${m[2]}`
    columns.set(key, [...(columns.get(key) ?? []), box])
  }
  for (const [key, parts] of columns) {
    const top = Math.max(...parts.map((part) => (part.y0 ?? 0) + part.height))
    const { x0, x1, z0, z1 } = parts[0]
    const points = [x0, x1].flatMap((x) => [0, top].flatMap((y) => [z0, z1].map((z) => project(x, y, z)))).filter((point) => point !== null)
    if (points.length === 0) continue
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    out.push({ row: Number(key.split('/')[0]), rect: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } })
  }
  return out
}

/** The order a shot's labels claim their room in: the tokens' numbers and the rows' names first, then the scale from its foot, then the counts, the front row's first. */
const rank = (label: FlatLabel): number => (label.kind === 'slab' ? Number(label.id.split('-')[1]) : label.kind === 'axis' ? -1 : -2)

/**
 * The labels a shot shows. Over the run, every one that has room. In one draft position and from the side the rows stand behind one
 * another, so their names and the counts of the rows behind would pile on the front row's: only the front row's counts are printed, and
 * the value scale and State as a table carry the rest.
 *
 * With the shot's projection and the canvas, no label is printed over another, over a bar of a row in front of its own, or across the
 * canvas's edge: each takes its room in `rank`'s order, and a count or a number of the scale that would land on a label already placed, on a
 * nearer row's bar, or past the edge (a collar far over its bar, early in a run) is left out; the value scale and the table carry it. The
 * plan's sizes are set so that, on the practice numbers at 1440, nothing is left out (tests/play/verifier-scene.test.ts).
 */
export function labelsFor(model: FlatModel, shot: string, project?: Projector, canvas: Canvas = { width: Infinity, height: Infinity }): readonly FlatLabel[] {
  const shown = shot === 'side' || shot === 'course' ? model.labels.filter((label) => label.kind !== 'row' && (label.kind !== 'slab' || /^[qp]-0-/.test(label.id))) : model.labels
  if (project === undefined) return shown
  const bars = barsOf(model, project)
  const placed: Rect[] = []
  const kept = new Set<string>()
  for (const label of [...shown].sort((a, b) => rank(a) - rank(b))) {
    const at = project(label.at[0], label.at[1], label.at[2])
    if (at === null) continue
    const box = labelBox(label, at)
    const row = rank(label)
    const off = box.x0 < 0 || box.y0 < 0 || box.x1 > canvas.width || box.y1 > canvas.height
    // A count gives way to a nearer row's bar; a number of the scale, to any bar.
    const blocked = bars.some((bar) => (row === -1 || bar.row < row) && meets(box, bar.rect, 0))
    if (row >= -1 && (off || blocked || placed.some((other) => meets(box, other)))) continue
    placed.push(box)
    kept.add(label.id)
  }
  return shown.filter((label) => kept.has(label.id))
}
