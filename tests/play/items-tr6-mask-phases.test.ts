/*
 * W1-T30: `tr6.mask-phases`, the exit item of TR6's lesson on the grammar mask. The tests hold the four phases to the claims that say what
 * each one does at vLLM v0.33.0, check that every phase and every phrasing of it is asked, and that the key is the phase the stem was
 * drawn from.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import { maskPhases } from '@es/play/items/families/tr6/mask-phases'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x7a5e)

describe('the family', () => {
  test('is registered, names a KC of the graph, and offers its variants at every level', () => {
    expect(familyById('tr6.mask-phases')).toBe(maskPhases)
    expect(FAMILIES).toContain(maskPhases)
    expect(familiesForKc('tr6.mask-phases')).toEqual([maskPhases])
    for (const kc of maskPhases.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(maskPhases, level).map((variant) => variant.id)).toEqual(['name', 'runs-on'])
  })

  test('rests on claims that say what each phase does', () => {
    expect(claim('vllm.mask.grammar-compile-async').text).toContain('WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR')
    expect(claim('vllm.mask.grammar-compile-async').text).toContain('thread pool')
    expect(claim('vllm.mask.overlap').text).toContain('after execute_model has launched the forward without blocking')
    expect(claim('vllm.mask.fill-parallel-threshold').text).toContain('128')
    expect(claim('vllm.mask.apply-in-place').text).toContain('in place')
    expect(claim('vllm.mask.deferred-sampling').text).toContain('defers its sampling')
    expect(claim('vllm.mask.pending-flag').value).toBe('pending_structured_output_tokens')
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const variant of offeredAt(maskPhases, level)) {
        const item = maskPhases.make(seed, level, variant.id)
        expect(maskPhases.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(maskPhases, item, { seed, level, variant: variant.id })).toEqual([])
        expect(maskPhases.grade(item, keyOf(item)).ok).toBe(true)
        expect(maskPhases.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints every number tagged, and no number in a sentence', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = maskPhases.make(seed, level)
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...maskPhases.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      }
    }
  })
})

describe('the phases', () => {
  test('each of the four is the key on about a quarter of the seeds, in both variants', () => {
    for (const variant of ['name', 'runs-on'] as const) {
      const counts: Record<string, number> = { compile: 0, fill: 0, apply: 0, deferral: 0 }
      for (const seed of fixedSeeds(800, 0x5f1d)) {
        const item = maskPhases.make(seed, 2, variant)
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        counts[item.answer.correct] += 1
      }
      for (const phase of Object.keys(counts)) expect(counts[phase]).toBeGreaterThan(140)
    }
  })

  test('every phrasing of every phase is asked by some seed, and each states a fact of its own phase', () => {
    const stems = new Map<string, Set<string>>()
    for (const seed of fixedSeeds(2000, 0x31d7)) {
      const item = maskPhases.make(seed, 2, 'name')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const set = stems.get(item.answer.correct) ?? new Set<string>()
      // The phrasing with its number taken out: the number is a distractor of the scene.
      set.add(plain(item.stem).replace(/\d[\d,.]*/g, '#'))
      stems.set(item.answer.correct, set)
    }
    for (const phase of ['compile', 'fill', 'apply', 'deferral']) expect(stems.get(phase)?.size).toBe(4)
  })

  test('the stem of runs-on names the phase in code, and the key is that phase', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const item = maskPhases.make(seed, 2, 'runs-on')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const named = item.stem.find((part) => part.t === 'code')
      expect(named?.t === 'code' ? named.code : '').toBe(item.answer.correct)
    }
  })

  test('a wrong option says what the phase it was taken for really is', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = maskPhases.make(seed, 2, 'name')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toBe(`tr6.mask-phases.${option.id}-taken-for`)
      }
    }
  })
})
