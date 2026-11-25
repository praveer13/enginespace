// What a gap's cause is, read from a trace alone (GAMES.md §6), and the three parts of a gap between two kernels.
//
// The GPU work that ends a gap was launched by a CUDA call with the same correlation id. The lead-in of the gap is the time from
// its start to that call. The cause is the main-thread span that covers most of the lead-in: the span with the most ns inside it
// and, when spans nest and cover the same ns, the innermost (the shortest). It is a blocking call (`sync`) when it is a
// `cudaStreamSynchronize` or `cudaEventSynchronize`, the launch frame or a launch call (`eager`), or the engine's schedule or prepare
// frame (`host`).

import { attribute } from './attribute'
import { spanCount, spanView } from './codec'
import type { EsTrace, StepWindow } from './types'
import { CAT_COPY, CAT_KERNEL, CAT_LAUNCH } from './types'
import type { HuntCause } from './hunt-gen'

export interface GapCause {
  /** The cause's index among the trace's spans: the event id a learner names. */
  readonly event: number
  /** From the gap's start to the launch call of the work that ends it. */
  readonly leadInFromNs: number
  readonly leadInToNs: number
  /** The ns of the lead-in that the cause covers. */
  readonly coverNs: number
}

/** The cause of the gap [fromNs, toNs), or null when the gap has none to read: it ends the window, or no span covers any of its lead-in. */
export function findCause(t: EsTrace, gap: StepWindow): GapCause | null {
  let work = -1
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind === 'gpu-stream' && (v.cat === CAT_KERNEL || v.cat === CAT_COPY) && v.durNs > 0 && v.startNs === gap.toNs) {
      work = i
      break
    }
  }
  if (work < 0) return null
  const corr = spanView(t, work).corr
  let launchAt = gap.toNs
  if (corr >= 0) {
    let found = -1
    for (let i = 0; i < spanCount(t); i++) {
      const v = spanView(t, i)
      if (v.kind === 'cuda-api' && v.corr === corr && (v.cat === CAT_LAUNCH || v.cat === CAT_COPY) && v.startNs <= gap.toNs && v.startNs > found) found = v.startNs
    }
    if (found >= 0) launchAt = found
  }
  const from = gap.fromNs
  const to = Math.max(from, Math.min(launchAt, gap.toNs))
  if (to === from) return null
  let best = -1
  let bestCover = 0
  let bestDur = 0
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind !== 'cpu-thread' && v.kind !== 'cuda-api') continue
    const cover = Math.min(v.endNs, to) - Math.max(v.startNs, from)
    if (cover <= 0) continue
    if (cover > bestCover || (cover === bestCover && v.durNs < bestDur)) {
      best = i
      bestCover = cover
      bestDur = v.durNs
    }
  }
  return best < 0 ? null : { event: best, leadInFromNs: from, leadInToNs: to, coverNs: bestCover }
}

const SYNC_NAMES = new Set(['cudaStreamSynchronize', 'cudaEventSynchronize'])
const EAGER_NAMES = new Set(['launch', 'cudaLaunchKernel', 'cudaGraphLaunch'])
const HOST_NAMES = new Set(['schedule', 'prepare'])

/** The kind of cause a span is, by what it is called, or null for a span that is none of the three (a launch's copy call, other work). */
export function causeKind(t: EsTrace, event: number): HuntCause | null {
  const name = spanView(t, event).name
  if (SYNC_NAMES.has(name)) return 'sync'
  if (EAGER_NAMES.has(name)) return 'eager'
  if (HOST_NAMES.has(name)) return 'host'
  return null
}

/** The three parts of the gap between two kernels, in integer ns, where each may be zero. */
export interface GapParts {
  /** A copy runs alone. */
  readonly copyNs: number
  /** The GPU is idle while the main thread is busy. */
  readonly cpuGapNs: number
  /** The GPU and the main thread are idle. */
  readonly bothIdleNs: number
}

/**
 * The stretch [fromNs, toNs) between the end of one kernel and the start of the next, cut into its three parts, which add up to
 * its length exactly. A kernel inside the stretch is not a gap, and throws.
 */
export function gapParts(t: EsTrace, fromNs: number, toNs: number): GapParts {
  const a = attribute(t, { fromNs, toNs })
  if (a.kernelNs !== 0) throw new RangeError(`a kernel runs for ${a.kernelNs} ns of [${fromNs}, ${toNs}): it is not a gap between two kernels`)
  if (a.copyOnlyNs + a.cpuGapNs + a.bothIdleNs !== toNs - fromNs) throw new Error('internal: the parts of a gap do not add up')
  return { copyNs: a.copyOnlyNs, cpuGapNs: a.cpuGapNs, bothIdleNs: a.bothIdleNs }
}
