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
import type { PoolLevelId } from './types'

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
