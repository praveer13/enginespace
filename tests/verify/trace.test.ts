/*
 * W2-T08, rule 8 for a trace (ARCHITECTURE §8.5 rule 8, §5.7; ASSESSMENT §6.1 and §6.3): T1 to T8, T10 and X4, each passed by the honest trace and
 * failed by the smallest edit that breaks it, with the bound in the check's sentence. T9, the floor of a step, is rule 9's (floors.test.ts).
 *
 * The trace fixture is a `tr3.profile.s5` receipt, a stage that asks only that what the receipt captured is consistent, so every check that its
 * evidence supports runs. An edit re-signs the artifact, as a forger who changes the trace and writes its new hash into the receipt would.
 */
import { describe, expect, test } from 'bun:test'
import { edited, traceFixture, FIXTURES_GRADER, SERVING } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, failed, verify } from './run'

interface TraceData {
  meta: Record<string, unknown>
  strings: string[]
  tracks: { id: number; kind: string; name: number }[]
  spans: { track: number[]; startNs: number[]; durNs: number[]; name: number[]; cat: number[]; corr: number[] }
  marks: { tNs: number; name: number }[]
}
const traceOf = (bundle: Fixture['bundle'], id = 'trace'): TraceData => {
  const artifact = bundle.artifacts[id]
  if (artifact.encoding !== 'json') throw new Error('a trace is JSON')
  return artifact.data as TraceData
}
const run = async (fixture: Fixture) => verify(fixture.bundle, fixture.context)
const withTrace = (change: (trace: TraceData, bundle: Fixture['bundle']) => void) => edited(traceFixture(), (bundle) => change(traceOf(bundle), bundle))
const claimOf = (bundle: Fixture['bundle']): { windows: Record<string, number>[] } => bundle.receipt.performance?.claimed.trace as { windows: Record<string, number>[] }

/** The index of the first span on a track of this kind with this category. */
const firstSpan = (trace: TraceData, kind: string, category: string): number => {
  const tracks = new Set(trace.tracks.filter((track) => track.kind === kind).map((track) => track.id))
  return trace.spans.track.findIndex((track, i) => tracks.has(track) && trace.strings[trace.spans.cat[i]] === category)
}

describe('the honest trace', () => {
  test('passes every check its evidence supports, and each prints what it found', async () => {
    const outcome = await run(traceFixture())
    expect(failed(outcome)).toEqual([])
    expect(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'X4', 'P1'].map((id) => checkOf(outcome, id)?.status)).toEqual(Array(10).fill('pass'))
    expect(checkOf(outcome, 'T2')?.bound).toMatch(/^Time runs forward: \d+ spans start at or after 0 and last a non-negative time, and 14 step marks strictly increase\.$/)
    expect(checkOf(outcome, 'T6')?.bound).toBe("The trace has 13 step windows, and the challenge's seed asks for 13 (a count from 13 to 13).")
    // One trace is not a pair, so the pair check has nothing to look at and is left out.
    expect(checkOf(outcome, 'T10')).toBeUndefined()
  })
})

describe('T1, the trace reads, names its origin, and is no made-up capture', () => {
  test('fails a trace that does not name its engine, version, GPU or capture time, and lists what is missing', async () => {
    const outcome = await run(withTrace((trace) => (delete trace.meta.engine, delete trace.meta.capturedAt)))
    expect(checkOf(outcome, 'T1')?.bound).toBe('It does not name its engine, capturedAt.')
  })

  test('fails a trace that says it is synthetic when the grader is no fixtures build: a made-up trace is not a capture of a run', async () => {
    const fixture = traceFixture()
    const real = { ...fixture.context, graders: [{ ...FIXTURES_GRADER, synthetic: false }] }
    const outcome = await verify(fixture.bundle, real)
    expect(checkOf(outcome, 'T1')?.status).toBe('fail')
    expect(checkOf(outcome, 'T1')?.bound).toBe('It says it is synthetic, and a made-up trace is not a capture of a run.')
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })

  test("fails a trace that says it is one of the owner's reference traces: a learner's receipt does not carry those", async () => {
    const outcome = await run(withTrace((trace) => ((trace.meta.source = 'owner'), (trace.meta.synthetic = false))))
    expect(checkOf(outcome, 'T1')?.bound).toBe("It says it is one of the owner's reference traces, which a learner's receipt cannot carry.")
  })

  test('fails a trace that does not read as trace@1, with the first problem named: every other check of it fails the same way', async () => {
    const outcome = await run(withTrace((trace) => trace.spans.durNs.pop()))
    expect(checkOf(outcome, 'T1')?.bound).toMatch(/^The trace could not be read: trace@1: \$\.spans\.durNs: \d+ rows, where \$\.spans\.track has \d+\.$/)
    expect(failed(outcome)).toEqual(expect.arrayContaining(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'X4', 'P1']))
  })
})

describe('a check over nothing is not a pass (the review of W2\'s grader track)', () => {
  /** The honest trace with no span at all: the columns, the flows that point into them, and the marks are left, or taken away. */
  const noSpans = (marks: boolean) =>
    withTrace((trace) => {
      for (const column of Object.values(trace.spans)) column.length = 0
      ;(trace as unknown as { flows: unknown[] }).flows.length = 0
      if (!marks) trace.marks = []
    })
  /** The honest trace with its spans and without step marks: no window to hold them. */
  const noWindows = () => withTrace((trace) => (trace.marks = []))
  const NEEDS_SPANS = ['T2', 'T3', 'T4', 'T5', 'T7', 'T8']

  test.each([
    ['a trace with no span, and the step marks that bound its windows', () => noSpans(true)],
    ['a trace with no span and no mark', () => noSpans(false)],
  ])('%s fails each check that reads spans, and says there is no span', async (_name, make) => {
    const outcome = await run(make())
    for (const id of NEEDS_SPANS) {
      expect([id, checkOf(outcome, id)?.status]).toEqual([id, 'fail'])
      expect(checkOf(outcome, id)?.bound).toBe(`The trace has no span, so ${id} has nothing to check: a capture of no work is no capture.`)
    }
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })

  test('a trace with spans and no step window fails them as well, and says there is no window', async () => {
    const outcome = await run(noWindows())
    for (const id of NEEDS_SPANS) {
      expect([id, checkOf(outcome, id)?.status]).toEqual([id, 'fail'])
      expect(checkOf(outcome, id)?.bound).toBe(`The trace has no step window (it needs two marks named step), so ${id} has no step to check.`)
    }
  })

  test('leaves T1, T6 and X4 to say what they say of it: the meta is read, the count of windows is not the declared one, and the GPU is named', async () => {
    const outcome = await run(noSpans(true))
    expect(checkOf(outcome, 'T1')?.status).toBe('pass')
    expect(checkOf(outcome, 'X4')?.status).toBe('pass')
    expect(checkOf(outcome, 'T6')?.bound).toMatch(/^The trace has 13 step windows, and the challenge's seed asks for 13/)
    const none = await run(noWindows())
    expect(checkOf(none, 'T6')?.status).toBe('fail')
    expect(checkOf(none, 'T6')?.bound).toMatch(/^The trace has 0 step windows, and the challenge's seed asks for 13/)
  })

  test('holds a trace of a pair to it one by one: the empty second trace fails and the first trace\'s own failure is not lost', async () => {
    const pair = edited(traceFixture(), (bundle) => {
      const first = traceOf(bundle)
      first.spans.startNs[0] = -5
      const second = JSON.parse(JSON.stringify(first)) as TraceData
      for (const column of Object.values(second.spans)) column.length = 0
      ;(second as unknown as { flows: unknown[] }).flows.length = 0
      const entry = bundle.receipt.artifacts[0]
      bundle.receipt.artifacts.push({ ...entry, id: 'trace-b' })
      bundle.artifacts['trace-b'] = { encoding: 'json', data: second }
      bundle.receipt.performance = { kind: 'pair', claimed: { trace: claimOf(bundle), 'trace-b': claimOf(bundle) } }
    })
    const outcome = await run(pair)
    expect(checkOf(outcome, 'T2')?.bound).toContain('trace: Time runs forward: span 0')
    expect(checkOf(outcome, 'T2')?.bound).toContain('trace-b: The trace has no span, so T2 has nothing to check')
  })
})

describe('T2 to T5, the structure of a capture', () => {
  test('T2 fails a span that starts before 0', async () => {
    const outcome = await run(withTrace((trace) => (trace.spans.startNs[0] = -5)))
    expect(checkOf(outcome, 'T2')?.bound).toMatch(/^Time runs forward: span 0 \(\w+\) starts at -5 ns, before 0\.$/)
  })

  test('T3 fails two kernels that overlap on one stream', async () => {
    const outcome = await run(
      withTrace((trace) => {
        const first = firstSpan(trace, 'gpu-stream', 'kernel')
        const next = trace.spans.track.findIndex((track, i) => i > first && track === trace.spans.track[first] && trace.strings[trace.spans.cat[i]] === 'kernel')
        trace.spans.startNs[next] = trace.spans.startNs[first] + 1
      }),
    )
    expect(checkOf(outcome, 'T3')?.status).toBe('fail')
    expect(checkOf(outcome, 'T3')?.bound).toMatch(/before span \d+ \(\w+\) ends at \d+ ns on the same stream/)
  })

  test('T4 fails a kernel whose correlation id no launch has: this also catches a clock domain that was shifted', async () => {
    const outcome = await run(withTrace((trace) => (trace.spans.corr[firstSpan(trace, 'gpu-stream', 'kernel')] = 987_654)))
    expect(checkOf(outcome, 'T4')?.bound).toMatch(/has correlation id 987654, and no CUDA API span has it/)
  })

  test('T5 fails a kernel that no step window holds: a step mark moved into it', async () => {
    const outcome = await run(
      withTrace((trace) => {
        const at = firstSpan(trace, 'gpu-stream', 'kernel')
        const step = trace.strings.indexOf('step')
        const mark = trace.marks.findIndex((m) => m.name === step && m.tNs > trace.spans.startNs[at])
        trace.marks[mark].tNs = trace.spans.startNs[at] + 1
      }),
    )
    expect(checkOf(outcome, 'T5')?.status).toBe('fail')
  })
})

describe('T6, the number of step windows', () => {
  test("fails a trace with a count other than the one the challenge's seed asks for, and prints the range it was drawn from", async () => {
    const fixture = traceFixture()
    const asks = { 'tr3.profile.s5': { steps: { salt: 'trace/steps', lo: 5, hi: 9 } } }
    const outcome = await verify(fixture.bundle, { ...fixture.context, stages: asks })
    expect(checkOf(outcome, 'T6')?.status).toBe('fail')
    expect(checkOf(outcome, 'T6')?.bound).toMatch(/^The trace has 13 step windows, and the challenge's seed asks for [5-9] \(a count from 5 to 9\)\.$/)
  })

  test('is left out of a stage that does not require it when the site declares no count (a stage that requires it fails with the reason: the pipeline test has tr3.profile.s2)', async () => {
    const fixture = traceFixture()
    // The stage still pins what the floors are made from; it declares no step count.
    const none = await verify(fixture.bundle, { ...fixture.context, stages: { 'tr3.profile.s5': { ...SERVING } } })
    expect(checkOf(none, 'T6')).toBeUndefined()
    expect(none.verdict.provenance).toBe('practice')
  })
})

describe('T7, the partition of a step window', () => {
  test('fails an attribution of the wrong number of windows', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => claimOf(bundle).windows.pop()))
    expect(checkOf(outcome, 'T7')?.bound).toBe('The receipt attributes 12 windows, and the trace has 13.')
  })

  test('fails a window whose three parts do not add up to it, and prints the sum against the length', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (claimOf(bundle).windows[4].bothIdleNs += 1000)))
    expect(checkOf(outcome, 'T7')?.bound).toMatch(/^Window 4: GPU-busy [\d,]+ ns \+ CPU-gap [\d,]+ ns \+ both-idle [\d,]+ ns = [\d,]+ ns, and the window is [\d,]+ ns long: an attribution partitions its window exactly\.$/)
  })

  test('fails a window that does add up but is not the trace\'s: the parts moved between categories', async () => {
    const outcome = await run(
      edited(traceFixture(), (bundle) => {
        const window = claimOf(bundle).windows.find((w) => w.cpuGapNs > 0)
        if (window === undefined) throw new Error('the fixture has no CPU gap')
        window.cpuGapNs -= 1
        window.bothIdleNs += 1
      }),
    )
    expect(checkOf(outcome, 'T7')?.bound).toMatch(/^Window \d+: the receipt claims cpuGapNs [\d,]+ ns, and the trace gives [\d,]+ ns\.$/)
  })

  test('fails a row that is no attribution, and one with a part that is not a whole number of ns', async () => {
    const row = await run(edited(traceFixture(), (bundle) => (claimOf(bundle).windows[0] = null as never)))
    expect(checkOf(row, 'T7')?.bound).toBe('Window 0 is not an attribution.')
    const part = await run(edited(traceFixture(), (bundle) => (claimOf(bundle).windows[0].gpuBusyNs = 1.5)))
    expect(checkOf(part, 'T7')?.bound).toBe('Window 0: the attribution gives no whole ns for GPU-busy, CPU-gap and both-idle.')
  })

  test('passes with no claim at all: the recomputed partition is still held to the window', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.performance = undefined)))
    expect(checkOf(outcome, 'T7')?.bound).toBe('13 windows, and in each one GPU-busy + CPU-gap + both-idle is the window to the ns.')
  })
})

describe('T8, the configuration shows', () => {
  test('fails a graph mode of NONE with graph launches in the trace', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => (bundle.receipt.environment.engineConfig = { ...bundle.receipt.environment.engineConfig!, graphMode: 'NONE' })))
    expect(checkOf(outcome, 'T8')?.bound).toBe('The receipt says the graph mode is NONE, and the trace has 12 graph launches: none expected.')
  })

  test('fails a graph mode with graphs and not one graph launch in the trace', async () => {
    const outcome = await run(withTrace((trace) => (trace.strings = trace.strings.map((s) => (s === 'cudaGraphLaunch' ? 'cudaLaunchKernel2' : s)))))
    expect(checkOf(outcome, 'T8')?.bound).toBe('The receipt says the graph mode is FULL_AND_PIECEWISE, and the trace has 0 graph launches: at least one expected.')
  })

  test('is left out when the receipt records no configuration to compare with', async () => {
    const outcome = await run(edited(traceFixture(), (bundle) => delete bundle.receipt.environment.engineConfig))
    expect(checkOf(outcome, 'T8')).toBeUndefined()
  })
})

describe('X4, one GPU name across the receipt', () => {
  test('fails a trace that names another GPU than NVML reported', async () => {
    const outcome = await run(withTrace((trace) => (trace.meta.gpu = 'NVIDIA H200')))
    expect(checkOf(outcome, 'X4')?.bound).toBe('The trace names "NVIDIA H200" and the receipt\'s GPUs are "NVIDIA H100 80GB HBM3", "NVIDIA H100 80GB HBM3", "NVIDIA H100 80GB HBM3", "NVIDIA H100 80GB HBM3".')
  })
})

describe('T10, the two traces of a pair', () => {
  /** The honest trace twice: a toggled pair under one challenge, the second written as another artifact. */
  const pair = (change: (second: TraceData) => void = () => undefined): Fixture =>
    edited(traceFixture(), (bundle) => {
      const first = traceOf(bundle)
      const second = JSON.parse(JSON.stringify(first)) as TraceData
      change(second)
      const entry = bundle.receipt.artifacts[0]
      bundle.receipt.artifacts.push({ ...entry, id: 'trace-b' })
      bundle.artifacts['trace-b'] = { encoding: 'json', data: second }
      bundle.receipt.performance = { kind: 'pair', claimed: { trace: claimOf(bundle), 'trace-b': claimOf(bundle) } }
    })

  test('passes two traces of one engine, version and GPU with as many windows, and every other check runs over both', async () => {
    const outcome = await run(pair())
    expect(checkOf(outcome, 'T10')?.bound).toBe('Both traces are from vllm 0.33.0 on NVIDIA H100 80GB HBM3, with 13 step windows each.')
    expect(failed(outcome)).toEqual([])
    expect(checkOf(outcome, 'T2')?.bound).toContain('trace: ')
    expect(checkOf(outcome, 'T2')?.bound).toContain('trace-b: ')
  })

  test('fails a pair whose traces are of other versions, and one with other counts of windows', async () => {
    const version = await run(pair((second) => (second.meta.version = '0.32.0')))
    expect(checkOf(version, 'T10')?.bound).toBe('The two traces differ in their version.')
    const windows = await run(pair((second) => second.marks.pop()))
    expect(checkOf(windows, 'T10')?.bound).toBe('One has 13 step windows and the other 12.')
  })

  test('fails three traces: a pair is two', async () => {
    const three = edited(pair(), (bundle) => {
      bundle.receipt.artifacts.push({ ...bundle.receipt.artifacts[0], id: 'trace-c' })
      bundle.artifacts['trace-c'] = { encoding: 'json', data: JSON.parse(JSON.stringify(traceOf(bundle))) }
    })
    expect(checkOf(await run(three), 'T10')?.bound).toBe('The receipt carries 3 traces, and a pair is two.')
  })
})
