/*
 * W1-T26: packages/sim/spec, the exact rejection sampler (ARCHITECTURE §5.5). The task's three acceptance checks have files of their own:
 * tests/sim/spec-rates.test.ts (checks 1 and 2: the false-fail rate and the detection rates) and tests/sim/spec-critical.test.ts
 * (check 3: the generator reproduces the committed table). This file holds the model's contract:
 *
 *   - The distributions and the draws: validation, the walk over the weights and its inclusive twin, the residual.
 *   - The round, draw by draw, on scripted streams, and its exactness: for small totals every coin of every draft is tried and the
 *     output distribution is p exactly, in integers, for one draft and for the first three tokens of a chain of two; at the course's
 *     total of 2^16 every coin of the accept step is tried, which makes the accept probability min(1, p/q) exactly.
 *   - The chi-square statistic, worked by hand, with its pooling and its infinite case.
 *   - The acceptance-length model against its closed form and against the sampler.
 *   - The seeded cases and their bands.
 *   - What each member of the bestiary does, on scripted streams.
 *   - The goldens (tests/fixtures/sim/spec.json): they reproduce from the inputs the fixture itself records.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { below, canonicalJson, rngFor, weighted } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import {
  BESTIARY,
  CRITICAL_MAX_DF,
  DIST_TOTAL,
  EXACT_RULES,
  FINE_BAND,
  LAB_DRAWS,
  REFERENCE,
  SPARSE_BAND,
  SPEC_BAND,
  SPEC_CARD_ID,
  acceptStepViolations,
  assertChain,
  assertDist,
  chiSquare,
  criticalValue,
  dist,
  draftChain,
  drawCase,
  drawDist,
  drawPair,
  drawToken,
  exactChain,
  exceedsCritical,
  expectedTokensPerRound,
  firstTokenCounts,
  flatPosition,
  labTest,
  overlapWeight,
  residualDist,
  runChain,
  verifyChain,
  walkCdf,
} from '../../packages/sim/spec'
import type { ChainResult, Dist, PairBand } from '../../packages/sim/spec'
import { MODELS, renderFixture } from '../../scripts/vectors'
import { SEED_COUNT, scripted, seeds } from './spec-support'

const root = path.resolve(import.meta.dirname, '../..')

/** A distribution over `size` tokens that adds up to `total`, with its cuts drawn by `below`: some weights may be 0. */
function smallDist(rng: Rng, size: number, total: number): Dist {
  const cuts = Array.from({ length: size - 1 }, () => below(rng, total + 1)).sort((a, b) => a - b)
  const weights: number[] = []
  let before = 0
  for (const cut of [...cuts, total]) {
    weights.push(cut - before)
    before = cut
  }
  return { weights, total }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Distributions and draws

describe('Dist', () => {
  test('dist() takes the total from the weights, and copies them', () => {
    const weights = [3, 0, 7]
    const d = dist(weights)
    expect(d).toEqual({ weights: [3, 0, 7], total: 10 })
    weights[0] = 99
    expect(d.weights[0]).toBe(3)
    expect(dist([DIST_TOTAL]).total).toBe(65_536)
  })

  test('refuses what is not a distribution of integer weights, naming the fault', () => {
    expect(() => dist([])).toThrow(/at least one token/)
    expect(() => dist([1, -1, 2])).toThrow(/non-negative integer, got -1/)
    expect(() => dist([1, 0.5])).toThrow(/non-negative integer, got 0.5/)
    expect(() => dist([0, 0])).toThrow(/total must be from 1 to 2\^32/)
    expect(() => dist([2 ** 32, 1])).toThrow(/total must be from 1 to 2\^32/)
    expect(() => assertDist({ weights: [1, 2], total: 4 }, 'p[0]')).toThrow(/p\[0\]: the weights add up to 3, not to its total 4/)
    expect(() => assertDist({ weights: [1, 2], total: 3 })).not.toThrow()
  })
})

describe('walkCdf, drawToken and the residual', () => {
  test('a draw falls in the interval of exactly one token, and a token of weight 0 has no interval', () => {
    const w = [2, 0, 3]
    expect([0, 1, 2, 3, 4].map((draw) => walkCdf(w, draw))).toEqual([0, 0, 2, 2, 2])
    expect(() => walkCdf(w, 5)).toThrow(/not below the weights' total 5/)
    for (const draw of [0, 1, 2, 3, 4]) expect(walkCdf(w, draw)).not.toBe(1)
  })

  test('the inclusive walk gives each boundary to the token on its left: the first token gains a value and the last loses one', () => {
    const w = [2, 0, 3]
    expect([0, 1, 2, 3, 4].map((draw) => walkCdf(w, draw, true))).toEqual([0, 0, 0, 2, 2])
    // Of a first token with weight 0, only the inclusive walk returns it, at draw 0: the bucket that SGLang PR #35798 accepted "at coin == 0".
    expect(walkCdf([0, 3], 0)).toBe(1)
    expect(walkCdf([0, 3], 0, true)).toBe(0)
  })

  test('drawToken is core\'s weighted(): one below(total) and a walk, on the same stream', () => {
    const rng = rngFor(1, 'test/spec/weights')
    for (let k = 0; k < 40; k++) {
      const d = smallDist(rng, 1 + below(rng, 8), 1 + below(rng, 5000))
      const a = rngFor(k, 'test/spec/drawToken')
      const b = rngFor(k, 'test/spec/drawToken')
      for (let i = 0; i < 25; i++) expect(drawToken(d, a)).toBe(weighted(b, d.weights))
    }
  })

  test('the overlap and the residual split p: min(p, q) + (p − q)⁺ = p at every token, and the residual weighs the rejection', () => {
    const p = dist([5, 3, 4])
    const q = dist([2, 6, 4])
    expect(overlapWeight(p, q)).toBe(9)
    expect(residualDist(p, q)).toEqual({ weights: [3, 0, 0], total: 3 })
    expect(residualDist(p, p)).toEqual({ weights: [0, 0, 0], total: 0 })
    const rng = rngFor(2, 'test/spec/residual')
    for (let k = 0; k < SEED_COUNT; k++) {
      const size = 1 + below(rng, 8)
      const total = 1 + below(rng, 3000)
      const a = smallDist(rng, size, total)
      const b = smallDist(rng, size, total)
      const r = residualDist(a, b)
      expect(overlapWeight(a, b) + r.total).toBe(total)
      expect(a.weights.map((w, i) => Math.min(w, b.weights[i]) + r.weights[i])).toEqual([...a.weights])
      expect(residualDist(b, a).total).toBe(r.total) // the excess of p over q equals the excess of q over p: the rejection weight is symmetric
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The round

/** Total 10. At position 0, token 0 and 1 are accepted whatever the coin (p ≥ q), and token 2 is rejected whatever it is (p = 0). */
const P0 = dist([6, 4, 0])
const Q0 = dist([2, 2, 6])
/** At position 1, token 0 is accepted only for coin 0 (p = 1 of q = 5), and tokens 1 and 2 whatever the coin. */
const P1 = dist([1, 1, 8])
const Q1 = dist([5, 1, 4])
const P2 = dist([0, 5, 5])

describe('verifyChain: the round, draw by draw', () => {
  test('a draft that is accepted, then one the coin rejects: the residual of the second position decides the token, and the third is never visited', () => {
    // coin 1 of [0, 2) for token 0; coin 4 of [0, 5) for token 0 against p = 1; residual (P1 − Q1)⁺ = [0, 0, 4], draw 2 of [0, 4).
    const rng = scripted([1, 4, 2])
    const result = verifyChain([P0, P1, P2], [Q0, Q1], [0, 0], rng)
    expect(result).toEqual({
      steps: [
        { token: 0, u: 1, accepted: true },
        { token: 0, u: 4, accepted: false },
      ],
      accepted: 1,
      end: { kind: 'recovered', draw: 2, total: 4, token: 2 },
      tokens: [0, 2],
    })
    expect(rng.used()).toBe(3)
  })

  test('every draft accepted: the bonus token is drawn from the last target, with its total', () => {
    const rng = scripted([0, 3, 7])
    const result = verifyChain([P0, P1, P2], [Q0, Q1], [1, 2], rng)
    expect(result.steps.map((s) => s.accepted)).toEqual([true, true])
    expect(result.accepted).toBe(2)
    expect(result.end).toEqual({ kind: 'bonus', draw: 7, total: 10, token: 2 })
    expect(result.tokens).toEqual([1, 2, 2])
    expect(rng.used()).toBe(3)
  })

  test('a rejection at the first position draws one coin and one residual, and nothing after that', () => {
    const rng = scripted([5, 4])
    const result = verifyChain([P0, P1, P2], [Q0, Q1], [2, 0], rng)
    expect(result).toEqual({
      steps: [{ token: 2, u: 5, accepted: false }],
      accepted: 0,
      end: { kind: 'recovered', draw: 4, total: 6, token: 1 },
      tokens: [1],
    })
    expect(rng.used()).toBe(2)
  })

  test('no drafts is a bonus token alone, drawn from p[0]', () => {
    const result = verifyChain([P2], [], [], scripted([6]))
    expect(result).toEqual({ steps: [], accepted: 0, end: { kind: 'bonus', draw: 6, total: 10, token: 2 }, tokens: [2] })
  })

  test('the coin is below(q_x): a draw that below() discards is not used', () => {
    // q_x = 6: 2^32 mod 6 = 4, so the limit is 2^32 − 4 and the draw 2^32 − 1 is discarded. The coin is the next draw, and the residual's
    // draw (below 6 again) is the one after.
    const rng = scripted([0xffffffff, 2, 3])
    const result = verifyChain([P0, P2], [Q0], [2], rng)
    expect(result.steps[0].u).toBe(2)
    expect(result.end.draw).toBe(3)
    expect(rng.used()).toBe(3)
  })

  test('an n-gram draft has a one-hot q: it is accepted with probability p(x), and a rejection recovers from p without x', () => {
    const p = dist([8192, 16384, 40960, 0])
    const q = dist([0, 0, 65536, 0])
    expect(acceptStepViolations(EXACT_RULES.accept, p, q)).toEqual([])
    let accepted = 0
    for (let u = 0; u < q.weights[2]; u++) if (EXACT_RULES.accept(p.weights[2], q.weights[2], u)) accepted++
    expect(accepted).toBe(40960)
    expect(residualDist(p, q)).toEqual({ weights: [8192, 16384, 0, 0], total: 24576 })
  })

  test('validates a chain before it draws', () => {
    const rng = scripted([])
    const ok = (draft: number[]) => () => verifyChain([P0, P1, P2], [Q0, Q1], draft, rng)
    expect(() => verifyChain([P0, P1], [Q0, Q1], [0, 0], rng)).toThrow(/2 drafts need 3 target distributions/)
    expect(() => verifyChain([P0, dist([1, 9]), P2], [Q0, Q1], [0, 0], rng)).toThrow(/p\[1\] has 2 tokens, and p\[0\] has 3/)
    expect(() => verifyChain([P0, P1, P2], [Q0, dist([1, 2, 3, 4])], [0, 0], rng)).toThrow(/q\[1\] has 4 tokens/)
    expect(() => verifyChain([P0, P1, P2], [Q0, dist([5, 1, 40])], [0, 0], rng)).toThrow(/q\[1\] adds up to 46 and p\[1\] to 10/)
    expect(ok([0])).toThrow(/2 draft distributions need 2 drafted tokens, got 1/)
    expect(ok([0, 3])).toThrow(/draft\[1\] = 3 is not a token from 0 to 2/)
    expect(ok([0, 1.5])).toThrow(/draft\[1\] = 1.5 is not a token/)
    expect(() => verifyChain([P0, P1, P2], [dist([0, 5, 5]), Q1], [0, 0], rng)).toThrow(/draft\[0\] = 0 has weight 0 in q\[0\]/)
    expect(() => assertChain([P0, P1, P2], [Q0, Q1])).not.toThrow()
    expect(rng.used()).toBe(0)
  })

  test('exactChain is the same round without the validation, and draftChain draws token i from q[i] in order', () => {
    const rng = rngFor(3, 'test/spec/chain')
    const { p, q } = drawCase(4, 3)
    for (let k = 0; k < 50; k++) {
      const draft = draftChain(q, rng)
      const a = rngFor(k, 'test/spec/exact')
      const b = rngFor(k, 'test/spec/exact')
      expect(exactChain(p, q, draft, a)).toEqual(verifyChain(p, q, draft, b))
      expect(runChain(EXACT_RULES, p, q, draft, rngFor(k, 'test/spec/exact'))).toEqual(exactChain(p, q, draft, rngFor(k, 'test/spec/exact')))
    }
    const a = rngFor(5, 'test/spec/draft')
    const b = rngFor(5, 'test/spec/draft')
    expect(draftChain(q, a)).toEqual(q.map((d) => drawToken(d, b)))
  })
})

describe('exactness, in integers', () => {
  /**
   * Every outcome of one draft: for each token x that q can draft and each coin u of [0, q_x), the round is run on the script
   * [u, 0], and if it rejects, on [u, draw] for each draw of [0, R). An accepted pair counts R times, so that every outcome weighs
   * 1/(total · R) of the whole. The first token tallies to p_y · R for every y, if the round is exact.
   */
  function tallyOneDraft(p: Dist, q: Dist, bonus: Dist): number[] {
    const R = residualDist(p, q).total || 1
    const tally = new Array<number>(p.weights.length).fill(0)
    for (let x = 0; x < q.weights.length; x++) {
      for (let u = 0; u < q.weights[x]; u++) {
        const probe = verifyChain([p, bonus], [q], [x], scripted([u, 0]))
        if (probe.accepted === 1) {
          tally[x] += R
          continue
        }
        for (let draw = 0; draw < R; draw++) {
          const rng = scripted([u, draw])
          tally[verifyChain([p, bonus], [q], [x], rng).tokens[0]]++
          expect(rng.used()).toBe(2)
        }
      }
    }
    return tally
  }

  test(`one draft: over every coin and every residual draw the first token is p, exactly, for ${SEED_COUNT} random pairs of small totals`, () => {
    const rng = rngFor(6, 'test/spec/enumerate')
    let rejecting = 0
    for (const k of seeds()) {
      const size = 1 + below(rng, 6)
      const total = 1 + below(rng, 20)
      const p = smallDist(rng, size, total)
      const q = k % 10 === 0 ? p : smallDist(rng, size, total)
      const bonus = smallDist(rng, size, total)
      const R = residualDist(p, q).total
      if (R > 0) rejecting++
      expect(tallyOneDraft(p, q, bonus), `p ${p.weights} q ${q.weights}`).toEqual(p.weights.map((w) => w * (R || 1)))
    }
    expect(rejecting).toBeGreaterThan(0.6 * SEED_COUNT)
  })

  test(`a chain of two: the first token is p[0], the second (once the first draft is accepted) is p[1], and the bonus (after both) is p[2], exactly, for ${SEED_COUNT} random chains`, () => {
    const rng = rngFor(7, 'test/spec/enumerate-chain')
    for (let k = 0; k < SEED_COUNT; k++) {
      const size = 2 + below(rng, 3)
      const T = 2 + below(rng, 5)
      const p = [smallDist(rng, size, T), smallDist(rng, size, T), smallDist(rng, size, T)]
      const q = [smallDist(rng, size, T), smallDist(rng, size, T)]
      const R0 = residualDist(p[0], q[0]).total || 1
      const R1 = residualDist(p[1], q[1]).total || 1
      const A0 = overlapWeight(p[0], q[0])
      const A1 = overlapWeight(p[1], q[1])
      const dummy = q[1].weights.findIndex((w) => w > 0)
      const first = new Array<number>(size).fill(0)
      const second = new Array<number>(size).fill(0)
      const third = new Array<number>(size).fill(0)
      // Weights of the three kinds of outcome over the common denominator T³·R0·R1.
      const wReject0 = T * T * R1
      const wReject1 = T * R0
      const wBonus = R0 * R1
      for (let x0 = 0; x0 < size; x0++) {
        for (let u0 = 0; u0 < q[0].weights[x0]; u0++) {
          const probe = verifyChain(p, q, [x0, dummy], scripted([u0, 0, 0, 0]))
          if (probe.accepted === 0) {
            for (let d0 = 0; d0 < R0; d0++) {
              const rng0 = scripted([u0, d0])
              first[verifyChain(p, q, [x0, dummy], rng0).tokens[0]] += wReject0
              expect(rng0.used()).toBe(2)
            }
            continue
          }
          for (let x1 = 0; x1 < size; x1++) {
            for (let u1 = 0; u1 < q[1].weights[x1]; u1++) {
              if (verifyChain(p, q, [x0, x1], scripted([u0, u1, 0, 0])).accepted === 1) {
                for (let d1 = 0; d1 < R1; d1++) {
                  const rng1 = scripted([u0, u1, d1])
                  const result = verifyChain(p, q, [x0, x1], rng1)
                  first[x0] += wReject1
                  second[result.tokens[1]] += wReject1
                  expect(rng1.used()).toBe(3)
                }
              } else {
                for (let b = 0; b < T; b++) {
                  const rng2 = scripted([u0, u1, b])
                  const result = verifyChain(p, q, [x0, x1], rng2)
                  first[x0] += wBonus
                  second[x1] += wBonus
                  third[result.tokens[2]] += wBonus
                  expect(rng2.used()).toBe(3)
                }
              }
            }
          }
        }
      }
      const label = `p ${JSON.stringify(p.map((d) => d.weights))} q ${JSON.stringify(q.map((d) => d.weights))}`
      expect(first, label).toEqual(p[0].weights.map((w) => w * T * T * R0 * R1))
      expect(second, label).toEqual(p[1].weights.map((w) => A0 * w * T * R0 * R1))
      expect(third, label).toEqual(p[2].weights.map((w) => A0 * A1 * w * R0 * R1))
    }
  })

  test(`at the course's total of 2^16 every coin of the accept step is tried: exactly min(p_x, q_x) of the q_x coins accept, for ${SEED_COUNT} seeded pairs`, () => {
    for (const seed of seeds()) {
      const { p, q } = drawCase(seed, 1, seed % 2 === 0 ? SPEC_BAND : SPARSE_BAND)
      expect(acceptStepViolations(EXACT_RULES.accept, p[0], q[0]), `seed ${seed}`).toEqual([])
    }
  })

  test('the exhaustive check names the tokens whose rule takes the wrong number of coins', () => {
    const p = dist([20, 30, 50])
    const q = dist([60, 30, 10])
    // Token 0: p = 20 < q = 60, so 20 coins should accept; "u <= p" takes 21. Token 1: p = q = 30: all 30. Token 2: p > q: all 10.
    expect(acceptStepViolations((px, _qx, u) => u <= px, p, q)).toEqual([{ token: 0, px: 20, qx: 60, accepted: 21, expected: 20 }])
    expect(acceptStepViolations(() => true, p, q)).toEqual([{ token: 0, px: 20, qx: 60, accepted: 60, expected: 20 }])
    expect(acceptStepViolations((px, qx) => px > qx, p, q).map((v) => v.token)).toEqual([0, 1])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// chi-square

describe('chiSquare', () => {
  test('is Σ (O − E)² ÷ E, worked by hand: 30, 20 and 50 against 25, 25 and 50 give 1 + 1 + 0 on 2 degrees of freedom', () => {
    expect(chiSquare([30, 20, 50], dist([16384, 16384, 32768]))).toEqual({ stat: 2, df: 2 })
    expect(chiSquare([25, 25, 50], dist([16384, 16384, 32768]))).toEqual({ stat: 0, df: 2 })
    // Two tokens: 5,050 and 4,950 against 5,000 each: 2 · 50² ÷ 5,000 = 1.
    expect(chiSquare([5050, 4950], dist([32768, 32768]))).toEqual({ stat: 1, df: 1 })
  })

  test('a token of weight 0 is no category; a draw of it is a certain failure, an infinite statistic', () => {
    const p = dist([26214, 39322, 0])
    expect(chiSquare([4000, 6000, 0], p).df).toBe(1)
    expect(chiSquare([4000, 5990, 10], p)).toEqual({ stat: Infinity, df: 1 })
    expect(exceedsCritical(Infinity, 1, '1e-4')).toBe(true)
    expect(chiSquare([10, 0, 0], dist([65536, 0, 0]))).toEqual({ stat: 0, df: 0 })
    expect(chiSquare([10, 3, 0], dist([65536, 0, 0]))).toEqual({ stat: Infinity, df: 0 })
  })

  test('tokens whose expected count is under 5 are pooled; a pool under 5 joins the kept token with the least expected count', () => {
    // N = 10,000: expected 5,000 and 4,998.8 for the first two and 1.2 for the third. The third is pooled alone, found under 5, and merged
    // into the second token (the smaller of the two): 5,050 against 5,000 and 4,950 against 5,000, a statistic of 1 on 1 degree.
    expect(chiSquare([5050, 4940, 10], dist([32768, 32760, 8]))).toEqual({ stat: 1, df: 1 })
    // N = 20,000. Two tokens of weight 20 are expected 6.1 times each, so each is kept: three bins, df 2.
    expect(chiSquare([19988, 6, 6], dist([65496, 20, 20])).df).toBe(2)
    // Two of weight 10 are expected 3.05 times each, under 5, and pooled they are 6.1, which is not: the pool is a bin of its own, df 1.
    expect(chiSquare([19994, 3, 3], dist([65516, 10, 10])).df).toBe(1)
    // Two of weight 4 pool to 2.44, which is under 5, so the pool joins the one kept token and nothing is left to test: df 0.
    expect(chiSquare([19998, 1, 1], dist([65528, 4, 4])).df).toBe(0)
    // Every token under 5: they pool into one bin, which has no degrees of freedom and a statistic of 0.
    expect(chiSquare([1, 1, 1], dist([21845, 21845, 21846]))).toEqual({ stat: 0, df: 0 })
  })

  test('refuses counts that do not describe the distribution', () => {
    const p = dist([1, 1])
    expect(() => chiSquare([1, 2, 3], p)).toThrow(/3 counts for a distribution of 2 tokens/)
    expect(() => chiSquare([1, -2], p)).toThrow(/non-negative integer/)
    expect(() => chiSquare([1, 0.5], p)).toThrow(/non-negative integer/)
    expect(() => chiSquare([0, 0], p)).toThrow(/no draws/)
  })

  test('reads the critical value from the table: a statistic over it is rejected, one at it is not', () => {
    expect(criticalValue('1e-4', 5)).toBe(25.745)
    expect(criticalValue('1e-3', 1)).toBe(10.828)
    expect(criticalValue('1e-4', 0)).toBe(0)
    expect(exceedsCritical(25.745, 5, '1e-4')).toBe(false)
    expect(exceedsCritical(25.746, 5, '1e-4')).toBe(true)
    expect(exceedsCritical(1e-9, 0, '1e-4')).toBe(true)
    expect(() => criticalValue('1e-4', CRITICAL_MAX_DF + 1)).toThrow(/df must be an integer from 0 to 255/)
    expect(() => criticalValue('1e-4', -1)).toThrow(RangeError)
    expect(() => criticalValue('1e-4', 2.5)).toThrow(RangeError)
  })

  test('is the statistic of an exact sampler: over 100 rounds of 20,000 draws its mean is df, within 5 standard errors', () => {
    let total = 0
    let dfs = 0
    for (let seed = 0; seed < 100; seed++) {
      const { p, q } = drawCase(seed, 1)
      const { stat, df } = chiSquare(firstTokenCounts(1000 + seed, p, q, exactChain), p[0])
      total += stat
      dfs += df
    }
    // The mean of 100 chi-squares of df degrees of freedom is df with variance 2 df / 100.
    const df = dfs / 100
    expect(Math.abs(total / 100 - df)).toBeLessThan(5 * Math.sqrt((2 * df) / 100))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The acceptance-length model

describe('expectedTokensPerRound', () => {
  test('is 1 + α + … + α^γ: 1 at γ = 0 or α = 0, γ + 1 at α = 1, and 1.5 at α = 0.5 with one draft', () => {
    expect(expectedTokensPerRound(500, 1)).toBe(1.5)
    expect(expectedTokensPerRound(500, 2)).toBe(1.75)
    expect(expectedTokensPerRound(650, 0)).toBe(1)
    expect(expectedTokensPerRound(0, 7)).toBe(1)
    expect(expectedTokensPerRound(1000, 4)).toBe(5)
  })

  test('equals the closed form (1 − α^(γ+1)) ÷ (1 − α) to within rounding, and rises with γ', () => {
    for (let alpha = 0; alpha < 1000; alpha += 37) {
      let last = 0
      for (let gamma = 0; gamma <= 12; gamma++) {
        const a = alpha / 1000
        const closed = (1 - a ** (gamma + 1)) / (1 - a)
        const sum = expectedTokensPerRound(alpha, gamma)
        expect(Math.abs(sum - closed), `α ${alpha} γ ${gamma}`).toBeLessThan(1e-12)
        // A term under the sum's last bit can leave it where it was, so strictly only where the terms are far above that.
        if (alpha >= 300) expect(sum).toBeGreaterThan(last)
        else expect(sum).toBeGreaterThanOrEqual(last)
        last = sum
      }
    }
  })

  test('refuses an α outside 0..1000 permille and a draft length that is not a non-negative integer', () => {
    expect(() => expectedTokensPerRound(-1, 2)).toThrow(/integer from 0 to 1000 permille/)
    expect(() => expectedTokensPerRound(1001, 2)).toThrow(RangeError)
    expect(() => expectedTokensPerRound(500.5, 2)).toThrow(RangeError)
    expect(() => expectedTokensPerRound(500, -1)).toThrow(/non-negative integer/)
    expect(() => expectedTokensPerRound(500, 1.5)).toThrow(RangeError)
  })

  test('matches the sampler: a total of 1,000 makes α exact in permille, and the mean tokens per round over 200,000 rounds is within 4 standard errors', () => {
    // p and q share a total of 1,000: the overlap is 300 + 300 + 200 = 800, so α = 0.8 at every position.
    const p = dist([500, 300, 200])
    const q = dist([300, 300, 400])
    expect(overlapWeight(p, q)).toBe(800)
    for (const gamma of [1, 4]) {
      const ps = Array.from({ length: gamma + 1 }, () => p)
      const qs = Array.from({ length: gamma }, () => q)
      const drafts = rngFor(gamma, 'test/spec/mean-draft')
      const coins = rngFor(gamma, 'test/spec/mean-coin')
      let sum = 0
      let squares = 0
      const N = 200_000
      for (let i = 0; i < N; i++) {
        const n = runChain(EXACT_RULES, ps, qs, draftChain(qs, drafts), coins).tokens.length
        sum += n
        squares += n * n
      }
      const mean = sum / N
      const sd = Math.sqrt(squares / N - mean * mean)
      expect(Math.abs(mean - expectedTokensPerRound(800, gamma)), `γ ${gamma}`).toBeLessThan((4 * sd) / Math.sqrt(N))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The seeded cases

describe('seeded pairs and chains', () => {
  const bands: [string, PairBand][] = [
    ['the Verifier\'s band', SPEC_BAND],
    ['the sparse band', SPARSE_BAND],
    ['the fine band', FINE_BAND],
  ]

  test.each(bands)('%s: every pair of the seeds adds up to 2^16 on its grid and satisfies the band', (_name, band) => {
    const rng = rngFor(9, 'test/spec/band')
    for (let i = 0; i < SEED_COUNT; i++) {
      const { p, q } = drawPair(rng, band)
      for (const d of [p, q]) {
        assertDist(d)
        expect(d.total).toBe(DIST_TOTAL)
        expect(d.weights).toHaveLength(band.size)
        expect(d.weights.every((w) => w % band.grid === 0)).toBe(true)
      }
      const alpha = Math.round((overlapWeight(p, q) * 1000) / DIST_TOTAL)
      expect(alpha).toBeGreaterThanOrEqual(band.alphaPermille[0])
      expect(alpha).toBeLessThanOrEqual(band.alphaPermille[1])
      expect(p.weights.filter((w, k) => w > q.weights[k]).length).toBeGreaterThanOrEqual(band.minAbove)
      expect(p.weights.filter((w, k) => q.weights[k] > w).length).toBeGreaterThanOrEqual(band.minBelow)
      if (band.pSupport) {
        const k = p.weights.filter((w) => w > 0).length
        expect(k).toBeGreaterThanOrEqual(band.pSupport[0])
        expect(k).toBeLessThanOrEqual(band.pSupport[1])
      }
      if (band.qSupport) expect(q.weights.filter((w) => w > 0).length).toBeGreaterThanOrEqual(band.qSupport[0])
    }
  })

  test('a sparse target leaves most of the vocabulary to a drafter that proposes all of it', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { p, q } = drawCase(seed, 1, SPARSE_BAND)
      const impossible = p[0].weights.filter((w, k) => w === 0 && q[0].weights[k] > 0).length
      expect(impossible).toBeGreaterThanOrEqual(10)
    }
  })

  test('the Verifier\'s band gives zero-weight tokens to p, which is what makes zeros in p a level', () => {
    const zeros = seeds().map((seed) => drawCase(seed, 1).p[0].weights.filter((w) => w === 0).length)
    expect(zeros.some((z) => z > 0)).toBe(true)
    expect(zeros.some((z) => z === 0)).toBe(true)
  })

  test('drawCase(seed, γ) has γ + 1 targets and γ drafters over one vocabulary, is a function of the seed, and extends with γ', () => {
    const c = drawCase(5, 3)
    expect(c.p).toHaveLength(4)
    expect(c.q).toHaveLength(3)
    expect(drawCase(5, 3)).toEqual(c)
    expect(canonicalJson(drawCase(6, 3))).not.toBe(canonicalJson(c))
    const shorter = drawCase(5, 1)
    expect(shorter.p[0]).toEqual(c.p[0])
    expect(shorter.q[0]).toEqual(c.q[0])
    expect(drawCase(5, 0).p).toHaveLength(1)
    assertChain(c.p, c.q)
    const distinct = new Set(seeds().map((seed) => canonicalJson(drawCase(seed, 1)))).size
    expect(distinct).toBe(SEED_COUNT)
  })

  test('refuses what cannot be drawn', () => {
    const rng = rngFor(1, 'test/spec/refuse')
    expect(() => drawDist(rng, 0, 1024)).toThrow(/size must be a positive integer/)
    expect(() => drawDist(rng, 6, 1000)).toThrow(/grid must be an integer that divides 65536/)
    expect(() => drawDist(rng, 6, 1024, [2, 7])).toThrow(/support must be integers/)
    expect(() => drawDist(rng, 6, 1024, [0, 3])).toThrow(/support must be integers/)
    expect(() => drawCase(1, -1)).toThrow(/non-negative integer/)
    const impossible: PairBand = { size: 2, grid: 32768, alphaPermille: [0, 1], minAbove: 2, minBelow: 2 }
    expect(() => drawPair(rng, impossible)).toThrow(/no pair in the band after 10000 attempts/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The bestiary, on scripted streams

const byId = (id: string) => [REFERENCE, ...BESTIARY].find((m) => m.id === id)!
/** The first emitted token and the steps of one round of a member. */
const run = (id: string, p: Dist[], q: Dist[], draft: number[], draws: number[]): ChainResult & { used: number } => {
  const rng = scripted(draws)
  const result = byId(id).verify(p, q, draft, rng)
  return { ...result, used: rng.used() }
}

describe('the bestiary: what each member does', () => {
  test('lists the six members the tracker names, in its order, and the exact sampler beside them', () => {
    expect(BESTIARY.map((m) => m.id)).toEqual(['accept-if-p-over-q', 'resample-from-p', 'resample-from-q', 'residual-off-by-one', 'boundary-inclusive', 'fly-lossy'])
    expect(REFERENCE.id).toBe('reference')
    expect(new Set(BESTIARY.map((m) => m.label)).size).toBe(6)
    for (const m of BESTIARY) expect(m.bug.length).toBeGreaterThan(30)
  })

  test('accept when p > q: no coin decides; p > q accepts and p ≤ q rejects, ties included', () => {
    // P0 = [6, 4, 0], Q0 = [2, 2, 6]: tokens 0 and 1 have p > q, token 2 has p < q. A coin of 0 and a coin of q − 1 give the same answer.
    for (const u of [0, 1]) {
      expect(run('accept-if-p-over-q', [P0, P2], [Q0], [0], [u, 0]).accepted).toBe(1)
      expect(run('accept-if-p-over-q', [P0, P2], [Q0], [1], [u, 0]).accepted).toBe(1)
    }
    for (const u of [0, 3, 5]) expect(run('accept-if-p-over-q', [P0, P2], [Q0], [2], [u, 0]).accepted).toBe(0)
    // Token 0 of p = [5, 5] against q = [5, 5] is a tie, so it is rejected, and then there is no residual to recover from.
    expect(() => run('accept-if-p-over-q', [dist([5, 5]), dist([5, 5])], [dist([5, 5])], [0], [0, 0])).toThrow(/no residual/)
    // The exact rule accepts a tie whatever the coin.
    expect(run('reference', [dist([5, 5]), dist([5, 5])], [dist([5, 5])], [0], [4, 0]).accepted).toBe(1)
  })

  test('accept with p/q but resample from p: the rejection draws below(p.total) and walks p, not the residual', () => {
    // Token 2 is rejected (p = 0). Draw 7 of [0, 10) walks p = [6, 4, 0] to token 1; the residual [4, 2, 0] would have been drawn from [0, 6).
    const r = run('resample-from-p', [P0, P2], [Q0], [2], [3, 7])
    expect(r.end).toEqual({ kind: 'recovered', draw: 7, total: 10, token: 1 })
    expect(r.tokens).toEqual([1])
    expect(run('resample-from-p', [P0, P2], [Q0], [2], [3, 0]).tokens).toEqual([0])
  })

  test('resample from q: the rejection walks q, so it can return the very token that p ruled out', () => {
    const r = run('resample-from-q', [P0, P2], [Q0], [2], [3, 7])
    expect(r.end).toEqual({ kind: 'recovered', draw: 7, total: 10, token: 2 })
    expect(r.tokens).toEqual([2])
    expect(P0.weights[2]).toBe(0)
  })

  test('an off-by-one in the residual: the right token is drawn and the next index is returned, wrapping at the end', () => {
    // Residual of P0 against Q0 is [4, 2, 0]: draw 4 is token 1, which becomes 2; draw 1 is token 0, which becomes 1.
    expect(run('residual-off-by-one', [P0, P2], [Q0], [2], [3, 4]).tokens).toEqual([2])
    expect(run('residual-off-by-one', [P0, P2], [Q0], [2], [3, 1]).tokens).toEqual([1])
    // The residual of [1, 1, 8] against [4, 4, 2] is [0, 0, 6]: token 2 wraps to token 0.
    expect(run('residual-off-by-one', [dist([1, 1, 8]), P2], [dist([4, 4, 2])], [0], [3, 0]).tokens).toEqual([0])
    expect(run('reference', [dist([1, 1, 8]), P2], [dist([4, 4, 2])], [0], [3, 0]).tokens).toEqual([2])
  })

  test('the boundary-inclusive comparison: a coin equal to p_x is accepted, and draw 0 returns a first token that has no residual', () => {
    const p = dist([2, 8])
    const q = dist([6, 4])
    // Token 0 has p = 2 of q = 6: the coin 2 is rejected by u < p and accepted by u <= p.
    expect(run('reference', [p, p], [q], [0], [2, 0]).accepted).toBe(0)
    expect(run('boundary-inclusive', [p, p], [q], [0], [2, 0]).accepted).toBe(1)
    expect(run('boundary-inclusive', [p, p], [q], [0], [3, 0]).accepted).toBe(0)
    // The residual is [0, 4]. Draw 0 is token 1 for the exact walk and token 0, which has weight 0, for the inclusive one.
    expect(run('reference', [p, p], [q], [0], [5, 0]).tokens).toEqual([1])
    expect(run('boundary-inclusive', [p, p], [q], [0], [5, 0]).tokens).toEqual([0])
    expect(run('boundary-inclusive', [p, p], [q], [0], [5, 3]).tokens).toEqual([1])
  })

  test('the boundary-inclusive member leaks a token that p rules out, once in 2^16 rounds per such token: the leak the sparse band is for', () => {
    // p rules out token 2 (p = 0) and the drafter proposes it with q = 6 of 10. The coin 0 is accepted by the inclusive rule alone.
    expect(run('reference', [P0, P2], [Q0], [2], [0, 0]).accepted).toBe(0)
    const leak = run('boundary-inclusive', [P0, P2], [Q0], [2], [0, 0])
    expect(leak.accepted).toBe(1)
    expect(leak.tokens[0]).toBe(2)
    expect(chiSquare([5, 4, 1], P0).stat).toBe(Infinity)
  })

  test('a FLy-style rule defers a rejection at a flat position when the next native decision accepts, and not otherwise', () => {
    const flat = dist([4, 3, 3])
    const sharp = dist([8, 1, 1])
    const q0 = dist([8, 1, 1])
    const p1 = dist([5, 5, 0])
    const q1 = dist([5, 5, 0])
    const p2 = dist([10, 0, 0])
    expect(flatPosition(flat)).toBe(true)
    expect(flatPosition(sharp)).toBe(false)
    expect(flatPosition(dist([5, 5]))).toBe(false) // half the weight is not under half
    // Coin 6 of [0, 8) is rejected by p = 4 at position 0. The next native decision (token 1, p = q) accepts, so the draft is kept.
    const kept = run('fly-lossy', [flat, p1, p2], [q0, q1], [0, 1], [6, 2, 0])
    expect(kept.steps.map((s) => s.accepted)).toEqual([true, true])
    expect(kept.steps[0].u).toBe(6)
    expect(kept.accepted).toBe(2)
    expect(kept.tokens).toEqual([0, 1, 0])
    expect(kept.used).toBe(3)
    // The exact rule rejects the same draft, and recovers from the residual [0, 2, 2].
    expect(run('reference', [flat, p1, p2], [q0, q1], [0, 1], [6, 3]).tokens).toEqual([2])
    // The next native decision rejects (token 0 at position 1 with a coin past p): no deferral, a recovery at position 0 after the lookahead's coin.
    const p1b = dist([2, 8, 0])
    const q1b = dist([8, 2, 0])
    const refused = run('fly-lossy', [flat, p1b, p2], [q0, q1b], [0, 0], [6, 5, 3])
    expect(refused.accepted).toBe(0)
    expect(refused.end).toEqual({ kind: 'recovered', draw: 3, total: 4, token: 2 })
    expect(refused.used).toBe(3)
    // A sharp position is never deferred, though the next decision would accept: coin 3 of [0, 4) is rejected by p = 1, and the residual
    // [6, 0, 0] gives token 0. One draft alone has no window to look through, and neither has the last of several.
    const q0s = dist([2, 4, 4])
    const never = run('fly-lossy', [sharp, p1, p2], [q0s, q1], [1, 1], [3, 0])
    expect(never.accepted).toBe(0)
    expect(never.tokens).toEqual([0])
    expect(never.used).toBe(2)
    const alone = run('fly-lossy', [flat, p1], [q0], [0], [6, 0])
    expect(alone.accepted).toBe(0)
    expect(alone.used).toBe(2)
  })

  test('only two members get the accept step wrong, the p > q rule and the inclusive coin: the others differ in what they recover', () => {
    const p = dist([20, 30, 50])
    const q = dist([60, 30, 10])
    for (const m of BESTIARY) {
      const wrong = acceptStepViolations(m.accept, p, q).length > 0
      expect(wrong, m.id).toBe(m.id === 'accept-if-p-over-q' || m.id === 'boundary-inclusive')
    }
    expect(acceptStepViolations(REFERENCE.accept, p, q)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The goldens

interface Vector {
  name: string
  input: { fn: string } & Record<string, unknown>
  sha256: string
  output: unknown
}
const fixturePath = path.join(root, 'tests/fixtures/sim/spec.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { header: string; model: string; vectors: Vector[] }
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

const BAND: Record<string, PairBand> = { spec: SPEC_BAND, sparse: SPARSE_BAND, fine: FINE_BAND }
const finite = (x: number) => (Number.isFinite(x) ? x : null)

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function fromInput(input: Vector['input']): unknown {
  const weights = (d: unknown) => dist((d as { weights: number[] }).weights)
  switch (input.fn) {
    case 'verifyChain':
      return verifyChain((input.p as unknown[]).map(weights), (input.q as unknown[]).map(weights), input.draft as number[], rngFor(input.seed as number, 'vectors/spec'))
    case 'drawCase':
      return drawCase(input.seed as number, input.gamma as number, BAND[input.band as string])
    case 'chiSquare': {
      const { stat, df } = chiSquare(input.counts as number[], weights(input.p))
      return { stat: finite(stat), df }
    }
    case 'expectedTokensPerRound':
      return (input.cases as [number, number][]).map(([a, g]) => expectedTokensPerRound(a, g))
    case 'labTest': {
      const c = input.case as { seed: number; gamma: number; band: string }
      const { p, q } = drawCase(c.seed, c.gamma, BAND[c.band])
      const member = [REFERENCE, ...BESTIARY].find((m) => m.id === input.member)!
      const result = labTest(input.seeds as number[], p, q, member.verify, '1e-4', input.draws as number)
      return { rejected: result.rejected, tests: result.tests.map((t) => ({ ...t, stat: finite(t.stat) })) }
    }
    default:
      throw new Error(`unknown vector function ${input.fn}`)
  }
}

describe('the spec goldens (tests/fixtures/sim/spec.json)', () => {
  test('hold 21 vectors, each named once, of the five functions', () => {
    expect(fixture.model).toBe('spec')
    expect(fixture.vectors).toHaveLength(21)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(21)
    expect(new Set(fixture.vectors.map((v) => v.input.fn))).toEqual(new Set(['verifyChain', 'drawCase', 'chiSquare', 'expectedTokensPerRound', 'labTest']))
    const lab = fixture.vectors.filter((v) => v.input.fn === 'labTest').map((v) => v.input.member)
    expect(lab).toEqual(['reference', ...BESTIARY.map((m) => m.id)])
  })

  test('reproduce byte for byte: each vector\'s input gives an output whose canonical JSON is the recorded one\'s and has the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(fromInput(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
    }
  })

  test('say what their names say: the rounds end where the names put the end, and the lab\'s check passes only the exact sampler', () => {
    const out = (prefix: string) => fixture.vectors.find((v) => v.name.startsWith(prefix))!.output as ChainResult
    expect(out('one draft that p accepts').end.kind).toBe('bonus')
    expect(out('one draft that p rules out').end).toMatchObject({ kind: 'recovered', token: 0, total: 16384 })
    expect(out('three drafts: the first accepted, the second rejected').accepted).toBe(1)
    expect(out('three drafts that p accepts').tokens).toHaveLength(4)
    expect(out('an n-gram draft').end).toMatchObject({ kind: 'recovered', total: 24576 })
    expect(out('no drafts').steps).toEqual([])
    const verdicts = fixture.vectors.filter((v) => v.input.fn === 'labTest').map((v) => [v.input.member, (v.output as { rejected: boolean }).rejected])
    // On this dense case the boundary-inclusive member is not seen by the statistic: tests/sim/spec-rates.test.ts measures how often it is.
    expect(verdicts).toEqual([
      ['reference', false],
      ['accept-if-p-over-q', true],
      ['resample-from-p', true],
      ['resample-from-q', true],
      ['residual-off-by-one', true],
      ['boundary-inclusive', false],
      ['fly-lossy', true],
    ])
  })

  test('are what scripts/vectors.ts writes: the registry has the same cases in the same order, with the same inputs, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'spec')!
    const cases = model.cases(root)
    expect(cases.map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    for (const [i, c] of cases.entries()) expect(canonicalJson(c.input)).toBe(canonicalJson(fixture.vectors[i].input))
    expect(readFileSync(fixturePath, 'utf8')).toBe(renderFixture(model, root))
  })

  test('would catch a changed output: one coin moved by 1 gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors[0]
    const moved = structuredClone(vector.output) as ChainResult & { steps: { u: number }[] }
    moved.steps[0].u += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
  })

  test('the lab\'s parameters are the architecture\'s', () => {
    expect(LAB_DRAWS).toBe(20_000)
    expect(fixture.vectors.filter((v) => v.input.fn === 'labTest').every((v) => v.input.draws === LAB_DRAWS)).toBe(true)
  })

  test('the card id the model exports is the card file\'s name, and the card says the model is built (A§5.9)', () => {
    const card = readFileSync(path.join(root, 'content/cards', `${SPEC_CARD_ID}.md`), 'utf8')
    expect(SPEC_CARD_ID).toBe('spec')
    expect(card.split('---')[1]).toContain(`id: ${SPEC_CARD_ID}`)
    expect(card.split('---')[1]).toContain('world: spec')
    expect(card).toContain('`packages/sim/spec`, built by W1-T26')
  })
})
