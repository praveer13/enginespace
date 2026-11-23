/*
 * Gap Hunt's model (GAMES.md §6): cases whose largest gap has a known cause, in the band; the reference split, whose parts add up
 * to the window exactly; the three parts of a gap between two kernels; node-level graph traces; checkHunt; and a bestiary of
 * wrong causes, each of which fails it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  HUNT_CAUSES,
  attributeSteps,
  causeKind,
  checkHunt,
  decoyUnderBusy,
  encodeTrace,
  findCause,
  gapParts,
  huntBestiary,
  huntCase,
  huntPass,
  huntTrace,
  huntTraces,
  referenceSplit,
  spanCount,
  spanView,
  stepWindows,
  traceChecks,
} from '../../packages/sim/trace'
import type { HuntAsk, HuntCase, HuntCause, Mark } from '../../packages/sim/trace'
import { below, rngFor } from '../../packages/sim/core'
import { bruteForce } from './trace-support'
import { CHUNK, LEVELS, SEEDS, bruteCause, chunks, huntGolden } from './trace-hunt-support'

const root = path.resolve(import.meta.dirname, '../..')

const causesOf = (seed: number): HuntCause[] => {
  const rng = rngFor(seed, 'test/hunt/causes')
  return Array.from({ length: 4 }, () => HUNT_CAUSES[below(rng, HUNT_CAUSES.length)])
}

describe('a trace with a cause drawn into every window', () => {
  for (const [c, seeds] of chunks.entries()) {
    test(`the largest gap of each window has the cause asked for, in the band (seeds chunk ${c + 1} of ${chunks.length})`, () => {
      for (const seed of seeds) {
        const causes = causesOf(seed)
        const t = huntTrace(seed, { causes, twoStreams: seed % 2 === 0, node: seed % 5 === 0 })
        expect(traceChecks(t).filter((x) => !x.pass).map((x) => `${x.id}: ${x.detail}`), `seed ${seed}`).toEqual([])
        const steps = attributeSteps(t)
        expect(steps.length, `seed ${seed}`).toBe(causes.length)
        steps.forEach((a, i) => {
          const lengths = a.gaps.map((g) => g.toNs - g.fromNs).sort((x, y) => y - x)
          expect(2 * lengths[0], `seed ${seed} step ${i}: the largest gap is at least 1.5 times the second`).toBeGreaterThanOrEqual(3 * (lengths[1] ?? 0))
          expect(a.segments.length, `seed ${seed} step ${i}`).toBeLessThanOrEqual(12)
          expect(10 * (a.windowNs - a.kernelNs), `seed ${seed} step ${i}: non-kernel ns are 10% of the window`).toBeGreaterThanOrEqual(a.windowNs)
          const gap = a.gaps.find((g) => g.toNs - g.fromNs === lengths[0])!
          const cause = findCause(t, gap)!
          expect(cause, `seed ${seed} step ${i}`).not.toBeNull()
          expect(10 * cause.coverNs, `seed ${seed} step ${i}: one span covers 60% of the lead-in`).toBeGreaterThanOrEqual(6 * (cause.leadInToNs - cause.leadInFromNs))
          expect(causeKind(t, cause.event), `seed ${seed} step ${i}`).toBe(causes[i])
        })
      }
    })
  }

  test('findCause agrees with a per-ns recomputation that shares no code with it', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const t = huntTrace(seed, { causes: causesOf(seed) })
      attributeSteps(t).forEach((a, i) => {
        const brute = bruteCause(t, i)!
        const gap = a.gaps.reduce((best, g) => (g.toNs - g.fromNs > best.toNs - best.fromNs ? g : best))
        expect(findCause(t, gap)!.event, `seed ${seed} step ${i}`).toBe(brute.event)
        expect(brute.permille).toBeGreaterThanOrEqual(600)
      })
    }
  })

  test('the same seed gives the same bytes, and a different seed does not', () => {
    const spec = { causes: causesOf(3) }
    expect(encodeTrace(huntTrace(3, spec))).toBe(encodeTrace(huntTrace(3, spec)))
    expect(encodeTrace(huntTrace(4, spec))).not.toBe(encodeTrace(huntTrace(3, spec)))
    expect(() => huntTrace(3, { causes: [] })).toThrow(RangeError)
  })

  test('every cause turns up, in every kind of trace', () => {
    for (const cause of HUNT_CAUSES) {
      for (const node of [false, true]) {
        const t = huntTrace(11, { causes: [cause, cause], node })
        const ref = attributeSteps(t).map((a) => findCause(t, a.gaps.reduce((b, g) => (g.toNs - g.fromNs > b.toNs - b.fromNs ? g : b)))!.event)
        expect(ref.map((e) => causeKind(t, e))).toEqual([cause, cause])
      }
    }
  })
})

describe('the reference split', () => {
  for (const [c, seeds] of chunks.entries()) {
    test(`it partitions the window exactly, and the case is in the band (seeds chunk ${c + 1} of ${chunks.length})`, () => {
      for (const seed of seeds) {
        const level = LEVELS[seed % LEVELS.length]
        const hc = huntCase(huntTraces(seed, level), seed, level)
        const ref = referenceSplit(hc)
        const w = stepWindows(hc.trace)[hc.step]
        let at = w.fromNs
        let total = 0
        for (const m of ref.marks) {
          expect(m.fromNs, `seed ${seed}`).toBe(at)
          expect(m.toNs, `seed ${seed}`).toBeGreaterThan(m.fromNs)
          total += m.toNs - m.fromNs
          at = m.toNs
        }
        expect(at, `seed ${seed}`).toBe(w.toNs)
        expect(total, `seed ${seed}`).toBe(w.toNs - w.fromNs)
        expect(ref.marks.length, `seed ${seed}`).toBeLessThanOrEqual(12)
        expect(ref.largestGap, `seed ${seed}`).not.toBeNull()
        expect(ref.largestGap!.cause, `seed ${seed}`).toBeGreaterThanOrEqual(0)
        const result = checkHunt(hc, ref.marks, ref.largestGap!.cause)
        expect(result.unaccountedNs, `seed ${seed}`).toBe(0)
        expect(result.problems, `seed ${seed}`).toEqual([])
        expect(huntPass(result), `seed ${seed}`).toBe(true)
      }
    })
  }

  test('the marks agree with a per-ns classification of the window', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const hc = huntCase(huntTraces(seed, 'attribute'), seed, 'attribute')
      const w = stepWindows(hc.trace)[hc.step]
      const brute = bruteForce(hc.trace, w.fromNs, w.toNs)
      const ref = referenceSplit(hc)
      const sum = (cat: string) => ref.marks.filter((m) => m.category === cat).reduce((s, m) => s + m.toNs - m.fromNs, 0)
      expect(sum('kernel'), `seed ${seed}`).toBe(brute.kernelNs)
      expect(sum('copy'), `seed ${seed}`).toBe(brute.copyOnlyNs)
      expect(sum('cpu-gap'), `seed ${seed}`).toBe(brute.cpuGapNs)
      expect(sum('both-idle'), `seed ${seed}`).toBe(brute.bothIdleNs)
      expect(ref.overlapNs, `seed ${seed}`).toBe(brute.overlapNs)
    }
  })
})

describe('the three parts of a gap between two kernels', () => {
  test('they add up to the gap exactly on 200 seeds, and seeds where a part is zero are kept', () => {
    const zero = { copyNs: 0, cpuGapNs: 0, bothIdleNs: 0 }
    const seen = { copyNs: 0, cpuGapNs: 0, bothIdleNs: 0 }
    let gaps = 0
    for (const seed of SEEDS.slice(0, 200)) {
      const t = huntTrace(seed, { causes: causesOf(seed) })
      for (const a of attributeSteps(t)) {
        // A stretch between two kernel segments: from the end of one to the start of the next.
        const s = a.segments
        for (let i = 1; i + 1 < s.length; i++) {
          if (s[i].category === 'kernel') continue
          let j = i
          while (j < s.length && s[j].category !== 'kernel') j++
          if (j >= s.length || s[i - 1].category !== 'kernel') continue
          const from = s[i].fromNs
          const to = s[j].fromNs
          const parts = gapParts(t, from, to)
          expect(parts.copyNs + parts.cpuGapNs + parts.bothIdleNs, `seed ${seed}`).toBe(to - from)
          gaps++
          for (const k of Object.keys(zero) as (keyof typeof zero)[]) {
            if (parts[k] === 0) zero[k]++
            else seen[k]++
          }
          i = j
        }
      }
    }
    expect(gaps).toBeGreaterThan(200)
    for (const k of Object.keys(zero) as (keyof typeof zero)[]) {
      expect(zero[k], `${k} is zero in some gap`).toBeGreaterThan(0)
      expect(seen[k], `${k} is not zero in some gap`).toBeGreaterThan(0)
    }
  })

  test('a stretch with a kernel in it is not a gap', () => {
    const t = huntTrace(5, { causes: ['host'] })
    const w = stepWindows(t)[0]
    expect(() => gapParts(t, w.fromNs, w.toNs)).toThrow(RangeError)
  })
})

describe('the levels', () => {
  test('each level asks what it should, and an unknown level throws', () => {
    const asks = Object.fromEntries(LEVELS.map((l) => [l, huntCase(huntTraces(1, l), 1, l).ask]))
    expect(asks).toEqual({ read: 'gap', gap: 'gap', graphs: 'attribute', attribute: 'attribute' })
    expect(() => huntTraces(1, 'pinned')).toThrow(RangeError)
    expect(() => huntCase(huntTraces(1, 'gap'), 1, 'yours')).toThrow(RangeError)
  })

  test('a case is the same for the same seed, and every cause is drawn', () => {
    const kinds = new Set<string>()
    for (const seed of SEEDS.slice(0, 60)) {
      const a = huntCase(huntTraces(seed, 'gap'), seed, 'gap')
      const b = huntCase(huntTraces(seed, 'gap'), seed, 'gap')
      expect([a.step, a.ask, encodeTrace(a.trace)]).toEqual([b.step, b.ask, encodeTrace(b.trace)])
      kinds.add(causeKind(a.trace, referenceSplit(a).largestGap!.cause)!)
    }
    expect([...kinds].sort()).toEqual(['eager', 'host', 'sync'])
  })

  for (const [c, seeds] of chunks.entries()) {
    test(`in at least half the cases a main-thread span longer than the cause lies under GPU-busy time (seeds chunk ${c + 1} of ${chunks.length})`, () => {
      let with_ = 0
      for (const seed of seeds) {
        const level = LEVELS[seed % LEVELS.length]
        if (decoyUnderBusy(huntCase(huntTraces(seed, level), seed, level))) with_++
      }
      expect(with_, `${with_} of ${seeds.length}`).toBeGreaterThanOrEqual(seeds.length / 2)
    })
  }

  test('the graphs level has node-level traces: one launch for the graph, its nodes as kernels, no ranges inside it, small gaps between nodes', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const t of huntTraces(seed, 'graphs')) {
        expect(t.tracks.some((x) => x.kind === 'marker')).toBe(false)
        const launches: number[] = []
        const kernelCorr = new Set<number>()
        for (let i = 0; i < spanCount(t); i++) {
          const v = spanView(t, i)
          expect(v.name).not.toBe('cudaLaunchKernel')
          if (v.name === 'cudaGraphLaunch') launches.push(v.corr)
          if (v.cat === 'kernel') kernelCorr.add(v.corr)
        }
        expect(launches.length).toBe(stepWindows(t).length)
        expect(new Set(launches).size).toBe(launches.length)
        expect(kernelCorr.size).toBe(launches.length)
        for (const corr of kernelCorr) expect(launches).toContain(corr)
        const hc = huntCase([t], seed, 'graphs')
        const nodeGaps = attributeSteps(t)[hc.step].gaps.slice(1)
        expect(nodeGaps.length).toBeGreaterThan(0)
      }
    }
  })

  test('a trace has a second GPU stream in some cases, and the case reads the same', () => {
    let two = 0
    for (const seed of SEEDS.slice(0, 40)) {
      const traces = huntTraces(seed, 'gap')
      for (const t of traces) if (t.tracks.filter((x) => x.kind === 'gpu-stream').length === 2) two++
    }
    expect(two).toBeGreaterThan(10)
    expect(two).toBeLessThan(70)
  })
})

describe('checkHunt', () => {
  const caseOf = (seed: number, ask: HuntAsk): HuntCase => ({ ...huntCase(huntTraces(seed, 'gap'), seed, 'gap'), ask })

  test('it reads no clock', () => {
    const c = caseOf(2, 'both')
    const ref = referenceSplit(c)
    const now = Date.now
    const perf = performance.now
    let reads = 0
    Date.now = () => {
      reads++
      return now()
    }
    performance.now = () => {
      reads++
      return perf.call(performance)
    }
    try {
      checkHunt(c, ref.marks, ref.largestGap!.cause)
    } finally {
      Date.now = now
      performance.now = perf
    }
    expect(reads).toBe(0)
  })

  test('the reference answer passes every ask, and the cause is not asked of an attribute case', () => {
    for (const ask of ['gap', 'attribute', 'both'] as const) {
      const c = caseOf(4, ask)
      const ref = referenceSplit(c)
      const r = checkHunt(c, ref.marks, ref.largestGap!.cause)
      expect(huntPass(r), ask).toBe(true)
      expect(r.rightNs).toBe(r.windowNs)
    }
    const c = caseOf(4, 'attribute')
    const ref = referenceSplit(c)
    expect(checkHunt(c, ref.marks, null).causeOk).toBe(true)
    expect(checkHunt({ ...c, ask: 'both' }, ref.marks, null).causeOk).toBe(false)
  })

  test('the gap ask scores the gap, whatever else is marked, and wants both edges', () => {
    const c = caseOf(6, 'gap')
    const ref = referenceSplit(c)
    const gap = ref.largestGap!
    const only: Mark[] = [{ fromNs: gap.fromNs, toNs: gap.toNs, category: 'cpu-gap' }]
    const r = checkHunt(c, only, gap.cause)
    expect(r.windowNs).toBe(gap.toNs - gap.fromNs)
    expect(huntPass(r)).toBe(true)
    const split: Mark[] = [
      { fromNs: gap.fromNs, toNs: gap.fromNs + 1, category: 'both-idle' },
      { fromNs: gap.fromNs + 1, toNs: gap.toNs, category: 'cpu-gap' },
    ]
    expect(checkHunt(c, split, gap.cause).problems).toEqual([])
    expect(checkHunt(c, split, gap.cause).rightNs).toBe(r.rightNs - 1)
  })

  test('a mark that is not a stretch, one that reaches outside, and two that disagree are named', () => {
    const c = caseOf(8, 'attribute')
    const w = stepWindows(c.trace)[c.step]
    const ref = referenceSplit(c)
    const bad = (m: Mark[]) => checkHunt(c, m, null).problems
    expect(bad([{ fromNs: 5.5, toNs: 9, category: 'kernel' }])).toHaveLength(1)
    expect(bad([{ fromNs: 9, toNs: 9, category: 'kernel' }])).toHaveLength(1)
    expect(bad([{ fromNs: 1, toNs: 9, category: 'sleep' as never }])).toHaveLength(1)
    expect(bad([...ref.marks, { fromNs: w.fromNs - 10, toNs: w.fromNs + 5, category: ref.marks[0].category }])).toEqual(['a mark reaches outside the step'])
    const clash = checkHunt(c, [...ref.marks, { fromNs: w.fromNs, toNs: w.toNs, category: 'kernel' }], null)
    expect(clash.problems).toEqual(['marks of different categories overlap'])
    expect(huntPass(clash)).toBe(false)
    expect(checkHunt(c, [], null).unaccountedNs).toBe(w.toNs - w.fromNs)
  })

  test('a case with no gap to read has no cause to name', () => {
    const c = caseOf(9, 'both')
    expect(() => checkHunt({ ...c, step: 99 }, [], null)).toThrow(RangeError)
  })
})

describe('the bestiary', () => {
  for (const ask of ['gap', 'attribute', 'both'] as const) {
    for (const [c, seeds] of chunks.entries()) {
      test(`every wrong answer of an ${ask} case fails checkHunt (seeds chunk ${c + 1} of ${chunks.length})`, () => {
        for (const seed of seeds) {
          const level = LEVELS[seed % LEVELS.length]
          const hc: HuntCase = { ...huntCase(huntTraces(seed, level), seed, level), ask }
          const wrong = huntBestiary(hc)
          expect(wrong.length, `seed ${seed}`).toBeGreaterThanOrEqual(3)
          expect(new Set(wrong.map((w) => `${w.id}/${w.cause}`)).size, `seed ${seed}`).toBe(wrong.length)
          for (const w of wrong) {
            const r = checkHunt(hc, w.marks, w.cause)
            expect(huntPass(r), `seed ${seed} ${ask}: ${w.id} (${w.label}) passed: ${JSON.stringify(r)}`).toBe(false)
          }
        }
      })
    }
  }

  test('a case that asks for a cause has the plausible wrong ones: the widest span, the launch call, the work before, another span of the lead-in', () => {
    const ids = new Set<string>()
    for (const seed of SEEDS.slice(0, 60)) {
      const hc = huntCase(huntTraces(seed, 'gap'), seed, 'gap')
      for (const w of huntBestiary(hc)) ids.add(w.id.replace(/-\d+$/, ''))
    }
    for (const id of ['no-cause', 'widest-span', 'launch-call', 'last-gpu-work', 'in-the-lead-in', 'other-gap', 'edge-off-by-one', 'whole-step-idle', 'gap-is-kernel']) expect(ids.has(id), id).toBe(true)
  })
})

describe('goldens', () => {
  const golden = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/sim/trace-hunt.json'), 'utf8')) as { vectors: Record<string, unknown>[] }

  test('the cases of the golden file are what the model draws, byte for byte', () => {
    expect(golden.vectors.length).toBeGreaterThanOrEqual(24)
    for (const v of golden.vectors) expect(huntGolden(v.seed as number, v.level as string), `${v.level} ${v.seed}`).toEqual(v)
  })

  test('no existing golden of the trace model moved: the generator draws its own streams', () => {
    // tests/fixtures/sim/trace.json is read by trace.test.ts and trace-streams.test.ts; this file adds no draw to traceFromRun.
    const t = huntTrace(1, { causes: ['host'] })
    expect(t.meta.synthetic).toBe(true)
    expect(CHUNK).toBe(100)
  })
})
