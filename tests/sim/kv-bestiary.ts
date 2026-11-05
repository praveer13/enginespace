/*
 * The bestiary of the hybrid KV manager (ARCHITECTURE §5.10, TR5a §5): managers that are right except in one rule, each of which the
 * judge must catch with a named check, while the reference passes the same streams. Each is the reference with one protected method
 * overridden (packages/sim/kv/reference.ts), so that the fault is the only difference between it and a right manager.
 *
 *   leaky-free         a free that leaks: the last page of every call is never let go
 *   non-atomic-admit   an admit that takes the pages of the groups it can cover before it finds the pool short, and refuses with them gone
 *   window-off-by-one  a sliding window that keeps one token more than the next token reads
 *   window-short       the other way: a window that lets go of a block the next token still reads
 *   double-counted     an adapter that is charged twice, for twice its pages
 *   union-hit          a prefix hit that takes the longest hit of any one group, the union, in place of what every group holds
 *   published-twice    a stored block that is published twice
 *   free-forward       a request whose blocks are let go head first, so that the head of a prefix is evicted before its tail
 *   unhashed-back      a page without a hash that goes to the back of the queue, behind the cached pages it should be reused before
 *   reset-while-running  a reset that is accepted with a request running
 */
import { KvReference } from '../../packages/sim/kv'
import type { KvAdmitPlan, KvHit, KvModel, KvResult, KvSpec, KvTableRule } from '../../packages/sim/kv'
import type { KvGroupSpec } from '../../packages/sim/kv'

export interface Member {
  readonly id: string
  readonly title: string
  /** The check that must catch it: an id of KV_CHECKS or KV_JUDGE_CHECKS. */
  readonly caughtBy: string
  /** Whether a stream of this spec can show the fault. */
  readonly shows: (spec: KvSpec) => boolean
  readonly make: (spec: KvSpec) => KvModel
}

class LeakyFree extends KvReference {
  protected override freePages(pages: readonly number[]): void {
    super.freePages(pages.slice(0, -1))
  }
}

class NonAtomicAdmit extends KvReference {
  protected override admit(req: number, prompt: readonly number[], adapter: number | null): KvResult {
    if (this.reqs.has(req)) return this.refuse('exists')
    if (adapter !== null && !this.adapters.has(adapter)) return this.refuse('no-adapter')
    const plan: KvAdmitPlan = this.planAdmit(prompt, adapter)
    if (this.admitFits(plan)) {
      this.commitAdmit(req, prompt, plan)
      return { ok: true, free: this.queueLength, hit: plan.hit }
    }
    // The groups are served in turn, and the ones before the group that does not fit have their pages already.
    let have = this.queueLength - plan.fromQueue
    plan.groups.forEach((gp, g) => {
      if (gp.fresh > have) {
        have = -1
        return
      }
      if (have < 0) return
      have -= gp.fresh
      for (const p of this.takePages(gp.fresh)) {
        this.owner[p] = g
        this.refs[p] = 1
      }
    })
    return this.refuse('no-pages')
  }
}

class WindowOffByOne extends KvReference {
  protected override rule(group: KvGroupSpec, tokens: number): KvTableRule {
    return super.rule(group.kind === 'sliding' ? { ...group, window: (group.window as number) + 1 } : group, tokens)
  }
}

class WindowShort extends KvReference {
  protected override rule(group: KvGroupSpec, tokens: number): KvTableRule {
    return super.rule(group.kind === 'sliding' ? { ...group, window: (group.window as number) - 1 } : group, tokens)
  }
}

class DoubleCounted extends KvReference {
  protected override loadAdapter(id: number, pages: number): KvResult {
    return super.loadAdapter(id, pages * 2)
  }
}

class UnionHit extends KvReference {
  protected override findHit(chains: readonly (readonly number[])[], maxHit: number): KvHit {
    const found = super.findHit(chains, maxHit)
    return { hit: Math.max(...found.perGroup), perGroup: found.perGroup }
  }
}

class PublishedTwice extends KvReference {
  protected override publishStored(group: KvGroupSpec, g: number, hashes: readonly number[], parent: number | null, tokens: readonly number[], adapter: number | null): void {
    super.publishStored(group, g, hashes, parent, tokens, adapter)
    super.publishStored(group, g, hashes, parent, tokens, adapter)
  }
}

class FreeForward extends KvReference {
  protected override freePages(pages: readonly number[]): void {
    super.freePages(pages.slice().reverse())
  }
}

class UnhashedBack extends KvReference {
  protected override freePages(pages: readonly number[]): void {
    // A page that nobody holds and that has no hash is parked with the cached ones: it takes the hash it is about to lose out of its own
    // eviction order, as if it had one.
    const n = this.spec.poolPages
    const plain: number[] = []
    const rest: number[] = []
    for (const p of pages) (this.refs[p] === 1 && this.hashes[p] === -1 ? plain : rest).push(p)
    super.freePages(rest)
    for (const p of plain) {
      this.refs[p] = 0
      this.owner[p] = -1
      this.linkAfter(this.prevPage[n], p)
    }
  }
}

class ResetAnyway extends KvReference {
  protected override reset(): KvResult {
    // Forgets the cache without asking whether anything is running, and without telling anyone.
    for (const map of this.cache) map.clear()
    this.hashes.fill(-1)
    return { ok: true, free: this.queueLength }
  }
}

const multiGroup = (spec: KvSpec): boolean => spec.groups.length > 1
const sliding = (spec: KvSpec): boolean => spec.groups.some((g) => g.kind === 'sliding')
const caching = (spec: KvSpec): boolean => spec.prefixCaching

export const BESTIARY: readonly Member[] = [
  { id: 'leaky-free', title: 'a free that leaks', caughtBy: 'conservation', shows: () => true, make: (s) => new LeakyFree(s) },
  { id: 'non-atomic-admit', title: 'an admit that takes pages before it fails', caughtBy: 'atomic', shows: multiGroup, make: (s) => new NonAtomicAdmit(s) },
  { id: 'window-off-by-one', title: 'a window that keeps one token too many', caughtBy: 'window', shows: sliding, make: (s) => new WindowOffByOne(s) },
  { id: 'window-short', title: 'a window that lets go of a block it still reads', caughtBy: 'window', shows: sliding, make: (s) => new WindowShort(s) },
  { id: 'double-counted', title: 'an adapter charged twice', caughtBy: 'adapters', shows: (s) => s.adapterSlots === undefined, make: (s) => new DoubleCounted(s) },
  { id: 'union-hit', title: 'a prefix hit that is the union of the groups', caughtBy: 'hit', shows: (s) => multiGroup(s) && caching(s), make: (s) => new UnionHit(s) },
  { id: 'published-twice', title: 'an event published twice', caughtBy: 'events', shows: caching, make: (s) => new PublishedTwice(s) },
  { id: 'free-forward', title: 'blocks let go head first', caughtBy: 'events', shows: caching, make: (s) => new FreeForward(s) },
  { id: 'unhashed-back', title: 'a page without a hash sent to the back', caughtBy: 'events', shows: caching, make: (s) => new UnhashedBack(s) },
  { id: 'reset-while-running', title: 'a reset accepted with a request running', caughtBy: 'reply', shows: caching, make: (s) => new ResetAnyway(s) },
]
