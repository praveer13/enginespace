// Synthetic traces (ARCHITECTURE §5.7; WORLD §3.5): a step-loop run written out as a `trace@1`, with seeded jitter.
//
// A run has two lanes of spans in whole µs: `cpu-main` (schedule, prepare, launch, sync, sample) and `gpu-stream` (one forward per
// step). The trace gives the lanes the fine structure a profiler shows, in ns:
//   - the main thread's frames are the run's spans, and the CUDA API calls it makes sit inside them: the launch calls inside the
//     launch frame, one per kernel on an eager step and one for a whole graph on a replay, and a blocking `cudaStreamSynchronize`
//     inside the sync frame;
//   - each forward is split into a copy that brings the inputs in, kernels, and a copy that sends the sampled ids out, and every
//     piece has the correlation id of the call that launched it (a graph's kernels share the replay's id);
//   - the step marks fall where the GPU finishes a step, so a window holds its forward and the gap before it (below).
//
// The jitter only works inside what the run treats as one piece. How a forward divides among its kernels, where each launch call
// falls in the launch frame, and where two touching frames meet are drawn from the seed. Where the GPU starts and stops being
// busy, and where the main thread does, are the run's own, to the ns. So the union of the kernel and copy spans is the run's
// forwards, the union of the main thread's spans is the run's `cpu-main` lane, and the ground truth of a synthetic trace is exact:
// `attribute` on any window gives what the run says of that window, whatever the seed (W1-T08, acceptance check 1).
//
// What the marks are. A step window runs from the end of the previous step's forward to the end of this step's, so it holds the
// step's forward and the GPU's wait for it: GPU-busy is the step's `gpuUs`, CPU-gap is its `bubbleUs`, and the window is the time
// between two steps' tokens leaving the GPU: the step's TPOT in the sense of A§5.7. The first window starts with the first forward,
// which has no wait before it. Kernels never cross a mark, because the GPU stream serialises the
// forwards, and that is what T5 (`traceChecks`) holds a capture to. A forward the run's horizon cut away has no window.
//
// What the model leaves out, which the notional-machine card says: the model draws a step's whole launch before its forward, so
// the kernels start after the last launch call (a real eager launch overlaps its own forward); kernels run back to back, so there
// are no inter-kernel gaps; a real step has hundreds of kernels, where the trace folds them to `kernelsPerForward`; the other
// threads of a real engine (the frontend, the output thread) are absent; and the kernel names are generic, not an engine's.

import { divFloor, divRound } from '../core/int'
import { assertSeed, below, between, rngFor } from '../core/rng'
import type { Rng } from '../core/rng'
import { sum } from '../core/stats'
import { NS_PER_US } from '../core/types'
import type { Seed } from '../core/types'
import type { Span, StepLoopRun, StepStat } from '../steploop/types'
import { traceBuilder } from './builder'
import type { EsTrace, JitterSpec } from './types'
import { CAT_COPY, CAT_KERNEL, CAT_LAUNCH, CAT_SYNC, STEP_MARK } from './types'

/**
 * The jitter the Trace Room uses unless a level says otherwise. Every value is a judgment [estimated], printed on the card: 24
 * kernels fold a step, a kernel may stray 30% from its share, each copy is 2.5% of the forward, 60% of an eager launch frame is
 * idle between its calls, and two frames that touch may meet up to 200 ns away from where the run put them.
 */
export const DEFAULT_JITTER: JitterSpec = Object.freeze({ kernelsPerForward: 24, spreadPermille: 300, copyPermille: 25, launchGapPermille: 600, cpuNoiseNs: 200 })

/** No jitter: equal shares, calls end to end, frames where the run put them. The `read` level's clean traces (GAMES.md §6). */
export const CLEAN_JITTER: JitterSpec = Object.freeze({ kernelsPerForward: 24, spreadPermille: 0, copyPermille: 25, launchGapPermille: 0, cpuNoiseNs: 0 })

function checkJitter(j: JitterSpec): void {
  const within = (x: number, lo: number, hi: number, what: string): void => {
    if (!Number.isInteger(x) || x < lo || x > hi) throw new RangeError(`${what} is an integer from ${lo} to ${hi}, got ${x}`)
  }
  within(j.kernelsPerForward, 1, 200, 'kernelsPerForward')
  within(j.spreadPermille, 0, 900, 'spreadPermille')
  within(j.copyPermille, 1, 100, 'copyPermille')
  within(j.launchGapPermille, 0, 900, 'launchGapPermille')
  within(j.cpuNoiseNs, 0, 250, 'cpuNoiseNs')
}

/**
 * The kernels of a transformer layer in the order they run, with their nominal shares of the layer's time [estimated]: a norm, the
 * QKV projection, rotary embedding, attention, the output projection, a norm, the gate and up projection, the activation, and the
 * down projection. A forward cycles through them. The names are generic and claim nothing about any engine's kernels.
 */
const LAYER: readonly (readonly [name: string, share: number])[] = [
  ['rms_norm', 2],
  ['qkv_proj', 12],
  ['rope', 2],
  ['attention', 16],
  ['o_proj', 8],
  ['rms_norm', 2],
  ['gate_up_proj', 28],
  ['silu_mul', 3],
  ['down_proj', 14],
]

const LARGEST_WEIGHT_SUM = 67_108_864

/**
 * `total` divided in proportion to `weights` into integers that add up to `total` exactly, each at least `least`. Part j is
 * `least + q·w_j + (G(w_0..w_j) − G(w_0..w_(j−1)))`, where q is the whole quotient of what is left over the weights' sum and G is
 * the floor of the remainder's share: every step is exact integer arithmetic, and no part depends on a float.
 */
function split(total: number, weights: readonly number[], least: 0 | 1): number[] {
  const rest = total - least * weights.length
  if (rest < 0) throw new RangeError(`${total} cannot be split into ${weights.length} parts of at least ${least}`)
  const w = sum(weights)
  if (w < 1 || w > LARGEST_WEIGHT_SUM) throw new RangeError(`the weights add up to ${w}, outside 1 to ${LARGEST_WEIGHT_SUM}`)
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

/** A weight of `nominal`, strayed by up to `spread` permille either way. It draws once, whatever the spread, so the stream does not depend on it. */
function weight(rng: Rng, nominal: number, spread: number): number {
  return nominal * (1000 - spread + below(rng, 2 * spread + 1))
}

/** `count` calls inside [lo, hi), in order, none empty: their durations share what the idle gaps leave, and the gaps fall between and around them. */
function placeCalls(lo: number, hi: number, count: number, j: JitterSpec, rng: Rng): { startNs: number; durNs: number }[] {
  const room = hi - lo
  const idle = Math.min(divFloor(room * j.launchGapPermille, 1000), room - count)
  const durations = split(room - idle, Array.from({ length: count }, () => weight(rng, 1, j.spreadPermille)), 1)
  const gapWeights = Array.from({ length: count + 1 }, () => 1 + below(rng, 1000))
  const gaps = idle > 0 ? split(idle, gapWeights, 0) : gapWeights.map(() => 0)
  const calls: { startNs: number; durNs: number }[] = []
  let at = lo
  for (let i = 0; i < count; i++) {
    at += gaps[i]
    calls.push({ startNs: at, durNs: durations[i] })
    at += durations[i]
  }
  return calls
}

/**
 * A lane is in time order, with no overlap and no empty span, on whole µs. The main thread's lane holds no forward. The GPU lane's
 * spans are all read as one piece of GPU work each, whatever their kind, so a later version of the step loop that adds a kind of
 * GPU span gives traces without a change here.
 */
function checkLane(lane: readonly Span[], name: string, gpu: boolean): void {
  let end = 0
  lane.forEach((s, i) => {
    if (!Number.isSafeInteger(s.step) || s.step < 0) throw new RangeError(`${name}[${i}]: step ${s.step} is not a step index`)
    if (!gpu && s.kind === 'forward') throw new RangeError(`${name}[${i}] is a forward span, which does not belong on the main thread's lane`)
    if (!Number.isSafeInteger(s.startUs) || !Number.isSafeInteger(s.endUs) || s.startUs < end || s.endUs <= s.startUs) {
      throw new RangeError(`${name}[${i}] runs from ${s.startUs} to ${s.endUs} µs after a span that ended at ${end}: a lane is in time order, with no overlap and no empty span`)
    }
    end = s.endUs
  })
  if (end * NS_PER_US > Number.MAX_SAFE_INTEGER) throw new RangeError(`${name} ends at ${end} µs, which is beyond 2^53 ns`)
}

/** A main-thread frame in ns, after the jitter has moved the boundaries it shares with its neighbours. */
interface Frame {
  readonly step: number
  readonly kind: string
  a: number
  b: number
}

/** What a step's frames say about where its launch calls and its blocking call fall. */
interface StepFrames {
  /** The launch frame, if the step has one: a graph replay or a launch call per kernel costs a µs or more. */
  launch: Frame | null
  /** Where the CPU finished handing the step to the GPU: the end of its last schedule, prepare or launch frame. */
  release: number | null
  sync: Frame | null
}

/**
 * Writes `run` out as a synthetic `trace@1` (§5.7), with seeded jitter. The same run, seed and jitter give the same bytes in every
 * runtime. `run` is a `StepLoopRun` as `runStepLoop` returns it, cut by a horizon or not; the trace has the lanes' ns on three
 * tracks (the main thread's frames, its CUDA API calls, and GPU stream 0), and marks at the end of each forward, plus one where the
 * first begins. It is marked synthetic and carries no engine, version, GPU, date or hash.
 */
export function traceFromRun(run: StepLoopRun, seed: Seed, jitter: JitterSpec = DEFAULT_JITTER): EsTrace {
  assertSeed(seed)
  checkJitter(jitter)
  const cpuLane = run.lanes['cpu-main']
  const gpuLane = run.lanes['gpu-stream']
  checkLane(cpuLane, 'cpu-main', false)
  checkLane(gpuLane, 'gpu-stream', true)

  const out = traceBuilder()
  const cpuTrack = out.track('cpu-thread', 'engine core main thread')
  const apiTrack = out.track('cuda-api', 'CUDA API')
  const gpuTrack = out.track('gpu-stream', 'GPU stream 0')

  // The main thread's frames. Where two frames touch, the boundary between them moves by up to cpuNoiseNs, and by less if a frame
  // would shrink to nothing. The first start and last end of every run of touching frames stay where the run has them, so the
  // thread is busy exactly when the run says it is.
  const frames: Frame[] = cpuLane.map((s) => ({ step: s.step, kind: s.kind, a: s.startUs * NS_PER_US, b: s.endUs * NS_PER_US }))
  const lengths = frames.map((f) => f.b - f.a)
  const noise = rngFor(seed, 'trace/cpu')
  for (let j = 0; j + 1 < frames.length; j++) {
    const draw = between(noise, -jitter.cpuNoiseNs, jitter.cpuNoiseNs)
    if (frames[j].b !== frames[j + 1].a) continue
    const room = Math.min(divFloor(lengths[j] - 1, 2), divFloor(lengths[j + 1] - 1, 2))
    const shift = Math.max(-room, Math.min(room, draw))
    frames[j].b += shift
    frames[j + 1].a += shift
  }
  const steps = new Map<number, StepFrames>()
  for (const f of frames) {
    out.span(cpuTrack, f.a, f.b - f.a, f.kind, f.kind)
    const entry = steps.get(f.step) ?? { launch: null, release: null, sync: null }
    if (f.kind === 'schedule' || f.kind === 'prepare' || f.kind === 'launch') {
      entry.release = Math.max(entry.release ?? 0, f.b)
      if (f.kind === 'launch') entry.launch = f
    } else if (f.kind === 'sync') {
      entry.sync = f
    }
    steps.set(f.step, entry)
  }

  // The GPU's work, and the calls that launched it.
  const gpuRng = rngFor(seed, 'trace/gpu')
  const apiRng = rngFor(seed, 'trace/api')
  let corr = 0
  for (const forward of gpuLane) {
    const fs = forward.startUs * NS_PER_US
    const fe = forward.endUs * NS_PER_US
    const length = fe - fs
    const host = steps.get(forward.step) ?? { launch: null, release: null, sync: null }
    const stat: StepStat | undefined = run.steps[forward.step]
    const replay = stat?.graph === 'hit'

    // The forward: a copy in, the kernels, a copy out.
    const kernels = Math.min(jitter.kernelsPerForward, length - 2)
    const shares = Array.from({ length: kernels }, (_, k) => weight(gpuRng, LAYER[k % LAYER.length][1], jitter.spreadPermille))
    const copyWeight = Math.max(1, divRound(sum(shares) * jitter.copyPermille, 1000 - 2 * jitter.copyPermille))
    const parts = split(length, [copyWeight, ...shares, copyWeight], 1)

    // The launch calls: inside the launch frame when the step has one (up to where the forward starts), else instants at the moment
    // the CPU finished, which is what a free launch is. With a call per kernel, every kernel has a launch of its own; otherwise one
    // call stands for them all, as a graph's replay does.
    const lo = host.launch?.a ?? 0
    const hi = Math.min(host.launch?.b ?? 0, fs)
    const perKernel = !replay && host.launch !== null && hi - lo >= kernels + 2
    const calls = host.launch !== null && hi - lo >= (perKernel ? kernels + 2 : 3) ? placeCalls(lo, hi, perKernel ? kernels + 2 : 3, jitter, apiRng) : null
    const instant = Math.min(host.release ?? fs, fs)

    const headCorr = corr++
    const launchCorr: number[] = []
    if (perKernel) for (let k = 0; k < kernels; k++) launchCorr.push(corr++)
    else launchCorr.push(corr++)
    const tailCorr = corr++
    const launchName = replay ? 'cudaGraphLaunch' : 'cudaLaunchKernel'
    const at = (i: number): { startNs: number; durNs: number } => calls?.[i] ?? { startNs: instant, durNs: 0 }

    const headCall = out.span(apiTrack, at(0).startNs, at(0).durNs, 'cudaMemcpyAsync', CAT_COPY, headCorr)
    const launches = launchCorr.map((c, k) => out.span(apiTrack, at(1 + k).startNs, at(1 + k).durNs, launchName, CAT_LAUNCH, c))
    const tailCall = out.span(apiTrack, at(1 + launchCorr.length).startNs, at(1 + launchCorr.length).durNs, 'cudaMemcpyAsync', CAT_COPY, tailCorr)

    let cursor = fs
    const place = (part: number, name: string, cat: string, c: number, call: number, flow: 'launch' | 'copy'): number => {
      const span = out.span(gpuTrack, cursor, part, name, cat, c)
      out.flow(call, span, flow)
      cursor += part
      return span
    }
    place(parts[0], 'memcpy HtoD', CAT_COPY, headCorr, headCall, 'copy')
    for (let k = 0; k < kernels; k++) {
      const j = perKernel ? k : 0
      place(parts[1 + k], LAYER[k % LAYER.length][0], CAT_KERNEL, launchCorr[j], launches[j], 'launch')
    }
    const tail = place(parts[parts.length - 1], 'memcpy DtoH', CAT_COPY, tailCorr, tailCall, 'copy')

    // The blocking call that brings the sampled ids home, inside the sync frame and never before the forward has ended. The wait
    // before it is a gap in the thread's frames, as in the run.
    if (host.sync !== null) {
      const from = Math.max(host.sync.a, fe)
      const room = host.sync.b - from
      if (room > 0) {
        const margin = Math.min(divFloor(room, 4), jitter.cpuNoiseNs)
        const early = between(apiRng, 0, margin)
        const late = between(apiRng, 0, margin)
        const call = out.span(apiTrack, from + early, room - early - late, 'cudaStreamSynchronize', CAT_SYNC)
        out.flow(tail, call, 'sync')
      }
    }
  }

  // The step marks: where the first forward starts, and where each forward ends.
  if (gpuLane.length > 0) {
    out.mark(gpuLane[0].startUs * NS_PER_US, STEP_MARK)
    for (const forward of gpuLane) out.mark(forward.endUs * NS_PER_US, STEP_MARK)
  }
  return out.build({ source: 'synthetic', synthetic: true })
}
