/**
 * `tr2.kv-after-graphs`: the KV cache that is left once the CUDA graphs have been paid for (TR2, lesson 6; KC `tr2.graph-memory`: say why
 * graph capture takes memory before the KV cache is sized, and correct a KV-capacity estimate for it).
 *
 * The world is the course's own, and every number in it is synthetic. A card has some memory, and vLLM may use a share of it
 * (`gpu_memory_utilization`, 0.92 by default: claim vllm.cache.gpu-memory-utilization-default). The weights and the activations come out of
 * that share first (the non-KV memory, which profiling measures), and since v0.29.0 so does an estimate of what the graphs will take: MRV2
 * makes it while the engine is still profiling, before the real KV cache is allocated, and the estimate is applied by default (claims
 * vllm.cudagraph.memory-profiling-since, vllm.cudagraph.memory-before-kv, vllm.cudagraph.memory-estimate-default). The cache gets what is
 * left, in whole tokens (claim vllm.cudagraph.memory-subtracted):
 *   requested = card × share;   cache = requested − non-KV − graphs;   tokens = ⌊cache ÷ bytes per token⌋.
 * A capacity plan that takes the card, subtracts the weights and divides by the bytes of a token, as kernelspace's T5.L4 does, leaves out
 * the graphs, and is too high by what they cost. tests/play/items-kv-after-graphs.test.ts holds the rule to the step loop's memory model
 * (`kvBudget` and `kvTokens`, packages/sim/steploop/memory.ts), which is the model the lesson's table prints.
 *
 * What the variants ask:
 *   kv-tokens    the tokens of KV cache the card holds once the graphs are taken off: the whole rule (levels 0 to 3);
 *   graphs-cost  the tokens of KV cache that the graphs cost: what a plan that leaves them out promises, less what the cache holds (levels 0 to 3);
 *   share        the share of that promised cache that the graphs take, in per cent (levels 1 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is
 * alone with the numbers, and level 3 changes the surface: the memory is quoted in binary units (GiB, MiB and KiB, as an engine's log
 * quotes it), and `gpu_memory_utilization` is left at its default, so the learner has to know that it is 0.92.
 *
 * The scene is drawn from grids of round numbers: a card of 16 to 80 units, a non-KV memory of a tenth to a half of it, and graphs that
 * take 4 to 12% of the cache a plan without them promises, so that leaving them out is never a rounding error. `band` throws out the
 * draws that make a poor question all the same: a cache under a quarter of the requested memory, and graphs under 4% of the promised cache
 * (rounding the graphs to the grid's unit can bring a draw under it).
 */
import { below, divFloor, divRound, pick } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { rich, text } from '../../rich'
import type { Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, derived, given, measured, workedPart } from './kit'

const FAMILY = 'tr2.kv-after-graphs'
const VERSION = 1
const KC = 'tr2.graph-memory'

type VariantId = 'kv-tokens' | 'graphs-cost' | 'share'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'kv-tokens', title: 'The KV cache that is left', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'graphs-cost', title: 'What the graphs cost the cache', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'share', title: 'The share of the cache the graphs take', kcs: [KC], levels: [1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** vLLM's default share of a card's memory (claim vllm.cache.gpu-memory-utilization-default), out of 1,000. */
export const DEFAULT_PERMILLE = 920

const GB = 1_000_000_000
const MB = 1_000_000
const GIB = 1_073_741_824
const MIB = 1_048_576
const KIB = 1_024

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The rule of the family, as integer arithmetic on bytes (the sim's `kvBudget` and `kvTokens`, restated). */
export const kvModel = {
  /** The memory vLLM may use: the card times the share, rounded down. */
  requested: (card: number, permille: number): number => divFloor(card * permille, 1000),
  /** What the cache gets: the requested memory less the non-KV memory and the graphs' estimate. */
  cache: (requested: number, nonKv: number, graphs: number): number => requested - nonKv - graphs,
  /** Whole tokens that fit in `bytes`. */
  tokens: (bytes: number, perToken: number): number => divFloor(bytes, perToken),
  /** The tokens that the graphs cost: what a plan without them promises, less what the cache holds. */
  cost: (requested: number, nonKv: number, graphs: number, perToken: number): number =>
    kvModel.tokens(requested - nonKv, perToken) - kvModel.tokens(requested - nonKv - graphs, perToken),
  /** `part` as a share of `whole`, in tenths of a per cent, rounded to the nearest. */
  tenths: (part: number, whole: number): number => divRound(1000 * part, whole),
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Scene {
  readonly variant: VariantId
  /** Memory is quoted in binary units (GiB, MiB, KiB), and the share is the default: level 3. */
  readonly binary: boolean
  /** The card's memory, in GB or in GiB. */
  readonly card: number
  /** `gpu_memory_utilization`, out of 1,000. */
  readonly permille: number
  /** The weights and the activations: units of 100 MB, or of 256 MiB at level 3. */
  readonly nonKvUnits: number
  /** The graphs' estimate: units of 10 MB, or of 32 MiB at level 3. */
  readonly graphUnits: number
  /** Bytes of KV cache for one token: in bytes, or in units of 16 KiB at level 3. */
  readonly tokenUnits: number
}

const CARDS: readonly number[] = [16, 24, 32, 40, 48, 64, 80]
/** Bytes of one token's KV cache: multiples of 16 KiB, which a model with 8 KV heads of 128 and 2-byte values has for each 7 layers [derived]. */
const TOKEN_BYTES: readonly number[] = [49_152, 65_536, 98_304, 114_688, 131_072, 163_840, 196_608]

/** The bytes of each quantity of a scene. */
function bytesOf(scene: Scene): { card: number; requested: number; nonKv: number; graphs: number; perToken: number } {
  const card = scene.card * (scene.binary ? GIB : GB)
  return {
    card,
    requested: kvModel.requested(card, scene.permille),
    nonKv: scene.nonKvUnits * (scene.binary ? 256 * MIB : 100 * MB),
    graphs: scene.graphUnits * (scene.binary ? 32 * MIB : 10 * MB),
    perToken: scene.tokenUnits * (scene.binary ? 16 * KIB : 1),
  }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  const rng: Rng = itemRng(FAMILY, variant, level, seed, purpose)
  const binary = level === 3
  const card = pick(rng, CARDS)
  const permille = binary ? DEFAULT_PERMILLE : pick(rng, [900, DEFAULT_PERMILLE, 950])
  // Weights and activations take a tenth to a half of the card: 4 units of 256 MiB make a GiB, and 10 units of 100 MB make a GB.
  const lo = binary ? divFloor(card * 4, 10) + 1 : card
  const hi = binary ? divFloor(card * 4, 2) : card * 5
  const nonKvUnits = lo + below(rng, hi - lo + 1)
  const tokenUnits = binary ? pick(rng, [3, 4, 6, 7, 8, 10, 12]) : pick(rng, TOKEN_BYTES)
  const unit = binary ? 32 * MIB : 10 * MB
  const base: Scene = { variant, binary, card, permille, nonKvUnits, graphUnits: 1, tokenUnits }
  const b = bytesOf(base)
  // The graphs take 4 to 12% of what a plan without them promises, to the nearest unit.
  const share = 40 + below(rng, 81)
  const graphUnits = Math.max(1, divRound((b.requested - b.nonKv) * share, 1000 * unit))
  return { ...base, graphUnits }
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  const { requested, nonKv, graphs } = bytesOf(scene)
  const cache = kvModel.cache(requested, nonKv, graphs)
  // A quarter of the requested memory is left for the cache, and the graphs are at least 4% of what a plan without them promises.
  return cache * 4 >= requested && graphs * 25 >= requested - nonKv
}

function paramsOf(scene: Scene): Params {
  return { binary: scene.binary, card: scene.card, permille: scene.permille, nonKv: scene.nonKvUnits, graphs: scene.graphUnits, token: scene.tokenUnits }
}

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { binary, card, permille, nonKv, graphs, token } = item.params
  if (typeof binary !== 'boolean' || typeof card !== 'number' || typeof permille !== 'number' || typeof nonKv !== 'number' || typeof graphs !== 'number' || typeof token !== 'number') {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  return { variant: item.variant, binary, card, permille, nonKvUnits: nonKv, graphUnits: graphs, tokenUnits: token }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A memory worked out from the scene's, in the unit the scene quotes the card in: GB, or GiB at level 3. */
const memory = (scene: Scene, bytes: number): NumPart => (scene.binary ? derived(bytes / GIB, 'GiB', 2) : derived(bytes / GB, 'GB', 2))

/** The size of one token's KV cache, as the scene quotes it: bytes, or KiB at level 3. */
const perTokenPart = (scene: Scene): NumPart => (scene.binary ? given(scene.tokenUnits * 16, 'KiB') : given(scene.tokenUnits, 'bytes'))

const tokensPart = (value: number): NumPart => derived(value, 'tokens')

function givensOf(scene: Scene): Given[] {
  const { nonKv, graphs } = bytesOf(scene)
  return [
    { label: 'card memory', value: given(scene.card, scene.binary ? 'GiB' : 'GB') },
    scene.binary ? { label: 'gpu_memory_utilization', value: text('left at its default') } : { label: 'gpu_memory_utilization', value: given(scene.permille / 1000, '', 2) },
    { label: 'weights and activations', value: scene.binary ? given(nonKv / MIB, 'MiB') : given(nonKv / GB, 'GB', 1) },
    { label: "the graphs' estimate", value: scene.binary ? given(graphs / MIB, 'MiB') : given(graphs / GB, 'GB', 2) },
    { label: 'KV cache for one token', value: perTokenPart(scene) },
  ]
}

/** The steps of the solution, ending in the key. */
function stepsOf(scene: Scene): Step[] {
  const b = bytesOf(scene)
  const cache = kvModel.cache(b.requested, b.nonKv, b.graphs)
  const tokens = kvModel.tokens(cache, b.perToken)
  const promised = kvModel.tokens(b.requested - b.nonKv, b.perToken)
  const share = scene.binary ? measured(DEFAULT_PERMILLE / 1000, '', 2) : given(scene.permille / 1000, '', 2)
  const request: Step = {
    text: rich(
      scene.binary ? 'vLLM may use only a share of the card, and by default that share is ' : 'vLLM may use only a share of the card, which here is ',
      share,
      ': ',
      given(scene.card, scene.binary ? 'GiB' : 'GB'),
      ' × ',
      share,
      ' = ',
      memory(scene, b.requested),
      '.',
    ),
  }
  const left: Step = {
    text: rich(
      'The weights and the activations come out of that first, and since v0.29.0 so does the estimate of what the graphs will take, because it is made before the cache is sized: ',
      memory(scene, b.requested),
      ' − ',
      memory(scene, b.nonKv),
      ' − ',
      memory(scene, b.graphs),
      ' = ',
      memory(scene, cache),
      ' for the cache.',
    ),
  }
  if (scene.variant === 'kv-tokens') {
    return [request, left, { text: rich('The cache holds whole tokens: ', memory(scene, cache), ' ÷ ', perTokenPart(scene), ' for each, rounded down, is ', tokensPart(tokens), '.'), result: tokensPart(tokens) }]
  }
  const without: Step = {
    text: rich(
      'A plan that leaves the graphs out sizes the cache from ',
      memory(scene, b.requested - b.nonKv),
      ': ',
      memory(scene, b.requested - b.nonKv),
      ' ÷ ',
      perTokenPart(scene),
      ' for each token is ',
      tokensPart(promised),
      '. The cache that is left holds ',
      tokensPart(tokens),
      '.',
    ),
  }
  if (scene.variant === 'graphs-cost') {
    const cost = promised - tokens
    return [request, left, without, { text: rich('The graphs cost the difference: ', tokensPart(promised), ' − ', tokensPart(tokens), ' = ', tokensPart(cost), '.'), result: tokensPart(cost) }]
  }
  const percent = kvModel.tenths(b.graphs, b.requested - b.nonKv) / 10
  return [
    request,
    left,
    {
      text: rich('The plan promises the cache before the graphs come off, so they are a share of ', memory(scene, b.requested - b.nonKv), ': ', memory(scene, b.graphs), ' ÷ ', memory(scene, b.requested - b.nonKv), ' = ', derived(percent, '%', 1), '.'),
      result: derived(percent, '%', 1),
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function keyOf(scene: Scene): number {
  const b = bytesOf(scene)
  switch (scene.variant) {
    case 'kv-tokens':
      return kvModel.tokens(kvModel.cache(b.requested, b.nonKv, b.graphs), b.perToken)
    case 'graphs-cost':
      return kvModel.cost(b.requested, b.nonKv, b.graphs, b.perToken)
    case 'share':
      return kvModel.tenths(b.graphs, b.requested - b.nonKv) / 10
  }
}

const PLAN: Rich = rich('A capacity plan takes the memory the engine may use, subtracts the weights and the activations, and divides by the bytes of one token.')

const STEMS: Readonly<Record<VariantId, Rich>> = {
  'kv-tokens': rich('A synthetic engine runs vLLM v0.33.0 on one card, with its CUDA graphs captured and their memory estimated before the KV cache is sized. How many tokens of KV cache does the card hold?'),
  'graphs-cost': rich('A synthetic engine runs vLLM v0.33.0 on one card. ', ...PLAN, ' How many tokens of KV cache do the graphs cost, against that plan?'),
  share: rich('A synthetic engine runs vLLM v0.33.0 on one card. ', ...PLAN, ' What share of the cache that the plan promises do the graphs take?'),
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const truth = keyOf(scene)
  const answer =
    scene.variant === 'share'
      ? ({ kind: 'numeric', label: 'the share of the cache', unit: '%', truth, tolerance: ARITHMETIC, digits: 1 } as const)
      : ({ kind: 'numeric', label: scene.variant === 'kv-tokens' ? 'KV cache that is left' : 'tokens the graphs cost', unit: 'tokens', truth, tolerance: ARITHMETIC } as const)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem: STEMS[scene.variant],
      givens: givensOf(scene),
      worked: workedPart(level, stepsOf(scene), (attempt) => {
        const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
        return isFair(example) && keyOf(example) !== truth ? stepsOf(example) : null
      }),
      answer,
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    const b = bytesOf(scene)
    const withGraphs = kvModel.tokens(kvModel.cache(b.requested, b.nonKv, b.graphs), b.perToken)
    const promised = kvModel.tokens(b.requested - b.nonKv, b.perToken)
    if (scene.variant === 'kv-tokens') {
      if (near(value, promised)) {
        return { id: `${FAMILY}.graphs-left-out`, message: rich('That is the cache of a plan that leaves the graphs out. The engine takes their estimate off before it sizes the cache, so the cache that is left is smaller.') }
      }
      if (near(value, kvModel.tokens(b.card - b.nonKv - b.graphs, b.perToken)) || near(value, kvModel.tokens(b.card - b.nonKv, b.perToken))) {
        return { id: `${FAMILY}.whole-card`, message: rich('You counted the whole card. vLLM may use only its share of the card, and the weights, the activations and the graphs all come out of that share.') }
      }
      if (near(value, promised - withGraphs)) {
        return { id: `${FAMILY}.cost-as-cache`, message: rich('That is what the graphs cost the cache. The cache that is left is the cache without them, less that.') }
      }
      return null
    }
    if (scene.variant === 'graphs-cost') {
      if (near(value, withGraphs)) {
        return { id: `${FAMILY}.cache-as-cost`, message: rich('That is the cache that is left. The question is what the graphs took from the cache that a plan without them promises.') }
      }
      if (near(value, promised)) {
        return { id: `${FAMILY}.plan-as-cost`, message: rich('That is the cache the plan promises. The graphs took only a part of it.') }
      }
      return null
    }
    const ofRequested = kvModel.tenths(b.graphs, b.requested) / 10
    const ofLeft = kvModel.tenths(b.graphs, b.requested - b.nonKv - b.graphs) / 10
    if (near(value, ofRequested)) {
      return { id: `${FAMILY}.of-requested`, message: rich('You took the graphs as a share of all the memory the engine may use. The cache is what is left after the weights and the activations, and that is what they are a share of.') }
    }
    if (near(value, ofLeft)) {
      return { id: `${FAMILY}.of-what-is-left`, message: rich('You took the graphs as a share of the cache that is left. The plan promises the cache before they come off, and that is what they are a share of.') }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const kvAfterGraphs: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The KV cache after the graphs',
  kcs: [KC],
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
  grade: (item, response) => gradeNumeric(item, response, RULES),
  solution: (item) => stepsOf(sceneOf(item)),
}
