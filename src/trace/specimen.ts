/*
 * The specimen tapes the Trace Room shows until pinned traces exist (WORLD §3.5, PRODUCT.md "Evidence on Hand": real engine traces
 * have not been captured, and anything demonstrative is labelled synthetic). `/trace-room/synthetic-<seed>` is one: a short night
 * of the step-loop model, run with async scheduling off and every kernel launched by its own call, so the line goes dark between
 * steps while the expo writes, which is the gap the tape exists to find. The same seed gives the same tape.
 *
 * `traceFromRun` writes the spans with seeded jitter and labels the trace synthetic; nothing here claims a measurement.
 *
 * The night runs on a chip and a model of its own invention, in round numbers [estimated]: they stand for no hardware and no
 * checkpoint, and the S5 card's fitted rows are left to the step-loop levels, which are W1-T12's. It builds its card by hand and
 * imports the model's files and not their barrels, so that this page asks nothing more of the step loop's shared module than the
 * front page does: a use of `s5Card` would keep the S5 rows in the front page's first-paint closure (verify:bundle, A§11.1).
 */
import { rngFor, between } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { HOST_PRESETS } from '@es/sim/host/presets'
import type { CardSpec } from '@es/sim/physics/card'
import { runStepLoop } from '@es/sim/steploop/run'
import type { S5GpuCard } from '@es/sim/steploop/types'
import { traceFromRun } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import type { ReqSpec, Workload } from '@es/sim/workload/types'

/** The spec of the night's card: the datasheet bound (η = 1, no fixed terms) on a round chip and a 28-layer model [estimated]. */
const SPEC: CardSpec = {
  chip: { bwBps: 1e12, peakFlops: 1e14, hbmBytes: 24e9 },
  model: { params: 6e8, layers: 28, hidden: 1024, kvBytesPerToken: 114_688, weightBytes: 1.2e9 },
  params: { etaMem: 1, etaFlop: 1, layerUs: 0, seqUs: 0, linkGBs: null },
}

/** A synthetic night for `seed`: a dozen requests, about twenty-five steps and some 1,400 spans. */
export function specimenTrace(seed: Seed): EsTrace {
  const rng = rngFor(seed, 'trace/specimen')
  const gpu: S5GpuCard = Object.freeze({ kind: 's5', label: 'A synthetic chip and model (round numbers)', tag: 'estimated', synthetic: true, spec: SPEC, tp: 1, hostTerm: 'on-cpu' })
  let due = 0
  const reqs: ReqSpec[] = Array.from({ length: 12 }, (_, id) => {
    due += between(rng, 500, 4_000)
    return { id, dueUs: due, promptTokens: between(rng, 16, 400), outputTokens: between(rng, 4, 24), prefixGroup: null, prefixTokens: 0, adapter: null, structured: false }
  })
  const workload: Workload = { seed, origin: { kind: 'synthetic' }, reqs }
  const run = runStepLoop(
    workload,
    { maxNumSeqs: 8, maxBatchedTokens: 2048, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] }, batching: 'continuous' },
    HOST_PRESETS.mrv2.card,
    gpu,
    { horizonUs: 600_000_000_000 },
  )
  return traceFromRun(run, seed)
}
