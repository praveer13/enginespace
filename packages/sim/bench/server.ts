// The benchmark's server: the step-loop model run coarse (ARCHITECTURE §5.6: "async on, its step times from the S5 card"; WORLD §5).
//
// "Coarse" means the step loop with its host card at zero. A step then costs what the GPU card says and nothing else: no
// schedule, prepare, launch, sync or sample time on the CPU lane, so no bubbles to count, which is TR2's business. What stays is
// everything that decides a queue (the scheduler's rules, the token budget, the cap on running requests, chunked prefill) and the
// one effect async scheduling has when the CPU costs nothing: the engine has not read a stop when it schedules the next step, so a
// request that finished still rides one more step as a ghost (WORLD §2.6). Up to two steps are in flight, as in `runStepLoop`. A
// GPU card that puts a per-sequence host term on the CPU lane (S5 with `hostTerm: 'on-cpu'`, D-044) keeps that term there, since
// it is the card's own cost and not the host card's.
//
// That is a statement about `runStepLoop`, and tests/sim/bench-server.test.ts checks it: over 200 seeds, `runServer` and
// `runStepLoop` with a zero host card give the same first-token and last-token time for every request. TR8's knee and TR2's bubbles
// therefore come from one model, and when the step loop changes the test says so.
//
// Why a second implementation of the loop, and not a call to `runStepLoop`? A closed-loop client sends when a reply comes back, so
// arrivals depend on completions, and `runStepLoop` takes its whole workload up front. `runServer` is the same loop with a feed:
// `onFinish` can call `feed.arrive` for a time at or after the finish, and the loop picks the arrival up when its clock gets there.
// Open loops pass every arrival at the start and use no feed. When `runStepLoop` grows an incremental core, this file should become
// a thin caller of it.
//
// What the coarse server adds to the step loop, for the benchmark's flaws (A§5.6):
//   - `stalls`: windows when the engine's main thread is frozen (a long garbage collection, a stuck process). No step is launched
//     and no result is read back inside one; the GPU finishes what is already queued. The picture is the wrk2 README's stall of
//     1.4 s [unverified: GAMES.md §11 cites it, fetched 2026-11-03, and no task has re-read it].
//   - `cold`: a server that starts cold, with kernels uncompiled and graphs uncaptured. Steps whose forward starts before
//     `untilUs` take `slowdownPermille` / 1,000 times as long. kernelspace's broken-bench slowed one tick in four for the same
//     purpose, "a stand-in, labelled" (its `warm-up` flaw) [measured: kernelspace `src/lib/world/fleet-ex/broken-bench.ts` at d478f91,
//     read 2026-11-04]; this one is a stand-in too, and its `slowdownPermille` is [estimated].
//   - prefix hits (`cachedTokens`): the leading tokens of a prompt that a previous run left in the cache are not prefilled, though
//     their KV is read (the S5 load of a prefill chunk after `done` tokens).
//
// What it ignores is the steploop card's "Ignores" list: no KV capacity limit or preemption (the `kv` module's business), no
// graph padding or dispatch keys, no mask, speculation or adapters, no engine-core sleep when nothing can run, and no frontend.
// Tokens reach the client at the moment the engine reads them back: no network, HTTP or detokenization in between.

import { divRound } from '../core/int'
import type { Us } from '../core/types'
import { stepLoad } from '../physics'
import type { PhysicsRowKey, StepItem } from '../physics'
import { gpuCost, s5Card } from '../steploop'
import type { GpuCard, GpuWork, S5HostTerm } from '../steploop'

/** A window in which the engine's main thread does nothing: `[atUs, atUs + forUs)`. */
export interface Stall {
  readonly atUs: Us
  readonly forUs: Us
}

/** A cold start: until `untilUs`, a step whose forward starts takes `slowdownPermille` / 1,000 times as long (2,500 is 2.5 times). */
export interface ColdStart {
  readonly untilUs: Us
  readonly slowdownPermille: number
}

export interface ServerModel {
  /** The cap on requests running at once (vLLM's `max_num_seqs`). At least 1. */
  readonly maxNumSeqs: number
  /** One step's token budget (`max_num_batched_tokens`): running requests first, then waiting ones. At least 1. */
  readonly maxBatchedTokens: number
  /** Whether a prompt may be cut to fit the budget (on by default in vLLM at the pin, vllm M8). Off, a prompt must fit it whole. */
  readonly chunkedPrefill: boolean
  /** What a step costs on the GPU: kernelspace's S5 card on one of its rows, or the front page's ticks. */
  readonly gpu: GpuCard
  /** Frozen windows, in ascending order, each ending before the next begins. */
  readonly stalls?: readonly Stall[]
  readonly cold?: ColdStart
}

/**
 * The server on the harness that S5's rows were fitted on (WORLD §4.2): 64 sequences, an 8,192-token budget and chunked prefill,
 * priced by one of S5's rows at tensor-parallel degree `tp`. `hostTerm` is S5's host term, kept inside the GPU step as S5 fitted it
 * unless D-044 moves it to the CPU lane.
 */
export function s5Server(row: PhysicsRowKey, tp: number, hostTerm: S5HostTerm = 'in-gpu'): ServerModel {
  return { maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, gpu: s5Card(row, tp, hostTerm) }
}

/** A request as the server sees it: it reaches the engine at `atUs`, which is when the client sent it. */
export interface ServerArrival {
  /** Identifies the request in the results. Keys are dense from 0, in the order the requests are created. */
  readonly key: number
  readonly atUs: Us
  /** At least 1. */
  readonly promptTokens: number
  /** Tokens the request emits before it stops, at least 1. The truth about the request, which the scheduler never reads (WORLD §2.2). */
  readonly outputTokens: number
  /** Leading prompt tokens already in the cache, from 0 to `promptTokens − 1`. */
  readonly cachedTokens: number
}

export interface ServedRequest {
  readonly key: number
  /** When the engine read back the step that emitted the first token: the moment the client sees it. */
  readonly firstUs: Us
  /** When it read back the step that emitted the last one. */
  readonly doneUs: Us
  /** Tokens computed for it after it had stopped. */
  readonly ghostTokens: number
}

export interface ServerRun {
  /** One per arrival, indexed by key. */
  readonly reqs: readonly ServedRequest[]
  readonly steps: number
  /** The µs the GPU spent in forwards. */
  readonly gpuBusyUs: Us
  /** Tokens computed for requests that had stopped. */
  readonly ghostTokens: number
  /** When the last result was read back. 0 for a run with no requests. */
  readonly endUs: Us
}

/** What `onFinish` may do: add a request that reaches the engine at `atUs`, no earlier than the finish that triggers it. */
export interface Feed {
  arrive(arrival: ServerArrival): void
}

function atLeast(x: unknown, least: number, what: string): void {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${String(x)}`)
}

/** Throws unless the model is one the loop can run to the end. */
export function checkServer(model: ServerModel): void {
  atLeast(model.maxNumSeqs, 1, 'maxNumSeqs')
  atLeast(model.maxBatchedTokens, 1, 'maxBatchedTokens')
  if (model.gpu.kind === 'ticks') {
    atLeast(model.gpu.forwardUs, 1, 'the tick card\'s forwardUs')
    atLeast(model.gpu.admitUs, 0, 'the tick card\'s admitUs')
  } else {
    atLeast(model.gpu.tp, 1, 'the S5 card\'s tp')
  }
  let previousEnd: Us = 0
  for (const [i, stall] of (model.stalls ?? []).entries()) {
    atLeast(stall.atUs, 0, `stalls[${i}].atUs`)
    atLeast(stall.forUs, 1, `stalls[${i}].forUs`)
    if (stall.atUs < previousEnd) throw new RangeError(`stalls[${i}] starts at ${stall.atUs}, before the previous stall ends at ${previousEnd}: stalls are in order and do not overlap`)
    previousEnd = stall.atUs + stall.forUs
  }
  if (model.cold !== undefined) {
    atLeast(model.cold.untilUs, 0, 'cold.untilUs')
    atLeast(model.cold.slowdownPermille, 1000, 'cold.slowdownPermille')
  }
}

/** The earliest time at or after `t` when the main thread is not frozen. */
function thaw(stalls: readonly Stall[], t: Us): Us {
  let at = t
  for (const stall of stalls) if (at >= stall.atUs && at < stall.atUs + stall.forUs) at = stall.atUs + stall.forUs
  return at
}

/** A request as the scheduler sees it. */
interface Req {
  readonly key: number
  readonly prompt: number
  readonly output: number
  /** Prompt tokens scheduled so far, the engine's `num_computed_tokens`: it moves when the step is scheduled, before its tokens are sampled. Starts at the cache hit. */
  promptDone: number
  /** Decode rows scheduled so far. */
  decodeScheduled: number
  emitted: number
  ghosts: number
  finished: boolean
  firstUs: Us
  doneUs: Us
}

/** One request's place in a step. */
interface Row {
  readonly req: Req
  readonly prefill: boolean
  /** Tokens computed: a prefill chunk's length, or 1 for a decode. */
  readonly chunk: number
  /** Prompt tokens already prefilled, or cached, before this chunk. */
  readonly done: number
  /** KV entries a decode reads, its own token included. */
  readonly context: number
  /** Whether the row samples a token: a decode, or the chunk that completes the prompt. */
  readonly emits: boolean
}

/** A step launched and not yet read back. */
interface Flight {
  readonly rows: readonly Row[]
  readonly forwardEnd: Us
}

const byTimeThenKey = (a: ServerArrival, b: ServerArrival): number => (a.atUs !== b.atUs ? a.atUs - b.atUs : a.key - b.key)

/**
 * Runs `initial` through the coarse server until every request, and every arrival that `onFinish` adds, has finished. Requests are
 * scheduled first come, first served by the time they reached the engine, ties by key.
 *
 * `onFinish(key, doneUs, feed)` is called once for each request, in the order they finish, at the moment the engine reads the stop
 * back. A closed-loop client sends its next request from here.
 */
export function runServer(model: ServerModel, initial: readonly ServerArrival[], onFinish?: (key: number, doneUs: Us, feed: Feed) => void): ServerRun {
  checkServer(model)
  const stalls = model.stalls ?? []
  const check = (a: ServerArrival): void => {
    atLeast(a.key, 0, 'an arrival\'s key')
    atLeast(a.atUs, 0, `request ${a.key}'s arrival time`)
    atLeast(a.promptTokens, 1, `request ${a.key}'s promptTokens`)
    atLeast(a.outputTokens, 1, `request ${a.key}'s outputTokens`)
    atLeast(a.cachedTokens, 0, `request ${a.key}'s cachedTokens`)
    if (a.cachedTokens >= a.promptTokens) throw new RangeError(`request ${a.key} caches ${a.cachedTokens} of its ${a.promptTokens} prompt tokens: at least the last must be computed`)
    if (!model.chunkedPrefill && a.promptTokens - a.cachedTokens > model.maxBatchedTokens) {
      throw new RangeError(`request ${a.key} has ${a.promptTokens - a.cachedTokens} prompt tokens to compute, more than maxBatchedTokens (${model.maxBatchedTokens}), and chunked prefill is off, so it could never be scheduled`)
    }
  }

  // Arrivals not yet at the engine, ascending by time then key. `head` is the next one.
  const future: ServerArrival[] = []
  let head = 0
  const keys: boolean[] = []
  const admit = (a: ServerArrival): void => {
    check(a)
    if (keys[a.key] === true) throw new RangeError(`two arrivals have the key ${a.key}`)
    keys[a.key] = true
  }
  for (const a of [...initial].sort(byTimeThenKey)) {
    admit(a)
    future.push(a)
  }
  /** Adds an arrival that may fall before some of the ones waiting to reach the engine. */
  const insert = (a: ServerArrival): void => {
    admit(a)
    let lo = head
    let hi = future.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (byTimeThenKey(future[mid], a) <= 0) lo = mid + 1
      else hi = mid
    }
    future.splice(lo, 0, a)
  }

  /** Every request that has reached the engine, by key. */
  const all: Req[] = []
  let waiting: Req[] = []
  let waitingHead = 0
  let running: Req[] = []
  const inflight: Flight[] = []
  let cpuT: Us = 0
  let gpuT: Us = 0
  let steps = 0
  let gpuBusyUs: Us = 0
  let ghostTokens = 0
  let endUs: Us = 0
  // Two steps in flight with async scheduling, as the batch queue allows at one pipeline stage (vllm M7).
  const maxInFlight = 2

  const feed: Feed = {
    arrive(a) {
      if (a.atUs < cpuT) throw new RangeError(`request ${a.key} arrives at ${a.atUs}, before the engine's clock at ${cpuT}`)
      insert(a)
    },
  }

  const prefillRow = (req: Req, chunk: number): Row => {
    const done = req.promptDone
    req.promptDone += chunk
    return { req, prefill: true, chunk, done, context: 0, emits: req.promptDone === req.prompt }
  }
  const decodeRow = (req: Req): Row => {
    req.decodeScheduled++
    return { req, prefill: false, chunk: 1, done: 0, context: req.prompt + req.decodeScheduled, emits: true }
  }

  /** The scheduler (vllm M8): running requests first, then waiting ones in arrival order, under one token budget and a cap on running requests. */
  const schedule = (): Row[] => {
    const rows: Row[] = []
    let budget = model.maxBatchedTokens
    for (const req of running) {
      if (budget === 0) break
      if (req.promptDone < req.prompt) {
        const chunk = Math.min(req.prompt - req.promptDone, budget)
        rows.push(prefillRow(req, chunk))
        budget -= chunk
      } else {
        rows.push(decodeRow(req))
        budget--
      }
    }
    while (waitingHead < waiting.length && running.length < model.maxNumSeqs && budget > 0) {
      const req = waiting[waitingHead]
      const remaining = req.prompt - req.promptDone
      const chunk = model.chunkedPrefill ? Math.min(remaining, budget) : remaining
      // Without chunked prefill a prompt that does not fit what is left of the budget stops the waiting loop: head-of-line blocking.
      if (chunk > budget) break
      waitingHead++
      running.push(req)
      rows.push(prefillRow(req, chunk))
      budget -= chunk
    }
    return rows
  }

  const launchStep = (): void => {
    const rows = schedule()
    if (rows.length === 0) throw new Error('internal: the loop had work and scheduled none')
    const items: StepItem[] = []
    let prefillSeqs = 0
    for (const row of rows) {
      if (row.prefill) {
        prefillSeqs++
        items.push({ kind: 'prefill', chunk: row.chunk, done: row.done })
      } else {
        items.push({ kind: 'decode', context: row.context })
      }
    }
    const load = stepLoad(items)
    const work: GpuWork = { seqs: load.seqs, prefillSeqs, tokens: load.tokens, kvTokens: load.kvTokens, attnPairs: load.attnPairs }
    const cost = gpuCost(model.gpu, work)
    // With the host card at zero the CPU's schedule, prepare and launch take nothing, except the card's own per-sequence term when it puts one on this lane.
    const launchEnd = cpuT + (cost.hostSeqUs ?? 0)
    const forwardStart = Math.max(launchEnd, gpuT)
    const forwardUs = model.cold !== undefined && forwardStart < model.cold.untilUs ? divRound(cost.gpuUs * model.cold.slowdownPermille, 1000) : cost.gpuUs
    const forwardEnd = forwardStart + forwardUs
    inflight.push({ rows, forwardEnd })
    steps++
    gpuBusyUs += forwardUs
    gpuT = forwardEnd
    cpuT = launchEnd
  }

  /** Waits for the oldest step in flight, reads its sampled ids back and updates the requests from them. */
  const readBack = (): void => {
    const flight = inflight.shift()
    if (flight === undefined) throw new Error('internal: a read-back with no step in flight')
    // The sync and the sample cost the CPU nothing: the result is read the moment the forward has ended and the thread is free.
    const at = thaw(stalls, Math.max(cpuT, flight.forwardEnd))
    cpuT = at
    const stopped: Req[] = []
    for (const row of flight.rows) {
      if (!row.emits) continue
      const req = row.req
      if (req.finished) {
        // The request stopped on a step read back before this one, and this row was scheduled before the engine knew: the token is thrown away.
        req.ghosts++
        ghostTokens++
      } else {
        req.emitted++
        if (req.emitted === 1) req.firstUs = at
        if (req.emitted === req.output) {
          req.finished = true
          req.doneUs = at
          endUs = Math.max(endUs, at)
          stopped.push(req)
        }
      }
    }
    if (stopped.length > 0) running = running.filter((req) => !req.finished)
    for (const req of stopped) onFinish?.(req.key, at, feed)
  }

  for (;;) {
    cpuT = thaw(stalls, cpuT)
    while (head < future.length && future[head].atUs <= cpuT) {
      const a = future[head++]
      const req: Req = { key: a.key, prompt: a.promptTokens, output: a.outputTokens, promptDone: a.cachedTokens, decodeScheduled: 0, emitted: 0, ghosts: 0, finished: false, firstUs: 0, doneUs: 0 }
      all[a.key] = req
      waiting.push(req)
    }
    if (waitingHead > 0 && waitingHead === waiting.length) {
      waiting = []
      waitingHead = 0
    }
    const hasWork = running.length > 0 || waitingHead < waiting.length
    if (hasWork && inflight.length < maxInFlight) {
      launchStep()
      // `step_with_batch_queue` returns here while the queue has room, to schedule the next step before it waits for this one (vllm M7).
      if (inflight.length < maxInFlight) continue
    } else if (inflight.length === 0) {
      if (head >= future.length) break
      // Nothing to run and nothing in flight: the loop blocks on its input queue until the next request arrives.
      cpuT = future[head].atUs
      continue
    }
    readBack()
  }

  const reqs: ServedRequest[] = []
  for (let key = 0; key < keys.length; key++) {
    const req = all[key] as Req | undefined
    if (req === undefined || !req.finished) throw new RangeError(`the keys must be dense from 0, but request ${key} was never given or never finished`)
    reqs.push({ key, firstUs: req.firstUs, doneUs: req.doneUs, ghostTokens: req.ghosts })
  }
  return { reqs, steps, gpuBusyUs, ghostTokens, endUs }
}
