// Attribution (ARCHITECTURE §5.7; GAMES.md §6; ASSESSMENT T7): the partition of a step window into the GPU busy, the GPU waiting
// on the CPU, and both idle, in integer ns.
//
// A step window runs from one step mark to the next, and its length is the step's TPOT. Inside it:
//   - GPU-busy is the union of the kernel and copy spans on GPU streams, split into kernel (a kernel runs) and copy-only;
//   - CPU-gap is GPU-idle time while the engine's main thread is busy;
//   - both-idle is GPU-idle time while the main thread is idle too.
// The three add up to the window exactly. Overlap, the main thread's busy time inside GPU-busy, is hidden CPU work, and is reported
// beside the partition and inside none of it.

import { compareAsc } from '../core/stats'
import { busyIndex, sweep } from './busy'
import type { Attribution, EsTrace, StepWindow } from './types'
import { STEP_MARK } from './types'

/**
 * The step windows of a trace: the marks named `STEP_MARK`, in time order, taken two at a time. A trace with n step marks has
 * n − 1 windows, and none if it has fewer than two.
 */
export function stepWindows(t: EsTrace): StepWindow[] {
  const isStep = t.strings.map((s) => s === STEP_MARK)
  const times = t.marks.filter((m) => isStep[m.name]).map((m) => m.tNs)
  times.sort(compareAsc)
  const windows: StepWindow[] = []
  for (let i = 0; i + 1 < times.length; i++) windows.push({ fromNs: times[i], toNs: times[i + 1] })
  return windows
}

function checkWindow(w: StepWindow): void {
  if (!Number.isSafeInteger(w.fromNs) || !Number.isSafeInteger(w.toNs) || w.toNs < w.fromNs) {
    throw new RangeError(`a window is two integers below 2^53 with from ≤ to, got [${w.fromNs}, ${w.toNs})`)
  }
}

/**
 * The partition of the window `w` of `t`. A span that crosses the window's edge counts for the part inside it, and a window need
 * not be one of the trace's own step windows: Gap Hunt asks about one-µs windows to compare a trace with its run. One call reads the
 * whole trace, so to ask about many windows use `attributeWindows`.
 */
export function attribute(t: EsTrace, w: StepWindow): Attribution {
  checkWindow(w)
  return sweep(busyIndex(t), w.fromNs, w.toNs)
}

/** `attribute` for each of `windows`, in order, reading the trace once. */
export function attributeWindows(t: EsTrace, windows: readonly StepWindow[]): Attribution[] {
  windows.forEach(checkWindow)
  const index = busyIndex(t)
  return windows.map((w) => sweep(index, w.fromNs, w.toNs))
}

/** `attribute` for every step window of the trace, in time order. */
export function attributeSteps(t: EsTrace): Attribution[] {
  return attributeWindows(t, stepWindows(t))
}
