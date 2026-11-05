/*
 * W1-T28, acceptance check 3 (the levels' bands, for `verify:games`) and the fairness of each level (GAMES.md §2.1, §10 "Band";
 * ASSESSMENT §4.1): every seed is a fair question, the pinned practice seed is the first in band, and the best scene-blind strategy
 * passes a graded level on at most 15% of fresh seeds [estimated bound], so that three fresh seeds in a row are won blind at most
 * 0.34% of the time [derived: 0.15³].
 *
 * Numbers measured by this file [measured 2026-11-04 on this task's branch, before its merge, Bun 1.3.14 on Linux 6.12.63]:
 *   share of the first 400 seeds in band: overlap 100%, exact 100%, chain 52.3%, greedy-ngram 65.8%, mutants 99%, gamma 100%
 *   (the floor is 20%); practice seeds 0, 0, 1, 0, 0, 0.
 *   blind strategies on graded levels (the bound is 15%): `exact`, the most common residual direction is the right recipe on 2 of 400
 *   seeds (0.5%) and every fixed recipe tried fails every seed; `chain`, the best constant count within 1% is right on 12.7% of the
 *   seeds with 2 drafts (23 of 181), 11.5% with 3 and 9.6% with 4, which is 11.3% over the three lengths [derived]; `gamma`, the best
 *   constant draft length is right on between 14.0% and 14.5% of 20,000 seeds (1 in 7 is 14.3% [derived]).
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '@es/sim/core'
import { drawInBand } from '@es/play'
import { VERIFIER } from '@es/play/verifier/entry'
import { casesByBest, gammaCase, speedupsFloat } from '@es/play/verifier/gamma'
import { COPIED_RANGE, FAVOURITE_LEAD, MIN_BIAS, buildLevel, chainAlphas, chainBand, chainOf, exactBand, greedyBand, inLevelBand, levelTitle, mutantsBand, naiveTokens, pairOf, toPlates } from '@es/play/verifier/levels'
import { compare, div, absolute, ratio, sub, toNumber } from '@es/play/verifier/ratio'
import { verifierGrade, verifierInBand, verifierLevel, verifierReduce, verifierSession } from '@es/play/verifier/session'
import { excessPlates, tokensOf } from '@es/play/verifier/state'
import { GAMMA_MAX, LEVEL_IDS, MUTANT_IDS, PLATES, VOCAB } from '@es/play/verifier/types'
import type { VerifierLevelId } from '@es/play/verifier/types'
import { expectedTokensExact } from '@es/play/verifier/exact'
import { sculpt, stateAfter } from './verifier-support'

const CANDIDATES = 400
const inBandSeeds = (id: VerifierLevelId, from = 0, count = CANDIDATES) => Array.from({ length: count }, (_, i) => from + i).filter((seed) => verifierInBand(id, seed))

describe('the levels and their pinned practice seeds', () => {
  test('the registry lists the six levels of GAMES.md §10 in order, with the titles of the copy, and the graded ones are `exact`, `chain` and `gamma`', () => {
    expect(VERIFIER.levels.map((level) => level.id)).toEqual([...LEVEL_IDS])
    expect(LEVEL_IDS).toEqual(['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma'])
    for (const entry of VERIFIER.levels) expect([entry.id, entry.title]).toEqual([entry.id, levelTitle(entry.id as VerifierLevelId)])
    expect(VERIFIER.levels.filter((level) => level.graded).map((level) => level.id)).toEqual(['exact', 'chain', 'gamma'])
  })

  test('each practice seed is the first seed from 0 that the level\'s band accepts (GAMES.md §2.1)', () => {
    for (const entry of VERIFIER.levels) {
      const first = inBandSeeds(entry.id as VerifierLevelId, 0, 64)[0]
      expect([entry.id, entry.practiceSeed]).toEqual([entry.id, first])
    }
  })

  test('a level that the game does not have is refused, and so is a seed that is not an unsigned 32-bit integer', () => {
    expect(() => verifierLevel('close', 1)).toThrow('The Tasting has no level "close"')
    expect(() => verifierInBand('close', 1)).toThrow('The Tasting has no level "close"')
    expect(() => verifierLevel('constructor', 1)).toThrow('has no level')
    expect(() => verifierLevel('exact', -1)).toThrow('a seed is an unsigned 32-bit integer')
    expect(() => verifierInBand('exact', 2 ** 32)).toThrow('a seed is an unsigned 32-bit integer')
  })

  test('the same seed draws a different world in each level, and the same one every time', () => {
    for (const id of LEVEL_IDS) expect(canonicalJson(buildLevel(id, 7))).toBe(canonicalJson(buildLevel(id, 7)))
    const worlds = new Set(['overlap', 'exact', 'mutants'].map((id) => JSON.stringify(buildLevel(id, 7).p[0])))
    expect(worlds.size).toBe(3)
  })
})

describe('the worlds the levels draw', () => {
  test('every distribution is six counts of plates that add up to sixty-four, on the pair the sim draws', () => {
    for (const id of LEVEL_IDS) {
      if (id === 'gamma') continue
      for (const seed of inBandSeeds(id, 0, 120)) {
        const level = buildLevel(id, seed)
        for (const plates of [...level.p, ...level.q]) {
          expect(plates).toHaveLength(VOCAB)
          expect(plates.reduce((a, b) => a + b, 0)).toBe(PLATES)
        }
      }
    }
  })

  test('the single-position levels have one commis row and a bonus row for the chef, and `chain` has 2 to 4 drafts and a row more of the chef\'s', () => {
    for (const id of ['overlap', 'exact', 'greedy-ngram', 'mutants'] as const) {
      const level = buildLevel(id, 3)
      expect([id, level.q.length, level.p.length]).toEqual([id, 1, 2])
    }
    const lengths = new Set<number>()
    for (let seed = 0; seed < 120; seed++) {
      const level = buildLevel('chain', seed)
      lengths.add(level.q.length)
      expect(level.p.length).toBe(level.q.length + 1)
    }
    expect([...lengths].sort()).toEqual([2, 3, 4])
  })

  test('the copier\'s q is one-hot on the copied dish: all sixty-four plates there', () => {
    for (const seed of inBandSeeds('greedy-ngram', 0, 80)) {
      const level = buildLevel('greedy-ngram', seed)
      if (level.id !== 'greedy-ngram') throw new Error('not the copier level')
      expect(level.q[0][level.draft]).toBe(PLATES)
      expect(level.q[0].filter((n) => n > 0)).toHaveLength(1)
    }
  })

  test('the five cards are the five single-position members of the bestiary, dealt in the seed\'s own order', () => {
    const orders = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      const level = buildLevel('mutants', seed)
      if (level.id !== 'mutants') throw new Error('not the mutants level')
      expect([...level.cards].sort()).toEqual([...MUTANT_IDS].sort())
      orders.add(level.cards.join())
    }
    expect(orders.size).toBeGreaterThan(20)
  })

  test('`gamma`: eight acceptances that never rise, and a cost of one drafted plate in permille', () => {
    for (let seed = 0; seed < 100; seed++) {
      const level = buildLevel('gamma', seed)
      if (level.id !== 'gamma') throw new Error('not the gamma level')
      expect(level.alphas).toHaveLength(GAMMA_MAX)
      level.alphas.forEach((a, j) => {
        expect(Number.isInteger(a) && a > 0 && a < 1000).toBe(true)
        if (j > 0) expect(a).toBeLessThanOrEqual(level.alphas[j - 1])
      })
      expect(level.cost).toBeGreaterThanOrEqual(5)
      expect(level.cost).toBeLessThanOrEqual(300)
    }
  })
})

describe('the bands (GAMES.md §10)', () => {
  test('at least 20% of the first 400 seeds are in band, in every level [estimated floor, kernelspace\'s EPLB figure]', () => {
    for (const id of LEVEL_IDS) {
      const share = inBandSeeds(id).length / CANDIDATES
      expect([id, share >= 0.2]).toEqual([id, true])
    }
  })

  test('`exact`: every plausible wrong rule leaves a bias of at least 2% on every seed the band accepts, and the band accepts nearly all', () => {
    const seeds = inBandSeeds('exact', 0, 400)
    expect(seeds.length).toBeGreaterThan(380)
    for (const seed of seeds) {
      const { p, q } = pairOf(seed, 'exact')
      expect(exactBand(p, q)).toBe(true)
    }
    expect(MIN_BIAS).toEqual(ratio(2, 100))
  })

  test('`chain`: on every seed the band accepts, reading every position as the first, or as the mean, misses the exact count by at least 3%', () => {
    const seeds = inBandSeeds('chain', 0, 400)
    expect(seeds.length).toBeGreaterThan(150)
    for (const seed of seeds) {
      const { gamma, pairs } = chainOf(seed)
      const alphas = chainAlphas(pairs, gamma)
      const truth = expectedTokensExact(alphas)
      const naive = naiveTokens(alphas)
      for (const guess of [naive.first, naive.mean]) expect(compare(div(absolute(sub(guess, truth)), truth), ratio(3, 100))).toBeGreaterThanOrEqual(0)
      expect(chainBand(seed)).toBe(true)
    }
  })

  test('`greedy-ngram`: one favourite with a clear lead, and the copied dish has between 4 and 56 plates, so neither answer is a given', () => {
    const seeds = inBandSeeds('greedy-ngram', 0, 400)
    let favourites = 0
    for (const seed of seeds) {
      const level = buildLevel('greedy-ngram', seed)
      if (level.id !== 'greedy-ngram') throw new Error('not the copier level')
      const sorted = [...level.p[0]].sort((a, b) => b - a)
      expect(sorted[0] - sorted[1]).toBeGreaterThanOrEqual(FAVOURITE_LEAD)
      expect(level.p[0][level.draft]).toBeGreaterThanOrEqual(COPIED_RANGE[0])
      expect(level.p[0][level.draft]).toBeLessThanOrEqual(COPIED_RANGE[1])
      if (level.p[0].indexOf(sorted[0]) === level.draft) favourites++
      expect(greedyBand(seed)).toBe(true)
    }
    // The answer is drawn first, so "kept" is right on about half of the seeds: the constant answer is a coin flip.
    expect(favourites / seeds.length).toBeGreaterThan(0.4)
    expect(favourites / seeds.length).toBeLessThan(0.6)
  })

  test('`mutants`: the four recipe and accept-step bugs are 2% off on every seed the band accepts', () => {
    for (const seed of inBandSeeds('mutants', 0, 400)) {
      const { p, q } = pairOf(seed, 'mutants')
      expect(mutantsBand(p, q)).toBe(true)
    }
  })

  test('`gamma`: every seed is in band, and the best draft length is interior with a lead of 0.5% over the runner-up and a speedup of at least 1.2', () => {
    for (let seed = 0; seed < 300; seed++) {
      const level = buildLevel('gamma', seed)
      if (level.id !== 'gamma') throw new Error('not the gamma level')
      expect(inLevelBand('gamma', seed)).toBe(true)
      const speedups = speedupsFloat(level.alphas, level.cost)
      const best = speedups.indexOf(Math.max(...speedups))
      expect(best).toBeLessThan(GAMMA_MAX - 1)
      expect(speedups[best]).toBeGreaterThanOrEqual(1.2)
      expect(speedups[best]).toBeGreaterThanOrEqual(1.005 * Math.max(...speedups.filter((_, i) => i !== best)))
    }
  })

  test('`gamma`: the grid has a group of cases for each best length 1 to 7, and a seed picks the length first (the answer first, GAMES.md §2.1)', () => {
    const groups = casesByBest()
    expect(groups).toHaveLength(GAMMA_MAX - 1)
    for (const group of groups) expect(group.length).toBeGreaterThan(100)
    expect(gammaCase(5)).toEqual(gammaCase(5))
  })

  test('`drawInBand` finds a seed in band from any entropy, the same one each time, for the level whose band turns most seeds away', () => {
    for (const entropy of [1, 99, 123_456_789, 4_294_967_295]) {
      const seed = drawInBand(verifierSession, 'chain', entropy)
      expect(verifierInBand('chain', seed)).toBe(true)
      expect(drawInBand(verifierSession, 'chain', entropy)).toBe(seed)
    }
  })
})

describe('the best scene-blind strategy passes a graded level on at most 15% of seeds (ASSESSMENT §4.1) [estimated bound]', () => {
  const BOUND = 0.15

  test('`exact`: a recipe that ignores the pair (even weights, p, q, or any one fixed vector) never passes', () => {
    const seeds = inBandSeeds('exact', 0, 400)
    const passes = (build: (level: ReturnType<typeof buildLevel>) => number[]) =>
      seeds.filter((seed) => {
        const level = buildLevel('exact', seed)
        const done = verifierReduce(sculpt(stateAfter(level), build(level)), { t: 'submit' })
        return verifierGrade(done).ok
      }).length / seeds.length
    const strategies: Record<string, (level: ReturnType<typeof buildLevel>) => number[]> = {
      'even weights': () => [1, 1, 1, 1, 1, 1],
      'from p': (level) => [...level.p[0]],
      'from q': (level) => [...level.q[0]],
      'one dish': () => [0, 0, 1, 0, 0, 0],
      'half and half': () => [2, 1, 2, 1, 2, 1],
    }
    for (const [name, build] of Object.entries(strategies)) expect([name, passes(build)]).toEqual([name, 0])
    // The best fixed recipe up to proportion: the most common residual direction among the seeds.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const counts = new Map<string, number>()
    for (const seed of seeds) {
      const excess = excessPlates(buildLevel('exact', seed))
      const g = excess.reduce(gcd, 0)
      const key = excess.map((w) => w / g).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const best = Math.max(...counts.values()) / seeds.length
    expect(best).toBeLessThanOrEqual(BOUND)
    // [measured] the most common direction is shared by 2 seeds in 400 (0.5%).
    expect(best).toBeLessThan(0.02)
  })

  test('`chain`: the best constant count for each length of run is within 1% on at most 15% of seeds', () => {
    const seeds = inBandSeeds('chain', 0, 1200)
    for (const gamma of [2, 3, 4]) {
      const values = seeds.map((seed) => ({ seed, ...chainOf(seed) })).filter((c) => c.gamma === gamma).map((c) => toNumber(tokensOf(buildLevel('chain', c.seed))))
      expect(values.length).toBeGreaterThan(100)
      // A constant c passes where |c − truth| ≤ 1% of the truth, which is truth in [c ÷ 1.01, c ÷ 0.99]: try each truth as c.
      let best = 0
      for (const c of values) best = Math.max(best, values.filter((v) => Math.abs(c - v) <= 0.01 * v).length / values.length)
      expect([gamma, best <= BOUND]).toEqual([gamma, true])
    }
  })

  test('`gamma`: the best constant draft length is right on 1 seed in 7 [derived], and on at most 15% of 20,000 seeds [measured]', () => {
    const counts = new Array<number>(GAMMA_MAX).fill(0)
    const total = 20_000
    for (let seed = 0; seed < total; seed++) {
      const level = buildLevel('gamma', seed)
      if (level.id !== 'gamma') throw new Error('not the gamma level')
      const speedups = speedupsFloat(level.alphas, level.cost)
      counts[speedups.indexOf(Math.max(...speedups))]++
    }
    const shares = counts.map((n) => n / total)
    expect(shares[GAMMA_MAX - 1]).toBe(0)
    for (const share of shares.slice(0, GAMMA_MAX - 1)) expect(share).toBeGreaterThan(1 / 7 - 0.02)
    expect(Math.max(...shares)).toBeLessThanOrEqual(BOUND)
  })
})

describe('the plates of a level, as the sim holds them', () => {
  test('counts of plates cross to the sim\'s distributions and back, and a weight that is not a whole plate is refused', () => {
    const { p } = pairOf(0, 'overlap')
    expect(toPlates(p).map((n) => n * 1024)).toEqual([...p.weights])
    expect(() => toPlates({ weights: [1, 65_535, 0, 0, 0, 0], total: 65_536 })).toThrow('not a whole number of plates')
  })
})
