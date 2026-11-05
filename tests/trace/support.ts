/*
 * Shared by the trace viewer's tests (tests/trace/*.test.ts): the indexes they ask questions of, and a brute-force reading of a
 * window that shares no code with src/trace.
 */
import { buildIndex } from '@/trace/model'
import type { TraceIndex, Win } from '@/trace/model'
import { denseTrace } from '@/trace/dense'
import { specimenTrace } from '@/trace/specimen'
import { spanCount } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { randomTrace } from '../sim/trace-support'

export { randomTrace }

/** 200 seeds on a PR (ARCHITECTURE §5.10) [estimated]; the viewer's random tapes use fewer, because each is built and walked in full. */
export const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1)

const nights = new Map<number, TraceIndex>()
/** The specimen night of a seed, indexed once. */
export function night(seed = 7): TraceIndex {
  let index = nights.get(seed)
  if (index === undefined) {
    index = buildIndex(specimenTrace(seed))
    nights.set(seed, index)
  }
  return index
}

let big: { trace: EsTrace; index: TraceIndex } | null = null
/** A tape of 100,000 spans or a few more. */
export function bigTape(): { trace: EsTrace; index: TraceIndex } {
  if (big === null) {
    const trace = denseTrace(11, 100_000)
    big = { trace, index: buildIndex(trace) }
  }
  return big
}

/** The spans of `t` that touch [from, to), by looking at every one: the definition, with no index. */
export function bruteTouching(t: EsTrace, win: Win): number[] {
  const out: number[] = []
  for (let i = 0; i < spanCount(t); i++) {
    const start = t.spans.startNs[i]
    const end = start + t.spans.durNs[i]
    if (start < win.toNs && (end > win.fromNs || (end === start && start >= win.fromNs))) out.push(i)
  }
  return out
}
