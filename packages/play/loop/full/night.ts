/**
 * A stage's night on the sim (TR2's levels; GAMES.md §3.2): the levers turned into the engine's configuration, the night the step loop
 * serves with them, and that night cut at the fires rung so far and laid out as the kitchen draws it.
 *
 * The night is the sim's own: `runStepLoop` v1 on the stage's workload and cost cards, asked for the requests of each step's rows
 * (`rows`), so every ticket hangs on its clip from its first fire to its last. Nothing here prices a step or decides who joins one; it
 * reads the run's records. The histogram world of `graphs` · `sizes` is priced fire by fire by ./sizes.ts instead, with the same cards.
 *
 * Nights are cached by their stage and levers, because the reducer, the view and the grade all ask for the same night; a cache hit is
 * the same object, and a run is a pure function of its arguments, so the cache changes no result.
 */
import type { Us } from '@es/sim/core'
import { hostPreset } from '@es/sim/host'
import type { HostCard } from '@es/sim/host'
import { capturedGraphs, graphReservationBytes, makeGraphConfig, PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER, resolveGraphMode, runStepLoop, s5Card, SMALL_CARD, gpuLayers } from '@es/sim/steploop'
import type { BackendSupport, GpuCard, GraphModeId, Span, StepLoopConfig, StepLoopRun } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import type { Workload, WorkloadSpec } from '@es/sim/workload'
import type { ClipView, KitchenView, PlaceView } from '../types'
import { captureCost, priceOf, priceTable } from './sizes'
import type { PriceTable } from './sizes'
import type { CardId, FullCounters, FullFire, Levers, StageWorld } from './types'

/** A time no night of these levels reaches: no horizon cuts a run [estimated, the longest night is a few seconds of the model's clock]. */
export const NIGHT_HORIZON_US: Us = 1_000_000_000

/** The "70B on H100" card at tensor-parallel degree 4, its host term on the CPU lane (D-044, proposed), and the small-model napkin. */
export const CARDS: Readonly<Record<CardId, GpuCard>> = Object.freeze({ '70b': s5Card('h100-vllm-0-10-2-fp8', 4), small: SMALL_CARD })

/** A night's tickets: short chats, every one due at once (a burst), each asking for `outputs` courses [estimated]. A share of them carries a grammar. */
export function workloadSpec(requests: number, structuredPermille: number, outputs: readonly [number, number] = [12, 28]): WorkloadSpec {
  return {
    requests,
    arrivals: { kind: 'burst' },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 8, hi: 32 }, output: { kind: 'uniform', lo: outputs[0], hi: outputs[1] } },
    ...(structuredPermille > 0 ? { structuredPermille } : {}),
  }
}

/** The bytes the routines of `mode` take for these levers: every graph the runner captures, each its fixed part and its tokens' (./memory in the sim). */
export function graphBytes(stage: Pick<StageWorld, 'slots'>, levers: Pick<Levers, 'captureSizes' | 'runner'>, mode: GraphModeId): number {
  if (mode === 'NONE' || levers.captureSizes.length === 0) return 0
  return graphReservationBytes(capturedGraphs(makeGraphConfig({ mode, captureSizes: levers.captureSizes, maxNumSeqs: stage.slots }), levers.runner))
}

/**
 * The mode that serves the night, or null with the reason when nothing does: the backend's downgrade (`resolvedMode`), then the reach-in's
 * room for the routines, where the stage has a limit.
 */
export function servingMode(stage: StageWorld, levers: Levers): { mode: GraphModeId | null; changes: readonly string[] } {
  const resolved = resolvedMode(stage.support, levers)
  if (resolved.mode === null || stage.graphBudget === null) return resolved
  const bytes = graphBytes(stage, levers, resolved.mode)
  if (bytes <= stage.graphBudget) return resolved
  return { mode: null, changes: [...resolved.changes, `${resolved.mode}'s routines take more memory than the reach-in can spare tonight, so the KV cache would not hold the night`] }
}

/** The host card for a runner, with the stage's own price of a bitmask row where it has one (the `mask` level's grammar). */
export function hostOf(stage: StageWorld, runner: 'mrv2' | 'v1'): HostCard {
  const card = hostPreset(runner).card
  return stage.maskRowUs === card.maskPerSeqUs ? card : { ...card, maskPerSeqUs: stage.maskRowUs }
}

/** The mode that runs when the levers' mode meets the backend's support, or the reason the engine refuses to start. */
export function resolvedMode(support: BackendSupport, levers: Pick<Levers, 'graphMode'>): { mode: GraphModeId | null; changes: readonly string[] } {
  try {
    const resolution = resolveGraphMode(levers.graphMode, { support })
    return { mode: resolution.mode, changes: resolution.changes }
  } catch (error) {
    return { mode: null, changes: [error instanceof Error ? error.message : String(error)] }
  }
}

/** The engine's configuration for a night: the rail, the token budget, and the levers, with the mode the backend lets run. */
export function configOf(stage: StageWorld, levers: Levers, mode: GraphModeId): StepLoopConfig {
  return {
    maxNumSeqs: stage.slots,
    maxBatchedTokens: stage.budget,
    chunkedPrefill: true,
    asyncScheduling: levers.async,
    inputIds: 'device',
    graphs: { mode, captureSizes: mode === 'NONE' ? [] : levers.captureSizes },
    runner: levers.runner,
    ...(stage.structuredPermille > 0 ? { structured: { overlap: levers.maskOverlap } } : {}),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A night                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A night as the kitchen reads it: its fires in order (each with the requests of its rows, the clip each sits in, and what each place
 * came to), the lanes, and the night's whole-run figures. The histogram world has no lanes of the sim; its fires are laid end to end
 * on the line at their own prices.
 */
export interface Night {
  readonly fires: readonly NightFire[]
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
  /** When the night ended. */
  readonly clockUs: Us
  /** The night's metric: the clock, or the capture cost. */
  readonly metric: number
  readonly tpotP50Us: Us | null
  /** Requests of the night, in order of their tickets; the histogram world's are its clips. */
  readonly requests: number
  /** The fire each request first rides, for the waiting tickets. */
  readonly firstFire: readonly number[]
}

export interface NightFire {
  readonly index: number
  readonly startUs: Us
  readonly endUs: Us
  readonly bubbleUs: Us
  /** Each clip's request, or null. */
  readonly clips: readonly (number | null)[]
  readonly places: readonly PlaceView['state'][]
  readonly admits: number
  readonly ghosts: number
  readonly seqs: number
  readonly padded: number
  readonly mold: number | null
  readonly mode: 'FULL' | 'PIECEWISE' | 'NONE'
  readonly calls: number
  readonly maskUs: Us
  readonly paddedUs?: Us
  readonly eagerUs?: Us
  /** When the expo had read the fire back (its sample's end), so the tape's clock reads it then. */
  readonly readUs: Us
}

/** Calls the expo makes to launch one fire, by the mode it runs as (the sim's own counts, run-v1.ts). */
export function callsOf(card: GpuCard, host: HostCard, mode: 'FULL' | 'PIECEWISE' | 'NONE'): number {
  const layers = gpuLayers(card)
  if (mode === 'FULL') return 1
  if (mode === 'PIECEWISE') return layers + 1 + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER
  return host.kernelsPerLayer * layers
}

const nights = new Map<string, Night | null>()

/** The night of `stage` served with `levers`, or null when the engine refuses the configuration (a mode the backend cannot run). */
export function nightOf(stage: StageWorld, levers: Levers): Night | null {
  const key = `${stage.id}|${stage.workloadSeed}|${stage.slots}|${stage.budget}|${stage.card}|${stage.support}|${stage.maskRowUs}|${stage.structuredPermille}|${stage.requests}|${stage.outputs.join('-')}|${stage.graphBudget}|${stage.sizes === null ? '' : stage.sizes.batches.join(',') + '/' + stage.sizes.context}|${JSON.stringify(levers)}`
  const hit = nights.get(key)
  if (hit !== undefined) return hit
  const night = stage.sizes === null ? stepNight(stage, levers) : histogramNightOf(stage, levers)
  if (nights.size > 512) nights.clear()
  nights.set(key, night)
  return night
}

/** Assigns each request a clip for the fires it rides: the lowest free clip at its first fire, kept until its last. */
function clipsOf(rows: readonly (readonly number[])[], slots: number): (number | null)[][] {
  const last = new Map<number, number>()
  rows.forEach((reqs, i) => reqs.forEach((req) => last.set(req, i)))
  const held: (number | null)[] = new Array<number | null>(slots).fill(null)
  const where = new Map<number, number>()
  return rows.map((reqs, i) => {
    for (const req of reqs) {
      if (where.has(req)) continue
      const free = held.indexOf(null)
      if (free < 0) throw new Error('internal: a fire with more rows than clips')
      held[free] = req
      where.set(req, free)
    }
    const clips = held.slice()
    for (const req of reqs) {
      if (last.get(req) !== i) continue
      held[where.get(req)!] = null
    }
    return clips.map((req) => (req !== null && reqs.includes(req) ? req : null))
  })
}

function stepNight(stage: StageWorld, levers: Levers): Night | null {
  const { mode } = servingMode(stage, levers)
  if (mode === null || stage.workloadSeed === null) return null
  const card = CARDS[stage.card]
  const host = hostOf(stage, levers.runner)
  const workload: Workload = genWorkload(stage.workloadSeed, workloadSpec(stage.requests, stage.structuredPermille, stage.outputs))
  const run: StepLoopRun = runStepLoop(workload, configOf(stage, levers, mode), host, card, { horizonUs: NIGHT_HORIZON_US, rows: true })
  const rows = run.steps.map((step) => step.reqs ?? [])
  const clips = clipsOf(rows, stage.slots)
  // A request's last row is its ghost when the engine threw one token of it away.
  const ghostAt = new Map<number, number>()
  rows.forEach((reqs, i) => reqs.forEach((req) => (run.reqs[req].ghostTokens > 0 ? ghostAt.set(req, i) : undefined)))
  const firstFire = new Array<number>(run.reqs.length).fill(-1)
  rows.forEach((reqs, i) => reqs.forEach((req) => (firstFire[req] < 0 ? (firstFire[req] = i) : undefined)))
  const samples = run.lanes['cpu-main'].filter((span) => span.kind === 'sample')
  const fires = run.steps.map((step, i): NightFire => {
    const forward = run.lanes['gpu-stream'].find((span) => span.step === i)
    const stepMode = step.mode ?? 'NONE'
    return {
      index: i,
      startUs: forward?.startUs ?? 0,
      endUs: forward?.endUs ?? 0,
      bubbleUs: step.bubbleUs,
      clips: clips[i],
      places: clips[i].map((req) => (req === null ? 'empty' : ghostAt.get(req) === i ? 'binned' : 'plate')),
      admits: step.prefillSeqs,
      ghosts: step.ghostSeqs,
      seqs: step.seqs,
      padded: step.paddedTokens - step.tokens,
      mold: step.graph === 'hit' ? step.paddedTokens : null,
      mode: stepMode,
      calls: callsOf(card, host, stepMode),
      maskUs: step.maskUs ?? 0,
      readUs: samples.find((span) => span.step === i)?.endUs ?? forward?.endUs ?? 0,
    }
  })
  return {
    fires,
    cpu: run.lanes['cpu-main'],
    gpu: run.lanes['gpu-stream'],
    clockUs: run.summary.clockUs,
    metric: run.summary.clockUs,
    tpotP50Us: run.summary.tpotP50Us,
    requests: run.reqs.length,
    firstFire,
  }
}

const tables = new Map<string, PriceTable>()

/** The price table of the sizes stage's card and runner. */
export function tableOf(stage: StageWorld, levers: Levers): PriceTable {
  const key = `${stage.card}|${levers.runner}|${stage.slots}|${stage.sizes?.context}`
  let table = tables.get(key)
  if (table === undefined) {
    table = priceTable(CARDS[stage.card], hostOf(stage, levers.runner), stage.slots, stage.sizes?.context ?? 1)
    tables.set(key, table)
  }
  return table
}

/** The histogram world's night: each fire dropped into its mold, or called eagerly, laid end to end on the line at its price. */
function histogramNightOf(stage: StageWorld, levers: Levers): Night {
  const world = stage.sizes!
  const card = CARDS[stage.card]
  const host = hostOf(stage, levers.runner)
  const table = tableOf(stage, levers)
  const sizes = levers.captureSizes
  let t = 0
  const cpu: Span[] = []
  const gpu: Span[] = []
  const fires = world.batches.map((batch, i): NightFire => {
    const price = priceOf(table, sizes, batch)
    const mode = price.mold === null ? 'NONE' : 'FULL'
    const calls = callsOf(card, host, mode)
    const launch = mode === 'FULL' ? host.graphReplayUs : host.launchPerKernelUs * calls
    const cook = table.line[price.mold ?? batch]
    cpu.push({ step: i, kind: 'launch', startUs: t, endUs: t + launch })
    gpu.push({ step: i, kind: 'forward', startUs: t + launch, endUs: t + launch + cook })
    const startUs = t + launch
    t = startUs + cook
    const slotsShown = Array.from({ length: stage.slots }, (_, clip) => (clip < batch ? clip : null))
    return {
      index: i,
      startUs,
      endUs: t,
      bubbleUs: i === 0 ? 0 : launch,
      clips: slotsShown,
      places: slotsShown.map((req) => (req === null ? 'empty' : 'plate')),
      admits: 0,
      ghosts: 0,
      seqs: batch,
      padded: price.mold === null ? 0 : price.mold - batch,
      mold: price.mold,
      mode,
      calls,
      maskUs: 0,
      paddedUs: price.paddedUs,
      eagerUs: price.eagerUs,
      readUs: t,
    }
  })
  return { fires, cpu, gpu, clockUs: t, metric: captureCost(table, sizes, world.batches), tpotP50Us: null, requests: stage.slots, firstFire: new Array<number>(stage.slots).fill(0) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The night at the fires rung                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the kitchen and the counters show once `rung` fires of a night have been rung. */
export interface NightAt {
  readonly kitchen: Omit<KitchenView, 'level' | 'title' | 'slots' | 'overlapAvailable' | 'done'>
  readonly fires: readonly FullFire[]
  readonly counters: FullCounters
  readonly over: boolean
  readonly lineLit: boolean
  readonly stepUs: Us | null
}

/**
 * The night after `rung` fires (at least 1). Every fire up to the latest has been read back, except, with async scheduling, the latest
 * itself: it is on the line, held on the fired rail, while the expo writes the next call on the rail. The clock is the latest fire's end.
 */
export function nightAt(night: Night, rung: number, levers: Levers, slots: number): NightAt {
  const count = Math.max(0, Math.min(rung, night.fires.length))
  const shown = night.fires.slice(0, count)
  const latest = shown[shown.length - 1]
  const overlap = levers.async
  const onLine = overlap && latest !== undefined && count < night.fires.length ? latest.index : -1
  const next = night.fires[count]
  const clip = (req: number | null, fresh: boolean): ClipView => ({ req, fresh })
  const rail: ClipView[] =
    next === undefined ? Array.from({ length: slots }, () => clip(null, false)) : next.clips.map((req) => clip(req, req !== null && night.firstFire[req] === next.index))
  const firedRail = onLine < 0 ? null : latest.clips.map((req) => clip(req, false))
  // Waiting: the tickets no fire has carried yet, and not the next fire's, which are hung on the rail.
  const waiting: number[] = []
  for (let req = 0; req < night.requests; req++) if (night.firstFire[req] > count) waiting.push(req)
  const clockUs = latest === undefined ? 0 : count >= night.fires.length ? night.clockUs : latest.endUs
  const fires: FullFire[] = shown.map((fire) => ({
    index: fire.index,
    startUs: fire.startUs,
    endUs: fire.endUs,
    places: fire.clips.map((req, k) => ({ state: fire.places[k], req })),
    admits: fire.admits,
    bubbleUs: fire.bubbleUs,
    ghosts: fire.index === onLine ? 0 : fire.ghosts,
    onLine: fire.index === onLine,
    launches: fire.calls,
    graph: fire.mold === null ? (levers.graphMode === 'NONE' ? 'off' : 'miss') : 'hit',
    padded: fire.padded,
    mold: fire.mold,
    mode: fire.mode,
    calls: fire.calls,
    ...(fire.paddedUs === undefined ? {} : { paddedUs: fire.paddedUs, eagerUs: fire.eagerUs }),
    maskUs: fire.maskUs,
  }))
  const read = fires.filter((fire) => !fire.onLine)
  const sum = (pick: (fire: FullFire) => number, list: readonly FullFire[] = fires) => list.reduce((total, fire) => total + pick(fire), 0)
  const over = count >= night.fires.length
  const counters: FullCounters = {
    usefulTokens: sum((fire) => fire.places.filter((place) => place.state === 'plate').length, read),
    ghostTokens: sum((fire) => fire.ghosts, read),
    paddedTokens: sum((fire) => fire.padded),
    gpuBusyUs: sum((fire) => fire.endUs - fire.startUs),
    bubbleUs: sum((fire) => fire.bubbleUs),
    bubbles: fires.filter((fire) => fire.bubbleUs > 0).length,
    launches: sum((fire) => fire.calls),
    eagerSteps: fires.filter((fire) => fire.mode === 'NONE').length,
    clockUs,
    emptyClipSteps: sum((fire) => fire.places.filter((place) => place.state === 'empty').length),
    captureUs: sum((fire) => (fire.paddedUs ?? 0) + (fire.eagerUs ?? 0)),
    maskUs: sum((fire) => fire.maskUs ?? 0),
    tpotP50Us: over ? night.tpotP50Us : null,
  }
  const before = shown[shown.length - 2]
  return {
    kitchen: {
      clockUs,
      step: count,
      waiting,
      rail,
      firedRail,
      cpu: night.cpu.filter((span) => span.startUs < clockUs),
      gpu: night.gpu.filter((span) => span.startUs < clockUs),
      fires,
    },
    fires,
    counters,
    over,
    lineLit: onLine >= 0,
    stepUs: latest !== undefined && before !== undefined ? latest.startUs - before.startUs : null,
  }
}
