// The reference consumer of `kv-events@1` (ARCHITECTURE §5.8, D-034): what a router or a cache-aware scheduler does with the stream. It
// rebuilds, for each medium, the set of blocks that the publisher holds, and it notes everything about the stream that a consumer cannot
// live with. It trusts nothing: a removal of a block it never saw stored, a store of a block it holds already, a tier over its capacity
// and a batch out of order are problems it records and carries on from.

import type { KvEvent, KvEventBatch } from '../kv/types'
import { TIER_IDS } from './types'
import type { TierId, TiersSpec } from './types'

export interface TiersConsumerProblem {
  /** `ordering`, `duplicate`, `phantom`, `capacity`, `medium` or `reset`. */
  readonly check: string
  readonly message: string
}

const isTier = (m: string | null): m is TierId => (TIER_IDS as readonly (string | null)[]).includes(m)

export class TiersConsumer {
  private readonly sets: Record<TierId, Set<number>> = { GPU: new Set(), CPU: new Set(), DISK: new Set() }
  private lastTs = -1
  readonly problems: TiersConsumerProblem[] = []

  private readonly spec: TiersSpec | undefined

  constructor(spec?: TiersSpec) {
    this.spec = spec
  }

  private note(check: string, message: string): void {
    this.problems.push({ check, message })
  }

  consume(batch: KvEventBatch): void {
    const [ts, events] = batch
    if (ts <= this.lastTs) this.note('ordering', `batch ${ts} came after batch ${this.lastTs}`)
    this.lastTs = ts
    for (const event of events) this.apply(event, ts)
  }

  private apply(event: KvEvent, ts: number): void {
    if (event.type === 'AllBlocksCleared') {
      for (const id of TIER_IDS) this.sets[id].clear()
      return
    }
    if (!isTier(event.medium)) {
      this.note('medium', `batch ${ts} names the medium ${String(event.medium)}, which is no tier`)
      return
    }
    const set = this.sets[event.medium]
    for (const hash of event.block_hashes) {
      if (event.type === 'BlockStored') {
        if (set.has(hash)) this.note('duplicate', `batch ${ts} stores ${hash} in ${event.medium}, which holds it already`)
        set.add(hash)
        const cap = this.spec?.capacity[event.medium]
        if (cap !== undefined && set.size > cap) this.note('capacity', `batch ${ts} leaves ${event.medium} with ${set.size} blocks over its capacity of ${cap}`)
      } else {
        if (!set.has(hash)) this.note('phantom', `batch ${ts} removes ${hash} from ${event.medium}, which never stored it`)
        set.delete(hash)
      }
    }
  }

  /** The blocks the consumer believes each tier holds, sorted. */
  view(): Record<TierId, number[]> {
    const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b)
    return { GPU: sorted(this.sets.GPU), CPU: sorted(this.sets.CPU), DISK: sorted(this.sets.DISK) }
  }
}

/** What a consumer of `batches` believes, and the problems it met. */
export function tiersConsumerView(batches: readonly KvEventBatch[], spec?: TiersSpec): { view: Record<TierId, number[]>; problems: readonly TiersConsumerProblem[] } {
  const c = new TiersConsumer(spec)
  for (const b of batches) c.consume(b)
  return { view: c.view(), problems: c.problems }
}
