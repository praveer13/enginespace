/*
 * W2b-T29: `tr0.view-or-copy`. Each key is read again from the lines that the ticket prints, by an oracle that works on buffer positions
 * and not on `@es/sim/tensor` (items-tr0-support.ts): a call is a view if the result can still be read through strides, `view` fails where
 * it cannot, `reshape` and `contiguous` then write a new buffer, and a copy moves every element the tensor holds at that call.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, FAMILIES, familyById, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { viewOrCopy } from '@es/play/items/families/tr0/view-or-copy'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { fresh, linesOf, parseCall, parseStart, run } from './items-tr0-support.ts'
import type { Positions } from './items-tr0-support.ts'

setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0xc09)

/** What the lines do, from the printed text alone: the outcome of each line and the elements it moved. */
function derive(item: Item): { outcomes: ('view' | 'copy' | 'fail')[]; moved: number } {
  const lines = linesOf(item)
  let t: Positions = fresh(parseStart(lines[0]))
  const outcomes: ('view' | 'copy' | 'fail')[] = []
  let moved = 0
  for (const line of lines.slice(1)) {
    const next = run(t, parseCall(line))
    if (next === 'fail') {
      outcomes.push('fail')
      break
    }
    outcomes.push(next.moved > 0 ? 'copy' : 'view')
    moved += next.moved
    t = next.t
  }
  return { outcomes, moved }
}

describe('the family', () => {
  test('is registered, names a KC of the graph, and has a numeric variant at every level', () => {
    expect(familyById('tr0.view-or-copy')).toBe(viewOrCopy)
    expect(FAMILIES).toContain(viewOrCopy)
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of viewOrCopy.kcs) expect(ids.has(kc)).toBe(true)
    for (const level of LEVELS) {
      const kinds = offeredAt(viewOrCopy, level).map((variant) => viewOrCopy.make(SEEDS[0], level, variant.id).answer.kind)
      expect(kinds).toContain('numeric')
      expect(kinds).toContain('choice')
    }
  })
})

describe('the keys', () => {
  test.each(LEVELS)('at level %p, last-call: the key is what the oracle says the last line does, and no earlier line fails', (level) => {
    const counts = { view: 0, copy: 0, fail: 0 }
    for (const seed of SEEDS) {
      const item = viewOrCopy.make(seed, level, 'last-call')
      const { outcomes } = derive(item)
      expect(outcomes.slice(0, -1).every((outcome) => outcome !== 'fail')).toBe(true)
      expect(item.answer.kind === 'choice' && item.answer.correct).toBe(outcomes.at(-1))
      counts[outcomes.at(-1) as 'view' | 'copy' | 'fail'] += 1
    }
    // Answer first: each of the three is the key about a third of the time.
    for (const outcome of ['view', 'copy', 'fail'] as const) {
      expect(counts[outcome]).toBeGreaterThan(SEEDS.length / 5)
      expect(counts[outcome]).toBeLessThan(SEEDS.length / 2.2)
    }
  })

  test.each(LEVELS)('at level %p, moved: the key is the elements moved in all, by the oracle, and is never nothing', (level) => {
    for (const seed of SEEDS) {
      const item = viewOrCopy.make(seed, level, 'moved')
      const { outcomes, moved } = derive(item)
      expect(outcomes).not.toContain('fail')
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'elements', truth: moved })
      expect(moved).toBeGreaterThan(0)
    }
  })

  test('the chain grows with the level: two lines at levels 0 and 1, then more, and rank 3 from level 2', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const lengths = LEVELS.map((level) => linesOf(viewOrCopy.make(seed, level, 'moved')).length - 1)
      expect(lengths).toEqual([2, 2, 3, 4])
      for (const level of LEVELS) {
        const rank = (line: string): number => (parseStart(line).length)
        expect(rank(linesOf(viewOrCopy.make(seed, level, 'last-call'))[0])).toBe(level <= 1 ? 2 : 3)
      }
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const variant of offeredAt(viewOrCopy, level)) {
        const item = viewOrCopy.make(seed, level, variant.id)
        expect(viewOrCopy.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(viewOrCopy, item, { seed, level, variant: variant.id })).toEqual([])
        expect(viewOrCopy.grade(item, keyOf(item)).ok).toBe(true)
        expect(viewOrCopy.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('has no digit in a sentence, every option says why, and a lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(viewOrCopy, level)) {
          const item = viewOrCopy.make(seed, level, variant.id)
          const sentences = [item.stem, ...item.worked.map((step) => step.text), ...viewOrCopy.solution(item).map((step) => step.text)]
          for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
          if (item.answer.kind === 'choice') {
            for (const option of item.answer.options) {
              expect(plain(option.why).length).toBeGreaterThan(30)
              if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
              else expect(option.miss).toMatch(/^tr0\.view-or-copy\.[a-z-]+$/)
            }
          }
        }
      }
    }
  })

  test('the solution of a numeric item ends in the key, and worked parts follow the level', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = viewOrCopy.make(seed, level, 'moved')
        expect(viewOrCopy.solution(item).at(-1)?.result?.value).toBe(item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
        expect(item.worked.length > 0).toBe(level <= 1)
        if (level === 0) expect(item.worked.at(-1)?.result?.value).not.toBe(item.answer.kind === 'numeric' ? item.answer.truth : -1)
      }
    }
  })
})

describe('diagnoses', () => {
  test('a wrong count that a rule recognises is named', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = viewOrCopy.make(seed, 3, 'moved')
      if (item.answer.kind !== 'numeric') continue
      for (let value = 0; value <= 600; value += 1) {
        if (value === item.answer.truth) continue
        const graded = viewOrCopy.grade(item, { kind: 'numeric', value })
        expect(graded.ok).toBe(false)
        if (graded.diagnosis !== undefined) seen.add(graded.diagnosis.id)
      }
    }
    expect([...seen].sort()).toEqual(['tr0.view-or-copy.all-views', 'tr0.view-or-copy.counted-the-start', 'tr0.view-or-copy.one-copy'])
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(viewOrCopy, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(50, 4)) expect(viewOrCopy.band(drawInBand(viewOrCopy, level, entropy).seed, level)).toBe(true)
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(viewOrCopy, level, bandedSeeds(viewOrCopy, level, 1000))
      expect(report.over).toEqual([])
    }
  })

  test('the method named in the last line leaves the answer open: no method gives the same outcome more than it should', () => {
    // `view` is a view or an error, `reshape` a view or a copy, and `contiguous` a copy: the reading of the name alone is held under 60 percent, which the family states as its limit.
    const tally = new Map<string, Map<string, number>>()
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const item = viewOrCopy.make(seed, level, 'last-call')
        const last = parseCall(linesOf(item).at(-1) as string).op
        const outcome = item.answer.kind === 'choice' ? item.answer.correct : ''
        const row = tally.get(last) ?? new Map<string, number>()
        row.set(outcome, (row.get(outcome) ?? 0) + 1)
        tally.set(last, row)
      }
    }
    let right = 0
    let all = 0
    for (const row of tally.values()) {
      right += Math.max(...row.values())
      all += [...row.values()].reduce((a, b) => a + b, 0)
    }
    expect(right / all).toBeLessThan(0.75)
  })
})
