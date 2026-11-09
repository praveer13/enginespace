// The prefix hit (ARCHITECTURE §5.4, WORLD §2.4): the longest prefix of a prompt that every group holds.
//
// A hit must hold in every group, so it is the intersection of the groups' hits, and the engine finds it with an iterative fixed point
// (vllm.hybrid-kv.intersection, vllm.hybrid-kv.n-group-lookup): ask each type of group, full attention first (vllm.hybrid-kv.full-attention-first),
// for its longest hit within the length the last one allowed, and if any of them shortened the length, ask them all again. The length only
// falls and stops at 0, so it converges. With one full group and one other the first pass settles it (vllm.hybrid-kv.simple-hybrid).
//
// What one group accepts, for a hit of n tokens, m = n ÷ B whole blocks (vllm.hybrid-kv.hit-alignment: n is also a multiple of the
// least common multiple A of every group's block size):
//   full      blocks 0 … m - 1 are all cached                                       (scanned from the left)
//   sliding   blocks m - c … m - 1 are all cached, c = ⌈(W - 1) ÷ B⌉, or, when m < c,
//             blocks 0 … m - 1 are                                                  (scanned from the right)
//   state     block m - 1 is cached, the state at the edge, for m ≥ 1
// The first prompt token that the hit does not cover is token n, and a hit never covers the last prompt token (vllm.kv-pool.max-hit-length):
// a request whose whole prompt is cached still computes its last token to get its logits.

import { divFloor } from '../core/int'
import { kvAlignment, kvHitBlocks } from './spec'
import type { KvSpec, KvState } from './types'
import { kvChain, kvExtraKey } from './hash'

export interface KvHit {
  /** Tokens the cache serves for the prompt: a multiple of the alignment, at most the prompt's length less 1, and 0 for no hit. */
  readonly hit: number
  /** What each group would serve if it were the only one, by group index. `hit` is at most each of these. */
  readonly perGroup: readonly number[]
}

/**
 * The hit for a prompt whose blocks hash to `chains` (one chain per group, from `kvChain` at the group's block size, each at least
 * ⌊maxHit ÷ blockTokens⌋ long), under a cache that answers `has(group, hash)`, within `maxHit` tokens.
 */
export function kvFindHit(spec: KvSpec, has: (group: number, hash: number) => boolean, chains: readonly (readonly number[])[], maxHit: number): KvHit {
  const cap = Math.max(0, maxHit)
  const align = kvAlignment(spec)
  const groups = spec.groups
  const flags: (Uint8Array | undefined)[] = new Array<Uint8Array | undefined>(groups.length).fill(undefined)

  /** Whether each of group g's first blocks, up to the ones `maxHit` reaches, is cached. */
  const flagsOf = (g: number): Uint8Array => {
    let f = flags[g]
    if (f === undefined) {
      const blocks = divFloor(cap, groups[g].blockTokens)
      f = new Uint8Array(blocks)
      for (let j = 0; j < blocks; j++) f[j] = has(g, chains[g][j]) ? 1 : 0
      flags[g] = f
    }
    return f
  }

  /** The longest hit group `g` accepts that is within `limit` tokens. */
  const groupHit = (g: number, limit: number): number => {
    const group = groups[g]
    const size = group.blockTokens
    const blocks = divFloor(limit, size)
    if (blocks === 0) return 0
    if (group.kind === 'full') {
      let m = 0
      while (m < blocks && has(g, chains[g][m])) m++
      const tokens = m * size
      return tokens - (tokens % align)
    }
    const f = flagsOf(g)
    const need = kvHitBlocks(group)
    let run = 0
    let best = 0
    for (let j = 0; j < blocks; j++) {
      run = f[j] === 1 ? run + 1 : 0
      const tokens = (j + 1) * size
      if (tokens % align !== 0) continue
      // `need` is how many blocks before the edge the group wants, and fewer than that when the prefix is shorter than its window.
      if (run >= Math.min(need, j + 1)) best = tokens
    }
    return best
  }

  // Full attention first, the others in the order of the spec.
  const order: number[] = []
  groups.forEach((group, g) => {
    if (group.kind === 'full') order.push(g)
  })
  groups.forEach((group, g) => {
    if (group.kind !== 'full') order.push(g)
  })

  let hit = cap
  for (;;) {
    let now = hit
    for (const g of order) now = groupHit(g, now)
    if (now >= hit) break
    hit = now
  }
  // `hit` is what the last pass accepted whole, which is also where the loop stopped.
  const perGroup = groups.map((_, g) => groupHit(g, cap))
  return { hit, perGroup }
}

/**
 * The hit for `prompt` from a snapshot (GAMES.md §8, `hitLength`): `perGroup` by group id, and `hit`, the intersection. It reads the
 * cache of `state` and asks nothing of the manager, so the game can show a hit before the learner commits to an admit.
 */
export function kvHitLength(
  spec: KvSpec,
  state: KvState,
  prompt: readonly number[],
  adapter: number | null,
): { readonly perGroup: Readonly<Record<string, number>>; readonly hit: number } {
  const cached: Set<number>[] = spec.groups.map(() => new Set<number>())
  for (const entry of state.cache) cached[entry.group].add(entry.hash)
  const extra = kvExtraKey(adapter)
  const bySize = new Map<number, number[]>()
  const chains = spec.groups.map((group) => {
    let chain = bySize.get(group.blockTokens)
    if (chain === undefined) {
      chain = kvChain(prompt, divFloor(prompt.length, group.blockTokens), group.blockTokens, extra)
      bySize.set(group.blockTokens, chain)
    }
    return chain
  })
  const found = kvFindHit(spec, (group, hash) => cached[group].has(hash), chains, prompt.length - 1)
  const perGroup: Record<string, number> = {}
  spec.groups.forEach((group, g) => {
    perGroup[group.id] = found.perGroup[g]
  })
  return { perGroup, hit: found.hit }
}
