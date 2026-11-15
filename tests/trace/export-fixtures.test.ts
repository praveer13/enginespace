/*
 * W2-T19, accept 2: the TypeScript side of the exporter's cross-language test. The grader's `enginespace trace export` (labs/grader, Python) wrote the two
 * goldens in labs/grader/tests/synthetic/trace/ from a torch-profiler Chrome trace and from an Nsight Systems SQLite export, both synthetic, and the Python tests
 * (test_trace_export.py) hold the exporter to those bytes. Here the site's own code reads them:
 *
 *   - `decodeTrace` takes the text and `encodeTrace` writes it back to the same bytes, so a trace's hash is the same in Python and in the browser (§9.8);
 *   - the zod schema that the grader's JSON Schema is exported from takes it;
 *   - `traceChecks` passes: structure, T2, T3, T4 and T5, each over something (a check over nothing is not a pass);
 *   - the attribution partitions every window to the ns (T7), and the window of a step is the one its marks cut;
 *   - what the exporter was meant to do shows in the columns: a graph replay is one launch for all its nodes, the thread that is not the main one is not in the trace,
 *     and the path in a Python frame's name was scrubbed before the trace was written.
 * The goldens are labelled synthetic: no GPU and no profiler ran.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { traceSchema } from '@es/schema/trace'
import { attributeSteps, decodeTrace, encodeTrace, stepWindows, traceBuilder, traceChecks } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { root } from '../schema/support'

const DIR = 'labs/grader/tests/synthetic/trace'
const GOLDENS = ['torch-profiler-steps.trace.json', 'nsys-export-steps.trace.json'] as const

const text = (name: string): string => readFileSync(path.join(root, DIR, name), 'utf8')
const names = (t: EsTrace, column: Int32Array): string[] => Array.from(column, (i) => t.strings[i])

describe.each(GOLDENS)('the exporter wrote %s', (golden) => {
  const source = text(golden)
  const trace = decodeTrace(source)

  test('reads and writes back to the same bytes, so the hash is the one the grader computed', () => {
    expect(encodeTrace(trace)).toBe(source)
  })

  test('is a trace@1 to the zod schema that the grader validates with, and says that it is synthetic', () => {
    expect(traceSchema.safeParse(JSON.parse(source)).success).toBe(true)
    expect(trace.meta.source).toBe('synthetic')
    expect(trace.meta.synthetic).toBe(true)
    expect(trace.meta.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test('passes traceChecks: structure, T2, T3, T4 and T5, each over something', () => {
    const results = traceChecks(trace)
    expect(results.map((r) => r.id)).toEqual(['structure', 'T2', 'T3', 'T4', 'T5'])
    for (const r of results) expect([r.id, r.pass, r.detail]).toEqual([r.id, true, r.detail])
    for (const r of results) expect(r.checked).toBeGreaterThan(0)
  })

  test('has three step windows that follow each other, and each partitions to the ns', () => {
    const windows = stepWindows(trace)
    expect(windows).toHaveLength(3)
    for (let i = 1; i < windows.length; i++) expect(windows[i].fromNs).toBe(windows[i - 1].toNs)
    for (const a of attributeSteps(trace)) {
      expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs).toBe(a.windowNs)
      expect(a.kernelNs + a.copyOnlyNs).toBe(a.gpuBusyNs)
      expect(a.gpuBusyNs).toBeGreaterThan(0)
    }
  })

  test('shows a graph replay as one launch call for its three nodes, which share its correlation id', () => {
    const { spans } = trace
    const name = names(trace, spans.name)
    const graph = name.flatMap((n, i) => (n === 'cudaGraphLaunch' ? [i] : []))
    expect(graph).toHaveLength(1)
    const corr = spans.corr[graph[0]]
    const kernels = name.flatMap((_, i) => (spans.corr[i] === corr && trace.strings[spans.cat[i]] === 'kernel' ? [i] : []))
    expect(kernels).toHaveLength(3)
    const launched = trace.flows.filter((f) => f.from === graph[0] && f.kind === 'launch').map((f) => f.to)
    expect(launched.sort((a, b) => a - b)).toEqual(kernels)
  })

  test('keeps the engine main thread only, and keeps no path, user or host out of its names', () => {
    expect(trace.strings).not.toContain('aten::copy_')
    expect(trace.strings.join('\n')).not.toMatch(/\/(?:srv|home|tmp|usr)\//)
    expect(trace.tracks.map((t) => t.kind).filter((k) => k === 'cpu-thread').length).toBeLessThanOrEqual(1)
  })

  test('has the work launched off the main thread without a correlation id, which T4 allows of a copy', () => {
    const { spans } = trace
    const copies = Array.from(spans.cat, (c, i) => (trace.strings[c] === 'copy' && trace.strings[trace.tracks[spans.track[i]].name].startsWith('GPU') ? i : -1)).filter((i) => i >= 0)
    expect(copies.some((i) => spans.corr[i] === -1)).toBe(true)
  })
})

describe('the goldens are exports of different captures of one story', () => {
  test('a torch capture and an nsys export of the same run have the same GPU work and the same windows', () => {
    const torch = decodeTrace(text(GOLDENS[0]))
    const nsys = decodeTrace(text(GOLDENS[1]))
    expect(stepWindows(torch)).toEqual(stepWindows(nsys))
    const work = (t: EsTrace) => Array.from(t.spans.startNs, (s, i) => [s, t.spans.durNs[i], t.strings[t.spans.cat[i]]] as const).filter((row) => row[2] === 'kernel' || row[2] === 'copy')
    expect(work(torch)).toEqual(work(nsys))
  })

  test('a golden that was edited into a broken trace fails the check that says so', () => {
    const trace = decodeTrace(text(GOLDENS[0]))
    const kernel = names(trace, trace.spans.cat).indexOf('kernel')
    const broken = { ...trace, spans: { ...trace.spans, startNs: Float64Array.from(trace.spans.startNs) } }
    broken.spans.startNs[kernel] = broken.spans.startNs[kernel] - 10_000_000
    const failed = traceChecks(broken).filter((r) => !r.pass).map((r) => r.id)
    expect(failed).toContain('T2')
  })
})

describe('the builder of the exporter and the builder of the site write one text', () => {
  test('tiny.trace.json is what packages/sim/trace builds from the same calls as test_trace_model.py makes in Python', () => {
    const out = traceBuilder()
    const cpu = out.track('cpu-thread', 'main \u00e9\u65e5')
    const api = out.track('cuda-api', 'CUDA API')
    const gpu = out.track('gpu-stream', 'stream 7')
    out.span(gpu, 50, 30, 'k\u00e9rnel', 'kernel', 1)
    out.span(cpu, 10, 5, 'inner', 'cpu_op')
    const launch = out.span(api, 10, 3, 'cudaLaunchKernel', 'launch', 1)
    out.span(cpu, 10, 40, 'frame', 'cpu_op')
    out.span(gpu, 80, 0, 'instant', 'kernel', -1)
    out.flow(launch, 0, 'launch')
    out.mark(80, 'step')
    out.mark(10, 'step')
    out.mark(10, 'nvtx')
    const built = out.build({ source: 'synthetic', synthetic: true, engine: 'example-engine' })
    expect(encodeTrace(built)).toBe(text('tiny.trace.json'))
  })
})
