/*
 * W1-T28, acceptance check 2 ("only the exact residual reaches total-variation distance 0 in `exact`") and the invariants of GAMES.md §10
 * that belong to the arithmetic: the exact output of a sampler, in rationals, from the accept rule and the recovery recipe of a pair.
 *
 *   - `outputExact(p, q, 'min-ratio', excess)` is p exactly, on 10,000 seeded pairs.
 *   - The recipe that reaches distance 0 under the exact accept rule is the residual and its multiples, and no other: proved on every
 *     pair of a small world by trying every recipe, and on seeded pairs of the real one by moving one weight at a time.
 *   - That statement is about the accept rule too. Accepting exactly when p ≥ q, with no coin, is exact with the right recipe; accepting
 *     every plate never is. This is why the level fixes the accept rule and asks for the recipe.
 *   - `ngramCase` is `outputExact` with a one-hot q; the accept step keeps min(p, q) of the q coins; the bestiary's members are what
 *     `memberCase` says they are (exactly, and against 20,000 rounds of the sim's own members); the courses per round are the closed form.
 *   - BigInt stays in the exact modules.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { rngFor } from '@es/sim/core'
import { BESTIARY, EXACT_RULES, SPEC_BAND, acceptStepViolations, draftChain, drawPair, exactChain, firstTokenCounts, walkCdf } from '@es/sim/spec'
import type { Dist } from '@es/sim/spec'
import { memberCase } from '@es/play/verifier/cards'
import {
  acceptedCoins,
  alphaExact,
  caseOutput,
  caseTv,
  excessWeights,
  expectedTokensExact,
  favourite,
  greedyAccept,
  ngramCase,
  oneHot,
  outputExact,
  topOf,
  tvExact,
  wrongRules,
} from '@es/play/verifier/exact'
import type { AcceptRule } from '@es/play/verifier/exact'
import { ONE, ZERO, add, compare, div, equals, fracText, mul, ratio, roundedTimes, sub, sum, toFrac, toNumber } from '@es/play/verifier/ratio'
import { exactBand, mutantsBand } from '@es/play/verifier/levels'
import { MUTANT_IDS } from '@es/play/verifier/types'
import { SEED_COUNT, seeds } from '../seeds'

const root = path.resolve(import.meta.dirname, '../..')
const pairs = (count: number, first = 0) => seeds(first, count).map((seed) => drawPair(rngFor(seed, 'test/verifier/pair'), SPEC_BAND))

/** A small world: `size` tokens and a total of `total`, so that every recipe can be tried. */
const small = (weights: number[]): Dist => ({ weights, total: weights.reduce((a, b) => a + b, 0) })
const compositions = (total: number, size: number): number[][] =>
  size === 1 ? [[total]] : Array.from({ length: total + 1 }, (_, head) => compositions(total - head, size - 1).map((rest) => [head, ...rest])).flat()

describe('exact fractions', () => {
  test('are kept in lowest terms with a positive denominator, and a zero denominator is refused', () => {
    expect(ratio(6, -8)).toEqual({ num: -3n, den: 4n })
    expect(ratio(0, 5)).toEqual({ num: 0n, den: 1n })
    expect(() => ratio(1, 0)).toThrow('denominator')
    expect(() => ratio(1.5)).toThrow()
  })

  test('add, subtract, multiply, divide and compare as fractions do', () => {
    const a = ratio(1, 3)
    const b = ratio(1, 6)
    expect(add(a, b)).toEqual(ratio(1, 2))
    expect(sub(a, b)).toEqual(ratio(1, 6))
    expect(mul(a, b)).toEqual(ratio(1, 18))
    expect(div(a, b)).toEqual(ratio(2))
    expect([compare(a, b), compare(b, a), compare(a, ratio(2, 6))]).toEqual([1, -1, 0])
    expect(sum([a, b, ratio(1, 2)])).toEqual(ONE)
    expect(equals(sub(a, a), ZERO)).toBe(true)
  })

  test('print as plain numbers and as text, and round a product to a whole number', () => {
    expect(toFrac(ratio(6, 64))).toEqual({ num: 3, den: 32 })
    expect(fracText(toFrac(ratio(0)))).toBe('0')
    expect(fracText(toFrac(ratio(3, 32)))).toBe('3/32')
    expect(fracText(toFrac(ratio(4, 2)))).toBe('2')
    expect(toNumber(ratio(1, 4))).toBe(0.25)
    expect(roundedTimes(ratio(2487, 1000), 1000)).toBe(2487)
    expect(roundedTimes(ratio(1, 3), 1000)).toBe(333)
    expect(roundedTimes(ratio(2, 3), 1000)).toBe(667)
    expect(roundedTimes(ratio(5, 10000), 1000)).toBe(1)
  })

  test('refuse a fraction too large to print exactly', () => {
    expect(() => toFrac(ratio(10n ** 20n, 3n))).toThrow('too large')
  })
})

describe('the accept step is exact in integers', () => {
  const predicates: Record<AcceptRule, (px: number, qx: number, u: number) => boolean> = {
    'min-ratio': (px, _qx, u) => u < px,
    'p-at-least-q': (px, qx) => px >= qx,
    'p-over-q': (px, qx) => px > qx,
    always: () => true,
    'coin-at-most-p': (px, _qx, u) => u <= px,
  }

  test('each rule keeps the number of coins of [0, q) that its comparison keeps, for every p and q up to 12', () => {
    for (const rule of Object.keys(predicates) as AcceptRule[]) {
      for (let px = 0; px <= 12; px++) {
        for (let qx = 0; qx <= 12; qx++) {
          let kept = 0
          for (let u = 0; u < qx; u++) if (predicates[rule](px, qx, u)) kept++
          expect([rule, px, qx, acceptedCoins(rule, px, qx)]).toEqual([rule, px, qx, kept])
        }
      }
    }
  })

  test('the exact rule keeps min(p, q) of the q coins, so a draft is kept with probability min(1, p ÷ q) (the paper\'s rule, no float)', () => {
    for (const { p, q } of pairs(40)) {
      expect(acceptStepViolations(EXACT_RULES.accept, p, q)).toEqual([])
      p.weights.forEach((px, x) => expect(acceptedCoins('min-ratio', px, q.weights[x])).toBe(Math.min(px, q.weights[x])))
    }
  })
})

describe('the exact residual is exact', () => {
  test('`outputExact(p, q, min-ratio, excess)` is p, exactly, on 10,000 seeded pairs (GAMES.md §10)', () => {
    for (const { p, q } of pairs(10_000)) {
      const out = outputExact(p, q, 'min-ratio', { kind: 'excess' })
      expect(sum(out)).toEqual(ONE)
      expect(tvExact(out, p)).toEqual(ZERO)
      out.forEach((o, y) => expect(equals(o, ratio(p.weights[y], p.total))).toBe(true))
    }
  })

  test('a recipe that is a multiple of the residual is exact too, because the recipe is normalised', () => {
    for (const { p, q } of pairs(SEED_COUNT)) {
      const excess = excessWeights(p, q)
      for (const k of [1, 2, 3]) {
        const scaled = excess.map((w) => (w / 1024) * k)
        expect(tvExact(outputExact(p, q, 'min-ratio', { kind: 'weights', w: scaled }), p)).toEqual(ZERO)
      }
    }
  })

  test('every output sums to 1 for every rule and recipe, and a draft that cannot be rejected needs no recipe', () => {
    const [{ p, q }] = pairs(1)
    for (const rule of wrongRules(p, q)) expect(sum(caseOutput(rule, p, q))).toEqual(ONE)
    expect(sum(outputExact(p, q, 'always', { kind: 'weights', w: [0, 0, 0, 0, 0, 0] }))).toEqual(ONE)
  })

  test('an empty recipe is refused when a plate can be sent back, and a recipe that is not whole numbers is refused', () => {
    const [{ p, q }] = pairs(1)
    expect(() => outputExact(p, q, 'min-ratio', { kind: 'weights', w: [0, 0, 0, 0, 0, 0] })).toThrow('nowhere to be re-plated')
    expect(() => outputExact(p, q, 'min-ratio', { kind: 'weights', w: [1, 1, 1, 1, 1] })).toThrow('one weight for each')
    expect(() => outputExact(p, q, 'min-ratio', { kind: 'weights', w: [1, 1, 1, 1, 1, -1] })).toThrow('non-negative')
    expect(() => outputExact(p, { weights: q.weights, total: 7 }, 'min-ratio', { kind: 'excess' })).toThrow('share one total')
  })
})

describe('only the exact residual reaches distance 0 (acceptance check 2)', () => {
  test('in a world of three dishes and eight plates, every recipe of every pair: distance 0 exactly when the recipe is a multiple of the residual', () => {
    let pairsTried = 0
    let recipesTried = 0
    let exact = 0
    for (const p of compositions(8, 3).map(small)) {
      for (const q of compositions(8, 3).map(small)) {
        const excess = excessWeights(p, q)
        const rejects = excess.some((w) => w > 0)
        if (!rejects) continue
        pairsTried++
        for (const w of compositions(8, 3).concat(compositions(5, 3), compositions(3, 3))) {
          if (w.every((x) => x === 0)) continue
          const reaches = tvExact(outputExact(p, q, 'min-ratio', { kind: 'weights', w }), p).num === 0n
          // w is a multiple of the excess when w × excess[j] = w[j] × excess[i] for all i, j (cross-multiplication, no division).
          const multiple = w.every((wi, i) => w.every((wj, j) => wi * excess[j] === wj * excess[i])) && w.some((wi, i) => excess[i] > 0 && wi > 0)
          expect([p.weights, q.weights, w, reaches]).toEqual([p.weights, q.weights, w, multiple])
          recipesTried++
          if (reaches) exact++
        }
      }
    }
    expect(pairsTried).toBeGreaterThan(1500)
    expect(recipesTried).toBeGreaterThan(100_000)
    expect(exact).toBeGreaterThan(1500)
  })

  test('on the real pairs, moving any one weight of the residual by one plate in either direction leaves a bias', () => {
    for (const { p, q } of pairs(SEED_COUNT)) {
      const w = excessWeights(p, q).map((x) => x / 1024)
      for (let token = 0; token < w.length; token++) {
        for (const delta of [-1, 1]) {
          const moved = w.map((x, y) => (y === token ? x + delta : x))
          if (moved.some((x) => x < 0)) continue
          expect(tvExact(outputExact(p, q, 'min-ratio', { kind: 'weights', w: moved }), p).num).not.toBe(0n)
        }
      }
    }
  })

  test('every wrong rule of the game lands at least 2% from p on every pair that the `exact` band accepts, which is nearly all of them', () => {
    const drawn = pairs(400)
    const inBand = drawn.filter(({ p, q }) => exactBand(p, q))
    // The band is a clause on the draw (GAMES.md §10): a pair whose bias is under 2% for some rule is turned away, and most are not.
    expect(inBand.length).toBeGreaterThanOrEqual(drawn.length * 0.9)
    for (const { p, q } of inBand) {
      for (const rule of wrongRules(p, q)) {
        const tv = caseTv(rule, p, q)
        expect([rule.id, compare(tv, ratio(2, 100)) >= 0]).toEqual([rule.id, true])
      }
    }
  })

  test('the accept rule is half of the answer: accepting when p ≥ q is exact with a recipe of its own, and accepting every plate never is', () => {
    // Why the level fixes the accept rule. A recipe of (p − q) where p ≥ q and p where p < q repairs the deterministic rule, and no
    // recipe can repair "keep everything", which already serves more of a dish than the chef would.
    for (const { p, q } of pairs(50)) {
      const repair = p.weights.map((px, x) => (px >= q.weights[x] ? px - q.weights[x] : px)).map((w) => w / 1024)
      expect(tvExact(outputExact(p, q, 'p-at-least-q', { kind: 'weights', w: repair }), p).num).toBe(0n)
    }
    let found = 0
    for (const p of compositions(6, 3).map(small)) {
      for (const q of compositions(6, 3).map(small)) {
        if (p.weights.every((w, i) => w === q.weights[i])) continue
        for (const w of compositions(6, 3)) {
          if (w.every((x) => x === 0)) continue
          const out = outputExact(p, q, 'always', { kind: 'weights', w })
          if (tvExact(out, p).num === 0n) found++
        }
      }
    }
    expect(found).toBe(0)
  })
})

describe('the n-gram draft and the greedy rule', () => {
  test('`ngramCase` is the exact rule on a one-hot q: kept with probability p(x), re-plated from p without x', () => {
    for (const { p } of pairs(SEED_COUNT)) {
      for (let x = 0; x < p.weights.length; x++) {
        if (p.weights[x] === p.total) continue
        const q = oneHot(p.weights.length, x, p.total)
        const case1 = ngramCase(p, x)
        expect(case1.accept).toEqual(alphaExact(p, q))
        expect(case1.accept).toEqual(ratio(p.weights[x], p.total))
        expect(case1.recovery[x]).toEqual(ZERO)
        expect(sum(case1.recovery)).toEqual(ONE)
        const out = outputExact(p, q, 'min-ratio', { kind: 'weights', w: p.weights.map((w, y) => (y === x ? 0 : w)) })
        expect(tvExact(out, p)).toEqual(ZERO)
        // The recovery is the residual normalised: (p − q)⁺ is p with x zeroed, since q_x is all of the total.
        const rejected = sub(ONE, case1.accept)
        out.forEach((o, y) => expect(equals(o, add(y === x ? case1.accept : ZERO, mul(rejected, case1.recovery[y])))).toBe(true))
      }
    }
  })

  test('at temperature 0 a draft is kept exactly when it is the favourite, and a tie has no favourite', () => {
    const p = small([30, 5, 10, 8, 7, 4])
    expect(favourite(p)).toBe(0)
    expect([0, 1, 2, 3].map((x) => greedyAccept(p, x))).toEqual([true, false, false, false])
    expect(topOf(small([20, 20, 10, 6, 4, 4]))).toBeNull()
    expect(() => favourite(small([20, 20, 10, 6, 4, 4]))).toThrow('two favourites')
    expect(() => ngramCase(p, 9)).toThrow('not one of')
    expect(() => ngramCase(small([40, 0, 0, 0, 0, 0]), 0)).toThrow('all its weight')
  })
})

describe('the bestiary, exactly', () => {
  test('`memberCase` names one rule case for each card, and on a `mutants` pair each is wrong by 2% except the boundary-inclusive one', () => {
    const inBand = pairs(100).filter(({ p, q }) => mutantsBand(p, q))
    expect(inBand.length).toBeGreaterThanOrEqual(90)
    for (const { p, q } of inBand) {
      for (const id of MUTANT_IDS) {
        const tv = caseTv(memberCase(id, p, q), p, q)
        if (id === 'boundary-inclusive') {
          // One coin more kept in every dish with p < q, and the walk one draw out: a few coins in 65,536.
          expect(compare(tv, ratio(1, 1000))).toBe(-1)
          expect(tv.num).not.toBe(0n)
        } else {
          expect(compare(tv, ratio(2, 100))).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  test('the inclusive walk gives token 0 one more draw and the last token with weight one fewer, as the sim\'s walk does', () => {
    for (const { p, q } of pairs(100)) {
      const w = excessWeights(p, q)
      const total = w.reduce((a, b) => a + b, 0)
      const counts = w.map(() => 0)
      for (let d = 0; d < total; d++) counts[walkCdf(w, d, true)]++
      const out = outputExact(p, q, 'min-ratio', { kind: 'excess', inclusive: true })
      const kept = p.weights.map((px, x) => acceptedCoins('min-ratio', px, q.weights[x]))
      const rejected = q.weights.reduce((a, b) => a + b, 0) - kept.reduce((a, b) => a + b, 0)
      out.forEach((o, y) => expect(equals(o, ratio(BigInt(kept[y] * total + rejected * counts[y]), BigInt(p.total * total)))).toBe(true))
    }
  })

  test('against 20,000 rounds of the sim\'s own members the exact output holds to 5 standard errors, in every dish, on three pairs', () => {
    const rounds = 20_000
    for (const { p, q } of pairs(3, 77)) {
      for (const id of MUTANT_IDS) {
        const member = BESTIARY.find((candidate) => candidate.id === id)
        if (member === undefined) throw new Error(`no member ${id}`)
        const counts = firstTokenCounts(1234, [p, p], [q], member.verify, rounds)
        const exact = caseOutput(memberCase(id, p, q), p, q)
        exact.forEach((o, y) => {
          const mean = toNumber(o) * rounds
          const sd = Math.sqrt(mean * (1 - toNumber(o)))
          expect([id, y, Math.abs(counts[y] - mean) <= 5 * sd + 1]).toEqual([id, y, true])
        })
      }
    }
  })

  test('the look at every coin passes the exact sampler and the three recipe bugs, and fails the two accept-step bugs on every pair', () => {
    const wrongInTheAcceptStep = ['accept-if-p-over-q', 'boundary-inclusive']
    for (const { p, q } of pairs(60)) {
      expect(acceptStepViolations(EXACT_RULES.accept, p, q)).toEqual([])
      for (const id of MUTANT_IDS) {
        const member = BESTIARY.find((candidate) => candidate.id === id)
        if (member === undefined) throw new Error(`no member ${id}`)
        const found = acceptStepViolations(member.accept, p, q).length
        expect([id, wrongInTheAcceptStep.includes(id) ? found > 0 : found === 0]).toEqual([id, true])
      }
    }
  })
})

describe('courses per round', () => {
  test('with one α throughout it is the paper\'s closed form (1 − α^(γ+1)) ÷ (1 − α)', () => {
    for (const [num, den] of [[1, 2], [3, 5], [9, 10], [7, 20]]) {
      const alpha = ratio(num, den)
      for (const gamma of [1, 2, 3, 4]) {
        let power = ONE
        for (let i = 0; i <= gamma; i++) power = mul(power, alpha)
        const closed = div(sub(ONE, power), sub(ONE, alpha))
        expect(equals(expectedTokensExact(Array.from({ length: gamma }, () => alpha)), closed)).toBe(true)
      }
    }
  })

  test('with different acceptances it is 1 + α₁ + α₁α₂ + …, and a draft of length 0 serves one course', () => {
    expect(expectedTokensExact([])).toEqual(ONE)
    expect(expectedTokensExact([ratio(1, 2), ratio(1, 4), ratio(1, 5)])).toEqual(add(add(add(ONE, ratio(1, 2)), ratio(1, 8)), ratio(1, 40)))
  })

  test('matches 20,000 rounds of the sim\'s sampler to within 1% on seeded runs of 2, 3 and 4 drafts', () => {
    for (const [seed, gamma] of [[11, 2], [12, 3], [13, 4], [14, 3]] as const) {
      const rng = rngFor(seed, 'test/verifier/chain')
      const chain = Array.from({ length: gamma + 1 }, () => drawPair(rng, SPEC_BAND))
      const p = chain.map((pair) => pair.p)
      const q = chain.slice(0, gamma).map((pair) => pair.q)
      const exact = toNumber(expectedTokensExact(q.map((qi, i) => alphaExact(p[i], qi))))
      let tokens = 0
      const rounds = 20_000
      for (let r = 0; r < rounds; r++) {
        const stream = rngFor(seed * 1000 + r, 'test/verifier/round')
        tokens += exactChain(p, q, draftChain(q, stream), stream).tokens.length
      }
      expect(Math.abs(tokens / rounds - exact) / exact).toBeLessThan(0.01)
    }
  })
})

describe('BigInt stays in the exact modules (GAMES.md §10, "Invariants")', () => {
  test('no file of the game outside ratio.ts and exact.ts holds a bigint literal or a BigInt call, and none uses `**`', () => {
    const dir = path.join(root, 'packages/play/verifier')
    for (const file of readdirSync(dir)) {
      const text = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect([file, /\*\*/.test(text)]).toEqual([file, false])
      if (file === 'ratio.ts' || file === 'exact.ts') continue
      expect([file, /\b\d+n\b|\bBigInt\b/.test(text)]).toEqual([file, false])
    }
  })
})
