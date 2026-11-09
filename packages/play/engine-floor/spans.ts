/**
 * Back of House's span check (GAMES.md §5 "Scoring and pass" and "Simulation API"; W1-T19): the stages a learner laid, read against the
 * stage spans of a lifecycle trace, in the order the trace has them.
 *
 * A lifecycle trace (packages/sim/lifecycle) writes a scenario's path out as a `trace@1` with one span for each stage, named by the
 * stage's id and placed on the track of the thread or the GPU stream where the stage works. The check lines the laid ids up with those
 * spans, in time order, and says how many matched before the first that did not. A path is the trace's whole path when every laid stage
 * matched and the trace has no stage span left over.
 *
 * It reads a trace and nothing else, so it is the check that a trace of a real engine meets later: the synthetic traces stand in for the
 * owner's until W2-T21, and W2-T34 holds a learner's own fork to the same rule (the order of its spans equals the map it laid).
 */
import type { Seed } from '@es/sim/core'
import { describeScenario, lifecycleTrace, stageSpans } from '@es/sim/lifecycle'
import type { Scenario } from '@es/sim/lifecycle'
import type { EsTrace } from '@es/sim/trace'
import type { SpanCheckView, SpanRowView } from './types'

export interface SpanCheck {
  /** How many laid stages are the trace's stage spans, in order, before the first that is not: all of them when none is not. */
  readonly matched: number
  /** The place in `laid` of the first stage that is not the trace's stage there, or null. A path that is only a prefix of the trace's has none. */
  readonly firstMismatch: number | null
  /** The span in the trace's columns that each matched stage matched, in the order laid. */
  readonly spans: readonly number[]
  /** How many stage spans the trace has. */
  readonly of: number
}

/** The stage spans of a trace in the order they happen: by start, and by place in the columns when two start together. */
function inOrder(t: EsTrace): readonly { readonly stage: string; readonly span: number }[] {
  const { startNs } = t.spans
  return stageSpans(t)
    .slice()
    .sort((a, b) => startNs[a.span] - startNs[b.span] || a.span - b.span)
}

/**
 * Reads the stages `laid` against the trace's stage spans (GAMES.md §5, `spanCheck`). The i-th laid stage has to be the i-th stage span of
 * the trace. A trace of a scenario passes its own reference path whole, whatever the seed of its jitter, because the seed moves the times
 * and never the order (tests/sim/lifecycle-trace.test.ts).
 */
export function spanCheck(laid: readonly string[], t: EsTrace): SpanCheck {
  const stages = inOrder(t)
  const spans: number[] = []
  let firstMismatch: number | null = null
  for (let i = 0; i < laid.length; i++) {
    const there = stages[i]
    if (there === undefined || there.stage !== laid[i]) {
      firstMismatch = i
      break
    }
    spans.push(there.span)
  }
  return { matched: spans.length, firstMismatch, spans, of: stages.length }
}

let last: { readonly key: string; readonly trace: EsTrace } | null = null

/**
 * The synthetic lifecycle trace of a scenario on a seed (`lifecycleTrace` at its default jitter), kept for the last one asked for: a view
 * asks for it each time it draws. A trace is never changed, so the one that is kept can be shared.
 */
export function traceOf(sc: Scenario, seed: Seed): EsTrace {
  const key = `${describeScenario(sc)}|${seed}`
  if (last === null || last.key !== key) last = { key, trace: lifecycleTrace(sc, seed) }
  return last.trace
}

/** The check of a laid path against the trace of its scenario, in the form the debrief and the trace viewer draw: a row for each laid stage. */
export function checkViewOf(sc: Scenario, seed: Seed, laid: readonly string[]): SpanCheckView {
  const t = traceOf(sc, seed)
  const found = spanCheck(laid, t)
  const tape = inOrder(t)
  const tracks = new Map(t.tracks.map((track) => [track.id, t.strings[track.name]]))
  const rows = laid.map((stage, index): SpanRowView => {
    const span = found.spans[index]
    const there = tape[index]?.stage ?? null
    if (span === undefined) return { index, stage, matched: false, tape: there, span: null, track: null, startNs: null, durNs: null }
    return { index, stage, matched: true, tape: there, span, track: tracks.get(t.spans.track[span]) ?? null, startNs: t.spans.startNs[span], durNs: t.spans.durNs[span] }
  })
  return {
    seed,
    matched: found.matched,
    firstMismatch: found.firstMismatch,
    spans: found.of,
    whole: found.firstMismatch === null && found.matched === found.of && laid.length === found.of,
    rows,
  }
}
