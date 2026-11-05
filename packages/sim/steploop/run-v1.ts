// The engine's step loop at v1 (ARCHITECTURE §5.3; WORLD §2.1, §2.3 to §2.8): a seeded workload goes in, and the two lanes, the steps, the
// requests' latencies and the violations come out, in integer µs. This is the package's `runStepLoop`. The v0 loop of the TR2 spike is
// `./run`, which the front page runs by path: v1 weighs more than the front page's first paint has room for (`verify:bundle`), and a v1
// configuration that turns no feature on runs as v0 does, which tests/sim/steploop-v1.test.ts checks span by span.
//
// What the loop mirrors, at the pin (vLLM v0.33.0, read 2026-11-04; the claims are in content/claims/vllm/):
//   - `EngineCore.step_with_batch_queue`: `schedule()`, then `execute_model(non_block=True)` (prepare and launch the forward), then
//     the result: the sampled ids back on the host and `update_from_output`. With async scheduling up to two steps are in flight,
//     so the next step is scheduled, prepared and launched before the oldest one's result is waited for. Without it the model is
//     strictly serial (WORLD §2.6): the next schedule waits for this step's update. (Claims vllm.step.order, vllm.step.batch-queue,
//     vllm.step.max-concurrent-batches.mrv1, vllm.step.max-concurrent-batches.mrv2, vllm.async-scheduling.default.)
//   - The scheduler has no prefill or decode phase. Running requests are scheduled first, then waiting ones, under one token
//     budget and a cap on running requests, and a prompt is cut into chunks to fit the budget when chunked prefill is on. A waiting
//     request whose adapter would make one more than `max_loras` is skipped, and the next one is tried. (Claims vllm.scheduler.no-phases,
//     vllm.scheduler.order, vllm.scheduler.chunked-prefill-default, vllm.lora.admission-cap.)
//   - A running request carries its drafts, 1 + k tokens for a decode, cut to what is left of the budget (claim vllm.scheduler.spec-drafts).
//   - A captured CUDA graph is replayed when the runner's dispatcher finds one for the step (claims vllm.cudagraph.mrv2-dispatch,
//     vllm.cudagraph.mrv1-dispatch; ./graphs). Without a `runner` the loop keeps v0's rule: the step's token count, rounded up to the
//     next captured size (claim vllm.cudagraph.padding).
//
// What the loop leaves out is in the notional-machine card's "Ignores" (content/cards/trace-room-steploop.md): the KV manager, so no
// capacity limit and no preemption; data and pipeline parallelism; dual-batch overlap. Two host-card fields are not read.
// `detokPerTokenUs` and `ipcUs` are not, because detokenization and the hop to the frontend run in another process, off the engine
// core's critical path (WORLD §2.1), and every latency here is the engine core's.
//
// What a step costs on the CPU lane, in the order the CPU does it, for a batch of `seqs` rows and `tokens` real tokens:
//   schedule  scheduleBase + schedulePerSeq · seqs        (or the GPU card's own per-sequence host work, D-044)
//   prepare   prepPerToken · tokens
//   launch    one replay on a FULL hit, (layers + 1) replays and one launch per layer on a PIECEWISE hit (claim
//             vllm.cudagraph.piecewise-partitions), else launchPerKernel · kernelsPerLayer · layers
//   mask      maskPerSeq · the rows that sample a structured request (./mask; claim vllm.mask.overlap): right after the launch, while the
//             forward runs, or after the sync, or after the read-back of the step whose token the mask needs (claim vllm.mask.deferred-sampling)
//   sync      sync, once the forward has ended
//   sample    samplePerSeq · seqs, then the requests are updated from the sampled ids
// and on the GPU lane the forward, which the GPU card prices for the batch after padding, with the drafts of a speculative step
// added. Everything is an integer, and a run is a pure function of its arguments.

import { rngFor } from '../core'
import type { Rng } from '../core'
import type { Us } from '../core/types'
import { divRound } from '../core/int'
import type { HostCard } from '../host/types'
import { stepLoad } from '../physics'
import type { StepItem } from '../physics'
import type { ReqSpec, Workload } from '../workload'
import { gpuCost, gpuLayers } from './cards'
import { checkDependency, placeLaunch, placeReadback, timelineBuilder } from './events'
import { batchShape, dispatcherFor, GRAPH_MODES, graphConfigOf } from './graphs'
import type { Dispatcher } from './graphs'
import { maskFillUs } from './mask'
import { finishRun } from './metrics'
import type { ReqRecord, StepRecord } from './metrics'
import { paddedSize } from './run'
import { asyncSupported, RUNNER_PRESETS } from './runners'
import { acceptedDrafts, expectedTokensPerRoundMilli } from './spec'
import type { CudaGraphMode, GpuCard, GpuWork, GraphResult, SpecSummary, StepLoopConfig, StepLoopRun, Violation } from './types'

// ---------------------------------------------------------------------------------------------------------------------------
// Launches

/**
 * Launches a piecewise step makes besides its graph replays: one for the attention of each layer, which stays outside the graphs
 * (claims vllm.cudagraph.piecewise-attention-outside, vllm.cudagraph.piecewise-partitions). One is a judgment [estimated]: a real attention
 * launch is a few kernels, and the host card's `kernelsPerLayer` does not say how many of a layer's are attention.
 */
export const PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER = 1

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
  if (cfg.runner !== undefined && cfg.runner !== 'mrv2' && cfg.runner !== 'v1') throw new RangeError(`runner is 'mrv2' or 'v1', got ${String(cfg.runner)}`)
  const mode = cfg.graphs.mode
  if (cfg.runner === undefined) {
    if (mode !== 'NONE' && mode !== 'FULL') throw new RangeError(`graphs.mode is 'NONE' or 'FULL' in v0, got ${String(mode)}: the other modes dispatch through a runner (set runner)`)
  } else if (!(mode in GRAPH_MODES)) {
    throw new RangeError(`graphs.mode is one of ${Object.keys(GRAPH_MODES).join(', ')}, got ${String(mode)}`)
  }
  if (mode !== 'NONE') {
    cfg.graphs.captureSizes.forEach((size, i) => {
      atLeast(size, 1, `graphs.captureSizes[${i}]`)
      if (i > 0 && size <= cfg.graphs.captureSizes[i - 1]) throw new RangeError(`graphs.captureSizes must be ascending and distinct, but ${size} follows ${cfg.graphs.captureSizes[i - 1]}`)
    })
  }
  for (const flag of ['specializeLora', 'specializeActiveLora'] as const) {
    if (cfg.graphs[flag] !== undefined && typeof cfg.graphs[flag] !== 'boolean') throw new RangeError(`graphs.${flag} is true or false, got ${String(cfg.graphs[flag])}`)
  }
  if (cfg.lora !== undefined) atLeast(cfg.lora.maxLoras, 1, 'lora.maxLoras')
  if (cfg.structured !== undefined && typeof cfg.structured.overlap !== 'boolean') throw new RangeError(`structured.overlap is true or false, got ${String(cfg.structured.overlap)}`)
  const spec = cfg.spec
  if (spec !== undefined) {
    atLeast(spec.k, 1, 'spec.k')
    atLeast(spec.alphaPermille, 0, 'spec.alphaPermille')
    if (spec.alphaPermille > 1000) throw new RangeError(`spec.alphaPermille must be at most 1000, got ${spec.alphaPermille}`)
    atLeast(spec.draftCostPermille, 0, 'spec.draftCostPermille')
  }
  if (cfg.runner !== undefined) {
    const method = spec === undefined ? undefined : (spec.method ?? 'eagle')
    if (method !== undefined && RUNNER_PRESETS[cfg.runner].unsupportedMethods.includes(method)) {
      throw new RangeError(`the ${cfg.runner} runner does not take the speculative method ${method}: vLLM falls back to the v1 runner`)
    }
    if (cfg.asyncScheduling && !asyncSupported(cfg.runner, method)) {
      throw new RangeError(`async scheduling is not supported by the ${cfg.runner} runner with ${String(method)}-based speculative decoding`)
    }
    // MRV1 rounds the sizes of its full decode graphs up to multiples of the decode query length before it captures (./graphs, `resolveGraphs`).
    const queryLen = 1 + (spec?.k ?? 0)
    if (cfg.runner === 'v1' && GRAPH_MODES[mode].decode === 'FULL' && queryLen > 1) {
      for (const size of cfg.graphs.captureSizes) {
        if (size % queryLen !== 0) throw new RangeError(`the v1 runner captures full decode graphs at multiples of the decode query length (${queryLen}), and ${size} is not one: resolveGraphs rounds the sizes up`)
      }
    }
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

/** A step as the loop records it: `./metrics`' record, and the fields that only a v1 feature sets (left out of the result when the feature is off). */
interface StepRecordV1 extends StepRecord {
  mode?: CudaGraphMode
  activeLoras?: number
  /** CPU µs of the step's bitmask fills that fall inside the horizon, counted as each fill is placed. */
  maskUs?: Us
  draftUs?: Us
}

/** A request as the scheduler sees it: the metrics' record, plus how far its prompt and its decodes have been scheduled. */
interface Req extends ReqRecord {
  readonly spec: ReqSpec
  /** Prompt tokens scheduled so far, which is what the engine calls `num_computed_tokens`: it moves when the step is scheduled, before its tokens are sampled. */
  promptDone: number
  /** Decode rows scheduled so far. */
  decodeScheduled: number
  /** The index of the latest step with a row that samples a token for this request, or -1: the step whose result its next row needs as input. */
  lastProducer: number
  /** Tokens its speculative rounds scheduled so far beyond one each: the accepted drafts. */
  bonus: number
  /** Its stream of acceptance draws, or null without speculation. */
  readonly rng: Rng | null
}

/** One request's place in a step. */
interface Row {
  readonly req: Req
  readonly prefill: boolean
  /** Tokens computed: a prefill chunk's length, or 1 for a decode (1 + the drafts it carries, for a speculative one). */
  readonly chunk: number
  /** Prompt tokens already prefilled before this chunk. */
  readonly done: number
  /** KV entries a decode reads, its own token included. */
  readonly context: number
  /** Whether the row samples a token: a decode, or the chunk that completes the prompt. */
  readonly emits: boolean
  /** Tokens the row gives its request when it is read back: 1, or the accepted drafts and one more for a speculative row. */
  readonly emit: number
  /** Drafts the row carries, and how many the target accepts. */
  readonly drafts: number
  readonly accepted: number
}

/** A step launched and not yet read back. */
interface Flight {
  readonly record: StepRecordV1
  readonly rows: readonly Row[]
  /** When its forward ends on the stream, as placed (the horizon may cut the recorded span, but not this). */
  readonly forwardEnd: Us
  readonly sampleUs: Us
  /** The bitmask fill that waits for the forward to end (structured rows whose token is home, with overlap off). */
  readonly maskAfterSyncUs: Us
  /** The structured rows whose bitmask needs the token of the step before this one, which is still in flight (claim vllm.mask.deferred-sampling). */
  readonly maskPending: readonly Row[]
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

  const spec = cfg.spec
  const specK = spec?.k ?? 0
  const queryLen = 1 + specK
  const loraOn = cfg.lora !== undefined
  const maskOn = cfg.structured !== undefined
  const maskOverlap = cfg.structured?.overlap === true
  const runner = cfg.runner
  // The dispatcher is built once, from the configuration; a run without a runner keeps v0's padded-size rule.
  const dispatcher: Dispatcher | null = runner !== undefined && cfg.graphs.mode !== 'NONE' ? dispatcherFor(runner, graphConfigOf(cfg)) : null

  const reqs: Req[] = w.reqs.map((reqSpec) => ({
    spec: reqSpec,
    id: reqSpec.id,
    dueUs: reqSpec.dueUs,
    outputTokens: reqSpec.outputTokens,
    emitted: 0,
    ghosts: 0,
    finished: false,
    firstUs: null,
    lastUs: null,
    promptDone: 0,
    decodeScheduled: 0,
    lastProducer: -1,
    bonus: 0,
    rng: spec === undefined ? null : rngFor(w.seed, `steploop/spec/${reqSpec.id}`),
  }))
  const n = reqs.length
  const lanes = timelineBuilder(horizon)
  const records: StepRecordV1[] = []
  const violations: Violation[] = []
  const inflight: Flight[] = []
  // Two steps in flight with async scheduling, as the batch queue allows at one pipeline stage (claims vllm.step.max-concurrent-batches.mrv1, vllm.step.max-concurrent-batches.mrv2), and strictly serial without it.
  const maxInFlight = cfg.asyncScheduling ? 2 : 1
  const layers = gpuLayers(gpu)
  const eagerLaunches = host.kernelsPerLayer * layers
  const eagerLaunchUs = host.launchPerKernelUs * eagerLaunches
  const piecewiseLaunches = layers + 1 + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER
  const piecewiseLaunchUs = (layers + 1) * host.graphReplayUs + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER * host.launchPerKernelUs
  const specTally = { rounds: 0, drafted: 0, accepted: 0, emitted: 0 }

  let running: Req[] = []
  /** Requests that have arrived and not been admitted, in arrival order: those from `head` on. Admission skips past a request that the adapter cap holds back, and keeps it in its place. */
  let waiting: Req[] = []
  let head = 0
  /** Requests due by now are the first `arrived` of `reqs`. */
  let arrived = 0
  let cpuT: Us = 0
  let gpuT: Us = 0

  const prefillRow = (req: Req, chunk: number): Row => {
    const done = req.promptDone
    req.promptDone += chunk
    return { req, prefill: true, chunk, done, context: 0, emits: req.promptDone === req.spec.promptTokens, emit: 1, drafts: 0, accepted: 0 }
  }
  const decodeRow = (req: Req, tokens: number): Row => {
    req.decodeScheduled++
    if (spec === undefined || req.rng === null) {
      return { req, prefill: false, chunk: 1, done: 0, context: req.spec.promptTokens + req.decodeScheduled, emits: true, emit: 1, drafts: 0, accepted: 0 }
    }
    // A speculative round (WORLD §2.7): the row carries the drafts that fit the budget, and the target accepts a prefix of them.
    const drafts = tokens - 1
    const accepted = Math.min(acceptedDrafts(req.rng, spec.k, spec.alphaPermille), drafts)
    const context = req.spec.promptTokens + req.decodeScheduled + req.bonus
    req.bonus += accepted
    return { req, prefill: false, chunk: tokens, done: 0, context, emits: true, emit: accepted + 1, drafts, accepted }
  }

  /** The distinct adapters of the running requests, which the adapter cap counts (claim vllm.lora.admission-cap). */
  const runningAdapters = (): Set<number> => {
    const adapters = new Set<number>()
    for (const req of running) if (req.spec.adapter !== null) adapters.add(req.spec.adapter)
    return adapters
  }

  /** The scheduler (claims vllm.scheduler.no-phases, vllm.scheduler.order): running requests first, then waiting ones in arrival order, under one token budget and a cap on running requests. */
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
        const tokens = Math.min(queryLen, budget)
        rows.push(decodeRow(req, tokens))
        budget -= tokens
      }
    }
    // Static batching opens the door only when the engine believes nothing of the previous batch is still running.
    const open = cfg.batching !== 'static' || running.length === 0
    if (open) {
      const adapters = loraOn ? runningAdapters() : null
      const skipped: Req[] = []
      while (head < waiting.length && running.length < cfg.maxNumSeqs && budget > 0) {
        const req = waiting[head]
        // A request whose adapter would be one too many waits, and the scheduler goes on to the next (claim vllm.lora.admission-cap).
        if (adapters !== null && cfg.lora !== undefined && req.spec.adapter !== null && adapters.size === cfg.lora.maxLoras && !adapters.has(req.spec.adapter)) {
          skipped.push(req)
          head++
          continue
        }
        const chunk = cfg.chunkedPrefill ? Math.min(req.spec.promptTokens, budget) : req.spec.promptTokens
        // Without chunked prefill a prompt that does not fit what is left of the budget stops the waiting loop: head-of-line blocking.
        if (chunk > budget) break
        head++
        running.push(req)
        if (adapters !== null && req.spec.adapter !== null) adapters.add(req.spec.adapter)
        rows.push(prefillRow(req, chunk))
        budget -= chunk
      }
      // The skipped requests go back in front of the rest, in the order they came.
      if (skipped.length > 0) {
        head -= skipped.length
        skipped.forEach((req, i) => {
          waiting[head + i] = req
        })
      }
      if (head > 4096 && head * 2 > waiting.length) {
        waiting = waiting.slice(head)
        head = 0
      }
    }
    return rows
  }

  /** Adds a bitmask fill to the CPU lane and returns how much of it falls inside the horizon, which is what a step's `maskUs` counts. */
  const addMask = (step: number, startUs: Us, endUs: Us): Us => {
    const span = lanes.add('cpu-main', step, 'mask', startUs, endUs)
    return span === null ? 0 : span.endUs - span.startUs
  }

  /** Prepares and launches one step at `cpuT`: the CPU's schedule, prepare and launch, and the forward queued on the stream. */
  const launchStep = (): void => {
    const index = records.length
    const rows = schedule()
    if (rows.length === 0) throw new Error('internal: the loop had work and scheduled none')

    const items: StepItem[] = []
    let prefillSeqs = 0
    let inFlightRows = 0
    let maskReady = 0
    const maskPending: Row[] = []
    // What the drafts are priced against: the speculative rows, as plain decodes of one token.
    let plainSeqs = 0
    let plainKv = 0
    // Steps are read back in order, so the steps not yet read back are exactly those from the oldest one in flight on.
    const oldestInFlight = inflight.length > 0 ? inflight[0].record.index : Number.POSITIVE_INFINITY
    for (const row of rows) {
      let tokenInFlight = false
      if (row.prefill) {
        prefillSeqs++
        items.push({ kind: 'prefill', chunk: row.chunk, done: row.done })
      } else {
        // A decode's input is the token the request's last producing step samples. If that step is not read back yet, the token is not sampled yet.
        tokenInFlight = row.req.lastProducer >= oldestInFlight
        if (tokenInFlight) inFlightRows++
        if (spec === undefined) {
          items.push({ kind: 'decode', context: row.context })
        } else {
          // 1 + k positions over the context: the same loads as a prefill chunk of that length after `context - 1` tokens.
          items.push({ kind: 'prefill', chunk: row.chunk, done: row.context - 1 })
          plainSeqs++
          plainKv += row.context
        }
      }
      if (maskOn && row.emits && row.req.spec.structured) {
        if (tokenInFlight) maskPending.push(row)
        else maskReady++
      }
    }
    for (const row of rows) if (row.emits) row.req.lastProducer = index

    const load = stepLoad(items)
    let activeLoras = 0
    if (loraOn) {
      // Both runners dispatch on the distinct adapters of the rows the step runs: MRV2 counts them from its batch (claim vllm.cudagraph.mrv2-active-loras),
      // and MRV1 reads its input batch, which it has trimmed to the scheduled requests before it dispatches (claims vllm.cudagraph.mrv1-active-loras,
      // vllm.cudagraph.mrv1-batch-trim). A running request the budget left out of the step is in neither count.
      const seen = new Set<number>()
      for (const row of rows) if (row.req.spec.adapter !== null) seen.add(row.req.spec.adapter)
      activeLoras = seen.size
    }
    let graph: GraphResult = 'off'
    let cgMode: CudaGraphMode = 'NONE'
    let padded = load.tokens
    if (runner === undefined) {
      if (cfg.graphs.mode === 'FULL') {
        const size = paddedSize(cfg.graphs.captureSizes, load.tokens)
        graph = size === null ? 'miss' : 'hit'
        if (size !== null) {
          padded = size
          cgMode = 'FULL'
        }
      }
    } else if (dispatcher !== null) {
      const decision = dispatcher.dispatch(batchShape(rows, queryLen), activeLoras)
      graph = decision.mode === 'NONE' ? 'miss' : 'hit'
      cgMode = decision.mode
      padded = decision.padded
    }
    // A padded token is a dummy sequence of one token: it costs the GPU a token, a KV entry and an attention pair, and the host nothing.
    const extra = padded - load.tokens
    const work: GpuWork = { seqs: load.seqs, prefillSeqs, tokens: padded, kvTokens: load.kvTokens + extra, attnPairs: load.attnPairs + extra }
    const cost = gpuCost(gpu, work)
    // The drafts: k small forwards a round, priced as a share of a plain decode step of the speculative rows, and part of the step's forward span.
    let draftUs = 0
    if (spec !== undefined && plainSeqs > 0) {
      const plain = gpuCost(gpu, { seqs: plainSeqs, prefillSeqs: 0, tokens: plainSeqs, kvTokens: plainKv, attnPairs: plainKv })
      draftUs = divRound(specK * spec.draftCostPermille * plain.gpuUs, 1000)
    }

    const launchUs = cgMode === 'FULL' ? host.graphReplayUs : cgMode === 'PIECEWISE' ? piecewiseLaunchUs : eagerLaunchUs
    const launch = placeLaunch(cpuT, gpuT, {
      scheduleUs: host.scheduleBaseUs + (cost.hostSeqUs === null ? host.schedulePerSeqUs * rows.length : cost.hostSeqUs),
      prepareUs: host.prepPerTokenUs * load.tokens,
      launchUs,
      forwardUs: cost.gpuUs + draftUs,
    })
    lanes.add('cpu-main', index, 'schedule', cpuT, launch.scheduleEnd)
    lanes.add('cpu-main', index, 'prepare', launch.scheduleEnd, launch.prepareEnd)
    lanes.add('cpu-main', index, 'launch', launch.prepareEnd, launch.launchEnd)
    const forward = lanes.add('gpu-stream', index, 'forward', launch.forwardStart, launch.forwardEnd)

    // The mask of the rows whose input token is home. With overlap it is built now, while the forward runs, by the engine thread
    // (claim vllm.mask.overlap); without it, after the forward has ended.
    const readyMaskUs = maskOn ? maskFillUs(maskReady, host.maskPerSeqUs, specK) : 0
    let maskUs = 0
    cpuT = launch.launchEnd
    if (readyMaskUs > 0 && maskOverlap) {
      maskUs += addMask(index, cpuT, cpuT + readyMaskUs)
      cpuT += readyMaskUs
    }

    const violation = checkDependency(cfg.inputIds, index, launch.scheduleEnd, inFlightRows)
    if (violation !== null) violations.push(violation)

    const record: StepRecordV1 = {
      index,
      seqs: rows.length,
      prefillSeqs,
      ghostSeqs: 0,
      tokens: load.tokens,
      paddedTokens: padded,
      graph,
      launches: cgMode === 'FULL' ? 1 : cgMode === 'PIECEWISE' ? piecewiseLaunches : eagerLaunches,
      forward,
      ...(runner === undefined ? {} : { mode: cgMode }),
      ...(loraOn ? { activeLoras } : {}),
      ...(maskOn ? { maskUs } : {}),
      // The drafts are part of the forward span, so the horizon can cut them with it.
      ...(spec === undefined ? {} : { draftUs: Math.min(draftUs, forward === null ? 0 : forward.endUs - forward.startUs) }),
    }
    records.push(record)
    inflight.push({
      record,
      rows,
      forwardEnd: launch.forwardEnd,
      sampleUs: cost.hostSeqUs === null ? host.samplePerSeqUs * rows.length : 0,
      maskAfterSyncUs: maskOverlap ? 0 : readyMaskUs,
      maskPending,
    })
    gpuT = launch.forwardEnd
  }

  /**
   * Waits for the oldest step in flight, reads its sampled ids back and updates the requests from them. Returns false if the
   * horizon cut the read-back, which ends the run with the tokens never read.
   */
  const readBack = (): boolean => {
    const flight = inflight.shift()
    if (flight === undefined) throw new Error('internal: a read-back with no step in flight')
    const { index } = flight.record
    // Without overlap the bitmask is built once the forward has ended, between the sync and the sample.
    const rb = placeReadback(cpuT, flight.forwardEnd, host.syncUs, flight.maskAfterSyncUs + flight.sampleUs)
    lanes.add('cpu-main', index, 'sync', rb.syncStart, rb.syncEnd)
    if (flight.maskAfterSyncUs > 0) flight.record.maskUs = (flight.record.maskUs ?? 0) + addMask(index, rb.syncEnd, rb.syncEnd + flight.maskAfterSyncUs)
    lanes.add('cpu-main', index, 'sample', rb.syncEnd + flight.maskAfterSyncUs, rb.sampleEnd)
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
        // A speculative row gives its request the accepted drafts and one more, as far as the request's own length allows (claim spec.paper.bonus-token).
        req.emitted += Math.min(row.emit, req.outputTokens - req.emitted)
        if (req.firstUs === null) req.firstUs = rb.sampleEnd
        req.lastUs = rb.sampleEnd
        if (req.emitted === req.outputTokens) {
          req.finished = true
          anyFinished = true
        }
        if (spec !== undefined && !row.prefill) {
          specTally.rounds++
          specTally.drafted += row.drafts
          specTally.accepted += row.accepted
          specTally.emitted += row.emit
        }
      }
    }
    if (anyFinished) running = running.filter((req) => !req.finished)

    // The rows of the step behind this one whose bitmask needed this step's token can have it filled now (claim vllm.mask.deferred-sampling).
    const next = inflight[0]
    if (next !== undefined && next.maskPending.length > 0) {
      const live = next.maskPending.filter((row) => !row.req.finished).length
      const us = maskFillUs(live, host.maskPerSeqUs, specK)
      if (us > 0) {
        next.record.maskUs = (next.record.maskUs ?? 0) + addMask(next.record.index, cpuT, cpuT + us)
        cpuT += us
      }
    }
    return true
  }

  // The engine core's busy loop (claims vllm.engine-core.busy-loop, vllm.step.batch-queue). Each pass either launches a step, or reads the oldest one back, or waits for a request.
  while (cpuT < horizon) {
    while (arrived < n && reqs[arrived].dueUs <= cpuT) waiting.push(reqs[arrived++])
    const hasWork = running.length > 0 || head < waiting.length
    if (hasWork && inflight.length < maxInFlight) {
      launchStep()
      // `step_with_batch_queue` returns here while the queue has room, to schedule the next step before it waits for this one.
      if (inflight.length < maxInFlight) continue
    } else if (inflight.length === 0) {
      if (arrived >= n) break
      // Nothing to run and nothing in flight: the loop blocks on its input queue until the next request is due.
      cpuT = reqs[arrived].dueUs
      continue
    }
    if (!readBack()) break
  }

  const specSummary: SpecSummary | undefined = spec === undefined ? undefined : { ...specTally, expectedPerRoundMilli: expectedTokensPerRoundMilli(spec.alphaPermille, specK) }
  const finished = finishRun(records, reqs, lanes.timeline())
  // What only the v1 features report, added to what the v0 metrics give: a field is there when its feature is on.
  const steps = finished.steps.map((stat, i) => {
    const r = records[i]
    return {
      ...stat,
      ...(r.mode === undefined ? {} : { mode: r.mode }),
      ...(r.activeLoras === undefined ? {} : { activeLoras: r.activeLoras }),
      ...(r.maskUs === undefined ? {} : { maskUs: r.maskUs }),
      ...(r.draftUs === undefined ? {} : { draftUs: r.draftUs }),
    }
  })
  const summary = {
    ...finished.summary,
    ...(records.some((r) => r.maskUs !== undefined) ? { maskUs: records.reduce((total, r) => total + (r.maskUs ?? 0), 0) } : {}),
    ...(records.some((r) => r.draftUs !== undefined) ? { draftUs: records.reduce((total, r) => total + (r.draftUs ?? 0), 0) } : {}),
    ...(specSummary === undefined ? {} : { spec: specSummary }),
  }
  return { horizonUs: horizon, lanes: lanes.timeline(), steps, reqs: finished.reqs, summary, violations }
}
