// The engine's step loop (ARCHITECTURE §5.3; WORLD §2.1, §2.3, §2.5, §2.6): a seeded workload goes in, and the two lanes, the
// steps, the requests' latencies and the violations come out, in integer µs.
//
// What the loop mirrors, at the pin (vllm M6, M7, M8, G2; vLLM v0.33.0, read 2026-11-03; research/upstream-vllm.md):
//   - `EngineCore.step_with_batch_queue`: `schedule()`, then `execute_model(non_block=True)` (prepare and launch the forward), then
//     the result: the sampled ids back on the host and `update_from_output`. With async scheduling up to two steps are in flight,
//     so the next step is scheduled, prepared and launched before the oldest one's result is waited for. Without it the model is
//     strictly serial (WORLD §2.6): the next schedule waits for this step's update.
//   - The scheduler has no prefill or decode phase. Running requests are scheduled first, then waiting ones, under one token
//     budget and a cap on running requests, and a prompt is cut into chunks to fit the budget when chunked prefill is on.
//   - A captured CUDA graph is replayed when the step's token count, rounded up to the next captured size, was captured.
//
// What v0 leaves out is in the notional-machine card's "Ignores" (content/cards/trace-room-steploop.md): the KV manager, so no
// capacity limit and no preemption; the other graph modes and the dispatch keys; the structured-output mask; speculation; adapters.
// Three host-card fields are not read. `detokPerTokenUs` and `ipcUs` are not, because detokenization and the hop to the frontend
// run in another process, off the engine core's critical path (WORLD §2.1), and every latency here is the engine core's.
// `maskPerSeqUs` is the mask's.
//
// What a step costs on the CPU lane, in the order the CPU does it, for a batch of `seqs` rows and `tokens` real tokens:
//   schedule  scheduleBase + schedulePerSeq · seqs        (or the GPU card's own per-sequence host work, D-044)
//   prepare   prepPerToken · tokens
//   launch    graphReplay on a graph hit, else launchPerKernel · kernelsPerLayer · layers
//   sync      sync, once the forward has ended
//   sample    samplePerSeq · seqs, then the requests are updated from the sampled ids
// and on the GPU lane the forward, which the GPU card prices for the batch after padding. Everything is an integer, and a run is a
// pure function of its arguments.

import type { Us } from '../core/types'
import type { HostCard } from '../host/types'
import { stepLoad } from '../physics'
import type { StepItem } from '../physics'
import type { ReqSpec, Workload } from '../workload'
import { gpuCost, gpuLayers } from './cards'
import { checkDependency, placeLaunch, placeReadback, timelineBuilder } from './events'
import { finishRun } from './metrics'
import type { ReqRecord, StepRecord } from './metrics'
import type { GpuCard, GpuWork, GraphResult, StepLoopConfig, StepLoopRun, Violation } from './types'

// ---------------------------------------------------------------------------------------------------------------------------
// Capture sizes

/**
 * vLLM's default list of captured sizes up to `max`: `[1, 2, 4]`, then 8 to 248 in steps of 8, then 256 up to `max` in steps of 16
 * (`cudagraph_capture_sizes` unset; vllm G2, v0.33.0, read 2026-11-03). vLLM caps `max` at 512 when it is unset, and at 1,024 on
 * data-centre Blackwell, so `defaultCaptureSizes(512)` has 51 sizes [derived].
 */
export function defaultCaptureSizes(max: number): number[] {
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError(`the largest capture size is an integer of at least 1, got ${max}`)
  const sizes = [1, 2, 4]
  for (let n = 8; n < 256; n += 8) sizes.push(n)
  for (let n = 256; n <= max; n += 16) sizes.push(n)
  return sizes.filter((n) => n <= max)
}

/**
 * The size a step of `n` tokens is padded to: the smallest captured size that is at least `n`, so equal to `n` exactly when `n`
 * was captured. Null above the largest size, where the step is launched eagerly. `sizes` is ascending.
 */
export function paddedSize(sizes: readonly number[], n: number): number | null {
  let lo = 0
  let hi = sizes.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sizes[mid] < n) lo = mid + 1
    else hi = mid
  }
  return lo < sizes.length ? sizes[lo] : null
}

// ---------------------------------------------------------------------------------------------------------------------------
// Checking what a run is given

const HOST_FIELDS = [
  'scheduleBaseUs',
  'schedulePerSeqUs',
  'prepPerTokenUs',
  'launchPerKernelUs',
  'kernelsPerLayer',
  'graphReplayUs',
  'syncUs',
  'samplePerSeqUs',
  'detokPerTokenUs',
  'maskPerSeqUs',
  'ipcUs',
] as const satisfies readonly (keyof HostCard)[]

function atLeast(x: unknown, least: number, what: string): void {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${String(x)}`)
}

function checkArguments(w: Workload, cfg: StepLoopConfig, host: HostCard, gpu: GpuCard, horizonUs: Us): void {
  atLeast(horizonUs, 0, 'horizonUs')
  atLeast(cfg.maxNumSeqs, 1, 'maxNumSeqs')
  atLeast(cfg.maxBatchedTokens, 1, 'maxBatchedTokens')
  if (cfg.batching !== undefined && cfg.batching !== 'continuous' && cfg.batching !== 'static') throw new RangeError(`batching is 'continuous' or 'static', got ${String(cfg.batching)}`)
  if (cfg.inputIds !== 'device' && cfg.inputIds !== 'host') throw new RangeError(`inputIds is 'device' or 'host', got ${String(cfg.inputIds)}`)
  if (cfg.graphs.mode !== 'NONE' && cfg.graphs.mode !== 'FULL') throw new RangeError(`graphs.mode is 'NONE' or 'FULL' in v0, got ${String(cfg.graphs.mode)}`)
  if (cfg.graphs.mode === 'FULL') {
    cfg.graphs.captureSizes.forEach((size, i) => {
      atLeast(size, 1, `graphs.captureSizes[${i}]`)
      if (i > 0 && size <= cfg.graphs.captureSizes[i - 1]) throw new RangeError(`graphs.captureSizes must be ascending and distinct, but ${size} follows ${cfg.graphs.captureSizes[i - 1]}`)
    })
  }
  for (const field of HOST_FIELDS) atLeast(host[field], 0, `the host card's ${field}`)
  if (gpu.kind === 'ticks') {
    atLeast(gpu.forwardUs, 1, 'the tick card\'s forwardUs')
    atLeast(gpu.admitUs, 0, 'the tick card\'s admitUs')
  } else {
    atLeast(gpu.tp, 1, 'the S5 card\'s tp')
  }
  let previousDue: Us = 0
  w.reqs.forEach((r, i) => {
    if (r.id !== i) throw new RangeError(`request ${i} has id ${r.id}: a workload lists its requests by id, from 0`)
    atLeast(r.dueUs, 0, `request ${i}'s dueUs`)
    if (r.dueUs < previousDue) throw new RangeError(`request ${i} is due at ${r.dueUs}, before request ${i - 1} at ${previousDue}: a workload is in arrival order`)
    previousDue = r.dueUs
    atLeast(r.promptTokens, 1, `request ${i}'s promptTokens`)
    atLeast(r.outputTokens, 1, `request ${i}'s outputTokens`)
    if (!cfg.chunkedPrefill && r.promptTokens > cfg.maxBatchedTokens) {
      throw new RangeError(`request ${i} has ${r.promptTokens} prompt tokens, more than maxBatchedTokens (${cfg.maxBatchedTokens}), and chunked prefill is off, so it could never be scheduled`)
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------------
// The loop

/** A request as the scheduler sees it: the metrics' record, plus how far its prompt and its decodes have been scheduled. */
interface Req extends ReqRecord {
  readonly spec: ReqSpec
  /** Prompt tokens scheduled so far, which is what the engine calls `num_computed_tokens`: it moves when the step is scheduled, before its tokens are sampled. */
  promptDone: number
  /** Decode rows scheduled so far. */
  decodeScheduled: number
  /** The index of the latest step with a row that samples a token for this request, or -1: the step whose result its next row needs as input. */
  lastProducer: number
}

/** One request's place in a step. */
interface Row {
  readonly req: Req
  readonly prefill: boolean
  /** Tokens computed: a prefill chunk's length, or 1 for a decode. */
  readonly chunk: number
  /** Prompt tokens already prefilled before this chunk. */
  readonly done: number
  /** KV entries a decode reads, its own token included. */
  readonly context: number
  /** Whether the row samples a token: a decode, or the chunk that completes the prompt. */
  readonly emits: boolean
}

/** A step launched and not yet read back. */
interface Flight {
  readonly record: StepRecord
  readonly rows: readonly Row[]
  /** When its forward ends on the stream, as placed (the horizon may cut the recorded span, but not this). */
  readonly forwardEnd: Us
  readonly sampleUs: Us
}

/**
 * Runs `w` through the engine's step loop until every request has finished, or `opts.horizonUs` is reached: at the horizon
 * the clock stops. Spans are cut there, a step still in flight is never read back, and the requests it carries are unfinished.
 *
 * Requests arrive at their due times and are scheduled first-come first-served. `host` prices the CPU lane and `gpu` the GPU
 * lane (a `TICK_CARD` is both). The workload's lengths are the truth about each request, and the loop does not read them to
 * decide anything: a request ends when its last token is read back, which is why async scheduling computes one token past it.
 */
export function runStepLoop(w: Workload, cfg: StepLoopConfig, host: HostCard, gpu: GpuCard, opts: { horizonUs: Us }): StepLoopRun {
  const horizon = opts.horizonUs
  checkArguments(w, cfg, host, gpu, horizon)

  const reqs: Req[] = w.reqs.map((spec) => ({
    spec,
    id: spec.id,
    dueUs: spec.dueUs,
    outputTokens: spec.outputTokens,
    emitted: 0,
    ghosts: 0,
    finished: false,
    firstUs: null,
    lastUs: null,
    promptDone: 0,
    decodeScheduled: 0,
    lastProducer: -1,
  }))
  const n = reqs.length
  const lanes = timelineBuilder(horizon)
  const records: StepRecord[] = []
  const violations: Violation[] = []
  const inflight: Flight[] = []
  // Two steps in flight with async scheduling, as the batch queue allows at one pipeline stage (vllm M7), and strictly serial without it.
  const maxInFlight = cfg.asyncScheduling ? 2 : 1
  const eagerLaunches = host.kernelsPerLayer * gpuLayers(gpu)
  const eagerLaunchUs = host.launchPerKernelUs * eagerLaunches

  let running: Req[] = []
  /** Requests due by now: the first `arrived` are on the input queue. */
  let arrived = 0
  /** Requests admitted to `running` so far, which are the first `admitted` of them: the next to admit is `reqs[admitted]`, if it has arrived. */
  let admitted = 0
  let cpuT: Us = 0
  let gpuT: Us = 0

  const prefillRow = (req: Req, chunk: number): Row => {
    const done = req.promptDone
    req.promptDone += chunk
    return { req, prefill: true, chunk, done, context: 0, emits: req.promptDone === req.spec.promptTokens }
  }
  const decodeRow = (req: Req): Row => {
    req.decodeScheduled++
    return { req, prefill: false, chunk: 1, done: 0, context: req.spec.promptTokens + req.decodeScheduled, emits: true }
  }

  /** The scheduler (vllm M8): running requests first, then waiting ones in arrival order, under one token budget and a cap on running requests. */
  const schedule = (): Row[] => {
    const rows: Row[] = []
    let budget = cfg.maxBatchedTokens
    for (const req of running) {
      if (budget === 0) break
      if (req.promptDone < req.spec.promptTokens) {
        const chunk = Math.min(req.spec.promptTokens - req.promptDone, budget)
        rows.push(prefillRow(req, chunk))
        budget -= chunk
      } else {
        rows.push(decodeRow(req))
        budget--
      }
    }
    // Static batching opens the door only when the engine believes nothing of the previous batch is still running.
    const open = cfg.batching !== 'static' || running.length === 0
    while (open && admitted < arrived && running.length < cfg.maxNumSeqs && budget > 0) {
      const req = reqs[admitted]
      const chunk = cfg.chunkedPrefill ? Math.min(req.spec.promptTokens, budget) : req.spec.promptTokens
      // Without chunked prefill a prompt that does not fit what is left of the budget stops the waiting loop: head-of-line blocking.
      if (chunk > budget) break
      admitted++
      running.push(req)
      rows.push(prefillRow(req, chunk))
      budget -= chunk
    }
    return rows
  }

  /** Prepares and launches one step at `cpuT`: the CPU's schedule, prepare and launch, and the forward queued on the stream. */
  const launchStep = (): void => {
    const index = records.length
    const rows = schedule()
    if (rows.length === 0) throw new Error('internal: the loop had work and scheduled none')

    const items: StepItem[] = []
    let prefillSeqs = 0
    let inFlightRows = 0
    // Steps are read back in order, so the steps not yet read back are exactly those from the oldest one in flight on.
    const oldestInFlight = inflight.length > 0 ? inflight[0].record.index : Number.POSITIVE_INFINITY
    for (const row of rows) {
      if (row.prefill) {
        prefillSeqs++
        items.push({ kind: 'prefill', chunk: row.chunk, done: row.done })
      } else {
        items.push({ kind: 'decode', context: row.context })
        // A decode's input is the token the request's last producing step samples. If that step is not read back yet, the token is not sampled yet.
        if (row.req.lastProducer >= oldestInFlight) inFlightRows++
      }
    }
    for (const row of rows) if (row.emits) row.req.lastProducer = index

    const load = stepLoad(items)
    let graph: GraphResult = 'off'
    let padded = load.tokens
    if (cfg.graphs.mode === 'FULL') {
      const size = paddedSize(cfg.graphs.captureSizes, load.tokens)
      graph = size === null ? 'miss' : 'hit'
      if (size !== null) padded = size
    }
    // A padded token is a dummy sequence of one token: it costs the GPU a token, a KV entry and an attention pair, and the host nothing.
    const extra = padded - load.tokens
    const work: GpuWork = { seqs: load.seqs, prefillSeqs, tokens: padded, kvTokens: load.kvTokens + extra, attnPairs: load.attnPairs + extra }
    const cost = gpuCost(gpu, work)

    const replay = graph === 'hit'
    const launch = placeLaunch(cpuT, gpuT, {
      scheduleUs: host.scheduleBaseUs + (cost.hostSeqUs === null ? host.schedulePerSeqUs * rows.length : cost.hostSeqUs),
      prepareUs: host.prepPerTokenUs * load.tokens,
      launchUs: replay ? host.graphReplayUs : eagerLaunchUs,
      forwardUs: cost.gpuUs,
    })
    lanes.add('cpu-main', index, 'schedule', cpuT, launch.scheduleEnd)
    lanes.add('cpu-main', index, 'prepare', launch.scheduleEnd, launch.prepareEnd)
    lanes.add('cpu-main', index, 'launch', launch.prepareEnd, launch.launchEnd)
    const forward = lanes.add('gpu-stream', index, 'forward', launch.forwardStart, launch.forwardEnd)

    const violation = checkDependency(cfg.inputIds, index, launch.scheduleEnd, inFlightRows)
    if (violation !== null) violations.push(violation)

    const record: StepRecord = {
      index,
      seqs: rows.length,
      prefillSeqs,
      ghostSeqs: 0,
      tokens: load.tokens,
      paddedTokens: padded,
      graph,
      launches: replay ? 1 : eagerLaunches,
      forward,
    }
    records.push(record)
    inflight.push({ record, rows, forwardEnd: launch.forwardEnd, sampleUs: cost.hostSeqUs === null ? host.samplePerSeqUs * rows.length : 0 })
    gpuT = launch.forwardEnd
    cpuT = launch.launchEnd
  }

  /**
   * Waits for the oldest step in flight, reads its sampled ids back and updates the requests from them. Returns false if the
   * horizon cut the read-back, which ends the run with the tokens never read.
   */
  const readBack = (): boolean => {
    const flight = inflight.shift()
    if (flight === undefined) throw new Error('internal: a read-back with no step in flight')
    const { index } = flight.record
    const rb = placeReadback(cpuT, flight.forwardEnd, host.syncUs, flight.sampleUs)
    lanes.add('cpu-main', index, 'sync', rb.syncStart, rb.syncEnd)
    lanes.add('cpu-main', index, 'sample', rb.syncEnd, rb.sampleEnd)
    if (rb.sampleEnd > horizon) return false
    cpuT = rb.sampleEnd

    let anyFinished = false
    for (const row of flight.rows) {
      if (!row.emits) continue
      const req = row.req
      if (req.finished) {
        // The request stopped on a step read back before this one, and this row was scheduled before the engine knew (async scheduling): the token is thrown away.
        req.ghosts++
        flight.record.ghostSeqs++
      } else {
        req.emitted++
        if (req.firstUs === null) req.firstUs = rb.sampleEnd
        req.lastUs = rb.sampleEnd
        if (req.emitted === req.outputTokens) {
          req.finished = true
          anyFinished = true
        }
      }
    }
    if (anyFinished) running = running.filter((req) => !req.finished)
    return true
  }

  // The engine core's busy loop (vllm M7). Each pass either launches a step, or reads the oldest one back, or waits for a request.
  while (cpuT < horizon) {
    while (arrived < n && reqs[arrived].dueUs <= cpuT) arrived++
    const hasWork = running.length > 0 || admitted < arrived
    if (hasWork && inflight.length < maxInFlight) {
      launchStep()
      // `step_with_batch_queue` returns here while the queue has room, to schedule the next step before it waits for this one (vllm M7).
      if (inflight.length < maxInFlight) continue
    } else if (inflight.length === 0) {
      if (arrived >= n) break
      // Nothing to run and nothing in flight: the loop blocks on its input queue until the next request is due.
      cpuT = reqs[arrived].dueUs
      continue
    }
    if (!readBack()) break
  }

  const finished = finishRun(records, reqs, lanes.timeline())
  return { horizonUs: horizon, lanes: lanes.timeline(), steps: finished.steps, reqs: finished.reqs, summary: finished.summary, violations }
}
