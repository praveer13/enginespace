/*
 * The worked numbers of TR5a's lessons (W1-T25), computed from the hybrid KV model and from The Reach-In, so that a number a lesson prints is
 * one this file recomputes. `tests/content/tr5a-module.test.ts` holds each lesson's text to these functions, and when the model, the planner's
 * port or the game moves a number, the test names the lesson and the figure that went stale.
 *
 * Every scene is synthetic (D-012). The presets are the model's own (`packages/sim/kv/presets.ts`): the layer counts of `two-kinds` and the
 * window of its first example are the examples in vLLM's design document, and every byte count and the other windows are the model's and
 * [estimated]. A number is [derived] when it is arithmetic on a rule that a claim states, and [measured] when it is read off a run of the
 * model or of the game, on the day and at the commit that the lesson gives.
 *
 * Nothing here draws a random number. The nights of The Reach-In come from its seeds, and the policy that plays them is the house's.
 */
import { freeze, freshWork, playPolicy } from '../../packages/play/pool/engine'
import { inLevelBand } from '../../packages/play/pool/bands'
import { buildLevel } from '../../packages/play/pool/levels'
import { house } from '../../packages/play/pool/policy'
import { costOf, scoreOf, unservedOf } from '../../packages/play/pool/score'
import type { PoolLevel } from '../../packages/play/pool/types'
import { buildKvSpec, kvAdapterCatalog, kvAlignment, kvBlocksHeld, kvFindHit, kvPaddingWaste, kvPagesHeld, kvPreset, kvTableRule } from '../../packages/sim/kv'
import type { KvGroupSpec, KvSpec } from '../../packages/sim/kv'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: what each kind of group holds                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The design document's model: 10 full-attention and 20 sliding-window layers, 16-token blocks and a 32-token window, as three groups of 10 layers. */
export const TWO_KINDS: KvSpec = kvPreset('two-kinds')

export interface LengthRow {
  readonly tokens: number
  readonly full: number
  /** Pages of each sliding group (the two are alike). */
  readonly sliding: number
  readonly total: number
  /** The same three groups if every layer were full attention. */
  readonly allFull: number
}

/** Pages that the three groups of `two-kinds` hold for a request of `tokens` tokens. */
export function lengthRow(tokens: number, spec: KvSpec = TWO_KINDS): LengthRow {
  const per = spec.groups.map((g) => kvBlocksHeld(spec, g.id, tokens))
  const full = per[0]
  const sliding = per[1]
  if (per[1] !== per[2]) throw new Error('the two sliding groups of two-kinds are alike')
  return { tokens, full, sliding, total: kvPagesHeld(spec, tokens), allFull: spec.groups.length * full }
}

export const LENGTHS: readonly number[] = [112, 1024, 4096]

/** The share of pages the hybrid layout saves over an all-full one, in percent, to the nearest whole percent. */
export const savedPercent = (row: LengthRow): number => Math.round((100 * (row.allFull - row.total)) / row.allFull)

/** How many whole requests of `tokens` tokens a pool of `pages` pages holds, with the three groups of `two-kinds` and with three full-attention groups. */
export function requestsFit(pages: number, tokens: number): { readonly hybrid: number; readonly allFull: number } {
  const row = lengthRow(tokens)
  return { hybrid: Math.floor(pages / row.total), allFull: Math.floor(pages / row.allFull) }
}

export interface StateRow {
  readonly tokens: number
  readonly full: number
  readonly state: number
  readonly groups: number
  readonly total: number
  readonly allFull: number
}

/** The `state` preset: 8 attention layers and 24 recurrent ones, as one full group and three state groups, with 32-token blocks. */
export function stateRow(tokens = 4096): StateRow {
  const spec = kvPreset('state')
  const full = kvBlocksHeld(spec, 'full0', tokens)
  const state = kvBlocksHeld(spec, 'state0', tokens)
  return { tokens, full, state, groups: spec.groups.length, total: kvPagesHeld(spec, tokens), allFull: spec.groups.length * full }
}

/** The pages one sliding group of `two-kinds` holds at the given lengths: two at a block's end, and three at most other lengths. */
export const slidingAt = (tokens: number): number => kvBlocksHeld(TWO_KINDS, 'sw0', tokens)

/**
 * The figure of lesson 1: the block tables of the design document's request, 112 tokens in 7 blocks. For each group, the blocks (0 to 6) that
 * its rule keeps, from `kvTableRule`, and the page ids the document hands out (0 to 6 to the full group, 7 and 8 to the first sliding group,
 * 9 and 10 to the second).
 */
export function blockTables(tokens = 112): { readonly id: string; readonly held: readonly boolean[]; readonly pages: readonly number[] }[] {
  let next = 0
  return TWO_KINDS.groups.map((g) => {
    const rule = kvTableRule(g, tokens)
    const held = Array.from({ length: rule.blocks }, (_, block) => block >= rule.skip)
    const pages: number[] = []
    for (const keeps of held) if (keeps) pages.push(next++)
    return { id: g.id, held, pages }
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: how the layers become groups of one page size                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Layout {
  readonly full: number
  readonly sliding: number
  /** Layers in every group, which is the page's layer count. */
  readonly groupSize: number
  readonly groups: number
  /** Layers in the groups that no real layer fills. */
  readonly padding: number
  /** Layer slots in all the groups: groups × group size. */
  readonly slots: number
  /** The padding as a share of the slots, in permille (the model's `kvPaddingWaste`), to the nearest. */
  readonly wastePermille: number
}

/** A layout by arithmetic, for a group size that is given: ⌈layers ÷ size⌉ groups of each type, and what is left over is padding. */
export function layoutAt(full: number, sliding: number, groupSize: number): Omit<Layout, 'wastePermille'> {
  const groups = Math.ceil(full / groupSize) + Math.ceil(sliding / groupSize)
  const slots = groups * groupSize
  return { full, sliding, groupSize, groups, padding: slots - full - sliding, slots }
}

/** A model of `full` full-attention layers and `sliding` sliding-window layers, as the planner's port (`buildKvSpec`) groups it. */
export function layoutOf(full: number, sliding: number): Layout {
  const spec = buildKvSpec({ tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: full }, { kind: 'sliding', layers: sliding, window: 64 }] }, 100)
  const size = spec.groups[0].layers + (spec.groups[0].padLayers ?? 0)
  return {
    full,
    sliding,
    groupSize: size,
    groups: spec.groups.length,
    padding: spec.paddingLayers,
    slots: spec.groups.length * size,
    wastePermille: kvPaddingWaste(spec).permille,
  }
}

/** The planner's rule in words: the smallest layer count, or the largest when that is under 1.5 times the smallest. */
export function plannerGroupSize(full: number, sliding: number): number {
  const fewest = Math.min(full, sliding)
  const most = Math.max(full, sliding)
  return 2 * most < 3 * fewest ? most : fewest
}

/** The share of a number of padding layers in a number of slots, in permille to the nearest. */
export const permilleOf = (part: number, whole: number): number => Math.round((1000 * part) / whole)

/** vLLM's warning divides the padding by the real layers of the type that is padded (vllm.hybrid-kv.padding-warning), in hundredths of a percent. */
export const warningHundredths = (padding: number, layers: number): number => Math.round((10000 * padding) / layers)

/** The models of the lesson's table, as [full, sliding]: gpt-oss-20b with its drafter, Gemma-3-27b, and the document's 20 + 30 case. */
export const MODELS: readonly (readonly [number, number])[] = [
  [13, 12],
  [10, 52],
  [20, 30],
]

export interface Inflation {
  readonly baseTokens: number
  readonly blockTokens: number
  readonly pageBytes: number
}

/** The `state` preset's attention block: grown from 16 tokens in multiples of 16 until one layer's block holds a layer's 32,768-byte state. */
export function inflation(): Inflation {
  const spec = kvPreset('state')
  return { baseTokens: 16, blockTokens: spec.groups[0].blockTokens, pageBytes: spec.pageBytes }
}

/** The number of KV cache groups of a model, from the planner's port. */
export const groupCount = (full: number, sliding: number): number => layoutOf(full, sliding).groups

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: the hit that every group accepts                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The blocks that each of the three groups of `two-kinds` holds in the cache: a run or a set of block indices. */
export interface Cached {
  readonly full: readonly number[]
  readonly sw0: readonly number[]
  readonly sw1: readonly number[]
}

export const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/** Window 32 and block 16: a sliding group reads the ⌈31 ÷ 16⌉ = 2 blocks before the edge of a hit. */
const NEED = 2
/** A prompt of 176 tokens has 11 blocks, and a hit never reaches the last token: at most 10 whole blocks, 160 tokens. */
export const MAX_BLOCKS = 10
export const BLOCK = 16

/** The edges (counted in whole blocks, from 1 to `MAX_BLOCKS`) that each group accepts, from the rule in words. */
export function acceptedEdges(cached: Cached): { readonly full: number[]; readonly sw0: number[]; readonly sw1: number[] } {
  const has = (set: readonly number[]) => (block: number) => set.includes(block)
  const edges = (check: (m: number) => boolean) => range(1, MAX_BLOCKS).filter(check)
  const full = has(cached.full)
  const window = (set: readonly number[]) => (m: number) => (m >= NEED ? range(m - NEED, m - 1) : range(0, m - 1)).every(has(set))
  return {
    full: edges((m) => range(0, m - 1).every(full)),
    sw0: edges(window(cached.sw0)),
    sw1: edges(window(cached.sw1)),
  }
}

export interface HitTrace {
  /** The edge in whole blocks and in tokens, after each pass of the loop. */
  readonly passes: readonly number[]
  readonly blocks: number
  readonly tokens: number
  /** What a group alone would serve (its longest accepted edge), in blocks. */
  readonly longest: { readonly full: number; readonly sw0: number; readonly sw1: number }
}

/** The loop of the engine in words: ask each group in turn for its longest edge not above the candidate, and go round again while any of them lowered it. */
export function hitLoop(cached: Cached): HitTrace {
  const accepted = acceptedEdges(cached)
  const order = [accepted.full, accepted.sw0, accepted.sw1]
  const longestBelow = (edges: readonly number[], cap: number): number => edges.filter((m) => m <= cap).reduce((a, b) => Math.max(a, b), 0)
  let candidate = MAX_BLOCKS
  const passes: number[] = []
  for (;;) {
    const before = candidate
    for (const edges of order) candidate = longestBelow(edges, candidate)
    passes.push(candidate)
    if (candidate >= before) break
  }
  const most = (edges: readonly number[]) => edges.reduce((a, b) => Math.max(a, b), 0)
  return { passes, blocks: candidate, tokens: candidate * BLOCK, longest: { full: most(accepted.full), sw0: most(accepted.sw0), sw1: most(accepted.sw1) } }
}

/** The same hit from the model's own `kvFindHit`, for a prompt of 176 tokens, so the loop above is checked against the engine's port. */
export function modelHit(cached: Cached): number {
  const sets = [new Set(cached.full), new Set(cached.sw0), new Set(cached.sw1)]
  const chain = Array.from({ length: 11 }, (_, i) => 1000 + i)
  return kvFindHit(TWO_KINDS, (group, hash) => sets[group].has(hash - 1000), [chain, chain, chain], 175).hit
}

/** Lesson 3's prediction and its follow-up: the full group holds blocks 0 to 9; one sliding group lost the newest block, or lost a block in the middle. */
export const HIT_A: Cached = { full: range(0, 9), sw0: range(6, 8), sw1: range(7, 9) }
export const HIT_B: Cached = { full: range(0, 9), sw0: [6, 7, 9], sw1: range(7, 9) }

/** The union of the groups' longest hits, the bug of the lab's bestiary, and the shortest of them, the other tempting answer. */
export function wrongHits(cached: Cached): { readonly union: number; readonly shortest: number } {
  const t = hitLoop(cached).longest
  return { union: Math.max(t.full, t.sw0, t.sw1) * BLOCK, shortest: Math.min(t.full, t.sw0, t.sw1) * BLOCK }
}

/**
 * Lesson 3's second prediction, on the `state` model (a full group and three state groups, 32-token blocks): the full group holds blocks 0 to 7,
 * and each state group holds only the states at the edges of blocks 2 and 5. A state group accepts an edge when the one block before it is cached,
 * so it accepts the edges 3 and 6, and the hit is the largest edge that the full group accepts as well.
 */
export function stateHit(): { readonly edges: readonly number[]; readonly blocks: number; readonly tokens: number; readonly model: number } {
  const spec = kvPreset('state')
  const block = spec.groups[0].blockTokens
  const cached = spec.groups.map((g) => (g.kind === 'full' ? range(0, 7) : [2, 5]))
  const maxBlocks = Math.floor(329 / block)
  const accepts = (kind: string, set: readonly number[], m: number) => (kind === 'full' ? range(0, m - 1).every((b) => set.includes(b)) : set.includes(m - 1))
  const edges = range(1, maxBlocks).filter((m) => spec.groups.every((g, i) => accepts(g.kind, cached[i], m)))
  const blocks = edges.reduce((a, b) => Math.max(a, b), 0)
  const sets = cached.map((set) => new Set(set))
  const chain = Array.from({ length: 11 }, (_, i) => 1000 + i)
  const model = kvFindHit(spec, (group, hash) => sets[group].has(hash - 1000), spec.groups.map(() => chain), 329).hit
  return { edges, blocks, tokens: blocks * block, model }
}

/** The alignment of a hit: the least common multiple of the groups' block sizes (16 here, and 32 in the `state` model). */
export const alignmentOf = (id: 'two-kinds' | 'state'): number => kvAlignment(kvPreset(id))

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: adapters as pages, and as slots                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface AdapterRow {
  readonly rank: number
  readonly bytes: number
  readonly pages: number
  /** Bytes of the last page that the adapter leaves empty, and their share of the pages it holds, in permille. */
  readonly idleBytes: number
  readonly idlePermille: number
}

/** The ranks of the lesson's table: the three the model's catalog offers by default. */
export const RANKS: readonly number[] = [8, 16, 64]

/** Bytes and pages of adapters of the given ranks, for the pages of `two-kinds` (163,840 bytes). */
export function adapterRows(ranks: readonly number[] = RANKS): AdapterRow[] {
  return kvAdapterCatalog(TWO_KINDS, ranks).map((a) => {
    const idleBytes = a.pages * TWO_KINDS.pageBytes - a.bytes
    return { rank: a.rank, bytes: a.bytes, pages: a.pages, idleBytes, idlePermille: Math.round((1000 * idleBytes) / (a.pages * TWO_KINDS.pageBytes)) }
  })
}

/** The share of a slot sized for `slotRank` that an adapter of `rank` leaves empty, in percent: the slot's width is the largest rank (vllm.lora.stacked-max-rank). */
export const slotIdlePercent = (rank: number, slotRank: number): number => (100 * (slotRank - rank)) / slotRank

export interface NightRow {
  /** Pans left in the reach-in for tickets. */
  readonly pans: number
  readonly recomputed: number
  readonly stalls: number
  readonly cost: number
  readonly unserved: number
}

export interface ShelfDemo {
  readonly seed: number
  readonly kits: readonly { readonly rank: number; readonly pages: number }[]
  readonly tickets: number
  readonly stallWeight: number
  readonly pages: NightRow
  readonly oneSlot: NightRow
  readonly twoSlots: NightRow
  /** Two slots, each as big as the largest kit, taken out of the reach-in first. */
  readonly twoSlotsPaid: NightRow
}

function night(level: PoolLevel): NightRow {
  const w = playPolicy(freshWork(level, true), house)
  const s = scoreOf(freeze(w))
  return { pans: level.spec.poolPages, recomputed: s.recomputedTokens, stalls: s.adapterStallSteps, cost: costOf(w.counts, level), unserved: unservedOf(w) }
}

/**
 * Lesson 4's table: The Reach-In's `adapters` level on one seed, played by the house in four ways. The kits go into the pool as pans, or they go
 * on a shelf of fixed slots outside it (`adapterSlots`, as the debrief's baseline does), with one slot or with two, and with the two slots' pans
 * taken out of the reach-in first (a slot is as wide as the largest rank it may hold). The price is the tokens prepped again plus the stall
 * weight for each step a ticket waited for a kit.
 */
export function shelfDemo(seed = 0): ShelfDemo {
  const level = buildLevel('adapters', seed)
  const biggest = Math.max(...level.kits.map((kit) => kit.pages))
  const on = (slots: number, paid: number): PoolLevel => ({ ...level, spec: { ...level.spec, poolPages: level.spec.poolPages - paid, adapterSlots: slots } })
  return {
    seed,
    kits: level.kits.map((kit) => ({ rank: kit.rank, pages: kit.pages })),
    tickets: level.reqs.length,
    stallWeight: level.stallWeight,
    pages: night(level),
    oneSlot: night(on(1, 0)),
    twoSlots: night(on(2, 0)),
    twoSlotsPaid: night(on(2, 2 * biggest)),
  }
}

/** The first `count` seeds from 0 that the `adapters` level's band accepts. */
export function bandedSeeds(count: number): number[] {
  const seeds: number[] = []
  for (let seed = 0; seeds.length < count; seed++) if (inLevelBand('adapters', seed)) seeds.push(seed)
  return seeds
}

export interface ShelfSweep {
  readonly seeds: readonly number[]
  /** On how many seeds each shelf costs less than pages, and what the prices of each way add up to over the seeds. */
  readonly oneSlotCheaper: number
  readonly twoSlotsCheaper: number
  readonly twoSlotsPaidCheaper: number
  readonly total: { readonly pages: number; readonly oneSlot: number; readonly twoSlots: number; readonly twoSlotsPaid: number }
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** The same four ways on the first eight banded seeds of the level. */
export function shelfSweep(count = 8): ShelfSweep {
  const seeds = bandedSeeds(count)
  const demos = seeds.map((seed) => shelfDemo(seed))
  const cheaper = (pick: (d: ShelfDemo) => NightRow) => demos.filter((d) => pick(d).cost < d.pages.cost).length
  const total = (pick: (d: ShelfDemo) => NightRow) => sum(demos.map((d) => pick(d).cost))
  return {
    seeds,
    oneSlotCheaper: cheaper((d) => d.oneSlot),
    twoSlotsCheaper: cheaper((d) => d.twoSlots),
    twoSlotsPaidCheaper: cheaper((d) => d.twoSlotsPaid),
    total: { pages: total((d) => d.pages), oneSlot: total((d) => d.oneSlot), twoSlots: total((d) => d.twoSlots), twoSlotsPaid: total((d) => d.twoSlotsPaid) },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The groups of a spec, for the tests that need them by kind. */
export const groupsOf = (spec: KvSpec, kind: KvGroupSpec['kind']): readonly KvGroupSpec[] => spec.groups.filter((g) => g.kind === kind)

/**
 * The reference of each prediction of TR5a's lessons, from the numbers its prompt gives and the model's own functions. Nothing is stored in a
 * lesson (A§1, I3). The lesson's prediction box (W1b-T02) reads its answer from the run of the game block that follows the prediction, where
 * packages/play/predictions has a reading, and tests/play/predictions.test.ts holds each reading to the figure here; a prediction with no
 * reading waits for W2-T43, and its figure here is what that task starts from.
 */
export const PREDICTIONS: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = {
  'tr5a.l1.p1': { unit: 'pages', reference: () => kvPagesHeld(TWO_KINDS, 4096) },
  'tr5a.l2.p1': { unit: 'groups', reference: () => groupCount(13, 12) },
  'tr5a.l2.p2': { unit: 'tokens', reference: () => inflation().blockTokens },
  'tr5a.l3.p1': { unit: 'tokens', reference: () => hitLoop(HIT_A).tokens },
  'tr5a.l3.p2': { unit: 'tokens', reference: () => stateHit().tokens },
  'tr5a.l4.p1': { unit: 'pages', reference: () => adapterRows([16])[0].pages },
  'tr5a.l4.p2': { unit: 'percent', reference: () => slotIdlePercent(8, 64) },
}
