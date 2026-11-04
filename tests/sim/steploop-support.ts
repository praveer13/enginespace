/*
 * Shared by the step-loop tests (tests/sim/steploop*.test.ts): seeded scenarios, hand-built workloads, the invariants every run
 * keeps, and three oracles that do not share the loop's code:
 *   - `bubblesByStep` sums, by brute force, the CPU spans that fall in the gaps between consecutive forwards;
 *   - `burstTimeline` recomputes every span of a run whose requests are all due at once, from the steps' costs and the order in
 *     which the CPU thread does things, as a short recurrence;
 *   - `referenceBatches` forms the batches of such a run from the scheduler's rules alone, with no clock.
 * A test that imports from here is checking the loop against a second statement of the same rules, written from the notional-machine
 * card (content/cards/trace-room-steploop.md) and not from packages/sim/steploop/run.ts.
 */
import { expect } from 'bun:test'
import { below, between, chance, pick, rngFor } from '../../packages/sim/core'
import type { Us } from '../../packages/sim/core'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { HostCard } from '../../packages/sim/host'
import { PHYSICS_ROWS } from '../../packages/sim/physics'
import { TICK_CARD, defaultCaptureSizes, gpuLayers, paddedSize, s5Card } from '../../packages/sim/steploop'
import type { GpuCard, Span, StepLoopConfig, StepLoopRun } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import type { ArrivalPlan, Dist, ReqSpec, Workload } from '../../packages/sim/workload'

/** A time no run in these tests reaches. */
export const FOREVER: Us = 600_000_000_000

export const EAGER = { mode: 'NONE', captureSizes: [] } as const

/** A request, with the parts a step loop reads. */
export function req(id: number, o: { due?: Us; prompt?: number; output: number }): ReqSpec {
  return { id, dueUs: o.due ?? 0, promptTokens: o.prompt ?? 1, outputTokens: o.output, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false }
}

/** A workload from hand-written requests, which must be in order of due time. */
export function handWorkload(specs: readonly { due?: Us; prompt?: number; output: number }[]): Workload {
  return { seed: 0, origin: { kind: 'synthetic' }, reqs: specs.map((spec, id) => req(id, spec)) }
}

/** The front page's tray: 4 slots, a budget that never binds, input ids on the device. */
export const TRAY: Omit<StepLoopConfig, 'asyncScheduling' | 'graphs'> = { maxNumSeqs: 4, maxBatchedTokens: 2048, chunkedPrefill: true, inputIds: 'device' }

/** The harness S5's rows were fitted on (WORLD §4.2). */
export const HARNESS: Omit<StepLoopConfig, 'asyncScheduling' | 'graphs'> = { maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, inputIds: 'device' }

export function config(base: Omit<StepLoopConfig, 'asyncScheduling' | 'graphs'>, asyncScheduling: boolean, graphs: StepLoopConfig['graphs'] = EAGER): StepLoopConfig {
  return { ...base, asyncScheduling, graphs }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Seeded scenarios

export type World = 'tick' | 'v1' | 'mrv2'

export interface Scenario {
  readonly seed: number
  readonly world: World
  readonly workload: Workload
  readonly cfg: StepLoopConfig
  readonly host: HostCard
  readonly gpu: GpuCard
}

/**
 * A run drawn from a seed: the front page's tick world, or the 70B card on one of S5's three rows with a V1 or MRV2 host card. Its
 * arrivals, lengths, caps, budget, overlap, graphs and host-term placement are drawn too, so 200 seeds cover every lever.
 * `'decode-only'` draws what check 3 needs instead: every request due at once, with a slot each, and at least three tokens to emit.
 * `'burst'` keeps every other draw and makes every request due at once, which the two oracles below need.
 */
export type Shape = 'any' | 'decode-only' | 'burst'

export function scenario(seed: number, shape: Shape = 'any'): Scenario {
  const decodeOnly = shape === 'decode-only'
  const rng = rngFor(seed, 'test/steploop/scenario')
  const world: World = pick(rng, ['tick', 'tick', 'v1', 'mrv2'])
  const ticks = world === 'tick'
  const requests = decodeOnly ? between(rng, 1, 64) : between(rng, 1, 40)

  let arrivals: ArrivalPlan
  const arrivalKind = below(rng, 3)
  if (shape !== 'any' || arrivalKind === 0) arrivals = { kind: 'burst', atUs: ticks ? between(rng, 0, 5) : between(rng, 0, 3000) }
  else if (arrivalKind === 1) arrivals = { kind: 'even', gapUs: ticks ? between(rng, 0, 9) : between(rng, 0, 30_000) }
  else arrivals = { kind: 'poisson', ratePerSMilli: ticks ? 166_666_667 : between(rng, 2000, 120_000) }

  const prompt: Dist = decodeOnly
    ? { kind: 'const', value: ticks ? 1 : between(rng, 1, 16) }
    : ticks
      ? pick(rng, [{ kind: 'const', value: 1 }, { kind: 'uniform', lo: 1, hi: 3 }] as Dist[])
      : pick(rng, [
          { kind: 'const', value: 1 },
          { kind: 'uniform', lo: 1, hi: 64 },
          { kind: 'uniform', lo: 16, hi: 900 },
          { kind: 'menu', values: [8, 64, 700, 1500], weights: [6, 5, 3, 1] },
        ] as Dist[])
  const output: Dist = decodeOnly
    ? { kind: 'uniform', lo: 3, hi: 40 }
    : pick(rng, [
        { kind: 'uniform', lo: 1, hi: 24 },
        { kind: 'menu', values: [1, 2, 4, 8, 16, 40], weights: [30, 25, 20, 12, 8, 5] },
        { kind: 'const', value: 3 },
      ] as Dist[])
  const workload = genWorkload(seed, { requests, arrivals, lengths: { kind: 'dists', prompt, output } })
  const longestPrompt = Math.max(...workload.reqs.map((r) => r.promptTokens))

  const chunkedPrefill = decodeOnly || chance(rng, 700)
  const maxNumSeqs = decodeOnly ? requests : ticks ? between(rng, 1, 6) : between(rng, 1, 64)
  const drawn = ticks ? pick(rng, [2, 4, 16, 2048]) : pick(rng, [32, 128, 512, 2048, 8192])
  // Without chunked prefill a prompt must fit the budget whole, or the run refuses it.
  const maxBatchedTokens = chunkedPrefill ? (decodeOnly ? Math.max(drawn, requests * 16) : drawn) : Math.max(drawn, longestPrompt)
  const asyncScheduling = chance(rng, 500)
  const graphs: StepLoopConfig['graphs'] = ticks
    ? pick(rng, [EAGER, { mode: 'FULL', captureSizes: [1, 2, 4, 8] }] as StepLoopConfig['graphs'][])
    : pick(rng, [
        EAGER,
        { mode: 'FULL', captureSizes: defaultCaptureSizes(512) },
        { mode: 'FULL', captureSizes: defaultCaptureSizes(64) },
        { mode: 'FULL', captureSizes: [1, 2, 4, 8] },
      ] as StepLoopConfig['graphs'][])
  // A quarter of the runs batch statically. Decode-only runs admit everything at once, which batching cannot change.
  const batching = chance(rng, 250) && !decodeOnly ? 'static' : 'continuous'
  const cfg: StepLoopConfig = { maxNumSeqs, maxBatchedTokens, chunkedPrefill, asyncScheduling, inputIds: 'device', graphs, batching }

  if (ticks) return { seed, world, workload, cfg, host: TICK_CARD, gpu: TICK_CARD }
  const row = pick(rng, PHYSICS_ROWS)
  const gpu = s5Card(row.key, pick(rng, row.box.tp), pick(rng, ['in-gpu', 'on-cpu'] as const))
  return { seed, world, workload, cfg, host: HOST_PRESETS[world].card, gpu }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Oracles

const overlap = (a: Span, from: Us, to: Us): Us => Math.max(0, Math.min(a.endUs, to) - Math.max(a.startUs, from))

/**
 * The CPU-gap before each step's forward, by brute force: for each pair of consecutive forwards on the GPU lane, the length of
 * every `cpu-main` span's overlap with the gap between them. A forward the horizon cut away has no span, and so no gap.
 */
export function bubblesByStep(run: StepLoopRun): Map<number, Us> {
  const out = new Map<number, Us>()
  const forwards = run.lanes['gpu-stream']
  for (const [i, forward] of forwards.entries()) {
    let bubble = 0
    if (i > 0 && forward.startUs > forwards[i - 1].endUs) {
      for (const span of run.lanes['cpu-main']) bubble += overlap(span, forwards[i - 1].endUs, forward.startUs)
    }
    out.set(forward.step, bubble)
  }
  return out
}

/** One step's CPU phases, from the host card and what the run recorded of the step. Zero-cost phases are returned as 0, and leave no span. */
function phases(run: StepLoopRun, k: number, host: HostCard, gpu: GpuCard) {
  const step = run.steps[k]
  const perSeq = gpu.kind === 's5' ? Math.round(step.seqs * gpu.spec.params.seqUs) : null
  const hostTerm = gpu.kind === 's5' ? (gpu.hostTerm === 'on-cpu' ? perSeq! : 0) : null
  return {
    schedule: host.scheduleBaseUs + (hostTerm === null ? host.schedulePerSeqUs * step.seqs : hostTerm),
    prepare: host.prepPerTokenUs * step.tokens,
    launch: step.graph === 'hit' ? host.graphReplayUs : host.launchPerKernelUs * host.kernelsPerLayer * gpuLayers(gpu),
    forward: step.gpuUs,
    sync: host.syncUs,
    sample: hostTerm === null ? host.samplePerSeqUs * step.seqs : 0,
  }
}

/**
 * Every span of a run whose requests are all due at `at`, rebuilt from the steps. The CPU thread's order of work is fixed when
 * nothing arrives later: without async scheduling it launches a step and reads it back, one at a time; with it, it launches steps 0
 * and 1, then reads back 0 and launches 2, reads back 1 and launches 3, and so on, and reads back the last two in order. Each
 * phase starts when the thread is free (the read-back also waits for its forward to end) and the forward when the launch has ended
 * and the stream is free. The forward lengths are the run's own, which the GPU card prices; everything else is the host card's.
 */
export function burstTimeline(run: StepLoopRun, at: Us, host: HostCard, gpu: GpuCard, asyncScheduling: boolean): { cpu: Span[]; gpu: Span[] } {
  const n = run.steps.length
  const program: ['launch' | 'read', number][] = []
  if (!asyncScheduling) for (let k = 0; k < n; k++) program.push(['launch', k], ['read', k])
  else {
    program.push(['launch', 0])
    if (n > 1) program.push(['launch', 1])
    for (let k = 2; k < n; k++) program.push(['read', k - 2], ['launch', k])
    if (n > 1) program.push(['read', n - 2])
    program.push(['read', n - 1])
  }
  const cpu: Span[] = []
  const gpuSpans: Span[] = []
  const forwardEnd: Us[] = []
  let cpuT = at
  let gpuT = 0
  const put = (lane: Span[], step: number, kind: Span['kind'], startUs: Us, endUs: Us) => {
    if (endUs > startUs) lane.push({ step, kind, startUs, endUs })
  }
  for (const [what, k] of program) {
    const p = phases(run, k, host, gpu)
    if (what === 'launch') {
      const a = cpuT + p.schedule
      const b = a + p.prepare
      const c = b + p.launch
      put(cpu, k, 'schedule', cpuT, a)
      put(cpu, k, 'prepare', a, b)
      put(cpu, k, 'launch', b, c)
      const start = Math.max(c, gpuT)
      put(gpuSpans, k, 'forward', start, start + p.forward)
      forwardEnd[k] = start + p.forward
      gpuT = start + p.forward
      cpuT = c
    } else {
      const start = Math.max(cpuT, forwardEnd[k])
      put(cpu, k, 'sync', start, start + p.sync)
      put(cpu, k, 'sample', start + p.sync, start + p.sync + p.sample)
      cpuT = start + p.sync + p.sample
    }
  }
  // The lane is in time order, which is the order a run records it in.
  const byTime = (x: Span, y: Span) => x.startUs - y.startUs || x.endUs - y.endUs
  return { cpu: cpu.sort(byTime), gpu: gpuSpans.sort(byTime) }
}

export interface RefBatch {
  readonly seqs: number
  readonly prefillSeqs: number
  readonly tokens: number
}

/**
 * The batches of a run whose requests are all due at once, from the scheduler's rules alone and with no clock: running requests
 * first, then waiting ones in order, under one token budget and a cap on running requests. The only thing time does is decide what
 * the scheduler knows: a request is known to have stopped once the step with its last token has been read back, which is before the
 * next schedule without async scheduling and one step later with it.
 */
export function referenceBatches(prompts: readonly number[], outputs: readonly number[], cfg: StepLoopConfig): RefBatch[] {
  const lag = cfg.asyncScheduling ? 1 : 0
  const n = prompts.length
  const promptDone: number[] = prompts.map(() => 0)
  const produced: number[] = prompts.map(() => 0)
  const lastTokenStep: number[] = prompts.map(() => Number.POSITIVE_INFINITY)
  let running: number[] = []
  let next = 0
  const batches: RefBatch[] = []
  for (let step = 0; ; step++) {
    // Steps up to step - 1 - lag have been read back.
    running = running.filter((r) => lastTokenStep[r] > step - 1 - lag)
    if (running.length === 0 && next >= n) break
    let budget = cfg.maxBatchedTokens
    let seqs = 0
    let prefillSeqs = 0
    let tokens = 0
    const emit = (took: number, prefill: boolean) => {
      seqs++
      tokens += took
      budget -= took
      if (prefill) prefillSeqs++
    }
    const produce = (r: number) => {
      produced[r]++
      if (produced[r] === outputs[r]) lastTokenStep[r] = step
    }
    for (const r of running) {
      if (budget === 0) break
      if (promptDone[r] < prompts[r]) {
        const chunk = Math.min(prompts[r] - promptDone[r], budget)
        promptDone[r] += chunk
        emit(chunk, true)
        if (promptDone[r] === prompts[r]) produce(r)
      } else {
        emit(1, false)
        produce(r)
      }
    }
    // Static batching admits only when the engine believes no request of the last batch is still running.
    const open = cfg.batching !== 'static' || running.length === 0
    while (open && next < n && running.length < cfg.maxNumSeqs && budget > 0) {
      const chunk = cfg.chunkedPrefill ? Math.min(prompts[next], budget) : prompts[next]
      if (chunk > budget) break
      const r = next++
      running.push(r)
      promptDone[r] = chunk
      emit(chunk, true)
      if (promptDone[r] === prompts[r]) produce(r)
    }
    batches.push({ seqs, prefillSeqs, tokens })
  }
  return batches
}

// ---------------------------------------------------------------------------------------------------------------------------
// Invariants

/** What every run keeps, whatever it is given (ARCHITECTURE §5.10: disjoint kernels per stream, no read before sampling, busy ≤ horizon, and the rest). */
export function checkInvariants(s: Scenario, run: StepLoopRun, horizonUs: Us): void {
  const ctx = `seed ${s.seed} (${s.world}, async ${s.cfg.asyncScheduling}, graphs ${s.cfg.graphs.mode})`
  const { cfg, host, gpu, workload } = s
  const cpu = run.lanes['cpu-main']
  const gpuLane = run.lanes['gpu-stream']

  // Each lane: in time order, no two spans overlapping, none empty, all inside the horizon.
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

  // Busy time stays within the horizon, and within the clock.
  const busy = gpuLane.reduce((total, span) => total + span.endUs - span.startUs, 0)
  expect(busy, ctx).toBe(run.summary.gpuBusyUs)
  expect(busy <= horizonUs, `${ctx}: busy ${busy} beyond the horizon ${horizonUs}`).toBe(true)
  expect(run.summary.clockUs <= horizonUs, ctx).toBe(true)
  expect(busy <= run.summary.clockUs, ctx).toBe(true)

  // Each step's phases come in order, and a launch of a graph hit costs the replay.
  const byStep = new Map<number, Partial<Record<Span['kind'], Span>>>()
  for (const span of [...cpu, ...gpuLane]) {
    const entry = byStep.get(span.step) ?? {}
    expect(entry[span.kind], `${ctx}: step ${span.step} has two ${span.kind} spans`).toBeUndefined()
    entry[span.kind] = span
    byStep.set(span.step, entry)
  }
  const kernels = host.kernelsPerLayer * gpuLayers(gpu)
  for (const [k, entry] of byStep) {
    const step = run.steps[k]
    expect(step, `${ctx}: spans of a step that has no record`).toBeDefined()
    const launchedBy = Math.max(entry.schedule?.endUs ?? 0, entry.prepare?.endUs ?? 0, entry.launch?.endUs ?? 0)
    if (entry.forward) {
      expect(entry.forward.startUs >= launchedBy, `${ctx}: step ${k}'s forward starts before its launch ends`).toBe(true)
      expect(entry.forward.endUs - entry.forward.startUs, ctx).toBe(step.gpuUs)
    }
    if (entry.sync && entry.forward) expect(entry.sync.startUs >= entry.forward.endUs, `${ctx}: step ${k} synced before its forward ended`).toBe(true)
    if (entry.sample && entry.sync) expect(entry.sample.startUs, ctx).toBe(entry.sync.endUs)
    if (entry.launch && entry.launch.endUs < horizonUs) {
      const expected = step.graph === 'hit' ? host.graphReplayUs : host.launchPerKernelUs * kernels
      expect(entry.launch.endUs - entry.launch.startUs, `${ctx}: step ${k}'s launch`).toBe(expected)
    }
  }
  // CPU work follows the order of the steps' schedules (a thread does one thing at a time), and the forwards follow the launches.
  const schedules = cpu.filter((span) => span.kind === 'schedule').map((span) => span.step)
  expect(schedules, ctx).toEqual([...schedules].sort((a, b) => a - b))

  // Steps.
  expect(run.summary.steps, ctx).toBe(run.steps.length)
  const sizes = cfg.graphs.captureSizes
  for (const [k, step] of run.steps.entries()) {
    expect(step.index, ctx).toBe(k)
    expect(step.seqs >= 1 && step.seqs <= cfg.maxNumSeqs, `${ctx}: step ${k} has ${step.seqs} rows`).toBe(true)
    expect(step.tokens >= step.seqs && step.tokens <= cfg.maxBatchedTokens, `${ctx}: step ${k} has ${step.tokens} tokens`).toBe(true)
    expect(step.prefillSeqs >= 0 && step.prefillSeqs <= step.seqs, ctx).toBe(true)
    expect(step.ghostSeqs >= 0 && step.ghostSeqs <= step.seqs, ctx).toBe(true)
    if (!cfg.asyncScheduling) expect(step.ghostSeqs, ctx).toBe(0)
    if (cfg.graphs.mode === 'NONE') {
      expect(step.graph, ctx).toBe('off')
      expect(step.paddedTokens, ctx).toBe(step.tokens)
    } else {
      const size = paddedSize(sizes, step.tokens)
      expect(step.graph, `${ctx}: step ${k}`).toBe(size === null ? 'miss' : 'hit')
      expect(step.paddedTokens, `${ctx}: step ${k}`).toBe(size === null ? step.tokens : size)
    }
    expect(step.bubbleUs >= 0, ctx).toBe(true)
  }

  // Bubbles: the summary and each step's, against the brute-force sum.
  const bubbles = bubblesByStep(run)
  let bubbleTotal = 0
  let bubbled = 0
  for (const step of run.steps) {
    const expected = bubbles.get(step.index) ?? 0
    expect(step.bubbleUs, `${ctx}: step ${step.index}'s bubble`).toBe(expected)
    bubbleTotal += expected
    if (expected > 0) bubbled++
  }
  expect(run.summary.bubbleUs, ctx).toBe(bubbleTotal)
  expect(run.summary.bubbles, ctx).toBe(bubbled)
  // Bubbles are idle time inside the window from the first forward to the last, so they fit in it beside the busy time.
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
    expect(r.dueUs, ctx).toBe(spec.dueUs)
    expect(r.tokens <= spec.outputTokens, `${ctx}: request ${i} emitted ${r.tokens} of ${spec.outputTokens}`).toBe(true)
    expect(r.finished, ctx).toBe(r.tokens === spec.outputTokens)
    expect(r.ghostTokens <= 1, `${ctx}: request ${i} has ${r.ghostTokens} ghost tokens`).toBe(true)
    if (!cfg.asyncScheduling) expect(r.ghostTokens, ctx).toBe(0)
    if (r.ghostTokens > 0) expect(r.finished, `${ctx}: a ghost for request ${i}, which never stopped`).toBe(true)
    if (r.tokens === 0) {
      expect(r.ttftUs, ctx).toBeNull()
      expect(r.tpotUs, ctx).toBeNull()
      expect(r.e2eUs, ctx).toBeNull()
    } else {
      expect(r.ttftUs! >= 0, ctx).toBe(true)
      if (r.tokens >= 2) {
        // TPOT is the span between the first and the last token over the gaps between them, rounded to whole µs.
        expect(r.tpotUs !== null && r.tpotUs >= 0, ctx).toBe(true)
      } else expect(r.tpotUs, ctx).toBeNull()
    }
    if (r.finished) {
      expect(r.e2eUs! >= r.ttftUs!, ctx).toBe(true)
      if (r.tokens >= 2) {
        const gaps = r.tokens - 1
        expect(Math.abs(r.e2eUs! - r.ttftUs! - r.tpotUs! * gaps) * 2 <= gaps, `${ctx}: request ${i}'s TPOT does not match its latencies`).toBe(true)
      }
    } else expect(r.e2eUs, ctx).toBeNull()
    useful += r.tokens
    ghosts += r.ghostTokens
    if (r.finished) finished++
  }
  expect(run.summary.usefulTokens, ctx).toBe(useful)
  expect(run.summary.ghostTokens, ctx).toBe(ghosts)
  expect(run.summary.ghostTokens, ctx).toBe(run.steps.reduce((total, step) => total + step.ghostSeqs, 0))
  expect(run.summary.finished, ctx).toBe(finished)
  expect(run.summary.paddedTokens, ctx).toBe(run.steps.reduce((total, step) => total + step.paddedTokens - step.tokens, 0))

  // The dependency check: input ids on the device read nothing before it is sampled.
  if (cfg.inputIds === 'device' || !cfg.asyncScheduling) expect(run.violations, ctx).toEqual([])
  for (const v of run.violations) {
    expect(v.kind, ctx).toBe('read-before-sample')
    expect(v.step >= 1 && v.step < run.steps.length && v.rows >= 1, ctx).toBe(true)
  }

  // A run that ends before its horizon has done everything it was asked: every request due before the horizon finished, and the rest,
  // due at or after it, were never touched. (A run the horizon cut has its clock at the horizon.)
  if (run.summary.clockUs < horizonUs) {
    expect(run.summary.finished, `${ctx}: the run ended before the horizon with unfinished requests`).toBe(workload.reqs.filter((r) => r.dueUs < horizonUs).length)
    for (const [i, r] of run.reqs.entries()) if (workload.reqs[i].dueUs >= horizonUs) expect(r.tokens, ctx).toBe(0)
  }
}
