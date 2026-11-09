/*
 * W1-T04: the item framework of packages/play/items, on toy families (items-support.ts). What is held here is the contract that every
 * family leans on: Rich text, the sub-streams and the variant a seed picks, the fingerprint, the draw that turns an attempt's
 * entropy into a fair seed, grading, the blind-strategy measure and its bound, the attempt that a lesson's item block plays, and
 * grading a stored answer again from its seed.
 */
import { describe, expect, test } from 'bun:test'
import { splitmix32u } from '@es/sim/core'
import {
  answerItem,
  BAND_FLOOR,
  bandAcceptance,
  bandedSeeds,
  blindBound,
  BLIND_BOUND,
  CONFIDENCES,
  drawInBand,
  fixedSeeds,
  finishItem,
  formatNumber,
  gradeChoice,
  gradeNumeric,
  isAbout,
  isDone,
  isLevel,
  itemRef,
  itemRev,
  itemRng,
  keyText,
  LEVELS,
  MAX_DRAWS,
  measureBlind,
  nextUnanswered,
  num,
  offeredAt,
  parseItemRef,
  parseStoredAnswer,
  plain,
  regradeItem,
  resolveVariant,
  resultOf,
  rich,
  seenKey,
  seenKeyOfRef,
  startAttempt,
  tally,
  textOf,
  withinTolerance,
} from '@es/play/items'
import type { Gen, Item } from '@es/play/items'
import { CONFIDENCES as LEDGER_CONFIDENCES } from '@es/ledger'
import { constantKey, cuedChoice, echoKey, fixedId, keyOf, tightBand, toySum, wrongOf } from './items-support.ts'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rich text                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('Rich text', () => {
  test('a sentence is words and parts, and a number carries its tag', () => {
    const sentence = rich('Plan ', num(1600, { unit: 'µs' }), ' and read ', num(400, { unit: 'µs', tag: 'derived' }))
    expect(sentence.map((part) => part.t)).toEqual(['text', 'num', 'text', 'num'])
    expect(sentence[1]).toEqual({ t: 'num', value: 1600, tag: 'synthetic', unit: 'µs' })
    expect(sentence[3]).toMatchObject({ tag: 'derived' })
  })

  test('a number leaves out a key that is undefined, because an item has a canonical JSON form that has none', () => {
    expect(Object.keys(num(3))).toEqual(['t', 'value', 'tag'])
    expect(Object.keys(num(3, { unit: 'ms', digits: 1 }))).toEqual(['t', 'value', 'tag', 'unit', 'digits'])
    expect(Object.keys(num(3, { unit: undefined, digits: undefined }))).toEqual(['t', 'value', 'tag'])
  })

  test('is read as a person reads it: grouped by thousands, fixed digits, a true minus', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(0.5, 2)).toBe('0.50')
    expect(formatNumber(-1200)).toBe('−1,200')
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(plain(rich('Take ', num(2100, { unit: 'µs' }), ' of ', { t: 'code', code: 'max_num_seqs' }, '.'))).toBe('Take 2,100 µs of max_num_seqs.')
    expect(textOf(rich('a ', num(1), ' b ', { t: 'code', code: 'c' }))).toEqual(['a ', ' b '])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Seeds, variants and fingerprints                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('levels', () => {
  test('are the four fading levels of the item block', () => {
    expect(LEVELS).toEqual([0, 1, 2, 3])
    expect(isLevel(2)).toBe(true)
    for (const bad of [-1, 4, 1.5, '2', null, undefined]) expect(isLevel(bad)).toBe(false)
  })

  test('the confidence taps are the ledger\'s', () => {
    expect([...CONFIDENCES]).toEqual([...LEDGER_CONFIDENCES])
  })
})

describe('itemRng and resolveVariant', () => {
  const draws = (rng: () => number) => [rng(), rng(), rng()]

  test('a stream is a function of its family, variant, level, seed and purpose, and of nothing else', () => {
    expect(draws(itemRng('tr2.toy', 'one', 2, 7, 'scene'))).toEqual(draws(itemRng('tr2.toy', 'one', 2, 7, 'scene')))
    const base = draws(itemRng('tr2.toy', 'one', 2, 7, 'scene'))
    for (const other of [itemRng('tr2.other', 'one', 2, 7, 'scene'), itemRng('tr2.toy', 'two', 2, 7, 'scene'), itemRng('tr2.toy', 'one', 3, 7, 'scene'), itemRng('tr2.toy', 'one', 2, 8, 'scene'), itemRng('tr2.toy', 'one', 2, 7, 'other')]) {
      expect(draws(other)).not.toEqual(base)
    }
  })

  test('a named variant must exist and be offered at the level', () => {
    expect(resolveVariant(toySum, 1, 2, 'larger').id).toBe('larger')
    expect(() => resolveVariant(toySum, 1, 2, 'nope')).toThrow('has no variant "nope"')
    expect(() => resolveVariant(toySum, 1, 0, 'larger')).toThrow('not offered at level 0')
  })

  test('the seed picks among the variants offered at the level: all of them across seeds, and the same one every time', () => {
    const picked = (level: 0 | 1 | 2 | 3) => new Set(fixedSeeds(200).map((seed) => resolveVariant(toySum, seed, level).id))
    expect([...picked(0)]).toEqual(['sum'])
    expect([...picked(2)].sort()).toEqual(['larger', 'sum'])
    expect(resolveVariant(toySum, 123, 2).id).toBe(resolveVariant(toySum, 123, 2).id)
    expect(offeredAt(toySum, 0).map((variant) => variant.id)).toEqual(['sum'])
    expect(() => resolveVariant({ id: 'tr2.none', variants: [] }, 1, 2)).toThrow('offers no variant at level 2')
  })
})

describe('the fingerprint', () => {
  const part = { family: 'tr2.toy', version: 1, variant: 'one', level: 2 as const, params: { a: 1, b: 2 } }

  test('is eight hex digits, the same for the same item, and another for any change of what the item is a function of', () => {
    expect(itemRev(part)).toMatch(/^[0-9a-f]{8}$/)
    expect(itemRev(part)).toBe(itemRev({ ...part, params: { b: 2, a: 1 } }))
    for (const changed of [{ version: 2 }, { variant: 'two' }, { level: 3 as const }, { family: 'tr2.other' }, { params: { a: 1, b: 3 } }]) {
      expect(itemRev({ ...part, ...changed })).not.toBe(itemRev(part))
    }
  })

  test('finishItem adds the family, the version and the fingerprint, and refuses a param that has no JSON form', () => {
    const draft = { variant: 'one', level: 2 as const, seed: 5, kcs: ['tr2.bubble'], stem: rich('?'), givens: [], worked: [], answer: { kind: 'numeric' as const, label: 'n', unit: 'tokens', truth: 1, tolerance: {} }, params: { a: 1 } }
    const item = finishItem({ id: 'tr2.toy', version: 3 }, draft)
    expect(item).toMatchObject({ family: 'tr2.toy', version: 3, rev: itemRev({ family: 'tr2.toy', version: 3, variant: 'one', level: 2, params: { a: 1 } }) })
    expect(() => finishItem({ id: 'tr2.toy', version: 3 }, { ...draft, params: { a: Number.NaN } })).toThrow('the param a is not finite')
  })
})

describe('drawInBand', () => {
  test('keeps the entropy itself when the band accepts it', () => {
    const open = { id: 'tr2.open', band: () => true }
    expect(drawInBand(open, 2, 12345)).toEqual({ seed: 12345, tries: 1 })
  })

  test('walks the entropy\'s splitmix32 stream until the band accepts, and says how many it tried', () => {
    const stream = splitmix32u(777)
    const first = stream()
    const second = stream()
    const third = stream()
    const accepts = new Set([third])
    const gen = { id: 'tr2.walk', band: (seed: number) => accepts.has(seed) }
    expect(drawInBand(gen, 2, 777)).toEqual({ seed: third, tries: 4 })
    expect(new Set([first, second, third]).size).toBe(3)
  })

  test('skips a seed the learner has met', () => {
    const open = { id: 'tr2.open', band: () => true }
    const stream = splitmix32u(55)
    expect(drawInBand(open, 2, 55, (seed) => seed === 55)).toEqual({ seed: stream(), tries: 2 })
  })

  test('gives up after the most candidates a draw may try, and refuses entropy that is not a seed', () => {
    const closed = { id: 'tr2.closed', band: () => false }
    expect(() => drawInBand(closed, 2, 1)).toThrow(`no seed in band at level 2 in ${MAX_DRAWS} candidates`)
    expect(MAX_DRAWS).toBe(256)
    for (const bad of [-1, 1.5, 2 ** 32]) expect(() => drawInBand({ id: 'x', band: () => true }, 2, bad)).toThrow('unsigned 32-bit')
  })

  test('on a real band, returns seeds the band accepts, for any entropy', () => {
    for (const entropy of fixedSeeds(200, 9)) {
      const { seed, tries } = drawInBand(toySum, 2, entropy)
      expect(toySum.band(seed, 2)).toBe(true)
      expect(tries).toBeGreaterThanOrEqual(1)
    }
  })

  test('fixedSeeds never change, and are seeds', () => {
    expect(fixedSeeds(3)).toEqual(fixedSeeds(3))
    expect(fixedSeeds(3, 1)).not.toEqual(fixedSeeds(3, 2))
    for (const seed of fixedSeeds(50)) expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('withinTolerance', () => {
  test.each([
    [100, 100, {}, true],
    [100, 101, {}, false],
    [100, 102, { rel: 0.02 }, true],
    [100, 102.1, { rel: 0.02 }, false],
    [100, 95, { abs: 5 }, true],
    [100, 94, { abs: 5 }, false],
    [100, 94, { abs: 5, rel: 0.1 }, true],
    [-100, -101, { rel: 0.02 }, true],
    [100, Number.NaN, { rel: 1 }, false],
    [100, Number.POSITIVE_INFINITY, { rel: 1 }, false],
  ])('truth %p, value %p, tolerance %p is %p', (truth, value, tolerance, right) => {
    expect(withinTolerance(truth, value, tolerance)).toBe(right)
  })

  test('isAbout is 2 % unless it is told another', () => {
    expect(isAbout(98, 100)).toBe(true)
    expect(isAbout(97, 100)).toBe(false)
    expect(isAbout(90, 100, 0.1)).toBe(true)
  })
})

describe('grading', () => {
  const sum = (seed: number): Item => toySum.make(seed, 0)
  const larger = (seed: number): Item => toySum.make(seed, 2, 'larger')

  test('a numeric answer is right at its key and wrong elsewhere, and the feedback carries the key as a derived number', () => {
    const item = sum(1)
    const right = toySum.grade(item, keyOf(item))
    expect(right).toMatchObject({ ok: true, score: 1 })
    const wrong = toySum.grade(item, wrongOf(item))
    expect(wrong).toMatchObject({ ok: false, score: 0 })
    expect(wrong.feedback.some((part) => part.t === 'num' && part.tag === 'derived')).toBe(true)
    expect(keyText(item)).toBe(`${formatNumber(item.answer.kind === 'numeric' ? item.answer.truth : 0)} tokens`)
  })

  test('a response of the other kind, and a number that is not one, are wrong and never throw', () => {
    const item = sum(1)
    expect(gradeNumeric(item, { kind: 'choice', pick: 'x' }).ok).toBe(false)
    expect(gradeNumeric(item, { kind: 'numeric', value: Number.NaN }).ok).toBe(false)
    expect(() => gradeChoice(item, { kind: 'choice', pick: 'x' })).toThrow('not a choice item')
    expect(() => gradeNumeric(larger(1), { kind: 'numeric', value: 1 })).toThrow('not a numeric item')
  })

  test('the first rule that names a wrong number decides the diagnosis', () => {
    const item = sum(1)
    const rules = [
      () => null,
      (_: Item, value: number) => (value === 7 ? { id: 'tr2.toy.seven', message: rich('Seven.') } : null),
      () => ({ id: 'tr2.toy.any', message: rich('Any.') }),
    ]
    expect(gradeNumeric(item, { kind: 'numeric', value: 7 }, rules).diagnosis?.id).toBe('tr2.toy.seven')
    expect(gradeNumeric(item, { kind: 'numeric', value: 8 }, rules).diagnosis?.id).toBe('tr2.toy.any')
    expect(gradeNumeric(item, keyOf(item), rules).diagnosis).toBeUndefined()
  })

  test('a choice is graded by id, and a wrong pick is diagnosed by the misconception its option encodes', () => {
    const item = larger(2)
    const spec = item.answer
    if (spec.kind !== 'choice') throw new Error('a choice')
    expect(gradeChoice(item, keyOf(item))).toMatchObject({ ok: true, score: 1 })
    const wrongId = spec.options.find((option) => option.id !== spec.correct)?.id ?? ''
    const wrong = gradeChoice(item, { kind: 'choice', pick: wrongId })
    expect(wrong).toMatchObject({ ok: false, score: 0, diagnosis: { id: `tr2.toy-sum.not-${wrongId}` } })
    expect(plain(wrong.diagnosis?.message ?? [])).toContain('smaller')
    expect(gradeChoice(item, { kind: 'choice', pick: 'nope' })).toMatchObject({ ok: false, feedback: [{ t: 'text', text: 'That option is not on this ticket.' }] })
    expect(keyText(item)).toContain('The one called')
  })

  test('the options of a choice are in the order the seed shuffled them, which differs between seeds, and the ids are what is graded', () => {
    const orders = new Set(
      fixedSeeds(60).map((seed) => {
        const { answer } = toySum.make(seed, 2, 'larger')
        return answer.kind === 'choice' ? answer.options.map((o) => o.id).join('') : ''
      }),
    )
    expect(orders.size).toBeGreaterThan(1)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Blind strategies                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the blind-strategy bound', () => {
  test('a numeric answer is held to 15 %, a choice of few options to its chance plus three standard errors, a long choice to 15 %', () => {
    expect(BLIND_BOUND).toBe(0.15)
    expect(blindBound('numeric', 0, 1000)).toBe(0.15)
    expect(blindBound('choice', 4, 1000)).toBeCloseTo(0.25 + 3 * Math.sqrt((0.25 * 0.75) / 1000), 10)
    expect(blindBound('choice', 4, 1000)).toBeGreaterThan(0.25)
    expect(blindBound('choice', 4, 100)).toBeGreaterThan(blindBound('choice', 4, 1000))
    expect(blindBound('choice', 20, 1000)).toBe(0.15)
    expect(blindBound('choice', 1, 1000)).toBe(1)
  })

  test('a fair family stays under it at every level it offers', () => {
    for (const level of [0, 1, 2, 3] as const) {
      const report = measureBlind(toySum, level, bandedSeeds(toySum, level, 600))
      expect(report.over).toEqual([])
      expect(report.samples).toBe(600)
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(row.bound)
    }
  })

  test('a numeric key that never changes is caught by the best constant, which passes every item', () => {
    const report = measureBlind(constantKey, 2, bandedSeeds(constantKey, 2, 200))
    expect(report.over).toHaveLength(1)
    expect(report.over[0]).toMatchObject({ strategy: 'constant', rate: 1, kind: 'numeric' })
    expect(report.over[0].describe).toContain('42')
    expect(report.overall).toBe(1)
  })

  test('a key that is printed on the ticket is caught by echoing it', () => {
    const report = measureBlind(echoKey, 2, bandedSeeds(echoKey, 2, 200))
    expect(report.over[0]).toMatchObject({ strategy: 'echo-the total', rate: 1 })
  })

  test('a right option that is always the longest is caught by "always the longest", and one that always has one id by that id', () => {
    const cued = measureBlind(cuedChoice, 2, bandedSeeds(cuedChoice, 2, 300))
    expect(cued.over.map((row) => row.strategy)).toEqual(['longest'])
    expect(cued.over[0].rate).toBe(1)
    const fixed = measureBlind(fixedId, 2, bandedSeeds(fixedId, 2, 300))
    expect(fixed.over.map((row) => row.strategy)).toEqual(['id-a'])
  })

  test('a family\'s own strategy is measured and held to the bound too', () => {
    // A strategy that cannot be told from reading the scene: it is what a family author lists when a habit is not generic.
    const cheat: Gen = { ...toySum, blind: [{ id: 'cheat', describe: 'the key itself', answers: (item) => (item.answer.kind === 'choice' ? [{ kind: 'choice', pick: item.answer.correct }] : null) }] }
    const report = measureBlind(cheat, 2, bandedSeeds(cheat, 2, 600))
    expect(report.over.map((row) => [row.variant, row.strategy, row.rate])).toEqual([['larger', 'cheat', 1]])
    // A strategy with no answer for an item passes none of them.
    const silent: Gen = { ...toySum, blind: [{ id: 'silent', describe: 'no answer', answers: () => null }] }
    expect(measureBlind(silent, 2, bandedSeeds(silent, 2, 300)).over).toEqual([])
  })

  test('a tie between options costs a strategy its share of the item', () => {
    const tied: Gen = { ...toySum, blind: [{ id: 'any', describe: 'any option', answers: (item) => (item.answer.kind === 'choice' ? item.answer.options.map((option) => ({ kind: 'choice' as const, pick: option.id })) : null) }] }
    const report = measureBlind(tied, 2, bandedSeeds(tied, 2, 600))
    const row = report.best.find((candidate) => candidate.variant === 'larger')
    // Picking among all three options is right a third of the time on every item, and no more than the best fixed habit.
    expect(row?.rate).toBeLessThan(0.45)
    expect(report.over).toEqual([])
  })
})

describe('the band', () => {
  test('its acceptance is measured on fixed candidates, and a tight band shows under the floor', () => {
    expect(BAND_FLOOR).toBe(0.2)
    const fair = bandAcceptance(toySum, 0)
    expect(fair.tried).toBe(2000)
    expect(fair.rate).toBeGreaterThan(0.95)
    expect(bandAcceptance(toySum, 0)).toEqual(fair)
    expect(bandAcceptance(tightBand, 0).rate).toBeLessThan(0.05)
    expect(bandedSeeds(tightBand, 0, 10, 5000).length).toBe(10)
    expect(bandedSeeds(tightBand, 0, 10, 20).length).toBeLessThan(10)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* An attempt                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('an attempt', () => {
  const entropy = [11, 222, 3333]

  test('has one fair item for each value of entropy, and is a function of the entropy alone', () => {
    const attempt = startAttempt(toySum, 2, entropy)
    expect(attempt.served).toHaveLength(3)
    expect(attempt.answered).toEqual([null, null, null])
    expect(attempt).toMatchObject({ family: 'tr2.toy-sum', level: 2, provenance: 'unseen' })
    for (const served of attempt.served) {
      expect(toySum.band(served.seed, 2)).toBe(true)
      expect(served.item.seed).toBe(served.seed)
      expect(served.item.level).toBe(2)
    }
    expect(startAttempt(toySum, 2, entropy)).toEqual(attempt)
  })

  test('two attempts on different entropy draw different seeds', () => {
    const one = startAttempt(toySum, 2, fixedSeeds(3, 1))
    const two = startAttempt(toySum, 2, fixedSeeds(3, 2))
    expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
    expect(new Set([...one.served, ...two.served].map((served) => served.seed)).size).toBe(6)
  })

  test('never serves one seed twice, and skips what the learner has met unless the attempt is practice', () => {
    const same = startAttempt(toySum, 2, [5, 5, 5])
    expect(new Set(same.served.map((served) => served.seed)).size).toBe(3)
    const first = startAttempt(toySum, 2, [900]).served[0]
    const seen = new Set([seenKey('tr2.toy-sum', first.item.variant, first.seed)])
    const after = startAttempt(toySum, 2, [900], { seen })
    expect(after.served[0].seed).not.toBe(first.seed)
    expect(after.served[0].tries).toBeGreaterThan(1)
    const practice = startAttempt(toySum, 2, [900], { seen, provenance: 'practice' })
    expect(practice.served[0].seed).toBe(first.seed)
    expect(practice.provenance).toBe('practice')
  })

  test('grades an answer against the item, records it with the confidence, and an item is answered once', () => {
    const start = startAttempt(toySum, 2, entropy)
    const right = answerItem(toySum, start, 0, keyOf(start.served[0].item), 'sure')
    expect(right.answered[0]).toMatchObject({ grade: { ok: true }, conf: 'sure' })
    expect(start.answered[0]).toBeNull()
    expect(() => answerItem(toySum, right, 0, keyOf(start.served[0].item))).toThrow('answered already')
    expect(() => answerItem(toySum, right, 9, keyOf(start.served[0].item))).toThrow('has no item 9')
    const wrong = answerItem(toySum, right, 1, wrongOf(start.served[1].item))
    expect(wrong.answered[1]).toMatchObject({ grade: { ok: false } })
    expect(wrong.answered[1]).not.toHaveProperty('conf')
  })

  test('knows which item is next, when it is done, and how many were right', () => {
    let attempt = startAttempt(toySum, 2, entropy)
    expect(nextUnanswered(attempt)).toBe(0)
    expect(tally(attempt)).toEqual({ total: 3, answered: 0, right: 0 })
    attempt = answerItem(toySum, attempt, 0, keyOf(attempt.served[0].item))
    attempt = answerItem(toySum, attempt, 1, wrongOf(attempt.served[1].item))
    expect(nextUnanswered(attempt)).toBe(2)
    expect(isDone(attempt)).toBe(false)
    attempt = answerItem(toySum, attempt, 2, keyOf(attempt.served[2].item))
    expect(isDone(attempt)).toBe(true)
    expect(nextUnanswered(attempt)).toBeNull()
    expect(tally(attempt)).toEqual({ total: 3, answered: 3, right: 2 })
  })

  test('hands the ledger the ref, the fingerprint, the seed, the level, the grade and the answer, and no key', () => {
    let attempt = startAttempt(toySum, 2, entropy)
    const served = attempt.served[0]
    attempt = answerItem(toySum, attempt, 0, wrongOf(served.item), 'guess')
    const result = resultOf(attempt, 0)
    expect(result).toEqual({
      ref: itemRef('tr2.toy-sum', served.item.variant),
      rev: served.item.rev,
      seed: served.seed,
      level: 2,
      ok: false,
      score: 0,
      provenance: 'unseen',
      conf: 'guess',
      answer: { level: 2, response: wrongOf(served.item) },
    })
    expect(JSON.stringify(result)).not.toContain('truth')
    expect(() => resultOf(attempt, 1)).toThrow('is not answered')
    expect(() => resultOf(attempt, 7)).toThrow('is not answered')
    expect(resultOf(answerItem(toySum, attempt, 1, keyOf(attempt.served[1].item)), 1)).not.toHaveProperty('conf')
  })

  test('the seen key of an event is the ref and the seed', () => {
    expect(seenKeyOfRef('item:gen/tr2.toy-sum/sum', 7)).toBe(seenKey('tr2.toy-sum', 'sum', 7))
    expect(seenKeyOfRef('play:loop/close', 7)).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading a stored answer again                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('regradeItem', () => {
  const families = [toySum]
  const stored = (item: Item, response = keyOf(item)) => ({
    ref: itemRef(item.family, item.variant),
    seed: item.seed,
    rev: item.rev,
    answer: { level: item.level, response },
  })

  test('makes the item again from the seed and grades the answer against the key it computes then', () => {
    for (const seed of fixedSeeds(40)) {
      const item = toySum.make(seed, 2)
      expect(regradeItem(stored(item), families)).toMatchObject({ valid: true, ok: true, score: 1, stale: false })
      expect(regradeItem(stored(item, wrongOf(item)), families)).toMatchObject({ valid: true, ok: false, score: 0 })
    }
  })

  test('a result that came out of an attempt regrades to itself, whatever else the store holds', () => {
    const attempt = answerItem(toySum, startAttempt(toySum, 2, [31]), 0, wrongOf(startAttempt(toySum, 2, [31]).served[0].item))
    const result = resultOf(attempt, 0)
    const regraded = regradeItem({ ref: result.ref, seed: result.seed, rev: result.rev, answer: result.answer }, families)
    expect(regraded).toMatchObject({ valid: true, ok: result.ok, score: result.score })
  })

  test('an event graded against another question is stale, and says so', () => {
    const item = toySum.make(3, 2)
    expect(regradeItem({ ...stored(item), rev: 'deadbeef' }, families)).toMatchObject({ valid: true, stale: true })
    expect(regradeItem({ ...stored(item), rev: undefined }, families)).toMatchObject({ valid: true, stale: false })
  })

  test.each([
    ['a ref that is not an item\'s', { ref: 'play:loop/close' }, 'is not the ref of an item'],
    ['a family this build lacks', { ref: 'item:gen/tr2.other/sum' }, 'has no item family "tr2.other"'],
    ['an answer that is not one', { answer: { level: 2, response: { kind: 'numeric' } } }, 'not one this build can read'],
    ['no seed', { seed: undefined }, 'no seed'],
    ['a seed that is not a uint32', { seed: 2 ** 32 }, 'no seed'],
    ['a variant that does not exist', { ref: 'item:gen/tr2.toy-sum/nope' }, 'has no variant "nope"'],
    ['a level the variant is not offered at', { ref: 'item:gen/tr2.toy-sum/larger', answer: { level: 0, response: { kind: 'choice', pick: 'x' } } }, 'not offered at level 0'],
  ])('refuses %s', (_, change, reason) => {
    const base = stored(toySum.make(3, 2, 'sum'))
    const result = regradeItem({ ...base, ...change }, families)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain(reason)
  })

  test('reads the stored answer back, and only a well-formed one', () => {
    expect(parseStoredAnswer({ level: 1, response: { kind: 'numeric', value: 2.5 } })).toEqual({ level: 1, response: { kind: 'numeric', value: 2.5 } })
    expect(parseStoredAnswer({ level: 0, response: { kind: 'choice', pick: 'a' } })).toEqual({ level: 0, response: { kind: 'choice', pick: 'a' } })
    for (const bad of [null, 3, 'a', [], {}, { level: 4, response: { kind: 'choice', pick: 'a' } }, { level: 1, response: { kind: 'numeric', value: Number.NaN } }, { level: 1, response: { kind: 'choice', pick: 3 } }, { level: 1, response: { kind: 'other' } }]) {
      expect(parseStoredAnswer(bad)).toBeNull()
    }
  })

  test('takes a ref apart as the ledger writes it', () => {
    expect(parseItemRef('item:gen/tr2.bubble-width/async-on')).toEqual({ family: 'tr2.bubble-width', variant: 'async-on' })
    for (const bad of ['item:gen/bubble-width/async-on', 'item:gen/tr2.bubble-width', 'item:tr2.bubble-width/async-on', 'item:gen/tr2.a/B']) expect(parseItemRef(bad)).toBeNull()
  })

  test('with no families named, looks in the registry', () => {
    const item = toySum.make(3, 2)
    expect(regradeItem(stored(item)).valid).toBe(false)
  })
})
