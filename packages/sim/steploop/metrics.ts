// What a run measures (ARCHITECTURE §5.3, WORLD §2.12; GAMES.md §3, "Scoring and pass"): the bubbles, the per-request
// latencies, and the summary the front page's counters and TR2's levels read.
//
// All integer, and exact: durations are sums of spans, shares are `permille` and `divRound` (core/int), and the percentiles are
// nearest rank on sorted integers (§5.6). Nothing here reads a clock.

import { divRound, percentile, permille } from '../core'
import type { Permille, ReqId, Us } from '../core/types'
import type { GraphResult, ReqStat, Span, StepStat, Summary, Timeline } from './types'

/** A step as the loop records it while it runs; `finishRun` turns the list into `StepStat`s. */
export interface StepRecord {
  readonly index: number
  readonly seqs: number
  readonly prefillSeqs: number
  /** Rows whose request had stopped when the step was read back. Set at the read-back, and 0 before it. */
  ghostSeqs: number
  readonly tokens: number
  readonly paddedTokens: number
  readonly graph: GraphResult
  /** CPU launch calls the step made. */
  readonly launches: number
  /** The step's forward as recorded on the GPU lane (cut at the horizon), or null if the horizon cut it away. */
  forward: Span | null
}

/** A request as the loop records it while it runs. */
export interface ReqRecord {
  readonly id: ReqId
  readonly dueUs: Us
  readonly outputTokens: number
  emitted: number
  ghosts: number
  finished: boolean
  /** When its first and its last token left the engine core: the end of the sample span of the step that emitted them. */
  firstUs: Us | null
  lastUs: Us | null
}

/**
 * The CPU-gap before each step's forward: GPU idle time between the previous forward's end and this one's start, while `cpu-main`
 * has a span running (A§5.7's partition: GPU-idle with the main thread busy). GPU idle time with `cpu-main` idle too is the engine
 * waiting for a request to arrive, which is nobody's overhead, so it is not a bubble. The first forward has no gap before it.
 */
export function bubblesBefore(forwards: readonly (Span | null)[], cpu: readonly Span[]): Us[] {
  const out: Us[] = []
  let previousEnd: Us | null = null
  let first = 0
  for (const forward of forwards) {
    let bubble: Us = 0
    if (forward !== null) {
      if (previousEnd !== null && forward.startUs > previousEnd) {
        const from = previousEnd
        const to = forward.startUs
        while (first < cpu.length && cpu[first].endUs <= from) first++
        for (let i = first; i < cpu.length && cpu[i].startUs < to; i++) {
          bubble += Math.min(cpu[i].endUs, to) - Math.max(cpu[i].startUs, from)
        }
      }
      previousEnd = forward.endUs
    }
    out.push(bubble)
  }
  return out
}

function stat(req: ReqRecord): ReqStat {
  const { firstUs, lastUs } = req
  return {
    id: req.id,
    dueUs: req.dueUs,
    tokens: req.emitted,
    ghostTokens: req.ghosts,
    finished: req.finished,
    ttftUs: firstUs === null ? null : firstUs - req.dueUs,
    // Time per output token after the first: the tokens between the first and the last are emitted - 1.
    tpotUs: firstUs === null || lastUs === null || req.emitted < 2 ? null : divRound(lastUs - firstUs, req.emitted - 1),
    e2eUs: req.finished && lastUs !== null ? lastUs - req.dueUs : null,
  }
}

function p(xs: readonly number[], pPermille: Permille): Us | null {
  return xs.length === 0 ? null : percentile(xs, pPermille)
}

/** The per-step and per-request stats, and the summary, from what the loop recorded. */
export function finishRun(
  steps: readonly StepRecord[],
  reqs: readonly ReqRecord[],
  lanes: Timeline,
): { steps: StepStat[]; reqs: ReqStat[]; summary: Summary } {
  const cpu = lanes['cpu-main']
  const gpu = lanes['gpu-stream']
  const bubbles = bubblesBefore(
    steps.map((s) => s.forward),
    cpu,
  )
  const stepStats: StepStat[] = steps.map((s, i) => ({
    index: s.index,
    seqs: s.seqs,
    prefillSeqs: s.prefillSeqs,
    ghostSeqs: s.ghostSeqs,
    tokens: s.tokens,
    paddedTokens: s.paddedTokens,
    graph: s.graph,
    gpuUs: s.forward === null ? 0 : s.forward.endUs - s.forward.startUs,
    bubbleUs: bubbles[i],
  }))
  const reqStats = reqs.map(stat)

  let clockUs: Us = 0
  if (cpu.length > 0) clockUs = Math.max(clockUs, cpu[cpu.length - 1].endUs)
  if (gpu.length > 0) clockUs = Math.max(clockUs, gpu[gpu.length - 1].endUs)
  let gpuBusyUs: Us = 0
  for (const span of gpu) gpuBusyUs += span.endUs - span.startUs

  let usefulTokens = 0
  let ghostTokens = 0
  let finished = 0
  for (const r of reqs) {
    usefulTokens += r.emitted
    ghostTokens += r.ghosts
    if (r.finished) finished++
  }
  let paddedTokens = 0
  let launches = 0
  let eagerSteps = 0
  let bubbleUs: Us = 0
  let bubbled = 0
  for (const [i, s] of steps.entries()) {
    paddedTokens += s.paddedTokens - s.tokens
    launches += s.launches
    if (s.graph !== 'hit') eagerSteps++
    bubbleUs += bubbles[i]
    if (bubbles[i] > 0) bubbled++
  }

  const ttft: Us[] = []
  const tpot: Us[] = []
  for (const r of reqStats) {
    if (r.ttftUs !== null) ttft.push(r.ttftUs)
    if (r.tpotUs !== null) tpot.push(r.tpotUs)
  }

  const summary: Summary = {
    clockUs,
    steps: steps.length,
    finished,
    usefulTokens,
    ghostTokens,
    paddedTokens,
    gpuBusyUs,
    gpuBusyPermille: clockUs > 0 ? permille(gpuBusyUs, clockUs) : 0,
    bubbleUs,
    bubbles: bubbled,
    launches,
    eagerSteps,
    tokensPerSMilli: clockUs > 0 ? divRound(usefulTokens * 1_000_000_000, clockUs) : 0,
    ttftP50Us: p(ttft, 500),
    ttftP99Us: p(ttft, 990),
    tpotP50Us: p(tpot, 500),
    tpotP99Us: p(tpot, 990),
  }
  return { steps: stepStats, reqs: reqStats, summary }
}
