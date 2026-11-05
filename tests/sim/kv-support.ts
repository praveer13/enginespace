/*
 * Shared by the hybrid KV model's tests (tests/sim/kv-*.test.ts): the streams the property tests run, random specs and caches, and the
 * oracles that share no code with packages/sim/kv:
 *   - `vllmHit` is vLLM's own search for a prefix hit, ported line for line from the pinned source (the three managers'
 *     `find_longest_cache_hit` and the coordinator's loop), batching groups of one spec as vLLM does;
 *   - `bruteHit` tries every length from the longest down and asks each group the question of its rule;
 *   - `heldByWindow` counts the blocks that cover a window by listing the tokens in it.
 * A test that imports from here is checking the model against a second statement of the same rules.
 */
import { below, between, chance, pick, rngFor } from '../../packages/sim/core/rng'
import type { Rng } from '../../packages/sim/core/rng'
import { KV_PRESET_IDS, KV_PRESET_POOL, kvAdapterCatalog, kvAlignment, kvOps, kvPreset } from '../../packages/sim/kv'
import type { KvGroupSpec, KvOp, KvOpsAdapter, KvPresetId, KvSpec } from '../../packages/sim/kv'

/**
 * Seeds and operations per seed of the property tests: ARCHITECTURE §5.10's 200 seeds on a PR, and the tracker's 2,000 operations
 * [estimated]. The nightly job raises the seeds through ES_PROPERTY_SEEDS, as it does for every seeded property.
 */
function seedCount(): number {
  const raw = process.env.ES_PROPERTY_SEEDS
  if (raw === undefined || raw === '') return 200
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`ES_PROPERTY_SEEDS is a positive integer, got ${JSON.stringify(raw)}`)
  return n
}
export const SEEDS = seedCount()
export const OPS = 2000

// ---------------------------------------------------------------------------------------------------------------------------
// The streams of the property tests

export interface Stream {
  readonly seed: number
  readonly preset: KvPresetId
  readonly spec: KvSpec
  readonly adapters: readonly KvOpsAdapter[]
  readonly sessions: number
  readonly maxRunning: number
}

const POOL_SCALE = [50, 75, 100, 150] as const
const LOAD = [
  [4, 3],
  [6, 4],
  [8, 5],
] as const

/**
 * What seed `seed` of the property tests runs: a preset in turn, a pool from half to one and a half times its default, a load, and
 * now and then adapters (a third of the seeds), an engine-style slot table in place of pages (one seed in seven with adapters), or no
 * prefix caching (one in nineteen). The moduli are coprime to the preset's, so no preset is left out of any of them.
 */
export function streamFor(seed: number): Stream {
  const preset = KV_PRESET_IDS[seed % KV_PRESET_IDS.length]
  const rng = rngFor(seed, 'tests/kv/stream')
  const pool = Math.max(8, Math.round((KV_PRESET_POOL[preset] * pick(rng, POOL_SCALE)) / 100))
  const [sessions, maxRunning] = pick(rng, LOAD)
  const withAdapters = seed % 3 === 0
  const slots = withAdapters && seed % 7 === 0
  const spec = kvPreset(preset, pool, { prefixCaching: seed % 19 !== 5, ...(slots ? { adapterSlots: 2 } : {}) })
  const adapters = withAdapters ? kvAdapterCatalog(spec).map((a) => ({ id: a.id, pages: a.pages })) : []
  return { seed, preset, spec, adapters, sessions, maxRunning }
}

export function opsOf(s: Stream, n: number = OPS): readonly KvOp[] {
  return kvOps(s.seed, s.spec, n, { adapters: s.adapters, sessions: s.sessions, maxRunning: s.maxRunning })
}

// ---------------------------------------------------------------------------------------------------------------------------
// Random specs and caches, for the hit search

/** A spec of the given groups, which the hit search reads and nothing else validates. */
export function specOf(groups: readonly KvGroupSpec[]): KvSpec {
  return { poolPages: 64, pageBytes: 1, tokenBytes: 1, paddingLayers: 0, groups, prefixCaching: true }
}

export function randomGroups(rng: Rng): KvGroupSpec[] {
  const base = pick(rng, [4, 8, 16])
  const count = between(rng, 1, 5)
  const groups: KvGroupSpec[] = []
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, ['full', 'sliding', 'sliding', 'state'] as const)
    const blockTokens = base * pick(rng, [1, 1, 1, 2, 4])
    groups.push(
      kind === 'full'
        ? { id: `g${i}`, kind, layers: 1, blockTokens }
        : kind === 'sliding'
          ? { id: `g${i}`, kind, layers: 1, blockTokens, window: between(rng, 2, 6 * base) }
          : { id: `g${i}`, kind, layers: 1, blockTokens, statePages: between(rng, 1, 3) },
    )
  }
  // A twin of a group, so that the batching of groups of one spec is exercised.
  if (count > 1 && chance(rng, 400)) groups.push({ ...groups[below(rng, count)], id: `g${count}` })
  return groups
}

/** The hash chains of `tokens` for a spec's groups (one per group, by size), under the extra key `extra`. */
export type Chains = readonly (readonly number[])[]

/**
 * For each group, which of its blocks are cached: a prefix, a run, a thick scatter or a thin one. Groups that cache a prefix are what
 * a full group does, and a run is what a window leaves behind, and the scatters are what eviction leaves.
 */
export function randomCache(rng: Rng, groups: readonly KvGroupSpec[], chains: Chains): Set<string> {
  const cached = new Set<string>()
  groups.forEach((_, g) => {
    const blocks = chains[g].length
    const shape = below(rng, 5)
    const cut = between(rng, 0, blocks)
    const from = between(rng, 0, blocks)
    const to = between(rng, from, blocks)
    for (let j = 0; j < blocks; j++) {
      const on = shape === 0 ? j < cut : shape === 1 ? j >= from && j < to : shape === 2 ? chance(rng, 900) : shape === 3 ? chance(rng, 600) : chance(rng, 300)
      if (on) cached.add(`${g}:${chains[g][j]}`)
    }
  })
  return cached
}

// ---------------------------------------------------------------------------------------------------------------------------
// vLLM's search for a hit, ported

type Has = (group: number, hash: number) => boolean

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b)

/** `FullAttentionManager.find_longest_cache_hit`, without EAGLE and without fine-grained hashes: the hit in tokens. */
function fullFind(ids: number[], has: Has, chain: readonly number[], maxLength: number, size: number, align: number): number {
  let computed = 0
  for (let i = 0; i < Math.floor(maxLength / size); i++) {
    if (!ids.every((g) => has(g, chain[i]))) break
    computed++
  }
  let hit = computed * size
  hit -= hit % align
  return hit
}

/** `SlidingWindowManager.find_longest_cache_hit`: scans from the right for enough contiguous blocks, else keeps the run at the start. */
function slidingFind(ids: number[], has: Has, chain: readonly number[], maxLength: number, size: number, window: number, align: number): number {
  const needed = ceilDiv(window - 1, size)
  const maxBlocks = Math.floor(maxLength / size)
  let contiguous = 0
  let length = -1
  for (let i = maxBlocks - 1; i >= 0; i--) {
    if (ids.every((g) => has(g, chain[i]))) {
      if (contiguous === 0 && size !== align && ((i + 1) * size) % align !== 0) continue
      contiguous++
      if (contiguous >= needed) {
        length = i + contiguous
        break
      }
    } else contiguous = 0
  }
  if (length < 0) {
    length = contiguous
    while (size !== align && (length * size) % align !== 0) length--
  }
  return length * size
}

/** `MambaManager.find_longest_cache_hit` in the mode that hashes at the block size: the last cached block that lands on an alignment. */
function stateFind(ids: number[], has: Has, chain: readonly number[], maxLength: number, size: number, align: number): number {
  const maxBlocks = Math.floor(maxLength / size)
  for (let i = maxBlocks - 1; i >= 0; i--) {
    if (!ids.every((g) => has(g, chain[i]))) continue
    if (size !== align && ((i + 1) * size) % align !== 0) continue
    return (i + 1) * size
  }
  return 0
}

/**
 * `HybridKVCacheCoordinator.find_longest_cache_hit`: groups of one spec are looked up together, full attention goes first, the
 * full group's hit is found once and then only trimmed, and the pass repeats while any group shortens the length. With exactly one
 * full group and one other kind it stops after one pass.
 */
export function vllmHit(spec: KvSpec, has: Has, chains: Chains, maxCacheHitLength: number): number {
  const align = kvAlignment(spec)
  const batches: { first: number; ids: number[]; group: KvGroupSpec }[] = []
  spec.groups.forEach((group, g) => {
    const same = (b: { group: KvGroupSpec }) =>
      b.group.kind === group.kind && b.group.blockTokens === group.blockTokens && b.group.window === group.window && b.group.statePages === group.statePages
    const found = batches.find(same)
    if (found !== undefined) found.ids.push(g)
    else batches.push({ first: g, ids: [g], group })
  })
  // Put full attention first: a stable sort.
  const ordered = [...batches.filter((b) => b.group.kind === 'full'), ...batches.filter((b) => b.group.kind !== 'full')]
  const simple = ordered.length === 2 && ordered[0].group.kind === 'full'
  let hit = maxCacheHitLength
  const found = new Map<number, number>()
  for (;;) {
    let current = hit
    for (const b of ordered) {
      const done = found.get(b.first)
      if (b.group.kind === 'full' && done !== undefined) {
        current = Math.min(current, done)
        continue
      }
      const chain = chains[b.first]
      const size = b.group.blockTokens
      const now =
        b.group.kind === 'full'
          ? fullFind(b.ids, has, chain, current, size, align)
          : b.group.kind === 'sliding'
            ? slidingFind(b.ids, has, chain, current, size, b.group.window as number, align)
            : stateFind(b.ids, has, chain, current, size, align)
      current = now
      found.set(b.first, now)
    }
    if (current >= hit) break
    hit = current
    if (simple) break
  }
  return hit
}

/** The longest length, a multiple of the alignment and within `maxHit`, for which every group's blocks are cached. */
export function bruteHit(spec: KvSpec, has: Has, chains: Chains, maxHit: number): number {
  const align = kvAlignment(spec)
  for (let n = maxHit - (maxHit % align); n > 0; n -= align) {
    const every = spec.groups.every((group, g) => {
      const m = n / group.blockTokens
      const from = group.kind === 'full' ? 0 : Math.max(0, m - (group.kind === 'sliding' ? ceilDiv((group.window as number) - 1, group.blockTokens) : 1))
      for (let j = from; j < m; j++) if (!has(g, chains[g][j])) return false
      return true
    })
    if (every) return n
  }
  return 0
}

// ---------------------------------------------------------------------------------------------------------------------------
// Blocks by their tokens

/**
 * The blocks that a sliding group holds for a request of `length` tokens, found by listing the tokens: the next token reads itself and
 * the `window - 1` before it, and the group holds the blocks that those tokens (the ones already stored) sit in.
 */
export function heldByWindow(length: number, window: number, size: number): number {
  const blocks = new Set<number>()
  for (let t = Math.max(0, length - window + 1); t < length; t++) blocks.add(Math.floor(t / size))
  return blocks.size
}

// ---------------------------------------------------------------------------------------------------------------------------
// Wild streams

/**
 * Calls drawn without regard for what is running: any of 6 request ids, 3 adapter ids, prompts and appends from an alphabet of 2 or 3
 * tokens so that blocks repeat between requests (two requests then compute one block at once, which the model caches once), lengths
 * from 1 to 6 blocks, adapters of 1 to 8 pages, and a reset now and then. Most of it is refused; what is not is the strangest the model
 * is asked to do.
 */
export function wildOps(seed: number, spec: KvSpec, n: number): KvOp[] {
  const rng = rngFor(seed, 'tests/kv/wild')
  const size = spec.groups.reduce((most, g) => Math.max(most, g.blockTokens), 1)
  const alphabet = between(rng, 2, 3)
  const tokens = (count: number) => Array.from({ length: count }, () => below(rng, alphabet))
  const ops: KvOp[] = []
  for (let i = 0; i < n; i++) {
    const roll = below(rng, 100)
    if (roll < 30) {
      const adapter = chance(rng, 250) ? below(rng, 3) : undefined
      ops.push(adapter === undefined ? { op: 'admit', req: below(rng, 6), prompt: tokens(between(rng, 1, 6 * size)) } : { op: 'admit', req: below(rng, 6), prompt: tokens(between(rng, 1, 6 * size)), adapter })
    } else if (roll < 60) ops.push({ op: 'append', req: below(rng, 6), tokens: tokens(chance(rng, 100) ? between(rng, size, 3 * size) : between(rng, 1, 3)) })
    else if (roll < 80) ops.push({ op: 'finish', req: below(rng, 6) })
    else if (roll < 89) ops.push({ op: 'load-adapter', adapter: below(rng, 3), pages: between(rng, 1, 8) })
    else if (roll < 96) ops.push({ op: 'unload-adapter', adapter: below(rng, 3) })
    else ops.push({ op: 'reset' })
  }
  return ops
}
