/*
 * W1-T06: what the map works out before it draws (src/map/summary.ts), and the words it prints (src/map/copy.ts,
 * src/games/specials/copy.ts). The copy holds no number that no tag covers: the page's own numbers come from the course and the ledger
 * through the dot matrix, each with its provenance, as the front page's do.
 */
import { describe, expect, test } from 'bun:test'
import { untaggedNumbers } from '../../scripts/content/prose'
import { specialsCopy, SPECIALS } from '@/games/specials/copy'
import { mapCopy, MAP } from '@/map/copy'
import { decimalsOf, formatHours, holdingOf, laneTotals, lanesOf, LANE_ORDER, lessonCounts, needsWords, outcomeClause, printedId } from '@/map/summary'
import { INDEX } from './support'

describe('the hours of the course by lane', () => {
  test('are the modules\' hours added up, and add up to the course\'s total', () => {
    const totals = laneTotals(INDEX.modules)
    expect(totals).toEqual({ B: 53.5, L: 3, F: 34.5 })
    expect(totals.B + totals.L + totals.F).toBe(INDEX.totalHours)
  })

  test('are zero for a lane no module works in, and nothing for an empty course', () => {
    expect(laneTotals([{ hours_by_lane: { B: 2 } }])).toEqual({ B: 2, L: 0, F: 0 })
    expect(laneTotals([])).toEqual({ B: 0, L: 0, F: 0 })
  })
})

describe('a module\'s lanes', () => {
  test('come in the architecture\'s order, whatever order the file wrote them in, and leave out a lane with no hours', () => {
    expect(LANE_ORDER).toEqual(['B', 'L', 'F'])
    expect(lanesOf({ hours_by_lane: { F: 2.5, B: 7.5 } })).toEqual([
      { lane: 'B', hours: 7.5 },
      { lane: 'F', hours: 2.5 },
    ])
    expect(lanesOf({ hours_by_lane: { B: 4, L: 0 } })).toEqual([{ lane: 'B', hours: 4 }])
  })
})

describe('how a number and an id are printed', () => {
  test.each([
    [10, 0],
    [7.5, 1],
    [0.5, 1],
    [91, 0],
  ])('%p hours takes %p digits after the point', (hours, digits) => {
    expect(decimalsOf(hours)).toBe(digits)
  })

  test.each([
    ['tr0', 'TR0'],
    ['tr5a', 'TR5a'],
    ['tr8', 'TR8'],
    ['capstone', 'capstone'],
  ])('%s is printed %s', (id, printed) => {
    expect(printedId(id)).toBe(printed)
  })
})

describe('what a module holds', () => {
  test('is the earned count, what is practised and not yet earned, and what is kept', () => {
    expect(holdingOf({ total: 11, practised: 5, earned: 3, kept: 1 })).toEqual({ total: 11, earned: 3, practising: 2, kept: 1 })
    expect(holdingOf({ total: 0, practised: 0, earned: 0, kept: 0 })).toEqual({ total: 0, earned: 0, practising: 0, kept: 0 })
  })
})

describe('the copy', () => {
  test('of the map holds no number that no tag covers', () => {
    expect(mapCopy().length).toBeGreaterThan(30)
    expect(mapCopy().flatMap((text) => untaggedNumbers(text))).toEqual([])
    expect(MAP.title).toBe('Course')
  })

  test('of the Play index holds no such number either, and names the board', () => {
    expect(specialsCopy().length).toBeGreaterThan(8)
    expect(specialsCopy().flatMap((text) => untaggedNumbers(text))).toEqual([])
    expect(SPECIALS.title).toBe('Games')
    expect(SPECIALS.poster.none).toBe('No picture yet')
  })

  test('reads in the words the architecture uses: the three lanes, and the four states', () => {
    expect(MAP.needs.only).toEqual({ B: 'browser only', L: 'laptop only', F: 'GPU only' })
    expect(MAP.needs.in).toEqual({ B: 'in the browser', L: 'on a laptop', F: 'on a GPU' })
    expect(MAP.state.skills(2, 11)).toBe('2 of 11 skills passed')
  })
})

describe('what a module needs, in words', () => {
  const needs = (hours: number, hours_by_lane: { B?: number; L?: number; F?: number }) => needsWords({ hours, hours_by_lane }, MAP.needs)

  test('one lane is "only", and several are the hours of each, in the architecture\'s order', () => {
    expect(needs(10, { B: 10 })).toBe('10 h, browser only')
    expect(needs(12, { F: 12 })).toBe('12 h, GPU only')
    expect(needs(10, { F: 2.5, B: 7.5 })).toBe('10 h: 7.5 h in the browser, then 2.5 h on a GPU')
    expect(needs(12, { F: 6, L: 2, B: 4 })).toBe('12 h: 4 h in the browser, then 2 h on a laptop, then 6 h on a GPU')
  })

  test('an hour count is whole or a half, and a lesson count reads from the states', () => {
    expect(formatHours(10)).toBe('10')
    expect(formatHours(7.5)).toBe('7.5')
    expect(lessonCounts([{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Map([['a', 'done'], ['b', 'started']]))).toEqual({ total: 3, done: 1 })
  })

  test('an outcome continues "You will be able to": its first letter lowered, an acronym kept', () => {
    expect(outcomeClause('Say what each kind of layer needs.')).toBe('say what each kind of layer needs')
    expect(outcomeClause('KV pages are counted')).toBe('KV pages are counted')
  })
})
