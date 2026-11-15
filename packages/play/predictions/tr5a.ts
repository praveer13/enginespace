/**
 * TR5a's predictions, read from The Reach-In's runs (W1b-T02; plan.ts says which run answers which).
 *
 * The world of a run is the model the level plays: the hybrid KV model's spec for its preset (the groups, their block sizes and windows,
 * the bytes of a page) and the recipe kits on offer. A question that the lesson asks about that model is answered by `packages/sim/kv`
 * on the run's own spec, and the size of the request or the rank of the kit that the question names is the prompt's. The levels build the
 * same model whatever the seed (the seed draws the night, and for `manager` the model, which no prediction here is read from).
 */
import { kvAdapterCatalog, kvFindHit, kvPagesHeld } from '@es/sim/kv'
import { buildLevel } from '../pool/levels'
import type { PoolLevel } from '../pool/types'
import type { RunRecord } from '../types'
import { requireRun } from './types'
import type { Reference } from './types'

const GAME = 'pool'

/** The level that a run played, as the game builds it on the run's seed. */
function levelOf(run: RunRecord, level: string): PoolLevel {
  requireRun(run, GAME, level)
  return buildLevel(run.level, run.seed)
}

/** The block numbers `from` to `to`, both counted. */
const blocks = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

export const REFERENCES: Readonly<Record<string, Reference>> = {
  'tr5a.l1.p1': {
    says: ['4,096 tokens', 'one full-attention group and two sliding-window groups', '16 tokens in a block', '32-token window'],
    reads: "Counted from the two-kinds model's groups: the pages a request of this length holds in each, added up.",
    truth: (run) => kvPagesHeld(levelOf(run, 'two-kinds').spec, 4096),
  },
  'tr5a.l2.p2': {
    says: ['8 attention layers', '1,024 bytes', '24 recurrent layers', '32,768 bytes', '16 tokens'],
    reads: "Read from the state model's page: the tokens in the block of its attention group, once the block has been made as large as a layer's state.",
    truth: (run) => {
      const group = levelOf(run, 'state').spec.groups.find((candidate) => candidate.kind === 'full')
      if (group === undefined) throw new RangeError('the state model has no full-attention group')
      return group.blockTokens
    },
  },
  'tr5a.l3.p1': {
    says: ['176 tokens', 'numbered 0 to 9', 'blocks 6 to 8', 'blocks 7 to 9'],
    reads: "Found by the hybrid KV model's lookup on the two-kinds groups: the longest prefix that every group holds, which a hit never lets run to the last token.",
    truth: (run) => {
      const spec = levelOf(run, 'evict').spec
      // The groups in the spec's order: the full group, then the two sliding groups, each with the blocks the prompt says it holds.
      const held = [new Set(blocks(0, 9)), new Set(blocks(6, 8)), new Set(blocks(7, 9))]
      // A block's hash is its number, and the prompt's 176 tokens are 11 blocks: no hash needs to be a real one for the lookup to run.
      const chain = blocks(0, 10).map((block) => 1000 + block)
      return kvFindHit(spec, (group, hash) => held[group].has(hash - 1000), spec.groups.map(() => chain), 176 - 1).hit
    },
  },
  'tr5a.l4.p1': {
    says: ['163,840 bytes', '65,536 bytes', 'rank 16'],
    reads: "Counted from the adapters level's pages: the bytes of an adapter of this rank, over the bytes of a page, rounded up.",
    truth: (run) => kvAdapterCatalog(levelOf(run, 'adapters').spec, [16])[0].pages,
  },
  'tr5a.l4.p2': {
    says: ['sized for rank 64', 'rank 8'],
    reads: "Read from the recipe kits on offer: a slot is as wide as the largest kit, and the share of it that the smallest kit leaves empty.",
    truth: (run) => {
      const bytes = levelOf(run, 'adapters').kits.map((kit) => kit.bytes)
      const slot = Math.max(...bytes)
      return (100 * (slot - Math.min(...bytes))) / slot
    },
  },
}
