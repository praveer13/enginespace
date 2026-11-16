// The connector contract (ARCHITECTURE §5.8, D-034): the minimal set of calls that an engine makes of a KV connector, at the grain of
// this model, and a reference connector that offloads to the CPU and brings blocks back. The Wire's WR3 owns the real contract (catalog §4);
// until it ships, this is TR5b's, and it is reconciled then.
//
// Its shape follows vLLM's connector split (research/upstream-vllm.md, K6): a scheduler side that decides, and a worker side that moves
// data. The pairs, in this model's words:
//   matched       how many leading blocks of a prompt's chain some tier holds beyond the GPU (get_num_new_matched_tokens)
//   afterAlloc    the engine has placed the blocks on the GPU; the connector records what it must load (update_state_after_alloc)
//   buildMeta     the work of this step, handed to the worker side (build_connector_meta)
//   startLoad     the worker copies the recorded blocks up (start_load_kv)
//   saveFinished  a finished request's blocks are copied down; the engine may free them once it returns (request_finished, wait_for_save)
//   takeEvents    the batches published since the last call (take_events)
// A connector for a hybrid manager must also say that it supports it (`supportsHma`, the SupportsHMA mixin of vllm.hybrid-kv.supports-hma):
// one that does not turns the hybrid manager off.

import type { KvEventBatch } from '../kv/types'
import type { TiersModel, TiersOp } from './types'
import { TIER_IDS } from './types'

export interface TierConnector {
  readonly supportsHma: boolean
  matched(chain: readonly number[]): number
  afterAlloc(chain: readonly number[], matched: number): void
  buildMeta(): readonly TiersOp[]
  startLoad(meta: readonly TiersOp[]): number
  saveFinished(chain: readonly number[]): number
  takeEvents(): readonly KvEventBatch[]
}

/** The connector over a model: loads from the nearest tier that holds a block, and saves to the CPU. */
export function tiersConnector(model: TiersModel): TierConnector {
  let taken = 0
  let recorded: TiersOp[] = []
  const where = (hash: number): string | null => {
    for (const t of model.state().tiers) if (t.blocks.includes(hash)) return t.id
    return null
  }
  return {
    supportsHma: true,
    matched(chain) {
      let n = 0
      while (n < chain.length && where(chain[n]) !== null) n++
      return n
    },
    afterAlloc(chain, matched) {
      recorded = []
      for (const hash of chain.slice(0, matched)) {
        const tier = TIER_IDS.find((id) => id !== 'GPU' && model.state().tiers.find((t) => t.id === id)?.blocks.includes(hash))
        if (tier !== undefined) recorded.push({ op: 'load', hash, from: tier })
      }
    },
    buildMeta() {
      const meta = recorded
      recorded = []
      return meta
    },
    startLoad(meta) {
      let ok = 0
      for (const op of meta) if (model.apply(op).ok) ok++
      return ok
    },
    saveFinished(chain) {
      let ok = 0
      for (const hash of chain) if (model.apply({ op: 'offload', hash, from: 'GPU', to: 'CPU' }).ok) ok++
      return ok
    },
    takeEvents() {
      const all = model.events()
      const out = all.slice(taken)
      taken = all.length
      return out
    },
  }
}
