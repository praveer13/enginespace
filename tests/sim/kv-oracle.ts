/*
 * A second hybrid KV manager, written for the tests (W1-T21): the same rules as packages/sim/kv/reference.ts, from the same English, but
 * with nothing of its structure. It shares only the hash function and the vocabulary of types.
 *
 *   - Where the reference works out what an operation needs and then does it, this one just does it, one step at a time, and rolls the
 *     whole state back when a step finds the pool empty. A refusal is a rollback, so all-or-nothing is true by construction.
 *   - Where the reference keeps a linked queue and typed arrays, this one keeps an array of page numbers and an object per page, and
 *     moves pages with splice.
 *   - Where the reference reads the hit off runs of cached blocks, this one tries every length from the longest down, and asks each
 *     group the plain question of its rule: are the blocks it needs for this length all cached?
 *   - It never calls kvTableRule, kvHitFrom or kvFindHit: the tables' lengths, the windows and the hits are written out again here.
 *
 * The property tests drive both with the same streams and compare every reply, every state and every event.
 */
import { canonicalJson } from '../../packages/sim/core/json'
import { kvBlockHash, kvCleared, kvExtraKey, kvRemoved, kvStored } from '../../packages/sim/kv'
import type { KvEvent, KvEventBatch, KvModel, KvOp, KvPage, KvRefusal, KvResult, KvSpec, KvState } from '../../packages/sim/kv'

interface Page {
  refs: number
  group: number | null
  hash: number | null
  adapter: number | null
}

interface Core {
  pages: Page[]
  queue: number[]
  reqs: Record<string, { adapter: number | null; tokens: number[]; tables: (number | null)[][]; done: number[] }>
  adapters: Record<string, { pages: number[]; users: number }>
  index: Record<string, number>
  /** What a consumer of the events believes, by `group:hash`. */
  consumer: Record<string, number>
}

class Refused extends Error {
  readonly reason: KvRefusal
  constructor(reason: KvRefusal) {
    super(reason)
    this.reason = reason
  }
}

const key = (group: number, hash: number): string => `${group}:${hash}`
const ceil = (a: number, b: number): number => Math.floor((a + b - 1) / b)

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** A copy of the whole state, to roll back to. */
function clone(c: Core): Core {
  const reqs: Core['reqs'] = {}
  for (const id of Object.keys(c.reqs)) {
    const r = c.reqs[id]
    reqs[id] = { adapter: r.adapter, tokens: r.tokens.slice(), tables: r.tables.map((t) => t.slice()), done: r.done.slice() }
  }
  const adapters: Core['adapters'] = {}
  for (const id of Object.keys(c.adapters)) adapters[id] = { pages: c.adapters[id].pages.slice(), users: c.adapters[id].users }
  return { pages: c.pages.map((p) => ({ ...p })), queue: c.queue.slice(), reqs, adapters, index: { ...c.index }, consumer: { ...c.consumer } }
}

export class Oracle implements KvModel {
  private readonly spec: KvSpec
  private readonly align: number
  private core: Core
  private log: KvEventBatch[] = []
  private pending: KvEvent[] = []
  private steps = 0

  constructor(spec: KvSpec) {
    this.spec = spec
    this.align = spec.groups.reduce((lcm, g) => (lcm * g.blockTokens) / gcd(lcm, g.blockTokens), 1)
    this.core = {
      pages: Array.from({ length: spec.poolPages }, () => ({ refs: 0, group: null, hash: null, adapter: null })),
      queue: Array.from({ length: spec.poolPages }, (_, i) => i),
      reqs: {},
      adapters: {},
      index: {},
      consumer: {},
    }
  }

  apply(op: KvOp): KvResult {
    const ts = this.steps++
    const saved = this.core
    this.core = clone(saved)
    this.pending = []
    try {
      this.run(op)
      if (this.pending.length > 0) this.log.push([ts, this.pending])
      this.pending = []
      return { ok: true, free: this.core.queue.length, ...(op.op === 'admit' ? { hit: this.lastHit } : {}) }
    } catch (e) {
      if (!(e instanceof Refused)) throw e
      this.core = saved
      this.pending = []
      return { ok: false, reason: e.reason, free: this.core.queue.length }
    }
  }

  events(): readonly KvEventBatch[] {
    return this.log.slice()
  }

  state(): KvState {
    const c = this.core
    const pages: KvPage[] = c.pages.map((p): KvPage => {
      if (p.adapter !== null) return { st: 'adapter', adapter: p.adapter }
      if (p.refs > 0) return { st: 'used', group: p.group as number, refs: p.refs, hash: p.hash }
      if (p.hash !== null) return { st: 'cached', group: p.group as number, hash: p.hash }
      return { st: 'free' }
    })
    const ids = (o: Record<string, unknown>): number[] => Object.keys(o).map(Number).sort((a, b) => a - b)
    const cache = Object.keys(c.index)
      .map((k) => {
        const [g, h] = k.split(':').map(Number)
        return { group: g, hash: h, page: c.index[k] }
      })
      .sort((a, b) => a.group - b.group || a.hash - b.hash)
    return {
      pages,
      queue: c.queue.slice(),
      requests: ids(c.reqs).map((id) => ({ id, adapter: c.reqs[id].adapter, length: c.reqs[id].tokens.length, tables: c.reqs[id].tables.map((t) => t.slice()) })),
      adapters: ids(c.adapters).map((id) => ({ id, pages: c.adapters[id].pages.slice(), users: c.adapters[id].users })),
      cache,
      consumer: Object.keys(c.consumer)
        .map((k) => {
          const [g, h] = k.split(':').map(Number)
          return { group: g, hash: h, count: c.consumer[k] }
        })
        .sort((a, b) => a.group - b.group || a.hash - b.hash),
      step: this.steps,
    }
  }

  // ---------------------------------------------------------------------------------------------------------------------------

  private lastHit = 0

  private publish(event: KvEvent): void {
    this.pending.push(event)
    if (event.type === 'AllBlocksCleared') {
      this.core.consumer = {}
      return
    }
    const step = event.type === 'BlockStored' ? 1 : -1
    for (const hash of event.block_hashes) {
      const k = key(event.group_idx as number, hash)
      const now = (this.core.consumer[k] ?? 0) + step
      if (now === 0) delete this.core.consumer[k]
      else this.core.consumer[k] = now
    }
  }

  /** The front page is taken. A cached page loses its hash, and that is published. The queue running dry is a refusal. */
  private take(): number {
    const c = this.core
    const p = c.queue.shift()
    if (p === undefined) throw new Refused('no-pages')
    const page = c.pages[p]
    if (page.hash !== null) {
      delete c.index[key(page.group as number, page.hash)]
      this.publish(kvRemoved(page.group as number, page.hash))
      page.hash = null
    }
    page.group = null
    return p
  }

  /** Pages let go in the order given: a page nobody holds now goes to the back of the queue with a hash, to the front without one. */
  private free(list: number[]): void {
    const c = this.core
    const front: number[] = []
    const back: number[] = []
    for (const p of list) {
      c.pages[p].refs--
      if (c.pages[p].refs === 0) {
        if (c.pages[p].hash === null) {
          c.pages[p].group = null
          front.push(p)
        } else back.push(p)
      }
    }
    c.queue = [...front, ...c.queue, ...back]
  }

  private blocksOf(g: number, tokens: number): number {
    return ceil(tokens, this.spec.groups[g].blockTokens)
  }

  /** The first block of a group's table that is not let go, for a request of `tokens` tokens. */
  private firstKept(g: number, tokens: number): number {
    const group = this.spec.groups[g]
    const blocks = this.blocksOf(g, tokens)
    if (group.kind === 'full') return 0
    if (group.kind === 'sliding') {
      // The tokens from `tokens - window + 1` on are read by the next token. Blocks wholly before that are let go.
      const firstRead = Math.max(0, tokens - (group.window as number) + 1)
      return Math.floor(firstRead / group.blockTokens)
    }
    return Math.max(0, blocks - (group.statePages as number))
  }

  private chain(tokens: readonly number[], size: number, extra: number): number[] {
    const out: number[] = []
    for (let j = 0; (j + 1) * size <= tokens.length; j++) out.push(kvBlockHash(j === 0 ? 0 : out[j - 1], tokens, j * size, (j + 1) * size, extra))
    return out
  }

  /** The blocks a hit of `n` tokens needs cached in group `g`: [from, n / B). */
  private needFrom(g: number, n: number): number {
    const group = this.spec.groups[g]
    const m = n / group.blockTokens
    if (group.kind === 'full') return 0
    const behind = group.kind === 'sliding' ? ceil((group.window as number) - 1, group.blockTokens) : 1
    return Math.max(0, m - behind)
  }

  private holds(n: number, chains: number[][]): boolean {
    return this.spec.groups.every((group, g) => {
      const m = n / group.blockTokens
      for (let j = this.needFrom(g, n); j < m; j++) if (this.core.index[key(g, chains[g][j])] === undefined) return false
      return true
    })
  }

  private run(op: KvOp): void {
    const c = this.core
    const spec = this.spec
    switch (op.op) {
      case 'admit': {
        if (c.reqs[op.req] !== undefined) throw new Refused('exists')
        const adapter = op.adapter ?? null
        if (adapter !== null && c.adapters[adapter] === undefined) throw new Refused('no-adapter')
        const extra = kvExtraKey(adapter)
        const total = op.prompt.length
        const chains = spec.groups.map((group) => this.chain(op.prompt, group.blockTokens, extra))
        let hit = 0
        if (spec.prefixCaching) {
          // Every length that the groups' blocks allow, from the longest down; the first that every group holds is the hit.
          for (let n = total - 1 - ((total - 1) % this.align); n > 0; n -= this.align) {
            if (this.holds(n, chains)) {
              hit = n
              break
            }
          }
        }
        this.lastHit = hit
        // Every page of the hit is read: it leaves the queue when nobody else holds it.
        const hitPages: Record<string, number> = {}
        spec.groups.forEach((group, g) => {
          const m = hit / group.blockTokens
          for (let j = this.needFrom(g, hit); j < m; j++) {
            const p = c.index[key(g, chains[g][j])]
            hitPages[`${g}/${j}`] = p
            if (c.pages[p].refs === 0) c.queue.splice(c.queue.indexOf(p), 1)
            c.pages[p].refs++
          }
        })
        const tables: (number | null)[][] = []
        const dropped: number[][] = []
        spec.groups.forEach((group, g) => {
          const blocks = this.blocksOf(g, total)
          const first = this.firstKept(g, total)
          const m = hit / group.blockTokens
          const table: (number | null)[] = Array.from({ length: blocks }, () => null)
          for (let j = first; j < blocks; j++) {
            const got = hitPages[`${g}/${j}`]
            if (got !== undefined) table[j] = got
            else {
              const p = this.take()
              c.pages[p].group = g
              c.pages[p].refs = 1
              table[j] = p
            }
          }
          const letGo: number[] = []
          for (let j = Math.min(m, first) - 1; j >= 0; j--) if (hitPages[`${g}/${j}`] !== undefined) letGo.push(hitPages[`${g}/${j}`])
          dropped.push(letGo)
          tables.push(table)
        })
        for (const letGo of dropped) this.free(letGo)
        c.reqs[op.req] = { adapter, tokens: op.prompt.slice(), tables, done: spec.groups.map((group) => hit / group.blockTokens) }
        if (adapter !== null) c.adapters[adapter].users++
        this.register(op.req)
        return
      }
      case 'append': {
        const r = c.reqs[op.req]
        if (r === undefined) throw new Refused('unknown')
        const before = r.tokens.length
        const after = before + op.tokens.length
        const letGoAll: number[][] = spec.groups.map((_, g) => {
          const list: number[] = []
          for (let j = Math.min(this.firstKept(g, after), r.tables[g].length) - 1; j >= 0; j--) {
            const p = r.tables[g][j]
            if (p !== null) {
              list.push(p)
              r.tables[g][j] = null
            }
          }
          return list
        })
        for (const list of letGoAll) this.free(list)
        spec.groups.forEach((_, g) => {
          const blocks = this.blocksOf(g, after)
          const first = this.firstKept(g, after)
          while (r.tables[g].length < blocks) {
            const j = r.tables[g].length
            if (j < first) r.tables[g].push(null)
            else {
              const p = this.take()
              c.pages[p].group = g
              c.pages[p].refs = 1
              r.tables[g].push(p)
            }
          }
        })
        for (const t of op.tokens) r.tokens.push(t)
        this.register(op.req)
        return
      }
      case 'finish': {
        const r = c.reqs[op.req]
        if (r === undefined) throw new Refused('unknown')
        spec.groups.forEach((_, g) => {
          const list: number[] = []
          for (let j = r.tables[g].length - 1; j >= 0; j--) if (r.tables[g][j] !== null) list.push(r.tables[g][j] as number)
          this.free(list)
        })
        if (r.adapter !== null) c.adapters[r.adapter].users--
        delete c.reqs[op.req]
        return
      }
      case 'load-adapter': {
        if (c.adapters[op.adapter] !== undefined) throw new Refused('exists')
        if (spec.adapterSlots !== undefined) {
          if (Object.keys(c.adapters).length >= spec.adapterSlots) throw new Refused('no-slot')
          c.adapters[op.adapter] = { pages: [], users: 0 }
          return
        }
        const pages: number[] = []
        for (let i = 0; i < op.pages; i++) {
          const p = this.take()
          c.pages[p].adapter = op.adapter
          pages.push(p)
        }
        c.adapters[op.adapter] = { pages, users: 0 }
        return
      }
      case 'unload-adapter': {
        const a = c.adapters[op.adapter]
        if (a === undefined) throw new Refused('unknown')
        if (a.users > 0) throw new Refused('in-use')
        const list: number[] = []
        for (let i = a.pages.length - 1; i >= 0; i--) {
          c.pages[a.pages[i]].adapter = null
          c.pages[a.pages[i]].refs = 1
          list.push(a.pages[i])
        }
        this.free(list)
        delete c.adapters[op.adapter]
        return
      }
      case 'reset': {
        if (Object.keys(c.reqs).length > 0) throw new Refused('busy')
        if (spec.prefixCaching) {
          c.index = {}
          for (const page of c.pages) {
            page.hash = null
            page.group = null
          }
          this.publish(kvCleared())
        }
        return
      }
    }
  }

  /** Caches the full blocks of a request that have not been decided yet, and publishes each run once. */
  private register(id: number): void {
    if (!this.spec.prefixCaching) return
    const c = this.core
    const r = c.reqs[id]
    this.spec.groups.forEach((group, g) => {
      const size = group.blockTokens
      const chain = this.chain(r.tokens, size, kvExtraKey(r.adapter))
      let run: number[] = []
      let start = 0
      const flush = (): void => {
        if (run.length === 0) return
        this.publish(kvStored(group, g, run, start === 0 ? null : chain[start - 1], r.tokens.slice(start * size, (start + run.length) * size), r.adapter))
        run = []
      }
      for (let j = r.done[g]; j < chain.length; j++) {
        const p = r.tables[g][j]
        if (p === null || c.index[key(g, chain[j])] !== undefined) {
          flush()
          continue
        }
        c.index[key(g, chain[j])] = p
        c.pages[p].hash = chain[j]
        if (run.length === 0) start = j
        run.push(chain[j])
      }
      flush()
      r.done[g] = Math.max(r.done[g], chain.length)
    })
  }
}

/** Two states are the same page for page: canonical JSON of both. */
export const sameState = (a: KvState, b: KvState): boolean => canonicalJson(a) === canonicalJson(b)
