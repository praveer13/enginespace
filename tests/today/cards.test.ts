/*
 * W1-T05: the deck that Today reads from the ledger (src/items/today/cards.ts). What earns a card, what reschedules it, what is due
 * and when, and the welcome-back after a gap. The memory is checked against the vendored model called directly, so the replay is
 * held to the model and not to itself; tests/today/golden.test.ts holds a whole month to a fixture.
 */
import { describe, expect, test } from 'bun:test'
import { addDays, daysBetween } from '../../src/items/today/days'
import { aheadCards, deriveCards, dueCards, earns, nextDueDay, ratingOfEvent, recallOn } from '../../src/items/today/cards'
import type { Card } from '../../src/items/today/cards'
import { intervalDays, nextMemory } from '../../vendor/kernelspace/src/lib/learner/fsrs'
import { GAP_DAYS, SESSION_CAP_ITEMS, SPREAD_DAYS } from '../../src/items/today/limits'
import { appKcsOfRef, kcsOfRef } from '../../src/items/today/kcs'
import type { KcSources } from '../../src/items/today/kcs'
import { TestLedger } from './support'

const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
const TODAY = '2026-11-04'
const deck = (ledger: TestLedger, today = TODAY, options = {}) => deriveCards(ledger.events, appKcsOfRef, today, options)
const card = (ledger: TestLedger, kc: string, today = TODAY): Card => {
  const found = deck(ledger, today).cards.get(kc)
  if (found === undefined) throw new Error(`no card for ${kc}`)
  return found
}

describe('what earns a card', () => {
  test('a pass at full weight earns the KCs of its variant, and the card is due as many days later as a first Good review says: two', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off')
    const set = deck(ledger)
    expect([...set.cards.keys()]).toEqual([BUBBLE])
    const earned = set.cards.get(BUBBLE) as Card
    expect(earned).toMatchObject({ earnedDay: '2026-11-01', lastDay: '2026-11-01', dueDay: '2026-11-03', reps: 1, lapses: 0 })
    expect(earned.memory).toEqual(nextMemory(null, 0, 3))
  })

  test('the earning event is the first review, graded by the tap: a guess is Hard (a day) and sure is Easy (eight days)', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off', { conf: 'guess' })
    ledger.item('2026-11-01', 'async-on', { conf: 'sure' })
    expect(card(ledger, BUBBLE).dueDay).toBe('2026-11-02')
    expect(card(ledger, OVERLAP).dueDay).toBe('2026-11-09')
  })

  test('an item that assesses two KCs earns both', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'close-it')
    expect([...deck(ledger).cards.keys()].sort()).toEqual([OVERLAP, BUBBLE])
  })

  test('a miss, a practice pass, an assisted pass and a prediction earn nothing; nor does an event whose ref names no KC', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off', { ok: false })
    ledger.item('2026-11-01', 'async-off', { provenance: 'practice' })
    ledger.item('2026-11-01', 'async-off', { provenance: 'assisted' })
    ledger.item('2026-11-01', 'async-off', { provenance: 'self-reported' })
    ledger.predict('2026-11-01', 'tr2.l3', 'tr2.l3.p1')
    // A family that no registry has: the ref is well formed, and names no KC.
    ledger.item('2026-11-01', 'async-on', {}, 9, 'tr8.unknown')
    expect(deck(ledger).cards.size).toBe(0)
  })

  test('a proved result and a verified one earn as an unseen one does; a review that passed earns too', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', 'tr1.five-mechanisms', 3)
    ledger.review('2026-11-01', 'tr1.vllm-lifecycle', 3, { provenance: 'proved' })
    expect([...deck(ledger).cards.keys()].sort()).toEqual(['tr1.five-mechanisms', 'tr1.vllm-lifecycle'])
  })

  test('only a result at weight 1 earns', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off')
    const [event] = ledger.events
    if (event.kind !== 'item') throw new Error('expected an item')
    expect(earns(event)).toBe(true)
    expect(earns({ ...event, provenance: 'practice' })).toBe(false)
    expect(earns({ ...event, ok: false })).toBe(false)
  })

  test('an empty ledger is an empty deck, with no last day and no welcome-back', () => {
    const set = deriveCards([], appKcsOfRef, TODAY)
    expect(set.cards.size).toBe(0)
    expect(set.lastGradedDay).toBeNull()
    expect(set.welcomeBack).toBe(false)
  })
})

describe('what reschedules it', () => {
  test('a review three days later is graded by the model, and the card is due that many days after the review', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-04', BUBBLE, 4)
    const first = nextMemory(null, 0, 3)
    const second = nextMemory(first, 3, 4)
    expect(card(ledger, BUBBLE)).toMatchObject({ memory: second, lastDay: '2026-11-04', dueDay: addDays('2026-11-04', intervalDays(second.stability)), reps: 2, lapses: 0 })
  })

  test('a miss is Again: the idea is due again soon, and it counts as a lapse', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-04', BUBBLE, 1)
    const got = card(ledger, BUBBLE)
    expect(got.lapses).toBe(1)
    expect(got.memory).toEqual(nextMemory(nextMemory(null, 0, 3), 3, 1))
    expect(daysBetween('2026-11-04', got.dueDay)).toBe(intervalDays(got.memory.stability))
    expect(daysBetween('2026-11-04', got.dueDay)).toBeLessThanOrEqual(2)
  })

  test('a second review on the same day is the model\'s short-term step, not a gap of a day', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-01', BUBBLE, 3, {}, 15)
    expect(card(ledger, BUBBLE).memory).toEqual(nextMemory(nextMemory(null, 0, 3), 0, 3))
  })

  test('a result from a lesson or a game reschedules a card as a review does, graded from its answer', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off')
    ledger.item('2026-11-03', 'async-off', { conf: 'sure' })
    expect(card(ledger, BUBBLE).memory).toEqual(nextMemory(nextMemory(null, 0, 3), 2, 4))
    ledger.item('2026-11-04', 'async-off', { ok: false })
    expect(card(ledger, BUBBLE).lapses).toBe(1)
  })

  test('a review event\'s own grade is the one used, whatever its tap says', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    const grade4 = ledger.review('2026-11-02', BUBBLE, 4, { conf: 'think' })
    if (grade4.kind !== 'review') throw new Error('expected a review')
    expect(ratingOfEvent(grade4)).toBe(4)
    expect(card(ledger, BUBBLE).memory).toEqual(nextMemory(nextMemory(null, 0, 3), 1, 4))
  })

  test('help past the hints, a receipt that failed and a figure typed without a check are not retrieval, and move nothing', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    const before = card(ledger, BUBBLE)
    ledger.review('2026-11-02', BUBBLE, 1, { provenance: 'assisted' })
    ledger.review('2026-11-02', BUBBLE, 1, { provenance: 'self-reported' })
    ledger.review('2026-11-02', BUBBLE, 1, { provenance: 'gpu-unverified' })
    expect(card(ledger, BUBBLE)).toEqual(before)
  })

  test('a practice result reschedules a card that exists, and a prediction too, although neither could earn it', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-03', BUBBLE, 3, { provenance: 'practice' })
    expect(card(ledger, BUBBLE).reps).toBe(2)
    const sources: KcSources = { variant: () => [], game: () => [] }
    const withPrediction = new TestLedger()
    withPrediction.review('2026-11-01', BUBBLE, 3)
    withPrediction.predict('2026-11-03', 'tr2.l3', 'tr2.l3.p1')
    const resolve = (ref: string) => (ref.startsWith('predict:') ? [BUBBLE] : kcsOfRef(ref, sources))
    expect(deriveCards(withPrediction.events, resolve, TODAY).cards.get(BUBBLE)?.reps).toBe(2)
  })

  test('an event that names no KC moves no card but is graded work for the gap', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-01', BUBBLE, 3)
    ledger.write('2026-11-03', { kind: 'trace-mark', ref: 'trace:steploop/gap', score: 1, ok: true, provenance: 'unseen', data: { marks: [], error: 0 } })
    const set = deck(ledger)
    expect(set.cards.get(BUBBLE)?.reps).toBe(1)
    expect(set.lastGradedDay).toBe('2026-11-03')
    expect(set.welcomeBack).toBe(false)
  })

  test('is a function of the events: their order and a repeat of one change nothing, and the events are not touched', () => {
    const ledger = new TestLedger()
    ledger.item('2026-10-20', 'async-off')
    ledger.item('2026-10-21', 'async-on', { conf: 'guess' })
    ledger.review('2026-10-23', BUBBLE, 3)
    ledger.review('2026-10-30', OVERLAP, 1)
    ledger.review('2026-10-30', BUBBLE, 4, {}, 14)
    const events = ledger.events
    const frozen = JSON.stringify(events)
    const plain = deriveCards(events, appKcsOfRef, TODAY)
    const shuffled = deriveCards([...events].reverse().concat(events[2], events[0]), appKcsOfRef, TODAY)
    expect([...shuffled.cards]).toEqual([...plain.cards])
    expect(JSON.stringify(events)).toBe(frozen)
  })
})

describe('what is due', () => {
  test('an idea is due on its due day and after, and not before; the next due day is the earliest one that is still to come', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.review('2026-11-01', OVERLAP, 4)
    // Graded work on the 8th keeps the days after it from being a welcome-back, which orders the ideas another way.
    ledger.review('2026-11-08', 'tr2.graph-replay', 3)
    const at = (day: string) => dueCards(deck(ledger, day), day).map((c) => c.kc)
    expect(at('2026-11-02')).toEqual([])
    expect(at('2026-11-03')).toEqual([BUBBLE])
    expect(at('2026-11-08')).toEqual([BUBBLE])
    // On the 9th the Good review is five days past its due day and the Easy one is on it: the lower recall comes first.
    expect(at('2026-11-09')).toEqual([BUBBLE, OVERLAP])
    expect(recallOn(card(ledger, BUBBLE, '2026-11-09'), '2026-11-09')).toBeLessThan(recallOn(card(ledger, OVERLAP, '2026-11-09'), '2026-11-09'))
    expect(nextDueDay(deck(ledger, '2026-11-02'), '2026-11-02')).toBe('2026-11-03')
    expect(nextDueDay(deck(ledger, '2026-11-03'), '2026-11-03')).toBe('2026-11-09')
    expect(nextDueDay(deck(ledger, '2026-11-20'), '2026-11-20')).toBeNull()
  })

  test('the lowest predicted recall comes first, then the id', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-01', 'tr2.graph-replay', 3)
    ledger.review('2026-10-10', BUBBLE, 3)
    ledger.review('2026-10-10', OVERLAP, 3)
    const order = dueCards(deck(ledger), TODAY).map((c) => c.kc)
    // The one reviewed longest ago has had the longest to fade; the other two are equal and so go by the id.
    expect(order).toEqual(['tr2.graph-replay', OVERLAP, BUBBLE])
    const recalls = dueCards(deck(ledger), TODAY).map((c) => recallOn(c, TODAY))
    expect([...recalls].sort((a, b) => a - b)).toEqual(recalls)
  })

  test('what is not due, the nearest to fading first, is what a review ahead serves', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 4)
    ledger.review('2026-11-03', OVERLAP, 4)
    ledger.review('2026-11-04', 'tr2.graph-replay', 3)
    expect(dueCards(deck(ledger), TODAY)).toEqual([])
    expect(aheadCards(deck(ledger), TODAY).map((c) => c.kc)).toEqual([BUBBLE, OVERLAP, 'tr2.graph-replay'])
  })
})

describe('welcome back', () => {
  const kcs = ['tr2.bubble', 'tr2.async-overlap', 'tr2.graph-replay', 'tr2.capture-padding', 'tr2.graph-modes']

  test('a gap of seven days makes the day a welcome-back, and six does not', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-20', BUBBLE, 3)
    expect(GAP_DAYS).toBe(7)
    expect(deck(ledger, '2026-10-26').welcomeBack).toBe(false)
    expect(deck(ledger, '2026-10-27').welcomeBack).toBe(true)
    expect(deck(ledger, '2026-12-01').welcomeBack).toBe(true)
  })

  test('the ideas beyond one session\'s worth wait their turn over fourteen days, the sturdiest staying due', () => {
    const ledger = new TestLedger()
    // Stabilities rise with the first grade: Easy 8.3 days, Good 2.3, Hard 1.3. Equal ones go by recall, which is equal, and then by id.
    kcs.forEach((kc, index) => ledger.review('2026-10-01', kc, ([4, 3, 3, 2, 2] as const)[index]))
    const set = deriveCards(ledger.events, appKcsOfRef, '2026-10-21', { capacity: 2 })
    expect(set.welcomeBack).toBe(true)
    const due = dueCards(set, '2026-10-21')
    expect(due.map((c) => c.kc)).toEqual([kcs[0], kcs[1]])
    expect(due.every((c) => c.dueDay <= '2026-10-21')).toBe(true)
    const waiting = kcs.slice(2).map((kc) => set.cards.get(kc) as Card)
    for (const c of waiting) {
      expect(c.dueDay > '2026-10-21').toBe(true)
      expect(daysBetween('2026-10-21', c.dueDay)).toBeLessThanOrEqual(SPREAD_DAYS)
    }
    // Three ideas over fourteen days land on 1, 5 and 10 days after the return (floor(i × 14 ÷ 3)): different days, not one wall.
    expect(new Set(waiting.map((c) => c.dueDay)).size).toBe(3)
  })

  test('the spread does not move when the learner returns: the same deck whether they have answered yet or not', () => {
    const ledger = new TestLedger()
    kcs.forEach((kc) => ledger.review('2026-10-01', kc, 3))
    const open = deriveCards(ledger.events, appKcsOfRef, '2026-10-21', { capacity: 2 })
    const kept = open.cards.get(kcs[0]) as Card
    // The first graded work after the gap is on the return day, and it reviews one of the ideas that stayed due.
    const returned = new TestLedger()
    kcs.forEach((kc) => returned.review('2026-10-01', kc, 3))
    returned.review('2026-10-21', kept.kc, 3, {}, 10)
    const after = deriveCards(returned.events, appKcsOfRef, '2026-10-22', { capacity: 2 })
    expect(after.welcomeBack).toBe(false)
    for (const kc of kcs) {
      if (kc === kept.kc) continue
      expect(after.cards.get(kc)?.dueDay).toBe(open.cards.get(kc)?.dueDay as string)
    }
  })

  test('counts only the ideas that can be served: a card no family serves takes no place in the set and is left as it is', () => {
    const ledger = new TestLedger()
    // The first two are the sturdiest, and have no ticket; the next three can be served.
    ledger.review('2026-10-01', 'tr1.five-mechanisms', 4)
    ledger.review('2026-10-01', 'tr1.vllm-lifecycle', 4)
    for (const kc of [BUBBLE, OVERLAP, 'tr2.graph-replay']) ledger.review('2026-10-01', kc, 3)
    const servable = (card: { kc: string }) => card.kc.startsWith('tr2.')
    const counted = deriveCards(ledger.events, appKcsOfRef, '2026-10-21', { capacity: 2, servable })
    // Two places, and both go to ideas that can be served; the third waits, and the two without a ticket are untouched.
    expect(dueCards(counted, '2026-10-21').filter((c) => servable(c)).map((c) => c.kc)).toHaveLength(2)
    expect(counted.cards.get('tr1.five-mechanisms')?.dueDay).toBe(addDays('2026-10-01', 8))
    expect(counted.cards.get('tr1.vllm-lifecycle')?.dueDay).toBe(addDays('2026-10-01', 8))
    const waiting = [BUBBLE, OVERLAP, 'tr2.graph-replay'].map((kc) => counted.cards.get(kc) as Card).filter((c) => c.dueDay > '2026-10-21')
    expect(waiting).toHaveLength(1)
    // Without the predicate the two unserved ideas would have taken the places, and all three served ones would have waited.
    const naive = deriveCards(ledger.events, appKcsOfRef, '2026-10-21', { capacity: 2 })
    const naiveWaiting = [BUBBLE, OVERLAP, 'tr2.graph-replay'].map((kc) => naive.cards.get(kc) as Card).filter((c) => c.dueDay > '2026-10-21')
    expect(naiveWaiting).toHaveLength(3)
  })

  test('with fewer overdue ideas than a session holds, nothing waits', () => {
    const ledger = new TestLedger()
    kcs.forEach((kc) => ledger.review('2026-10-01', kc, 3))
    const set = deriveCards(ledger.events, appKcsOfRef, '2026-10-21')
    expect(SESSION_CAP_ITEMS).toBeGreaterThanOrEqual(kcs.length)
    expect(dueCards(set, '2026-10-21')).toHaveLength(kcs.length)
  })

  test('a welcome-back serves the sturdiest ideas that have slipped furthest first, not the lowest recall', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-01', 'tr2.graph-replay', 2)
    ledger.review('2026-10-01', BUBBLE, 4)
    ledger.review('2026-10-01', OVERLAP, 3)
    const set = deriveCards(ledger.events, appKcsOfRef, '2026-10-30')
    expect(dueCards(set, '2026-10-30').map((c) => c.kc)).toEqual([BUBBLE, OVERLAP, 'tr2.graph-replay'])
  })
})
