// What the hybrid KV manager's world is made of (ARCHITECTURE §5.4, D-045, D-042; WORLD §2.4): one pool of physical pages, the groups
// that draw from it, the operations a manager answers, the state a snapshot shows, and the events it publishes.
//
// Nothing here runs. Every value is plain data that survives canonical JSON, a worker boundary and the Python grader unchanged
// (§9.8), so a learner's module, the host and the reference all speak the same shapes.

import type { AdapterId, ReqId } from '../core/types'

/** The id of this model's notional-machine card, `content/cards/kv.md` (§5.9: each model exports its card id). */
export const KV_CARD_ID = 'kv'

// ---------------------------------------------------------------------------------------------------------------------------
// The spec

/**
 * What a group keeps of a request's tokens (vllm.hybrid-kv.single-pool, WORLD §2.4):
 *   - `full`: every block, until the request ends;
 *   - `sliding`: the blocks that cover the last `window` tokens, and no older ones;
 *   - `state`: the newest `statePages` blocks, however long the request runs. The model draws a recurrent layer's state this way:
 *     the block that is full holds the state at its edge, so it can be cached and hit, and the newest block holds the live state.
 */
export type KvGroupKind = 'full' | 'sliding' | 'state'

export interface KvGroupSpec {
  /** A name that is the same in the spec, the state, the mirror and the debrief: `full0`, `sw1`, `state0`. */
  readonly id: string
  readonly kind: KvGroupKind
  /** Layers of the model that this group serves. The group shares one block table among them (vllm.hybrid-kv.single-pool). */
  readonly layers: number
  /** Padding layers that bring the group's block to the pool's page size (D-045). The default is 0. */
  readonly padLayers?: number
  /** Tokens in one block of this group. A group that was inflated to reach the page size has more than the others. */
  readonly blockTokens: number
  /** `sliding` only: the window, in tokens. The token being computed attends to itself and the `window - 1` before it. */
  readonly window?: number
  /** `state` only: blocks kept for each request, at least 1. */
  readonly statePages?: number
  /**
   * `state` only, and for the record: bytes of one layer's state before it was padded to `blockTokens × tokenBytes`, the size of one
   * layer's slice of a block. The padding is waste the preset reports (vllm.hybrid-kv.page-unify).
   */
  readonly stateBytes?: number
}

export interface KvSpec {
  /** Physical pages in the pool, ids `0 … poolPages - 1`. Every group and every adapter draws from them (D-045). */
  readonly poolPages: number
  /** Bytes in one page. Every group's block is exactly this many bytes, and an adapter takes ⌈adapter bytes ÷ pageBytes⌉ pages. */
  readonly pageBytes: number
  /** Bytes of one token's key and value in one layer: the same for every layer, as it is for the models the pin supports. */
  readonly tokenBytes: number
  /** Padding layers in all, which is the waste the preset reports. It is the sum of the groups' `padLayers`. */
  readonly paddingLayers: number
  readonly groups: readonly KvGroupSpec[]
  /** Whether full blocks are hashed, cached and found again. Off, a freed page is only free, and nothing is published. */
  readonly prefixCaching: boolean
  /**
   * The engines' policy for adapters (D-042): that many fixed slots outside the pool, in place of pages. A `load-adapter` then takes a
   * slot, and takes no page. The model of unified paging is the one without this field.
   */
  readonly adapterSlots?: number
}

// ---------------------------------------------------------------------------------------------------------------------------
// Operations and replies

/**
 * One call to a manager. A token is a non-negative integer id below 2^32. The tokens of a prompt are what the blocks are hashed from,
 * so two requests share a block only when they share its tokens, its adapter and every block before it.
 */
export type KvOp =
  | { readonly op: 'admit'; readonly req: ReqId; readonly prompt: readonly number[]; readonly adapter?: AdapterId }
  | { readonly op: 'append'; readonly req: ReqId; readonly tokens: readonly number[] }
  | { readonly op: 'finish'; readonly req: ReqId }
  | { readonly op: 'load-adapter'; readonly adapter: AdapterId; readonly pages: number }
  | { readonly op: 'unload-adapter'; readonly adapter: AdapterId }
  | { readonly op: 'reset' }

/** Why an operation was refused. A refusal leaves the state exactly as it was (all or nothing). */
export type KvRefusal =
  /** The pool cannot supply the pages the operation needs. */
  | 'no-pages'
  /** Every adapter slot is taken (`adapterSlots` only). */
  | 'no-slot'
  /** An admit names an adapter that is not resident. */
  | 'no-adapter'
  /** An admit names a request, or a load names an adapter, that is already there. */
  | 'exists'
  /** An append or a finish names a request, or an unload an adapter, that is not there. */
  | 'unknown'
  /** An unload of an adapter that a running request uses. */
  | 'in-use'
  /** A reset while a request is running. */
  | 'busy'

export type KvResult =
  /** `free` is the pages the pool can supply now (the free and the cached), and `hit` the tokens an admit found in the cache. */
  | { readonly ok: true; readonly free: number; readonly hit?: number }
  | { readonly ok: false; readonly reason: KvRefusal; readonly free: number }

// ---------------------------------------------------------------------------------------------------------------------------
// State

/**
 * One physical page, in one of four states (GAMES.md §8): free (nothing in it), cached (a hashed block nobody holds, which a hit can
 * bring back and an allocation can evict), used (held by at least one request), or an adapter's.
 */
export type KvPage =
  | { readonly st: 'free' }
  | { readonly st: 'cached'; readonly group: number; readonly hash: number }
  | { readonly st: 'used'; readonly group: number; readonly refs: number; readonly hash: number | null }
  | { readonly st: 'adapter'; readonly adapter: AdapterId }

export interface KvRequest {
  readonly id: ReqId
  readonly adapter: AdapterId | null
  /** Tokens the request holds KV for: its prompt and everything appended. */
  readonly length: number
  /** One table per group, one entry per block: the page, or null where the group has let go of the block. */
  readonly tables: readonly (readonly (number | null)[])[]
}

export interface KvAdapter {
  readonly id: AdapterId
  /** The pool pages that hold the adapter, in the order they were taken. Empty under `adapterSlots`. */
  readonly pages: readonly number[]
  /** Running requests that use it. While it is above 0 the adapter stays. */
  readonly users: number
}

/** The pool's cache: the page that holds the block with this hash in this group. */
export interface KvCacheEntry {
  readonly group: number
  readonly hash: number
  readonly page: number
}

/**
 * What a consumer of the events believes is cached: for each block, how many more times it was stored than removed. A stream that is
 * published exactly once leaves every count at 1 for a block in the cache, and no entry for one that is not.
 */
export interface KvConsumerEntry {
  readonly group: number
  readonly hash: number
  readonly count: number
}

export interface KvState {
  /** Every page, by id. */
  readonly pages: readonly KvPage[]
  /** The pages that can be allocated, in eviction order: the first is taken next. Free pages and cached pages, no others. */
  readonly queue: readonly number[]
  /** Running requests, by id. */
  readonly requests: readonly KvRequest[]
  /** Resident adapters, by id. */
  readonly adapters: readonly KvAdapter[]
  /** The cache, by group and then hash. */
  readonly cache: readonly KvCacheEntry[]
  /** The consumer's view of the events published so far, by group and then hash. */
  readonly consumer: readonly KvConsumerEntry[]
  /** Operations applied, refused ones included. It is the clock of the event batches. */
  readonly step: number
}

// ---------------------------------------------------------------------------------------------------------------------------
// Events (kv-events@1, D-034): the shapes of vLLM v0.33.0's KV events

/**
 * A run of consecutive blocks entered the cache of one group (vllm.kv-events.block-stored). The seven fields without a default are
 * always there. The optional ones appear when they are set, as an encoder that omits defaults writes them. The model never sets
 * `locality`, `ownership`, `session_id` or `lookahead_token_ids`, and `kv_cache_spec_sliding_window` only for a sliding group.
 * A hash is the model's own, a number below 2^53 (hash.ts), where vLLM's is a digest or its low 64 bits.
 */
export interface KvBlockStored {
  readonly type: 'BlockStored'
  readonly block_hashes: readonly number[]
  /** The hash of the block before the first one in the group's chain, or null when the run starts at the first block. */
  readonly parent_block_hash: number | null
  /** The tokens of the whole run: `block_size` for each hash. */
  readonly token_ids: readonly number[]
  readonly block_size: number
  /** The adapter's id, which the pin marks deprecated in favour of `lora_name` (vllm.kv-events.adapter-field). */
  readonly lora_id: number | null
  readonly medium: string | null
  readonly lora_name: string | null
  /** One entry for each hash: the adapter's name, or null (vllm.kv-events.extra-keys). */
  readonly extra_keys?: readonly (readonly string[] | null)[]
  readonly group_idx?: number
  /** `full_attention`, `sliding_window` or `mamba` (vllm.kv-events.spec-kind). */
  readonly kv_cache_spec_kind?: string
  readonly kv_cache_spec_sliding_window?: number
}

/** A block left the cache of one group, because its page was allocated to something else (vllm.kv-events.block-removed-emission). */
export interface KvBlockRemoved {
  readonly type: 'BlockRemoved'
  readonly block_hashes: readonly number[]
  readonly medium: string | null
  readonly group_idx?: number
}

/** The cache was reset (vllm.kv-events.all-blocks-cleared). It has no fields. */
export interface KvAllBlocksCleared {
  readonly type: 'AllBlocksCleared'
}

export type KvEvent = KvBlockStored | KvBlockRemoved | KvAllBlocksCleared

/**
 * A batch is the array `[ts, events]` (vllm.kv-events.batch; its third entry, the data-parallel rank, is left out when it is unset).
 * `ts` is the index of the operation that published the events: the model has no clock but its own steps.
 */
export type KvEventBatch = readonly [ts: number, events: readonly KvEvent[]]

// ---------------------------------------------------------------------------------------------------------------------------
// The manager

/** What a manager answers, whether it is the reference or a learner's module behind the invoke protocol (ARCHITECTURE §8.3). */
export interface KvModel {
  apply(op: KvOp): KvResult
  /** A snapshot: later operations do not change it. */
  state(): KvState
  /** Every batch published since the manager was made, in order. */
  events(): readonly KvEventBatch[]
}
