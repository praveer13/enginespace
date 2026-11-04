// The toy lab's oracle: a rotation, and the five checks that the site fires at a learner's module (labs/forge/toy, ARCHITECTURE §8.3).
//
// The rotation is the order the reach-in's pans would be dumped in: the front is the pan nobody has touched for the longest. Touching a
// pan the reach-in holds keeps it, and sends it to the back. Touching one it does not hold brings it in at the back, and when the
// reach-in is full the front is dumped first to make room (GAMES.md §2.6: "the rotation", "dumping a pan"). In the engine's words that is
// an LRU free queue.
//
// The wire is the crate's (labs/forge/toy/src/lib.rs). One command goes in through `ks_invoke` and one line comes out:
//
//   init <capacity>   a fresh, empty rotation of 1 to 4096 pans          → ok
//   touch <key>       touch a key                                        → hit | miss | miss dump <key>
//   len               how many keys are held                             → <n>
//   order             the keys, next to dump first                       → <k>,<k>,... | -
//
// The crate's own checks (`cargo test`) ask the same questions in Rust. The site's are these, and credit comes only from these. The two
// lists must agree on ids, labels and stages, and verify:labs fails when they do not.

import { between, below, rngFor } from '../core'
import type { Seed } from '../core'
import { BATCH, scripted, wrongReply } from './plan'
import type { CheckPlan, Exchange } from './plan'

/** The most pans the wire accepts. */
export const MAX_CAPACITY = 4096

/** The rotation as it should behave: the model every reply is judged against. */
export interface RotationModel {
  /** What touching `key` answers on the wire. */
  touch(key: number): string
  /** How many keys are held. */
  size(): number
  /** The keys on the wire: next to dump first, or `-` when none is held. */
  order(): string
}

export function createRotation(capacity: number): RotationModel {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) throw new RangeError(`a rotation holds 1 to ${MAX_CAPACITY} keys, got ${capacity}`)
  /** The front is the next to dump. */
  const keys: number[] = []
  return {
    touch(key) {
      const at = keys.indexOf(key)
      if (at >= 0) {
        keys.splice(at, 1)
        keys.push(key)
        return 'hit'
      }
      const dumped = keys.length === capacity ? keys.shift() : undefined
      keys.push(key)
      return dumped === undefined ? 'miss' : `miss dump ${dumped}`
    },
    size: () => keys.length,
    order: () => (keys.length === 0 ? '-' : keys.join(',')),
  }
}

/** A check of a lab as the site knows it: what the module's `list` must say, and what the host sends. */
export interface PlannedCheck {
  id: string
  label: string
  /** The stage it belongs to (1 is the two-minute win). */
  stage: number
  /** Whether the commands come from the seed. An unseeded check ignores it. */
  seeded: boolean
  /** The seed that `cargo test` and a practice run use. */
  defaultSeed: Seed
  /** The mistake it catches, for the result panel. */
  catches: string
  /** The conversation for this seed. */
  plan(seed: Seed): CheckPlan
}

const say = (send: string, expect: string, note?: string): Exchange => (note === undefined ? { send, expect } : { send, expect, note })

/** `touch 1 … touch n`, each a miss that finds room. */
const fillTo = (n: number): Exchange[] => Array.from({ length: n }, (_, i) => say(`touch ${i + 1}`, 'miss'))

const fillPlan = (): CheckPlan =>
  scripted(
    [say('init 4', 'ok'), ...fillTo(4), say('len', '4'), say('order', '1,2,3,4', 'the order is the order the keys came in')],
    'four keys fit, in the order they came',
  )

const hitsPlan = (): CheckPlan =>
  scripted(
    [
      say('init 3', 'ok'),
      ...fillTo(3),
      say('touch 1', 'hit', 'a held key is a hit'),
      say('order', '2,3,1', 'a hit moves the key to the back'),
      say('len', '3', 'a hit brings in nothing'),
    ],
    'a held key is a hit, and it goes to the back',
  )

const dumpPlan = (): CheckPlan =>
  scripted(
    [
      say('init 3', 'ok'),
      ...fillTo(3),
      say('touch 4', 'miss dump 1', 'a full rotation dumps its front'),
      say('order', '2,3,4'),
      say('len', '3', 'the rotation stays full'),
      say('touch 1', 'miss dump 2', 'a dumped key is gone, so touching it again is a miss'),
      say('order', '3,4,1'),
    ],
    'the front is dumped, and the rotation stays full',
  )

const recencyPlan = (): CheckPlan =>
  scripted(
    [
      say('init 3', 'ok'),
      ...fillTo(3),
      say('touch 1', 'hit'),
      say('touch 4', 'miss dump 2', 'the dump goes by the last touch, not by arrival'),
      say('order', '3,1,4'),
    ],
    'the key touched most recently outlives the one that came later',
  )

/** The touches of the seeded run. */
export const CHURN_TOUCHES = 2000
/** After every this many touches the run asks for the count and the whole order. */
export const CHURN_QUERY_EVERY = 25

/**
 * The seeded run: the seed draws a capacity of 3 to 8 pans and 2,000 touches over twice as many keys, and every reply is judged against
 * the model. After every 25th touch the run asks `len` and `order` too, so a rotation that is right in its replies and wrong inside
 * does not pass. A touch is sent in batches of 100, and the queries ride in the batch of the touch they follow.
 */
export function churnPlan(seed: Seed): CheckPlan {
  const rng = rngFor(seed, 'forge/toy/churn')
  const capacity = between(rng, 3, 8)
  const keyspace = capacity * 2
  const model = createRotation(capacity)
  let touched = 0
  let started = false
  let commands: string[] = []
  let wants: string[] = []
  /** Which touch each command of the batch belongs to: its own, or the one a query follows. */
  let belongs: number[] = []
  return {
    next() {
      if (touched >= CHURN_TOUCHES) return null
      commands = []
      wants = []
      belongs = []
      if (!started) {
        started = true
        commands.push(`init ${capacity}`)
        wants.push('ok')
        belongs.push(-1)
      }
      const end = Math.min(touched + BATCH, CHURN_TOUCHES)
      for (; touched < end; touched++) {
        const key = 1 + below(rng, keyspace)
        commands.push(`touch ${key}`)
        wants.push(model.touch(key))
        belongs.push(touched)
        if (touched % CHURN_QUERY_EVERY === CHURN_QUERY_EVERY - 1) {
          commands.push('len', 'order')
          wants.push(String(model.size()), model.order())
          belongs.push(touched, touched)
        }
      }
      return commands
    },
    judge(replies) {
      if (replies.length !== commands.length) return `the module answered ${replies.length} of the ${commands.length} commands sent`
      for (let i = 0; i < commands.length; i++) {
        if (replies[i] === wants[i]) continue
        const where = belongs[i] < 0 ? 'at the start' : commands[i].startsWith('touch') ? `touch ${belongs[i] + 1} of ${CHURN_TOUCHES}` : `after touch ${belongs[i] + 1} of ${CHURN_TOUCHES}`
        return wrongReply(commands[i], wants[i], replies[i], where)
      }
      return null
    },
    passed: () => `${CHURN_TOUCHES} touches on ${capacity} pans, every reply and every order as the model has them`,
  }
}

/** The five checks of the toy lab, in grading order. */
export const TOY_CHECKS: readonly PlannedCheck[] = [
  {
    id: 'fill',
    label: 'fill an empty rotation',
    stage: 1,
    seeded: false,
    defaultSeed: 0,
    catches: 'A rotation that cannot hold what it was sized for, or loses the order the keys came in.',
    plan: fillPlan,
  },
  {
    id: 'hits',
    label: 'a held key is a hit and goes to the back',
    stage: 1,
    seeded: false,
    defaultSeed: 0,
    catches: 'A touch of a held key that is not a hit, that leaves the key where it was, or that brings in a second copy.',
    plan: hitsPlan,
  },
  {
    id: 'dump',
    label: 'a full rotation dumps its front',
    stage: 2,
    seeded: false,
    defaultSeed: 0,
    catches: 'A full rotation that dumps the wrong key, dumps none, or does not make room.',
    plan: dumpPlan,
  },
  {
    id: 'recency',
    label: 'a hit saves a key from the next dump',
    stage: 3,
    seeded: false,
    defaultSeed: 0,
    catches: 'A rotation that dumps by arrival, first in and first out, and not by the last touch.',
    plan: recencyPlan,
  },
  {
    id: 'churn',
    label: 'seeded touches: every reply, and the whole order',
    stage: 4,
    seeded: true,
    defaultSeed: 0x70c1,
    catches: 'Everything the four above miss: a seeded run of touches, with the count and the whole order asked every few touches.',
    plan: churnPlan,
  },
]
