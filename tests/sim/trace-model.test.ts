/*
 * The trace model's rules (ARCHITECTURE §5.7; WORLD §3.5), one at a time, on cases small enough to read, and the properties of
 * ARCHITECTURE §5.10 for `trace` (200 seeds on a PR [estimated]). tests/sim/trace.test.ts holds W1-T08's three acceptance checks;
 * these are what stands behind them.
 *
 *   - the builder lists spans in a fixed order and renumbers the flows it was given;
 *   - the reader is strict: each way a text can differ from `trace@1` is an error that names the field;
 *   - `attribute` equals a per-ns oracle that shares no code with it, on random traces and random windows, and a worked example
 *     has numbers that can be checked by hand;
 *   - `traceFromRun` keeps the run's busy time to the ns, gives every piece of GPU work a launch before it, and is a function of
 *     the run, the seed and the jitter.
 */
import { describe, expect, test } from 'bun:test'
import { below, between, rngFor } from '../../packages/sim/core'
import type { StepLoopRun } from '../../packages/sim/steploop'
import {
  CAT_COPY,
  CAT_KERNEL,
  CAT_LAUNCH,
  CAT_SYNC,
  CLEAN_JITTER,
  DEFAULT_JITTER,
  STEP_MARK,
  TRACE_CARD_ID,
  TRACE_SCHEMA,
  attribute,
  attributeSteps,
  attributeWindows,
  cloneTrace,
  decodeTrace,
  encodeTrace,
  spanCount,
  spanView,
  stepWindows,
  traceBuilder,
  traceChecks,
  traceFromJson,
  traceFromRun,
  traceToJson,
  validateTrace,
} from '../../packages/sim/trace'
import type { EsTrace, JitterSpec } from '../../packages/sim/trace'
import { HUGE, ROUGH, SEEDS, TINY, bruteForce, intervalsOf, isGpuWork, isMainThread, laneNs, merged, randomTrace, randomWindow, rowsWhere, runOf, startingIn, viewsOf } from './trace-support'

// ---------------------------------------------------------------------------------------------------------------------------
// The builder

describe('traceBuilder', () => {
  test('numbers strings in the order they are first used, and gives the same index for the same text', () => {
    const b = traceBuilder()
    expect([b.string('a'), b.string('b'), b.string('a'), b.string('')]).toEqual([0, 1, 0, 2])
    const cpu = b.track('cpu-thread', 'b')
    expect(cpu).toBe(0)
    b.span(cpu, 0, 1, 'c', 'a')
    const t = b.build({ source: 'synthetic', synthetic: true })
    expect(t.strings).toEqual(['a', 'b', '', 'c'])
    expect(t.tracks).toEqual([{ id: 0, kind: 'cpu-thread', name: 1 }])
    expect([t.spans.name[0], t.spans.cat[0]]).toEqual([3, 0])
  })

  test('lists spans by start, then by track, then the longer first, then in the order added; marks by time; and renumbers the flows', () => {
    const b = traceBuilder()
    const a = b.track('cpu-thread', 'a')
    const c = b.track('gpu-stream', 'c')
    const added = [
      b.span(c, 5, 1, 'late', 'kernel'), // 0
      b.span(c, 1, 2, 'short on track 1', 'kernel'), // 1
      b.span(a, 1, 2, 'short on track 0', 'cpu'), // 2
      b.span(a, 1, 9, 'long on track 0', 'cpu'), // 3
      b.span(a, 1, 2, 'twin of the short one', 'cpu'), // 4
      b.span(a, 0, 1, 'first', 'cpu'), // 5
    ]
    b.flow(added[0], added[1], 'launch')
    b.flow(added[5], added[3], 'copy')
    b.mark(30, 'm')
    b.mark(10, 'n')
    b.mark(10, 'o')
    const t = b.build({ source: 'synthetic', synthetic: true })
    expect(Array.from(t.spans.startNs).map((_, i) => t.strings[t.spans.name[i]])).toEqual([
      'first',
      'long on track 0',
      'short on track 0',
      'twin of the short one',
      'short on track 1',
      'late',
    ])
    // Flow 0 joined `late` (now 5) to `short on track 1` (now 4); flow 1 joined `first` (now 0) to `long on track 0` (now 1).
    expect(t.flows).toEqual([
      { from: 5, to: 4, kind: 'launch' },
      { from: 0, to: 1, kind: 'copy' },
    ])
    expect(t.marks.map((m) => [m.tNs, t.strings[m.name]])).toEqual([
      [10, 'n'],
      [10, 'o'],
      [30, 'm'],
    ])
  })

  test('spans added in that order keep their handles as indices, and the trace it builds is well formed', () => {
    const b = traceBuilder()
    const cpu = b.track('cpu-thread', 'main')
    const handles = [0, 10, 20, 30].map((at) => b.span(cpu, at, 5, 'frame', 'cpu'))
    expect(handles).toEqual([0, 1, 2, 3])
    expect(validateTrace(b.build({ source: 'synthetic', synthetic: true }))).toEqual([])
  })

  test('checks every value as it goes in', () => {
    const b = traceBuilder()
    const cpu = b.track('cpu-thread', 'main')
    const attempts: [string, () => void][] = [
      ['an unknown track', () => b.span(3, 0, 1, 'x', 'y')],
      ['a fractional start', () => b.span(cpu, 0.5, 1, 'x', 'y')],
      ['a negative start', () => b.span(cpu, -1, 1, 'x', 'y')],
      ['a negative duration', () => b.span(cpu, 0, -1, 'x', 'y')],
      ['an end beyond 2^53', () => b.span(cpu, Number.MAX_SAFE_INTEGER, 1, 'x', 'y')],
      ['a correlation id below -1', () => b.span(cpu, 0, 1, 'x', 'y', -2)],
      ['a correlation id beyond 2^31', () => b.span(cpu, 0, 1, 'x', 'y', 2 ** 31)],
      ['a fractional correlation id', () => b.span(cpu, 0, 1, 'x', 'y', 0.5)],
      ['a negative mark', () => b.mark(-1, 'step')],
    ]
    for (const [what, attempt] of attempts) expect(attempt, what).toThrow(RangeError)
    b.flow(0, 7, 'launch')
    expect(() => b.build({ source: 'synthetic', synthetic: true }), 'a flow to a span that was never added').toThrow(/joins spans that were added/)
  })

  test('can build twice, and the trace it builds does not change under later additions', () => {
    const b = traceBuilder()
    const cpu = b.track('cpu-thread', 'main')
    b.span(cpu, 0, 1, 'x', 'y')
    const first = b.build({ source: 'synthetic', synthetic: true })
    b.span(cpu, 5, 1, 'z', 'y')
    expect(spanCount(first)).toBe(1)
    expect(first.strings).toEqual(['main', 'x', 'y'])
    expect(spanCount(b.build({ source: 'synthetic', synthetic: true }))).toBe(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The reader is strict

function small(): EsTrace {
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'main')
  const api = b.track('cuda-api', 'api')
  const gpu = b.track('gpu-stream', 'stream 0')
  b.span(cpu, 0, 9, 'schedule', 'schedule')
  const launch = b.span(api, 5, 3, 'cudaLaunchKernel', CAT_LAUNCH, 0)
  const kernel = b.span(gpu, 10, 20, 'gemm', CAT_KERNEL, 0)
  b.flow(launch, kernel, 'launch')
  b.mark(0, STEP_MARK)
  b.mark(40, STEP_MARK)
  return b.build({ source: 'synthetic', synthetic: true })
}

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const malformed: [string, (j: Loose) => void, RegExp][] = [
  ['an unknown top-level field', (j) => (j.extra = 1), /\$: unknown field "extra"/],
  ['a missing top-level field', (j) => delete j.flows, /\$: missing field "flows"/],
  ['another schema', (j) => (j.schema = 'enginespace/trace@2'), /\$\.schema: expected "enginespace\/trace@1"/],
  ['an unknown field in meta', (j) => (j.meta.extra = 1), /\$\.meta: unknown field "extra"/],
  ['a missing field in meta', (j) => delete j.meta.synthetic, /\$\.meta: missing field "synthetic"/],
  ['an unknown source', (j) => (j.meta.source = 'bot'), /meta\.source is "bot"/],
  ['a synthetic trace that is not marked synthetic', (j) => (j.meta.synthetic = false), /true exactly when meta\.source is "synthetic"/],
  ['a learner\'s trace marked synthetic', (j) => ((j.meta.source = 'learner'), (j.meta.synthetic = true)), /true exactly when meta\.source is "synthetic"/],
  ['a hash that is not lower-case hex', (j) => (j.meta.sha256 = 'AB'.repeat(32)), /meta\.sha256 is not 64 lower-case hex digits/],
  ['a version that is not a string', (j) => (j.meta.version = 33), /\$\.meta\.version: expected a string/],
  ['a string table entry that is not a string', (j) => (j.strings[0] = 5), /\$\.strings\[0\]: expected a string/],
  ['a lone surrogate in the string table', (j) => (j.strings[0] = '\ud800'), /strings\[0\] has a lone surrogate/],
  ['an unknown field on a track', (j) => (j.tracks[0].extra = 1), /\$\.tracks\[0\]: unknown field "extra"/],
  ['an unknown track kind', (j) => (j.tracks[0].kind = 'gpu'), /tracks\[0\]\.kind is "gpu"/],
  ['two tracks with one id', (j) => (j.tracks[1].id = 0), /tracks\[1\]\.id 0 is used twice/],
  ['a track named by a string that is not there', (j) => (j.tracks[0].name = 99), /\$\.tracks\[0\]\.name: expected an integer from 0 to/],
  ['an unknown span column', (j) => (j.spans.extra = []), /\$\.spans: unknown field "extra"/],
  ['a missing span column', (j) => delete j.spans.corr, /\$\.spans: missing field "corr"/],
  ['a column of another length', (j) => j.spans.corr.pop(), /\$\.spans\.corr: 2 rows, where \$\.spans\.track has 3/],
  ['a column that is not an array', (j) => (j.spans.cat = 'abc'), /\$\.spans\.cat: expected an array/],
  ['a fractional start', (j) => (j.spans.startNs[0] = 1.5), /\$\.spans\.startNs\[0\]: expected an integer/],
  ['a duration that is a string', (j) => (j.spans.durNs[0] = '5'), /\$\.spans\.durNs\[0\]: expected an integer/],
  ['a start of -0', (j) => (j.spans.startNs[0] = -0), /\$\.spans\.startNs\[0\]: expected an integer/],
  ['a start that is NaN', (j) => (j.spans.startNs[0] = Number.NaN), /\$\.spans\.startNs\[0\]: expected an integer/],
  ['a start beyond 2^53', (j) => (j.spans.startNs[0] = 2 ** 53), /\$\.spans\.startNs\[0\]: expected an integer/],
  ['a span that ends beyond 2^53', (j) => ((j.spans.startNs[0] = 2 ** 53 - 1), (j.spans.durNs[0] = 1)), /span 0: the span ends beyond 2\^53/],
  ['a span on a track the trace lacks', (j) => (j.spans.track[0] = 77), /span 0: track 77 is not a track of the trace/],
  ['a span named by a string that is not there', (j) => (j.spans.name[0] = 99), /\$\.spans\.name\[0\]: expected an integer from 0 to/],
  ['a correlation id below -1', (j) => (j.spans.corr[0] = -2), /\$\.spans\.corr\[0\]: expected an integer from -1 to/],
  ['a flow from a span that is not there', (j) => (j.flows[0].from = 99), /flows\[0\]\.from is not a span of the trace/],
  ['an unknown flow kind', (j) => (j.flows[0].kind = 'bogus'), /flows\[0\]\.kind is "bogus"/],
  ['a flow with an extra field', (j) => (j.flows[0].extra = 1), /\$\.flows\[0\]: unknown field "extra"/],
  ['a mark at a fractional time', (j) => (j.marks[0].tNs = 0.5), /\$\.marks\[0\]\.tNs: expected an integer/],
  ['a mark named by a string that is not there', (j) => (j.marks[0].name = 99), /\$\.marks\[0\]\.name: expected an integer from 0 to/],
]

describe('traceFromJson and decodeTrace are strict', () => {
  const good = traceToJson(small())

  test('read the trace they are given', () => {
    expect(traceFromJson(structuredClone(good))).toStrictEqual(small())
    expect(decodeTrace(encodeTrace(small()))).toStrictEqual(small())
  })

  for (const [what, edit, message] of malformed) {
    test(`reject ${what}, naming the field`, () => {
      const j = structuredClone(good) as Loose
      edit(j)
      expect(() => traceFromJson(j)).toThrow(RangeError)
      expect(() => traceFromJson(j)).toThrow(message)
    })
  }

  test('reject a value that is not an object, a text that is not JSON, and a field named __proto__', () => {
    for (const bad of [null, [], 42, 'trace', undefined]) expect(() => traceFromJson(bad)).toThrow(/expected an object/)
    expect(() => decodeTrace('{')).toThrow(/trace@1: not JSON/)
    expect(() => decodeTrace('')).toThrow(/not JSON/)
    const text = encodeTrace(small()).replace('{', '{"__proto__":{},')
    expect(() => decodeTrace(text)).toThrow(/unknown field "__proto__"/)
  })

  test('accept the same trace spelled any way JSON allows, and write it one way only', () => {
    const spaced = JSON.stringify(good, null, 4)
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(good).reverse()))
    for (const text of [spaced, reordered]) {
      expect(decodeTrace(text)).toStrictEqual(small())
      expect(encodeTrace(decodeTrace(text))).toBe(encodeTrace(small()))
    }
  })

  test('are not fooled by a hostile column that a typed array would coerce: strings, floats, booleans and null all fail', () => {
    for (const bad of ['7', 7.5, true, null, [], {}]) {
      const j = structuredClone(good) as Loose
      j.spans.name[1] = bad
      expect(() => traceFromJson(j), JSON.stringify(bad)).toThrow(/expected an integer/)
    }
  })

  test('encodeTrace refuses a trace that validateTrace rejects, so a malformed trace is never written', () => {
    const bad = { ...cloneTrace(small()), spans: { ...cloneTrace(small()).spans, corr: new Int32Array(1) } }
    expect(() => encodeTrace(bad)).toThrow(/cannot encode: spans\.corr has 1 rows, where spans\.track has 3/)
  })
})

describe('validateTrace', () => {
  test('is empty for every synthetic trace of 40 seeds, and for the builder\'s traces', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { run } = runOf(seed)
      expect(validateTrace(traceFromRun(run, seed))).toEqual([])
    }
    expect(validateTrace(small())).toEqual([])
  })

  test('judges the shape of the columns and not what the numbers mean: a negative duration is well formed, and `traceChecks` is what fails it', () => {
    const t = cloneTrace(small())
    t.spans.durNs[0] = -4
    expect(validateTrace(t)).toEqual([])
    expect(decodeTrace(encodeTrace(t))).toStrictEqual(t)
    expect(traceChecks(t).find((c) => c.id === 'T2')!.pass).toBe(false)
  })

  test('finds a column that is a plain array, a property that is missing, and a column of the wrong type', () => {
    const t = cloneTrace(small())
    const plain = { ...t, spans: { ...t.spans, track: [0, 1, 2] as unknown as Int32Array } }
    expect(validateTrace(plain)).toContain('spans.track is not a Int32Array')
    const wrongType = { ...t, spans: { ...t.spans, startNs: new Int32Array(3) as unknown as Float64Array } }
    expect(validateTrace(wrongType)).toContain('spans.startNs is not a Float64Array')
    expect(validateTrace({ ...t, spans: null as never })).toContain('spans is not an object')
    expect(validateTrace({ ...t, meta: null as never })).toContain('meta is not an object')
    expect(validateTrace({ ...t, flows: 3 as never })).toContain('flows is not an array')
  })

  test('stops listing after 20 problems, so a hostile trace costs a short answer', () => {
    const t = cloneTrace(small())
    t.spans.track.fill(55)
    t.spans.name.fill(99)
    expect(validateTrace(t).length).toBeLessThanOrEqual(20)
  })

  test('says what the card id and the schema are', () => {
    expect(TRACE_SCHEMA).toBe('enginespace/trace@1')
    expect(TRACE_CARD_ID).toBe('trace-room-trace')
    expect(small().schema).toBe(TRACE_SCHEMA)
  })
})

describe('spanView and cloneTrace', () => {
  test('spanView reads a span with its track\'s kind and its strings, and refuses one that is not there', () => {
    const t = small()
    expect(spanView(t, 2)).toEqual({ index: 2, track: 2, kind: 'gpu-stream', startNs: 10, endNs: 30, durNs: 20, name: 'gemm', cat: 'kernel', corr: 0 })
    for (const bad of [-1, 3, 0.5]) expect(() => spanView(t, bad)).toThrow(RangeError)
    const orphan = cloneTrace(t)
    orphan.spans.track[0] = 9
    expect(() => spanView(orphan, 0)).toThrow(/track 9, which the trace does not have/)
  })

  test('cloneTrace copies the typed arrays, so breaking the copy leaves the trace alone', () => {
    const t = small()
    const copy = cloneTrace(t)
    expect(copy).toStrictEqual(t)
    copy.spans.startNs[0] = 99
    expect(t.spans.startNs[0]).toBe(0)
    expect(copy.spans.startNs).not.toBe(t.spans.startNs)
    expect(copy.marks).not.toBe(t.marks)
    expect(copy.marks[0]).not.toBe(t.marks[0])
    expect(copy.tracks[0]).not.toBe(t.tracks[0])
    expect(copy.meta).not.toBe(t.meta)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Attribution

describe('attribute: a worked example, by hand', () => {
  // Window [0, 100). Two streams: a kernel on each, overlapping, so the GPU has a kernel running from 10 to 60; a copy inside the
  // kernels (20 to 35), which adds nothing; and a copy from 60 to 70 after them, which is GPU-busy with no kernel. The main thread
  // runs a frame from 0 to 25 and a CUDA call from 65 to 90, and nothing else.
  const b = traceBuilder()
  const cpu = b.track('cpu-thread', 'main')
  const api = b.track('cuda-api', 'api')
  const s0 = b.track('gpu-stream', 'stream 0')
  const s1 = b.track('gpu-stream', 'stream 1')
  b.span(cpu, 0, 25, 'frame', 'cpu')
  b.span(api, 65, 25, 'cudaStreamSynchronize', CAT_SYNC)
  b.span(s0, 10, 30, 'k0', CAT_KERNEL, 0)
  b.span(s1, 30, 30, 'k1', CAT_KERNEL, 1)
  b.span(s1, 20, 15, 'inside', CAT_COPY, 2)
  b.span(s0, 60, 10, 'after', CAT_COPY, 3)
  const trace = b.build({ source: 'synthetic', synthetic: true })

  test('the GPU is busy for 60 ns, 50 with a kernel and 10 with only a copy; 30 ns wait on the CPU; 10 ns are both idle; 20 ns of CPU work are hidden', () => {
    expect(attribute(trace, { fromNs: 0, toNs: 100 })).toEqual({
      fromNs: 0,
      toNs: 100,
      windowNs: 100,
      gpuBusyNs: 60,
      kernelNs: 50,
      copyOnlyNs: 10,
      cpuGapNs: 30,
      bothIdleNs: 10,
      // The frame covers 10 to 25 of the GPU's busy time, and the call 65 to 70.
      overlapNs: 20,
      segments: [
        { fromNs: 0, toNs: 10, category: 'cpu-gap' },
        { fromNs: 10, toNs: 60, category: 'kernel' },
        { fromNs: 60, toNs: 70, category: 'copy' },
        { fromNs: 70, toNs: 90, category: 'cpu-gap' },
        { fromNs: 90, toNs: 100, category: 'both-idle' },
      ],
      gaps: [
        { fromNs: 0, toNs: 10, cpuGapNs: 10, bothIdleNs: 0 },
        { fromNs: 70, toNs: 100, cpuGapNs: 20, bothIdleNs: 10 },
      ],
    })
  })

  test('a window cuts what it holds: a span that crosses an edge counts for the part inside', () => {
    const a = attribute(trace, { fromNs: 50, toNs: 80 })
    expect([a.kernelNs, a.copyOnlyNs, a.cpuGapNs, a.bothIdleNs, a.overlapNs]).toEqual([10, 10, 10, 0, 5])
    expect(a.segments.map((s) => [s.fromNs, s.toNs, s.category])).toEqual([
      [50, 60, 'kernel'],
      [60, 70, 'copy'],
      [70, 80, 'cpu-gap'],
    ])
    // A window inside one span is all of that span's category; one before everything, or after it, is both-idle; an empty one is nothing.
    expect(attribute(trace, { fromNs: 12, toNs: 18 })).toMatchObject({ kernelNs: 6, overlapNs: 6, windowNs: 6 })
    expect(attribute(trace, { fromNs: 200, toNs: 260 })).toMatchObject({ bothIdleNs: 60, gpuBusyNs: 0, segments: [{ fromNs: 200, toNs: 260, category: 'both-idle' }] })
    expect(attribute(trace, { fromNs: 40, toNs: 40 })).toMatchObject({ windowNs: 0, segments: [], gaps: [] })
  })

  test('the pieces add up to the window for every window of the trace, by exhaustion', () => {
    for (let from = 0; from <= 110; from += 3) {
      for (let to = from; to <= 120; to += 7) {
        const a = attribute(trace, { fromNs: from, toNs: to })
        expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs).toBe(to - from)
        expect(a.kernelNs + a.copyOnlyNs).toBe(a.gpuBusyNs)
      }
    }
  })

  test('refuses a window that is not two integers in order', () => {
    for (const w of [{ fromNs: 5, toNs: 4 }, { fromNs: 0.5, toNs: 4 }, { fromNs: 0, toNs: Number.NaN }, { fromNs: 0, toNs: 2 ** 53 }]) {
      expect(() => attribute(trace, w)).toThrow(RangeError)
      expect(() => attributeWindows(trace, [w])).toThrow(RangeError)
    }
  })
})

describe('attribute: what counts', () => {
  const build = (fill: (b: ReturnType<typeof traceBuilder>, t: { cpu: number; api: number; gpu: number; other: number; marker: number }) => void): EsTrace => {
    const b = traceBuilder()
    const t = { cpu: b.track('cpu-thread', 'main'), api: b.track('cuda-api', 'api'), gpu: b.track('gpu-stream', 'stream'), other: b.track('cpu-thread', 'worker'), marker: b.track('marker', 'ranges') }
    fill(b, t)
    return b.build({ source: 'synthetic', synthetic: true })
  }
  const whole = { fromNs: 0, toNs: 100 }

  test('a GPU span that is not a kernel or a copy is an annotation, and is not busy time', () => {
    const t = build((b, k) => {
      b.span(k.gpu, 10, 50, 'range', 'gpu_user_annotation')
      b.span(k.gpu, 20, 10, 'kernel', CAT_KERNEL)
    })
    expect(attribute(t, whole)).toMatchObject({ kernelNs: 10, copyOnlyNs: 0, gpuBusyNs: 10 })
  })

  test('a marker track is neither the GPU nor the main thread, and a kernel on a CPU track is only a frame', () => {
    const t = build((b, k) => {
      b.span(k.marker, 0, 100, 'step range', 'nvtx')
      b.span(k.cpu, 10, 10, 'looks like a kernel', CAT_KERNEL)
    })
    // The span on the CPU track is main-thread time, whatever it is called; the marker is nothing.
    expect(attribute(t, whole)).toMatchObject({ kernelNs: 0, gpuBusyNs: 0, cpuGapNs: 10, bothIdleNs: 90 })
  })

  test('both CUDA API calls and frames make the main thread busy, nested or overlapping frames are counted once, and touching spans join', () => {
    const t = build((b, k) => {
      b.span(k.cpu, 0, 30, 'outer', 'cpu')
      b.span(k.cpu, 5, 10, 'inner', 'cpu')
      b.span(k.api, 20, 20, 'call', CAT_LAUNCH)
      b.span(k.api, 40, 10, 'next call', CAT_LAUNCH)
      b.span(k.other, 80, 5, 'another thread', 'cpu')
    })
    const a = attribute(t, whole)
    // Busy: 0 to 50, and 80 to 85. A second CPU thread counts as the main thread: a trace carries the engine's own.
    expect(a.cpuGapNs).toBe(55)
    expect(a.segments.map((s) => [s.fromNs, s.toNs, s.category])).toEqual([
      [0, 50, 'cpu-gap'],
      [50, 80, 'both-idle'],
      [80, 85, 'cpu-gap'],
      [85, 100, 'both-idle'],
    ])
  })

  test('a span with no duration is nothing, and the same span listed twice counts once', () => {
    const t = build((b, k) => {
      b.span(k.gpu, 10, 0, 'instant', CAT_KERNEL)
      b.span(k.cpu, 10, 0, 'instant', 'cpu')
      b.span(k.gpu, 40, 20, 'twice', CAT_KERNEL)
      b.span(k.gpu, 40, 20, 'twice', CAT_KERNEL)
    })
    expect(attribute(t, whole)).toMatchObject({ kernelNs: 20, cpuGapNs: 0, bothIdleNs: 80 })
  })

  test('a kernel and a copy that run together are kernel time, and the copy alone is copy-only', () => {
    const t = build((b, k) => {
      b.span(k.gpu, 10, 30, 'kernel', CAT_KERNEL)
      b.span(k.gpu, 30, 30, 'copy', CAT_COPY)
    })
    expect(attribute(t, whole)).toMatchObject({ kernelNs: 30, copyOnlyNs: 20, gpuBusyNs: 50 })
  })
})

describe('attribute against a per-ns oracle', () => {
  test('equals it on 200 random traces and random windows: the same ns in every category, whatever the overlaps', () => {
    for (const seed of SEEDS) {
      const trace = randomTrace(seed)
      const window = randomWindow(seed)
      const a = attribute(trace, window)
      const oracle = bruteForce(trace, window.fromNs, window.toNs)
      const ctx = `seed ${seed}, window [${window.fromNs}, ${window.toNs})`
      expect([a.kernelNs, a.copyOnlyNs, a.cpuGapNs, a.bothIdleNs, a.overlapNs], ctx).toEqual([oracle.kernelNs, oracle.copyOnlyNs, oracle.cpuGapNs, oracle.bothIdleNs, oracle.overlapNs])
      expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs, ctx).toBe(a.windowNs)
    }
  })

  test('equals it on larger traces over many windows at once, and attributeWindows is attribute for each', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const trace = randomTrace(seed, 160)
      const windows = Array.from({ length: 12 }, (_, i) => randomWindow(seed * 100 + i))
      const together = attributeWindows(trace, windows)
      windows.forEach((w, i) => {
        const oracle = bruteForce(trace, w.fromNs, w.toNs)
        expect(together[i].kernelNs).toBe(oracle.kernelNs)
        expect(together[i].cpuGapNs).toBe(oracle.cpuGapNs)
        expect(together[i]).toEqual(attribute(trace, w))
      })
    }
  })
})

describe('stepWindows', () => {
  test('are the step marks in time order taken two at a time: n marks give n - 1 windows, and fewer than two give none', () => {
    const b = traceBuilder()
    b.track('marker', 'm')
    for (const t of [30, 10, 20]) b.mark(t, STEP_MARK)
    b.mark(15, 'not a step')
    expect(stepWindows(b.build({ source: 'synthetic', synthetic: true }))).toEqual([
      { fromNs: 10, toNs: 20 },
      { fromNs: 20, toNs: 30 },
    ])
    const one = traceBuilder()
    one.mark(5, STEP_MARK)
    expect(stepWindows(one.build({ source: 'synthetic', synthetic: true }))).toEqual([])
    expect(stepWindows(traceBuilder().build({ source: 'synthetic', synthetic: true }))).toEqual([])
  })

  test('are the windows attributeSteps attributes, one for one', () => {
    const { run } = runOf(12)
    const trace = traceFromRun(run, 12)
    expect(attributeSteps(trace).map((a) => ({ fromNs: a.fromNs, toNs: a.toNs }))).toEqual(stepWindows(trace))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The generator

/** Runs of every kind: the first seeds whose worlds differ in overlap and graphs. */
const SAMPLE = SEEDS.slice(0, 48)

describe('traceFromRun: the run is kept to the ns', () => {
  test('the union of the kernel and copy spans is the run\'s forwards, and the union of the main thread\'s spans is its cpu-main lane, under every jitter', () => {
    for (const jitter of [DEFAULT_JITTER, CLEAN_JITTER, ROUGH, TINY]) {
      for (const seed of SAMPLE) {
        const { run } = runOf(seed)
        const trace = traceFromRun(run, seed, jitter)
        expect(merged(intervalsOf(trace, isGpuWork)), `seed ${seed}`).toEqual(merged(laneNs(run.lanes['gpu-stream'])))
        expect(merged(intervalsOf(trace, isMainThread)), `seed ${seed}`).toEqual(merged(laneNs(run.lanes['cpu-main'])))
      }
    }
  })

  test('the main thread\'s frames are the run\'s spans, with only the boundaries between touching frames moved, by at most cpuNoiseNs', () => {
    let moved = 0
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const frames = rowsWhere(trace, (v) => v.kind === 'cpu-thread')
      const cpu = run.lanes['cpu-main']
      expect(rowsWhere(trace, (v) => v.kind === 'cpu-thread')).toHaveLength(cpu.length)
      expect(frames).toHaveLength(cpu.length)
      cpu.forEach((span, i) => {
        const v = spanView(trace, frames[i])
        expect([v.name, v.cat]).toEqual([span.kind, span.kind])
        expect(v.durNs, `seed ${seed}, frame ${i}`).toBeGreaterThan(0)
        const shifts = [v.startNs - span.startUs * 1000, v.endNs - span.endUs * 1000]
        for (const shift of shifts) {
          expect(Math.abs(shift), `seed ${seed}, frame ${i}`).toBeLessThanOrEqual(DEFAULT_JITTER.cpuNoiseNs)
          if (shift !== 0) moved++
        }
        // A frame that starts or ends alone, with a wait or the edge of the run beside it, keeps that edge.
        if (i === 0) expect(shifts[0]).toBe(0)
        if (i === cpu.length - 1) expect(shifts[1]).toBe(0)
        if (i > 0 && span.startUs !== cpu[i - 1].endUs) expect(shifts[0]).toBe(0)
        if (i < cpu.length - 1 && span.endUs !== cpu[i + 1].startUs) expect(shifts[1]).toBe(0)
      })
    }
    expect(moved).toBeGreaterThan(100)
    // With no jitter no frame moves at all.
    const { run } = runOf(2)
    const clean = traceFromRun(run, 2, CLEAN_JITTER)
    const frames = rowsWhere(clean, (v) => v.kind === 'cpu-thread')
    run.lanes['cpu-main'].forEach((span, i) => expect([spanView(clean, frames[i]).startNs, spanView(clean, frames[i]).endNs]).toEqual([span.startUs * 1000, span.endUs * 1000]))
  })

  test('every CUDA API call with a duration lies inside a frame of the main thread', () => {
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed, seed % 2 === 0 ? ROUGH : DEFAULT_JITTER)
      const frames = merged(intervalsOf(trace, (v) => v.kind === 'cpu-thread'))
      for (const v of viewsOf(trace).filter((x) => x.kind === 'cuda-api' && x.durNs > 0)) {
        // Frames are disjoint and in order, so the one that could hold a call is the last that starts at or before it.
        const frame = frames.filter(([a]) => a <= v.startNs).at(-1)
        expect(frame !== undefined && v.endNs <= frame[1], `seed ${seed}: ${v.name} at ${v.startNs} to ${v.endNs}`).toBe(true)
      }
    }
  })
})

describe('traceFromRun: launches and kernels', () => {
  /** The GPU work of one forward, in time order. */
  const forwardOf = (views: ReturnType<typeof viewsOf>, forward: { startUs: number; endUs: number }) =>
    startingIn(views, forward.startUs * 1000, forward.endUs * 1000).filter((v) => v.kind === 'gpu-stream')

  test('a forward is a copy in, kernelsPerForward kernels in the layer\'s order, and a copy out, end to end from the forward\'s first ns to its last', () => {
    for (const seed of SAMPLE.slice(0, 24)) {
      const { run } = runOf(seed)
      const views = viewsOf(traceFromRun(run, seed))
      for (const forward of run.lanes['gpu-stream']) {
        const rows = forwardOf(views, forward)
        const ctx = `seed ${seed}, step ${forward.step}`
        expect(rows.map((v) => v.name).slice(0, 4), ctx).toEqual(['memcpy HtoD', 'rms_norm', 'qkv_proj', 'rope'])
        expect(rows.map((v) => v.cat), ctx).toEqual(['copy', ...Array(24).fill('kernel'), 'copy'])
        expect(rows[rows.length - 1].name, ctx).toBe('memcpy DtoH')
        expect(rows[0].startNs, ctx).toBe(forward.startUs * 1000)
        expect(rows[rows.length - 1].endNs, ctx).toBe(forward.endUs * 1000)
        rows.slice(1).forEach((v, i) => expect(v.startNs, ctx).toBe(rows[i].endNs))
        for (const v of rows) expect(v.durNs, ctx).toBeGreaterThan(0)
      }
    }
  })

  test('the copies are about copyPermille of the forward each, and the kernels\' shares follow the layer\'s table without jitter', () => {
    const { run } = runOf(2)
    const views = viewsOf(traceFromRun(run, 2, CLEAN_JITTER))
    const forward = run.lanes['gpu-stream'][3]
    const rows = forwardOf(views, forward)
    const length = (forward.endUs - forward.startUs) * 1000
    for (const copy of [rows[0], rows[rows.length - 1]]) expect(Math.abs(copy.durNs - length * 0.025)).toBeLessThan(length * 0.002)
    // Without jitter, the same kernel of every layer has the same time to within the ns the split rounds by.
    const attention = rows.filter((v) => v.name === 'attention').map((v) => v.durNs)
    expect(attention).toHaveLength(3)
    expect(Math.max(...attention) - Math.min(...attention)).toBeLessThanOrEqual(1)
  })

  test('an eager step has a launch call for each kernel, in its launch frame, each with a correlation id of its own', () => {
    let checked = 0
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const views = viewsOf(traceFromRun(run, seed))
      for (const forward of run.lanes['gpu-stream']) {
        const launchFrame = run.lanes['cpu-main'].find((s) => s.step === forward.step && s.kind === 'launch')
        if (run.steps[forward.step].graph === 'hit' || launchFrame === undefined) continue
        const kernels = forwardOf(views, forward).filter((v) => v.cat === CAT_KERNEL)
        const calls = startingIn(views, launchFrame.startUs * 1000 - 250, launchFrame.endUs * 1000 + 250).filter((v) => v.kind === 'cuda-api' && v.name === 'cudaLaunchKernel')
        const ctx = `seed ${seed}, step ${forward.step}`
        expect(calls, ctx).toHaveLength(24)
        expect(new Set(kernels.map((v) => v.corr)).size, ctx).toBe(24)
        expect(kernels.map((v) => v.corr).sort((a, b) => a - b), ctx).toEqual(calls.map((v) => v.corr).sort((a, b) => a - b))
        for (const call of calls) expect(call.cat, ctx).toBe(CAT_LAUNCH)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  test('a graph replay is one call, and all its kernels carry its correlation id', () => {
    let replays = 0
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const views = viewsOf(traceFromRun(run, seed))
      const api = views.filter((v) => v.kind === 'cuda-api')
      for (const forward of run.lanes['gpu-stream']) {
        if (run.steps[forward.step].graph !== 'hit') continue
        const kernels = forwardOf(views, forward).filter((v) => v.cat === CAT_KERNEL)
        expect(new Set(kernels.map((v) => v.corr)).size, `seed ${seed}, step ${forward.step}`).toBe(1)
        expect(api.filter((v) => v.corr === kernels[0].corr).map((v) => v.name), `seed ${seed}, step ${forward.step}`).toEqual(['cudaGraphLaunch'])
        replays++
      }
    }
    expect(replays).toBeGreaterThan(20)
  })

  test('a step with no launch frame, as on the front page, launches with instants at the moment the CPU finished, before its forward', () => {
    const { run } = runOf(1)
    expect(run.lanes['cpu-main'].some((s) => s.kind === 'launch')).toBe(false)
    const trace = traceFromRun(run, 1)
    const views = viewsOf(trace)
    const calls = views.filter((v) => v.kind === 'cuda-api' && v.cat !== CAT_SYNC)
    expect(calls).toHaveLength(run.lanes['gpu-stream'].length * 3)
    for (const call of calls) expect(call.durNs).toBe(0)
    for (const forward of run.lanes['gpu-stream']) {
      const schedule = run.lanes['cpu-main'].find((s) => s.step === forward.step && s.kind === 'schedule')!
      // The calls sit at the end of the step's schedule frame (give or take the jitter on a boundary it shares), and no later than the forward.
      const at = calls.filter((v) => v.startNs >= schedule.endUs * 1000 - 250 && v.startNs <= forward.startUs * 1000)
      expect(at.length, `step ${forward.step}`).toBeGreaterThanOrEqual(3)
    }
    expect(traceChecks(trace).every((c) => c.pass)).toBe(true)
  })

  test('every piece of GPU work has one flow into it from the call that launched it, and the flow runs forward in time', () => {
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const views = viewsOf(trace)
      const into = new Map<number, number[]>()
      for (const [i, flow] of trace.flows.entries()) into.set(flow.to, [...(into.get(flow.to) ?? []), i])
      for (const v of views.filter(isGpuWork)) {
        const flows = (into.get(v.index) ?? []).map((i) => trace.flows[i])
        expect(flows, `seed ${seed}, span ${v.index}`).toHaveLength(1)
        const from = views[flows[0].from]
        expect(from.kind).toBe('cuda-api')
        expect(from.corr).toBe(v.corr)
        expect(flows[0].kind).toBe(v.cat === CAT_KERNEL ? 'launch' : 'copy')
        expect(from.startNs).toBeLessThanOrEqual(v.startNs)
      }
    }
  })

  test('each blocking call is `cudaStreamSynchronize`, lies inside its sync frame and ends after the GPU work it waited for, which a sync flow joins to it', () => {
    let syncs = 0
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const views = viewsOf(trace)
      const calls = views.filter((v) => v.kind === 'cuda-api' && v.cat === CAT_SYNC)
      const frames = views.filter((v) => v.kind === 'cpu-thread' && v.name === 'sync')
      expect(calls.length, `seed ${seed}`).toBe(run.lanes['cpu-main'].filter((s) => s.kind === 'sync').length)
      expect(frames.length).toBe(calls.length)
      const syncFlows = trace.flows.filter((f) => f.kind === 'sync')
      expect(syncFlows).toHaveLength(calls.length)
      for (const flow of syncFlows) {
        const call = views[flow.to]
        const waited = views[flow.from]
        expect(call.name).toBe('cudaStreamSynchronize')
        expect(waited.name).toBe('memcpy DtoH')
        expect(waited.endNs, `seed ${seed}`).toBeLessThanOrEqual(call.startNs)
        expect(frames.some((f) => f.startNs <= call.startNs && call.endNs <= f.endNs), `seed ${seed}`).toBe(true)
        syncs++
      }
    }
    expect(syncs).toBeGreaterThan(300)
  })

  test('the step marks are where the first forward starts and where each forward ends, and nothing else is marked', () => {
    for (const seed of SAMPLE) {
      const { run } = runOf(seed)
      const trace = traceFromRun(run, seed)
      const gpu = run.lanes['gpu-stream']
      expect(trace.marks.map((m) => m.tNs), `seed ${seed}`).toEqual(gpu.length === 0 ? [] : [gpu[0].startUs * 1000, ...gpu.map((s) => s.endUs * 1000)])
      for (const m of trace.marks) expect(trace.strings[m.name]).toBe(STEP_MARK)
    }
  })

  test('the vocabulary: three tracks, and the categories each kind of track carries', () => {
    const { run } = runOf(2)
    const trace = traceFromRun(run, 2)
    expect(trace.tracks.map((t) => [t.id, t.kind, trace.strings[t.name]])).toEqual([
      [0, 'cpu-thread', 'engine core main thread'],
      [1, 'cuda-api', 'CUDA API'],
      [2, 'gpu-stream', 'GPU stream 0'],
    ])
    const views = viewsOf(trace)
    const cats = (kind: string) => new Set(views.filter((v) => v.kind === kind).map((v) => v.cat))
    // The main thread's frames are the run's phases, named for them. This run has no sample phase: the 70B card puts the per-sequence host work in the schedule.
    expect(cats('cpu-thread')).toEqual(new Set(run.lanes['cpu-main'].map((s) => s.kind)))
    expect(cats('cpu-thread')).toEqual(new Set(['schedule', 'prepare', 'launch', 'sync']))
    expect(cats('cuda-api')).toEqual(new Set([CAT_COPY, CAT_LAUNCH, CAT_SYNC]))
    expect(cats('gpu-stream')).toEqual(new Set([CAT_COPY, CAT_KERNEL]))
    expect(trace.meta).toEqual({ source: 'synthetic', synthetic: true })
    // Every string in the table is used by something.
    const used = new Set<number>([...trace.tracks.map((t) => t.name), ...trace.spans.name, ...trace.spans.cat, ...trace.marks.map((m) => m.name)])
    expect(used.size).toBe(trace.strings.length)
  })
})

describe('traceFromRun: the seed and the jitter', () => {
  test('is a function of the run, the seed and the jitter: the same arguments give the same bytes, and another seed or another jitter other bytes', () => {
    for (const seed of SAMPLE.slice(0, 12)) {
      const { run } = runOf(seed)
      const text = encodeTrace(traceFromRun(run, seed))
      expect(encodeTrace(traceFromRun(run, seed))).toBe(text)
      expect(encodeTrace(traceFromRun(run, seed + 1000))).not.toBe(text)
      expect(encodeTrace(traceFromRun(run, seed, ROUGH))).not.toBe(text)
      // The default jitter is what the third argument defaults to.
      expect(encodeTrace(traceFromRun(run, seed, DEFAULT_JITTER))).toBe(text)
    }
  })

  test('without jitter the seed changes nothing: a clean trace is the run\'s alone', () => {
    for (const seed of SAMPLE.slice(0, 12)) {
      const { run } = runOf(seed)
      expect(encodeTrace(traceFromRun(run, 1, CLEAN_JITTER))).toBe(encodeTrace(traceFromRun(run, 0xffffffff, CLEAN_JITTER)))
    }
  })

  test('kernelsPerForward is honoured, down to one kernel and up to two hundred', () => {
    const { run } = runOf(2)
    for (const [jitter, kernels] of [[TINY, 1], [HUGE, 200], [{ ...DEFAULT_JITTER, kernelsPerForward: 5 }, 5]] as [JitterSpec, number][]) {
      const trace = traceFromRun(run, 2, jitter)
      const first = run.lanes['gpu-stream'][0]
      const rows = rowsWhere(trace, (v) => v.kind === 'gpu-stream' && v.startNs >= first.startUs * 1000 && v.endNs <= first.endUs * 1000)
      expect(rows).toHaveLength(kernels + 2)
    }
    // A forward of one µs is 1,000 ns, which holds 200 kernels and two copies, and so does the tick world's forward of 4 µs.
    const ticks = traceFromRun(runOf(1).run, 1, HUGE)
    expect(traceChecks(ticks).every((c) => c.pass)).toBe(true)
  })

  test('spreadPermille spreads the kernels: none gives equal shares, and the widest gives some that differ by a third or more', () => {
    const { run } = runOf(2)
    // The attention kernels of one forward, which the layer's table gives one share each.
    const first = run.lanes['gpu-stream'][0]
    const ratio = (jitter: JitterSpec) => {
      const trace = traceFromRun(run, 2, jitter)
      const attention = rowsWhere(trace, (v) => v.name === 'attention' && v.startNs >= first.startUs * 1000 && v.endNs <= first.endUs * 1000).map((i) => trace.spans.durNs[i])
      expect(attention).toHaveLength(3)
      return Math.max(...attention) / Math.min(...attention)
    }
    expect(ratio(CLEAN_JITTER)).toBeLessThan(1.05)
    expect(ratio({ ...DEFAULT_JITTER, spreadPermille: 900 })).toBeGreaterThan(1.3)
  })

  test('launchGapPermille leaves that share of an eager launch frame idle between its calls; none packs them end to end', () => {
    const { run } = runOf(2)
    const frame = run.lanes['cpu-main'].find((s) => s.kind === 'launch')!
    const forward = run.lanes['gpu-stream'].find((s) => s.step === frame.step)!
    const idleShare = (jitter: JitterSpec) => {
      const trace = traceFromRun(run, 2, jitter)
      const calls = rowsWhere(trace, (v) => v.kind === 'cuda-api' && v.name === 'cudaLaunchKernel' && v.startNs >= frame.startUs * 1000 - 250 && v.endNs <= forward.startUs * 1000)
      const covered = calls.reduce((total, i) => total + trace.spans.durNs[i], 0)
      return 1 - covered / ((frame.endUs - frame.startUs) * 1000)
    }
    expect(idleShare({ ...CLEAN_JITTER, launchGapPermille: 0 })).toBeLessThan(0.1)
    expect(Math.abs(idleShare({ ...CLEAN_JITTER, launchGapPermille: 600 }) - 0.6)).toBeLessThan(0.1)
  })
})

describe('traceFromRun: its input', () => {
  const run = runOf(2).run
  const lane = (kind: 'cpu-main' | 'gpu-stream', spans: StepLoopRun['lanes']['cpu-main']): StepLoopRun => ({ ...run, lanes: { ...run.lanes, [kind]: spans } })

  test('refuses a seed that is not an unsigned 32-bit integer', () => {
    for (const bad of [-1, 2 ** 32, 1.5, Number.NaN]) expect(() => traceFromRun(run, bad)).toThrow(RangeError)
    for (const good of [0, 1, 0xffffffff]) expect(() => traceFromRun(run, good)).not.toThrow()
  })

  test('refuses a jitter outside its ranges, naming the field', () => {
    const bad: [keyof JitterSpec, number][] = [
      ['kernelsPerForward', 0],
      ['kernelsPerForward', 201],
      ['kernelsPerForward', 1.5],
      ['spreadPermille', -1],
      ['spreadPermille', 901],
      ['copyPermille', 0],
      ['copyPermille', 101],
      ['launchGapPermille', 901],
      ['cpuNoiseNs', 251],
      ['cpuNoiseNs', -1],
    ]
    for (const [field, value] of bad) expect(() => traceFromRun(run, 1, { ...DEFAULT_JITTER, [field]: value }), `${field} ${value}`).toThrow(new RegExp(`${field} is an integer from`))
    for (const [field, value] of [['kernelsPerForward', 200], ['spreadPermille', 900], ['copyPermille', 100], ['launchGapPermille', 900], ['cpuNoiseNs', 250], ['cpuNoiseNs', 0]] as const) {
      expect(() => traceFromRun(run, 1, { ...DEFAULT_JITTER, [field]: value }), `${field} ${value}`).not.toThrow()
    }
  })

  test('refuses a lane that is out of order, overlaps, holds an empty span or a forward on the CPU lane, or runs beyond 2^53 ns', () => {
    const cpu = run.lanes['cpu-main']
    const gpu = run.lanes['gpu-stream']
    const cases: [string, StepLoopRun, RegExp][] = [
      ['an overlap', lane('cpu-main', [cpu[0], { ...cpu[1], startUs: cpu[0].endUs - 1 }]), /after a span that ended at/],
      ['an empty span', lane('cpu-main', [{ ...cpu[0], endUs: cpu[0].startUs }]), /no empty span/],
      ['spans out of order', lane('gpu-stream', [gpu[1], gpu[0]]), /in time order/],
      ['a forward on the CPU lane', lane('cpu-main', [{ ...cpu[0], kind: 'forward' }]), /does not belong on the main thread's lane/],
      ['a fractional time', lane('cpu-main', [{ ...cpu[0], startUs: 0.5 }]), /in time order/],
      ['a negative step', lane('cpu-main', [{ ...cpu[0], step: -1 }]), /is not a step index/],
      ['a time beyond 2^53 ns', lane('gpu-stream', [{ ...gpu[0], endUs: 9_007_199_254_741 }]), /beyond 2\^53 ns/],
    ]
    for (const [what, bad, message] of cases) expect(() => traceFromRun(bad, 1), what).toThrow(message)
  })

  test('writes an empty trace for a run with no spans, and a trace for a forward with no CPU work before it', () => {
    const none: StepLoopRun = { ...run, lanes: { 'cpu-main': [], 'gpu-stream': [] }, steps: [], reqs: [] }
    const empty = traceFromRun(none, 1)
    expect([empty.spans.track.length, empty.marks.length, empty.tracks.length]).toEqual([0, 0, 3])
    expect(traceChecks(empty).every((c) => c.pass)).toBe(true)
    expect(attributeSteps(empty)).toEqual([])

    const alone: StepLoopRun = { ...none, lanes: { 'cpu-main': [], 'gpu-stream': [{ step: 0, kind: 'forward', startUs: 5, endUs: 6 }] } }
    const t = traceFromRun(alone, 1)
    expect(traceChecks(t).every((c) => c.pass)).toBe(true)
    expect(t.marks.map((m) => m.tNs)).toEqual([5000, 6000])
    expect(attributeSteps(t)).toMatchObject([{ windowNs: 1000, gpuBusyNs: 1000, cpuGapNs: 0, bothIdleNs: 0 }])
    // With no frame before it, the three calls that launched it are instants at the forward's own start.
    expect(rowsWhere(t, (v) => v.kind === 'cuda-api').map((i) => [spanView(t, i).startNs, spanView(t, i).durNs])).toEqual([[5000, 0], [5000, 0], [5000, 0]])
  })

  test('reads every span of the GPU lane as GPU work, whatever its kind, so a new kind of span in a later step loop needs no change', () => {
    const odd = lane('gpu-stream', run.lanes['gpu-stream'].map((s) => ({ ...s, kind: 'verify' as never })))
    expect(encodeTrace(traceFromRun(odd, 4))).toBe(encodeTrace(traceFromRun(run, 4)))
  })

  test('takes a run whose step records are missing as eager, and ignores lanes it does not know', () => {
    const noStats = { ...run, steps: [] }
    expect(traceChecks(traceFromRun(noStats, 1)).every((c) => c.pass)).toBe(true)
    const extra = { ...run, lanes: { ...run.lanes, 'cpu-mask': [{ step: 0, kind: 'schedule', startUs: 0, endUs: 5 }] } } as unknown as StepLoopRun
    expect(encodeTrace(traceFromRun(extra, 3))).toBe(encodeTrace(traceFromRun(run, 3)))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Size

describe('a long trace', () => {
  test('is attributed window by window in one pass over its spans: 100,000 spans take a small fraction of a second', () => {
    // 260 steps of a launch and a forward, and 200 kernels a forward: about 400 spans a step.
    const rng = rngFor(5, 'test/trace/long')
    const base = runOf(2).run
    const steps = 260
    const cpu = []
    const gpu = []
    let at = 0
    for (let step = 0; step < steps; step++) {
      const launch = between(rng, 20, 40)
      const forward = between(rng, 800, 1200)
      cpu.push({ step, kind: 'schedule' as const, startUs: at, endUs: at + 10 }, { step, kind: 'launch' as const, startUs: at + 10, endUs: at + 10 + launch })
      gpu.push({ step, kind: 'forward' as const, startUs: at + 10 + launch, endUs: at + 10 + launch + forward })
      at += 10 + launch + forward + below(rng, 5)
    }
    const run: StepLoopRun = { ...base, lanes: { 'cpu-main': cpu, 'gpu-stream': gpu }, steps: [] }
    const trace = traceFromRun(run, 9, HUGE)
    expect(spanCount(trace)).toBeGreaterThan(100_000)
    const started = performance.now()
    const windows = attributeSteps(trace)
    const elapsed = performance.now() - started
    expect(windows).toHaveLength(steps)
    // Generous. For this trace (105,560 spans, 260 windows) the medians of 9 warm runs were 4.5 ms for attributeSteps, 21 ms for traceChecks
    // and 42 ms to generate it, with 250 ms to encode it as 4.98 MB of canonical JSON and 97 ms to decode it [measured 2026-11-04 on c80dfad
    // with this task's change applied, Bun 1.3.14 on Linux 6.12.63 and a 13th Gen Intel Core i5-13600KF, the dev host]. A pass over the
    // trace for every window would take seconds.
    expect(elapsed).toBeLessThan(1500)
    expect(traceChecks(trace).every((c) => c.pass)).toBe(true)
  })
})

