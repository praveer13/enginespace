/*
 * W1-T30: `tr6.which-runner`, TR6's Keep family for proposers. The tests hold the family's rule to the facts it rests on: the claims about
 * vLLM v0.33.0 that it cites, the sim's runner presets (`resolveRunner`, `asyncSupported`), and the key that each ticket's printed
 * configuration gives.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt } from '@es/play/items'
import { fallsBack, METHODS, MRV1_ASYNC, outcomeOf, whichRunner } from '@es/play/items/families/tr6/which-runner'
import type { AsyncFlag, Config, Outcome } from '@es/play/items/families/tr6/which-runner'
import { asyncSupported, resolveRunner, RUNNER_PRESETS } from '../../packages/sim/steploop'
import type { SpecMethodId } from '../../packages/sim/steploop'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS, words } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x4e17)

/** The configuration a `runner` ticket prints. */
function configOf(seed: number): { config: Config; key: string } {
  const item = whichRunner.make(seed, 2, 'runner')
  if (item.answer.kind !== 'choice') throw new Error('runner is a choice')
  const w = words(item)
  return {
    config: {
      method: w['speculative method'],
      parallelDrafting: w['parallel drafting'] === 'on',
      heterogeneousVocab: w['draft model has its own vocabulary'] === 'yes',
      async: (w['async scheduling'] === 'left to its default' ? 'unset' : w['async scheduling'] === 'asked for' ? 'on' : 'off') satisfies AsyncFlag,
    },
    key: item.answer.correct,
  }
}

describe('the family', () => {
  test('is registered, names a KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr6.which-runner')).toBe(whichRunner)
    expect(FAMILIES).toContain(whichRunner)
    expect(familiesForKc('tr6.proposer-families')).toEqual([whichRunner])
    for (const kc of whichRunner.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(whichRunner, 0).map((variant) => variant.id)).toEqual(['needs', 'runner'])
    expect(offeredAt(whichRunner, 1).map((variant) => variant.id)).toEqual(['needs', 'choose', 'runner'])
  })

  test('rests on claims that say what it says: the fallbacks to MRV1, async scheduling on MRV1, and what each method needs', () => {
    const fallbacks = claim('vllm.mrv2.fallback-reasons').text
    for (const fact of ['suffix and custom_class', 'parallel drafting for EAGLE', 'own vocabulary']) expect(fallbacks).toContain(fact)
    const limits = claim('vllm.async-scheduling.mrv1-limits').text
    for (const fact of ['EAGLE', 'n-gram on the GPU', 'a draft model', 'DSpark', 'DFlash', 'An explicit request for it raises an error', 'turns it off with one warning']) expect(limits).toContain(fact)
    expect(claim('vllm.spec.ngram-prompt-lookup').text).toContain('n-grams in the prompt')
    expect(claim('vllm.spec.suffix-needs-arctic').text).toContain('Arctic Inference')
    expect(claim('vllm.spec.draft-model-separate').text).toContain('separate draft model')
    expect(claim('vllm.spec.mtp-native').text).toContain('native multi-token prediction')
    expect(claim('vllm.spec.model-key-optional').value).toBe('ngram, ngram_gpu, suffix, mtp')
  })

  test('agrees with the sim\'s runner presets on which methods MRV2 hands back and which methods async scheduling runs with on MRV1', () => {
    const sim: readonly SpecMethodId[] = ['ngram', 'ngram_gpu', 'suffix', 'draft_model', 'eagle', 'eagle3', 'mtp', 'custom_class', 'dflash', 'dspark']
    for (const method of sim) {
      const plain: Config = { method, parallelDrafting: false, heterogeneousVocab: false, async: 'unset' }
      expect([method, fallsBack(plain)]).toEqual([method, resolveRunner('mrv2', method) === 'v1'])
      expect([method, (MRV1_ASYNC as readonly string[]).includes(method)]).toEqual([method, asyncSupported('v1', method)])
    }
    expect(RUNNER_PRESETS.mrv2.unsupportedMethods).toEqual(['suffix', 'custom_class'])
  })

  test('has MRV2 refuse the other three of the five: parallel drafting, an own vocabulary, and nothing else', () => {
    expect(fallsBack({ method: 'eagle3', parallelDrafting: true, heterogeneousVocab: false, async: 'unset' })).toBe(true)
    expect(fallsBack({ method: 'dflash', parallelDrafting: true, heterogeneousVocab: false, async: 'unset' })).toBe(false)
    expect(fallsBack({ method: 'draft_model', parallelDrafting: false, heterogeneousVocab: true, async: 'unset' })).toBe(true)
    expect(fallsBack({ method: 'ngram', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' })).toBe(false)
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const variant of offeredAt(whichRunner, level)) {
        const item = whichRunner.make(seed, level, variant.id)
        expect(whichRunner.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(whichRunner, item, { seed, level, variant: variant.id })).toEqual([])
        expect(whichRunner.grade(item, keyOf(item)).ok).toBe(true)
        expect(whichRunner.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints no number in a sentence that is not a tagged part (an identifier such as v0.33.0 is not a number)', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const level of LEVELS) {
        const item = whichRunner.make(seed, level)
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...whichRunner.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      }
    }
  })
})

describe('runner', () => {
  test('the key is the rule applied to the printed configuration', () => {
    for (const seed of SEEDS) {
      const { config, key } = configOf(seed)
      expect([config, outcomeOf(config)]).toEqual([config, key as Outcome])
    }
  })

  test('is drawn answer first: each of the five outcomes is the key on about a fifth of the seeds', () => {
    const counts: Record<string, number> = { mrv2: 0, 'mrv2-off': 0, 'v1-on': 0, 'v1-off': 0, refused: 0 }
    for (const seed of fixedSeeds(1000, 0x2f2f)) counts[configOf(seed).key] += 1
    for (const outcome of Object.keys(counts)) expect(counts[outcome]).toBeGreaterThan(150)
  })

  test('refuses only an explicit request for async scheduling with a method MRV1 cannot run it with', () => {
    for (const method of METHODS) {
      for (const async of ['unset', 'on', 'off'] as const) {
        const out = outcomeOf({ method, parallelDrafting: false, heterogeneousVocab: false, async })
        // Only suffix falls back to MRV1 of the five, and only an explicit request for async scheduling is refused with it.
        expect(out === 'refused').toBe(method === 'suffix' && async === 'on')
      }
    }
    expect(outcomeOf({ method: 'suffix', parallelDrafting: false, heterogeneousVocab: false, async: 'on' })).toBe('refused')
    expect(outcomeOf({ method: 'suffix', parallelDrafting: false, heterogeneousVocab: false, async: 'unset' })).toBe('v1-off')
    expect(outcomeOf({ method: 'custom_class', parallelDrafting: false, heterogeneousVocab: false, async: 'off' })).toBe('v1-off')
    expect(outcomeOf({ method: 'eagle3', parallelDrafting: true, heterogeneousVocab: false, async: 'on' })).toBe('v1-on')
    expect(outcomeOf({ method: 'ngram', parallelDrafting: false, heterogeneousVocab: false, async: 'off' })).toBe('mrv2-off')
  })
})

describe('needs and choose', () => {
  test('each of the five methods is the key on about a fifth of the seeds, in both variants', () => {
    for (const variant of ['needs', 'choose'] as const) {
      const counts: Record<string, number> = {}
      for (const seed of fixedSeeds(1000, 0x1e5f)) {
        const item = whichRunner.make(seed, 2, variant)
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        counts[item.answer.correct] = (counts[item.answer.correct] ?? 0) + 1
      }
      expect(Object.keys(counts).sort()).toEqual(['draft-model', 'eagle3', 'mtp', 'ngram', 'suffix'])
      for (const method of Object.keys(counts)) expect(counts[method]).toBeGreaterThan(150)
    }
  })

  test('every option has an id that is a slug, and a why', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['needs', 'choose', 'runner'] as const) {
        const item = whichRunner.make(seed, 2, variant)
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        expect(item.answer.options).toHaveLength(5)
        for (const option of item.answer.options) {
          expect(option.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          expect(option.why.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
