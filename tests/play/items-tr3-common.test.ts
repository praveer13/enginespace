/*
 * W2b-T105 and W2b-T106: what the eight families of TR3 owe every family. Each item is deterministic and well formed, graded as its key says,
 * and explained: a sentence holds no digit, every option says why, and a lure names the misconception it encodes. The step shown before an
 * answer at level 1 (and a Test asks at level 1) is the rule alone, with no figure of the scene and no word of the key. Seeds run in chunks
 * of a hundred (tests/seeds.ts), so the nightly run's 10,000 are a hundred short tests.
 */
import { describe, expect, test } from 'bun:test'
import { LEVELS, offeredAt, plain } from '@es/play/items'
import type { Gen, Item } from '@es/play/items'
import { captureWindow } from '@es/play/items/families/tr3/capture-window'
import { flatCurve } from '@es/play/items/families/tr3/flat-curve'
import { floor } from '@es/play/items/families/tr3/floor'
import { gapCause } from '@es/play/items/families/tr3/gap-cause'
import { insideAGraph } from '@es/play/items/families/tr3/inside-a-graph'
import { launchAndKernel } from '@es/play/items/families/tr3/launch-and-kernel'
import { providerPreflight } from '@es/play/items/families/tr3/provider-preflight'
import { whichCategory } from '@es/play/items/families/tr3/which-category'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { chunks } from './items-tr3-support.ts'

const FAMILIES_UNDER_TEST: readonly Gen[] = [captureWindow, flatCurve, floor, gapCause, insideAGraph, launchAndKernel, providerPreflight, whichCategory]

describe.each(FAMILIES_UNDER_TEST.map((gen) => [gen.id, gen] as const))('%s', (_, gen) => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: deterministic, well formed, graded as the key says`, () => {
        for (const seed of seeds) {
          for (const variant of offeredAt(gen, level)) {
            const item = gen.make(seed, level, variant.id)
            expect(gen.make(seed, level, variant.id)).toEqual(item)
            expect(itemProblems(gen, item, { seed, level, variant: variant.id })).toEqual([])
            expect(gen.grade(item, keyOf(item)).ok).toBe(true)
            expect(gen.grade(item, wrongOf(item)).ok).toBe(false)
            const last = gen.solution(item).at(-1)
            if (item.answer.kind === 'numeric') expect(last?.result?.value, `${variant.id} seed ${seed}`).toBe(item.answer.truth)
          }
        }
      })
    }
  }

  test('has no digit in a sentence, every option says why, and a lure names the misconception it encodes', () => {
    for (const seed of chunks[0].slice(0, 60)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(gen, level)) {
          const item = gen.make(seed, level, variant.id)
          const sentences = [item.stem, ...item.worked.map((step) => step.text), ...gen.solution(item).map((step) => step.text)]
          for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text, `${variant.id} seed ${seed}`).not.toMatch(/\d/)
          if (item.answer.kind === 'choice') {
            for (const option of item.answer.options) {
              expect(plain(option.why).length).toBeGreaterThan(30)
              for (const part of option.why) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
              if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
              else expect(option.miss).toMatch(new RegExp(`^${gen.id.replace('.', '\\.')}\\.[a-z-]+$`))
            }
          }
        }
      }
    }
  })

  test('shows, before an answer, a whole solution at level 0, the words of the first step at level 1 and nothing after', () => {
    for (const seed of chunks[0].slice(0, 60)) {
      for (const variant of gen.variants) {
        expect(gen.make(seed, 0, variant.id).worked.length).toBeGreaterThanOrEqual(2)
        const one = gen.make(seed, 1, variant.id)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(gen.make(seed, 2, variant.id).worked).toEqual([])
        expect(gen.make(seed, 3, variant.id).worked).toEqual([])
      }
    }
  })
})

/** The words of the key: a number, or the right option's text with and without its first word. */
function keyWords(item: Item): string[] {
  if (item.answer.kind === 'numeric') return []
  const { options, correct } = item.answer
  const words = plain(options.find((option) => option.id === correct)?.text ?? [])
  return [words]
}

describe('the step a Test shows before the answer gives nothing away', () => {
  for (const gen of FAMILIES_UNDER_TEST) {
    test(`${gen.id}: the first step of every item, at every level, is the rule alone`, () => {
      for (const seed of chunks[0]) {
        for (const level of LEVELS) {
          for (const variant of offeredAt(gen, level)) {
            const item = gen.make(seed, level, variant.id)
            const first = gen.solution(item)[0]
            const where = `${gen.id}/${variant.id} level ${level} seed ${seed}`
            // The rule names no figure of the scene, no code and no result, so it holds neither the key nor the right option's words.
            expect(first.text.some((part) => part.t === 'num' || part.t === 'code'), where).toBe(false)
            expect(first.result, where).toBeUndefined()
            const words = plain(first.text)
            for (const key of keyWords(item)) expect(words.includes(key), `${where}: ${words}`).toBe(false)
            if (level === 1) expect(item.worked[0].text, where).toEqual(first.text)
          }
        }
      }
    })
  }
})
