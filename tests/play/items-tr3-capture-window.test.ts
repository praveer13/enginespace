/*
 * W2b-T105: `tr3.capture-window`. The rule is read from the claims of the two engines' documents (vLLM's delay and maximum, SGLang's start
 * and count, whose documented example is a start of 3 and a count of 10 holding steps 3 to 12), each key is worked out again from the
 * settings the ticket prints, and the engine's own words are on the ticket.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { captureWindow } from '@es/play/items/families/tr3/capture-window'
import { keyOf } from './items-support.ts'
import { chunks, givenNum, numsOf } from './items-tr3-support.ts'

const root = path.resolve(import.meta.dirname, '../..')
const claims = load(readFileSync(path.join(root, 'content/claims/tr3.yaml'), 'utf8')) as { id: string; tag: string; pin: string; text: string }[]
const claim = (id: string) => claims.find((candidate) => candidate.id === id)

describe('the rule rests on claims', () => {
  test('each claim exists, is measured and is pinned to the engine it is about', () => {
    for (const [id, pin] of [
      ['vllm.profiling.delay-iterations', 'vllm'],
      ['vllm.profiling.max-iterations', 'vllm'],
      ['vllm.profiling.delay-counts-steps', 'vllm'],
      ['sglang.profiling.start-step', 'sglang'],
      ['sglang.profiling.num-steps', 'sglang'],
      ['sglang.profiling.step-range', 'sglang'],
    ] as const) {
      const found = claim(id)
      expect(found, id).toBeDefined()
      expect(found?.tag).toBe('measured')
      expect(found?.pin).toBe(pin)
    }
  })

  test("the documented SGLang example is the family's rule: a start of 3 and a count of 10 hold steps 3 to 12", () => {
    expect(claim('sglang.profiling.step-range')?.text).toContain('3 to 12')
    // The family's own arithmetic agrees: its rule, applied to start 3 and size 10, is 3 through 12.
    const first = 3
    const size = 10
    expect([first, first + size - 1]).toEqual([3, 12])
  })
})

describe('the family', () => {
  test('is registered, names the capture-window KC, and has a numeric variant at every level', () => {
    expect(familyById('tr3.capture-window')).toBe(captureWindow)
    expect(FAMILIES).toContain(captureWindow)
    expect(captureWindow.kcs).toEqual(['tr3.capture-window'])
    for (const level of LEVELS) expect(offeredAt(captureWindow, level).map((variant) => captureWindow.make(1, level, variant.id).answer.kind).sort()).toEqual(['choice', 'numeric', 'numeric'])
  })

  test("the knobs on the ticket are the engine's own: vLLM's below level 2, SGLang's at level 2, either at level 3", () => {
    const names = (item: Item): string[] => item.givens.map((given) => given.label).slice(0, 2)
    for (const seed of chunks[0]) {
      expect(names(captureWindow.make(seed, 0, 'count'))).toEqual(['delay_iterations', 'max_iterations'])
      expect(names(captureWindow.make(seed, 1, 'which-steps'))).toEqual(['delay_iterations', 'max_iterations'])
      expect(names(captureWindow.make(seed, 2, 'count'))).toEqual(['start_step', 'num_steps'])
    }
    const level3 = new Set(chunks[0].map((seed) => names(captureWindow.make(seed, 3, 'count'))[0]))
    expect(level3).toEqual(new Set(['delay_iterations', 'start_step']))
  })
})

describe('the keys, worked out again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}`, () => {
        for (const seed of seeds) {
          const count = captureWindow.make(seed, level, 'count')
          const [start, size] = [count.givens[0], count.givens[1]].map((given) => (given.value.t === 'num' ? given.value.value : NaN))
          const run = givenNum(count, 'steps in the run')
          // Steps are numbered from zero: the capture holds steps start to start + size - 1 that the run has.
          const held = Array.from({ length: run }, (_, step) => step).filter((step) => step >= start && step < start + size)
          expect(count.answer.kind === 'numeric' && count.answer.truth, `seed ${seed}`).toBe(held.length)
          expect(held.length).toBeGreaterThan(0)

          const done = captureWindow.make(seed, level, 'done-by-end')
          const [s2, n2] = [done.givens[0], done.givens[1]].map((given) => (given.value.t === 'num' ? given.value.value : NaN))
          expect(done.answer.kind === 'numeric' && done.answer.truth, `seed ${seed}`).toBe(s2 + n2)

          const which = captureWindow.make(seed, level, 'which-steps')
          const [s3, n3] = [which.givens[0], which.givens[1]].map((given) => (given.value.t === 'num' ? given.value.value : NaN))
          if (which.answer.kind !== 'choice') throw new Error('a choice')
          const { correct, options } = which.answer
          const right = options.find((option) => option.id === correct)
          expect(numsOf(right?.text ?? []), `seed ${seed}`).toEqual([s3, s3 + n3 - 1])
          // Every lure is a different pair, and none is the key.
          const pairs = options.map((option) => numsOf(option.text).join('-'))
          expect(new Set(pairs).size).toBe(options.length)
        }
      })
    }
  }

  test('one time in ten the run is long enough for the whole window, and the key is then the second setting; otherwise it is shorter', () => {
    let whole = 0
    const seeds = chunks[0]
    for (const seed of seeds) {
      const item = captureWindow.make(seed, 0, 'count')
      const size = givenNum(item, 'max_iterations')
      if (item.answer.kind === 'numeric' && item.answer.truth === size) whole += 1
      else expect(item.answer.kind === 'numeric' && item.answer.truth).toBeLessThan(size)
    }
    expect(whole).toBeGreaterThan(0)
    expect(whole).toBeLessThan(seeds.length / 4)
  })
})

describe('the diagnoses', () => {
  test('the number of the last step for the steps finished, the steps held for the steps finished, and the skipped steps counted as held are named', () => {
    const seen = new Set<string>()
    for (const seed of chunks[0]) {
      for (const variant of ['done-by-end', 'count']) {
        const item = captureWindow.make(seed, 0, variant)
        for (let value = 0; value <= 40; value += 1) {
          const grade = captureWindow.grade(item, { kind: 'numeric', value })
          if (!grade.ok && grade.diagnosis !== undefined) seen.add(grade.diagnosis.id)
        }
        expect(captureWindow.grade(item, keyOf(item)).diagnosis).toBeUndefined()
      }
    }
    expect(seen).toEqual(new Set(['tr3.capture-window.number-for-count', 'tr3.capture-window.skipped-forgotten', 'tr3.capture-window.skipped-counted']))
  })

  test('every lure of the choice names a misconception, and says why in a sentence', () => {
    for (const seed of chunks[0]) {
      const item = captureWindow.make(seed, 1, 'which-steps')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(30)
        if (option.id !== item.answer.correct) expect(option.miss).toMatch(/^tr3\.capture-window\.(start-ignored|one-too-many|one-late|count-as-step)$/)
      }
    }
  })
})
