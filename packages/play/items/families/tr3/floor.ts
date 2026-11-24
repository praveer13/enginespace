/**
 * `tr3.floor`: the least time a decode step can take, from the bytes it must read and the GPU's memory bandwidth (TR3; KC
 * `tr3.step-floor`). A decode step reads every weight of the model once, and the KV cache of every request it serves; it cannot end
 * before those bytes have crossed the memory bus, so the floor is bytes over bandwidth.
 *
 *   floor    the least time of one step, in µs. Levels 0 and 1 read the weights alone; level 2 adds the KV cache of one request at a given
 *            context length; level 3 serves a batch of requests, each at that context length, so the weights are read once and the KV
 *            of every request is read.
 *   kv-part  how many µs of that floor are the KV cache's.
 *
 * What rests on an upstream fact, and the claim that holds it:
 *   - the bandwidth of each GPU is its datasheet's peak rate: `hw.<gpu>.mem-bw` (content/claims/hardware), which tests/play/items-tr3-floor.test.ts
 *     reads again from the file;
 *   - when the model is Qwen3-0.6B, its weights and its KV bytes per token are worked out from `qwen3.config.layers`, `.hidden-size`,
 *     `.intermediate-size`, `.heads`, `.kv-heads`, `.head-dim`, `.vocab-size`, `.tied-embeddings` and `.stored-dtype` [derived]:
 *     595,984,384 parameters of 2 bytes, and 114,688 bytes of KV for each token of context. `qwen3.weights.bytes`, the size of the
 *     checkpoint file, is [unverified] and is not what a step reads, so no key rests on it.
 * Every other model is the course's own made-up one, and its numbers are [synthetic]. A datasheet's bandwidth is a peak rate: a real step
 * reads more slowly, so the floor is a bound that no step beats and not a prediction.
 *
 * Like the rest of packages/play it is pure (D-017). Division is the only floating-point operation, and a division is exactly rounded.
 */
import { between } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, NumPart, Step, VariantSpec } from '../../types'
import { ARITHMETIC } from '../tr6/kit'
import { derived, workedPart } from './kit'

const FAMILY = 'tr3.floor'
const VERSION = 1
const KC = 'tr3.step-floor'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'floor', title: 'The least time of a decode step', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'kv-part', title: "The KV cache's part of a step's floor", kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'floor' | 'kv-part'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The numbers of claims                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Gpu {
  /** The card as its product name is written, without the maker's name. */
  readonly name: string
  /** The claim that holds its bandwidth: `hw.<gpu>.mem-bw`. */
  readonly claim: string
  /** GB/s, the datasheet's peak rate. */
  readonly gbps: number
  /** The claim's own tag: `measured` for a figure read from a datasheet, `derived` for the H100 and H200, whose claims turn the page's TB/s into GB/s. */
  readonly tag: 'measured' | 'derived'
}

/** Eight cards of the hardware atlas, each with the bandwidth its claim holds. */
export const GPUS: readonly Gpu[] = [
  { name: 'L4', claim: 'hw.l4.mem-bw', gbps: 300, tag: 'measured' },
  { name: 'L40S', claim: 'hw.l40s.mem-bw', gbps: 864, tag: 'measured' },
  { name: 'GeForce RTX 4090', claim: 'hw.rtx4090.mem-bw', gbps: 1008, tag: 'measured' },
  { name: 'A100-SXM4-40GB', claim: 'hw.a100-40-sxm.mem-bw', gbps: 1555, tag: 'measured' },
  { name: 'GeForce RTX 5090', claim: 'hw.rtx5090.mem-bw', gbps: 1792, tag: 'measured' },
  { name: 'A100-SXM4-80GB', claim: 'hw.a100-80-sxm.mem-bw', gbps: 2039, tag: 'measured' },
  { name: 'H100 80GB HBM3', claim: 'hw.h100-sxm.mem-bw', gbps: 3350, tag: 'derived' },
  { name: 'H200', claim: 'hw.h200-sxm.mem-bw', gbps: 4800, tag: 'derived' },
]

/** Qwen3-0.6B's configuration, each number a `qwen3.config.*` claim (content/claims/tr0.yaml). */
export const QWEN3 = {
  layers: 28,
  hidden: 1024,
  intermediate: 3072,
  heads: 16,
  kvHeads: 8,
  headDim: 128,
  vocab: 151936,
  /** bfloat16: `qwen3.config.stored-dtype`. */
  bytesPerValue: 2,
} as const

/** The parameters of the weight matrices [derived]: the embedding table (tied with the output projection) and each layer's attention and MLP matrices. */
export function qwen3Params(): number {
  const table = QWEN3.vocab * QWEN3.hidden
  const attention = QWEN3.hidden * QWEN3.heads * QWEN3.headDim + 2 * (QWEN3.hidden * QWEN3.kvHeads * QWEN3.headDim) + QWEN3.heads * QWEN3.headDim * QWEN3.hidden
  const mlp = 3 * QWEN3.hidden * QWEN3.intermediate
  return table + QWEN3.layers * (attention + mlp)
}

/** The bytes of those weights [derived]. */
export const qwen3WeightBytes = (): number => qwen3Params() * QWEN3.bytesPerValue

/** The KV bytes of one token of context [derived]: two tensors (K and V) of every layer, one row of `kvHeads` heads each. */
export const qwen3KvBytesPerToken = (): number => QWEN3.layers * 2 * QWEN3.kvHeads * QWEN3.headDim * QWEN3.bytesPerValue

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Scene {
  /** Qwen3-0.6B, or the course's made-up model. */
  readonly model: 'qwen3-0.6b' | 'made-up'
  readonly weightBytes: number
  readonly kvPerToken: number
  readonly gpu: Gpu
  /** Tokens of context each request holds. */
  readonly ctx: number
  /** Requests in the step. */
  readonly batch: number
}

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const chosen = GPUS[between(rng, 0, GPUS.length - 1)]
  const real = between(rng, 0, 2) === 0
  const weightBytes = real ? qwen3WeightBytes() : between(rng, 5, 160) * 100_000_000
  const kvPerToken = real ? qwen3KvBytesPerToken() : between(rng, 4, 24) * 8192
  const ctx = between(rng, 2, 64) * 256
  const batch = level === 3 ? between(rng, 2, 16) : 1
  return { model: real ? 'qwen3-0.6b' : 'made-up', weightBytes, kvPerToken, gpu: chosen, ctx, batch }
}

/** The bytes of KV the step reads. */
const kvBytes = (scene: Scene): number => scene.batch * scene.kvPerToken * scene.ctx

/** Whether the KV cache is part of the step the ticket describes. */
const hasKv = (variant: VariantId, level: Level): boolean => variant === 'kv-part' || level >= 2

/** The bytes the step reads, as the ticket describes the step. */
export const bytesRead = (scene: Scene, variant: VariantId, level: Level): number => scene.weightBytes + (hasKv(variant, level) ? kvBytes(scene) : 0)

/** Bytes over a bandwidth in GB/s, in µs: one GB/s is one byte per ns, and a thousand ns are a µs. */
const microseconds = (bytes: number, gpu: Gpu): number => bytes / (gpu.gbps * 1000)

/** The key. */
export function keyOf(scene: Scene, variant: VariantId, level: Level): number {
  return variant === 'kv-part' ? microseconds(kvBytes(scene), scene.gpu) : microseconds(bytesRead(scene, variant, level), scene.gpu)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const GB = 1_000_000_000

const gb = (bytes: number): NumPart => derived(bytes / GB, 'GB', 3)

function givensOf(scene: Scene, variant: VariantId, level: Level): Given[] {
  const model: Given = { label: 'model', value: code(scene.model === 'qwen3-0.6b' ? 'Qwen3-0.6B, bfloat16' : 'a made-up model, bfloat16') }
  const weights: Given = {
    label: 'weights',
    value: scene.model === 'qwen3-0.6b' ? num(scene.weightBytes / GB, { unit: 'GB', tag: 'derived', digits: 3 }) : num(scene.weightBytes / GB, { unit: 'GB', tag: 'synthetic', digits: 1 }),
  }
  const gpu: Given = { label: 'GPU', value: code(scene.gpu.name) }
  const bandwidth: Given = { label: 'memory bandwidth', value: num(scene.gpu.gbps, { unit: 'GB/s', tag: scene.gpu.tag }) }
  const kv: Given[] = hasKv(variant, level)
    ? [
        { label: 'KV cache per token', value: scene.model === 'qwen3-0.6b' ? num(scene.kvPerToken, { unit: 'bytes', tag: 'derived' }) : num(scene.kvPerToken, { unit: 'bytes', tag: 'synthetic' }) },
        { label: 'context of each request', value: num(scene.ctx, { unit: 'tokens', tag: 'synthetic' }) },
        ...(level === 3 ? [{ label: 'requests in the step', value: num(scene.batch, { unit: 'requests', tag: 'synthetic' }) } as Given] : []),
      ]
    : []
  return [model, weights, gpu, bandwidth, ...kv]
}

function stemOf(variant: VariantId, level: Level): Item['stem'] {
  const lead = 'A decode step reads the model\'s weights from the GPU\'s memory once, and it cannot end before those bytes have been read. '
  if (variant === 'kv-part') {
    return rich(lead, level === 3 ? 'It also reads the KV cache of every request in the step. ' : 'It also reads the KV cache of the request it serves. ', 'How many µs of the least time of one step are spent reading the KV cache?')
  }
  if (level <= 1) return rich(lead, 'What is the least time, in µs, that one step can take on this GPU?')
  if (level === 2) return rich(lead, 'It also reads the KV cache of the one request it serves, at the context length below. What is the least time, in µs, that one step can take?')
  return rich(lead, 'It serves a batch of requests, each at the context length below, and reads the KV cache of every one. What is the least time, in µs, that one step can take?')
}

/*
 * The first step of each solution is the rule alone: no figure of the scene. At level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not hold a number or the time.
 */
const RULE = rich(
  'A step cannot end before every byte it needs has crossed the memory bus, so its least time is those bytes divided by the memory bandwidth. One GB/s is one byte every ns, so bytes over GB/s come out in ns, and a thousand ns are one µs. The weights are read once for the whole step, and the KV cache once for each request.',
)

function stepsOf(scene: Scene, variant: VariantId, level: Level): Step[] {
  const bytes = bytesRead(scene, variant, level)
  const rule: Step = { text: RULE }
  const key = keyOf(scene, variant, level)
  if (variant === 'kv-part') {
    return [
      rule,
      { text: rich('The KV cache holds ', num(scene.kvPerToken, { unit: 'bytes', tag: 'derived' }), ' for each token of context, for each of ', num(scene.batch, { tag: 'synthetic', unit: scene.batch === 1 ? 'request' : 'requests' }), ' at ', num(scene.ctx, { unit: 'tokens', tag: 'synthetic' }), '.'), result: gb(kvBytes(scene)) },
      { text: rich('Those bytes over ', num(scene.gpu.gbps, { unit: 'GB/s', tag: scene.gpu.tag }), ' take this long.'), result: derived(key, 'µs', 0) },
    ]
  }
  const readStep: Step =
    level <= 1
      ? { text: rich('The step reads the weights once.'), result: gb(bytes) }
      : { text: rich('The step reads the weights once and the KV cache of ', num(scene.batch, { tag: 'synthetic', unit: scene.batch === 1 ? 'request' : 'requests' }), ' at ', num(scene.ctx, { unit: 'tokens', tag: 'synthetic' }), ' each.'), result: gb(bytes) }
  return [rule, readStep, { text: rich('Those bytes over ', num(scene.gpu.gbps, { unit: 'GB/s', tag: scene.gpu.tag }), ' take this long.'), result: derived(key, 'µs', 0) }]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'variant' | 'level' | 'seed'>): { scene: Scene; variant: VariantId } {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  return { scene: drawScene(item.variant, item.level, item.seed, 'scene'), variant: item.variant }
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const { scene, variant } = sceneOfItem(item)
    const key = keyOf(scene, variant, item.level)
    if (isAbout(value, key * 1000)) return { id: `${FAMILY}.in-ns`, message: rich('That is the time in ns. A thousand ns are one µs, so divide by a thousand.') }
    if (isAbout(value, key / 1000)) return { id: `${FAMILY}.in-ms`, message: rich('That is the time in ms. The answer is asked in µs, and a ms is a thousand of them.') }
    return null
  },
  (item, value) => {
    const { scene, variant } = sceneOfItem(item)
    if (variant === 'floor' && item.level >= 2 && isAbout(value, microseconds(scene.weightBytes, scene.gpu))) {
      return { id: `${FAMILY}.weights-only`, message: rich('That reads the weights and leaves out the KV cache. Every token of context adds KV bytes that the step must read too.') }
    }
    return null
  },
  (item, value) => {
    const { scene, variant } = sceneOfItem(item)
    if (variant === 'floor' && item.level === 3 && isAbout(value, microseconds(scene.weightBytes + scene.kvPerToken * scene.ctx, scene.gpu))) {
      return { id: `${FAMILY}.one-request`, message: rich('That counts the KV cache of one request. Each request in the step has its own, and the step reads all of them.') }
    }
    if (variant === 'floor' && item.level === 3 && isAbout(value, microseconds(scene.batch * (scene.weightBytes + scene.kvPerToken * scene.ctx), scene.gpu))) {
      return { id: `${FAMILY}.weights-per-request`, message: rich('That reads the weights again for every request. The weights are read once for the whole step, and only the KV cache is read once for each request.') }
    }
    return null
  },
  (item, value) => {
    const { scene, variant } = sceneOfItem(item)
    if (variant === 'kv-part' && isAbout(value, microseconds(scene.weightBytes, scene.gpu))) {
      return { id: `${FAMILY}.weights-for-kv`, message: rich('That is the time to read the weights. The question asks for the KV cache\'s part of the floor.') }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const key = keyOf(scene, variant, level)
  const other = (attempt: number): Scene => drawScene(variant, level, seed, `example-${attempt}`)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant,
      level,
      seed,
      kcs: spec.kcs,
      params: { model: scene.model, weightBytes: scene.weightBytes, kvPerToken: scene.kvPerToken, gpu: scene.gpu.claim, ctx: scene.ctx, batch: scene.batch },
      givens: givensOf(scene, variant, level),
      stem: stemOf(variant, level),
      worked: workedPart(level, stepsOf(scene, variant, level), (attempt) => {
        const s = other(attempt)
        return Math.abs(keyOf(s, variant, level) - key) > 0.05 * key ? stepsOf(s, variant, level) : null
      }),
      answer: { kind: 'numeric', label: variant === 'kv-part' ? "the KV cache's part of the least time" : 'the least time of the step', unit: 'µs', truth: key, tolerance: ARITHMETIC },
    },
  )
}

export const floor: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The least time of a decode step',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the model, the card and the context length are each drawn on their own.
  band: () => true,
  grade: (item, response) => gradeNumeric(item, response, DIAGNOSES),
  solution(item) {
    const { scene, variant } = sceneOfItem(item)
    return stepsOf(scene, variant, item.level)
  },
}
