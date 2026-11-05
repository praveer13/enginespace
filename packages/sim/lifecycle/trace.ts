// Synthetic lifecycle traces (ARCHITECTURE §5.7, §5.8; the `lifecycle` card): a scenario's reference path written out as a `trace@1`, with seeded
// durations. TR1's graded `map` checks the stages a learner laid against the spans of such a trace (W1-T19), and the Trace Room shows it
// labelled synthetic (W1-T09).
//
// What the trace is. Each stage is one span, named by the stage's id and placed on the track of the thread, or the GPU stream, where the
// stage's work is done. The stages follow each other in time, so the spans' start times are in the path's order, strictly. A stage that touches
// the GPU also has a short CUDA API span on its process's API track, which carries the correlation id of the GPU span it started. That is the
// launch every kernel and copy of a real capture has before it, and it is what keeps the trace inside `traceChecks`:
//   - an `h2d` or `d2h` stage is a copy span on the GPU's stream, a `launch` or `collective` stage is a kernel span, and each has its API span;
//   - a `sync` stage is a span on the waiting thread that ends after the GPU work it waits for (and a flow from the copy);
//   - every other stage is a span on the sending thread;
//   - one step window, from 0 to the end of the last span, holds all of it: a lifecycle trace is one lap of the engine's loop, and the lap is
//     the step (STEP_MARK).
//
// What the durations are. The model keeps the ORDER of the stages and says nothing about how long one takes (the card's "Ignores"). The
// durations here are made up, a nominal per mechanism [estimated] roughened by the seed, and the trace is marked synthetic: its ns carry no
// measurement and are not to be read as one (GAMES.md §2.6, point 8). They are integers, and the same scenario, seed and jitter give the same
// bytes in every runtime.

import { divFloor } from '../core/int'
import { assertSeed, below, between, rngFor } from '../core/rng'
import type { Seed } from '../core/types'
import { CAT_COPY, CAT_KERNEL, CAT_LAUNCH, CAT_SYNC, STEP_MARK, traceBuilder } from '../trace'
import type { EsTrace } from '../trace'
import { ENGINES, referencePath, scenarios } from './paths'
import type { Mechanism, Place, Scenario } from './types'

/** How a lifecycle trace is roughened. Every value is a judgment [estimated], which the card names under "Calibrated against". */
export interface LifecycleJitter {
  /** How far a stage's duration may stray from its nominal, in permille either way, from 0 to 900. */
  readonly spreadPermille: number
  /** The most idle time before a stage, in ns, from 0 to 100,000. */
  readonly gapNs: number
}

/** The jitter the Trace Room uses unless a level says otherwise: a stage may stray 30% from its nominal, and wait up to 20 µs before it starts. */
export const DEFAULT_LIFECYCLE_JITTER: LifecycleJitter = Object.freeze({ spreadPermille: 300, gapNs: 20_000 })

/** No jitter: every stage lasts its nominal and follows the one before at once. */
export const CLEAN_LIFECYCLE_JITTER: LifecycleJitter = Object.freeze({ spreadPermille: 0, gapNs: 0 })

/**
 * The nominal duration of a stage by mechanism, in ns [estimated]: the order of magnitude of what a stage of that kind costs in a small
 * engine on one host (a function call's worth of Python, a ZMQ hop, a pinned copy, a forward pass of a small model), and nothing measured.
 */
export const NOMINAL_NS: Readonly<Record<Mechanism, number>> = Object.freeze({
  call: 60_000,
  queue: 8_000,
  ipc: 90_000,
  shm: 25_000,
  h2d: 15_000,
  d2h: 12_000,
  launch: 6_000_000,
  collective: 250_000,
  sync: 5_000,
})

/** The nominal duration of the CUDA API call that starts a piece of GPU work, in ns [estimated]. */
const API_CALL_NS = 4_000

function checkJitter(j: LifecycleJitter): void {
  const within = (x: number, lo: number, hi: number, what: string): void => {
    if (!Number.isInteger(x) || x < lo || x > hi) throw new RangeError(`${what} is an integer from ${lo} to ${hi}, got ${x}`)
  }
  within(j.spreadPermille, 0, 900, 'spreadPermille')
  within(j.gapNs, 0, 100_000, 'gapNs')
}

/** The nominal strayed by up to `spread` permille either way, at least 1. It draws once, whatever the spread, so the stream does not depend on it. */
function roughen(rng: () => number, nominal: number, spread: number): number {
  return Math.max(1, divFloor(nominal * (1000 - spread + below(rng, 2 * spread + 1)), 1000))
}

/**
 * Writes the reference path of `sc` out as a synthetic `trace@1`. The trace is marked synthetic and carries no engine, version, GPU, date or
 * hash, as the step loop's traces do; the caller knows the scenario.
 */
export function lifecycleTrace(sc: Scenario, seed: Seed, jitter: LifecycleJitter = DEFAULT_LIFECYCLE_JITTER): EsTrace {
  assertSeed(seed)
  checkJitter(jitter)
  const path = referencePath(sc)
  const length = rngFor(seed, 'lifecycle/duration')
  const idle = rngFor(seed, 'lifecycle/gap')
  const calls = rngFor(seed, 'lifecycle/api')
  const waits = rngFor(seed, 'lifecycle/tail')

  const out = traceBuilder()
  const known = new Map<string, number>()
  const track = (key: string, kind: 'cpu-thread' | 'cuda-api' | 'gpu-stream', name: string): number => {
    let id = known.get(key)
    if (id === undefined) {
      id = out.track(kind, name)
      known.set(key, id)
    }
    return id
  }
  const hostTrack = (p: Place): number => track(`host|${p.process}|${p.thread}`, 'cpu-thread', `${p.process} · ${p.thread}`)
  const apiTrack = (p: Place): number => track(`api|${p.process}|${p.rank}`, 'cuda-api', `${p.process} · CUDA API`)
  const gpuTrack = (p: Place): number => track(`gpu|${p.process}|${p.rank}`, 'gpu-stream', `GPU ${p.rank} · ${p.process}`)

  const gpuFree = new Map<string, number>()
  let hostClock = 0
  let lastStart = -1
  let gpuEnd = 0
  let everyEnd = 0
  let corr = 0
  let lastCopyOut = -1

  for (const stage of path) {
    const duration = roughen(length, NOMINAL_NS[stage.mechanism], jitter.spreadPermille)
    const wait = between(idle, 0, jitter.gapNs)
    const { mechanism } = stage

    if (mechanism === 'sync') {
      // Waits on the host until the GPU's work has landed: the span ends after every piece of GPU work before it.
      const start = Math.max(hostClock + wait, lastStart + 1)
      const end = Math.max(start + duration, gpuEnd + 1 + below(waits, 2001))
      const span = out.span(hostTrack(stage.from), start, end - start, stage.id, CAT_SYNC)
      if (lastCopyOut >= 0) out.flow(lastCopyOut, span, 'sync')
      hostClock = end
      lastStart = start
      everyEnd = Math.max(everyEnd, end)
    } else if (mechanism === 'h2d' || mechanism === 'd2h' || mechanism === 'launch' || mechanism === 'collective') {
      // GPU work, started by a CUDA API call of the process that owns the GPU, and queued behind the stream's earlier work.
      const device = mechanism === 'd2h' ? stage.from : stage.to
      const copy = mechanism === 'h2d' || mechanism === 'd2h'
      const apiStart = hostClock + wait
      const apiLength = roughen(calls, API_CALL_NS, jitter.spreadPermille)
      const gpuKey = `${device.process}|${device.rank}`
      const start = Math.max(apiStart + apiLength, gpuFree.get(gpuKey) ?? 0, lastStart + 1)
      const id = corr++
      const api = out.span(apiTrack(device), apiStart, apiLength, copy ? 'cudaMemcpyAsync' : mechanism === 'launch' ? 'cudaLaunchKernel' : 'ncclAllReduce', copy ? CAT_COPY : CAT_LAUNCH, id)
      const work = out.span(gpuTrack(device), start, duration, stage.id, copy ? CAT_COPY : CAT_KERNEL, id)
      out.flow(api, work, copy ? 'copy' : 'launch')
      if (mechanism === 'd2h') lastCopyOut = work
      gpuFree.set(gpuKey, start + duration)
      hostClock = apiStart + apiLength
      lastStart = start
      gpuEnd = Math.max(gpuEnd, start + duration)
      everyEnd = Math.max(everyEnd, start + duration, hostClock)
    } else {
      // Work on a thread, or a hand-off from it: the sender's span.
      const start = Math.max(hostClock + wait, lastStart + 1)
      out.span(hostTrack(stage.from), start, duration, stage.id, mechanism)
      hostClock = start + duration
      lastStart = start
      everyEnd = Math.max(everyEnd, hostClock)
    }
  }

  out.mark(0, STEP_MARK)
  out.mark(everyEnd, STEP_MARK)
  return out.build({ source: 'synthetic', synthetic: true })
}

let ids: ReadonlySet<string> | null = null

/** Every stage id of every engine: the names that a lifecycle trace gives its stage spans. */
export function stageIds(): ReadonlySet<string> {
  if (ids === null) {
    const all = new Set<string>()
    for (const sc of scenarios()) for (const stage of ENGINES[sc.engine].path(sc)) all.add(stage.id)
    ids = all
  }
  return ids
}

/** The stage spans of a lifecycle trace, in time order: the spans named by a stage id, with their index in the trace. The CUDA API spans are not stages. */
export function stageSpans(t: EsTrace): readonly { readonly stage: string; readonly span: number }[] {
  const known = stageIds()
  const out: { stage: string; span: number }[] = []
  for (let i = 0; i < t.spans.name.length; i++) {
    const name = t.strings[t.spans.name[i]]
    if (known.has(name)) out.push({ stage: name, span: i })
  }
  return out
}
