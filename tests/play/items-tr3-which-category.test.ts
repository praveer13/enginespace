/*
 * W2b-T105: `tr3.which-category`. Each key is read again from the lines the ticket prints, by a per-microsecond oracle written here and
 * sharing no code with `@es/sim/trace`: at every µs the GPU runs a kernel, runs only a copy or is idle, and the main thread is busy or
 * idle. The words of the four categories are the viewer's, and the CPU gap's word is the course's one key.
 */
import { describe, expect, test } from 'bun:test'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { whichCategory } from '@es/play/items/families/tr3/which-category'
import { GAP_WORD } from '@/copy/terms'
import { CATEGORY_WORDS } from '@/trace/marks'
import { keyOf } from './items-support.ts'
import { CHUNK, chunks, codesOf, fromTo, givenCode, numsOf } from './items-tr3-support.ts'

type Category = 'kernel' | 'copy' | 'cpu-gap' | 'both-idle'

/** The category of each µs of the window, from the ticket's span lines alone. */
function oracle(item: Item): Category[] {
  const [, width] = fromTo(givenCode(item, 'window'))
  const kernel = new Array<boolean>(width).fill(false)
  const copy = new Array<boolean>(width).fill(false)
  const cpu = new Array<boolean>(width).fill(false)
  for (const given of item.givens) {
    if (given.value.t !== 'code' || given.label === 'window') continue
    const kind = given.value.code.split(',')[0]
    const [from, to] = fromTo(given.value.code)
    for (let t = from; t < to; t += 1) {
      if (kind === 'kernel') kernel[t] = true
      else if (kind === 'copy') copy[t] = true
      else cpu[t] = true
    }
  }
  return kernel.map((k, t): Category => (k ? 'kernel' : copy[t] ? 'copy' : cpu[t] ? 'cpu-gap' : 'both-idle'))
}

const categoryOfTerm = (term: string): Category => {
  const found = (Object.keys(CATEGORY_WORDS) as Category[]).find((category) => CATEGORY_WORDS[category].term === term)
  if (found === undefined) throw new Error(`no category with the word "${term}"`)
  return found
}

describe('the words', () => {
  test("are the viewer's, and the CPU gap's is the course's one key", () => {
    expect(GAP_WORD).toBe(CATEGORY_WORDS['cpu-gap'].term)
    for (const level of LEVELS) {
      const item = whichCategory.make(1, level, 'stretch')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options.map((option) => plain(option.text)).sort()).toEqual(Object.values(CATEGORY_WORDS).map((word) => word.term).sort())
    }
  })

  test('are the same four in the family as in the viewer, with the same meaning', async () => {
    const { WORDS } = await import('@es/play/items/families/tr3/which-category')
    expect(WORDS).toEqual(CATEGORY_WORDS)
  })

  test('the family is registered and names the partition KC', () => {
    expect(familyById('tr3.which-category')).toBe(whichCategory)
    expect(FAMILIES).toContain(whichCategory)
    expect(whichCategory.kcs).toEqual(['tr3.partition'])
    for (const level of LEVELS) expect(offeredAt(whichCategory, level).map((variant) => whichCategory.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric'])
  })
})

describe('the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: the stretch is one category throughout and the window's µs add up`, () => {
        for (const seed of seeds) {
          const stretch = whichCategory.make(seed, level, 'stretch')
          const [from, to] = numsOf(stretch.stem)
          const cats = oracle(stretch).slice(from, to)
          expect(new Set(cats).size, `seed ${seed}`).toBe(1)
          if (stretch.answer.kind !== 'choice') throw new Error('a choice')
          const { correct, options } = stretch.answer
          expect(categoryOfTerm(plain(options.find((option) => option.id === correct)?.text ?? [])), `seed ${seed}`).toBe(cats[0])
          expect(to - from).toBeGreaterThanOrEqual(6)

          const window = whichCategory.make(seed, level, 'window')
          const asked = categoryOfTerm(codesOf(window.stem)[0])
          const all = oracle(window)
          const [, width] = fromTo(givenCode(window, 'window'))
          expect(all).toHaveLength(width)
          expect(window.answer.kind === 'numeric' && window.answer.truth, `seed ${seed}`).toBe(all.filter((c) => c === asked).length)
          expect(window.answer.kind === 'numeric' && window.answer.truth, `seed ${seed}`).toBeGreaterThan(0)
        }
      })
    }
  }

  test('the key of a stretch is each category one time in four, and its place each of the four places one time in four', () => {
    const byCategory = new Map<string, number>()
    const byPlace = new Map<string, number>()
    const seeds = chunks[0]
    for (const seed of seeds) {
      const item = whichCategory.make(seed, 1, 'stretch')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const word = plain(item.answer.options.find((option) => option.id === (item.answer.kind === 'choice' ? item.answer.correct : ''))?.text ?? [])
      byCategory.set(word, (byCategory.get(word) ?? 0) + 1)
      byPlace.set(item.answer.correct, (byPlace.get(item.answer.correct) ?? 0) + 1)
    }
    for (const count of [...byCategory.values(), ...byPlace.values()]) {
      expect(count).toBeGreaterThan(seeds.length / 4 / 2)
      expect(count).toBeLessThan((seeds.length / 4) * 2)
    }
    expect(byCategory.size).toBe(4)
    expect(byPlace.size).toBe(4)
  })

  test('from level 1 the main thread is often busy while the GPU runs, so that "the CPU is busy" is not a CPU gap; at level 3 two streams overlap', () => {
    let hidden = 0
    let twoStreams = 0
    for (const seed of chunks[0]) {
      const one = whichCategory.make(seed, 1, 'window')
      const cats = oracle(one)
      const cpuBusyUs = one.givens.reduce((n, given) => (given.value.t === 'code' && given.value.code.startsWith('busy') ? n + fromTo(given.value.code)[1] - fromTo(given.value.code)[0] : n), 0)
      if (cpuBusyUs > cats.filter((c) => c === 'cpu-gap').length) hidden += 1
      if (whichCategory.make(seed, 3, 'window').givens.some((given) => given.label.startsWith('GPU stream 2'))) twoStreams += 1
      expect(whichCategory.make(seed, 0, 'window').givens.every((given) => !given.label.startsWith('GPU stream 2'))).toBe(true)
    }
    expect(hidden).toBeGreaterThan(CHUNK / 4)
    expect(twoStreams).toBeGreaterThan(CHUNK / 4)
  })
})

describe('the diagnoses', () => {
  test('a wrong count that a rule recognises is named: all the idle time for a CPU gap, and all the CPU busy time', () => {
    const seen = new Set<string>()
    for (const seed of chunks[0]) {
      const item = whichCategory.make(seed, 2, 'window')
      for (let value = 0; value <= 400; value += 1) {
        const grade = whichCategory.grade(item, { kind: 'numeric', value })
        if (!grade.ok && grade.diagnosis !== undefined) seen.add(grade.diagnosis.id)
      }
      expect(whichCategory.grade(item, keyOf(item)).diagnosis).toBeUndefined()
    }
    expect([...seen].every((id) => /^tr3\.which-category\.[a-z-]+$/.test(id))).toBe(true)
    expect(seen.has('tr3.which-category.all-idle-is-cpu-gap')).toBe(true)
    expect(seen.has('tr3.which-category.all-cpu-busy')).toBe(true)
  })
})
