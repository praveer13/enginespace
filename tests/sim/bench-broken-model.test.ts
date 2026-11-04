/*
 * The pieces the broken-benchmark corpus is built from (packages/sim/bench/broken-model.ts and broken-kits.ts): the grids the answer is
 * drawn from, the forward estimates that aim a scene at it, the measured capacity of a traffic, the window a spec is fitted to, and the
 * synthetic trace of the replay flaw. Each is held to a second statement of its rule, so that a change to one cannot move a case silently
 * (the goldens would show it, but not why).
 */
import { describe, expect, test } from 'bun:test'
import { BENCH_WARMUP_ROWS, benchWarmupRows, planBench, runBench } from '../../packages/sim/bench'
import type { BenchRow, BenchSpec } from '../../packages/sim/bench'
import {
  BURST_GRID,
  LIGHT_GRID,
  MIX_GRID,
  OVERLOAD_GRID,
  OVERLOAD_TRAFFIC,
  STALL_GRID,
  burstTrace,
  inFlightPeak,
  measuredOf,
} from '../../packages/sim/bench/broken-kits'
import {
  CORPUS_SERVER,
  CORPUS_SLO,
  SEC,
  capacityPerSMilli,
  dueTimes,
  lengthsOf,
  lightP99Us,
  logGrid,
  mixMultiplier,
  mixP99Us,
  overloadBias,
  overloadP99Us,
  poissonAt,
  promptDist,
  solveIncreasing,
  windowed,
} from '../../packages/sim/bench/broken-model'
import type { Traffic } from '../../packages/sim/bench/broken-model'
import { parseSlice, replayWorkload } from '../../packages/sim/workload'
import { inFlightMax } from './bench-support'

const CHAT: Traffic = { promptLo: 128, promptHi: 512, outLo: 64, outHi: 192 }

describe('the warm-up rule (ASSESSMENT B8)', () => {
  test('is the first max(100, 2 × max_num_seqs) rows by due time: 128 on the corpus\'s server of 64', () => {
    expect(benchWarmupRows(64)).toBe(128)
    expect(benchWarmupRows(32)).toBe(100)
    expect(benchWarmupRows(256)).toBe(512)
    expect(BENCH_WARMUP_ROWS).toBe(128)
    expect(CORPUS_SERVER.maxNumSeqs).toBe(64)
  })
})

describe('logGrid and the grids the answer is drawn from', () => {
  test('is strictly increasing, starts at its low end, steps by 5% and stops at or under its high end', () => {
    const grid = logGrid(100, 10_000)
    expect(grid[0]).toBe(100)
    expect(grid[grid.length - 1]).toBeLessThanOrEqual(10_000)
    expect(grid[grid.length - 1] * 1.05).toBeGreaterThan(10_000)
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i]).toBeGreaterThan(grid[i - 1])
      expect(Math.abs(grid[i] / grid[i - 1] - 1.05)).toBeLessThan(0.005)
    }
    // 100 × 1.05^94 ≈ 9,800: the grid has 95 entries.
    expect(grid).toHaveLength(95)
  })

  test('steps by at least 1 when the numbers are small, so it always ends', () => {
    expect(logGrid(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  test('the five grids span the ranges the kits say, each of them over a factor of 20 [estimated design]', () => {
    const span = (g: readonly number[]) => g[g.length - 1] / g[0]
    expect(OVERLOAD_GRID[0]).toBe(5 * SEC)
    expect(OVERLOAD_GRID[OVERLOAD_GRID.length - 1]).toBeLessThanOrEqual(120 * SEC)
    expect(STALL_GRID[0]).toBe(350_000)
    expect(LIGHT_GRID[0]).toBe(70_000)
    expect(MIX_GRID[0]).toBe(120_000)
    expect(BURST_GRID[0]).toBe(2 * SEC)
    for (const g of [OVERLOAD_GRID, STALL_GRID, LIGHT_GRID, MIX_GRID, BURST_GRID]) expect(span(g)).toBeGreaterThan(20)
  })
})

describe('solveIncreasing', () => {
  test('finds where an increasing function reaches a target, and clamps to the ends of the range', () => {
    const f = (x: number) => x * x
    expect(solveIncreasing(f, 49, 0, 100)).toBeCloseTo(7, 9)
    expect(solveIncreasing(f, -1, 2, 100)).toBe(2)
    expect(solveIncreasing(f, 1e9, 2, 100)).toBe(100)
  })
})

describe('the forward estimates', () => {
  test('an overloaded run\'s p99 grows with the load, the rows and the capacity\'s inverse, and is 0 at a load of 1 with nothing to wait for', () => {
    const c = capacityPerSMilli(CHAT)
    let last = 0
    for (const rho of [1.02, 1.1, 1.3, 1.7, 2.5, 4]) {
      const t = overloadP99Us(rho, c, 1000, 128)
      expect(t).toBeGreaterThanOrEqual(last)
      last = t
    }
    expect(overloadP99Us(1.5, c, 2000, 128)).toBeGreaterThan(overloadP99Us(1.5, c, 1000, 128))
    expect(overloadP99Us(1.5, c / 2, 1000, 128)).toBeGreaterThan(overloadP99Us(1.5, c, 1000, 128))
    expect(overloadP99Us(1, c, 1000, 128)).toBe(0)
  })

  test('is the fluid reading: at a load of 2 the queue is as long as the run, less a fraction of a hold', () => {
    const c = capacityPerSMilli(CHAT) // about 20.5 requests a second
    const rate = (2 * c) / 1000
    const t99 = (128 + 0.99 * 1000) / rate
    const hold = 64000 / c
    expect(overloadP99Us(2, c, 1000, 128) / SEC).toBeCloseTo((2 - 1) * t99 - hold * (0.32 + 0.1), 6)
  })

  test('the bias is 1.4 at the bottom of the grid, falls to 1 by 35 s, and never goes under 1', () => {
    expect(overloadBias(5 * SEC)).toBe(1.4)
    expect(overloadBias(SEC)).toBe(1.4)
    expect(overloadBias(35 * SEC)).toBe(1)
    expect(overloadBias(120 * SEC)).toBe(1)
    let last = 2
    for (let t = 5; t <= 120; t += 5) {
      expect(overloadBias(t * SEC)).toBeLessThanOrEqual(last)
      expect(overloadBias(t * SEC)).toBeGreaterThanOrEqual(1)
      last = overloadBias(t * SEC)
    }
  })

  test('a light load\'s p99 grows with the load and with the longest prompt, from a floor of 40 ms', () => {
    expect(lightP99Us(0.1, 0)).toBe(40_000)
    expect(lightP99Us(0.5, 4096)).toBeGreaterThan(lightP99Us(0.2, 4096))
    expect(lightP99Us(0.5, 4096)).toBeGreaterThan(lightP99Us(0.5, 1024))
    // 4,096 tokens at a load of 0.5: 40 ms + 4,096 × (0.04 + 0.3 × 0.5) ms.
    expect(lightP99Us(0.5, 4096)).toBe(40_000 + Math.round(4096 * 0.19 * 1000))
  })

  test('a mixed traffic\'s p99 is its long prompt\'s, times a multiplier that rises with the load: 1 at 0.2, 5 at 0.92, and flat beyond', () => {
    expect(mixMultiplier(0)).toBe(1)
    expect(mixMultiplier(0.2)).toBe(1)
    expect(mixMultiplier(0.4)).toBeCloseTo(1.3, 12)
    expect(mixMultiplier(0.5)).toBeCloseTo(1.575, 12)
    expect(mixMultiplier(0.92)).toBe(5)
    expect(mixMultiplier(1.5)).toBe(5)
    let last = 0
    for (let rho = 0; rho <= 1; rho += 0.05) {
      expect(mixMultiplier(rho)).toBeGreaterThanOrEqual(last)
      last = mixMultiplier(rho)
    }
    expect(mixP99Us(0.2, 8192)).toBe(40_000 + 62 * 8192)
  })
})

describe('the traffic', () => {
  test('a mix with long prompts draws the menu of three short values and the long one, with weights that add to 1,000', () => {
    const d = promptDist({ ...CHAT, promptLo: 64, promptHi: 192, longTokens: 4096, longPermille: 25 })
    if (d.kind !== 'menu') throw new Error('not a menu')
    expect(d.values).toEqual([64, 128, 192, 4096])
    expect(d.weights.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(d.weights[3]).toBe(25)
    expect(promptDist(CHAT)).toEqual({ kind: 'uniform', lo: 128, hi: 512 })
  })

  test('the overloaded mixes are nine, with prompts a quarter to the top and three lengths of reply', () => {
    expect(OVERLOAD_TRAFFIC).toHaveLength(9)
    expect(new Set(OVERLOAD_TRAFFIC.map((t) => t.promptHi))).toEqual(new Set([512, 1024, 2048]))
    for (const t of OVERLOAD_TRAFFIC) expect(t.promptLo * 4).toBe(t.promptHi)
  })
})

describe('capacityPerSMilli', () => {
  test('is the throughput of 96 closed-loop clients over the last 45 s of 60, and is the same every call', () => {
    const c = capacityPerSMilli(CHAT)
    expect(capacityPerSMilli(CHAT)).toBe(c)
    const spec: BenchSpec = { arrivals: { kind: 'closed', clients: 96, thinkUs: 0 }, lengths: lengthsOf(CHAT), requests: 20_000, warmupUs: 0, durationUs: 60 * SEC, slo: CORPUS_SLO }
    const run = runBench(1, spec, CORPUS_SERVER)
    const done = run.rows.filter((r) => r.doneUs >= 15 * SEC && r.doneUs < 60 * SEC).length
    expect(c).toBe(Math.round((done * 1_000_000_000) / (45 * SEC)))
    // About 20.5 requests a second for chat-sized requests on the 70B card [measured 2026-11-04].
    expect(c).toBeGreaterThan(19_000)
    expect(c).toBeLessThan(22_000)
  })

  test('is what the server holds at: an open loop at 90% of it keeps up, and one at 130% builds a queue', () => {
    const c = capacityPerSMilli(CHAT)
    const p99 = (rho: number) => {
      const base: BenchSpec = { arrivals: poissonAt(rho * c), lengths: lengthsOf(CHAT), requests: 128 + 1500, warmupUs: 0, durationUs: 1, slo: CORPUS_SLO }
      const spec = windowed(5, base)
      const rows = measuredOf(runBench(5, spec, CORPUS_SERVER).rows, spec.warmupUs)
      return rows.map((r) => r.firstUs - r.dueUs).sort((a, b) => a - b)[Math.ceil(0.99 * rows.length) - 1]
    }
    expect(p99(0.6)).toBeLessThan(500_000)
    expect(p99(1.3)).toBeGreaterThan(5 * SEC)
  })

  test('is bounded: a mix whose run would use up its requests is refused rather than measured short', () => {
    const tiny: Traffic = { promptLo: 1, promptHi: 1, outLo: 1, outHi: 1 }
    expect(() => capacityPerSMilli(tiny)).toThrow(/used up/)
  })
})

describe('windowed', () => {
  const base: BenchSpec = { arrivals: poissonAt(10_000), lengths: lengthsOf(CHAT), requests: 600, warmupUs: 7, durationUs: 3, slo: CORPUS_SLO }

  test('ends the warm-up at the due time of the first row after the warm-up rows, so exactly 128 rows are excluded, and the window just after the last', () => {
    const spec = windowed(3, base)
    const due = dueTimes(3, base)
    expect(due).toHaveLength(600)
    expect(spec.warmupUs).toBe(due[128])
    expect(spec.durationUs).toBe(due[599] + 1)
    const run = runBench(3, spec, CORPUS_SERVER)
    expect(run.rows).toHaveLength(600)
    expect(run.rows.filter((r) => r.dueUs < spec.warmupUs)).toHaveLength(128)
    expect(planBench(3, spec).reqs).toHaveLength(600)
  })

  test('a warm-up of 0 rows is a warm-up of 0 µs, and a spec of fewer rows than the warm-up is refused', () => {
    expect(windowed(3, base, 0).warmupUs).toBe(0)
    expect(() => windowed(3, { ...base, requests: 100 })).toThrow(/cannot have a warm-up/)
  })

  test('a closed loop with no schedule has no due times to fit a window to', () => {
    expect(() => windowed(3, { ...base, arrivals: { kind: 'closed', clients: 8, thinkUs: 0 } })).toThrow(/no schedule/)
  })
})

describe('inFlightPeak', () => {
  const row = (id: number, sentUs: number, doneUs: number): BenchRow => ({ id, client: null, dueUs: sentUs, sentUs, firstUs: sentUs, doneUs, promptTokens: 1, outputTokens: 1 })

  test('finds the first instant at which the most are in flight, and the count, the way a sweep of the starts and the ends does', () => {
    const rows = [row(0, 0, 10), row(1, 2, 8), row(2, 4, 6), row(3, 6, 12), row(4, 9, 11)]
    // At 6: rows 0, 1, 3 (row 2 ends at 6 and row 3 starts at 6, which do not overlap), so 3 at 4 (rows 0, 1, 2) first.
    expect(inFlightPeak(rows, 0, 100)).toEqual({ count: 3, atUs: 4 })
    expect(inFlightMax(rows, (r) => r.sentUs, (r) => r.doneUs)).toBe(3)
  })

  test('looks only inside the window it is given', () => {
    const rows = [row(0, 0, 10), row(1, 2, 8), row(2, 4, 6)]
    expect(inFlightPeak(rows, 0, 3)).toEqual({ count: 2, atUs: 2 })
    // A peak is taken at a send. After the last send there is none to take, and the window's start is returned.
    expect(inFlightPeak(rows, 5, 100)).toEqual({ count: 0, atUs: 5 })
  })
})

describe('burstTrace', () => {
  const slice = burstTrace(9, CHAT, 5_000, 40_000, 100 * SEC, 5 * SEC)

  test('is shaped like a recorded slice, so the workload module reads it, and says it is synthetic', () => {
    expect(() => parseSlice(JSON.parse(JSON.stringify(slice)))).not.toThrow()
    expect(slice.kind).toBe('synthetic')
    expect(slice.license).toContain('synthetic')
    expect(slice.sampling).toEqual({ sourceMillisecondsPerTick: 1 })
  })

  test('has its rows in order of tick, with lengths from the traffic, and a burst of the rate it was asked for', () => {
    const ticks = slice.requests.map((r) => r.t)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
    for (const r of slice.requests) {
      expect(r.p).toBeGreaterThanOrEqual(128)
      expect(r.p).toBeLessThanOrEqual(512)
      expect(r.o).toBeGreaterThanOrEqual(64)
      expect(r.o).toBeLessThanOrEqual(192)
    }
    // The burst is the 5 s after the first 50 s: about 40 a second there and 5 a second around it.
    const inBurst = slice.requests.filter((r) => r.t >= 50_000 && r.t < 55_000).length
    const calm = slice.requests.filter((r) => r.t < 50_000).length
    expect(Math.abs(inBurst / 5 - 40)).toBeLessThan(8)
    expect(Math.abs(calm / 50 - 5)).toBeLessThan(1.5)
  })

  test('is a function of the seed, and another seed draws another trace', () => {
    expect(burstTrace(9, CHAT, 5_000, 40_000, 100 * SEC, 5 * SEC)).toEqual(slice)
    expect(burstTrace(10, CHAT, 5_000, 40_000, 100 * SEC, 5 * SEC).requests).not.toEqual(slice.requests)
  })

  test('replays at its own pace: the due times are the ticks, in µs, from the first row', () => {
    const w = replayWorkload(1, { slice, speedPermille: 1000 })
    const first = slice.requests[0].t
    expect(w.reqs.map((r) => r.dueUs)).toEqual(slice.requests.map((r) => (r.t - first) * 1000))
  })
})
