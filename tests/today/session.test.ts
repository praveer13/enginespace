/*
 * W1-T05: the list that a session works through (src/items/today/session.ts): what it holds and in what order, how long it may be,
 * which level and which family serve an idea, the interleave inside a confusable set, the welcome-back and the review ahead. The list is
 * as long as the session and says nothing of how much more is due: ASSESSMENT §8, "never an overdue count".
 */
import { describe, expect, test } from 'bun:test'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { stepOrder } from '@es/play/items/families/tr2/step-order'
import type { Gen } from '@es/play/items'
import { deriveCards } from '../../src/items/today/cards'
import { familiesAt, familyFor, levelFor } from '../../src/items/today/draw'
import { appKcsOfRef } from '../../src/items/today/kcs'
import { AHEAD_ITEMS, NOMINAL_ITEM_SECONDS, SESSION_CAP_ITEMS, SESSION_CAP_MINUTES, TRANSFER_STABILITY_DAYS } from '../../src/items/today/limits'
import { composeSession, confusableGroups, interleaveConfusable, minutesOf, nominalSeconds } from '../../src/items/today/session'
import { toy, toySum } from '../play/items-support.ts'
import { TestLedger } from './support'

const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
const TODAY = '2026-11-04'
const nothing = (): never => {
  throw new Error('this family is only asked what it offers')
}
/** A family that offers one variant for one KC at the given levels, and cannot make an item. */
const offering = (id: string, kc: string, levels: (0 | 1 | 2 | 3)[]): Gen => toy({ id, variants: [{ id: 'v', title: 'V', kcs: [kc], levels }], make: nothing })

/** A ledger that has earned `kcs` on `day`, each with a Good review: due two days on, and a day or two before TODAY, so it is no welcome-back. */
function earned(kcs: readonly string[], day = '2026-11-01'): TestLedger {
  const ledger = new TestLedger()
  for (const kc of kcs) ledger.review(day, kc, 3)
  return ledger
}

describe('the length of a session', () => {
  test('is at most 12 nominal minutes: a full one is 14 tickets, 700 nominal seconds, which is inside 10 to 12 minutes [estimated]', () => {
    expect(SESSION_CAP_MINUTES).toBe(12)
    expect(SESSION_CAP_ITEMS).toBe(14)
    const seconds = SESSION_CAP_ITEMS * NOMINAL_ITEM_SECONDS
    expect(seconds).toBeGreaterThanOrEqual(10 * 60)
    expect(seconds).toBeLessThanOrEqual(12 * 60)
    expect(nominalSeconds(SESSION_CAP_ITEMS)).toBe(seconds)
    expect(minutesOf(seconds)).toBe(12)
  })

  test('takes the first fourteen ideas that are due and no more, however many there are, and the list does not say how many were left', () => {
    const family = (n: number) => offering(`tr2.f${n}`, `tr2.k${n}`, [2])
    const kcs = Array.from({ length: 40 }, (_, n) => `tr2.k${n}`)
    const set = deriveCards(earned(kcs).events, appKcsOfRef, TODAY)
    const session = composeSession(set, TODAY, { families: kcs.map((_, n) => family(n)) })
    expect(session.lines).toHaveLength(SESSION_CAP_ITEMS)
    expect(session.seconds).toBe(700)
    expect(session.mode).toBe('due')
    expect(JSON.stringify(session)).not.toMatch(/\b(?:40|26|overdue|behind|backlog|left)\b/)
  })

  test('is as long as what is due when less is due, and an idea no family serves yet costs nothing and is not mentioned', () => {
    const set = deriveCards(earned([BUBBLE, OVERLAP, 'tr1.small-engine-anatomy', 'tr5a.kv-groups']).events, appKcsOfRef, TODAY)
    const session = composeSession(set, TODAY)
    expect(session.lines.map((line) => line.kc).sort()).toEqual([OVERLAP, BUBBLE])
    expect(session.seconds).toBe(2 * NOMINAL_ITEM_SECONDS)
    expect(JSON.stringify(session)).not.toContain('tr1.small-engine-anatomy')
  })

  test('is empty when nothing is due, or nothing that is due can be served', () => {
    expect(composeSession(deriveCards([], appKcsOfRef, TODAY), TODAY).lines).toEqual([])
    const justNow = earned([BUBBLE], '2026-11-04')
    expect(composeSession(deriveCards(justNow.events, appKcsOfRef, TODAY), TODAY).lines).toEqual([])
    const unservable = earned(['tr1.small-engine-anatomy'])
    const session = composeSession(deriveCards(unservable.events, appKcsOfRef, TODAY), TODAY)
    expect(session.lines).toEqual([])
    expect(session.seconds).toBe(0)
    expect(minutesOf(0)).toBe(0)
  })

  test('says "about N min" with the minutes rounded up, and at least one for a list that is not empty', () => {
    expect(minutesOf(50)).toBe(1)
    expect(minutesOf(60)).toBe(1)
    expect(minutesOf(61)).toBe(2)
    expect(minutesOf(100)).toBe(2)
    expect(minutesOf(700)).toBe(12)
  })
})

describe('the order', () => {
  test('serves the idea with the lowest predicted recall first', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-25', BUBBLE, 3)
    ledger.review('2026-10-10', OVERLAP, 3)
    const session = composeSession(deriveCards(ledger.events, appKcsOfRef, TODAY), TODAY)
    expect(session.lines.map((line) => line.kc)).toEqual([OVERLAP, BUBBLE])
  })

  test('names the family and the title that will serve each line, and the level', () => {
    // An idea that one family assesses is served by it.
    const alone = deriveCards(earned([OVERLAP]).events, appKcsOfRef, TODAY)
    expect(composeSession(alone, TODAY).lines).toEqual([{ kc: OVERLAP, family: 'tr2.bubble-width', title: bubbleWidth.title, level: 2 }])
    // Two families assess the bubble (bubble-width, and the first lesson's step-order); they take turns by the reviews the card has had.
    const once = deriveCards(earned([BUBBLE]).events, appKcsOfRef, TODAY)
    expect(composeSession(once, TODAY).lines).toEqual([{ kc: BUBBLE, family: 'tr2.step-order', title: stepOrder.title, level: 2 }])
    const ledger = earned([BUBBLE], '2026-10-20')
    ledger.review('2026-10-22', BUBBLE, 3)
    const twice = deriveCards(ledger.events, appKcsOfRef, TODAY)
    expect(composeSession(twice, TODAY).lines).toEqual([{ kc: BUBBLE, family: 'tr2.bubble-width', title: bubbleWidth.title, level: 2 }])
  })

  test('is a welcome-back after a gap, and then serves the sturdiest ideas first', () => {
    const ledger = new TestLedger()
    ledger.review('2026-10-01', BUBBLE, 3)
    ledger.review('2026-10-01', OVERLAP, 4)
    const session = composeSession(deriveCards(ledger.events, appKcsOfRef, TODAY), TODAY)
    expect(session.mode).toBe('welcome-back')
    expect(session.lines.map((line) => line.kc)).toEqual([OVERLAP, BUBBLE])
  })

  test('is the same list whenever it is composed, and does not change its input', () => {
    const set = deriveCards(earned([BUBBLE, OVERLAP]).events, appKcsOfRef, TODAY)
    const before = JSON.stringify([...set.cards])
    expect(composeSession(set, TODAY)).toEqual(composeSession(set, TODAY))
    expect(JSON.stringify([...set.cards])).toBe(before)
  })
})

describe('the level and the family', () => {
  const memory = (stability: number) => ({ stability, difficulty: 5 })

  test('an idea is served on its own until its memory is sturdy, and then on a changed surface where the family offers one', () => {
    expect(levelFor({ kc: BUBBLE, memory: memory(TRANSFER_STABILITY_DAYS - 1) }, [bubbleWidth])).toBe(2)
    expect(levelFor({ kc: BUBBLE, memory: memory(TRANSFER_STABILITY_DAYS) }, [bubbleWidth])).toBe(3)
    expect(TRANSFER_STABILITY_DAYS).toBe(21)
  })

  test('falls back to the level the family does offer, and to none when it offers neither (levels 0 and 1 are for learning, not keeping)', () => {
    const only2 = offering('tr2.only-two', BUBBLE, [2])
    const only3 = offering('tr2.only-three', BUBBLE, [3])
    const early = offering('tr2.early', BUBBLE, [0, 1])
    expect(levelFor({ kc: BUBBLE, memory: memory(100) }, [only2])).toBe(2)
    expect(levelFor({ kc: BUBBLE, memory: memory(1) }, [only3])).toBe(3)
    expect(levelFor({ kc: BUBBLE, memory: memory(1) }, [early])).toBeNull()
    expect(levelFor({ kc: 'tr9.none', memory: memory(1) }, [bubbleWidth])).toBeNull()
  })

  test('the families that serve a KC are those with a variant that assesses it at that level', () => {
    expect(familiesAt(OVERLAP, 2, [bubbleWidth, toySum]).map((gen) => gen.id)).toEqual(['tr2.bubble-width', 'tr2.toy-sum'])
    expect(familiesAt(BUBBLE, 2, [bubbleWidth, toySum]).map((gen) => gen.id)).toEqual(['tr2.bubble-width', 'tr2.toy-sum'])
    expect(familiesAt('tr2.graph-replay', 2, [bubbleWidth, toySum])).toEqual([])
    expect(familiesAt(BUBBLE, 0, [toySum]).map((gen) => gen.id)).toEqual(['tr2.toy-sum'])
    expect(familiesAt(OVERLAP, 0, [toySum])).toEqual([])
  })

  test('families take turns by the number of reviews the card has had, so the choice is read from the ledger and spends no entropy', () => {
    const families = [bubbleWidth, toySum]
    expect(familyFor({ kc: BUBBLE, reps: 1 }, 2, families)?.id).toBe('tr2.toy-sum')
    expect(familyFor({ kc: BUBBLE, reps: 2 }, 2, families)?.id).toBe('tr2.bubble-width')
    expect(familyFor({ kc: BUBBLE, reps: 3 }, 2, families)?.id).toBe('tr2.toy-sum')
    expect(familyFor({ kc: 'tr9.none', reps: 1 }, 2, families)).toBeNull()
  })
})

describe('interleaving', () => {
  const line = (kc: string, n = 0) => ({ kc, n })
  const groups = new Map([
    ['b', 'g'],
    ['c', 'g'],
  ])
  const order = (lines: readonly { kc: string; n: number }[]) => lines.map((l) => `${l.kc}${l.n}`).join(' ')

  test('puts the ideas of one confusable set side by side, at the place of the first, and leaves the others where they are', () => {
    expect(order(interleaveConfusable([line('a'), line('b'), line('x'), line('c'), line('y')], groups))).toBe('a0 b0 c0 x0 y0')
  })

  test('alternates them (b c b c) when every idea of the set has at least two lines, and keeps each idea together otherwise', () => {
    expect(order(interleaveConfusable([line('b', 1), line('x'), line('b', 2), line('c', 1), line('c', 2)], groups))).toBe('b1 c1 b2 c2 x0')
    expect(order(interleaveConfusable([line('b', 1), line('b', 2), line('c', 1)], groups))).toBe('b1 b2 c1')
  })

  test('never mixes ideas of different sets, or of none', () => {
    const two = new Map([...groups, ['p', 'h'], ['q', 'h']])
    expect(order(interleaveConfusable([line('p'), line('b'), line('q'), line('c')], two))).toBe('p0 q0 b0 c0')
  })

  test('with no sets the list is unchanged, and the composer takes the sets as it is given them', () => {
    const lines = [line('a'), line('b'), line('c')]
    expect(interleaveConfusable(lines, new Map())).toEqual(lines)
    const ledger = earned([BUBBLE, OVERLAP, 'tr2.graph-replay'])
    const families = [bubbleWidth, offering('tr2.gr', 'tr2.graph-replay', [2])]
    const set = deriveCards(ledger.events, appKcsOfRef, TODAY)
    const plain = composeSession(set, TODAY, { families }).lines.map((l) => l.kc)
    const grouped = composeSession(set, TODAY, { families, groupOf: new Map([[OVERLAP, 'x'], ['tr2.graph-replay', 'x']]) }).lines.map((l) => l.kc)
    expect([...grouped].sort()).toEqual([...plain].sort())
    expect(Math.abs(grouped.indexOf(OVERLAP) - grouped.indexOf('tr2.graph-replay'))).toBe(1)
  })
})

describe('the confusable sets of a KC graph', () => {
  test('are the connected groups the confusable edges link, each named by the least of its ids, and a KC in none is absent', () => {
    const groups = confusableGroups([
      { id: 'tr2.async-overlap', confusable: ['tr2.graph-replay', 'tr2.mrv2-delta'] },
      { id: 'tr2.graph-replay', confusable: ['tr2.async-overlap'] },
      { id: 'tr2.mrv2-delta', confusable: ['tr2.async-overlap'] },
      { id: 'tr2.graph-modes', confusable: ['tr2.dispatch-keys'] },
      { id: 'tr2.dispatch-keys', confusable: ['tr2.graph-modes'] },
      { id: 'tr2.bubble' },
    ])
    expect(groups.get('tr2.async-overlap')).toBe('tr2.async-overlap')
    expect(groups.get('tr2.graph-replay')).toBe('tr2.async-overlap')
    expect(groups.get('tr2.mrv2-delta')).toBe('tr2.async-overlap')
    // The set is named by the least of its ids, and `dispatch-keys` sorts before `graph-modes`.
    expect(groups.get('tr2.graph-modes')).toBe('tr2.dispatch-keys')
    expect(groups.get('tr2.dispatch-keys')).toBe(groups.get('tr2.graph-modes'))
    expect(groups.has('tr2.bubble')).toBe(false)
    expect(new Set(groups.values()).size).toBe(2)
  })

  test('an edge from one side only still joins both KCs, and a chain of edges is one set', () => {
    const groups = confusableGroups([{ id: 'a.x', confusable: ['b.y'] }, { id: 'b.y', confusable: ['c.z'] }, { id: 'c.z' }])
    expect(groups.get('a.x')).toBe(groups.get('b.y'))
    expect(groups.get('b.y')).toBe(groups.get('c.z'))
    expect(confusableGroups([]).size).toBe(0)
  })
})

describe('reviewing ahead', () => {
  test('serves the ideas that are not due, the nearest to fading first, five at most [estimated]', () => {
    const kcs = Array.from({ length: 8 }, (_, n) => `tr2.k${n}`)
    const ledger = new TestLedger()
    kcs.forEach((kc, n) => ledger.review(`2026-11-0${(n % 3) + 2}`, kc, 4))
    const families = kcs.map((kc, n) => offering(`tr2.f${n}`, kc, [2]))
    const set = deriveCards(ledger.events, appKcsOfRef, TODAY)
    const session = composeSession(set, TODAY, { ahead: true, families })
    expect(AHEAD_ITEMS).toBe(5)
    expect(session.mode).toBe('ahead')
    expect(session.lines).toHaveLength(5)
    // Nothing is due, so the ideas reviewed earliest have had the longest to fade.
    expect(session.lines.slice(0, 3).map((l) => l.kc).sort()).toEqual(['tr2.k0', 'tr2.k3', 'tr2.k6'])
  })

  test('is empty when there is no idea to look at beyond what is due', () => {
    const set = deriveCards(earned([BUBBLE]).events, appKcsOfRef, TODAY)
    expect(composeSession(set, TODAY, { ahead: true }).lines).toEqual([])
  })
})
