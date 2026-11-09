/*
 * W0-T02's acceptance check 3, for FSRS: the reference vectors reproduce through the vendored memory model
 * (vendor/kernelspace/src/lib/learner/fsrs.ts, unchanged).
 *
 * The vectors are what ts-fsrs 5.4.2 produced, not what fsrs.ts produced: 2,000 replays of up to 12 reviews, a grid of
 * R(t, S) values and a grid of intervals. The model transcribes ts-fsrs's formulas and its rounding points, so the tolerance
 * is the 1e-8 that the rounding allows, and intervals are whole days that must match exactly.
 */
import { describe, expect, test } from 'bun:test'
import { DEFAULT_RETENTION, MAX_INTERVAL, W, intervalDays, nextMemory, retrievability } from '../../vendor/kernelspace/src/lib/learner/fsrs'
import type { MemoryState, Rating } from '../../vendor/kernelspace/shims/src/lib/learner/types'
import fixture from '../../vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json'

const TOLERANCE = 1e-8

interface Vectors {
  generator: { tool: string; version: string; config: Record<string, unknown> }
  w: number[]
  stats: Record<string, number>
  curve: { t: number; s: number; r: number }[]
  intervals: { s: number; retention: number; days: number }[]
  /** Per step: [days since the last review, grade, R before the review (null on the first), S after, D after, interval in days]. */
  sequences: { retention: number; steps: [number, Rating, number | null, number, number, number][] }[]
}

const vectors = fixture as unknown as Vectors
const near = (actual: number, expected: number) => Math.abs(actual - expected) <= TOLERANCE

describe('the fixture is ts-fsrs 5.4.2 output', () => {
  test('names its generator, with fuzz and learning steps off, and holds 2,000 replays of 1 to 12 reviews', () => {
    expect(vectors.generator.tool).toBe('ts-fsrs')
    expect(vectors.generator.version).toBe('5.4.2')
    expect(vectors.generator.config).toMatchObject({ enable_short_term: true, learning_steps: [], relearning_steps: [], enable_fuzz: false })
    expect(vectors.sequences).toHaveLength(2000)
    for (const { steps } of vectors.sequences) expect(steps.length >= 1 && steps.length <= 12).toBe(true)
  })

  test('spans every grade, same-day reviews, lapses, long gaps and several desired retentions', () => {
    const { stats } = vectors
    for (const key of ['sameDay', 'lapses', 'hard', 'easy']) expect(stats[key]).toBeGreaterThan(500)
    expect(stats['longGaps']).toBeGreaterThan(200)
    expect(new Set(vectors.sequences.map((s) => s.retention)).size).toBeGreaterThanOrEqual(6)
    expect([...new Set(vectors.sequences.flatMap((s) => s.steps.map((step) => step[1])))].sort()).toEqual([1, 2, 3, 4])
  })
})

describe('the model reproduces it', () => {
  test('the 21 weights are the FSRS-6 defaults of the reference', () => {
    expect(W).toHaveLength(21)
    expect([...W]).toEqual(vectors.w)
  })

  test('every replayed step matches R, S, D and the interval (1e-8; intervals exactly)', () => {
    let worst = 0
    for (const [i, { retention, steps }] of vectors.sequences.entries()) {
      let memory: MemoryState | null = null
      for (const [k, [t, grade, r, s, d, interval]] of steps.entries()) {
        const where = `sequence ${i} step ${k}`
        if (r !== null) {
          const got = retrievability(t, (memory as MemoryState).stability)
          worst = Math.max(worst, Math.abs(got - r))
          if (!near(got, r)) throw new Error(`${where}: R ${got} against ${r}`)
        }
        memory = nextMemory(memory, t, grade)
        worst = Math.max(worst, Math.abs(memory.stability - s), Math.abs(memory.difficulty - d))
        if (!near(memory.stability, s)) throw new Error(`${where}: S ${memory.stability} against ${s}`)
        if (!near(memory.difficulty, d)) throw new Error(`${where}: D ${memory.difficulty} against ${d}`)
        if (intervalDays(memory.stability, retention) !== interval) throw new Error(`${where}: interval ${intervalDays(memory.stability, retention)} against ${interval}`)
      }
    }
    expect(worst).toBeLessThanOrEqual(TOLERANCE)
  })

  test('R(t, S) matches over the grid, including t = 0 and both ends of S', () => {
    expect(vectors.curve.length).toBeGreaterThan(100)
    for (const { t, s, r } of vectors.curve) expect(near(retrievability(t, s), r)).toBe(true)
  })

  test('intervals match exactly over stability and desired retention in [0.5, 1]', () => {
    expect(vectors.intervals.length).toBeGreaterThan(100)
    for (const { s, retention, days } of vectors.intervals) expect(intervalDays(s, retention)).toBe(days)
  })
})

describe('properties the model keeps', () => {
  test('R is 1 at t = 0, 0.9 at t = S, and falls with t', () => {
    expect(retrievability(0, 5)).toBe(1)
    expect(Math.abs(retrievability(5, 5) - 0.9)).toBeLessThan(1e-6)
    expect(retrievability(10, 5)).toBeLessThan(retrievability(5, 5))
  })

  test('a first review sets S to the grade\'s weight (at least 0.1) and D within [1, 10]', () => {
    for (const grade of [1, 2, 3, 4] as const) {
      const m = nextMemory(null, 0, grade)
      expect(m.stability).toBe(Math.max(W[grade - 1], 0.1))
      expect(m.difficulty >= 1 && m.difficulty <= 10).toBe(true)
    }
    expect(nextMemory(null, 0, 1).difficulty).toBeGreaterThan(nextMemory(null, 0, 4).difficulty)
  })

  test('a lapse never leaves a card more stable than before, and Easy grows it more than Good, and Good more than Hard', () => {
    const base = nextMemory(nextMemory(null, 0, 3), 3, 3)
    for (const t of [1, 10, 100]) {
      const lapsed = nextMemory(base, t, 1)
      expect(lapsed.stability).toBeLessThanOrEqual(base.stability)
      expect(lapsed.difficulty).toBeGreaterThanOrEqual(base.difficulty)
    }
    const [hard, good, easy] = ([2, 3, 4] as const).map((grade) => nextMemory(base, 4, grade).stability)
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  test('a negative gap (clock skew in a replayed ledger) acts as the same day', () => {
    const m = nextMemory(null, 0, 3)
    expect(nextMemory(m, -2, 3)).toEqual(nextMemory(m, 0, 3))
  })

  test('intervals are whole days in [1, MAX_INTERVAL], default to 0.9 retention, and refuse a retention outside (0, 1]', () => {
    expect(intervalDays(0.001)).toBe(1)
    expect(intervalDays(1e9)).toBe(MAX_INTERVAL)
    expect(intervalDays(10)).toBe(intervalDays(10, DEFAULT_RETENTION))
    expect(intervalDays(10, 0.8)).toBeGreaterThan(intervalDays(10, 0.9))
    expect(() => intervalDays(10, 0)).toThrow(RangeError)
    expect(() => intervalDays(10, 1.01)).toThrow(RangeError)
  })

  test('is deterministic: the same replay twice gives identical bits', () => {
    const run = () => {
      let m: MemoryState | null = null
      for (const [t, grade] of [[0, 3], [1, 3], [4, 1], [0, 2], [9, 4]] as [number, Rating][]) m = nextMemory(m, t, grade)
      return m
    }
    expect(run()).toStrictEqual(run())
  })
})
