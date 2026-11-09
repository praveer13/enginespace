/**
 * The Reach-In's manager (`pool`, GAMES.md §8): the sim's reference manager, `packages/sim/kv`, with the few things a game needs that a
 * lab's host does not.
 *
 * The game plays the policy and the sim plays the rules. Every page, every hit and every refusal comes from `KvReference`, which is the
 * oracle the `hybrid-kv` lab is graded against (W1-T21), so the game cannot teach a rule the lab does not test. This subclass adds
 * four things, and changes no rule of the manager:
 *   - `plan`: what admitting a prompt would do, without doing it: the hit, the pages the request would need that nothing supplies, the
 *     pages the hit starts from, and whether it fits (all or nothing). `KvReference` computes this inside `admit`; the game shows it
 *     before the learner chooses;
 *   - `dump`: the learner's eviction. The sim's pool evicts from the front of its queue only, as vLLM does (vllm.kv-pool.allocate-from-front).
 *     The game lets the learner say which cached pages to give up when a ticket needs room, so a dump takes one cached page out of the cache,
 *     publishes its `BlockRemoved` and puts the now free page at the front of the queue, where the allocation that needed room takes it.
 *     The queue stays a permutation of the free and cached pages, so every invariant of the sim still holds;
 *   - `hitWithout`: the hit a prompt would get if one page were gone, which is how the game prices a dump;
 *   - `clone`: a copy of the whole manager, so that the game's pure `reduce` can leave the manager of the state it was given untouched.
 *
 * A manager is mutable. The session keeps one for each state it hands out (session.ts), and rebuilds one by replaying the log when it is
 * handed a state it did not make, so the manager never carries anything that the state does not.
 */
import { divFloor } from '@es/sim/core'
import { KvReference, kvExtraKey, kvFindHit, kvRemoved } from '@es/sim/kv'
import type { KvEvent, KvGroupSpec } from '@es/sim/kv'

/** "No page" in the manager's arrays, as the sim writes it. */
const NONE = -1

/** What admitting a prompt would do. Nothing in the manager has changed when this is returned. */
export interface AdmitPlan {
  /** Tokens the cache would serve: a multiple of the alignment, and never the last token of the prompt. */
  readonly hit: number
  /** Pages the request needs that nothing supplies: the new blocks. */
  readonly fresh: number
  /** Cached pages the hit takes out of the queue, which an eviction must therefore leave alone. */
  readonly fromQueue: number
  /** Whether the pool can supply it once the pages of the hit have left the queue (the sim's all-or-nothing rule). */
  readonly fits: boolean
  /** The pages the hit starts from, in all groups, ascending. */
  readonly pages: readonly number[]
}

/** The hash chains of a prompt's blocks, by block size: what the sim hashes a prompt into, which the game works out once for each ticket. */
export type Chains = ReadonlyMap<number, readonly number[]>

export class PoolManager extends KvReference {
  /** Cached pages that left the cache since the night began, whether the learner dumped them or an allocation took them. */
  removed = 0
  /**
   * A manager that publishes no events: the game reads the cache, the queue and the tables and never a stream, so a run played in bulk
   * (the bands, the house, the debrief's what-ifs) skips building and counting them. The states the learner plays keep them, and the
   * tests check the sim's `events` invariant on those.
   */
  quiet = false
  /** The chains of the prompt about to be planned or admitted, when the caller has them already, so that the sim does not hash it again. */
  chains: Chains | null = null

  protected override publish(event: KvEvent): void {
    if (event.type === 'BlockRemoved') this.removed += event.block_hashes.length
    if (!this.quiet) super.publish(event)
  }

  protected override publishStored(group: KvGroupSpec, g: number, hashes: readonly number[], parent: number | null, tokens: readonly number[], adapter: number | null): void {
    if (!this.quiet) super.publishStored(group, g, hashes, parent, tokens, adapter)
  }

  /** The sim hashes a prompt into chains. With the chains of the whole sequence in hand, a prompt that is a prefix of it takes the first of each. */
  protected override chainsOf(tokens: readonly number[], extra: number): Map<number, number[]> {
    const known = this.chains
    if (known === null) return super.chainsOf(tokens, extra)
    const chains = new Map<number, number[]>()
    for (const size of this.sizes) chains.set(size, (known.get(size) as readonly number[]).slice(0, divFloor(tokens.length, size)))
    return chains
  }

  /** The sim's clock: it moves on with every operation, so a plan worked out at one tick holds until the next. */
  clock(): number {
    return this.steps
  }

  /** The pages the pool can supply now: the free and the cached, which is the length of the sim's queue. */
  supply(): number {
    return this.queueLength
  }

  /** Every page in the queue, in the order an allocation takes them: the free pages, then the cached ones, oldest first. */
  rotation(): number[] {
    const n = this.spec.poolPages
    const order: number[] = []
    for (let p = this.nextPage[n]; p !== n; p = this.nextPage[p]) order.push(p)
    return order
  }

  /** The cached pages in the queue, in eviction order: what the learner may dump. */
  cachedRotation(): number[] {
    return this.rotation().filter((p) => this.hashes[p] !== NONE)
  }

  /** The free pages in the queue: pages that hold nothing, which an allocation takes before any cached page. */
  freeCount(): number {
    const n = this.spec.poolPages
    let count = 0
    for (let p = this.nextPage[n]; p !== n; p = this.nextPage[p]) if (this.hashes[p] === NONE) count++
    return count
  }

  /** What admitting `prompt` under `adapter` would do (see AdmitPlan). Changes nothing. */
  plan(prompt: readonly number[], adapter: number | null, chains: Chains | null = null): AdmitPlan {
    this.chains = chains
    const plan = this.planAdmit(prompt, adapter)
    this.chains = null
    const pages: number[] = []
    for (const group of plan.groups) for (const page of group.hitPages) if (page !== NONE) pages.push(page)
    pages.sort((a, b) => a - b)
    return { hit: plan.hit, fresh: plan.fresh, fromQueue: plan.fromQueue, fits: this.admitFits(plan), pages }
  }

  /** The hit of `prompt` and what each group would serve alone, by group index (the sim's fixed point, full attention first). */
  hitDetail(prompt: readonly number[], adapter: number | null, chains: Chains | null = null): { readonly hit: number; readonly perGroup: readonly number[] } {
    return this.findHitIgnoring(prompt, adapter, NONE, chains)
  }

  /** The hit `prompt` would get if page `page` were not in the cache. */
  hitWithout(prompt: readonly number[], adapter: number | null, page: number, chains: Chains | null = null): number {
    return this.findHitIgnoring(prompt, adapter, page, chains).hit
  }

  private findHitIgnoring(prompt: readonly number[], adapter: number | null, page: number, known: Chains | null): { readonly hit: number; readonly perGroup: readonly number[] } {
    if (!this.spec.prefixCaching) return { hit: 0, perGroup: this.spec.groups.map(() => 0) }
    this.chains = known
    const chains = this.chainsOf(prompt, kvExtraKey(adapter))
    this.chains = null
    const found = kvFindHit(
      this.spec,
      (group, hash) => {
        const held = this.cache[group].get(hash)
        return held !== undefined && held !== page
      },
      this.spec.groups.map((g) => chains.get(g.blockTokens) as number[]),
      prompt.length - 1,
    )
    return { hit: found.hit, perGroup: found.perGroup }
  }

  /** The cached page in the queue holding hash `hash` in group `group`, or -1. */
  pageOf(group: number, hash: number): number {
    return this.cache[group].get(hash) ?? NONE
  }

  /** Whether `page` is a cached page in the queue, which `dump` accepts. */
  isCached(page: number): boolean {
    return page >= 0 && page < this.spec.poolPages && this.queued[page] === 1 && this.hashes[page] !== NONE
  }

  /**
   * The learner's eviction of one cached page: it leaves the cache, its removal is published, and the page, now free, goes to the front
   * of the queue. Like every operation it counts a step of the sim's clock. Throws for a page that is not cached and unheld.
   */
  dump(page: number): void {
    if (!this.isCached(page)) throw new RangeError(`page ${page} is not a cached page that nobody holds, so it cannot be dumped`)
    const ts = this.steps++
    this.pending = []
    this.unlink(page)
    const group = this.owner[page]
    const hash = this.hashes[page]
    this.cache[group].delete(hash)
    this.hashes[page] = NONE
    this.owner[page] = NONE
    this.publish(kvRemoved(group, hash))
    this.linkAfter(this.spec.poolPages, page)
    this.log.push([ts, this.pending])
    this.pending = []
  }

  /**
   * A copy that shares nothing with this manager. It starts a log of its own: the events published before it are not carried over,
   * since the game reads the cache, the consumer's counts and the queue, and no stream.
   */
  clone(): PoolManager {
    const copy = new PoolManager(this.spec)
    copy.refs.set(this.refs)
    copy.owner.set(this.owner)
    copy.hashes.set(this.hashes)
    copy.lender.set(this.lender)
    copy.nextPage.set(this.nextPage)
    copy.prevPage.set(this.prevPage)
    copy.queued.set(this.queued)
    copy.queueLength = this.queueLength
    this.cache.forEach((map, group) => {
      const into = copy.cache[group]
      into.clear()
      map.forEach((page, hash) => into.set(hash, page))
    })
    copy.reqs.clear()
    this.reqs.forEach((r, id) => {
      const chains = new Map<number, number[]>()
      r.chains.forEach((chain, size) => chains.set(size, chain.slice()))
      copy.reqs.set(id, { id: r.id, adapter: r.adapter, tokens: r.tokens.slice(), tables: r.tables.map((table) => table.slice()), chains, done: r.done.slice() })
    })
    copy.adapters.clear()
    this.adapters.forEach((a, id) => copy.adapters.set(id, { pages: a.pages.slice(), users: a.users }))
    copy.consumer.clear()
    this.consumer.forEach((counts, group) => copy.consumer.set(group, new Map(counts)))
    copy.steps = this.steps
    copy.removed = this.removed
    copy.quiet = this.quiet
    return copy
  }
}
