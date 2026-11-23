// The cases of Gap Hunt (GAMES.md §6): synthetic traces whose largest gap has one known cause. Every number is an integer ns, and
// the whole trace is a function of the seed, the causes asked for and the options.
//
// A trace here is a few steps, each cut by step marks into a window that runs from the end of the previous forward to the end of
// its own. A window is built from the gap backwards:
//   - the GPU idles from the window's start until the first piece of work of the step, which the engine's main thread launched with a
//     `cudaMemcpyAsync` (the gap's lead-in is the time from the window's start to that call);
//   - one main-thread span covers at least 60% of the lead-in, and it is the gap's cause, of one of three kinds:
//       `eager`: the `launch` frame, the Python that launches the step's kernels one call at a time (it starts before the first call);
//       `sync`:  a call that waits (`cudaStreamSynchronize` or `cudaEventSynchronize`), that returns long after the GPU went idle;
//       `host`:  the `schedule` frame, the engine's own scheduling on the host;
//     and the rest of the lead-in is shared by the other frames of the step loop (the tail of the previous step's sync call, the
//     schedule, the prepare frame, the start of the launch frame), each shorter than the cause;
//   - then the forward: a copy in, kernels, a copy out. One stall inside the forward, before the second or third kernel, is a
//     second gap, between two kernels, in three parts that may each be zero: a copy that runs alone, the GPU and the thread both
//     idle, and the thread busy while the GPU waits. A graph trace (`node` below) has instead the small gaps between the nodes
//     of the graph, with the thread idle;
//   - the main thread then does other work while the forward runs. In most windows one of those spans (the next step's prepare) is
//     longer than the cause and lies under GPU-busy time, so the widest span is not the cause.
// The jitter of §3.5 is not used: these traces are drawn whole, so the cause is known by construction, and the tests check it with
// `findCause`, which reads only the trace.

import { divFloor } from '../core/int'
import { assertSeed, below, rngFor } from '../core/rng'
import type { Rng } from '../core/rng'
import { sum } from '../core/stats'
import type { Seed } from '../core/types'
import { traceBuilder } from './builder'
import type { EsTrace } from './types'
import { CAT_COPY, CAT_KERNEL, CAT_LAUNCH, CAT_SYNC, STEP_MARK } from './types'

/** The three causes a gap can have in the cases (GAMES.md §6). */
export type HuntCause = 'eager' | 'sync' | 'host'
export const HUNT_CAUSES: readonly HuntCause[] = Object.freeze(['eager', 'sync', 'host'])

/** What `huntTrace` is asked for: one cause per window, and how the trace is drawn. */
export interface HuntTraceSpec {
  /** The cause of the largest gap of each window, in time order. At least one. */
  readonly causes: readonly HuntCause[]
  /** Node-level trace of a graph replay (`--cuda-graph-trace=node`): one launch call for every kernel, and small gaps between the nodes. */
  readonly node?: boolean
  /** Copies on a second GPU stream (the option of `traceFromRun`). */
  readonly twoStreams?: boolean
  /** Per window, whether the next step's prepare runs under the forward and is longer than the cause. When left out, every window that has room for it does. */
  readonly decoy?: readonly boolean[]
}

const LAYER: readonly (readonly [string, number])[] = [
  ['rms_norm', 2], ['qkv_proj', 12], ['rope', 2], ['attention', 16], ['o_proj', 8], ['rms_norm', 2], ['gate_up_proj', 28], ['silu_mul', 3], ['down_proj', 14],
]

/** `total` divided in proportion to `weights` into integers that add up to `total`, each at least `least`. Exact integer arithmetic. */
function shares(total: number, weights: readonly number[], least: number): number[] {
  const rest = total - least * weights.length
  if (rest < 0) throw new RangeError(`${total} cannot be split into ${weights.length} parts of at least ${least}`)
  const w = sum(weights)
  const q = divFloor(rest, w)
  const r = rest - q * w
  const parts = new Array<number>(weights.length)
  let upTo = 0
  let before = 0
  for (let j = 0; j < weights.length; j++) {
    upTo += weights[j]
    const share = divFloor(r * upTo, w)
    parts[j] = least + q * weights[j] + (share - before)
    before = share
  }
  return parts
}

/** Zero one time in four, else `lo` to `hi`. */
function maybe(rng: Rng, lo: number, hi: number): number {
  return below(rng, 4) === 0 ? 0 : lo + below(rng, hi - lo + 1)
}

interface Stall {
  /** The kernel the stall comes before. */
  readonly before: number
  /** A copy that runs alone, then both idle for `b`, then the thread busy for `g`. */
  readonly c: number
  readonly b: number
  readonly g: number
}

interface Plan {
  readonly cause: HuntCause
  readonly eager: boolean
  readonly forwardNs: number
  readonly copyNs: number
  readonly kernelNs: readonly number[]
  readonly hcNs: number
  /** The lead-in's parts: the previous sync call's tail, schedule, prepare, and the launch frame's start. */
  readonly a: number
  readonly s: number
  readonly p: number
  readonly e: number
  readonly stalls: readonly Stall[]
  readonly decoy: boolean
  readonly decoyExtra: number
  readonly syncMargin: number
}

function planWindow(rng: Rng, cause: HuntCause, node: boolean, decoy: boolean): Plan {
  const forwardNs = 600_000 + below(rng, 600_001)
  const gapNs = divFloor(forwardNs * (150 + below(rng, 151)), 1000)
  const hcNs = 2000 + below(rng, 3001)
  const lead = gapNs - hcNs
  const eager = !node && (cause === 'eager' || below(rng, 2) === 0)
  const kernels = node ? 5 : 8 + below(rng, 7)
  const copyNs = divFloor(forwardNs * 25, 1000)
  const kernelNs = shares(forwardNs - 2 * copyNs, Array.from({ length: kernels }, () => 700 + below(rng, 601)), 1)

  // The lead-in: the cause's part is 60% to 90% of it, and the others share the rest. The tail of the previous sync call is at least 1 ns.
  const causePart = Math.ceil((lead * 6) / 10) + below(rng, divFloor(lead * 3, 10) + 1)
  const others = lead - causePart
  const key = cause === 'sync' ? 'a' : cause === 'host' ? 's' : 'e'
  const rest = (['a', 's', 'p', 'e'] as const).filter((k) => k !== key)
  const small = shares(others - (key === 'a' ? 0 : 1), rest.map(() => 1 + below(rng, 1000)), 0)
  const part: Record<string, number> = { [key]: causePart }
  rest.forEach((k, i) => {
    part[k] = small[i] + (k === 'a' ? 1 : 0)
  })

  // The stalls: the idle part of each is at most 55% of the gap, so the largest gap stays at least 1.5 times the second.
  const stalls: Stall[] = []
  if (node) {
    const count = 1 + below(rng, 3)
    for (let j = 0; j < count; j++) stalls.push({ before: 1 + j, c: 0, b: 300 + below(rng, divFloor(gapNs * 4, 10) - 299), g: 0 })
  } else {
    const idle = 1 + below(rng, divFloor(gapNs * 55, 100))
    const g = maybe(rng, 1, idle)
    stalls.push({ before: 1 + below(rng, 2), c: maybe(rng, 1000, 9000), b: idle - Math.min(g, idle), g: Math.min(g, idle) })
  }
  return { cause, eager, forwardNs, copyNs, kernelNs, hcNs, a: part.a, s: part.s, p: part.p, e: part.e, stalls, decoy, decoyExtra: below(rng, divFloor(forwardNs, 20)), syncMargin: 1 + below(rng, 500) }
}

/**
 * A synthetic trace with one window per entry of `spec.causes`, the largest gap of each window having that cause. The same seed
 * and spec give the same trace in every runtime.
 */
export function huntTrace(seed: Seed, spec: HuntTraceSpec): EsTrace {
  assertSeed(seed)
  if (spec.causes.length === 0) throw new RangeError('a hunt trace has at least one window')
  const node = spec.node === true
  const rng = rngFor(seed, 'hunt/plan')
  const plans = spec.causes.map((cause, i) => planWindow(rng, cause, node, spec.decoy ? spec.decoy[i] === true : below(rng, 100) < 85))

  const out = traceBuilder()
  const cpu = out.track('cpu-thread', 'engine core main thread')
  const api = out.track('cuda-api', 'CUDA API')
  const gpu0 = out.track('gpu-stream', 'GPU stream 0')
  const gpu1 = spec.twoStreams === true ? out.track('gpu-stream', 'GPU stream 1') : gpu0
  const FRAME = 'frame'

  let start = 100_000 + below(rng, 50_001)
  let cpuFree = start - 20_000
  let corr = 0
  out.mark(start, STEP_MARK)
  plans.forEach((plan, i) => {
    const W = start
    const lead = plan.a + plan.s + plan.p + plan.e
    const ls = W + lead
    const fs = ls + plan.hcNs

    // The tail of the previous step's sync: a frame holding a blocking call, that ends a ns or more after the window starts.
    const syncEnd = W + plan.a
    const m = Math.min(plan.syncMargin, Math.max(0, syncEnd - cpuFree - 1))
    out.span(cpu, cpuFree, syncEnd - cpuFree, 'sync', FRAME)
    const syncName = i % 2 === 0 ? 'cudaStreamSynchronize' : 'cudaEventSynchronize'
    out.span(api, cpuFree + m, syncEnd - cpuFree - m, syncName, CAT_SYNC)
    let at = W + plan.a
    if (plan.s > 0) out.span(cpu, at, plan.s, 'schedule', FRAME)
    at += plan.s
    if (plan.p > 0) out.span(cpu, at, plan.p, 'prepare', FRAME)

    // The launches, starting with the copy in.
    const headCorr = corr++
    const kernels = plan.kernelNs.length
    const launchCorr: number[] = []
    if (plan.eager) for (let k = 0; k < kernels; k++) launchCorr.push(corr++)
    else launchCorr.push(corr++)
    const tailCorr = corr++
    const head = out.span(api, ls, plan.hcNs, 'cudaMemcpyAsync', CAT_COPY, headCorr)
    const launches: number[] = []
    let cursor = fs
    if (plan.eager) {
      for (let k = 0; k < kernels; k++) {
        launches.push(out.span(api, cursor, 1000 + ((k * 37) % 500), 'cudaLaunchKernel', CAT_LAUNCH, launchCorr[k]))
        cursor += 2000
      }
    } else {
      launches.push(out.span(api, cursor, 3000, 'cudaGraphLaunch', CAT_LAUNCH, launchCorr[0]))
      cursor += 3000
    }
    const tailCall = out.span(api, cursor, 1000, 'cudaMemcpyAsync', CAT_COPY, tailCorr)
    const le = cursor + 1000 + 500
    const frameFrom = ls - plan.e
    out.span(cpu, frameFrom, le - frameFrom, 'launch', FRAME)
    const copyTrack = gpu1

    // The forward.
    let t = fs
    const headCopy = out.span(copyTrack, t, plan.copyNs, 'memcpy HtoD', CAT_COPY, headCorr)
    out.flow(head, headCopy, 'copy')
    t += plan.copyNs
    let work = 0
    let stallEnd = t
    for (let k = 0; k < kernels; k++) {
      const stall = plan.stalls.find((x) => x.before === k)
      if (stall) {
        if (stall.c > 0) out.span(copyTrack, t, stall.c, 'memcpy DtoD', CAT_COPY)
        t += stall.c + stall.b
        if (stall.g > 0) out.span(cpu, t, stall.g, 'process_outputs', FRAME)
        t += stall.g
        stallEnd = t
      }
      const j = plan.eager ? k : 0
      const span = out.span(gpu0, t, plan.kernelNs[k], LAYER[k % LAYER.length][0], CAT_KERNEL, launchCorr[j])
      out.flow(launches[j], span, 'launch')
      t += plan.kernelNs[k]
      work += plan.kernelNs[k]
    }
    const tailCopy = out.span(copyTrack, t, plan.copyNs, 'memcpy DtoH', CAT_COPY, tailCorr)
    out.flow(tailCall, tailCopy, 'copy')
    const fe = t + plan.copyNs
    if (work + 2 * plan.copyNs !== plan.forwardNs) throw new Error('internal: the forward does not add up')
    const firstStall = Math.min(...plan.stalls.map((x) => x.before))
    if (le >= fs + plan.copyNs + sum(plan.kernelNs.slice(0, firstStall))) throw new Error('internal: the launch frame reaches the first stall')

    // What the thread does while the forward runs: the next step's prepare, longer than the cause, when there is room for it.
    const causeNs = plan.cause === 'host' ? plan.s : plan.cause === 'eager' ? le - frameFrom : syncEnd - cpuFree - m
    let free = Math.max(le, stallEnd)
    const decoyFrom = stallEnd + 1000 + (i % 3) * 500
    const decoyNs = causeNs + 1 + plan.decoyExtra
    if (plan.decoy && decoyFrom + decoyNs + 4000 < fe) {
      out.span(cpu, decoyFrom, decoyNs, 'prepare_next', FRAME)
      free = Math.max(free, decoyFrom + decoyNs)
    }
    cpuFree = free + 500 + (i % 4) * 300
    if (cpuFree >= fe) throw new Error('internal: the thread is busy past the end of the forward')
    start = fe
    out.mark(fe, STEP_MARK)
  })
  // The last window's sync call.
  const end = start + 300
  out.span(cpu, cpuFree, end - cpuFree, 'sync', FRAME)
  out.span(api, cpuFree + 100, end - cpuFree - 100, 'cudaStreamSynchronize', CAT_SYNC)
  return out.build({ source: 'synthetic', synthetic: true })
}
