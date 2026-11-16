// The reference publisher of the tiers (ARCHITECTURE §5.8, D-034): three LRU tiers and the `kv-events@1` stream they publish.
//
// What it publishes, and when (the shapes are kv/types.ts's, which are vLLM v0.33.0's):
//   BlockStored       once for each block that enters a tier, with that tier as its `medium`, after the room has been made
//   BlockRemoved      once for each block that leaves a tier, with that tier as its `medium`: an eviction by the op, or a victim that makes room
//   AllBlocksCleared  once by a reset, with no BlockRemoved for the blocks it drops (vllm.kv-events.all-blocks-cleared)
// A batch is `[ts, events]` with `ts` the index of the operation, and an operation that publishes nothing publishes no batch. When a
// store or a copy needs room, the victim's BlockRemoved comes before the BlockStored of the block that takes its place, so that a consumer
// that checks the capacity of a tier after every event never sees it over.
// The operation is all or nothing: a refused one changes nothing and publishes nothing.

import type { KvAllBlocksCleared, KvBlockRemoved, KvBlockStored, KvEvent, KvEventBatch } from '../kv/types'
import { kvAdapterName } from '../kv/events'
import { tierRank, TIER_IDS } from './types'
import type { TierBlock, TierId, TiersModel, TiersOp, TiersResult, TiersSpec, TiersState } from './types'

export const tiersStored = (block: TierBlock, blockTokens: number, medium: TierId): KvBlockStored => {
  const name = block.adapter === null ? null : kvAdapterName(block.adapter)
  return {
    type: 'BlockStored',
    block_hashes: [block.hash],
    parent_block_hash: block.parent,
    token_ids: block.tokens,
    block_size: blockTokens,
    lora_id: block.adapter,
    medium,
    lora_name: name,
    extra_keys: [name === null ? null : [name]],
  }
}

export const tiersRemoved = (hash: number, medium: TierId): KvBlockRemoved => ({ type: 'BlockRemoved', block_hashes: [hash], medium })

export const tiersCleared = (): KvAllBlocksCleared => ({ type: 'AllBlocksCleared' })

export function assertTiersSpec(spec: TiersSpec): void {
  if (!Number.isInteger(spec.blockTokens) || spec.blockTokens < 1) throw new RangeError('a block holds at least one token')
  for (const id of TIER_IDS) {
    const c = spec.capacity[id]
    if (!Number.isInteger(c) || c < 1) throw new RangeError(`tier ${id} holds at least one block, got ${c}`)
  }
}

/**
 * The reference. Subclass it and override one `publish…` method to make a publisher that breaks one rule of the stream while the truth
 * stays right: the bestiary does so, and the judge must name the check that notices.
 */
export class TiersReference implements TiersModel {
  /** Each tier's hashes, least recently used first. */
  protected readonly held: Record<TierId, number[]> = { GPU: [], CPU: [], DISK: [] }
  /** The content of every block the model has seen, which a copy publishes again. */
  protected readonly seen = new Map<number, TierBlock>()
  protected readonly batches: KvEventBatch[] = []
  protected step = 0
  private pending: KvEvent[] = []

  readonly spec: TiersSpec

  constructor(spec: TiersSpec) {
    assertTiersSpec(spec)
    this.spec = spec
  }

  // The three publication points. A subclass overrides one of them.
  protected publishStored(block: TierBlock, medium: TierId): void {
    this.pending.push(tiersStored(block, this.spec.blockTokens, medium))
  }
  protected publishRemoved(hash: number, medium: TierId): void {
    this.pending.push(tiersRemoved(hash, medium))
  }
  protected publishCleared(): void {
    this.pending.push(tiersCleared())
  }
  /** Hands the events of one operation over as a batch. A subclass may reorder them here. */
  protected flush(ts: number): void {
    if (this.pending.length > 0) this.batches.push([ts, this.pending])
    this.pending = []
  }

  protected touch(tier: TierId, hash: number): void {
    const list = this.held[tier]
    list.splice(list.indexOf(hash), 1)
    list.push(hash)
  }

  protected drop(tier: TierId, hash: number): void {
    const list = this.held[tier]
    list.splice(list.indexOf(hash), 1)
    this.publishRemoved(hash, tier)
  }

  /** Puts `block` in `tier` as its newest, evicting the oldest first when the tier is full. */
  protected admit(tier: TierId, block: TierBlock): void {
    const list = this.held[tier]
    if (list.length >= this.spec.capacity[tier]) this.drop(tier, list[0])
    list.push(block.hash)
    this.publishStored(block, tier)
  }

  protected run(op: TiersOp): TiersResult {
    if (op.op === 'reset') {
      for (const id of TIER_IDS) this.held[id] = []
      this.publishCleared()
      return { ok: true }
    }
    if (op.op === 'store') {
      if (op.tokens.length !== this.spec.blockTokens) return { ok: false, reason: 'unknown' }
      if (this.held.GPU.includes(op.hash)) return { ok: false, reason: 'exists' }
      const block: TierBlock = { hash: op.hash, parent: op.parent, tokens: op.tokens, adapter: op.adapter }
      this.seen.set(op.hash, block)
      this.admit('GPU', block)
      return { ok: true }
    }
    if (op.op === 'evict') {
      if (!this.held[op.tier].includes(op.hash)) return { ok: false, reason: 'unknown' }
      this.drop(op.tier, op.hash)
      return { ok: true }
    }
    const from = op.from
    const to: TierId = op.op === 'load' ? 'GPU' : op.to
    if (op.op === 'load' ? from === 'GPU' : tierRank(to) <= tierRank(from)) return { ok: false, reason: 'bad-tier' }
    const block = this.seen.get(op.hash)
    if (block === undefined || !this.held[from].includes(op.hash)) return { ok: false, reason: 'unknown' }
    if (this.held[to].includes(op.hash)) return { ok: false, reason: 'exists' }
    this.touch(from, op.hash)
    this.admit(to, block)
    return { ok: true }
  }

  apply(op: TiersOp): TiersResult {
    const ts = this.step++
    const result = this.run(op)
    this.flush(ts)
    return result
  }

  state(): TiersState {
    return { tiers: TIER_IDS.map((id) => ({ id, blocks: [...this.held[id]] })), step: this.step }
  }

  events(): readonly KvEventBatch[] {
    return this.batches.map(([ts, events]) => [ts, [...events]] as const)
  }
}

export const tiersReference = (spec: TiersSpec): TiersReference => new TiersReference(spec)
