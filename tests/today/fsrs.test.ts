/*
 * W1-T05, accept 1: the FSRS reference vectors pass through the wrapper (src/items/today/fsrs.ts).
 *
 * The vectors are what ts-fsrs 5.4.2 produced (vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json): 2,000 replays of 1 to 12
 * reviews, a grid of R(t, S) values and a grid of intervals. tests/vendor/fsrs.test.ts replays them through the vendored model itself.
 * This replays them through the four functions that Today calls, so a wrapper that dropped an argument, swapped two or rounded a
 * result fails the very vectors the model passes. Tolerance is the 1e-8 that the model's own rounding allows; intervals are whole
 * days and must match exactly.
 */
import { describe, expect, test } from 'bun:test'
import { MAX_INTERVAL, RATING_NAMES, RATINGS, TARGET_RETENTION, W, afterReview, firstMemory, gradeOf, intervalOf, isRating, recallAfter } from '../../src/items/today/fsrs'
import type { MemoryState, Rating } from '../../src/items/today/fsrs'
import fixture from '../../vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json'

const TOLERANCE = 1e-8

interface Vectors {
  generator: { tool: string; version: string }
  w: number[]
  curve: { t: number; s: number; r: number }[]
  intervals: { s: number; retention: number; days: number }[]
  /** Per step: [days since the last review, grade, R before the review (null on the first), S after, D after, interval in days]. */
  sequences: { retention: number; steps: [number, Rating, number | null, number, number, number][] }[]
}

const vectors = fixture as unknown as Vectors
const near = (actual: number, expected: number) => Math.abs(actual - expected) <= TOLERANCE

describe('the wrapper replays ts-fsrs 5.4.2', () => {
  test('reads the vectors of ts-fsrs 5.4.2, 2,000 sequences of them, and the weights are the reference\'s', () => {
    expect(vectors.generator.tool).toBe('ts-fsrs')
    expect(vectors.generator.version).toBe('5.4.2')
    expect(vectors.sequences).toHaveLength(2000)
    expect([...W]).toEqual(vectors.w)
  })

  test('every step of every sequence matches R before the review, S and D after it, and the interval at the sequence\'s retention', () => {
    let steps = 0
    let worst = 0
    for (const [index, { retention, steps: recorded }] of vectors.sequences.entries()) {
      let memory: MemoryState | null = null
      for (const [at, [days, grade, recall, stability, difficulty, interval]] of recorded.entries()) {
        const where = `sequence ${index} step ${at}`
        if (memory !== null) {
          const got = recallAfter(memory, days)
          worst = Math.max(worst, Math.abs(got - (recall as number)))
          if (!near(got, recall as number)) throw new Error(`${where}: R ${got} against ${recall}`)
        }
        memory = memory === null ? firstMemory(grade) : afterReview(memory, days, grade)
        worst = Math.max(worst, Math.abs(memory.stability - stability), Math.abs(memory.difficulty - difficulty))
        if (!near(memory.stability, stability)) throw new Error(`${where}: S ${memory.stability} against ${stability}`)
        if (!near(memory.difficulty, difficulty)) throw new Error(`${where}: D ${memory.difficulty} against ${difficulty}`)
        if (intervalOf(memory, retention) !== interval) throw new Error(`${where}: interval ${intervalOf(memory, retention)} against ${interval}`)
        steps += 1
      }
    }
    expect(steps).toBeGreaterThan(12_000)
    expect(worst).toBeLessThanOrEqual(TOLERANCE)
  })

  test('R(t, S) matches over the grid, t = 0 and both ends of S included', () => {
    expect(vectors.curve.length).toBeGreaterThan(100)
    for (const { t, s, r } of vectors.curve) expect(near(recallAfter({ stability: s, difficulty: 5 }, t), r)).toBe(true)
  })

  test('intervals match exactly over stability and retention in [0.5, 1]', () => {
    expect(vectors.intervals.length).toBeGreaterThan(100)
    for (const { s, retention, days } of vectors.intervals) expect(intervalOf({ stability: s, difficulty: 5 }, retention)).toBe(days)
  })
})

describe('what the wrapper chooses', () => {
  test('schedules for 90 % recall by default [estimated], and the default is the one the vectors record for the model', () => {
    expect(TARGET_RETENTION).toBe(0.9)
    const memory = firstMemory(3)
    expect(intervalOf(memory)).toBe(intervalOf(memory, 0.9))
    expect(intervalOf(memory, 0.8)).toBeGreaterThan(intervalOf(memory))
    expect(() => intervalOf(memory, 0)).toThrow(RangeError)
  })

  test('a first review sets the memory to the grade\'s weight, and a first Good is due in two days', () => {
    for (const grade of RATINGS) expect(firstMemory(grade).stability).toBe(Math.max(W[grade - 1], 0.1))
    expect(intervalOf(firstMemory(3))).toBe(2)
    expect(intervalOf(firstMemory(1))).toBe(1)
    expect(intervalOf(firstMemory(4))).toBe(8)
  })

  test('an interval never passes the model\'s longest', () => {
    expect(intervalOf({ stability: 1e9, difficulty: 5 })).toBe(MAX_INTERVAL)
  })

  test('the four grades are named, and only they are grades', () => {
    expect(RATINGS.map((grade) => RATING_NAMES[grade])).toEqual(['again', 'hard', 'good', 'easy'])
    expect([0, 5, 2.5, '3', null].some((value) => isRating(value))).toBe(false)
    expect(RATINGS.every((grade) => isRating(grade))).toBe(true)
  })
})

describe('the grade of an answer', () => {
  test('wrong is Again whatever the learner said, right is Good, a right guess is Hard and a right answer they were sure of is Easy', () => {
    expect(gradeOf({ ok: false })).toBe(1)
    for (const conf of ['guess', 'think', 'sure'] as const) expect(gradeOf({ ok: false, conf })).toBe(1)
    expect(gradeOf({ ok: true })).toBe(3)
    expect(gradeOf({ ok: true, conf: 'think' })).toBe(3)
    expect(gradeOf({ ok: true, conf: 'guess' })).toBe(2)
    expect(gradeOf({ ok: true, conf: 'sure' })).toBe(4)
  })
})
