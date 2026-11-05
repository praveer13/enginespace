/*
 * Shared by the step-loop v1 tests (tests/sim/steploop-v1*.test.ts): seeded scenarios that turn the v1 features on, and the invariants
 * every run of them keeps. It is the v1 counterpart of steploop-support.ts, whose invariants hold the v0 loop and know nothing of graph modes,
 * mask spans or speculative rounds.
 */
import { expect } from 'bun:test'
import { below, between, chance, pick, rngFor } from '../../packages/sim/core'
import type { Us } from '../../packages/sim/core'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { HostCard } from '../../packages/sim/host'
import { PHYSICS_ROWS } from '../../packages/sim/physics'
import {
  GRAPH_MODES,
  PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER,
  TICK_CARD,
  gpuLayers,
  mrv1RoundedSizes,
  s5Card,
  vllmCaptureSizes,
} from '../../packages/sim/steploop'
import type { GpuCard, GraphModeId, Span, SpecMethodId, StepLoopConfig, StepLoopRun } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import type { ArrivalPlan, Dist, Workload } from '../../packages/sim/workload'

export type WorldV1 = 'tick' | 's5-v1' | 's5-mrv2'

export interface ScenarioV1 {
  readonly seed: number
  readonly world: WorldV1
  readonly workload: Workload
  readonly cfg: StepLoopConfig
  readonly host: HostCard
  readonly gpu: GpuCard
}

/** The methods a scenario draws: neither runner is given suffix or custom_class, which MRV2 does not take and MRV1 does not run async. */
const SPEC_METHODS: readonly SpecMethodId[] = ['eagle', 'eagle3', 'mtp', 'ngram_gpu', 'draft_model', 'dflash', 'dspark', 'ngram']

/**
 * A run drawn from a seed, with the v1 features switched on at random: a runner, any graph mode, adapters and the cap on them, a share of
 * structured requests with the mask overlapped or not, and speculation. It is on the front page's tick card or on the 70B card with a V1 or
 * an MRV2 host card, with async scheduling on or off. 200 seeds cover every lever.
 */
export function scenarioV1(seed: number): ScenarioV1 {
  const rng = rngFor(seed, 'test/steploop-v1/scenario')
  const world: WorldV1 = pick(rng, ['tick', 's5-v1', 's5-mrv2', 's5-mrv2'])
  const ticks = world === 'tick'
  const requests = between(rng, 1, 36)

  let arrivals: ArrivalPlan
  const arrivalKind = below(rng, 3)
  if (arrivalKind === 0) arrivals = { kind: 'burst', atUs: ticks ? between(rng, 0, 5) : between(rng, 0, 3000) }
  else if (arrivalKind === 1) arrivals = { kind: 'even', gapUs: ticks ? between(rng, 0, 9) : between(rng, 0, 30_000) }
  else arrivals = { kind: 'poisson', ratePerSMilli: ticks ? 166_666_667 : between(rng, 2000, 120_000) }

  const prompt: Dist = ticks
    ? pick(rng, [{ kind: 'const', value: 1 }, { kind: 'uniform', lo: 1, hi: 3 }] as Dist[])
    : pick(rng, [{ kind: 'const', value: 1 }, { kind: 'uniform', lo: 1, hi: 64 }, { kind: 'uniform', lo: 16, hi: 900 }, { kind: 'menu', values: [8, 64, 700, 1500], weights: [6, 5, 3, 1] }] as Dist[])
  const output: Dist = pick(rng, [{ kind: 'uniform', lo: 1, hi: 24 }, { kind: 'menu', values: [1, 2, 4, 8, 16, 40], weights: [30, 25, 20, 12, 8, 5] }, { kind: 'const', value: 3 }] as Dist[])
  const adapters = chance(rng, 600) ? { count: between(rng, 1, 5), sharePermille: between(rng, 200, 1000) } : undefined
  const structuredPermille = chance(rng, 600) ? between(rng, 100, 1000) : 0
  const workload = genWorkload(seed, { requests, arrivals, lengths: { kind: 'dists', prompt, output }, ...(adapters === undefined ? {} : { adapters }), ...(structuredPermille === 0 ? {} : { structuredPermille }) })
  const longestPrompt = Math.max(...workload.reqs.map((r) => r.promptTokens))

  const runner = pick(rng, ['mrv2', 'v1'] as const)
  const asyncScheduling = chance(rng, 500)
  const spec = chance(rng, 450)
    ? {
        k: between(rng, 1, 4),
        alphaPermille: pick(rng, [0, 300, 700, 900, 1000]),
        draftCostPermille: pick(rng, [0, 50, 200]),
        method: pick(rng, SPEC_METHODS),
      }
    : undefined
  // MRV1 runs the n-gram method on the CPU only without async scheduling (claim vllm.async-scheduling.mrv1-limits).
  const method: SpecMethodId | undefined = spec === undefined ? undefined : spec.method === 'ngram' && runner === 'v1' && asyncScheduling ? 'eagle' : spec.method
  const queryLen = 1 + (spec?.k ?? 0)

  const chunkedPrefill = chance(rng, 700)
  const maxNumSeqs = ticks ? between(rng, 1, 6) : between(rng, 1, 64)
  const drawn = ticks ? pick(rng, [2, 4, 16, 2048]) : pick(rng, [32, 128, 512, 2048, 8192])
  // Without chunked prefill a prompt must fit the budget whole, and a speculative row needs room for its drafts.
  const maxBatchedTokens = Math.max(chunkedPrefill ? drawn : Math.max(drawn, longestPrompt), 1)
  const mode: GraphModeId = pick(rng, ['NONE', 'PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE'] as const)
  let captureSizes: readonly number[] = chance(rng, 600)
    ? vllmCaptureSizes({ maxNumSeqs, maxBatchedTokens, decodeQueryLen: queryLen })
    : Array.from(new Set(Array.from({ length: between(rng, 1, 8) }, () => between(rng, 1, 90)))).sort((a, b) => a - b)
  if (runner === 'v1' && GRAPH_MODES[mode].decode === 'FULL' && queryLen > 1 && captureSizes.length > 0) {
    // vLLM rounds the sizes of the legacy runner's full decode graphs; a list that cannot be rounded is replaced by one that can.
    try {
      captureSizes = mrv1RoundedSizes(captureSizes, queryLen)
    } catch {
      captureSizes = [queryLen, 2 * queryLen]
    }
  }
  const lora = chance(rng, 500) ? { maxLoras: between(rng, 1, 4) } : undefined
  const cfg: StepLoopConfig = {
    maxNumSeqs,
    maxBatchedTokens,
    chunkedPrefill,
    asyncScheduling,
    inputIds: 'device',
    batching: chance(rng, 200) ? 'static' : 'continuous',
    runner,
    graphs: { mode, captureSizes, specializeLora: chance(rng, 700), specializeActiveLora: chance(rng, 400) },
    ...(lora === undefined ? {} : { lora }),
    ...(chance(rng, 500) ? { structured: { overlap: chance(rng, 500) } } : {}),
    ...(spec === undefined ? {} : { spec: { ...spec, method } }),
  }

  if (ticks) return { seed, world, workload, cfg, host: { ...TICK_CARD, maskPerSeqUs: between(rng, 0, 3) }, gpu: TICK_CARD }
  const row = pick(rng, PHYSICS_ROWS)
  const gpu = s5Card(row.key, pick(rng, row.box.tp), pick(rng, ['in-gpu', 'on-cpu'] as const))
  return { seed, world, workload, cfg, host: HOST_PRESETS[world === 's5-v1' ? 'v1' : 'mrv2'].card, gpu }
}

const totalLength = (spans: readonly Span[]): number => {
  let total = 0
  for (const s of spans) total += s.endUs - s.startUs
  return total
}

/** What every run of the v1 loop keeps, whatever it is given (ARCHITECTURE §5.10: disjoint kernels per stream, no read before sampling, busy ≤ horizon, and the rest). */
export function checkInvariantsV1(s: ScenarioV1, run: StepLoopRun, horizonUs: Us): void {
  const ctx = `seed ${s.seed} (${s.world}, runner ${s.cfg.runner}, async ${s.cfg.asyncScheduling}, graphs ${s.cfg.graphs.mode}, spec ${s.cfg.spec === undefined ? 'off' : `k${s.cfg.spec.k}`}, mask ${s.cfg.structured === undefined ? 'off' : s.cfg.structured.overlap ? 'overlap' : 'serial'}, lora ${s.cfg.lora?.maxLoras ?? 'off'})`
  const { cfg, host, gpu, workload } = s
  const cpu = run.lanes['cpu-main']
  const gpuLane = run.lanes['gpu-stream']

  // Each lane: in time order, no two spans overlapping, none empty, all inside the horizon, in whole µs.
  for (const lane of [cpu, gpuLane]) {
    let end = 0
    for (const span of lane) {
      expect(span.startUs >= end, `${ctx}: ${span.kind} of step ${span.step} starts before the lane's last span ended`).toBe(true)
      expect(span.endUs > span.startUs, `${ctx}: an empty span`).toBe(true)
      expect(span.endUs <= horizonUs, `${ctx}: a span ends past the horizon`).toBe(true)
      expect(Number.isSafeInteger(span.startUs) && Number.isSafeInteger(span.endUs), ctx).toBe(true)
      end = span.endUs
    }
  }
  expect(gpuLane.every((span) => span.kind === 'forward'), ctx).toBe(true)
  expect(cpu.every((span) => span.kind !== 'forward'), ctx).toBe(true)

  // Busy time stays within the horizon and the clock.
  const busy = totalLength(gpuLane)
  expect(busy, ctx).toBe(run.summary.gpuBusyUs)
  expect(busy <= horizonUs && run.summary.clockUs <= horizonUs && busy <= run.summary.clockUs, ctx).toBe(true)

  // Each step's phases come in order, and its launch costs what its mode says.
  const layers = gpuLayers(gpu)
  const eager = host.launchPerKernelUs * host.kernelsPerLayer * layers
  const piecewise = (layers + 1) * host.graphReplayUs + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER * host.launchPerKernelUs
  const byStep = new Map<number, Partial<Record<Span['kind'], Span[]>>>()
  for (const span of [...cpu, ...gpuLane]) {
    const entry = byStep.get(span.step) ?? {}
    ;(entry[span.kind] ??= []).push(span)
    byStep.set(span.step, entry)
  }
  let maskSpans = 0
  for (const [k, entry] of byStep) {
    const step = run.steps[k]
    expect(step, `${ctx}: spans of a step that has no record`).toBeDefined()
    for (const kind of ['schedule', 'prepare', 'launch', 'sync', 'sample', 'forward'] as const) expect(entry[kind]?.length ?? 0, `${ctx}: step ${k} has two ${kind} spans`).toBeLessThanOrEqual(1)
    const [schedule, prepare, launch, forward, sync, sample] = [entry.schedule?.[0], entry.prepare?.[0], entry.launch?.[0], entry.forward?.[0], entry.sync?.[0], entry.sample?.[0]]
    const launchedBy = Math.max(schedule?.endUs ?? 0, prepare?.endUs ?? 0, launch?.endUs ?? 0)
    if (forward) {
      expect(forward.startUs >= launchedBy, `${ctx}: step ${k}'s forward starts before its launch ends`).toBe(true)
      expect(forward.endUs - forward.startUs, ctx).toBe(step.gpuUs)
    }
    if (sync && forward) expect(sync.startUs >= forward.endUs, `${ctx}: step ${k} synced before its forward ended`).toBe(true)
    for (const mask of entry.mask ?? []) {
      maskSpans++
      expect(mask.startUs >= launchedBy, `${ctx}: step ${k}'s mask starts before its launch ends`).toBe(true)
      // A fill starts at one of three moments: right after the launch (rows whose token is home, with overlap), right after the step's own sync
      // (the same rows without overlap), or right after the step before has been read back (rows whose token was in flight).
      const before = byStep.get(k - 1)
      const readBackEnd = before === undefined ? -1 : Math.max(-1, ...[...(before.sync ?? []), ...(before.mask ?? []), ...(before.sample ?? [])].map((span) => span.endUs))
      expect([launchedBy, sync?.endUs, readBackEnd].includes(mask.startUs), `${ctx}: step ${k}'s mask starts at ${mask.startUs}, not at its launch (${launchedBy}), its sync (${sync?.endUs}) or the read-back before it (${readBackEnd})`).toBe(true)
    }
    if (sample && sync) expect(sample.startUs >= sync.endUs, ctx).toBe(true)
    if (launch && launch.endUs < horizonUs) {
      const expected = step.mode === 'FULL' ? host.graphReplayUs : step.mode === 'PIECEWISE' ? piecewise : eager
      expect(launch.endUs - launch.startUs, `${ctx}: step ${k}'s ${step.mode} launch`).toBe(expected)
    }
  }
  const schedules = cpu.filter((span) => span.kind === 'schedule').map((span) => span.step)
  expect(schedules, ctx).toEqual([...schedules].sort((a, b) => a - b))

  // Steps.
  expect(run.summary.steps, ctx).toBe(run.steps.length)
  const maxLoras = cfg.lora?.maxLoras ?? 0
  for (const [k, step] of run.steps.entries()) {
    expect(step.index, ctx).toBe(k)
    expect(step.seqs >= 1 && step.seqs <= cfg.maxNumSeqs, `${ctx}: step ${k} has ${step.seqs} rows`).toBe(true)
    expect(step.tokens >= step.seqs && step.tokens <= cfg.maxBatchedTokens, `${ctx}: step ${k} has ${step.tokens} tokens`).toBe(true)
    expect(step.prefillSeqs >= 0 && step.prefillSeqs <= step.seqs, ctx).toBe(true)
    expect(step.ghostSeqs >= 0 && step.ghostSeqs <= step.seqs, ctx).toBe(true)
    if (!cfg.asyncScheduling) expect(step.ghostSeqs, ctx).toBe(0)
    expect(step.mode, ctx).toBeDefined()
    if (cfg.graphs.mode === 'NONE') {
      expect([step.graph, step.mode], ctx).toEqual(['off', 'NONE'])
      expect(step.paddedTokens, ctx).toBe(step.tokens)
    } else {
      expect(step.graph, `${ctx}: step ${k}`).toBe(step.mode === 'NONE' ? 'miss' : 'hit')
      if (step.mode === 'NONE') expect(step.paddedTokens, ctx).toBe(step.tokens)
      else expect(step.paddedTokens >= step.tokens, `${ctx}: step ${k} padded ${step.paddedTokens} under its ${step.tokens} tokens`).toBe(true)
      if (step.mode === 'FULL') expect(modeAllows(cfg.graphs.mode, 'FULL'), ctx).toBe(true)
      if (step.mode === 'PIECEWISE') expect(modeAllows(cfg.graphs.mode, 'PIECEWISE'), ctx).toBe(true)
      // Nothing above the largest capture size replays.
      const largest = cfg.graphs.captureSizes.length > 0 ? cfg.graphs.captureSizes[cfg.graphs.captureSizes.length - 1] : 0
      if (step.tokens > largest) expect(step.mode, `${ctx}: step ${k} replayed ${step.tokens} tokens above ${largest}`).toBe('NONE')
    }
    expect(step.bubbleUs >= 0, ctx).toBe(true)
    if (cfg.lora !== undefined) expect(step.activeLoras !== undefined && step.activeLoras <= maxLoras, `${ctx}: step ${k} has ${step.activeLoras} adapters, over ${maxLoras}`).toBe(true)
    else expect(step.activeLoras, ctx).toBeUndefined()
    if (cfg.structured === undefined) expect(step.maskUs, ctx).toBeUndefined()
    else expect(step.maskUs !== undefined && step.maskUs >= 0, ctx).toBe(true)
    if (cfg.spec === undefined) expect(step.draftUs, ctx).toBeUndefined()
    else expect(step.draftUs !== undefined && step.draftUs >= 0 && step.draftUs <= step.gpuUs, `${ctx}: step ${k} drafts ${step.draftUs} inside a forward of ${step.gpuUs}`).toBe(true)
  }
  if (cfg.structured === undefined) expect(maskSpans, ctx).toBe(0)

  // Mask time: what the steps say is what the spans add up to, for the part of a fill that falls inside the horizon, step by step and in total.
  if (cfg.structured !== undefined) {
    const stepTotal = run.steps.reduce((total, step) => total + (step.maskUs ?? 0), 0)
    expect(run.summary.maskUs, ctx).toBe(stepTotal)
    const spanTotal = cpu.filter((span) => span.kind === 'mask').reduce((total, span) => total + span.endUs - span.startUs, 0)
    expect(spanTotal, ctx).toBe(stepTotal)
    for (const [k, step] of run.steps.entries()) {
      const own = cpu.filter((span) => span.kind === 'mask' && span.step === k).reduce((total, span) => total + span.endUs - span.startUs, 0)
      expect(step.maskUs, `${ctx}: step ${k}`).toBe(own)
    }
  } else expect(run.summary.maskUs, ctx).toBeUndefined()
  if (cfg.spec === undefined) expect(run.summary.spec, ctx).toBeUndefined()

  // Bubbles are idle time inside the window from the first forward to the last, so they fit in it beside the busy time.
  let bubbleTotal = 0
  for (const step of run.steps) bubbleTotal += step.bubbleUs
  expect(run.summary.bubbleUs, ctx).toBe(bubbleTotal)
  if (gpuLane.length > 0) {
    const window = gpuLane[gpuLane.length - 1].endUs - gpuLane[0].startUs
    expect(bubbleTotal + busy <= window, `${ctx}: bubbles ${bubbleTotal} and busy ${busy} do not fit the window ${window}`).toBe(true)
  }

  // Requests and tokens.
  expect(run.reqs.length, ctx).toBe(workload.reqs.length)
  let useful = 0
  let ghosts = 0
  let finished = 0
  for (const [i, r] of run.reqs.entries()) {
    const spec = workload.reqs[i]
    expect(r.id, ctx).toBe(i)
    expect(r.tokens <= spec.outputTokens, `${ctx}: request ${i} emitted ${r.tokens} of ${spec.outputTokens}`).toBe(true)
    expect(r.finished, ctx).toBe(r.tokens === spec.outputTokens)
    expect(r.ghostTokens <= 1, `${ctx}: request ${i} has ${r.ghostTokens} ghost tokens`).toBe(true)
    if (!cfg.asyncScheduling) expect(r.ghostTokens, ctx).toBe(0)
    if (r.ghostTokens > 0) expect(r.finished, `${ctx}: a ghost for request ${i}, which never stopped`).toBe(true)
    if (r.tokens === 0) {
      expect([r.ttftUs, r.tpotUs, r.e2eUs], ctx).toEqual([null, null, null])
    } else {
      expect(r.ttftUs! >= 0, ctx).toBe(true)
      if (r.tokens >= 2) expect(r.tpotUs !== null && r.tpotUs >= 0, ctx).toBe(true)
      else expect(r.tpotUs, ctx).toBeNull()
    }
    if (r.finished) expect(r.e2eUs! >= r.ttftUs!, ctx).toBe(true)
    else expect(r.e2eUs, ctx).toBeNull()
    useful += r.tokens
    ghosts += r.ghostTokens
    if (r.finished) finished++
  }
  expect(run.summary.usefulTokens, ctx).toBe(useful)
  expect(run.summary.ghostTokens, ctx).toBe(ghosts)
  expect(run.summary.ghostTokens, ctx).toBe(run.steps.reduce((total, step) => total + step.ghostSeqs, 0))
  expect(run.summary.finished, ctx).toBe(finished)

  // Speculation: each round emitted its accepted drafts and one more, and a draft is accepted at most once.
  const sp = run.summary.spec
  if (cfg.spec !== undefined) {
    expect(sp, ctx).toBeDefined()
    expect(sp!.emitted, ctx).toBe(sp!.rounds + sp!.accepted)
    expect(sp!.accepted <= sp!.drafted, ctx).toBe(true)
    expect(sp!.drafted <= sp!.rounds * cfg.spec.k, ctx).toBe(true)
    if (cfg.spec.alphaPermille === 0) expect(sp!.accepted, ctx).toBe(0)
    if (cfg.spec.alphaPermille === 1000) expect(sp!.accepted, ctx).toBe(sp!.drafted)
    expect(run.summary.draftUs, ctx).toBe(run.steps.reduce((total, step) => total + (step.draftUs ?? 0), 0))
    if (cfg.spec.draftCostPermille === 0) expect(run.summary.draftUs, ctx).toBe(0)
  }

  // The dependency check: input ids on the device read nothing before it is sampled.
  expect(run.violations, ctx).toEqual([])

  if (run.summary.clockUs < horizonUs) {
    expect(run.summary.finished, `${ctx}: the run ended before the horizon with unfinished requests`).toBe(workload.reqs.filter((r) => r.dueUs < horizonUs).length)
    for (const [i, r] of run.reqs.entries()) if (workload.reqs[i].dueUs >= horizonUs) expect(r.tokens, ctx).toBe(0)
  }
}

/** Whether a mode ever runs a step as `member`: the single mode itself, or either routine of a pair. */
function modeAllows(mode: GraphModeId, member: 'FULL' | 'PIECEWISE'): boolean {
  const routines = GRAPH_MODES[mode]
  return routines.decode === member || routines.mixed === member
}
