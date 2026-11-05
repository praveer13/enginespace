// The events a manager publishes (kv-events@1, D-034), and the consumer that rebuilds the cache from them.
//
// The shapes are vLLM v0.33.0's (types.ts): an event is a tagged map whose `type` is the class name, and a batch is the array
// `[ts, events]`. SGLang v0.5.23 encodes its events the same way and says so (sglang.kv-events.encoding). A stored block carries its adapter
// as `lora_name` in both engines (vllm.kv-events.adapter-field, sglang.kv-events.adapter-field).
//
// What the model publishes, and when:
//   BlockStored   one event for each run of consecutive blocks that a request's operation caches in a group, after the operation has
//                 allocated its pages: the hashes, the hash before the first, and the tokens of the whole run (vllm.kv-events.stored-content)
//   BlockRemoved  one event for each hash whose page an allocation takes, in the order the pages are taken (vllm.kv-events.block-removed-emission)
//   AllBlocksCleared  once, by a reset (vllm.kv-events.all-blocks-cleared), with no BlockRemoved for the hashes it drops
// A block that two requests compute separately is cached once, by the page that got there first, and published once: vLLM caches a
// second page under the same key and publishes it too (vllm.kv-pool.duplicate-keys), which the model leaves out so that a consumer's set
// of keys is the cache.

import type { KvAllBlocksCleared, KvBlockRemoved, KvBlockStored, KvConsumerEntry, KvEvent, KvEventBatch, KvGroupSpec } from './types'

/** The storage medium that the events name: the pool is the GPU's. */
export const KV_MEDIUM = 'GPU'

/** The `kv_cache_spec_kind` of each kind of group (vllm.kv-events.spec-kind). */
export const KV_SPEC_KIND = { full: 'full_attention', sliding: 'sliding_window', state: 'mamba' } as const

/** The public name of an adapter, as `lora_name` carries it. */
export const kvAdapterName = (adapter: number): string => `adapter-${adapter}`

/** `BlockStored` for a run of consecutive blocks of group `groupIndex`: their `hashes`, the hash before the first, and the run's `tokens`. */
export function kvStored(
  group: KvGroupSpec,
  groupIndex: number,
  hashes: readonly number[],
  parent: number | null,
  tokens: readonly number[],
  adapter: number | null,
): KvBlockStored {
  const name = adapter === null ? null : kvAdapterName(adapter)
  return {
    type: 'BlockStored',
    block_hashes: hashes,
    parent_block_hash: parent,
    token_ids: tokens,
    block_size: group.blockTokens,
    lora_id: adapter,
    medium: KV_MEDIUM,
    lora_name: name,
    extra_keys: hashes.map(() => (name === null ? null : [name])),
    group_idx: groupIndex,
    kv_cache_spec_kind: KV_SPEC_KIND[group.kind],
    ...(group.kind === 'sliding' ? { kv_cache_spec_sliding_window: group.window } : {}),
  }
}

export const kvRemoved = (groupIndex: number, hash: number): KvBlockRemoved => ({ type: 'BlockRemoved', block_hashes: [hash], medium: KV_MEDIUM, group_idx: groupIndex })

export const kvCleared = (): KvAllBlocksCleared => ({ type: 'AllBlocksCleared' })

// ---------------------------------------------------------------------------------------------------------------------------
// The consumer

/** What a consumer of the events believes: for each group, for each hash, how many more times it was stored than removed. */
export type KvConsumerCounts = Map<number, Map<number, number>>

/**
 * Applies one event to a consumer's counts: a store adds 1 to each of its hashes, a removal takes 1 off, and a clear forgets everything.
 * A stream that is published exactly once keeps every count at 0 or 1, and `kvInvariants` reads a count of anything else as a block that
 * was published twice, or removed without having been stored.
 */
export function kvConsume(counts: KvConsumerCounts, event: KvEvent): void {
  if (event.type === 'AllBlocksCleared') {
    counts.clear()
    return
  }
  const group = event.group_idx ?? -1
  let mine = counts.get(group)
  if (mine === undefined) {
    mine = new Map<number, number>()
    counts.set(group, mine)
  }
  const step = event.type === 'BlockStored' ? 1 : -1
  for (const hash of event.block_hashes) {
    const now = (mine.get(hash) ?? 0) + step
    if (now === 0) mine.delete(hash)
    else mine.set(hash, now)
  }
}

/** The entries of a consumer's counts, by group and then hash. */
export function kvConsumerEntries(counts: ReadonlyMap<number, ReadonlyMap<number, number>>): KvConsumerEntry[] {
  const entries: KvConsumerEntry[] = []
  counts.forEach((mine, group) => {
    mine.forEach((count, hash) => entries.push({ group, hash, count }))
  })
  return entries.sort((a, b) => a.group - b.group || a.hash - b.hash)
}

/** What a consumer of `batches` believes is cached (TR5b's reference consumer reads a stream the same way). */
export function kvConsumerView(batches: readonly KvEventBatch[]): KvConsumerEntry[] {
  const counts: KvConsumerCounts = new Map()
  for (const [, events] of batches) for (const event of events) kvConsume(counts, event)
  return kvConsumerEntries(counts)
}
