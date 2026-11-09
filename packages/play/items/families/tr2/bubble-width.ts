/**
 * `tr2.bubble-width`: how long the GPU sits idle between two engine steps, with async scheduling off and on (TR2; KCs `tr2.bubble`
 * and `tr2.async-overlap`). It is W1-T04's reference family: the smallest one that uses every part of the framework (variants and
 * levels, a band, a numeric answer with diagnoses, a choice with a why on every option, a worked solution and a strategy of its own
 * for the blind-strategy gate). ARCHITECTURE §4.2 and the sample lesson name it. W1-T14 holds its keys to the step loop v1: the tests run the loop
 * on each scene's three times and find the key as the gap between two forwards, with async scheduling off and on.
 *
 * The world is the course's own, and every number in it is synthetic. A step has a CPU part and a GPU part:
 *   plan     the CPU's work before the forward (schedule and prepare), in µs;
 *   read     the CPU's work after it (sample, stop check and update), in µs;
 *   forward  the GPU's work, in µs.
 * The CPU's work per step is `plan + read`. With async scheduling off the steps run strictly in turn (WORLD §2.6), so the GPU sits
 * idle for all of the CPU's work. With it on, the CPU does that work while the GPU runs a forward, so the forward hides it, and the
 * GPU idles only for what does not fit: the CPU's work less the forward, or nothing when the forward is the longer. It is the closed
 * form of the front page's tick card, which content/claims/loop.yaml gives (a step of 7 ticks in turn, 4 with overlap), with µs for ticks.
 *
 * What the variants ask:
 *   async-off  the idle gap with overlap off: the CPU's work, all of it (levels 0 to 3);
 *   async-on   the gap with overlap on: the CPU's work less the forward, in a scene where the CPU's work is the longer (levels 0 to 3);
 *   close-it   the smallest change that closes the gap, one of four answers drawn answer first (levels 2 and 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the
 * learner is alone with the numbers, and level 3 asks the question the other way round (a numeric variant is given the step or the
 * gap, and asked for the CPU's work) or in other units (close-it prints milliseconds).
 *
 * The scene is drawn from a grid of round numbers (plan 0.6 to 3 ms, read 0.4 to 2.4 ms, a forward of 4 to 31 ms with overlap off and
 * 35 to 85 % of the CPU's work with it on), and `band` throws out the draws that make a poor question: a phase that dwarfs
 * the other (so the sum is not a one-number question), a forward within 5 % of the CPU's work (so a bare reading of the forward
 * would pass) and a gap under an eighth of the CPU's work (so the overlap hardly shows).
 */
import { below, divRound, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich, text } from '../../rich'
import type { BlindStrategy, ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Response, Rich, Step, VariantSpec } from '../../types'

const FAMILY = 'tr2.bubble-width'
const VERSION = 1
const KC_BUBBLE = 'tr2.bubble'
const KC_OVERLAP = 'tr2.async-overlap'

type VariantId = 'async-off' | 'async-on' | 'close-it'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'async-off', title: 'The gap with async scheduling off', kcs: [KC_BUBBLE], levels: [0, 1, 2, 3] },
  { id: 'async-on', title: 'The gap with async scheduling on', kcs: [KC_OVERLAP], levels: [0, 1, 2, 3] },
  { id: 'close-it', title: 'The smallest change that closes the gap', kcs: [KC_BUBBLE, KC_OVERLAP], levels: [2, 3] },
]

/** The four answers of `close-it`: each is the key of one regime, and a regime is drawn first, so each is right on a quarter of the seeds. */
const REGIMES = ['on', 'cut', 'both', 'none'] as const
type Regime = (typeof REGIMES)[number]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)
const isRegime = (id: unknown): id is Regime => typeof id === 'string' && (REGIMES as readonly string[]).includes(id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Scene {
  readonly variant: VariantId
  readonly plan: number
  readonly read: number
  readonly forward: number
  /** The CPU's work per step: `plan + read`. */
  readonly cpu: number
  /** `close-it` only: which change is the key. */
  readonly regime?: Regime
}

/** A forward that is `permille` out of 1,000 of the CPU's work, to the nearest 100 µs. */
const forwardAt = (cpu: number, permille: number): number => 100 * divRound(cpu * permille, 100_000)

/** The scene a seed draws for a variant. `purpose` names the stream, so a worked example draws other numbers from the same seed. */
function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const plan = 600 + 100 * below(rng, 25)
  const read = 400 + 100 * below(rng, 21)
  const cpu = plan + read
  switch (variant) {
    case 'async-off':
      // The forward is the distractor here: with overlap off it does not change the gap.
      return { variant, plan, read, cpu, forward: 4000 + 1000 * below(rng, 28) }
    case 'async-on':
      // The forward is 35 to 85 % of the CPU's work, so a part of the work always stays exposed.
      return { variant, plan, read, cpu, forward: forwardAt(cpu, 350 + below(rng, 501)) }
    case 'close-it': {
      const regime = REGIMES[below(rng, REGIMES.length)]
      const cpuLonger = regime === 'cut' || regime === 'both'
      // Where the CPU's work is the longer, the forward is 35 to 85 % of it; where it is the shorter, the forward is 1.2 to 4 times it.
      const forward = cpuLonger ? forwardAt(cpu, 350 + below(rng, 501)) : forwardAt(cpu, 1200 + below(rng, 2801))
      return { variant, plan, read, cpu, forward, regime }
    }
  }
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  const { plan, read, cpu, forward } = scene
  // Neither phase dwarfs the other, so the CPU's work is a sum of two numbers that both matter.
  if (Math.min(plan, read) * 4 < Math.max(plan, read)) return false
  switch (scene.variant) {
    case 'async-off':
      // The forward is not within 5 % of the CPU's work: reading the forward off the ticket would not pass.
      return Math.abs(cpu - forward) * 20 > cpu
    case 'async-on':
      // The exposed part is at least an eighth of the CPU's work.
      return (cpu - forward) * 8 >= cpu
    case 'close-it':
      // The two lanes differ by at least 15 % of the longer, so the regime is clear.
      return Math.abs(cpu - forward) * 100 >= Math.max(cpu, forward) * 15
  }
}

/**
 * The model, as arithmetic on one step's three times (any unit, as long as it is one). The first two are the formulas of the front
 * page's claims `loop.world.step-ticks-serial` and `loop.world.step-ticks-overlap` (content/claims/loop.yaml), and the gap is the
 * step less the forward, the only part of it in which the GPU is busy.
 */
export const bubbleModel = {
  /** With async scheduling off: the plan, the forward and the read, one after another. */
  stepOff: (plan: number, read: number, forward: number): number => plan + forward + read,
  /** With it on: the longer of the forward and the CPU's work, because the CPU does its work while the forward runs. */
  stepOn: (plan: number, read: number, forward: number): number => Math.max(forward, plan + read),
  /** The GPU's idle time between two steps with async scheduling off: all of the CPU's work. */
  gapOff: (plan: number, read: number, forward: number): number => bubbleModel.stepOff(plan, read, forward) - forward,
  /** The same with it on: what the forward cannot hide, and nothing when it hides all of it. */
  gapOn: (plan: number, read: number, forward: number): number => bubbleModel.stepOn(plan, read, forward) - forward,
} as const

/** The gap that a scene leaves with async scheduling off, and with it on. */
const gapOff = (scene: Scene): number => bubbleModel.gapOff(scene.plan, scene.read, scene.forward)
const gapOn = (scene: Scene): number => bubbleModel.gapOn(scene.plan, scene.read, scene.forward)

function paramsOf(scene: Scene): Params {
  return { plan: scene.plan, read: scene.read, forward: scene.forward, ...(scene.regime === undefined ? {} : { regime: scene.regime }) }
}

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { plan, read, forward, regime } = item.params
  if (typeof plan !== 'number' || typeof read !== 'number' || typeof forward !== 'number') {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  const base = { variant: item.variant, plan, read, forward, cpu: plan + read }
  return isRegime(regime) ? { ...base, regime } : base
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A number of µs: the scene's own are synthetic, and what is worked out from them is derived. */
const given = (value: number) => num(value, { unit: 'µs', tag: 'synthetic' })
const derived = (value: number) => num(value, { unit: 'µs', tag: 'derived' })

/** How a scene's times are printed. `close-it` at level 3 prints milliseconds, the changed surface, and everything else µs. */
interface Units {
  given(valueUs: number): NumPart
  derived(valueUs: number): NumPart
}
const MICROSECONDS: Units = { given, derived }
const MILLISECONDS: Units = {
  given: (valueUs) => num(valueUs / 1000, { unit: 'ms', tag: 'synthetic', digits: 1 }),
  derived: (valueUs) => num(valueUs / 1000, { unit: 'ms', tag: 'derived', digits: 1 }),
}
const unitsFor = (level: Level): Units => (level === 3 ? MILLISECONDS : MICROSECONDS)

/** `plan + read = cpu`, as the parts of a sentence. */
const cpuSum = (scene: Scene, units: Units = MICROSECONDS) => [units.given(scene.plan), ' + ', units.given(scene.read), ' = ', units.derived(scene.cpu)] as const

/** The steps of a numeric solution, ending in the key. Level 3 runs the model the other way round. */
function numericSteps(scene: Scene, level: Level): Step[] {
  const { forward, cpu } = scene
  if (scene.variant === 'async-off') {
    if (level === 3) {
      return [
        {
          text: rich(
            'With async scheduling off a step is the plan, the forward and the read, one after another, so the CPU\'s share of a step is the step less the forward: ',
            given(cpu + forward),
            ' − ',
            given(forward),
            ' = ',
            derived(cpu),
            '.',
          ),
          result: derived(cpu),
        },
        { text: rich('The GPU is idle for all of the CPU\'s share, ', derived(cpu), ' between two steps.'), result: derived(cpu) },
      ]
    }
    return [
      { text: rich('With async scheduling off, the next step is planned only after this one has been read back, so all of the CPU\'s work falls between two forwards.') },
      { text: rich('The CPU does its work for a step in two parts, the plan and the read: ', ...cpuSum(scene), '.'), result: derived(cpu) },
      { text: rich('The GPU is idle for all of it: ', derived(cpu), ' between two steps. The forward is not part of the gap, because the GPU is busy then.'), result: derived(cpu) },
    ]
  }
  // async-on
  if (level === 3) {
    return [
      { text: rich('With async scheduling on, the GPU idles for what the forward cannot hide: the CPU\'s work less the forward.') },
      { text: rich('So the CPU\'s work is the forward plus the gap: ', given(forward), ' + ', given(gapOn(scene)), ' = ', derived(cpu), '.'), result: derived(cpu) },
    ]
  }
  return [
    { text: rich('With async scheduling on, the CPU does its work for the next step while the forward runs, so the forward hides up to its own length of it.') },
    {
      text: rich('The CPU\'s work for a step is the plan and the read: ', ...cpuSum(scene), '. That is longer than the ', given(forward), ' forward, so it cannot all hide.'),
      result: derived(cpu),
    },
    { text: rich('The forward hides ', given(forward), ' of it, and the rest is exposed: ', derived(cpu), ' − ', given(forward), ' = ', derived(gapOn(scene)), '.'), result: derived(gapOn(scene)) },
  ]
}

/** The text of the option that a regime's key names. */
const OPTION_TEXT: Readonly<Record<Regime, Rich>> = {
  on: rich('Turn async scheduling on'),
  cut: rich('Cut the CPU\'s work to less than the forward'),
  both: rich('Both: turn it on and cut the CPU\'s work'),
  none: rich('None: there is no gap now'),
}

function closeSteps(scene: Scene, level: Level): Step[] {
  const { cpu, forward, regime } = scene
  if (regime === undefined) throw new TypeError(`${FAMILY}: a close-it scene has a regime`)
  const units = unitsFor(level)
  const serial = regime === 'on' || regime === 'both'
  return [
    { text: rich('The CPU\'s work for a step is the plan and the read: ', ...cpuSum(scene, units), ', against a forward of ', units.given(forward), '.'), result: units.derived(cpu) },
    serial
      ? { text: rich('Async scheduling is off, so the GPU idles for all of the CPU\'s work: ', units.derived(gapOff(scene)), ' between two steps.'), result: units.derived(gapOff(scene)) }
      : {
          text: rich('Async scheduling is on, so the forward hides the CPU\'s work as far as it reaches, and the GPU idles for what is left: ', units.derived(gapOn(scene)), ' between two steps.'),
          result: units.derived(gapOn(scene)),
        },
    { text: rich('The smallest change that closes it: ', ...OPTION_TEXT[regime], '.') },
  ]
}

/** Every step of an item's solution, ending in the key, rebuilt from its params. */
function stepsOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'close-it' ? closeSteps(scene, item.level) : numericSteps(scene, item.level)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The choice of `close-it`                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Why an option is right or wrong in a scene: the sentence, and the misconception it encodes when it is a lure. */
function reasonFor(option: Regime, scene: Scene, level: Level): { why: Rich; miss?: string } {
  const regime = scene.regime
  if (regime === undefined) throw new TypeError(`${FAMILY}: a close-it scene has a regime`)
  const units = unitsFor(level)
  const exposed = units.derived(gapOn(scene))
  const work = units.derived(scene.cpu)
  const forward = units.given(scene.forward)
  if (option === regime) {
    switch (regime) {
      case 'on':
        return { why: rich('With async scheduling off the GPU idles for all ', work, ' of the CPU\'s work. Turned on, that work runs during the ', forward, ' forward, and it is the shorter, so none of it is exposed.') }
      case 'cut':
        return { why: rich('Async scheduling is on, but the CPU\'s ', work, ' is longer than the ', forward, ' forward, so ', exposed, ' stays exposed. Cutting the work to less than the forward lets all of it hide.') }
      case 'both':
        return { why: rich('Off, the GPU idles for all ', work, '. On, the forward hides ', forward, ' of it, and the ', exposed, ' that is left needs cutting too.') }
      case 'none':
        return { why: rich('With async scheduling on, the CPU\'s ', work, ' runs during the ', forward, ' forward and fits inside it, so the GPU never waits.') }
    }
  }
  switch (option) {
    case 'on':
      return regime === 'both'
        ? { why: rich('Turning it on hides ', forward, ' of the ', work, ' behind the forward, but ', exposed, ' stays exposed.'), miss: `${FAMILY}.on-leaves-excess` }
        : { why: rich('Async scheduling is on already, so this changes nothing.'), miss: `${FAMILY}.already-on` }
    case 'cut':
      return regime === 'none'
        ? { why: rich('The CPU\'s ', work, ' already fits inside the ', forward, ' forward, so cutting it closes nothing.'), miss: `${FAMILY}.cut-when-fits` }
        : { why: rich('While async scheduling is off the GPU idles for all of the CPU\'s work, however short it gets, so cutting alone cannot close the gap.'), miss: `${FAMILY}.cut-while-serial` }
    case 'both':
      return regime === 'on'
        ? { why: rich('That would close it, but it is not the smallest change: turning async scheduling on is enough, because ', work, ' fits inside the ', forward, ' forward.'), miss: `${FAMILY}.overkill` }
        : regime === 'cut'
          ? { why: rich('Async scheduling is on already, so only the cut is needed.'), miss: `${FAMILY}.overkill` }
          : { why: rich('Async scheduling is on already and the CPU\'s work already fits inside the forward, so nothing is needed.'), miss: `${FAMILY}.overkill` }
    case 'none':
      return regime === 'cut'
        ? { why: rich('There is a gap: ', work, ' of CPU work cannot hide behind a ', forward, ' forward, so ', exposed, ' is exposed.'), miss: `${FAMILY}.sees-no-gap` }
        : { why: rich('There is a gap: with async scheduling off the GPU idles for all ', work, ' of the CPU\'s work.'), miss: `${FAMILY}.sees-no-gap` }
  }
}

function closeOptions(scene: Scene, level: Level, seed: Seed): ChoiceOption[] {
  const options = REGIMES.map((id): ChoiceOption => ({ id, text: OPTION_TEXT[id], ...reasonFor(id, scene, level) }))
  return shuffle(itemRng(FAMILY, 'close-it', level, seed, 'options'), options)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The key of a numeric answer is within 2 % (ASSESSMENT §4.2: arithmetic on given numbers) [estimated]. */
const TOLERANCE = { rel: 0.02 } as const

/** Level 0 shows a whole solution with other numbers, level 1 the words of the first step, and the rest nothing. */
function workedFor(scene: Scene, level: Level, seed: Seed): Step[] {
  if (level === 1) return [{ text: numericSteps(scene, level)[0].text }]
  if (level !== 0) return []
  // The example is another fair scene whose key is not this item's, so that the worked answer cannot be copied.
  const key = scene.variant === 'async-off' ? gapOff(scene) : gapOn(scene)
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    const exampleKey = scene.variant === 'async-off' ? gapOff(example) : gapOn(example)
    if (isFair(example) && exampleKey !== key && example.cpu !== scene.cpu) return numericSteps(example, level)
  }
  return []
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const { plan, read, forward, cpu } = scene
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  const gen = { id: FAMILY, version: VERSION }

  if (scene.variant === 'close-it') {
    const shown = unitsFor(level).given
    const asyncOn = scene.regime === 'cut' || scene.regime === 'none'
    return finishItem(gen, {
      ...base,
      stem: rich('What is the smallest change that leaves the GPU with no idle gap between steps?'),
      givens: [
        { label: 'async scheduling', value: text(asyncOn ? 'on' : 'off') },
        { label: 'plan (CPU, before the forward)', value: shown(plan) },
        { label: 'read (CPU, after the forward)', value: shown(read) },
        { label: 'forward (GPU)', value: shown(forward) },
      ],
      worked: [],
      answer: { kind: 'choice', label: 'the smallest change', options: closeOptions(scene, level, seed), correct: scene.regime ?? 'none' },
    })
  }

  const off = scene.variant === 'async-off'
  let stem: Rich
  let givens: Given[]
  let label: string
  let truth: number
  if (level === 3 && off) {
    stem = rich('In a synthetic engine with async scheduling off, one step takes this long from the start of one forward to the start of the next. How long does the GPU sit idle between two steps?')
    givens = [
      { label: 'one step, end to end', value: given(cpu + forward) },
      { label: 'forward (GPU)', value: given(forward) },
    ]
    label = 'GPU idle per step'
    truth = gapOff(scene)
  } else if (level === 3) {
    stem = rich('In a synthetic engine with async scheduling on, the GPU sits idle between steps for the time given. How long is the CPU\'s work for one step?')
    givens = [
      { label: 'forward (GPU)', value: given(forward) },
      { label: 'idle between steps', value: given(gapOn(scene)) },
    ]
    label = 'CPU work per step'
    truth = cpu
  } else {
    stem = off
      ? rich('In a synthetic engine with async scheduling off, how long does the GPU sit idle between two steps?')
      : rich('In the same synthetic engine with async scheduling on, how long does the GPU sit idle between two steps?')
    givens = [
      { label: 'plan (CPU, before the forward)', value: given(plan) },
      { label: 'read (CPU, after the forward)', value: given(read) },
      { label: 'forward (GPU)', value: given(forward) },
    ]
    label = 'GPU idle per step'
    truth = off ? gapOff(scene) : gapOn(scene)
  }
  return finishItem(gen, {
    ...base,
    stem,
    givens,
    worked: workedFor(scene, level, seed),
    answer: { kind: 'numeric', label, unit: 'µs', truth, tolerance: TOLERANCE },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const { plan, read, forward, cpu } = scene
    if (item.level === 3) {
      if (scene.variant === 'async-off' && near(value, cpu + forward)) {
        return { id: `${FAMILY}.whole-step`, message: rich('You gave the whole step. The GPU is busy for ', given(forward), ' of it, so the gap is what is left.') }
      }
      if (scene.variant === 'async-on' && near(value, gapOn(scene))) {
        return { id: `${FAMILY}.gap-as-work`, message: rich('That is the gap itself. The CPU\'s work is the forward plus the gap, because the forward hides as much of it as it can.') }
      }
      return null
    }
    if (scene.variant === 'async-off') {
      if (near(value, gapOn(scene))) {
        return { id: `${FAMILY}.overlap-applied`, message: rich('That is the answer with async scheduling on. It is off here, so none of the CPU\'s work hides behind the forward.') }
      }
      if (near(value, cpu + forward)) {
        return { id: `${FAMILY}.forward-added`, message: rich('You added the forward. The GPU is busy during it, so it is not part of the gap.') }
      }
      if (near(value, plan) || near(value, read)) {
        return { id: `${FAMILY}.one-phase`, message: rich('You counted one phase. The plan and the read both fall between two forwards.') }
      }
      if (near(value, forward)) {
        return { id: `${FAMILY}.forward-as-gap`, message: rich('That is the forward. The gap is the CPU\'s work between two forwards.') }
      }
      return null
    }
    // async-on
    if (near(value, cpu)) {
      return { id: `${FAMILY}.overlap-ignored`, message: rich('That is the answer with async scheduling off. It is on here, so the forward hides part of the CPU\'s work.') }
    }
    if (value === 0) {
      return { id: `${FAMILY}.all-hidden`, message: rich('Zero would be right if the CPU\'s work fitted inside the forward. Here it is longer, so part of it is exposed.') }
    }
    if (near(-value, gapOn(scene))) {
      return { id: `${FAMILY}.wrong-way-round`, message: rich('You subtracted the wrong way round. The CPU\'s work is the longer, so the exposed part is the CPU\'s work less the forward.') }
    }
    return null
  },
]

/** A habit of the family's own that reads nothing: for `close-it`, always some change, never "none". */
const BLIND: readonly BlindStrategy[] = [
  {
    id: 'always-act',
    describe: 'any option that changes something, never "none"',
    answers: (item): readonly Response[] | null =>
      item.answer.kind === 'choice' ? item.answer.options.filter((option) => option.id !== 'none').map((option): Response => ({ kind: 'choice', pick: option.id })) : null,
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const bubbleWidth: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Bubble width',
  kcs: [KC_BUBBLE, KC_OVERLAP],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => stepsOf(item),
  blind: BLIND,
}
