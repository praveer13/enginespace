// The phases of a step as events on the two lanes (ARCHITECTURE §5.3; WORLD §2.1, §2.6): where each falls in time, how it is
// recorded, and the dependency the model checks.
//
// One step is five phases on the engine's main thread and one on the GPU stream:
//
//   cpu-main    schedule, prepare, launch  ...  sync, sample
//   gpu-stream                  forward starts when the launch ends and the stream is free; sync starts when the forward ends
//
// `placeLaunch` and `placeReadback` are the two halves, in integer µs. Where the loop calls them, and in what order, is the one
// thing that async scheduling changes (run.ts).

import type { Us } from '../core/types'
import type { LaneId, Span, SpanKind, Timeline, Violation } from './types'

/** How long each phase of one step takes. */
export interface LaunchPhases {
  readonly scheduleUs: Us
  readonly prepareUs: Us
  /** One graph replay, or one launch per kernel. */
  readonly launchUs: Us
  /** The forward on the GPU stream. */
  readonly forwardUs: Us
}

/** Where a step's CPU work before its forward falls, and where its forward does. */
export interface Launch {
  readonly scheduleEnd: Us
  readonly prepareEnd: Us
  readonly launchEnd: Us
  readonly forwardStart: Us
  readonly forwardEnd: Us
}

/**
 * The CPU starts the step's schedule at `cpuFreeUs` and runs schedule, prepare and launch back to back. The forward starts when
 * the launch has ended and the stream is free (`gpuFreeUs`), whichever is later: kernels queue on one stream, so two forwards never
 * overlap. (A real eager launch overlaps its own forward, since kernel 1 runs while kernel 2 is still being launched. §5.3 draws
 * the launch before the forward, and the notional-machine card says so.)
 */
export function placeLaunch(cpuFreeUs: Us, gpuFreeUs: Us, phases: LaunchPhases): Launch {
  const scheduleEnd = cpuFreeUs + phases.scheduleUs
  const prepareEnd = scheduleEnd + phases.prepareUs
  const launchEnd = prepareEnd + phases.launchUs
  const forwardStart = Math.max(launchEnd, gpuFreeUs)
  return { scheduleEnd, prepareEnd, launchEnd, forwardStart, forwardEnd: forwardStart + phases.forwardUs }
}

/** Where a step's read-back falls: the sync that returns the sampled ids, then the sample that updates requests from them. */
export interface Readback {
  readonly syncStart: Us
  readonly syncEnd: Us
  readonly sampleEnd: Us
}

/**
 * The CPU reaches the read-back at `cpuFreeUs` and blocks until the forward has ended, so the sync starts at the later of the two.
 * The wait before it is a gap on `cpu-main`, not a span.
 */
export function placeReadback(cpuFreeUs: Us, forwardEndUs: Us, syncUs: Us, sampleUs: Us): Readback {
  const syncStart = Math.max(cpuFreeUs, forwardEndUs)
  const syncEnd = syncStart + syncUs
  return { syncStart, syncEnd, sampleEnd: syncEnd + sampleUs }
}

export interface TimelineBuilder {
  /**
   * Appends a span to a lane. A span that starts at or after the horizon is dropped, one that crosses it is cut there, and an
   * empty one is dropped (a phase that costs 0 leaves no span). A span that starts before the lane's last one ended is a
   * bug in the caller, and throws.
   */
  add(lane: LaneId, step: number, kind: SpanKind, startUs: Us, endUs: Us): Span | null
  /** The lanes recorded so far. */
  timeline(): Timeline
}

export function timelineBuilder(horizonUs: Us): TimelineBuilder {
  const lanes: { 'cpu-main': Span[]; 'gpu-stream': Span[] } = { 'cpu-main': [], 'gpu-stream': [] }
  const lastEnd: Record<LaneId, Us> = { 'cpu-main': 0, 'gpu-stream': 0 }
  return {
    add(lane, step, kind, startUs, endUs) {
      if (endUs < startUs) throw new Error(`a ${kind} span of step ${step} ends before it starts (${startUs} to ${endUs})`)
      if (startUs < lastEnd[lane]) throw new Error(`a ${kind} span of step ${step} starts at ${startUs}, before the last span on ${lane} ended at ${lastEnd[lane]}`)
      if (endUs === startUs || startUs >= horizonUs) return null
      const span: Span = { step, kind, startUs, endUs: Math.min(endUs, horizonUs) }
      lanes[lane].push(span)
      lastEnd[lane] = span.endUs
      return span
    },
    timeline: () => lanes,
  }
}

/**
 * §5.3's dependency check, for one step at the moment its prepare phase begins. `rowsInFlight` counts the rows whose input token
 * was sampled by a step that has not been read back yet. With input ids written on the device the GPU's own stream order makes the
 * token ready before the forward reads it, and there is nothing to break. With input ids written on the host the CPU reads each
 * of those tokens now, before it is sampled: one violation for the step.
 */
export function checkDependency(inputIds: 'device' | 'host', step: number, atUs: Us, rowsInFlight: number): Violation | null {
  return inputIds === 'host' && rowsInFlight > 0 ? { kind: 'read-before-sample', step, atUs, rows: rowsInFlight } : null
}
