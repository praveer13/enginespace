/*
 * `tiers` (ARCHITECTURE §5.8, TRACKER W2-T28): the consumer's view equals the truth after every operation over 200 seeds, a publisher
 * that drops a BlockRemoved is caught, and so is each member of a small bestiary of publishers that break one rule of the stream.
 */
import { describe, expect, test } from 'bun:test'
import {
  TIER_IDS,
  TIERS_CHECKS,
  TiersConsumer,
  TiersReference,
  tiersConnector,
  tiersConsumerView,
  tiersJudge,
  tiersOps,
  tiersReference,
  tiersSpec,
} from '../../packages/sim/tiers'
import { seeds } from '../seeds'
import type { KvEventBatch, TierBlock, TierId, TiersOp } from '../../packages/sim/tiers'

const SEEDS = seeds(1)
const spec = tiersSpec()
const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b)

describe('the reference publisher and its consumer', () => {
  test(`the consumer view equals the truth after every operation, over ${SEEDS.length} seeds`, () => {
    let refusals = 0
    let removals = 0
    for (const seed of SEEDS) {
      const model = tiersReference(spec)
      const consumer = new TiersConsumer(spec)
      let seen = 0
      for (const op of tiersOps(seed, spec, 150)) {
        if (!model.apply(op).ok) refusals++
        for (const batch of model.events().slice(seen)) {
          consumer.consume(batch)
          removals += batch[1].filter((e) => e.type === 'BlockRemoved').length
        }
        seen = model.events().length
        const view = consumer.view()
        for (const t of model.state().tiers) expect([seed, t.id, view[t.id]]).toEqual([seed, t.id, sorted(t.blocks)])
      }
      expect([seed, consumer.problems]).toEqual([seed, []])
    }
    // The streams exercise what they are for: refusals and evictions happen.
    expect(refusals).toBeGreaterThan(200)
    expect(removals).toBeGreaterThan(1000)
  }, 60_000)

  // The judge replays 150 operations of two models a seed, about 3.6 ms a seed [measured 2026-11-20 on four pinned cores], and a runner's
  // cores are slower: at 10,000 seeds one test outran its 60 s on a runner. The seeds are cut into JUDGE_PARTS runs of consecutive seeds,
  // each a test with the 60 s the one test had, and the last test holds that the runs are exactly SEEDS, each once.
  const JUDGE_PARTS = 4
  const partSize = Math.ceil(SEEDS.length / JUDGE_PARTS)
  const parts = Array.from({ length: JUDGE_PARTS }, (_, part) => SEEDS.slice(part * partSize, (part + 1) * partSize))
  for (const mine of parts) {
    test(`the judge passes the reference on seeds ${mine[0]} to ${mine[mine.length - 1]} of ${SEEDS.length}`, () => {
      for (const seed of mine) {
        expect([seed, tiersJudge(spec, tiersOps(seed, spec, 150), tiersReference(spec))]).toEqual([seed, null])
      }
    }, 60_000)
  }

  test(`the judge's runs cover the ${SEEDS.length} seeds, each once`, () => {
    expect(parts.flat()).toEqual(SEEDS)
  })

  test('the streams are deterministic', () => {
    expect(tiersOps(7, spec, 60)).toEqual(tiersOps(7, spec, 60))
    expect(tiersOps(7, spec, 60)).not.toEqual(tiersOps(8, spec, 60))
  })

  test('events carry the medium, and a copy leaves its source in place', () => {
    const m = tiersReference(spec)
    const b: TierBlock = { hash: 11, parent: null, tokens: [1, 2, 3, 4], adapter: 3 }
    expect(m.apply({ op: 'store', ...b }).ok).toBe(true)
    expect(m.apply({ op: 'offload', hash: 11, from: 'GPU', to: 'CPU' }).ok).toBe(true)
    expect(m.apply({ op: 'offload', hash: 11, from: 'CPU', to: 'DISK' }).ok).toBe(true)
    const stored = m.events().flatMap(([, e]) => e)
    expect(stored.map((e) => (e.type === 'BlockStored' ? e.medium : e.type))).toEqual(['GPU', 'CPU', 'DISK'])
    const first = stored[0]
    expect(first.type === 'BlockStored' && first.lora_name).toBe('adapter-3')
    expect(m.state().tiers.map((t) => t.blocks)).toEqual([[11], [11], [11]])
  })

  test('a full tier evicts its least recently used block, and publishes the removal before the store', () => {
    const m = tiersReference(tiersSpec({ GPU: 2 }))
    const blk = (hash: number): TiersOp => ({ op: 'store', hash, parent: null, tokens: [0, 0, 0, hash], adapter: null })
    m.apply(blk(1))
    m.apply(blk(2))
    m.apply(blk(3))
    expect(m.state().tiers[0].blocks).toEqual([2, 3])
    const last = m.events()[2]
    expect(last[1].map((e) => e.type)).toEqual(['BlockRemoved', 'BlockStored'])
  })

  test('a refused operation changes nothing and publishes nothing', () => {
    const m = tiersReference(spec)
    const before = JSON.stringify(m.state().tiers)
    for (const op of [
      { op: 'evict', hash: 5, tier: 'CPU' },
      { op: 'load', hash: 5, from: 'CPU' },
      { op: 'load', hash: 5, from: 'GPU' },
      { op: 'offload', hash: 5, from: 'CPU', to: 'GPU' },
    ] satisfies TiersOp[]) {
      expect(m.apply(op).ok).toBe(false)
    }
    expect(JSON.stringify(m.state().tiers)).toBe(before)
    expect(m.events()).toEqual([])
  })

  test('a reset publishes AllBlocksCleared alone', () => {
    const m = tiersReference(spec)
    m.apply({ op: 'store', hash: 1, parent: null, tokens: [1, 1, 1, 1], adapter: null })
    m.apply({ op: 'reset' })
    expect(m.events()[1][1]).toEqual([{ type: 'AllBlocksCleared' }])
    expect(tiersConsumerView(m.events()).view).toEqual({ GPU: [], CPU: [], DISK: [] })
  })
})

describe('the consumer notes what it cannot live with', () => {
  const block = (hash: number, medium: TierId, type: 'BlockStored' | 'BlockRemoved'): KvEventBatch[number] =>
    type === 'BlockStored'
      ? [{ type, block_hashes: [hash], parent_block_hash: null, token_ids: [], block_size: 4, lora_id: null, medium, lora_name: null }]
      : [{ type, block_hashes: [hash], medium }]
  test('a phantom removal, a double store, a batch out of order and a tier over capacity', () => {
    const c = new TiersConsumer(tiersSpec({ GPU: 1 }))
    c.consume([0, block(1, 'GPU', 'BlockRemoved') as never])
    c.consume([1, block(2, 'GPU', 'BlockStored') as never])
    c.consume([2, block(2, 'GPU', 'BlockStored') as never])
    c.consume([2, block(3, 'GPU', 'BlockStored') as never])
    expect(c.problems.map((p) => p.check)).toEqual(['phantom', 'duplicate', 'ordering', 'capacity'])
  })
})

// A bestiary: the reference with one rule of the stream broken, each of which the judge must catch by a named check.
class DropsRemoved extends TiersReference {
  protected override publishRemoved(): void {}
}
class DropsCleared extends TiersReference {
  protected override publishCleared(): void {}
}
class WrongMedium extends TiersReference {
  protected override publishStored(block: TierBlock, medium: TierId): void {
    super.publishStored(block, medium === 'CPU' ? 'GPU' : medium)
  }
}
class StoresTwice extends TiersReference {
  protected override publishStored(block: TierBlock, medium: TierId): void {
    super.publishStored(block, medium)
    if (medium === 'GPU') super.publishStored(block, medium)
  }
}
class StoreBeforeRemove extends TiersReference {
  protected override flush(ts: number): void {
    this.reorder()
    super.flush(ts)
  }
  private reorder(): void {
    const p = (this as unknown as { pending: { type: string }[] }).pending
    p.sort((a, b) => (a.type === 'BlockStored' ? 0 : 1) - (b.type === 'BlockStored' ? 0 : 1))
  }
}
class StaleClock extends TiersReference {
  protected override flush(ts: number): void {
    super.flush(Math.max(0, ts - 1))
  }
}
class RemovesWrongTier extends TiersReference {
  protected override publishRemoved(hash: number, medium: TierId): void {
    super.publishRemoved(hash, medium === 'DISK' ? 'CPU' : medium)
  }
}
class LeaksOnRefusal extends TiersReference {
  protected override run(op: TiersOp): ReturnType<TiersReference['run']> {
    const r = super.run(op)
    if (!r.ok && op.op === 'evict') this.held[op.tier].pop()
    return r
  }
}

const BESTIARY: readonly { name: string; make: () => TiersReference; checks: string[] }[] = [
  { name: 'drops a BlockRemoved', make: () => new DropsRemoved(spec), checks: ['view'] },
  { name: 'forgets AllBlocksCleared', make: () => new DropsCleared(spec), checks: ['reset', 'view'] },
  { name: 'names the GPU for a CPU copy', make: () => new WrongMedium(spec), checks: ['view'] },
  { name: 'publishes a store twice', make: () => new StoresTwice(spec), checks: ['events'] },
  { name: 'stores before it removes', make: () => new StoreBeforeRemove(spec), checks: ['capacity', 'events'] },
  { name: 'stamps the previous operation', make: () => new StaleClock(spec), checks: ['ordering'] },
  { name: 'removes from the wrong tier', make: () => new RemovesWrongTier(spec), checks: ['view'] },
  { name: 'drops a block when it refuses', make: () => new LeaksOnRefusal(spec), checks: ['truth'] },
]

describe('the bestiary', () => {
  for (const member of BESTIARY) {
    test(`${member.name} is caught by ${member.checks.join(' or ')}`, () => {
      let caught = 0
      const named = new Set<string>()
      for (let seed = 0; seed < 50; seed++) {
        const j = tiersJudge(spec, tiersOps(seed, spec, 400), member.make())
        if (j === null) continue
        caught++
        for (const f of j.failures) named.add(f.check)
      }
      expect(caught).toBe(50)
      for (const c of named) expect(TIERS_CHECKS as readonly string[]).toContain(c)
      expect(member.checks.some((c) => named.has(c))).toBe(true)
    })
  }
})

describe('the connector', () => {
  const chainOf = (n: number): TierBlock[] => Array.from({ length: n }, (_, i) => ({ hash: 100 + i, parent: i === 0 ? null : 99 + i, tokens: [i, i, i, i], adapter: null }))

  test('a finished request is saved to the CPU, and a later request finds it and loads it back', () => {
    const m = tiersReference(tiersSpec({ GPU: 4, CPU: 6 }))
    const conn = tiersConnector(m)
    const chain = chainOf(3)
    for (const b of chain) m.apply({ op: 'store', ...b })
    expect(conn.saveFinished(chain.map((b) => b.hash))).toBe(3)
    for (const b of chain) m.apply({ op: 'evict', hash: b.hash, tier: 'GPU' })
    const hashes = chain.map((b) => b.hash)
    expect(conn.matched(hashes)).toBe(3)
    conn.afterAlloc(hashes, 3)
    const meta = conn.buildMeta()
    expect(meta.map((o) => o.op)).toEqual(['load', 'load', 'load'])
    expect(conn.startLoad(meta)).toBe(3)
    expect(m.state().tiers[0].blocks).toEqual(hashes)
    expect(conn.buildMeta()).toEqual([])
  })

  test('matched stops at the first block no tier holds, and takeEvents drains', () => {
    const m = tiersReference(spec)
    const conn = tiersConnector(m)
    const chain = chainOf(3)
    m.apply({ op: 'store', ...chain[0] })
    m.apply({ op: 'store', ...chain[2] })
    expect(conn.matched(chain.map((b) => b.hash))).toBe(1)
    expect(conn.takeEvents().length).toBe(2)
    expect(conn.takeEvents()).toEqual([])
    expect(conn.supportsHma).toBe(true)
  })

  test('the tier names are the media of the events', () => {
    expect(TIER_IDS).toEqual(['GPU', 'CPU', 'DISK'])
  })
})
