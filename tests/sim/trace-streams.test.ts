/*
 * The option of `traceFromRun` that draws a second GPU stream: with it off nothing changes, with it on GPU-busy is the union over
 * the streams and the structural checks pass.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { RunnerPresetId } from '../../packages/sim/host'
import type { PhysicsRowKey } from '../../packages/sim/physics'
import { TICK_CARD, defaultCaptureSizes, runStepLoop, s5Card } from '../../packages/sim/steploop'
import type { S5HostTerm, StepLoopConfig } from '../../packages/sim/steploop'
import { CAT_COPY, CAT_KERNEL, DEFAULT_JITTER, attributeSteps, encodeTrace, traceChecks, traceFromRun } from '../../packages/sim/trace'
import type { EsTrace, JitterSpec } from '../../packages/sim/trace'
import { genWorkload } from '../../packages/sim/workload'
import type { WorkloadSpec } from '../../packages/sim/workload'
import { EAGER } from './steploop-support'
import { ROUGH, SEEDS, runOf, runTruth } from './trace-support'

const root = path.resolve(import.meta.dirname, '../..')
const two = { secondStream: true } as const
const CHUNK = 100
const chunks = Array.from({ length: Math.ceil(SEEDS.length / CHUNK) }, (_, i) => SEEDS.slice(i * CHUNK, (i + 1) * CHUNK))

const gpuTracks = (t: EsTrace) => t.tracks.filter((x) => x.kind === 'gpu-stream')

describe('the option off', () => {
  test('every existing golden is byte-identical with the option off, given as false and as left out', () => {
    const fixture = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/sim/trace.json'), 'utf8')) as {
      vectors: {
        name: string
        input: {
          run: {
            workload: { seed: number; spec: WorkloadSpec }
            config: Omit<StepLoopConfig, 'graphs'> & { graphs: { mode: 'NONE' } | { mode: 'FULL'; captureSizes: { defaultMax: number } } }
            host: 'tick' | RunnerPresetId
            gpu: { card: 'tick' } | { card: 's5'; row: PhysicsRowKey; tp: number; hostTerm: S5HostTerm }
            horizonUs: number
          }
          seed: number
          jitter: JitterSpec
        }
      }[]
    }
    expect(fixture.vectors.length).toBeGreaterThan(0)
    for (const { name, input } of fixture.vectors) {
      const r = input.run
      const cfg: StepLoopConfig = {
        ...r.config,
        graphs: r.config.graphs.mode === 'NONE' ? EAGER : { mode: 'FULL', captureSizes: defaultCaptureSizes(r.config.graphs.captureSizes.defaultMax) },
      }
      const host = r.host === 'tick' ? TICK_CARD : HOST_PRESETS[r.host].card
      const gpu = r.gpu.card === 'tick' ? TICK_CARD : s5Card(r.gpu.row, r.gpu.tp, r.gpu.hostTerm)
      const run = runStepLoop(genWorkload(r.workload.seed, r.workload.spec), cfg, host, gpu, { horizonUs: r.horizonUs })
      const plain = encodeTrace(traceFromRun(run, input.seed, input.jitter))
      expect(encodeTrace(traceFromRun(run, input.seed, input.jitter, { secondStream: false })), name).toBe(plain)
      expect(encodeTrace(traceFromRun(run, input.seed, input.jitter, {})), name).toBe(plain)
      expect(gpuTracks(traceFromRun(run, input.seed, input.jitter)), name).toHaveLength(1)
    }
  })
})

describe('two streams', () => {
  const nameOf = (t: EsTrace, id: number) => t.strings[t.tracks.find((x) => x.id === id)!.name]

  test('the trace has two gpu-stream tracks, the copies on the second and the kernels on the first', () => {
    const { run } = runOf(3)
    const t = traceFromRun(run, 3, DEFAULT_JITTER, two)
    expect(gpuTracks(t).map((x) => t.strings[x.name])).toEqual(['GPU stream 0', 'GPU stream 1'])
    const onCopy = new Set<string>()
    const gpuIds = new Set(gpuTracks(t).map((x) => x.id))
    let kernels = 0
    let copies = 0
    for (let i = 0; i < t.spans.track.length; i++) {
      if (!gpuIds.has(t.spans.track[i])) continue
      const cat = t.strings[t.spans.cat[i]]
      const stream = nameOf(t, t.spans.track[i])
      if (cat === CAT_KERNEL) {
        kernels++
        expect(stream).toBe('GPU stream 0')
      } else if (cat === CAT_COPY) {
        copies++
        onCopy.add(stream)
      }
    }
    expect(kernels).toBeGreaterThan(0)
    expect(copies).toBeGreaterThan(0)
    expect([...onCopy]).toEqual(['GPU stream 1'])
  })

  test('the option changes only the track of the copies: every other column is that of one stream', () => {
    const { run } = runOf(5)
    const one = traceFromRun(run, 5)
    const both = traceFromRun(run, 5, DEFAULT_JITTER, two)
    // The string table gains the second track's name, so strings are compared as text.
    for (const col of ['startNs', 'durNs', 'corr'] as const) expect(Array.from(both.spans[col])).toEqual(Array.from(one.spans[col]))
    for (const col of ['name', 'cat'] as const) expect(Array.from(both.spans[col], (i) => both.strings[i])).toEqual(Array.from(one.spans[col], (i) => one.strings[i]))
    expect(Array.from(both.spans.track, (id) => (gpuTracks(both).some((x) => x.id === id) ? 'gpu' : 'other'))).toEqual(Array.from(one.spans.track, (id) => (gpuTracks(one).some((x) => x.id === id) ? 'gpu' : 'other')))
    expect(both.marks.map((m) => [m.tNs, both.strings[m.name]])).toEqual(one.marks.map((m) => [m.tNs, one.strings[m.name]]))
    expect(both.flows).toEqual(one.flows)
    expect(encodeTrace(both)).toBe(encodeTrace(traceFromRun(run, 5, DEFAULT_JITTER, two)))
  })

  for (const [c, seeds] of chunks.entries()) {
    test(`GPU-busy is the union over the streams, recovers the run's truth, and traceChecks passes (seeds chunk ${c + 1} of ${chunks.length})`, () => {
      for (const seed of seeds) {
        const { run } = runOf(seed)
        const truth = runTruth(run)
        for (const jitter of [DEFAULT_JITTER, ROUGH]) {
          const t = traceFromRun(run, seed, jitter, two)
          const checks = traceChecks(t)
          expect(checks.map((x) => x.id), `seed ${seed}`).toEqual(['structure', 'T2', 'T3', 'T4', 'T5'])
          expect(checks.filter((x) => !x.pass).map((x) => `${x.id}: ${x.detail}`), `seed ${seed}`).toEqual([])
          const got = attributeSteps(t)
          expect(got.length, `seed ${seed}`).toBe(truth.length)
          got.forEach((a, i) => {
            expect(a.gpuBusyNs, `seed ${seed} step ${i}`).toBe(truth[i].gpuUs * 1000)
            expect(a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs).toBe(a.windowNs)
          })
          // What the two-stream trace says of every window is what the one-stream trace says.
          expect(got, `seed ${seed}`).toEqual(attributeSteps(traceFromRun(run, seed, jitter)))
        }
      }
    })
  }

  test('stream 0 is empty while a copy runs, and stream 1 covers it', () => {
    const { run } = runOf(7)
    const t = traceFromRun(run, 7, DEFAULT_JITTER, two)
    const [s0, s1] = gpuTracks(t)
    const spans = (id: number) => Array.from(t.spans.track, (tr, i) => (tr === id ? i : -1)).filter((i) => i >= 0 && t.spans.durNs[i] > 0)
    const a = spans(s0.id)
    const b = spans(s1.id)
    expect(a.length).toBeGreaterThan(0)
    expect(b.length).toBeGreaterThan(0)
    for (const j of b) {
      const lo = t.spans.startNs[j]
      const hi = lo + t.spans.durNs[j]
      expect(a.some((i) => t.spans.startNs[i] < hi && lo < t.spans.startNs[i] + t.spans.durNs[i])).toBe(false)
    }
  })
})
