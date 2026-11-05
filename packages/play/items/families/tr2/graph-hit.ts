/**
 * `tr2.graph-hit`: what one engine step launches, given the graphs the engine captured (TR2, lesson 5; KC `tr2.graph-replay`: what one
 * CUDA graph replay saves over launching the same kernels one by one, and why it holds only for the shapes that were captured).
 *
 * The world is the course's own, and every number in it is synthetic. A model has `layers` layers, and launched one by one a layer
 * costs `kernels` launches of `launchUs` each on the CPU. A graph captured at a size is replayed in `replayUs`. A step carries
 * some tokens, and the engine pads them up to the smallest captured size that holds them (`graphModel.padded`: the rule of the step
 * loop's `paddedSize`, claim vllm.cudagraph.padding), or launches every kernel when no captured size is big enough. The mode
 * decides which steps may replay at all (claims vllm.cudagraph.mode-routines, vllm.cudagraph.piecewise-attention-outside):
 *   FULL                replays one whole graph for a step;
 *   FULL_DECODE_ONLY    replays a whole graph for a plain decode batch only, and launches every kernel for a step that adds a prompt chunk;
 *   PIECEWISE           replays the graph in pieces, one more piece than the model has layers, and launches each layer's attention
 *                       between them (the step loop's `PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER`).
 * tests/play/items-graph-hit.test.ts holds every rule here to the step loop v1 (`runStepLoop`): the launch it spends and the graph it
 * finds for the same numbers.
 *
 * What the variants ask:
 *   hit-or-miss    which of four outcomes the step has: one replay of the graph at exactly its size (`exact`), one replay padded up to
 *                  a larger captured size (`padded`), the pieces replayed with attention launched between them (`pieces`), or every kernel
 *                  launched one by one (`eager`). The outcome is drawn first, so each is the key on a quarter of the seeds, and `eager`
 *                  has three causes: above the largest size under FULL or FULL_DECODE_ONLY, a prompt chunk under FULL_DECODE_ONLY, and
 *                  above the largest size under PIECEWISE (levels 0 to 3);
 *   launch-saved   the CPU time a replay saves against launching the same kernels one by one, in FULL or PIECEWISE (levels 0 to 3).
 * At level 0 a worked example with another outcome (or other numbers) comes first, at level 1 the first step of the solution is shown,
 * at level 2 the learner is alone with the numbers, and level 3 changes the surface: `hit-or-miss` gives the step as its decode rows and
 * its prompt chunk, so the learner adds them, and `launch-saved` prints its times in milliseconds, as an engine's logs do.
 *
 * `band` throws out the draws that make a poor question: a model with so few layers that the saving is a handful of µs, a saving under
 * a fifth of the eager launch time, and a step of one or two tokens (which any list of sizes holds exactly).
 */
import { below, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { BlindStrategy, ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Response, Rich, Step, VariantSpec } from '../../types'

const FAMILY = 'tr2.graph-hit'
const VERSION = 1
const KC = 'tr2.graph-replay'

type VariantId = 'hit-or-miss' | 'launch-saved'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'hit-or-miss', title: 'What a step launches', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'launch-saved', title: 'The launch time a replay saves', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Mode = 'FULL' | 'FULL_DECODE_ONLY' | 'PIECEWISE'
export type Outcome = 'exact' | 'padded' | 'pieces' | 'eager'

const OUTCOMES: readonly Outcome[] = ['exact', 'padded', 'pieces', 'eager']

/** The host of a scene: what launching costs the CPU. */
export interface Machine {
  readonly layers: number
  readonly kernels: number
  readonly launchUs: number
  readonly replayUs: number
}

/**
 * The rules of the family, as arithmetic on a scene's numbers. They are the step loop v1's (`runStepLoop`): the smallest captured size
 * that holds the tokens, the mode's routines, and the launch phase of a step (`launchUs` below), which the tests read back from the loop.
 */
export const graphModel = {
  /** The smallest captured size that holds `tokens`, or null when every size is smaller. `sizes` ascend. */
  padded(sizes: readonly number[], tokens: number): number | null {
    for (const size of sizes) if (size >= tokens) return size
    return null
  },
  /** What a step launches: the mode's routine for this kind of step, if a captured size holds the tokens. */
  outcome(mode: Mode, mixed: boolean, sizes: readonly number[], tokens: number): Outcome {
    const padded = graphModel.padded(sizes, tokens)
    if (padded === null) return 'eager'
    if (mode === 'PIECEWISE') return 'pieces'
    if (mode === 'FULL_DECODE_ONLY' && mixed) return 'eager'
    return padded === tokens ? 'exact' : 'padded'
  },
  /** Launching every kernel one by one: `kernels` launches a layer. */
  eagerUs: (m: Machine): number => m.kernels * m.layers * m.launchUs,
  /** The launch phase of a step that replays: one replay in FULL, and in PIECEWISE a replay for each of the `layers + 1` pieces and one launch of each layer's attention. */
  replayedUs: (m: Machine, mode: 'FULL' | 'PIECEWISE'): number => (mode === 'FULL' ? m.replayUs : (m.layers + 1) * m.replayUs + m.layers * m.launchUs),
  /** What replaying saves over launching one by one. */
  savedUs: (m: Machine, mode: 'FULL' | 'PIECEWISE'): number => graphModel.eagerUs(m) - graphModel.replayedUs(m, mode),
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface HitScene extends Machine {
  readonly variant: 'hit-or-miss'
  readonly mode: Mode
  readonly sizes: readonly number[]
  readonly tokens: number
  /** The step adds a prompt chunk to the decodes. */
  readonly mixed: boolean
  /** The chunk, for a mixed step: `rows + chunk = tokens`. 0 for a plain decode batch. */
  readonly chunk: number
  readonly outcome: Outcome
}

interface SavedScene extends Machine {
  readonly variant: 'launch-saved'
  readonly mode: 'FULL' | 'PIECEWISE'
}

type Scene = HitScene | SavedScene

/** The sizes a scene may capture from: irregular on purpose, so that the next power of two or the next multiple of eight is not the answer. */
const SIZE_POOL: readonly number[] = [2, 3, 5, 6, 9, 10, 12, 14, 18, 20, 24, 28, 36, 40, 48, 56, 72, 80, 96]

function drawMachine(rng: Rng): Machine {
  return {
    layers: pick(rng, [24, 28, 32, 36, 40]),
    kernels: pick(rng, [10, 12, 14]),
    launchUs: pick(rng, [4, 5, 6, 7, 8, 10]),
    replayUs: pick(rng, [20, 25, 30, 35, 40, 45, 50, 60]),
  }
}

/** Five to seven captured sizes, ascending: a random walk through the pool that always leaves gaps between sizes. */
function drawSizes(rng: Rng): number[] {
  const count = 5 + below(rng, 3)
  const chosen = new Set<number>()
  while (chosen.size < count) chosen.add(SIZE_POOL[below(rng, SIZE_POOL.length)])
  return [...chosen].sort((a, b) => a - b)
}

/** A token count strictly between two captured sizes (so it is not captured and some size above holds it). */
function drawBetween(rng: Rng, sizes: readonly number[]): number {
  const gaps: [number, number][] = []
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i] - sizes[i - 1] >= 3) gaps.push([sizes[i - 1], sizes[i]])
  const [low, high] = gaps[below(rng, gaps.length)]
  return low + 1 + below(rng, high - low - 1)
}

function drawHit(level: Level, seed: Seed, purpose: string): HitScene {
  const rng = itemRng(FAMILY, 'hit-or-miss', level, seed, purpose)
  const machine = drawMachine(rng)
  const sizes = drawSizes(rng)
  const largest = sizes[sizes.length - 1]
  const outcome = OUTCOMES[below(rng, OUTCOMES.length)]
  const base = { variant: 'hit-or-miss' as const, ...machine, sizes, outcome }
  const withChunk = (mode: Mode, mixed: boolean, tokens: number): HitScene => {
    // A mixed step carries at least one decode row and at least two tokens of prompt.
    const chunk = mixed ? 2 + below(rng, Math.max(1, tokens - 2)) : 0
    return { ...base, mode, mixed, tokens, chunk: mixed ? Math.min(chunk, tokens - 1) : 0 }
  }
  switch (outcome) {
    case 'exact':
      return withChunk(pick(rng, ['FULL', 'FULL_DECODE_ONLY'] as const), false, pick(rng, sizes.filter((size) => size >= 3)))
    case 'padded':
      return withChunk(pick(rng, ['FULL', 'FULL_DECODE_ONLY'] as const), false, drawBetween(rng, sizes))
    case 'pieces': {
      const tokens = below(rng, 2) === 0 ? pick(rng, sizes.filter((size) => size >= 3)) : drawBetween(rng, sizes)
      return withChunk('PIECEWISE', below(rng, 2) === 1, tokens)
    }
    case 'eager': {
      const cause = below(rng, 3)
      // Above the largest size under a whole-graph mode, a prompt chunk under FULL_DECODE_ONLY, or above the largest size under PIECEWISE.
      if (cause === 0) return withChunk(pick(rng, ['FULL', 'FULL_DECODE_ONLY'] as const), false, largest + 1 + below(rng, 24))
      if (cause === 1) return withChunk('FULL_DECODE_ONLY', true, below(rng, 2) === 0 ? pick(rng, sizes.filter((size) => size >= 6)) : drawBetween(rng, sizes))
      return withChunk('PIECEWISE', below(rng, 2) === 1, largest + 1 + below(rng, 24))
    }
  }
}

function drawSaved(level: Level, seed: Seed, purpose: string): SavedScene {
  const rng = itemRng(FAMILY, 'launch-saved', level, seed, purpose)
  return { variant: 'launch-saved', ...drawMachine(rng), mode: below(rng, 2) === 0 ? 'FULL' : 'PIECEWISE' }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  return variant === 'hit-or-miss' ? drawHit(level, seed, purpose) : drawSaved(level, seed, purpose)
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  if (scene.variant === 'hit-or-miss') {
    // A step of one or two tokens is held exactly by any list, and the `padded` lure of a captured step names the next size up, so there must be one.
    return scene.tokens >= 3 && (scene.outcome !== 'exact' || scene.tokens < scene.sizes[scene.sizes.length - 1])
  }
  const saved = graphModel.savedUs(scene, scene.mode)
  const eager = graphModel.eagerUs(scene)
  // The saving is at least a fifth of the eager launch time, so the replay is worth the drawing.
  return saved * 5 >= eager
}

function paramsOf(scene: Scene): Params {
  const machine = { layers: scene.layers, kernels: scene.kernels, launchUs: scene.launchUs, replayUs: scene.replayUs, mode: scene.mode }
  if (scene.variant === 'launch-saved') return machine
  return { ...machine, sizes: scene.sizes.join(','), tokens: scene.tokens, mixed: scene.mixed, chunk: scene.chunk }
}

const MODES: readonly string[] = ['FULL', 'FULL_DECODE_ONLY', 'PIECEWISE']

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { layers, kernels, launchUs, replayUs, mode, sizes, tokens, mixed, chunk } = item.params
  if (typeof layers !== 'number' || typeof kernels !== 'number' || typeof launchUs !== 'number' || typeof replayUs !== 'number' || typeof mode !== 'string' || !MODES.includes(mode)) {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  const machine = { layers, kernels, launchUs, replayUs }
  if (item.variant === 'launch-saved') {
    if (mode === 'FULL_DECODE_ONLY') throw new TypeError(`${FAMILY}: a replay is FULL or PIECEWISE`)
    return { variant: 'launch-saved', ...machine, mode: mode as 'FULL' | 'PIECEWISE' }
  }
  if (typeof sizes !== 'string' || typeof tokens !== 'number' || typeof mixed !== 'boolean' || typeof chunk !== 'number') throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  const list = sizes.split(',').map(Number)
  return { variant: 'hit-or-miss', ...machine, mode: mode as Mode, sizes: list, tokens, mixed, chunk, outcome: graphModel.outcome(mode as Mode, mixed, list, tokens) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string) => num(value, { unit, tag: 'synthetic' })
const derived = (value: number, unit: string) => num(value, { unit, tag: 'derived' })

/** How a `launch-saved` scene's times are printed: level 3 changes the surface to milliseconds, and everything else is µs. */
interface Units {
  readonly unit: 'µs' | 'ms'
  /** A µs value as the unit prints it. */
  scale(valueUs: number): number
  given(valueUs: number): NumPart
  derived(valueUs: number): NumPart
}
const MICROSECONDS: Units = { unit: 'µs', scale: (valueUs) => valueUs, given: (valueUs) => given(valueUs, 'µs'), derived: (valueUs) => derived(valueUs, 'µs') }
const MILLISECONDS: Units = {
  unit: 'ms',
  scale: (valueUs) => valueUs / 1000,
  given: (valueUs) => num(valueUs / 1000, { unit: 'ms', tag: 'synthetic', digits: 3 }),
  derived: (valueUs) => num(valueUs / 1000, { unit: 'ms', tag: 'derived', digits: 3 }),
}
const unitsFor = (level: Level): Units => (level === 3 ? MILLISECONDS : MICROSECONDS)

/** The scene's sizes as the ticket prints them: one run of code, so that no size is a number of its own to read off. */
const sizesText = (sizes: readonly number[]) => code(sizes.join(', '))

function stepKind(scene: HitScene): string {
  return scene.mixed ? 'a batch that adds a prompt chunk to the decodes' : 'a plain decode batch'
}

const OUTCOME_TEXT = {
  pieces: rich('The graph is replayed in pieces, with each layer\'s attention launched between them'),
  eager: rich('Every kernel is launched one by one'),
} as const

/**
 * The size a `padded` option names. Where the step is padded, it is the real one. Where it is not, the option is a lure and names the size
 * a learner would reach for: the next size up from a captured one, or the largest when the step is above them all.
 */
function paddedName(scene: HitScene): number {
  const padded = graphModel.padded(scene.sizes, scene.tokens)
  if (scene.outcome === 'exact') return scene.sizes.find((size) => size > scene.tokens) ?? scene.tokens
  return padded ?? scene.sizes[scene.sizes.length - 1]
}

function optionText(option: Outcome, scene: HitScene): Rich {
  const padded = paddedName(scene)
  switch (option) {
    case 'exact':
      return rich('One replay of the graph captured at ', given(scene.tokens, 'tokens'))
    case 'padded':
      return rich('One replay, padded up to the graph captured at ', given(padded, 'tokens'))
    case 'pieces':
      return OUTCOME_TEXT.pieces
    case 'eager':
      return OUTCOME_TEXT.eager
  }
}

/** Why `eager` is right, by its cause. */
function eagerReason(scene: HitScene): Rich {
  const largest = scene.sizes[scene.sizes.length - 1]
  if (scene.tokens > largest) {
    return rich(
      'The step carries ',
      given(scene.tokens, 'tokens'),
      ', more than the largest captured size, ',
      given(largest, 'tokens'),
      '. No graph holds it, so the engine launches every kernel one by one.',
    )
  }
  return rich(
    code('FULL_DECODE_ONLY'),
    ' captures whole graphs for plain decode batches. This step adds a prompt chunk, so no graph serves it and every kernel is launched one by one, though ',
    given(scene.tokens, 'tokens'),
    ' is within the captured sizes.',
  )
}

/** Why an option is right or wrong in a scene: the sentence, and the misconception it encodes when it is a lure. */
function reasonFor(option: Outcome, scene: HitScene): { why: Rich; miss?: string } {
  const { outcome, tokens } = scene
  const padded = graphModel.padded(scene.sizes, tokens)
  const largest = scene.sizes[scene.sizes.length - 1]
  if (option === outcome) {
    switch (outcome) {
      case 'exact':
        return { why: rich('A graph was captured at exactly ', given(tokens, 'tokens'), ', so the step replays it with no padding.') }
      case 'padded':
        return {
          why: rich(
            'No graph was captured at ',
            given(tokens, 'tokens'),
            '. A replay needs a captured shape, so the step is padded up to the smallest captured size that holds it, ',
            given(padded ?? largest, 'tokens'),
            ', and the extra places are computed for nothing.',
          ),
        }
      case 'pieces':
        return {
          why: rich(
            code('PIECEWISE'),
            ' replays the graph in pieces and launches each layer\'s attention between them, because attention stays outside the graphs. The step is padded up to the graph captured at ',
            given(padded ?? largest, 'tokens'),
            ' first.',
          ),
        }
      case 'eager':
        return { why: eagerReason(scene) }
    }
  }
  switch (option) {
    case 'exact':
      return outcome === 'eager'
        ? { why: rich('No graph serves this step in this mode, so there is nothing to replay at ', given(tokens, 'tokens'), '.'), miss: `${FAMILY}.graph-at-every-size` }
        : outcome === 'pieces'
          ? { why: rich('In ', code('PIECEWISE'), ' the replay is of the pieces, with attention launched between them; a whole graph at ', given(tokens, 'tokens'), ' is not what runs.'), miss: `${FAMILY}.ignores-the-mode` }
          : { why: rich('No graph was captured at ', given(tokens, 'tokens'), ', so there is nothing to replay at that size: the step is padded up to ', given(padded ?? largest, 'tokens'), '.'), miss: `${FAMILY}.graph-at-every-size` }
    case 'padded':
      if (outcome === 'exact') return { why: rich('A graph was captured at exactly ', given(tokens, 'tokens'), ', so there is nothing to pad.'), miss: `${FAMILY}.pads-a-hit` }
      if (outcome === 'pieces') return { why: rich('In ', code('PIECEWISE'), ' the padded step is replayed in pieces, with attention launched between them, and not as one graph.'), miss: `${FAMILY}.ignores-the-mode` }
      return scene.tokens > largest
        ? { why: rich('Above the largest captured size, ', given(largest, 'tokens'), ', there is no size to pad up to; the engine does not round down to it.'), miss: `${FAMILY}.rounds-to-the-largest` }
        : { why: rich(code('FULL_DECODE_ONLY'), ' has no graph for a step that adds a prompt chunk, however well its size is covered.'), miss: `${FAMILY}.decode-graphs-serve-all` }
    case 'pieces':
      return outcome === 'eager'
        ? { why: rich('No graph serves this step in this mode, in pieces or whole, so every kernel is launched one by one.'), miss: `${FAMILY}.pieces-without-a-graph` }
        : { why: rich(code(scene.mode), ' replays whole graphs. Only ', code('PIECEWISE'), ' replays pieces and launches attention between them.'), miss: `${FAMILY}.pieces-in-a-whole-mode` }
    case 'eager':
      return { why: rich('A captured graph holds this step, so it does not launch every kernel one by one.'), miss: `${FAMILY}.misses-a-hit` }
  }
}

function hitOptions(scene: HitScene, level: Level, seed: Seed): ChoiceOption[] {
  const options = OUTCOMES.map((id): ChoiceOption => ({ id, text: optionText(id, scene), ...reasonFor(id, scene) }))
  return shuffle(itemRng(FAMILY, 'hit-or-miss', level, seed, 'options'), options)
}

/** The steps of a `hit-or-miss` solution: what the mode runs for this step, which captured size holds it, and what follows. */
function hitSteps(scene: HitScene): Step[] {
  const padded = graphModel.padded(scene.sizes, scene.tokens)
  const largest = scene.sizes[scene.sizes.length - 1]
  const routine =
    scene.mode === 'PIECEWISE'
      ? rich(code('PIECEWISE'), ' tries to replay every step, in pieces.')
      : scene.mode === 'FULL'
        ? rich(code('FULL'), ' tries to replay one whole graph for every step.')
        : scene.mixed
          ? rich(code('FULL_DECODE_ONLY'), ' replays whole graphs for plain decode batches only, and this step adds a prompt chunk, so it has no graph to try.')
          : rich(code('FULL_DECODE_ONLY'), ' replays a whole graph for a plain decode batch, and this is one.')
  const find =
    padded === null
      ? rich('The step carries ', given(scene.tokens, 'tokens'), ', and the largest captured size is ', given(largest, 'tokens'), ': no graph holds it.')
      : padded === scene.tokens
        ? rich('A graph was captured at exactly ', given(scene.tokens, 'tokens'), ', so the step needs no padding.')
        : rich('No graph was captured at ', given(scene.tokens, 'tokens'), '; the smallest captured size that holds the step is ', given(padded, 'tokens'), ', so it is padded up to that.')
  const result = reasonFor(scene.outcome, scene).why
  return [{ text: routine }, { text: find }, { text: result }]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numeric variant                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const machineGivens = (scene: Machine, units: Units): Given[] => [
  { label: 'layers', value: given(scene.layers, 'layers') },
  { label: 'kernels per layer, launched one by one', value: given(scene.kernels, 'kernels') },
  { label: 'one launch', value: units.given(scene.launchUs) },
  { label: 'one replay', value: units.given(scene.replayUs) },
]

function savedSteps(scene: SavedScene, level: Level): Step[] {
  const units = unitsFor(level)
  const eager = graphModel.eagerUs(scene)
  const replay = graphModel.replayedUs(scene, scene.mode)
  const saved = eager - replay
  const eagerStep: Step = {
    text: rich('Launched one by one, the step costs the CPU ', given(scene.kernels, 'kernels'), ' × ', given(scene.layers, 'layers'), ' × ', units.given(scene.launchUs), ' = ', units.derived(eager), '.'),
    result: units.derived(eager),
  }
  if (scene.mode === 'FULL') {
    return [
      eagerStep,
      { text: rich('One replay of a whole graph costs ', units.given(scene.replayUs), ' of launch time, whatever the model has.'), result: units.derived(replay) },
      { text: rich('The replay saves ', units.derived(eager), ' − ', units.derived(replay), ' = ', units.derived(saved), '.'), result: units.derived(saved) },
    ]
  }
  const pieces = scene.layers + 1
  return [
    eagerStep,
    {
      text: rich(
        'In pieces, the step replays ',
        derived(pieces, 'pieces'),
        ' (one more than the layers) at ',
        units.given(scene.replayUs),
        ' and launches ',
        given(scene.layers, 'layers'),
        ' attention kernels at ',
        units.given(scene.launchUs),
        ': ',
        units.derived(replay),
        '.',
      ),
      result: units.derived(replay),
    },
    { text: rich('The pieces save ', units.derived(eager), ' − ', units.derived(replay), ' = ', units.derived(saved), '.'), result: units.derived(saved) },
  ]
}

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant !== 'launch-saved') return null
    // The learner's number is in the item's unit; the rules below are in µs.
    const us = value * (unitsFor(item.level).unit === 'ms' ? 1000 : 1)
    const eager = graphModel.eagerUs(scene)
    const replay = graphModel.replayedUs(scene, scene.mode)
    if (near(us, eager)) return { id: `${FAMILY}.forgot-the-replay`, message: rich('That is the eager launch time. The replay is not free: it costs its own launch, which comes off.') }
    if (near(value, scene.kernels * scene.layers)) return { id: `${FAMILY}.counted-launches`, message: rich('That counts the launches, not their time. Each costs the CPU its time.') }
    if (near(us, scene.layers * scene.launchUs - replay) || near(us, scene.layers * scene.launchUs)) {
      return { id: `${FAMILY}.one-kernel-a-layer`, message: rich('That launches one kernel a layer. Each layer launches several, one by one, and the replay saves all of them.') }
    }
    if (scene.mode === 'PIECEWISE' && near(us, eager - (scene.layers + 1) * scene.replayUs)) {
      return { id: `${FAMILY}.attention-for-free`, message: rich('That leaves out the attention launches. In pieces, each layer\'s attention is still launched, and it takes its time.') }
    }
    if (scene.mode === 'PIECEWISE' && near(us, eager - scene.replayUs)) {
      return { id: `${FAMILY}.one-replay-in-pieces`, message: rich('That takes one replay. In pieces there is a replay for each piece, one more than the layers, and the attention launches besides.') }
    }
    return null
  },
]

/** A habit of the family's own that reads nothing: for `hit-or-miss`, any replay and never the eager launch. */
const BLIND: readonly BlindStrategy[] = [
  {
    id: 'always-replay',
    describe: 'any option that replays something, never "every kernel one by one"',
    answers: (item): readonly Response[] | null =>
      item.answer.kind === 'choice' ? item.answer.options.filter((option) => option.id !== 'eager').map((option): Response => ({ kind: 'choice', pick: option.id })) : null,
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A numeric key is within 1 µs (0.01 ms at level 3) of the right number. ASSESSMENT §4.2 gives arithmetic on given numbers 2 %, but a replay
 * costs a few per cent of the launch time it replaces, and 2 % would pass the eager launch time itself as the answer.
 */
const TOLERANCE = { abs: 1 } as const
const TOLERANCE_MS = { abs: 0.01 } as const

/** Level 0 shows a whole solution on another scene, level 1 the words of the first step, and the rest nothing. */
function workedFor(scene: Scene, level: Level, seed: Seed): Step[] {
  const stepsOf = (s: Scene): Step[] => (s.variant === 'hit-or-miss' ? hitSteps(s) : savedSteps(s, level))
  if (level === 1) return [{ text: stepsOf(scene)[0].text }]
  if (level !== 0) return []
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    const same =
      scene.variant === 'hit-or-miss' && example.variant === 'hit-or-miss'
        ? example.outcome === scene.outcome
        : scene.variant === 'launch-saved' && example.variant === 'launch-saved'
          ? graphModel.savedUs(example, example.mode) === graphModel.savedUs(scene, scene.mode)
          : true
    if (isFair(example) && !same) return stepsOf(example)
  }
  return []
}

function buildHit(spec: VariantSpec, scene: HitScene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const rows = scene.tokens - scene.chunk
  const stepGivens: Given[] =
    level === 3
      ? [
          { label: 'decode rows', value: given(rows, 'rows') },
          ...(scene.mixed ? [{ label: 'prompt chunk', value: given(scene.chunk, 'tokens') }] : []),
        ]
      : [{ label: 'tokens in the step', value: given(scene.tokens, 'tokens') }]
  return finishItem(gen, {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: paramsOf(scene),
    stem:
      level === 3
        ? rich('A step of ', code(scene.mode), ' mode is ', stepKind(scene), '; each decode row is a token, and a prompt chunk adds its tokens. Graphs were captured at the sizes listed. What does the step launch?')
        : rich('A step in ', code(scene.mode), ' mode is ', stepKind(scene), '. Graphs were captured at the sizes listed. What does the step launch?'),
    givens: [{ label: 'mode', value: { t: 'code', code: scene.mode } }, ...stepGivens, { label: 'captured sizes', value: sizesText(scene.sizes) }],
    worked: workedFor(scene, level, seed),
    answer: { kind: 'choice', label: 'what the step launches', options: hitOptions(scene, level, seed), correct: scene.outcome },
  })
}

function buildSaved(spec: VariantSpec, scene: SavedScene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const units = unitsFor(level)
  const saved = graphModel.savedUs(scene, scene.mode)
  const how =
    scene.mode === 'FULL'
      ? 'replays one whole graph'
      : 'replays its graph in pieces, one more piece than the model has layers, and launches each layer\'s attention between them'
  return finishItem(gen, {
    variant: spec.id,
    level,
    seed,
    kcs: spec.kcs,
    params: paramsOf(scene),
    stem: rich('A ', code(scene.mode), ' step ', how, '. By how many ', units.unit, ' does that cut the CPU\'s launch time, against launching every kernel one by one?'),
    givens: machineGivens(scene, units),
    worked: workedFor(scene, level, seed),
    answer: {
      kind: 'numeric',
      label: 'launch time saved',
      unit: units.unit,
      truth: units.scale(saved),
      tolerance: units.unit === 'ms' ? TOLERANCE_MS : TOLERANCE,
      ...(units.unit === 'ms' ? { digits: 3 } : {}),
    },
  })
}

/** Every step of an item's solution, ending in the key, rebuilt from its params. */
function stepsOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'hit-or-miss' ? hitSteps(scene) : savedSteps(scene, item.level)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

/** The stream a scene is drawn from. A change of its name re-draws every scene, and the golden vectors follow. */
const SCENE = 'scene-m'

export const graphHit: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Graph hit',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    const scene = drawScene(spec.id, level, seed, SCENE)
    return scene.variant === 'hit-or-miss' ? buildHit(spec, scene, level, seed) : buildSaved(spec, scene, level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, SCENE))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => stepsOf(item),
  blind: BLIND,
}
