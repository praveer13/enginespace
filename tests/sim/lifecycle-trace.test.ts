/*
 * W1-T16's second acceptance check, "synthetic traces pass traceChecks" (ARCHITECTURE §5.7, §5.8), and what makes the traces fit for TR1's
 * span checks (GAMES.md §5, W1-T19):
 *
 *   - `traceChecks` passes every scenario's trace under every seed tried: 24 seeds of each of the 88 scenarios, and 200 seeds [estimated,
 *     ARCHITECTURE §5.10] of the longest path of each engine. Each of the five checks looks at something: the traces have kernels, copies, API
 *     spans and one step window;
 *   - the stage spans are the path, one span for each stage, strictly in its order, and a CUDA API span is not a stage;
 *   - the GPU's work is where the ASSESSMENT's fork rule wants it: copies sit between the compute they feed, and a sync span ends after the GPU
 *     work it waits for;
 *   - the trace is one step window that `attribute` partitions exactly, round-trips through `trace@1`, is marked synthetic, and is a function
 *     of the scenario, the seed and the jitter;
 *   - the checks are not vacuous on these traces: a defect made by hand fails the one check it breaks.
 */
import { describe, expect, test } from 'bun:test'
import {
  CLEAN_LIFECYCLE_JITTER,
  DEFAULT_LIFECYCLE_JITTER,
  ENGINE_IDS,
  NOMINAL_NS,
  describeScenario,
  lifecycleTrace,
  referencePath,
  scenarios,
  stageIds,
  stageSpans,
} from '../../packages/sim/lifecycle'
import type { EngineId, Scenario } from '../../packages/sim/lifecycle'
import { CAT_COPY, CAT_KERNEL, CAT_SYNC, STEP_MARK, attributeSteps, cloneTrace, decodeTrace, encodeTrace, spanView, traceChecks, validateTrace } from '../../packages/sim/trace'
import type { EsTrace } from '../../packages/sim/trace'
import { seeds } from '../seeds'

const ALL = scenarios()
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)
/** 200 seeds on a PR, 10,000 nightly (ARCHITECTURE §5.10) [estimated]: tests/seeds.ts has the knob. */
const MANY = seeds(1)
const failing = (t: EsTrace): string[] => traceChecks(t).filter((c) => !c.pass).map((c) => c.id)

/** The longest path of an engine: the scenario with the most stages. */
function longest(engine: EngineId): Scenario {
  return scenarios(engine).reduce((a, b) => (referencePath(b).length > referencePath(a).length ? b : a))
}

describe('check 2: traceChecks passes the synthetic traces', () => {
  test('of every scenario, under 24 seeds, with all five checks run and looking at something', () => {
    let kernels = 0
    let copies = 0
    for (const sc of ALL) {
      for (const seed of SEEDS) {
        const checks = traceChecks(lifecycleTrace(sc, seed))
        const where = `${describeScenario(sc)}, seed ${seed}`
        expect([where, checks.map((c) => c.id)]).toEqual([where, ['structure', 'T2', 'T3', 'T4', 'T5']])
        expect([where, checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.detail}`)]).toEqual([where, []])
        kernels += checks.find((c) => c.id === 'T5')?.checked ?? 0
        copies += (checks.find((c) => c.id === 'T4')?.checked ?? 0) - (checks.find((c) => c.id === 'T5')?.checked ?? 0)
      }
    }
    // Not vacuous: 88 × 24 traces, each with a forward, a sample and two copies at least.
    expect(kernels).toBeGreaterThanOrEqual(ALL.length * SEEDS.length * 2)
    expect(copies).toBeGreaterThanOrEqual(ALL.length * SEEDS.length * 2)
  })

  test(`of the longest path of each engine, under ${MANY.length} seeds, and under the widest jitter`, () => {
    const widest = { spreadPermille: 900, gapNs: 100_000 }
    for (const id of ENGINE_IDS) {
      const sc = longest(id)
      for (const seed of MANY) {
        expect([describeScenario(sc), seed, failing(lifecycleTrace(sc, seed))]).toEqual([describeScenario(sc), seed, []])
        expect([describeScenario(sc), seed, failing(lifecycleTrace(sc, seed, widest))]).toEqual([describeScenario(sc), seed, []])
      }
      expect([id, failing(lifecycleTrace(sc, 0, CLEAN_LIFECYCLE_JITTER))]).toEqual([id, []])
    }
    expect(failing(lifecycleTrace(longest('vllm'), 0xffffffff))).toEqual([])
  })
})

describe('the stage spans', () => {
  test('are the path: one span for each stage, named by its id, in its order, at strictly later starts', () => {
    for (const sc of ALL) {
      for (const seed of [1, 2, 3]) {
        const t = lifecycleTrace(sc, seed)
        const path = referencePath(sc)
        const spans = stageSpans(t)
        const where = `${describeScenario(sc)}, seed ${seed}`
        expect([where, spans.map((s) => s.stage)]).toEqual([where, path.map((s) => s.id)])
        spans.slice(1).forEach((s, i) => expect([where, s.stage, spanView(t, s.span).startNs > spanView(t, spans[i].span).startNs]).toEqual([where, s.stage, true]))
      }
    }
  })

  test('sit on the track of the thread or the stream where the stage works, and a hand-off is the sender\'s span', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 5)
      const path = referencePath(sc)
      const names = new Map(t.tracks.map((x) => [x.id, t.strings[x.name]]))
      stageSpans(t).forEach(({ span }, i) => {
        const stage = path[i]
        const v = spanView(t, span)
        const track = names.get(v.track) ?? ''
        const gpuStage = stage.mechanism === 'h2d' || stage.mechanism === 'd2h' || stage.mechanism === 'launch' || stage.mechanism === 'collective'
        const home = stage.mechanism === 'd2h' ? stage.from : stage.to
        const expected = gpuStage ? `GPU ${home.rank} · ${home.process}` : `${stage.from.process} · ${stage.from.thread}`
        expect([describeScenario(sc), stage.id, track]).toEqual([describeScenario(sc), stage.id, expected])
        expect([stage.id, v.kind]).toEqual([stage.id, gpuStage ? 'gpu-stream' : 'cpu-thread'])
        expect([stage.id, v.cat]).toEqual([stage.id, gpuStage ? (stage.mechanism === 'h2d' || stage.mechanism === 'd2h' ? CAT_COPY : CAT_KERNEL) : stage.mechanism === 'sync' ? CAT_SYNC : stage.mechanism])
      })
    }
  })

  test('are told from the CUDA API spans, which carry the correlation id of the GPU work they start and come first', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 9)
      const gpuStages = referencePath(sc).filter((s) => ['h2d', 'd2h', 'launch', 'collective'].includes(s.mechanism))
      const views = Array.from({ length: t.spans.track.length }, (_, i) => spanView(t, i))
      const api = views.filter((v) => v.kind === 'cuda-api')
      const work = views.filter((v) => v.kind === 'gpu-stream')
      const where = describeScenario(sc)
      expect([where, api.length, work.length]).toEqual([where, gpuStages.length, gpuStages.length])
      for (const w of work) {
        const starter = api.filter((a) => a.corr === w.corr)
        expect([where, w.name, starter.length]).toEqual([where, w.name, 1])
        expect([where, w.name, starter[0].endNs <= w.startNs]).toEqual([where, w.name, true])
        expect([where, stageIds().has(starter[0].name)]).toEqual([where, false])
      }
      expect([where, new Set(work.map((w) => w.corr)).size]).toEqual([where, work.length])
    }
  })
})

describe('the fork rule of ASSESSMENT §5.9', () => {
  test('a copy sits between the compute spans it feeds: on each GPU\'s stream the work runs in the path\'s order and never overlaps', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 11)
      const path = referencePath(sc)
      const views = Array.from({ length: t.spans.track.length }, (_, i) => spanView(t, i)).filter((v) => v.kind === 'gpu-stream')
      const byTrack = new Map<number, typeof views>()
      for (const v of views) byTrack.set(v.track, [...(byTrack.get(v.track) ?? []), v])
      for (const [, list] of byTrack) {
        const sorted = list.slice().sort((a, b) => a.startNs - b.startNs)
        sorted.slice(1).forEach((v, i) => expect([describeScenario(sc), v.name, v.startNs >= sorted[i].endNs]).toEqual([describeScenario(sc), v.name, true]))
        const order = path.filter((s) => sorted.some((v) => v.name === s.id)).map((s) => s.id)
        expect([describeScenario(sc), sorted.map((v) => v.name)]).toEqual([describeScenario(sc), order])
      }
      // The copy in precedes the forward that reads it, and the copy out follows the sampling that wrote it.
      const at = (suffix: string) => views.find((v) => v.name.endsWith(suffix))
      if (at('.h2d') && at('.forward')) expect([describeScenario(sc), (at('.h2d')?.endNs ?? 0) <= (at('.forward')?.startNs ?? 0)]).toEqual([describeScenario(sc), true])
      expect([describeScenario(sc), (at('.sample')?.endNs ?? 1) <= (at('.d2h')?.startNs ?? 0)]).toEqual([describeScenario(sc), true])
    }
  })

  test('a sync span ends after all the GPU work before it, and is joined by a flow to the copy it waits for', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 13)
      const views = Array.from({ length: t.spans.track.length }, (_, i) => spanView(t, i))
      const syncs = views.filter((v) => v.cat === CAT_SYNC && v.kind === 'cpu-thread')
      expect([describeScenario(sc), syncs.length]).toEqual([describeScenario(sc), 1])
      const [sync] = syncs
      const gpuEnd = Math.max(...views.filter((v) => v.kind === 'gpu-stream').map((v) => v.endNs))
      expect([describeScenario(sc), sync.endNs > gpuEnd]).toEqual([describeScenario(sc), true])
      const flow = t.flows.find((f) => f.kind === 'sync')
      expect([describeScenario(sc), flow?.to]).toEqual([describeScenario(sc), sync.index])
      expect([describeScenario(sc), views[flow?.from ?? 0].name.endsWith('.d2h')]).toEqual([describeScenario(sc), true])
    }
  })
})

describe('the trace as a trace@1', () => {
  test('is one step window from 0 to the end of the last span, which attribute partitions exactly in integer ns', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 17)
      const end = Math.max(...Array.from({ length: t.spans.track.length }, (_, i) => spanView(t, i).endNs))
      expect(t.marks.map((m) => [m.tNs, t.strings[m.name]])).toEqual([
        [0, STEP_MARK],
        [end, STEP_MARK],
      ])
      const [a] = attributeSteps(t)
      expect(attributeSteps(t).length).toBe(1)
      expect([describeScenario(sc), a.windowNs]).toEqual([describeScenario(sc), end])
      expect([describeScenario(sc), a.gpuBusyNs + a.cpuGapNs + a.bothIdleNs]).toEqual([describeScenario(sc), a.windowNs])
      expect([describeScenario(sc), a.kernelNs > 0 && a.copyOnlyNs > 0]).toEqual([describeScenario(sc), true])
    }
  })

  test('round-trips through its canonical text, and is marked synthetic with nothing it could not know', () => {
    for (const sc of ALL) {
      const t = lifecycleTrace(sc, 19)
      const text = encodeTrace(t)
      expect(encodeTrace(decodeTrace(text))).toBe(text)
      expect(validateTrace(t)).toEqual([])
      expect(t.meta).toEqual({ source: 'synthetic', synthetic: true })
    }
  })

  test('is a function of the scenario, the seed and the jitter: the seed moves the times and never the order', () => {
    const sc = longest('sglang')
    const a = encodeTrace(lifecycleTrace(sc, 1))
    expect(encodeTrace(lifecycleTrace(sc, 1))).toBe(a)
    expect(encodeTrace(lifecycleTrace(sc, 1, DEFAULT_LIFECYCLE_JITTER))).toBe(a)
    expect(encodeTrace(lifecycleTrace(sc, 2))).not.toBe(a)
    expect(encodeTrace(lifecycleTrace(sc, 1, CLEAN_LIFECYCLE_JITTER))).not.toBe(a)
    for (const seed of [1, 2, 3, 0xffffffff]) expect(stageSpans(lifecycleTrace(sc, seed)).map((s) => s.stage)).toEqual(referencePath(sc).map((s) => s.id))
  })

  test('with no jitter lasts each stage its nominal and starts at 0', () => {
    const sc = longest('vllm')
    const t = lifecycleTrace(sc, 3, CLEAN_LIFECYCLE_JITTER)
    const path = referencePath(sc)
    stageSpans(t).forEach(({ span }, i) => {
      const v = spanView(t, span)
      if (path[i].mechanism !== 'sync') expect([path[i].id, v.durNs]).toEqual([path[i].id, NOMINAL_NS[path[i].mechanism]])
    })
    expect(spanView(t, 0).startNs).toBe(0)
  })

  test('refuses a scenario the model cannot draw, a jitter out of range and a seed that is not 32 bits', () => {
    expect(() => lifecycleTrace({ engine: 'nano-vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }, 1)).toThrow(RangeError)
    expect(() => lifecycleTrace(ALL[0], 1, { spreadPermille: 901, gapNs: 0 })).toThrow(/spreadPermille/)
    expect(() => lifecycleTrace(ALL[0], 1, { spreadPermille: 0, gapNs: 100_001 })).toThrow(/gapNs/)
    expect(() => lifecycleTrace(ALL[0], 1.5)).toThrow(RangeError)
    expect(() => lifecycleTrace(ALL[0], -1)).toThrow(RangeError)
    expect(() => lifecycleTrace(ALL[0], 2 ** 32)).toThrow(RangeError)
  })
})

describe('the checks are not vacuous on these traces', () => {
  const sc: Scenario = { engine: 'vllm', streaming: true, tp: 2, abort: false, prefixHit: false, n: 1 }
  // No jitter, so that a launch ends exactly where the work it starts begins and a defect moves one thing.
  const good = lifecycleTrace(sc, 21, CLEAN_LIFECYCLE_JITTER)
  const gpuSpans = Array.from({ length: good.spans.track.length }, (_, i) => spanView(good, i)).filter((v) => v.kind === 'gpu-stream')

  test('a kernel with no launch before it fails T4 and nothing else', () => {
    const t = cloneTrace(good)
    t.spans.corr[gpuSpans.find((v) => v.cat === CAT_KERNEL)?.index ?? 0] = 999
    expect(failing(t)).toEqual(['T4'])
  })

  test('two pieces of work on one stream at once fail T3 and nothing else', () => {
    const t = cloneTrace(good)
    const [first, second] = gpuSpans.filter((v) => v.track === gpuSpans[0].track)
    // The second moves to the middle of the first, and its launch still comes before it.
    t.spans.startNs[second.index] = first.startNs + 1
    expect(failing(t)).toEqual(['T3'])
  })

  test('a kernel past the step mark fails T5 and nothing else', () => {
    const last = gpuSpans.filter((v) => v.cat === CAT_KERNEL).sort((a, b) => b.endNs - a.endNs)[0]
    const moved: EsTrace = { ...cloneTrace(good), marks: [good.marks[0], { ...good.marks[1], tNs: last.endNs - 1 }] }
    expect(failing(moved)).toEqual(['T5'])
  })

  test('a span before 0 fails T2', () => {
    const t = cloneTrace(good)
    t.spans.startNs[0] = -5
    expect(failing(t)).toContain('T2')
  })
})
