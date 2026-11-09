// The reference manager (ARCHITECTURE §5.4): a hybrid KV cache manager over one pool of pages. It is the oracle that the lab's host
// checks a learner's module against, the engine that The Pool's game plays, and the specification that content/cards/kv.md describes.
//
// The pool is `poolPages` physical pages. A page is free, cached (a block with a hash that nobody holds), used (held by the tables of at
// least one request) or an adapter's. One queue holds every page that an allocation may take, the free ones and the cached ones, in
// eviction order (vllm.hybrid-kv.one-lru):
//   - an allocation takes pages from the front, and a cached page that it takes loses its hash, which is an eviction
//     (vllm.kv-pool.allocate-from-front);
//   - a page that nobody holds any more goes back in. A page with a hash goes to the back, so that cached pages are evicted oldest first;
//     a page without one goes to the front, so that it is reused before any cached page is touched (vllm.kv-pool.free-order). A request's
//     pages are given back last block first, so that the tail of a prefix is evicted before its head (vllm.kv-pool.free-reverse);
//   - a prefix hit takes the pages it uses out of the queue, and the ones it does not keep go back to the back (vllm.kv-pool.touch).
//
// Every operation is all or nothing (A§5.4, the rule of lab 02). Each one first works out what it needs without touching anything, and
// refuses when the pool cannot supply it; only then does it change the state, and from there nothing can fail. vLLM frees the blocks that
// a sliding window has left behind even when the allocation after it fails (vllm.kv-pool.skipped-freed-first), and the model does not.
//
// The class is exported so that the bestiary can subclass it: each `protected` method is one rule, and a known-wrong manager overrides
// the one that it gets wrong (tests/sim/kv-bestiary.test.ts).

import { divFloor } from '../core/int'
import { compareAsc } from '../core/stats'
import { kvCleared, kvConsume, kvConsumerEntries, kvRemoved, kvStored } from './events'
import type { KvConsumerCounts } from './events'
import { kvBlockHash, kvChain, kvExtraKey } from './hash'
import { kvFindHit } from './lookup'
import type { KvHit } from './lookup'
import { assertKvSpec, kvHitFrom, kvTableRule } from './spec'
import type { KvTableRule } from './spec'
import type { KvAdapter, KvCacheEntry, KvEvent, KvEventBatch, KvGroupSpec, KvModel, KvOp, KvPage, KvRefusal, KvRequest, KvResult, KvSpec, KvState } from './types'

/** "No page", "no hash", "no group": the value of an array slot that holds nothing. */
const NONE = -1

/** Every free page looks alike, so a snapshot shares one object for them. */
const FREE: KvPage = Object.freeze({ st: 'free' })

const TWO_32 = 4294967296

/** A running request. */
interface Req {
  readonly id: number
  readonly adapter: number | null
  /** Its prompt and everything appended, in order. */
  readonly tokens: number[]
  /** Per group, per block: the page, or NONE where the group has let go of the block (or never took it). */
  readonly tables: number[][]
  /** Per distinct block size: the hash chain of the full blocks so far. Groups of one size share it. */
  readonly chains: Map<number, number[]>
  /** Per group: how many leading blocks have been decided for the cache: hit, cached, let go, or left out as a duplicate. */
  readonly done: number[]
}

/** A resident adapter. */
interface Adapter {
  readonly pages: number[]
  users: number
}

/** What an admit would do, worked out before anything changes. */
export interface KvAdmitPlan {
  readonly adapter: number | null
  readonly extra: number
  /** The prefix hit in tokens. */
  readonly hit: number
  readonly chains: Map<number, number[]>
  readonly groups: readonly KvAdmitGroupPlan[]
  /** Pages the request needs that nothing supplies: new blocks. */
  readonly fresh: number
  /** Pages the hit takes out of the queue (cached pages that nobody holds). */
  readonly fromQueue: number
}

export interface KvAdmitGroupPlan {
  readonly rule: KvTableRule
  /** The pages of the hit in this group, by block, from `hitFrom`. A slot is NONE when the cache has no page for it. */
  readonly hitFrom: number
  readonly hitPages: readonly number[]
  /** The hit pages the request keeps: the ones at or after `rule.skip`. */
  readonly kept: number
  /** New pages this group needs. */
  readonly fresh: number
}

export class KvReference implements KvModel {
  protected readonly spec: KvSpec
  /** The distinct block sizes of the groups, in the order they first appear. */
  protected readonly sizes: readonly number[]

  /** Per page: the requests whose tables hold it. */
  protected readonly refs: Int32Array
  /** Per page: the group it was allocated to, or NONE. */
  protected readonly owner: Int32Array
  /** Per page: the hash it is cached under, or NONE. */
  protected readonly hashes: Float64Array
  /** Per page: the adapter that holds it, or NONE. */
  protected readonly lender: Int32Array

  // The queue is a circular doubly-linked list through a sentinel, so that removing a page is O(1).
  protected readonly nextPage: Int32Array
  protected readonly prevPage: Int32Array
  protected readonly queued: Uint8Array
  protected queueLength: number

  /** Per group: hash → page. */
  protected readonly cache: Map<number, number>[]
  protected readonly reqs = new Map<number, Req>()
  protected readonly adapters = new Map<number, Adapter>()

  protected readonly log: KvEventBatch[] = []
  protected pending: KvEvent[] = []
  protected readonly consumer: KvConsumerCounts = new Map()
  protected steps = 0

  constructor(spec: KvSpec) {
    assertKvSpec(spec)
    this.spec = spec
    const sizes: number[] = []
    for (const g of spec.groups) if (!sizes.includes(g.blockTokens)) sizes.push(g.blockTokens)
    this.sizes = sizes
    const n = spec.poolPages
    this.refs = new Int32Array(n)
    this.owner = new Int32Array(n).fill(NONE)
    this.hashes = new Float64Array(n).fill(NONE)
    this.lender = new Int32Array(n).fill(NONE)
    this.nextPage = new Int32Array(n + 1)
    this.prevPage = new Int32Array(n + 1)
    this.queued = new Uint8Array(n)
    for (let p = 0; p <= n; p++) {
      this.nextPage[p] = p === n ? 0 : p + 1
      this.prevPage[p] = p === 0 ? n : p - 1
    }
    this.queued.fill(1)
    this.queueLength = n
    this.cache = spec.groups.map(() => new Map<number, number>())
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // The interface

  apply(op: KvOp): KvResult {
    const ts = this.steps++
    this.pending = []
    const result = this.dispatch(op)
    if (this.pending.length > 0) this.log.push([ts, this.pending])
    this.pending = []
    return result
  }

  events(): readonly KvEventBatch[] {
    return this.log.slice()
  }

  state(): KvState {
    const n = this.spec.poolPages
    const pages: KvPage[] = new Array<KvPage>(n)
    for (let p = 0; p < n; p++) {
      const hash = this.hashes[p]
      if (this.lender[p] !== NONE) pages[p] = { st: 'adapter', adapter: this.lender[p] }
      else if (this.refs[p] > 0) pages[p] = { st: 'used', group: this.owner[p], refs: this.refs[p], hash: hash === NONE ? null : hash }
      else if (hash !== NONE) pages[p] = { st: 'cached', group: this.owner[p], hash }
      else pages[p] = FREE
    }
    const queue: number[] = []
    for (let p = this.nextPage[n]; p !== n; p = this.nextPage[p]) queue.push(p)
    const requests: KvRequest[] = this.sortedIds(this.reqs).map((id) => {
      const r = this.reqs.get(id) as Req
      return { id, adapter: r.adapter, length: r.tokens.length, tables: r.tables.map((t) => t.map((p) => (p === NONE ? null : p))) }
    })
    const adapters: KvAdapter[] = this.sortedIds(this.adapters).map((id) => {
      const a = this.adapters.get(id) as Adapter
      return { id, pages: a.pages.slice(), users: a.users }
    })
    const cache: KvCacheEntry[] = []
    this.cache.forEach((map, group) => {
      const mine: KvCacheEntry[] = []
      map.forEach((page, hash) => mine.push({ group, hash, page }))
      for (const entry of mine.sort((a, b) => a.hash - b.hash)) cache.push(entry)
    })
    return { pages, queue, requests, adapters, cache, consumer: kvConsumerEntries(this.consumer), step: this.steps }
  }

  private sortedIds(map: ReadonlyMap<number, unknown>): number[] {
    const ids: number[] = []
    map.forEach((_, id) => ids.push(id))
    return ids.sort(compareAsc)
  }

  protected dispatch(op: KvOp): KvResult {
    switch (op.op) {
      case 'admit':
        return this.admit(op.req, op.prompt, op.adapter ?? null)
      case 'append':
        return this.append(op.req, op.tokens)
      case 'finish':
        return this.finish(op.req)
      case 'load-adapter':
        return this.loadAdapter(op.adapter, op.pages)
      case 'unload-adapter':
        return this.unloadAdapter(op.adapter)
      case 'reset':
        return this.reset()
      default:
        throw new RangeError(`not an operation: ${JSON.stringify(op)}`)
    }
  }

  protected refuse(reason: KvRefusal): KvResult {
    return { ok: false, reason, free: this.queueLength }
  }

  protected publish(event: KvEvent): void {
    this.pending.push(event)
    kvConsume(this.consumer, event)
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // The queue and the pages

  protected unlink(p: number): void {
    const prev = this.prevPage[p]
    const next = this.nextPage[p]
    this.nextPage[prev] = next
    this.prevPage[next] = prev
    this.queued[p] = 0
    this.queueLength--
  }

  protected linkAfter(prev: number, p: number): void {
    const next = this.nextPage[prev]
    this.nextPage[prev] = p
    this.prevPage[p] = prev
    this.nextPage[p] = next
    this.prevPage[next] = p
    this.queued[p] = 1
    this.queueLength++
  }

  /**
   * Takes `count` pages from the front of the queue. A page that was cached loses its hash, and that is published: one `BlockRemoved`
   * for each (vllm.kv-events.block-removed-emission). The pages come back unheld and unowned, for the caller to claim.
   */
  protected takePages(count: number): number[] {
    const n = this.spec.poolPages
    const taken: number[] = []
    for (let i = 0; i < count; i++) {
      const p = this.nextPage[n]
      this.unlink(p)
      const hash = this.hashes[p]
      if (hash !== NONE) {
        const group = this.owner[p]
        this.cache[group].delete(hash)
        this.hashes[p] = NONE
        this.publish(kvRemoved(group, hash))
      }
      this.owner[p] = NONE
      taken.push(p)
    }
    return taken
  }

  /**
   * Lets go of the given pages in the order given, which is their eviction priority: the first goes first. A page whose last holder
   * this was joins the queue, at the back when it has a hash and at the front when it has none (vllm.kv-pool.free-order). The pages
   * that go to the front keep their order there, as do the ones that go to the back.
   */
  protected freePages(pages: readonly number[]): void {
    const n = this.spec.poolPages
    const front: number[] = []
    const back: number[] = []
    for (const p of pages) {
      this.refs[p]--
      if (this.refs[p] === 0) {
        if (this.hashes[p] === NONE || !this.spec.prefixCaching) {
          this.owner[p] = NONE
          front.push(p)
        } else back.push(p)
      }
    }
    let at = n
    for (const p of front) {
      this.linkAfter(at, p)
      at = p
    }
    for (const p of back) this.linkAfter(this.prevPage[n], p)
  }

  /** A hit uses a cached page, and the page leaves the queue if nobody else holds it (vllm.kv-pool.touch). */
  protected touchPages(pages: readonly number[]): void {
    for (const p of pages) {
      if (this.refs[p] === 0) this.unlink(p)
      this.refs[p]++
    }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // The rules of a group

  /** Which blocks of a request of `tokens` tokens a group keeps. */
  protected rule(group: KvGroupSpec, tokens: number): KvTableRule {
    return kvTableRule(group, tokens)
  }

  /** The longest prefix that every group holds, within `maxHit` tokens (vllm.hybrid-kv.intersection). */
  protected findHit(chains: readonly (readonly number[])[], maxHit: number): KvHit {
    return kvFindHit(this.spec, (group, hash) => this.cache[group].has(hash), chains, maxHit)
  }

  /** The hash chains of `tokens` at each distinct block size, for the full blocks it holds. */
  protected chainsOf(tokens: readonly number[], extra: number): Map<number, number[]> {
    const chains = new Map<number, number[]>()
    for (const size of this.sizes) chains.set(size, kvChain(tokens, divFloor(tokens.length, size), size, extra))
    return chains
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // admit

  protected admit(req: number, prompt: readonly number[], adapter: number | null): KvResult {
    checkId(req, 'a request')
    checkTokens(prompt, 'a prompt')
    if (adapter !== null) checkId(adapter, 'an adapter')
    if (this.reqs.has(req)) return this.refuse('exists')
    if (adapter !== null && !this.adapters.has(adapter)) return this.refuse('no-adapter')
    const plan = this.planAdmit(prompt, adapter)
    if (!this.admitFits(plan)) return this.refuse('no-pages')
    this.commitAdmit(req, prompt, plan)
    return { ok: true, free: this.queueLength, hit: plan.hit }
  }

  /** Works out an admit: the hit, and for each group which pages it keeps from the hit and how many new ones it needs. Changes nothing. */
  protected planAdmit(prompt: readonly number[], adapter: number | null): KvAdmitPlan {
    const total = prompt.length
    const extra = kvExtraKey(adapter)
    const chains = this.chainsOf(prompt, extra)
    const hit = this.spec.prefixCaching
      ? this.findHit(
          this.spec.groups.map((g) => chains.get(g.blockTokens) as number[]),
          total - 1,
        ).hit
      : 0
    let fresh = 0
    let fromQueue = 0
    const groups = this.spec.groups.map((group, g): KvAdmitGroupPlan => {
      const rule = this.rule(group, total)
      const edge = hit / group.blockTokens
      const hitFrom = kvHitFrom(group, edge)
      const chain = chains.get(group.blockTokens) as number[]
      const hitPages: number[] = []
      for (let j = hitFrom; j < edge; j++) {
        const page = this.cache[g].get(chain[j])
        hitPages.push(page === undefined ? NONE : page)
        if (page !== undefined && this.refs[page] === 0) fromQueue++
      }
      // The request keeps the blocks from `rule.skip`. Those below `edge` come from the hit, the rest are new.
      let kept = 0
      let made = 0
      for (let j = rule.skip; j < rule.blocks; j++) {
        if (j >= hitFrom && j < edge && hitPages[j - hitFrom] !== NONE) kept++
        else made++
      }
      fresh += made
      return { rule, hitFrom, hitPages, kept, fresh: made }
    })
    return { adapter, extra, hit, chains, groups, fresh, fromQueue }
  }

  /**
   * Whether the pool can supply an admit: the new pages must be there once the pages of the hit have left the queue
   * (vllm.kv-pool.admission-counts-evictable).
   */
  protected admitFits(plan: KvAdmitPlan): boolean {
    return plan.fresh <= this.queueLength - plan.fromQueue
  }

  protected commitAdmit(id: number, prompt: readonly number[], plan: KvAdmitPlan): void {
    const spec = this.spec
    const everyHit: number[] = []
    for (const gp of plan.groups) for (const page of gp.hitPages) if (page !== NONE) everyHit.push(page)
    this.touchPages(everyHit)

    const tables: number[][] = []
    const released: number[][] = []
    spec.groups.forEach((group, g) => {
      const gp = plan.groups[g]
      const made = this.takePages(gp.fresh)
      for (const p of made) {
        this.owner[p] = g
        this.refs[p] = 1
      }
      const edge = plan.hit / group.blockTokens
      const table: number[] = new Array<number>(gp.rule.blocks).fill(NONE)
      let next = 0
      for (let j = gp.rule.skip; j < gp.rule.blocks; j++) {
        const hitPage = j >= gp.hitFrom && j < edge ? gp.hitPages[j - gp.hitFrom] : NONE
        table[j] = hitPage !== NONE ? hitPage : made[next++]
      }
      tables.push(table)
      // The hit pages that fall before the window's edge were read and are not kept: they go back (vllm.kv-pool.touch).
      const dropped: number[] = []
      for (let j = Math.min(edge, gp.rule.skip) - 1; j >= gp.hitFrom; j--) if (gp.hitPages[j - gp.hitFrom] !== NONE) dropped.push(gp.hitPages[j - gp.hitFrom])
      released.push(dropped)
    })
    for (const dropped of released) this.freePages(dropped)

    const request: Req = {
      id,
      adapter: plan.adapter,
      tokens: prompt.slice(),
      tables,
      chains: plan.chains,
      done: spec.groups.map((group) => plan.hit / group.blockTokens),
    }
    this.reqs.set(id, request)
    if (plan.adapter !== null) (this.adapters.get(plan.adapter) as Adapter).users++
    this.cacheBlocks(request)
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // append

  protected append(id: number, tokens: readonly number[]): KvResult {
    checkId(id, 'a request')
    checkTokens(tokens, 'the appended tokens')
    const r = this.reqs.get(id)
    if (r === undefined) return this.refuse('unknown')
    const before = r.tokens.length
    const after = before + tokens.length
    let fresh = 0
    let freed = 0
    const plan = this.spec.groups.map((group, g) => {
      const old = this.rule(group, before)
      const now = this.rule(group, after)
      // The entries below `old.skip` were let go already. The ones from there to `now.skip` go now, the highest block first.
      const letGo: number[] = []
      for (let j = Math.min(now.skip, old.blocks) - 1; j >= old.skip; j--) if (r.tables[g][j] !== NONE) letGo.push(r.tables[g][j])
      for (const p of letGo) if (this.refs[p] === 1) freed++
      const made = Math.max(0, now.blocks - Math.max(old.blocks, now.skip))
      fresh += made
      return { old, now, letGo, made }
    })
    if (fresh > this.queueLength + freed) return this.refuse('no-pages')

    // Let go of what the windows have left behind first, so that the pages go back before new ones are taken
    // (the order of vllm.kv-pool.skipped-freed-first), then take the new ones.
    for (const step of plan) this.freePages(step.letGo)
    this.spec.groups.forEach((_, g) => {
      const step = plan[g]
      const table = r.tables[g]
      for (let j = step.old.skip; j < Math.min(step.now.skip, step.old.blocks); j++) table[j] = NONE
      const made = this.takePages(step.made)
      for (const p of made) {
        this.owner[p] = g
        this.refs[p] = 1
      }
      let next = 0
      for (let j = step.old.blocks; j < step.now.blocks; j++) table[j] = j < step.now.skip ? NONE : made[next++]
    })
    for (const t of tokens) r.tokens.push(t)
    this.cacheBlocks(r)
    return { ok: true, free: this.queueLength }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // finish

  protected finish(id: number): KvResult {
    checkId(id, 'a request')
    const r = this.reqs.get(id)
    if (r === undefined) return this.refuse('unknown')
    this.spec.groups.forEach((_, g) => {
      const pages: number[] = []
      for (let j = r.tables[g].length - 1; j >= 0; j--) if (r.tables[g][j] !== NONE) pages.push(r.tables[g][j])
      this.freePages(pages)
    })
    if (r.adapter !== null) (this.adapters.get(r.adapter) as Adapter).users--
    this.reqs.delete(id)
    return { ok: true, free: this.queueLength }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // The cache: hashing the blocks that have filled

  /**
   * Caches the full blocks of a request that no one has decided yet, group by group (vllm.hybrid-kv.cache-key): each takes its hash
   * from the request's chain and becomes the page that a later hit finds. A block the group has let go of is skipped. So is one whose
   * key another page holds already: it stays unhashed. Each run of consecutive blocks that were cached is published as one
   * `BlockStored` (vllm.kv-events.stored-content).
   */
  protected cacheBlocks(r: Req): void {
    if (!this.spec.prefixCaching) return
    this.extendChains(r)
    this.spec.groups.forEach((group, g) => {
      const size = group.blockTokens
      const chain = r.chains.get(size) as number[]
      const to = divFloor(r.tokens.length, size)
      const table = r.tables[g]
      let start = -1
      let run: number[] = []
      const flush = (): void => {
        if (run.length === 0) return
        const tokens = r.tokens.slice(start * size, (start + run.length) * size)
        this.publishStored(group, g, run, start === 0 ? null : chain[start - 1], tokens, r.adapter)
        run = []
      }
      for (let j = r.done[g]; j < to; j++) {
        const page = table[j]
        if (page === NONE || this.cache[g].has(chain[j])) {
          flush()
          continue
        }
        this.cache[g].set(chain[j], page)
        this.hashes[page] = chain[j]
        if (run.length === 0) start = j
        run.push(chain[j])
      }
      flush()
      if (to > r.done[g]) r.done[g] = to
    })
  }

  protected publishStored(group: KvGroupSpec, g: number, hashes: readonly number[], parent: number | null, tokens: readonly number[], adapter: number | null): void {
    this.publish(kvStored(group, g, hashes, parent, tokens, adapter))
  }

  /** Extends each chain of a request to cover the full blocks it holds now. */
  protected extendChains(r: Req): void {
    const extra = kvExtraKey(r.adapter)
    for (const size of this.sizes) {
      const chain = r.chains.get(size) as number[]
      const to = divFloor(r.tokens.length, size)
      for (let j = chain.length; j < to; j++) chain.push(kvBlockHash(j === 0 ? 0 : chain[j - 1], r.tokens, j * size, (j + 1) * size, extra))
    }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // Adapters

  protected loadAdapter(id: number, pages: number): KvResult {
    checkId(id, 'an adapter')
    if (!Number.isSafeInteger(pages) || pages < 1) throw new RangeError(`an adapter takes at least one page, got ${pages}`)
    if (this.adapters.has(id)) return this.refuse('exists')
    if (this.spec.adapterSlots !== undefined) {
      if (this.adapters.size >= this.spec.adapterSlots) return this.refuse('no-slot')
      this.adapters.set(id, { pages: [], users: 0 })
      return { ok: true, free: this.queueLength }
    }
    if (pages > this.queueLength) return this.refuse('no-pages')
    const taken = this.takePages(pages)
    for (const p of taken) this.lender[p] = id
    this.adapters.set(id, { pages: taken, users: 0 })
    return { ok: true, free: this.queueLength }
  }

  protected unloadAdapter(id: number): KvResult {
    checkId(id, 'an adapter')
    const a = this.adapters.get(id)
    if (a === undefined) return this.refuse('unknown')
    if (a.users > 0) return this.refuse('in-use')
    const given: number[] = []
    for (let i = a.pages.length - 1; i >= 0; i--) {
      const p = a.pages[i]
      this.lender[p] = NONE
      this.refs[p] = 1
      given.push(p)
    }
    this.freePages(given)
    this.adapters.delete(id)
    return { ok: true, free: this.queueLength }
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // reset

  /** Forgets every cached block. It needs the pool at rest: with a request running it is refused (vllm.kv-events.all-blocks-cleared). */
  protected reset(): KvResult {
    if (this.reqs.size > 0) return this.refuse('busy')
    if (this.spec.prefixCaching) {
      for (const map of this.cache) map.clear()
      this.hashes.fill(NONE)
      this.owner.fill(NONE)
      this.publish(kvCleared())
    }
    return { ok: true, free: this.queueLength }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------

function checkId(x: number, what: string): void {
  if (!Number.isSafeInteger(x) || x < 0) throw new RangeError(`${what} is a non-negative integer id, got ${x}`)
}

function checkTokens(tokens: readonly number[], what: string): void {
  if (tokens.length === 0) throw new RangeError(`${what} has at least one token`)
  for (const t of tokens) {
    if (!Number.isInteger(t) || t < 0 || t >= TWO_32) throw new RangeError(`a token is an integer from 0 to 2^32 - 1, got ${t}`)
  }
}

/** The reference manager for `spec`. */
export function kvReference(spec: KvSpec): KvModel {
  return new KvReference(spec)
}
