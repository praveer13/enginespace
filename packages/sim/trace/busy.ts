// What is busy when (ARCHITECTURE §5.7): the three unions that attribution is made of, and the sweep that cuts a window by them.
//
// A trace's GPU work is its `kernel` and `copy` spans on `gpu-stream` tracks. Its main thread is whatever its `cpu-thread` and
// `cuda-api` tracks cover. Each is reduced once to a sorted list of disjoint intervals, and a window is then cut by walking the
// three lists together, so asking about a thousand windows costs one pass over the trace and a thousand short walks. Everything is
// integer ns, and nothing is rounded, so the pieces of a window add up to the window exactly.

import type { Attribution, AttributionCategory, AttributionGap, AttributionSegment, EsTrace, TraceTrackKind } from './types'
import { CAT_COPY, CAT_KERNEL } from './types'

/** Disjoint intervals in ascending order: the i-th is [start[i], end[i]). Touching intervals are merged. */
export interface Busy {
  readonly start: Float64Array
  readonly end: Float64Array
}

export interface BusyIndex {
  /** Time with a kernel running on any stream. */
  readonly kernel: Busy
  /** Time with a copy running on any stream, whether or not a kernel runs too. */
  readonly copy: Busy
  /** Time the main thread is busy: a span of a `cpu-thread` or a `cuda-api` track covers it. */
  readonly cpu: Busy
}

function unionOf(startNs: Float64Array, durNs: Float64Array, rows: number[]): Busy {
  rows.sort((a, b) => startNs[a] - startNs[b])
  const start: number[] = []
  const end: number[] = []
  for (const row of rows) {
    const s = startNs[row]
    const e = s + durNs[row]
    const last = end.length - 1
    if (last >= 0 && s <= end[last]) {
      if (e > end[last]) end[last] = e
    } else {
      start.push(s)
      end.push(e)
    }
  }
  return { start: Float64Array.from(start), end: Float64Array.from(end) }
}

/** The unions of a trace. A span of no duration is nothing, a span whose category is not `kernel` or `copy` is no GPU work, and all of it is read once. */
export function busyIndex(t: EsTrace): BusyIndex {
  const kindOf = new Map<number, TraceTrackKind>()
  for (const track of t.tracks) kindOf.set(track.id, track.kind)
  const isKernel = t.strings.map((s) => s === CAT_KERNEL)
  const isCopy = t.strings.map((s) => s === CAT_COPY)
  const kernel: number[] = []
  const copy: number[] = []
  const cpu: number[] = []
  const { track, startNs, durNs, cat } = t.spans
  for (let i = 0; i < track.length; i++) {
    if (!(durNs[i] > 0)) continue
    const kind = kindOf.get(track[i])
    if (kind === 'gpu-stream') {
      if (isKernel[cat[i]]) kernel.push(i)
      else if (isCopy[cat[i]]) copy.push(i)
    } else if (kind === 'cpu-thread' || kind === 'cuda-api') {
      cpu.push(i)
    }
  }
  return { kernel: unionOf(startNs, durNs, kernel), copy: unionOf(startNs, durNs, copy), cpu: unionOf(startNs, durNs, cpu) }
}

/** The first interval that ends after `t`, or the count if none does. */
function firstEndingAfter(busy: Busy, t: number): number {
  let lo = 0
  let hi = busy.end.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (busy.end[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Where the state of one list next changes after `t`, given that the interval `p` is the first that ends after `t`. */
function nextChange(busy: Busy, p: number, active: boolean, limit: number): number {
  if (p >= busy.end.length) return limit
  return Math.min(limit, active ? busy.end[p] : busy.start[p])
}

/**
 * Cuts the window [fromNs, toNs) into maximal runs of one category, and adds them up. At every instant the category is `kernel` if a
 * kernel runs, else `copy` if a copy runs, else `cpu-gap` if the main thread is busy, else `both-idle`; and the main thread's busy
 * time while the GPU is busy is the overlap. The runs follow each other from `fromNs` to `toNs`, so their lengths add up to the window.
 */
export function sweep(index: BusyIndex, fromNs: number, toNs: number): Attribution {
  const { kernel, copy, cpu } = index
  let pk = firstEndingAfter(kernel, fromNs)
  let pc = firstEndingAfter(copy, fromNs)
  let pu = firstEndingAfter(cpu, fromNs)
  const segments: AttributionSegment[] = []
  let kernelNs = 0
  let copyOnlyNs = 0
  let cpuGapNs = 0
  let bothIdleNs = 0
  let overlapNs = 0
  let t = fromNs
  while (t < toNs) {
    while (pk < kernel.end.length && kernel.end[pk] <= t) pk++
    while (pc < copy.end.length && copy.end[pc] <= t) pc++
    while (pu < cpu.end.length && cpu.end[pu] <= t) pu++
    const k = pk < kernel.end.length && kernel.start[pk] <= t
    const c = pc < copy.end.length && copy.start[pc] <= t
    const u = pu < cpu.end.length && cpu.start[pu] <= t
    const next = nextChange(cpu, pu, u, nextChange(copy, pc, c, nextChange(kernel, pk, k, toNs)))
    const length = next - t
    let category: AttributionCategory
    if (k) {
      category = 'kernel'
      kernelNs += length
    } else if (c) {
      category = 'copy'
      copyOnlyNs += length
    } else if (u) {
      category = 'cpu-gap'
      cpuGapNs += length
    } else {
      category = 'both-idle'
      bothIdleNs += length
    }
    if ((k || c) && u) overlapNs += length
    const last = segments.length - 1
    if (last >= 0 && segments[last].category === category) segments[last] = { fromNs: segments[last].fromNs, toNs: next, category }
    else segments.push({ fromNs: t, toNs: next, category })
    t = next
  }

  const windowNs = toNs - fromNs
  if (kernelNs + copyOnlyNs + cpuGapNs + bothIdleNs !== windowNs) throw new Error(`internal: the parts of [${fromNs}, ${toNs}) add up to ${kernelNs + copyOnlyNs + cpuGapNs + bothIdleNs}, not ${windowNs}`)

  const gaps: AttributionGap[] = []
  let open: { fromNs: number; toNs: number; cpuGapNs: number; bothIdleNs: number } | null = null
  for (const segment of segments) {
    const idle = segment.category === 'cpu-gap' || segment.category === 'both-idle'
    if (!idle) {
      if (open) gaps.push(open)
      open = null
      continue
    }
    const length = segment.toNs - segment.fromNs
    open ??= { fromNs: segment.fromNs, toNs: segment.fromNs, cpuGapNs: 0, bothIdleNs: 0 }
    open = {
      fromNs: open.fromNs,
      toNs: segment.toNs,
      cpuGapNs: open.cpuGapNs + (segment.category === 'cpu-gap' ? length : 0),
      bothIdleNs: open.bothIdleNs + (segment.category === 'both-idle' ? length : 0),
    }
  }
  if (open) gaps.push(open)

  return { fromNs, toNs, windowNs, gpuBusyNs: kernelNs + copyOnlyNs, kernelNs, copyOnlyNs, cpuGapNs, bothIdleNs, overlapNs, segments, gaps }
}
