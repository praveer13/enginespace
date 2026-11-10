/**
 * `tr2.step-order`: the calls of one engine step, what each one does and where it waits, and what the GPU does while the CPU makes them (TR2,
 * lesson 1; KCs `tr2.step-calls`: name the calls of one engine step in order, and say which of them launch GPU work and which wait for it, and
 * `tr2.bubble`: say why the GPU idles between engine steps when the CPU's work for the next step is not ready). It is the exit item of lesson 1
 * that asks "for the order of the calls, the lane that runs one, or the idle time before a step".
 *
 * At vLLM v0.33.0 (the course's pin) `EngineCore.step` makes, in this order (claim vllm.step.order), these calls:
 *   schedule             `scheduler.schedule()` chooses the requests and the tokens each gets, out of one budget;
 *   execute_model        `model_executor.execute_model(scheduler_output, non_block=True)` brings the runner's request state up to date, prepares the
 *                        inputs and launches the forward, and returns a future once the launch is queued, without waiting for the GPU (claims
 *                        vllm.step.execute-model-state, vllm.executor.uni-inline);
 *   get_grammar_bitmask  `scheduler.get_grammar_bitmask(scheduler_output)` builds the structured-output mask on the CPU while the forward runs
 *                        (claim vllm.mask.overlap);
 *   future.result        hands back what execute_model returned, which is no output yet when the runner keeps the step's state for a second call
 *                        (claims vllm.step.two-phase, vllm.step.sample-if-none);
 *   sample_tokens        applies the mask, samples the next token of every request and copies the ids to the host, and the engine core's thread does
 *                        not go on until the copy has landed, which is when the forward has ended (claims vllm.executor.uni-blocking-output,
 *                        vllm.async-output.event-sync, vllm.async-output.copy-stream);
 *   update_from_output   `scheduler.update_from_output(...)` reads the step's tokens back into the scheduler, which checks for stops there (claim
 *                        vllm.scheduler.stop-check).
 * The course's model draws the same step as six phases on two lanes: schedule, prepare and launch on the CPU, the forward on the GPU, then sync and
 * sample on the CPU (packages/sim/steploop; ARCHITECTURE §5.3). With async scheduling off the next step is scheduled only when this one has been read
 * back, so the GPU is idle for all of the CPU's work between two forwards.
 *
 * What the variants ask:
 *   order        which list gives the calls in order. Below level 3 the calls of `EngineCore.step`; at level 3 the model's six phases, the same order on
 *                the course's own words. The list is one of four, drawn answer first from the key and three of five lists that each break one rule
 *                (levels 2 and 3);
 *   role         which call does what: a call is described by its work and by what it waits for, and the learner names it, drawn answer first over the
 *                six; at level 3 the call is named and the learner picks what it does (levels 0 to 3);
 *   idle-before  the GPU's idle time before a step from the six phases' times, with async scheduling off: all of the CPU's work and none of the forward;
 *                at level 3 the share of the clock that the GPU is busy, in per cent (levels 0 to 3).
 * At level 0 a worked example with other numbers or another call comes first, at level 1 the first step of the solution is shown (for `role`, the
 * step's calls in order), at level 2 the learner is alone with the question, and level 3 changes the surface as the list above says.
 *
 * tests/play/items-step-order.test.ts holds `idle-before` to the step loop (the gap it finds between two forwards, and the share of the clock),
 * and `order` and `role` to the claims that their reasons cite.
 */
import { below, between, divRound, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich } from '../../rich'
import type { ChoiceOption, Gen, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, derived, drawOutcome, given, shown, workedPart } from './kit'

const FAMILY = 'tr2.step-order'
const VERSION = 1
const KC_CALLS = 'tr2.step-calls'
const KC_BUBBLE = 'tr2.bubble'

type VariantId = 'order' | 'role' | 'idle-before'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'order', title: 'The order of the calls', kcs: [KC_CALLS], levels: [2, 3] },
  { id: 'role', title: 'What a call does and what it waits for', kcs: [KC_CALLS], levels: [0, 1, 2, 3] },
  { id: 'idle-before', title: 'The GPU\'s idle time before a step', kcs: [KC_BUBBLE], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The calls, and the model's phases                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The six calls of one step, in the order the engine makes them (claim vllm.step.order). */
export const CALLS = ['schedule', 'execute_model', 'get_grammar_bitmask', 'future.result', 'sample_tokens', 'update_from_output'] as const
export type Call = (typeof CALLS)[number]

/** The model's six phases, in order (A§5.3). */
export const PHASES = ['schedule', 'prepare', 'launch', 'forward', 'sync', 'sample'] as const
export type Phase = (typeof PHASES)[number]

const slug = (name: string): string => name.replace(/[._]/g, '-')

/** The names of a list as one option: code, joined by arrows. */
const listText = (names: readonly string[]): Rich => rich(...names.flatMap((name, at) => (at === 0 ? [code(name)] : [' → ', code(name)])))

/** What each call does, as the sentence a learner meets it in: the description that `role` gives, and that its solution closes on. */
const DOES: Readonly<Record<Call, { readonly of: Rich; readonly by: Rich }>> = {
  schedule: {
    of: rich('chooses the requests that run in this step, and how many tokens each gets, out of one token budget'),
    by: rich('decides what the step does, and every other call of the step works on its output'),
  },
  execute_model: {
    of: rich('brings the runner\'s request state up to date, prepares the step\'s inputs and launches the forward, and returns a future as soon as the launch is queued'),
    by: rich('hands the forward to the GPU, and does not wait for it to finish'),
  },
  get_grammar_bitmask: {
    of: rich('builds the structured-output mask on the CPU, after the forward has been launched, so that it is computed while the GPU runs'),
    by: rich('does CPU work that overlaps the forward, for the sampling that comes after it'),
  },
  'future.result': {
    of: rich('hands back what execute_model returned, which is no output yet when the runner keeps the step\'s state for a second call'),
    by: rich('gives the result that decides whether the step calls sample_tokens at all: when it is none, the sampling is left for a second call'),
  },
  sample_tokens: {
    of: rich('applies the mask, samples the next token of every request and copies the ids to the host, and the engine core\'s thread does not go on until the copy has landed'),
    by: rich('is where the engine core\'s thread waits for the forward to end, because the copy of the sampled ids cannot land before it'),
  },
  update_from_output: {
    of: rich('reads the step\'s sampled tokens back into the scheduler, which checks there whether any request has stopped'),
    by: rich('is the first to know that a request has stopped, because it is where the step\'s tokens come back to the scheduler'),
  },
}

/** Where a call's work happens and what it waits for, in the words of the lesson's table. */
const LANES: Readonly<Record<Call, Rich>> = {
  schedule: rich('It is CPU work, and it waits for nothing.'),
  execute_model: rich('The CPU brings the state up to date, prepares and launches, and the GPU then runs the forward. The call waits for nothing: it returns once the launch is queued.'),
  get_grammar_bitmask: rich('It is CPU work, and it runs while the forward does. It waits for nothing.'),
  'future.result': rich('It is CPU work. With the default runner the result is none, because the runner keeps the step\'s state for a second call, and the wait for the forward is in that call.'),
  sample_tokens: rich('The CPU applies the mask and launches the sampling, and the GPU samples and copies the ids to the host. The call waits for the copy of the ids, which cannot land before the forward has ended.'),
  update_from_output: rich('It is CPU work, and it needs the sampled ids that the call before it brought back.'),
}

/**
 * A rule that a wrong list breaks, with the reason a learner reads: why the call that comes first has to come first. `list` is the wrong order, built
 * from the right one. The five of the calls, and the five of the model's phases.
 */
interface Lure {
  readonly id: string
  readonly list: readonly string[]
  readonly why: Rich
}

const swap = (names: readonly string[], a: number, b: number): string[] => {
  const out = [...names]
  out[a] = names[b]
  out[b] = names[a]
  return out
}

/** The five wrong lists of the calls: each swaps two neighbours, or moves one call, against a rule of the step. */
const CALL_LURES: readonly Lure[] = [
  {
    id: 'mask-before-launch',
    list: swap(CALLS, 1, 2),
    why: rich('The mask is built after execute_model has launched the forward, so that it is computed while the GPU runs. Built before the launch, it would hold the launch back.'),
  },
  {
    id: 'launch-before-schedule',
    list: swap(CALLS, 0, 1),
    why: rich('execute_model runs what the scheduler chose, so schedule comes first: there is nothing to launch before it.'),
  },
  {
    id: 'sample-before-wait',
    list: swap(CALLS, 3, 4),
    why: rich('sample_tokens is called with the mask only when the result of the future is none, so the future comes first.'),
  },
  {
    id: 'sample-before-mask',
    list: [CALLS[0], CALLS[1], CALLS[4], CALLS[2], CALLS[3], CALLS[5]],
    why: rich('sample_tokens applies the mask, so the mask has to be built before it is called.'),
  },
  {
    id: 'update-before-sample',
    list: swap(CALLS, 4, 5),
    why: rich('update_from_output reads the step\'s tokens back into the scheduler, and sample_tokens is what produces them, so the update comes last.'),
  },
]

/** The five wrong lists of the model's phases. */
const PHASE_LURES: readonly Lure[] = [
  { id: 'forward-before-launch', list: swap(PHASES, 2, 3), why: rich('The forward starts when the launch has queued it, so launch comes before it.') },
  { id: 'launch-before-prepare', list: swap(PHASES, 1, 2), why: rich('The launch queues the work that prepare has made ready, so prepare comes before it.') },
  { id: 'sync-before-forward', list: swap(PHASES, 3, 4), why: rich('The sync brings back the ids that the forward samples, so it cannot come before the forward.') },
  { id: 'sample-before-sync', list: swap(PHASES, 4, 5), why: rich('The sample phase updates the requests from the sampled ids, which the sync brings back, so it comes last.') },
  { id: 'prepare-before-schedule', list: swap(PHASES, 0, 1), why: rich('Prepare builds the inputs for the requests that schedule chose, so schedule comes first.') },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface OrderScene {
  readonly variant: 'order'
  /** Calls below level 3, the model's phases at level 3. */
  readonly phases: boolean
  /** The ids of the three wrong lists among the five. */
  readonly lures: readonly string[]
}

interface RoleScene {
  readonly variant: 'role'
  readonly call: Call
  /** Which of the two descriptions of the call is asked, 0 or 1. At level 3 the call is named and the description is the option, so this is the lure's. */
  readonly phrase: 0 | 1
  /** Level 3 only: the three other calls whose descriptions are the lures. */
  readonly others: readonly Call[]
}

interface IdleScene {
  readonly variant: 'idle-before'
  readonly schedule: number
  readonly prepare: number
  readonly launch: number
  readonly forward: number
  readonly sync: number
  readonly sample: number
}

type Scene = OrderScene | RoleScene | IdleScene

const cpuOf = (scene: IdleScene): number => scene.schedule + scene.prepare + scene.launch + scene.sync + scene.sample

/** The rule of `idle-before`: the GPU idles for all the CPU's work with async scheduling off, and it is busy for the forward alone. */
export const stepModel = {
  idleUs: cpuOf,
  /** The share of the clock that the GPU is busy, in tenths of a per cent. */
  busyPermille: (scene: IdleScene): number => divRound(1000 * scene.forward, scene.forward + cpuOf(scene)),
} as const

function drawOrder(level: Level, seed: Seed, purpose: string): OrderScene {
  const rng = itemRng(FAMILY, 'order', level, seed, purpose)
  const lures = shuffle(rng, level === 3 ? PHASE_LURES : CALL_LURES)
    .slice(0, 3)
    .map((lure) => lure.id)
  return { variant: 'order', phases: level === 3, lures }
}

function drawRole(level: Level, seed: Seed, purpose: string): RoleScene {
  const rng = itemRng(FAMILY, 'role', level, seed, purpose)
  const call = CALLS[drawOutcome(FAMILY, 'role', level, seed, CALLS.length)]
  const phrase = (below(rng, 2) === 0 ? 0 : 1) as 0 | 1
  const others = shuffle(
    rng,
    CALLS.filter((candidate) => candidate !== call),
  ).slice(0, 3)
  return { variant: 'role', call, phrase, others }
}

/**
 * Phase times drawn from grids of round numbers, in µs. At level 3 the share of the clock that the GPU is busy is drawn first, between a fifth and
 * four fifths, and the forward follows from it, to the nearest 100 µs: drawn the other way the shares crowd together and one number would pass a fifth
 * of them.
 */
function drawIdle(level: Level, seed: Seed, purpose: string): IdleScene {
  const rng = itemRng(FAMILY, 'idle-before', level, seed, purpose)
  const schedule = 50 * between(rng, 6, 30)
  const prepare = 10 * between(rng, 5, 40)
  const launch = 10 * between(rng, 2, 30)
  const sync = 10 * between(rng, 2, 20)
  const sample = 10 * between(rng, 5, 60)
  const forwardDrawn = 100 * between(rng, 8, 120)
  const cpu = schedule + prepare + launch + sync + sample
  const busy = between(rng, 200, 800)
  const forward = level === 3 ? Math.max(100, 100 * divRound(cpu * busy, 100 * (1000 - busy))) : forwardDrawn
  return { variant: 'idle-before', schedule, prepare, launch, forward, sync, sample }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  return variant === 'order' ? drawOrder(level, seed, purpose) : variant === 'role' ? drawRole(level, seed, purpose) : drawIdle(level, seed, purpose)
}

function isFair(scene: Scene, level: Level): boolean {
  if (scene.variant !== 'idle-before') return true
  const cpu = cpuOf(scene)
  // The forward is not within 5% of the CPU's work, so reading it off the ticket would not pass; and at level 3 the share is not near either end.
  if (Math.abs(cpu - scene.forward) * 20 <= cpu) return false
  if (level === 3) {
    const busy = stepModel.busyPermille(scene)
    return busy >= 150 && busy <= 850
  }
  return true
}

function paramsOf(scene: Scene): Params {
  switch (scene.variant) {
    case 'order':
      return { phases: scene.phases, lures: scene.lures.join(',') }
    case 'role':
      return { call: scene.call, phrase: scene.phrase, others: scene.others.join(',') }
    case 'idle-before':
      return { schedule: scene.schedule, prepare: scene.prepare, launch: scene.launch, forward: scene.forward, sync: scene.sync, sample: scene.sample }
  }
}

const isCall = (value: unknown): value is Call => typeof value === 'string' && (CALLS as readonly string[]).includes(value)

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  if (item.variant === 'order') {
    if (typeof p.phases !== 'boolean' || typeof p.lures !== 'string') throw new TypeError(`${FAMILY}: the params of order are not a scene`)
    return { variant: 'order', phases: p.phases, lures: p.lures.split(',') }
  }
  if (item.variant === 'role') {
    const others = typeof p.others === 'string' ? p.others.split(',') : []
    if (!isCall(p.call) || (p.phrase !== 0 && p.phrase !== 1) || !others.every(isCall)) throw new TypeError(`${FAMILY}: the params of role are not a scene`)
    return { variant: 'role', call: p.call, phrase: p.phrase, others: others as Call[] }
  }
  const { schedule, prepare, launch, forward, sync, sample } = p
  if (typeof schedule !== 'number' || typeof prepare !== 'number' || typeof launch !== 'number' || typeof forward !== 'number' || typeof sync !== 'number' || typeof sample !== 'number') {
    throw new TypeError(`${FAMILY}: the params of idle-before are not a scene`)
  }
  return { variant: 'idle-before', schedule, prepare, launch, forward, sync, sample }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* order                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const KEY_WHY_CALLS: Rich = rich('The step runs in the order of what each call needs: ', ...listText(CALLS), '. The mask is built while the forward runs, and the update comes last.')
const KEY_WHY_PHASES: Rich = rich('The model\'s step runs in the order of what each phase needs: ', ...listText(PHASES), '. The forward starts when the launch has queued it, and the sample phase comes last.')

function orderSteps(scene: OrderScene): Step[] {
  const names = scene.phases ? PHASES : CALLS
  return scene.phases
    ? [
        { text: rich('The course\'s model draws one step as six phases: schedule, prepare and launch on the CPU, the forward on the GPU, and sync and sample on the CPU.') },
        { text: rich('Each phase needs what the one before it made: prepare builds the inputs for the requests that schedule chose, launch queues them, the forward runs them, sync brings back the ids it sampled, and sample updates the requests from them.') },
        { text: rich('So the order is ', ...listText(names), '.') },
      ]
    : [
        { text: rich('A step needs what each call makes: the scheduler\'s choice, the launched forward, the mask, the future\'s result and the sampled tokens.') },
        { text: rich('At the pin the engine core makes the calls in this order: ', ...listText(names), '. The mask is built after the launch, while the GPU runs, and sample_tokens comes after the future and the mask it applies.') },
        { text: rich('The update comes last, because it reads the sampled tokens back into the scheduler.') },
      ]
}

function orderOptions(scene: OrderScene, level: Level, seed: Seed): ChoiceOption[] {
  const names = scene.phases ? PHASES : CALLS
  const pool = scene.phases ? PHASE_LURES : CALL_LURES
  const lures = scene.lures.map((id) => pool.find((lure) => lure.id === id)).filter((lure): lure is Lure => lure !== undefined)
  // The ids are letters, drawn apart from the lists, so that no id says which list is right.
  const ids = shuffle(itemRng(FAMILY, 'order', level, seed, 'ids'), ['a', 'b', 'c', 'd'])
  const options: ChoiceOption[] = [
    { id: ids[0], text: listText(names), why: scene.phases ? KEY_WHY_PHASES : KEY_WHY_CALLS },
    ...lures.map((lure, at): ChoiceOption => ({ id: ids[at + 1], text: listText(lure.list), why: lure.why, miss: `${FAMILY}.${lure.id}` })),
  ]
  return shown(FAMILY, 'order', level, seed, options)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* role                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The sentence a question gives a call in: the description, as "Which call …". */
const describe = (call: Call, phrase: 0 | 1): Rich => (phrase === 0 ? DOES[call].of : DOES[call].by)

function roleSteps(scene: RoleScene, level: Level): Step[] {
  const order: Step = { text: rich('One step makes these calls, in this order: ', ...listText(CALLS), '. Each has its own work, and one of them is where the thread waits for the GPU.') }
  if (level === 3) {
    return [order, { text: rich(code(scene.call), ' ', ...DOES[scene.call].of, '.') }, { text: rich(...LANES[scene.call]) }]
  }
  return [order, { text: rich(code(scene.call), ' is the call that ', ...describe(scene.call, scene.phrase), '.') }, { text: rich(...LANES[scene.call]) }]
}

function roleOptions(scene: RoleScene, level: Level, seed: Seed): ChoiceOption[] {
  if (level === 3) {
    // The converse: the call is named, and the options are what a call does, one of them this call's.
    const ids = [scene.call, ...scene.others]
    return shown(
      FAMILY,
      'role',
      level,
      seed,
      ids.map(
        (call): ChoiceOption => ({
          id: slug(call),
          text: rich(...DOES[call].of),
          why: call === scene.call ? rich(code(call), ' ', ...DOES[call].of, '. ', ...LANES[call]) : rich('That is what ', code(call), ' does, and this ticket is about ', code(scene.call), '. ', ...LANES[call]),
          ...(call === scene.call ? {} : { miss: `${FAMILY}.${slug(call)}-taken-for-${slug(scene.call)}` }),
        }),
      ),
    )
  }
  return shown(
    FAMILY,
    'role',
    level,
    seed,
    CALLS.map(
      (call): ChoiceOption => ({
        id: slug(call),
        text: rich(code(call)),
        why: call === scene.call ? rich(code(call), ' ', ...DOES[call].of, '. ', ...LANES[call]) : rich(code(call), ' ', ...DOES[call].of, ', and that is not what the question describes. ', ...LANES[call]),
        ...(call === scene.call ? {} : { miss: `${FAMILY}.${slug(call)}-taken-for-${slug(scene.call)}` }),
      }),
    ),
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* idle-before                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

const us = (value: number): NumPart => given(value, 'µs')
const usDerived = (value: number): NumPart => derived(value, 'µs')

function idleSteps(scene: IdleScene, level: Level): Step[] {
  const cpu = cpuOf(scene)
  const sum: Step = {
    text: rich('With async scheduling off, the next step starts only when this one has been read back, so all five CPU phases fall between two forwards: ', us(scene.schedule), ' + ', us(scene.prepare), ' + ', us(scene.launch), ' + ', us(scene.sync), ' + ', us(scene.sample), ' = ', usDerived(cpu), '.'),
  }
  if (level < 3) {
    return [
      { text: rich('The GPU is busy only during the forward, and every CPU phase of a step is a phase in which it waits: the schedule, prepare and launch before the forward, and the sync and the sample after it.') },
      sum,
      { text: rich('So the GPU is idle for ', usDerived(cpu), ' between two forwards, and the ', us(scene.forward), ' forward is not part of that.'), result: usDerived(cpu) },
    ]
  }
  const busy = stepModel.busyPermille(scene) / 10
  return [
    { text: rich('The GPU is busy only during the forward, and the clock of a step is the forward and all the CPU phases, one after another.') },
    sum,
    { text: rich('The GPU is busy for ', us(scene.forward), ' of ', us(scene.forward), ' + ', usDerived(cpu), ' = ', usDerived(scene.forward + cpu), ': ', derived(busy, '%', 1), '.'), result: derived(busy, '%', 1) },
  ]
}

const IDLE_STEM_DESCRIPTION = 'In a synthetic engine one step has six phases: schedule, prepare and launch on the CPU, then the forward on the GPU, then sync and sample on the CPU. Async scheduling is off, so the next step starts only when this one has been read back.'

const idleGivens = (scene: IdleScene): Item['givens'] => [
  { label: 'schedule (CPU)', value: us(scene.schedule) },
  { label: 'prepare (CPU)', value: us(scene.prepare) },
  { label: 'launch (CPU)', value: us(scene.launch) },
  { label: 'forward (GPU)', value: us(scene.forward) },
  { label: 'sync (CPU)', value: us(scene.sync) },
  { label: 'sample (CPU)', value: us(scene.sample) },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'order' ? orderSteps(scene) : scene.variant === 'role' ? roleSteps(scene, item.level) : idleSteps(scene, item.level)
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  if (scene.variant === 'order') {
    const ids = shuffle(itemRng(FAMILY, 'order', level, seed, 'ids'), ['a', 'b', 'c', 'd'])
    return finishItem(gen, {
      ...base,
      stem: scene.phases
        ? rich('The course\'s model draws one engine step as six phases. Which list gives the phases in the order they run?')
        : rich('At vLLM v0.33.0, which list gives the calls that ', code('EngineCore.step'), ' makes, in the order it makes them?'),
      givens: [],
      worked: [],
      answer: { kind: 'choice', label: 'the order', options: orderOptions(scene, level, seed), correct: ids[0] },
    })
  }
  if (scene.variant === 'role') {
    const stem =
      level === 3
        ? rich('At vLLM v0.33.0, which of these is what ', code(scene.call), ' does?')
        : rich('At vLLM v0.33.0, which call of ', code('EngineCore.step'), ' ', ...describe(scene.call, scene.phrase), '?')
    return finishItem(gen, {
      ...base,
      stem,
      givens: [],
      worked: workedPart(level, roleSteps(scene, level), (attempt) => {
        const example = drawRole(level, seed, `example-${attempt}`)
        const other = CALLS[(CALLS.indexOf(scene.call) + 1 + attempt) % CALLS.length]
        return roleSteps({ ...example, call: other, others: example.others.filter((call) => call !== other) }, level)
      }),
      answer: { kind: 'choice', label: level === 3 ? 'what it does' : 'the call', options: roleOptions(scene, level, seed), correct: slug(scene.call) },
    })
  }
  const truth = level < 3 ? cpuOf(scene) : stepModel.busyPermille(scene) / 10
  return finishItem(gen, {
    ...base,
    stem: rich(IDLE_STEM_DESCRIPTION, level < 3 ? ' How long does the GPU sit idle between two forwards?' : ' For what share of the clock is the GPU busy, in per cent?'),
    givens: idleGivens(scene),
    worked: workedPart(level, idleSteps(scene, level), (attempt) => {
      const example = drawIdle(level, seed, `example-${attempt}`)
      const exampleKey = level < 3 ? cpuOf(example) : stepModel.busyPermille(example) / 10
      return isFair(example, level) && exampleKey !== truth ? idleSteps(example, level) : null
    }),
    answer:
      level < 3
        ? { kind: 'numeric', label: 'GPU idle between forwards', unit: 'µs', truth, tolerance: ARITHMETIC }
        : { kind: 'numeric', label: 'share of the clock the GPU is busy', unit: '%', truth, tolerance: ARITHMETIC, digits: 1 },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant !== 'idle-before') return null
    const cpu = cpuOf(scene)
    if (item.level < 3) {
      if (near(value, cpu + scene.forward)) return { id: `${FAMILY}.forward-added`, message: rich('You added the forward. The GPU is busy during it, so it is not part of the gap.') }
      if (near(value, scene.forward)) return { id: `${FAMILY}.forward-as-gap`, message: rich('That is the forward. The gap is the CPU\'s work between two forwards.') }
      if (near(value, scene.schedule + scene.prepare + scene.launch)) {
        return { id: `${FAMILY}.before-only`, message: rich('That counts the phases before the forward. The sync and the sample come after it, and with async scheduling off they also fall before the next forward.') }
      }
      if (near(value, scene.sync + scene.sample)) return { id: `${FAMILY}.after-only`, message: rich('That counts the phases after the forward. The schedule, prepare and launch of the next step fall between two forwards too.') }
      if (near(value, scene.schedule)) return { id: `${FAMILY}.schedule-only`, message: rich('You counted the schedule alone. All five CPU phases fall between two forwards.') }
      return null
    }
    const busy = stepModel.busyPermille(scene) / 10
    if (near(value, 100 - busy)) return { id: `${FAMILY}.idle-share`, message: rich('That is the share of the clock that the GPU waits. The question asks for the share it is busy.') }
    const beforeOnly = (1000 * scene.forward) / (scene.forward + scene.schedule + scene.prepare + scene.launch) / 10
    if (near(value, beforeOnly)) return { id: `${FAMILY}.after-forgotten`, message: rich('You left the sync and the sample out of the clock. With nothing overlapped they are part of every step.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const stepOrder: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'One step, five calls',
  kcs: [KC_CALLS, KC_BUBBLE],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'), level)
  },
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(item),
}
