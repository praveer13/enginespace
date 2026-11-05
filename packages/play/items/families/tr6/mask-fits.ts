/**
 * `tr6.mask-fits`: how much of a grammar mask's fill the GPU ends up waiting for (TR6; KC `tr6.mask-overlap`). It is TR6's graded browser task
 * for the grammar mask, the one ASSESSMENT §4.3 states as "the predicted bubble within ±10% of the model's" and calls `loop/mask`, and it
 * rides on the same model as Service's `mask` level: the step loop's structured-output mask (packages/sim/steploop, `maskFillUs`; WORLD
 * §2.8). A step has a CPU part before the forward (the plan: schedule, prepare, launch), the forward on the GPU, and a CPU part after it (the
 * read: sync and sample), and a structured request adds a bitmask to fill:
 *
 *   rows   every structured request owns a row for each position that may be sampled, one for its next token and one for each draft, so a
 *          step with S such requests and k drafts needs S × (1 + k) rows (claim vllm.mask.fill-rows-per-request). The fill is serial up to
 *          128 structured requests, which every scene here stays under (claim vllm.mask.fill-parallel-threshold). It costs `rows × c` µs.
 *   plain  With async scheduling off, the engine thread fills the mask after it has launched the forward, so the fill runs while the GPU
 *          works (claim vllm.mask.overlap): the step is plan, then the longer of the forward and the fill, then read, and the GPU idles for the
 *          plan, the read and whatever of the fill outlasts the forward. With the fill left until after the forward, none of it hides.
 *   async  With async scheduling on, a structured request's mask needs the token of the step before it, which is still in flight, so the fill
 *          waits until that step has been read back (claim vllm.mask.deferred-sampling). The plan of the next step, the read and the fill are
 *          then one chain of CPU work that has to fit under the forward, and the GPU idles for what does not: plan + read + fill − forward.
 *          Whether the engine would have overlapped the fill is moot, because the fill is deferred either way.
 *
 * Those three are the sim's, to the µs: tests/play/items-tr6-mask-fits.test.ts runs `runStepLoop` on the same numbers (the front page's
 * tick card with its phases set to the scene's, one structured request for each row of the rail) and holds every key to the gap that the
 * run measures in its steady state. The scene is synthetic, and every number in it is [estimated].
 *
 * What the variants ask:
 *   gap       the GPU's idle time between two forwards, with the mask (levels 0 to 2); at level 3 the other way round: the gap is measured,
 *             and the grammar's weight per row is asked for;
 *   fits      how much of the fill the GPU waits for: none of it, part of it or all of it, one outcome in three (levels 1 to 3);
 *   heaviest  the heaviest grammar, in µs a row, that adds no idle time (level 2), and at level 3 how many structured requests one step
 *             can hold at a given weight.
 */
import { below, divRound } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, ItemTag, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, oneOf, PREDICTION, shown, workedPart } from './kit'

const FAMILY = 'tr6.mask-fits'
const VERSION = 1
const KC = 'tr6.mask-overlap'

type VariantId = 'gap' | 'fits' | 'heaviest'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'gap', title: "The GPU's idle gap with a mask", kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'fits', title: 'How much of the fill the GPU waits for', kcs: [KC], levels: [1, 2, 3] },
  { id: 'heaviest', title: 'The heaviest grammar that adds nothing', kcs: [KC], levels: [2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** Where the fill falls: `overlap` and `serial` are the plain step (async scheduling off), `async` is async scheduling on. */
export type Mode = 'overlap' | 'serial' | 'async'
const MODES: readonly Mode[] = ['overlap', 'serial', 'async']
const isMode = (value: unknown): value is Mode => typeof value === 'string' && (MODES as readonly string[]).includes(value)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The model as arithmetic on one step's numbers, all in µs but the counts. The sim's, to the µs (the family's test runs the sim). */
export const maskModel = {
  /** Bitmask rows a step fills: one for each position that may be sampled, for each structured request. */
  rows: (requests: number, drafts: number): number => requests * (1 + drafts),
  /** The fill, serial. */
  fill: (rows: number, rowUs: number): number => rows * rowUs,
  /** The GPU's idle time between two forwards, in a steady state. */
  gap(mode: Mode, plan: number, read: number, forward: number, fill: number): number {
    switch (mode) {
      case 'overlap':
        return plan + read + Math.max(0, fill - forward)
      case 'serial':
        return plan + read + fill
      case 'async':
        return Math.max(0, plan + read + fill - forward)
    }
  },
  /** The same step with no structured request in it. */
  free(mode: Mode, plan: number, read: number, forward: number): number {
    return mode === 'async' ? Math.max(0, plan + read - forward) : plan + read
  },
  /** What the mask adds to the gap. */
  exposed(mode: Mode, plan: number, read: number, forward: number, fill: number): number {
    return maskModel.gap(mode, plan, read, forward, fill) - maskModel.free(mode, plan, read, forward)
  },
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Scene {
  readonly mode: Mode
  readonly plan: number
  readonly read: number
  readonly forward: number
  readonly requests: number
  readonly drafts: number
  readonly rowUs: number
  readonly rows: number
  readonly fill: number
}

const makeScene = (mode: Mode, plan: number, read: number, forward: number, requests: number, drafts: number, rowUs: number): Scene => {
  const rows = maskModel.rows(requests, drafts)
  return { mode, plan, read, forward, requests, drafts, rowUs, rows, fill: maskModel.fill(rows, rowUs) }
}

/** The grids the scene is drawn from, all [estimated]: round numbers, wide enough that a step's gap can be a few hundred µs or a few thousand. */
const REQUESTS = [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64] as const
const ROW_US = [10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200] as const
/** The fill as a share of the forward, in permille, that a scene is drawn at: below 1,000 the fill is the shorter. */
const FILL_SHARE = [350, 500, 650, 800, 1250, 1500, 1900, 2500] as const
/** The forwards a scene may have, in µs [estimated]: a small model's decode step to a large model's. */
const FORWARD = { least: 300, most: 12_000 } as const

/** A time rounded to a round number: the nearest 50 µs below 3,000 µs, and the nearest 100 above. */
const roundTime = (us: number): number => (us < 3000 ? 50 * divRound(us, 50) : 100 * divRound(us, 100))

const drawPlan = (rng: Rng): number => 100 + 25 * below(rng, 25)
const drawRead = (rng: Rng): number => 40 + 10 * below(rng, 27)

/**
 * The scene a seed draws: a mode (one in three, or one in two where the question has no serial case), a fill, and the forward that puts the
 * fill at one of the shares above. It tries again until the scene is a fair question (`isFair`), so the band accepts nearly every seed and
 * the modes stay as even as the draw makes them. `purpose` names the stream.
 */
function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const mode: Mode = variant === 'heaviest' ? (below(rng, 2) === 0 ? 'overlap' : 'async') : MODES[below(rng, MODES.length)]
  let last: Scene | null = null
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const requests = oneOf(rng, REQUESTS)
    const drafts = below(rng, 5)
    const rowUs = oneOf(rng, ROW_US)
    const plan = drawPlan(rng)
    const read = drawRead(rng)
    const fill = maskModel.fill(maskModel.rows(requests, drafts), rowUs)
    const forward = roundTime(divRound(fill * 1000, oneOf(rng, FILL_SHARE)))
    if (forward < FORWARD.least || forward > FORWARD.most) continue
    last = makeScene(mode, plan, read, forward, requests, drafts, rowUs)
    if (isFair(variant, level, last)) return last
  }
  return last ?? makeScene(mode, 200, 100, 800, 12, 0, 40)
}

/** How much of the fill the GPU waits for, in the three words of the question. */
export type Outcome = 'none' | 'part' | 'all'
const OUTCOMES: readonly Outcome[] = ['none', 'part', 'all']

export function outcomeOf(scene: Scene): Outcome {
  const exposed = maskModel.exposed(scene.mode, scene.plan, scene.read, scene.forward, scene.fill)
  if (exposed <= 0) return 'none'
  return exposed >= scene.fill ? 'all' : 'part'
}

/** A scene drawn so that the mask's outcome is `outcome` (answer first), in one of the modes that can give it. */
function drawFits(level: Level, seed: Seed, outcome: Outcome, purpose: string): Scene {
  const rng = itemRng(FAMILY, 'fits', level, seed, purpose)
  const mode: Mode = outcome === 'all' ? (below(rng, 2) === 0 ? 'serial' : 'async') : below(rng, 2) === 0 ? 'overlap' : 'async'
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const requests = oneOf(rng, REQUESTS)
    const drafts = below(rng, 5)
    const rowUs = oneOf(rng, ROW_US)
    const plan = drawPlan(rng)
    const read = drawRead(rng)
    const rows = maskModel.rows(requests, drafts)
    const fill = maskModel.fill(rows, rowUs)
    const cpu = plan + read
    let forward: number
    if (mode === 'serial') forward = roundTime(divRound(fill * 1000, oneOf(rng, FILL_SHARE)))
    else if (mode === 'overlap') forward = roundTime(divRound(fill * 1000, outcome === 'none' ? oneOf(rng, [350, 500, 650, 800]) : oneOf(rng, [1250, 1500, 1900, 2500])))
    else if (outcome === 'none') forward = roundTime(divRound((cpu + fill) * oneOf(rng, [1200, 1400, 1800]), 1000))
    else if (outcome === 'part') forward = roundTime(cpu + divRound(fill * oneOf(rng, [250, 500, 750]), 1000))
    else forward = roundTime(divRound(cpu * oneOf(rng, [500, 700, 850]), 1000))
    if (forward < (mode === 'async' && outcome === 'all' ? 200 : FORWARD.least) || forward > FORWARD.most) continue
    const scene = makeScene(mode, plan, read, forward, requests, drafts, rowUs)
    if (outcomeOf(scene) === outcome) return scene
  }
  const fallback: Record<Outcome, Scene> = {
    none: makeScene('overlap', 200, 100, 1200, 12, 0, 40),
    part: makeScene('overlap', 200, 100, 400, 12, 0, 60),
    all: makeScene('serial', 200, 100, 800, 12, 0, 40),
  }
  return fallback[outcome]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit = 'µs'): NumPart => num(value, { unit, tag: 'synthetic' })
const derived = (value: number, unit = 'µs'): NumPart => num(value, { unit, tag: 'derived' })
/** A count with its noun, which agrees with it: one row, two rows. */
const counted = (value: number, one: string, many: string, tag: ItemTag = 'synthetic'): NumPart => num(value, { unit: value === 1 ? one : many, tag })
const requestsOf = (value: number, tag: ItemTag = 'synthetic'): NumPart => counted(value, 'request', 'requests', tag)
const draftsOf = (value: number, tag: ItemTag = 'synthetic'): NumPart => counted(value, 'draft token', 'draft tokens', tag)
const rowsOf = (value: number, tag: ItemTag = 'derived'): NumPart => counted(value, 'row', 'rows', tag)

/** The sentence that says where the fill falls, without a digit in it. */
function setting(mode: Mode): Rich {
  switch (mode) {
    case 'overlap':
      return rich('With async scheduling off, the engine thread builds the grammar bitmask after it has launched the forward, so the fill runs while the GPU works.')
    case 'serial':
      return rich('With async scheduling off, the engine thread builds the grammar bitmask only after the forward has ended, so none of the fill runs while the GPU works.')
    case 'async':
      return rich('With async scheduling on, the next forward is launched while this one runs, and a structured request\'s bitmask waits until the step before it has been read back.')
  }
}

function givensOf(scene: Scene): Given[] {
  return [
    { label: 'async scheduling', value: text(scene.mode === 'async' ? 'on' : 'off') },
    ...(scene.mode === 'async' ? [] : [{ label: 'the fill runs', value: text(scene.mode === 'overlap' ? 'during the forward' : 'after the forward') }]),
    { label: 'plan (CPU, before the forward)', value: given(scene.plan) },
    { label: 'forward (GPU)', value: given(scene.forward) },
    { label: 'read (CPU, after the forward)', value: given(scene.read) },
    { label: 'structured requests in the step', value: requestsOf(scene.requests) },
    { label: 'draft tokens per request', value: draftsOf(scene.drafts) },
    { label: 'grammar weight per row', value: given(scene.rowUs) },
  ]
}

/** `S × (1 + k) = rows` and `rows × c = fill`: the first two steps of every solution. */
function fillSteps(scene: Scene): Step[] {
  const rowsText =
    scene.drafts === 0
      ? rich('A step with no drafts needs one bitmask row for each structured request: ', requestsOf(scene.requests), ' make ', rowsOf(scene.rows), '.')
      : rich('Each structured request owns a row for its next token and one for each draft, so ', requestsOf(scene.requests), ' with ', draftsOf(scene.drafts), ' each need ', requestsOf(scene.requests), ' × (one plus ', draftsOf(scene.drafts), ') = ', rowsOf(scene.rows), '.')
  return [
    { text: rowsText, result: rowsOf(scene.rows) },
    { text: rich('The engine thread fills them one after another: ', rowsOf(scene.rows), ' × ', given(scene.rowUs), ' = ', derived(scene.fill), '.'), result: derived(scene.fill) },
  ]
}

/** The steps of a `gap` solution (levels 0 to 2), ending in the key. */
function gapSteps(scene: Scene): Step[] {
  const { mode, plan, read, forward, fill } = scene
  const cpu = plan + read
  const key = maskModel.gap(mode, plan, read, forward, fill)
  const out = fillSteps(scene)
  switch (mode) {
    case 'overlap': {
      const over = Math.max(0, fill - forward)
      out.push({
        text:
          over > 0
            ? rich('The fill runs during the ', given(forward), ' forward and outlasts it by ', derived(fill), ' − ', given(forward), ' = ', derived(over), ', which the GPU waits for.')
            : rich('The fill of ', derived(fill), ' fits inside the ', given(forward), ' forward, so the GPU waits for none of it.'),
        result: derived(over),
      })
      out.push({ text: rich('The plan and the read still fall between two forwards: ', given(plan), ' + ', given(read), ' + ', derived(over), ' = ', derived(key), '.'), result: derived(key) })
      return out
    }
    case 'serial':
      out.push({ text: rich('The fill starts only when the forward has ended, so all of it is idle time for the GPU, beside the plan and the read.') })
      out.push({ text: rich(given(plan), ' + ', given(read), ' + ', derived(fill), ' = ', derived(key), '.'), result: derived(key) })
      return out
    case 'async':
      out.push({ text: rich('The plan of the next step, the read of this one and the deferred fill are one chain of CPU work: ', given(plan), ' + ', given(read), ' + ', derived(fill), ' = ', derived(cpu + fill), '.'), result: derived(cpu + fill) })
      out.push({ text: rich('The forward hides ', given(forward), ' of it, and the GPU idles for the rest: ', derived(cpu + fill), ' − ', given(forward), ' = ', derived(key), '.'), result: derived(key) })
      return out
  }
}

/** The steps that find the grammar's weight from a measured gap (level 3 of `gap`), ending in the key. */
function inverseSteps(scene: Scene): Step[] {
  const { mode, plan, read, forward, fill, rows, rowUs } = scene
  const gap = maskModel.gap(mode, plan, read, forward, fill)
  const hidden = mode === 'serial' ? 0 : forward
  return [
    mode === 'serial'
      ? { text: rich('The fill runs after the forward, so the gap is the plan, the read and all of the fill: the fill is ', derived(gap), ' − ', given(plan), ' − ', given(read), ' = ', derived(fill), '.'), result: derived(fill) }
      : { text: rich('The gap is the plan, the read and the part of the fill that the forward does not hide, so the fill is ', derived(gap), ' − ', given(plan), ' − ', given(read), ' + ', given(hidden), ' = ', derived(fill), '.'), result: derived(fill) },
    { text: rich('That is ', rowsOf(rows), ' filled one after another, so each row took ', derived(fill), ' ÷ ', rowsOf(rows), ' = ', derived(rowUs), '.'), result: derived(rowUs) },
  ]
}

/** The two statements that compare a fill with the room it has, for the `fits` solution and the whys. */
function roomSteps(scene: Scene): Step[] {
  const { mode, plan, read, forward, fill } = scene
  const exposed = maskModel.exposed(mode, plan, read, forward, fill)
  const out = fillSteps(scene)
  switch (mode) {
    case 'overlap':
      out.push({
        text:
          fill <= forward
            ? rich('The fill runs during the forward, and ', derived(fill), ' is not longer than ', given(forward), ', so the GPU waits for none of it.')
            : rich('The fill runs during the forward and outlasts it by ', derived(fill), ' − ', given(forward), ' = ', derived(exposed), ', so the GPU waits for that part and not for the rest.'),
        result: derived(exposed),
      })
      return out
    case 'serial':
      out.push({ text: rich('The fill starts after the forward has ended, so the GPU waits for all ', derived(fill), ' of it.'), result: derived(exposed) })
      return out
    case 'async': {
      const cpu = plan + read
      out.push({ text: rich('The plan, the read and the deferred fill are one chain of CPU work, ', given(plan), ' + ', given(read), ' + ', derived(fill), ' = ', derived(cpu + fill), ', against a ', given(forward), ' forward.'), result: derived(cpu + fill) })
      out.push({
        text:
          exposed === 0
            ? rich('The forward hides all of it, so the mask adds no idle time.')
            : cpu >= forward
              ? rich('The plan and the read alone are not shorter than the forward, so the CPU is the limit already and the whole fill of ', derived(fill), ' is idle time that the mask adds.')
              : rich('The forward hides ', derived(forward - cpu), ' of the fill beside the plan and the read, and the other ', derived(exposed), ' is idle time that the mask adds.'),
        result: derived(exposed),
      })
      return out
    }
  }
}

/** The heaviest weight per row, in µs, that adds no idle time; null where no weight does (the fill left to after the forward). */
export function heaviestWeight(scene: Scene): number | null {
  const { mode, plan, read, forward, rows } = scene
  if (mode === 'serial') return null
  const room = mode === 'overlap' ? forward : forward - plan - read
  return room < rows ? null : Math.floor(room / rows)
}

/** The most structured requests one step can hold at the scene's weight and drafts before the fill adds idle time; null where none fits. */
export function heaviestCount(scene: Scene): number | null {
  const { mode, plan, read, forward, drafts, rowUs } = scene
  if (mode === 'serial') return null
  const room = mode === 'overlap' ? forward : forward - plan - read
  const per = (1 + drafts) * rowUs
  return room < per ? null : Math.floor(room / per)
}

/** The steps of a `heaviest` solution: the room the fill has, and how many rows or requests of the scene's weight it holds. */
function heaviestSteps(scene: Scene, atCount: boolean): Step[] {
  const room = scene.mode === 'overlap' ? scene.forward : scene.forward - scene.plan - scene.read
  const per = atCount ? (1 + scene.drafts) * scene.rowUs : scene.rows
  const truth = (atCount ? heaviestCount(scene) : heaviestWeight(scene)) ?? 0
  return [
    scene.mode === 'overlap'
      ? { text: rich('The fill runs during the forward, so it adds no idle time as long as it is not longer than the forward: at most ', given(scene.forward), '.'), result: derived(room) }
      : { text: rich('With async scheduling on, the plan, the read and the fill are one chain that the forward must hide, so the fill has ', given(scene.forward), ' − ', given(scene.plan), ' − ', given(scene.read), ' = ', derived(room), ' to itself.'), result: derived(room) },
    atCount
      ? { text: rich('One structured request costs its rows, one plus ', draftsOf(scene.drafts), ', at ', given(scene.rowUs), ' each: ', derived(per), '. The room holds ', derived(room), ' ÷ ', derived(per), ', and only whole requests count: ', requestsOf(truth, 'derived'), '.'), result: requestsOf(truth, 'derived') }
      : { text: rich('The step fills ', rowsOf(scene.rows), ', so a row may cost at most ', derived(room), ' ÷ ', rowsOf(scene.rows), ', rounded down to a whole µs: ', derived(truth), '.'), result: derived(truth) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Params, and the scene read back                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const paramsOf = (scene: Scene, outcome?: Outcome): Params => ({
  mode: scene.mode,
  plan: scene.plan,
  read: scene.read,
  forward: scene.forward,
  requests: scene.requests,
  drafts: scene.drafts,
  rowUs: scene.rowUs,
  ...(outcome === undefined ? {} : { outcome }),
})

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { mode, plan, read, forward, requests, drafts, rowUs } = item.params
  if (!isMode(mode) || typeof plan !== 'number' || typeof read !== 'number' || typeof forward !== 'number' || typeof requests !== 'number' || typeof drafts !== 'number' || typeof rowUs !== 'number') {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  return makeScene(mode, plan, read, forward, requests, drafts, rowUs)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The wrong answers that a learner gives, and the band                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Wrong {
  readonly id: string
  readonly value: number
  readonly message: Rich
}

/** The answers of `gap` that a misreading of the scene gives, each with the sentence that names the mistake. */
function wrongGaps(scene: Scene): Wrong[] {
  const { mode, plan, read, forward, fill } = scene
  const cpu = plan + read
  const out: Wrong[] = []
  const add = (id: string, value: number, message: Rich): void => void out.push({ id: `${FAMILY}.${id}`, value, message })
  if (mode === 'overlap') {
    add('fill-as-gap', fill, rich('That is the whole fill. It runs during the forward, so only the part that outlasts it is waited for.'))
    add('mask-alone', Math.max(0, fill - forward), rich('That is only what the fill adds. The plan and the read still fall between two forwards.'))
    add('after-assumed', cpu + fill, rich('That is the gap with the fill after the forward. Here it runs during it, so the forward hides the first part of it.'))
    add('all-hidden', cpu, rich('That is the gap with no mask. The fill is longer than the forward, so the part that outlasts it is waited for too.'))
  } else if (mode === 'serial') {
    add('overlap-assumed', cpu + Math.max(0, fill - forward), rich('You let the forward hide the fill. Here the fill starts only after the forward has ended, so none of it is hidden.'))
    add('fill-only', fill, rich('That is only the fill. The plan and the read fall between two forwards as well.'))
    add('no-mask', cpu, rich('That is the gap with no mask. The fill runs after the forward and is idle time for the GPU.'))
  } else {
    add('overlap-assumed', cpu + Math.max(0, fill - forward), rich('You treated the step as a plain one. With async scheduling on, the plan, the read and the deferred fill are one chain, and the forward hides what it can of all three.'))
    add('chain-unhidden', cpu + fill, rich('That is the whole chain of CPU work. The forward hides ', derived(forward), ' of it, and the gap is the rest.'))
    add('no-deferral', Math.max(0, cpu - forward), rich('That is the gap with no mask. The fill is deferred until the step before has been read back, so it adds to the chain of CPU work.'))
  }
  return out
}

const tooClose = (a: number, b: number, key: number): boolean => Math.abs(a - b) * 100 < 15 * Math.abs(key)

/** Whether a scene makes a fair question at `level` (the band): its regime is clear, and the main mistakes land clear of the key. */
function isFair(variant: VariantId, level: Level, scene: Scene): boolean {
  const { mode, plan, read, forward, fill } = scene
  // The regime is clear: the fill is not within a tenth of the forward (or of the chain that the forward has to hide).
  const edge = mode === 'async' ? plan + read + fill - forward : mode === 'overlap' ? fill - forward : forward
  if (mode !== 'serial' && Math.abs(edge) * 10 < forward) return false
  if (variant === 'heaviest') {
    const weight = heaviestWeight(scene)
    const count_ = heaviestCount(scene)
    if (level === 2) return weight !== null && weight >= 5 && weight <= 400 && scene.rowUs !== weight
    return count_ !== null && count_ >= 2 && count_ <= 80 && scene.requests !== count_
  }
  const key = maskModel.gap(mode, plan, read, forward, fill)
  if (key <= 0) return false
  if (level === 3) {
    // The weight is read back from the gap, which tells it only where the gap holds the fill: not where the forward hid all of it.
    if (mode === 'overlap' && fill <= forward) return false
    if (mode === 'async' && plan + read + fill <= forward) return false
    return true
  }
  return wrongGaps(scene).every((wrong) => !tooClose(wrong.value, key, key))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const OPTION_TEXT: Readonly<Record<Outcome, Rich>> = {
  none: rich('None of it: the fill hides'),
  part: rich('Part of it: the rest hides'),
  all: rich('All of it: nothing hides'),
}

/** The reason an option is right or wrong in a scene, and the misconception a wrong one encodes. */
function reasonFor(option: Outcome, scene: Scene): { why: Rich; miss?: string } {
  const truth = outcomeOf(scene)
  const exposed = maskModel.exposed(scene.mode, scene.plan, scene.read, scene.forward, scene.fill)
  if (option === truth) {
    switch (truth) {
      case 'none':
        return { why: rich('The fill of ', derived(scene.fill), scene.mode === 'async' ? ' fits beside the plan and the read under the forward, so the mask adds no idle time.' : ' fits inside the forward, so the GPU waits for none of it.') }
      case 'part':
        return { why: rich('The forward hides some of the fill and not all of it: the GPU waits for ', derived(exposed), ' of the ', derived(scene.fill), '.') }
      case 'all':
        return { why: scene.mode === 'serial' ? rich('The fill starts after the forward has ended, so all ', derived(scene.fill), ' of it is idle time.') : rich('The plan and the read alone already fill the forward, so the CPU is the limit and all ', derived(scene.fill), ' of the fill is idle time that the mask adds.') }
    }
  }
  switch (option) {
    case 'none':
      return scene.mode === 'serial'
        ? { why: rich('The fill starts only after the forward has ended, so the forward cannot hide any of it.'), miss: `${FAMILY}.overlap-assumed` }
        : { why: rich('The fill does not fit: the GPU waits for ', derived(exposed), ' of it.'), miss: `${FAMILY}.fill-fits` }
    case 'part':
      return truth === 'none'
        ? { why: rich('Nothing is left over: the fill of ', derived(scene.fill), ' fits under the forward.'), miss: `${FAMILY}.sees-bubble` }
        : { why: rich('The forward hides nothing of the fill here, so the GPU waits for all of it.'), miss: `${FAMILY}.forward-hides-some` }
    case 'all':
      return truth === 'none'
        ? { why: rich('The fill of ', derived(scene.fill), ' fits under the forward, so the GPU waits for none of it.'), miss: `${FAMILY}.sees-bubble` }
        : { why: rich('The forward hides ', derived(scene.fill - exposed), ' of the ', derived(scene.fill), ', so the GPU waits for only the rest.'), miss: `${FAMILY}.forward-hides-none` }
  }
}

function fitsOptions(scene: Scene, level: Level, seed: Seed): ChoiceOption[] {
  return shown(FAMILY, 'fits', level, seed, OUTCOMES.map((id): ChoiceOption => ({ id, text: OPTION_TEXT[id], ...reasonFor(id, scene) })))
}

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }

  if (variant === 'fits') {
    const outcome = OUTCOMES[drawOutcome(FAMILY, 'fits', level, seed, OUTCOMES.length)]
    const scene = drawFits(level, seed, outcome, 'scene')
    const own = roomSteps(scene)
    return finishItem(gen, {
      ...base,
      params: paramsOf(scene, outcome),
      stem: rich(...setting(scene.mode), ' Compared with the same step with no structured request in it, how much of the mask\'s fill does the GPU end up waiting for?'),
      givens: givensOf(scene),
      worked: workedPart(level, own, (attempt) => {
        const example = drawFits(level, seed, OUTCOMES[(OUTCOMES.indexOf(outcome) + 1 + attempt) % OUTCOMES.length], `example-${attempt}`)
        return outcomeOf(example) === outcome ? null : roomSteps(example)
      }),
      answer: { kind: 'choice', label: 'what the GPU waits for', options: fitsOptions(scene, level, seed), correct: outcome },
    })
  }

  const scene = drawScene(variant, level, seed, 'scene')
  if (variant === 'heaviest') {
    const params = paramsOf(scene)
    const atCount = level === 3
    const truth = (atCount ? heaviestCount(scene) : heaviestWeight(scene)) ?? 0
    const without = givensOf(scene).filter((entry) => entry.label !== (atCount ? 'structured requests in the step' : 'grammar weight per row'))
    return finishItem(gen, {
      ...base,
      params,
      stem: atCount
        ? rich(...setting(scene.mode), ' At the weight and the drafts given, how many structured requests can one step hold before the fill adds idle time?')
        : rich(...setting(scene.mode), ' What is the heaviest grammar, in µs a row, that still adds no idle time?'),
      givens: without,
      worked: [],
      answer: atCount
        ? { kind: 'numeric', label: 'structured requests', unit: 'requests', truth, tolerance: EXACT }
        : { kind: 'numeric', label: 'grammar weight per row', unit: 'µs', truth, tolerance: EXACT },
    })
  }

  // gap
  const key = maskModel.gap(scene.mode, scene.plan, scene.read, scene.forward, scene.fill)
  if (level === 3) {
    const inverse = givensOf(scene).filter((entry) => entry.label !== 'grammar weight per row')
    inverse.push({ label: 'idle between two forwards', value: given(key) })
    return finishItem(gen, {
      ...base,
      params: paramsOf(scene),
      stem: rich(...setting(scene.mode), ' A trace shows the gap given below between two forwards. How much does the engine thread spend on one row of the bitmask?'),
      givens: inverse,
      worked: [],
      answer: { kind: 'numeric', label: 'grammar weight per row', unit: 'µs', truth: scene.rowUs, tolerance: EXACT },
    })
  }
  const own = gapSteps(scene)
  return finishItem(gen, {
    ...base,
    params: paramsOf(scene),
    stem: rich(...setting(scene.mode), ' How long does the GPU sit idle between two forwards?'),
    givens: givensOf(scene),
    worked: workedPart(level, own, (attempt) => {
      const example = drawScene('gap', level, seed, `example-${attempt}`)
      const exampleKey = maskModel.gap(example.mode, example.plan, example.read, example.forward, example.fill)
      return example.mode === scene.mode && isFair('gap', level, example) && exampleKey !== key && example.fill !== scene.fill ? gapSteps(example) : null
    }),
    answer: { kind: 'numeric', label: 'GPU idle between forwards', unit: 'µs', truth: key, tolerance: PREDICTION },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading, solutions, and the family                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.1)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    if (item.variant !== 'gap' || item.level === 3) return null
    const scene = sceneOf(item)
    for (const wrong of wrongGaps(scene)) if (near(value, wrong.value)) return { id: wrong.id, message: wrong.message }
    return null
  },
]

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  if (item.variant === 'fits') return roomSteps(scene)
  if (item.variant === 'heaviest') return heaviestSteps(scene, item.level === 3)
  return item.level === 3 ? [...inverseSteps(scene)] : gapSteps(scene)
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const maskFits: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The grammar mask against the forward',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    if (!isVariant(spec.id)) return false
    // `fits` is drawn answer first, so every seed makes a fair question; the others are screened for their regime and for how far their lures lie from the key.
    return spec.id === 'fits' ? true : isFair(spec.id, level, drawScene(spec.id, level, seed, 'scene'))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => solutionOf(item),
}
