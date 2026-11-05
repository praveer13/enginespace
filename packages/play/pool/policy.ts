/**
 * The policies that play The Reach-In without a learner (GAMES.md §8, `poolReference`): the house, whose run is the ghost and the
 * target, the engine's pool, which is what the pinned vLLM does, and the strategies that the bands, the tests and the blind-strategy
 * bound measure the house against.
 *
 * The engine's pool (`engine`) is GAMES.md's `poolReference`: first come, first served, with the head of the line blocking; dump the
 * rotation's next pans (vllm.kv-pool.allocate-from-front), whose order already puts the tail of an order before its head
 * (vllm.kv-pool.free-reverse); pull the ticket hung last (vllm.scheduler.preemption-victim); bring in the kit the queue's head needs.
 *
 * The house is the engine's pool with the two refinements that the game teaches, both of which follow from one rule: a ticket's hit counts
 * only as far as every station still holds its pans (vllm.hybrid-kv.intersection). So a pan that a ticket is waiting to start from is
 * spoken for, and a ticket that already has most of its pans in the reach-in should hang first:
 *   admit     the ticket the reach-in already holds the most of, among the tickets whose kit has landed and whose pans fit; ties go to the
 *             ticket that has waited longest;
 *   evict     the cheapest pans: the ones that cost the waiting tickets the fewest tokens of hit, then the tables still seated, and, among
 *             equals, the rotation's order. The pans of a table that has left go first;
 *   preempt   the engine's: the ticket hung last;
 *   prefetch  the engine's: the kit the waiting line needs first.
 * The house is not the engine: the debrief says so, and shows what the engine's pool would have paid.
 */
import { chainsOfReq, kitReady, planOf, promptOf } from './engine'
import type { PoolWork, Policy } from './engine'
import type { PoolAction, PoolAsk } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a dump costs                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface PagePrice {
  /** Tokens that waiting tickets would lose from their hits if the pan went, one entry for each pan asked about. */
  readonly price: readonly number[]
  /** The waiting tickets whose hit starts from the pan. */
  readonly spoken: readonly (readonly number[])[]
  /** Tokens that tables still seated would lose from the hit of their next ticket, which has not arrived yet. */
  readonly soon: readonly number[]
  /** Those next tickets. */
  readonly seated: readonly (readonly number[])[]
}

/** A ticket whose hit starts from some of the pans asked about. */
interface Claim {
  readonly id: number
  /** The tokens of the ticket's hit as the cache stands. */
  readonly hit: number
  /** Where, in the list of pans asked about, the pans are that the hit starts from. */
  readonly ranks: readonly number[]
}

/** The claims on the pans asked about: those of waiting tickets, which are certain, and those of the tables still seated. */
function claimsOf(w: PoolWork, pages: readonly number[], skip: number | null): { readonly waiting: Claim[]; readonly seated: Claim[] } {
  const at = new Map<number, number>()
  pages.forEach((page, i) => at.set(page, i))
  const claim = (id: number): Claim | null => {
    const plan = planOf(w, id)
    if (plan.hit === 0) return null
    const ranks: number[] = []
    for (const page of plan.pages) {
      const i = at.get(page)
      if (i !== undefined) ranks.push(i)
    }
    return ranks.length === 0 ? null : { id, hit: plan.hit, ranks }
  }
  const waiting: Claim[] = []
  const seated: Claim[] = []
  for (const id of w.waiting) {
    if (id === skip) continue
    const held = claim(id)
    if (held !== null) waiting.push(held)
  }
  w.reqs.forEach((req, id) => {
    if (req.status !== 'future' || req.at < 0) return
    const held = claim(id)
    if (held !== null) seated.push(held)
  })
  return { waiting, seated }
}

/** The tokens a claim would lose from its hit if `page` went: the hit now, less the hit by the sim's own fixed point without the pan. */
const lossOf = (w: PoolWork, claim: Claim, page: number): number =>
  claim.hit - w.mgr.hitWithout(promptOf(w.level, claim.id, w.reqs[claim.id].progress), w.level.reqs[claim.id].adapter, page, chainsOfReq(w.level, claim.id))

/**
 * What it costs to lose each of `pages`. A waiting ticket's hit is certain: for every waiting ticket whose hit starts from a pan, the
 * hit that ticket would have without it, by the sim's own fixed point. A table that is still seated will order again, and its next
 * ticket's hit is as good as certain, so it is priced the same way but apart, as `soon`; a table that has left (no ticket to come) costs
 * nothing, and its pans are the cheapest to dump. `skip` is the ticket being hung, whose own hit is not offered to be dumped.
 */
export function priceOf(w: PoolWork, pages: readonly number[], skip: number | null): PagePrice {
  const price = pages.map(() => 0)
  const soon = pages.map(() => 0)
  const spoken = pages.map((): number[] => [])
  const seated = pages.map((): number[] => [])
  const { waiting, seated: coming } = claimsOf(w, pages, skip)
  for (const claim of waiting) {
    for (const rank of claim.ranks) {
      spoken[rank].push(claim.id)
      price[rank] += lossOf(w, claim, pages[rank])
    }
  }
  for (const claim of coming) {
    for (const rank of claim.ranks) {
      seated[rank].push(claim.id)
      soon[rank] += lossOf(w, claim, pages[rank])
    }
  }
  return { price, spoken, soon, seated }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The policies                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const ascending = (pages: readonly number[]): number[] => pages.slice().sort((a, b) => a - b)

/** The first waiting ticket whose kit has landed, if it can hang; otherwise nothing: first come, first served, the head of the line blocking. */
function headOfLine(w: PoolWork, candidates: readonly number[]): number | null {
  for (const id of w.waiting) {
    const adapter = w.level.reqs[id].adapter
    if (adapter !== null && !kitReady(w, adapter)) continue
    return candidates.includes(id) ? id : null
  }
  return null
}

/** The candidate whose hit is longest; the first of equals, which is the one that has waited longest. */
function longestHit(w: PoolWork, candidates: readonly number[]): number | null {
  let best: number | null = null
  let most = -1
  for (const id of candidates) {
    const hit = planOf(w, id).hit
    if (hit > most) {
      most = hit
      best = id
    }
  }
  return best
}

/**
 * The `need` cheapest pans: fewest tokens lost by tickets that wait, then by tables still seated, then the rotation's order.
 *
 * A pan that a hit starts from is one that the hit cannot do without, so it costs the ticket something, and a pan that no waiting ticket
 * and no seated table starts from costs nothing. So the pans that cost nothing come first, in the rotation's order; the pans that only a
 * seated table will start from next, dearest last; and only when those do not make `need` are the pans that waiting tickets stand on
 * priced, each by the sim's fixed point. The order is the one `priceOf` gives (the tests compare them); it only prices what the choice needs.
 */
export function cheapest(w: PoolWork, ask: Extract<PoolAsk, { kind: 'evict' }>): number[] {
  const pages = ask.candidates
  const { waiting, seated } = claimsOf(w, pages, ask.for === 'admit' ? ask.target : null)
  const spoken = new Uint8Array(pages.length)
  const coming = new Uint8Array(pages.length)
  for (const claim of waiting) for (const rank of claim.ranks) spoken[rank] = 1
  for (const claim of seated) for (const rank of claim.ranks) coming[rank] = 1
  const lossesOf = (claims: readonly Claim[], want: (rank: number) => boolean): number[] => {
    const total = pages.map(() => 0)
    for (const claim of claims) for (const rank of claim.ranks) if (want(rank)) total[rank] += lossOf(w, claim, pages[rank])
    return total
  }

  const picked: number[] = []
  for (let rank = 0; rank < pages.length && picked.length < ask.need; rank++) if (spoken[rank] === 0 && coming[rank] === 0) picked.push(rank)
  if (picked.length < ask.need) {
    const later = lossesOf(seated, (rank) => spoken[rank] === 0)
    const next: number[] = []
    for (let rank = 0; rank < pages.length; rank++) if (spoken[rank] === 0 && coming[rank] === 1) next.push(rank)
    next.sort((a, b) => later[a] - later[b] || a - b)
    for (const rank of next) if (picked.length < ask.need) picked.push(rank)
  }
  if (picked.length < ask.need) {
    const price = lossesOf(waiting, () => true)
    const later = lossesOf(seated, (rank) => spoken[rank] === 1)
    const dear: number[] = []
    for (let rank = 0; rank < pages.length; rank++) if (spoken[rank] === 1) dear.push(rank)
    dear.sort((a, b) => price[a] - price[b] || later[a] - later[b] || a - b)
    for (const rank of dear) if (picked.length < ask.need) picked.push(rank)
  }
  return ascending(picked.map((rank) => pages[rank]))
}

/** The engine's pool, as the pinned vLLM runs it (GAMES.md §8's `poolReference`). */
export const engine: Policy = (w, ask): PoolAction => {
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: headOfLine(w, ask.candidates) }
    case 'evict':
      return { t: 'evict', pages: ascending(ask.candidates.slice(0, ask.need)) }
    case 'preempt':
      return { t: 'preempt', req: w.running[w.running.length - 1] }
    case 'prefetch':
      return { t: 'prefetch', adapter: ask.candidates[0] ?? null }
  }
}

/** The house's policy, which is the ghost's. */
export const house: Policy = (w, ask): PoolAction => {
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: longestHit(w, ask.candidates) }
    case 'evict':
      return { t: 'evict', pages: cheapest(w, ask) }
    default:
      return engine(w, ask)
  }
}

/**
 * The engine's pool with a kit loaded when nothing else can run. An engine loads an adapter when a request needs it and has nothing
 * else to schedule, so the load lands while the line idles.
 */
export const lazy: Policy = (w, ask): PoolAction => (ask.kind === 'prefetch' ? { t: 'prefetch', adapter: w.running.length === 0 ? (ask.candidates[0] ?? null) : null } : engine(w, ask))

/** Always the first option the lists show. */
export const blindFirst: Policy = (_w, ask): PoolAction => {
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: ask.candidates[0] }
    case 'evict':
      return { t: 'evict', pages: ascending(ask.candidates.slice(0, ask.need)) }
    case 'preempt':
      return { t: 'preempt', req: ask.candidates[0] }
    case 'prefetch':
      return { t: 'prefetch', adapter: ask.candidates[0] }
  }
}

/** Always the last option the lists show. */
export const blindLast: Policy = (_w, ask): PoolAction => {
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: ask.candidates[ask.candidates.length - 1] }
    case 'evict':
      return { t: 'evict', pages: ascending(ask.candidates.slice(ask.candidates.length - ask.need)) }
    case 'preempt':
      return { t: 'preempt', req: ask.candidates[ask.candidates.length - 1] }
    case 'prefetch':
      return { t: 'prefetch', adapter: ask.candidates[ask.candidates.length - 1] }
  }
}

/** The newest ticket first, as a stack: the last ticket the line offers, with the rotation as it comes and the first kit on offer. */
export const newest: Policy = (_w, ask): PoolAction => {
  switch (ask.kind) {
    case 'admit':
      return { t: 'admit', req: ask.candidates[ask.candidates.length - 1] }
    case 'evict':
      return { t: 'evict', pages: ascending(ask.candidates.slice(0, ask.need)) }
    case 'preempt':
      return { t: 'preempt', req: ask.candidates[0] }
    case 'prefetch':
      return { t: 'prefetch', adapter: ask.candidates[0] }
  }
}

/** One ticket at a time: hang a ticket only when the line is empty, and take the rotation as it comes. */
export const serial: Policy = (w, ask): PoolAction => {
  if (ask.kind === 'admit') return { t: 'admit', req: w.running.length === 0 ? headOfLine(w, ask.candidates) : null }
  return engine(w, ask)
}

/** The pans by table order, head first: what a manager that put an order's pans back first block first would dump. */
export const headFirst: Policy = (w, ask): PoolAction => {
  if (ask.kind !== 'evict') return house(w, ask)
  // An unlabelled rotation is the engine's, tail first; this one dumps by ascending pan, which is the order the pans were first filled.
  return { t: 'evict', pages: ascending(ask.candidates).slice(0, ask.need) }
}
