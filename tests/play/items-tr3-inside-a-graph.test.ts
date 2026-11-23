/*
 * W2b-T105: `tr3.inside-a-graph`. The rule is read from the claims of the profiler's own guide (a graph traced at graph level is one item,
 * at node level every node's activity, and the kernels of a replay carry no NVTX ranges), and each key is counted again from the layers
 * the ticket prints: the kernels of one layer are the names listed, times the layers, plus the kernels outside the graph.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { insideAGraph } from '@es/play/items/families/tr3/inside-a-graph'
import { keyOf } from './items-support.ts'
import { chunks, codesOf, givenCode, givenNum, numsOf } from './items-tr3-support.ts'

const root = path.resolve(import.meta.dirname, '../..')
const claims = load(readFileSync(path.join(root, 'content/claims/tr3.yaml'), 'utf8')) as { id: string; tag: string; pin: string; text: string }[]
const claim = (id: string) => claims.find((candidate) => candidate.id === id)

describe('the rule rests on claims', () => {
  test('each claim exists and is measured', () => {
    for (const [id, pin] of [
      ['nsys.graph-trace-default', 'nsys'],
      ['nsys.graph-trace-node', 'nsys'],
      ['sglang.profiling.nvtx-in-graphs', 'sglang'],
      ['sglang.profiling.graph-hides-source', 'sglang'],
    ] as const) {
      const found = claim(id)
      expect(found, id).toBeDefined()
      expect(found?.tag).toBe('measured')
      expect(found?.pin).toBe(pin)
    }
    expect(claim('nsys.graph-trace-default')?.text).toContain('as one item')
    expect(claim('nsys.graph-trace-node')?.text).toContain('each node')
  })
})

describe('the family', () => {
  test('is registered, names the graph-traces KC, and has a choice and a numeric variant at every level', () => {
    expect(familyById('tr3.inside-a-graph')).toBe(insideAGraph)
    expect(FAMILIES).toContain(insideAGraph)
    expect(insideAGraph.kcs).toEqual(['tr3.graph-traces'])
    for (const level of LEVELS) expect(offeredAt(insideAGraph, level).map((variant) => insideAGraph.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })
})

/** The kernels and calls of the three ways, from the ticket's own givens. */
function counts(item: Item): { layers: number; perLayer: number; outside: number; inGraph: number } {
  const perLayer = givenCode(item, 'one layer launches').split(', ').length
  const layers = givenNum(item, 'layers in the step')
  const outside = item.givens.some((given) => given.label === 'kernels run outside the graph') ? givenNum(item, 'kernels run outside the graph') : 0
  return { layers, perLayer, outside, inGraph: layers * perLayer }
}

describe('the keys, counted again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}`, () => {
        for (const seed of seeds) {
          const kernels = insideAGraph.make(seed, level, 'kernels')
          const c = counts(kernels)
          expect(kernels.answer.kind === 'numeric' && kernels.answer.truth, `seed ${seed}`).toBe(c.inGraph + c.outside)
          expect(c.outside > 0).toBe(level >= 2)

          const shows = insideAGraph.make(seed, level, 'what-shows')
          const d = counts(shows)
          if (shows.answer.kind !== 'choice') throw new Error('a choice')
          const { correct, options } = shows.answer
          const right = options.find((option) => option.id === correct)
          const asked = codesOf(shows.stem)[0] ?? 'off'
          const expected =
            asked === '--cuda-graph-trace=graph'
              ? [1 + d.outside, 1 + d.outside]
              : asked === '--cuda-graph-trace=node'
                ? [1 + d.outside, d.inGraph + d.outside]
                : [d.inGraph + d.outside, d.inGraph + d.outside]
          expect(numsOf(right?.text ?? []), `seed ${seed}`).toEqual(expected)
          expect(plain(right?.text ?? [])).not.toContain('range')
          // The fourth option has the node-level counts and the ranges: never the key.
          const ranges = options.filter((option) => plain(option.text).includes('range'))
          expect(ranges).toHaveLength(1)
          expect(ranges[0].id).not.toBe(correct)
          expect(ranges[0].miss).toBe('tr3.inside-a-graph.ranges-inside-a-replay')
        }
      })
    }
  }

  test('each way is asked about one time in three', () => {
    const asked = new Map<string, number>()
    for (const seed of chunks[0]) {
      const key = codesOf(insideAGraph.make(seed, 0, 'what-shows').stem)[0] ?? 'off'
      asked.set(key, (asked.get(key) ?? 0) + 1)
    }
    expect(asked.size).toBe(3)
    for (const count of asked.values()) expect(count).toBeGreaterThan(chunks[0].length / 3 / 2)
  })
})

describe('the diagnoses', () => {
  test('the replay as one item, the kernels outside forgotten, and layers added to kernels are named', () => {
    const seen = new Set<string>()
    for (const seed of chunks[0]) {
      const item = insideAGraph.make(seed, 2, 'kernels')
      for (let value = 0; value <= 80; value += 1) {
        const grade = insideAGraph.grade(item, { kind: 'numeric', value })
        if (!grade.ok && grade.diagnosis !== undefined) seen.add(grade.diagnosis.id)
      }
      expect(insideAGraph.grade(item, keyOf(item)).diagnosis).toBeUndefined()
    }
    expect(seen).toEqual(new Set(['tr3.inside-a-graph.one-item', 'tr3.inside-a-graph.outside-forgotten', 'tr3.inside-a-graph.layers-plus-kernels']))
  })
})
