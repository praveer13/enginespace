/*
 * The worked numbers of TR2's lessons (W1-T15), computed from the step-loop model and the full service's levels, so that a number a lesson
 * prints from the simulator is one this file recomputes. `tests/content/tr2-module.test.ts` holds each lesson's text to these functions, and
 * when the model or a level moves a number, the test names the lesson and the figure that went stale.
 *
 * The worlds are the game's own (`packages/play/loop/full`): the `async`, `graphs`, `mrv2` and `close` levels on their practice seeds, so that
 * a learner who plays the level sees the numbers that the lesson printed. Every host phase is the model's [estimated] preset, the forward of
 * "70B on H100" is kernelspace's S5 fit and the forward of the small model is a napkin, so the numbers claim nothing about a real engine
 * (the notional-machine card says so); a lesson gives the day and the commit they were read at.
 */
import { buildFullLevel } from '../../packages/play/loop/full/levels'
import { configOf, nightOf } from '../../packages/play/loop/full/night'
import type { Night } from '../../packages/play/loop/full/night'
import type { Levers, StageWorld } from '../../packages/play/loop/full/types'
import { hostPreset } from '../../packages/sim/host'
import {
  GRAPH_MEMORY_MODEL,
  PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER,
  capturedGraphs,
  defaultCaptureSizes,
  dispatchV1,
  dispatchV2,
  gpuLayers,
  graphReservationBytes,
  kvBudget,
  kvTokens,
  makeGraphConfig,
  paddedSize,
  resolveGraphMode,
  runStepLoop,
  vllmCaptureSizes,
  SMALL_CARD,
} from '../../packages/sim/steploop'
import type { BackendSupport, GraphModeId } from '../../packages/sim/steploop'
import { sglangDecodeBuckets, sglangPaddedSize } from '../../packages/sim/steploop/engine-defaults'
import type { ReqSpec, Workload } from '../../packages/sim/workload'

/** The practice seed of the levels that TR2's lessons print numbers from. `close` has its own, which its registry entry pins. */
export const PRACTICE_SEED = 0
export const CLOSE_PRACTICE_SEED = 16

export type CardName = '70b' | 'small'
export const CARD_NAMES: readonly CardName[] = ['70b', 'small']

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: one step, and what the GPU waits for                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const stageOf = (levelId: string, id: string, seed: number = PRACTICE_SEED): StageWorld => {
  const stage = buildFullLevel(levelId, seed).stages.find((candidate) => candidate.id === id)
  if (stage === undefined) throw new Error(`the ${levelId} level has no ${id} stage`)
  return stage
}

export interface SteadyFire {
  /** The rows of the fire: a full rail, so every clip is a plate. */
  readonly rows: number
  /** The CPU lane's phases of the fire, in µs, in the order they run. A phase the card prices at 0 is absent. */
  readonly phases: readonly { readonly kind: string; readonly us: number }[]
  readonly cpuUs: number
  readonly forwardUs: number
  /** The GPU's idle time before this fire, while the CPU lane was busy. */
  readonly bubbleUs: number
  /** The share of the fire's cycle that the GPU is busy, out of 1,000, with nothing overlapped: forward ÷ (forward + the CPU's work). */
  readonly busyPermille: number
}

/**
 * A fire in the middle of a night of the `async` level, taken as soon as the rail is full and no ticket is being admitted: every row is a
 * decode, so the fire is the same from one to the next. The night is served with async scheduling off, which is the stage's naive
 * configuration: the next call is written after the fire.
 */
export function steadyFire(card: CardName): SteadyFire {
  const stage = stageOf('async', card)
  const night = nightOf(stage, stage.naive)
  if (night === null) throw new Error('the naive night is refused')
  const at = night.fires.findIndex((fire, i) => i > 0 && fire.seqs === stage.slots && fire.admits === 0 && night.fires[i - 1].seqs === stage.slots)
  const fire = night.fires[at]
  const phases = night.cpu.filter((span) => span.step === at).map((span) => ({ kind: span.kind as string, us: span.endUs - span.startUs }))
  const forwardUs = night.gpu.find((span) => span.step === at)!.endUs - night.gpu.find((span) => span.step === at)!.startUs
  const cpuUs = phases.reduce((sum, phase) => sum + phase.us, 0)
  return { rows: fire.seqs, phases, cpuUs, forwardUs, bubbleUs: fire.bubbleUs, busyPermille: Math.round((1000 * forwardUs) / (forwardUs + cpuUs)) }
}

export interface LaneSpan {
  readonly step: number
  readonly kind: string
  readonly startUs: number
  readonly endUs: number
}

/**
 * The spans of `steps` consecutive steady fires of the `async` level's night on `card`, with the day's configuration off or on, moved so that
 * the first schedule starts at 0. The figures of lessons 1 and 3 draw them.
 */
export function stepSpans(card: CardName, asyncOn: boolean, steps: number): { cpu: LaneSpan[]; gpu: LaneSpan[]; endUs: number } {
  const stage = stageOf('async', card)
  const night = nightOf(stage, asyncOn ? stage.house : stage.naive)
  if (night === null) throw new Error('an async night is refused')
  const at = night.fires.findIndex((fire, i) => i > 0 && fire.seqs === stage.slots && fire.admits === 0 && night.fires[i - 1].seqs === stage.slots)
  const keep = (span: { step: number }): boolean => span.step >= at && span.step < at + steps
  const cpu = night.cpu.filter(keep)
  const gpu = night.gpu.filter(keep)
  const t0 = Math.min(...cpu.map((span) => span.startUs))
  const shift = (span: { step: number; kind: string; startUs: number; endUs: number }): LaneSpan => ({ step: span.step - at, kind: span.kind, startUs: span.startUs - t0, endUs: span.endUs - t0 })
  const moved = { cpu: cpu.map(shift), gpu: gpu.map(shift) }
  return { ...moved, endUs: Math.max(...moved.cpu.map((span) => span.endUs), ...moved.gpu.map((span) => span.endUs)) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: one token budget                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface BudgetStep {
  readonly decodeRows: number
  readonly promptTokens: number
  readonly tokens: number
  /** The length of the step's forward on the small model's card. */
  readonly forwardUs: number
}

/** The shape of lesson 2's example: how many requests decode, how long the prompt that arrives is, and the step's budget. All [estimated]. */
export const BUDGET = { decoding: 100, prompt: 3000, budget: 2048, maxSeqs: 256 } as const

const req = (id: number, dueUs: number, promptTokens: number, outputTokens: number): ReqSpec => ({ id, dueUs, promptTokens, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false })

/**
 * 100 requests that decode while a prompt of 3,000 tokens arrives, on the small model's card with a budget of 2,048 tokens and room for 256
 * requests, which are vLLM's server defaults on a 24 GB card (claims vllm.batch-defaults.small.*). The step before the prompt, the two steps
 * that carry it, and the first step after it.
 */
export function budgetSteps(chunked = true): BudgetStep[] {
  const reqs: ReqSpec[] = []
  for (let id = 0; id < BUDGET.decoding; id++) reqs.push(req(id, 0, 16, 400))
  reqs.push(req(BUDGET.decoding, 400_000, BUDGET.prompt, 20))
  const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
  const run = runStepLoop(
    workload,
    { maxNumSeqs: BUDGET.maxSeqs, maxBatchedTokens: BUDGET.budget, chunkedPrefill: chunked, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] }, runner: 'mrv2' },
    hostPreset('mrv2').card,
    SMALL_CARD,
    { horizonUs: 10_000_000_000, rows: true },
  )
  const first = run.steps.findIndex((step, i) => i > 0 && step.prefillSeqs > 0 && step.tokens > 200)
  return run.steps.slice(first - 1, first + 3).map((step) => {
    const decodeRows = step.seqs - step.prefillSeqs
    return { decodeRows, promptTokens: step.tokens - decodeRows, tokens: step.tokens, forwardUs: step.gpuUs }
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: async scheduling                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface AsyncRow {
  readonly clockUs: number
  readonly tpotP50Us: number
  readonly bubbleUs: number
  /** The fires with a dark stretch before them, and all the fires. */
  readonly darkFires: number
  readonly fires: number
  readonly ghostTokens: number
  readonly usefulTokens: number
}

const rowOf = (night: Night): AsyncRow => ({
  clockUs: night.clockUs,
  tpotP50Us: night.tpotP50Us ?? 0,
  bubbleUs: night.bubbleUs,
  darkFires: night.fires.filter((fire) => fire.bubbleUs > 0).length,
  fires: night.fires.length,
  ghostTokens: night.fires.reduce((sum, fire) => sum + fire.ghosts, 0),
  usefulTokens: night.usefulTokens,
})

/** The `async` level's night on its practice seed, served with the next call written after the fire (off) and during it (on). */
export function asyncNights(card: CardName): { off: AsyncRow; on: AsyncRow } {
  const stage = stageOf('async', card)
  const off = nightOf(stage, stage.naive)
  const on = nightOf(stage, stage.house)
  if (off === null || on === null) throw new Error('an async night is refused')
  return { off: rowOf(off), on: rowOf(on) }
}

export interface DarkFire {
  readonly index: number
  readonly rows: number
  readonly admits: number
  readonly mode: string
  readonly bubbleUs: number
  readonly forwardUs: number
}

/** The fires of the `async` level's night with overlap on that still have a dark stretch before them. Each is a fire that admits a ticket. */
export function darkFires(card: CardName): DarkFire[] {
  const stage = stageOf('async', card)
  const night = nightOf(stage, stage.house)!
  return night.fires.flatMap((fire) => (fire.bubbleUs > 0 ? [{ index: fire.index, rows: fire.seqs, admits: fire.admits, mode: fire.mode as string, bubbleUs: fire.bubbleUs, forwardUs: fire.endUs - fire.startUs }] : []))
}

/** The closed form of the step with and without overlap, from the plan, the read and the forward (the front page's rule, in µs). */
export const stepModel = {
  gapOff: (plan: number, read: number): number => plan + read,
  gapOn: (plan: number, read: number, forward: number): number => Math.max(0, plan + read - forward),
  clockOff: (plan: number, read: number, forward: number): number => plan + forward + read,
  clockOn: (plan: number, read: number, forward: number): number => Math.max(forward, plan + read),
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4: the V2 runner                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface RunnerPhases {
  readonly prepPerTokenUs: number
  readonly syncUs: number
  readonly samplePerSeqUs: number
}

export const RUNNERS: Readonly<Record<'v1' | 'mrv2', RunnerPhases>> = {
  v1: pickRunner('v1'),
  mrv2: pickRunner('mrv2'),
}

function pickRunner(id: 'v1' | 'mrv2'): RunnerPhases {
  const card = hostPreset(id).card
  return { prepPerTokenUs: card.prepPerTokenUs, syncUs: card.syncUs, samplePerSeqUs: card.samplePerSeqUs }
}

/** What MRV2 takes off the CPU's work in a decode step of `rows` rows, from the presets: the three phases that differ. */
export function mrv2SavesPerStep(rows: number): number {
  const v1 = RUNNERS.v1
  const v2 = RUNNERS.mrv2
  return rows * (v1.prepPerTokenUs - v2.prepPerTokenUs) + (v1.syncUs - v2.syncUs) + rows * (v1.samplePerSeqUs - v2.samplePerSeqUs)
}

export interface RunnerRegime {
  readonly forwardUs: number
  readonly v1IdleUs: number
  readonly mrv2IdleUs: number
  readonly savedUs: number
}

/** The CPU's work of a decode step of `rows` rows on the small model's card, before the forward (schedule, prepare, launch) and after it (sync, sample), for a runner. */
export function hostWork(runner: 'v1' | 'mrv2', rows: number): { planUs: number; readUs: number } {
  const card = hostPreset(runner).card
  return {
    planUs: card.scheduleBaseUs + card.schedulePerSeqUs * rows + card.prepPerTokenUs * rows + card.graphReplayUs,
    readUs: card.syncUs + card.samplePerSeqUs * rows,
  }
}

/** With async scheduling on, the idle time between two forwards of a decode step of 12 rows on each runner, for forwards of other lengths: the closed form of lesson 3. */
export function runnerRegimes(forwards: readonly number[], rows = 12): RunnerRegime[] {
  const v1 = hostWork('v1', rows)
  const v2 = hostWork('mrv2', rows)
  return forwards.map((forwardUs) => {
    const v1IdleUs = stepModel.gapOn(v1.planUs, v1.readUs, forwardUs)
    const mrv2IdleUs = stepModel.gapOn(v2.planUs, v2.readUs, forwardUs)
    return { forwardUs, v1IdleUs, mrv2IdleUs, savedUs: v1IdleUs - mrv2IdleUs }
  })
}

/** The `mrv2` level's night on its practice seed with the legacy runner and with MRV2: the median TPOT of each, and what MRV2 saves. */
export function mrv2Nights(card: CardName): { v1TpotUs: number; mrv2TpotUs: number; savedUs: number } {
  const stage = stageOf('mrv2', card)
  const legacy = nightOf(stage, stage.naive)
  const current = nightOf(stage, stage.house)
  if (legacy === null || current === null) throw new Error('an mrv2 night is refused')
  return { v1TpotUs: legacy.tpotP50Us ?? 0, mrv2TpotUs: current.tpotP50Us ?? 0, savedUs: (legacy.tpotP50Us ?? 0) - (current.tpotP50Us ?? 0) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 5: CUDA graphs                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Comb {
  readonly layers: number
  readonly eagerCalls: number
  readonly piecewiseCalls: number
  readonly eagerLaunchUs: number
  readonly piecewiseLaunchUs: number
  readonly fullLaunchUs: number
  readonly kernelsPerLayer: number
  readonly launchPerKernelUs: number
  readonly replayUs: number
}

/** The calls it takes to launch one fire of the small model's 28 layers, eagerly, in pieces and as one graph, and what they cost the CPU. */
export function comb(): Comb {
  const host = hostPreset('mrv2').card
  const layers = gpuLayers(SMALL_CARD)
  const attention = PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER
  return {
    layers,
    eagerCalls: host.kernelsPerLayer * layers,
    piecewiseCalls: layers + 1 + layers * attention,
    eagerLaunchUs: host.kernelsPerLayer * layers * host.launchPerKernelUs,
    piecewiseLaunchUs: (layers + 1) * host.graphReplayUs + layers * attention * host.launchPerKernelUs,
    fullLaunchUs: host.graphReplayUs,
    kernelsPerLayer: host.kernelsPerLayer,
    launchPerKernelUs: host.launchPerKernelUs,
    replayUs: host.graphReplayUs,
  }
}

/** vLLM's default capture sizes, with the ceiling of 512 tokens. */
export const DEFAULT_SIZES: readonly number[] = defaultCaptureSizes(512)

export interface PadRow {
  readonly rows: number
  readonly padded: number | null
  readonly wasted: number | null
}

export function padRows(ns: readonly number[], sizes: readonly number[] = DEFAULT_SIZES): PadRow[] {
  return ns.map((rows) => {
    const padded = paddedSize(sizes, rows)
    return { rows, padded, wasted: padded === null ? null : padded - rows }
  })
}

export interface SizesNight {
  readonly batches: readonly number[]
  readonly naiveMolds: readonly number[]
  readonly houseMolds: readonly number[]
  readonly naiveCost: number
  readonly houseCost: number
  readonly uncapturedByNaive: number
  readonly molds: number
}

/** The `graphs` level's sizes stage on its practice seed: the histogram of a night's decode batches, vLLM's own sizes cut to three molds, and the best three. */
export function sizesNight(): SizesNight {
  const stage = stageOf('graphs', 'sizes')
  const world = stage.sizes!
  const naive = nightOf(stage, stage.naive)!
  const house = nightOf(stage, stage.house)!
  const largest = Math.max(...stage.naive.captureSizes)
  return {
    batches: world.batches,
    naiveMolds: stage.naive.captureSizes,
    houseMolds: stage.house.captureSizes,
    naiveCost: naive.metric,
    houseCost: house.metric,
    uncapturedByNaive: world.batches.filter((batch) => batch > largest).length,
    molds: world.molds,
  }
}

/** The `graphs` level's comb stage on its practice seed: the night with no routine drilled, and with the default mode. */
export function combNight(): { eager: AsyncRow; graphs: AsyncRow; eagerCalls: number; graphCalls: number } {
  const stage = stageOf('graphs', 'comb')
  const eager = nightOf(stage, stage.naive)!
  const graphs = nightOf(stage, stage.house)!
  return { eager: rowOf(eager), graphs: rowOf(graphs), eagerCalls: eager.fires[3].calls, graphCalls: graphs.fires[3].calls }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 6: dispatch keys, modes and memory                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export const MODE_NAMES: readonly GraphModeId[] = ['NONE', 'PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE']
export const SUPPORTS: readonly BackendSupport[] = ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE', 'NEVER']

/** The mode that runs when `requested` meets a backend of each support level, or 'refused' where the engine raises. */
export function modeTable(): Record<string, Record<string, string>> {
  const table: Record<string, Record<string, string>> = {}
  for (const requested of MODE_NAMES) {
    table[requested] = {}
    for (const support of SUPPORTS) {
      try {
        table[requested][support] = resolveGraphMode(requested, { support }).mode
      } catch {
        table[requested][support] = 'refused'
      }
    }
  }
  return table
}

/** The rail, the sizes and the adapters of lesson 6's dispatch examples: a rail of 12 requests, vLLM's list for it, and 2 adapters at most. */
export const DISPATCH_RAIL = { maxNumSeqs: 12, maxBatchedTokens: 2048, maxLoras: 2 } as const

export function dispatchConfig(withLora = true) {
  const sizes = vllmCaptureSizes({ maxNumSeqs: DISPATCH_RAIL.maxNumSeqs, maxBatchedTokens: DISPATCH_RAIL.maxBatchedTokens })
  return makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: sizes, maxNumSeqs: DISPATCH_RAIL.maxNumSeqs, ...(withLora ? { lora: { maxLoras: DISPATCH_RAIL.maxLoras } } : {}) })
}

export interface DispatchCase {
  readonly name: string
  readonly rows: number
  readonly tokens: number
  readonly uniform: boolean
  readonly adapters: number
}

export const DISPATCH_CASES: readonly DispatchCase[] = [
  { name: '12 decode rows', rows: 12, tokens: 12, uniform: true, adapters: 0 },
  { name: '9 decode rows', rows: 9, tokens: 9, uniform: true, adapters: 0 },
  { name: '8 decode rows and a prompt chunk of 12 tokens', rows: 9, tokens: 20, uniform: false, adapters: 0 },
  { name: '12 decode rows, 2 adapters', rows: 12, tokens: 12, uniform: true, adapters: 2 },
  { name: '11 decode rows and a prompt chunk of 20 tokens', rows: 12, tokens: 31, uniform: false, adapters: 0 },
]

export interface DispatchRow {
  readonly name: string
  readonly v2: { readonly mode: string; readonly tokens: number; readonly adapters: number }
  readonly v1: { readonly mode: string; readonly tokens: number; readonly adapters: number }
}

/** What each runner's dispatcher (the course's port of it) picks for each case. Held to the pinned code's own answers by the owner's table (Q-10), which is not committed yet. */
export function dispatchTable(): DispatchRow[] {
  const g = dispatchConfig()
  return DISPATCH_CASES.map((c) => {
    const v2 = dispatchV2(g, c.rows, c.tokens, c.uniform ? 1 : null, c.adapters, c.uniform ? 1 : null)
    const v1 = dispatchV1(g, c.tokens, c.uniform, c.adapters > 0, c.adapters)
    return {
      name: c.name,
      v2: { mode: v2.cgMode, tokens: v2.numTokens, adapters: v2.numActiveLoras },
      v1: { mode: v1.mode, tokens: v1.padded, adapters: v1.desc.numActiveLoras },
    }
  })
}

export function dispatchSizes(): readonly number[] {
  return dispatchConfig().captureSizes
}

export interface GraphCount {
  readonly mode: GraphModeId
  readonly graphs: number
  readonly mib: number
}

/** The graphs MRV2 captures for the rail above in each mode, and the memory the model gives them (8 MiB a graph and 16 KiB a token [estimated]). */
export function graphCounts(withLora = false): GraphCount[] {
  return MODE_NAMES.map((mode) => {
    const g = makeGraphConfig({ mode, captureSizes: dispatchSizes(), maxNumSeqs: DISPATCH_RAIL.maxNumSeqs, ...(withLora ? { lora: { maxLoras: DISPATCH_RAIL.maxLoras } } : {}) })
    const graphs = capturedGraphs(g, 'mrv2')
    return { mode, graphs: graphs.length, mib: graphReservationBytes(graphs) / (1024 * 1024) }
  })
}

/** The default sizes of a server whose rail is 256, in FULL_AND_PIECEWISE: the graphs and the memory the model gives them. */
export function defaultGraphs(): GraphCount {
  const g = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: DEFAULT_SIZES, maxNumSeqs: 256 })
  const graphs = capturedGraphs(g, 'mrv2')
  return { mode: 'FULL_AND_PIECEWISE', graphs: graphs.length, mib: graphReservationBytes(graphs) / (1024 * 1024) }
}

export const GRAPH_MODEL = GRAPH_MEMORY_MODEL

export interface KvCase {
  readonly requestedBytes: number
  readonly nonKvBytes: number
  readonly graphBytes: number
  readonly kvBytes: number
  readonly kvTokensWith: number
  readonly kvTokensWithout: number
}

/** The KV cache of the small model's card with and without the graphs taken off first: 24e9 bytes, 0.92 of it requested, 2e9 bytes of activations [estimated]. */
export function kvAfterGraphs(): KvCase {
  const graphBytes = graphReservationBytes(capturedGraphs(makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: DEFAULT_SIZES, maxNumSeqs: 256 }), 'mrv2'))
  const spec = SMALL_CARD.spec
  const plan = { hbmBytes: spec.chip.hbmBytes, utilizationPermille: 920, weightBytes: spec.model.weightBytes, workspaceBytes: 2_000_000_000, graphBytes }
  const withGraphs = kvBudget(plan)
  const without = kvBudget({ ...plan, applyGraphEstimate: false })
  return {
    requestedBytes: withGraphs.requestedBytes,
    nonKvBytes: withGraphs.nonKvBytes,
    graphBytes: withGraphs.graphBytes,
    kvBytes: withGraphs.kvBytes,
    kvTokensWith: kvTokens(withGraphs, spec.model.kvBytesPerToken),
    kvTokensWithout: kvTokens(without, spec.model.kvBytesPerToken),
  }
}

export interface ClosePractice {
  readonly card: string
  readonly rail: number
  readonly budget: number
  readonly graphRoomMiB: number
  readonly naiveDarkPercent: number
  readonly naiveClockUs: number
  readonly naiveDarkUs: number
  readonly houseClockUs: number
  readonly houseDarkUs: number
  readonly houseMode: GraphModeId
  readonly houseSizes: readonly number[]
  readonly houseLevers: Levers
  readonly naiveLevers: Levers
}

/** The `close` level on its practice seed: the naive configuration (everything off) and the house's, the room the house leaves the routines, and the dark share of the naive night. */
export function closePractice(): ClosePractice {
  const stage = stageOf('close', 'close', CLOSE_PRACTICE_SEED)
  const naive = nightOf(stage, stage.naive)!
  const house = nightOf(stage, stage.house)!
  return {
    card: stage.card,
    rail: stage.slots,
    budget: stage.budget,
    graphRoomMiB: (stage.graphBudget ?? 0) / (1024 * 1024),
    naiveDarkPercent: stage.answer,
    naiveClockUs: naive.clockUs,
    naiveDarkUs: naive.bubbleUs,
    houseClockUs: house.clockUs,
    houseDarkUs: house.bubbleUs,
    houseMode: stage.house.graphMode,
    houseSizes: stage.house.captureSizes,
    houseLevers: stage.house,
    naiveLevers: stage.naive,
  }
}

export interface CloseRefusals {
  /** vLLM's default capture sizes for the practice seed's rail and budget. */
  readonly defaultSizes: readonly number[]
  /** For each mode that uses graphs, whether the engine refuses to start with the default sizes (their graphs take more than the room). */
  readonly defaultSizesRefused: Readonly<Record<string, boolean>>
  /** Whether the default mode, FULL_AND_PIECEWISE, is refused at the house's own sizes. */
  readonly defaultModeAtHouseSizesRefused: boolean
  /** The dependency violations of the house's night with the ids written by hand instead of carried by the GPU. */
  readonly handIdsViolations: number
}

/** What the `close` level's room does to the configurations around the house, on its practice seed. */
export function closeRefusals(): CloseRefusals {
  const stage = stageOf('close', 'close', CLOSE_PRACTICE_SEED)
  const house = stage.house
  const defaultSizes = vllmCaptureSizes({ maxNumSeqs: stage.slots, maxBatchedTokens: stage.budget })
  const defaultSizesRefused: Record<string, boolean> = {}
  for (const graphMode of ['PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE'] as const) {
    defaultSizesRefused[graphMode] = nightOf(stage, { ...house, graphMode, captureSizes: defaultSizes }) === null
  }
  const defaultModeAtHouseSizesRefused = nightOf(stage, { ...house, graphMode: 'FULL_AND_PIECEWISE' }) === null
  const handIds = nightOf(stage, { ...house, inputIds: 'host' })
  return { defaultSizes, defaultSizesRefused, defaultModeAtHouseSizesRefused, handIdsViolations: handIds === null ? -1 : handIds.violations }
}

/** The engine configuration of a stage's naive night, as the step loop takes it. For the test that the table of lesson 6 is the level's. */
export function naiveConfigOf(levelId: string, id: string, seed: number = PRACTICE_SEED) {
  const stage = stageOf(levelId, id, seed)
  return configOf(stage, stage.naive, stage.naive.graphMode)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 7: the same loop in other engines                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Mini-SGLang's decode sizes: 1, 2 and 4, then every multiple of 8 up to its largest batch (claim mini-sglang.graph.sizes). */
export function miniSglangSizes(maxBs: number): number[] {
  const sizes = [1, 2, 4]
  for (let n = 8; n <= maxBs; n += 8) sizes.push(n)
  return sizes
}

export interface EnginePad {
  readonly rows: number
  readonly vllm: number | null
  readonly sglang4090: number | null
  readonly sglangH100: number | null
  readonly mini: number | null
}

/**
 * The size each engine pads a decode batch of `rows` to with its defaults on a 24 GB card (vLLM's list up to 512, SGLang's buckets cut at 48,
 * Mini-SGLang's list up to 160), and SGLang's on an 80 GB card (cut at 256). Null is a batch the engine runs without a graph.
 */
export function enginePads(ns: readonly number[]): EnginePad[] {
  const sg4090 = sglangDecodeBuckets(48)
  const sgH100 = sglangDecodeBuckets(256)
  const mini = miniSglangSizes(160)
  return ns.map((rows) => ({
    rows,
    vllm: paddedSize(DEFAULT_SIZES, rows),
    sglang4090: sglangPaddedSize(sg4090, rows),
    sglangH100: sglangPaddedSize(sgH100, rows),
    mini: mini.find((size) => size >= rows) ?? null,
  }))
}

/** Rows that a batch wastes: the padded size less the batch, or null for a batch without a graph. */
export const wasted = (rows: number, padded: number | null): number | null => (padded === null ? null : padded - rows)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The reference of each prediction of TR2's lessons, from the numbers its prompt gives and the course's own functions. Nothing is stored in a
 * lesson (A§1, I3). The lesson's prediction box (W1b-T02) reads its answer from the run of the game block that follows the prediction, where
 * packages/play/predictions has a reading, and tests/play/predictions.test.ts holds each reading to the figure here; a prediction with no
 * reading waits for W2-T43, and its figure here is what that task starts from.
 */
export const PREDICTIONS: Readonly<Record<string, { readonly unit: string; readonly reference: () => number }>> = {
  // 700 µs of CPU work before the forward, 300 µs after, a forward of 2,000 µs, nothing overlapped: the GPU is busy 2,000 of 3,000 µs.
  'tr2.l1.p1': { unit: 'percent', reference: () => (100 * 2000) / (700 + 300 + 2000) },
  // 100 decodes take 100 tokens of a budget of 2,048: the prompt's first chunk is what is left.
  'tr2.l2.p1': { unit: 'tokens', reference: () => BUDGET.budget - BUDGET.decoding },
  // 1,000 µs of plan and 500 µs of read against a forward of 1,200 µs, with async scheduling on: the CPU's work less the forward.
  'tr2.l3.p1': { unit: 'us', reference: () => stepModel.gapOn(1000, 500, 1200) },
  // V1 against MRV2 on a decode step of 12 rows, from the presets: the three phases that differ.
  'tr2.l4.p1': { unit: 'us', reference: () => mrv2SavesPerStep(12) },
  // 12 kernels a layer on 28 layers at 6 µs a launch, against a replay of 30 µs.
  'tr2.l5.p1': { unit: 'us', reference: () => comb().eagerLaunchUs - comb().fullLaunchUs },
  // Graphs of FULL_AND_PIECEWISE on a rail of 12 with vLLM's sizes: a full decode graph for each size up to the rail and a piecewise graph for each size.
  'tr2.l6.p1': { unit: 'graphs', reference: () => graphCounts().find((row) => row.mode === 'FULL_AND_PIECEWISE')!.graphs },
  // 0.96 GB of graphs at 114,688 bytes of KV cache a token: the tokens that the graphs cost. The prompt rounds the sim's 962,822,144 bytes.
  'tr2.l6.p2': { unit: 'tokens', reference: () => 960_000_000 / SMALL_CARD.spec.model.kvBytesPerToken },
  // A decode batch of 10: vLLM pads it to 16 and SGLang's buckets to 12, so SGLang wastes 4 rows fewer.
  'tr2.l7.p1': { unit: 'rows', reference: () => (wasted(10, paddedSize(DEFAULT_SIZES, 10)) ?? 0) - (wasted(10, sglangPaddedSize(sglangDecodeBuckets(256), 10)) ?? 0) },
}

