// What the tiers world is made of (ARCHITECTURE §5.8, D-034): three places a KV block can live, the operations that move it between
// them, and the state a snapshot shows. Plain data, like every model's: it survives canonical JSON and a worker boundary unchanged.
//
// A block is named by its hash (kv/hash.ts). It is computed on the GPU, may be copied down to the CPU and the disk (offload), copied back
// up to the GPU (load), and dropped from any tier (evict). A copy leaves the source where it was: a tier holds a block until something
// evicts it or makes room.

import type { KvEvent, KvEventBatch } from '../kv/types'

/** The id of this model's notional-machine card is shared with `kv`: the tiers add places, not a new machine (§5.9). */
export const TIERS_VERSION = 'kv-events@1'

/** The tiers, nearest the compute first. The names are the `medium` of the events (vllm.kv-events.block-stored). */
export const TIER_IDS = ['GPU', 'CPU', 'DISK'] as const
export type TierId = (typeof TIER_IDS)[number]

/** 0 for the GPU, 1 for the CPU and 2 for the disk: an offload goes to a higher rank, a load to rank 0. */
export const tierRank = (tier: TierId): number => TIER_IDS.indexOf(tier)

export interface TiersSpec {
  /** Tokens in one block: the `block_size` of every BlockStored. */
  readonly blockTokens: number
  /** Blocks each tier holds, at least 1. A tier that is full evicts its least recently used block to take another. */
  readonly capacity: Readonly<Record<TierId, number>>
}

/** A block's identity and content: what a BlockStored says about it, whichever tier the copy is entering. */
export interface TierBlock {
  readonly hash: number
  /** The hash of the block before it in its chain, or null for a first block. */
  readonly parent: number | null
  /** Exactly `blockTokens` token ids. */
  readonly tokens: readonly number[]
  readonly adapter: number | null
}

export type TiersOp =
  /** Computes a block on the GPU. */
  | ({ readonly op: 'store' } & TierBlock)
  /** Copies a block from one tier down to a farther one: the connector's save. */
  | { readonly op: 'offload'; readonly hash: number; readonly from: TierId; readonly to: TierId }
  /** Copies a block from the CPU or the disk to the GPU: the connector's load. */
  | { readonly op: 'load'; readonly hash: number; readonly from: TierId }
  /** Drops a block from one tier. */
  | { readonly op: 'evict'; readonly hash: number; readonly tier: TierId }
  /** Drops every block of every tier. */
  | { readonly op: 'reset' }

export type TiersRefusal =
  /** A store or a copy of a block that the destination holds already. */
  | 'exists'
  /** An op names a block that the source does not hold, or whose content the model never saw. */
  | 'unknown'
  /** An offload that does not go to a farther tier, or a load from the GPU. */
  | 'bad-tier'

export type TiersResult = { readonly ok: true } | { readonly ok: false; readonly reason: TiersRefusal }

export interface TierState {
  readonly id: TierId
  /** The hashes the tier holds, the least recently used first. */
  readonly blocks: readonly number[]
}

export interface TiersState {
  readonly tiers: readonly TierState[]
  /** Operations applied, refused ones included. It is the clock of the event batches. */
  readonly step: number
}

/** What a publisher answers, whether it is the reference or a learner's module behind the invoke protocol (§8.3). */
export interface TiersModel {
  apply(op: TiersOp): TiersResult
  /** The truth: a snapshot that later operations do not change. */
  state(): TiersState
  /** Every batch published since the model was made, in order. */
  events(): readonly KvEventBatch[]
}

export type { KvEvent, KvEventBatch }
