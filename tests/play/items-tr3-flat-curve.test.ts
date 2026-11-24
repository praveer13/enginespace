/*
 * W2b-T106: `tr3.flat-curve`. Each key is worked out again from the table the ticket prints: a latency is flat while it stays within a tenth
 * of the first row's, and a step whose latency follows its prompt is compute-bound. The reader shares no code with the family. The tenth is
 * the course's own choice [estimated], and the stem says so with its tag. No key rests on an engine's statement that a flat curve is the
 * signature of launch overhead: that statement is vendor-reported and [unverified], and tr3.yaml holds no claim of it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { flatCurve } from '@es/play/items/families/tr3/flat-curve'
import { wrongOf } from './items-support.ts'
import { chunks } from './items-tr3-support.ts'

const root = path.resolve(import.meta.dirname, '../..')

interface Row {
  readonly tokens: number
  readonly on: number
  readonly off: number | null
}

function table(item: Item): Row[] {
  return item.givens.map((given) => {
    if (given.value.t !== 'code') throw new Error('code')
    const two = given.value.code.match(/^(\d+) tokens: off (\d+) µs, on (\d+) µs$/)
    if (two !== null) return { tokens: Number(two[1]), off: Number(two[2]), on: Number(two[3]) }
    const one = given.value.code.match(/^(\d+) tokens: (\d+) µs$/)
    if (one === null) throw new Error(given.value.code)
    return { tokens: Number(one[1]), on: Number(one[2]), off: null }
  })
}

/** The last row whose latency, and every one before it, is within a tenth of the first's. */
function flatUntil(times: readonly number[]): number {
  let last = 0
  for (let at = 1; at < times.length && Math.abs(times[at] - times[0]) <= 0.1 * times[0]; at += 1) last = at
  return last
}

function bound(rows: readonly Row[]): 'launch' | 'compute' | 'both' {
  const first = rows[0]
  const end = rows[rows.length - 1]
  if (rows.every((row) => Math.abs(row.on - first.on) <= 0.1 * first.on)) return 'launch'
  // The latency grew by about as much as the prompt: at least four fifths of its growth.
  return end.on / first.on >= 0.8 * (end.tokens / first.tokens) ? 'compute' : 'both'
}

const WORD = { launch: 'Launch-bound', compute: 'Compute-bound', both: 'Both' } as const

describe('the family', () => {
  test('is registered, names the flat-curve KC, and has a choice and a numeric variant at every level', () => {
    expect(familyById('tr3.flat-curve')).toBe(flatCurve)
    expect(FAMILIES).toContain(flatCurve)
    expect(flatCurve.kcs).toEqual(['tr3.flat-curve'])
    for (const level of LEVELS) expect(offeredAt(flatCurve, level).map((variant) => flatCurve.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })

  test("the tenth is tagged [estimated] in the stem, and the family's file holds no claim of the engine's statement", () => {
    for (const variant of ['which-bound', 'factor']) {
      const stem = flatCurve.make(1, 1, variant).stem
      expect(stem.some((part) => part.t === 'num' && part.value === 10 && part.tag === 'estimated' && part.unit === '%'), variant).toBe(true)
    }
    const claims = readFileSync(path.join(root, 'content/claims/tr3.yaml'), 'utf8')
    expect(claims.toLowerCase()).not.toContain('signature of launch overhead')
  })
})

describe('which-bound: the keys, read again from the table', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: flat is launch-bound, growth with the prompt is compute-bound, less is both`, () => {
        for (const seed of seeds) {
          const item = flatCurve.make(seed, level, 'which-bound')
          if (item.answer.kind !== 'choice') throw new Error('choice')
          const { correct, options } = item.answer
          const right = plain(options.find((option) => option.id === correct)?.text ?? [])
          expect(right.startsWith(WORD[bound(table(item))]), `seed ${seed}: ${right}`).toBe(true)
          expect(options.filter((option) => plain(option.text).startsWith(WORD[bound(table(item))]))).toHaveLength(1)
        }
      })
    }
  }

  test('each of the three is the key about one seed in three', () => {
    for (const level of LEVELS) {
      const counts = { launch: 0, compute: 0, both: 0 }
      for (const seed of chunks[0].concat(chunks[1] ?? [])) counts[bound(table(flatCurve.make(seed, level, 'which-bound')))] += 1
      for (const word of ['launch', 'compute', 'both'] as const) expect(counts[word] / 200, `${level} ${word}`).toBeGreaterThan(0.2)
    }
  })

  test('the table has seven rows (eight at level 3), the prompt at least doubles from row to row, and at level 2 each row has a graphs-off time above its graphs-on time', () => {
    for (const level of LEVELS) {
      for (const seed of chunks[0].slice(0, 40)) {
        const rows = table(flatCurve.make(seed, level, 'which-bound'))
        expect(rows).toHaveLength(level === 3 ? 8 : 7)
        for (let at = 1; at < rows.length; at += 1) expect(rows[at].tokens / rows[at - 1].tokens).toBeGreaterThanOrEqual(2)
        if (level === 2) for (const row of rows) expect(row.off ?? 0).toBeGreaterThan(row.on)
        else for (const row of rows) expect(row.off).toBeNull()
      }
    }
  })
})

describe('factor: the keys, read again from the table', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the prompt's growth to the last row within a tenth of the first, in the graphs-on column`, () => {
        for (const seed of seeds) {
          const item = flatCurve.make(seed, level, 'factor')
          if (item.answer.kind !== 'numeric') throw new Error('numeric')
          const rows = table(item)
          const last = flatUntil(rows.map((row) => row.on))
          expect(item.answer.truth, `seed ${seed}`).toBe(rows[last].tokens / rows[0].tokens)
          expect(item.answer.tolerance).toEqual({})
          // The next row is clearly out of the tenth, and every row up to the last is clearly inside: no row lies near the edge.
          if (last < rows.length - 1) expect(Math.abs(rows[last + 1].on - rows[0].on)).toBeGreaterThan(0.5 * rows[0].on)
          for (let at = 0; at <= last; at += 1) expect(Math.abs(rows[at].on - rows[0].on)).toBeLessThanOrEqual(0.06 * rows[0].on)
        }
      })
    }
  }

  test('a wrong answer is named: the whole table, one row too far, the other column, and a count of rows', () => {
    const ids = new Set<string>()
    for (const level of [0, 2] as const) {
      for (const seed of chunks[0]) {
        const item = flatCurve.make(seed, level, 'factor')
        const rows = table(item)
        const last = flatUntil(rows.map((row) => row.on))
        for (const value of [rows[rows.length - 1].tokens / rows[0].tokens, last + 1 < rows.length ? rows[last + 1].tokens / rows[0].tokens : 0, last, last + 1, rows[flatUntil(rows.map((row) => row.off ?? row.on))].tokens / rows[0].tokens]) {
          if (item.answer.kind === 'numeric' && value === item.answer.truth) continue
          const grade = flatCurve.grade(item, { kind: 'numeric', value })
          expect(grade.ok).toBe(false)
          ids.add(grade.diagnosis?.id ?? 'none')
        }
        expect(flatCurve.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
    for (const id of ['whole-table', 'one-row-past', 'wrong-column', 'rows-not-factor']) expect(ids.has(`tr3.flat-curve.${id}`), id).toBe(true)
  })
})
