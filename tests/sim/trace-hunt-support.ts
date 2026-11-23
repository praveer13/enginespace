/*
 * Shared by the Gap Hunt model's tests (tests/sim/trace-hunt*.test.ts): the golden of a case, and a per-span recomputation of a gap's
 * cause that shares no code with packages/sim/trace.
 */
import { createHash } from 'node:crypto'
import { attributeSteps, causeKind, checkHunt, encodeTrace, huntCase, huntTraces, referenceSplit, spanCount, spanView } from '../../packages/sim/trace'
import type { EsTrace } from '../../packages/sim/trace'
import { seeds } from '../seeds'

export const SEEDS = seeds(1)
export const CHUNK = 100
export const chunks = Array.from({ length: Math.ceil(SEEDS.length / CHUNK) }, (_, i) => SEEDS.slice(i * CHUNK, (i + 1) * CHUNK))
export const LEVELS = ['read', 'gap', 'graphs', 'attribute'] as const

/** What a golden holds of a case: the trace's hash, the step, the ask, the reference and what a perfect answer is scored. */
export function huntGolden(seed: number, level: string): Record<string, unknown> {
  const traces = huntTraces(seed, level)
  const c = huntCase(traces, seed, level)
  const ref = referenceSplit(c)
  const result = checkHunt(c, ref.marks, ref.largestGap?.cause ?? null)
  return {
    traces: traces.map((t) => createHash('sha256').update(encodeTrace(t)).digest('hex')),
    traceIndex: traces.indexOf(c.trace),
    step: c.step,
    ask: c.ask,
    segments: ref.marks.map((m) => [m.fromNs, m.toNs, m.category]),
    overlapNs: ref.overlapNs,
    largestGap: ref.largestGap,
    causeKind: ref.largestGap === null ? null : causeKind(c.trace, ref.largestGap.cause),
    perfect: result,
  }
}

/**
 * The cause of the largest gap of window `step`, found with no help from the package: the main-thread spans that overlap the lead-in
 * (from the window's first idle ns to the start of the call that launched the work ending it), the one with most ns in the lead-in,
 * the shortest if two tie. Returns the span's index, its share of the lead-in in permille, and its name.
 */
export function bruteCause(t: EsTrace, step: number): { event: number; permille: number; name: string; leadIn: number } | null {
  const a = attributeSteps(t)[step]
  let gap = a.gaps[0]
  for (const g of a.gaps) if (g.toNs - g.fromNs > gap.toNs - gap.fromNs) gap = g
  if (gap === undefined) return null
  let end = gap.toNs
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind === 'gpu-stream' && v.startNs === gap.toNs && v.corr >= 0) {
      for (let j = 0; j < spanCount(t); j++) {
        const w = spanView(t, j)
        if (w.kind === 'cuda-api' && w.corr === v.corr && w.startNs <= gap.toNs) end = Math.min(end, w.startNs)
      }
      break
    }
  }
  const leadIn = end - gap.fromNs
  let best: { event: number; cover: number; dur: number } | null = null
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind !== 'cpu-thread' && v.kind !== 'cuda-api') continue
    let cover = 0
    for (let n = Math.max(v.startNs, gap.fromNs); n < Math.min(v.endNs, end); n++) cover++
    if (cover === 0) continue
    if (best === null || cover > best.cover || (cover === best.cover && v.durNs < best.dur)) best = { event: i, cover, dur: v.durNs }
  }
  if (best === null) return null
  return { event: best.event, permille: Math.floor((best.cover * 1000) / leadIn), name: spanView(t, best.event).name, leadIn }
}
