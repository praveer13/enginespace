// Structural checks on a trace (ARCHITECTURE §5.7; ASSESSMENT §6.1): the rules a real capture keeps and a forged or broken one
// does not, each exact in integer ns.
//
//   structure  the columns are consistent (codec.ts)
//   T2         time runs forward: no span starts before 0 or lasts a negative time, and the step marks strictly increase
//   T3         one stream runs one thing at a time: kernel and copy spans on one GPU stream do not overlap
//   T4         every kernel has a launch before it: a CUDA API span with its correlation id that starts no later than it (a graph
//              launch is one such span for all its nodes), and every copy that has a correlation id has one too
//   T5         step marks contain their kernels: every kernel lies inside exactly one step window
//   T9         floors, when given: no step's GPU-busy time and no named span is shorter than its physics floor
//
// The rest of ASSESSMENT's list needs what a trace does not hold, and `packages/verify` runs it (W2-T08): T1's size caps and the
// engine, version and GPU it names, T6's step count against the challenge, T7's learner-submitted attribution, T8's configuration
// against the fingerprint, and T10's pairs. `attribute` is what T7 recomputes with.
//
// A failing check names its first offender and prints the bound it broke, and lists up to 8 offending spans for a viewer to light.

import { compareAsc } from '../core/stats'
import { attributeSteps, stepWindows } from './attribute'
import { validateTrace } from './codec'
import type { EsTrace, TraceCheckResult, TraceFloors, TraceTrackKind } from './types'
import { CAT_COPY, CAT_KERNEL, STEP_MARK } from './types'

const SPANS_LISTED = 8

interface Tally {
  failed: number
  first: string
  spans: number[]
}

const tally = (): Tally => ({ failed: 0, first: '', spans: [] })

function note(t: Tally, text: string, ...spans: number[]): void {
  if (t.failed === 0) t.first = text
  t.failed++
  for (const span of spans) if (t.spans.length < SPANS_LISTED && !t.spans.includes(span)) t.spans.push(span)
}

function result(id: string, title: string, checked: number, t: Tally, passed: string): TraceCheckResult {
  const pass = t.failed === 0
  return { id, title, pass, detail: pass ? passed : `${t.first}${t.failed > 1 ? ` (and ${t.failed - 1} more)` : ''}`, checked, failed: t.failed, spans: t.spans }
}

/** What the checks read of a trace, looked up once. */
interface View {
  readonly t: EsTrace
  /** Each span's track kind, by span. */
  readonly kind: TraceTrackKind[]
  /** Each span's position in `t.tracks`, by span. */
  readonly place: number[]
  readonly isKernel: boolean[]
  readonly isCopy: boolean[]
}

function view(t: EsTrace): View {
  const at = new Map<number, number>()
  t.tracks.forEach((track, i) => at.set(track.id, i))
  const n = t.spans.track.length
  const kind = new Array<TraceTrackKind>(n)
  const place = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    place[i] = at.get(t.spans.track[i]) ?? -1
    kind[i] = t.tracks[place[i]].kind
  }
  return { t, kind, place, isKernel: t.strings.map((s) => s === CAT_KERNEL), isCopy: t.strings.map((s) => s === CAT_COPY) }
}

const label = (v: View, i: number): string => `span ${i} (${v.t.strings[v.t.spans.name[i]]})`
const endOf = (v: View, i: number): number => v.t.spans.startNs[i] + v.t.spans.durNs[i]

// ---------------------------------------------------------------------------------------------------------------------------

function timeRunsForward(v: View): TraceCheckResult {
  const { startNs, durNs } = v.t.spans
  const bad = tally()
  for (let i = 0; i < startNs.length; i++) {
    if (startNs[i] < 0) note(bad, `${label(v, i)} starts at ${startNs[i]} ns, before 0`, i)
    else if (durNs[i] < 0) note(bad, `${label(v, i)} lasts ${durNs[i]} ns, a negative time`, i)
  }
  for (const mark of v.t.marks) if (mark.tNs < 0) note(bad, `the mark "${v.t.strings[mark.name]}" is at ${mark.tNs} ns, before 0`)
  let steps = 0
  let previous = Number.NEGATIVE_INFINITY
  for (const mark of v.t.marks) {
    if (v.t.strings[mark.name] !== STEP_MARK) continue
    if (mark.tNs <= previous) note(bad, `step mark ${steps} is at ${mark.tNs} ns, which is not after the step mark before it at ${previous} ns`)
    previous = mark.tNs
    steps++
  }
  return result('T2', 'Time runs forward', startNs.length + v.t.marks.length, bad, `${startNs.length} spans start at or after 0 and last a non-negative time, and ${steps} step marks strictly increase`)
}

function oneStreamOneThing(v: View): TraceCheckResult {
  const { startNs, cat, durNs } = v.t.spans
  const streams: number[][] = v.t.tracks.map(() => [])
  let checked = 0
  for (let i = 0; i < startNs.length; i++) {
    if (v.kind[i] !== 'gpu-stream' || !(durNs[i] > 0) || !(v.isKernel[cat[i]] || v.isCopy[cat[i]])) continue
    streams[v.place[i]].push(i)
    checked++
  }
  const bad = tally()
  for (const stream of streams) {
    stream.sort((a, b) => compareAsc(startNs[a], startNs[b]))
    let holder = -1
    let reach = Number.NEGATIVE_INFINITY
    for (const i of stream) {
      if (holder >= 0 && startNs[i] < reach) {
        note(bad, `${label(v, i)} starts at ${startNs[i]} ns, before ${label(v, holder)} ends at ${reach} ns on the same stream`, holder, i)
      }
      if (endOf(v, i) > reach) {
        reach = endOf(v, i)
        holder = i
      }
    }
  }
  return result('T3', 'One stream runs one thing at a time', checked, bad, `${checked} kernel and copy spans, and none overlaps another on its stream`)
}

function launchBeforeKernel(v: View): TraceCheckResult {
  const { startNs, cat, corr } = v.t.spans
  const launched = new Map<number, number>()
  for (let i = 0; i < startNs.length; i++) {
    if (v.kind[i] !== 'cuda-api' || corr[i] < 0) continue
    const known = launched.get(corr[i])
    if (known === undefined || startNs[i] < known) launched.set(corr[i], startNs[i])
  }
  const bad = tally()
  let checked = 0
  for (let i = 0; i < startNs.length; i++) {
    if (v.kind[i] !== 'gpu-stream') continue
    const kernel = v.isKernel[cat[i]]
    if (!kernel && !v.isCopy[cat[i]]) continue
    checked++
    if (corr[i] < 0) {
      if (kernel) note(bad, `${label(v, i)} has no correlation id, so no launch can be shown to precede it`, i)
      continue
    }
    const at = launched.get(corr[i])
    if (at === undefined) note(bad, `${label(v, i)} has correlation id ${corr[i]}, and no CUDA API span has it`, i)
    else if (at > startNs[i]) note(bad, `${label(v, i)} starts at ${startNs[i]} ns, before the launch with its correlation id ${corr[i]} at ${at} ns`, i)
  }
  return result('T4', 'Every kernel has a launch before it', checked, bad, `${checked} kernel and copy spans, and each has a CUDA API span with its correlation id that starts no later than it`)
}

function stepsContainKernels(v: View): TraceCheckResult {
  const windows = stepWindows(v.t)
  const { startNs, cat } = v.t.spans
  const bad = tally()
  let checked = 0
  for (let i = 0; i < startNs.length; i++) {
    if (v.kind[i] !== 'gpu-stream' || !v.isKernel[cat[i]]) continue
    checked++
    if (windows.length === 0) {
      note(bad, `${label(v, i)} is a kernel, and the trace has fewer than two step marks, so no step window holds it`, i)
      continue
    }
    // The last window that starts at or before the kernel: windows are in time order and share their edges.
    let lo = 0
    let hi = windows.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (windows[mid].fromNs <= startNs[i]) lo = mid + 1
      else hi = mid
    }
    const w = lo - 1
    if (w < 0 || startNs[i] >= windows[w].toNs) {
      note(bad, `${label(v, i)} starts at ${startNs[i]} ns, which is in no step window (the marks run from ${windows[0].fromNs} to ${windows[windows.length - 1].toNs} ns)`, i)
    } else if (endOf(v, i) > windows[w].toNs) {
      note(bad, `${label(v, i)} ends at ${endOf(v, i)} ns, past the step mark at ${windows[w].toNs} ns that closes its window`, i)
    }
  }
  return result('T5', 'Step marks contain their kernels', checked, bad, `${checked} kernels, and each lies inside one of ${windows.length} step windows`)
}

function floorsHold(v: View, floors: TraceFloors): TraceCheckResult {
  const bad = tally()
  let checked = 0
  const { stepBusyNs } = floors
  if (stepBusyNs !== undefined) {
    const steps = attributeSteps(v.t)
    if (typeof stepBusyNs !== 'number' && stepBusyNs.length !== steps.length) {
      note(bad, `${stepBusyNs.length} step floors were given for ${steps.length} step windows`)
    } else {
      steps.forEach((step, i) => {
        const floor = typeof stepBusyNs === 'number' ? stepBusyNs : stepBusyNs[i]
        if (floor === null) return
        checked++
        if (step.gpuBusyNs < floor) note(bad, `step ${i} has ${step.gpuBusyNs} ns of GPU-busy time, below its floor of ${floor} ns`)
      })
    }
  }
  if (floors.spans !== undefined) {
    const { durNs, name } = v.t.spans
    for (const { name: wanted, minNs } of floors.spans) {
      const at = v.t.strings.map((s, i) => (s === wanted ? i : -1)).filter((i) => i >= 0)
      for (let i = 0; i < durNs.length; i++) {
        if (!at.includes(name[i])) continue
        checked++
        if (durNs[i] < minNs) note(bad, `${label(v, i)} lasts ${durNs[i]} ns, below its floor of ${minNs} ns`, i)
      }
    }
  }
  return result('T9', 'Spans keep to their physics floors', checked, bad, `${checked} floors, and none is broken`)
}

/**
 * Runs the structural checks on `t`, in the order above, and returns one verdict each. A trace whose columns are inconsistent gets
 * the `structure` verdict alone, because the rest would read garbage. T9 runs only when `floors` is given.
 */
export function traceChecks(t: EsTrace, floors?: TraceFloors): readonly TraceCheckResult[] {
  const problems = validateTrace(t)
  if (problems.length > 0) {
    return [
      {
        id: 'structure',
        title: 'The columns are consistent',
        pass: false,
        detail: `${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`,
        checked: 1,
        failed: problems.length,
        spans: [],
      },
    ]
  }
  const v = view(t)
  const checks: TraceCheckResult[] = [
    { id: 'structure', title: 'The columns are consistent', pass: true, detail: `${t.spans.track.length} spans on ${t.tracks.length} tracks, ${t.flows.length} flows and ${t.marks.length} marks`, checked: 1, failed: 0, spans: [] },
    timeRunsForward(v),
    oneStreamOneThing(v),
    launchBeforeKernel(v),
    stepsContainKernels(v),
  ]
  if (floors !== undefined) checks.push(floorsHold(v, floors))
  return checks
}
