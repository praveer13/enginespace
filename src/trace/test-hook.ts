/*
 * The viewer's test hook (TRACKER W1-T09, accept 1; the same switch as the scene kit's): in a test build, `window.__esTrace` reports
 * what the canvas has drawn and what each frame cost, and takes the viewer's commands, so that e2e can pan a tape of 100,000 spans
 * and read the frame rate off the page instead of assuming it. A test build is one made with `VITE_ES_TEST_HOOKS=1`; in any other
 * build `TEST_HOOKS` is the constant false and the bundler drops every line that uses it.
 */
import { TEST_HOOKS } from '@/scene/test-hook'
import type { Win } from './model'
import type { Command } from './state'

export interface TraceProbe {
  /** The frames the canvas has drawn since the page opened or `reset()`. */
  draws(): number
  /** What each of them cost in ms: the plan and the paint, from the frame's start to the last canvas call. */
  costs(): number[]
  /** When each was drawn, in ms of the page's clock: the gaps between them are the frame times of a pan. */
  stamps(): number[]
  /** The rectangles and the spans of the last frame. */
  rects(): number
  visited(): number
  /** How many spans the tape holds. */
  spans(): number
  window(): Win
  /** Sends a command through the same reducer a key or a button does. */
  dispatch(command: Command): void
  reset(): void
}

declare global {
  interface Window {
    __esTrace?: TraceProbe
  }
}

interface Frames {
  draws: number
  costs: number[]
  stamps: number[]
  rects: number
  visited: number
}

const frames: Frames = { draws: 0, costs: [], stamps: [], rects: 0, visited: 0 }

/** Notes a drawn frame. A no-op outside test builds. */
export function recordFrame(ms: number, rects: number, visited: number): void {
  if (!TEST_HOOKS) return
  frames.draws++
  frames.costs.push(ms)
  frames.stamps.push(performance.now())
  frames.rects = rects
  frames.visited = visited
}

/** Puts the probe on the page while the viewer lives. A no-op outside test builds. */
export function registerTraceProbe(parts: { spans: number; window(): Win; dispatch(command: Command): void }): () => void {
  if (!TEST_HOOKS || typeof window === 'undefined') return () => undefined
  const probe: TraceProbe = {
    draws: () => frames.draws,
    costs: () => [...frames.costs],
    stamps: () => [...frames.stamps],
    rects: () => frames.rects,
    visited: () => frames.visited,
    spans: () => parts.spans,
    window: parts.window,
    dispatch: parts.dispatch,
    reset() {
      frames.draws = 0
      frames.costs = []
      frames.stamps = []
    },
  }
  window.__esTrace = probe
  return () => {
    if (window.__esTrace === probe) delete window.__esTrace
  }
}
