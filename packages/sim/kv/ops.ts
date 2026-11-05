// Seeded operation streams for a hybrid KV manager (ARCHITECTURE §5.4, `kvOps`): what the property tests, the lab's gauntlet and the
// goldens feed a manager.
//
// A stream is a fixed list, drawn from the seed alone, and it plays the way an engine's workload does (GAMES.md §8, "Core loop"):
//   - conversations of several turns, in which each turn's prompt extends the last turn's whole sequence, prompt and reply, so that the
//     cache has something to hit and the groups' windows have something to keep;
//   - shared system prompts that several conversations start from, so that a block is shared between requests;
//   - decode steps that append a few tokens, now and then many, so that blocks fill and windows move;
//   - requests that finish, and a request that cannot grow and is let go, as a preempted one is (vllm.scheduler.preemption-recompute);
//   - when the spec has adapters, loads and unloads of them, and conversations that run on one;
//   - the occasional reset, when the pool is at rest;
//   - now and then a call the manager must refuse and leave no trace of: a request that does not exist, one that exists already, an
//     adapter that is not resident or is in use, a reset with a request running.
// The generator runs the reference as it goes, so it knows which requests are running and which adapters are resident, and a stream is
// valid at every step for a manager that answers as the reference does. It is not tuned to succeed: a pool that is full refuses an admit,
// and the stream carries on, because the refusals are half of what a manager has to get right.

import { between, below, chance, pick, rngFor, weighted } from '../core/rng'
import type { Rng } from '../core/rng'
import type { Seed } from '../core/types'
import { KvReference } from './reference'
import type { KvOp, KvSpec } from './types'

/** The adapters a stream may load: the id, and the pages a load takes. */
export interface KvOpsAdapter {
  readonly id: number
  readonly pages: number
}

export interface KvOpsProfile {
  /** Requests that may run at once. */
  readonly maxRunning: number
  /** Conversations that take turns. */
  readonly sessions: number
  /** System prompts that conversations may start from. */
  readonly sharedPrompts: number
  /** The adapters that conversations may run on. None by default. */
  readonly adapters: readonly KvOpsAdapter[]
  /** Weight of a reset when the pool is at rest, against 100 for the other things a step may do. */
  readonly resetWeight: number
  /** The longest a conversation's sequence may grow, in tokens, before it starts over. 0 means 10 of the widest blocks. */
  readonly sequenceCap: number
}

const DEFAULTS: KvOpsProfile = { maxRunning: 4, sessions: 6, sharedPrompts: 3, adapters: [], resetWeight: 2, sequenceCap: 0 }

/** Token ids come from this many values: enough that two random blocks never match, few enough to read. */
const VOCAB = 50000

/** The id of a request or an adapter that no stream ever makes, for the calls that must be refused for naming one that is not there. */
const NOBODY = 1_000_000_000

interface Session {
  seq: number[]
  adapter: number | null
  turns: number
  running: boolean
}

interface Running {
  readonly req: number
  readonly session: number
  /** Decode steps left before the request finishes. */
  left: number
  tokens: number[]
}

const tokens = (rng: Rng, count: number): number[] => Array.from({ length: count }, () => below(rng, VOCAB))

/** `n` operations for `spec` from `seed`. */
export function kvOps(seed: Seed, spec: KvSpec, n: number, profile: Partial<KvOpsProfile> = {}): readonly KvOp[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`a stream has a non-negative number of operations, got ${n}`)
  const p: KvOpsProfile = { ...DEFAULTS, ...profile }
  if (p.sessions < 1 || p.maxRunning < 1) throw new RangeError('a stream needs a conversation to take turns and a request to run')
  const rng = rngFor(seed, 'kv/ops')
  const model = new KvReference(spec)
  const unit = spec.groups.reduce((most, g) => Math.max(most, g.blockTokens), 1)
  const cap = p.sequenceCap > 0 ? p.sequenceCap : 10 * unit

  const system = Array.from({ length: p.sharedPrompts }, () => tokens(rng, between(rng, unit + 3, 4 * unit + 5)))
  const sessions: Session[] = Array.from({ length: p.sessions }, () => ({ seq: [], adapter: null, turns: 0, running: false }))
  const running: Running[] = []
  const resident = new Map<number, number>()
  const ops: KvOp[] = []
  let nextReq = 0

  const emit = (op: KvOp) => {
    ops.push(op)
    return model.apply(op)
  }

  const begin = (s: Session): void => {
    s.seq = system.length > 0 && chance(rng, 700) ? pick(rng, system).slice() : []
    s.turns = 0
    const options: (number | null)[] = [null]
    resident.forEach((_, id) => options.push(id))
    options.sort((a, b) => (a ?? -1) - (b ?? -1))
    s.adapter = pick(rng, options)
  }
  for (const s of sessions) begin(s)

  const letGo = (r: Running): void => {
    emit({ op: 'finish', req: r.req })
    running.splice(running.indexOf(r), 1)
    const s = sessions[r.session]
    s.running = false
    s.seq = r.tokens
    s.turns++
    if (s.turns >= between(rng, 3, 6) || s.seq.length > cap) begin(s)
  }

  while (ops.length < n) {
    const idle: number[] = []
    sessions.forEach((s, i) => {
      if (!s.running) idle.push(i)
    })
    const missing = p.adapters.filter((a) => !resident.has(a.id))
    const unused = p.adapters.filter((a) => resident.has(a.id) && !running.some((r) => sessions[r.session].adapter === a.id))
    const weights = [
      running.length < p.maxRunning && idle.length > 0 ? 26 : 0, // admit
      running.length > 0 ? 40 : 0, // append
      running.length > 0 ? 14 + (running.length >= p.maxRunning ? 20 : 0) : 0, // finish
      missing.length > 0 ? 4 : 0, // load
      unused.length > 0 ? 2 : 0, // unload
      running.length === 0 ? p.resetWeight : 0, // reset
      3, // a call to be refused
    ]
    const act = weighted(rng, weights)

    if (act === 0) {
      const s = sessions[pick(rng, idle)]
      if (s.adapter !== null && !resident.has(s.adapter)) s.adapter = null
      const ask = chance(rng, 80) ? between(rng, 4 * unit, 10 * unit) : between(rng, 2, 3 * unit)
      const prompt = s.seq.concat(tokens(rng, ask))
      const req = nextReq++
      const result = emit(s.adapter === null ? { op: 'admit', req, prompt } : { op: 'admit', req, prompt, adapter: s.adapter })
      if (result.ok) {
        s.running = true
        running.push({ req, session: sessions.indexOf(s), left: between(rng, 1, 14), tokens: prompt })
      } else if (chance(rng, 300)) {
        // A conversation that cannot be served starts over on another turn.
        begin(s)
      }
    } else if (act === 1) {
      const r = pick(rng, running)
      const count = chance(rng, 30) ? between(rng, unit, 3 * unit) : between(rng, 1, 3)
      const more = tokens(rng, count)
      const result = emit({ op: 'append', req: r.req, tokens: more })
      if (result.ok) {
        r.tokens = r.tokens.concat(more)
        r.left--
        if (r.left <= 0) letGo(r)
      } else {
        letGo(r)
      }
    } else if (act === 2) {
      letGo(pick(rng, running))
    } else if (act === 3) {
      const a = pick(rng, missing)
      const result = emit({ op: 'load-adapter', adapter: a.id, pages: a.pages })
      if (result.ok) resident.set(a.id, a.pages)
    } else if (act === 4) {
      const a = pick(rng, unused)
      const result = emit({ op: 'unload-adapter', adapter: a.id })
      if (result.ok) resident.delete(a.id)
    } else if (act === 5) {
      emit({ op: 'reset' })
    } else {
      const refused: KvOp[] = [
        { op: 'finish', req: NOBODY },
        { op: 'append', req: NOBODY, tokens: tokens(rng, 2) },
        { op: 'unload-adapter', adapter: NOBODY },
      ]
      if (running.length > 0) {
        refused.push({ op: 'admit', req: pick(rng, running).req, prompt: tokens(rng, 3) })
        refused.push({ op: 'reset' })
      }
      if (p.adapters.length > 0) {
        refused.push({ op: 'admit', req: NOBODY, prompt: tokens(rng, 3), adapter: NOBODY })
        const present = p.adapters.filter((a) => resident.has(a.id))
        if (present.length > 0) refused.push({ op: 'load-adapter', adapter: pick(rng, present).id, pages: 1 })
        const inUse = p.adapters.filter((a) => running.some((r) => sessions[r.session].adapter === a.id))
        if (inUse.length > 0) refused.push({ op: 'unload-adapter', adapter: pick(rng, inUse).id })
      }
      emit(pick(rng, refused))
    }
  }
  // A request that could not grow is let go in the same step, which can take a stream one operation past `n`.
  return ops.slice(0, n)
}
