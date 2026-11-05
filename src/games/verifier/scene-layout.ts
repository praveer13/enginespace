/*
 * The Tasting's kitchen (GAMES.md §2.6 "The Tasting", §10 "3D scene"; scene kit v1): the session's view turned into what the scene
 * draws, so the scene adds nothing the session did not compute and decides nothing. No three here: it is tested under Bun, and only
 * the scene's lazy chunk holds it.
 *
 *   - The room is Service's: floor, tile on two walls, the hood over a cold line, a speed rack, and the pass, here as deep as the run.
 *     Its light, baked into the tile and the floor, is full over the line and the pass, and dims toward the corners, up the wall over
 *     the line and behind the pass.
 *   - Each dish of a course has the commis's stack of plates on its left and the chef's on its right, in her wire dispenser, whose
 *     foot is the target's blue and whose wires stand a few plates over her stack. A plate's edge band is its part (`Band`): in a
 *     practice run the plates both stacks share are the overlap's, the commis's extra the draft's and the chef's extra the residual's;
 *     a graded run's stacks are plain, the commis's the draft's and the chef's the target's.
 *   - A drafted plate is the commis's plate at its coin's height, pulled out of his stack: level and toward the chef and the expo when
 *     she keeps it, tipped away from her when she sends it back. Of the latest rounds, one plate for each place.
 *   - What went out is a ring on the chef's dispenser at the height served, up to the top of its wires.
 *   - `gamma` lays a run of eight stacks across the pass: the plates the walk keeps if it gets that far, and the rest it sends back.
 *     The courses the commis plates stand upright; the rest wait upside down, unplated.
 *   - Three heat lamps hang over where a round begins (the front course), a little behind it so that their light pools on its plates
 *     and not on the pass in front of them, or over `gamma`'s plated run.
 *   - A run's courses are named on tape at the pass's left end, which runs on past the soup for them (scene-plan.ts); a single
 *     course's counts are on one paper tag a dish, hung from the pass's edge under its tape: the commis's plates, then the chef's.
 *
 * Every word and number is a DOM label anchored here (D-021, GAMES.md §2.6 rule 7).
 */
import type { RowView, VerifierView } from '@es/play/verifier/types'
import type { RoomLight } from '@/scene/props/set'
import type { PropSpec } from '@/scene/props/specs'
import { columnX, FRONT, FULL, NAMES, PAIR, PLATE, roomOf, rowZ, stackHeight, TOP, type Plan, type Vec3 } from './scene-plan'

export type Band = 'probability-overlap' | 'probability-draft' | 'probability-residual' | 'probability-target'

export interface Stack {
  readonly id: string
  /** The middle of its foot, on the counter. */
  readonly at: Vec3
  /** Each plate's edge, from the bottom. */
  readonly bands: readonly Band[]
  /** Upside down: plates waiting, not plated (`gamma`, past the run). */
  readonly flipped?: boolean
}

export interface Marker {
  /** One place: the row, the dish and the plate pulled. */
  readonly id: string
  /** The commis's stack's foot, and which of its plates is pulled. */
  readonly at: Vec3
  readonly plate: number
  readonly kept: boolean
  readonly band: Band
  readonly row: number
  /** The latest round that pulled it: a round newer than the scene has seen drops its plates. */
  readonly round: number
}

export interface Ring {
  readonly id: string
  /** The dispenser's foot, and the height of its wires over the counter. */
  readonly at: Vec3
  readonly top: number
  /** What went out of this dish here, in plates out of sixty-four, or null when nothing has (or a graded recipe hides it). */
  readonly out: number | null
}

export interface Tape {
  readonly id: string
  readonly center: Vec3
  readonly size: readonly [number, number]
  readonly rotation: Vec3
  readonly text: string
}

/** A dish's name on the pass's edge, a course's name, and a dish's counts hung under its tape. */
export type AnchorKind = 'tape' | 'row' | 'count'

export interface Anchor {
  readonly id: string
  readonly kind: AnchorKind
  readonly at: Vec3
  /** A tape's words, or a tag's two counts: the commis's plates, then the chef's. */
  readonly text: string
}

export interface LampLight {
  readonly id: string
  readonly at: Vec3
  readonly target: Vec3
}

export interface TastingKitchen {
  readonly items: readonly PropSpec[]
  readonly lights: readonly LampLight[]
  readonly bell: Vec3
  readonly room: RoomLight
}

/** A chef's dispenser: its foot, and how high its wires stand over the counter, a few plates over her stack. */
export interface Dispenser {
  readonly at: Vec3
  readonly top: number
}

export interface TastingScene {
  readonly stacks: readonly Stack[]
  readonly dispensers: readonly Dispenser[]
  readonly rings: readonly Ring[]
  readonly markers: readonly Marker[]
  readonly tapes: readonly Tape[]
  readonly anchors: readonly Anchor[]
  /** Where the heat lamps hang: across the pass over the present, as x and z. */
  readonly lamps: readonly (readonly [number, number])[]
  /** The present has a place: the lamps burn and their light falls. */
  readonly lit: boolean
}

export interface SceneFlags {
  /** Draw each plate's part (the overlap, and each side's extra). A graded run leaves it out. */
  readonly scaffold: boolean
  /** Draw what went out. A graded recipe hides it while the run is on: it is the live meter. */
  readonly outcome: boolean
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The kitchen: what stands still                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const CEILING = 2.95
/** The hood over the line: its top, its skirt's height and its depth from the wall [estimated]. */
const HOOD = { top: 2.38, height: 0.34, depth: 1.05 } as const
const LINE = { depth: 0.8, height: 0.9, width: 0.58 } as const
/**
 * Where the lamps' light leaves them [estimated]: a course's lamp mouth, whatever the run, so that its pool on the counter is about a
 * course deep. Over a run the shades hang higher (scene-plan.ts) and their light still leaves from here, a hand under them.
 */
const LIGHT = 1.84
const STATIONS = ['griddle', 'burners', 'fryer', 'burners', 'griddle'] as const

export function tastingKitchen(plan: Plan, lamps: TastingScene['lamps']): TastingKitchen {
  const { lineZ, wallZ, sideX } = roomOf(plan)
  const lineWidth = STATIONS.length * LINE.width
  // The bell at the pass's front, between the last two dishes, where the shot over the course keeps it.
  const bell: Vec3 = [columnX(plan, plan.columns - 1.5), TOP, FRONT - 0.045]
  const items: PropSpec[] = [
    { kind: 'floor', id: 'floor', at: [0, 0, wallZ / 2 + 1.6], width: 14, depth: 9 },
    { kind: 'tile-wall', id: 'wall', at: [0, 0, wallZ], width: 14, height: 3.1 },
    { kind: 'tile-wall', id: 'side', at: [sideX, 0, wallZ / 2 + 0.6], yaw: Math.PI / 2, width: 1.6 - wallZ, height: 3.1 },
    { kind: 'hood', id: 'hood', at: [0, HOOD.top, wallZ], width: lineWidth + 0.4, depth: HOOD.depth, height: HOOD.height },
    // The hood's lip: a drawn steel bar along its skirt's foot, so the skirt reads as formed sheet over the line and not as a slab.
    { kind: 'rail', id: 'lip', at: [0, HOOD.top - HOOD.height + 0.035, wallZ + HOOD.depth + 0.013], length: lineWidth + 0.4 },
    ...STATIONS.map((kind, s): PropSpec => ({ kind, id: `station-${s}`, at: [(s + 0.5 - STATIONS.length / 2) * LINE.width, 0, lineZ], width: LINE.width - 0.01, depth: LINE.depth, height: LINE.height, channel: s })),
    { kind: 'pass', id: 'pass', at: [plan.x, 0, FRONT - plan.depth / 2], width: plan.width, depth: plan.depth, height: TOP, strip: 0 },
    { kind: 'bell-base', id: 'bell', at: bell },
    ...lamps.map(([x, z], i): PropSpec => ({ kind: 'heat-lamp', id: `lamp-${i}`, at: [x, CEILING, z], drop: CEILING - plan.mouth - 0.2015, hang: 'cord' })),
  ]
  return {
    items,
    lights: lamps.map(([x, z], i) => ({ id: `lamp-${i}`, at: [x, LIGHT, z], target: [x, TOP, z] })),
    bell,
    // Full over the middle of the line and over the pass, easing toward the haze's deep steel two metres further out, a metre up the
    // wall and half a metre behind the pass [estimated]: the wall over the line falls away into the haze and never stops the room, and
    // the floor seen under the pass, through its open shelf, is in its shade.
    room: { x: 0, half: lineWidth / 4, above: LINE.height + 0.25, beyond: plan.back, reach: [2, 1, 0.5], dim: 0.42 },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tasting: what the view says                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A run of plates, each with one edge. */
const run = (count: number, band: Band): Band[] => Array.from({ length: Math.max(0, count) }, () => band)

/**
 * The lamps over `gamma`'s first `count` positions: one over each when they are few, else three spread over them. Each list is made once
 * and kept, so the scene sees the same lamps until the run's length changes, and builds its room again only then.
 */
const gammaLamps = new Map<number, TastingScene['lamps']>()
function lampsOver(plan: Plan, count: number): TastingScene['lamps'] {
  const left = columnX(plan, 0)
  const right = columnX(plan, count - 1)
  const n = Math.min(3, count)
  if (!gammaLamps.has(count)) gammaLamps.set(count, Array.from({ length: n }, (_, i) => [n === 1 ? left : left + ((right - left) * i) / (n - 1), 0] as const))
  return gammaLamps.get(count) ?? []
}

/**
 * Over a course: a lamp over each two dishes, so the whole course stands in their light, hung a little behind it [estimated]. Brushed
 * steel shows a lamp's light on the side of its pool toward the eye, so a lamp over the course itself would light the pass in front of
 * it; from here the light pools on the course's plates and the steel between them.
 */
const ROW_LAMPS: TastingScene['lamps'] = [
  [-0.8, -0.15],
  [0, -0.15],
  [0.8, -0.15],
]

/** How many plates a dispenser's wires stand over the chef's stack [estimated]: room for what went out to show over what she sends. */
const SPARE = 6

/** A strip of tape on the pass's rolled front edge, under a column, tilted back with the edge. */
function edgeTape(plan: Plan, column: number, text: string): Tape {
  return { id: `col-${column}`, center: [columnX(plan, column), TOP - 0.03, FRONT + 0.017], size: [0.19, 0.046], rotation: [-0.45, 0, ((column * 7) % 5) * 0.008 - 0.016], text }
}

/**
 * What stands still, kept while it does not change: the same lists come back for every view of a course, so the scene builds its stacks
 * and dispensers once for the course and not on every draw. One scene lives on a page at a time (the Stage's lease), so one is kept.
 */
let standing: { key: string; stacks: readonly Stack[]; dispensers: readonly Dispenser[] } | null = null
function keep(stacks: readonly Stack[], dispensers: readonly Dispenser[]): { stacks: readonly Stack[]; dispensers: readonly Dispenser[] } {
  const key = JSON.stringify([stacks, dispensers])
  if (standing?.key !== key) standing = { key, stacks, dispensers }
  return standing
}

export function tastingScene(view: VerifierView, plan: Plan, flags: SceneFlags): TastingScene {
  if (plan.kind === 'gamma') return gammaScene(view, plan)
  const stacks: Stack[] = []
  const dispensers: Dispenser[] = []
  const rings: Ring[] = []
  const markers = new Map<string, Marker>()
  const tapes: Tape[] = view.dishes.map((name, d) => edgeTape(plan, d, name))
  const anchors: Anchor[] = []
  const single = view.rows.length === 1
  view.rows.forEach((row: RowView, r) => {
    const z = rowZ(r)
    row.p.forEach((p, d) => {
      const q = row.q?.[d] ?? 0
      const agreed = Math.min(p, q)
      const commis: Vec3 = [columnX(plan, d) - PAIR, TOP, z]
      const chef: Vec3 = [columnX(plan, d) + PAIR, TOP, z]
      if (q > 0) stacks.push({ id: `q${r}-${d}`, at: commis, bands: flags.scaffold ? [...run(agreed, 'probability-overlap'), ...run(q - agreed, 'probability-draft')] : run(q, 'probability-draft') })
      if (p > 0) {
        const chefBands = flags.scaffold && row.q !== null ? [...run(agreed, 'probability-overlap'), ...run(p - agreed, 'probability-residual')] : run(p, 'probability-target')
        stacks.push({ id: `p${r}-${d}`, at: chef, bands: chefBands })
      }
      const top = stackHeight(Math.min(FULL, p + SPARE))
      dispensers.push({ at: chef, top })
      rings.push({ id: `ring${r}-${d}`, at: chef, top, out: flags.outcome && row.out !== null ? row.out[d] : null })
      // A dish's counts on one paper tag, the commis's then the chef's, hung from the pass's edge under the dish's tape: the counter in
      // front of a pair has no room for a tag in front of the tape from a phone's height or level with the counter.
      if (single) anchors.push({ id: `count-${d}`, kind: 'count', at: [columnX(plan, d), TOP - 0.2, FRONT + 0.03], text: `${q} · ${p}` })
    })
    for (const m of row.markers) {
      const q = row.q?.[m.token] ?? 0
      if (q === 0) continue
      const plate = Math.min(q - 1, Math.max(0, Math.floor(m.height)))
      const agreed = Math.min(row.p[m.token], q)
      const id = `${r}:${m.token}:${plate}`
      markers.set(id, {
        id,
        at: [columnX(plan, m.token) - PAIR, TOP, z],
        plate,
        kept: m.kept,
        band: flags.scaffold && plate < agreed ? 'probability-overlap' : 'probability-draft',
        row: r,
        round: Math.max(m.round, markers.get(id)?.round ?? -1),
      })
    }
    // A course's name on the strip left of the soup, each a step further left into depth, so a far name stands clear of the stacks in front.
    if (!single) tapes.push({ id: `row-${r}`, center: [plan.x - plan.width / 2 + NAMES - r * 0.06, TOP + 0.0009, z + 0.02], size: [0.3, 0.045], rotation: [-Math.PI / 2, 0, 0.04 - r * 0.02], text: row.kind === 'bonus' ? "chef's extra" : row.label })
  })
  return {
    ...keep(stacks, dispensers),
    rings,
    markers: [...markers.values()],
    tapes,
    anchors: [...anchors, ...tapeAnchors(tapes)],
    lamps: ROW_LAMPS,
    lit: view.present !== null,
  }
}

/** The words on each strip of tape, anchored at its middle: a dish's, or a course's. */
const tapeAnchors = (tapes: readonly Tape[]): Anchor[] => tapes.map((tape) => ({ id: `tape-${tape.id}`, kind: tape.id[0] === 'r' ? 'row' : 'tape', at: tape.center, text: tape.text }))

/** `gamma`: a stack of sixty-four for each position of the run, the plates the walk keeps if it gets that far, then the rest. */
function gammaScene(view: VerifierView, plan: Plan): TastingScene {
  const gamma = view.gamma
  const pick = gamma?.pick ?? 0
  const stacks: Stack[] = (gamma?.alphas ?? []).slice(0, plan.columns).map((alpha, j) => {
    const kept = Math.round((alpha * FULL) / 1000)
    return { id: `g${j}`, at: [columnX(plan, j), TOP, 0], bands: [...run(kept, 'probability-overlap'), ...run(FULL - kept, 'probability-draft')], flipped: j >= pick }
  })
  const tapes = Array.from({ length: plan.columns }, (_, j) => edgeTape(plan, j, String(j + 1)))
  return {
    ...keep(stacks, []),
    rings: [],
    markers: [],
    tapes,
    anchors: tapeAnchors(tapes),
    lamps: lampsOver(plan, Math.max(1, pick)),
    lit: pick >= 1 && !view.done,
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* What moved                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * How a new view moves the scene: on the bell (rounds drawn: the new rounds' plates drop and the rings settle), as the learner's own
 * change of the recipe or the card (the rings settle, nothing drops), or as a cut (a new level, an undo, the first frame).
 */
export type Change = 'bell' | 'settle' | 'cut'

export function changeOf(before: VerifierView | null, after: VerifierView): Change {
  if (before === null || before.level !== after.level) return 'cut'
  if (after.counters.rounds > before.counters.rounds) return 'bell'
  if (after.counters.rounds < before.counters.rounds && after.counters.rounds > 0) return 'cut'
  return before.gamma?.pick !== after.gamma?.pick ? 'cut' : 'settle'
}

/**
 * The height a ring stands at on a dispenser whose wires stand `top` high, for `out` plates: round the edge of the plate it reaches, on
 * the counter for none, and at the wires' top for more than they hold (the mirror prints every figure).
 */
export const ringHeight = (out: number, top: number): number => Math.min(top - 0.012, Math.max(0.005, (out - 1) * PLATE.pitch + 0.0056))
