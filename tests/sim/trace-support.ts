/*
 * Shared by the trace tests (tests/sim/trace*.test.ts): seeded runs, the run's own per-µs truth, unions and a per-ns oracle that
 * share no code with packages/sim/trace, and a random small trace for the oracle.
 *
 *   - `runTruth` classifies every µs of a step-loop run from its two lanes alone: the GPU is busy, or it is idle and the main
 *     thread is busy, or both are idle. That is "the run's own per-µs truth" (A§5.7, GAMES.md §3 "Invariants the tests check").
 *   - `bruteForce` classifies every ns of a window of a trace from its spans alone, with one flag array per kind of busy.
 */
import { below, between, rngFor } from '../../packages/sim/core'
import type { Us } from '../../packages/sim/core'
import { runStepLoop } from '../../packages/sim/steploop'
import type { StepLoopRun } from '../../packages/sim/steploop'
import { CAT_COPY, CAT_KERNEL, spanCount, spanView, traceBuilder } from '../../packages/sim/trace'
import type { EsTrace, JitterSpec, StepWindow, TraceSpanView } from '../../packages/sim/trace'
import { seeds } from '../seeds'
import { FOREVER, scenario } from './steploop-support'
import type { Scenario } from './steploop-support'

/** 200 seeds on a PR, 10,000 nightly (ARCHITECTURE §5.10) [estimated]: tests/seeds.ts has the knob. */
export const SEEDS = seeds(1)

/** The widest jitter the spec allows: one kernel or two hundred, kernels far from their shares, mostly idle launch frames, boundaries moving as far as they may. */
export const ROUGH: JitterSpec = { kernelsPerForward: 7, spreadPermille: 900, copyPermille: 100, launchGapPermille: 900, cpuNoiseNs: 250 }
export const TINY: JitterSpec = { kernelsPerForward: 1, spreadPermille: 0, copyPermille: 1, launchGapPermille: 0, cpuNoiseNs: 0 }
export const HUGE: JitterSpec = { kernelsPerForward: 200, spreadPermille: 500, copyPermille: 50, launchGapPermille: 500, cpuNoiseNs: 250 }

export function runOf(seed: number, horizonUs: Us = FOREVER): { s: Scenario; run: StepLoopRun } {
  const s = scenario(seed)
  return { s, run: runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs }) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The run's truth

export interface WindowTruth {
  /** The step whose forward this window closes. */
  readonly step: number
  readonly fromUs: Us
  readonly toUs: Us
  readonly gpuUs: number
  readonly cpuGapUs: number
  readonly bothIdleUs: number
  readonly overlapUs: number
}

/**
 * For each forward of the run, the window from the end of the previous forward (the start of the first) to the end of this one,
 * and what each µs in it is, counted one µs at a time from the two lanes.
 */
export function runTruth(run: StepLoopRun): WindowTruth[] {
  const gpu = run.lanes['gpu-stream']
  const cpu = run.lanes['cpu-main']
  let clock = 0
  for (const lane of [cpu, gpu]) if (lane.length > 0) clock = Math.max(clock, lane[lane.length - 1].endUs)
  const g = new Uint8Array(clock)
  const c = new Uint8Array(clock)
  for (const span of gpu) g.fill(1, span.startUs, span.endUs)
  for (const span of cpu) c.fill(1, span.startUs, span.endUs)
  return gpu.map((forward, i) => {
    const fromUs = i === 0 ? forward.startUs : gpu[i - 1].endUs
    let gpuUs = 0
    let cpuGapUs = 0
    let bothIdleUs = 0
    let overlapUs = 0
    for (let u = fromUs; u < forward.endUs; u++) {
      if (g[u] === 1) {
        gpuUs++
        if (c[u] === 1) overlapUs++
      } else if (c[u] === 1) cpuGapUs++
      else bothIdleUs++
    }
    return { step: forward.step, fromUs, toUs: forward.endUs, gpuUs, cpuGapUs, bothIdleUs, overlapUs }
  })
}

/** Whether the GPU, and the main thread, are busy during µs `u` of the run, from its lanes. */
export function busyAt(run: StepLoopRun, u: number): { gpu: boolean; cpu: boolean } {
  const covers = (lane: readonly { startUs: number; endUs: number }[]) => lane.some((span) => span.startUs <= u && u < span.endUs)
  return { gpu: covers(run.lanes['gpu-stream']), cpu: covers(run.lanes['cpu-main']) }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Unions, from the spans of a trace

export type Interval = readonly [from: number, to: number]

/** The union of intervals as disjoint ascending intervals, touching ones joined. */
export function merged(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** The spans of a trace that `keep` accepts, as indices. */
export function rowsWhere(t: EsTrace, keep: (v: TraceSpanView) => boolean): number[] {
  const out: number[] = []
  for (let i = 0; i < spanCount(t); i++) if (keep(spanView(t, i))) out.push(i)
  return out
}

/** Every span of a trace with its names looked up, in the trace's own order. */
export const viewsOf = (t: EsTrace): TraceSpanView[] => Array.from({ length: spanCount(t) }, (_, i) => spanView(t, i))

/**
 * The views that start in [from, to), found by binary search on a list in start order, which is how every trace here is listed.
 * One call costs the spans it returns, so a loop over a trace's steps reads the trace once in all.
 */
export function startingIn(views: readonly TraceSpanView[], from: number, to: number): TraceSpanView[] {
  let lo = 0
  let hi = views.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (views[mid].startNs < from) lo = mid + 1
    else hi = mid
  }
  const out: TraceSpanView[] = []
  for (let i = lo; i < views.length && views[i].startNs < to; i++) out.push(views[i])
  return out
}

export const intervalsOf = (t: EsTrace, keep: (v: TraceSpanView) => boolean): Interval[] =>
  rowsWhere(t, keep).map((i) => {
    const v = spanView(t, i)
    return [v.startNs, v.endNs] as const
  })

export const isGpuWork = (v: TraceSpanView): boolean => v.kind === 'gpu-stream' && (v.cat === CAT_KERNEL || v.cat === CAT_COPY)
export const isMainThread = (v: TraceSpanView): boolean => v.kind === 'cpu-thread' || v.kind === 'cuda-api'

/** A run's lane as intervals in ns. */
export const laneNs = (lane: readonly { startUs: number; endUs: number }[]): Interval[] => lane.map((s) => [s.startUs * 1000, s.endUs * 1000] as const)

// ---------------------------------------------------------------------------------------------------------------------------
// A per-ns oracle

export interface Brute {
  kernelNs: number
  copyOnlyNs: number
  cpuGapNs: number
  bothIdleNs: number
  overlapNs: number
}

/**
 * Classifies every ns of [from, to) from a trace's spans, one flag array per kind of busy and no interval arithmetic. A span counts
 * as GPU work when it is a kernel or a copy on a gpu-stream track, and as the main thread when it is on a cpu-thread or cuda-api track.
 */
export function bruteForce(t: EsTrace, from: number, to: number): Brute {
  const n = to - from
  const kernel = new Uint8Array(n)
  const copy = new Uint8Array(n)
  const cpu = new Uint8Array(n)
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    const lo = Math.max(v.startNs, from) - from
    const hi = Math.min(v.endNs, to) - from
    if (hi <= lo) continue
    if (v.kind === 'gpu-stream' && v.cat === CAT_KERNEL) kernel.fill(1, lo, hi)
    else if (v.kind === 'gpu-stream' && v.cat === CAT_COPY) copy.fill(1, lo, hi)
    else if (v.kind === 'cpu-thread' || v.kind === 'cuda-api') cpu.fill(1, lo, hi)
  }
  const out: Brute = { kernelNs: 0, copyOnlyNs: 0, cpuGapNs: 0, bothIdleNs: 0, overlapNs: 0 }
  for (let i = 0; i < n; i++) {
    const gpu = kernel[i] === 1 || copy[i] === 1
    if (kernel[i] === 1) out.kernelNs++
    else if (copy[i] === 1) out.copyOnlyNs++
    else if (cpu[i] === 1) out.cpuGapNs++
    else out.bothIdleNs++
    if (gpu && cpu[i] === 1) out.overlapNs++
  }
  return out
}

/**
 * A small random trace: a main thread, a CUDA API track and two GPU streams, with `n` spans of random kinds at random ns in [0, 400),
 * so kernels overlap across streams, copies overlap kernels, and spans straddle any window. Categories other than kernel and copy
 * appear on the GPU tracks too, and some spans are empty, so the oracle's reading of what counts is exercised.
 */
export function randomTrace(seed: number, n = 40): EsTrace {
  const rng = rngFor(seed, 'test/trace/random')
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'main')
  const api = b.track('cuda-api', 'api')
  const s0 = b.track('gpu-stream', 'stream 0')
  const s1 = b.track('gpu-stream', 'stream 1')
  const marker = b.track('marker', 'ranges')
  for (let i = 0; i < n; i++) {
    const track = [cpu, api, s0, s1, s0, s1, marker][below(rng, 7)]
    const start = between(rng, 0, 399)
    const dur = below(rng, 4) === 0 ? 0 : between(rng, 1, 60)
    const cat = track === s0 || track === s1 ? ['kernel', 'copy', 'kernel', 'annotation'][below(rng, 4)] : track === api ? 'launch' : 'cpu'
    b.span(track, start, dur, `s${i}`, cat, track === s0 || track === s1 ? between(rng, -1, 5) : -1)
  }
  return b.build({ source: 'synthetic', synthetic: true })
}

export function randomWindow(seed: number): StepWindow {
  const rng = rngFor(seed, 'test/trace/window')
  const a = between(rng, 0, 450)
  const b = between(rng, 0, 450)
  return a <= b ? { fromNs: a, toNs: b } : { fromNs: b, toNs: a }
}
