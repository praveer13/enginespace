/**
 * `tr1.step-budget`: what the next step of an engine holds when requests are decoding and prompts are waiting, in nano-vllm and in vLLM
 * v0.33.0 (TR1; KC `tr1.phases-vs-one-budget`). It is the exit item of TR1's second lesson and one item of its fifth: a ticket gives a queue of
 * running and waiting requests and a token budget, names the engine, and asks what the step holds (W1-report §5). The two engines schedule
 * the same queue in two ways, and each way is a claim about its pin:
 *
 *   nano-vllm   a step is all prefill or all decode (claim nano-vllm.step-shape). Waiting prompts are admitted first, in order, and when any is
 *               scheduled the step returns at once, so the running requests get no token. A prompt is cut to the budget only when it is the
 *               first of the step: a later prompt that does not fit what is left waits for the next step (claim nano-vllm.chunked-prefill-first-only).
 *               A prompt that has all its tokens computed joins the running requests, and a cut one stays at the front of the queue (claims
 *               nano-vllm.prefill-complete-to-running and nano-vllm.partial-chunk-no-token). With nothing waiting the step is a decode step, one
 *               token for each running request (the front page's step has the same shape; the code of `Scheduler.schedule` at bb823b3).
 *   vLLM        there is no prefill phase and no decode phase, only one token budget (claim vllm.scheduler.no-phases). The scheduler serves the
 *               running requests first, one token each, and then the waiting ones, out of the same budget (claim vllm.scheduler.order). With
 *               chunked prefill, which is on by default (claim vllm.scheduler.chunked-prefill-default), a waiting request gets the smaller of the
 *               tokens it still needs and the budget that is left (claim vllm.scheduler.chunk-to-budget), and the long-prefill threshold of
 *               zero caps nothing (claim vllm.scheduler.long-prefill-threshold-default). The step loop of the sim (packages/sim/steploop) is the same
 *               rule, and tests/play/items-tr1-step-budget.test.ts holds this one to it.
 * The cap on sequences is never reached in a scene, no prompt has a cached prefix, and nothing finishes within the steps that are asked about.
 *
 * What the variants ask:
 *   step    how many tokens the next step runs (level 3: the step after it);
 *   holds   what the next step holds, in four statements: the engine's rule and whether a prompt is cut (levels 0 to 2);
 *   left    how many tokens of the waiting prompts are still to compute after the next step (level 3: after two steps) (levels 2 and 3).
 * A scene is drawn by the shape of the outcome, and the engine follows from it where the shape belongs to one. The budget is the most a step
 * can hold, and so a scene where the step is cut is rarer in `step`, whose key would be the budget.
 */
import { between, below, pick, weighted } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, shown, workedPart } from './kit'

const FAMILY = 'tr1.step-budget'
const VERSION = 1
const KC = 'tr1.phases-vs-one-budget'

type VariantId = 'step' | 'holds' | 'left'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'step', title: 'The tokens the next step runs', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'holds', title: 'What the next step holds', kcs: [KC], levels: [0, 1, 2] },
  { id: 'left', title: 'The tokens still waiting after a step', kcs: [KC], levels: [2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The two schedulers                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Engine = 'nano-vllm' | 'vllm'

/** The queue of an engine: how many requests are decoding, and the tokens that each waiting prompt still has to compute, in order. */
export interface Queue {
  readonly decoders: number
  readonly waiting: readonly number[]
}

/** What one step runs: a token for each of `decoders` running requests, and `prompts` tokens of the waiting prompts that come first in the queue. */
export interface StepRun {
  readonly decoders: number
  readonly prompts: readonly number[]
  readonly tokens: number
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

/**
 * nano-vllm's `Scheduler.schedule` (bb823b3): waiting prompts first, in order. A prompt takes the smaller of what it needs and what the budget
 * leaves, but a prompt after the first that does not fit what is left ends the step. When anything was scheduled the step is a prefill step and
 * the running requests get no token; otherwise it is a decode step, one token for each running request.
 */
export function nanoStep(queue: Queue, budget: number): StepRun {
  if (queue.waiting.length === 0) return { decoders: queue.decoders, prompts: [], tokens: queue.decoders }
  const prompts: number[] = []
  let batched = 0
  for (const need of queue.waiting) {
    const remaining = budget - batched
    if (remaining === 0) break
    if (remaining < need && prompts.length > 0) break
    const took = Math.min(need, remaining)
    prompts.push(took)
    batched += took
  }
  return { decoders: 0, prompts, tokens: batched }
}

/**
 * vLLM's `Scheduler.schedule` at v0.33.0: the running requests first, one token each, then the waiting ones in order, each taking the smaller of
 * what it needs and what the one budget has left (chunked prefill is on, and the threshold is 0).
 */
export function vllmStep(queue: Queue, budget: number): StepRun {
  const decoders = Math.min(queue.decoders, budget)
  let remaining = budget - decoders
  const prompts: number[] = []
  for (const need of queue.waiting) {
    if (remaining === 0) break
    const took = Math.min(need, remaining)
    prompts.push(took)
    remaining -= took
  }
  return { decoders, prompts, tokens: decoders + sum(prompts) }
}

const stepOf = (engine: Engine, queue: Queue, budget: number): StepRun => (engine === 'nano-vllm' ? nanoStep(queue, budget) : vllmStep(queue, budget))

/** The queue after a step: a prompt that has all its tokens computed now decodes, and a cut one stays at the front with what is left of it. */
export function afterStep(queue: Queue, run: StepRun): Queue {
  const left: number[] = []
  let finished = 0
  queue.waiting.forEach((need, at) => {
    const took = at < run.prompts.length ? run.prompts[at] : 0
    if (took === need) finished += 1
    else left.push(need - took)
  })
  return { decoders: queue.decoders + finished, waiting: left }
}

/** The runs of the first `count` steps of a queue, and the queue left after them. */
export function plan(engine: Engine, queue: Queue, budget: number, count: number): { runs: StepRun[]; last: Queue } {
  const runs: StepRun[] = []
  let current = queue
  for (let at = 0; at < count; at += 1) {
    const run = stepOf(engine, current, budget)
    runs.push(run)
    current = afterStep(current, run)
  }
  return { runs, last: current }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The shape of the first step, which the scene is drawn from:
 *   nano-all    every waiting prompt fits, and the step runs them whole;
 *   nano-skip   the first prompts fit and a later one does not, so it waits (nano-vllm cuts only the first);
 *   nano-cut    the first prompt is longer than the budget, so it is cut to the budget;
 *   vllm-all    the running requests and every waiting prompt fit one budget;
 *   vllm-cut    the budget runs out, so the last prompt that runs is cut.
 */
export type Shape = 'nano-all' | 'nano-skip' | 'nano-cut' | 'vllm-all' | 'vllm-cut'

const ENGINE_OF: Readonly<Record<Shape, Engine>> = { 'nano-all': 'nano-vllm', 'nano-skip': 'nano-vllm', 'nano-cut': 'nano-vllm', 'vllm-all': 'vllm', 'vllm-cut': 'vllm' }

export interface Scene {
  readonly engine: Engine
  readonly queue: Queue
  /** `max_num_batched_tokens`. */
  readonly budget: number
}

/** The grids a scene is drawn from, all [estimated]: round numbers of the kind a small server is run with. */
const BUDGETS = [512, 768, 1024, 1536, 2048, 3072, 4096] as const
const RUNNING = [2, 3, 4, 5, 6, 8, 10, 12, 16, 24] as const
/** Prompts are multiples of 50 tokens. */
const GRID = 50

const grid = (rng: Rng, least: number, most: number): number => GRID * between(rng, least, Math.max(least, most))

/** The shape of the first step of a scene, read off the model: what it ran, and whether anything waited or was cut. */
export function shapeOf(scene: Scene): Shape {
  const { engine, queue, budget } = scene
  const run = stepOf(engine, queue, budget)
  const whole = run.prompts.length === queue.waiting.length && run.prompts.every((took, at) => took === queue.waiting[at])
  if (engine === 'vllm') return whole ? 'vllm-all' : 'vllm-cut'
  if (whole) return 'nano-all'
  return queue.waiting[0] > budget ? 'nano-cut' : 'nano-skip'
}

/** A scene of one shape, drawn from the stream `rng`, with `size` waiting prompts where a shape allows a choice. The shape is checked against the model, and so is `accept`, and a draw that fails either is made again. */
export function drawScene(shape: Shape, rng: Rng, size?: number, accept: (scene: Scene) => boolean = () => true): Scene {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const budget = pick(rng, BUDGETS)
    const decoders = pick(rng, RUNNING)
    const room = budget - decoders
    let waiting: number[]
    switch (shape) {
      case 'nano-all': {
        const k = size ?? 2 + below(rng, 2)
        waiting = Array.from({ length: k }, () => grid(rng, 2, Math.floor(budget / (GRID * k))))
        break
      }
      case 'nano-skip': {
        const k = size ?? 3 + below(rng, 2)
        const half = Math.floor((budget * 2) / (GRID * 5))
        const first = grid(rng, 2, half)
        const second = grid(rng, 2, half)
        // The third prompt is longer than what the first two leave, so it does not fit.
        const third = budget - first - second + grid(rng, 1, 6)
        waiting = [first, second, third, ...Array.from({ length: k - 3 }, () => grid(rng, 2, 8))]
        break
      }
      case 'nano-cut': {
        const k = size ?? 2 + below(rng, 2)
        waiting = [budget + grid(rng, 1, 10), ...Array.from({ length: k - 1 }, () => grid(rng, 2, 8))]
        break
      }
      case 'vllm-all': {
        const k = size ?? 2 + below(rng, 2)
        waiting = Array.from({ length: k }, () => grid(rng, 2, Math.floor(room / (GRID * k))))
        break
      }
      case 'vllm-cut': {
        const k = size ?? 1 + below(rng, 3)
        waiting = Array.from({ length: k }, (_, at) => (at === 0 ? grid(rng, 2, Math.floor((room * 3) / (GRID * 2))) : grid(rng, 2, 10)))
        break
      }
    }
    const scene: Scene = { engine: ENGINE_OF[shape], queue: { decoders, waiting }, budget }
    if (shapeOf(scene) === shape && accept(scene)) return scene
  }
  throw new RangeError(`${FAMILY}: no scene of the shape ${shape} in 400 draws`)
}

/** The weights of the shapes for each variant and level [estimated]: `step` never cuts at the next step, since a cut step's key is the budget, which the ticket prints. */
function shapeWeights(variant: VariantId, level: Level): Readonly<Partial<Record<Shape, number>>> {
  if (variant === 'holds') return { 'nano-all': 1, 'nano-cut': 1, 'vllm-all': 1, 'vllm-cut': 1 }
  // After two steps a `left` of the skipped prompts is one of the prompts on the ticket, so the second step only leaves a sum behind when a prompt was cut.
  if (variant === 'left') return level === 3 ? { 'nano-cut': 4, 'vllm-cut': 6 } : { 'nano-skip': 4, 'nano-cut': 2, 'vllm-cut': 6 }
  return level === 3 ? { 'nano-skip': 3, 'nano-cut': 3, 'vllm-cut': 4 } : { 'nano-all': 45, 'nano-skip': 10, 'vllm-all': 45 }
}

const SHAPES: readonly Shape[] = ['nano-all', 'nano-skip', 'nano-cut', 'vllm-all', 'vllm-cut']

/** The shape a seed draws for a variant: by the weights, and in `holds` one of four by the answer drawn first. */
function chooseShape(variant: VariantId, level: Level, seed: Seed, purpose = 'shape'): Shape {
  const weights = shapeWeights(variant, level)
  const shapes = SHAPES.filter((shape) => weights[shape] !== undefined)
  if (variant === 'holds') return shapes[drawOutcome(FAMILY, variant, level, seed, shapes.length)]
  return shapes[weighted(itemRng(FAMILY, variant, level, seed, purpose), shapes.map((shape) => weights[shape] ?? 0))]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const NAMES: Readonly<Record<Engine, string>> = { 'nano-vllm': 'nano-vllm', vllm: 'vLLM v0.33.0' }

const given = (value: number, unit: string): NumPart => num(value, { unit, tag: 'synthetic' })
const derived = (value: number, unit: string): NumPart => num(value, { unit, tag: 'derived' })
const tokens = (value: number): NumPart => derived(value, 'tokens')
const requests = (value: number): NumPart => derived(value, value === 1 ? 'request' : 'requests')

const ORDINALS = ['first', 'second', 'third', 'fourth'] as const

/** The scene as lines of the ticket: the running requests, each waiting prompt, and the budget. */
function givensOf(scene: Scene): Given[] {
  return [
    { label: 'running requests, each decoding', value: given(scene.queue.decoders, 'requests') },
    ...scene.queue.waiting.map((need, at): Given => ({ label: `${ORDINALS[at]} waiting prompt`, value: given(need, 'tokens') })),
    { label: 'token budget of a step', value: given(scene.budget, 'tokens') },
  ]
}

const INTRO =
  'Each running request is decoding and needs one token to go on, each waiting prompt has all of its tokens still to compute, no cap on sequences is reached, and no request finishes in these steps. '

/** Token counts as a list in a sentence: "A", "A and B", "A, B and C". */
function listOf(values: readonly number[]): (string | NumPart)[] {
  return values.flatMap((value, at): (string | NumPart)[] => (at === 0 ? [tokens(value)] : [at === values.length - 1 ? ' and ' : ', ', tokens(value)]))
}

/** What one step is, as the solution says it: who runs, and how the budget is spent. */
function describe(engine: Engine, queue: Queue, budget: number, run: StepRun): Rich {
  if (engine === 'nano-vllm') {
    if (queue.waiting.length === 0) return rich('No prompt waits, so the step is a decode step: one token for each of the ', requests(queue.decoders), ', which is ', tokens(run.tokens), '.')
    const start = 'A prompt waits, so the step is a prefill step, and the running requests get no token. '
    if (run.prompts[0] < queue.waiting[0]) return rich(start, 'The first prompt is longer than the budget, so it is cut to the budget, and the step runs ', tokens(run.tokens), '.')
    const waits = run.prompts.length < queue.waiting.length
    return rich(
      start,
      run.prompts.length === 1 ? 'The first prompt fits and is taken whole: ' : 'The prompts are taken in order, ',
      ...listOf(run.prompts),
      waits ? ', and the next prompt does not fit what is left, so it waits, because only the first prompt of a step may be cut. ' : ', and they all fit. ',
      'The step runs ',
      tokens(run.tokens),
      '.',
    )
  }
  const spent = run.prompts.length > 0
  return rich(
    'The ',
    requests(run.decoders),
    ' running are served first, one token each, which is ',
    tokens(run.decoders),
    ', and ',
    tokens(budget - run.decoders),
    ' of the one budget are left. ',
    ...(spent
      ? ['The waiting prompts take what they need, until the budget is spent: ', ...listOf(run.prompts), run.prompts.some((took, at) => took < queue.waiting[at]) ? ', and the last of them is cut to what is left. ' : '. ']
      : ['No budget is left for the waiting prompts. ']),
    'The step runs ',
    tokens(run.tokens),
    '.',
  )
}

/** The rule of the engine's scheduler, which every solution begins with. */
const RULE: Readonly<Record<Engine, string>> = {
  'nano-vllm': "nano-vllm's scheduler admits waiting prompts first and returns at once when it has scheduled one, so a step is all prefill or all decode, and a prompt after the first is never cut.",
  vllm: "vLLM's scheduler has no prefill phase and no decode phase: it serves the running requests first, one token each, and then the waiting ones, all out of one token budget.",
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How many steps a question looks at: the next, or at level 3 the one after it. */
const asksFor = (level: Level): 1 | 2 => (level === 3 ? 2 : 1)

/** The solution of `step`, `left` and `holds`: the rule, each step that the question looks at, and the answer. */
function stepsOf(variant: VariantId, scene: Scene, asks: 1 | 2): Step[] {
  const { runs, last } = plan(scene.engine, scene.queue, scene.budget, asks)
  const steps: Step[] = [{ text: rich(RULE[scene.engine]) }]
  let current = scene.queue
  runs.forEach((run, at) => {
    const next = afterStep(current, run)
    const finished = next.decoders - current.decoders
    // Between two steps: who now decodes, and what each waiting prompt still has to compute.
    const between: Rich =
      at < asks - 1
        ? rich(
            finished > 0 ? ' The prompts that now have all their tokens computed join the running requests: ' : ' No prompt has all its tokens computed yet',
            ...(finished > 0 ? [requests(finished)] : []),
            ...(next.waiting.length > 0 ? [finished > 0 ? '. ' : '. ', 'The waiting prompts have ', ...listOf(next.waiting), ' still to compute.'] : ['. No prompt is left waiting.']),
          )
        : rich('')
    steps.push({ text: rich(...describe(scene.engine, current, scene.budget, run), ...between), ...(variant === 'step' && at === asks - 1 ? { result: tokens(run.tokens) } : {}) })
    current = next
  })
  if (variant === 'left') {
    const left = sum(last.waiting)
    steps.push({ text: left === 0 ? rich('No prompt is left waiting.') : rich('What is left of the waiting prompts adds up to ', tokens(left), '.'), result: tokens(left) })
  }
  return steps
}

/**
 * Whether a scene's key is one a question can be asked for: a key that is one of the numbers on the ticket would be passed by reading it off, and the
 * answer of the step after the next is never a budget that is spent again, nor a `left` of nothing, which would be a constant.
 */
function fairKey(variant: 'step' | 'left', scene: Scene, asks: 1 | 2): boolean {
  const { runs, last } = plan(scene.engine, scene.queue, scene.budget, asks)
  const key = variant === 'step' ? runs[asks - 1].tokens : sum(last.waiting)
  return key > 0 && ![scene.queue.decoders, ...scene.queue.waiting, scene.budget].includes(key)
}

function numericItem(spec: VariantSpec, variant: 'step' | 'left', level: Level, seed: Seed): Item {
  const shape = chooseShape(variant, level, seed)
  const asks = asksFor(level)
  const scene = drawScene(shape, itemRng(FAMILY, variant, level, seed, 'scene'), undefined, (candidate) => fairKey(variant, candidate, asks))
  const { runs, last } = plan(scene.engine, scene.queue, scene.budget, asks)
  const truth = variant === 'step' ? runs[asks - 1].tokens : sum(last.waiting)
  const when = asks === 1 ? 'the next step' : 'the step after the next one'
  const question =
    variant === 'step' ? `How many tokens does ${when} run?` : `After ${asks === 1 ? 'the next step' : 'the next two steps'}, how many tokens of the waiting prompts are still to compute?`
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem: rich('In ', NAMES[scene.engine], ' the queue below is waiting for its next step. ', INTRO, question),
      givens: givensOf(scene),
      worked: workedPart(level, stepsOf(variant, scene, asks), (attempt) => {
        const example = drawScene(chooseShape(variant, level, seed, `example-shape-${attempt}`), itemRng(FAMILY, variant, level, seed, `example-${attempt}`), undefined, (candidate) => fairKey(variant, candidate, asks))
        const other = plan(example.engine, example.queue, example.budget, asks)
        const key = variant === 'step' ? other.runs[asks - 1].tokens : sum(other.last.waiting)
        return key === truth ? null : stepsOf(variant, example, asks)
      }),
      answer: { kind: 'numeric', label: variant === 'step' ? 'tokens in the step' : 'tokens still waiting', unit: 'tokens', truth, tolerance: EXACT },
      params: sceneParams(scene, asks),
    },
  )
}

/* ---- holds ---- */

const OUTCOMES = ['prompts-whole', 'prompt-cut', 'mixed-whole', 'mixed-cut'] as const
type Outcome = (typeof OUTCOMES)[number]

const OUTCOME_OF: Readonly<Record<Shape, Outcome | null>> = { 'nano-all': 'prompts-whole', 'nano-skip': null, 'nano-cut': 'prompt-cut', 'vllm-all': 'mixed-whole', 'vllm-cut': 'mixed-cut' }

const STATEMENT: Readonly<Record<Outcome, string>> = {
  'prompts-whole': 'Only the waiting prompts run, each whole, and the running requests get no token',
  'prompt-cut': 'Only the first waiting prompt runs, cut to the budget, and the running requests get no token',
  'mixed-whole': 'The running requests get a token each, and every waiting prompt runs whole',
  'mixed-cut': 'The running requests get a token each, and the budget runs out before the prompts do, so the last prompt that runs is cut',
}

/** Why a statement is wrong, or right, for a scene of this outcome. */
function reasonFor(picked: Outcome, truth: Outcome): Rich {
  if (picked === truth) {
    return {
      'prompts-whole': rich('nano-vllm takes the waiting prompts first and returns at once, so the step is a prefill step and the running requests wait. Every prompt fits what the budget leaves, so none is cut.'),
      'prompt-cut': rich('nano-vllm takes the waiting prompts first and returns at once, so the running requests wait. The first prompt is longer than the budget, so it is cut to it, and the next prompt waits, since only the first may be cut.'),
      'mixed-whole': rich('vLLM serves the running requests first, one token each, and the waiting prompts after them, out of one budget. The prompts all fit what is left of it, so none is cut.'),
      'mixed-cut': rich('vLLM serves the running requests first, one token each, and the waiting prompts after them, out of one budget. The budget runs out before the prompts do, so the last prompt that runs is cut to what is left.'),
    }[truth]
  }
  const nano = truth === 'prompts-whole' || truth === 'prompt-cut'
  if (nano && (picked === 'mixed-whole' || picked === 'mixed-cut')) return rich('nano-vllm does not mix: a step that has a waiting prompt in it is a prefill step, and the running requests wait for a later step.')
  if (!nano && (picked === 'prompts-whole' || picked === 'prompt-cut')) return rich('vLLM serves the running requests first, one token each, out of the same budget, so they do get a token in this step.')
  if (picked === 'prompts-whole') return rich('The first prompt is longer than the budget, so it is cut, and the second waits.')
  if (picked === 'prompt-cut') return rich('The prompts fit what the budget leaves, so none of them is cut.')
  if (picked === 'mixed-whole') return rich('The running requests take their tokens first, and what is left of the budget is less than the prompts need, so the last prompt that runs is cut.')
  return rich('The running requests and the prompts fit the budget together, so no prompt is cut.')
}

function holdsItem(spec: VariantSpec, level: Level, seed: Seed): Item {
  const shape = chooseShape('holds', level, seed)
  const truth = OUTCOME_OF[shape]
  if (truth === null) throw new RangeError(`${FAMILY}: the shape ${shape} has no statement`)
  const scene = drawScene(shape, itemRng(FAMILY, 'holds', level, seed, 'scene'), 2)
  const options = shown(
    FAMILY,
    'holds',
    level,
    seed,
    OUTCOMES.map((id): ChoiceOption => ({ id, text: rich(STATEMENT[id]), why: reasonFor(id, truth), ...(id === truth ? {} : { miss: `${FAMILY}.${id}-for-${truth}` }) })),
  )
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem: rich('In ', NAMES[scene.engine], ' the queue below is waiting for its next step. ', INTRO, 'What does the next step hold?'),
      givens: givensOf(scene),
      worked: workedPart(level, stepsOf('holds', scene, 1), (attempt) => {
        const other = OUTCOMES[(OUTCOMES.indexOf(truth) + 1 + (attempt % (OUTCOMES.length - 1))) % OUTCOMES.length]
        const shapeOfOther = SHAPES.find((candidate) => OUTCOME_OF[candidate] === other)
        return shapeOfOther === undefined ? null : stepsOf('holds', drawScene(shapeOfOther, itemRng(FAMILY, 'holds', level, seed, `example-${attempt}`), 2), 1)
      }),
      answer: { kind: 'choice', label: 'what the step holds', options, correct: truth },
      params: sceneParams(scene, 1),
    },
  )
}

/* ---- the scene in the params, and back ---- */

function sceneParams(scene: Scene, asks: 1 | 2): Params {
  return { engine: scene.engine, decoders: scene.queue.decoders, waiting: scene.queue.waiting.join(','), budget: scene.budget, asks }
}

/** The scene that an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'params'>): { scene: Scene; asks: 1 | 2 } {
  const { engine, decoders, waiting, budget, asks } = item.params
  const list = typeof waiting === 'string' ? waiting.split(',').map(Number) : []
  const sound = (engine === 'nano-vllm' || engine === 'vllm') && typeof decoders === 'number' && typeof budget === 'number' && (asks === 1 || asks === 2) && list.length > 0 && list.every(Number.isInteger)
  if (!sound) throw new TypeError(`${FAMILY}: the params are not a scene`)
  return { scene: { engine, queue: { decoders, waiting: list }, budget }, asks }
}

/* ---- what a wrong number says ---- */

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const { scene, asks } = sceneOf(item)
    const here = plan(scene.engine, scene.queue, scene.budget, asks)
    const other = plan(scene.engine === 'nano-vllm' ? 'vllm' : 'nano-vllm', scene.queue, scene.budget, asks)
    const asked = (result: { runs: StepRun[]; last: Queue }): number => (item.variant === 'step' ? result.runs[asks - 1].tokens : sum(result.last.waiting))
    if (value === asked(other)) {
      return {
        id: `${FAMILY}.other-engines-rule`,
        message: scene.engine === 'nano-vllm' ? rich('That is what vLLM would give. nano-vllm runs a prefill step with only the prompts in it, and the running requests wait.') : rich('That is what nano-vllm would give. vLLM serves the running requests first, from the same budget, and then the prompts.'),
      }
    }
    if (item.variant === 'step' && asks === 1 && value === scene.budget) return { id: `${FAMILY}.budget-as-step`, message: rich('The budget is the most a step can hold, and this step is not full or is not cut to it.') }
    if (item.variant === 'step' && asks === 1 && value === scene.queue.decoders) return { id: `${FAMILY}.decoders-only`, message: rich('That is one token for each running request, and a waiting prompt is scheduled in this step too.') }
    if (item.variant === 'left' && value === sum(scene.queue.waiting)) return { id: `${FAMILY}.nothing-ran`, message: rich('That is every waiting prompt in full. The step runs some of their tokens, and only the rest is left.') }
    if (item.variant === 'left' && value === 0) return { id: `${FAMILY}.all-ran`, message: rich('The prompts do not all run: the budget is spent, or a prompt does not fit what is left, and so tokens wait.') }
    if (item.variant === 'step' && asks === 2 && value === here.runs[0].tokens) return { id: `${FAMILY}.first-step-only`, message: rich('That is the next step. The question is about the step after it.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const stepBudget: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'One step, two schedulers',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return spec.id === 'holds' ? holdsItem(spec, level, seed) : numericItem(spec, spec.id, level, seed)
  },
  // Every seed makes a fair question: the shape is drawn first, and the scene is drawn until it has that shape.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    const { scene, asks } = sceneOf(item)
    return stepsOf(item.variant, scene, asks)
  },
}
