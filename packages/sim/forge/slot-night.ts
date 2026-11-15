// The slot-baseline readout of the `hybrid-kv` lab (TR5a §5, D-042): one night of adapter churn, played by one engine on the learner's pool
// and on the model the engines use at the pins, and the two counted side by side.
//
// TR5a §5: "After s5, the lab page runs the learner's module and the slot model on the same seeded adapter-churn workload and prints
// admitted requests and adapter loads for each. This is a readout, not a pass bar: the lesson is what unified paging buys and when slots
// are enough." So there are three parts, and each is here:
//
//   the night     requests that arrive over a number of steps, each on one of two adapters or on none, drawn from a seed. It is data, and it is
//                 the same for every manager (`slotWorkload`).
//   the engine    the policy that plays the night against any manager: first come, first served, a request hangs when its adapter is in and
//                 its pages are free, and an adapter that does not fit makes room by sending back the one nobody is using. It is the same for
//                 every manager too, so the rows differ by the manager and by nothing else (`playSlotNight`).
//   the managers  the pool of the lab, which keeps adapters as pages of the one pool (the reference), and the same pool with `adapterSlots`,
//                 which keeps them in that many fixed slots outside it, as vLLM and SGLang do at the pins. A slot takes no page in the model:
//                 `KvSpec.adapterSlots` says so, and so does the readout.
//
// The engine plays the night on the reference, and the learner's module is given the operations it chose, one command each over the wire, and
// asked nothing else (`slotNightPlan`): the module's replies are counted as they come. A module that answers as the reference does gets the
// reference's row, and one that does not gets the row of what it did, with the first operation where the two part. The slot rows need no module.
// Nothing here is graded or recorded: the plan fails only on a reply that cannot be read, which is a module that left the wire.

import { between, below, chance, pick, rngFor } from '../core'
import type { Seed } from '../core'
import { kvAdapterCatalog, kvReference } from '../kv'
import type { KvAdapterSpec, KvModel, KvOp, KvResult, KvSpec } from '../kv'
import { HYBRID_KV_SPECS } from './hybrid-kv'
import { describeOp, isProblem, parseWireReply, wireOp, wireReply, wireSpec } from './kv-wire'
import { BATCH, shown, wrongReply } from './plan'
import type { CheckPlan } from './plan'

/** The seed of the night that the lab's page plays. A fixed one, since a readout is for comparing your module with itself from one build to the next. */
export const SLOT_NIGHT_SEED: Seed = 0x4b07

/**
 * The night, and the engine that plays it. Every figure is a design parameter [estimated]: the pool is the adapter stage's (the lab's
 * `one-group` pool of 20 pages), and its adapters are the Pool game's two smallest, of rank 8 and 16, which take 4 and 8 pages [derived from
 * `kvAdapterCatalog`]. Together they are 12 of the 20 pages [derived], so the night is one in which adapters and KV compete for the pool.
 */
export const SLOT_NIGHT = {
  /** Requests that arrive. */
  arrivals: 60,
  /** Steps the night lasts. A request still in the line when it ends was not admitted. */
  steps: 80,
  /** Requests running at once: the clips of the rail. */
  clips: 4,
  /** The ranks of the adapters in play. */
  ranks: [8, 16],
  /** The share of requests that run on an adapter, in permille. The others run on the base model. */
  adapterShare: 800,
  /** The prompt of a request, in tokens: 2 to 4 pages of 16 tokens. */
  prompt: { min: 17, max: 64 },
  /** The steps a request runs for after it hangs. */
  decode: { min: 3, max: 9 },
  /**
   * The slot models, by their number of slots. One is vLLM's default `max_loras` at v0.33.0 (vllm.lora.max-loras-default), and two is one for
   * each adapter of the night: enough slots, which cost no pages here.
   */
  slotCounts: [1, 2],
} as const

/** What a manager made of the night. */
export interface SlotRow {
  /** Requests it admitted before the night ended. */
  readonly admitted: number
  /** Adapter loads it accepted. */
  readonly loads: number
}

/** One request of the night. */
export interface SlotRequest {
  /** The step at which it arrives. */
  readonly arrive: number
  /** The adapter it runs on, or null for the base model. */
  readonly adapter: number | null
  /** Its prompt, in tokens. The tokens of two requests never match, so the night has no prefix hit to blur what it counts. */
  readonly tokens: number
  /** The steps it runs for. */
  readonly decode: number
}

/**
 * The requests of a night, in arrival order. The draws are, for each request, the gap to the one before (0 to 2 steps), the coin for its
 * adapter and which one, the length of its prompt and the steps it runs for, on the stream `forge/slot-night` of the seed.
 */
export function slotWorkload(seed: Seed): readonly SlotRequest[] {
  const rng = rngFor(seed, 'forge/slot-night')
  const ids = SLOT_NIGHT.ranks.map((_, id) => id)
  const requests: SlotRequest[] = []
  let at = 0
  for (let i = 0; i < SLOT_NIGHT.arrivals; i++) {
    at += below(rng, 3)
    const adapter = chance(rng, SLOT_NIGHT.adapterShare) ? pick(rng, ids) : null
    const tokens = between(rng, SLOT_NIGHT.prompt.min, SLOT_NIGHT.prompt.max)
    const decode = between(rng, SLOT_NIGHT.decode.min, SLOT_NIGHT.decode.max)
    requests.push({ arrive: at, adapter, tokens, decode })
  }
  return requests
}

/** A night as one manager played it: the operations the engine sent, the manager's reply to each, and what it came to. */
export interface PlayedNight extends SlotRow {
  readonly ops: readonly KvOp[]
  readonly replies: readonly KvResult[]
}

/**
 * The engine plays `requests` on `model` for `steps` steps. Each step the arrivals join the line, each running request spends a step, and
 * the ones that are done are finished; then, in the order they came, the line hangs requests while a clip is free:
 *
 *   - a request on an adapter that is not in asks for it to be loaded. If the manager refuses (no pages, or no slot), the engine sends back the
 *     adapter that nobody is running on and that was used longest ago, and asks again, until the adapter is in or none can be sent back;
 *   - a request whose adapter is in asks to be admitted. A refusal (no pages) ends the step for the whole line: nobody jumps the queue.
 *
 * The engine knows only what the manager's replies tell it, as an engine does, and so it plays any manager the same way.
 */
export function playSlotNight(model: KvModel, requests: readonly SlotRequest[], adapters: readonly KvAdapterSpec[], steps: number): PlayedNight {
  const ops: KvOp[] = []
  const replies: KvResult[] = []
  const send = (op: KvOp): KvResult => {
    const reply = model.apply(op)
    ops.push(op)
    replies.push(reply)
    return reply
  }
  const pagesOf = new Map(adapters.map((a) => [a.id, a.pages]))
  /** The adapters the manager said yes to, and the step each was last used on. */
  const resident = new Map<number, number>()
  const running: { id: number; adapter: number | null; left: number }[] = []
  const waiting: number[] = []
  let arrived = 0
  let admitted = 0
  let loads = 0

  /** Whether `adapter` is in, loading it and sending back an idle one to make room if that is what it takes. */
  const bringIn = (adapter: number): boolean => {
    const pages = pagesOf.get(adapter) as number
    for (;;) {
      if (send({ op: 'load-adapter', adapter, pages }).ok) {
        loads += 1
        resident.set(adapter, 0)
        return true
      }
      // Oldest use first; ties by id, so that the order is the same on every engine.
      const idle = [...resident.keys()].filter((a) => !running.some((r) => r.adapter === a)).sort((a, b) => (resident.get(a) as number) - (resident.get(b) as number) || a - b)
      if (idle.length === 0 || !send({ op: 'unload-adapter', adapter: idle[0] }).ok) return false
      resident.delete(idle[0])
    }
  }

  for (let step = 0; step < steps; step++) {
    while (arrived < requests.length && requests[arrived].arrive <= step) waiting.push(arrived++)
    for (const r of [...running]) {
      r.left -= 1
      if (r.left > 0) continue
      send({ op: 'finish', req: r.id })
      running.splice(running.indexOf(r), 1)
    }
    while (waiting.length > 0 && running.length < SLOT_NIGHT.clips) {
      const id = waiting[0]
      const request = requests[id]
      if (request.adapter !== null && !resident.has(request.adapter) && !bringIn(request.adapter)) break
      // Tokens id × 1,000 and up: a run of consecutive ids, which the wire writes as `first+count`.
      const prompt = Array.from({ length: request.tokens }, (_, i) => id * 1000 + i)
      const reply = send(request.adapter === null ? { op: 'admit', req: id, prompt } : { op: 'admit', req: id, prompt, adapter: request.adapter })
      if (!reply.ok) break
      admitted += 1
      if (request.adapter !== null) resident.set(request.adapter, step)
      running.push({ id, adapter: request.adapter, left: request.decode })
      waiting.shift()
    }
  }
  return { ops, replies, admitted, loads }
}

/** One slot model's night. */
export interface SlotBaseline {
  readonly slots: number
  readonly row: SlotRow
  /** The operations the engine sent it. */
  readonly ops: readonly KvOp[]
}

/** The night, played on the sim: the pool's row and the slot models', and what a module has to be sent. */
export interface SlotNight {
  readonly seed: Seed
  readonly arrivals: number
  readonly steps: number
  /** The pool, in which adapters are pages: `init` is this spec. */
  readonly spec: KvSpec
  readonly adapters: readonly KvAdapterSpec[]
  readonly requests: readonly SlotRequest[]
  /** What the reference does with the night, with adapters as pages. */
  readonly pool: SlotRow
  /** The operations the engine sent the reference, and the reference's reply to each: what a right module is sent and answers. */
  readonly script: readonly KvOp[]
  readonly expected: readonly KvResult[]
  /** The same night on the same pool with fixed slots, one baseline for each count of slots. */
  readonly slots: readonly SlotBaseline[]
}

/** The night of `seed` on the sim: the reference with adapters as pages, and the same pool with each count of slots. */
export function slotNight(seed: Seed = SLOT_NIGHT_SEED): SlotNight {
  const spec = HYBRID_KV_SPECS['one-group']
  const adapters = kvAdapterCatalog(spec, SLOT_NIGHT.ranks)
  const requests = slotWorkload(seed)
  const pool = playSlotNight(kvReference(spec), requests, adapters, SLOT_NIGHT.steps)
  const slots = SLOT_NIGHT.slotCounts.map((count): SlotBaseline => {
    const played = playSlotNight(kvReference({ ...spec, adapterSlots: count }), requests, adapters, SLOT_NIGHT.steps)
    return { slots: count, row: { admitted: played.admitted, loads: played.loads }, ops: played.ops }
  })
  return {
    seed,
    arrivals: requests.length,
    steps: SLOT_NIGHT.steps,
    spec,
    adapters,
    requests,
    pool: { admitted: pool.admitted, loads: pool.loads },
    script: pool.ops,
    expected: pool.replies,
    slots,
  }
}

/** What a module did with the night. */
export interface SlotYours extends SlotRow {
  /** The first operation at which the module's reply is not the reference's, in a sentence, or null when it answered the whole night alike. */
  readonly differs: string | null
}

/** The conversation that sends the night to a module, and counts what it answers. */
export interface SlotNightPlan extends CheckPlan {
  /** The module's row, once every reply has been read, and null before that or when a reply could not be read. */
  yours(): SlotYours | null
}

/**
 * The night as a plan for the invoke protocol (src/forge/invoke.ts): `init` for the pool, then the operations of the script, a hundred
 * commands to a batch. The plan judges nothing but the wire: a reply that is not a reply to its command ends it, with the sentence that says
 * so, and every other reply is counted, whether or not it is the reference's. Where it is not, the plan keeps the first such operation.
 */
export function slotNightPlan(night: SlotNight): SlotNightPlan {
  const lines = [wireSpec(night.spec), ...night.script.map(wireOp)]
  let sent = 0
  let from = 0
  let size = 0
  let admitted = 0
  let loads = 0
  let differs: string | null = null
  let read = false
  return {
    next() {
      if (sent >= lines.length) return null
      from = sent
      size = Math.min(BATCH, lines.length - sent)
      sent += size
      return lines.slice(from, from + size)
    },

    judge(replies) {
      if (replies.length !== size) return `the module answered ${replies.length} of the ${size} commands sent`
      for (const [i, reply] of replies.entries()) {
        const at = from + i
        if (at === 0) {
          if (reply !== 'ok') return wrongReply('init', 'ok', reply, 'the module did not start for the night')
          continue
        }
        const op = night.script[at - 1]
        const got = parseWireReply(op, reply)
        if (isProblem(got)) return `operation ${at} of ${night.script.length}, ${describeOp(op)}: the reply ${shown(reply)} cannot be read: ${got.problem}`
        if (got.value.ok && op.op === 'admit') admitted += 1
        if (got.value.ok && op.op === 'load-adapter') loads += 1
        const expected = wireReply(night.expected[at - 1])
        if (differs === null && reply !== expected) {
          differs = `operation ${at} of ${night.script.length}, ${describeOp(op)}: the model answers ${shown(expected)}, and the module answered ${shown(reply)}`
        }
      }
      read = sent >= lines.length
      return null
    },

    passed: () => `admitted ${admitted} of ${night.arrivals} requests and loaded adapters ${loads} times`,

    yours: () => (read ? { admitted, loads, differs } : null),
  }
}
