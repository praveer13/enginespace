/*
 * W1-T30: `tr6.exactness-test`, the exit item of TR6's lesson on testing a sampler for exactness. The tests hold the family to the model it
 * teaches: the pooling rule is `chiSquare`'s, the false-fail arithmetic is the lab's (two seeds at 1e-4), and the four outcomes of `visible`
 * are what the sim's own bestiary shows when the lab's two checks are run on it.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt } from '@es/play/items'
import { binsOf, degreesOfFreedom, drawsNeeded, exactnessTest, falseFailShare, seenOf, sizeOf, standardErrorPpm } from '@es/play/items/families/tr6/exactness-test'
import type { Bug } from '@es/play/items/families/tr6/exactness-test'
import {
  acceptStepViolations,
  BESTIARY,
  chiSquare,
  drawCase,
  EXACT_RULES,
  LAB_DRAWS,
  LAB_LEVEL,
  LAB_SEEDS,
  labTest,
  recoverFromResidual,
  runChain,
  SPEC_BAND,
} from '../../packages/sim/spec'
import type { ChainVerifier } from '../../packages/sim/spec'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS, printed, words } from './items-tr6-support.ts'

setDefaultTimeout(120_000)

const SEEDS = fixedSeeds(300, 0x3c11)

describe('the family', () => {
  test('is registered, names a KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr6.exactness-test')).toBe(exactnessTest)
    expect(FAMILIES).toContain(exactnessTest)
    expect(familiesForKc('tr6.exactness-testing')).toEqual([exactnessTest])
    for (const kc of exactnessTest.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(exactnessTest, 0).map((variant) => variant.id)).toEqual(['df', 'false-fail'])
    expect(offeredAt(exactnessTest, 2).map((variant) => variant.id)).toEqual(['df', 'false-fail', 'visible', 'draws-needed'])
  })

  test('rests on upstream\'s rule for the pool and on the lab\'s level and seeds', () => {
    expect(claim('vllm.spec.chi-square.min-expected').value).toBe(5)
    expect(claim('sglang.spec.pr-35798').text).toContain('cumulative_probability')
    expect([LAB_LEVEL, LAB_SEEDS, LAB_DRAWS]).toEqual(['1e-4', 2, 20_000])
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const variant of offeredAt(exactnessTest, level)) {
        const item = exactnessTest.make(seed, level, variant.id)
        expect(exactnessTest.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(exactnessTest, item, { seed, level, variant: variant.id })).toEqual([])
        expect(exactnessTest.grade(item, keyOf(item)).ok).toBe(true)
        expect(exactnessTest.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints every number tagged, and no number in a sentence', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const level of LEVELS) {
        const item = exactnessTest.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...exactnessTest.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      }
    }
  })
})

describe('df', () => {
  test('is the degrees of freedom that the sim\'s chiSquare finds on the ticket\'s target, counts at their expectation', () => {
    for (const seed of SEEDS) {
      const item = exactnessTest.make(seed, 2, 'df')
      const n = printed(item)
      const weights = Object.entries(n)
        .filter(([label]) => label.endsWith(', weight'))
        .sort((a, b) => Number(a[0].split(' ')[1].replace(',', '')) - Number(b[0].split(' ')[1].replace(',', '')))
        .map(([, value]) => value)
      const draws = n['draws in the test']
      const counts = weights.map((w) => (draws * w) / 1000)
      const { df } = chiSquare(counts, { weights, total: 1000 })
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'df', truth: df })
      expect(degreesOfFreedom({ draws, weights })).toBe(df)
      // The merged bin is a bin of its own: 5 or more expected, as the scene's band says.
      const { pooled, poolExpected } = binsOf({ draws, weights })
      if (pooled > 0) expect(poolExpected).toBeGreaterThanOrEqual(5)
    }
  })

  test('at level 3 asks for the bins, one more than the degrees of freedom', () => {
    for (const seed of SEEDS) {
      const item = exactnessTest.make(seed, 3, 'df')
      const n = printed(item)
      const weights = Object.entries(n).filter(([label]) => label.endsWith(', weight')).map(([, value]) => value)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'bins', truth: degreesOfFreedom({ draws: n['draws in the test'], weights }) + 1 })
    }
  })

  test('names the usual mistakes', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = exactnessTest.make(seed, 2, 'df')
      const n = printed(item)
      const weights = Object.entries(n).filter(([label]) => label.endsWith(', weight')).map(([, value]) => value)
      const { kept, pooled } = binsOf({ draws: n['draws in the test'], weights })
      if (pooled === 0) continue
      const grade = exactnessTest.grade(item, { kind: 'numeric', value: kept - 1 })
      expect(grade.ok).toBe(false)
      if (grade.diagnosis !== undefined) seen.add(grade.diagnosis.id)
    }
    expect(seen.has('tr6.exactness-test.pool-forgotten')).toBe(true)
  })
})

describe('false-fail', () => {
  test('two seeds at 1e-4 fail an exact sampler about 2e-4 of the time, as the lab says', () => {
    expect(falseFailShare(10_000, 2)).toBeCloseTo(1 - (1 - 1e-4) * (1 - 1e-4), 12)
    expect(Math.round(falseFailShare(10_000, LAB_SEEDS) * 1_000_000)).toBe(200)
  })

  test('the key is the chance that some seed rejects, per million attempts, and per thousand at level 3', () => {
    for (const seed of SEEDS) {
      const item = exactnessTest.make(seed, 2, 'false-fail')
      const n = printed(item)
      const seeds = n['seeds in the check']
      const oneIn = n['each seed rejects an exact sampler one time in']
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'attempts', truth: Math.round((1 - Math.pow(1 - 1 / oneIn, seeds)) * 1_000_000) })
      const third = exactnessTest.make(seed, 3, 'false-fail')
      const m = printed(third)
      expect(third.answer).toMatchObject({ kind: 'numeric', truth: Math.round((1 - Math.pow(1 - 1 / m['each seed rejects an exact sampler one time in'], m['seeds in the check'])) * 1_000_000) / 1000 })
    }
  })

  test('a learner who adds the seeds\' chances is right, and one who counts a single seed is named', () => {
    let named = 0
    for (const seed of SEEDS) {
      const item = exactnessTest.make(seed, 2, 'false-fail')
      const n = printed(item)
      const seeds = n['seeds in the check']
      const oneIn = n['each seed rejects an exact sampler one time in']
      expect(exactnessTest.grade(item, { kind: 'numeric', value: (seeds * 1_000_000) / oneIn }).ok).toBe(true)
      if (seeds > 1) {
        const grade = exactnessTest.grade(item, { kind: 'numeric', value: 1_000_000 / oneIn })
        expect(grade.ok).toBe(false)
        if (grade.diagnosis?.id === 'tr6.exactness-test.one-seed') named += 1
      }
    }
    expect(named).toBeGreaterThan(100)
  })
})

describe('visible', () => {
  /** The bug a `visible` ticket prints. */
  function bugOf(seed: number, level: 1 | 2 | 3 = 2): { bug: Bug; key: string } {
    const item = exactnessTest.make(seed, level, 'visible')
    if (item.answer.kind !== 'choice') throw new Error('visible is a choice')
    const n = printed(item)
    const w = words(item)
    return {
      bug: { where: w['the bug is in'] === 'the accept step' ? 'accept' : 'recovery', ppm: n['it moves each affected token by'], permille: n['an affected token has probability'], draws: n['draws in the chi-square test'] },
      key: item.answer.correct,
    }
  }

  test('the key is where the bug is and how it compares with the sample\'s noise', () => {
    for (const seed of SEEDS) {
      const { bug, key } = bugOf(seed)
      expect([bug, seenOf(bug)]).toEqual([bug, key])
      const size = sizeOf(bug)
      expect(size).not.toBeNull()
      // Many standard errors, or a small part of one: the middle ground is out of band.
      const sigma = standardErrorPpm(bug)
      if (size === 'large') expect(bug.ppm / sigma).toBeGreaterThanOrEqual(8)
      else expect(bug.ppm / sigma).toBeLessThanOrEqual(0.1 + 1e-9)
    }
  })

  test('is drawn answer first: each of the four outcomes is the key on about a quarter of the seeds', () => {
    const counts: Record<string, number> = { both: 0, chi: 0, enumeration: 0, neither: 0 }
    for (const seed of fixedSeeds(800, 0x91a3)) counts[bugOf(seed).key] += 1
    for (const outcome of Object.keys(counts)) expect(counts[outcome]).toBeGreaterThan(140)
  })

  describe('the four outcomes are what the sim\'s checks show', () => {
    /** How many of `trials` fair cases the chi-square check rejects, and how many the enumeration of the accept step flags. */
    function rates(verify: ChainVerifier, accept: (px: number, qx: number, u: number) => boolean, trials: number): { chi: number; enumeration: number } {
      let chi = 0
      let enumeration = 0
      for (let trial = 0; trial < trials; trial += 1) {
        const { p, q } = drawCase(trial, 1, SPEC_BAND)
        if (labTest([trial * 2 + 1, trial * 2 + 2], p, q, verify).rejected) chi += 1
        if (acceptStepViolations(accept, p[0], q[0]).length > 0) enumeration += 1
      }
      return { chi, enumeration }
    }
    const TRIALS = 30
    const member = (id: string) => {
      const found = BESTIARY.find((candidate) => candidate.id === id)
      if (found === undefined) throw new Error(`no ${id} in the bestiary`)
      return found
    }

    test('both: a large bias in the accept step (accept when p > q) is rejected by both', () => {
      const m = member('accept-if-p-over-q')
      expect(rates(m.verify, m.accept, TRIALS)).toEqual({ chi: TRIALS, enumeration: TRIALS })
    })

    test('chi: a large bias in the recovery (resample from p) is seen by the sample and not by the accept step', () => {
      const m = member('resample-from-p')
      expect(rates(m.verify, m.accept, TRIALS)).toEqual({ chi: TRIALS, enumeration: 0 })
    })

    test('enumeration: a bias of one coin in 65,536 in the accept step is seen by the enumeration always and by the sample rarely', () => {
      const m = member('boundary-inclusive')
      const r = rates(m.verify, m.accept, TRIALS)
      expect(r.enumeration).toBe(TRIALS)
      expect(r.chi).toBeLessThan(TRIALS / 2)
    })

    test('neither: the same bias in the walk over the residual alone, with an exact accept step, escapes both', () => {
      const walkOnly: ChainVerifier = (p, q, draft, rng) => runChain({ accept: EXACT_RULES.accept, recover: (pp, qq, r) => recoverFromResidual(pp, qq, r, true) }, p, q, draft, rng)
      const r = rates(walkOnly, EXACT_RULES.accept, TRIALS)
      expect(r.enumeration).toBe(0)
      expect(r.chi).toBeLessThan(TRIALS / 2)
    })
  })
})

describe('draws-needed', () => {
  test('is p(1 − p) over the square of one coin in 65,536, in millions of draws, and as a multiple of the lab\'s 20,000', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = exactnessTest.make(seed, 2, 'draws-needed')
      const p = printed(item)['the token has probability'] / 1000
      const exact = (p * (1 - p) * 65_536 * 65_536) / 1_000_000
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'million draws', truth: Math.round(exact) })
      const third = exactnessTest.make(seed, 3, 'draws-needed')
      const q = printed(third)['the token has probability'] / 1000
      expect(third.answer).toMatchObject({ kind: 'numeric', unit: 'x', truth: Math.round((q * (1 - q) * 65_536 * 65_536) / 20_000) })
    }
    expect(drawsNeeded(250)).toEqual({ millions: 805, ratio: 40_265 })
  })
})
