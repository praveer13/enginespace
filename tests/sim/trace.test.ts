/*
 * W1-T08's acceptance, check by check (ARCHITECTURE §5.7; ASSESSMENT T2-T7; WORLD §3.5):
 *
 *   1. On 200 seeds [estimated] of synthetic traces, GPU-busy + CPU-gap + both-idle equals every step window exactly in integer ns,
 *      and `attribute` recovers the run's own per-µs truth. The truth is counted by tests/sim/trace-support.ts from the step-loop
 *      run's two lanes, one µs at a time, with no code from packages/sim/trace. The windows are the run's own: from the end of the
 *      previous forward to the end of this one, so a window's GPU-busy is the step's `gpuUs` and its CPU-gap is the step's
 *      `bubbleUs`, the numbers The Loop shows (GAMES.md §3, "Traces"). The same holds under each jitter, and for a run cut by a horizon.
 *   2. `traceChecks` passes the synthetic traces and fails constructed defects: overlapping kernels, a launch after its kernel, a
 *      kernel outside its step mark. Each defect fails the check it breaks and no other.
 *   3. The encoding round-trips exactly.
 *
 * tests/fixtures/sim/trace.json maps inputs to the synthetic trace each gives, with the SHA-256 of its canonical JSON. It is written
 * only by `bun scripts/vectors.ts --write`. The goldens are re-run below from the input the fixture itself records, with code of
 * this file's own and not the script's registry, so the fixture is shown to be self-contained. The model's rules (the builder, the
 * reader's strictness, attribution against a per-ns oracle, the generator's structure) are in trace-model.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { between, canonicalJson, divRound, rngFor } from '../../packages/sim/core'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { RunnerPresetId } from '../../packages/sim/host'
import type { PhysicsRowKey } from '../../packages/sim/physics'
import { TICK_CARD, defaultCaptureSizes, runStepLoop, s5Card } from '../../packages/sim/steploop'
import type { S5HostTerm, StepLoopConfig, StepLoopRun } from '../../packages/sim/steploop'
import {
  CAT_KERNEL,
  CLEAN_JITTER,
  DEFAULT_JITTER,
  STEP_MARK,
  attributeSteps,
  attributeWindows,
  cloneTrace,
  decodeTrace,
  encodeTrace,
  spanView,
  stepWindows,
  traceChecks,
  traceFromJson,
  traceFromRun,
  traceToJson,
} from '../../packages/sim/trace'
import type { Attribution, EsTrace, JitterSpec } from '../../packages/sim/trace'
import { genWorkload } from '../../packages/sim/workload'
import type { WorkloadSpec } from '../../packages/sim/workload'
import { MODELS, renderFixture } from '../../scripts/vectors'
import { EAGER } from './steploop-support'
import { HUGE, ROUGH, SEEDS, TINY, busyAt, rowsWhere, runOf, runTruth } from './trace-support'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

// ---------------------------------------------------------------------------------------------------------------------------
// Check 1: the partition, and the run's truth

/** What a trace says of each of its step windows must be what the run says, one µs at a time. */
function expectRecovers(run: StepLoopRun, trace: EsTrace, ctx: string): Attribution[] {
  const truth = runTruth(run)
  const windows = stepWindows(trace)
  const attributions = attributeSteps(trace)
  expect(windows.length, `${ctx}: one window for each forward`).toBe(run.lanes['gpu-stream'].length)
  expect(attributions.length, ctx).toBe(windows.length)
  truth.forEach((t, i) => {
    const a = attributions[i]
    const c = `${ctx}, window ${i} (step ${t.step})`
    // The window is the run's: the end of the previous forward (the start of the first) to the end of this one.
    expect([windows[i].fromNs, windows[i].toNs], c).toEqual([t.fromUs * 1000, t.toUs * 1000])
    // The three parts add up to the window exactly, in integer ns.
    expect(Number.isSafeInteger(a.windowNs) && a.windowNs === a.toNs - a.fromNs, c).toBe(true)
    expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs, c).toBe(a.windowNs)
    expect(a.kernelNs + a.copyOnlyNs, c).toBe(a.gpuBusyNs)
    // And each is what the run says, to the ns.
    expect([a.gpuBusyNs, a.cpuGapNs, a.bothIdleNs, a.overlapNs], c).toEqual([t.gpuUs * 1000, t.cpuGapUs * 1000, t.bothIdleUs * 1000, t.overlapUs * 1000])
    // The Loop's own per-step numbers are the same ones.
    expect(a.gpuBusyNs, c).toBe(run.steps[t.step].gpuUs * 1000)
    expect(a.cpuGapNs, c).toBe(run.steps[t.step].bubbleUs * 1000)
  })
  return attributions
}

describe('check 1: over 200 seeds of synthetic traces', () => {
  test('GPU-busy + CPU-gap + both-idle equals every step window exactly in integer ns, and attribute recovers the run\'s own per-µs truth', () => {
    const covered = { windows: 0, gap: 0, idle: 0, overlap: 0, copyOnly: 0, graphHits: 0 }
    const worlds = new Set<string>()
    for (const seed of SEEDS) {
      const { s, run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const attributions = expectRecovers(run, trace, `seed ${seed} (${s.world}, async ${s.cfg.asyncScheduling}, graphs ${s.cfg.graphs.mode})`)
      worlds.add(`${s.world} ${s.cfg.asyncScheduling ? 'async' : 'sync'} ${s.cfg.graphs.mode}`)
      for (const a of attributions) {
        covered.windows++
        if (a.cpuGapNs > 0) covered.gap++
        if (a.bothIdleNs > 0) covered.idle++
        if (a.overlapNs > 0) covered.overlap++
        if (a.copyOnlyNs > 0) covered.copyOnly++
      }
      covered.graphHits += run.steps.filter((step) => step.graph === 'hit').length
    }
    // The seeds cover every world, both settings of overlap and both graph modes, and every kind of time shows up: the pass is not vacuous.
    expect(worlds.size).toBe(12)
    expect(covered.windows).toBeGreaterThan(10_000)
    expect(covered.gap).toBeGreaterThan(1000)
    expect(covered.idle).toBeGreaterThan(20)
    expect(covered.overlap).toBeGreaterThan(1000)
    expect(covered.copyOnly).toBe(covered.windows)
    expect(covered.graphHits).toBeGreaterThan(500)
  })

  test('holds under every jitter: none, the widest, one kernel, and two hundred', () => {
    const cases: [string, JitterSpec, readonly number[]][] = [
      ['clean', CLEAN_JITTER, SEEDS],
      ['rough', ROUGH, SEEDS],
      ['one kernel a forward', TINY, SEEDS.slice(0, 60)],
      ['two hundred kernels a forward', HUGE, SEEDS.slice(0, 6)],
    ]
    for (const [name, jitter, seeds] of cases) {
      for (const seed of seeds) {
        const { run } = runOf(seed)
        expectRecovers(run, traceFromRun(run, seed, jitter), `${name}, seed ${seed}`)
      }
    }
  })

  test('holds for a run cut by its horizon, where the last spans are cut and a step whose forward is cut away has no window', () => {
    let cutForward = 0
    for (const seed of SEEDS) {
      const whole = runOf(seed).run
      const rng = rngFor(seed, 'test/trace/cut')
      const horizonUs = Math.max(1, divRound(whole.summary.clockUs * between(rng, 10, 120), 100))
      const { run } = runOf(seed, horizonUs)
      expectRecovers(run, traceFromRun(run, seed), `seed ${seed} cut at ${horizonUs} µs`)
      if (run.steps.length > run.lanes['gpu-stream'].length) cutForward++
    }
    expect(cutForward).toBeGreaterThan(10)
  })

  test('recovers the truth of every single µs it is asked about, whatever the window: the first 64 µs of the run, 64 drawn ones and the last', () => {
    for (const seed of SEEDS) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const clock = run.summary.clockUs
      const rng = rngFor(seed, 'test/trace/micros')
      const at = [...Array.from({ length: Math.min(64, clock) }, (_, u) => u), ...Array.from({ length: 64 }, () => between(rng, 0, clock - 1)), clock - 1]
      const asked = attributeWindows(trace, at.map((u) => ({ fromNs: u * 1000, toNs: (u + 1) * 1000 })))
      at.forEach((u, i) => {
        const { gpu, cpu } = busyAt(run, u)
        const a = asked[i]
        const c = `seed ${seed}, µs ${u}`
        // A µs is whole one thing: the GPU is busy, or it is idle while the main thread is busy, or both are idle.
        expect(a.gpuBusyNs, c).toBe(gpu ? 1000 : 0)
        expect(a.cpuGapNs, c).toBe(!gpu && cpu ? 1000 : 0)
        expect(a.bothIdleNs, c).toBe(!gpu && !cpu ? 1000 : 0)
        expect(a.overlapNs, c).toBe(gpu && cpu ? 1000 : 0)
      })
    }
  })

  test('summed over a whole run, the windows are the counters The Loop shows: GPU busy time and bubble µs', () => {
    for (const seed of SEEDS) {
      const { run } = runOf(seed)
      const attributions = attributeSteps(traceFromRun(run, seed))
      const sum = (pick: (a: Attribution) => number) => attributions.reduce((total, a) => total + pick(a), 0)
      expect(sum((a) => a.gpuBusyNs), `seed ${seed}`).toBe(run.summary.gpuBusyUs * 1000)
      expect(sum((a) => a.cpuGapNs), `seed ${seed}`).toBe(run.summary.bubbleUs * 1000)
    }
  })

  test('the segments of a window follow each other from its start to its end, and the gaps are its idle runs', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const { run } = runOf(seed)
      for (const a of attributeSteps(traceFromRun(run, seed))) {
        const c = `seed ${seed}, window [${a.fromNs}, ${a.toNs})`
        expect(a.segments[0].fromNs, c).toBe(a.fromNs)
        expect(a.segments[a.segments.length - 1].toNs, c).toBe(a.toNs)
        const totals = { kernel: 0, copy: 0, 'cpu-gap': 0, 'both-idle': 0 }
        a.segments.forEach((segment, i) => {
          expect(segment.toNs > segment.fromNs, c).toBe(true)
          if (i > 0) {
            expect(segment.fromNs, c).toBe(a.segments[i - 1].toNs)
            expect(segment.category, `${c}: maximal runs`).not.toBe(a.segments[i - 1].category)
          }
          totals[segment.category] += segment.toNs - segment.fromNs
        })
        expect([totals.kernel, totals.copy, totals['cpu-gap'], totals['both-idle']], c).toEqual([a.kernelNs, a.copyOnlyNs, a.cpuGapNs, a.bothIdleNs])
        // A gap is a run of idle segments: its parts are its length, and together the gaps hold every idle ns of the window.
        for (const gap of a.gaps) expect(gap.cpuGapNs + gap.bothIdleNs, c).toBe(gap.toNs - gap.fromNs)
        expect(a.gaps.reduce((total, gap) => total + gap.cpuGapNs, 0), c).toBe(a.cpuGapNs)
        expect(a.gaps.reduce((total, gap) => total + gap.bothIdleNs, 0), c).toBe(a.bothIdleNs)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Check 2: structural checks

const passing = (t: EsTrace) => traceChecks(t).filter((c) => !c.pass)
const failing = (t: EsTrace) => traceChecks(t).filter((c) => !c.pass).map((c) => c.id)

/** The first seed whose run satisfies `wanted`, as a base for a defect. */
function base(wanted: (run: StepLoopRun, world: string) => boolean): { seed: number; run: StepLoopRun; trace: EsTrace } {
  for (const seed of SEEDS) {
    const { s, run } = runOf(seed)
    if (wanted(run, s.world)) return { seed, run, trace: traceFromRun(run, seed) }
  }
  throw new Error('no seed gives the base a defect needs')
}

describe('check 2: traceChecks passes synthetic traces', () => {
  test('passes the traces of 200 seeds under every jitter, with a verdict for each of the five checks', () => {
    const jitters = [DEFAULT_JITTER, CLEAN_JITTER, ROUGH]
    for (const seed of SEEDS) {
      const { run } = runOf(seed)
      for (const jitter of jitters) {
        const checks = traceChecks(traceFromRun(run, seed, jitter))
        expect(checks.map((c) => c.id), `seed ${seed}`).toEqual(['structure', 'T2', 'T3', 'T4', 'T5'])
        expect(checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.detail}`), `seed ${seed}`).toEqual([])
        for (const c of checks) {
          expect(c.failed).toBe(0)
          expect(c.spans).toEqual([])
          expect(c.checked).toBeGreaterThan(0)
        }
      }
    }
  })

  test('says what it looked at: the count of kernels and copies, and of step windows', () => {
    const { trace } = base((run) => run.steps.length >= 6)
    const [structure, t2, t3, t4, t5] = traceChecks(trace)
    const gpu = rowsWhere(trace, (v) => v.kind === 'gpu-stream').length
    const kernels = rowsWhere(trace, (v) => v.kind === 'gpu-stream' && v.cat === CAT_KERNEL).length
    expect(structure.detail).toContain(`${trace.spans.track.length} spans`)
    expect(t2.checked).toBe(trace.spans.track.length + trace.marks.length)
    expect([t3.checked, t4.checked]).toEqual([gpu, gpu])
    expect(t5.checked).toBe(kernels)
    expect(t5.detail).toContain(`${stepWindows(trace).length} step windows`)
  })
})

describe('check 2: traceChecks fails constructed defects, and only the check each breaks', () => {
  // A run on the 70B card with eager launches, so that each kernel has a launch call of its own.
  const eager = base((run, world) => world !== 'tick' && run.steps.length >= 12 && run.steps.slice(0, 8).every((step) => step.graph === 'off'))
  const kernelsOf = (t: EsTrace) => rowsWhere(t, (v) => v.kind === 'gpu-stream' && v.cat === CAT_KERNEL)
  const launchOf = (t: EsTrace, kernel: number) => rowsWhere(t, (v) => v.kind === 'cuda-api' && v.cat === 'launch' && v.corr === spanView(t, kernel).corr)

  test('the base passes, and has a launch call of its own for each of its first kernels', () => {
    expect(passing(eager.trace)).toEqual([])
    const kernels = kernelsOf(eager.trace)
    expect(kernels.length).toBeGreaterThan(24 * 8)
    for (const kernel of kernels.slice(0, 48)) expect(launchOf(eager.trace, kernel)).toHaveLength(1)
  })

  test('overlapping kernels fail T3: one kernel run on into the next on its stream', () => {
    const kernels = kernelsOf(eager.trace)
    const [first, next] = [kernels[10], kernels[11]]
    const x = cloneTrace(eager.trace)
    x.spans.durNs[first] += Math.floor(x.spans.durNs[next] / 2)
    expect(failing(x)).toEqual(['T3'])
    const verdict = traceChecks(x).find((c) => c.id === 'T3')!
    expect(verdict.spans).toEqual([first, next])
    expect(verdict.detail).toContain(`span ${next} (`)
    expect(verdict.detail).toContain(`starts at ${x.spans.startNs[next]} ns, before span ${first} (`)
    expect(verdict.detail).toContain(`) ends at ${x.spans.startNs[first] + x.spans.durNs[first]} ns on the same stream`)
  })

  test('one nanosecond of overlap fails T3, and a copy that overlaps a kernel does too', () => {
    const kernels = kernelsOf(eager.trace)
    const x = cloneTrace(eager.trace)
    x.spans.startNs[kernels[5]] -= 1
    x.spans.durNs[kernels[5]] += 1
    expect(failing(x)).toEqual(['T3'])

    // A copy that brings the inputs in runs on into the first kernel.
    const copy = rowsWhere(eager.trace, (v) => v.kind === 'gpu-stream' && v.name === 'memcpy HtoD')[2]
    const y = cloneTrace(eager.trace)
    y.spans.durNs[copy] += 2
    expect(failing(y)).toEqual(['T3'])
  })

  test('a launch after its kernel fails T4: the launch call moved to just after the kernel starts', () => {
    const kernel = kernelsOf(eager.trace)[7]
    const [launch] = launchOf(eager.trace, kernel)
    const x = cloneTrace(eager.trace)
    x.spans.startNs[launch] = x.spans.startNs[kernel] + 1
    expect(failing(x)).toEqual(['T4'])
    const verdict = traceChecks(x).find((c) => c.id === 'T4')!
    expect(verdict.failed).toBe(1)
    expect(verdict.spans).toEqual([kernel])
    expect(verdict.detail).toContain(`before the launch with its correlation id ${spanView(x, kernel).corr} at ${x.spans.startNs[launch]} ns`)
  })

  test('a kernel with no launch fails T4: its id is on no call, it has no id, or every call is moved by a clock shift', () => {
    const kernel = kernelsOf(eager.trace)[9]
    const unknown = cloneTrace(eager.trace)
    unknown.spans.corr[kernel] = 999_999
    expect(failing(unknown)).toEqual(['T4'])
    expect(traceChecks(unknown).find((c) => c.id === 'T4')!.detail).toContain('no CUDA API span has it')

    const none = cloneTrace(eager.trace)
    none.spans.corr[kernel] = -1
    expect(failing(none)).toEqual(['T4'])
    expect(traceChecks(none).find((c) => c.id === 'T4')!.detail).toContain('has no correlation id')

    // Every CUDA API call a millisecond late, as when the CPU clock is not the GPU's: every launch is after its kernel.
    const shifted = cloneTrace(eager.trace)
    for (const api of rowsWhere(shifted, (v) => v.kind === 'cuda-api')) shifted.spans.startNs[api] += 1_000_000_000
    expect(failing(shifted)).toEqual(['T4'])
    expect(traceChecks(shifted).find((c) => c.id === 'T4')!.failed).toBeGreaterThan(100)
  })

  test('a kernel outside its step mark fails T5: past the last mark, across a mark, or with no marks at all', () => {
    const marks = eager.trace.marks
    const kernels = kernelsOf(eager.trace)

    const last = kernels[kernels.length - 1]
    const beyond = cloneTrace(eager.trace)
    beyond.spans.startNs[last] = marks[marks.length - 1].tNs + 1000
    expect(failing(beyond)).toEqual(['T5'])
    expect(traceChecks(beyond).find((c) => c.id === 'T5')!.detail).toContain('is in no step window')

    // The mark that closes the first window moved back into the middle of its fifth kernel.
    const crossing = { ...cloneTrace(eager.trace), marks: marks.map((m, i) => (i === 1 ? { ...m, tNs: eager.trace.spans.startNs[kernels[4]] + 1 } : m)) }
    expect(failing(crossing)).toEqual(['T5'])
    const verdict = traceChecks(crossing).find((c) => c.id === 'T5')!
    expect(verdict.spans).toEqual([kernels[4]])
    expect(verdict.detail).toContain(`past the step mark at ${eager.trace.spans.startNs[kernels[4]] + 1} ns that closes its window`)

    const bare = { ...cloneTrace(eager.trace), marks: [] }
    expect(failing(bare)).toEqual(['T5'])
    expect(traceChecks(bare).find((c) => c.id === 'T5')!.detail).toContain('fewer than two step marks')
  })

  test('marks of another name bound nothing: renaming the step marks leaves no windows, and a mark named otherwise adds none', () => {
    const t = eager.trace
    const renamed = { ...cloneTrace(t), strings: t.strings.map((s) => (s === STEP_MARK ? 'iteration' : s)) }
    expect(stepWindows(renamed)).toEqual([])
    expect(failing(renamed)).toEqual(['T5'])
    const withNvtx = { ...cloneTrace(t), strings: [...t.strings, 'nvtx range'], marks: [...t.marks, { tNs: 1, name: t.strings.length }] }
    expect(stepWindows(withNvtx)).toEqual(stepWindows(t))
    expect(failing(withNvtx)).toEqual([])
  })

  test('time running backwards fails T2: a negative duration, a start before 0, step marks that do not increase, a mark before 0', () => {
    const frame = rowsWhere(eager.trace, (v) => v.kind === 'cpu-thread')[4]
    const negative = cloneTrace(eager.trace)
    negative.spans.durNs[frame] = -5
    expect(failing(negative)).toEqual(['T2'])
    expect(traceChecks(negative).find((c) => c.id === 'T2')!.detail).toContain(`span ${frame} (${spanView(negative, frame).name}) lasts -5 ns`)

    const early = cloneTrace(eager.trace)
    early.spans.startNs[frame] = -1
    expect(failing(early)).toEqual(['T2'])
    expect(traceChecks(early).find((c) => c.id === 'T2')!.detail).toContain('starts at -1 ns, before 0')

    const marks = eager.trace.marks.map((m) => ({ ...m }))
    marks[2] = { ...marks[2], tNs: marks[1].tNs }
    const flat = { ...cloneTrace(eager.trace), marks }
    expect(failing(flat)).toEqual(['T2'])
    expect(traceChecks(flat).find((c) => c.id === 'T2')!.detail).toContain('is not after the step mark before it')

    const swapped = { ...cloneTrace(eager.trace), marks: eager.trace.marks.map((m, i) => (i === 1 ? eager.trace.marks[2] : i === 2 ? eager.trace.marks[1] : m)) }
    expect(failing(swapped)).toContain('T2')

    const before = { ...cloneTrace(eager.trace), marks: [{ tNs: -3, name: eager.trace.marks[0].name }, ...eager.trace.marks] }
    expect(failing(before)).toContain('T2')
  })

  test('columns that disagree fail alone as `structure`, because the rest would read garbage', () => {
    const t = eager.trace
    const short = { ...cloneTrace(t), spans: { ...cloneTrace(t).spans, corr: t.spans.corr.slice(1) } }
    const checks = traceChecks(short)
    expect(checks.map((c) => [c.id, c.pass])).toEqual([['structure', false]])
    expect(checks[0].detail).toContain('spans.corr has')
    const out = { ...cloneTrace(t), spans: { ...cloneTrace(t).spans, name: Int32Array.from(t.spans.name, () => 9999) } }
    expect(traceChecks(out).map((c) => c.id)).toEqual(['structure'])
  })

  test('every defect is reported with its first offender and a count of the rest', () => {
    const x = cloneTrace(eager.trace)
    for (const api of rowsWhere(x, (v) => v.kind === 'cuda-api')) x.spans.startNs[api] += 1_000_000_000
    const verdict = traceChecks(x).find((c) => c.id === 'T4')!
    expect(verdict.detail).toMatch(/^span \d+ \(.+\) starts at \d+ ns, before the launch with its correlation id \d+ at \d+ ns \(and \d+ more\)$/)
    expect(verdict.spans.length).toBe(8)
    expect(new Set(verdict.spans).size).toBe(8)
  })

  test('the floors fail a step that beats its GPU-busy floor and a span that beats its own, and print the bound', () => {
    const t = eager.trace
    const steps = attributeSteps(t)
    // A floor each window meets exactly passes; one ns more fails the first window it is not met in, and says so.
    expect(traceChecks(t, { stepBusyNs: Math.min(...steps.map((a) => a.gpuBusyNs)) }).filter((c) => !c.pass)).toEqual([])
    const high = traceChecks(t, { stepBusyNs: steps.map((a) => a.gpuBusyNs + 1) }).find((c) => c.id === 'T9')!
    expect(high.pass).toBe(false)
    expect(high.failed).toBe(steps.length)
    expect(high.detail).toContain(`step 0 has ${steps[0].gpuBusyNs} ns of GPU-busy time, below its floor of ${steps[0].gpuBusyNs + 1} ns`)
    // A step with no floor, such as a prefill, is skipped.
    const some = traceChecks(t, { stepBusyNs: steps.map((a, i) => (i === 2 ? a.gpuBusyNs + 1 : null)) }).find((c) => c.id === 'T9')!
    expect([some.checked, some.failed]).toEqual([1, 1])
    // The wrong number of floors is a failure.
    expect(traceChecks(t, { stepBusyNs: [1, 2] }).find((c) => c.id === 'T9')!.detail).toContain(`2 step floors were given for ${steps.length} step windows`)

    const attention = rowsWhere(t, (v) => v.name === 'attention' && v.kind === 'gpu-stream')
    const shortest = Math.min(...attention.map((i) => t.spans.durNs[i]))
    expect(traceChecks(t, { spans: [{ name: 'attention', minNs: shortest }] }).every((c) => c.pass)).toBe(true)
    const spans = traceChecks(t, { spans: [{ name: 'attention', minNs: shortest + 1 }] }).find((c) => c.id === 'T9')!
    expect(spans.pass).toBe(false)
    expect(spans.checked).toBe(attention.length)
    expect(spans.detail).toMatch(/lasts \d+ ns, below its floor of \d+ ns/)
    // With no floors given there is no T9 at all.
    expect(traceChecks(t).some((c) => c.id === 'T9')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Check 3: the encoding

describe('check 3: the encoding round-trips exactly', () => {
  test('decode(encode(t)) is t for 200 seeds, column type for column type, and encode(decode(s)) is s', () => {
    // Six kernels a forward keeps the texts short: the codec is what is under test, and the generator's size is not.
    const small: JitterSpec = { ...DEFAULT_JITTER, kernelsPerForward: 6 }
    for (const seed of SEEDS.slice(0, 120)) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed, seed % 3 === 0 ? { ...ROUGH, kernelsPerForward: 6 } : small)
      const text = encodeTrace(trace)
      const back = decodeTrace(text)
      expect(back, `seed ${seed}`).toStrictEqual(trace)
      expect(back.spans.startNs).toBeInstanceOf(Float64Array)
      expect(back.spans.track).toBeInstanceOf(Int32Array)
      expect(encodeTrace(back), `seed ${seed}`).toBe(text)
      // The JSON form reads the same, and so does text that is not canonical.
      expect(traceFromJson(traceToJson(trace)), `seed ${seed}`).toStrictEqual(trace)
      expect(decodeTrace(JSON.stringify(JSON.parse(text), null, 2)), `seed ${seed}`).toStrictEqual(trace)
    }
  })

  test('the remaining seeds round-trip too, cut runs and all', () => {
    for (const seed of SEEDS.slice(120)) {
      const whole = runOf(seed).run
      const { run } = runOf(seed, Math.max(1, divRound(whole.summary.clockUs * (30 + (seed % 70)), 100)))
      const trace = traceFromRun(run, seed, { ...DEFAULT_JITTER, kernelsPerForward: 6 })
      expect(decodeTrace(encodeTrace(trace)), `seed ${seed}`).toStrictEqual(trace)
    }
    // And a trace of the default size.
    const trace = traceFromRun(runOf(2).run, 2)
    expect(decodeTrace(encodeTrace(trace))).toStrictEqual(trace)
  })

  test('the text is canonical, so its SHA-256 is the trace\'s: the same run, seed and jitter give the same hash, another seed another', () => {
    const { run } = runOf(7)
    const hash = (seed: number, jitter: JitterSpec = DEFAULT_JITTER) => sha256(encodeTrace(traceFromRun(run, seed, jitter)))
    expect(hash(7)).toBe(hash(7))
    expect(hash(7)).not.toBe(hash(8))
    expect(hash(7)).not.toBe(hash(7, ROUGH))
    expect(encodeTrace(traceFromRun(run, 7))).toBe(canonicalJson(traceToJson(traceFromRun(run, 7))))
  })

  test('survives the values a real capture has: times near 2^53, ids near 2^31, awkward strings, every meta field', () => {
    const t: EsTrace = {
      schema: 'enginespace/trace@1',
      meta: { source: 'owner', synthetic: false, engine: 'vLLM', version: 'v0.33.0', gpu: 'NVIDIA GeForce RTX 4090', capturedAt: '2026-11-03T12:34:56Z', sha256: 'ab'.repeat(32) },
      strings: ['main', 'cuda', 'stream 7', 'sync', 'é', '😀 emoji', '', 'kernel', 'step', '"quoted" \\ back\nslash\ttab \u0007 bell'],
      tracks: [
        { id: 0, kind: 'cpu-thread', name: 0 },
        { id: 5, kind: 'cuda-api', name: 1 },
        { id: 9, kind: 'gpu-stream', name: 2 },
        { id: 2147483647, kind: 'marker', name: 4 },
      ],
      spans: {
        track: Int32Array.from([0, 5, 9, 2147483647]),
        startNs: Float64Array.from([0, 9007199254740990, 12, 1]),
        durNs: Float64Array.from([9007199254740991, 1, 0, 0]),
        name: Int32Array.from([0, 3, 5, 9]),
        cat: Int32Array.from([6, 3, 7, 4]),
        corr: Int32Array.from([-1, 2147483647, 0, 1]),
      },
      flows: [
        { from: 1, to: 2, kind: 'launch' },
        { from: 2, to: 1, kind: 'sync' },
        { from: 3, to: 3, kind: 'copy' },
      ],
      marks: [
        { tNs: 0, name: 8 },
        { tNs: 9007199254740991, name: 8 },
      ],
    }
    expect(traceChecks(t)[0].pass).toBe(true)
    const text = encodeTrace(t)
    expect(decodeTrace(text)).toStrictEqual(t)
    expect(encodeTrace(decodeTrace(text))).toBe(text)
    // Keys are sorted: the canonical form (core/json).
    expect(text.startsWith('{"flows":[{"from":1,"kind":"launch","to":2}')).toBe(true)
  })

  test('survives a trace with nothing in it, and one with spans and nothing else', () => {
    const empty: EsTrace = {
      schema: 'enginespace/trace@1',
      meta: { source: 'learner', synthetic: false },
      strings: [],
      tracks: [],
      spans: { track: new Int32Array(0), startNs: new Float64Array(0), durNs: new Float64Array(0), name: new Int32Array(0), cat: new Int32Array(0), corr: new Int32Array(0) },
      flows: [],
      marks: [],
    }
    expect(decodeTrace(encodeTrace(empty))).toStrictEqual(empty)
    expect(encodeTrace(empty)).toBe('{"flows":[],"marks":[],"meta":{"source":"learner","synthetic":false},"schema":"enginespace/trace@1","spans":{"cat":[],"corr":[],"durNs":[],"name":[],"startNs":[],"track":[]},"strings":[],"tracks":[]}')
    expect(traceChecks(empty).map((c) => c.pass)).toEqual([true, true, true, true, true])
    expect(attributeSteps(empty)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The goldens

interface FixtureInput {
  run: {
    workload: { fn: 'genWorkload'; seed: number; spec: WorkloadSpec }
    config: Omit<StepLoopConfig, 'graphs'> & { graphs: { mode: 'NONE' } | { mode: 'FULL'; captureSizes: { defaultMax: number } } }
    host: 'tick' | RunnerPresetId
    gpu: { card: 'tick' } | { card: 's5'; row: PhysicsRowKey; tp: number; hostTerm: S5HostTerm }
    horizonUs: number
  }
  seed: number
  jitter: JitterSpec
  output: 'full' | 'digest'
}
interface FixtureVector {
  name: string
  input: FixtureInput
  sha256: string
  output: Record<string, unknown>
}
const fixturePath = path.join(root, 'tests/fixtures/sim/trace.json')
const fixtureText = readFileSync(fixturePath, 'utf8')
const fixture = JSON.parse(fixtureText) as { header: string; model: string; vectors: FixtureVector[] }

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function recorded(input: FixtureInput): unknown {
  const { run: r } = input
  const workload = genWorkload(r.workload.seed, r.workload.spec)
  const cfg: StepLoopConfig = {
    ...r.config,
    graphs: r.config.graphs.mode === 'NONE' ? EAGER : { mode: 'FULL', captureSizes: defaultCaptureSizes(r.config.graphs.captureSizes.defaultMax) },
  }
  const host = r.host === 'tick' ? TICK_CARD : HOST_PRESETS[r.host].card
  const gpu = r.gpu.card === 'tick' ? TICK_CARD : s5Card(r.gpu.row, r.gpu.tp, r.gpu.hostTerm)
  const run = runStepLoop(workload, cfg, host, gpu, { horizonUs: r.horizonUs })
  const trace = traceFromRun(run, input.seed, input.jitter)
  const windows = attributeSteps(trace)
  const checks = traceChecks(trace)
  if (input.output === 'full') return { trace: traceToJson(trace), checks, windows }
  const sum = (pick: (a: Attribution) => number) => windows.reduce((total, a) => total + pick(a), 0)
  return {
    counts: { spans: trace.spans.track.length, strings: trace.strings.length, tracks: trace.tracks.length, flows: trace.flows.length, marks: trace.marks.length },
    sha256: sha256(encodeTrace(trace)),
    checks: checks.map(({ id, pass, checked }) => ({ id, pass, checked })),
    totals: {
      windows: windows.length,
      windowNs: sum((a) => a.windowNs),
      gpuBusyNs: sum((a) => a.gpuBusyNs),
      kernelNs: sum((a) => a.kernelNs),
      copyOnlyNs: sum((a) => a.copyOnlyNs),
      cpuGapNs: sum((a) => a.cpuGapNs),
      bothIdleNs: sum((a) => a.bothIdleNs),
      overlapNs: sum((a) => a.overlapNs),
    },
    first: windows.slice(0, 2),
  }
}

describe('the goldens (tests/fixtures/sim/trace.json)', () => {
  test('hold nine vectors, each named once, whose inputs the fixture records in full', () => {
    expect(fixture.model).toBe('trace')
    expect(fixture.vectors).toHaveLength(9)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(9)
    for (const v of fixture.vectors) expect(Object.keys(v.input).sort(), v.name).toEqual(['jitter', 'output', 'run', 'seed'])
    // Two short traces are recorded whole, with their checks and windows. The rest are recorded as counts, a hash and totals.
    expect(fixture.vectors.filter((v) => v.input.output === 'full')).toHaveLength(2)
    for (const v of fixture.vectors) {
      expect(Object.keys(v.output).sort(), v.name).toEqual(v.input.output === 'full' ? ['checks', 'trace', 'windows'] : ['checks', 'counts', 'first', 'sha256', 'totals'])
    }
  })

  test('reproduce byte for byte: each vector\'s input gives a trace whose recorded form is the fixture\'s output, with the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(recorded(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'trace')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    for (const [i, c] of model.cases(root).entries()) expect(canonicalJson(c.input), c.name).toBe(canonicalJson(fixture.vectors[i].input))
    expect(fixtureText).toBe(renderFixture(model, root))
  })

  test('would catch a changed output: one kernel moved by 1 ns gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors.find((v) => v.input.output === 'full')!
    const moved = structuredClone(vector.output) as { trace: { spans: { startNs: number[] } } }
    moved.trace.spans.startNs[7] += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
  })

  test('record the checks passing, and the partition adding up in every vector', () => {
    for (const v of fixture.vectors) {
      const checks = v.output.checks as { id: string; pass: boolean }[]
      expect(checks.every((c) => c.pass), v.name).toBe(true)
      expect(checks.map((c) => c.id), v.name).toEqual(['structure', 'T2', 'T3', 'T4', 'T5'])
      const windows = (v.input.output === 'full' ? v.output.windows : v.output.first) as Attribution[]
      for (const a of windows) expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs, v.name).toBe(a.windowNs)
      if (v.input.output === 'digest') {
        const t = v.output.totals as Record<string, number>
        expect(t.gpuBusyNs + t.cpuGapNs + t.bothIdleNs, v.name).toBe(t.windowNs)
      }
    }
  })
})

describe('what the recorded runs show', () => {
  test('a short trace is a short read: every window of the practice seed without overlap is the 3 ticks the GPU waits plus its forward', () => {
    const vector = fixture.vectors.find((v) => v.input.output === 'full' && !v.input.run.config.asyncScheduling)!
    const windows = vector.output.windows as Attribution[]
    // The first window is the first forward alone; every later one is the 3-tick wait (1 reading, 2 planning), then the forward: 7 ticks, or 8 with an admission.
    expect(windows[0].cpuGapNs).toBe(0)
    for (const a of windows.slice(1)) {
      expect(a.cpuGapNs).toBe(3000)
      expect(a.bothIdleNs).toBe(0)
      expect([7000, 8000]).toContain(a.windowNs)
    }
  })

  test('with overlap the forwards run back to back, and no window has a gap', () => {
    const vector = fixture.vectors.find((v) => v.input.output === 'full' && v.input.run.config.asyncScheduling)!
    for (const a of vector.output.windows as Attribution[]) {
      expect([a.cpuGapNs, a.bothIdleNs]).toEqual([0, 0])
      expect(a.gaps).toEqual([])
      expect(a.gpuBusyNs).toBe(a.windowNs)
    }
  })

  test('the sparse run holds both-idle time, which the engine spent waiting for a request and which nobody caused', () => {
    const vector = fixture.vectors.find((v) => v.name.includes('idles between requests'))!
    const totals = vector.output.totals as Record<string, number>
    expect(totals.bothIdleNs).toBeGreaterThan(0)
    expect(totals.cpuGapNs).toBeGreaterThan(0)
  })

})
