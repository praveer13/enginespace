// The `hybrid-kv` lab's oracle (labs/forge/hybrid-kv, TR5a, ARCHITECTURE §5.4, §8.3): the six checks that the site fires at a learner's
// hybrid KV manager, one for each stage of the lab (curriculum TR5a §5), and the scripts and streams they send.
//
// A check is a list of segments (kv-plan.ts). Each segment is a pool of pages and a list of operations, and every operation is judged
// against `kvReference`: its reply, the hit it found, the state the module reports, whether a refusal left everything as it was, and the
// events it published. A check is a script followed by streams:
//
//   the script   a few dozen operations that show the stage's rule at the sizes where a mistake changes an answer: the doc's 112-token
//                request, a pool that is exactly full, a prefix that two groups hold differently. The crate's own checks (`cargo test`)
//                play the same scripts and know the replies, which tests/forge/hybrid-kv-crate.test.ts takes from this reference.
//   the streams  `kvOps` on the seed drawn when the run starts, so a manager that fits the scripts and no other input does not pass.
//
// The scripts are written in the wire's own words (kv-wire.ts), with token runs (`0+20` is the ids 0 to 19), so the crate carries the
// same lines. `gauntlet` plays every script again and then churns four pools.

import { rngFor } from '../core'
import type { Seed } from '../core'
import { kvAdapterCatalog, kvOps, kvPreset } from '../kv'
import type { KvOp, KvOpsAdapter, KvOpsProfile, KvSpec } from '../kv'
import { kvPlan } from './kv-plan'
import type { KvSegment } from './kv-plan'
import { parseWireOp } from './kv-wire'
import type { PlannedCheck } from './toy'

// ---------------------------------------------------------------------------------------------------------------------------
// The pools

/** The pools of the lab: the presets of the Pool game, in pools small enough that a few requests fill them. Pages and bytes are synthetic [estimated]. */
export const HYBRID_KV_SPECS = {
  'one-group': kvPreset('one-group', 20),
  'two-kinds': kvPreset('two-kinds', 40),
  state: kvPreset('state', 40),
  'same-size': kvPreset('same-size', 72),
} as const satisfies Record<string, KvSpec>

export type HybridKvPool = keyof typeof HYBRID_KV_SPECS

// ---------------------------------------------------------------------------------------------------------------------------
// The scripts

/** A script: the pool it runs on, and its operations as lines of the wire. */
export interface KvScript {
  readonly name: string
  readonly pool: HybridKvPool
  readonly lines: readonly string[]
}

/**
 * Stage 1. A page holds 16 tokens, and the pool has 20. Paging, all or nothing at the exact edge of the pool, prefixes shared by
 * reference count, and the order pages leave the free queue in: a request's blocks go back last block first, a page with no hash
 * goes back before every cached one, and a hit takes its pages out of the queue.
 */
export const SCRIPT_ONE_GROUP: KvScript = {
  name: 'the one-group script',
  pool: 'one-group',
  lines: [
    'admit 1 - 0+20',
    'admit 2 - 100+16',
    'admit 3 - 200+17',
    'append 1 20+12',
    'append 1 40+1',
    'admit 4 - 300+225',
    'admit 4 - 300+224',
    'append 1 41+16',
    'admit 5 - 600+1',
    'admit 1 - 700+3',
    'finish 99',
    'finish 4',
    'admit 6 - 0+37',
    'admit 7 - 0+40',
    'finish 1',
    'finish 6',
    'finish 7',
    'finish 2',
    'finish 3',
    'admit 8 - 5000+16',
    'admit 9 - 300+224',
    'finish 8',
    'finish 9',
  ],
}

/**
 * Stage 2. Ten full layers and twenty sliding layers make three groups of ten, 16-token blocks and a window of 32. The doc's 112-token
 * request holds 7 + 2 + 2 blocks; a window lets go of a block at the token where the next token stops reading it, so a request of 110
 * and 111 tokens is where a window one token too long or too short changes the count; and an append is judged on the pages its windows
 * give back as well as the pages it needs.
 */
export const SCRIPT_SLIDING: KvScript = {
  name: 'the sliding-window script',
  pool: 'two-kinds',
  lines: [
    'admit 1 - 0+112',
    'admit 2 - 1000+110',
    'append 2 110+1',
    'append 2 111+1',
    'append 1 112+1',
    'append 1 113+16',
    'admit 3 - 2000+200',
    'finish 2',
    'admit 3 - 2000+200',
    'finish 1',
    'finish 3',
    'admit 4 - 4000+96',
    'admit 5 - 3000+305',
    'append 4 4096+20',
    'finish 5',
    'finish 4',
  ],
}

/**
 * Stage 3. An attention group and three state groups, 32-token blocks, two pages of state for each request in each state group: a
 * request of 300 tokens holds 10 + 2 + 2 + 2 blocks, and so does one of 400 tokens after the last two are replaced.
 */
export const SCRIPT_STATE: KvScript = {
  name: 'the state-group script',
  pool: 'state',
  lines: [
    'admit 1 - 0+300',
    'append 1 300+1',
    'append 1 301+99',
    'admit 2 - 5000+40',
    'admit 3 - 6000+64',
    'admit 4 - 7000+500',
    'finish 1',
    'admit 5 - 0+301',
    'finish 2',
    'finish 3',
    'finish 5',
    'finish 6',
    'admit 7 - 0+300',
    'finish 7',
  ],
}

/**
 * Stage 4. A request grows from 64 to 96 tokens, so that the windows have cached blocks 2 and 3 as well as the 4 and 5 they hold at the
 * end. Everyone holds the whole prefix (96), a shorter prefix is found where every group holds it (80), and then six pages are dumped:
 * the early blocks of both windows and the tail of the full group. The full group still holds 64 tokens and the windows hold only
 * their last blocks, so the prefix every group holds is none.
 */
export const SCRIPT_HIT: KvScript = {
  name: 'the prefix-hit script',
  pool: 'two-kinds',
  lines: [
    'admit 1 - 0+64',
    'append 1 64+32',
    'finish 1',
    'admit 2 - 0+112',
    'finish 2',
    'admit 3 - 0+80,2000+20',
    'finish 3',
    'admit 4 - 9000+401',
    'finish 4',
    'admit 5 - 0+112',
    'finish 5',
  ],
}

/** Stage 4, with seven groups: the Gemma-3-like model of the Pool's `same-size` level. */
export const SCRIPT_SAME_SIZE: KvScript = {
  name: 'the seven-group script',
  pool: 'same-size',
  lines: ['admit 1 - 0+160', 'admit 2 - 0+160,3000+16', 'finish 1', 'finish 2', 'admit 3 - 0+176', 'finish 3'],
}

/**
 * Stage 5, lab 02's `adapter_unified_paging` in the hybrid pool: an adapter takes pages of the pool, once, and shares them with every
 * request that uses it; a request runs only when its adapter is resident; loading and admitting are all or nothing; unloading returns the
 * pages and touches no KV; and the same tokens under an adapter are another block than under the base model.
 */
export const SCRIPT_ADAPTERS: KvScript = {
  name: 'the adapter script',
  pool: 'one-group',
  lines: [
    'admit 1 - 0+48',
    'load 7 5',
    'load 7 1',
    'admit 2 - 100+208',
    'admit 2 7 100+20',
    'unload 7',
    'admit 3 9 300+16',
    'admit 4 7 100+20',
    'admit 5 - 100+20',
    'finish 2',
    'unload 7',
    'finish 4',
    'unload 7',
    'unload 7',
    'load 8 9',
    'load 9 3',
    'admit 6 - 700+16',
    'finish 1',
    'finish 5',
    'unload 8',
    'finish 6',
  ],
}

/** Stage 6. A reset forgets the cache, announces it once, and is refused while a request runs. */
export const SCRIPT_RESET: KvScript = {
  name: 'the reset script',
  pool: 'one-group',
  lines: ['admit 1 - 0+48', 'finish 1', 'reset', 'admit 2 - 0+48', 'reset', 'finish 2', 'reset', 'admit 3 - 0+48', 'finish 3'],
}

/** The scripts of each stage, in the order `gauntlet` plays them. */
export const HYBRID_KV_SCRIPTS: Readonly<Record<'one_group' | 'sliding' | 'state' | 'hit_all_groups' | 'adapter_pages' | 'gauntlet', readonly KvScript[]>> = {
  one_group: [SCRIPT_ONE_GROUP],
  sliding: [SCRIPT_SLIDING],
  state: [SCRIPT_STATE],
  hit_all_groups: [SCRIPT_HIT, SCRIPT_SAME_SIZE],
  adapter_pages: [SCRIPT_ADAPTERS],
  gauntlet: [SCRIPT_ONE_GROUP, SCRIPT_SLIDING, SCRIPT_STATE, SCRIPT_HIT, SCRIPT_SAME_SIZE, SCRIPT_ADAPTERS, SCRIPT_RESET],
}

/** The operations of a script. */
export const scriptOps = (script: KvScript): readonly KvOp[] => script.lines.map(parseWireOp)

const scriptSegment = (script: KvScript): KvSegment => ({ name: script.name, spec: HYBRID_KV_SPECS[script.pool], ops: scriptOps(script) })

// ---------------------------------------------------------------------------------------------------------------------------
// The streams

/** What a seeded stream is made of: its pool, its operations, and what it may do beyond admitting, appending and finishing. */
export interface HybridKvStream {
  readonly pool: HybridKvPool
  readonly ops: number
  /** Whether it loads and unloads the adapters that the Pool game's catalog gives the pool's page size. */
  readonly adapters: boolean
  /** Whether it may reset the pool. */
  readonly reset: boolean
  readonly profile?: Partial<KvOpsProfile>
}

/**
 * The streams that follow the script of each check, and the operations of each [estimated]. Before `adapter_pages` a stream has no
 * adapters, and before `gauntlet` it has no reset: the generator makes calls that a manager must refuse (`unload` of an adapter that is
 * not there, `reset` with a request running), and those are left out until the operations they call are a stage of their own. A refused
 * operation changes nothing, so a stream with them left out is a stream that the reference answers the same way. The gauntlet's four
 * pools make about 2,000 operations with the scripts [estimated].
 */
export const HYBRID_KV_STREAMS: Readonly<Record<keyof typeof HYBRID_KV_SCRIPTS, readonly HybridKvStream[]>> = {
  one_group: [{ pool: 'one-group', ops: 120, adapters: false, reset: false }],
  sliding: [{ pool: 'two-kinds', ops: 120, adapters: false, reset: false }],
  state: [{ pool: 'state', ops: 100, adapters: false, reset: false }],
  hit_all_groups: [{ pool: 'two-kinds', ops: 150, adapters: false, reset: false, profile: { sharedPrompts: 2, sessions: 3 } }],
  adapter_pages: [{ pool: 'one-group', ops: 150, adapters: true, reset: false }],
  gauntlet: [
    { pool: 'one-group', ops: 440, adapters: true, reset: true },
    { pool: 'two-kinds', ops: 460, adapters: true, reset: true },
    { pool: 'state', ops: 440, adapters: true, reset: true },
    { pool: 'same-size', ops: 460, adapters: true, reset: true },
  ],
}

const adaptersOf = (spec: KvSpec): readonly KvOpsAdapter[] => kvAdapterCatalog(spec).map((a) => ({ id: a.id, pages: a.pages }))

/** The stream of one pool for `seed`, on its own sub-stream of the seed. */
function stream(seed: Seed, name: string, plan: HybridKvStream): KvSegment {
  const spec = HYBRID_KV_SPECS[plan.pool]
  const sub = rngFor(seed, `forge/hybrid-kv/${name}`)()
  const profile: Partial<KvOpsProfile> = {
    maxRunning: 3,
    sessions: 4,
    resetWeight: plan.reset ? 2 : 0,
    adapters: plan.adapters ? adaptersOf(spec) : [],
    ...plan.profile,
  }
  const keep = (op: KvOp): boolean => (op.op === 'reset' ? plan.reset : op.op === 'unload-adapter' ? plan.adapters || plan.reset : true)
  const ops = kvOps(sub, spec, plan.ops, profile).filter(keep)
  return { name, spec, ops }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The checks

const scripted = (key: keyof typeof HYBRID_KV_SCRIPTS): KvSegment[] => HYBRID_KV_SCRIPTS[key].map(scriptSegment)

const count = (segments: readonly KvSegment[]): number => segments.reduce((sum, s) => sum + s.ops.length, 0)

/** The plan of a check: its scripts, then its streams, each on a pool of its own. */
function planOf(key: keyof typeof HYBRID_KV_SCRIPTS, what: string) {
  return (seed: Seed) => {
    const plans = HYBRID_KV_STREAMS[key]
    const streams = plans.map((plan, i) => stream(seed, plans.length === 1 ? `the ${key} stream` : `stream ${i + 1} of ${plans.length}`, plan))
    const segments = [...scripted(key), ...streams]
    return kvPlan(segments, `${count(segments)} operations${key === 'gauntlet' ? ` on ${segments.length} pools` : ''}: ${what}`)
  }
}

const EVERY = 'every reply, every page and every event as the reference has them'

/**
 * The knowledge components that a check assesses (content/kc/graph.yaml), which `verify:kc` reads through kcs.ts. The exit review
 * (W1-T38) wired that source and removed the `planned: W1-T22` lines that these checks answer.
 */
export const HYBRID_KV_KCS: Readonly<Record<string, readonly string[]>> = {
  sliding: ['tr5a.sliding-free', 'tr5a.all-or-nothing'],
  state: ['tr5a.state-pages'],
  hit_all_groups: ['tr5a.hit-intersection'],
  adapter_pages: ['tr5a.adapter-pages', 'tr5a.all-or-nothing'],
}

/** The six checks of the `hybrid-kv` lab, in grading order: the stages s1 to s6 of TR5a §5. */
export const HYBRID_KV_CHECKS: readonly PlannedCheck[] = [
  {
    id: 'one_group',
    label: 'one group: pages, prefix hashes and shared blocks',
    stage: 1,
    seeded: true,
    defaultSeed: 0x4b01,
    catches:
      'A page count that is not the ceiling of the tokens over the block, an admit that is not all or nothing, a free that leaks a page or sends pages back in the wrong order, a shared block that the first request to finish gives back, and a block published twice.',
    plan: planOf('one_group', EVERY),
  },
  {
    id: 'sliding',
    label: 'a sliding window gives its blocks back',
    stage: 2,
    seeded: true,
    defaultSeed: 0x4b02,
    catches:
      'A window that keeps one token too many or lets go of a block the next token still reads, an append that does not count the pages its windows give back, and an admit that takes the pages of the groups it can cover before it finds the pool short.',
    plan: planOf('sliding', EVERY),
  },
  {
    id: 'state',
    label: 'a state group holds a fixed number of pages',
    stage: 3,
    seeded: true,
    defaultSeed: 0x4b03,
    catches: 'A state group that keeps every block of a long request, or lets go of the block that holds the state at the edge, or counts its pages like an attention group.',
    plan: planOf('state', EVERY),
  },
  {
    id: 'hit_all_groups',
    label: 'a prefix hit holds in every group',
    stage: 4,
    seeded: true,
    defaultSeed: 0x4b04,
    catches: 'A prefix hit that is the longest of any one group, the union, in place of the longest that every group holds, or one that covers the last token of the prompt or ends inside a block.',
    plan: planOf('hit_all_groups', 'every hit the intersection of the groups, and every reply and event as the reference has them'),
  },
  {
    id: 'adapter_pages',
    label: 'adapters take pages of the same pool',
    stage: 5,
    seeded: true,
    defaultSeed: 0x4b05,
    catches:
      'An adapter that is charged more or fewer pages than it asked for, one that is unloaded while a request runs on it, an admit with an adapter that is not resident, and a block that is shared between the base model and an adapter.',
    plan: planOf('adapter_pages', EVERY),
  },
  {
    id: 'gauntlet',
    label: 'seeded churn: the invariants after every operation',
    stage: 6,
    seeded: true,
    defaultSeed: 0x4b06,
    catches:
      'Everything the five above miss: page conservation, reference counts, block tables per group rule, the cache and the free queue, adapters and their users, and every block published exactly once, checked after each of about 2,000 operations on four pools, and a reset that is accepted while a request runs.',
    plan: planOf('gauntlet', `${EVERY}, and the eight invariants after each`),
  },
]
