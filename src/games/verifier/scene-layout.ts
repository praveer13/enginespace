/*
 * The rejection sampler's skylines (REDESIGN §2.8, §2.9; scene kit's flat track): the session's view turned into the model the scene draws,
 * so the scene adds nothing the session did not compute and decides nothing. No three here: it is tested under Bun, and only the scene's
 * lazy chunk holds it.
 *
 *   - One row of bars for each draft position, the first nearest and the rest behind it, so that the rows' skylines line up into depth.
 *     Over a run the bonus token's row is the last. `gamma` has one row of its positions.
 *   - In a row, each token has two bars side by side, as tall as their counts out of the axis the rows share: the draft's q, then the
 *     target's p. Where a level lets the decomposition print, each bar is cut where the rule cuts it: the accepted part min(p, q), which
 *     both bars share, in the overlap's green; then the draft's excess in the draft's yellow and the residual (p - q)+ in the residual's
 *     red. Uncut, q is the draft's yellow and p the target's blue. The forms carry the part besides its colour: the draft is hatched, the
 *     residual is a groove, the accepted part and the target are solid.
 *   - What the sampler put out is a ring on the target bar, as high as the output: it settles onto p as the rule is exact, and the
 *     scene's one authored move is that settling (FlatTrack's `from`).
 *   - A drawn round is a dot on its q bar's front, at its coin's height: solid where it landed in the accepted part, hollow above it.
 *
 * Every word and number is a label for the DOM layer (D-021): a row's name, a token's number under its pair, and a bar's count over it.
 */
import type { RowView, VerifierView } from '@es/play/verifier/types'
import type { ColorRoleName } from '@/design/tokens'
import type { FlatBox, FlatLabel, FlatModel, FlatSegment } from '@/scene/flat-track'
import type { MarkForm } from '@/scene/marks'
import { GAMMA, geoOf, type Bounds, type Geo } from './scene-plan'

export interface SceneFlags {
  /** Draw each bar's cut (the accepted part and each side's excess). A graded run leaves it out. */
  readonly scaffold: boolean
  /** Draw what went out: the live meter. A graded recipe hides it while the run is on. */
  readonly outcome: boolean
  /** The canvas is narrower than `ROOMY`: a row's name is its number alone, and the counts of several rows are left to the table. */
  readonly narrow?: boolean
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

/** How far the output's ring stands out from the bar, how tall it is, and how big a drawn round's dot is and how far it stands off the bar, in px. */
const RING = { out: 2, height: 2.4 } as const
const DOT = { size: 7, off: 2.5 } as const
/** A token's count is not drawn over a bar in a canvas narrower than this unless the drawing is one row [estimated]: the state table carries every one. */
export const ROOMY = 560

export interface Skyline {
  readonly model: FlatModel
  /** The rows drawn, and the sizes they are drawn at (the cameras frame them). */
  readonly rows: number
  readonly geo: Geo
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
function stack(id: string, x: Column, z0: number, z1: number, parts: readonly { part: keyof typeof PART; height: number }[], pick: string, hollow = false): FlatBox[] {
  let y = 0
  const out: FlatBox[] = []
  for (const { part, height } of parts) {
    if (height <= 0) continue
    out.push({ id: `${id}/${part}`, x0: x.x0, x1: x.x1, z0, z1, y0: y, height, role: PART[part].role, form: hollow ? 'hollow' : PART[part].form, pick })
    y += height
  }
  return out
}

/** The ring that is the sampler's output over a bar: a thin hollow collar at the output's height. */
function ring(id: string, x: Column, z0: number, z1: number, out: number): FlatBox {
  return { id, x0: x.x0 - RING.out, x1: x.x1 + RING.out, z0: z0 - RING.out, z1: z1 + RING.out, y0: Math.max(0, out), height: RING.height, role: 'text-1', form: 'hollow', shadow: false }
}

/**
 * The skylines of a view. `settled` says where the ring of a view that has put nothing out stands: at the foot (true, for the view an
 * authored move starts from, so that the first rounds' ring rises out of the paper) or not drawn (false).
 */
export function skylineOf(view: VerifierView, flags: SceneFlags, settled = false): Skyline {
  return view.level === 'gamma' ? gammaSkyline(view) : rowsSkyline(view, flags, settled)
}

function rowsSkyline(view: VerifierView, flags: SceneFlags, settled: boolean): Skyline {
  const n = Math.max(1, view.rows.length)
  const GEO = geoOf(n, flags.narrow)
  const axis = view.rows.length === 0 ? 8 : axisOf(view)
  const scale = GEO.height / axis
  const ox = n > 1 ? GEO.names : 0
  const bounds: Bounds = { x0: 0, x1: ox + view.dishes.length * GEO.col, z0: 0, z1: (n - 1) * GEO.row + GEO.depth + GEO.tags }
  const boxes: FlatBox[] = []
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
    const split = flags.scaffold && row.agreed !== null
    // The row's name on the left, in the label column, and its footing rule.
    if (n > 1) labels.push({ id: `row-${r}`, at: [GEO.pad / 2, 0, (z0 + z1) / 2], text: flags.narrow ? (row.kind === 'bonus' ? '+' : String(r + 1)) : row.label, kind: 'row', place: 'right' })
    rules.push({ x0: ox, z0: z1 + 4, x1: bounds.x1, z1: z1 + 4 })
    row.p.forEach((p, t) => {
      const { q: qc, p: pc } = bars(t)
      const q = row.q?.[t] ?? null
      const agreed = split ? (row.agreed?.[t] ?? null) : null
      const pick = `col-${t}`
      if (q !== null) {
        const parts = agreed === null ? [{ part: 'draft' as const, height: q * scale }] : [{ part: 'accepted' as const, height: agreed * scale }, { part: 'draft' as const, height: (q - agreed) * scale }]
        boxes.push(...stack(`r${r}/q${t}`, qc, z0, z1, parts, pick))
        if (q > 0) labels.push({ id: `q-${r}-${t}`, at: [(qc.x0 + qc.x1) / 2, q * scale, (z0 + z1) / 2], text: String(q), kind: 'slab', place: 'above', minWidth: n > 1 ? ROOMY : undefined })
      }
      const parts = agreed === null ? [{ part: 'target' as const, height: p * scale }] : [{ part: 'accepted' as const, height: agreed * scale }, { part: 'residual' as const, height: (p - agreed) * scale }]
      boxes.push(...stack(`r${r}/p${t}`, pc, z0, z1, parts, pick))
      if (p > 0) labels.push({ id: `p-${r}-${t}`, at: [(pc.x0 + pc.x1) / 2, p * scale, (z0 + z1) / 2], text: String(p), kind: 'slab', place: 'above', minWidth: n > 1 ? ROOMY : undefined })
      // What went out: a ring on the target bar, as high as the output (or at the foot, in the view a move starts from).
      const out = flags.outcome ? (row.out?.[t] ?? (settled ? 0 : null)) : null
      if (out !== null) boxes.push(ring(`r${r}/out${t}`, pc, z0, z1, out * scale))
      // The rounds drawn: dots on the draft bar's front, at their coins' heights.
      for (const m of row.markers) {
        if (m.token !== t || q === null) continue
        const cx = (qc.x0 + qc.x1) / 2
        boxes.push({ id: `r${r}/dot${t}/${m.round}`, x0: cx - DOT.size / 2, x1: cx + DOT.size / 2, z0: z1, z1: z1 + DOT.off, y0: m.height * scale - DOT.size / 2 + 0.5, height: DOT.size, role: 'text-1', form: m.kept ? 'solid' : 'hollow', shadow: false })
      }
    })
  })
  // A token's number under its pair, on the front row's apron, and the column rules between tokens.
  const frontZ = bounds.z1 - GEO.tags + 8
  view.dishes.forEach((_, t) => {
    const { q, p } = bars(t)
    labels.push({ id: `token-${t}`, at: [(q.x0 + p.x1) / 2, 0, frontZ], text: String(t), kind: 'tick', place: 'below' })
  })
  return { model: finish(boxes, labels, rules, bounds, GEO.pad), rows: n, geo: GEO }
}

/** `gamma`: a bar for each position, cut at the share the target accepts, and a ring at how far the walk reaches. */
function gammaSkyline(view: VerifierView): Skyline {
  const GEO = geoOf(1)
  const gamma = view.gamma
  const alphas = gamma?.alphas.slice(0, gamma.max) ?? []
  const bounds: Bounds = { x0: 0, x1: Math.max(1, alphas.length) * GAMMA.col, z0: 0, z1: GEO.depth + GEO.tags }
  const boxes: FlatBox[] = []
  const labels: FlatLabel[] = []
  const pick = gamma?.pick ?? 0
  let reach = 1
  alphas.forEach((alpha, at) => {
    reach = (reach * alpha) / 1000
    const x0 = at * GAMMA.col + (GAMMA.col - GAMMA.bar) / 2
    const column = { x0, x1: x0 + GAMMA.bar }
    // The positions past the chosen draft length are not drafted: they stand as outlines.
    const hollow = pick >= 1 && at >= pick
    const accepted = (alpha / 1000) * GEO.height
    boxes.push(...stack(`g${at}`, column, 0, GEO.depth, [{ part: 'accepted', height: accepted }, { part: 'draft', height: GEO.height - accepted }], `col-${at}`, hollow))
    boxes.push(ring(`g${at}/reach`, column, 0, GEO.depth, reach * GEO.height))
    labels.push({ id: `token-${at}`, at: [(column.x0 + column.x1) / 2, 0, GEO.depth + 12], text: String(at + 1), kind: 'tick', place: 'below' })
  })
  return { model: finish(boxes, labels, [{ x0: 0, z0: GEO.depth + 4, x1: bounds.x1, z1: GEO.depth + 4 }], bounds, GEO.pad), rows: 1, geo: GEO }
}

function finish(boxes: FlatBox[], labels: FlatLabel[], rules: FlatSegment[], bounds: Bounds, pad: number): FlatModel {
  return { plates: platesOf(bounds, pad), boxes, wires: [], rules, inks: [], cursors: [], labels, bounds }
}

/**
 * The labels a shot shows. Over the run, every one. From the side the rows stand behind one another and their names would pile at the
 * far end, so a row is told by its height; in the side view and in one draft position the counts of the rows behind would stand over the
 * front row's, so only the front row's are printed (the table carries every one).
 */
export function labelsFor(model: FlatModel, shot: string): readonly FlatLabel[] {
  if (shot === 'side' || shot === 'course') return model.labels.filter((label) => label.kind !== 'row' && (label.kind !== 'slab' || /^[qp]-0-/.test(label.id)))
  return model.labels
}
