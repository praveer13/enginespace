/**
 * What KV page pool's levels say, by level id (R-T02, R-T04): the title in the level menu, the goal line, the line a level opens on, the
 * prediction's question with the unit its answer is in, and for a graded level its pass rule. The words are display copy and no rule reads
 * them, so they are not in a level or a state: rewording one moves no state hash and no golden. The view reads them here by id (`poolView`),
 * and `levelTitle` serves the registry's record. The prediction's answer is not copy: it is the sim's own arithmetic, in the level.
 *
 * The words are the engine's (REDESIGN §2.7, D-063): request, KV page, KV group, conversation, cost. The pool's unit is the page, the
 * course's word for vLLM's block (src/copy/terms.ts). Only a pass rule carries a digit, the level's own bar, and
 * tests/copy/game-copy.test.ts reads the bar from the level and finds it there; every other figure on screen is a Readout that tags itself.
 */
import type { GoalLine } from '../types'
import type { PoolAction, PoolLevelId, PoolView, TicketView } from './types'

/** What a level asks the learner to predict before the first decision (GAMES.md §8: "Predict the pages a request will hold"), in words. */
export interface PoolPredictCopy {
  readonly ask: string
  readonly unit: 'pages' | 'KV groups'
}

export interface PoolCopy {
  readonly title: string
  readonly goal: GoalLine
  /** The line the level opens on. */
  readonly prompt: string
  readonly predict: PoolPredictCopy
  /** A graded level's pass rule, stated before the run (REDESIGN §2.6), with the level's bar in it. */
  readonly passRule?: string
}

const AIM = 'Serve every request and recompute as few tokens as you can.'
const CONTROLS = 'You choose which waiting request to admit and which cached pages to evict.'
const BEAT = "The reference run's cost is the number to beat."
const ENDS = 'Ends when every request is served, or at the step limit.'
/** The bar of the graded levels: `PASS_SCORE` of levels.ts, ASSESSMENT §4.3's. */
const PASS_RULE = "Passes when the reference run's cost divided by yours is at least 0.95."

const HELD = { ask: 'How many pages will the first request hold, across every KV group, once it is admitted?', unit: 'pages' } as const

export const POOL_COPY: Readonly<Record<PoolLevelId, PoolCopy>> = {
  'one-group': {
    title: 'One KV group',
    goal: { aim: AIM, controls: CONTROLS, beat: BEAT, ends: ENDS },
    prompt:
      "One KV group holds every page a request needs. Admit a request, and a request whose prompt begins like an earlier one's starts from that one's cached pages: a prefix hit. When an admitted request needs room, choose which cached pages to evict.",
    predict: HELD,
  },
  'two-kinds': {
    title: 'Full attention and a sliding window',
    goal: { aim: AIM, controls: CONTROLS, beat: BEAT, ends: ENDS },
    prompt:
      'A full-attention group keeps every page of a request, and a sliding-window group keeps only the pages inside its window and returns the rest to the free queue. One request holds pages in all three groups.',
    predict: HELD,
  },
  evict: {
    title: 'Choose what to evict',
    goal: { aim: AIM, controls: CONTROLS, beat: PASS_RULE, ends: ENDS },
    prompt:
      'The pool is full, and a request hits only as far as every group still holds its pages. When a request needs room, evict the pages nobody is waiting on, and keep the head of each conversation: every later hit starts from it.',
    predict: HELD,
    passRule: PASS_RULE,
  },
  'same-size': {
    title: 'One page size for every group',
    goal: { aim: AIM, controls: CONTROLS, beat: BEAT, ends: ENDS },
    prompt:
      "Every group's page is the same size in bytes, so the model's layers are grouped to fill one page, and the layers left over are padded. Count the KV groups, and see what the padding wastes.",
    predict: { ask: 'How many KV groups does this model need, so that every page is one size?', unit: 'KV groups' },
  },
  state: {
    title: 'A state group',
    goal: { aim: AIM, controls: CONTROLS, beat: BEAT, ends: ENDS },
    prompt:
      'A recurrent layer keeps a fixed number of pages for each request, however long it runs, and the full-attention pages are made larger to match. A prefix hit needs the page that holds the state at its edge.',
    predict: { ask: 'How many pages do the state groups hold for one request, however long it runs?', unit: 'pages' },
  },
  adapters: {
    title: 'LoRA adapters in the same pool',
    goal: {
      aim: 'Serve every request, and keep the LoRA adapters from costing more than they must.',
      controls: 'You choose which request to admit, which cached pages to evict and which adapter to load.',
      beat: PASS_RULE,
      ends: ENDS,
    },
    prompt:
      'A LoRA adapter takes pages from the same pool. A request is admitted only once its adapter has loaded, and an adapter stays while a running request uses it. Load an adapter before its request is admitted, and mind what it costs the cached pages.',
    predict: { ask: 'How many pages does the larger LoRA adapter take?', unit: 'pages' },
    passRule: PASS_RULE,
  },
  manager: {
    title: 'The whole manager',
    goal: {
      aim: 'Run the whole KV cache manager on a workload you have not seen.',
      controls: 'You choose which request to admit, which cached pages to evict and which adapter to load.',
      beat: PASS_RULE,
      ends: ENDS,
    },
    prompt:
      "Everything at once: groups of every kind, a full pool, and LoRA adapters that compete with the cached pages. Run the manager's policy on a workload you have not seen.",
    predict: HELD,
    passRule: PASS_RULE,
  },
}

/**
 * A part of the diagram, as the parts list names it (REDESIGN §2.6): an id, the engine's name, one sentence, the identifier the pinned
 * vLLM gives it where it has one, the levels it is drawn on, and the claim that sources it. The Parts list, the first-run intro and the
 * source popover all read these rows. A part with no claim is a model object: the course's model draws it, and the popover says so.
 */
export interface PoolPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The class or function the pinned vLLM names it by, set as code. */
  readonly engine?: string
  /** The levels that draw it, or every level. */
  readonly levels: readonly PoolLevelId[] | 'all'
  /** The claim (content/claims) that holds its value, its tag and its file and symbol at the pinned commit. */
  readonly claim?: string
}

const SLIDING: readonly PoolLevelId[] = ['two-kinds', 'evict', 'same-size', 'adapters', 'manager']
const GROUPS: readonly PoolLevelId[] = ['two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager']
const ADAPTERS: readonly PoolLevelId[] = ['adapters', 'manager']

/** The parts, in the order the list shows them: the five every level draws, then what a level adds. */
export const POOL_PARTS: readonly PoolPart[] = [
  {
    id: 'pool',
    name: 'KV page pool',
    sentence: 'Every KV page on the GPU, in rows of 16. A page holds one block of tokens for one KV group.',
    engine: 'BlockPool',
    levels: 'all',
    claim: 'vllm.hybrid-kv.single-pool',
  },
  {
    id: 'page',
    name: 'KV page',
    sentence: 'One page holds one block of tokens for one KV group. Its state is its colour and mark in the legend: free, in use, cached, or waited on by a prefix hit.',
    levels: 'all',
    claim: 'vllm.cache.block-size-default',
  },
  {
    id: 'waiting',
    name: 'Waiting queue',
    sentence: 'Requests not yet admitted. Admit one each step it fits; before you do, its row shows the prefix it would reuse.',
    levels: 'all',
    claim: 'vllm.scheduler.order',
  },
  {
    id: 'batch',
    name: 'Running batch',
    sentence: 'The admitted requests, one to a slot. Each draws its block table: a row for each KV group, a segment for each block.',
    levels: 'all',
    claim: 'vllm.scheduler.order',
  },
  { id: 'cost', name: 'Cost', sentence: 'Recomputed tokens, plus a weight for each step a request waits for its adapter. Lower is better.', levels: 'all' },
  {
    id: 'free-queue',
    name: 'Free queue',
    sentence: 'The pages nobody holds, in the order they are evicted, the next on the left: free pages first, then cached pages.',
    engine: 'FreeKVCacheBlockQueue',
    levels: 'all',
    claim: 'vllm.kv-pool.free-order',
  },
  { id: 'conversation', name: 'Conversation', sentence: "Requests that share a growing prefix: each turn opens with the whole of the turn before it. A page's label names its conversation and block.", levels: 'all' },
  {
    id: 'kv-group',
    name: 'KV group',
    sentence: 'Layers that share one block table. Each group holds its own pages for a request, all from the one pool.',
    levels: GROUPS,
    claim: 'vllm.hybrid-kv.group-rules',
  },
  {
    id: 'sliding',
    name: 'Sliding window',
    sentence: 'A group that keeps only the pages inside its window and returns the rest to the free queue.',
    levels: SLIDING,
    claim: 'vllm.hybrid-kv.sliding-skipped-tokens',
  },
  { id: 'state', name: 'State group', sentence: "A recurrent layer's group: a fixed number of pages for each request, however long it runs.", levels: ['state'], claim: 'vllm.hybrid-kv.mamba-hit' },
  { id: 'padding', name: 'Padding', sentence: 'Layers added to a group so that every group fills the same page size. They hold no KV.', levels: ['same-size'], claim: 'vllm.hybrid-kv.padding-layers' },
  { id: 'adapter', name: 'LoRA adapter', sentence: 'Its weights take pages from the same pool. A request that needs one waits until it has loaded.', levels: ADAPTERS, claim: 'kv.slora.page-vector' },
]

/** A part's row by id. */
export const partOf = (id: string): PoolPart | undefined => POOL_PARTS.find((part) => part.id === id)

/**
 * A page's popover names the pool's class once: a page is a block that vLLM's `BlockPool` hands out (REDESIGN §2.2: the pool is vLLM's
 * `BlockPool`, and the game calls its unit a page).
 */
export const PAGE_ENGINE_LINE = { before: 'In vLLM a page is a block, and the class that hands blocks out is ', engine: 'BlockPool', after: '.' } as const

/** What the dock's Step does, in the engine's words: the first option each decision lists. */
export const DOCK_STEP_WORDS = 'Step takes the first option the decision lists: the first request that fits, or the pages at the front of the free queue.'

/** The parts a level draws, in the list's order. */
export const partsOf = (level: PoolLevelId): readonly PoolPart[] => POOL_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/* ------------------------------------------------------------------------------------------------------------------ */
/* The first run and the named moments (R-T08, REDESIGN §2.6, §3.5)                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The pointed first move in words, by the action's kind: what the intro says the amber ring is on. */
export const FIRST_MOVE_WORDS: {
  readonly [K in PoolAction['t']]: (action: Extract<PoolAction, { t: K }>) => string
} = {
  commit: (action) => `Commit ${action.prediction}`,
  admit: (action) => (action.req === null ? 'Admit none this step' : `Admit request ${action.req + 1}`),
  evict: (action) => `Evict ${plural(action.pages.length, 'page', 'pages')}`,
  preempt: (action) => `Preempt request ${action.req + 1}`,
  prefetch: (action) => (action.adapter === null ? 'Load none yet' : `Load adapter ${action.adapter + 1}`),
}

/** A move in words. */
export const moveWords = (action: PoolAction): string => (FIRST_MOVE_WORDS[action.t] as (a: PoolAction) => string)(action)

/**
 * What the first waiting request holds, before the guess: its tokens, its conversation and the prefix the pool would serve it, and never
 * its page count, which is the guess's answer.
 */
export function lookLine(ticket: TicketView): string {
  const prefix = ticket.hit > 0 ? `a cached prefix of ${plural(ticket.hit, 'token', 'tokens')}` : 'no cached prefix'
  return `${plural(ticket.tokens, 'token', 'tokens')}, conversation ${ticket.letter}, ${prefix}.`
}

/** The pages a running request holds across its KV groups. */
const heldOf = (ticket: TicketView): number => ticket.ruler.reduce((sum, row) => sum + row.filter((seg) => seg !== 'let-go').length, 0)

/** The request the action between two views admitted, if it admitted one. */
const admitted = (before: PoolView, after: PoolView): TicketView | null => {
  const id = after.running.find((req) => !before.running.includes(req) && before.waiting.includes(req))
  return id === undefined ? null : after.tickets[id]
}

/** A named moment of the pool: the first time its rule is felt in a level, said once beside the object (REDESIGN §2.6). */
export interface PoolMoment {
  readonly id: string
  readonly line: (before: PoolView, after: PoolView) => string | null
  /** The object it is said beside, by what the page's drawing marks it with. */
  readonly near: (before: PoolView, after: PoolView) => { readonly kind: 'request'; readonly id: number } | { readonly kind: 'readout' | 'queue' }
}

/** The pool's named moments, in the order they are asked. Every figure is the view's own. */
export const POOL_MOMENTS: readonly PoolMoment[] = [
  {
    id: 'pages-held',
    line: (before, after) => {
      const ticket = admitted(before, after)
      if (ticket === null || ticket.hit > 0) return null
      const held = heldOf(ticket)
      if (held === 0) return null
      const groups = after.stations.length
      if (groups === 1) return `Request ${ticket.id + 1} took ${plural(held, 'page', 'pages')}: ${ticket.tokens} tokens at ${after.blockTokens} a page, in 1 KV group.`
      return `Request ${ticket.id + 1} took ${plural(held, 'page', 'pages')} for ${ticket.tokens} tokens: each of its ${groups} KV groups keeps its own pages, ${after.blockTokens} tokens a page.`
    },
    near: (before, after) => ({ kind: 'request', id: admitted(before, after)?.id ?? 0 }),
  },
  {
    id: 'prefix-hit',
    line: (before, after) => {
      const ticket = admitted(before, after)
      if (ticket === null || ticket.hit === 0) return null
      const pages = after.stations.length === 1 && Number.isInteger(ticket.hit / after.blockTokens) ? ` (${plural(ticket.hit / after.blockTokens, 'cached page', 'cached pages')})` : ''
      return `A prefix hit: request ${ticket.id + 1} starts from ${plural(ticket.hit, 'cached token', 'cached tokens')}${pages} and computes nothing for them.`
    },
    near: (before, after) => ({ kind: 'request', id: admitted(before, after)?.id ?? 0 }),
  },
  {
    id: 'eviction',
    line: (before, after) => {
      const gone = after.counts.evictions - before.counts.evictions
      if (gone <= 0) return null
      return `An eviction: ${plural(gone, 'cached page', 'cached pages')} went back to the free queue. A request that would have reused one computes its tokens again.`
    },
    near: () => ({ kind: 'queue' }),
  },
]
