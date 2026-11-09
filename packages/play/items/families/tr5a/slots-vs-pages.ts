/**
 * `tr5a.slots-vs-pages`: adapter slots, as the pinned engines use them, against adapters paged in one pool, and when slots are enough (TR5a; KC
 * `tr5a.slots-vs-pages`). It is the last item of TR5a's fourth lesson's exit ticket, the one on slots against pages, and the family that
 * answers the KC the lesson names and no other artifact carries. At the pins neither engine pages adapters in the KV pool (D-042):
 *
 *   vLLM v0.33.0   keeps `max_loras` slots (default 1, claims vllm.lora.max-loras-default, vllm.lora.slot-count), each a stacked tensor
 *                  `max_lora_rank` wide whatever the adapter that sits in it (default 16; claims vllm.lora.max-rank-default,
 *                  vllm.lora.stacked-max-rank, vllm.lora.smaller-adapter-in-slot), built when the LoRA manager is built and not when an adapter arrives
 *                  (claims vllm.lora.layer-built-with-slots, vllm.lora.slots-built-at-init). Adapters beyond the slots wait in a CPU cache, and an LRU over
 *                  the slots evicts the oldest active adapter (claims vllm.lora.cpu-cache, vllm.lora.lru-slots). The scheduler skips a waiting
 *                  request whose adapter is not already scheduled once the distinct adapters of the batch reach `max_loras`, so a cap on adapters is
 *                  part of admission (claim vllm.lora.admission-cap). S-LoRA is cited only for how a sharded layer slices its weights, and an
 *                  adapter is not a page of the KV pool (claim vllm.lora.s-lora-scope).
 *   SGLang v0.5.23 keeps `max_loras_per_batch` slots (default 8, claim sglang.lora.max-loras-per-batch) in a `LoRAMemoryPool` that is not a page
 *                  pool shared with the KV cache (claim sglang.lora.pool), allocates every buffer at the pool's `max_lora_rank` (claims
 *                  sglang.lora.slot-shape, sglang.lora.buffers-max-rank) and refuses an adapter of a higher rank (claim sglang.lora.rank-cap).
 *
 * A slot is memory that is paid for before the first request and that the KV pool never has (the lesson's fourth row). A pool of pages pays for what is
 * loaded and gives it back (claims kv.slora.static-pool, kv.slora.non-contiguous). So slots are enough when the distinct adapters of a batch are few, near
 * each other in rank, and known in advance; pages pay when the adapters are many, their ranks differ, and the load moves.
 *
 * What the variants ask:
 *   slot-idle   the share of a slot that an adapter of a lower rank leaves unused, in percent; at level 3 the share of all of a server's slots that
 *               its adapters leave unused (numeric; levels 0 to 3);
 *   slots-take  the pages that are left in the pool once the slots a server reserves are taken out of it, before the first request; at level 3 the
 *               sizes come from shapes (numeric; levels 0 to 3);
 *   cap         the requests that vLLM's scheduler holds back in one pass over a queue, for `max_loras` slots (numeric; levels 1 and 2);
 *   enough      of four deployments, the one that slots serve well: few adapters in a batch, near the slots' rank, and known in advance. The other
 *               three each fail one of those, drawn answer first so that each is the key on one seed in four (choice; levels 0 to 2);
 *   pinned      what the pinned engine does with an adapter: where it sits, how wide its slot is, and what the scheduler does with a request over
 *               the cap, drawn answer first (choice; levels 0 to 2).
 * At level 0 a worked example with other numbers comes first, and at level 1 the words of the first step.
 *
 * tests/play/items-tr5a-slots-vs-pages.test.ts holds the arithmetic to the sim (`kvAdapterPages`, and the reference manager loading a slot's pages
 * out of a pool) and to the lesson's table (The Reach-In's `adapters` level: 160 pages, 26 for the widest adapter, 108 left), the cap to a second
 * statement of the same rule, and every engine fact to the claims above. The scene is synthetic and every number in it is [estimated]: the lesson's
 * rank-8 adapter in a slot sized for rank 64 can come up among the draws of `slot-idle`.
 */
import { below, divFloor, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import {
  ADAPTED_LAYERS,
  adapterPages,
  EXACT,
  GROUP_LAYERS,
  HIDDEN,
  oneOf,
  pageBytes,
  pagesOf,
  percentOf,
  PROJECTIONS,
  TOKEN_BYTES,
  unitBytes,
  workedPart,
} from './kit'
import type { AdapterShape, PageShape } from './kit'

const FAMILY = 'tr5a.slots-vs-pages'
const VERSION = 1
const KC = 'tr5a.slots-vs-pages'

type VariantId = 'slot-idle' | 'slots-take' | 'cap' | 'enough' | 'pinned'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'slot-idle', title: 'The share of a slot that stays unused', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'slots-take', title: 'The pages that slots take out of the pool', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'cap', title: 'The requests the adapter cap holds back', kcs: [KC], levels: [1, 2] },
  { id: 'enough', title: 'The deployment that slots serve well', kcs: [KC], levels: [0, 1, 2] },
  { id: 'pinned', title: 'What the pinned engines do with an adapter', kcs: [KC], levels: [0, 1, 2] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit?: string): NumPart => num(value, { tag: 'synthetic', ...(unit === undefined ? {} : { unit }) })
const derivedBytes = (value: number): NumPart => num(value, { unit: 'bytes', tag: 'derived' })
const pagesResult = (value: number): NumPart => num(value, { unit: 'pages', tag: 'derived' })
const percent = (value: number): NumPart => num(value, { unit: '%', tag: 'derived', digits: 1 })
const slotsOf = (value: number, tag: 'synthetic' | 'derived' = 'synthetic'): NumPart => num(value, { unit: value === 1 ? 'slot' : 'slots', tag })
const adaptersOf = (value: number): NumPart => num(value, { unit: value === 1 ? 'adapter' : 'adapters', tag: 'synthetic' })
const requestsResult = (value: number): NumPart => num(value, { unit: 'requests', tag: 'derived' })

/* ------------------------------------------------------------------------------------------------------------------ */
/* slot-idle                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ranks a slot may be sized for. The adapters' ranks are whole steps of four below it. */
const SLOT_RANKS = [32, 40, 48, 64, 80, 96, 128, 192, 256] as const

interface Idle {
  readonly variant: 'slot-idle'
  readonly slotRank: number
  /** The ranks of the adapters in the slots: one at levels 0 to 2, one for each slot at level 3. */
  readonly ranks: readonly number[]
}

/** The share of the slots' width that the adapters leave unused: the width of all the slots less what the adapters fill, over the width. */
export function idleShare(slotRank: number, ranks: readonly number[]): number {
  const width = slotRank * ranks.length
  return percentOf(width - ranks.reduce((sum, rank) => sum + rank, 0), width)
}

function drawIdle(level: Level, seed: Seed, purpose: string): Idle {
  const rng = itemRng(FAMILY, 'slot-idle', level, seed, purpose)
  const slotRank = pick(rng, SLOT_RANKS)
  const slots = level === 3 ? 2 + below(rng, 3) : 1
  return { variant: 'slot-idle', slotRank, ranks: Array.from({ length: slots }, () => 4 * (1 + below(rng, slotRank / 4 - 1))) }
}

function idleSteps(s: Idle): Step[] {
  const width = s.slotRank * s.ranks.length
  const filled = s.ranks.reduce((sum, rank) => sum + rank, 0)
  const key = idleShare(s.slotRank, s.ranks)
  if (s.ranks.length === 1) {
    return [
      { text: rich('Every slot is built for the largest rank the server takes, whatever adapter sits in it, so this slot is as wide as rank ', given(s.slotRank), '.') },
      { text: rich('The adapter fills rank ', given(s.ranks[0]), ' of it and the rest stays zero: ', given(s.slotRank), ' − ', given(s.ranks[0]), ' = ', num(s.slotRank - s.ranks[0], { tag: 'derived' }), '.') },
      { text: rich('The unused share is ', num(s.slotRank - s.ranks[0], { tag: 'derived' }), ' ÷ ', given(s.slotRank), ' = ', percent(key), '.'), result: percent(key) },
    ]
  }
  return [
    { text: rich('Every slot is built for the largest rank, ', given(s.slotRank), ', so the ', slotsOf(s.ranks.length), ' are ', given(s.slotRank), ' × ', given(s.ranks.length), ' = ', num(width, { tag: 'derived' }), ' wide in all.') },
    { text: rich('The adapters fill ', code(s.ranks.join(' + ')), ' = ', num(filled, { tag: 'derived' }), ' of it.') },
    { text: rich('The unused share is (', num(width, { tag: 'derived' }), ' − ', num(filled, { tag: 'derived' }), ') ÷ ', num(width, { tag: 'derived' }), ' = ', percent(key), '.'), result: percent(key) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* slots-take                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Take {
  readonly variant: 'slots-take'
  readonly slots: number
  readonly slotRank: number
  readonly unit: number
  readonly page: number
  /** Pages in the pool before the slots are reserved. */
  readonly pool: number
  /** Level 3: the shapes the two sizes come from. */
  readonly adapter: AdapterShape | null
  readonly layout: PageShape | null
}

/** The pages that one slot costs: an adapter of the slot's rank, in pages. */
export const slotPages = (s: Pick<Take, 'slotRank' | 'unit' | 'page'>): number => adapterPages(s.slotRank, s.unit, s.page)

const RANKS_FOR_SLOTS = [16, 24, 32, 48, 64, 96, 128] as const

function drawTake(level: Level, seed: Seed, purpose: string): Take {
  const rng = itemRng(FAMILY, 'slots-take', level, seed, purpose)
  const adapter: AdapterShape = { hidden: pick(rng, HIDDEN), layers: pick(rng, ADAPTED_LAYERS), projections: pick(rng, PROJECTIONS), weightBytes: 2 }
  const layout: PageShape = { layers: pick(rng, GROUP_LAYERS), block: 16, tokenBytes: pick(rng, TOKEN_BYTES) }
  const slots = 1 + below(rng, 4)
  const slotRank = pick(rng, RANKS_FOR_SLOTS)
  const unit = unitBytes(adapter)
  const page = pageBytes(layout)
  const taken = slots * adapterPages(slotRank, unit, page)
  return {
    variant: 'slots-take',
    slots,
    slotRank,
    unit,
    page,
    pool: taken + 20 + below(rng, 200),
    adapter: level === 3 ? adapter : null,
    layout: level === 3 ? layout : null,
  }
}

const takeKey = (s: Take): number => s.pool - s.slots * slotPages(s)

function takeShapeSteps(s: Take): Step[] {
  if (s.adapter === null || s.layout === null) return []
  const a = s.adapter
  const l = s.layout
  return [
    {
      text: rich(
        'An adapter has a down matrix and an up matrix for each projection of each layer it adapts, so each unit of rank weighs twice ',
        given(a.hidden, 'values'),
        ' × ',
        given(a.projections, 'projections'),
        ' × ',
        given(a.layers, 'layers'),
        ' × ',
        given(a.weightBytes, 'bytes'),
        ' = ',
        derivedBytes(s.unit),
        '.',
      ),
      result: derivedBytes(s.unit),
    },
    { text: rich('A page is the block of a group: ', given(l.layers, 'layers'), ' × ', given(l.block, 'tokens'), ' × ', given(l.tokenBytes, 'bytes'), ' = ', derivedBytes(s.page), '.'), result: derivedBytes(s.page) },
  ]
}

function takeSteps(s: Take): Step[] {
  const each = slotPages(s)
  const total = s.slots * each
  return [
    ...takeShapeSteps(s),
    { text: rich('A slot is as wide as an adapter of the largest rank, ', given(s.slotRank), ', so it weighs ', given(s.slotRank), ' × ', derivedBytes(s.unit), ' = ', derivedBytes(s.slotRank * s.unit), '.'), result: derivedBytes(s.slotRank * s.unit) },
    { text: rich('That is ', derivedBytes(s.slotRank * s.unit), ' ÷ ', derivedBytes(s.page), ' rounded up = ', pagesOf(each), ' for each slot, and the slots are taken out of the pool before the first request.'), result: pagesOf(each) },
    { text: rich(slotsOf(s.slots), ' take ', slotsOf(s.slots), ' × ', pagesOf(each), ' = ', pagesOf(total), ', which leaves ', given(s.pool, 'pages'), ' − ', pagesOf(total), ' = ', pagesResult(takeKey(s)), '.'), result: pagesResult(takeKey(s)) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* cap                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Cap {
  readonly variant: 'cap'
  readonly slots: number
  /** The adapter of each waiting request, in the order they wait: one letter each. */
  readonly queue: string
}

/** What the scheduler does with each request of the queue, in order: let in, or held back (claim vllm.lora.admission-cap). */
export function capPass(slots: number, queue: string): { readonly held: boolean[]; readonly batch: string[] } {
  const batch: string[] = []
  const held: boolean[] = []
  for (const adapter of queue) {
    const inBatch = batch.includes(adapter)
    if (inBatch) held.push(false)
    else if (batch.length < slots) {
      batch.push(adapter)
      held.push(false)
    } else held.push(true)
  }
  return { held, batch }
}

export const heldBack = (s: Cap): number => capPass(s.slots, s.queue).held.filter(Boolean).length

const distinctOf = (queue: string): number => new Set(queue).size

/** `total` split over `parts` counts of at least one each, the rest dealt one at a time to parts that the stream picks. */
function spread(rng: Rng, total: number, parts: number): number[] {
  const counts = Array.from({ length: parts }, () => 1)
  for (let left = total - parts; left > 0; left -= 1) counts[below(rng, parts)] += 1
  return counts
}

function drawCap(level: Level, seed: Seed, purpose: string): Cap {
  const rng = itemRng(FAMILY, 'cap', level, seed, purpose)
  const slots = 1 + below(rng, 4)
  const extras = 1 + below(rng, 3)
  // The answer is drawn first: the requests held back, anywhere from two to twelve, and so a plain count of them is never the likeliest.
  const held = Math.max(2, extras) + below(rng, 13 - Math.max(2, extras))
  const admitted = slots + 1 + below(rng, 8)
  const names = shuffle(rng, [...'abcdefghi'])
  const batch = names.slice(0, slots)
  const outside = names.slice(slots, slots + extras)
  const batchCounts = spread(rng, admitted, slots)
  const outsideCounts = spread(rng, held, extras)
  // The first request of each of the batch's adapters comes before any request of the others, so those adapters are the ones in the batch; some of
  // their later requests follow at once, and the rest are mixed in with the held ones.
  const rest: string[] = []
  const head: string[] = []
  batch.forEach((adapter, at) => {
    head.push(adapter)
    let more = batchCounts[at] - 1
    if (more > 0 && below(rng, 3) === 0) {
      head.push(adapter)
      more -= 1
    }
    for (let k = 0; k < more; k += 1) rest.push(adapter)
  })
  outside.forEach((adapter, at) => {
    for (let k = 0; k < outsideCounts[at]; k += 1) rest.push(adapter)
  })
  return { variant: 'cap', slots, queue: [...head, ...shuffle(rng, rest)].join('') }
}

function capSteps(s: Cap): Step[] {
  const { held, batch } = capPass(s.slots, s.queue)
  const key = held.filter(Boolean).length
  const walk = [...s.queue].map((adapter, at) => `${adapter} ${held[at] ? 'held' : 'in'}`).join(', ')
  return [
    { text: rich('The scheduler takes the requests in order. A request goes in when its adapter is in the batch already, or when the batch has fewer than ', adaptersOf(s.slots), '. Otherwise it is skipped and waits.') },
    { text: rich('Going down the queue: ', code(walk), '. The batch ends with the adapters ', code(batch.join(', ')), '.') },
    { text: rich('The requests held back number ', requestsResult(key), '.'), result: requestsResult(key) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* enough                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The ways a deployment can fail to suit slots, one for each of the conditions of the lesson, and the one that suits them. */
const KINDS = ['suits', 'too-many', 'rank-spread', 'unknown'] as const
type DeploymentKind = (typeof KINDS)[number]

interface Deployment {
  readonly kind: DeploymentKind
  readonly slots: number
  readonly slotRank: number
  /** Ranks of the adapters in use at once, one each. */
  readonly ranks: readonly number[]
  /** The rank of an adapter that will arrive and that is wider than the slots, or 0 when none will. */
  readonly arriving: number
}

interface Enough {
  readonly variant: 'enough'
  readonly deployments: readonly Deployment[]
  /** The index of the one that suits slots. */
  readonly key: number
}

const near = (rng: Rng, slotRank: number, count: number): number[] => {
  // Within a quarter of the slot's rank, in steps of four.
  const lowest = Math.ceil((slotRank * 3) / 16) * 4
  const steps = (slotRank - lowest) / 4
  return Array.from({ length: count }, () => lowest + 4 * below(rng, steps + 1))
}

function drawDeployment(rng: Rng, kind: DeploymentKind): Deployment {
  const slotRank = pick(rng, [32, 48, 64, 96, 128])
  const slots = 2 + below(rng, 3)
  switch (kind) {
    case 'suits':
      return { kind, slots, slotRank, ranks: near(rng, slotRank, slots), arriving: 0 }
    case 'too-many':
      return { kind, slots, slotRank, ranks: near(rng, slotRank, slots + 1 + below(rng, 3)), arriving: 0 }
    case 'rank-spread': {
      const small = Array.from({ length: slots }, () => 4 * (1 + below(rng, Math.max(1, Math.floor(slotRank / 16)))))
      return { kind, slots, slotRank, ranks: small, arriving: 0 }
    }
    case 'unknown':
      return { kind, slots, slotRank, ranks: near(rng, slotRank, slots), arriving: 2 * slotRank }
  }
}

function drawEnough(level: Level, seed: Seed, purpose: string): Enough {
  const rng = itemRng(FAMILY, 'enough', level, seed, purpose)
  const key = below(rng, 4)
  // The others are the three failures, in an order that the seed gives.
  const failures = shuffle(rng, ['too-many', 'rank-spread', 'unknown'] as const)
  const deployments: Deployment[] = []
  let next = 0
  for (let at = 0; at < 4; at += 1) deployments.push(drawDeployment(rng, at === key ? 'suits' : failures[next++]))
  return { variant: 'enough', deployments, key }
}

/** The idle share of the slots in use, and the condition a deployment breaks, by the rules of the lesson. */
export function judge(d: Deployment): { readonly idle: number; readonly fits: boolean; readonly narrow: boolean; readonly known: boolean; readonly suits: boolean } {
  const used = Math.min(d.slots, d.ranks.length)
  const idle = percentOf(used * d.slotRank - d.ranks.slice(0, used).reduce((sum, rank) => sum + rank, 0), used * d.slotRank)
  const fits = d.ranks.length <= d.slots
  const narrow = idle <= 25
  const known = d.arriving === 0
  return { idle, fits, narrow, known, suits: fits && narrow && known }
}

const LETTERS = ['a', 'b', 'c', 'd'] as const

function deploymentText(d: Deployment): Rich {
  return rich(
    slotsOf(d.slots),
    ' sized for rank ',
    given(d.slotRank),
    ' serve ',
    adaptersOf(d.ranks.length),
    ' at once, of ranks ',
    code(d.ranks.join(', ')),
    '. ',
    ...(d.arriving === 0 ? rich('No adapter is added or taken away during the year.') : rich('More arrive through the year, some of rank ', given(d.arriving), '.')),
  )
}

function deploymentWhy(d: Deployment): Rich {
  const j = judge(d)
  if (d.kind === 'suits') {
    return rich(
      'Each of the ',
      adaptersOf(d.ranks.length),
      ' has a slot at once, they fill all but ',
      percent(j.idle),
      ' of the width of the slots, and none is wider than rank ',
      given(d.slotRank),
      '. Nothing waits for a slot and little of the slots is wasted, so slots are enough.',
    )
  }
  if (d.kind === 'too-many') {
    return rich(
      adaptersOf(d.ranks.length),
      ' are in use at once and there are only ',
      slotsOf(d.slots),
      '. The scheduler skips a waiting request whose adapter is not in the batch once the batch has as many adapters as slots, so requests wait, however well the slots are filled.',
    )
  }
  if (d.kind === 'rank-spread') {
    return rich(
      'The slots are sized for rank ',
      given(d.slotRank),
      ', and these adapters fill only ',
      percent(100 - j.idle),
      ' of their width. ',
      percent(j.idle),
      ' of the slots\' memory sits idle, memory that a pool of pages would not hold, since a page holds only what an adapter weighs.',
    )
  }
  return rich(
    'The slots are built when the engine starts, for the largest rank it will accept, rank ',
    given(d.slotRank),
    '. An adapter of rank ',
    given(d.arriving),
    ' that arrives later is wider than a slot, and SGLang\'s pool refuses a rank above its maximum. Slots need the adapters to be known in advance.',
  )
}

function enoughOptions(s: Enough, level: Level, seed: Seed): ChoiceOption[] {
  const options = s.deployments.map(
    (d, at): ChoiceOption => ({
      id: LETTERS[at],
      text: deploymentText(d),
      why: deploymentWhy(d),
      ...(d.kind === 'suits' ? {} : { miss: `${FAMILY}.${d.kind}` }),
    }),
  )
  return shuffle(itemRng(FAMILY, 'enough', level, seed, 'options'), options)
}

function enoughSteps(s: Enough): Step[] {
  const d = s.deployments[s.key]
  const j = judge(d)
  return [
    { text: rich('Slots are enough when the adapters in use at once are no more than the slots, when they are near the slots\' rank, and when no wider adapter will arrive.') },
    {
      text: rich(
        'The deployment with ',
        slotsOf(d.slots),
        ' of rank ',
        given(d.slotRank),
        ' serves ',
        adaptersOf(d.ranks.length),
        ' at once, ',
        d.ranks.length <= d.slots ? 'which is no more than its slots' : 'which is more than its slots',
        ', fills all but ',
        percent(j.idle),
        ' of their width, and gets no wider adapter. The others each break one of the three.',
      ),
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* pinned                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

type Engine = 'vllm' | 'sglang'
type Topic = 'where' | 'width' | 'over'

const ENGINES: Readonly<Record<Engine, { readonly name: string; readonly version: string; readonly slots: string }>> = {
  vllm: { name: 'vLLM', version: 'v0.33.0', slots: 'max_loras' },
  sglang: { name: 'SGLang', version: 'v0.5.23', slots: 'max_loras_per_batch' },
}

interface Pinned {
  readonly variant: 'pinned'
  readonly engine: Engine
  readonly topic: Topic
  readonly slotRank: number
  readonly rank: number
  readonly slots: number
  /** The index of the right option in the order the ids run, 0 to 3. */
  readonly key: number
}

function drawPinned(level: Level, seed: Seed, purpose: string): Pinned {
  const rng = itemRng(FAMILY, 'pinned', level, seed, purpose)
  const topic = oneOf(rng, ['where', 'width', 'over'] as const)
  // The cap is vLLM's scheduler; the other two facts are true of both engines.
  const engine: Engine = topic === 'over' ? 'vllm' : oneOf(rng, ['vllm', 'sglang'] as const)
  const slotRank = pick(rng, [32, 48, 64, 128])
  return { variant: 'pinned', engine, topic, slotRank, rank: pick(rng, [4, 8, 12, 16].filter((rank) => rank < slotRank)), slots: 2 + below(rng, 3), key: below(rng, 4) }
}

/** An option in two phrasings, a tight one and a fuller one, so that the length of the right option says nothing of which it is. */
type Phrasing = readonly [Rich, Rich]

interface Fact {
  readonly stem: Rich
  readonly right: { readonly text: Phrasing; readonly why: Rich }
  readonly lures: readonly { readonly slug: string; readonly text: Phrasing; readonly why: Rich }[]
}

export function factOf(s: Pinned): Fact {
  const e = ENGINES[s.engine]
  const slotName = code(e.slots)
  if (s.topic === 'where') {
    return {
      stem: rich('At ', e.name, ' ', e.version, ', where in the GPU\'s memory does an adapter sit while requests use it?'),
      right: {
        text:
          s.engine === 'vllm'
            ? [rich('In one of ', slotName, ' slots, outside the KV block pool'), rich('In one of ', slotName, ' slots of stacked tensors, outside the KV block pool')]
            : [rich('In one of ', slotName, ' slots of its ', code('LoRAMemoryPool')), rich('In one of ', slotName, ' slots of its ', code('LoRAMemoryPool'), ', apart from the KV cache')],
        why:
          s.engine === 'vllm'
            ? rich('vLLM sizes its adapter slots as ', slotName, ' and builds their tensors when the LoRA manager starts. An adapter\'s weights are not pages of the KV block pool.')
            : rich('SGLang keeps adapters in ', code('LoRAMemoryPool'), ', a pool of ', slotName, ' buffer slots. It is not a page pool shared with the KV cache.'),
      },
      lures: [
        {
          slug: 'unified-pool',
          text:
            s.engine === 'vllm'
              ? [rich('In pages of the KV block pool, beside the KV blocks'), rich('In pages of the KV block pool, beside the KV blocks of the requests that use it')]
              : [rich('In pages of the KV cache\'s pool, beside the KV entries'), rich('In pages of the KV cache\'s pool, beside the KV entries of the requests that use it')],
          why: rich('That is S-LoRA\'s design, which the lab builds. ', e.name, ' does not page adapters in the KV pool at this version: its adapters sit in slots outside it.'),
        },
        {
          slug: 'copy-each-step',
          text: [rich('In CPU memory only, with a copy sent to the GPU for each step'), rich('In CPU memory only, with a copy sent to the GPU for each step that needs it')],
          why:
            s.engine === 'vllm'
              ? rich('An adapter that is in a slot stays there from one step to the next. vLLM evicts the oldest active adapter only when every slot is in use, and the CPU holds the adapters that the slots do not.')
              : rich('An adapter that is in a slot stays there from one step to the next. SGLang takes an empty slot first, and evicts an adapter only when the pool is full.'),
        },
        {
          slug: 'slot-each',
          text: [rich('In a slot of its own for every adapter the server has loaded'), rich('In a slot of its own for every adapter the server has loaded, however many there are')],
          why: rich('The slots are a fixed number, ', slotName, ', built when the engine starts. Adapters beyond them wait in CPU memory until a slot is free.'),
        },
      ],
    }
  }
  if (s.topic === 'width') {
    return {
      stem: rich('At ', e.name, ' ', e.version, ', the server is set to a largest rank of ', given(s.slotRank), '. An adapter of rank ', given(s.rank), ' sits in one of its slots. How wide is that slot?'),
      right: {
        text: [rich('As wide as rank ', given(s.slotRank), ', the largest the server takes'), rich('As wide as rank ', given(s.slotRank), ', the largest the server takes, for any adapter in it')],
        why:
          s.engine === 'vllm'
            ? rich('vLLM builds the stacks of all a layer\'s slots at once, ', code('max_lora_rank'), ' wide, and an adapter of a lower rank is copied into the first rows and columns of its slot, with the rest left zero.')
            : rich('SGLang\'s pool allocates each buffer at its ', code('max_lora_rank'), ', so every slot is as wide as the largest adapter that the pool will accept.'),
      },
      lures: [
        {
          slug: 'own-rank',
          text: [rich('As wide as rank ', given(s.rank), ', the adapter\'s own'), rich('As wide as rank ', given(s.rank), ', the adapter\'s own, and no wider than it needs')],
          why: rich('The slots are built when the engine starts, before any adapter is known, so a slot cannot take the width of the adapter that comes to sit in it. A lower rank leaves the rest of the slot unused.'),
        },
        {
          slug: 'whole-pages',
          text: [rich('As wide as the adapter\'s pages, rounded up to a whole page'), rich('As wide as the adapter\'s pages, rounded up to a whole page of the pool')],
          why: rich('Pages are the unit of S-LoRA\'s pool. A slot is a tensor of a fixed width and has no pages to round up to.'),
        },
        {
          slug: 'widest-in-batch',
          text: [rich('As wide as the widest adapter in the batch'), rich('As wide as the widest adapter that is in the batch at that step, and no wider')],
          why: rich('A slot does not change width from one batch to the next. It is built once, for the largest rank, and an adapter fills as much of it as its rank.'),
        },
      ],
    }
  }
  return {
    stem: rich('At vLLM v0.33.0 with ', code('max_loras'), ' set to ', given(s.slots), ', the batch already has ', given(s.slots), ' distinct adapters, and a waiting request names another. What does the scheduler do with that request?'),
    right: {
      text: [rich('It skips the request for now, and the request waits'), rich('It skips the request for now, and the request waits in the queue for a later step')],
      why: rich('The scheduler skips a waiting request whose adapter is not already scheduled once the distinct adapters of the batch reach ', code('max_loras'), '. The request waits, so a cap on adapters is a part of admission.'),
    },
    lures: [
      {
        slug: 'into-pages',
        text: [rich('It puts the adapter in the KV block pool and admits the request'), rich('It loads the adapter into pages of the KV block pool and admits the request at once')],
        why: rich('Adapters are not pages of the KV block pool at this version, so there is no pool of pages to load it into. The scheduler keeps the batch within the slots instead.'),
      },
      {
        slug: 'rejects',
        text: [rich('It rejects the request with an error'), rich('It rejects the request with an error, which the client has to send again')],
        why: rich('The request is not rejected. It stays in the queue, and the scheduler considers it again at a later step.'),
      },
      {
        slug: 'unloads',
        text: [rich('It unloads one of the batch\'s adapters and admits the request'), rich('It unloads one of the batch\'s adapters and admits the request in its place')],
        why: rich('The batch is using those adapters, and the cap is what keeps a batch within the slots. The scheduler leaves the batch as it is and skips the new request.'),
      },
    ],
  }
}

function pinnedOptions(s: Pinned, level: Level, seed: Seed): ChoiceOption[] {
  const fact = factOf(s)
  const phrasing = itemRng(FAMILY, 'pinned', level, seed, 'phrasing')
  const say = (text: Phrasing): Rich => text[below(phrasing, 2)]
  // The right option has the id the seed drew, and the lures take the others in an order that the seed gives.
  const order = shuffle(itemRng(FAMILY, 'pinned', level, seed, 'lures'), fact.lures)
  const options: ChoiceOption[] = []
  let next = 0
  for (let at = 0; at < 4; at += 1) {
    if (at === s.key) options.push({ id: LETTERS[at], text: say(fact.right.text), why: fact.right.why })
    else {
      const lure = order[next++]
      options.push({ id: LETTERS[at], text: say(lure.text), why: lure.why, miss: `${FAMILY}.${lure.slug}` })
    }
  }
  return shuffle(itemRng(FAMILY, 'pinned', level, seed, 'options'), options)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene, whatever the variant                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

type Scene = Idle | Take | Cap | Enough | Pinned

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  switch (variant) {
    case 'slot-idle':
      return drawIdle(level, seed, purpose)
    case 'slots-take':
      return drawTake(level, seed, purpose)
    case 'cap':
      return drawCap(level, seed, purpose)
    case 'enough':
      return drawEnough(level, seed, purpose)
    case 'pinned':
      return drawPinned(level, seed, purpose)
  }
}

function isFair(scene: Scene): boolean {
  switch (scene.variant) {
    case 'slot-idle': {
      const key = idleShare(scene.slotRank, scene.ranks)
      // Something is idle, and not nearly all of it: a quarter-width adapter in a slot is a plain case, and one that fills the slot is no question.
      return key >= 5 && key <= 94
    }
    case 'slots-take': {
      const each = slotPages(scene)
      return each >= 3 && (scene.slotRank * scene.unit) % scene.page !== 0 && takeKey(scene) >= 20
    }
    case 'cap': {
      const key = heldBack(scene)
      const wrong = capMistakes(scene)
      return distinctOf(scene.queue) > scene.slots && key >= 2 && key <= scene.queue.length - 3 && Object.values(wrong).every((value) => value !== key)
    }
    case 'enough': {
      // The one that suits really suits, and every other one breaks the condition that it was drawn to break.
      return scene.deployments.every((d, at) => {
        const j = judge(d)
        if (at === scene.key) return j.suits
        return d.kind === 'too-many' ? !j.fits && j.narrow && j.known : d.kind === 'rank-spread' ? j.fits && !j.narrow && j.known : j.fits && j.narrow && !j.known
      })
    }
    case 'pinned':
      return true
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Params                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const text_ = (list: readonly number[]): string => list.join('.')
const numbers_ = (text: string): number[] => (text === '' ? [] : text.split('.').map(Number))

function paramsOf(scene: Scene): Params {
  switch (scene.variant) {
    case 'slot-idle':
      return { slotRank: scene.slotRank, ranks: text_(scene.ranks) }
    case 'slots-take': {
      const params: Record<string, number | string | boolean> = { slots: scene.slots, slotRank: scene.slotRank, unit: scene.unit, page: scene.page, pool: scene.pool }
      if (scene.adapter !== null && scene.layout !== null) {
        params['hidden'] = scene.adapter.hidden
        params['adaptedLayers'] = scene.adapter.layers
        params['projections'] = scene.adapter.projections
        params['weightBytes'] = scene.adapter.weightBytes
        params['groupLayers'] = scene.layout.layers
        params['block'] = scene.layout.block
        params['tokenBytes'] = scene.layout.tokenBytes
      }
      return params
    }
    case 'cap':
      return { slots: scene.slots, queue: scene.queue }
    case 'enough':
      return {
        key: scene.key,
        deployments: scene.deployments.map((d) => [d.kind, d.slots, d.slotRank, text_(d.ranks), d.arriving].join(':')).join(';'),
      }
    case 'pinned':
      return { engine: scene.engine, topic: scene.topic, slotRank: scene.slotRank, rank: scene.rank, slots: scene.slots, key: scene.key }
  }
}

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  const read = (name: string): number => {
    const value = p[name]
    if (typeof value !== 'number') throw new TypeError(`${FAMILY}: the param ${name} of ${item.variant} is not a number`)
    return value
  }
  const readText = (name: string): string => {
    const value = p[name]
    if (typeof value !== 'string') throw new TypeError(`${FAMILY}: the param ${name} of ${item.variant} is not text`)
    return value
  }
  switch (item.variant) {
    case 'slot-idle':
      return { variant: 'slot-idle', slotRank: read('slotRank'), ranks: numbers_(readText('ranks')) }
    case 'slots-take': {
      const shaped = p['hidden'] !== undefined
      return {
        variant: 'slots-take',
        slots: read('slots'),
        slotRank: read('slotRank'),
        unit: read('unit'),
        page: read('page'),
        pool: read('pool'),
        adapter: shaped ? { hidden: read('hidden'), layers: read('adaptedLayers'), projections: read('projections'), weightBytes: read('weightBytes') } : null,
        layout: shaped ? { layers: read('groupLayers'), block: read('block'), tokenBytes: read('tokenBytes') } : null,
      }
    }
    case 'cap':
      return { variant: 'cap', slots: read('slots'), queue: readText('queue') }
    case 'enough':
      return {
        variant: 'enough',
        key: read('key'),
        deployments: readText('deployments')
          .split(';')
          .map((entry): Deployment => {
            const [kind, slots, slotRank, ranks, arriving] = entry.split(':')
            if (!(KINDS as readonly string[]).includes(kind)) throw new TypeError(`${FAMILY}: "${kind}" is not a kind of deployment`)
            return { kind: kind as DeploymentKind, slots: Number(slots), slotRank: Number(slotRank), ranks: numbers_(ranks), arriving: Number(arriving) }
          }),
      }
    case 'pinned': {
      const engine = p['engine']
      const topic = p['topic']
      if ((engine !== 'vllm' && engine !== 'sglang') || (topic !== 'where' && topic !== 'width' && topic !== 'over')) throw new TypeError(`${FAMILY}: the params of pinned are not a scene`)
      return { variant: 'pinned', engine, topic, slotRank: read('slotRank'), rank: read('rank'), slots: read('slots'), key: read('key') }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function stepsOfScene(scene: Scene): Step[] {
  switch (scene.variant) {
    case 'slot-idle':
      return idleSteps(scene)
    case 'slots-take':
      return takeSteps(scene)
    case 'cap':
      return capSteps(scene)
    case 'enough':
      return enoughSteps(scene)
    case 'pinned':
      return [{ text: factOf(scene).right.why }]
  }
}

/** The key of a numeric scene. */
function keyOf(scene: Idle | Take | Cap): number {
  switch (scene.variant) {
    case 'slot-idle':
      return idleShare(scene.slotRank, scene.ranks)
    case 'slots-take':
      return takeKey(scene)
    case 'cap':
      return heldBack(scene)
  }
}

function stemAndGivens(scene: Idle | Take | Cap): { stem: Rich; givens: Given[] } {
  switch (scene.variant) {
    case 'slot-idle':
      return scene.ranks.length === 1
        ? {
            stem: rich(
              'A deployment sets the largest rank that its slots take to ',
              given(scene.slotRank),
              ', so every slot is as wide as an adapter of that rank. An adapter of rank ',
              given(scene.ranks[0]),
              ' sits in one of the slots. What share of that slot is unused, in percent to one decimal place?',
            ),
            givens: [
              { label: 'largest rank the slots take', value: given(scene.slotRank) },
              { label: 'rank of the adapter in the slot', value: given(scene.ranks[0]) },
            ],
          }
        : {
            stem: rich(
              'A deployment sets the largest rank that its slots take to ',
              given(scene.slotRank),
              ', so every slot is as wide as an adapter of that rank. It has ',
              slotsOf(scene.ranks.length),
              ', and an adapter sits in each. What share of the width of all the slots is unused, in percent to one decimal place?',
            ),
            givens: [
              { label: 'largest rank the slots take', value: given(scene.slotRank) },
              { label: 'slots, one adapter in each', value: given(scene.ranks.length, 'slots') },
              { label: 'ranks of the adapters', value: code(scene.ranks.join(', ')) },
            ],
          }
    case 'slots-take': {
      const sizes: Given[] =
        scene.adapter !== null && scene.layout !== null
          ? [
              { label: 'hidden size', value: given(scene.adapter.hidden, 'values') },
              { label: 'layers adapted', value: given(scene.adapter.layers, 'layers') },
              { label: 'projections adapted in each layer', value: given(scene.adapter.projections, 'projections') },
              { label: 'bytes of a weight', value: given(scene.adapter.weightBytes, 'bytes') },
              { label: 'layers in a group', value: given(scene.layout.layers, 'layers') },
              { label: 'tokens in a block', value: given(scene.layout.block, 'tokens') },
              { label: 'bytes of a token in a layer', value: given(scene.layout.tokenBytes, 'bytes') },
            ]
          : [
              { label: 'bytes for each unit of rank', value: given(scene.unit, 'bytes') },
              { label: 'bytes in a page', value: given(scene.page, 'bytes') },
            ]
      const how =
        scene.adapter !== null
          ? rich('An adapter has a down matrix and an up matrix, rank × hidden weights each, for each projection it adapts, and a page of the pool is the block of a group of layers.')
          : rich('An adapter weighs ', given(scene.unit, 'bytes'), ' for each unit of its rank, and the pool\'s pages are ', given(scene.page, 'bytes'), ' each.')
      return {
        stem: rich(
          'A server reserves ',
          slotsOf(scene.slots),
          ' before its first request, each as wide as an adapter of rank ',
          given(scene.slotRank),
          ', out of a pool of ',
          given(scene.pool, 'pages'),
          '. ',
          ...how,
          ' How many pages does the pool have left for the KV cache?',
        ),
        givens: [
          { label: 'pages in the pool', value: given(scene.pool, 'pages') },
          { label: 'slots reserved', value: given(scene.slots, 'slots') },
          { label: 'rank each slot is sized for', value: given(scene.slotRank) },
          ...sizes,
        ],
      }
    }
    case 'cap':
      return {
        stem: rich(
          'vLLM v0.33.0 runs with ',
          code('max_loras'),
          ' set to ',
          given(scene.slots),
          '. The waiting requests name these adapters, in the order they wait. The scheduler takes them in that order, and skips a request whose adapter is not in the batch once the batch has ',
          adaptersOf(scene.slots),
          '. Ignoring every other limit, how many requests does it hold back in this pass?',
        ),
        givens: [
          { label: 'slots, max_loras', value: given(scene.slots, 'slots') },
          { label: 'adapter of each waiting request, in order', value: code([...scene.queue].join(' ')) },
        ],
      }
  }
}

function buildNumeric(spec: VariantSpec, scene: Idle | Take | Cap, level: Level, seed: Seed): Item {
  const key = keyOf(scene)
  const { stem, givens } = stemAndGivens(scene)
  const worked = workedPart(level, stepsOfScene(scene), (attempt) => {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    return example.variant === scene.variant && isFair(example) && keyOf(example as Idle | Take | Cap) !== key ? stepsOfScene(example) : null
  })
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene), stem, givens, worked }
  const gen = { id: FAMILY, version: VERSION }
  if (scene.variant === 'slot-idle') {
    // A share is right to the decimal that the question asks for, or within 2% of itself (ASSESSMENT §4.2: arithmetic on given numbers) [estimated].
    return finishItem(gen, { ...base, answer: { kind: 'numeric', label: 'share of the slot unused', unit: '%', truth: key, tolerance: { rel: 0.02, abs: 0.05 }, digits: 1 } })
  }
  if (scene.variant === 'slots-take') return finishItem(gen, { ...base, answer: { kind: 'numeric', label: 'pages left in the pool', unit: 'pages', truth: key, tolerance: EXACT } })
  return finishItem(gen, { ...base, answer: { kind: 'numeric', label: 'requests held back', unit: 'requests', truth: key, tolerance: EXACT } })
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  if (scene.variant === 'enough') {
    const worked = workedPart(level, stepsOfScene(scene), (attempt) => {
      const example = drawScene('enough', level, seed, `example-${attempt}`)
      return example.variant === 'enough' && isFair(example) && example.key !== scene.key ? stepsOfScene(example) : null
    })
    return finishItem(gen, {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem: rich('A deployment serves LoRA adapters from slots, as vLLM and SGLang do: a fixed number of slots, each sized for the largest rank it will take. Which of these deployments do slots serve well?'),
      givens: [],
      worked,
      answer: { kind: 'choice', label: 'the deployment slots serve well', options: enoughOptions(scene, level, seed), correct: LETTERS[scene.key] },
    })
  }
  if (scene.variant === 'pinned') {
    const worked = workedPart(level, stepsOfScene(scene), (attempt) => {
      const example = drawScene('pinned', level, seed, `example-${attempt}`)
      return example.variant === 'pinned' && (example.topic !== scene.topic || example.engine !== scene.engine) ? stepsOfScene(example) : null
    })
    return finishItem(gen, {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(scene),
      stem: factOf(scene).stem,
      givens: [],
      worked,
      answer: { kind: 'choice', label: scene.topic === 'where' ? 'where the adapter sits' : scene.topic === 'width' ? 'how wide the slot is' : 'what the scheduler does', options: pinnedOptions(scene, level, seed), correct: LETTERS[scene.key] },
    })
  }
  return buildNumeric(spec, scene, level, seed)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

function capMistakes(s: Cap): Readonly<Record<string, number>> {
  const { held } = capPass(s.slots, s.queue)
  const first = held.indexOf(true)
  return {
    'one-request-per-slot': s.queue.length - s.slots,
    'stops-at-first': first < 0 ? 0 : s.queue.length - first,
    'adapters-not-requests': distinctOf(s.queue) - s.slots,
  }
}

function mistakes(scene: Idle | Take | Cap): Readonly<Record<string, number>> {
  switch (scene.variant) {
    case 'slot-idle': {
      const key = idleShare(scene.slotRank, scene.ranks)
      const width = scene.slotRank * scene.ranks.length
      const filled = scene.ranks.reduce((sum, rank) => sum + rank, 0)
      return { 'used-not-idle': 100 - key, 'over-the-adapter': percentOf(width - filled, filled), 'rank-gap': width - filled }
    }
    case 'slots-take': {
      const each = slotPages(scene)
      return {
        'slots-are-free': scene.pool,
        'one-slot': scene.pool - each,
        'rounded-down': scene.pool - scene.slots * divFloor(scene.slotRank * scene.unit, scene.page),
        'rank-as-pages': scene.pool - scene.slots * scene.slotRank,
        'taken-not-left': scene.slots * each,
      }
    }
    case 'cap':
      return capMistakes(scene)
  }
}

function messageFor(id: string, scene: Idle | Take | Cap, value: number): Rich | null {
  switch (id) {
    case 'used-not-idle':
      return rich('That is the share that the adapter fills. The question is the share of the slot that stays unused.')
    case 'over-the-adapter':
      return rich('That divides by the adapter\'s rank. The unused share is a share of the slot, which is as wide as the largest rank, so divide by that.')
    case 'rank-gap':
      return rich('That is a number of ranks, ', num(value, { tag: 'derived' }), ', and not a share. Divide it by the width of the slot to get the share.')
    case 'slots-are-free':
      return rich('That is the whole pool. A slot is memory too, taken out of the same GPU before the first request, whether or not an adapter ever sits in it.')
    case 'one-slot':
      return rich('That takes one slot out of the pool. The server reserves all of its slots before its first request.')
    case 'rounded-down':
      return rich('That rounds a slot down to whole pages. A slot that fills part of a page still takes the page, so the count rounds up.')
    case 'rank-as-pages':
      return rich('That takes a page for each unit of rank, as S-LoRA\'s paper does with pages of one vector of the hidden size. The course\'s page is the block of a group, so a slot takes its bytes over the page\'s, rounded up.')
    case 'taken-not-left':
      return rich('That is the pages that the slots take. The question is the pages that are left in the pool.')
    case 'one-request-per-slot':
      return rich('That lets one request in for each slot. A slot is for an adapter, and any number of requests on an adapter that is in the batch go in together.')
    case 'stops-at-first':
      return rich('That stops at the first request that is skipped. The scheduler skips it and goes on, and later requests whose adapter is in the batch still go in.')
    case 'adapters-not-requests':
      return scene.variant === 'cap' ? rich('That counts the adapters left out. The question is the requests held back, and each adapter left out may have several waiting.') : null
    default:
      return null
  }
}

const ORDER: readonly string[] = [
  'one-request-per-slot',
  'stops-at-first',
  'adapters-not-requests',
  'slots-are-free',
  'taken-not-left',
  'one-slot',
  'rounded-down',
  'rank-as-pages',
  'used-not-idle',
  'over-the-adapter',
  'rank-gap',
]

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant !== 'slot-idle' && scene.variant !== 'slots-take' && scene.variant !== 'cap') return null
    const key = keyOf(scene)
    const wrong = mistakes(scene)
    for (const id of ORDER) {
      const target = wrong[id]
      if (target === undefined || target === key || value !== target) continue
      const message = messageFor(id, scene, value)
      if (message !== null) return { id: `${FAMILY}.${id}`, message }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const slotsVsPages: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Slots against pages',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => stepsOfScene(sceneOf(item)),
}
