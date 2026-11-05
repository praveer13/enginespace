/*
 * W1-T28, acceptance checks 1 to 3 as the pure session sees them (GAMES.md §2.5, §10): the reducer's rules, the draws, the reference, the
 * grades and the debriefs, and the replay that makes a log the grade.
 *
 *   - Only the exact residual reaches total-variation distance 0 in `exact` (acceptance check 2): on 200 seeds the residual passes and
 *     every other recipe fails, and the graded pass bar of ASSESSMENT §4.3 (`exact`: distance exactly 0; `chain`: within 1%; `gamma`: the
 *     exact draft length) is what `grade` computes.
 *   - A run is its log: replaying a log gives the state it made, and a tampered log is refused (A§6.3).
 *   - The view keeps the answer back until the level lets it be printed, and never holds a bigint.
 *   - A state is plain data, so it has a canonical JSON form and a hash that is the same in every runtime (A§5.10). The goldens below are
 *     the hashes of the house's runs on the practice seeds, and e2e/verifier.spec.ts checks that a browser reaches the same one.
 */
import { describe, expect, test } from 'bun:test'
import { applyAction, regrade, replay, startRun, stateHash } from '@es/play'
import { markersOf, playRound, roundSeed } from '@es/play/verifier/draws'
import { alphaExact, outputExact, tvExact } from '@es/play/verifier/exact'
import { buildLevel, toDist } from '@es/play/verifier/levels'
import { equals, fracText, ratio } from '@es/play/verifier/ratio'
import { MARKER_ROUNDS } from '@es/play/verifier/view'
import { verifierAsk, verifierDebrief, verifierDone, verifierGhost, verifierGrade, verifierInit, verifierReduce, verifierScore, verifierSession } from '@es/play/verifier/session'
import { excessPlates, keptPlates, modelOf, recipeTv, sweepOfLevel, thousandths, tokensOf } from '@es/play/verifier/state'
import { DISHES, DRAW_CAP, GAMMA_MAX, MUTANT_IDS, PLATES } from '@es/play/verifier/types'
import type { VerifierAction, VerifierLevelId } from '@es/play/verifier/types'
import { houseActions, PRACTICE, sculpt, sculptActions, stateAfter, textOf } from './verifier-support'
import { seeds } from '../sim/spec-support'

const S = verifierSession

/** The hashes of the house's runs on the practice seeds [measured 2026-11-04 on this task's branch; the same in a browser: e2e/verifier.spec.ts]. */
const GOLDEN: Readonly<Record<VerifierLevelId, string>> = {
  overlap: 'e3432eee',
  exact: '40467720',
  chain: '6d869552',
  'greedy-ngram': '1cfeeea2',
  mutants: '56454d4d',
  gamma: '83e1662c',
}

describe('the contract every game keeps (GAMES.md §2.5)', () => {
  test('a session has every method, and each level starts unfinished with a pending decision', () => {
    for (const method of ['level', 'inBand', 'init', 'ask', 'reduce', 'view', 'done', 'score', 'ghost', 'grade', 'debrief'] as const) expect(typeof S[method]).toBe('function')
    for (const [id, seed] of PRACTICE) {
      const state = S.init(S.level(id, seed))
      expect([id, S.done(state), S.ask(state) !== null]).toEqual([id, false, true])
    }
  })

  test('the reference finishes each level, passes its own grade, and plays the same run every time (D-017)', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const ghost = S.ghost(level)
      expect([id, S.done(ghost), S.grade(ghost, ghost).ok, S.grade(ghost, ghost).score]).toEqual([id, true, true, 1])
      expect(stateHash(ghost)).toBe(stateHash(S.ghost(S.level(id, seed))))
      expect([id, stateHash(ghost)]).toEqual([id, GOLDEN[id]])
      expect(S.debrief(ghost, ghost).sentence.length).toBeGreaterThan(40)
    }
  })

  test('the reference is the actions a test spells out for the house, replayed through the same reducer', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      expect(textOf(stateAfter(level, ...houseActions(level)))).toBe(textOf(verifierGhost(level)))
    }
  })

  test('a state is plain data: it has a canonical JSON form, which a bigint would not, and its hash does not depend on how it was reached', () => {
    for (const [id, seed] of PRACTICE) {
      const ghost = S.ghost(S.level(id, seed))
      expect(() => textOf(ghost)).not.toThrow()
      expect(JSON.parse(textOf(ghost))).toEqual(JSON.parse(JSON.stringify(ghost)))
    }
    const level = buildLevel('exact', 0)
    const target = excessPlates(level)
    const there = stateAfter(level, ...sculptActions(target))
    const wandering = sculpt(sculpt(stateAfter(level), [3, 3, 3, 3, 3, 3]), target)
    expect(stateHash(there)).toBe(stateHash(wandering))
  })

  test('the score is the counts of the rounds drawn, and nothing about speed (GAMES.md §1)', () => {
    const level = buildLevel('overlap', 0)
    const drawn = stateAfter(level, { t: 'commit', prediction: 38 }, { t: 'draw', n: 200 })
    const score = verifierScore(drawn)
    expect(score.rounds).toBe(200)
    expect(score.kept + score.sentBack).toBe(200)
    // One draft in a round: each round serves its own course, and one more when the draft was kept.
    expect(score.tokens).toBe(200 + score.kept)
    expect(Object.keys(score).sort()).toEqual(['kept', 'rounds', 'sentBack', 'tokens'])
  })
})

describe('the reducer refuses what a level does not allow', () => {
  const refuses = (id: VerifierLevelId, seed: number, actions: VerifierAction[], message: string) => {
    const level = buildLevel(id, seed)
    expect(() => actions.reduce(verifierReduce, verifierInit(level))).toThrow(message)
  }

  test('a recipe is sculpted only where there is one, within 0 to 64 plates, on a dish that exists', () => {
    refuses('overlap', 0, [{ t: 'sculpt', token: 0, delta: 1 }], 'no recipe to sculpt')
    refuses('exact', 0, [{ t: 'sculpt', token: 0, delta: -1 }], 'stays within 0 to 64')
    refuses('exact', 0, [{ t: 'sculpt', token: 0, delta: 65 }], 'stays within 0 to 64')
    refuses('exact', 0, [{ t: 'sculpt', token: 6, delta: 1 }], 'there is no dish 6')
    refuses('exact', 0, [{ t: 'sculpt', token: 0, delta: 1.5 }], 'whole number')
    refuses('greedy-ngram', 0, [{ t: 'sculpt', token: 0, delta: 1 }], 'no recipe to sculpt')
    refuses('exact', 0, [{ t: 'preset', from: 'z' as 'p' }], 'p or from q')
  })

  test('rounds are drawn only once there is something to draw from: a prediction in `overlap` and `chain`, a recipe in `exact`', () => {
    refuses('overlap', 0, [{ t: 'draw', n: 10 }], 'nothing to draw rounds from')
    refuses('chain', 1, [{ t: 'draw', n: 10 }], 'nothing to draw rounds from')
    refuses('exact', 0, [{ t: 'draw', n: 10 }], 'nothing to draw rounds from')
    refuses('mutants', 0, [{ t: 'draw', n: 10 }], 'nothing to draw rounds from')
    refuses('gamma', 0, [{ t: 'draw', n: 10 }], 'nothing to draw rounds from')
    refuses('overlap', 0, [{ t: 'commit', prediction: 30 }, { t: 'draw', n: 0 }], 'draw from 1 to')
    refuses('overlap', 0, [{ t: 'commit', prediction: 30 }, { t: 'draw', n: DRAW_CAP + 1 }], 'draw from 1 to')
    refuses('overlap', 0, [{ t: 'commit', prediction: 30 }, { t: 'draw', n: DRAW_CAP }, { t: 'draw', n: 1 }], 'nothing to draw rounds from')
  })

  test('a prediction is made once, as a whole number in range, in the levels that ask for one', () => {
    refuses('overlap', 0, [{ t: 'commit', prediction: 65 }], 'out of range')
    refuses('overlap', 0, [{ t: 'commit', prediction: -1 }], 'out of range')
    refuses('overlap', 0, [{ t: 'commit', prediction: 30.5 }], 'whole number')
    refuses('overlap', 0, [{ t: 'commit', prediction: 30 }, { t: 'commit', prediction: 31 }], 'already committed')
    refuses('exact', 0, [{ t: 'commit', prediction: 30 }], 'asks for no prediction')
    refuses('gamma', 0, [{ t: 'commit', prediction: 3 }], 'asks for no prediction')
  })

  test('the temperature-0 question comes first, and once; the draft length is 1 to 8; the cards are five', () => {
    refuses('greedy-ngram', 0, [{ t: 'judge', kept: true }, { t: 'judge', kept: false }], 'no temperature-0 question')
    refuses('exact', 0, [{ t: 'judge', kept: true }], 'no temperature-0 question')
    refuses('gamma', 0, [{ t: 'gamma', k: 0 }], 'from 1 to 8')
    refuses('gamma', 0, [{ t: 'gamma', k: GAMMA_MAX + 1 }], 'from 1 to 8')
    refuses('exact', 0, [{ t: 'gamma', k: 3 }], 'no draft length')
    refuses('mutants', 0, [{ t: 'taste', card: 5 }], 'no card 5')
    refuses('mutants', 0, [{ t: 'label', card: 0, bug: 'not-a-bug' as 'resample-from-p' }], 'not a bug a card can have')
    refuses('exact', 0, [{ t: 'taste', card: 0 }], 'no cards')
  })

  test('a run is submitted when its answer is whole, and not before, and nothing follows a submission', () => {
    refuses('overlap', 0, [{ t: 'submit' }], 'commit a prediction first')
    refuses('chain', 1, [{ t: 'submit' }], 'commit a prediction first')
    refuses('exact', 0, [{ t: 'submit' }], 'recipe is empty')
    refuses('greedy-ngram', 0, [{ t: 'submit' }], 'temperature-0 question first')
    refuses('greedy-ngram', 0, [{ t: 'judge', kept: true }, { t: 'submit' }], 'recipe is empty')
    refuses('mutants', 0, [{ t: 'label', card: 0, bug: 'resample-from-p' }, { t: 'submit' }], 'name the bug in every card')
    refuses('gamma', 0, [{ t: 'submit' }], 'pick a draft length')
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      refuses(id, seed, [...houseActions(level), { t: 'submit' }], 'the run is over')
    }
    refuses('overlap', 0, [{ t: 'bell' } as unknown as VerifierAction], 'has no action "bell"')
  })
})

describe('rounds are drawn from the seed, one stream for each round', () => {
  const drawn = (n: number[]) => stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 38 }, ...n.map((m): VerifierAction => ({ t: 'draw', n: m })))

  test('drawing 10 and then 90 is drawing 100: a round is a function of the seed and its number', () => {
    expect(textOf(drawn([10, 90]))).toBe(textOf(drawn([100])))
    expect(textOf(drawn([1, 1, 98]))).toBe(textOf(drawn([100])))
  })

  test('every round has its own stream: the round seeds of 20,000 rounds are all different, and a round never changes', () => {
    const level = buildLevel('overlap', 0)
    const all = new Set<number>()
    for (let r = 0; r < DRAW_CAP; r++) all.add(roundSeed(level.seed, r))
    expect(all.size).toBe(DRAW_CAP)
    const state = drawn([50])
    const model = modelOf(state)
    if (model === null) throw new Error('an overlap level with a prediction has a sampler')
    expect(JSON.stringify(playRound(model, level.seed, 17))).toBe(JSON.stringify(playRound(model, level.seed, 17)))
    expect(JSON.stringify(markersOf(model, level.seed, 50, 12, 1024))).toBe(JSON.stringify(markersOf(model, level.seed, 50, 12, 1024)))
    expect(markersOf(model, level.seed, 50, 12, 1024).length).toBeGreaterThanOrEqual(12)
  })

  test('the tally adds up: each round keeps or sends back its draft, serves its kept drafts and one more, and reaches the positions it walks', () => {
    const state = drawn([500])
    const t = state.tally
    expect(t.rounds).toBe(500)
    expect(t.kept[0] + t.sentBack[0]).toBe(500)
    expect(t.reached[0]).toBe(500)
    expect(t.reached[1]).toBe(t.kept[0])
    expect(t.tokens).toBe(500 + t.kept[0])
    expect(t.emitted[0].reduce((a, b) => a + b, 0)).toBe(500)
    expect(t.emitted[1].reduce((a, b) => a + b, 0)).toBe(t.reached[1])
  })

  test('the share of drafts kept is the acceptance α the level asks to predict, to within 5 standard errors, over 20,000 rounds', () => {
    for (const [id, seed] of [['overlap', 0], ['overlap', 11], ['overlap', 12]] as const) {
      const level = buildLevel(id, seed)
      const state = stateAfter(level, { t: 'commit', prediction: keptPlates(level) }, { t: 'draw', n: DRAW_CAP })
      const alpha = keptPlates(level) / PLATES
      const sd = Math.sqrt((alpha * (1 - alpha)) / DRAW_CAP)
      expect(Math.abs(state.tally.kept[0] / DRAW_CAP - alpha)).toBeLessThan(5 * sd)
    }
  })

  test('a recipe that is the residual puts out the chef\'s tasting: 20,000 rounds land within 5 standard errors of p, dish by dish', () => {
    for (const seed of [0, 3, 8]) {
      const level = buildLevel('exact', seed)
      const state = stateAfter(level, ...sculptActions(excessPlates(level)), { t: 'draw', n: DRAW_CAP })
      level.p[0].forEach((plates, dish) => {
        const p = plates / PLATES
        const sd = Math.sqrt((p * (1 - p)) / DRAW_CAP)
        expect([seed, dish, Math.abs(state.tally.emitted[0][dish] / DRAW_CAP - p) <= 5 * sd + 1e-9]).toEqual([seed, dish, true])
      })
    }
  })

  test('a new recipe is a new rule, so the rounds drawn under the old one are forgotten, and a preset starts a recipe from p or q', () => {
    const level = buildLevel('exact', 0)
    const drawnUnder = stateAfter(level, { t: 'preset', from: 'p' }, { t: 'draw', n: 100 })
    expect(drawnUnder.tally.rounds).toBe(100)
    const moved = verifierReduce(drawnUnder, { t: 'sculpt', token: 1, delta: 1 })
    expect(moved.tally.rounds).toBe(0)
    expect(drawnUnder.weights).toEqual(level.p[0])
    expect(stateAfter(level, { t: 'preset', from: 'q' }).weights).toEqual(level.q[0])
  })

  test('the markers of the latest rounds are drawn again from the seed, whatever recipe is set, and are at most MARKER_ROUNDS rounds', () => {
    const level = buildLevel('exact', 0)
    const a = S.view(stateAfter(level, { t: 'preset', from: 'p' }, { t: 'draw', n: 100 }))
    const b = S.view(stateAfter(level, { t: 'preset', from: 'q' }, { t: 'draw', n: 100 }))
    expect(a.rows[0].markers.length).toBeLessThanOrEqual(MARKER_ROUNDS)
    expect(a.rows[0].markers.length).toBeGreaterThan(0)
    expect(JSON.stringify(a.rows[0].markers)).toBe(JSON.stringify(b.rows[0].markers))
    for (const marker of a.rows[0].markers) {
      expect(marker.height).toBeGreaterThanOrEqual(0)
      expect(marker.height).toBeLessThan(level.q[0][marker.token])
      expect(marker.kept).toBe(marker.height < level.p[0][marker.token])
    }
  })
})

describe('only the exact residual reaches total-variation distance 0 in `exact` (acceptance check 2)', () => {
  test('on 200 seeds the residual passes the level and nothing else does: not p, not q, not an even recipe, not the residual moved by one plate', () => {
    for (const seed of seeds(0, 200)) {
      const level = buildLevel('exact', seed)
      const house = stateAfter(level, ...sculptActions(excessPlates(level)), { t: 'submit' })
      expect([seed, verifierGrade(house).ok, recipeTv(house)?.num]).toEqual([seed, true, 0n])
      const wrong: number[][] = [[...level.p[0]], [...level.q[0]], [1, 1, 1, 1, 1, 1]]
      const residual = excessPlates(level)
      const heavy = residual.indexOf(Math.max(...residual))
      wrong.push(residual.map((w, x) => (x === heavy ? w + 1 : w)))
      for (const recipe of wrong) {
        const done = verifierReduce(sculpt(stateAfter(level), recipe), { t: 'submit' })
        expect([seed, recipe.join(), verifierGrade(done).ok]).toEqual([seed, recipe.join(), false])
        expect(recipeTv(done)?.num).not.toBe(0n)
      }
    }
  })

  test('the distance is an exact fraction: what the meter shows is the rational the sim\'s arithmetic gives, and 0 is a fact and not a rounding', () => {
    const level = buildLevel('exact', 0)
    const state = stateAfter(level, { t: 'preset', from: 'p' })
    const view = S.view(state)
    const p = toDist(level.p[0])
    const q = toDist(level.q[0])
    const exact = tvExact(outputExact(p, q, 'min-ratio', { kind: 'weights', w: p.weights }), p)
    expect(view.meter?.tv).toEqual({ num: Number(exact.num), den: Number(exact.den) })
    expect(view.meter?.exact).toBe(false)
    expect(fracText(view.meter?.tv ?? { num: 0, den: 1 })).toBe('133/1024')
    const house = S.view(stateAfter(level, ...sculptActions(excessPlates(level))))
    expect(house.meter).toEqual({ tv: { num: 0, den: 1 }, exact: true })
    // The output the meter judges is the exact one: its first dish is 5.34 plates under the recipe of p, as the mirror prints it.
    expect(S.view(state).rows[0].outKind).toBe('exact')
    expect(Math.round((S.view(state).rows[0].out?.[0] ?? 0) * 100) / 100).toBe(5.34)
  })

  test('an empty recipe has no meter, and a graded recipe is judged the same way: the pass is distance 0', () => {
    const level = buildLevel('exact', 5)
    expect(S.view(stateAfter(level)).meter).toBeNull()
    const verdict = (target: readonly number[]) => verifierGrade(verifierReduce(sculpt(stateAfter(level), target), { t: 'submit' }))
    expect(verdict(excessPlates(level)).ok).toBe(true)
    expect(verdict(level.p[0]).ok).toBe(false)
    expect(verdict(level.p[0]).score).toBeLessThan(1)
    expect(verdict(level.p[0]).score).toBeGreaterThanOrEqual(0)
  })
})

describe('the other levels\' grades (ASSESSMENT §4.3)', () => {
  test('`overlap`: the exact count of plates, with one plate of grace in a practice level', () => {
    const level = buildLevel('overlap', 0)
    const truth = keptPlates(level)
    const verdict = (prediction: number) => verifierGrade(stateAfter(level, { t: 'commit', prediction }, { t: 'submit' }))
    expect(verdict(truth)).toEqual({ score: 1, ok: true })
    expect(verdict(truth + 1).ok).toBe(true)
    expect(verdict(truth - 1).ok).toBe(true)
    expect(verdict(truth + 2).ok).toBe(false)
    expect(verdict(truth + 8).score).toBe(0.5)
    expect(verdict(0).score).toBeGreaterThanOrEqual(0)
    expect(equals(alphaExact(toDist(level.p[0]), toDist(level.q[0])), ratio(truth, 64))).toBe(true)
  })

  test('`chain`: within 1% of the exact courses per round passes, and nothing outside it', () => {
    for (const seed of [1, 2, 4, 5]) {
      const level = buildLevel('chain', seed)
      const truth = tokensOf(level)
      const exact = Number(truth.num) / Number(truth.den)
      const verdict = (prediction: number) => verifierGrade(stateAfter(level, { t: 'commit', prediction }, { t: 'submit' }))
      expect(thousandths(truth) / 1000).toBeCloseTo(exact, 3)
      expect(verdict(thousandths(truth)).ok).toBe(true)
      expect(verdict(Math.round(exact * 1000 * 1.009)).ok).toBe(true)
      expect(verdict(Math.round(exact * 1000 * 0.991)).ok).toBe(true)
      expect(verdict(Math.round(exact * 1000 * 1.012)).ok).toBe(false)
      expect(verdict(Math.round(exact * 1000 * 0.988)).ok).toBe(false)
      expect(verdict(Math.round(exact * 1000 * 0.9)).score).toBe(0)
      expect(verdict(thousandths(truth)).score).toBe(1)
      expect(verdict(Math.round(exact * 1000 * 1.012)).score).toBeLessThan(0.8)
    }
  })

  test('`gamma`: the exact draft length passes, a neighbour does not, and the score says how much of the best speedup the pick bought', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const level = buildLevel('gamma', seed)
      const { rows, best } = sweepOfLevel(level)
      const verdict = (k: number) => verifierGrade(stateAfter(level, { t: 'gamma', k }, { t: 'submit' }))
      expect(verdict(best)).toEqual({ score: 1, ok: true })
      for (const k of [best - 1, best + 1].filter((n) => n >= 1 && n <= GAMMA_MAX)) {
        const miss = verdict(k)
        expect(miss.ok).toBe(false)
        expect(miss.score).toBeGreaterThan(0.9)
        expect(miss.score).toBeLessThan(1)
      }
      expect(rows).toHaveLength(GAMMA_MAX)
    }
  })

  test('`greedy-ngram`: the temperature-0 answer and the recipe are each half, and the level passes on both', () => {
    for (const seed of [0, 1, 2, 3]) {
      const level = buildLevel('greedy-ngram', seed)
      if (level.id !== 'greedy-ngram') throw new Error('not the copier level')
      const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
      const keptAtZero = level.draft === favourite
      const house = [...level.p[0]].map((w, x) => (x === level.draft ? 0 : w))
      const play = (judged: boolean, recipe: number[]) => verifierGrade(verifierReduce(sculpt(stateAfter(level, { t: 'judge', kept: judged }), recipe), { t: 'submit' }))
      expect(play(keptAtZero, house)).toEqual({ score: 1, ok: true })
      expect(play(!keptAtZero, house)).toEqual({ score: 0.5, ok: false })
      expect(play(keptAtZero, [...level.p[0]])).toEqual({ score: 0.5, ok: false })
      expect(play(!keptAtZero, [...level.p[0]])).toEqual({ score: 0, ok: false })
    }
  })

  test('`mutants`: each card named right is a fifth, and the level passes on all five', () => {
    const level = buildLevel('mutants', 0)
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    const named = (labels: (typeof MUTANT_IDS)[number][]) => verifierGrade(stateAfter(level, ...labels.map((bug, card): VerifierAction => ({ t: 'label', card, bug })), { t: 'submit' }))
    expect(named([...level.cards])).toEqual({ score: 1, ok: true })
    const swapped = [...level.cards]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(named(swapped)).toEqual({ score: 0.6, ok: false })
    expect(named(level.cards.map(() => 'resample-from-p')).score).toBe(0.2)
  })
})

describe('the debrief says what the run did, and names what mattered', () => {
  test('`exact`: a wrong recipe names the dish furthest from the chef\'s tasting, exactly; the right one names nothing', () => {
    const level = buildLevel('exact', 0)
    const wrong = verifierReduce(stateAfter(level, { t: 'preset', from: 'p' }), { t: 'submit' })
    const debrief = verifierDebrief(wrong)
    // On the practice seed the recipe of p puts out 5.34 plates of soup against the chef's 10: the soup is the furthest out.
    expect(debrief.names).toEqual({ lever: 'dish:0' })
    expect(debrief.sentence).toContain(`The dish furthest out is the ${DISHES[0]}`)
    expect(verifierDebrief(verifierGhost(level)).names).toBeNull()
    expect(debrief.sentence).not.toMatch(/\d/)
  })

  test('`chain`: a count that is the first position\'s acceptance throughout, or the mean, is named as such', () => {
    const level = buildLevel('chain', 1)
    const final = S.view(S.ghost(level)).final
    const first = final?.naive?.first ?? 0
    const mean = final?.naive?.mean ?? 0
    const say = (value: number) => verifierDebrief(stateAfter(level, { t: 'commit', prediction: Math.round(value * 1000) }, { t: 'submit' }))
    expect(say(first).names).toEqual({ lever: 'alpha-of-the-first' })
    expect(say(mean).names).toEqual({ lever: 'alpha-mean' })
    expect(say(first * 1.5).names).toBeNull()
    expect(say(thousandths(tokensOf(level)) / 1000).names).toBeNull()
  })

  test('`gamma`: too short and too long are named, and `greedy-ngram` names the temperature-0 mistake', () => {
    const level = buildLevel('gamma', 0)
    const { best } = sweepOfLevel(level)
    expect(verifierDebrief(stateAfter(level, { t: 'gamma', k: best - 1 }, { t: 'submit' })).names).toEqual({ lever: 'too-short' })
    expect(verifierDebrief(stateAfter(level, { t: 'gamma', k: best + 1 }, { t: 'submit' })).names).toEqual({ lever: 'too-long' })
    const copier = buildLevel('greedy-ngram', 0)
    if (copier.id !== 'greedy-ngram') throw new Error('not the copier level')
    const wrongCall = verifierReduce(sculpt(stateAfter(copier, { t: 'judge', kept: false }), copier.p[0].map((w, x) => (x === copier.draft ? 0 : w))), { t: 'submit' })
    expect(verifierDebrief(wrongCall).names).toEqual({ lever: 'temperature-zero' })
  })

  test('no sentence carries a digit: the counters beside it are tagged, and it is not', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const ghost = verifierGhost(level)
      expect([id, verifierDebrief(ghost).sentence]).not.toEqual([id, expect.stringMatching(/\d/)])
      expect(/\d/.test(verifierDebrief(ghost).sentence)).toBe(false)
    }
  })
})

describe('a run is its log (A§6.3, ASSESSMENT §4.3)', () => {
  test('replaying the house\'s log gives the state it made, and regrading it gives the grade, with no help from anything stored beside it', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const actions = houseActions(level)
      const record = { game: 'verifier', level: id, seed, actions }
      const played = replay(S, record)
      expect(played.ok).toBe(true)
      if (!played.ok) continue
      expect(textOf(played.state as ReturnType<typeof stateAfter>)).toBe(textOf(verifierGhost(level)))
      const graded = regrade(S, { ...record, score: 0, ok: false })
      expect(graded.valid).toBe(true)
      if (graded.valid) expect([id, graded.grade.ok, graded.storedMatches]).toEqual([id, true, false])
    }
  })

  test('a log with an action the reducer refuses, or one that comes after the end, does not replay, and names the action', () => {
    const level = buildLevel('exact', 0)
    const bad = replay(S, { game: 'verifier', level: 'exact', seed: 0, actions: [{ t: 'sculpt', token: 0, delta: -3 }] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.at).toBe(0)
    const after = replay(S, { game: 'verifier', level: 'exact', seed: 0, actions: [...houseActions(level), { t: 'sculpt', token: 0, delta: 1 }] })
    expect(after.ok).toBe(false)
    if (!after.ok) expect(after.reason).toContain('comes after the run was over')
  })

  test('the shell\'s `applyAction` records a canonical copy of each action, so the log replays exactly what the live run saw', () => {
    let run = startRun(S, { game: 'verifier', level: 'exact', seed: 0 })
    for (const action of houseActions(run.level as ReturnType<typeof buildLevel>)) run = applyAction(S, run, action)
    expect(run.record.actions).toHaveLength(4)
    expect(stateHash(run.state)).toBe(GOLDEN.exact)
    expect(S.done(run.state)).toBe(true)
    expect(verifierDone(run.state)).toBe(true)
  })
})

describe('the view keeps the answer back, and carries every figure the page prints', () => {
  test('`overlap` and `chain` print no overlap, no excess and no α until the prediction is in', () => {
    for (const [id, seed] of [['overlap', 0], ['chain', 1]] as const) {
      const level = buildLevel(id, seed)
      const before = S.view(stateAfter(level))
      expect([id, before.reveal, before.rows.every((row) => row.agreed === null && row.under === null && row.over === null && row.alpha === null)]).toEqual([id, false, true])
      const after = S.view(stateAfter(level, { t: 'commit', prediction: id === 'overlap' ? 30 : 2000 }))
      expect([id, after.reveal, after.rows.filter((row) => row.kind === 'draft').every((row) => row.agreed !== null && row.alpha !== null)]).toEqual([id, true, true])
    }
  })

  test('`greedy-ngram` prints them after the temperature-0 question is answered, and `gamma` has no rows', () => {
    const level = buildLevel('greedy-ngram', 0)
    expect(S.view(stateAfter(level)).reveal).toBe(false)
    expect(S.view(stateAfter(level, { t: 'judge', kept: true })).reveal).toBe(true)
    expect(S.view(stateAfter(buildLevel('gamma', 0))).rows).toEqual([])
  })

  test('a card carries the rule in words and never its bug, until the run is over, and then the truth is in the final facts', () => {
    const level = buildLevel('mutants', 0)
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    const view = S.view(stateAfter(level))
    expect(view.cards).toHaveLength(5)
    expect(view.final).toBeNull()
    const text = JSON.stringify(view)
    for (const bug of MUTANT_IDS) expect(text).not.toContain(bug)
    const done = S.view(S.ghost(level))
    expect(done.final?.truth?.map((row) => row.bug)).toEqual([...level.cards])
  })

  test('the facts of a finished run are the exact ones: courses per round as a fraction, the whole sweep, and each wrong rule\'s distance', () => {
    const chain = S.view(S.ghost(buildLevel('chain', 1))).final
    expect(chain?.tokens).toEqual({ num: 78561, den: 32768 })
    const gamma = S.view(S.ghost(buildLevel('gamma', 0))).final
    expect(gamma?.sweep).toHaveLength(GAMMA_MAX)
    expect(gamma?.sweep?.filter((row) => row.best)).toHaveLength(1)
    const exact = S.view(S.ghost(buildLevel('exact', 0))).final
    expect(exact?.rules?.map((rule) => rule.id)).toEqual(['resample-from-p', 'resample-from-q', 'p-without-draft', 'residual-off-by-one', 'accept-if-p-over-q', 'accept-everything'])
    expect(exact?.rules?.[0].tv).toEqual({ num: 133, den: 1024 })
    expect(exact?.worst).toBeNull()
    const copier = S.view(S.ghost(buildLevel('greedy-ngram', 0))).final
    expect(copier?.rules?.map((rule) => rule.id)).not.toContain('p-without-draft')
    expect(copier?.keptAtZero).toBe(true)
  })

  test('the ask follows the level: predict, then finish; judge, then recipe; and null at the end', () => {
    expect(verifierAsk(stateAfter(buildLevel('overlap', 0)))?.kind).toBe('predict-plates')
    expect(verifierAsk(stateAfter(buildLevel('overlap', 0), { t: 'commit', prediction: 30 }))?.kind).toBe('finish')
    expect(verifierAsk(stateAfter(buildLevel('chain', 1)))?.kind).toBe('predict-tokens')
    expect(verifierAsk(stateAfter(buildLevel('greedy-ngram', 0)))?.kind).toBe('judge')
    expect(verifierAsk(stateAfter(buildLevel('greedy-ngram', 0), { t: 'judge', kept: true }))?.kind).toBe('recipe')
    expect(verifierAsk(stateAfter(buildLevel('mutants', 0)))?.kind).toBe('audit')
    expect(verifierAsk(stateAfter(buildLevel('gamma', 0)))?.kind).toBe('choose-gamma')
    expect(verifierAsk(verifierGhost(buildLevel('exact', 0)))).toBeNull()
  })

  test('a view of every state along the house\'s runs is plain data too: numbers, text and lists, no bigint', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      let state = verifierInit(level)
      for (const action of houseActions(level)) {
        expect(() => JSON.stringify(S.view(state))).not.toThrow()
        state = verifierReduce(state, action)
      }
      expect(() => JSON.stringify(S.view(state))).not.toThrow()
    }
  })
})

describe('the mutants\' instruments are the lab\'s (A§8.3): a taste of 20,000 rounds, and a look at every coin', () => {
  const level = buildLevel('mutants', 0)
  if (level.id !== 'mutants') throw new Error('not the mutants level')

  test('a taste rejects the four cards that are wrong by a few parts in a hundred, and does not see the boundary-inclusive one', () => {
    const state = stateAfter(level, ...level.cards.map((_, card): VerifierAction => ({ t: 'taste', card })))
    level.cards.forEach((bug, card) => {
      const taste = state.tasted[card]
      expect([bug, taste?.rejected]).toEqual([bug, bug !== 'boundary-inclusive'])
      expect(taste?.counts.reduce((a, b) => a + b, 0)).toBe(20_000)
    })
  })

  test('a look at every coin finds the two accept-step bugs and passes the three that are wrong in their recipe', () => {
    const state = stateAfter(level, ...level.cards.map((_, card): VerifierAction => ({ t: 'coins', card })))
    level.cards.forEach((bug, card) => {
      const found = state.coined[card]?.length ?? -1
      expect([bug, bug === 'accept-if-p-over-q' || bug === 'boundary-inclusive' ? found > 0 : found === 0]).toEqual([bug, true])
    })
  })

  test('tasting a card twice gives the same 20,000 rounds, and the view carries what each instrument found for the card under the lamp', () => {
    const once = stateAfter(level, { t: 'taste', card: 2 })
    const twice = verifierReduce(once, { t: 'taste', card: 2 })
    expect(textOf(once)).toBe(textOf(twice))
    const view = S.view(once)
    expect(view.focus).toBe(2)
    expect(view.rows[0].outKind).toBe('sampled')
    expect(view.cards?.[2].taste).not.toBeNull()
    expect(view.cards?.[0].taste).toBeNull()
  })
})
