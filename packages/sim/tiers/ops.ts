// Seeded operation streams for the tiers (ARCHITECTURE §5.8, `tiersOps`): chains of blocks that are computed, copied down, brought back,
// evicted and sometimes reset, with the occasional call that must be refused. Chains share prefixes, as conversations do, and their hashes
// are the real chain hashes of kv/hash.ts. The generator runs the reference as it goes, so a stream is valid at every step for a publisher
// that answers as the reference does, and holds the refusals as a share of its steps.

import { below, chance, pick, rngFor, weighted } from '../core/rng'
import type { Seed } from '../core/types'
import { kvBlockHash } from '../kv/hash'
import { tiersReference } from './reference'
import { TIER_IDS, tierRank } from './types'
import type { TierBlock, TierId, TiersOp, TiersSpec } from './types'

const VOCAB = 50000

/** Hashes at or above this are never made by the stream (a hash is below 2^53), so naming one is naming a block that is not there. */
const MISSING = 4503599627370496

/** A tier spec of the given sizes. The default is small enough that every tier fills within a short stream. */
export const tiersSpec = (capacity: Partial<Record<TierId, number>> = {}, blockTokens = 4): TiersSpec => ({
  blockTokens,
  capacity: { GPU: capacity.GPU ?? 4, CPU: capacity.CPU ?? 6, DISK: capacity.DISK ?? 10 },
})

/** `n` operations for `spec` from `seed`. */
export function tiersOps(seed: Seed, spec: TiersSpec, n: number): readonly TiersOp[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`a stream has a non-negative number of operations, got ${n}`)
  const rng = rngFor(seed, 'tiers/ops')
  const model = tiersReference(spec)
  const ops: TiersOp[] = []
  // Chains grow one block at a time, and a new chain may start from the first blocks of an old one.
  const chains: TierBlock[][] = []
  const newBlock = (parent: TierBlock | null, adapter: number | null): TierBlock => {
    const tokens = Array.from({ length: spec.blockTokens }, () => below(rng, VOCAB))
    const hash = kvBlockHash(parent === null ? 0 : parent.hash, tokens, 0, tokens.length, adapter === null ? 0 : adapter + 1)
    return { hash, parent: parent === null ? null : parent.hash, tokens, adapter }
  }
  const push = (op: TiersOp): void => {
    ops.push(op)
    model.apply(op)
  }
  const held = (): { tier: TierId; hash: number }[] => model.state().tiers.flatMap((t) => t.blocks.map((hash) => ({ tier: t.id, hash })))

  while (ops.length < n) {
    const kind = weighted(rng, [34, 22, 18, 14, 8, 2])
    if (kind === 0) {
      // Compute the next block of a chain, or of a new one.
      if (chains.length === 0 || chance(rng, 250)) {
        const adapter = chance(rng, 200) ? below(rng, 2) : null
        const from = chains.length > 0 && chance(rng, 400) ? pick(rng, chains) : null
        const prefix = from === null ? [] : from.slice(0, 1 + below(rng, from.length))
        const chain = [...prefix]
        const b = newBlock(chain.length > 0 ? chain[chain.length - 1] : null, from === null ? adapter : prefix[0].adapter)
        chain.push(b)
        chains.push(chain)
        push({ op: 'store', ...b })
      } else {
        const chain = pick(rng, chains)
        const b = newBlock(chain[chain.length - 1], chain[0].adapter)
        chain.push(b)
        push({ op: 'store', ...b })
      }
    } else if (kind === 1) {
      const h = held().filter((e) => e.tier !== 'DISK')
      if (h.length === 0) continue
      const e = pick(rng, h)
      const to = e.tier === 'GPU' ? pick(rng, ['CPU', 'DISK'] as const) : 'DISK'
      push({ op: 'offload', hash: e.hash, from: e.tier, to })
    } else if (kind === 2) {
      const h = held().filter((e) => e.tier !== 'GPU')
      if (h.length === 0) continue
      const e = pick(rng, h)
      push({ op: 'load', hash: e.hash, from: e.tier })
    } else if (kind === 3) {
      const h = held()
      if (h.length === 0) continue
      const e = pick(rng, h)
      push({ op: 'evict', hash: e.hash, tier: e.tier })
    } else if (kind === 4) {
      // A call that must be refused and leave no trace.
      const h = held()
      const flavour = below(rng, 4)
      if (flavour === 0) push({ op: 'evict', hash: MISSING + below(rng, 1000), tier: pick(rng, TIER_IDS) })
      else if (flavour === 1 && h.length > 0) {
        const e = pick(rng, h)
        push({ op: 'offload', hash: e.hash, from: e.tier, to: pick(rng, TIER_IDS.filter((t) => tierRank(t) <= tierRank(e.tier))) })
      } else if (flavour === 2 && h.length > 0) {
        const e = pick(rng, h.filter((x) => x.tier === 'GPU').concat(h))
        if (e.tier === 'GPU') {
          const b = chains.flat().find((x) => x.hash === e.hash)
          if (b !== undefined) push({ op: 'store', ...b })
        } else push({ op: 'load', hash: e.hash, from: 'GPU' })
      } else push({ op: 'load', hash: MISSING + below(rng, 1000), from: 'CPU' })
    } else {
      push({ op: 'reset' })
    }
  }
  return ops
}
