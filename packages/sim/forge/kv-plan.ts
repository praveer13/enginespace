// A plan that drives a learner's hybrid KV manager over the wire of kv-wire.ts and judges it with `kvJudge` (ARCHITECTURE §5.4, §8.3).
//
// The oracle is `kvReference`, which runs beside the module on every operation of the plan. After each operation the plan asks the
// module for its state (`pages`, `queue`, `requests`, `adapters`, `cache`) and for the events it published, and builds from the
// replies what `kvJudge` wants: a `KvModel` whose answers are the module's. `kvJudge` then asks, for each operation, the questions of
// its header: is the reply the reference's, is a hit the intersection, did a refusal change nothing, do the eight invariants hold on the
// state the module reports, and are the events the reference's. It stops at the first operation that fails any of them.
//
// A plan is a list of segments. A segment is a spec and a list of operations: the module is started on its spec with `init`, the
// reference is made new, and the operations run in batches of about a dozen with their queries. Nothing a segment leaves behind
// reaches the next, so a script that ends with the pool in an odd state does not disturb the stream that follows.

import { kvConsume, kvConsumerEntries, kvJudge, kvReference } from '../kv'
import type { KvConsumerCounts, KvEvent, KvEventBatch, KvJudgement, KvModel, KvOp, KvResult, KvSpec, KvState } from '../kv'
import { BATCH, shown, wrongReply } from './plan'
import type { CheckPlan } from './plan'
import {
  describeOp,
  digestEvent,
  isProblem,
  parseWireAdapters,
  parseWireCache,
  parseWireEvents,
  parseWirePages,
  parseWireQueue,
  parseWireReply,
  parseWireRequests,
  WIRE_MAX_POOL,
  WIRE_QUERIES,
  wireOp,
  wireSpec,
} from './kv-wire'

export interface KvSegment {
  /** Names the segment in a message: "the 112-token request", "stream 2 of 4". */
  readonly name: string
  readonly spec: KvSpec
  readonly ops: readonly KvOp[]
}

/** The queries that describe a state: all but `events`. */
const STATE_QUERIES = WIRE_QUERIES.filter((query) => query !== 'events')
/** Commands for one operation: the operation, then each query. */
const GROUP = 1 + WIRE_QUERIES.length
/** Commands that start a segment: `init`, then the state queries (nothing has been published yet, so there is no `events`). */
const START = 1 + STATE_QUERIES.length

/** The most characters of a message about a failed operation. A learner reads it on a result row. */
const MESSAGE_CHARS = 700
/** The most failures one message lists. */
const FAILURES_LISTED = 3

/** The module's answers to one operation and the queries after it, parsed. */
interface Answers {
  readonly result: KvResult
  readonly events: readonly KvEvent[]
}

/** A manager whose answers are those a module gave: `kvJudge` asks `apply`, then `state`, then `events`, operation by operation. */
class Replay implements KvModel {
  private applied = 0
  private looked = 0
  private pushed = 0
  private readonly log: KvEventBatch[] = []
  private readonly answers: readonly Answers[]
  private readonly states: readonly KvState[]
  /** The index in its segment of the first operation, which is the `ts` of its events. */
  private readonly firstTs: number

  constructor(answers: readonly Answers[], states: readonly KvState[], firstTs: number) {
    this.answers = answers
    this.states = states
    this.firstTs = firstTs
  }

  apply(): KvResult {
    return this.answers[this.applied++].result
  }

  state(): KvState {
    return this.states[this.looked++]
  }

  events(): readonly KvEventBatch[] {
    for (; this.pushed < this.applied; this.pushed++) {
      const events = this.answers[this.pushed].events
      if (events.length > 0) this.log.push([this.firstTs + this.pushed, events])
    }
    return this.log
  }
}

/** The reference, seen through a window that opens where a batch began, with the tokens of its stored runs digested as the module's are. */
class Window implements KvModel {
  private readonly inner: KvModel
  private readonly from: number

  constructor(inner: KvModel) {
    this.inner = inner
    this.from = inner.events().length
  }

  apply(op: KvOp): KvResult {
    return this.inner.apply(op)
  }

  state(): KvState {
    return this.inner.state()
  }

  events(): readonly KvEventBatch[] {
    return this.inner.events().slice(this.from).map(([ts, events]): KvEventBatch => [ts, events.map(digestEvent)])
  }
}

function describeFailure(segment: KvSegment, n: number, judgement: KvJudgement): string {
  const lead = `${segment.name}, operation ${n} of ${segment.ops.length}: ${describeOp(judgement.op)}`
  const listed = judgement.failures.slice(0, FAILURES_LISTED).map((f) => `${f.check}: ${f.message}`)
  const more = judgement.failures.length > FAILURES_LISTED ? ` (and ${judgement.failures.length - FAILURES_LISTED} more)` : ''
  const text = `${lead}: ${listed.join('; ')}${more}`
  return text.length > MESSAGE_CHARS ? `${text.slice(0, MESSAGE_CHARS)}…` : text
}

/** `query` was answered `reply`, which cannot be read. */
const unreadable = (query: string, reply: string, problem: string): string => `${query} was answered ${shown(reply)}, which cannot be read: ${problem}`

/** What a batch holds: whether it starts a segment, and the operations whose commands it carries. */
interface Sent {
  readonly segment: KvSegment
  readonly starts: boolean
  /** Index in the segment of the first operation of the batch. */
  readonly first: number
  readonly ops: readonly KvOp[]
  readonly commands: readonly string[]
}

/** A plan from segments. `passed` is the sentence for a green check. */
export function kvPlan(segments: readonly KvSegment[], passed: string): CheckPlan {
  for (const s of segments) {
    if (s.spec.poolPages > WIRE_MAX_POOL) throw new RangeError(`segment "${s.name}": a pool of ${s.spec.poolPages} pages has queries that do not fit a reply (${WIRE_MAX_POOL} at most)`)
  }
  let segmentAt = 0
  let opAt = 0
  let started = false
  let reference: KvModel | null = null
  let consumer: KvConsumerCounts = new Map()
  /** The module's state after the last operation judged, which the next batch's first operation starts from. */
  let last: KvState | null = null
  let sent: Sent | null = null

  /** The state a module reports in the five replies from `at`. */
  function readState(replies: readonly string[], at: number, spec: KvSpec, step: number): KvState | string {
    const pages = parseWirePages(replies[at], spec.poolPages)
    if (isProblem(pages)) return unreadable('pages', replies[at], pages.problem)
    const queue = parseWireQueue(replies[at + 1])
    if (isProblem(queue)) return unreadable('queue', replies[at + 1], queue.problem)
    const requests = parseWireRequests(replies[at + 2], spec.groups.length)
    if (isProblem(requests)) return unreadable('requests', replies[at + 2], requests.problem)
    const adapters = parseWireAdapters(replies[at + 3])
    if (isProblem(adapters)) return unreadable('adapters', replies[at + 3], adapters.problem)
    const cache = parseWireCache(replies[at + 4])
    if (isProblem(cache)) return unreadable('cache', replies[at + 4], cache.problem)
    return {
      pages: pages.value,
      queue: queue.value,
      requests: requests.value,
      adapters: adapters.value,
      cache: cache.value,
      consumer: kvConsumerEntries(consumer),
      step,
    }
  }

  return {
    next() {
      while (segmentAt < segments.length) {
        const segment = segments[segmentAt]
        const commands: string[] = []
        const ops: KvOp[] = []
        const starts = !started
        if (starts) {
          started = true
          reference = kvReference(segment.spec)
          consumer = new Map()
          last = null
          commands.push(wireSpec(segment.spec), ...STATE_QUERIES)
        }
        const first = opAt
        while (opAt < segment.ops.length && commands.length + GROUP <= BATCH) {
          const op = segment.ops[opAt++]
          ops.push(op)
          commands.push(wireOp(op), ...WIRE_QUERIES)
        }
        if (!starts && ops.length === 0) {
          segmentAt += 1
          opAt = 0
          started = false
          continue
        }
        sent = { segment, starts, first, ops, commands }
        return commands
      }
      return null
    },

    judge(replies) {
      if (sent === null || reference === null) return 'the plan has sent nothing'
      const { segment, starts, first, ops, commands } = sent
      if (replies.length !== commands.length) return `the module answered ${replies.length} of the ${commands.length} commands sent`
      const spec = segment.spec
      let at = 0

      if (starts) {
        if (replies[0] !== 'ok') return wrongReply('init', 'ok', replies[0], `the module did not start for ${segment.name}`)
        const initial = readState(replies, 1, spec, 0)
        if (typeof initial === 'string') return `${segment.name}, at the start: ${initial}`
        last = initial
        at = START
      }
      if (last === null) return 'the plan has no state to start from'

      const answers: Answers[] = []
      const states: KvState[] = [last]
      for (const [k, op] of ops.entries()) {
        const n = first + k
        const where = `${segment.name}, operation ${n + 1} of ${segment.ops.length}: ${describeOp(op)}`
        const result = parseWireReply(op, replies[at])
        if (isProblem(result)) return `${where}: ${unreadable(wireOp(op).split(' ')[0], replies[at], result.problem)}`
        const events = parseWireEvents(replies[at + GROUP - 1], spec)
        if (isProblem(events)) return `${where}: ${unreadable('events', replies[at + GROUP - 1], events.problem)}`
        for (const event of events.value) kvConsume(consumer, event)
        const state = readState(replies, at + 1, spec, n + 1)
        if (typeof state === 'string') return `${where}: ${state}`
        answers.push({ result: result.value, events: events.value })
        states.push(state)
        at += GROUP
      }
      last = states[states.length - 1]

      const judgement = kvJudge(spec, ops, new Replay(answers, states, first), new Window(reference))
      return judgement === null ? null : describeFailure(segment, first + judgement.at + 1, judgement)
    },

    passed: () => passed,
  }
}
