/*
 * W2b-T29: `tr0.strides-of`. Each key is read again from the lines that the ticket prints: the lines are parsed, applied by an oracle that
 * works on buffer positions and does not use `@es/sim/tensor` (items-tr0-support.ts), and the stride is the distance in the buffer of one
 * step along the dimension asked for. The model's own answer is held to the same numbers, and the family to the framework's rules.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  FAMILIES,
  familyById,
  fixedSeeds,
  LEVELS,
  measureBlind,
  offeredAt,
  plain,
} from '@es/play/items'
import type { Item, Level } from '@es/play/items'
import { stridesOf } from '@es/play/items/families/tr0/strides-of'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { fresh, linesOf, parseCall, parseStart, run, strideOf } from './items-tr0-support.ts'

setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0x57d)

/** The key from the printed lines alone: the dimension is in the stem's code, `b.stride(1)`. */
function derive(item: Item): number {
  const lines = linesOf(item)
  let t = fresh(parseStart(lines[0]))
  for (const line of lines.slice(1)) {
    const next = run(t, parseCall(line))
    if (next === 'fail') throw new Error(`${line} fails`)
    t = next.t
  }
  const ask = item.stem.find((part) => part.t === 'code' && /\.stride\(\d\)$/.test(part.code))
  const dim = Number((ask as { code: string }).code.match(/\((\d)\)/)?.[1])
  expect(t.shape[dim]).toBeGreaterThan(1)
  return strideOf(t, dim)
}

describe('the family', () => {
  test('is registered, names the KCs of the graph, and has a numeric variant at every level', () => {
    expect(familyById('tr0.strides-of')).toBe(stridesOf)
    expect(FAMILIES).toContain(stridesOf)
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of stridesOf.kcs) expect(ids.has(kc)).toBe(true)
    expect(stridesOf.kcs).toEqual(['tr0.tensor-metadata', 'tr0.broadcast-stride-zero'])
    expect(stridesOf.variants.find((variant) => variant.id === 'expand')?.kcs).toContain('tr0.broadcast-stride-zero')
    for (const level of LEVELS) {
      const kinds = new Set(offeredAt(stridesOf, level).map((variant) => stridesOf.make(SEEDS[0], level, variant.id).answer.kind))
      expect([...kinds]).toEqual(['numeric'])
    }
    expect(offeredAt(stridesOf, 2).map((variant) => variant.id)).toEqual(['after-op', 'expand', 'attention'])
    expect(offeredAt(stridesOf, 0).map((variant) => variant.id)).toEqual(['after-op', 'expand'])
  })
})

describe('the keys', () => {
  test.each(LEVELS)('at level %p, every key is the distance in the buffer that the printed lines give', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(stridesOf, level)) {
        const item = stridesOf.make(seed, level, variant.id)
        expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'elements' })
        const truth = item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN
        expect(derive(item), `${variant.id} at ${seed}`).toBe(truth)
      }
    }
  })

  test('an expand gives the dimension that grew a stride of zero, and the question asks for it about one time in ten', () => {
    let zero = 0
    const seeds = fixedSeeds(600, 0xe1)
    for (const seed of seeds) {
      const item = stridesOf.make(seed, 1, 'expand')
      if (item.answer.kind === 'numeric' && item.answer.truth === 0) zero += 1
    }
    expect(zero / seeds.length).toBeGreaterThan(0.05)
    expect(zero / seeds.length).toBeLessThan(0.15)
  })

  test('the attention reshapes: view to [tokens, heads, head size], then transpose(0, 1), and at level 3 contiguous()', () => {
    for (const seed of SEEDS) {
      for (const level of [2, 3] as const) {
        const item = stridesOf.make(seed, level, 'attention')
        const lines = linesOf(item)
        expect(lines).toHaveLength(level === 2 ? 3 : 4)
        const [tokens, wide] = parseStart(lines[0])
        const view = parseCall(lines[1])
        expect(view.op).toBe('view')
        const shape = view.op === 'view' ? view.shape : []
        expect(shape[0]).toBe(tokens)
        expect(shape[1] * shape[2]).toBe(wide)
        expect(parseCall(lines[2])).toEqual({ op: 'transpose', a: 0, b: 1 })
        expect(parseCall(lines[3] ?? 'x = a.contiguous()').op).toBe('contiguous')
        const truth = item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN
        // After the transpose the strides are [head size, heads * head size, 1]; after contiguous, [tokens * head size, head size, 1].
        const expected = level === 2 ? [shape[2], wide, 1] : [tokens * shape[2], shape[2], 1]
        expect(expected).toContain(truth)
      }
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const variant of offeredAt(stridesOf, level)) {
        const item = stridesOf.make(seed, level, variant.id)
        expect(stridesOf.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(stridesOf, item, { seed, level, variant: variant.id })).toEqual([])
        expect(stridesOf.grade(item, keyOf(item)).ok).toBe(true)
        expect(stridesOf.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('has no digit in a sentence, and the solution ends in the key as a derived number', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = stridesOf.make(seed, level)
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...stridesOf.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
        const last = stridesOf.solution(item).at(-1)?.result
        expect(last?.value).toBe(item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
        expect(last?.tag).toBe('derived')
      }
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const zero = stridesOf.make(seed, 0)
      expect(zero.worked.length).toBeGreaterThanOrEqual(3)
      expect(zero.worked.at(-1)?.result?.value).not.toBe(zero.answer.kind === 'numeric' ? zero.answer.truth : -1)
      const one = stridesOf.make(seed, 1)
      expect(one.worked).toHaveLength(1)
      expect(one.worked[0].result).toBeUndefined()
      expect(stridesOf.make(seed, 2).worked).toEqual([])
    }
  })
})

describe('diagnoses', () => {
  test('a wrong number that a rule recognises is named', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const variant of ['after-op', 'expand', 'attention'] as const) {
        const item = stridesOf.make(seed, 2, variant)
        if (item.answer.kind !== 'numeric') continue
        const truth = item.answer.truth
        for (let value = 0; value <= 200; value += 1) {
          if (value === truth) continue
          const graded = stridesOf.grade(item, { kind: 'numeric', value })
          expect(graded.ok).toBe(false)
          if (graded.diagnosis !== undefined) {
            expect(graded.diagnosis.id).toMatch(/^tr0\.strides-of\.[a-z-]+$/)
            expect(plain(graded.diagnosis.message).length).toBeGreaterThan(30)
            seen.add(graded.diagnosis.id)
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(['tr0.strides-of.expand-copied', 'tr0.strides-of.other-dimension', 'tr0.strides-of.size-for-stride', 'tr0.strides-of.unchanged'])
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(stridesOf, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(50, 4)) expect(stridesOf.band(drawInBand(stridesOf, level, entropy).seed, level)).toBe(true)
  })

  test('is not passed by a habit: no constant passes more than the bound at any level', () => {
    for (const level of LEVELS as readonly Level[]) {
      const report = measureBlind(stridesOf, level, bandedSeeds(stridesOf, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(0.15)
    }
  })

  test('a response of the wrong kind is wrong and never throws', () => {
    const item = stridesOf.make(SEEDS[0], 2)
    for (const response of [{ kind: 'choice', pick: 'x' }, { kind: 'numeric', value: Number.NaN }, { kind: 'numeric', value: -3 }] as const) {
      expect(stridesOf.grade(item, response).ok).toBe(false)
    }
  })
})
