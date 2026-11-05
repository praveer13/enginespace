// How a model's layers become a spec (D-045), and the presets the games and the lab use.
//
// The builder follows vLLM's hybrid manager at the pin, so that "every group's block is exactly one page" is reached the way the engine
// reaches it, and the padding it costs is reported:
//   1. State layers first (vllm.hybrid-kv.page-unify). A recurrent layer's state has a size of its own, and the attention block is made
//      larger, in whole multiples of the base block, until one block holds it (vllm.hybrid-kv.attn-block-inflate). The state is then
//      padded up to the block, per layer.
//   2. One group size (vllm.hybrid-kv.group-size). Layers of one kind share a block table, and every group has the same number of
//      layers, which is the fewest that any kind has, so that every group's block is the same size. When the biggest kind is less
//      than 1.5 times the smallest, the biggest is used instead, so that a draft model's one extra layer does not double the groups
//      (vllm.hybrid-kv.group-size-near).
//   3. Each kind splits into ⌈layers ÷ group size⌉ groups, and its layers are spread over them as evenly as they go
//      (vllm.hybrid-kv.layer-spread). A group that comes out short is padded with empty layers (vllm.hybrid-kv.padding-layers).
//      vLLM's design document draws the last group padded; the code at the pin spreads the padding, and the presets follow the code.
//   4. The page is the group size × the block × the bytes of a token in a layer.

import { divCeil, permille } from '../core/int'
import { kvAdapterPages, kvLoraBytes } from './spec'
import type { KvLoraShape } from './spec'
import type { KvGroupKind, KvGroupSpec, KvSpec } from './types'

/** One kind of layer in a model: its layer count, and what its groups keep. */
export interface KvLayerKind {
  readonly kind: KvGroupKind
  /** Layers of this kind in the model. */
  readonly layers: number
  /** `sliding` only: the window in tokens. */
  readonly window?: number
  /** `state` only: bytes of one layer's state. */
  readonly stateBytes?: number
  /** `state` only: blocks kept for each request. The default is 2, the state at the last edge and the live state. */
  readonly statePages?: number
}

/** A model as the pool sees it. */
export interface KvModelDesc {
  /** Bytes of one token's key and value in one layer. */
  readonly tokenBytes: number
  /** Tokens in an attention block before any inflation. vLLM's default is 16 (vllm.cache.block-size-default). */
  readonly baseBlockTokens: number
  readonly kinds: readonly KvLayerKind[]
}

export interface KvBuildOptions {
  readonly prefixCaching?: boolean
  readonly adapterSlots?: number
}

const NAME: Record<KvGroupKind, string> = { full: 'full', sliding: 'sw', state: 'state' }

/** A spec for `model` with `poolPages` pages. The groups are listed kind by kind in the order of `model.kinds`. */
export function buildKvSpec(model: KvModelDesc, poolPages: number, options: KvBuildOptions = {}): KvSpec {
  if (model.kinds.length === 0) throw new RangeError('a model has at least one kind of layer')
  const seen = new Set<string>()
  for (const k of model.kinds) {
    const key = `${k.kind}/${k.window ?? ''}`
    if (seen.has(key)) throw new RangeError(`two kinds of layer are alike (${key}): list them as one`)
    seen.add(key)
    if (!Number.isSafeInteger(k.layers) || k.layers < 1) throw new RangeError(`a kind has at least one layer, got ${k.layers}`)
    if (k.kind === 'state' && !Number.isSafeInteger(k.stateBytes)) throw new RangeError('a state kind needs stateBytes')
  }
  let blockTokens = model.baseBlockTokens
  const widest = model.kinds.reduce((most, k) => Math.max(most, k.kind === 'state' ? (k.stateBytes ?? 0) : 0), 0)
  if (widest > 0) blockTokens = model.baseBlockTokens * divCeil(widest, model.baseBlockTokens * model.tokenBytes)

  const counts = model.kinds.map((k) => k.layers)
  const fewest = Math.min(...counts)
  const most = Math.max(...counts)
  // 1.5 × the fewest, in integers: most < 1.5 × fewest ⇔ 2 × most < 3 × fewest.
  const groupSize = 2 * most < 3 * fewest ? most : fewest

  const groups: KvGroupSpec[] = []
  let padding = 0
  // Groups are numbered within their kind across every kind of that name: two windows make sw0, sw1, sw2.
  const numbered: Record<KvGroupKind, number> = { full: 0, sliding: 0, state: 0 }
  for (const k of model.kinds) {
    const count = divCeil(k.layers, groupSize)
    const whole = (k.layers - (k.layers % count)) / count
    const extra = k.layers % count
    for (let i = 0; i < count; i++) {
      const layers = whole + (i < extra ? 1 : 0)
      const padLayers = groupSize - layers
      padding += padLayers
      const g: KvGroupSpec = {
        id: `${NAME[k.kind]}${numbered[k.kind]++}`,
        kind: k.kind,
        layers,
        ...(padLayers > 0 ? { padLayers } : {}),
        blockTokens,
        ...(k.kind === 'sliding' ? { window: k.window } : {}),
        ...(k.kind === 'state' ? { statePages: k.statePages ?? 2, stateBytes: k.stateBytes } : {}),
      }
      groups.push(g)
    }
  }
  return {
    poolPages,
    pageBytes: groupSize * blockTokens * model.tokenBytes,
    tokenBytes: model.tokenBytes,
    paddingLayers: padding,
    groups,
    prefixCaching: options.prefixCaching ?? true,
    ...(options.adapterSlots === undefined ? {} : { adapterSlots: options.adapterSlots }),
  }
}

/**
 * The waste of a spec, as a share of the pages it hands out: the padded layers, and the part of a state layer's slice that its state
 * does not fill. Both are bytes of a page that no token's KV can use. Shares are permille, rounded to nearest.
 */
export function kvPaddingWaste(spec: KvSpec): { readonly bytes: number; readonly permille: number } {
  let wasted = 0
  for (const g of spec.groups) {
    const slice = g.blockTokens * spec.tokenBytes
    wasted += (g.padLayers ?? 0) * slice
    if (g.kind === 'state' && g.stateBytes !== undefined) wasted += g.layers * (slice - g.stateBytes)
  }
  const total = spec.groups.length * spec.pageBytes
  return { bytes: wasted, permille: permille(wasted, total) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Presets

/**
 * The models the games and the lab use. Layer counts and the window of `two-kinds` are the examples in vLLM's design document
 * (vllm.hybrid-kv.doc-example-blocks, vllm.hybrid-kv.doc-gemma3-layers). Everything in bytes, and every window of the larger two,
 * is synthetic [estimated]: sized so that a page is a number a learner can hold in their head, and a pool of a hundred pages fills.
 */
export const KV_PRESET_IDS = ['one-group', 'two-kinds', 'same-size', 'state'] as const
export type KvPresetId = (typeof KV_PRESET_IDS)[number]

const MODELS: Record<KvPresetId, KvModelDesc> = {
  // Full attention only: one group serves every layer.
  'one-group': { tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: 8 }] },
  // 10 full and 20 sliding layers, 16-token blocks, a 32-token window: 3 groups of 10 layers, and a 112-token request holds 7 + 2 + 2.
  'two-kinds': {
    tokenBytes: 1024,
    baseBlockTokens: 16,
    kinds: [
      { kind: 'full', layers: 10 },
      { kind: 'sliding', layers: 20, window: 32 },
    ],
  },
  // Gemma-3-27b's layers: 10 full and 52 sliding. 7 groups of 10 layers, 8 of them padding.
  'same-size': {
    tokenBytes: 1024,
    baseBlockTokens: 16,
    kinds: [
      { kind: 'full', layers: 10 },
      { kind: 'sliding', layers: 52, window: 64 },
    ],
  },
  // A recurrent model: 8 attention layers and 24 whose state is 32 KiB a layer. The attention block grows from 16 tokens to 32.
  state: {
    tokenBytes: 1024,
    baseBlockTokens: 16,
    kinds: [
      { kind: 'full', layers: 8 },
      { kind: 'state', layers: 24, stateBytes: 32768 },
    ],
  },
}

/** Pages in a preset's pool unless the caller picks. Small on purpose: a request of a few hundred tokens fills a tenth of it [estimated]. */
export const KV_PRESET_POOL: Readonly<Record<KvPresetId, number>> = { 'one-group': 64, 'two-kinds': 96, 'same-size': 192, state: 96 }

export function kvPresetModel(id: KvPresetId): KvModelDesc {
  return MODELS[id]
}

export function kvPreset(id: KvPresetId, poolPages: number = KV_PRESET_POOL[id], options: KvBuildOptions = {}): KvSpec {
  return buildKvSpec(MODELS[id], poolPages, options)
}

// ---------------------------------------------------------------------------------------------------------------------------
// Adapters

/** The synthetic LoRA of the presets: 16 layers, 4 projections, a hidden size of 256, 2-byte weights [estimated]. A rank r is 65,536 × r bytes. */
export const KV_LORA_SHAPE: KvLoraShape = { hidden: 256, layers: 16, targets: 4, dtypeBytes: 2 }

export interface KvAdapterSpec {
  readonly id: number
  readonly rank: number
  readonly bytes: number
  /** ⌈bytes ÷ pageBytes⌉ (D-045). */
  readonly pages: number
}

/** Adapters of the given ranks for this spec's pages, numbered from 0. The pages are what a `load-adapter` carries. */
export function kvAdapterCatalog(spec: KvSpec, ranks: readonly number[] = [8, 16, 64]): readonly KvAdapterSpec[] {
  return ranks.map((rank, id) => {
    const bytes = kvLoraBytes(KV_LORA_SHAPE, rank)
    return { id, rank, bytes, pages: kvAdapterPages(bytes, spec.pageBytes) }
  })
}
