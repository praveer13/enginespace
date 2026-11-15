/*
 * W1-T05: what the page decides before anything is started (src/items/today/plan.ts): which of its four states it is in, when the next
 * prep is, the day an idea comes back after an answer, the tally, and the lines of the list as they are drawn.
 */
import { describe, expect, test } from 'bun:test'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { deriveCards } from '../../src/items/today/cards'
import { addDays } from '../../src/items/today/days'
import { afterReview, firstMemory, intervalOf } from '../../src/items/today/fsrs'
import { appKcsOfRef } from '../../src/items/today/kcs'
import { lineViews, nextServableDay, planFor, returnDay, servable, tally } from '../../src/items/today/plan'
import type { Result } from '../../src/items/today/plan'
import type { Line } from '../../src/items/today/session'
import { TestLedger } from './support'

const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
const TODAY = '2026-11-04'
const deck = (ledger: TestLedger, today = TODAY) => deriveCards(ledger.events, appKcsOfRef, today)

describe('the four states of the page', () => {
  test('is empty before anything is earned', () => {
    expect(planFor(deck(new TestLedger()), TODAY)).toEqual({ kind: 'empty' })
  })

  test('is unserved when what is earned has no ticket built: a card exists, and no family can serve it', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-30', 'tr1.small-engine-anatomy', 3)
    expect(planFor(deck(ledger), TODAY)).toEqual({ kind: 'unserved' })
  })

  test('is a list when something that can be served is due, with the session it would start', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-01', 'tr1.small-engine-anatomy', 3)
    const plan = planFor(deck(ledger), TODAY)
    expect(plan.kind).toBe('list')
    if (plan.kind !== 'list') return
    // The idea with no family is passed over without a word.
    expect(plan.session.lines.map((line) => line.kc)).toEqual([BUBBLE])
    expect(plan.session.mode).toBe('due')
    expect(plan.session.day).toBe(TODAY)
  })

  test('is a rest when what can be served is not due: it names the next prep and holds a review ahead', () => {
    const ledger = new TestLedger()
    ledger.review(TODAY, BUBBLE, 3)
    ledger.review(TODAY, OVERLAP, 4)
    const plan = planFor(deck(ledger), TODAY)
    expect(plan.kind).toBe('rest')
    if (plan.kind !== 'rest') return
    expect(plan.next).toBe(addDays(TODAY, 2))
    expect(plan.ahead.mode).toBe('ahead')
    expect(plan.ahead.lines.map((line) => line.kc).sort()).toEqual([OVERLAP, BUBBLE])
  })

  test('the next prep leaves out the ideas that cannot be served', () => {
    const ledger = new TestLedger()
    ledger.review(TODAY, 'tr1.small-engine-anatomy', 3)
    ledger.review(TODAY, OVERLAP, 4)
    // The unservable idea falls due in two days; the servable one in eight.
    expect(nextServableDay(deck(ledger), TODAY)).toBe(addDays(TODAY, 8))
    expect(servable({ kc: 'tr1.small-engine-anatomy', memory: firstMemory(3) })).toBe(false)
    expect(servable({ kc: OVERLAP, memory: firstMemory(3) })).toBe(true)
    expect(nextServableDay(deck(new TestLedger()), TODAY)).toBeNull()
  })

  test('takes the families it is given', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    expect(planFor(deck(ledger), TODAY, { families: [] })).toEqual({ kind: 'unserved' })
    expect(planFor(deck(ledger), TODAY, { families: [bubbleWidth] }).kind).toBe('list')
  })
})

describe('the day an idea comes back', () => {
  test('is the model\'s next interval from the card as it stood, counted from today', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-30', BUBBLE, 3)
    const card = deck(ledger).cards.get(BUBBLE)
    for (const grade of [1, 2, 3, 4] as const) {
      const expected = addDays(TODAY, intervalOf(afterReview(firstMemory(3), 5, grade)))
      expect(returnDay(card, TODAY, grade)).toBe(expected)
    }
  })

  test('a miss comes back sooner than a right answer, and an Easy one latest', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-30', BUBBLE, 3)
    const card = deck(ledger).cards.get(BUBBLE)
    const days = ([1, 3, 4] as const).map((grade) => returnDay(card, TODAY, grade))
    expect(days[0] <= days[1]).toBe(true)
    expect(days[1] < days[2]).toBe(true)
  })

  test('without a card it is tomorrow, and a day that steps back counts as the same day', () => {
    expect(returnDay(undefined, TODAY, 3)).toBe(addDays(TODAY, 1))
    const ledger = new TestLedger()
    ledger.review('2026-11-06', BUBBLE, 3)
    const card = deck(ledger, '2026-11-06').cards.get(BUBBLE)
    expect(returnDay(card, TODAY, 3)).toBe(addDays(TODAY, intervalOf(afterReview(firstMemory(3), 0, 3))))
  })
})

describe('the tally and the lines of the list', () => {
  const lines: Line[] = [
    { kc: BUBBLE, family: 'tr2.bubble-width', title: 'Bubble width', level: 2 },
    { kc: OVERLAP, family: 'tr2.bubble-width', title: 'Bubble width', level: 2 },
    { kc: 'tr2.graph-replay', family: 'tr2.graph-hit', title: 'Graph hit', level: 2 },
  ]
  const result = (line: Line, ok: boolean): Result => ({ line, ok, grade: ok ? 3 : 1, back: addDays(TODAY, ok ? 3 : 1), key: `k-${line.kc}` })

  test('counts the tickets that were checked and the ones that were right', () => {
    expect(tally([])).toEqual({ total: 0, right: 0 })
    expect(tally([{ ok: true }, { ok: false }, { ok: true }])).toEqual({ total: 3, right: 2 })
  })

  test('draws every line as waiting before the prep starts, and the first as now once it has', () => {
    expect(lineViews(lines, [], null).map((view) => view.state)).toEqual(['waiting', 'waiting', 'waiting'])
    expect(lineViews(lines, [], 0).map((view) => view.state)).toEqual(['now', 'waiting', 'waiting'])
  })

  test('a line with a result is done, with what became of it, and the next is now', () => {
    const views = lineViews(lines, [result(lines[0], true), result(lines[1], false)], 2)
    expect(views.map((view) => view.state)).toEqual(['done', 'done', 'now'])
    expect(views[0]).toEqual({ kc: BUBBLE, title: 'Bubble width', state: 'done', ok: true, back: addDays(TODAY, 3) })
    expect(views[1]).toMatchObject({ state: 'done', ok: false, back: addDays(TODAY, 1) })
    expect(views[2]).toEqual({ kc: 'tr2.graph-replay', title: 'Graph hit', state: 'now' })
  })

  test('at the close of a prep every line is done', () => {
    const views = lineViews(lines, lines.map((line) => result(line, true)), null)
    expect(views.every((view) => view.state === 'done')).toBe(true)
  })
})
